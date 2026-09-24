import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';

type Env = Readonly<Record<string, unknown>>;
export type SessionNotificationKind = 'session-opened' | 'test-started' | 'test-ended';
export interface SessionNotificationEvent {
  readonly eventId: string;
  readonly kind: SessionNotificationKind;
  readonly sessionCode: string;
  readonly actorUid: string;
  readonly classId: string;
  readonly className: string;
  readonly testId: string | null;
  readonly testName: string;
  readonly occurredAt: number;
  readonly recipientCount: number;
  readonly recipients: Readonly<Record<string, true>>;
}
export interface SessionNotificationQueueRecord {
  readonly eventId: string;
  readonly sessionCode: string;
  readonly classId: string;
  readonly actorUid: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly recipientCount: number;
  readonly rosterVerifiedAt?: number;
  readonly event: SessionNotificationEvent;
  readonly attempts: number;
  readonly initialCursor: number;
  readonly retryRecipientIds: readonly string[];
  readonly retryCursor: number;
  readonly finalFailedRecipientIds: readonly string[];
  readonly state: 'initial_due' | 'initial_processing' | 'retry_due' | 'retrying' | 'done' | 'failed';
}
export interface SessionNotificationActionStorage {
  read(path: string): Promise<unknown>;
  updateIntent(intent: SessionNotificationQueueRecord): Promise<void>;
  dueIntents(now: number, limit?: number): Promise<SessionNotificationQueueRecord[]>;
  claimInitial(eventId: string, now: number): Promise<SessionNotificationQueueRecord | null>;
  claimRetry(eventId: string, now: number): Promise<SessionNotificationQueueRecord | null>;
  reportFailure(event: SessionNotificationEvent, failedRecipientCount: number, now: number): Promise<void>;
}

const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

export class FirebaseSessionNotificationActionStorage implements SessionNotificationActionStorage {
  private readonly admin: FirebaseRtdbRestClient;
  constructor(env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }

  read(path: string): Promise<unknown> { return this.admin.readValue(path); }

  async updateIntent(intent: SessionNotificationQueueRecord): Promise<void> {
    const path = `session_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<SessionNotificationQueueRecord | null>(path);
      if (!current.data || current.data.eventId !== intent.eventId
        || current.data.sessionCode !== intent.sessionCode || current.data.actorUid !== intent.actorUid) {
        throw new Error('session_notification_intent_identity_changed');
      }
      if (current.data.state === 'done' || current.data.state === 'failed') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('session_notification_intent_cas_failed');
  }

  async dueIntents(now: number, limit = 3): Promise<SessionNotificationQueueRecord[]> {
    const rows = await this.admin.readValue('session_notification_intents', { orderBy: 'dueAt', limitToFirst: limit });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, SessionNotificationQueueRecord>).filter((row) =>
      row?.dueAt <= now && ['initial_due', 'initial_processing', 'retry_due', 'retrying'].includes(row.state));
  }

  async claimInitial(eventId: string, now: number): Promise<SessionNotificationQueueRecord | null> {
    const path = `session_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag<SessionNotificationQueueRecord | null>(path);
    const row = current.data;
    if (!row || row.eventId !== eventId || row.attempts !== 1
      || !['initial_due', 'initial_processing'].includes(row.state) || row.dueAt > now) return null;
    const claimed = { ...row, state: 'initial_processing' as const, dueAt: now + 60_000 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async claimRetry(eventId: string, now: number): Promise<SessionNotificationQueueRecord | null> {
    const path = `session_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag<SessionNotificationQueueRecord | null>(path);
    const row = current.data;
    if (!row || row.eventId !== eventId || !['retry_due', 'retrying'].includes(row.state)
      || row.attempts < 1 || row.attempts > 2 || row.dueAt > now) return null;
    const claimed = { ...row, state: 'retrying' as const, attempts: 2 as const, dueAt: now + 60_000 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async reportFailure(event: SessionNotificationEvent, failedRecipientCount: number, now: number): Promise<void> {
    const day = new Date(event.occurredAt).toISOString().slice(0, 10);
    const path = `reports/errors/${day}/session-notification-${event.eventId}`;
    const current = await this.admin.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `session-notification-${event.eventId}`, timestamp: now,
      feature: 'sessions', severity: 'error',
      message: `Session notification delivery failed for ${event.kind}; ${failedRecipientCount} recipient(s) remain.`,
      userId: event.actorUid, userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { eventId: event.eventId, sessionCode: event.sessionCode,
        classId: event.classId, kind: event.kind, failedRecipientCount },
    }, current.etag);
  }
}
