import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  thcsNotificationId,
  type ThcsNotificationIntent,
  type ThcsNotificationKind,
  type ThcsNotificationStorage,
} from './thcs-notification-action.ts';

type Env = Readonly<Record<string, unknown>>;
type FirestoreValue = { readonly nullValue?: string; readonly booleanValue?: boolean; readonly integerValue?: string; readonly doubleValue?: number; readonly stringValue?: string; readonly mapValue?: { readonly fields?: Record<string, FirestoreValue> }; readonly arrayValue?: { readonly values?: FirestoreValue[] } };
type FirestoreDocument = { readonly name?: string; readonly fields?: Record<string, FirestoreValue>; readonly updateTime?: string };
type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const encode = (value: unknown): FirestoreValue => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } };
  throw new Error('thcs_notification_firestore_value_invalid');
};
const decode = (value: FirestoreValue): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, entry]) => [key, decode(entry)]));
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(decode);
  return null;
};
const decodeDocument = (document: FirestoreDocument): Row => Object.fromEntries(
  Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]),
);

export class FirebaseThcsNotificationStorage implements ThcsNotificationStorage {
  private readonly projectId: string;
  private readonly rtdb: FirebaseRtdbRestClient;
  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }
  private documentsUrl(path = ''): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents${path}`;
  }
  private async token(): Promise<string> {
    const key = JSON.parse(required(this.env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as { client_email?: string; private_key?: string };
    if (!key.client_email || !key.private_key || key.client_email !== required(this.env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY')) {
      throw new Error('thcs_notification_service_identity_invalid');
    }
    return this.rtdb.getAccessToken();
  }
  private async readDocument(path: string): Promise<{ value: Row; version: string } | null> {
    const response = await this.fetchImpl(this.documentsUrl(path), { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`thcs_notification_firestore_read_failed:${response.status}`);
    const document = await response.json() as FirestoreDocument;
    if (!document.fields || !document.updateTime) return null;
    return { value: decodeDocument(document), version: document.updateTime };
  }
  async readHomework(homeworkId: string): Promise<unknown> {
    return (await this.readDocument(`/homework_assignments/${encodeURIComponent(homeworkId)}`))?.value ?? null;
  }
  readResult(resultId: string): Promise<unknown> { return this.rtdb.readValue(`test_results/${resultId}`); }
  readClass(classId: string): Promise<unknown> { return this.rtdb.readValue(`classes/${classId}`); }
  readUser(userId: string): Promise<unknown> { return this.rtdb.readValue(`users/${userId}`); }
  async saveIntent(kind: ThcsNotificationKind, recordId: string, intent: ThcsNotificationIntent): Promise<void> {
    if (kind === 'fully-graded') {
      const path = `test_results/${recordId}/notificationIntent`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await this.rtdb.readWithEtag<ThcsNotificationIntent | null>(path);
        if (!current.data || current.data.actionId !== recordId || current.data.kind !== kind) throw new Error('thcs_notification_intent_changed');
        if (current.data.state === 'done' || current.data.state === 'failed') return;
        if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
      }
      throw new Error('thcs_notification_intent_cas_failed');
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.readDocument(`/homework_assignments/${encodeURIComponent(recordId)}`);
      if (!current || asRow(current.value.notificationIntent)?.actionId !== recordId) throw new Error('thcs_notification_intent_changed');
      const response = await this.fetchImpl(`${this.documentsUrl(`/homework_assignments/${encodeURIComponent(recordId)}`)}?updateMask.fieldPaths=notificationIntent&currentDocument.updateTime=${encodeURIComponent(current.version)}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { notificationIntent: encode(intent) } }),
      });
      if (response.status === 409 || response.status === 412) continue;
      if (!response.ok) throw new Error(`thcs_notification_intent_write_failed:${response.status}`);
      return;
    }
    throw new Error('thcs_notification_intent_cas_exhausted');
  }
  async dueIntents(now: number, limit = 4) {
    const token = await this.token();
    const query = async (collectionId: string, kind: ThcsNotificationKind, remaining: number) => {
      if (remaining <= 0) return [];
      const response = await this.fetchImpl(`${this.documentsUrl()}:runQuery`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: 'notificationIntent.dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(now) } } },
          orderBy: [{ field: { fieldPath: 'notificationIntent.dueAt' }, direction: 'ASCENDING' }], limit: remaining,
        } }),
      });
      if (!response.ok) throw new Error(`thcs_notification_retry_query_failed:${response.status}`);
      const docs = await response.json() as { readonly document?: FirestoreDocument }[];
      return docs.flatMap(({ document }) => {
        if (!document?.name || !document.fields) return [];
        const value = decodeDocument(document);
        const intent = asRow(value.notificationIntent);
        const id = typeof value.id === 'string' ? value.id : document.name.split('/').pop() ?? '';
        if (!intent || typeof intent.dueAt !== 'number' || intent.dueAt > now
          || !['pending', 'sending', 'retry_due', 'retrying'].includes(String(intent.state))) return [];
        return [{ kind, recordId: id, intent: intent as unknown as ThcsNotificationIntent }];
      });
    };
    const homework = await query('homework_assignments', 'homework-assigned', limit);
    const resultLimit = Math.max(0, limit - homework.length);
    const results = resultLimit > 0 ? await this.rtdb.readValue('test_results', {
      orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: resultLimit,
    }) : null;
    const fullyGraded = results && typeof results === 'object' && !Array.isArray(results)
      ? Object.entries(results as Row).flatMap(([id, value]) => {
        const intent = asRow(asRow(value)?.notificationIntent);
        return intent && typeof intent.dueAt === 'number' && intent.dueAt <= now
          && ['pending', 'sending', 'retry_due', 'retrying'].includes(String(intent.state))
          ? [{ kind: 'fully-graded' as const, recordId: id, intent: intent as unknown as ThcsNotificationIntent }] : [];
      }) : [];
    return [...homework, ...fullyGraded].slice(0, limit);
  }
  async reportFailure(kind: ThcsNotificationKind, recordId: string, intent: ThcsNotificationIntent): Promise<void> {
    const eventId = `${kind}:${recordId}`;
    const path = `reports/errors/${new Date(intent.occurredAt).toISOString().slice(0, 10)}/${thcsNotificationId(eventId, 'report')}`;
    const current = await this.rtdb.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    const recipientCount = intent.recipientIds?.length ?? 1;
    const deliveredCount = intent.deliveredRecipientIds?.length ?? 0;
    await this.rtdb.writeIfMatch(path, {
      id: eventId, timestamp: Date.now(), feature: 'thcs', severity: 'error',
      message: 'THCS notification delivery failed after its retry.', userId: 'notification-worker',
      userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { eventId, authorityRecordId: recordId, failedRecipientCount: recipientCount - deliveredCount },
    }, current.etag);
  }
}
