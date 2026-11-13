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
  deployHosting,
  verifyExistingHosting,
  assertCleanWorkingTree,
  assertReleaseAssessment,
  assertListeningHostingReady,
  selectReleaseSource,
  cleanParentEnv,
  findForbiddenBundleMarker,
  assertRetainedArtifact,
  assertQualificationFirebaseValues,
  writeOperationEvidence,
  hostingReleaseMessage,
} from '../deploy-live.mjs';
import { assertLocalEmulators, importFirestoreDocuments } from '../import-live-firebase.mjs';
import { replaceSnapshot } from '../local-firebase.mjs';
import { listReleases } from '../lib/releaseChangelog.mjs';
import { collectSourceState } from '../release-check.mjs';
import { writeHostingManifest } from '../release-evidence.mjs';
import { runReleaseVerification } from '../release-verification.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deploymentScript = path.join(repositoryRoot, 'scripts/deploy-live.mjs');

test('qualification Firebase configuration is all-or-nothing and rejects local values', () => {
  const keys = ['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'].map(key => `VITE_FIREBASE_QUALIFICATION_${key}`);
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

test('retained artifact requires the approved manifest and every listed file', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'luyentap-retained-artifact-'));
  try {
    await mkdir(path.join(cwd, 'dist/.well-known'), { recursive: true });
    const index = Buffer.from('<!doctype html>');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update(index).digest('hex') }] };
    await writeFile(path.join(cwd, 'dist/index.html'), index);
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
    const artifactSha256 = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    assert.deepEqual(await assertRetainedArtifact({ cwd, artifactSha256 }), manifest);
    await writeFile(path.join(cwd, 'dist/index.html'), '<!doctype html><p>changed</p>');
    await assert.rejects(() => assertRetainedArtifact({ cwd, artifactSha256 }), /artifact|hash differs/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Hosting artifact upload/download contract preserves the hidden manifest and rejects secrets', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'luyentap-artifact-transfer-'));
  try {
    await mkdir(path.join(cwd, 'dist/.well-known'), { recursive: true });
    const index = Buffer.from('<!doctype html>');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update(index).digest('hex') }] };
    await writeFile(path.join(cwd, 'dist/index.html'), index);
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
    const artifactSha256 = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    await writeFile(path.join(cwd, 'dist/.env'), 'VITE_SECRET=must-not-upload');
    await assert.rejects(() => assertRetainedArtifact({ cwd, artifactSha256 }), /unexpected artifact entry/u);
    await unlink(path.join(cwd, 'dist/.env'));

    const omitted = path.join(cwd, 'omitted.tar');
    tar.c({ file: omitted, cwd: path.join(cwd, 'dist'), portable: true, sync: true }, ['index.html']);
    const omittedRoot = await mkdtemp(path.join(os.tmpdir(), 'luyentap-artifact-download-'));
    await mkdir(path.join(omittedRoot, 'dist'), { recursive: true });
    tar.x({ file: omitted, cwd: path.join(omittedRoot, 'dist'), sync: true });
    await assert.rejects(() => assertRetainedArtifact({ cwd: omittedRoot, artifactSha256 }), /manifest|missing|ENOENT/u);
    await rm(omittedRoot, { recursive: true, force: true });

    const retained = path.join(cwd, 'retained.tar');
    tar.c({ file: retained, cwd: path.join(cwd, 'dist'), portable: true, sync: true }, ['index.html', '.well-known']);
    const retainedRoot = await mkdtemp(path.join(os.tmpdir(), 'luyentap-artifact-download-'));
    await mkdir(path.join(retainedRoot, 'dist'), { recursive: true });
    tar.x({ file: retained, cwd: path.join(retainedRoot, 'dist'), sync: true });
    assert.deepEqual(await assertRetainedArtifact({ cwd: retainedRoot, artifactSha256 }), manifest);
    await rm(retainedRoot, { recursive: true, force: true });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('published verification does not overwrite pending changelog reconciliation', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'luyentap-operation-evidence-'));
  try {
    const file = path.join(cwd, 'operation.json');
    process.env.LUYENTAP_RELEASE_OPERATION_FILE = file;
    for (const status of ['changelog-pending', 'changelog-pending-integration']) {
      await writeOperationEvidence({ id: '00000000-0000-4000-8000-000000000000', status, error: 'locked', cwd });
      await writeOperationEvidence({ id: '00000000-0000-4000-8000-000000000000', status: 'published-verified', cwd });
      assert.match(await readFile(file, 'utf8'), new RegExp(status));
    }
  } finally {
    delete process.env.LUYENTAP_RELEASE_OPERATION_FILE;
    await rm(cwd, { recursive: true, force: true });
  }
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

async function hostingFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'recorded-hosting-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q'); git('config', 'user.name', 'Changelog Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(cwd, '.gitignore'), 'dist/\n');
  await writeFile(path.join(cwd, 'index.html'), 'website');
  await writeFile(path.join(cwd, 'check.test.mjs'), "import test from 'node:test'; test('candidate works', () => {});\n");
  await writeFile(path.join(cwd, 'firebase.json'), JSON.stringify({ hosting: { target: 'kahut1', public: 'dist' } }));
  await writeFile(path.join(cwd, '.firebaserc'), JSON.stringify({ projects: { default: 'temp-a1437' } }));
  git('add', '.'); git('commit', '-qm', 'Website');
  const base = git('rev-parse', 'HEAD');
  await writeFile(path.join(cwd, 'index.html'), 'corrected website');
  const changeId = 'CL-20261112-CORRECTION';
  await mkdir(path.join(cwd, 'documentation/architecture/changelog'), { recursive: true });
  await writeFile(path.join(cwd, 'documentation/architecture/changelog/correction.md'), `# Correction\nChangelog ID: \`${changeId}\`\n`);
  await writeFile(path.join(cwd, 'documentation/architecture/master_changelog.md'), `| [\`${changeId}\`](changelog/correction.md) | Correction |\n`);
  git('add', '.'); git('commit', '-qm', 'Correction');
  const envFingerprint = 'a'.repeat(64);
  const planPath = path.join(cwd, '.git', 'checks.json');
  await writeFile(planPath, JSON.stringify({ schemaVersion: 1, suites: [{ runner: 'node', files: ['check.test.mjs'] }] }));
  const verification = await runReleaseVerification({ cwd, base, planPath, envFingerprint });
  await mkdir(path.join(cwd, 'dist'), { recursive: true });
  await writeFile(path.join(cwd, 'dist', 'index.html'), 'built corrected website');
  const manifest = await writeHostingManifest({ cwd, envFingerprint });
  const source = await collectSourceState(cwd, base);
  const assessment = { decision: 'PASS', source, observed: { revision: base, fingerprint: 'previous-manifest' }, findings: [],
    compatibilityReview: { changeIds: [changeId] } };
  const state = { deploys: 0, outcomes: [], archive: null, message: '', hashFailure: false, reconciles: 0, reconcileError: false };
  const observeProvider = () => ({ provider: { version: state.deploys ? 'new' : 'old',
    releaseTime: state.deploys ? 'later' : 'before', message: state.message, config: { headers: [] } }, evidenceRef: 'fixture://provider' });
  const observeSource = async () => {
    if (state.deploys && state.hashFailure) throw new Error('transient asset drift');
    return { fingerprint: state.deploys ? crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex') : 'previous-manifest', evidenceRef: 'fixture://manifest' };
  };
  const options = { cwd, base, storeDir: path.join(cwd, '.git', 'journal'), assessment, verification,
    verificationPlanSha256: verification.planSha256, sourceRef: 'refs/heads/release', observeProvider, observeSource,
    retainArchive: async ({ id, intent }) => {
      state.archive = { id, intent, sha256: 'b'.repeat(64), evidenceRef: `https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-${id}` };
      assert.equal(listReleases(options.storeDir)[0].id, id);
      assert.equal(intent.before.provider.version, 'old');
      return state.archive;
    },
    saveOutcome: async (archive, outcome) => state.outcomes.push(outcome),
    reconcile: async () => {
      state.reconciles += 1;
      if (state.reconcileError) throw new Error('protected-main integration unavailable');
    },
    runDeploy: (args, env, selectedCwd) => {
      assert.equal(selectedCwd, cwd);
      assert.equal(args[0], path.join(cwd, 'scripts/tooling-where.mjs'));
      state.message = args[args.indexOf('--message') + 1];
      assert.match(state.message, /^\[luyentap:[a-f0-9-]+\] /u);
      assert.ok(state.message.length <= 255);
      assert.ok(state.archive);
      state.deploys++;
    },
  };
  return { options, state, manifest, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

test('Hosting preserves intent before publication and verifies the exact built manifest', async () => {
  const { options, state, manifest, cleanup } = await hostingFixture();
  try {
    const result = await deployHosting(options);
    assert.equal(result.status, 'live');
    assert.match(result.targets[0].providerIdentity, /new/u);
    assert.equal(state.deploys, 1);
    assert.equal(state.outcomes[0].outcomes[0].verification, 'passed');
    const currentVerification = await runReleaseVerification({ cwd: options.cwd, base: manifest.revision,
      planPath: path.join(options.cwd, '.git', 'checks.json'), envFingerprint: manifest.envFingerprint });
    await assert.rejects(() => deployHosting({ ...options, base: manifest.revision, verification: currentVerification,
      assessment: { ...options.assessment, source: currentVerification.source,
        observed: { revision: manifest.revision, tree: manifest.tree, manifest } } }), /already published/u);
    assert.equal(state.deploys, 1);
    await writeFile(path.join(options.cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify({ ...manifest, revision: 'f'.repeat(40) }));
    await assert.rejects(() => deployHosting(options), /build source differs/u);
    assert.equal(state.deploys, 1);
  } finally { await cleanup(); }
});

test('publication with failed readback resumes the same operation without another deployment', async () => {
  const { options, state, cleanup } = await hostingFixture();
  try {
    state.hashFailure = true;
    await assert.rejects(() => deployHosting(options), /verification unverified/u);
    assert.equal(state.deploys, 1);
    assert.equal(state.reconciles, 0);
    const original = listReleases(options.storeDir)[0];
    assert.equal(original.targets[0].publication, 'published');
    assert.equal(original.targets[0].verification, 'unverified');
    state.hashFailure = false;
    const resume = { id: original.id, storeDir: options.storeDir, readArchive: async () => state.archive, reconcile: options.reconcile,
      saveOutcome: options.saveOutcome, observeProvider: options.observeProvider, observeSource: options.observeSource };
    const verified = await verifyExistingHosting(resume);
    assert.equal(verified.id, original.id);
    assert.equal(verified.targets[0].verification, 'passed');
    assert.equal(state.reconciles, 1);
    assert.deepEqual(verified.targets[0].changeIds, ['CL-20261112-CORRECTION']);
    assert.deepEqual(await verifyExistingHosting(resume), verified);
    assert.equal(state.deploys, 1);
    assert.equal(listReleases(options.storeDir).length, 1);
    await assert.rejects(() => verifyExistingHosting({ ...resume, observeProvider: () => ({ ...options.observeProvider(),
      provider: { ...options.observeProvider().provider, version: 'different' } }) }), /cannot reassign publication/u);
    await assert.rejects(() => verifyExistingHosting({ ...resume, observeProvider: () => ({ ...options.observeProvider(),
      provider: { ...options.observeProvider().provider, message: 'another operation' } }) }), /not confirmed/u);
  } finally { await cleanup(); }
});

test('verification repairs an interrupted remote receipt after local publication was settled', async () => {
  const { options, state, cleanup } = await hostingFixture();
  try {
    await assert.rejects(() => deployHosting({ ...options, saveOutcome: async () => { throw new Error('remote receipt interrupted'); } }), /remote receipt interrupted/u);
    const original = listReleases(options.storeDir)[0];
    assert.equal(original.targets[0].verification, 'passed');
    assert.equal(state.outcomes.length, 0);
    await verifyExistingHosting({ id: original.id, storeDir: options.storeDir, readArchive: async () => state.archive,
      saveOutcome: options.saveOutcome, observeProvider: options.observeProvider, observeSource: options.observeSource });
    assert.equal(state.outcomes.length, 1);
    assert.equal(state.deploys, 1);
  } finally { await cleanup(); }
});

test('verification-only CLI does not load production environment or build', () => {
  const result = spawnSync(process.execPath, [deploymentScript, '--verify-existing', 'not-an-operation'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, LUYENTAP_PRODUCTION_ENV_FILE: 'missing-production-environment' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /operation id must be a UUID/u);
  assert.doesNotMatch(result.stderr, /missing-production-environment/u);
  assert.doesNotMatch(result.stdout, /Building|Deploying/u);
});

test('changed or missing review digest is rejected before provider assessment', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'release-review-binding-'));
  try {
    const review = path.join(directory, 'review.json');
    await writeFile(review, '{"decision":"verified"}');
    for (const compatibilityReviewSha256 of [undefined, '0'.repeat(64)]) {
      await assert.rejects(() => assertReleaseAssessment({ cwd: repositoryRoot, base: 'a'.repeat(40),
        fingerprint: 'b'.repeat(64), productionEnvFingerprint: 'c'.repeat(64), currentProductionEnvFingerprint: 'c'.repeat(64),
        observedFingerprint: 'd'.repeat(64), compatibilityReviewPath: review, compatibilityReviewSha256 }), /compatibility review changed or lacks/u);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('forged verification, archive failure, artifact tampering and live drift stop before Firebase', async () => {
  const { options, state, cleanup } = await hostingFixture();
  try {
    await assert.rejects(() => deployHosting({ ...options, verification: JSON.parse(JSON.stringify(options.verification)) }), /untrusted or stale/u);
    await assert.rejects(() => deployHosting({ ...options, retainArchive: async () => { throw new Error('archive unavailable'); } }), /archive unavailable/u);
    await assert.rejects(() => deployHosting({ ...options, observeSource: async () => ({ fingerprint: 'new baseline' }) }), /production changed/u);
    await assert.rejects(() => deployHosting({ ...options, revalidate: async () => {
      await writeFile(path.join(options.cwd, 'dist', 'index.html'), 'tampered after archive');
    } }), /artifact|hash|manifest/iu);
    assert.equal(state.deploys, 0);
  } finally { await cleanup(); }
});

test('Hosting publication rejects caller-supplied dependency evidence before retention or deployment', async () => {
  const { options, state, cleanup } = await hostingFixture();
  try {
    await assert.rejects(deployHosting({ ...options, assessment: { ...options.assessment,
      target: 'hosting', hostingDependencies: { scope: 'hosting-dependencies', readOnly: true } } }), /caller-supplied Hosting dependency/u);
    assert.equal(state.archive, null);
    assert.equal(state.deploys, 0);
  } finally { await cleanup(); }
});

test('Hosting release messages stay within Firebase limits while changelog records remain detailed', () => {
  const description = 'x'.repeat(278);
  const message = hostingReleaseMessage(description);
  assert.equal(message.length, 255);
  assert.equal(message.slice(-3), '...');
  assert.equal(hostingReleaseMessage('short release'), 'short release');
});
