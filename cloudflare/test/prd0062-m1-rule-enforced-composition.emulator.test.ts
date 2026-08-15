import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { exportJWK, importPKCS8, SignJWT } from 'jose';
import { createUploadWorker } from '../worker.js';
import { bookActivityRendererRegistry } from '../../src/services/book-activity/runtime/activityRendererRegistry';
import fixture from '../../tmp/prd0062-bridge-m1-committed-state-fixture.json';
import publication from '../../tmp/prd0062-converged-publication.json';

const projectId = 'demo-prd0062-m1-rule-enforced';
const ownerId = 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2';
const studentId = fixture.recipientId;
const assignmentId = fixture.assignmentId;
const authorityId = fixture.authorityId;
const bindingId = fixture.bindingId;
const bookId = 'book-vocab-u1-d43935c735245dc8';
const placementId = fixture.deliveryScope.records[bindingId].binding.placements[0].placementId;
const databaseRules = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const activationRuleHashes = {
  database: 'e16df0c49724ca9a5f1c4fe886115f5b3ef3ddc5fe7bedf0a92d433454feca2f',
  firestore: '3322ddc1f4977f2063e0251c7921a3e19f8f463b9f8d92c06f13e7d679b519bc',
};
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

type Claims = Record<string, unknown>;
type Trace = {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly uid: string | null;
  readonly claims: Claims | null;
};

const jsonSegment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const decodePayload = (token: string): Claims => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Claims;
const emulatorToken = (uid: string, claims: Claims): string => {
  const now = Math.floor(Date.now() / 1_000);
  return `${jsonSegment({ alg: 'none', typ: 'JWT' })}.${jsonSegment({
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: now,
    iat: now,
    exp: now + 3_600,
    sub: uid,
    user_id: uid,
    firebase: { identities: {}, sign_in_provider: 'custom' },
    ...claims,
  })}.`;
};

const decodeFirestoreValue = (value: any): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {})
    .map(([key, child]) => [key, decodeFirestoreValue(child)]));
  throw new Error('invalid_firestore_fixture');
};
const decodeFirestoreFields = (fields: Record<string, any>): Record<string, any> => (
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]))
);
const firebaseWireValue = (value: any): any => {
  if (Array.isArray(value)) return value.length === 0 ? null : value.map(firebaseWireValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== null)
    .map(([key, child]) => [key, firebaseWireValue(child)]));
};

const compatibilityShell = {
  schemaVersion: 1,
  assignmentKind: 'book_homework_compatibility',
  id: assignmentId,
  createdBy: ownerId,
  createdAt: 1_786_709_204_227,
  updatedAt: 1_786_709_204_227,
  materialId: 'book-vocab-u1-d43935c735245dc8',
  materialTitle: 'Vocabulary U1',
  materialType: 'book',
  materialSkill: 'mixed',
  title: 'Vocabulary U1',
  target: { type: 'students', studentIds: [studentId] },
  scheduling: { dueDate: 1_787_270_400_000 },
  config: { timerMinutes: null, maxAttempts: null, feedbackTiming: 'never', lateSubmissionAllowed: false },
  visibility: { showTimer: false, showAttempts: false, showDueDate: true, showQuestionCount: false, showDuration: false },
  archived: false,
  tags: [],
  bookHomeworkCompatibility: { schemaVersion: 1, assignmentId, sourceSagaRevision: 7, sourceFingerprint: fixture.root.fingerprint },
};

const serviceKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const servicePrivateKey = serviceKeyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const serviceAccount = (email: string): string => JSON.stringify({ client_email: email, private_key: servicePrivateKey });
const userKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const userPrivateKey = userKeyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const userPublicJwk = exportJWK(createPublicKey(userPrivateKey));
const serviceIdentities = {
  homework: `book-homework-runtime@${projectId}.iam.gserviceaccount.com`,
  runtime: `book-runtime-runtime@${projectId}.iam.gserviceaccount.com`,
  delivery: `book-delivery-runtime@${projectId}.iam.gserviceaccount.com`,
  assembly: `book-assembly-p2-runtime@${projectId}.iam.gserviceaccount.com`,
};

const env = {
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_DB_URL: 'https://firebase.test',
  FIREBASE_WEB_API_KEY: 'emulator-web-key',
  BOOK_HOMEWORK_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_READ_ROUTES_ENABLED: 'enabled',
  BOOK_DELIVERY_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_SERVICE_IDENTITY: serviceIdentities.homework,
  BOOK_HOMEWORK_GOOGLE_SA_KEY: serviceAccount(serviceIdentities.homework),
  BOOK_HOMEWORK_COMPATIBILITY_SERVICE_IDENTITY: serviceIdentities.homework,
  BOOK_HOMEWORK_COMPATIBILITY_GOOGLE_SA_KEY: serviceAccount(serviceIdentities.homework),
  BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'enabled',
  BOOK_RUNTIME_SERVICE_IDENTITY: serviceIdentities.runtime,
  BOOK_RUNTIME_GOOGLE_SA_KEY: serviceAccount(serviceIdentities.runtime),
  BOOK_DELIVERY_SERVICE_IDENTITY: serviceIdentities.delivery,
  BOOK_DELIVERY_GOOGLE_SA_KEY: serviceAccount(serviceIdentities.delivery),
  BOOK_ASSEMBLY_SERVICE_IDENTITY: serviceIdentities.assembly,
  BOOK_ASSEMBLY_GOOGLE_SA_KEY: serviceAccount(serviceIdentities.assembly),
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'production',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1', environment: 'production', revision: 'prd0062-m1-rule-enforced',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    teacherId: ownerId, bookId, assignmentId, studentIds: [studentId], maxStudents: 30,
  }),
  BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
};

const exchanges = new Map<string, { uid: string; claims: Claims }>();
const traces: Trace[] = [];
let completionReadUnavailable = false;
const realFetch = globalThis.fetch.bind(globalThis);
const firebaseRulesGateway: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'www.googleapis.com') {
    return Response.json({ keys: [{ ...(await userPublicJwk), alg: 'RS256', kid: 'm1-user', use: 'sig' }] });
  }
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    const customToken = JSON.parse(String(init?.body ?? '{}')).token;
    if (typeof customToken !== 'string') return new Response(null, { status: 400 });
    const payload = decodePayload(customToken);
    const uid = typeof payload.uid === 'string' ? payload.uid : typeof payload.sub === 'string' ? payload.sub : '';
    const claims = payload.claims && typeof payload.claims === 'object' && !Array.isArray(payload.claims)
      ? payload.claims as Claims : {};
    const idToken = emulatorToken(uid, claims);
    exchanges.set(idToken, { uid, claims });
    return Response.json({ idToken, refreshToken: 'test-only', expiresIn: '3600' });
  }
  if (url.hostname !== 'firebase.test' && url.hostname !== 'firestore.googleapis.com') {
    return new Response(null, { status: 599 });
  }
  const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/u, '') ?? url.searchParams.get('auth');
  const actor = token ? exchanges.get(token) ?? null : null;
  const target = url.hostname === 'firestore.googleapis.com'
    ? new URL(`http://${firestoreHost}${url.pathname}${url.search}`)
    : new URL(`http://${databaseHost}${url.pathname}${url.search}`);
  if (url.hostname === 'firebase.test') target.searchParams.set('ns', projectId);
  if (completionReadUnavailable && url.pathname.startsWith('/book_runtime/homework_completion/')) {
    traces.push({ method: String(init?.method ?? 'GET').toUpperCase(), path: decodeURIComponent(url.pathname), status: 503, uid: actor?.uid ?? null, claims: actor?.claims ?? null });
    return new Response(null, { status: 503 });
  }
  const response = await realFetch(target, init);
  traces.push({ method: String(init?.method ?? 'GET').toUpperCase(), path: decodeURIComponent(url.pathname), status: response.status, uid: actor?.uid ?? null, claims: actor?.claims ?? null });
  return response;
};

const userToken = async (uid: string): Promise<string> => new SignJWT({ email_verified: true })
  .setProtectedHeader({ alg: 'RS256', kid: 'm1-user' })
  .setIssuer(`https://securetoken.google.com/${projectId}`)
  .setAudience(projectId)
  .setSubject(uid)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(await importPKCS8(userPrivateKey, 'RS256'));

const invoke = async (worker: ReturnType<typeof createUploadWorker>, path: string, token: string, init: RequestInit = {}) => {
  const response = await worker.fetch(new Request(`https://worker.test${path}`, {
    ...init,
    headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  }), env);
  return { status: response.status, body: await response.json() as Record<string, any> };
};

const expectClaim = (trace: Trace, uid: string, claims: Claims): void => {
  expect(trace.uid).toBe(uid);
  expect(trace.claims).toEqual(expect.objectContaining(claims));
};

describe('PRD0062 M1 default Worker composition under exact activation rules', () => {
  let rules: RulesTestEnvironment;
  let worker: ReturnType<typeof createUploadWorker>;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    rules = await initializeTestEnvironment({ projectId, database: { rules: databaseRules }, firestore: { rules: firestoreRules } });
  });

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    await rules.clearDatabase();
    await rules.clearFirestore();
    await rules.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update({
        [`users/${ownerId}`]: { role: 'teacher', status: 'active', forceReauth: false },
        [`users/${studentId}`]: { role: 'student', status: 'active', forceReauth: false },
        [`classes/2NE3KY`]: { id: '2NE3KY', teacherId: ownerId, studentIds: [studentId], status: 'active' },
        [`student_classes/${studentId}/2NE3KY`]: { joinedAt: 1_772_983_529_130, status: 'active' },
        [`book_homework/operations/${assignmentId}`]: fixture.root,
        [`book_delivery/indexes/bindings/${bindingId}`]: fixture.deliveryIndex,
        [`book_delivery/scopes/${studentId}/${assignmentId}`]: fixture.deliveryScope,
        [`book_assembly_publications/books/${bookId}`]: firebaseWireValue(publication),
        [`book_activity/versions/${fixture.activityId}/${fixture.activityVersionId}`]: fixture.canonicalActivity,
        [`book_activity/student_safe_projections/${fixture.activityId}/${fixture.activityVersionId}`]: fixture.studentSafeProjection,
      });
      await context.firestore().doc(`book_homework_authorities/${authorityId}`).set(decodeFirestoreFields(fixture.authorityDocument.fields));
      await context.firestore().doc(`homework_assignments/${assignmentId}`).set(compatibilityShell);
    });
    exchanges.clear();
    traces.length = 0;
    completionReadUnavailable = false;
    globalThis.fetch = firebaseRulesGateway;
    worker = createUploadWorker();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await rules.cleanup();
  });

  it('executes the full shell-present teacher/student/Runtime read path without any command or durable write', async () => {
    expect(createHash('sha256').update(databaseRules).digest('hex')).toBe(activationRuleHashes.database);
    expect(createHash('sha256').update(firestoreRules).digest('hex')).toBe(activationRuleHashes.firestore);
    expect(fixture.root).toMatchObject({ state: 'committed', visibility: 'committed', revision: 7 });
    expect(decodeFirestoreFields(fixture.authorityDocument.fields)).toMatchObject({ revision: 2 });
    expect(fixture.deliveryScope.records[bindingId]).toMatchObject({ status: 'active', binding: { revision: 1 } });
    expect(compatibilityShell).toMatchObject({ assignmentKind: 'book_homework_compatibility', bookHomeworkCompatibility: { sourceSagaRevision: 7 } });
    const teacher = await userToken(ownerId);
    const student = await userToken(studentId);
    const aggregate = await invoke(worker, `/book-homework/assignments/${assignmentId}/teacher-projection`, teacher);
    const teacherStudent = await invoke(worker, `/book-homework/assignments/${assignmentId}/students/${studentId}/projection`, teacher);
    const studentProjection = await invoke(worker, `/book-homework/assignments/${assignmentId}/student-projection`, student);
    const delivery = await invoke(worker, `/book-delivery/current/${studentId}/${assignmentId}`, student);
    const launch = await invoke(worker, `/book-homework/assignments/${assignmentId}/launch`, student, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placementIds: [placementId] }),
    });

    expect(aggregate).toMatchObject({ status: 200, body: { assignmentId, students: [{ studentId }] } });
    expect(aggregate.body.students[0].completion).not.toBeUndefined();
    expect(teacherStudent).toMatchObject({ status: 200, body: { assignmentId, completion: { recipientId: studentId, contextId: assignmentId } } });
    expect(studentProjection).toMatchObject({ status: 200, body: { assignmentId, completion: { recipientId: studentId, contextId: assignmentId } } });
    expect(delivery).toMatchObject({ status: 200, body: { projectionKind: 'book-runtime-delivery', activities: [{ placementId }] } });
    expect(launch).toMatchObject({ status: 200, body: { activities: [{ activityId: fixture.activityId, activityVersionId: fixture.activityVersionId }] } });
    expect(bookActivityRendererRegistry.resolve(launch.body.activities[0].projection, {
      surface: 'student-runtime', mode: delivery.body.actionFlags.canAutosave ? 'editable' : 'read-only', sourceContext: delivery.body.activities[0].sourceContext,
    })).toMatchObject({ supported: true });

    expect(traces).not.toEqual([]);
    expect(traces.every((trace) => trace.method === 'GET' && trace.status === 200 && trace.uid !== null && trace.claims !== null)).toBe(true);
    expect(traces.some((trace) => trace.path.includes('/commands'))).toBe(false);
    expect(traces.some((trace) => trace.path.includes(`/homework_assignments/${assignmentId}`))).toBe(false);
    const homeworkReads = traces.filter((trace) => trace.path === `/book_homework/operations/${assignmentId}.json`);
    expect(homeworkReads.length).toBeGreaterThan(0);
    homeworkReads.forEach((trace) => expectClaim(trace, ownerId, { book_homework_service: true, book_homework_ownerId: ownerId }));
    const authorityReads = traces.filter((trace) => trace.path.endsWith(`/documents/book_homework_authorities/${authorityId}`));
    expect(authorityReads.length).toBeGreaterThan(0);
    authorityReads.forEach((trace) => expectClaim(trace, ownerId, {
      book_homework_authority_service: true, book_homework_authority_authorityId: authorityId,
      book_homework_authority_assignmentId: assignmentId, book_homework_authority_ownerId: ownerId,
    }));
    const deliveryReads = traces.filter((trace) => trace.path.startsWith(`/book_delivery/scopes/${studentId}/${assignmentId}/`));
    expect(deliveryReads.length).toBeGreaterThan(0);
    deliveryReads.forEach((trace) => expectClaim(trace, studentId, {
      book_delivery_service: true, book_delivery_recipientId: studentId, book_delivery_contextId: assignmentId,
    }));
  });

  it('fails closed for crossed authority claims and a mismatched binding revision without mutating emulator state', async () => {
    const crossedAuthority = rules.authenticatedContext(ownerId, {
      book_homework_authority_service: true,
      book_homework_authority_authorityId: authorityId,
      book_homework_authority_assignmentId: `${assignmentId}-crossed`,
      book_homework_authority_ownerId: ownerId,
    }).firestore();
    await assertFails(crossedAuthority.doc(`book_homework_authorities/${authorityId}`).get());
    await rules.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`book_delivery/scopes/${studentId}/${assignmentId}/records/${bindingId}/binding/revision`).set(2);
    });
    const result = await invoke(worker, `/book-homework/assignments/${assignmentId}/student-projection`, await userToken(studentId));
    expect(result).toMatchObject({ status: 404, body: { code: 'book_homework_not_found' } });
    expect(traces.every((trace) => trace.method === 'GET')).toBe(true);
  });

  it('retains the committed recipient row when only derived completion is unavailable', async () => {
    completionReadUnavailable = true;
    const aggregate = await invoke(worker, `/book-homework/assignments/${assignmentId}/teacher-projection`, await userToken(ownerId));
    expect(aggregate).toEqual({
      status: 200,
      body: { assignmentId, students: [{ studentId, completion: null }] },
    });
    const unavailableRead = traces.find((trace) => trace.path.startsWith(`/book_runtime/homework_completion/${studentId}/${assignmentId}`));
    expect(unavailableRead).toBeDefined();
    expectClaim(unavailableRead!, studentId, {
      book_runtime_service: true,
      book_runtime_recipientId: studentId,
      book_runtime_contextId: assignmentId,
    });
    expect(traces.filter((trace) => trace.status !== 503).every((trace) => trace.method === 'GET')).toBe(true);
  });
});
