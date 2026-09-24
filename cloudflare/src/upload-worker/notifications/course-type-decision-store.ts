import { FirebaseRtdbRestClient, type FirebaseRtdbQuery } from '../listening-authoring/rtdb.ts';
import type { CourseTypeDecisionRecord } from './course-type-decision.ts';

export interface CourseTypeDecisionIntent {
  readonly eventKind: 'course-type-approved' | 'course-type-rejected';
  readonly authorityRecordId: string;
  readonly occurrenceId: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'due' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface CourseTypeDecisionStorage {
  readRequest(requestId: string): Promise<CourseTypeDecisionRecord | null>;
  readIntent(requestId: string): Promise<{ intent: CourseTypeDecisionIntent | null; etag: string }>;
  writeIntent(requestId: string, intent: CourseTypeDecisionIntent, etag: string): Promise<boolean>;
  dueRequests(limit: number): Promise<CourseTypeDecisionRecord[]>;
  reportFailure(request: CourseTypeDecisionRecord, intent: CourseTypeDecisionIntent): Promise<void>;
}

type Env = Readonly<Record<string, unknown>>;
const DONE_DUE_AT = 8_640_000_000_000_000;
const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};

const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
);

export class FirebaseCourseTypeDecisionStorage implements CourseTypeDecisionStorage {
  private readonly admin: FirebaseRtdbRestClient;

  constructor(env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
        GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
        readDatabaseValue: typeof env.readDatabaseValue === 'function'
          ? env.readDatabaseValue as (path: string, query?: FirebaseRtdbQuery) => Promise<unknown>
          : undefined,
      },
      fetchImpl,
    });
  }

  async readRequest(requestId: string): Promise<CourseTypeDecisionRecord | null> {
    return record(await this.admin.readValue(`course_type_requests/${requestId}`)) as CourseTypeDecisionRecord | null;
  }

  async readIntent(requestId: string): Promise<{ intent: CourseTypeDecisionIntent | null; etag: string }> {
    const result = await this.admin.readWithEtag<CourseTypeDecisionIntent | null>(
      `course_type_requests/${requestId}/notificationIntent`,
    );
    return { intent: result.data, etag: result.etag };
  }

  writeIntent(requestId: string, intent: CourseTypeDecisionIntent, etag: string): Promise<boolean> {
    return this.admin.writeIfMatch(`course_type_requests/${requestId}/notificationIntent`, intent, etag);
  }

  async dueRequests(limit: number): Promise<CourseTypeDecisionRecord[]> {
    const rows = await this.admin.readValue('course_type_requests', {
      orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: limit,
    });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, unknown>)
      .map(record)
      .filter((row): row is Record<string, unknown> => Boolean(row)) as CourseTypeDecisionRecord[];
  }

  async reportFailure(request: CourseTypeDecisionRecord, intent: CourseTypeDecisionIntent): Promise<void> {
    const day = new Date(intent.occurredAt).toISOString().slice(0, 10);
    const path = `reports/errors/${day}/${intent.occurrenceId}`;
    const existing = await this.admin.readWithEtag<unknown>(path);
    if (existing.data !== null) return;
    const actorId = intent.eventKind === 'course-type-approved' ? request.approvedBy : request.handledBy;
    await this.admin.writeIfMatch(path, {
      id: intent.occurrenceId,
      timestamp: Date.now(),
      feature: 'courses',
      severity: 'error',
      message: `Course type notification delivery failed; 1 recipient remains.`,
      userId: typeof actorId === 'string' ? actorId : 'notification-worker',
      userName: 'Notification Worker',
      userRole: 'service',
      duplicateCount: 1,
      contextData: {
        actionId: intent.occurrenceId,
        requestId: request.id,
        eventKind: intent.eventKind,
        failedRecipientCount: 1,
      },
    }, existing.etag);
  }
}

export const COURSE_TYPE_DECISION_DONE_DUE_AT = DONE_DUE_AT;
