import { createHash, createHmac, generateKeyPairSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { wave } from './external-audio-media.mjs';

const rtdb = 'http://localhost:9000';
const auth = 'http://localhost:9099';
const firestore = 'http://localhost:8080';
const privateRtdb = 'http://localhost:9015';
const project = 'demo-luyentap-local';
const privateProject = 'demo-fixture-audio-local';
const privateHost = `${privateProject}-default-rtdb.firebaseio.com`;
const workerOrigin = 'http://localhost:8787';
const teacherOrigin = 'http://localhost:5173';
const b2Bucket = 'fixture-private-audio';
const b2Prefix = 'teacher/';
const b2AccountBBucket = 'fixture-account-b-bucket';
const appKey = 'fixture-key-id';
const accountBKey = 'fixture-account-b-key-id';
const realProvider = process.env.EXTERNAL_AUDIO_PUBLIC_REAL_QA === '1' || process.env.EXTERNAL_AUDIO_THCS_REAL_QA === '1'
  || process.env.EXTERNAL_AUDIO_COURSE_REAL_QA === '1';
const browserMediaDir = realProvider ? undefined : process.env.EXTERNAL_AUDIO_BROWSER_MEDIA_DIR;
const browserMediaKey = browserMediaDir ? randomBytes(32) : undefined;
const audio = wave(24, 440);
const fixtureAudio = new Map([
  ['fixture-first', browserMediaDir ? await readFile(join(browserMediaDir, 'first.wav')) : audio],
  ['fixture-second', browserMediaDir ? await readFile(join(browserMediaDir, 'second.wav')) : audio],
  ['fixture-account-b-first', browserMediaDir ? await readFile(join(browserMediaDir, 'second.wav')) : wave(24, 523)],
]);
fixtureAudio.set('fixture-newer', fixtureAudio.get('fixture-first'));
const providerFiles = new Map(['First', 'Second'].map((name) => [`fixture-${name.toLowerCase()}`, {
  accountId: 'fixture-account', bucketId: 'fixture-bucket', action: 'upload',
  fileName: `${b2Prefix}${name} take.wav`, fileId: `fixture-${name.toLowerCase()}`,
  contentType: 'audio/wav', contentLength: fixtureAudio.get(`fixture-${name.toLowerCase()}`).length,
  uploadTimestamp: Date.UTC(2026, 9, name === 'First' ? 12 : 15),
}]));
providerFiles.set('fixture-newer', { ...providerFiles.get('fixture-first'), fileId: 'fixture-newer' });
providerFiles.set('fixture-account-b-first', {
  accountId: 'fixture-account-b', bucketId: 'fixture-bucket-b', action: 'upload',
  fileName: 'Account B recording.wav', fileId: 'fixture-account-b-first',
  contentType: 'audio/wav', contentLength: fixtureAudio.get('fixture-account-b-first').length,
  uploadTimestamp: Date.UTC(2026, 9, 18),
});
const realFetch = globalThis.fetch;
const unavailable = new Set();
let newerVersionAvailable = false;
let publicListeningEnabled = true;
let denyPlayback = false;
const audioHash = createHash('sha256').update(audio).digest('hex');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPlsAAAAASUVORK5CYII=', 'base64');
const images = new Map();
const imageCopies = new Map();
const consumedUploadGrants = new Set();
let failImageCopy;

function firebaseRequest(origin, namespace, path, init = {}) {
  const url = new URL(path, origin);
  url.searchParams.set('ns', namespace);
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer owner');
  return realFetch(url, { ...init, headers, redirect: 'error' });
}

const readAppValue = async (path, query) => {
  const search = new URLSearchParams(Object.entries(query ?? {}).map(([key, value]) => [key, JSON.stringify(value)]));
  const response = await firebaseRequest(rtdb, project, `/${path}.json?${search}`);
  if (!response.ok) throw new Error('Fixture app database unavailable');
  return response.json();
};

function r2Object(key, options) {
  const stored = images.get(key);
  if (stored) return { size: stored.bytes.length, httpMetadata: stored.httpMetadata, body: stored.bytes };
  if (!key.startsWith('assessment-assets/listening/') || !key.endsWith('/fixture-r2.wav')) return null;
  const { offset = 0, length = audio.length } = options?.range ?? {};
  const bytes = Uint8Array.from(audio.subarray(offset, offset + length));
  return { size: audio.length, httpMetadata: { contentType: 'audio/wav' }, body: bytes, arrayBuffer: async () => bytes.buffer };
}

const r2 = {
  get: async (key, options) => r2Object(key, options),
  head: async (key) => r2Object(key),
  async put(key, body, { httpMetadata, onlyIf } = {}) {
    if (key === failImageCopy) throw new Error('Fixture image copy failed');
    if (onlyIf?.get('If-None-Match') === '*' && images.has(key)) return null;
    const bytes = Buffer.from(await new Response(body).arrayBuffer());
    images.set(key, { bytes, httpMetadata });
    imageCopies.set(key, (imageCopies.get(key) ?? 0) + 1);
    return { size: bytes.length };
  },
  async delete(key) { images.delete(key); },
};
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' } });
const { privateKey: appPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' } });
const env = {
  FIREBASE_PROJECT_ID: project, FIREBASE_DB_URL: rtdb, FIREBASE_DATABASE_EMULATOR_URL: rtdb, FIRESTORE_EMULATOR_URL: firestore,
  EXTERNAL_AUDIO_ENVIRONMENT: 'local', EXTERNAL_AUDIO_ROUTES_ENABLED: 'enabled', EXTERNAL_AUDIO_DRAFTS_ENABLED: 'enabled',
  EXTERNAL_AUDIO_PRIVATE_HOMEWORK_ENABLED: 'enabled', EXTERNAL_AUDIO_PUBLIC_LISTENING_ENABLED: 'enabled',
  EXTERNAL_AUDIO_THCS_ENABLED: 'enabled',
  EXTERNAL_AUDIO_PLAYBACK_QA_TTL_SECONDS: process.env.EXTERNAL_AUDIO_PLAYBACK_QA_TTL_SECONDS ?? (realProvider ? '120' : '6'),
  EXTERNAL_AUDIO_STORE_PROJECT_ID: privateProject, EXTERNAL_AUDIO_STORE_DATABASE_URL: `https://${privateHost}`,
  EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: JSON.stringify({
    project_id: privateProject, client_email: `external-audio-worker@${privateProject}.iam.gserviceaccount.com`, private_key: privateKey,
  }),
  EXTERNAL_AUDIO_ENCRYPTION_KEYRING: JSON.stringify({
    environment: 'local', active: 'fixture', keys: { fixture: Buffer.alloc(32, 17).toString('base64') },
  }),
  LISTENING_AUTHORING_DEV_WRITES_ENABLED: 'true',
  LISTENING_AUTHORING_IDEMPOTENCY_SECRET: 'LOCAL_FIXTURE_AUTHORING_ONLY',
  LISTENING_DELIVERY_SECRET: 'LOCAL_FIXTURE_DELIVERY_SIGNING_ONLY_FOR_TESTS',
  GOOGLE_SA_KEY: JSON.stringify({ client_email: 'fixture-app@example.test', private_key: appPrivateKey }),
  LISTENING_AUDIO_BUCKET: r2, R2_BUCKET: r2, PUBLIC_URL: workerOrigin,
  UPLOAD_GRANT_SECRET: 'LOCAL_FIXTURE_IMAGE_UPLOAD_SIGNING_ONLY',
  UPLOAD_GRANT_REPLAY_LEDGER: {
    async consume({ key }) {
      const consumed = !consumedUploadGrants.has(key);
      consumedUploadGrants.add(key);
      return { consumed };
    },
  },
  UPLOAD_RATE_LIMITER: { limit: async ({ key }) => ({ success: !(denyPlayback && key.startsWith('external-audio:playback:')) }) },
  readDatabaseValue: readAppValue,
};

async function fixtureFetch(input, init) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (realProvider && url.protocol === 'https:' &&
    /^(api[0-9]*|s3\.[a-z0-9-]+)\.backblazeb2\.com$/u.test(url.hostname)) return realFetch(request);
  if (url.origin === firestore) {
    if (request.headers.get('Authorization') !== 'Bearer fixture-app-store') return realFetch(request);
    const headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer owner');
    return realFetch(new Request(request, { headers }));
  }
  if (url.origin === rtdb) {
    if (url.searchParams.has('auth')) return realFetch(request);
    const query = new URLSearchParams(url.searchParams);
    query.delete('access_token');
    return firebaseRequest(rtdb, project, `${url.pathname}?${query}`, {
      method: request.method, headers: request.headers, body: request.body ? await request.text() : undefined,
    });
  }
  if (url.hostname === 'oauth2.googleapis.com') {
    const assertion = (await request.formData()).get('assertion');
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
    if (claims.iss === 'fixture-app@example.test') return Response.json({ access_token: 'fixture-app-store', expires_in: 3600 });
    if (claims.iss === `external-audio-worker@${privateProject}.iam.gserviceaccount.com`) {
      return Response.json({ access_token: 'fixture-private-store' });
    }
    return new Response(null, { status: 403 });
  }
  if (url.hostname === 'firestore.googleapis.com' && request.headers.get('Authorization') === 'Bearer fixture-app-store') {
    return realFetch(`${firestore}${url.pathname}${url.search}`, {
      method: request.method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: request.body ? await request.text() : undefined,
    });
  }
  if (url.hostname === privateHost) {
    if (request.headers.get('Authorization') !== 'Bearer fixture-private-store') return new Response(null, { status: 403 });
    const body = request.method === 'PUT' ? await request.text() : undefined;
    return firebaseRequest(privateRtdb, privateProject, url.pathname, { method: request.method, headers: request.headers, body });
  }
  if (url.hostname === 'api.backblazeb2.com') {
    const auth = request.headers.get('Authorization');
    const alternate = auth === `Basic ${btoa('fixture-other-key-id:fixture-other-key-secret')}`;
    const accountB = auth === `Basic ${btoa(`${accountBKey}:fixture-account-b-secret`)}`;
    if (!alternate && !accountB && auth !== `Basic ${btoa(`${appKey}:fixture-key-secret`)}`) {
      return Response.json({ code: 'unauthorized' }, { status: 401 });
    }
    if (accountB) {
      return Response.json({
        accountId: 'fixture-account-b', authorizationToken: 'fixture-b2-account-b-token',
        apiInfo: { storageApi: {
          apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com',
          allowed: { buckets: [{ id: 'fixture-bucket-b', name: b2AccountBBucket }], namePrefix: null,
            capabilities: ['listBuckets', 'listFiles', 'readFiles'] },
        } },
      });
    }
    return Response.json({
      accountId: 'fixture-account', authorizationToken: alternate ? 'fixture-other-token' : 'fixture-b2-account-token',
      apiInfo: { storageApi: {
        apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com',
        allowed: { buckets: [{ id: 'fixture-bucket', name: b2Bucket }], namePrefix: alternate ? 'other-teacher/' : b2Prefix,
          capabilities: ['listBuckets', 'listFiles', 'readFiles'] },
      } },
    });
  }
  const providerToken = request.headers.get('Authorization');
  if (url.hostname === 'api004.backblazeb2.com' && ['fixture-b2-account-token', 'fixture-other-token', 'fixture-b2-account-b-token'].includes(providerToken)) {
    if (url.pathname.endsWith('/b2_list_buckets')) {
      if (providerToken === 'fixture-b2-account-b-token') {
        return Response.json({ buckets: [{ accountId: 'fixture-account-b', bucketId: 'fixture-bucket-b', bucketName: b2AccountBBucket, bucketType: 'allPrivate' }] });
      }
      return Response.json({ buckets: [{ accountId: 'fixture-account', bucketId: 'fixture-bucket', bucketName: b2Bucket, bucketType: 'allPrivate' }] });
    }
    if (url.pathname.endsWith('/b2_list_file_names')) {
      if (providerToken === 'fixture-other-token') return Response.json({ files: [], nextFileName: null });
      if (providerToken === 'fixture-b2-account-b-token') {
        const files = [...providerFiles.values()].filter(({ bucketId, fileId, fileName }) =>
          bucketId === 'fixture-bucket-b' && !unavailable.has(fileId) && fileName.startsWith(url.searchParams.get('prefix') ?? ''));
        return Response.json({ files, nextFileName: null });
      }
      const hiddenVersion = newerVersionAvailable ? 'fixture-first' : 'fixture-newer';
      const files = [...providerFiles.values()].filter(({ bucketId, fileId, fileName }) =>
        bucketId === 'fixture-bucket' && fileId !== hiddenVersion && !unavailable.has(fileId) && fileName.startsWith(url.searchParams.get('prefix') ?? ''));
      return Response.json({ files, nextFileName: null });
    }
    if (url.pathname.endsWith('/b2_get_file_info')) {
      const version = url.searchParams.get('fileId');
      const expectedBucket = providerToken === 'fixture-b2-account-b-token' ? 'fixture-bucket-b' : providerToken === 'fixture-b2-account-token' ? 'fixture-bucket' : '';
      const file = expectedBucket && !unavailable.has(version) && providerFiles.get(version);
      return file && file.bucketId === expectedBucket ? Response.json(file) : Response.json({ code: 'file_not_present' }, { status: 400 });
    }
  }
  if (url.hostname === 's3.us-west-004.backblazeb2.com' && request.headers.get('Range') === 'bytes=0-0') {
    const version = url.searchParams.get('versionId');
    const file = providerFiles.get(version);
    const expectedBucketName = file?.bucketId === 'fixture-bucket-b' ? b2AccountBBucket : b2Bucket;
    if (file && !unavailable.has(version) && url.searchParams.has('X-Amz-Signature')
      && decodeURIComponent(url.pathname) === `/${expectedBucketName}/${file.fileName}`) {
      const bytes = fixtureAudio.get(version);
      return new Response(bytes.subarray(0, 1), { status: 206, headers: {
        'x-amz-version-id': version, 'Content-Range': `bytes 0-0/${bytes.length}`, 'Content-Length': '1',
      } });
    }
  }
  return new Response(null, { status: 500 });
}

const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    export { createUploadWorker } from './cloudflare/worker.js';
    export { createListeningAuthoringWorkerHandlers } from './cloudflare/src/upload-worker/listening-authoring/worker.ts';
    export { FirebaseRestListeningAuthoringRepository } from './cloudflare/src/upload-worker/listening-authoring/repository.ts';
    export { handleCreateHomeworkAssignment } from './r2-backup-worker/src/homework/assignments.ts';
  ` },
  bundle: true, platform: 'node', format: 'esm', write: false,
  banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
  plugins: [{
    name: 'fixture-unused-durable-object',
    setup(plugin) {
      plugin.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'workers', namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class DurableObject {}' }));
      plugin.onResolve({ filter: /\.(node|wasm)$/ }, ({ path }) => ({ path, external: true }));
    },
  }],
});
const bundleDir = new URL('../../tmp/', import.meta.url);
await mkdir(bundleDir, { recursive: true });
const bundleFile = new URL('external-audio-qa-worker.mjs', bundleDir);
await writeFile(bundleFile, bundle.outputFiles[0].contents);
const { createUploadWorker, createListeningAuthoringWorkerHandlers,
  FirebaseRestListeningAuthoringRepository, handleCreateHomeworkAssignment } = await import(bundleFile.href);
globalThis.fetch = fixtureFetch;
const repo = new FirebaseRestListeningAuthoringRepository({
  env: { ...env, R2_BUCKET: r2 }, fetchImpl: fixtureFetch, getAccessToken: async () => 'owner',
});
const worker = createUploadWorker({
  firebaseVerifier: {
    async verifyAuthorizationHeader(header) {
      if (!header?.startsWith('Bearer ')) return { valid: false };
      const lookup = await realFetch(`${auth}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=local-dev-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: header.slice(7) }),
      });
      if (!lookup.ok) return { valid: false };
      const uid = (await lookup.json()).users?.[0]?.localId;
      return { valid: typeof uid === 'string', uid };
    },
  },
  listeningAuthoringHandlers: createListeningAuthoringWorkerHandlers({ repository: repo }),
});

// The CLI loads rules into its default namespace. The app uses explicit demo namespaces.
for (const [origin, namespace, rulesFile] of [
  [rtdb, project, '../../database.rules.json'],
  [privateRtdb, privateProject, '../../cloudflare/external-audio.database.rules.json'],
]) {
  const rules = await readFile(new URL(rulesFile, import.meta.url), 'utf8');
  const response = await firebaseRequest(origin, namespace, '/.settings/rules.json', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: rules,
  });
  if (!response.ok) throw new Error(`Could not initialize fixture rules for ${namespace}`);
  await response.body?.cancel();
}
const firestoreRules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
const firestoreRulesResponse = await realFetch(`${firestore}/emulator/v1/projects/${project}:securityRules`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rules: { files: [{ content: firestoreRules }] } }),
});
if (!firestoreRulesResponse.ok) throw new Error('Could not initialize fixture Firestore rules');
await firestoreRulesResponse.body?.cancel();

const respond = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};
// Re-address only synthetic file grants so a normal local browser can play
// the fixture without Playwright's HTTPS interception.
function browserMediaGrant(body) {
  if (!browserMediaKey || typeof body?.url !== 'string' || !Number.isSafeInteger(body.expiresAt)) return body;
  const providerUrl = new URL(body.url);
  const version = providerUrl.searchParams.get('versionId');
  if (providerUrl.hostname !== 's3.us-west-004.backblazeb2.com' || !fixtureAudio.has(version)) return body;
  const { expiresAt } = body;
  const url = new URL('/fixture/audio', workerOrigin);
  url.searchParams.set('versionId', version);
  url.searchParams.set('expiry', String(expiresAt));
  url.searchParams.set('signature', signBrowserMedia(version, expiresAt).toString('hex'));
  return { ...body, url: url.href };
}

function signBrowserMedia(version, expiresAt) {
  return createHmac('sha256', browserMediaKey).update(JSON.stringify([version, expiresAt])).digest();
}

function serveBrowserMedia(incoming, response, url) {
  const origin = incoming.headers.origin;
  if (![teacherOrigin, 'http://localhost:5174'].includes(origin)) return respond(response, 403, { error: 'origin_denied' });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Content-Range', Vary: 'Origin' };
  if (incoming.method === 'OPTIONS') {
    response.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' });
    return response.end();
  }
  const version = url.searchParams.get('versionId');
  const expiresAt = Number(url.searchParams.get('expiry'));
  const signature = Buffer.from(url.searchParams.get('signature') ?? '', 'hex');
  const bytes = fixtureAudio.get(version);
  if (!['GET', 'HEAD'].includes(incoming.method) || !bytes || unavailable.has(version)
    || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()
    || signature.length !== 32 || !timingSafeEqual(signature, signBrowserMedia(version, expiresAt))) {
    response.writeHead(403, cors);
    return response.end();
  }
  const rangeHeader = incoming.headers.range;
  const range = /^bytes=(\d+)-(\d*)$/u.exec(rangeHeader ?? '');
  const from = range ? Number(range[1]) : 0;
  const to = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  if ((rangeHeader && !range) || from > to) {
    response.writeHead(416, { ...cors, 'Content-Range': `bytes */${bytes.length}` });
    return response.end();
  }
  response.writeHead(range ? 206 : 200, { ...cors, 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/wav',
    'Content-Length': to - from + 1, 'Cache-Control': 'no-store',
    ...(range ? { 'Content-Range': `bytes ${from}-${to}/${bytes.length}` } : {}),
  });
  return response.end(incoming.method === 'HEAD' ? undefined : bytes.subarray(from, to + 1));
}

const server = createHttpServer(async (incoming, response) => {
  const url = new URL(incoming.url, workerOrigin);
  try {
    if (url.pathname === '/health') return respond(response, 200, { ready: true, r2Size: audio.length, r2Checksum: audioHash });
    if (browserMediaKey && url.pathname === '/fixture/audio') return serveBrowserMedia(incoming, response, url);
    if (url.pathname === '/legacy-r2-fixture.wav' && incoming.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
      return response.end(audio);
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (url.pathname === '/fixture/thcs-images' && incoming.method === 'POST') {
      const { keys, seed = false, failCopy } = JSON.parse(body.toString());
      failImageCopy = failCopy;
      for (const key of keys) {
        if (seed && key.startsWith('temp/images/')) images.set(key, { bytes: image, httpMetadata: { contentType: 'image/png' } });
      }
      return respond(response, 200, keys.map((key) => ({ exists: images.has(key), copies: imageCopies.get(key) ?? 0 })));
    }
    if (incoming.method === 'GET' && /^\/(?:temp\/)?images\//u.test(url.pathname)) {
      const stored = images.get(url.pathname.slice(1));
      if (!stored) return respond(response, 404, { error: 'image_missing' });
      response.writeHead(200, { 'Content-Type': stored.httpMetadata.contentType, 'Cache-Control': 'no-store' });
      return response.end(stored.bytes);
    }
    if (url.pathname === '/fixture/missing' && incoming.method === 'POST') {
      const { version, missing = true } = JSON.parse(body.toString());
      if (missing) unavailable.add(version);
      else unavailable.delete(version);
      return respond(response, 200, { ok: true });
    }
    if (url.pathname === '/fixture/newer-version' && incoming.method === 'POST') {
      newerVersionAvailable = body.length ? JSON.parse(body.toString()).enabled !== false : true;
      return respond(response, 200, { ok: true });
    }
    if (url.pathname === '/fixture/public-listening' && incoming.method === 'POST') {
      const { enabled = true, rateLimited = false } = JSON.parse(body.toString());
      publicListeningEnabled = enabled === true;
      denyPlayback = rateLimited === true;
      return respond(response, 200, { ok: true });
    }
    const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body.length ? { body } : {}) });
    if (url.pathname === '/api/homework/assignments' && incoming.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Origin': teacherOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
      return response.end();
    }
    const requestEnv = {
      ...env, EXTERNAL_AUDIO_PUBLIC_LISTENING_ENABLED: publicListeningEnabled ? 'enabled' : 'disabled',
    };
    const result = url.pathname === '/api/homework/assignments'
      ? await handleCreateHomeworkAssignment(request, {
        ...requestEnv, LOCAL_EMULATOR_AUTH: 'true', FIREBASE_DB_URL: `${rtdb}?ns=${project}`, FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      })
      : await worker.fetch(request, requestEnv, {});
    const headers = Object.fromEntries(result.headers);
    const bodyBytes = Buffer.from(await result.arrayBuffer());
    if (browserMediaKey && result.ok && result.headers.get('content-type')?.includes('application/json')) {
      const original = JSON.parse(bodyBytes.toString());
      const grant = browserMediaGrant(original);
      if (grant !== original) {
        delete headers['content-length'];
        response.writeHead(result.status, headers);
        return response.end(JSON.stringify(grant));
      }
    }
    response.writeHead(result.status, headers);
    response.end(bodyBytes);
  } catch (error) {
    console.error('Local Worker fixture error', error instanceof Error ? error.name : 'unknown');
    respond(response, 500, { error: 'fixture_failed' });
  }
});
server.listen(8787, 'localhost');
