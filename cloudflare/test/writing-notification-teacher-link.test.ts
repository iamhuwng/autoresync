import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import activeWorker from '../notification-release/notification-command-entry.js';

/**
 * The Writing notification Worker authorizes teacher<->student relationships from
 * active `student_teacher_assignments` rows only. A stale denormalized
 * `student_teacher_links` entry (left behind by an interrupted release) must never
 * authorize a "submitted to teacher" notification.
 */

const PROJECT_ID = 'demo-writing-link';
const DB_URL = 'https://rtdb.writing-link.test';
const KID = 'writing-link-test-kid';
const SERVICE_IDENTITY = 'notification-command@demo-writing-link.iam.gserviceaccount.com';

const TEACHER_ID = 'teacher-1';
const STUDENT_ID = 'student-1';
const SUBMISSION_ID = 'sub-1';
const EVENT_ID = `writing-${SUBMISSION_ID}-submitted-teacher`;
const SUBMITTED_AT = 1_700_000_000_000;

const textEncoder = new TextEncoder();
const toBase64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  view.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const toBase64Url = (bytes: ArrayBuffer | Uint8Array): string =>
  toBase64(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

let publicJwk: JsonWebKey;
let idTokenKey: CryptoKey;
let serviceAccountKey: string;

const generateRsaKey = () => crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
) as Promise<CryptoKeyPair>;

const signIdToken = async (uid: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(textEncoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID })));
  const payload = toBase64Url(textEncoder.encode(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    iat: now,
    exp: now + 3600,
  })));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    idTokenKey,
    textEncoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${toBase64Url(signature)}`;
};

beforeAll(async () => {
  const idPair = await generateRsaKey();
  idTokenKey = idPair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', idPair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

  const servicePair = await generateRsaKey();
  const pkcs8 = toBase64(await crypto.subtle.exportKey('pkcs8', servicePair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/gu)?.join('\n')}\n-----END PRIVATE KEY-----`;
  serviceAccountKey = JSON.stringify({ client_email: SERVICE_IDENTITY, private_key: pem });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type AssignmentRow = { teacherId: string; studentId: string; status: string };

const field = {
  string: (stringValue: string) => ({ stringValue }),
  integer: (value: number) => ({ integerValue: String(value) }),
  map: (fields: Record<string, unknown>) => ({ mapValue: { fields } }),
};

const firestoreIntent = {
  name: `projects/${PROJECT_ID}/databases/(default)/documents/writing_notification_intents/${EVENT_ID}`,
  updateTime: '2026-01-01T00:00:00.000000Z',
  fields: {
    schemaVersion: field.integer(1),
    kind: field.string('writing-submitted-teacher'),
    eventId: field.string(EVENT_ID),
    occurrenceId: field.string(EVENT_ID),
    authorityRecordId: field.string(SUBMISSION_ID),
    actorUid: field.string(STUDENT_ID),
    occurredAt: field.integer(SUBMITTED_AT),
    dueAt: field.integer(SUBMITTED_AT + 3_600_000),
    attempts: field.integer(1),
    state: field.string('retry_due'),
  },
};

const firestoreSubmission = {
  name: `projects/${PROJECT_ID}/databases/(default)/documents/writing_submissions/${SUBMISSION_ID}`,
  fields: {
    id: field.string(SUBMISSION_ID),
    studentId: field.string(STUDENT_ID),
    submittedAt: field.integer(SUBMITTED_AT),
    context: field.map({
      type: field.string('solo-practice'),
      selectedTeacherId: field.string(TEACHER_ID),
    }),
  },
};

const deliver = async (assignments: Record<string, AssignmentRow> | null) => {
  const requested: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    requested.push(url);
    if (url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/securetoken')) {
      return Response.json({ keys: [publicJwk] });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'service-access-token', expires_in: 3600 });
    }
    if (url.startsWith('https://firestore.googleapis.com/')) {
      if (url.includes(`/writing_notification_intents/${EVENT_ID}`)) return Response.json(firestoreIntent);
      if (url.includes(`/writing_submissions/${SUBMISSION_ID}`)) return Response.json(firestoreSubmission);
      return new Response('{}', { status: 404 });
    }
    if (url.startsWith(`${DB_URL}/student_teacher_assignments.json`)) {
      return Response.json(assignments);
    }
    // Any other RTDB request (notification inbox writes, stale link reads) is unavailable.
    return new Response('{}', { status: 500 });
  });

  const response = await activeWorker.fetch(
    new Request('https://worker.test/writing-notifications/actions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await signIdToken(STUDENT_ID)}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': EVENT_ID,
      },
      body: JSON.stringify({
        schemaVersion: 1,
        actionType: 'writing-notification',
        eventId: EVENT_ID,
        submissionId: SUBMISSION_ID,
      }),
    }),
    {
      NOTIFICATION_RETRY_BATCH: 'all',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_DB_URL: DB_URL,
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: SERVICE_IDENTITY,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: serviceAccountKey,
      NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    },
  );
  return { response, body: await response.json() as { status?: string }, requested };
};

const assignmentQueryRequests = (requested: string[]) => requested.filter((url) =>
  url.startsWith(`${DB_URL}/student_teacher_assignments.json`));

describe('Writing notification teacher-link authorization', () => {
  it('queries the indexed active assignment rows and proceeds for an active teacher-student assignment', async () => {
    const { response, body, requested } = await deliver({
      'assign-1': { teacherId: TEACHER_ID, studentId: STUDENT_ID, status: 'active' },
    });

    // Authorized: the Worker gets past the link gate and attempts delivery (the inbox
    // write is unavailable in this harness, so the intent stays retryable).
    expect(response.status).toBe(503);
    expect(body.status).toBe('retry_due');

    const queries = assignmentQueryRequests(requested);
    expect(queries).toHaveLength(1);
    const query = new URL(queries[0]).searchParams;
    expect(JSON.parse(query.get('orderBy') ?? 'null')).toBe('teacherId');
    expect(JSON.parse(query.get('equalTo') ?? 'null')).toBe(TEACHER_ID);
    expect(requested.some((url) => url.includes('student_teacher_links'))).toBe(false);
  });

  it.each([
    ['a released (removed) assignment', { 'assign-1': { teacherId: TEACHER_ID, studentId: STUDENT_ID, status: 'removed' } }],
    ['an assignment for another student', { 'assign-1': { teacherId: TEACHER_ID, studentId: 'student-2', status: 'active' } }],
    ['a missing assignment', null],
  ])('rejects the notification for %s and never trusts a stale student_teacher_links entry', async (_label, assignments) => {
    const { response, body, requested } = await deliver(assignments);

    expect(response.status).toBe(403);
    expect(body.status).toBe('forbidden');
    expect(assignmentQueryRequests(requested)).toHaveLength(1);
    expect(requested.some((url) => url.includes('student_teacher_links'))).toBe(false);
  });
});
