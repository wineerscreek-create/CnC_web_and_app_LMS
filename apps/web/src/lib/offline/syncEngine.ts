/**
 * Winners Creek LMS — Durable Synchronization Engine
 *
 * Implements an ACID-like durable outbox, idempotent delivery with client UUIDs,
 * exponential backoff retry, conflict detection, and server acknowledgment.
 */

import {
  offlineDB,
  type SyncOutboxEntry,
  type OfflineAttemptRecord,
  type SyncConflictRecord,
} from './db';
import { api } from '@/lib/api';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

class SyncEngine {
  private isSyncing = false;
  private currentUserId: string | null = null;
  private currentInstitutionId: string | null = null;
  private syncListeners: Set<(count: number) => void> = new Set();
  private initialized = false;

  /**
   * Initializes listeners for online reconnect, visibility resume, and startup.
   */
  public init(userId?: string | null, institutionId?: string | null) {
    if (userId) this.currentUserId = userId;
    if (institutionId) this.currentInstitutionId = institutionId;

    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('online', () => {
      console.info('[SyncEngine] Reconnected to network. Triggering sync…');
      void this.triggerSync();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        console.info('[SyncEngine] App resumed into foreground. Triggering sync…');
        void this.triggerSync();
      }
    });

    // Initial check on load
    if (navigator.onLine) {
      void this.triggerSync();
    }
  }

  public setScope(userId: string | null, institutionId: string | null) {
    this.currentUserId = userId;
    this.currentInstitutionId = institutionId;
  }

  public subscribeToPendingCount(listener: (count: number) => void): () => void {
    this.syncListeners.add(listener);
    void this.notifyListeners();
    return () => this.syncListeners.delete(listener);
  }

  private async notifyListeners() {
    if (!this.currentUserId) return;
    const count = await this.getPendingCount();
    this.syncListeners.forEach((fn) => fn(count));
  }

  public async getPendingCount(): Promise<number> {
    if (!this.currentUserId) return 0;
    return offlineDB.syncOutbox
      .where('userId')
      .equals(this.currentUserId)
      .and((op) => op.syncStatus === 'PENDING' || op.syncStatus === 'FAILED' || op.syncStatus === 'SYNCING')
      .count();
  }

  /**
   * Enqueues a durable outbox operation into IndexedDB.
   */
  public async enqueueOperation(
    entry: Omit<SyncOutboxEntry, 'sequenceNumber' | 'retryCount' | 'syncStatus'>
  ): Promise<void> {
    const fullEntry: SyncOutboxEntry = {
      ...entry,
      sequenceNumber: Date.now(),
      retryCount: 0,
      syncStatus: 'PENDING',
      createdAtLocal: entry.createdAtLocal || new Date().toISOString(),
    };

    await offlineDB.syncOutbox.put(fullEntry);
    await this.notifyListeners();

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void this.triggerSync();
    }
  }

  /**
   * Records an offline assessment attempt into local database and enqueues outbox operation.
   */
  public async recordAssessmentAttemptLocally(attempt: {
    attemptId: string;
    quizId: string;
    answers: Record<string, string>;
    durationSeconds: number;
    eventSequence: any[];
    userId: string;
    institutionId: string | null;
    batchId: string | null;
  }): Promise<void> {
    const record: OfflineAttemptRecord = {
      id: attempt.attemptId,
      userId: attempt.userId,
      institutionId: attempt.institutionId,
      batchId: attempt.batchId,
      quizId: attempt.quizId,
      gameId: null,
      kind: 'quiz',
      answers: attempt.answers,
      durationSeconds: attempt.durationSeconds,
      eventSequence: attempt.eventSequence,
      localCreatedAt: new Date().toISOString(),
      syncStatus: 'PENDING',
    };

    await offlineDB.offlineAttempts.put(record);

    // Clean up temporary in-progress draft for this quiz
    const draftId = `${attempt.userId}_${attempt.quizId}`;
    await offlineDB.assessmentDrafts.delete(draftId);

    // Enqueue outbox operation for server-side evaluation and storage
    await this.enqueueOperation({
      operationId: attempt.attemptId, // Idempotency key
      userId: attempt.userId,
      institutionId: attempt.institutionId,
      resourceType: 'ASSESSMENT_SUBMISSION',
      resourceId: attempt.quizId,
      operationType: 'SUBMIT_ASSESSMENT',
      attemptId: attempt.attemptId,
      baseServerRevision: 1,
      payload: {
        quizId: attempt.quizId,
        answers: Object.entries(attempt.answers).map(([qid, oid]) => ({
          questionId: qid,
          optionId: oid,
        })),
        durationSeconds: attempt.durationSeconds,
        eventSequence: attempt.eventSequence,
        localSubmittedAt: record.localCreatedAt,
      },
      createdAtLocal: record.localCreatedAt,
    });
  }

  /**
   * Records a game attempt locally and enqueues outbox operation.
   */
  public async recordGameAttemptLocally(gameAttempt: {
    attemptId: string;
    gameId: string;
    score: number;
    choices: any[];
    level: number;
    userId: string;
    institutionId: string | null;
  }): Promise<void> {
    const record: OfflineAttemptRecord = {
      id: gameAttempt.attemptId,
      userId: gameAttempt.userId,
      institutionId: gameAttempt.institutionId,
      batchId: null,
      quizId: '',
      gameId: gameAttempt.gameId,
      kind: 'game',
      answers: gameAttempt.choices,
      durationSeconds: 0,
      eventSequence: [],
      localCreatedAt: new Date().toISOString(),
      syncStatus: 'PENDING',
    };

    await offlineDB.offlineAttempts.put(record);

    await this.enqueueOperation({
      operationId: gameAttempt.attemptId,
      userId: gameAttempt.userId,
      institutionId: gameAttempt.institutionId,
      resourceType: 'GAME_ATTEMPT',
      resourceId: gameAttempt.gameId,
      operationType: 'SUBMIT_GAME',
      attemptId: gameAttempt.attemptId,
      baseServerRevision: 1,
      payload: {
        gameId: gameAttempt.gameId,
        score: gameAttempt.score,
        choices: gameAttempt.choices,
        level: gameAttempt.level,
        completed: true,
      },
      createdAtLocal: record.localCreatedAt,
    });
  }

  /**
   * Records course lesson completion locally and updates offline progress.
   */
  public async recordLessonProgressLocally(
    courseId: string,
    lessonId: string,
    userId: string,
    institutionId: string | null
  ): Promise<void> {
    const localCourseId = `${userId}_${courseId}`;
    const cachedCourse = await offlineDB.downloadedCourses.get(localCourseId);

    if (cachedCourse) {
      const completed = new Set(cachedCourse.completedLessonIds || []);
      completed.add(lessonId);
      cachedCourse.completedLessonIds = Array.from(completed);
      await offlineDB.downloadedCourses.put(cachedCourse);
    }

    const opId = `complete_${userId}_${courseId}_${lessonId}`;
    await this.enqueueOperation({
      operationId: opId,
      userId,
      institutionId,
      resourceType: 'LESSON_COMPLETION',
      resourceId: courseId,
      operationType: 'COMPLETE_LESSON',
      attemptId: null,
      baseServerRevision: cachedCourse?.serverRevision || 1,
      payload: {
        courseId,
        lessonId,
        percent: 100.0,
        minutesSpent: 5,
      },
      createdAtLocal: new Date().toISOString(),
    });
  }

  /**
   * Executes batch synchronization with the backend.
   * Handles idempotency, exponential backoff, conflict detection, and server acknowledgments.
   */
  public async triggerSync(): Promise<{
    processed: number;
    failed: number;
    conflicts: number;
  }> {
    if (this.isSyncing) return { processed: 0, failed: 0, conflicts: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { processed: 0, failed: 0, conflicts: 0 };
    }
    if (!this.currentUserId) return { processed: 0, failed: 0, conflicts: 0 };

    this.isSyncing = true;
    let processed = 0;
    let failed = 0;
    let conflicts = 0;

    try {
      // Fetch operations eligible for sync
      const pendingOps = await offlineDB.syncOutbox
        .where('userId')
        .equals(this.currentUserId)
        .and((op) => {
          if (op.syncStatus === 'PENDING') return true;
          if (op.syncStatus === 'FAILED' && op.retryCount < MAX_RETRIES) {
            // Check exponential backoff
            const lastAttempt = op.lastAttemptedAt ? new Date(op.lastAttemptedAt).getTime() : 0;
            const backoff = BASE_BACKOFF_MS * Math.pow(2, op.retryCount);
            return Date.now() - lastAttempt > backoff;
          }
          return false;
        })
        .sortBy('sequenceNumber');

      if (pendingOps.length === 0) {
        this.isSyncing = false;
        return { processed: 0, failed: 0, conflicts: 0 };
      }

      // Mark operations as SYNCING
      for (const op of pendingOps) {
        op.syncStatus = 'SYNCING';
        op.lastAttemptedAt = new Date().toISOString();
        await offlineDB.syncOutbox.put(op);
      }

      // Send batch to backend
      const response = await api.post('/offline/sync', {
        operations: pendingOps.map((op) => ({
          operationId: op.operationId,
          userId: op.userId,
          institutionId: op.institutionId,
          resourceType: op.resourceType,
          resourceId: op.resourceId,
          operationType: op.operationType,
          attemptId: op.attemptId,
          baseServerRevision: op.baseServerRevision,
          payload: op.payload,
          clientTimestamp: op.createdAtLocal,
        })),
      });

      const serverResults = (response?.data?.results as any[]) || [];
      const resultMap = new Map<string, any>(
        serverResults.map((r) => [r.operationId, r])
      );

      for (const op of pendingOps) {
        const res = resultMap.get(op.operationId);

        if (!res) {
          // Server did not acknowledge this operation
          op.syncStatus = 'FAILED';
          op.retryCount += 1;
          op.lastError = 'Server did not return acknowledgment for operation';
          await offlineDB.syncOutbox.put(op);
          failed++;
          continue;
        }

        if (res.status === 'PROCESSED' || res.status === 'ALREADY_PROCESSED') {
          // Successfully processed on server!
          op.syncStatus = 'SYNCED';
          await offlineDB.syncOutbox.put(op);

          // Update corresponding offlineAttempt record if applicable
          if (op.attemptId) {
            const attempt = await offlineDB.offlineAttempts.get(op.attemptId);
            if (attempt) {
              attempt.syncStatus = 'SYNCED';
              attempt.serverSyncResult = res.data;
              await offlineDB.offlineAttempts.put(attempt);
            }
          }

          // Safe removal from outbox once confirmed synced and processed
          await offlineDB.syncOutbox.delete(op.operationId);
          processed++;
        } else if (res.status === 'CONFLICT') {
          op.syncStatus = 'CONFLICT';
          op.lastError = res.message || 'Data conflict with server state';
          await offlineDB.syncOutbox.put(op);

          const conflictRecord: SyncConflictRecord = {
            id: crypto.randomUUID(),
            operationId: op.operationId,
            userId: op.userId,
            resourceType: op.resourceType,
            resourceId: op.resourceId,
            clientPayload: op.payload,
            serverState: res.serverState || {},
            reason: res.message || 'Conflicting server revision',
            detectedAt: new Date().toISOString(),
            resolved: false,
          };
          await offlineDB.syncConflicts.put(conflictRecord);
          conflicts++;
        } else if (res.status === 'EXPIRED') {
          op.syncStatus = 'EXPIRED';
          op.lastError = res.message || 'Authorization package expired';
          await offlineDB.syncOutbox.put(op);
          failed++;
        } else {
          // Other error
          op.syncStatus = 'FAILED';
          op.retryCount += 1;
          op.lastError = res.message || 'Server processing error';
          await offlineDB.syncOutbox.put(op);
          failed++;
        }
      }

      // Record successful sync metadata
      const metaKey = `meta_${this.currentUserId}`;
      await offlineDB.syncMetadata.put({
        key: metaKey,
        userId: this.currentUserId,
        lastSuccessfulSync: new Date().toISOString(),
        lastSyncStatus: failed > 0 ? 'PARTIAL' : 'SUCCESS',
        deviceRevision: Date.now(),
      });
    } catch (caught: any) {
      console.warn('[SyncEngine] Batch sync failed:', caught?.message || caught);
      // Reset any stuck SYNCING operations to FAILED
      const stuckOps = await offlineDB.syncOutbox
        .where('userId')
        .equals(this.currentUserId)
        .and((op) => op.syncStatus === 'SYNCING')
        .toArray();

      for (const op of stuckOps) {
        op.syncStatus = 'FAILED';
        op.retryCount += 1;
        op.lastError = caught?.message || 'Network communication error';
        await offlineDB.syncOutbox.put(op);
      }
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }

    return { processed, failed, conflicts };
  }
}

export const syncEngine = new SyncEngine();
