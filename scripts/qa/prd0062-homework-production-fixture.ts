import { createServer } from 'node:http';
import { createHash, createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { PDFDocument } from 'pdf-lib';
import { createUploadWorker } from '../../cloudflare/worker.js';
import { reconcileProviderTotals } from '../../cloudflare/src/book-source-worker/provider-reconciliation';
import { validateBookSourceUploadAccountState } from '../../src/services/book-source-delivery/sourceUpload.rtdbRepository';
import { createBookDraft, createMaterialBooksRepository, updateBookMetadata, approvePublicBook } from '../../src/services/materialCatalog/materialBooks.service';
import { materialCatalogIds } from '../../src/types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../src/services/materialCatalog/testTypeConfig.service';
import { bookScopedActivityTargetId } from '../../src/services/book-assembly/unitActivityImport.service';
import { previewInputFingerprint } from '../../src/services/book-assembly/unitPreview.service';

// External Firebase Auth/RTDB and B2 bytes only. All Book authority is written by createBookDraft or default Workers.
const port = Number(process.env.HOMEWORK_PRODUCTION_FIXTURE_PORT ?? 8792);
const publicQa = process.env.PUBLIC_BOOK_QA_ENABLED === '1';
const classCommandQa = process.env.CLASS_BOOK_COMMAND_QA_ENABLED === '1';
const ownerId = 'teacher-1';
const studentId = 'student-1';
const projectId = 'homework-production-fixture';
const accountId = 'homework-production-account';
// These are external Auth/profile prerequisites only. Homework assignments,
// Books, Sources, publication, Activity, terminal, evaluation, and release
// records are intentionally absent and must be produced by their owners.
const tree: Record<string, unknown> = { users: {
  [ownerId]: { role: 'teacher', status: 'active', name: 'Fixture Teacher' },
  [studentId]: { role: 'student', status: 'active', name: 'Fixture Student' },
} };
if (publicQa) (tree.users as Record<string, unknown>)['admin-1'] = { role: 'super_admin', status: 'active', name: 'Fixture Admin' };
const revisions = new Map<string, number>();
const objects = new Map<string, { bytes: Uint8Array; versionId: string; checksum: string }>();
const firestoreDocuments = new Map<string, { fields: Record<string, unknown>; updateTime: string }>();
let firestoreRevision = 0;
// Provision only the empty external account prerequisite allowed by PlanMD §2.
tree.book_source_upload_accounts = { [accountId]: validateBookSourceUploadAccountState({
  revision: 0, operations: {}, capacity: { trackedAccountBytes: 0, temporaryBytes: 0,
    providerReconciliation: reconcileProviderTotals({ expected: { totalBytes: 0, objectCount: 0 },
      observed: { totalBytes: [...objects.values()].reduce((total, object) => total + object.bytes.length, 0), objectCount: objects.size },
      completedAt: new Date().toISOString() }),
  },
}) };
const trace: string[] = [];
let publicProviderReads = 0;
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicPem = keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const jwtKey = await importPKCS8(privatePem, 'RS256');
const jwk = await exportJWK(createPublicKey(publicPem));
jwk.kid = 'homework-production-fixture-key';
const service = (name: string) => JSON.stringify({ client_email: `${name}@example.iam.gserviceaccount.com`, private_key: privatePem });
const actors = new Map<string, { readonly uid: string; readonly idToken: string; readonly customToken: string }>();
for (const [uid, email] of [[ownerId, 'teacher@example.test'], [studentId, 'student@example.test'], ...(publicQa ? [['admin-1', 'admin@example.test']] : [])]) {
  const idToken = await new SignJWT({ email, email_verified: true, auth_time: Math.floor(Date.now() / 1000) })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(`https://securetoken.google.com/${projectId}`)
    .setAudience(projectId).setSubject(uid).setIssuedAt().setExpirationTime('1h').sign(jwtKey);
  const customToken = await new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer('fixture@example.iam.gserviceaccount.com')
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt().setExpirationTime('1h').sign(jwtKey);
  actors.set(uid, { uid, idToken, customToken });
}
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
const encodeFirestoreValue = (value: unknown): Record<string, unknown> => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeFirestoreValue(child)])) } };
  throw new Error('fixture_firestore_value_unsupported');
};
const decodeFirestoreValue = (value: Record<string, any>): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, child]) => [key, decodeFirestoreValue(child as Record<string, any>)]));
  throw new Error('fixture_firestore_value_invalid');
};
const firestoreFetch = async (url: URL, init: RequestInit = {}): Promise<Response> => {
  const token = new Headers(init.headers).get('authorization')?.replace(/^Bearer\s+/iu, '');
  if (!token) return json({ error: { status: 'UNAUTHENTICATED' } }, 401);
  try {
    await jwtVerify(token, keyPair.publicKey, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
  } catch {
    return json({ error: { status: 'UNAUTHENTICATED' } }, 401);
  }
  const path = decodeURIComponent(url.pathname.replace(/^\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\//u, ''));
  const method = init.method ?? 'GET';
  const current = firestoreDocuments.get(path);
  if (method === 'GET') return current
    ? json({ name: `${url.origin}${url.pathname}`, fields: current.fields, updateTime: current.updateTime })
    : json({ error: { status: 'NOT_FOUND' } }, 404);
  if (method !== 'PATCH') return json({ error: { status: 'INVALID_ARGUMENT' } }, 405);
  const preconditionExists = url.searchParams.get('currentDocument.exists');
  const preconditionUpdateTime = url.searchParams.get('currentDocument.updateTime');
  if (preconditionExists === 'false' && current || preconditionUpdateTime && current?.updateTime !== preconditionUpdateTime) {
    return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
  }
  const body = JSON.parse(String(init.body ?? '{}')) as { fields?: Record<string, Record<string, any>> };
  if (!body.fields || Object.keys(body.fields).length === 0) return json({ error: { status: 'INVALID_ARGUMENT' } }, 400);
  const updateTime = new Date(Date.now() + firestoreRevision++).toISOString();
  const fields = body.fields;
  firestoreDocuments.set(path, { fields, updateTime });
  return json({ name: `${url.origin}${url.pathname}`, fields: body.fields, updateTime });
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
    if (publicQa) { publicProviderReads += 1; trace.push(`PUBLIC PROVIDER ${init.method ?? 'GET'} ${url.pathname}`); }
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
const nativeFetch = globalThis.fetch;
const ccBridgeModule = classCommandQa ? await import('./prd0062-cc-native-bridge.ts') : null;
const ccBridge = ccBridgeModule ? await ccBridgeModule.createCcNativeBridge({
  rulesPath: process.env.CC_NATIVE_RULES_PATH ?? 'output/prd0062-current-base-candidate.json',
  initialProfiles: tree.users, nativeFetch,
}) : null;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol === 'http:' && url.hostname === 'localhost' && url.port === String(port)) {
    return nativeFetch(input, init);
  }
  if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'fixture-oauth', expires_in: 3600 });
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    const input = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
    try {
      if (!input.token) throw new Error('missing token');
      const verified = await jwtVerify(input.token, keyPair.publicKey, {
        audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        issuer: acceptedCustomTokenIssuers,
      });
      const uid = verified.payload.uid;
      if (typeof uid !== 'string' || uid.length === 0) throw new Error(`invalid uid:${Object.keys((verified.payload.claims ?? {}) as object).join(',')}`);
      const actor = actors.get(uid);
      const idToken = await new SignJWT({
        ...(actor ? { email: uid === ownerId ? 'teacher@example.test' : 'student@example.test', email_verified: true } : {}),
        ...(verified.payload.claims && typeof verified.payload.claims === 'object' ? verified.payload.claims : {}),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: 'custom' },
      }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer(`https://securetoken.google.com/${projectId}`)
        .setAudience(projectId).setSubject(uid).setIssuedAt().setExpirationTime('1h').sign(jwtKey);
      return json({ idToken: ccBridge
        ? ccBridge.tokenFromSignedClaims(uid, (verified.payload.claims ?? {}) as Record<string, unknown>, input.token)
        : idToken, expiresIn: '3600' });
    } catch (error) {
      if (publicQa) console.error('public_fixture_auth_exchange_failed', error instanceof Error ? error.message.slice(0, 160) : 'unknown');
      return json({ error: { message: 'INVALID_CUSTOM_TOKEN' } }, 400);
    }
  }
  if (url.hostname === 'www.googleapis.com') return json({ keys: [jwk] });
  if (url.hostname === 'firestore.googleapis.com') return firestoreFetch(url, init);
  if (url.hostname.endsWith('backblazeb2.com')) return providerFetch(url, init);
  if (url.hostname !== 'firebase.test') return json({ code: 'fixture_external_host_not_configured', hostname: url.hostname }, 599);
  const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const nativeUpdates = method === 'PATCH' ? JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> : null;
  const nativePaths = nativeUpdates ? Object.keys(nativeUpdates).map((relative) => `${path}/${relative}`) : [path];
  if (ccBridge && ccBridgeModule && nativePaths.some(ccBridgeModule.ccNativePath)) {
    if (!nativePaths.every(ccBridgeModule.ccNativePath)) return json({ code: 'mixed_native_atomic_patch_unsupported' }, 599);
    const response = await ccBridge.request(path, init ?? {}, url.searchParams.get('auth') ?? undefined, url.searchParams);
    if (response.ok && method !== 'GET') {
      if (nativeUpdates) for (const [relative, value] of Object.entries(nativeUpdates)) write(`${path}/${relative}`, firebaseWire(value));
      else write(path, firebaseWire(JSON.parse(String(init?.body ?? 'null'))));
    }
    trace.push(`NATIVE ${method} ${path} ${response.status}`);
    return response;
  }
  const etag = read(path) === null ? 'null_etag' : `"${revisions.get(path) ?? 0}"`;
  let response: Response;
  if (method === 'GET') {
    let value = read(path);
    if (url.searchParams.has('orderBy')) {
      const orderBy = JSON.parse(url.searchParams.get('orderBy')!);
      if (orderBy !== '$key' && orderBy !== 'latestSubmittedAt') {
        throw new Error('fixture_rtdb_query_order_unsupported');
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        let entries = Object.entries(value).sort(([leftKey, left], [rightKey, right]) => {
          const leftOrder = orderBy === '$key' ? leftKey : (left as Record<string, string>).latestSubmittedAt;
          const rightOrder = orderBy === '$key' ? rightKey : (right as Record<string, string>).latestSubmittedAt;
          return leftOrder < rightOrder ? -1 : leftOrder > rightOrder ? 1 : leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
        for (const direction of ['limitToFirst', 'limitToLast'] as const) {
          const limit = url.searchParams.get(direction);
          if (limit === null) continue;
          const count = Number(limit);
          if (!Number.isSafeInteger(count) || count < 1) throw new Error('fixture_rtdb_query_limit_invalid');
          entries = direction === 'limitToLast' ? entries.slice(-count) : entries.slice(0, count);
        }
        value = Object.fromEntries(entries);
      }
    }
    response = json(url.searchParams.get('shallow') === 'true' && value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).map((key) => [key, true])) : value, 200, { etag });
  } else if (method === 'PUT') {
    if (headers.get('if-match') && headers.get('if-match') !== etag) response = new Response('', { status: 412 });
    else {
      write(path, firebaseWire(JSON.parse(String(init?.body ?? 'null'))));
      const nextEtag = read(path) === null ? 'null_etag' : `"${revisions.get(path)}"`;
      response = json({}, 200, { etag: nextEtag });
    }
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
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'b2_book_primary', BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'book-pdfs',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'book-pdfs', BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/',
  BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: 'upload-key', BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: 'upload-secret',
  BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'read-key', BOOK_SOURCE_B2_READ_APPLICATION_KEY: 'read-secret',
  BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-key', BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-secret',
  BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
  BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: 'activity-renderer-manifest-v1@sha256:649910eeb4ce46bc89e246ec4bcb7df883a0aae5da4fdbf2bc66d3bc3f9f1831',
  BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.iam.gserviceaccount.com', BOOK_ASSEMBLY_GOOGLE_SA_KEY: service('assembly'),
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@example.iam.gserviceaccount.com', BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: service('authoring'),
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.iam.gserviceaccount.com', BOOK_DELIVERY_GOOGLE_SA_KEY: service('delivery'),
  BOOK_HOMEWORK_SERVICE_IDENTITY: 'homework@example.iam.gserviceaccount.com', BOOK_HOMEWORK_GOOGLE_SA_KEY: service('homework'),
  BOOK_HOMEWORK_COMPATIBILITY_SERVICE_IDENTITY: 'homework-compatibility@example.iam.gserviceaccount.com',
  BOOK_HOMEWORK_COMPATIBILITY_GOOGLE_SA_KEY: service('homework-compatibility'),
  BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY: 'homework-completion@example.iam.gserviceaccount.com',
  BOOK_HOMEWORK_COMPLETION_GOOGLE_SA_KEY: service('homework-completion'),
  BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'enabled',
  BOOK_DELIVERY_READ_ROUTES_ENABLED: 'enabled',
  BOOK_DOCUMENT_DELIVERY_ROUTES_ENABLED: 'enabled',
  BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'true',
  NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'notifications@example.iam.gserviceaccount.com',
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY: service('notifications'),
  BOOK_HOMEWORK_READ_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_ROUTES_ENABLED: 'enabled',
  BOOK_RUNTIME_ROUTES_ENABLED: 'enabled', BOOK_RUNTIME_LAUNCH_ROUTES_ENABLED: 'enabled',
  BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.iam.gserviceaccount.com', BOOK_RUNTIME_GOOGLE_SA_KEY: service('runtime'),
  BOOK_RESULT_READ_SERVICE_IDENTITY: 'results@example.iam.gserviceaccount.com', BOOK_RESULT_READ_GOOGLE_SA_KEY: service('results'),
  BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'evaluation@example.iam.gserviceaccount.com', BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: service('evaluation'),
  BOOK_INTEGRITY_SERVICE_IDENTITY: 'integrity@example.iam.gserviceaccount.com', BOOK_INTEGRITY_GOOGLE_SA_KEY: service('integrity'),
  BOOK_RESULT_PROJECTION_ENABLED: 'enabled',
  BOOK_RESULT_READ_ROUTES_ENABLED: 'enabled', BOOK_EVALUATION_HISTORY_ROUTES_ENABLED: 'enabled',
  BOOK_INTEGRITY_ROUTES_ENABLED: 'enabled', BOOK_INTEGRITY_REPORT_ROUTES_ENABLED: 'enabled',
  BOOK_INTEGRITY_LINKAGE_ENABLED: 'enabled',
  BOOK_TEACHER_ASSEMBLY_DOCUMENT_ROUTES_ENABLED: 'enabled',
  BOOK_ASSEMBLY_ROUTES_ENABLED: 'enabled', BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true', BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED: 'enabled',
  BOOK_COMPONENT_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled', BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true',
  ...(publicQa ? { BOOK_PUBLIC_ROUTES_ENABLED: 'enabled',
    BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY: 'assembly-publication@example.iam.gserviceaccount.com',
    BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY: service('assembly-publication') } : {}),
  ...(classCommandQa ? { BOOK_COURSE_BOOK_PLACEMENT_ROUTES_ENABLED: 'enabled', BOOK_CLASS_BOOK_PLACEMENT_ROUTES_ENABLED: 'enabled',
    BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY: 'assembly-publication@example.iam.gserviceaccount.com',
    BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY: service('assembly-publication') } : {}),
  BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
  BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'homework-production',
    issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    actions: { create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny', 'launch-delivery': 'deny', mutation: 'allow' } }),
};
const acceptedCustomTokenIssuers = [
  'fixture@example.iam.gserviceaccount.com',
  ...Object.entries(env).filter(([key, value]) => key.endsWith('_SERVICE_IDENTITY') && typeof value === 'string')
    .map(([, value]) => value as string),
];
const worker = createUploadWorker();
let publicBootstrapProof: unknown;
const cors = { 'access-control-allow-headers': 'authorization, content-type, range, if-range, idempotency-key, x-amz-content-sha256, x-amz-meta-book-source-byte-size, x-amz-meta-book-source-sha256',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS', 'access-control-expose-headers': 'x-amz-version-id, accept-ranges, etag, content-range, x-book-document-error-code', 'cache-control': 'no-store' };
const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', `http://localhost:${port}`);
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const send = async (response: Response) => {
    const origin = incoming.headers.origin;
    outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), ...cors,
      ...(origin === 'http://localhost:5173' || origin === 'http://localhost:5174' ? { 'access-control-allow-origin': origin } : {}) });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  };
  try {
    if (incoming.method === 'OPTIONS') return await send(new Response(null, { status: 204 }));
    if (url.pathname === '/__health') return await send(json({ ready: true }));
    if (ccBridge && url.pathname === '/__cc-native/restore' && incoming.method === 'POST') {
      await ccBridge.restore();
      return await send(json({ restored: true }));
    }
    if (url.pathname === '/__homework-production/auth-token') {
      const actor = actors.get(url.searchParams.get('uid') ?? '') ?? actors.get(ownerId)!;
      return await send(json({ token: actor.customToken }));
    }
    if (url.pathname === '/__homework-production/auth-response') {
      const actor = actors.get(url.searchParams.get('uid') ?? '') ?? actors.get(ownerId)!;
      return await send(json({ idToken: actor.idToken, refreshToken: 'fixture-refresh', expiresIn: '3600', isNewUser: false }));
    }
    if (url.pathname === '/__homework-production/storage') {
      const request = JSON.parse(body.toString()) as { method: string; path?: string; value?: unknown; payload?: Record<string, unknown>; uid?: string; query?: Array<{ type: string; value: unknown }> };
      if (ccBridge && ccBridgeModule && request.method !== 'read') {
        const paths = request.payload ? Object.keys(request.payload) : request.path ? [request.path] : [];
        if (paths.some(ccBridgeModule.ccNativePath)) {
          if (!paths.every(ccBridgeModule.ccNativePath)) return await send(json({ code: 'mixed_native_sdk_patch_unsupported' }, 599));
          if (!request.uid || !actors.has(request.uid)) return await send(json({ code: 'native_sdk_actor_required' }, 401));
          const native = await ccBridge.request(request.payload ? '' : request.path!, {
            method: request.payload ? 'PATCH' : 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(firebaseWire(request.payload ?? (request.method === 'remove' ? null : request.value))),
          }, ccBridge.tokenFromSignedClaims(request.uid, {}));
          if (!native.ok) return await send(native);
        }
      }
      if (request.method === 'read' && request.path) {
        let value = read(request.path);
        if (publicQa && request.query?.length && value && typeof value === 'object') {
          const order = request.query.find((entry) => entry.type === 'orderByChild')?.value;
          const limit = request.query.find((entry) => entry.type === 'limitToLast')?.value;
          const equalConstraint = request.query.find((entry) => entry.type === 'equalTo');
          const endConstraint = request.query.find((entry) => entry.type === 'endAt' || entry.type === 'endBefore') as { type: string; value: unknown; key?: string } | undefined;
          const end = endConstraint?.value;
          const sortable = Object.entries(value as Record<string, Record<string, unknown>>)
            .filter(([, row]) => !equalConstraint || row[String(order)] === equalConstraint.value)
            .filter(([key, row]) => end === undefined || String(row[String(order)]) < String(end)
              || String(row[String(order)]) === String(end) && (endConstraint?.type === 'endBefore' ? endConstraint.key !== undefined && key < endConstraint.key : endConstraint?.key === undefined || key <= endConstraint.key))
            .sort(([a, rowA], [b, rowB]) => String(rowA[String(order)]) < String(rowB[String(order)]) ? -1 : String(rowA[String(order)]) > String(rowB[String(order)]) ? 1 : a < b ? -1 : a > b ? 1 : 0);
          value = Object.fromEntries(typeof limit === 'number' ? sortable.slice(-limit) : sortable);
        }
        if (publicQa) trace.push(`SDK GET ${request.path} ${JSON.stringify(request.query ?? [])}`);
        return await send(json(value));
      }
      if (request.method === 'write' && request.path) write(request.path, firebaseWire(request.value));
      else if (request.method === 'remove' && request.path) write(request.path, null);
      else if (request.method === 'update' && request.payload) for (const [path, value] of Object.entries(request.payload)) write(path, firebaseWire(value));
      else return await send(json({ code: 'invalid_storage_operation' }, 400));
      return await send(json({ ok: true }));
    }
    if (url.pathname === '/__homework-production/diagnostics') return await send(json({
      books: read('material_catalog/books'), sourceUpload: read(`book_source_upload_accounts/${accountId}`),
      assembly: read('book_assembly/books'), activity: read('book_activity_authoring'),
      classes: read('classes'), studentClasses: read('student_classes'), notifications: read('notifications'),
      reporting: { config: read('reports/config'), errors: read('reports/errors') },
      publication: read('book_assembly_publications'), homework: read('book_homework'),
      compatibilityHomework: read('homework_assignments'), runtimeTerminal: read('book_runtime'),
      runtimeScopes: read('book_runtime/scopes'), evaluation: read('book_activity_evaluations'),
      resultReadModels: read('book_result_read_models'), grading: read('book_activity_grading'),
      homeworkAuthorities: Object.fromEntries([...firestoreDocuments.entries()].filter(([path]) => path.startsWith('book_homework_authorities/'))
        .map(([path, document]) => [path, Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, decodeFirestoreValue(value as Record<string, any>)]))])),
      trace: trace.slice(-150), objectCount: objects.size,
      ...(publicQa ? { publicReadiness: read('material_catalog/public_book_readiness'), publicProviderReads } : {}),
      ...(ccBridge ? { ccNative: { projectId: ccBridge.projectId, rulesSha256: ccBridge.rulesSha256, events: ccBridge.evidence },
        courseMaterials: read('course_materials'), classBookAuthority: read('class_book_authority'),
        courseBookAuthority: read('course_book_authority') } : {}),
    }));
    if (url.pathname === '/__homework-production/bootstrap-publication' && incoming.method === 'POST') {
      if (objects.size !== 0 || read('material_catalog/books') || read('book_assembly_publications')) {
        return await send(json({ code: 'fixture_not_empty' }, 409));
      }
      const result = await bootstrapPublication();
      return await send(json(result));
    }
    if (publicQa && url.pathname === '/__public-production/archive' && incoming.method === 'POST') {
      const bookId = (publicBootstrapProof as { bookId?: string } | undefined)?.bookId;
      if (!bookId) return await send(json({ code: 'public_not_bootstrapped' }, 409));
      const repository = createMaterialBooksRepository({ read: async (path) => read(path),
        write: async (path, value) => write(path, firebaseWire(value)),
        update: async (payload) => { for (const [path, value] of Object.entries(payload)) write(path, firebaseWire(value)); } });
      await updateBookMetadata(bookId, { status: 'archived' }, repository,
        { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES });
      return await send(json({ producer: 'updateBookMetadata', bookId, status: read(`material_catalog/books/${bookId}`)?.status,
        readiness: read(`material_catalog/public_book_readiness/${bookId}`) }));
    }
    if (publicQa && url.pathname === '/__public-production/bootstrap' && incoming.method === 'POST') {
      if (publicBootstrapProof) return await send(json(publicBootstrapProof));
      if (objects.size !== 0 || read('material_catalog/books')) return await send(json({ code: 'fixture_not_empty' }, 409));
      const publication = await bootstrapPublication(url.searchParams.get('matrix') === '1');
      const repository = createMaterialBooksRepository({ read: async (path) => read(path),
        write: async (path, value) => write(path, firebaseWire(value)),
        update: async (payload) => { for (const [path, value] of Object.entries(payload)) write(path, firebaseWire(value)); },
        refreshPublicReadiness: async (bookId) => {
          const response = await worker.fetch(new Request(`https://worker.test/v1/book-public/books/${bookId}/readiness-refresh`, {
            method: 'POST', headers: { authorization: `Bearer ${actors.get('admin-1')!.idToken}`, 'content-type': 'application/json' }, body: '{}',
          }), env, { waitUntil: (promise: Promise<unknown>) => { void promise; } });
          if (!response || response.status !== 200) {
            const failure = `public_readiness_refresh_failed:${response?.status}:${await response?.text()}`;
            console.error(failure);
            throw new Error(failure);
          }
        },
      });
      await updateBookMetadata(publication.bookId, { visibility: 'public-library-pending-review' }, repository,
        { actorId: ownerId, actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES });
      const pendingReview = url.searchParams.get('review') === 'pending';
      if (!pendingReview) await approvePublicBook(publication.bookId, repository,
        { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES }, { reason: 'QA public source reviewed.' });
      publicBootstrapProof = { ...publication, readiness: read(`material_catalog/public_book_readiness/${publication.bookId}`),
        producers: pendingReview ? ['bootstrapPublication', 'updateBookMetadata']
          : ['bootstrapPublication', 'updateBookMetadata', 'approvePublicBook', 'publicBook.refreshReadiness'] };
      return await send(json(publicBootstrapProof));
    }
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
    }), env, { waitUntil: (promise: Promise<unknown>) => { void promise.catch((error) => console.error('homework_production_background_failure', error)); } });
    trace.push(`${incoming.method} ${url.pathname} ${response?.status ?? 404}`);
    return await send(response ?? json({ code: 'route_not_found' }, 404));
  } catch (error) {
    console.error('homework_production_fixture_error', error);
    return await send(json({ code: error instanceof Error ? error.message : 'fixture_error' }, 500));
  }
});
server.listen(port, 'localhost', () => console.log(`homework_production_fixture_ready http://localhost:${port}`));

async function bootstrapPublication(runtimeMatrix = false) {
  const owner = actors.get(ownerId)!;
  const invoke = async (path: string, data?: Record<string, unknown>, operationId?: string) => {
    const key = operationId ?? data?.operationId;
    const headers = new Headers({ Authorization: `Bearer ${owner.idToken}`, Origin: 'http://localhost:5173' });
    if (data) headers.set('Content-Type', 'application/json');
    if (typeof key === 'string') headers.set('Idempotency-Key', key);
    const response = await worker.fetch(new Request(`https://worker.test${path}`, {
      method: data ? 'POST' : 'GET', headers,
      ...(data ? { body: JSON.stringify(data) } : {}),
    }), env, { waitUntil: (promise) => { void promise.catch((error) => console.error('homework_production_background_failure', error)); } });
    const body = await response.json() as Record<string, any>;
    if (!response.ok) throw new Error(`producer_${path}_${response.status}:${JSON.stringify(body)}`);
    return body;
  };
  const storage = async (method: string, fields: Record<string, unknown>) => {
    const response = await fetch(`http://localhost:${port}/__homework-production/storage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, ...fields }),
    });
    if (!response.ok) throw new Error(`fixture_storage_${response.status}`);
    return response.json();
  };
  const repository = createMaterialBooksRepository({
    read: (path) => storage('read', { path }),
    write: async (path, value) => { await storage('write', { path, value }); },
    remove: async (path) => { await storage('remove', { path }); },
    update: async (payload) => { await storage('update', { payload }); },
  });
  const bookId = `homework-${randomUUID().slice(0, 8)}`;
  const book = await createBookDraft({ bookId: materialCatalogIds.bookId(bookId), bookMode: 'pdf', ownerId,
    title: 'Homework production fixture', testTypeIds: [materialCatalogIds.testTypeId('ielts')], visibility: 'private' },
  repository, { actorId: ownerId, actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES });
  if (book.bookRevision !== 0 || book.sourceSetRevision !== 0 || book.sourceSet !== undefined) {
    throw new Error('fixture_book_draft_not_empty');
  }

  const sources = [
    { sourceKey: 'part-a', file: resolve(process.cwd(), 'artifacts/prd0062-real-materials/cuts/unit-01-growing-up.pdf') },
    { sourceKey: 'part-b', file: resolve(process.cwd(), 'artifacts/prd0062-real-materials/cuts/unit-02-mental-and-physical-development.pdf') },
  ];
  const componentInputs: Array<{ sourceKey: string; sourceVersionId: string; reservationId: string; operationId: string; pages: number }> = [];
  const combined = await PDFDocument.create();
  for (const [index, source] of sources.entries()) {
    const bytes = await readFile(source.file);
    const inputPdf = await PDFDocument.load(bytes);
    const pages = inputPdf.getPageCount();
    const copied = await combined.copyPages(inputPdf, inputPdf.getPageIndices());
    copied.forEach((page) => combined.addPage(page));
    const operationId = randomUUID();
    const root = `/v1/book-source/books/${bookId}/upload`;
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const begin = await invoke(`${root}/begin`, {
      operationId, sourceKey: source.sourceKey, kind: 'initial', purpose: 'book-source',
      inspection: { schemaVersion: 1, trust: 'browser-supplied-untrusted', state: 'complete',
        displayFilename: `${source.sourceKey}.pdf`, exactByteSize: bytes.byteLength,
        sha256Hex: checksum, physicalPageCount: pages, pdfType: 'application/pdf', readability: 'readable' },
    }, operationId);
    const target = new URL(begin.upload.url);
    const put = await fetch(`http://localhost:${port}${target.pathname}${target.search}`, {
      method: 'PUT', headers: begin.upload.requiredHeaders, body: bytes,
    });
    if (!put.ok) throw new Error(`component_b2_upload_${index + 1}_${put.status}`);
    await invoke(`${root}/${begin.reservationId}/complete`, { operationId }, operationId);
    await invoke(`${root}/${begin.reservationId}/student-safe/decide`, {
      operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }, operationId);
    componentInputs.push({ sourceKey: source.sourceKey, sourceVersionId: begin.sourceVersionId,
      reservationId: begin.reservationId, operationId, pages });
  }
  const combinedBytes = Buffer.from(await combined.save());
  const documentOperationId = randomUUID();
  const documentChecksum = createHash('sha256').update(combinedBytes).digest('hex');
  const documentRoot = `/v1/book-source/books/${bookId}/upload`;
  const documentBegin = await invoke(`${documentRoot}/begin`, {
    operationId: documentOperationId, sourceKey: 'student-document', kind: 'initial', purpose: 'student-document',
    inspection: { schemaVersion: 1, trust: 'browser-supplied-untrusted', state: 'complete',
      displayFilename: 'combined.pdf', exactByteSize: combinedBytes.byteLength, sha256Hex: documentChecksum,
      physicalPageCount: combined.getPageCount(), pdfType: 'application/pdf', readability: 'readable' },
  }, documentOperationId);
  const documentTarget = new URL(documentBegin.upload.url);
  const documentPut = await fetch(`http://localhost:${port}${documentTarget.pathname}${documentTarget.search}`, {
    method: 'PUT', headers: documentBegin.upload.requiredHeaders, body: combinedBytes,
  });
  if (!documentPut.ok) throw new Error(`student_document_b2_upload_${documentPut.status}`);
  await invoke(`${documentRoot}/${documentBegin.reservationId}/complete`, { operationId: documentOperationId }, documentOperationId);
  await invoke(`${documentRoot}/${documentBegin.reservationId}/student-safe/decide`, {
    operationId: documentOperationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
  }, documentOperationId);

  const unitKey = 'unit-1';
  const unitKeys = classCommandQa ? [unitKey, 'unit-2'] : [unitKey];
  const activitySlots = [
    { unitKey, activityKey: 'slot-choice', pageGroupKey: 'pages-a', sourceKey: 'part-a', title: 'Source-assisted choice', subjective: false },
    { unitKey: unitKeys.at(-1)!, activityKey: 'slot-review', pageGroupKey: 'pages-b', sourceKey: 'part-b', title: 'Source-assisted long response', subjective: true },
  ] as const;
  const sourceSet = { sourceStrategy: 'component_pdfs', sources: componentInputs.map((source, index) => ({
    sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId, sourceOrder: index + 1, ownerNodeKey: activitySlots[index].unitKey,
  })) };
  const manifest = { bookId, sourceSet,
    nodes: unitKeys.map((key, index) => ({ nodeKey: key, parentNodeKey: null, nodeType: 'unit', order: index + 1 })),
    units: unitKeys.map((key) => ({ unitKey: key, activitySlots: activitySlots.filter((slot) => slot.unitKey === key).map((slot, index) => ({ activityKey: slot.activityKey,
      order: index + 1, contextRequirement: 'required', pageGroupKeys: [slot.pageGroupKey] })),
      pageGroups: [...activitySlots.filter((slot) => slot.unitKey === key).map((slot) => ({ pageGroupKey: slot.pageGroupKey, sourceKey: slot.sourceKey,
        pages: [1], activityKeys: [slot.activityKey], mode: 'activity' })),
        ...(runtimeMatrix ? [{ pageGroupKey: 'pages-reference', sourceKey: 'part-a', pages: [2], activityKeys: [], mode: 'reference_only' }] : [])] })),
  };
  for (const key of unitKeys) {
  const candidates = `/book-assembly/books/${bookId}/units/${key}/candidates`;
  const draft = await invoke(candidates, { operationId: randomUUID(), bookId, unitKey: key,
    expectedBookRevision: 0, expectedSourceSetRevision: 0, manifest });
  await invoke(`${candidates}/${draft.candidate.candidateId}/validate`, {
    operationId: randomUUID(), bookId, unitKey: key, candidateId: draft.candidate.candidateId, expectedCandidateRevision: 1,
  });
  }
  const savedActivities = [];
  for (const slot of activitySlots) {
    const binding = { unitKey: slot.unitKey, activityKey: slot.activityKey };
    const content = { schemaVersion: 1, title: slot.title, taskProfile: null, presentationMode: 'source-assisted',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
      instructions: [{ text: slot.subjective ? 'Explain using the source.' : 'Choose the supported answer.' }],
      stimulus: null, assetRefs: [], interaction: slot.subjective ? { family: 'long-response', variant: 'v1' } : { family: 'choice', variant: 'single-select' },
      answerRule: slot.subjective ? { defaultPoints: 2, normalization: 'exact' } : { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
      interactions: [slot.subjective
        ? { prompt: 'Explain the relevant evidence.', rubric: { criteria: ['Accurate use of source evidence', 'Clear explanation'] },
          sourceAssisted: { questionLabel: '1', sourceExerciseLabel: 'Exercise 1', accessiblePrompt: 'Explain using the source.', responseShape: 'long-response' } }
        : { prompt: 'Choose the supported answer.', options: ['A', 'B'], acceptedOptionIndexes: [0], sourceAssisted: {
          questionLabel: '1', sourceExerciseLabel: 'Exercise 1', accessiblePrompt: 'Choose one answer.', responseShape: 'single-choice' } }],
      scoring: { mode: slot.subjective ? 'review-required' : 'auto-where-possible' } };
    const staged = await invoke('/book-activity-authoring/stage', { operationId: randomUUID(), bookId,
      expectedRevision: 0, targetActivityId: bookScopedActivityTargetId(bookId, slot.activityKey), unitActivityBinding: binding, content });
    await invoke('/book-activity-authoring/validate', { operationId: randomUUID(), candidateId: staged.candidateId,
      expectedRevision: 1, unitActivityBinding: binding });
    const saved = await invoke('/book-activity-authoring/save-draft', { operationId: randomUUID(),
      candidateId: staged.candidateId, expectedRevision: 2, unitActivityBinding: binding });
    savedActivities.push({ unitKey: slot.unitKey, activityKey: slot.activityKey, activityId: saved.activityId, scoringMode: content.scoring.mode });
  }

  const activation = await invoke(`/book-assembly/books/${bookId}/component-pdf-activation`, {
    operationId: randomUUID(), expectedBookRevision: 0, expectedSourceSetRevision: 0, sourceSet, manifest,
    preparation: { componentReservationIds: componentInputs.map((source) => source.reservationId),
      studentDocumentReservationId: documentBegin.reservationId }, activatedAt: new Date().toISOString(),
  });
  const unitApprovals = [];
  for (const key of unitKeys) {
  const pinned = activation.receipt.unitCandidates.find((entry: { unitKey: string }) => entry.unitKey === key);
  if (!pinned) throw new Error('activation_candidate_missing');
  const preview = await invoke(`/book-assembly/books/${bookId}/units/${key}/candidates/${pinned.candidateId}/preview`, {
    expectedCandidateRevision: pinned.candidateRevision,
  });
  const approved = await invoke(`/book-assembly/books/${bookId}/units/${key}/candidates/${pinned.candidateId}/approve`, {
    expectedCandidateRevision: pinned.candidateRevision,
    expectedUnitInputFingerprint: previewInputFingerprint(preview.preview),
    expectedWholeActivationFingerprint: preview.qualification.wholeActivationFingerprint,
  });
  const { approvalId, approvalRevision, approvedAt, expiresAt } = approved.approval;
  unitApprovals.push({ unitKey: key, candidateId: pinned.candidateId, candidateRevision: pinned.candidateRevision,
    approvalId, approvalRevision, approvedAt, expiresAt });
  }
  const publicationOperationId = randomUUID();
  const publication = await invoke('/book-assembly/component-pdf-publications', {
    bookId, expectedCurrentPublicationId: null, expectedBookRevision: 1, expectedSourceSetRevision: 1,
    unitApprovals,
  }, publicationOperationId);
  if (publication.result?.status !== 'published') throw new Error(`publication_not_committed:${JSON.stringify(publication)}`);
  const state = await (await fetch(`http://localhost:${port}/__homework-production/diagnostics`)).json() as Record<string, any>;
  return {
    bookId, unitKey, unitKeys, activities: savedActivities, sourceVersionIds: componentInputs.map((source) => source.sourceVersionId),
    studentDocumentSourceVersionId: documentBegin.sourceVersionId, manifestVersionId: publication.manifestVersionId,
    publicationId: publication.publicationId, publicationRevision: publication.publicationRevision,
    status: publication.result.status, componentPageCounts: componentInputs.map((source) => source.pages),
    studentDocumentPageCount: combined.getPageCount(), sourceSetRevision: state.books?.[bookId]?.sourceSetRevision,
    diagnostics: { bookCreatedByClientDraftProducer: Boolean(state.books?.[bookId]),
      assemblyCandidateCreatedByWorker: Boolean(state.assembly?.[bookId]),
      activitiesCreatedByWorker: savedActivities.every((activity) => Boolean(state.activity?.owners?.[ownerId]?.activities?.[activity.activityId])),
      publicationCreatedByWorker: Boolean(state.publication?.books?.[bookId]?.current),
      homeworkAuthorityEmpty: state.homework === null && state.compatibilityHomework === null && Object.keys(state.homeworkAuthorities ?? {}).length === 0,
      runtimeTerminalEmpty: state.runtimeTerminal === null, evaluationEmpty: state.grading === null },
  };
}
