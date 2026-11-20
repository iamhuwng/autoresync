import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import * as tar from 'tar';
import { fileURLToPath } from 'node:url';
import {
  assertBuiltArtifact,
  assertCleanWorkingTree,
  assertQualificationFirebaseValues,
  cleanParentEnv,
  deployHosting,
  findForbiddenBundleMarker,
  hostingReleaseMessage,
  readProductionEnv,
  selectReleaseSource,
  verifyExistingHosting,
  writeOperationOutcome,
} from '../deploy-live.mjs';
import { assertLocalEmulators, importFirestoreDocuments } from '../import-live-firebase.mjs';
import { replaceSnapshot } from '../local-firebase.mjs';
import { collectSourceState } from '../release-check.mjs';
import { assertHostingArtifact, hostingRollbackCommand, waitForHostingLive } from '../release-evidence.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deploymentScript = path.join(repositoryRoot, 'scripts/deploy-live.mjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

test('qualification Firebase configuration is all-or-nothing and rejects local values', () => {
  const keys = ['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID', 'HOSTING_SITE'].map(key => `VITE_FIREBASE_QUALIFICATION_${key}`);
  const complete = Object.fromEntries(keys.map(key => [key, `qualification-${key.toLowerCase()}`]));
  assert.doesNotThrow(() => assertQualificationFirebaseValues(complete));
  assert.throws(() => assertQualificationFirebaseValues({ ...complete, [keys[0]]: '' }), /all VITE_FIREBASE_QUALIFICATION/u);
  assert.throws(() => assertQualificationFirebaseValues({ ...complete, [keys[2]]: 'http://localhost:9000' }), /placeholder or local-only/u);
});

test('local startup rejects missing Worker secrets before Firebase or environment setup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luyentap-startup-test-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await writeFile(path.join(root, 'scripts/local-dev.mjs'), await readFile(path.join(repositoryRoot, 'scripts/local-dev.mjs')));
    const marker = path.join(root, 'setup-started');
    const setup = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); process.exit(23);`;
    await writeFile(path.join(root, 'scripts/dev-env.mjs'), setup);
    await writeFile(path.join(root, 'scripts/local-firebase.mjs'), setup);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/local-dev.mjs'), '5173'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing or unreadable .*\.dev\.vars/u);
    await assert.rejects(() => access(marker), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

const runGuard = (envFile) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [deploymentScript, '--build-only'], {
    cwd: repositoryRoot,
    env: { ...process.env, LUYENTAP_PRODUCTION_ENV_FILE: envFile },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('error', reject);
  child.on('close', (status) => resolve({ status, output }));
});

const validFirebaseEnv = `
VITE_FIREBASE_API_KEY=test-production-key
VITE_FIREBASE_AUTH_DOMAIN=temp-a1437.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://temp-a1437-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=temp-a1437
VITE_FIREBASE_STORAGE_BUCKET=temp-a1437.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:test
VITE_FIREBASE_LOCAL_ONLY=false
VITE_HOMEWORK_NOTIFICATION_URL=https://luyentap-notification-firestore-qa.iamhuwng.workers.dev
VITE_WRITING_NOTIFICATION_URL=https://luyentap-notification-firestore-qa.iamhuwng.workers.dev
VITE_HOMEWORK_RESULT_AUTHORITY_URL=https://luyentap-notification-firestore-qa.iamhuwng.workers.dev
VITE_COURSE_ENROLLMENT_APPROVAL_URL=https://luyentap-notification-firestore-qa.iamhuwng.workers.dev/course-enrollment-approval
VITE_THCS_GEMMA_WORKER_URL=https://thcs-gemma.iamhuwng.workers.dev
VITE_READING_V2_ROLLOUT_MODE=public
VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY=opt-in
VITE_READING_PASSAGE_LIBRARY=enabled
VITE_READING_PASSAGE_HOMEWORK=enabled
VITE_MATERIAL_BOOKS=enabled
VITE_MATERIAL_BOOK_EDITOR=enabled
VITE_BOOK_ACTIVITY_CREATE_PRESENTATION=disabled
VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION=disabled
VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION=disabled
VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION=disabled
VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION=disabled
VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION=disabled
`;

test('production and qualification environment identities stay separate', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-env-identity-test-'));
  const productionPath = path.join(tempDir, '.env.production');
  const qualificationPath = path.join(tempDir, '.env.qualification');
  const qualification = `VITE_FIREBASE_QUALIFICATION_API_KEY=qualification-key
VITE_FIREBASE_QUALIFICATION_HOSTING_SITE=qualification-site
VITE_FIREBASE_QUALIFICATION_AUTH_DOMAIN=qualification-project.firebaseapp.com
VITE_FIREBASE_QUALIFICATION_DATABASE_URL=https://qualification-project-default-rtdb.firebaseio.com
VITE_FIREBASE_QUALIFICATION_PROJECT_ID=qualification-project
VITE_FIREBASE_QUALIFICATION_STORAGE_BUCKET=qualification-project.firebasestorage.app
VITE_FIREBASE_QUALIFICATION_MESSAGING_SENDER_ID=987654321
VITE_FIREBASE_QUALIFICATION_APP_ID=1:987654321:web:qualification
`;
  const previousProduction = process.env.LUYENTAP_PRODUCTION_ENV_FILE;
  const previousQualification = process.env.LUYENTAP_QUALIFICATION_ENV_FILE;
  try {
    await writeFile(productionPath, validFirebaseEnv);
    await writeFile(qualificationPath, qualification);
    process.env.LUYENTAP_PRODUCTION_ENV_FILE = productionPath;
    process.env.LUYENTAP_QUALIFICATION_ENV_FILE = qualificationPath;
    const loaded = await readProductionEnv(repositoryRoot);
    assert.equal(loaded.envFingerprint, crypto.createHash('sha256').update(validFirebaseEnv).digest('hex'));
    assert.notEqual(loaded.buildInputFingerprint, loaded.envFingerprint);
    assert.equal(loaded.env.VITE_FIREBASE_QUALIFICATION_PROJECT_ID, 'qualification-project');
    await rm(loaded.tempEnvDir, { recursive: true, force: true });
    await writeFile(productionPath, `${validFirebaseEnv}\n${qualification}`);
    await assert.rejects(() => readProductionEnv(repositoryRoot), /belongs in LUYENTAP_QUALIFICATION_ENV_FILE/u);
  } finally {
    if (previousProduction === undefined) delete process.env.LUYENTAP_PRODUCTION_ENV_FILE;
    else process.env.LUYENTAP_PRODUCTION_ENV_FILE = previousProduction;
    if (previousQualification === undefined) delete process.env.LUYENTAP_QUALIFICATION_ENV_FILE;
    else process.env.LUYENTAP_QUALIFICATION_ENV_FILE = previousQualification;
    await rm(tempDir, { recursive: true, force: true });
  }
});

const assertBlocked = async (suffix, expectedMessage, baseEnv = validFirebaseEnv) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-deploy-test-'));
  const envFile = path.join(tempDir, '.env.production');
  try {
    await writeFile(envFile, `${baseEnv}\n${suffix}\n`);
    const result = await runGuard(envFile);
    assert.equal(result.status, 1);
    assert.match(result.output, expectedMessage);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

test('production route rejects emulator configuration before building', async () => {
  await assertBlocked('VITE_FIREBASE_DATABASE_EMULATOR_HOST=localhost:9000', /VITE_FIREBASE_DATABASE_EMULATOR_HOST is present/u);
});

test('production route rejects browser provider credential settings before building', async () => {
  for (const setting of ['VITE_GEMINI_API_KEY_1', 'VITE_GROQ_API_KEY']) {
    await assertBlocked(`${setting}=test-only-provider-key`, /provider credential setting/u);
  }
});

test('production route requires reviewed ordinary notification endpoints', async () => {
  await assertBlocked('VITE_HOMEWORK_NOTIFICATION_URL=', /ordinary notification endpoint/u);
  await assertBlocked('VITE_COURSE_ENROLLMENT_APPROVAL_URL=https://unreviewed.example.test/course-enrollment-approval', /ordinary notification endpoint/u);
});

test('production route requires the reviewed server-side AI gateway', async () => {
  await assertBlocked('VITE_THCS_GEMMA_WORKER_URL=', /reviewed AI gateway/u);
});

test('production route preserves public Reading V2 before building', async () => {
  const expected = /VITE_READING_V2_ROLLOUT_MODE must be public/u;
  await assertBlocked('', expected, validFirebaseEnv.replace('VITE_READING_V2_ROLLOUT_MODE=public', ''));
  for (const mode of ['', 'off', 'teacher-preview', 'internal-only', 'publc']) {
    await assertBlocked(`VITE_READING_V2_ROLLOUT_MODE=${mode}`, expected);
  }
});

test('production route preserves existing Reading passage capabilities', async () => {
  for (const [key, mode] of Object.entries({
    VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY: 'opt-in',
    VITE_READING_PASSAGE_LIBRARY: 'enabled',
    VITE_READING_PASSAGE_HOMEWORK: 'enabled',
  })) {
    const expected = new RegExp(`${key} must be ${mode}`, 'u');
    await assertBlocked('', expected, validFirebaseEnv.replace(`${key}=${mode}`, ''));
    await assertBlocked(`${key}=disabled`, expected);
  }
});

test('production route preserves existing Books while PDF Activity rollout remains disabled', async () => {
  for (const [key, mode] of Object.entries({
    VITE_MATERIAL_BOOKS: 'enabled',
    VITE_MATERIAL_BOOK_EDITOR: 'enabled',
    VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'disabled',
    VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION: 'disabled',
    VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION: 'disabled',
    VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION: 'disabled',
    VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'disabled',
    VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'disabled',
  })) {
    const expected = new RegExp(`${key} must be ${mode}`, 'u');
    await assertBlocked('', expected, validFirebaseEnv.replace(`${key}=${mode}`, ''));
    await assertBlocked(`${key}=${mode === 'enabled' ? 'disabled' : 'enabled'}`, expected);
  }
});

test('development configuration accepts the gateway without browser provider keys', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-dev-env-test-'));
  try {
    await writeFile(path.join(tempDir, '.env'), validFirebaseEnv);
    const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/dev-env.mjs'), 'check'], {
      cwd: repositoryRoot, env: { ...cleanParentEnv(process.env), LUYENTAP_ENV_DIR: tempDir },
      encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(tempDir, { recursive: true, force: true }); }
});

test('production route rejects a database from another Firebase project', async () => {
  await assertBlocked('VITE_FIREBASE_DATABASE_URL=https://other-default-rtdb.firebaseio.com', /must identify the temp-a1437 Realtime Database/u);
});

test('production route rejects demo and local endpoints', async () => {
  await assertBlocked('VITE_BACKUP_WORKER_URL=https://demo-preview.example.test', /VITE_BACKUP_WORKER_URL contains a local\/demo endpoint/u);
});

test('production route rejects alternate loopback endpoints', async () => {
  await assertBlocked('VITE_BACKUP_WORKER_URL=https://127.0.0.2:8787', /VITE_BACKUP_WORKER_URL contains a local\/demo endpoint/u);
  await assertBlocked('VITE_BACKUP_WORKER_URL=https://[::1]:8787', /VITE_BACKUP_WORKER_URL contains a local\/demo endpoint/u);
});

test('production route rejects a different Firebase project', async () => {
  await assertBlocked('VITE_FIREBASE_PROJECT_ID=other-project', /VITE_FIREBASE_PROJECT_ID must be temp-a1437/u);
});

test('production route rejects a different Auth domain', async () => {
  await assertBlocked('VITE_FIREBASE_AUTH_DOMAIN=other-project.firebaseapp.com', /VITE_FIREBASE_AUTH_DOMAIN must be temp-a1437\.firebaseapp.com/u);
});

test('production route rejects a different Storage bucket', async () => {
  await assertBlocked('VITE_FIREBASE_STORAGE_BUCKET=other-project.appspot.com', /VITE_FIREBASE_STORAGE_BUCKET must identify the temp-a1437 bucket/u);
});

test('production route rejects local-only mode and placeholders', async (t) => {
  await t.test('local-only mode', async () => {
    await assertBlocked('VITE_FIREBASE_LOCAL_ONLY=true', /VITE_FIREBASE_LOCAL_ONLY=true is a local-only setting/u);
  });
  await t.test('placeholder Firebase key', async () => {
    await assertBlocked('VITE_FIREBASE_API_KEY=your_firebase_api_key', /VITE_FIREBASE_API_KEY is still a placeholder/u);
  });
});

test('production route rejects a missing required Firebase value', async () => {
  await assertBlocked('VITE_FIREBASE_APP_ID=', /VITE_FIREBASE_APP_ID is missing or still a placeholder/u);
});

test('production route scrubs inherited environment values', () => {
  assert.deepEqual(cleanParentEnv({
    PATH: 'safe',
    VITE_FIREBASE_PROJECT_ID: 'wrong-project',
    VITE_FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000',
    LUYENTAP_ENV_DIR: 'old-env',
    LUYENTAP_VITE_CACHE_DIR: 'old-cache',
  }), { PATH: 'safe' });
});

test('production route detects local bundle markers', () => {
  assert.equal(findForbiddenBundleMarker('http://localhost:9000'), 'localhost:9000');
  assert.equal(findForbiddenBundleMarker('http://localhost:5001'), 'localhost:5001');
  assert.match(findForbiddenBundleMarker('https://127.0.0.1:9000/api'), /127\.0\.0\.1:9000/u);
  assert.match(findForbiddenBundleMarker('https://127.0.0.2:8787/api'), /127\.0\.0\.2:8787/u);
  assert.match(findForbiddenBundleMarker('https://[::1]:5001/api'), /\[::1\]:5001/u);
  assert.equal(findForbiddenBundleMarker('https://demo-project.example'), undefined);
  assert.equal(findForbiddenBundleMarker('https://demo-luyentap-local.example'), 'demo-luyentap-local');
  assert.equal(findForbiddenBundleMarker('https://temp-a1437.web.app'), undefined);
});

test('production deploy blocks a dirty working tree', () => {
  assert.throws(
    () => assertCleanWorkingTree({ status: 0, stdout: ' M src/App.jsx\n' }),
    /working tree has uncommitted changes/u,
  );
  assert.doesNotThrow(() => assertCleanWorkingTree({ status: 0, stdout: '' }));
});

test('build-only bootstrap blocks dirty source before building', async () => {
  const dirtyPath = path.join(repositoryRoot, `.release-safety-dirty-${process.pid}-${Date.now()}`);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-deploy-test-'));
  const envFile = path.join(tempDir, '.env.production');
  try {
    await writeFile(dirtyPath, 'deliberately unbound source\n', { flag: 'wx' });
    await writeFile(envFile, validFirebaseEnv);
    const result = await runGuard(envFile);
    assert.equal(result.status, 1);
    assert.match(result.output, /working tree has uncommitted changes/u);
    assert.doesNotMatch(result.output, /Build and local-value checks passed/u);
  } finally {
    await unlink(dirtyPath).catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('live sync preflights local Firebase routes with an empty Firestore database', async () => {
  const requested = [];
  await assertLocalEmulators(async (url, options) => {
    requested.push({ url, redirect: options.redirect });
    return {
      ok: true,
      status: 200,
      body: null,
      headers: { get: () => 'demo-luyentap-local' },
      text: async () => JSON.stringify(url.includes(':9099/')
        ? { kind: 'identitytoolkit#DownloadAccountResponse' }
        : { collectionIds: [] }),
    };
  });
  assert.deepEqual(requested, [
    { url: 'http://localhost:9000/.json?ns=demo-luyentap-local&shallow=true', redirect: 'error' },
    { url: 'http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/demo-luyentap-local/accounts:batchGet?maxResults=1', redirect: 'error' },
    { url: 'http://localhost:8080/v1/projects/demo-luyentap-local/databases/(default)/documents:listCollectionIds', redirect: 'error' },
  ]);
});

test('live sync stops before writing when a local emulator namespace rejects its project', async () => {
  await assert.rejects(
    () => assertLocalEmulators(async () => ({ ok: false, status: 404, body: null })),
    /Local emulator preflight rejected/u,
  );
});

test('live sync accepts omitted empty Firestore collection IDs but rejects malformed bodies', async () => {
  for (const [firestoreBody, valid] of [[{}, true], [null, false], [[], false], ['', false], [{ collectionIds: null }, false], [{ unexpected: true }, false]]) {
    const preflight = () => assertLocalEmulators(async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => 'demo-luyentap-local' },
      text: async () => JSON.stringify(url.includes(':9099/')
        ? { kind: 'identitytoolkit#DownloadAccountResponse' }
        : firestoreBody),
    }));
    if (valid) {
      await preflight();
    } else {
      await assert.rejects(preflight, /unexpected emulator response/u);
    }
  }
});

test('live sync rejects a redirected local emulator response', async () => {
  await assert.rejects(
    () => assertLocalEmulators(async () => ({
      ok: true,
      status: 200,
      url: 'https://unexpected.example.test/redirected',
      headers: { get: () => 'demo-luyentap-local' },
    })),
    /Refusing redirected Firebase request/u,
  );
});

test('live sync rejects wrong project and invalid emulator responses', async () => {
  await assert.rejects(
    () => assertLocalEmulators(async () => ({ ok: true, headers: { get: () => 'wrong-project' } })),
    /wrong Realtime Database project/u,
  );
  for (const invalidPort of [9099, 8080]) {
    await assert.rejects(
      () => assertLocalEmulators(async (url) => ({
        ok: true,
        headers: { get: () => 'demo-luyentap-local' },
        text: async () => JSON.stringify(url.includes(`:${invalidPort}/`)
          ? { unexpected: true }
          : { kind: 'identitytoolkit#DownloadAccountResponse' }),
      })),
      /unexpected emulator response/u,
    );
  }
});

test('Firestore import writes only to the local project and refuses redirects', async () => {
  const document = { name: 'projects/temp-a1437/databases/(default)/documents/config/example', fields: { enabled: { booleanValue: true } } };
  const requests = [];
  await importFirestoreDocuments([document], async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ status: [{}] }) };
  });
  assert.equal(requests[0].url, 'http://localhost:8080/v1/projects/demo-luyentap-local/databases/(default)/documents:batchWrite');
  assert.equal(requests[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(requests[0].options.body).writes, [{ update: { ...document, name: 'projects/demo-luyentap-local/databases/(default)/documents/config/example' } }]);
  await assert.rejects(
    () => importFirestoreDocuments([document], async () => ({ ok: true, url: 'https://unexpected.example.test' })),
    /Refusing redirected Firebase request/u,
  );
});

test('snapshot replacement preserves the previous snapshot on failure', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-snapshot-test-'));
  const destinationDir = path.join(tempDir, 'snapshot');
  const stagingDir = path.join(tempDir, 'snapshot.next');
  try {
    await mkdir(destinationDir);
    await writeFile(path.join(destinationDir, 'data.json'), 'previous');
    await assert.rejects(() => replaceSnapshot(stagingDir, destinationDir), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(destinationDir, 'data.json'), 'utf8'), 'previous');
    await mkdir(stagingDir);
    await writeFile(path.join(stagingDir, 'data.json'), 'new');
    await replaceSnapshot(stagingDir, destinationDir);
    assert.equal(await readFile(path.join(destinationDir, 'data.json'), 'utf8'), 'new');
    await assert.rejects(() => access(`${destinationDir}.previous`), { code: 'ENOENT' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('production source override is rejected', () => {
  assert.equal(selectReleaseSource(), repositoryRoot);
  assert.throws(() => selectReleaseSource({ sourceCwd: os.tmpdir() }), /external source cwd/u);
});

test('waitForHostingLive polls provider finalization with bounded backoff', async () => {
  const before = { provider: { version: 'old', releaseTime: 'before', message: '' } };
  const current = { provider: { version: 'new', releaseTime: 'after', message: '[luyentap:operation-1] release' } };
  let providerCalls = 0;
  let clock = 0;
  const sleeps = [];
  const result = await waitForHostingLive({
    expectedManifestFingerprint: 'expected', beforeProviderIdentity: 'old@before', operationId: 'operation-1',
    observeProvider: () => (++providerCalls < 3 ? before : current),
    observeSource: async () => ({ fingerprint: 'expected', evidenceRef: 'fixture://manifest' }),
    timeoutMs: 10_000, initialDelayMs: 100, maxDelayMs: 500, backoffFactor: 1.5,
    now: () => clock, sleep: async delay => { sleeps.push(delay); clock += delay; },
  });
  assert.equal(result.verification, 'passed');
  assert.equal(result.attempts, 1);
  assert.deepEqual(sleeps, [100, 150]);
});

test('waitForHostingLive retries stale and transient live manifest readback', async () => {
  const provider = { provider: { version: 'new', releaseTime: 'after', message: '[luyentap:operation-2] release' } };
  let sourceCalls = 0;
  const result = await waitForHostingLive({
    expectedManifestFingerprint: 'expected', beforeProviderIdentity: 'old@before', operationId: 'operation-2',
    observeProvider: () => provider,
    observeSource: async () => {
      sourceCalls += 1;
      if (sourceCalls === 3) throw new Error('transient CDN readback');
      return { fingerprint: sourceCalls < 4 ? 'stale' : 'expected', evidenceRef: 'fixture://manifest' };
    },
    timeoutMs: 10_000, initialDelayMs: 0, maxDelayMs: 0, sleep: async () => {},
  });
  assert.equal(result.verification, 'passed');
  assert.equal(result.attempts, 4);
});

test('waitForHostingLive fails fast when another release becomes current', async () => {
  const sleeps = [];
  await assert.rejects(() => waitForHostingLive({
    expectedManifestFingerprint: 'expected', beforeProviderIdentity: 'old@before', operationId: 'operation-3',
    observeProvider: () => ({ provider: { version: 'other', releaseTime: 'after', message: '[luyentap:other-id] release' } }),
    observeSource: async () => ({ fingerprint: 'expected' }), timeoutMs: 10_000,
    sleep: async delay => sleeps.push(delay),
  }), /not confirmed/u);
  assert.deepEqual(sleeps, []);
});

test('waitForHostingLive rejects non-finite or missing polling inputs', async () => {
  const valid = {
    expectedManifestFingerprint: 'expected',
    beforeProviderIdentity: 'old@before',
    operationId: 'operation-4',
    observeProvider: () => ({ provider: { version: 'new', releaseTime: 'after', message: '[luyentap:operation-4] release' } }),
    observeSource: async () => ({ fingerprint: 'expected' }),
  };
  for (const invalid of [
    { expectedManifestFingerprint: '' },
    { operationId: ' ' },
    { timeoutMs: NaN },
    { timeoutMs: Infinity },
    { timeoutMs: -1 },
    { initialDelayMs: -1 },
    { initialDelayMs: 500, maxDelayMs: 100 },
    { backoffFactor: 0.5 },
    { backoffFactor: Infinity },
  ]) {
    await assert.rejects(() => waitForHostingLive({ ...valid, ...invalid }), /Hosting readback/u);
  }
});

test('repository uses AGENTS.md as the escalation authority', async () => {
  await assert.rejects(() => readFile(path.join(repositoryRoot, 'CLAUDE.md')), { code: 'ENOENT' });
  await assert.rejects(() => readFile(path.join(repositoryRoot, 'GEMINI.md')), { code: 'ENOENT' });
  const agents = await readFile(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(agents, /Astra/iu);
});

test('Hosting release messages stay within Firebase limits', () => {
  const description = 'x'.repeat(278);
  const message = hostingReleaseMessage(description);
  assert.equal(message.length, 255);
  assert.equal(message.slice(-3), '...');
  assert.equal(hostingReleaseMessage('short release'), 'short release');
});

async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'deployment-safety-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.name', 'Deployment Test');
  git(cwd, 'config', 'user.email', 'deployment@example.invalid');
  await writeFile(path.join(cwd, '.gitignore'), 'dist/\n');
  await writeFile(path.join(cwd, 'index.html'), 'candidate');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  await writeFile(path.join(cwd, 'index.html'), 'candidate changed');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'candidate');
  const source = await collectSourceState(cwd, base);
  const envFingerprint = 'e'.repeat(64);
  const tree = source.tree;
  const artifactHash = hash('candidate artifact');
  const manifest = {
    schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1',
    revision: source.revision, tree, envFingerprint,
    files: [{ path: '/index.html', sha256: artifactHash }],
  };
  await mkdir(path.join(cwd, 'dist/.well-known'), { recursive: true });
  await writeFile(path.join(cwd, 'dist/index.html'), 'candidate artifact');
  await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), `${JSON.stringify(manifest)}\n`);
  const observation = {
    service: 'hosting', identity: 'temp-a1437/kahut1', revision: source.baseRevision,
    tree: git(cwd, 'rev-parse', `${base}^{tree}`), fingerprint: 'o'.repeat(64),
    manifest: { envFingerprint }, sourceKnown: true, evidenceRef: 'fixture://hosting',
  };
  return { cwd, base, source, envFingerprint, manifest, observation, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

const provider = (version, message = '') => ({
  provider: { version: `projects/temp-a1437/sites/kahut1/versions/${version}`, releaseTime: `${version}-time`, message },
  evidenceRef: 'fixture://provider',
});

test('hosting artifact validates exact files and rollback command', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await assertHostingArtifact(f.cwd, f.manifest);
  assert.equal(hostingRollbackCommand('projects/temp-a1437/sites/kahut1/versions/abc123'), 'firebase hosting:clone temp-a1437:kahut1@abc123 temp-a1437:kahut1:live --project temp-a1437');
  assert.throws(() => hostingRollbackCommand('projects/other/sites/kahut1/versions/abc'), /Invalid/u);
  await writeFile(path.join(f.cwd, 'dist/extra.txt'), 'unexpected');
  await assert.rejects(() => assertHostingArtifact(f.cwd, f.manifest), /unexpected/u);
  await unlink(path.join(f.cwd, 'dist/extra.txt'));
  await unlink(path.join(f.cwd, 'dist/index.html'));
  await assert.rejects(() => assertHostingArtifact(f.cwd, f.manifest), /missing/u);
});

test('built artifact binds revision, tree, environment, and digest and rejects unexpected entries', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const artifactSha256 = hash(JSON.stringify(f.manifest));
  const manifest = await assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: f.source, envFingerprint: f.envFingerprint, expectedHotfixes: [] });
  assert.equal(manifest.revision, f.source.revision);
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256: '0'.repeat(64), source: f.source, envFingerprint: f.envFingerprint }), /approved artifact digest/u);
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: { ...f.source, revision: '0'.repeat(40) }, envFingerprint: f.envFingerprint }), /assessed source/u);
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: f.source, envFingerprint: '0'.repeat(64) }), /environment fingerprint/u);
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: f.source, envFingerprint: f.envFingerprint, expectedHotfixes: [{ revision: 'd'.repeat(40) }] }), /hotfix metadata differs/u);

  await writeFile(path.join(f.cwd, 'dist/.env'), 'VITE_SECRET=must-not-upload');
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: f.source, envFingerprint: f.envFingerprint }), /unexpected artifact entry/u);
  await unlink(path.join(f.cwd, 'dist/.env'));

  const omitted = path.join(f.cwd, 'omitted.tar');
  tar.c({ file: omitted, cwd: path.join(f.cwd, 'dist'), portable: true, sync: true }, ['index.html']);
  const omittedRoot = await mkdtemp(path.join(os.tmpdir(), 'luyentap-artifact-omitted-'));
  try {
    await mkdir(path.join(omittedRoot, 'dist'), { recursive: true });
    tar.x({ file: omitted, cwd: path.join(omittedRoot, 'dist'), sync: true });
    await assert.rejects(() => assertBuiltArtifact({ cwd: omittedRoot, artifactSha256, source: f.source, envFingerprint: f.envFingerprint }), /manifest|missing|ENOENT/u);
  } finally { await rm(omittedRoot, { recursive: true, force: true }); }

  const retained = path.join(f.cwd, 'retained.tar');
  tar.c({ file: retained, cwd: path.join(f.cwd, 'dist'), portable: true, sync: true }, ['index.html', '.well-known']);
  const retainedRoot = await mkdtemp(path.join(os.tmpdir(), 'luyentap-artifact-retained-'));
  try {
    await mkdir(path.join(retainedRoot, 'dist'), { recursive: true });
    tar.x({ file: retained, cwd: path.join(retainedRoot, 'dist'), sync: true });
    assert.deepEqual(await assertBuiltArtifact({ cwd: retainedRoot, artifactSha256, source: f.source, envFingerprint: f.envFingerprint }), f.manifest);
  } finally { await rm(retainedRoot, { recursive: true, force: true }); }

  await writeFile(path.join(f.cwd, 'dist/index.html'), 'tampered');
  await assert.rejects(() => assertBuiltArtifact({ cwd: f.cwd, artifactSha256, source: f.source, envFingerprint: f.envFingerprint }), /artifact hash|hash differs/u);
});

test('deployHosting publishes and returns uniform outcome plus rollback and verify commands', async t => {
  const f = await fixture(); t.after(f.cleanup);
  let deployed = false;
  let operationId;
  let sourceReads = 0;
  const result = await deployHosting({
    cwd: f.cwd, base: f.base, env: {}, objective: 'candidate release',
    assessment: { decision: 'PASS', source: f.source, observed: f.observation, productionEnvFingerprint: f.envFingerprint },
    observeSource: async () => {
      sourceReads += 1;
      return sourceReads < 2
        ? f.observation
        : { ...f.observation, revision: f.source.revision, tree: f.source.tree, fingerprint: hash(JSON.stringify(f.manifest)), manifest: f.manifest, evidenceRef: 'fixture://live' };
    },
    observeProvider: () => deployed ? provider('new123', `[luyentap:${operationId}] candidate release`) : provider('old123'),
    runDeploy: async args => { deployed = true; operationId = args[args.indexOf('--message') + 1].match(/\[luyentap:([0-9a-f-]+)\]/u)[1]; assert(args.includes('firebase')); },
    poll: { timeoutMs: 10, initialDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
  });
  assert.equal(result.id, operationId);
  assert.equal(result.operationId, operationId);
  assert.equal(result.status, 'verified');
  assert.equal(result.siteUrl, 'https://kahut1.web.app');
  assert.equal(result.revision, f.source.revision);
  assert.equal(result.priorVersion, 'projects/temp-a1437/sites/kahut1/versions/old123');
  assert.equal(result.liveVersion, 'projects/temp-a1437/sites/kahut1/versions/new123');
  assert.match(result.rollbackCommand, /firebase hosting:clone temp-a1437:kahut1@old123 temp-a1437:kahut1:live --project temp-a1437/u);
  assert.match(result.verifyCommand, /npm run release:verify-existing -- --operation-id/u);
});

test('deployHosting rejects duplicate publication, tampered artifacts, caller dependency evidence, and pre-deploy drift without rollback spam', async t => {
  const f = await fixture(); t.after(f.cleanup);
  let deploys = 0;
  const duplicateSource = await collectSourceState(f.cwd, f.source.revision);
  const duplicateAssessment = {
    decision: 'PASS', source: duplicateSource,
    observed: { ...f.observation, revision: f.source.revision, tree: f.source.tree, manifest: f.manifest },
    productionEnvFingerprint: f.envFingerprint,
  };
  await assert.rejects(() => deployHosting({ cwd: f.cwd, base: f.source.revision, env: {}, assessment: duplicateAssessment, observeProvider: () => provider('old123'), runDeploy: () => { deploys += 1; } }), /already published/u);

  const tampered = await fixture(); t.after(tampered.cleanup);
  await writeFile(path.join(tampered.cwd, 'dist/index.html'), 'tampered');
  await assert.rejects(() => deployHosting({
    cwd: tampered.cwd, base: tampered.base, env: {},
    assessment: { decision: 'PASS', source: tampered.source, observed: tampered.observation, productionEnvFingerprint: tampered.envFingerprint },
    observeProvider: () => provider('old123'), runDeploy: () => { deploys += 1; },
  }), /hash differs|artifact/u);

  const staleHotfixes = await fixture(); t.after(staleHotfixes.cleanup);
  await assert.rejects(() => deployHosting({
    cwd: staleHotfixes.cwd, base: staleHotfixes.base, env: {},
    assessment: { decision: 'PASS', source: staleHotfixes.source, observed: staleHotfixes.observation, productionEnvFingerprint: staleHotfixes.envFingerprint, hotfixes: [{ revision: 'd'.repeat(40) }] },
    observeProvider: () => provider('old123'), runDeploy: () => { deploys += 1; },
  }), /hotfix metadata differs/u);

  const callerDeps = await fixture(); t.after(callerDeps.cleanup);
  await assert.rejects(() => deployHosting({
    cwd: callerDeps.cwd, base: callerDeps.base, env: {},
    assessment: { decision: 'PASS', source: callerDeps.source, observed: callerDeps.observation, productionEnvFingerprint: callerDeps.envFingerprint, hostingDependencies: { scope: 'hosting-dependencies' } },
    observeProvider: () => provider('old123'), runDeploy: () => { deploys += 1; },
  }), /caller-supplied Hosting dependency/u);

  const drift = await fixture(); t.after(drift.cleanup);
  const errors = [];
  const originalError = console.error;
  console.error = value => errors.push(String(value));
  try {
    await assert.rejects(
      () => deployHosting({
        cwd: drift.cwd, base: drift.base, env: {},
        assessment: { decision: 'PASS', source: drift.source, observed: drift.observation, productionEnvFingerprint: drift.envFingerprint },
        observeSource: async () => ({ ...drift.observation, fingerprint: 'changed-live' }),
        observeProvider: () => provider('old123'),
        runDeploy: () => { deploys += 1; },
      }),
      error => {
        assert.match(error.message, /production changed/u);
        assert.equal(error.operationId, undefined);
        assert.equal(error.rollbackCommand, undefined);
        return true;
      },
    );
  } finally { console.error = originalError; }
  assert.equal(errors.length, 0);
  assert.equal(deploys, 0);
});

test('deployHosting separates CLI spawn failures, deploy failures, and post-deploy readback failures', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const spawnErrors = [];
  const original = console.error;
  console.error = value => spawnErrors.push(String(value));
  try {
    const enoent = Object.assign(new Error('spawn firebase ENOENT'), { code: 'ENOENT' });
    await assert.rejects(() => deployHosting({
      cwd: f.cwd, base: f.base, env: {},
      assessment: { decision: 'PASS', source: f.source, observed: f.observation, productionEnvFingerprint: f.envFingerprint },
      observeSource: async () => f.observation,
      observeProvider: () => provider('old123'),
      runDeploy: () => { throw enoent; },
    }), error => {
      assert.equal(error.code, 'ENOENT');
      assert.equal(error.operationId, undefined);
      assert.equal(error.rollbackCommand, undefined);
      assert.equal(error.phase, undefined);
      return true;
    });
    assert.equal(spawnErrors.length, 0);

    const deployErrors = [];
    console.error = value => deployErrors.push(String(value));
    await assert.rejects(() => deployHosting({
      cwd: f.cwd, base: f.base, env: {},
      assessment: { decision: 'PASS', source: f.source, observed: f.observation, productionEnvFingerprint: f.envFingerprint },
      observeSource: async () => f.observation,
      observeProvider: () => provider('old123'),
      runDeploy: () => { throw new Error('deploy exited with 1'); },
    }), error => {
      assert.equal(error.phase, 'deploy');
      assert.match(error.rollbackCommand, /firebase hosting:clone/u);
      assert.match(error.verifyCommand, /release:verify-existing/u);
      return true;
    });
    assert(deployErrors.some(value => /verify live state before retrying/u.test(value)));
    assert(deployErrors.some(value => /Rollback command: firebase hosting:clone/u.test(value)));

    const readbackErrors = [];
    console.error = value => readbackErrors.push(String(value));
    await assert.rejects(() => deployHosting({
      cwd: f.cwd, base: f.base, env: {},
      assessment: { decision: 'PASS', source: f.source, observed: f.observation, productionEnvFingerprint: f.envFingerprint },
      observeSource: async () => f.observation,
      observeProvider: () => provider('old123'),
      runDeploy: () => {},
      poll: { timeoutMs: 0, initialDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
    }), error => {
      assert.equal(error.phase, 'readback');
      assert.match(error.message, /verification|timed out/u);
      assert.match(error.rollbackCommand, /firebase hosting:clone/u);
      assert.match(error.verifyCommand, /release:verify-existing/u);
      return true;
    });
    assert(readbackErrors.some(value => /live readback did not confirm/u.test(value)));
    assert(readbackErrors.some(value => /Rollback command: firebase hosting:clone/u.test(value)));
    assert(readbackErrors.some(value => /Verify command: npm run release:verify-existing/u.test(value)));
  } finally { console.error = original; }
});

test('verifyExistingHosting polls and validates operation, manifest, revision, and tree', async () => {
  const operationId = '00000000-0000-4000-8000-000000000000';
  let sourceAttempts = 0;
  const sleeps = [];
  const result = await verifyExistingHosting({
    operationId, expectedManifestSha256: 'a'.repeat(64), expectedRevision: 'b'.repeat(40), expectedTree: 'c'.repeat(40),
    observeProvider: () => provider('live123', `[luyentap:${operationId}] candidate`),
    observeSource: async () => {
      sourceAttempts += 1;
      return {
        revision: 'b'.repeat(40),
        tree: 'c'.repeat(40),
        fingerprint: sourceAttempts < 2 ? '0'.repeat(64) : 'a'.repeat(64),
        manifest: { files: [{}] },
        evidenceRef: 'fixture://source',
      };
    },
    poll: { timeoutMs: 1000, initialDelayMs: 50, maxDelayMs: 100, sleep: async ms => { sleeps.push(ms); } },
  });
  assert.equal(result.id, operationId);
  assert.equal(result.operationId, operationId);
  assert.equal(result.status, 'verified');
  assert.equal(result.siteUrl, 'https://kahut1.web.app');
  assert.equal(result.verifiedFiles, 1);
  assert.deepEqual(sleeps, [50]);
});

test('verifyExistingHosting rejects mismatch, mid-read change, invalid inputs, and timeout without loading env', async () => {
  const operationId = '00000000-0000-4000-8000-000000000000';
  await assert.rejects(() => verifyExistingHosting({}), /requires operationId/u);
  await assert.rejects(() => verifyExistingHosting({ expectedRevision: 'bad' }), /40-hex/u);
  await assert.rejects(() => verifyExistingHosting({ operationId: 'bad' }), /UUID/u);
  let providerRead = 0;
  await assert.rejects(() => verifyExistingHosting({
    operationId,
    observeProvider: () => provider(++providerRead === 1 ? 'v1' : 'v2', `[luyentap:${operationId}] x`),
    observeSource: async () => ({ fingerprint: 'a'.repeat(64), revision: 'b'.repeat(40), tree: 'c'.repeat(40), manifest: { files: [{}] } }),
    poll: { timeoutMs: 0, initialDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
  }), /provider release changed/u);
  await assert.rejects(() => verifyExistingHosting({
    expectedManifestSha256: 'a'.repeat(64),
    observeProvider: () => provider('live123', `[luyentap:${operationId}] x`),
    observeSource: async () => ({ fingerprint: 'b'.repeat(64), revision: 'c'.repeat(40), tree: 'd'.repeat(40) }),
    poll: { timeoutMs: 0, initialDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
  }), /timed out/u);

  const cliResult = spawnSync(process.execPath, [deploymentScript, '--verify-existing', 'not-an-operation'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, LUYENTAP_PRODUCTION_ENV_FILE: 'missing-production-environment' },
  });
  assert.equal(cliResult.status, 1);
  assert.match(cliResult.stderr, /operationId must be a UUID/u);
  assert.doesNotMatch(cliResult.stderr, /missing-production-environment/u);
  assert.doesNotMatch(cliResult.stdout, /Building|Deploying/u);
});

test('operation outcome writes configured structured JSON', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'outcome-test-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const file = path.join(cwd, 'outcome.json');
  await writeOperationOutcome({ file, outcome: { id: 'op', operationId: 'op', status: 'verified', siteUrl: 'https://kahut1.web.app' }, cwd });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { id: 'op', operationId: 'op', status: 'verified', siteUrl: 'https://kahut1.web.app' });
});

test('missing production environment is rejected before build and duplicate --build-only flag is accepted', async () => {
  const result = spawnSync(process.execPath, [deploymentScript, '--build-only', '--build-only'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, LUYENTAP_PRODUCTION_ENV_FILE: path.join(os.tmpdir(), 'missing-production-env') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing .*production-env/u);
});
