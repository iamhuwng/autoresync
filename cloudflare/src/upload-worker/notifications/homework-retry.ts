import { buildRoute } from '../../../../src/constants/routes.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import { notificationIssuePath, RetryFamilyGate, type NotificationFailureReason } from './retry-family-gate.ts';

const COLLECTION = 'homework_submissions';
const DONE_DUE_AT = 8_640_000_000_000_000;
const LIMIT = 1;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
type Env = Readonly<Record<string, unknown>>;
type Delivery = { readonly state: 'retry_due' | 'retrying' | 'done' | 'failed'; readonly attempts: number; readonly dueAt: number };
type Intent = { readonly schemaVersion: 1; readonly eventId: string; readonly resultId: string; readonly homeworkId: string; readonly studentId: string; readonly teacherId: string; readonly submittedAt: number };
type Submission = { readonly notificationIntent?: Intent; readonly notificationDelivery?: Delivery };
type FirestoreValue = { readonly nullValue?: string; readonly booleanValue?: boolean; readonly integerValue?: string; readonly doubleValue?: number; readonly stringValue?: string; readonly mapValue?: { readonly fields?: Record<string, FirestoreValue> }; readonly arrayValue?: { readonly values?: FirestoreValue[] } };
type FirestoreDocument = { readonly name?: string; readonly fields?: Record<string, FirestoreValue>; readonly updateTime?: string };

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
  if (typeof value === 'object' && value !== null) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } };
  throw new Error('homework_retry_firestore_value_invalid');
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
const decodeDocument = (document: FirestoreDocument): Submission => ({
  ...Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)])),
});

const tokenFor = async (env: Env, fetchImpl: typeof fetch): Promise<string> => {
  const keyJson = required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY');
  const key = JSON.parse(keyJson) as { client_email?: string; private_key?: string };
  if (!key.client_email || !key.private_key) throw new Error('invalid_notification_command_service_key');
  if (key.client_email !== required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY')) {
    throw new Error('notification_command_service_identity_mismatch');
  }
  return new FirebaseRtdbRestClient({ env: { GOOGLE_SA_KEY: keyJson }, fetchImpl }).getAccessToken();
};

const notificationOperationId = (operationKey: string): string => {
  const hash = (value: string, seed: number) => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
    return result;
  };
  const hex = [0, 1, 2, 3].map((seed) => hash(`${operationKey}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const fetchDue = async (env: Env, now: number, fetchImpl: typeof fetch, token: string): Promise<readonly { path: string; document: FirestoreDocument; submission: Submission }[]> => {
  const projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const response = await fetchImpl.call(globalThis, url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: 'notificationDelivery.dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(now) } } },
      orderBy: [{ field: { fieldPath: 'notificationDelivery.dueAt' }, direction: 'ASCENDING' }],
      limit: LIMIT,
    } }),
  });
  if (!response.ok) throw new Error(`homework_retry_query_failed:${response.status}`);
  const rows = await response.json() as { readonly document?: FirestoreDocument }[];
  return rows.flatMap((row) => row.document ? [row.document] : []).filter((row) => typeof row.name === 'string' && row.updateTime)
    .map((document) => ({
      path: document.name!.split('/documents/')[1], document, submission: decodeDocument(document),
    })).filter(({ path, submission }) => path?.startsWith(`${COLLECTION}/`)
      && submission.notificationDelivery?.dueAt <= now
      && (submission.notificationDelivery.state === 'retry_due' || submission.notificationDelivery.state === 'retrying'));
};

const updateDelivery = async (env: Env, due: { path: string; document: FirestoreDocument }, delivery: Delivery, fetchImpl: typeof fetch, token: string): Promise<FirestoreDocument | null> => {
  if (!due.document.updateTime) return null;
  const projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${due.path}?updateMask.fieldPaths=notificationDelivery&currentDocument.updateTime=${encodeURIComponent(due.document.updateTime)}`;
  const response = await fetchImpl.call(globalThis, url, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { notificationDelivery: encode(delivery) } }),
  });
  if (response.status === 409 || response.status === 412) return null;
  if (!response.ok) throw new Error(`homework_retry_update_failed:${response.status}`);
  return await response.json() as FirestoreDocument;
};

const trustedIntent = (intent: Intent, value: unknown): boolean => {
  if (!intent || intent.schemaVersion !== 1 || intent.eventId !== `homework-submitted:${intent.resultId}`
    || !Number.isSafeInteger(intent.submittedAt)
    || ![intent.resultId, intent.homeworkId, intent.studentId, intent.teacherId].every((id) => typeof id === 'string' && ID.test(id))) return false;
  const result = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const context = result?.context && typeof result.context === 'object' ? result.context as Record<string, unknown> : null;
  const visibility = result?.visibility && typeof result.visibility === 'object' ? result.visibility as Record<string, unknown> : null;
  if (!result || !context || !visibility || result.resultId !== intent.resultId || result.studentId !== intent.studentId
    || context.type !== 'homework' || visibility.ownershipResolved !== true
    || visibility.visibilityOwnerTeacherId !== intent.teacherId || visibility.homeworkId !== intent.homeworkId) return false;
  return true;
};

const reportFailure = async (admin: FirebaseRtdbRestClient, gate: RetryFamilyGate, intent: Intent, now: number,
  reasonCode: NotificationFailureReason): Promise<void> => {
  const issueId = `homework-notification-${intent.eventId}`;
  const path = notificationIssuePath(issueId, intent.submittedAt);
  const existing = await admin.readWithEtag<unknown>(path);
  if (existing.data !== null) return;
  if (await admin.writeIfMatch(path, {
    id: issueId, timestamp: now, feature: 'homework', severity: 'error',
    message: `Homework submission notification delivery failed (${reasonCode}).`,
    userId: intent.studentId, userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
    contextData: { eventId: intent.eventId, resultId: intent.resultId,
      homeworkId: intent.homeworkId, recipientId: intent.teacherId, reasonCode },
  }, existing.etag)) await gate.recordTerminalFailure('homework-submitted', intent.eventId, path);
};

/** Mark only the exact committed event done after the trusted HTTP path delivered it. */
export const hasCommittedHomeworkNotification = async (
  env: Env,
  input: { readonly resultId: string; readonly studentId: string; readonly teacherId: string; readonly homeworkId: string;
    readonly reasonCode?: NotificationFailureReason },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> => {
  if (![input.resultId, input.studentId, input.teacherId, input.homeworkId].every((id) => ID.test(id))) return false;
  const token = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
  const response = await fetchImpl.call(globalThis, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: 'notificationIntent.resultId' }, op: 'EQUAL', value: { stringValue: input.resultId } } },
      limit: 2,
    } }),
  });
  if (!response.ok) throw new Error(`homework_notification_intent_query_failed:${response.status}`);
  const rows = await response.json() as { readonly document?: FirestoreDocument }[];
  const matches = rows.flatMap((row) => row.document ? [decodeDocument(row.document)] : [])
    .filter((submission) => {
      const intent = submission.notificationIntent;
      return intent?.schemaVersion === 1
        && intent.eventId === `homework-submitted:${input.resultId}`
        && intent.resultId === input.resultId
        && intent.studentId === input.studentId
        && intent.teacherId === input.teacherId
        && intent.homeworkId === input.homeworkId
        && (submission.notificationDelivery?.state === 'retry_due'
          || submission.notificationDelivery?.state === 'retrying'
          || submission.notificationDelivery?.state === 'done');
    });
  return matches.length === 1;
};

/** Mark only the exact committed event done after the trusted HTTP path delivered it. */
export const markHomeworkNotificationDelivered = async (
  env: Env,
  input: { readonly resultId: string; readonly studentId: string; readonly teacherId: string; readonly homeworkId: string },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> => {
  if (![input.resultId, input.studentId, input.teacherId, input.homeworkId].every((id) => ID.test(id))) return false;
  const token = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
  const response = await fetchImpl.call(globalThis, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: 'notificationIntent.resultId' }, op: 'EQUAL', value: { stringValue: input.resultId } } },
      limit: 2,
    } }),
  });
  if (!response.ok) throw new Error(`homework_notification_mark_query_failed:${response.status}`);
  const rows = await response.json() as { readonly document?: FirestoreDocument }[];
  const matches = rows.flatMap((row) => row.document ? [row.document] : [])
    .filter((document) => typeof document.name === 'string' && document.updateTime)
    .map((document) => ({ document, submission: decodeDocument(document) }))
    .filter(({ submission }) => {
      const intent = submission.notificationIntent;
      return intent?.schemaVersion === 1
        && intent.eventId === `homework-submitted:${input.resultId}`
        && intent.resultId === input.resultId
        && intent.studentId === input.studentId
        && intent.teacherId === input.teacherId
        && intent.homeworkId === input.homeworkId;
    });
  if (matches.length !== 1) return false;
  const match = matches[0];
  const delivery = match.submission.notificationDelivery;
  if (!delivery) return false;
  if (delivery.state === 'done') return true;
  if (delivery.state !== 'retry_due' && delivery.state !== 'retrying') return false;
  return Boolean(await updateDelivery(env, {
    path: match.document.name!.split('/documents/')[1],
    document: match.document,
  }, { state: 'done', attempts: delivery.attempts, dueAt: DONE_DUE_AT }, fetchImpl, token));
};

/** Keep immediate success evidence, or report a new failure without queuing a retry while suppressed. */
export const recordHomeworkImmediateOutcome = async (
  env: Env,
  input: { readonly resultId: string; readonly studentId: string; readonly teacherId: string; readonly homeworkId: string },
  delivered: boolean,
  now: number,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> => {
  const admin = new FirebaseRtdbRestClient({ env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  }, fetchImpl });
  const gate = new RetryFamilyGate(admin);
  if (delivered) {
    await gate.recordSuccess('homework-submitted', now);
    return;
  }
  if (!await gate.isSuppressed('homework-submitted')) return;
  const token = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required(env, 'FIREBASE_PROJECT_ID'));
  const response = await fetchImpl.call(globalThis,
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: 'notificationIntent.resultId' }, op: 'EQUAL', value: { stringValue: input.resultId } } },
        limit: 2,
      } }),
    });
  if (!response.ok) throw new Error(`homework_notification_suppressed_query_failed:${response.status}`);
  const rows = await response.json() as { readonly document?: FirestoreDocument }[];
  const matches = rows.flatMap((row) => row.document ? [row.document] : [])
    .filter((document) => typeof document.name === 'string' && document.updateTime)
    .map((document) => ({ document, submission: decodeDocument(document) }))
    .filter(({ submission }) => {
      const intent = submission.notificationIntent;
      return intent?.eventId === `homework-submitted:${input.resultId}`
        && intent.studentId === input.studentId && intent.teacherId === input.teacherId
        && intent.homeworkId === input.homeworkId && submission.notificationDelivery?.state === 'retry_due';
    });
  if (matches.length !== 1) throw new Error('homework_notification_suppressed_intent_missing');
  const match = matches[0]!;
  await reportFailure(admin, gate, match.submission.notificationIntent!, now,
    input.reasonCode ?? 'delivery_unconfirmed');
  await updateDelivery(env, { path: match.document.name!.split('/documents/')[1], document: match.document },
    { state: 'failed', attempts: 1, dueAt: DONE_DUE_AT }, fetchImpl, token);
};

/** One bounded scheduled pass; each submission receives one later retry at most. */
export const retryDueHomeworkNotifications = async (
  env: Env,
  now = Date.now(),
  dependencies: { readonly fetchImpl?: typeof fetch; readonly repository?: NotificationCommandRepository; readonly readResult?: (path: string) => Promise<unknown>; readonly readInbox?: (path: string) => Promise<unknown> } = {},
): Promise<void> => {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const token = await tokenFor(env, fetchImpl);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env: env as NotificationCommandRepositoryEnv });
  const admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  const gate = new RetryFamilyGate(admin);
  const readResult = dependencies.readResult ?? ((path: string) => admin.readValue(path));
  const readInbox = dependencies.readInbox ?? ((path: string) => admin.readValue(path));
  for (const due of await fetchDue(env, now, fetchImpl, token)) {
    const intent = due.submission.notificationIntent;
    const delivery = due.submission.notificationDelivery;
    if (!intent || !delivery) continue;
    if (delivery.state === 'retrying') {
      // The second attempt may have delivered before a crash; inspect without sending again.
      const operationId = notificationOperationId(`homework-submitted:teacher:${intent.resultId}:${intent.teacherId}`);
      const existing = await readInbox(`notifications/${intent.teacherId}/${operationId}`);
      const row = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing as Record<string, unknown> : null;
      const delivered = row?.id === operationId && row.type === 'info'
        && row.title === 'Homework Submitted'
        && row.link === buildRoute('TEACHER_HOMEWORK_DETAIL', { homeworkId: intent.homeworkId });
      if (!delivered) await reportFailure(admin, gate, intent, now, 'inbox_missing_after_claim');
      await updateDelivery(env, due, { state: delivered ? 'done' : 'failed', attempts: 2, dueAt: DONE_DUE_AT }, fetchImpl, token);
      continue;
    }
    if (await gate.isSuppressed('homework-submitted')) continue;
    const claimed = { state: 'retrying' as const, attempts: 2, dueAt: now + 60 * 60 * 1000 };
    const claimedDocument = await updateDelivery(env, due, claimed, fetchImpl, token);
    if (!claimedDocument) continue;
    let delivered = false;
    let fresh = false;
    let backendFailure = false;
    let reasonCode: NotificationFailureReason = 'source_unavailable';
    try {
      const canonical = trustedIntent(intent, await readResult(`test_results/${intent.resultId}`));
      if (canonical) {
        const operationKey = `homework-submitted:teacher:${intent.resultId}`;
        const result = await repository.create({
          operationId: notificationOperationId(`${operationKey}:${intent.teacherId}`),
          recipientId: intent.teacherId,
          notification: {
            type: 'info', title: 'Homework Submitted',
            message: 'A student submitted homework.',
            link: buildRoute('TEACHER_HOMEWORK_DETAIL', { homeworkId: intent.homeworkId }),
          },
          now: intent.submittedAt,
        });
        delivered = result.status !== 'idempotency-conflict';
        fresh = result.status === 'created';
        if (!delivered) reasonCode = 'inbox_conflict';
      }
    } catch {
      delivered = false;
      backendFailure = true;
      reasonCode = 'delivery_backend_error';
    }
    if (backendFailure) break;
    if (!delivered) await reportFailure(admin, gate, intent, now, reasonCode);
    else if (fresh) {
      try { await gate.recordSuccess('homework-submitted', Date.now()); } catch { /* Keep delivered intent moving. */ }
    }
    await updateDelivery(env, { ...due, document: claimedDocument }, { state: delivered ? 'done' : 'failed', attempts: 2, dueAt: DONE_DUE_AT }, fetchImpl, token);
  }
};
