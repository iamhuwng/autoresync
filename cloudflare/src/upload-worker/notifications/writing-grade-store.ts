import { importPKCS8, SignJWT } from 'jose';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type {
  WritingGradeNotificationIntent,
  WritingGradeNotificationStorage,
} from './writing-grade-authority.ts';

type Env = Readonly<Record<string, unknown>>;
type FirestoreDocument = {
  readonly name?: string;
  readonly updateTime?: string;
  readonly fields?: Record<string, unknown>;
};

const COLLECTION = 'writing_notification_intents';
const ID = /^[A-Za-z0-9_-]{1,128}$/u;

const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};

const encodeValue = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isSafeInteger(value)) return { integerValue: String(value) };
  throw new Error('writing_notification_firestore_value_invalid');
};

const encodeIntent = (intent: WritingGradeNotificationIntent): Record<string, unknown> => ({
  fields: Object.fromEntries(Object.entries(intent).map(([key, value]) => [key, encodeValue(value)])),
});

const decodeValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  if (typeof fields.stringValue === 'string') return fields.stringValue;
  if (typeof fields.booleanValue === 'boolean') return fields.booleanValue;
  if (typeof fields.integerValue === 'string') return Number(fields.integerValue);
  if (typeof fields.doubleValue === 'number') return fields.doubleValue;
  if (fields.nullValue === 'NULL_VALUE') return null;
  if (fields.mapValue && typeof fields.mapValue === 'object') {
    const mapFields = (fields.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(Object.entries(mapFields).map(([key, child]) => [key, decodeValue(child)]));
  }
  if (fields.arrayValue && typeof fields.arrayValue === 'object') {
    const values = (fields.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(decodeValue);
  }
  return undefined;
};

const decodeDocument = (document: FirestoreDocument): Record<string, unknown> =>
  Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));

export class FirebaseWritingGradeNotificationStorage implements WritingGradeNotificationStorage {
  private readonly projectId: string;
  private readonly key: { client_email?: string; private_key?: string };
  private readonly rtdb: FirebaseRtdbRestClient;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
    const serviceIdentity = required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
    try {
      this.key = JSON.parse(required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as typeof this.key;
    } catch {
      throw new Error('invalid_notification_command_google_sa_key');
    }
    if (this.key.client_email !== serviceIdentity || !this.key.private_key) {
      throw new Error('notification_command_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
        FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
        GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
      },
      fetchImpl,
    });
  }

  private async token(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) return this.tokenCache.value;
    const privateKey = await importPKCS8(this.key.private_key!, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.key.client_email!)
      .setSubject(this.key.client_email!)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!response.ok) throw new Error(`writing_notification_token_failed:${response.status}`);
    const result = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('writing_notification_token_invalid');
    const expiresIn = typeof result.expires_in === 'number' ? result.expires_in : 3600;
    this.tokenCache = { value: result.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return result.access_token;
  }

  private documentUrl(path: string): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${path}`;
  }

  private async getDocument(path: string): Promise<FirestoreDocument | null> {
    const response = await this.fetchImpl(this.documentUrl(path), {
      headers: { Authorization: `Bearer ${await this.token()}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`writing_notification_read_failed:${response.status}`);
    return await response.json() as FirestoreDocument;
  }

  private async patchIntent(
    current: FirestoreDocument,
    intent: WritingGradeNotificationIntent,
  ): Promise<boolean> {
    if (!current.updateTime) return false;
    const response = await this.fetchImpl(
      `${this.documentUrl(`${COLLECTION}/${encodeURIComponent(intent.eventId)}`)}?updateMask.fieldPaths=attempts&updateMask.fieldPaths=dueAt&updateMask.fieldPaths=state&currentDocument.updateTime=${encodeURIComponent(current.updateTime)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          attempts: encodeValue(intent.attempts),
          dueAt: encodeValue(intent.dueAt),
          state: encodeValue(intent.state),
        } }),
      },
    );
    if (response.status === 409 || response.status === 412) return false;
    if (!response.ok) throw new Error(`writing_notification_update_failed:${response.status}`);
    return true;
  }

  async readIntent(eventId: string): Promise<unknown> {
    const document = await this.getDocument(`${COLLECTION}/${encodeURIComponent(eventId)}`);
    return document ? decodeDocument(document) : null;
  }

  async readSubmission(submissionId: string): Promise<unknown> {
    const document = await this.getDocument(`writing_submissions/${encodeURIComponent(submissionId)}`);
    return document ? decodeDocument(document) : null;
  }

  async readTeacherLink(teacherId: string, studentId: string): Promise<boolean> {
    if (!ID.test(teacherId) || !ID.test(studentId)) return false;
    const linked = await this.rtdb.readValue(`student_teacher_links/${teacherId}/${studentId}`);
    return linked === true;
  }

  async readInbox(path: string): Promise<unknown> {
    return this.rtdb.readValue(path);
  }

  async readSessionSubmissionProof(sessionCode: string, studentId: string, resultId: string, actorUid: string): Promise<boolean> {
    if (!ID.test(sessionCode) || !ID.test(studentId) || !ID.test(resultId) || !ID.test(actorUid)) return false;
    const session = await this.rtdb.readValue(`game_sessions/${sessionCode}`);
    if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
    const row = session as Record<string, unknown>;
    const students = row.students && typeof row.students === 'object' && !Array.isArray(row.students)
      ? row.students as Record<string, unknown> : {};
    const student = students[studentId] && typeof students[studentId] === 'object' && !Array.isArray(students[studentId])
      ? students[studentId] as Record<string, unknown> : {};
    const writing = student.writing && typeof student.writing === 'object' && !Array.isArray(student.writing)
      ? student.writing as Record<string, unknown> : {};
    return writing.submitted === true && writing.resultId === resultId
      && (actorUid === studentId || row.createdByUserId === actorUid);
  }

  async reportFailure(intent: WritingGradeNotificationIntent, now: number): Promise<void> {
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/writing-notification-${intent.eventId}`;
    const current = await this.rtdb.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: `writing-notification-${intent.eventId}`,
      timestamp: now,
      feature: 'writing',
      severity: 'error',
      message: 'Writing notification delivery failed after its retry.',
      userId: intent.actorUid,
      userName: 'Notification Worker',
      userRole: 'service',
      duplicateCount: 1,
      contextData: { eventId: intent.eventId, authorityRecordId: intent.authorityRecordId },
    }, current.etag);
  }

  async updateIntent(intent: WritingGradeNotificationIntent): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.getDocument(`${COLLECTION}/${encodeURIComponent(intent.eventId)}`);
      if (!current) throw new Error('writing_notification_intent_not_found');
      const value = decodeDocument(current) as unknown as WritingGradeNotificationIntent;
      if (value.eventId !== intent.eventId || value.authorityRecordId !== intent.authorityRecordId
        || value.actorUid !== intent.actorUid || value.auditVersion !== intent.auditVersion) {
        throw new Error('writing_notification_intent_identity_changed');
      }
      if (value.state === 'done' || value.state === 'failed') return;
      if (await this.patchIntent(current, intent)) return;
    }
    throw new Error('writing_notification_intent_cas_failed');
  }

  async dueIntents(now: number, limit: number): Promise<readonly WritingGradeNotificationIntent[]> {
    const response = await this.fetchImpl(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: { fieldFilter: {
            field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: encodeValue(now),
          } },
          orderBy: [{ field: { fieldPath: 'dueAt' }, direction: 'ASCENDING' }],
          limit: Math.min(5, Math.max(1, limit)),
        } }),
      },
    );
    if (!response.ok) throw new Error(`writing_notification_query_failed:${response.status}`);
    const rows = await response.json() as readonly { document?: FirestoreDocument }[];
    return rows.flatMap((row) => row.document ? [decodeDocument(row.document) as unknown as WritingGradeNotificationIntent] : [])
      .filter((intent) => intent.dueAt <= now && (intent.state === 'retry_due' || intent.state === 'retrying'));
  }

  async claimRetry(eventId: string, now: number): Promise<WritingGradeNotificationIntent | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.getDocument(`${COLLECTION}/${encodeURIComponent(eventId)}`);
      if (!current) return null;
      const intent = decodeDocument(current) as unknown as WritingGradeNotificationIntent;
      if (intent.eventId !== eventId || intent.state !== 'retry_due' || intent.attempts !== 1
        || intent.dueAt > now) return null;
      const claimed: WritingGradeNotificationIntent = {
        ...intent, state: 'retrying', attempts: 2, dueAt: now + 60 * 60 * 1000,
      };
      if (await this.patchIntent(current, claimed)) return claimed;
    }
    return null;
  }
}
