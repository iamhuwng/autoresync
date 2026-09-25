import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { ClassActionCommand, ClassActionStorage, ClassNotificationIntent } from './class-action.ts';
import { RetryFamilyGate } from './retry-family-gate.ts';

type Env = Readonly<Record<string, unknown>>;
const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

const firebaseToken = async (
  env: Env,
  command: ClassActionCommand,
  actorUid: string,
  fetchImpl: typeof fetch,
): Promise<string> => {
  const raw = required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY');
  const identity = required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
  const key = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (key.client_email !== identity || !key.private_key) {
    throw new Error('notification_class_service_identity_mismatch');
  }
  const privateKey = await importPKCS8(key.private_key, 'RS256');
  const issuedAt = Math.floor(Date.now() / 1000);
  const customToken = await new SignJWT({
    iss: identity, sub: identity, aud: AUDIENCE,
    iat: issuedAt, exp: issuedAt + 300,
    uid: `notification-class-action:${command.actionId}`,
    claims: {
      notificationClassAction: true,
      actionId: command.actionId,
      classId: command.classId,
      studentId: command.studentId,
      actionKind: command.kind,
      actorUid,
    },
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(privateKey);
  const url = `${SIGN_IN_URL}?key=${encodeURIComponent(required(env, 'FIREBASE_WEB_API_KEY'))}`;
  const response = await fetchImpl.call(globalThis, url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`notification_class_token_failed:${response.status}`);
  const result = await response.json() as { idToken?: unknown };
  if (typeof result.idToken !== 'string' || !result.idToken) {
    throw new Error('notification_class_token_invalid');
  }
  return result.idToken;
};

export class FirebaseClassActionStorage implements ClassActionStorage {
  private readonly admin: FirebaseRtdbRestClient;
  private readonly gate: RetryFamilyGate;

  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
        GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
      },
      fetchImpl,
    });
    this.gate = new RetryFamilyGate(this.admin);
  }

  read(path: string): Promise<unknown> {
    return this.admin.readValue(path);
  }

  retrySuppressed(): Promise<boolean> { return this.gate.isSuppressed('class-membership'); }

  recordSuccess(at: number): Promise<void> { return this.gate.recordSuccess('class-membership', at); }

  async commit(input: {
    command: ClassActionCommand;
    actorUid: string;
    updates: readonly { path: string; value: unknown }[];
  }): Promise<void> {
    const token = await firebaseToken(this.env, input.command, input.actorUid, this.fetchImpl);
    const client = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(this.env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(this.env, 'FIREBASE_PROJECT_ID'),
      },
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => token,
    });
    await client.patchMultiLocation(input.updates);
  }

  async updateIntent(intent: ClassNotificationIntent): Promise<void> {
    const path = `notification_intents/${intent.actionId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<ClassNotificationIntent | null>(path);
      if (!current.data || current.data.actionId !== intent.actionId
        || current.data.kind !== intent.kind || current.data.actorUid !== intent.actorUid) {
        throw new Error('notification_intent_identity_changed');
      }
      if (current.data.state === 'done') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('notification_intent_cas_failed');
  }

  async claimRetry(actionId: string, now: number): Promise<ClassNotificationIntent | null> {
    const path = `notification_intents/${actionId}`;
    const current = await this.admin.readWithEtag<ClassNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.actionId !== actionId || intent.state !== 'retry_due'
      || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed: ClassNotificationIntent = { ...intent, state: 'retrying', attempts: 2, dueAt: now + 3_600_000 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  async dueIntents(now: number, limit = 2): Promise<ClassNotificationIntent[]> {
    const rows = await this.admin.readValue('notification_intents', {
      orderBy: 'dueAt', limitToFirst: limit,
    });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, ClassNotificationIntent>)
      .filter((row) => row && row.dueAt <= now &&
        (row.state === 'retry_due' || row.state === 'retrying'));
  }

  async reportFailure(intent: ClassNotificationIntent, failedRecipientCount: number): Promise<void> {
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/${intent.actionId}`;
    const existing = await this.admin.readWithEtag<unknown>(path);
    if (existing.data !== null) return;
    if (await this.admin.writeIfMatch(path, {
      id: intent.actionId,
      timestamp: now,
      feature: 'classes',
      severity: 'error',
      message: `Class notification delivery failed for ${intent.kind}; ${failedRecipientCount} recipient(s) remain.`,
      userId: intent.actorUid,
      userName: 'Notification Worker',
      userRole: 'service',
      duplicateCount: 1,
      contextData: { actionId: intent.actionId, classId: intent.classId, kind: intent.kind, failedRecipientCount },
    }, existing.etag)) await this.gate.recordTerminalFailure('class-membership', intent.actionId);
  }
}
