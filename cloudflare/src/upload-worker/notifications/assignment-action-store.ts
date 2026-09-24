import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { assignmentNotificationId, type AssignmentNotificationIntent, type AssignmentNotificationStorage } from './assignment-action.ts';

type Env = Readonly<Record<string, unknown>>;
const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const row = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export class FirebaseAssignmentNotificationStorage implements AssignmentNotificationStorage {
  private readonly rtdb: FirebaseRtdbRestClient;
  constructor(env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }
  read(path: string): Promise<unknown> { return this.rtdb.readValue(path); }
  async updateIntent(id: string, intent: AssignmentNotificationIntent): Promise<void> {
    const path = `student_requests/${id}/notificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.rtdb.readWithEtag<AssignmentNotificationIntent | null>(path);
      if (!current.data || current.data.actionId !== id || current.data.kind !== intent.kind
        || current.data.occurredAt !== intent.occurredAt) throw new Error('assignment_notification_intent_changed');
      if (current.data.state === 'done' || current.data.state === 'failed') return;
      if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('assignment_notification_intent_cas_failed');
  }
  async claimImmediate(id: string, now: number): Promise<AssignmentNotificationIntent | null> {
    const path = `student_requests/${id}/notificationIntent`;
    const current = await this.rtdb.readWithEtag<AssignmentNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.actionId !== id || intent.state !== 'pending' || intent.attempts !== 0) return null;
    const claimed = { ...intent, state: 'sending' as const, attempts: 1 as const, dueAt: now + 60 * 60 * 1000 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async dueRequests(now: number, limit = 2) {
    const requests = await this.rtdb.readValue('student_requests', { orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: limit });
    if (!requests || typeof requests !== 'object' || Array.isArray(requests)) return [];
    return Object.entries(requests as Record<string, unknown>).flatMap(([requestId, value]) => {
      const intent = row(row(value)?.notificationIntent);
      if (!intent || typeof intent.dueAt !== 'number' || intent.dueAt > now
        || !['pending', 'sending', 'retry_due', 'retrying'].includes(String(intent.state))) return [];
      return [{ requestId, intent: intent as unknown as AssignmentNotificationIntent }];
    });
  }
  async claimRetry(id: string, now: number): Promise<AssignmentNotificationIntent | null> {
    const path = `student_requests/${id}/notificationIntent`;
    const current = await this.rtdb.readWithEtag<AssignmentNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.actionId !== id || intent.dueAt > now
      || !['pending', 'sending', 'retry_due', 'retrying'].includes(intent.state) || intent.attempts >= 2) return null;
    const claimed = { ...intent, state: 'retrying' as const, attempts: (intent.attempts + 1) as 1 | 2, dueAt: now + 60 * 60 * 1000 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async notificationsExist(id: string, intent: AssignmentNotificationIntent): Promise<boolean> {
    const request = row(await this.read(`student_requests/${id}`));
    if (typeof request?.studentId !== 'string' || typeof request.teacherId !== 'string') return false;
    const [studentNotice, teacherNotice] = await Promise.all([
      this.read(`notifications/${request.studentId}/${assignmentNotificationId(intent.actionId, request.studentId)}`).then(row),
      this.read(`notifications/${request.teacherId}/${assignmentNotificationId(intent.actionId, request.teacherId)}`).then(row),
    ]);
    return studentNotice?.id === assignmentNotificationId(intent.actionId, request.studentId)
      && teacherNotice?.id === assignmentNotificationId(intent.actionId, request.teacherId);
  }
  async reportFailure(id: string, intent: AssignmentNotificationIntent): Promise<void> {
    const date = new Date(intent.occurredAt).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/${intent.actionId}`;
    const current = await this.rtdb.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: intent.actionId, timestamp: Date.now(), feature: 'assignments', severity: 'error',
      message: 'Assignment approval notifications failed after one retry.', userId: id,
      userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { actionId: intent.actionId, requestId: id, failedRecipientCount: 2 },
    }, current.etag);
  }
}
