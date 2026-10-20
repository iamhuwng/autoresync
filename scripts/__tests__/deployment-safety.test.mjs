import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertCleanWorkingTree,
  assertReleaseAssessment,
  cleanParentEnv,
  findForbiddenBundleMarker,
} from '../deploy-live.mjs';
import { assertLocalEmulators, importFirestoreDocuments } from '../import-live-firebase.mjs';
import { publishGeneration } from '../local-firebase-recovery.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deploymentScript = path.join(repositoryRoot, 'scripts/deploy-live.mjs');

test('Java emulator tasks verify checkout ownership before reuse or replacement', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/start-local-java-emulator.ps1'), 'utf8');
  const guard = source.slice(source.indexOf('function Assert-TaskOwner'), source.indexOf('if (!$Run)'));
  assert.match(guard, /\$actions\.Count -ne 1/u);
  assert.match(guard, /WorkingDirectory -ne \$repoRoot/u);
  assert.match(guard, /Arguments\.Contains\('-File "' \+ \$PSCommandPath \+ '" -Run '\)/u);
  assert.match(guard, /belongs to another checkout/u);
  const ownerCheck = source.indexOf('Assert-TaskOwner $existingTask');
  assert(ownerCheck >= 0 && ownerCheck < source.indexOf("if ($existingTask.State -eq 'Running')"));
  assert(ownerCheck < source.indexOf('Register-ScheduledTask'));
  if (process.platform === 'win32') {
    const script = `
$ErrorActionPreference = 'Stop'
$repoRoot = 'C:\\fixture\\current'
$taskName = 'fixture'
${guard}
$action = [pscustomobject]@{ WorkingDirectory = $repoRoot; Arguments = '-File "' + $PSCommandPath + '" -Run -Name firestore' }
Assert-TaskOwner $null
Assert-TaskOwner ([pscustomobject]@{ Actions = @($action) })
foreach ($actions in @(@(), @($action, $action), @([pscustomobject]@{ WorkingDirectory = 'C:\\other'; Arguments = $action.Arguments }), @([pscustomobject]@{ WorkingDirectory = $repoRoot; Arguments = '-File "C:\\other\\launcher.ps1" -Run ' }))) {
  $denied = $false
  try { Assert-TaskOwner ([pscustomobject]@{ Actions = $actions }) } catch { $denied = $_.Exception.Message -like '*belongs to another checkout*' }
  if (!$denied) { throw 'Foreign or ambiguous scheduled task was accepted' }
}
Write-Output 'ownership cases passed'
`;
    const directory = await mkdtemp(path.join(os.tmpdir(), 'luyentap-task-owner-'));
    try {
      const file = path.join(directory, 'guard.ps1');
      await writeFile(file, script);
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /ownership cases passed/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
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

test('invalid recovery publication preserves the selected generation', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-snapshot-test-'));
  const pointerPath = path.join(tempDir, 'latest.json');
  const stagingDir = path.join(tempDir, 'snapshot.next');
  try {
    await writeFile(pointerPath, 'previous-generation');
    await assert.rejects(() => publishGeneration(stagingDir, { datasetId: 'dataset', root: tempDir }), { code: 'ENOENT' });
    assert.equal(await readFile(pointerPath, 'utf8'), 'previous-generation');
    await mkdir(stagingDir);
    await writeFile(path.join(stagingDir, 'firebase-export-metadata.json'), '{}');
    await assert.rejects(() => publishGeneration(stagingDir, { datasetId: 'dataset', root: tempDir }), /Incomplete three-store/);
    assert.equal(await readFile(pointerPath, 'utf8'), 'previous-generation');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
