import { describe, it, expect, beforeEach } from 'vitest';
import {
  offlineDB,
  isAuthorizationValid,
  calculateStorageUsage,
  purgeUserOfflineData,
  getCachedQuery,
  setCachedQuery,
} from './db';
import { syncEngine } from './syncEngine';

describe('Offline-First Dexie Database & Business Rules', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all([
      offlineDB.downloadedCourses.clear(),
      offlineDB.downloadedMaterials.clear(),
      offlineDB.downloadedGames.clear(),
      offlineDB.downloadedQuestionSets.clear(),
      offlineDB.assessmentDrafts.clear(),
      offlineDB.offlineAttempts.clear(),
      offlineDB.syncOutbox.clear(),
      offlineDB.syncConflicts.clear(),
      offlineDB.syncMetadata.clear(),
      offlineDB.cachedQueries.clear(),
    ]);
  });

  describe('Authorization Validity Check', () => {
    it('returns true for future expiration timestamps', () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(isAuthorizationValid(future)).toBe(true);
    });

    it('returns false for past timestamps (expired authorization)', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      expect(isAuthorizationValid(past)).toBe(false);
    });

    it('returns false for malformed or empty strings', () => {
      expect(isAuthorizationValid('')).toBe(false);
      expect(isAuthorizationValid('not-a-date')).toBe(false);
    });
  });

  describe('IndexedDB Tables Initialization', () => {
    it('initializes all 11 required tables in Dexie schema', () => {
      expect(offlineDB.downloadedCourses).toBeDefined();
      expect(offlineDB.downloadedMaterials).toBeDefined();
      expect(offlineDB.downloadedGames).toBeDefined();
      expect(offlineDB.downloadedQuestionSets).toBeDefined();
      expect(offlineDB.assessmentDrafts).toBeDefined();
      expect(offlineDB.assessmentResponses).toBeDefined();
      expect(offlineDB.offlineAttempts).toBeDefined();
      expect(offlineDB.syncOutbox).toBeDefined();
      expect(offlineDB.syncConflicts).toBeDefined();
      expect(offlineDB.syncMetadata).toBeDefined();
      expect(offlineDB.cachedQueries).toBeDefined();
    });
  });

  describe('Durable Outbox Queueing & Idempotency', () => {
    it('queues an offline outbox operation with PENDING status', async () => {
      const opId = 'op-test-123';
      await syncEngine.enqueueOperation({
        operationId: opId,
        userId: 'user-001',
        institutionId: 'inst-001',
        resourceType: 'LESSON_COMPLETION',
        resourceId: 'course-abc',
        operationType: 'COMPLETE_LESSON',
        attemptId: null,
        baseServerRevision: 1,
        payload: { lessonId: 'lesson-1', percent: 100 },
        createdAtLocal: new Date().toISOString(),
      });

      const queued = await offlineDB.syncOutbox.get(opId);
      expect(queued).toBeDefined();
      expect(queued?.syncStatus).toBe('PENDING');
      expect(queued?.operationType).toBe('COMPLETE_LESSON');
      expect(queued?.retryCount).toBe(0);
    });

    it('enforces idempotency when enqueueing the same operationId twice', async () => {
      const opId = 'op-idempotent-999';
      await syncEngine.enqueueOperation({
        operationId: opId,
        userId: 'user-001',
        institutionId: 'inst-001',
        resourceType: 'GAME_ATTEMPT',
        resourceId: 'game-1',
        operationType: 'SUBMIT_GAME',
        payload: { score: 100 },
        createdAtLocal: new Date().toISOString(),
        baseServerRevision: 1,
      });

      // Re-enqueue identical operationId
      await syncEngine.enqueueOperation({
        operationId: opId,
        userId: 'user-001',
        institutionId: 'inst-001',
        resourceType: 'GAME_ATTEMPT',
        resourceId: 'game-1',
        operationType: 'SUBMIT_GAME',
        payload: { score: 100 },
        createdAtLocal: new Date().toISOString(),
        baseServerRevision: 1,
      });

      const all = await offlineDB.syncOutbox.where('operationId').equals(opId).toArray();
      expect(all.length).toBe(1);
    });
  });

  describe('Offline Assessment Recovery & Drafts', () => {
    it('records offline attempt and cleans up the working draft', async () => {
      const userId = 'student-42';
      const quizId = 'quiz-88';
      const draftId = `${userId}_${quizId}`;

      // User had an in-progress draft
      await offlineDB.assessmentDrafts.put({
        id: draftId,
        userId,
        quizId,
        answers: { q1: 'opt_a' },
        elapsedSeconds: 45,
        updatedAt: new Date().toISOString(),
      });

      // Submit offline
      const attemptId = 'attempt-uuid-777';
      await syncEngine.recordAssessmentAttemptLocally({
        attemptId,
        quizId,
        answers: { q1: 'opt_a', q2: 'opt_b' },
        durationSeconds: 90,
        eventSequence: [{ type: 'answer_selected', q: 'q1', at: 10 }],
        userId,
        institutionId: 'inst-1',
        batchId: 'batch-1',
      });

      // Attempt stored locally in offlineAttempts
      const savedAttempt = await offlineDB.offlineAttempts.get(attemptId);
      expect(savedAttempt).toBeDefined();
      expect(savedAttempt?.syncStatus).toBe('PENDING');
      expect(savedAttempt?.answers).toEqual({ q1: 'opt_a', q2: 'opt_b' });

      // Draft cleaned up
      const remainingDraft = await offlineDB.assessmentDrafts.get(draftId);
      expect(remainingDraft).toBeUndefined();

      // Queued in syncOutbox
      const outboxEntry = await offlineDB.syncOutbox.get(attemptId);
      expect(outboxEntry).toBeDefined();
      expect(outboxEntry?.resourceType).toBe('ASSESSMENT_SUBMISSION');
    });
  });

  describe('Multi-Tenant User Isolation & Data Purging', () => {
    it('purges data belonging strictly to the specified user without impacting others', async () => {
      // User A data
      await offlineDB.downloadedCourses.put({
        id: 'userA_course1',
        courseId: 'course1',
        userId: 'userA',
        institutionId: 'inst1',
        batchId: null,
        title: 'User A Course',
        description: '',
        thumbnailUrl: null,
        serverRevision: 1,
        downloadedAt: new Date().toISOString(),
        authorizationExpiresAt: new Date(Date.now() + 100000).toISOString(),
        modules: [],
        lessons: [],
        totalLessons: 5,
        completedLessonIds: [],
      });

      // User B data
      await offlineDB.downloadedCourses.put({
        id: 'userB_course2',
        courseId: 'course2',
        userId: 'userB',
        institutionId: 'inst2',
        batchId: null,
        title: 'User B Course',
        description: '',
        thumbnailUrl: null,
        serverRevision: 1,
        downloadedAt: new Date().toISOString(),
        authorizationExpiresAt: new Date(Date.now() + 100000).toISOString(),
        modules: [],
        lessons: [],
        totalLessons: 3,
        completedLessonIds: [],
      });

      // Purge User A
      await purgeUserOfflineData('userA');

      const userACourses = await offlineDB.downloadedCourses.where('userId').equals('userA').toArray();
      const userBCourses = await offlineDB.downloadedCourses.where('userId').equals('userB').toArray();

      expect(userACourses.length).toBe(0);
      expect(userBCourses.length).toBe(1);
      expect(userBCourses[0].title).toBe('User B Course');
    });

    it('calculates storage usage accurately', async () => {
      await offlineDB.downloadedCourses.put({
        id: 'userB_course2',
        courseId: 'course2',
        userId: 'userB',
        institutionId: 'inst2',
        batchId: null,
        title: 'User B Course',
        description: '',
        thumbnailUrl: null,
        serverRevision: 1,
        downloadedAt: new Date().toISOString(),
        authorizationExpiresAt: new Date(Date.now() + 100000).toISOString(),
        modules: [],
        lessons: [],
        totalLessons: 3,
        completedLessonIds: [],
      });

      const stats = await calculateStorageUsage('userB');
      expect(stats.courseCount).toBe(1);
      expect(stats.totalBytes).toBeGreaterThan(0);
    });

    it('stores and retrieves cached queries with user isolation and purges on sign out', async () => {
      // Store query cache for userA
      await setCachedQuery('userA', '/student/dashboard', null, { enrolledCount: 5 });
      // Store query cache for userB
      await setCachedQuery('userB', '/student/dashboard', null, { enrolledCount: 12 });

      const cachedA = await getCachedQuery('userA', '/student/dashboard', null);
      const cachedB = await getCachedQuery('userB', '/student/dashboard', null);

      expect(cachedA).not.toBeNull();
      expect(cachedA?.data).toEqual({ enrolledCount: 5 });
      expect(cachedB).not.toBeNull();
      expect(cachedB?.data).toEqual({ enrolledCount: 12 });

      // Purge userA
      await purgeUserOfflineData('userA');

      const purgedA = await getCachedQuery('userA', '/student/dashboard', null);
      const intactB = await getCachedQuery('userB', '/student/dashboard', null);

      expect(purgedA).toBeNull();
      expect(intactB?.data).toEqual({ enrolledCount: 12 });
    });
  });
});
