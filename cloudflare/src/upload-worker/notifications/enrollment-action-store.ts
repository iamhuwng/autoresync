import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  courseRequestNotificationId,
  type CourseRequestNotificationIntent,
  type CourseRequestNotificationStorage,
} from './enrollment-action.ts';

type Env = Readonly<Record<string, unknown>>;
const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const row = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export class FirebaseCourseRequestNotificationStorage implements CourseRequestNotificationStorage {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
        GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
      },
      fetchImpl,
    });
  }

  read(path: string): Promise<unknown> {
    return this.rtdb.readValue(path);
  }

  async claimImmediate(requestId: string, now: number): Promise<CourseRequestNotificationIntent | null> {
    const path = `course_requests/${requestId}/notificationIntent`;
    const current = await this.rtdb.readWithEtag<CourseRequestNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.actionId !== requestId || intent.state !== 'pending'
      || intent.attempts !== 0) return null;
    const claimed = { ...intent, state: 'sending' as const, attempts: 1 as const, dueAt: now + 60 * 60 * 1000 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async updateIntent(requestId: string, intent: CourseRequestNotificationIntent): Promise<void> {
    const path = `course_requests/${requestId}/notificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.rtdb.readWithEtag<CourseRequestNotificationIntent | null>(path);
      if (!current.data || current.data.actionId !== requestId
        || current.data.kind !== intent.kind || current.data.occurredAt !== intent.occurredAt) {
        throw new Error('course_request_notification_intent_changed');
      }
      if (current.data.state === 'done' || current.data.state === 'failed') return;
      if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('course_request_notification_intent_cas_failed');
  }

  async claimRetry(requestId: string, now: number): Promise<CourseRequestNotificationIntent | null> {
    const path = `course_requests/${requestId}/notificationIntent`;
    const current = await this.rtdb.readWithEtag<CourseRequestNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.actionId !== requestId || intent.dueAt > now
      || !['pending', 'sending', 'retry_due', 'retrying'].includes(intent.state)
      || intent.attempts >= 2) return null;
    const claimed = {
      ...intent,
      state: 'retrying' as const,
      attempts: (intent.attempts + 1) as 1 | 2,
      dueAt: now + 60 * 60 * 1000,
    };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async notificationExists(requestId: string, intent: CourseRequestNotificationIntent): Promise<boolean> {
    const request = row(await this.read(`course_requests/${requestId}`));
    if (typeof request?.studentId !== 'string') return false;
    const stored = await this.read(`notifications/${request.studentId}/${courseRequestNotificationId(intent.actionId, request.studentId)}`);
    return row(stored)?.id === courseRequestNotificationId(intent.actionId, request.studentId);
  }

  async dueRequests(now: number, limit = 2): Promise<Array<{
    requestId: string;
    intent: CourseRequestNotificationIntent;
  }>> {
    const requests = await this.rtdb.readValue('course_requests', {
      orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: limit,
    });
    if (!requests || typeof requests !== 'object' || Array.isArray(requests)) return [];
    return Object.entries(requests as Record<string, unknown>).flatMap(([requestId, value]) => {
      const intent = row(row(value)?.notificationIntent);
      if (!intent || typeof intent.dueAt !== 'number' || intent.dueAt > now
        || !['pending', 'sending', 'retry_due', 'retrying'].includes(String(intent.state))) return [];
      return [{ requestId, intent: intent as unknown as CourseRequestNotificationIntent }];
    });
  }

  async reportFailure(requestId: string, intent: CourseRequestNotificationIntent): Promise<void> {
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/${intent.actionId}`;
    const current = await this.rtdb.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: intent.actionId,
      timestamp: now,
      feature: 'courses',
      severity: 'error',
      message: 'Course request notification delivery failed after one retry.',
      userId: requestId,
      userName: 'Notification Worker',
      userRole: 'service',
      duplicateCount: 1,
      contextData: { actionId: intent.actionId, requestId, failedRecipientCount: 1 },
    }, current.etag);
  }
}
