import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalEmulators } from './import-live-firebase.mjs';
import { randomUUID } from 'node:crypto';
import { adoptSnapshot, assertInventoryPreserved, atomicJson, datasetIssues, digest, inspectSnapshot, inventory, pruneAutomaticGenerations, publishGeneration, readGeneration, recoveryRoot, withCheckpointWriter } from './local-firebase-recovery.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'demo-luyentap-local';
const emulatorPorts = { auth: 9099, database: 9000, firestore: 8080 };
const firebaseCli = path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const emulatorCache = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
const firestoreJar = path.join(emulatorCache, 'cloud-firestore-emulator-v1.20.4.jar');
const databaseJar = path.join(emulatorCache, 'firebase-database-emulator-v4.11.2.jar');
const isWindowsArm64 = process.platform === 'win32' && process.arch === 'arm64';
const adminHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

const accounts = [
  { email: 'teacher@test.com', password: 'password123', role: 'teacher', displayName: 'Teacher' },
  { email: 'teacher2@test.com', password: 'password123', role: 'teacher', displayName: 'Teacher Two' },
  { email: 'student@test.com', password: 'password123', role: 'student', displayName: 'Student' },
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isPortOpen = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ host: 'localhost', port });
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', () => {
    socket.destroy();
    resolve(false);
  });
});

const waitForPort = async (port, timeout = 180000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await sleep(250);
  }
  throw new Error(`Firebase emulator did not open port ${port} within ${timeout / 1000}s.`);
};

const launchDetached = (command, args) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
};

const startFirebaseCli = (only, restoreSnapshot) => {
  launchDetached(process.execPath, [
    firebaseCli, 'emulators:start', '--only', only.join(','), '--project', projectId,
    ...(restoreSnapshot ? ['--import', restoreSnapshot] : []),
  ]);
};

const startWindowsArm64JavaEmulator = (name, jar, port, restoreSnapshot) => {
  const helper = path.join(repoRoot, 'scripts', 'start-local-java-emulator.ps1');
  const helperArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helper,
    '-Name',
    name,
    '-Jar',
    jar,
    '-Port',
    String(port),
    '-ProjectId',
    projectId,
    '-Rules',
    path.join(repoRoot, 'firestore.rules'),
  ];
  if (name === 'firestore' && restoreSnapshot) {
    helperArgs.push('-ImportMetadata', path.join(restoreSnapshot, 'firestore_export', 'firestore_export.overall_export_metadata'));
  }
  const registration = spawnSync('powershell.exe', helperArgs, { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  if (registration.error) throw registration.error;
  assert.equal(registration.status, 0, `Firebase ${name} task registration failed: ${registration.stderr}`);
  console.log(`[Firebase] Starting Windows-owned local ${name} emulator task through WSL.`);
};
const launchEmulators = async (generation) => {
  const restoreSnapshot = generation?.directory;
  const missing = [];
  for (const [name, port] of Object.entries(emulatorPorts)) {
    if (!(await isPortOpen(port))) missing.push(name);
  }
  assert.equal(missing.length, Object.keys(emulatorPorts).length, 'Bootstrap/restore requires all emulators stopped. Never import over a running or partial stack.');
  // Freeze this exact validated generation before exposing any restored port.
  const databaseImport = restoreSnapshot && missing.includes('database')
    ? await readFile(path.join(restoreSnapshot, 'database_export', `${projectId}.json`), 'utf8') : undefined;
  let firestoreRestore = restoreSnapshot;
  if (isWindowsArm64 && restoreSnapshot && missing.includes('firestore')) {
    firestoreRestore = path.join(repoRoot, 'work', 'local-stack-detached', 'firebase-restore', generation.manifest.generationId);
    await cp(path.join(restoreSnapshot, 'firestore_export'), path.join(firestoreRestore, 'firestore_export'), { recursive: true, force: true });
  }

  console.log(generation
    ? `[Firebase] Explicitly restoring dataset ${generation.manifest.datasetId}, generation ${generation.manifest.generationId}.`
    : `[Firebase] Explicitly preparing a fresh disposable ${projectId} dataset.`);

  if (missing.length > 0) {
    if (isWindowsArm64) {
      if (missing.includes('auth')) startFirebaseCli(['auth'], restoreSnapshot);

      if (missing.includes('database')) {
        await access(databaseJar);
        startWindowsArm64JavaEmulator('database', databaseJar, emulatorPorts.database, restoreSnapshot);
      }

      if (missing.includes('firestore')) {
        await access(firestoreJar);
        startWindowsArm64JavaEmulator('firestore', firestoreJar, emulatorPorts.firestore, firestoreRestore);
      }
    } else {
      startFirebaseCli(missing, restoreSnapshot);
    }
  }

  await Promise.all(Object.values(emulatorPorts).map((port) => waitForPort(port)));
  await assertLocalEmulators();
  await readResponse(await fetch(`http://localhost:9000/.settings/rules.json?ns=${projectId}`, {
    method: 'PUT', redirect: 'error', headers: adminHeaders, body: await readFile(path.join(repoRoot, 'database.rules.json'), 'utf8'),
  }));
  if (isWindowsArm64 && restoreSnapshot && missing.includes('database')) {
    await importRtdbSnapshot(path.join(restoreSnapshot, 'database_export', `${projectId}.json`), false, databaseImport);
  }
};

const restoreEmulators = async () => {
  const generation = await readGeneration();
  await launchEmulators(generation);
  const restored = await readLiveState(generation);
  assert.equal(digest(restored.database), digest(generation.database), 'Restored RTDB differs from the selected generation');
  assert.equal(digest(restored.auth.users.map(({ localId, email }) => ({ localId, email })).sort((a,b)=>a.localId.localeCompare(b.localId))), digest(generation.auth.users.map(({ localId, email }) => ({ localId, email })).sort((a,b)=>a.localId.localeCompare(b.localId))), 'Restored Auth identities differ');
  console.log(`[Firebase] Exact generation restored; product readiness still requires check.`);
};

const readResponse = async (response) => {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(`Local Firebase request failed (${response.status}).`);
    error.body = body;
    throw error;
  }
  return body;
};

const ensureAuthAccount = async (account, uid) => {
  const base = `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;
  const existing = await readResponse(await fetch(`${base}:lookup`, {
    method: 'POST', redirect: 'error', headers: adminHeaders, body: JSON.stringify({ email: [account.email] }),
  }));
  const oldUid = existing.users?.[0]?.localId;
  if (oldUid && oldUid !== uid) {
    await readResponse(await fetch(`${base}:delete`, {
      method: 'POST', redirect: 'error', headers: adminHeaders, body: JSON.stringify({ localId: oldUid }),
    }));
  }
  const result = await readResponse(await fetch(`${base}:batchCreate`, {
    method: 'POST', redirect: 'error', headers: adminHeaders,
    body: JSON.stringify({
      allowOverwrite: true,
      users: [{ localId: uid, email: account.email, rawPassword: account.password, displayName: account.displayName, emailVerified: true }],
    }),
  }));
  assert.equal(result.error?.length ?? 0, 0, 'Local Auth account import failed.');
};

const seedAccounts = async () => {
  await Promise.all(Object.values(emulatorPorts).map((port) => waitForPort(port)));
  await assertLocalEmulators();
  const profiles = await readResponse(await fetch(`http://localhost:9000/users.json?ns=${projectId}`, { redirect: 'error', headers: adminHeaders })) || {};

  for (const account of accounts) {
    const [uid, existingProfile] = Object.entries(profiles).find(([, profile]) => profile.email === account.email)
      || [`local-${account.email.split('@')[0]}`, {}];
    await ensureAuthAccount(account, uid);
    const profileUrl = `http://localhost:${emulatorPorts.database}/users/${encodeURIComponent(uid)}.json?ns=${encodeURIComponent(projectId)}`;
    await readResponse(await fetch(profileUrl, {
      method: 'PUT',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({
        uid,
        email: account.email,
        displayName: account.displayName,
        firstName: account.displayName,
        familyName: 'Test',
        profileCompletedAt: Date.now(),
        photoURL: null,
        role: account.role,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active',
        ...existingProfile,
        forceReauth: false,
      }),
    }));
    console.log(`[Firebase] Seeded ${account.role} account ${account.email}.`);
  }
};

const importRtdbSnapshot = async (snapshotPath, seed = true, frozenSnapshot) => {
  if (!snapshotPath) throw new Error('Usage: node scripts/local-firebase.mjs import-rtdb <snapshot.json>');

  const resolvedPath = path.resolve(repoRoot, snapshotPath);
  const snapshot = frozenSnapshot ?? await readFile(resolvedPath, 'utf8');
  JSON.parse(snapshot);
  await assertLocalEmulators();

  const response = await fetch(`http://localhost:${emulatorPorts.database}/.json?ns=${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: snapshot,
  });
  if (!response.ok) {
    throw new Error(`Local RTDB import failed (${response.status}).`);
  }
  await response.body?.cancel();
  console.log(`[Firebase] Imported RTDB snapshot into local project ${projectId}.`);
  if (seed) await seedAccounts();
};

export const firestoreValue = value => {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, v]) => [key, firestoreValue(v)]));
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(firestoreValue);
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    assert(Number.isSafeInteger(number), 'Firestore integer exceeds safe precision');
    return number;
  }
  if ('timestampValue' in value) {
    const [seconds, fraction = ''] = value.timestampValue.replace(/Z$/u, '').split('.');
    assert(fraction.length <= 6, 'Firestore timestamp exceeds supported microsecond precision');
    const timestamp = Date.parse(`${seconds}Z`) * 1000 + Number(fraction.padEnd(6, '0'));
    assert(Number.isSafeInteger(timestamp), 'Invalid Firestore timestamp');
    return timestamp;
  }
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('doubleValue' in value) { assert(Number.isFinite(value.doubleValue)); return value.doubleValue; }
  assert('nullValue' in value, 'Unsupported Firestore REST value type');
  return null;
};
const readLiveState = async generation => {
  await checkEmulators();
  const database = await readResponse(await fetch(`http://localhost:9000/.json?ns=${projectId}&format=export`, { redirect: 'error', headers: adminHeaders, signal: AbortSignal.timeout(30000) }));
  const auth = await readResponse(await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=-1`, { redirect: 'error', headers: adminHeaders, signal: AbortSignal.timeout(10000) }));
  const documents = [];
  for (let index = 0; index < generation.documents.length; index += 100) {
    const response = await readResponse(await fetch(`http://localhost:8080/v1/projects/${projectId}/databases/(default)/documents:batchGet`, {
      method: 'POST', redirect: 'error', headers: adminHeaders, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ documents: generation.documents.slice(index, index + 100).map(doc => `projects/${projectId}/databases/(default)/documents/${doc.path}`) }),
    }));
    assert(Array.isArray(response), 'Invalid Firestore batchGet response');
    for (const item of response) {
      assert(item.found, `Missing Firestore record ${item.missing ?? 'unknown'}`);
      documents.push({ path: item.found.name.split('/documents/')[1], fields: Object.fromEntries(Object.entries(item.found.fields ?? {}).map(([key, v]) => [key, firestoreValue(v)])) });
    }
  }
  assertInventoryPreserved(generation.inventory, inventory(database, auth, documents));
  return { database, auth, documents };
};

const captureSnapshot = async (stagingDir, before) => {
    await mkdir(path.join(stagingDir, 'database_export'), { recursive: true });
    await mkdir(path.join(stagingDir, 'auth_export'), { recursive: true });
    await writeFile(path.join(stagingDir, 'database_export', `${projectId}.json`), JSON.stringify(before.database));
    await writeFile(path.join(stagingDir, 'auth_export', 'accounts.json'), JSON.stringify(before.auth));
    const authConfig = await readResponse(await fetch(`http://localhost:9099/emulator/v1/projects/${projectId}/config`, { redirect: 'error', headers: adminHeaders }));
    await writeFile(path.join(stagingDir, 'auth_export', 'config.json'), JSON.stringify(authConfig));
    const exportDirectory = isWindowsArm64
      ? `/mnt/${stagingDir[0].toLowerCase()}/${stagingDir.slice(3).replaceAll('\\', '/')}`
      : stagingDir;
    await readResponse(await fetch(`http://localhost:8080/emulator/v1/projects/${projectId}:export`, {
      method: 'POST', redirect: 'error', headers: adminHeaders,
      body: JSON.stringify({ database: `projects/${projectId}/databases/(default)`, export_directory: exportDirectory, export_name: 'firestore_export' }),
    }));
    const { version } = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'firebase-tools', 'package.json'), 'utf8'));
    await writeFile(path.join(stagingDir, 'firebase-export-metadata.json'), JSON.stringify({
      version,
      database: { version: '4.11.2', path: 'database_export' },
      auth: { version, path: 'auth_export' },
      firestore: { version: '1.20.4', path: 'firestore_export', metadata_file: 'firestore_export/firestore_export.overall_export_metadata' },
    }));
};

const saveSnapshot = () => withCheckpointWriter(async () => {
  const startedAt = new Date().toISOString();
  const previous = await readGeneration();
  const stagingDir = path.join(recoveryRoot, `export-${randomUUID()}`);
  try {
    const before = await readLiveState(previous);
    await captureSnapshot(stagingDir, before);
    const inspected = await inspectSnapshot(stagingDir, { freshDataset: previous.manifest.freshDataset === true });
    const after = await readLiveState(inspected);
    assert.equal(digest(after.database), digest(before.database), 'RTDB changed during export; retry after the active write settles');
    assert.equal(digest(after.auth), digest(before.auth), 'Auth changed during export; retry after the active write settles');
    const values = docs => docs.map(doc => ({ path: doc.path, fields: doc.fields })).sort((a,b)=>a.path.localeCompare(b.path));
    assert.equal(digest(values(after.documents)), digest(values(inspected.documents)), 'Firestore changed during export');
    const saved = await publishGeneration(stagingDir, { datasetId: previous.manifest.datasetId, previous });
    await atomicJson(path.join(recoveryRoot, 'status.json'), { state: 'saved', startedAt, completedAt: saved.manifest.completedAt,
      datasetId: saved.manifest.datasetId, generationId: saved.manifest.generationId, issues: saved.manifest.issues });
    await pruneAutomaticGenerations();
    console.log(`[Firebase] Saved dataset ${saved.manifest.datasetId}, generation ${saved.manifest.generationId} to ${saved.directory}; readiness issues: ${saved.manifest.issues.length}.`);
  } catch (error) {
    await atomicJson(path.join(recoveryRoot, 'status.json'), { state: 'failed', startedAt, failedAt: new Date().toISOString(), message: error.message });
    throw error;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
});

const bootstrap = () => withCheckpointWriter(async () => {
  await assert.rejects(readFile(path.join(recoveryRoot, 'dataset.json')), { code: 'ENOENT' },
    'A recovery dataset is already registered; use explicit restore, never bootstrap over it');
  await launchEmulators();
  await seedAccounts();
  const stagingDir = path.join(recoveryRoot, `bootstrap-${randomUUID()}`);
  try {
    const before = {
      database: await readResponse(await fetch(`http://localhost:9000/.json?ns=${projectId}&format=export`, { redirect: 'error', headers: adminHeaders })),
      auth: await readResponse(await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=-1`, { redirect: 'error', headers: adminHeaders })),
    };
    await captureSnapshot(stagingDir, before);
    const inspected = await inspectSnapshot(stagingDir, { freshDataset: true });
    const after = await readLiveState(inspected);
    assert.equal(digest(after.database), digest(before.database), 'RTDB changed during bootstrap export');
    assert.equal(digest(after.auth), digest(before.auth), 'Auth changed during bootstrap export');
    assert.equal(inspected.documents.length, 0, 'Fresh bootstrap requires empty Firestore');
    const datasetId = randomUUID();
    const saved = await publishGeneration(stagingDir, { datasetId, protectedGeneration: true, freshDataset: true });
    await atomicJson(path.join(recoveryRoot, 'dataset.json'), { schemaVersion: 1, projectId, datasetId,
      createdAt: saved.manifest.completedAt, source: 'explicit-disposable-bootstrap' });
    await atomicJson(path.join(recoveryRoot, 'status.json'), { state: 'saved', startedAt: saved.manifest.completedAt,
      completedAt: saved.manifest.completedAt, datasetId, generationId: saved.manifest.generationId, issues: saved.manifest.issues });
    console.log(`[Firebase] Fresh disposable dataset ${datasetId} registered. Start the independent checkpoint writer before development.`);
  } finally { await rm(stagingDir, { recursive: true, force: true }); }
});

const checkEmulators = async () => {
  const status = await Promise.all(Object.entries(emulatorPorts).map(async ([name, port]) => [name, await isPortOpen(port)]));
  const unavailable = status.filter(([, available]) => !available).map(([name]) => name);
  if (unavailable.length > 0) throw new Error(`Local Firebase emulators unavailable: ${unavailable.join(', ')}.`);
  await assertLocalEmulators();
  console.log(`[Firebase] Local emulators are running for ${projectId}.`);
};

const check = async (allowRecordedIssues = false) => {
  const generation = await readGeneration();
  const live = await readLiveState(generation);
  const status = JSON.parse(await readFile(path.join(recoveryRoot, 'status.json'), 'utf8'));
  assert.equal(status.state, 'saved', 'Last persistence attempt failed');
  assert.equal(status.datasetId, generation.manifest.datasetId, 'Checkpoint status/dataset mismatch');
  assert.equal(status.generationId, generation.manifest.generationId, 'Checkpoint status/generation mismatch');
  const age = Date.now() - Date.parse(status.completedAt);
  assert(age >= 0 && age <= 180000, 'Checkpoint is stale; the independent checkpoint task must be running');
  const issues = datasetIssues(live.database, live.auth, live.documents);
  const rejectedIssues = allowRecordedIssues ? issues.filter(issue => !generation.manifest.issues.includes(issue)) : issues;
  assert.equal(rejectedIssues.length, 0, `Local dataset is NOT READY:\n${rejectedIssues.join('\n')}`);
  if (issues.length) console.warn(`[Firebase] Preserved dataset has recorded product issues; readiness is degraded:\n${issues.join('\n')}`);
  else console.log(`[Firebase] Dataset ${generation.manifest.datasetId} is ready and persisted.`);
};

const watch = async () => {
  for (;;) {
    try { await saveSnapshot(); }
    catch (error) { console.error(`[Firebase] Checkpoint failed: ${error.message}`); }
    await sleep(60000);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || 'start';
  if (command === 'start') {
    // Serve the preserved dataset for diagnosis without declaring broken product records healthy.
    await check(true);
  } else if (command === 'restore') {
    await withCheckpointWriter(restoreEmulators);
  } else if (command === 'bootstrap') {
    await bootstrap();
  } else if (command === 'adopt-snapshot') {
    assert(process.argv[3], 'adopt-snapshot requires an explicit verified export directory');
    const adopted = await adoptSnapshot(path.resolve(process.argv[3]));
    console.log(`[Firebase] Registered recovery generation ${adopted.manifest.generationId}; readiness issues: ${adopted.manifest.issues.join('; ')}`);
  } else if (command === 'watch') {
    await watch();
  } else if (command === 'seed') {
    await seedAccounts();
  } else if (command === 'check') {
    await check();
  } else if (command === 'save') {
    await saveSnapshot();
  } else if (command === 'import-rtdb') {
    await importRtdbSnapshot(process.argv[3]);
  } else {
    console.error('Usage: node scripts/local-firebase.mjs <start|check|bootstrap|restore|adopt-snapshot|watch|seed|save|import-rtdb> [snapshot directory or JSON]');
    process.exitCode = 1;
  }
}
