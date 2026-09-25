import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { GradeNotificationIntent, GradeNotificationStorage, ManualGradeCommand } from './grade-notification-action.ts';

type Env = Readonly<Record<string, unknown>>;
type Row = Record<string, unknown>;
const DONE_DUE_AT = 8_640_000_000_000_000;
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const asRow = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Row : null;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

export class FirebaseGradeNotificationStorage implements GradeNotificationStorage {
  private readonly admin: FirebaseRtdbRestClient;
  private readonly databaseUrl: string;

  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.databaseUrl = required(env, 'FIREBASE_DB_URL').replace(/\/$/u, '');
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: this.databaseUrl,
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }

  readSession(sessionCode: string): Promise<unknown> { return this.admin.readValue(`game_sessions/${sessionCode}`); }
  readTest(testId: string): Promise<unknown> { return this.admin.readValue(`tests/${testId}`); }
  readUser(userId: string): Promise<unknown> { return this.admin.readValue(`users/${userId}`); }
  readIntent(eventId: string): Promise<GradeNotificationIntent | null> {
    return this.admin.readValue(`grade_notification_intents/${eventId}`) as Promise<GradeNotificationIntent | null>;
  }

  private async adminToken(): Promise<string> {
    const key = JSON.parse(required(this.env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as {
      client_email?: string;
      private_key?: string;
    };
    const identity = required(this.env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
    if (key.client_email !== identity || !key.private_key) throw new Error('grade_notification_service_identity_invalid');
    const privateKey = await importPKCS8(key.private_key, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: identity, sub: identity, aud: OAUTH_URL, iat: issuedAt, exp: issuedAt + 3600,
      scope: [
        'https://www.googleapis.com/auth/firebase.database',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
    }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
    const response = await this.fetchImpl(OAUTH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    if (!response.ok) throw new Error(`grade_notification_token_failed:${response.status}`);
    const body = await response.json() as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('grade_notification_token_invalid');
    return body.access_token;
  }

  async commitManualGrade(input: {
    readonly command: ManualGradeCommand;
    readonly intent: GradeNotificationIntent;
    readonly questionResult: Row;
  }): Promise<void> {
    const { command, intent, questionResult } = input;
    const gradePath = `game_sessions/${command.sessionCode}/results/${command.studentId}/questionResults/${command.questionNumber}`;
    const payload = {
      [gradePath]: questionResult,
      [`grade_notification_intents/${command.eventId}`]: intent,
    };
    const response = await this.fetchImpl(`${this.databaseUrl}/.json`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await this.adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`grade_notification_commit_failed:${response.status}`);
  }

  async updateIntent(intent: GradeNotificationIntent): Promise<void> {
    const path = `grade_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<GradeNotificationIntent | null>(path);
      const old = current.data;
      if (!old || old.eventId !== intent.eventId || old.kind !== intent.kind
        || old.sessionCode !== intent.sessionCode || old.studentId !== intent.studentId
        || old.actorUid !== intent.actorUid || old.questionNumber !== intent.questionNumber
        || old.pointsEarned !== intent.pointsEarned || old.testTitle !== intent.testTitle
        || old.occurredAt !== intent.occurredAt) throw new Error('grade_notification_intent_identity_changed');
      if (old.state === 'done' || old.state === 'failed') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('grade_notification_intent_cas_failed');
  }

  async dueIntents(now: number, limit: number): Promise<GradeNotificationIntent[]> {
    const values = await this.admin.readValue('grade_notification_intents', {
      orderBy: 'dueAt', startAt: 0, limitToFirst: Math.min(2, Math.max(1, limit)),
    });
    if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
    return Object.values(values as Record<string, GradeNotificationIntent>).filter(intent =>
      intent?.kind === 'individual-question-graded' && Number.isSafeInteger(intent.dueAt) && intent.dueAt <= now
      && (intent.attempts === 0 && ['pending', 'sending'].includes(intent.state)
        || intent.attempts === 1 && ['retry_due'].includes(intent.state)
        || intent.attempts === 2 && ['retrying'].includes(intent.state)));
  }

  async claimRetry(eventId: string, now: number): Promise<GradeNotificationIntent | null> {
    const path = `grade_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag<GradeNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.kind !== 'individual-question-graded' || intent.dueAt > now) return null;
    if (intent.attempts === 0 && ['pending', 'sending'].includes(intent.state)) {
      const claimed = { ...intent, state: 'sending' as const, dueAt: now + 60_000 };
      return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
    }
    if (intent.attempts === 2 && intent.state === 'retrying') {
      const claimed = { ...intent, dueAt: now + 60_000 };
      return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
    }
    if (intent.attempts !== 1 || intent.state !== 'retry_due') return null;
    const claimed = { ...intent, attempts: 2 as const, state: 'retrying' as const, dueAt: now + 60_000 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async reportFailure(intent: GradeNotificationIntent, now: number): Promise<void> {
    const id = `grade-notification-${intent.eventId}`;
    const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${id}`;
    const current = await this.admin.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id, timestamp: now, feature: 'thcs-grading', severity: 'error',
      message: 'Individual THCS question grade notification failed after its retry.',
      userId: intent.actorUid, userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { eventId: intent.eventId, sessionCode: intent.sessionCode,
        studentId: intent.studentId, questionNumber: intent.questionNumber },
    }, current.etag);
  }
}

export const GRADE_NOTIFICATION_DONE_DUE_AT = DONE_DUE_AT;
