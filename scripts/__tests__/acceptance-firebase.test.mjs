import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { acceptanceFirebaseBoundary } from '../../src/services/acceptanceFirebaseBoundary.mjs';
import fs from 'node:fs';
import os from 'node:os';

const safe = {
  MODE: 'acceptance', VITE_FIREBASE_ACCEPTANCE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-luyentap-acceptance',
  VITE_FIREBASE_DATABASE_URL: 'http://localhost:19000?ns=demo-luyentap-acceptance',
  VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:19099',
  VITE_FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:19000',
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: 'localhost:19080',
  VITE_R2_UPLOAD_WORKER_URL: 'http://localhost:19087',
};

test('ordinary local Firebase startup only checks existing services', async () => {
  const url = new URL('../local-firebase.mjs', import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace(/^import[^\n]*\n/gmu, '')
    .replaceAll('import.meta.url', 'moduleUrl')
    .replace(/^export /gmu, '');
  let checked = 0;
  let loaded = 0;
  let preserved = 0;
  const reads = [];
  const manifest = { datasetId: 'fixture', generationId: 'generation', issues: [] };
  const forbidden = () => { throw new Error('Ordinary startup attempted a mutating setup operation'); };
  await runInNewContext(`(async () => { ${source} })()`, {
    assert, path, os, fileURLToPath, moduleUrl: url.href,
    process: { platform: 'linux', arch: 'x64', argv: ['node', fileURLToPath(url), 'start'], env: {} },
    console: { log() {}, error() {} },
    assertLocalEmulators: async () => { checked += 1; },
    readGeneration: async () => { loaded += 1; return { manifest, documents: [], inventory: {} }; },
    inventory: (database, auth, documents) => {
      assert.equal(database.users.teacher.email, 'teacher@test.com');
      assert.equal(auth.users[0].localId, 'teacher');
      assert.equal(documents.length, 0);
      return {};
    },
    assertInventoryPreserved: () => { preserved += 1; },
    datasetIssues: () => [],
    recoveryRoot: path.join(os.tmpdir(), 'read-only-recovery-fixture'),
    readFile: async file => {
      assert.equal(file, path.join(os.tmpdir(), 'read-only-recovery-fixture', 'status.json'));
      return JSON.stringify({ state: 'saved', ...manifest, completedAt: new Date().toISOString() });
    },
    AbortSignal,
    fetch: async (url, options) => {
      assert.equal(options.method, undefined);
      assert.equal(options.redirect, 'error');
      reads.push(url);
      return { ok: true, text: async () => JSON.stringify(url.includes(':9099/')
        ? { users: [{ localId: 'teacher', email: 'teacher@test.com' }] }
        : { users: { teacher: { email: 'teacher@test.com' } } }) };
    },
    net: { createConnection() {
      const socket = { once(event, callback) { if (event === 'connect') queueMicrotask(callback); }, destroy() {} };
      return socket;
    } },
    spawn: forbidden, spawnSync: forbidden, access: forbidden, mkdir: forbidden,
    rename: forbidden, rm: forbidden, writeFile: forbidden, cp: forbidden,
    atomicJson: forbidden, withCheckpointWriter: forbidden,
  });
  assert.equal(checked, 1);
  assert.equal(loaded, 1);
  assert.equal(preserved, 1);
  assert.deepEqual(reads, [
    'http://localhost:9000/.json?ns=demo-luyentap-local&format=export',
    'http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/demo-luyentap-local/accounts:batchGet?maxResults=-1',
  ]);
});

test('Vite validates preview CSP for builds and preview without rejecting local dev HTTP Workers', async () => {
  const configUrl = new URL('../../vite.config.js', import.meta.url);
  const source = (await readFile(configUrl, 'utf8'))
    .replace(/^import[^\n]*\n/gmu, '')
    .replace('export default defineConfig(', 'const configuration = defineConfig(')
    .replaceAll('import.meta.url', 'configUrl');
  const calls = [];
  const configure = runInNewContext(`${source}\nconfiguration`, {
    configUrl: configUrl.href, defineConfig: value => value, loadEnv: () => ({}),
    react: () => ({}), visualizer: () => ({}), fs, os, path, fileURLToPath,
    process: { env: { VITE_BOOK_SOURCE_CONTROL_WORKER_URL: 'http://localhost:8787' } },
    createBookSourcePreviewCsp: env => { calls.push(env); return "connect-src 'self'"; },
  });
  configure({ mode: 'development', command: 'serve', isPreview: false });
  assert.equal(calls.length, 0);
  for (const options of [
    { mode: 'production', command: 'build', isPreview: false },
    { mode: 'production', command: 'serve', isPreview: true },
  ]) {
    assert.equal(configure(options).preview.headers['Content-Security-Policy'], "connect-src 'self'");
  }
  assert.equal(calls.length, 2);
});
test('acceptance requires complete disposable Firebase isolation', () => {
  assert.deepEqual(acceptanceFirebaseBoundary(safe), { AUTH:19099, DATABASE:19000, FIRESTORE:19080 });
  for (const key of Object.keys(safe).filter(key => key !== 'MODE')) {
    assert.throws(() => acceptanceFirebaseBoundary({ ...safe, [key]: '' }));
  }
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_FIREBASE_PROJECT_ID:'temp-a1437' }));
});
test('acceptance rejects provider endpoints but production is unaffected', () => {
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_BOOK_SOURCE_CONTROL_WORKER_URL:'https://live.workers.dev' }));
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN:'https://s3.example.com' }));
  assert.equal(acceptanceFirebaseBoundary({ ...safe, MODE:'production' }), null);
});

test('Firebase bootstrap isolates normal development and preserves acceptance and production', async () => {
  const readSource = async (relativePath) => (await readFile(new URL(relativePath, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gmu, '');
  const launcherUrl = new URL('../local-dev.mjs', import.meta.url);
  const launcher = (await readSource('../local-dev.mjs')).replaceAll('import.meta.url', 'launcherUrl');
  let localEnv;
  runInNewContext(launcher, {
    path, fileURLToPath, launcherUrl: launcherUrl.href,
    accessSync() {}, constants: { R_OK: 4 },
    spawnSync: () => ({ status: 0 }),
    spawn: (_command, _args, options) => {
      localEnv = options.env;
      return { on() {}, kill() {} };
    },
    process: { execPath: 'node', argv: ['node', 'local-dev.mjs'], env: {}, on() {} },
  });
  const source = (await Promise.all(['../../src/services/firebaseCore.js', '../../src/services/firebase.js'].map(readSource)))
    .join('\n').replaceAll('import.meta.env', 'env').replaceAll('export const ', 'const ')
    .replace(/^export \{[^}]*\};/gmu, '');
  const bootstrap = (overrides = {}) => {
    const calls = [];
    const result = runInNewContext(`${source}\n({ isLocalDevelopment, isAcceptanceEmulatorBuild, analytics })`, {
      env: { ...localEnv, MODE: 'development', DEV: true, ...overrides }, acceptanceFirebaseBoundary,
      console: { log() {}, warn() {} }, window: {},
      initializeApp: () => ({}), getDatabase: () => ({}), getAuth: () => ({}),
      initializeFirestore: () => ({}), persistentLocalCache() {}, persistentMultipleTabManager() {},
      ref() {}, onValue() {}, GoogleAuthProvider: class { setCustomParameters() {} },
      connectAuthEmulator: (_auth, url) => calls.push(['auth', url]),
      connectDatabaseEmulator: (_db, host, port) => calls.push(['database', host, port]),
      connectFirestoreEmulator: (_db, host, port) => calls.push(['firestore', host, port]),
      getAnalytics: () => { calls.push(['analytics']); return {}; },
    });
    return { calls, ...result };
  };
  const local = bootstrap();
  assert.equal(local.isLocalDevelopment, true);
  assert.equal(local.analytics, null);
  assert.deepEqual(local.calls, [['database', 'localhost', 9000], ['auth', 'http://localhost:9099'], ['firestore', 'localhost', 8080]]);
  for (const [key, value] of Object.entries({
    VITE_FIREBASE_LOCAL_ONLY: 'false', VITE_LOCAL_DEV_BOOTSTRAP: '',
    VITE_FIREBASE_PROJECT_ID: 'temp-a1437', VITE_FIREBASE_AUTH_DOMAIN: 'temp-a1437.firebaseapp.com',
    VITE_FIREBASE_DATABASE_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'temp-a1437.appspot.com',
    VITE_R2_UPLOAD_WORKER_URL: 'https://live.workers.dev',
    VITE_THCS_GEMMA_WORKER_URL: 'https://live.workers.dev',
    VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: 'http://localhost:8787',
  })) assert.throws(() => bootstrap({ [key]: value }), /\[Firebase\]/u, key);
  for (const service of ['AUTH', 'DATABASE', 'FIRESTORE']) {
    const key = `VITE_FIREBASE_${service}_EMULATOR_HOST`;
    for (const host of ['', 'remote.example:9000', 'localhost:1', 'localhost:9000:extra']) {
      assert.throws(() => bootstrap({ [key]: host }), /\[Firebase\]/u, `${key}=${host}`);
    }
  }
  for (const DEV of [false, true]) {
    const acceptance = bootstrap({ ...safe, DEV, VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: '' });
    assert.equal(acceptance.isLocalDevelopment, false);
    assert.equal(acceptance.isAcceptanceEmulatorBuild, true);
    assert.equal(acceptance.analytics, null);
    assert.deepEqual(acceptance.calls, [['database', 'localhost', 19000], ['auth', 'http://localhost:19099'], ['firestore', 'localhost', 19080]]);
  }
  assert.deepEqual(bootstrap({ MODE: 'production', DEV: false }).calls, [['analytics']]);
});
