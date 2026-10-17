import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import type { BookHomeworkSagaRecord } from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  bookHomeworkRecipientAuthorityId,
  bookHomeworkRecipientDeliveryBindingId,
} from '../../cloudflare/src/upload-worker/book-homework/identity.ts';
import { createBookHomeworkWorkerHandlers } from '../../cloudflare/src/upload-worker/book-homework/worker.ts';
import { deterministicBookNotificationId } from '../../cloudflare/src/upload-worker/notifications/book-emitter.ts';
import { FirebaseRestNotificationCommandRepository } from '../../cloudflare/src/upload-worker/notifications/repository.ts';

const mode = process.argv[2];
if (!['emit', 'replay', 'disabled'].includes(mode ?? '')) {
  throw new Error('Usage: trusted-homework-fixture.ts <emit|replay|disabled>');
}

const fixture = JSON.parse(readFileSync(
  'artifacts/prd0062-ticket-100/fixture.json',
  'utf8',
)) as {
  schemaVersion: 1;
  assignmentId: string;
  operationId: string;
  idempotencyKey: string;
  title: string;
  message: string;
  destination: string;
};
const env = loadEnv(
  'development',
  process.env.TICKET100_ENV_ROOT ?? process.cwd(),
  '',
);
const databaseUrl = String(env.VITE_FIREBASE_DATABASE_URL ?? '');
const namespace = new URL(databaseUrl).hostname.split('.')[0];
const emulatorOrigin = 'http://localhost:9002';
const teacherId = 'ticket100-local-teacher';
const serviceIdentity = 'ticket100-local-notification-service@example.invalid';
const studentPassword = process.env.TICKET100_STUDENT_PASSWORD;
if (!studentPassword) throw new Error('TICKET100_STUDENT_PASSWORD is required');

const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:5174',
      referer: 'http://localhost:5174/',
    },
    body: JSON.stringify({
      email: 'student@test.com',
      password: studentPassword,
      returnSecureToken: true,
    }),
  },
);
if (!authResponse.ok) {
  throw new Error(`student_fixture_auth_failed:${authResponse.status}`);
}
const identity = await authResponse.json() as { localId: string };
const recipientId = identity.localId;
const notificationId = await deterministicBookNotificationId({
  actionId: fixture.operationId,
  authority: {
    kind: 'book-homework-assignment',
    recordId: fixture.assignmentId,
  },
  recipientId,
});

const emulatorUrl = (path: string): string => {
  const url = new URL(`${emulatorOrigin}/${path.replace(/^\/+|\/+$/gu, '')}.json`);
  url.searchParams.set('ns', namespace);
  return url.toString();
};
const adminRequest = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => fetch(emulatorUrl(path), {
  ...init,
  headers: {
    authorization: 'Bearer owner',
    ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...init.headers,
  },
});
const adminRead = async (path: string): Promise<unknown> => {
  const response = await adminRequest(path);
  if (!response.ok) throw new Error(`admin_read_failed:${path}:${response.status}`);
  return response.json();
};
const adminWrite = async (path: string, value: unknown): Promise<void> => {
  const response = await adminRequest(path, {
    method: 'PUT',
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`admin_write_failed:${path}:${response.status}`);
};
const adminDelete = async (path: string): Promise<void> => {
  const response = await adminRequest(path, { method: 'DELETE' });
  if (!response.ok) throw new Error(`admin_delete_failed:${path}:${response.status}`);
};

if (mode === 'emit') {
  await adminDelete(`notifications/${recipientId}`);
  await adminDelete('notifications/ticket100-cross-user');
  await adminWrite(`users/${recipientId}`, {
    uid: recipientId,
    email: 'student@test.com',
    displayName: 'Student Test',
    role: 'student',
    status: 'active',
    forceReauth: false,
    profileCompletedAt: 1,
  });
  await adminWrite('notifications/ticket100-cross-user/cross-user-row', {
    id: 'cross-user-row',
    type: 'info',
    title: 'Ticket 100 cross-user fixture',
    message: 'This row must remain inaccessible to the student browser.',
    read: false,
    createdAt: 1,
  });
}

const committedAt = '2026-08-04T12:00:00.000Z';
const committedRecord: BookHomeworkSagaRecord = {
  schemaVersion: 1,
  assignmentId: fixture.assignmentId,
  operationId: fixture.operationId,
  idempotencyKey: fixture.idempotencyKey,
  ownerId: teacherId,
  manifestVersionId: 'ticket100-manifest-v1',
  publicationId: 'ticket100-publication-v1',
  publicationRevision: 1,
  contextId: fixture.assignmentId,
  fingerprint: 'ticket100-committed-fingerprint',
  requestFingerprint: 'ticket100-request-fingerprint',
  state: 'committed',
  visibility: 'committed',
  recipients: [{
    recipientId,
    authorityId: bookHomeworkRecipientAuthorityId(fixture.assignmentId, recipientId),
    bindingId: bookHomeworkRecipientDeliveryBindingId(fixture.assignmentId, recipientId),
    state: 'committed',
    authorityRevision: 1,
    bindingRevision: 1,
  }],
  recipientCount: 1,
  committedRecipientCount: 1,
  revision: 2,
  createdAt: '2026-08-04T11:59:00.000Z',
  updatedAt: committedAt,
};

const serviceFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL
    ? input.toString()
    : input.url);
  if (url.origin !== emulatorOrigin) return fetch(url, init);
  url.searchParams.set('ns', namespace);
  const auth = url.searchParams.get('auth');
  url.searchParams.delete('auth');
  const headers = new Headers(init?.headers);
  if (auth === 'owner') headers.set('authorization', 'Bearer owner');
  return fetch(url, { ...init, headers });
};
const repository = new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: emulatorOrigin,
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: serviceIdentity,
  },
  fetchImpl: serviceFetch,
  getAccessToken: async () => 'owner',
});
const notificationPath = `notifications/${recipientId}/${notificationId}`;
const beforeRow = await adminRead(notificationPath);
const beforeRecipientRows = await adminRead(`notifications/${recipientId}`);

const handlers = createBookHomeworkWorkerHandlers({
  saga: {
    execute: async () => ({ status: 'committed', record: committedRecord }),
    readCommittedAssignment: async (assignmentId) => (
      assignmentId === fixture.assignmentId ? committedRecord : null
    ),
  },
  notificationRepositoryFactory: () => repository,
  now: () => committedAt,
});
const result = await handlers.homeworkAssignmentCommand({
  request: new Request(
    `https://worker.local/book-homework/${fixture.assignmentId}/assignment`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': fixture.idempotencyKey,
      },
      body: JSON.stringify({
        assignmentId: fixture.assignmentId,
        operationId: fixture.operationId,
        idempotencyKey: fixture.idempotencyKey,
        manifestVersionId: committedRecord.manifestVersionId,
        selectedRecipientIds: [recipientId],
        expectedManifestFingerprint: 'ticket100-manifest-fingerprint',
        expectedPublicationFingerprint: 'ticket100-publication-fingerprint',
        expectedExposureApprovalFingerprint: 'ticket100-exposure-fingerprint',
        expectedPolicyFingerprint: 'ticket100-policy-fingerprint',
      }),
    },
  ),
  env: {
    BOOK_NOTIFICATIONS_EMISSION_ENABLED: mode !== 'disabled',
    readDatabaseValue: async () => ({
      role: 'teacher',
      status: 'active',
      forceReauth: false,
    }),
  },
  uid: teacherId,
  assignmentId: fixture.assignmentId,
});
if (result.init.status !== 200) {
  throw new Error(`trusted_homework_handler_failed:${result.init.status}:${JSON.stringify(result.body)}`);
}

const afterRow = await adminRead(notificationPath);
const afterRecipientRows = await adminRead(`notifications/${recipientId}`) as Record<string, unknown> | null;
const rowCount = afterRecipientRows ? Object.keys(afterRecipientRows).length : 0;
const serialized = JSON.stringify(afterRow);
if (mode === 'emit') {
  if (beforeRow !== null || rowCount !== 1) throw new Error('first_emission_cardinality_failed');
  const expected = afterRow as Record<string, unknown> | null;
  if (!expected
    || expected.id !== notificationId
    || expected.title !== fixture.title
    || expected.message !== fixture.message
    || expected.link !== fixture.destination
    || expected.read !== false) {
    throw new Error('first_emission_content_failed');
  }
  if (/answer|recipientIds|manifest-fingerprint|publication-fingerprint|credential|token/iu.test(serialized)) {
    throw new Error('notification_privacy_failed');
  }
} else if (JSON.stringify(beforeRow) !== JSON.stringify(afterRow)
  || JSON.stringify(beforeRecipientRows) !== JSON.stringify(afterRecipientRows)
  || rowCount !== 1) {
  throw new Error(`${mode}_overwrote_or_duplicated_notification`);
}

console.log(JSON.stringify({
  proofKind: 'prd0062-ticket100-local-trusted-homework-notification',
  mode,
  namespace,
  emulatorOrigin,
  recipientId,
  assignmentId: fixture.assignmentId,
  operationId: fixture.operationId,
  notificationId,
  handlerStatus: result.init.status,
  beforeRow,
  afterRow,
  rowCount,
  committedActionPreserved: true,
  remoteStateClaimed: false,
}, null, 2));
