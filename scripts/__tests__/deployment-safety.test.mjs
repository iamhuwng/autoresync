import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deployHosting,
  assertCleanWorkingTree,
  assertReleaseAssessment,
  assertListeningHostingReady,
  selectReleaseSource,
  cleanParentEnv,
  findForbiddenBundleMarker,
} from '../deploy-live.mjs';
import { assertLocalEmulators, importFirestoreDocuments } from '../import-live-firebase.mjs';
import { replaceSnapshot } from '../local-firebase.mjs';
import { listReleases } from '../lib/releaseChangelog.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deploymentScript = path.join(repositoryRoot, 'scripts/deploy-live.mjs');

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

test('production deploy requires an explicit release baseline and source fingerprint', async () => {
  await assert.rejects(
    () => assertReleaseAssessment({ cwd: repositoryRoot }),
    /LUYENTAP_RELEASE_BASE/u,
  );
});

test('production deploy rejects environment drift after assessment', async () => {
  await assert.rejects(
    () => assertReleaseAssessment({
      baselinePath: 'tmp/baseline.json',
      baselineSha256: 'baseline',
      base: 'HEAD^',
      fingerprint: 'source',
      productionEnvFingerprint: 'approved-env',
      currentProductionEnvFingerprint: 'changed-env',
      cwd: repositoryRoot,
    }),
    /production environment changed/u,
  );
});

test('production deploy requires a reviewed remote fingerprint before readback', async () => {
  await assert.rejects(() => assertReleaseAssessment({
    base: 'HEAD', fingerprint: 'source', productionEnvFingerprint: 'env',
    currentProductionEnvFingerprint: 'env', cwd: repositoryRoot,
  }), /LUYENTAP_RELEASE_OBSERVED_FINGERPRINT/u);
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

test('production source override requires qualified Listening observation', () => {
  assert.equal(selectReleaseSource(), repositoryRoot);
  assert.throws(() => selectReleaseSource({ sourceCwd: os.tmpdir() }), /external source cwd requires qualified Listening observation/u);
  assert.equal(selectReleaseSource({ sourceCwd: os.tmpdir(), observeListening: true, listeningPhase: 'homework' }), path.resolve(os.tmpdir()));
});

test('Listening Hosting blocks early phases and incomplete homework qualification', async () => {
  for (const listeningPhase of [undefined, 'prepare', 'upload']) {
    assert.throws(() => selectReleaseSource({ observeListening: true, listeningPhase }), /requires the homework phase/u);
    await assert.rejects(() => assertReleaseAssessment({ observeListening: true, listeningPhase }), /requires the homework phase/u);
  }
  for (const result of [{}, { hostingReady: true }, { listeningObservation: { phase: 'upload' }, hostingReady: true }, { listeningObservation: { phase: 'homework' }, hostingReady: false }]) {
    assert.throws(() => assertListeningHostingReady(result, true), /requires verified homework phase and hostingReady=true/u);
  }
  assert.doesNotThrow(() => assertListeningHostingReady({ listeningObservation: { phase: 'homework' }, hostingReady: true }, true));
  assert.doesNotThrow(() => assertListeningHostingReady({}));
});

test('Hosting records publication only after new provider identity and matching built manifest', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'recorded-hosting-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Changelog Test'); git('config', 'user.email', 'test@example.invalid');
    await writeFile(path.join(cwd, 'index.html'), 'website'); git('add', '.'); git('commit', '-qm', 'Website');
    const base = git('rev-parse', 'HEAD');
    const manifest = { revision: base, files: [] };
    await mkdir(path.join(cwd, 'dist/.well-known'), { recursive: true });
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
    const storeDir = path.join(cwd, '.git', 'journal');
    let reads = 0;
    const result = await deployHosting({ base, cwd, storeDir,
      runDeploy: (args, env, selectedCwd) => {
        assert.equal(selectedCwd, cwd);
        assert.equal(args[0], path.join(cwd, 'scripts/tooling-where.mjs'));
        assert.ok(args[args.indexOf('--message') + 1]);
        assert.equal(listReleases(storeDir)[0].targets[0].publication, 'unconfirmed');
      },
      observeProvider: () => ({ provider: { version: reads++ ? 'new' : 'old', releaseTime: 'time' }, evidenceRef: 'fixture://provider' }),
      observeSource: async () => ({ fingerprint: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), evidenceRef: 'fixture://manifest' }) });
    assert.equal(result.status, 'live');
    assert.match(result.targets[0].providerIdentity, /new/u);
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify({ ...manifest, revision: 'f'.repeat(40) }));
    await assert.rejects(() => deployHosting({ base, cwd, storeDir, runDeploy: () => assert.fail('stale build must not deploy'),
      observeProvider: () => ({ provider: { version: 'old' } }) }), /build source differs/u);
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
    await assert.rejects(() => deployHosting({ base, cwd, storeDir, runDeploy: () => {},
      observeProvider: () => ({ provider: { version: 'old', releaseTime: 'time' } }),
      observeSource: async () => ({ fingerprint: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }) }), /unconfirmed/u);
    assert.equal(listReleases(storeDir).filter(release => release.targets[0].publication === 'unconfirmed').length, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
