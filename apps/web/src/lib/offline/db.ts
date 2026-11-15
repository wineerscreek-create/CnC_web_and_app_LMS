/**
 * Winners Creek LMS / SkillSharp — IndexedDB Database
 * Powered by Dexie.js
 *
 * Implements strict user isolation, time-bound authorizations,
 * assessment draft recovery, and durable offline mutation queues.
 */

import Dexie, { type Table } from 'dexie';

// --------------------------------------------------------------------------- Data Models
export interface DownloadedCourse {
  id: string; // compound: `${userId}_${courseId}`
  courseId: string;
  userId: string;
  institutionId: string | null;
  batchId: string | null;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  serverRevision: number;
  downloadedAt: string; // ISO timestamp
  authorizationExpiresAt: string; // ISO timestamp
  modules: any[];
  lessons: any[];
  totalLessons: number;
  completedLessonIds: string[];
}

export interface DownloadedMaterial {
  id: string; // compound: `${userId}_${materialId}`
  materialId: string;
  userId: string;
  institutionId: string | null;
  courseId: string | null;
  ebookId: string | null;
  title: string;
  kind: 'pdf' | 'document' | 'ebook';
  fileBlob: Blob | ArrayBuffer;
  fileSizeBytes: number;
  serverRevision: number;
  downloadedAt: string;
  authorizationExpiresAt: string;
}

export interface DownloadedGame {
  id: string; // compound: `${userId}_${gameId}`
  gameId: string;
  userId: string;
  institutionId: string | null;
  code: string;
  title: string;
  category: string;
  difficulty: string;
  config: any;
  serverRevision: number;
  downloadedAt: string;
  authorizationExpiresAt: string;
}

export interface DownloadedQuestionSet {
  id: string; // compound: `${userId}_${quizId}`
  quizId: string;
  userId: string;
  institutionId: string | null;
  batchId: string | null;
  title: string;
  kind: string;
  durationMinutes: number;
  maxScore: number;
  version: number;
  questions: {
    id: string;
    text: string;
    marks: number;
    options: { id: string; text: string }[];
  }[];
  downloadedAt: string;
  authorizationExpiresAt: string;
}

export interface AssessmentDraft {
  id: string; // compound: `${userId}_${quizId}`
  userId: string;
  quizId: string;
  answers: Record<string, string>; // questionId -> optionId
  elapsedSeconds: number;
  updatedAt: string;
}

export interface AssessmentResponseRecord {
  id: string; // compound: `${attemptId}_${questionId}`
  attemptId: string;
  userId: string;
  quizId: string;
  questionId: string;
  optionId: string;
  selectedAt: string;
}

export interface OfflineAttemptRecord {
  id: string; // attemptId (UUID)
  userId: string;
  institutionId: string | null;
  batchId: string | null;
  quizId: string;
  gameId: string | null;
  kind: 'quiz' | 'game';
  answers: any;
  durationSeconds: number;
  eventSequence: any[];
  localCreatedAt: string;
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT' | 'EXPIRED';
  serverSyncResult?: any;
}

export interface SyncOutboxEntry {
  operationId: string; // Client UUID primary key
  userId: string;
  institutionId: string | null;
  resourceType: 'COURSE_PROGRESS' | 'LESSON_COMPLETION' | 'ASSESSMENT_SUBMISSION' | 'GAME_ATTEMPT';
  resourceId: string;
  operationType: string;
  payload: any;
  createdAtLocal: string;
  attemptId?: string | null;
  baseServerRevision: number;
  sequenceNumber: number;
  retryCount: number;
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT' | 'EXPIRED';
  lastError?: string | null;
  lastAttemptedAt?: string | null;
}

export interface SyncConflictRecord {
  id: string;
  operationId: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  clientPayload: any;
  serverState: any;
  reason: string;
  detectedAt: string;
  resolved: boolean;
}

export interface SyncMetadataRecord {
  key: string; // e.g. `meta_${userId}`
  userId: string;
  lastSuccessfulSync: string | null;
  lastSyncStatus: string;
  deviceRevision: number;
}

// --------------------------------------------------------------------------- Dexie Class
export class SkillSharpOfflineDB extends Dexie {
  downloadedCourses!: Table<DownloadedCourse, string>;
  downloadedMaterials!: Table<DownloadedMaterial, string>;
  downloadedGames!: Table<DownloadedGame, string>;
  downloadedQuestionSets!: Table<DownloadedQuestionSet, string>;
  assessmentDrafts!: Table<AssessmentDraft, string>;
  assessmentResponses!: Table<AssessmentResponseRecord, string>;
  offlineAttempts!: Table<OfflineAttemptRecord, string>;
  syncOutbox!: Table<SyncOutboxEntry, string>;
  syncConflicts!: Table<SyncConflictRecord, string>;
  syncMetadata!: Table<SyncMetadataRecord, string>;

  constructor() {
    super('SkillSharpOfflineDB');

    // Schema Version 1
    this.version(1).stores({
      downloadedCourses: 'id, courseId, userId, institutionId, serverRevision, downloadedAt, authorizationExpiresAt',
      downloadedMaterials: 'id, materialId, userId, institutionId, courseId, ebookId, downloadedAt, authorizationExpiresAt',
      downloadedGames: 'id, gameId, userId, institutionId, code, downloadedAt, authorizationExpiresAt',
      downloadedQuestionSets: 'id, quizId, userId, institutionId, batchId, downloadedAt, authorizationExpiresAt',
      assessmentDrafts: 'id, userId, quizId, updatedAt',
      assessmentResponses: 'id, attemptId, userId, quizId, questionId',
      offlineAttempts: 'id, userId, quizId, gameId, kind, syncStatus, localCreatedAt',
      syncOutbox: 'operationId, userId, resourceType, resourceId, syncStatus, createdAtLocal, sequenceNumber',
      syncConflicts: 'id, operationId, userId, resourceType, detectedAt, resolved',
      syncMetadata: 'key, userId',
    });
  }
}

// Singleton database instance
export const offlineDB = new SkillSharpOfflineDB();

// --------------------------------------------------------------------------- Authorization Helpers
/**
 * Verifies whether local content authorization is still unexpired.
 * Enforces security boundaries so offline users cannot retain access indefinitely.
 */
export function isAuthorizationValid(expiresAtIso: string): boolean {
  if (!expiresAtIso) return false;
  const expiry = new Date(expiresAtIso).getTime();
  const now = Date.now();
  return !isNaN(expiry) && expiry > now;
}

/**
 * Calculates local offline storage consumption in bytes for a given user.
 */
export async function calculateStorageUsage(userId: string): Promise<{
  totalBytes: number;
  courseCount: number;
  materialCount: number;
  gameCount: number;
  questionSetCount: number;
  pendingSyncCount: number;
}> {
  const [courses, materials, games, questions, pendingSync] = await Promise.all([
    offlineDB.downloadedCourses.where('userId').equals(userId).toArray(),
    offlineDB.downloadedMaterials.where('userId').equals(userId).toArray(),
    offlineDB.downloadedGames.where('userId').equals(userId).toArray(),
    offlineDB.downloadedQuestionSets.where('userId').equals(userId).toArray(),
    offlineDB.syncOutbox.where('userId').equals(userId).and(op => op.syncStatus === 'PENDING').count(),
  ]);

  let totalBytes = 0;
  for (const m of materials) {
    if (m.fileSizeBytes) {
      totalBytes += m.fileSizeBytes;
    } else if (m.fileBlob) {
      totalBytes += m.fileBlob instanceof Blob ? m.fileBlob.size : m.fileBlob.byteLength;
    }
  }

  // Estimate JSON storage size for courses and questions
  totalBytes += JSON.stringify(courses).length;
  totalBytes += JSON.stringify(games).length;
  totalBytes += JSON.stringify(questions).length;

  return {
    totalBytes,
    courseCount: courses.length,
    materialCount: materials.length,
    gameCount: games.length,
    questionSetCount: questions.length,
    pendingSyncCount: pendingSync,
  };
}

/**
 * Clears all user-specific offline data from IndexedDB upon sign-out
 * or when logging in as a different user to prevent multi-tenant data leakage.
 */
export async function purgeUserOfflineData(userId: string): Promise<void> {
  await Promise.all([
    offlineDB.downloadedCourses.where('userId').equals(userId).delete(),
    offlineDB.downloadedMaterials.where('userId').equals(userId).delete(),
    offlineDB.downloadedGames.where('userId').equals(userId).delete(),
    offlineDB.downloadedQuestionSets.where('userId').equals(userId).delete(),
    offlineDB.assessmentDrafts.where('userId').equals(userId).delete(),
    offlineDB.assessmentResponses.where('userId').equals(userId).delete(),
    offlineDB.offlineAttempts.where('userId').equals(userId).delete(),
    offlineDB.syncOutbox.where('userId').equals(userId).delete(),
    offlineDB.syncConflicts.where('userId').equals(userId).delete(),
    offlineDB.syncMetadata.where('userId').equals(userId).delete(),
  ]);
}
