import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { createBookRouter } from '../../cloudflare/src/upload-worker/book-router';
import { createProductionBookAssemblyRouteOptions } from '../../cloudflare/src/upload-worker/book-assembly/production-composition';
import { BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH, MATERIAL_BOOK_PATH } from '../../cloudflare/src/upload-worker/book-assembly/book-source-authority-reader';

const port = Number(process.env.TICKET90_FIXTURE_PORT ?? 8790);
const teacher = 'teacher-1', student = 'student-1', book = 'ticket90-book', unit = 'unit-1';
const account = 'account-1', source = 'full', sourceVersion = 'source-v1';
const op = (tail: string) => `123e4567-e89b-42d3-a456-426614174${tail}`;
const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const service = (name: string) => JSON.stringify({ client_email: `${name}@example.test`, private_key: pem });
const tree: Record<string, unknown> = {};
const firestore = new Map<string, { fields: Record<string, unknown>; updateTime: string }>();
const etags = new Map<string, number>();
const trace: string[] = [];
let tick = 0;
const time = () => new Date(Date.now() + ++tick * 1000).toISOString();
const parts = (path: string) => path.split('/').filter(Boolean);
const get = (path: string): unknown => parts(path).reduce<unknown>((node, part) =>
  node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>)[part] : undefined, tree) ?? null;
const put = (path: string, value: unknown) => {
  const segments = parts(path); let parent = tree;
  for (const part of segments.slice(0, -1)) {
    if (!parent[part] || typeof parent[part] !== 'object') parent[part] = {};
    parent = parent[part] as Record<string, unknown>;
  }
  parent[segments.at(-1)!] = structuredClone(value);
};
const wire = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(wire);
  return Object.fromEntries(Object.entries(value).flatMap(([name, child]) => {
    const encoded = wire(child);
    return encoded === null || encoded === undefined || Array.isArray(encoded) && !encoded.length ? [] : [[name, encoded]];
  }));
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture-oauth', expires_in: 3600 });
  if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ idToken: 'fixture-firebase-token', expiresIn: '3600' });
  if (url.hostname === 'firestore.googleapis.com') {
    const path = decodeURIComponent(url.pathname.split('/documents/')[1] ?? '');
    const current = firestore.get(path), method = init?.method ?? 'GET';
    if (method === 'GET') return current ? Response.json(current) : new Response('', { status: 404 });
    if (method !== 'PATCH') return new Response('', { status: 405 });
    if (url.searchParams.get('currentDocument.exists') === 'false' && current) return new Response('', { status: 409 });
    if (url.searchParams.has('currentDocument.updateTime') && url.searchParams.get('currentDocument.updateTime') !== current?.updateTime) return new Response('', { status: 409 });
    firestore.set(path, { fields: (JSON.parse(String(init?.body ?? '{}')) as { fields: Record<string, unknown> }).fields, updateTime: time() });
    return Response.json(firestore.get(path));
  }
  if (url.hostname !== 'firebase.test') return realFetch(input, init);
  const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
  const method = init?.method ?? 'GET', headers = new Headers(init?.headers);
  const etag = `"${etags.get(path) ?? 0}"`;
  let response: Response;
  if (method === 'GET') response = new Response(JSON.stringify(get(path)), { headers: { etag } });
  else if (method === 'PUT') {
    if (headers.get('if-match') !== etag) response = new Response('', { status: 412 });
    else { put(path, wire(JSON.parse(String(init?.body ?? 'null')))); etags.set(path, (etags.get(path) ?? 0) + 1); response = Response.json({}); }
  } else if (method === 'PATCH') {
    for (const [relative, value] of Object.entries(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)) put(`${path}/${relative}`, wire(value));
    etags.set(path, (etags.get(path) ?? 0) + 1); response = Response.json({});
  } else response = new Response('', { status: 405 });
  trace.push(`${method} ${path} ${response.status}`);
  return response;
};

const env = {
  FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: 'fixture-project', FIREBASE_WEB_API_KEY: 'fixture-key',
  GOOGLE_SA_KEY: service('shared'), BOOK_SOURCE_UPLOAD_ACCOUNT_ID: account,
  BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: 'activity-renderer-manifest-v1@sha256:649910eeb4ce46bc89e246ec4bcb7df883a0aae5da4fdbf2bc66d3bc3f9f1831',
  BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.test', BOOK_ASSEMBLY_GOOGLE_SA_KEY: service('assembly'),
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@example.test', BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: service('authoring'),
  BOOK_HOMEWORK_SERVICE_IDENTITY: 'homework@example.test', BOOK_HOMEWORK_GOOGLE_SA_KEY: service('homework'),
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.test', BOOK_DELIVERY_GOOGLE_SA_KEY: service('delivery'),
  BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test', BOOK_RUNTIME_GOOGLE_SA_KEY: service('runtime'),
  BOOK_RESULT_READ_SERVICE_IDENTITY: 'results@example.test', BOOK_RESULT_READ_GOOGLE_SA_KEY: service('results'),
  BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'grading@example.test', BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: service('grading'),
  BOOK_ASSEMBLY_ROUTES_ENABLED: 'enabled', BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true', BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED: 'enabled',
  BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled', BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
  BOOK_HOMEWORK_ROUTES_ENABLED: 'enabled', BOOK_HOMEWORK_READ_ROUTES_ENABLED: 'enabled', BOOK_RUNTIME_ROUTES_ENABLED: 'enabled',
  BOOK_RESULT_READ_ROUTES_ENABLED: 'enabled', BOOK_RESULT_PROJECTION_ENABLED: 'enabled', BOOK_EVALUATION_HISTORY_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'enabled', BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test', BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'ticket90', issuedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), actions: { create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny', 'launch-delivery': 'deny', mutation: 'allow' } }),
};
const worker = createBookRouter({ routeHandlers: createProductionBookAssemblyRouteOptions(), firebaseVerifier: {
  verifyAuthorizationHeader: async (header: string | null) => ({ valid: Boolean(header), uid: header?.includes('student') ? student : teacher }),
} });
const call = async (path: string, body: unknown, actor: 'teacher' | 'student' = 'teacher') => {
  const response = await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST',
    headers: { origin: `http://localhost:${actor === 'teacher' ? 5173 : 5174}`, authorization: `Bearer ${actor}-token`, 'content-type': 'application/json', 'idempotency-key': 'ticket90-key' },
    body: JSON.stringify(body),
  }), env);
  const value = await response.json() as Record<string, unknown>;
  if (response.status >= 400) throw new Error(`${path} ${response.status} ${JSON.stringify(value)}\n${trace.slice(-12).join('\n')}`);
  return value;
};

const sourceSet = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: source, sourceVersionId: sourceVersion, sourceOrder: 1 }] };
const kinds = ['subjective', 'objective'] as const;
const manifest = { bookId: book, sourceSet, nodes: [{ nodeKey: unit, parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{ unitKey: unit, activitySlots: kinds.map((kind, index) => ({ activityKey: kind, order: index + 1, contextRequirement: 'required', pageGroupKeys: [`pages-${kind}`] })),
    pageGroups: kinds.map((kind) => ({ pageGroupKey: `pages-${kind}`, sourceKey: source, pages: [1], activityKeys: [kind], mode: 'activity' })) }] };
put(`users/${teacher}`, { role: 'teacher', status: 'active' });
put(`users/${student}`, { role: 'student', status: 'active' });
put('classes/class-1', { classId: 'class-1', ownerId: teacher, status: 'active', members: [{ studentId: student, status: 'active' }] });
put(MATERIAL_BOOK_PATH(book), { bookId: book, ownerId: teacher, bookMode: 'pdf', status: 'ready', bookRevision: 1, sourceSetRevision: 1, sourceSet });
put(BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(account, book, sourceVersion), { ownerId: teacher, bookId: book, sourceKey: source, sourceVersionId: sourceVersion,
  physicalPageCount: 1, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'ready', checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  studentSafeDecision: { decidedBy: teacher, decidedAt: time(), sourceVersionId: sourceVersion, sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' } });

const setup = async () => {
  const created = await call(`/book-assembly/books/${book}/units/${unit}/candidates`, { operationId: op('001'), bookId: book, unitKey: unit, expectedBookRevision: 1, expectedSourceSetRevision: 1, manifest });
  const candidateId = String((created.candidate as Record<string, unknown>).candidateId);
  const path = `/book-assembly/books/${book}/units/${unit}/candidates/${candidateId}`;
  await call(`${path}/validate`, { operationId: op('002'), bookId: book, unitKey: unit, candidateId, expectedCandidateRevision: 1 });
  for (const [index, kind] of kinds.entries()) {
    const subjective = kind === 'subjective';
    const staged = await call('/book-activity-authoring/stage', { operationId: op(`01${index}`), expectedRevision: 0, bookId: book,
      targetActivityId: `ba_${Buffer.from(book).toString('hex')}_${Buffer.from(kind).toString('hex')}`, unitActivityBinding: { unitKey: unit, activityKey: kind },
      content: { schemaVersion: 1, title: subjective ? 'Subjective Activity' : 'Objective Activity', taskProfile: null, presentationMode: 'source-assisted',
        contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Answer.' }], stimulus: null, assetRefs: [],
        interaction: subjective ? { family: 'long-response', variant: 'essay' } : { family: 'choice', variant: 'single' },
        answerRule: subjective ? { defaultPoints: 2, normalization: 'exact' } : { defaultPoints: 2, normalization: 'exact', requiredSelectionCount: 1 },
        interactions: subjective ? [{ prompt: 'Explain.', sourceAssisted: { questionLabel: 'Question 1', accessiblePrompt: 'Explain the source.', responseShape: 'long-response', sourceExerciseLabel: 'Exercise 1' } }]
          : [{ prompt: 'Choose A.', options: ['A', 'B'], acceptedOptionIndexes: [0], sourceAssisted: { questionLabel: 'Question 1', accessiblePrompt: 'Choose A.', responseShape: 'single-choice', sourceExerciseLabel: 'Exercise 1' } }],
        scoring: { mode: subjective ? 'review-required' : 'auto-where-possible' } },
    });
    const activityCandidateId = String(staged.candidateId);
    await call('/book-activity-authoring/validate', { operationId: op(`02${index}`), candidateId: activityCandidateId, expectedRevision: 1, unitActivityBinding: { unitKey: unit, activityKey: kind } });
    await call('/book-activity-authoring/save-draft', { operationId: op(`03${index}`), candidateId: activityCandidateId, expectedRevision: 2, unitActivityBinding: { unitKey: unit, activityKey: kind } });
  }
  await call(`${path}/preview`, { expectedCandidateRevision: 2 });
  const approval = (await call(`${path}/approve`, { expectedCandidateRevision: 2 })).approval as Record<string, unknown>;
  return (await call('/book-assembly/full-pdf-publications', { bookId: book, unitKey: unit, candidateId, expectedCandidateRevision: 2,
    expectedCurrentPublicationId: null, expectedBookRevision: 1, expectedSourceSetRevision: 1,
    previewApproval: { approvalId: approval.approvalId, approvalRevision: approval.approvalRevision, approvedAt: approval.approvedAt, expiresAt: approval.expiresAt } })).result;
};
const published = await setup();
const headers = (origin?: string) => ({ 'access-control-allow-origin': origin === 'http://localhost:5173' ? origin : 'http://localhost:5174',
  'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' });
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  const send = (status: number, value: unknown) => { response.writeHead(status, headers(request.headers.origin)); response.end(JSON.stringify(value)); };
  if (request.method === 'OPTIONS') return send(200, {});
  if (url.pathname === '/__health') return send(200, { ready: true });
  if (url.pathname === '/__ticket90/publication') return send(200, published);
  const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const actor = request.headers.authorization?.includes('student') ? 'student' : 'teacher';
  const upstream = await worker.fetch(new Request(`https://worker.test${url.pathname}${url.search}`, { method: request.method,
    headers: { origin: request.headers.origin ?? `http://localhost:${actor === 'teacher' ? 5173 : 5174}`, authorization: `Bearer ${actor}-token`,
      'content-type': request.headers['content-type'] ?? 'application/json', 'idempotency-key': request.headers['idempotency-key'] ?? 'ticket90-key' },
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }), env);
  send(upstream.status, await upstream.json());
});
server.listen(port, 'localhost', () => console.log(JSON.stringify({ ready: true, origin: `http://localhost:${port}`, published })));
