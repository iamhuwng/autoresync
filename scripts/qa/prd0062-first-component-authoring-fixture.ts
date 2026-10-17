import { createServer } from 'node:http';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { exportJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { createUploadWorker } from '../../cloudflare/worker.js';
import { reconcileProviderTotals } from '../../cloudflare/src/book-source-worker/provider-reconciliation';
import { validateBookSourceUploadAccountState } from '../../src/services/book-source-delivery/sourceUpload.rtdbRepository';

// External Firebase Auth/RTDB and B2 bytes only. All Book authority is written by createBookDraft or default Workers.
const port = Number(process.env.FIRST_COMPONENT_FIXTURE_PORT ?? 8791);
const ownerId = 'teacher-1';
const projectId = 'first-component-fixture';
const accountId = 'first-component-account';
const tree: Record<string, unknown> = { users: { [ownerId]: { role: 'teacher', status: 'active' } } };
const revisions = new Map<string, number>();
const objects = new Map<string, { bytes: Uint8Array; versionId: string; checksum: string }>();
// Provision only the empty external account prerequisite allowed by PlanMD §2.
tree.book_source_upload_accounts = { [accountId]: validateBookSourceUploadAccountState({
  revision: 0, operations: {}, capacity: { trackedAccountBytes: 0, temporaryBytes: 0,
    providerReconciliation: reconcileProviderTotals({ expected: { totalBytes: 0, objectCount: 0 },
      observed: { totalBytes: [...objects.values()].reduce((total, object) => total + object.bytes.length, 0), objectCount: objects.size },
      completedAt: new Date().toISOString() }),
  },
}) };
const trace: string[] = [];
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicPem = keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const jwtKey = await importPKCS8(privatePem, 'RS256');
const jwk = await exportJWK(createPublicKey(publicPem));
jwk.kid = 'first-component-fixture-key';
const service = (name: string) => JSON.stringify({ client_email: `${name}@example.iam.gserviceaccount.com`, private_key: privatePem });
const idToken = await new SignJWT({ email: 'teacher@example.test', email_verified: true, auth_time: Math.floor(Date.now() / 1000) })
  .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(`https://securetoken.google.com/${projectId}`)
  .setAudience(projectId).setSubject(ownerId).setIssuedAt().setExpirationTime('1h').sign(jwtKey);
const customToken = await new SignJWT({ uid: ownerId })
  .setProtectedHeader({ alg: 'RS256' }).setIssuer('fixture@example.iam.gserviceaccount.com')
  .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
  .setIssuedAt().setExpirationTime('1h').sign(jwtKey);
const parts = (path: string) => path.split('/').filter(Boolean);
const read = (path: string): unknown => parts(path).reduce<unknown>((node, part) =>
  node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>)[part] : undefined, tree) ?? null;
const write = (path: string, value: unknown) => {
  const keys = parts(path);
  let parent = tree;
  for (const key of keys.slice(0, -1)) {
    if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
    parent = parent[key] as Record<string, unknown>;
  }
  if (value === null) delete parent[keys.at(-1)!];
  else parent[keys.at(-1)!] = structuredClone(value);
  revisions.set(path, (revisions.get(path) ?? 0) + 1);
};
const firebaseWire = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(firebaseWire);
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const next = firebaseWire(child);
    return next === null || Array.isArray(next) && next.length === 0 ? [] : [[key, next]];
  }));
};
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const b2Capabilities = (upload: boolean) => upload
  ? ['deleteFiles', 'listBuckets', 'writeBucketEncryption', 'writeBucketLifecycleRules', 'writeBucketLogging', 'writeBucketNotifications', 'writeBucketReplications', 'writeFiles']
  : ['listBuckets', 'listFiles', 'readBucketEncryption', 'readBucketLifecycleRules', 'readBucketLogging', 'readBucketNotifications', 'readBucketReplications', 'readBuckets', 'shareFiles', 'readFiles'];
const providerFetch = async (url: URL, init: RequestInit = {}): Promise<Response> => {
  if (url.pathname.endsWith('/b2_authorize_account')) {
    const encoded = new Headers(init.headers).get('authorization')?.replace(/^Basic /u, '') ?? '';
    const upload = Buffer.from(encoded, 'base64').toString().startsWith('upload-key:');
    return json({ authorizationToken: 'fixture-b2-token', apiInfo: { storageApi: {
      apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com',
      allowed: { buckets: [{ id: 'book-pdfs', name: 'book-pdfs' }], capabilities: b2Capabilities(upload), namePrefix: 'book-source/' },
    } } });
  }
  if (url.pathname.endsWith('/b2_list_file_versions')) {
    const { prefix } = JSON.parse(String(init.body ?? '{}')) as { prefix: string };
    return json({ files: [...objects.entries()].filter(([key]) => key === prefix).map(([key, object]) => ({
      action: 'upload', fileName: key, fileId: object.versionId, contentLength: object.bytes.byteLength,
    })) });
  }
  if (url.pathname.endsWith('/b2_get_file_info')) {
    const entry = [...objects.entries()].find(([, object]) => object.versionId === url.searchParams.get('fileId'));
    if (!entry) return json({ code: 'not_found' }, 404);
    const [fileName, object] = entry;
    return json({ action: 'upload', bucketId: 'book-pdfs', contentLength: object.bytes.byteLength,
      contentType: 'application/pdf', fileId: object.versionId, fileName,
      fileInfo: { 'book-source-byte-size': String(object.bytes.byteLength), 'book-source-sha256': object.checksum } });
  }
  if (url.hostname === 's3.us-west-004.backblazeb2.com') {
    const key = decodeURIComponent(url.pathname.replace(/^\/book-pdfs\//u, ''));
    const object = objects.get(key);
    if (!object) return new Response('', { status: 404 });
    const range = new Headers(init.headers).get('range');
    const start = range?.startsWith('bytes=-') ? Math.max(0, object.bytes.length - Number(range.slice(7)))
      : range ? Number(range.match(/^bytes=(\d+)/u)?.[1] ?? 0) : 0;
    const end = range?.match(/-(\d+)$/u)?.[1];
    const last = range && !range.startsWith('bytes=-') && end ? Math.min(object.bytes.length - 1, Number(end)) : object.bytes.length - 1;
    const bytes = object.bytes.slice(start, last + 1);
    return new Response(bytes, { status: range ? 206 : 200, headers: {
      'content-range': `bytes ${start}-${last}/${object.bytes.length}`, 'content-length': String(bytes.length),
      'x-amz-version-id': object.versionId,
    } });
  }
  return json({ code: 'unknown_provider_request', path: url.pathname }, 500);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'fixture-oauth', expires_in: 3600 });
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
    if (!body.token) return json({ idToken, expiresIn: '3600' });
    try {
      const verified = await jwtVerify(body.token, keyPair.publicKey, {
        audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        issuer: acceptedCustomTokenIssuers,
      });
      const uid = typeof verified.payload.uid === 'string' ? verified.payload.uid : '';
      if (!uid) throw new Error('missing uid');
      const exchanged = await new SignJWT({ ...(verified.payload.claims as Record<string, unknown> ?? {}), auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'custom' } })
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(`https://securetoken.google.com/${projectId}`)
        .setAudience(projectId).setSubject(uid).setIssuedAt().setExpirationTime('1h').sign(jwtKey);
      return json({ idToken: exchanged, expiresIn: '3600' });
    } catch { return json({ error: { message: 'INVALID_CUSTOM_TOKEN' } }, 400); }
  }
  if (url.hostname === 'www.googleapis.com') return json({ keys: [jwk] });
  if (url.hostname.endsWith('backblazeb2.com')) return providerFetch(url, init);
  if (url.hostname !== 'firebase.test') return realFetch(input, init);
  const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const etag = `"${revisions.get(path) ?? 0}"`;
  let response: Response;
  if (method === 'GET') {
    const value = read(path);
    response = json(url.searchParams.get('shallow') === 'true' && value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).map((key) => [key, true])) : value, 200, { etag });
  } else if (method === 'PUT') {
    if (headers.get('if-match') && headers.get('if-match') !== etag) response = new Response('', { status: 412 });
    else { write(path, firebaseWire(JSON.parse(String(init?.body ?? 'null')))); response = json({}, 200, { etag: `"${revisions.get(path)}"` }); }
  } else if (method === 'PATCH') {
    const updates = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    for (const [relative, value] of Object.entries(updates)) write(`${path}/${relative}`, firebaseWire(value));
    response = json({});
  } else response = json({ code: 'method_not_allowed' }, 405);
  trace.push(`${method} ${path} ${response.status}`);
  return response;
};

const env = {
  FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: projectId, FIREBASE_WEB_API_KEY: 'fixture-key',
  GOOGLE_SA_KEY: service('shared'), BOOK_SOURCE_UPLOAD_ACCOUNT_ID: accountId,
  BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY: 'source@example.iam.gserviceaccount.com', BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY: service('source'),
  BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
  BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'b2_book_primary', BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'book-pdfs',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'book-pdfs', BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/',
  BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: 'upload-key', BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: 'upload-secret',
  BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'read-key', BOOK_SOURCE_B2_READ_APPLICATION_KEY: 'read-secret',
  BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-key', BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-secret',
  BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: 'activity-renderer-manifest-v1@sha256:649910eeb4ce46bc89e246ec4bcb7df883a0aae5da4fdbf2bc66d3bc3f9f1831',
  BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.iam.gserviceaccount.com', BOOK_ASSEMBLY_GOOGLE_SA_KEY: service('assembly'),
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@example.iam.gserviceaccount.com', BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: service('authoring'),
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.iam.gserviceaccount.com', BOOK_DELIVERY_GOOGLE_SA_KEY: service('delivery'),
  BOOK_TEACHER_ASSEMBLY_DOCUMENT_ROUTES_ENABLED: 'enabled',
  BOOK_ASSEMBLY_ROUTES_ENABLED: 'enabled', BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true', BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED: 'enabled',
  BOOK_COMPONENT_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled', BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true',
  BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
  BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'first-component',
    issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    actions: { create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny', 'launch-delivery': 'deny', mutation: 'allow' } }),
};
const acceptedCustomTokenIssuers = [
  'fixture@example.iam.gserviceaccount.com',
  ...Object.entries(env).filter(([key, value]) => key.endsWith('_SERVICE_IDENTITY') && typeof value === 'string')
    .map(([, value]) => value as string),
];
const worker = createUploadWorker();
const cors = { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-headers': 'authorization, content-type, range, if-range, idempotency-key, x-amz-content-sha256, x-amz-meta-book-source-byte-size, x-amz-meta-book-source-sha256',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS', 'access-control-expose-headers': 'x-amz-version-id, accept-ranges, etag, content-range, x-book-document-error-code', 'cache-control': 'no-store' };
const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', `http://localhost:${port}`);
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const send = async (response: Response) => {
    outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), ...cors });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  };
  try {
    if (incoming.method === 'OPTIONS') return await send(new Response(null, { status: 204 }));
    if (url.pathname === '/__health') return await send(json({ ready: true }));
    if (url.pathname === '/__first-component/auth-token') return await send(json({ token: customToken }));
    if (url.pathname === '/__first-component/auth-response') return await send(json({ idToken, refreshToken: 'fixture-refresh', expiresIn: '3600', isNewUser: false }));
    if (url.pathname === '/__first-component/storage') {
      const request = JSON.parse(body.toString()) as { method: string; path?: string; value?: unknown; payload?: Record<string, unknown> };
      if (request.method === 'read' && request.path) return await send(json(read(request.path)));
      if (request.method === 'write' && request.path) write(request.path, firebaseWire(request.value));
      else if (request.method === 'remove' && request.path) write(request.path, null);
      else if (request.method === 'update' && request.payload) for (const [path, value] of Object.entries(request.payload)) write(path, firebaseWire(value));
      else return await send(json({ code: 'invalid_storage_operation' }, 400));
      return await send(json({ ok: true }));
    }
    if (url.pathname === '/__first-component/diagnostics') return await send(json({
      books: read('material_catalog/books'), sourceUpload: read(`book_source_upload_accounts/${accountId}`),
      assembly: read('book_assembly/books'), activity: read('book_activity_authoring'),
      publication: read('book_assembly_publications'), trace: trace.slice(-150), objectCount: objects.size,
    }));
    if (url.pathname.startsWith('/book-pdfs/') && incoming.method === 'PUT') {
      const key = decodeURIComponent(url.pathname.slice('/book-pdfs/'.length));
      const checksum = String(incoming.headers['x-amz-meta-book-source-sha256'] ?? '');
      const versionId = `fixture-version-${objects.size + 1}`;
      objects.set(key, { bytes: body, versionId, checksum });
      trace.push(`PUT B2 ${key} ${body.length}`);
      return await send(new Response(null, { status: 200, headers: { 'x-amz-version-id': versionId } }));
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const response = await worker.fetch(new Request(`https://worker.test${url.pathname}${url.search}`, {
      method: incoming.method, headers, ...(body.length ? { body } : {}),
    }), env, { waitUntil: (promise: Promise<unknown>) => { void promise.catch((error) => console.error('first_component_background_failure', error)); } });
    trace.push(`${incoming.method} ${url.pathname} ${response?.status ?? 404}`);
    return await send(response ?? json({ code: 'route_not_found' }, 404));
  } catch (error) {
    console.error('first_component_fixture_error', error);
    return await send(json({ code: error instanceof Error ? error.message : 'fixture_error' }, 500));
  }
});
server.listen(port, 'localhost', () => console.log(`first_component_fixture_ready http://localhost:${port}`));
