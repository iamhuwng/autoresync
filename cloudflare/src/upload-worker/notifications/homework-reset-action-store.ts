import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { homeworkResetNotificationId, type HomeworkResetIntent, type HomeworkResetNotificationStorage } from './homework-reset-action.ts';

type Env = Readonly<Record<string, unknown>>;
type FirestoreValue = { readonly nullValue?: string; readonly booleanValue?: boolean; readonly integerValue?: string; readonly doubleValue?: number; readonly stringValue?: string; readonly mapValue?: { readonly fields?: Record<string, FirestoreValue> }; readonly arrayValue?: { readonly values?: FirestoreValue[] } };
type FirestoreDocument = { readonly name?: string; readonly fields?: Record<string, FirestoreValue>; readonly updateTime?: string };
const COLLECTION = 'homework_reset_notification_intents';

const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const encode = (value: unknown): FirestoreValue => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object' && value) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  throw new Error('homework_reset_firestore_value_invalid');
};
const decode = (value: FirestoreValue): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(decode);
  return null;
};
const decoded = (document: FirestoreDocument): Record<string, unknown> => Object.fromEntries(
  Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]),
);
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export class FirebaseHomeworkResetNotificationStorage implements HomeworkResetNotificationStorage {
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
    if (!key.client_email || !key.private_key || key.client_email !== required(this.env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY')) throw new Error('homework_reset_service_identity_invalid');
    return this.rtdb.getAccessToken();
  }

  async readIntent(eventId: string) {
    const token = await this.token();
    const response = await this.fetchImpl.call(globalThis, this.documentsUrl(`/${COLLECTION}/${encodeURIComponent(eventId)}`), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`homework_reset_intent_read_failed:${response.status}`);
    const document = await response.json() as FirestoreDocument;
    if (!document.updateTime || !document.fields) return null;
    return { intent: decoded(document) as unknown as HomeworkResetIntent, version: document.updateTime };
  }

  async readHomework(homeworkId: string, studentId: string): Promise<Record<string, unknown> | null> {
    const token = await this.token();
    const response = await this.fetchImpl.call(globalThis, this.documentsUrl(`/homework_assignments/${encodeURIComponent(homeworkId)}`), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`homework_reset_source_read_failed:${response.status}`);
    const homework = decoded(await response.json() as FirestoreDocument);
    const target = record(homework.target);
    if (target?.type === 'class' && typeof target.classId === 'string') {
      homework.classStudents = await this.rtdb.readValue(`classes/${target.classId}/students`);
    } else if (target?.type === 'course' && typeof target.courseId === 'string') {
      const rows = await this.rtdb.readValue('course_enrollments', { orderBy: 'studentId', equalTo: studentId, limitToFirst: 30 });
      homework.courseEnrollments = rows && typeof rows === 'object' && !Array.isArray(rows) ? Object.values(rows as Record<string, unknown>) : [];
    }
    return homework;
  }

  async updateIntent(eventId: string, intent: HomeworkResetIntent, version: string): Promise<string | null> {
    const token = await this.token();
    const fields = ['state', 'attempts', 'dueAt'];
    const mask = fields.map((field) => `updateMask.fieldPaths=${field}`).join('&');
    const response = await this.fetchImpl.call(globalThis, `${this.documentsUrl(`/${COLLECTION}/${encodeURIComponent(eventId)}`)}?${mask}&currentDocument.updateTime=${encodeURIComponent(version)}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: Object.fromEntries(fields.map((field) => [field, encode(intent[field as keyof HomeworkResetIntent])])) }),
    });
    if (response.status === 409 || response.status === 412) return null;
    if (!response.ok) throw new Error(`homework_reset_intent_update_failed:${response.status}`);
    return (await response.json() as FirestoreDocument).updateTime ?? null;
  }

  async dueIntents(now: number, limit = 2) {
    const token = await this.token();
    const response = await this.fetchImpl.call(globalThis, `${this.documentsUrl()}:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(now) } } },
        orderBy: [{ field: { fieldPath: 'dueAt' }, direction: 'ASCENDING' }], limit,
      } }),
    });
    if (!response.ok) throw new Error(`homework_reset_queue_read_failed:${response.status}`);
    const rows = await response.json() as { readonly document?: FirestoreDocument }[];
    return rows.flatMap((row) => row.document?.name && row.document.updateTime && row.document.fields ? [row.document] : [])
      .map((document) => ({ intent: decoded(document) as unknown as HomeworkResetIntent, version: document.updateTime! }))
      .filter(({ intent }) => intent.dueAt <= now && ['retry_due', 'sending', 'retrying'].includes(intent.state));
  }

  async notificationExists(intent: HomeworkResetIntent): Promise<boolean> {
    const id = homeworkResetNotificationId(intent);
    const notification = record(await this.rtdb.readValue(`notifications/${intent.studentId}/${id}`));
    return notification?.id === id;
  }

  async reportFailure(intent: HomeworkResetIntent, now: number): Promise<void> {
    const issueId = `homework-reset-notification-${intent.eventId}`;
    const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${issueId}`;
    const existing = await this.rtdb.readWithEtag<unknown>(path);
    if (existing.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: issueId, timestamp: now, feature: 'homework', severity: 'error',
      message: 'Homework reset notification delivery failed after its retry.',
      userId: intent.actorUid, userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { eventId: intent.eventId, homeworkId: intent.homeworkId, studentId: intent.studentId },
    }, existing.etag);
  }
}
