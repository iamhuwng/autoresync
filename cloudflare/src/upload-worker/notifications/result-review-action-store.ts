import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { ResultReviewCommand, ResultReviewIntent } from './result-review-action.ts';

type Env = Readonly<Record<string, unknown>>;
const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

export interface ResultReviewActionStorage {
  read(path: string): Promise<unknown>;
  commit(input: {
    command: ResultReviewCommand;
    actorUid: string;
    intent: ResultReviewIntent;
  }): Promise<void>;
  updateIntent(intent: ResultReviewIntent): Promise<void>;
  dueIntents(now: number, limit?: number): Promise<ResultReviewIntent[]>;
  claimRetry(eventId: string, now: number): Promise<ResultReviewIntent | null>;
}

export class FirebaseResultReviewActionStorage implements ResultReviewActionStorage {
  private readonly admin: FirebaseRtdbRestClient;

  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
        GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
      },
      fetchImpl,
    });
  }

  read(path: string): Promise<unknown> {
    return this.admin.readValue(path);
  }

  private async firebaseToken(input: {
    command: ResultReviewCommand;
    actorUid: string;
    intent: ResultReviewIntent;
  }): Promise<string> {
    const key = JSON.parse(required(this.env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as {
      client_email?: string;
      private_key?: string;
    };
    const identity = required(this.env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
    if (key.client_email !== identity || !key.private_key) throw new Error('result_review_service_identity_mismatch');
    const privateKey = await importPKCS8(key.private_key, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    const customToken = await new SignJWT({
      iss: identity,
      sub: identity,
      aud: AUDIENCE,
      iat: issuedAt,
      exp: issuedAt + 300,
      uid: `notification-result-review:${input.command.eventId}`,
      claims: {
        notificationResultReview: true,
        actionKind: 'result-reviewed',
        eventId: input.command.eventId,
        resultId: input.command.resultId,
        actorUid: input.actorUid,
        studentId: input.intent.studentId,
        occurredAt: input.intent.occurredAt,
      },
    }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(privateKey);
    const url = `${SIGN_IN_URL}?key=${encodeURIComponent(required(this.env, 'FIREBASE_WEB_API_KEY'))}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error(`result_review_token_failed:${response.status}`);
    const value = await response.json() as { idToken?: unknown };
    if (typeof value.idToken !== 'string' || !value.idToken) throw new Error('result_review_token_invalid');
    return value.idToken;
  }

  async commit(input: {
    command: ResultReviewCommand;
    actorUid: string;
    intent: ResultReviewIntent;
  }): Promise<void> {
    const token = await this.firebaseToken(input);
    const client = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(this.env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(this.env, 'FIREBASE_PROJECT_ID'),
      },
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => token,
    });
    const resultPath = `test_results/${input.command.resultId}`;
    await client.patchMultiLocation([
      { path: `${resultPath}/markingStatus`, value: 'reviewed' },
      { path: `${resultPath}/reviewedAt`, value: input.intent.occurredAt },
      { path: `${resultPath}/reviewedBy`, value: input.actorUid },
      { path: `${resultPath}/updatedAt`, value: input.intent.occurredAt },
      { path: `result_review_notification_intents/${input.command.eventId}`, value: input.intent },
    ]);
  }

  async updateIntent(intent: ResultReviewIntent): Promise<void> {
    const path = `result_review_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<ResultReviewIntent | null>(path);
      if (!current.data || current.data.eventId !== intent.eventId
        || current.data.kind !== intent.kind || current.data.resultId !== intent.resultId
        || current.data.actorUid !== intent.actorUid || current.data.studentId !== intent.studentId) {
        throw new Error('result_review_intent_identity_changed');
      }
      if (current.data.state === 'done') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('result_review_intent_cas_failed');
  }

  async dueIntents(now: number, limit = 5): Promise<ResultReviewIntent[]> {
    const rows = await this.admin.readValue('result_review_notification_intents', {
      orderBy: 'dueAt',
      limitToFirst: limit,
    });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, ResultReviewIntent>).filter((intent) =>
      intent?.kind === 'result-reviewed' && intent.dueAt <= now
      && (intent.state === 'retry_due' || intent.state === 'retrying'));
  }

  async claimRetry(eventId: string, now: number): Promise<ResultReviewIntent | null> {
    const path = `result_review_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag<ResultReviewIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.kind !== 'result-reviewed'
      || intent.state !== 'retry_due' || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed: ResultReviewIntent = {
      ...intent,
      state: 'retrying',
      attempts: 2,
      dueAt: now + 60 * 60 * 1000,
    };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
}
