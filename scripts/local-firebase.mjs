import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalEmulators } from './import-live-firebase.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'demo-luyentap-local';
const emulatorPorts = { auth: 9099, database: 9000, firestore: 8080 };
const firebaseCli = path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const emulatorCache = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
const firestoreJar = path.join(emulatorCache, 'cloud-firestore-emulator-v1.20.4.jar');
const databaseJar = path.join(emulatorCache, 'firebase-database-emulator-v4.11.2.jar');
const isWindowsArm64 = process.platform === 'win32' && process.arch === 'arm64';
const snapshotDir = path.join(repoRoot, 'tmp', 'local-firebase');
const snapshotMetadataPath = path.join(snapshotDir, 'firebase-export-metadata.json');
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

const waitForPort = async (port, timeout = 60000) => {
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
    ...(restoreSnapshot ? ['--import', snapshotDir] : []),
  ]);
};

const startWindowsArm64JavaEmulator = (name, jar, port) => {
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
  if (name === 'firestore' && hasSnapshot) {
    helperArgs.push('-ImportMetadata', path.join(snapshotDir, 'firestore_export', 'firestore_export.overall_export_metadata'));
  }
  spawn('powershell.exe', helperArgs, { windowsHide: true });
  console.log(`[Firebase] Starting local ${name} emulator through WSL.`);
};
const startEmulators = async () => {
  hasSnapshot = await access(snapshotMetadataPath).then(() => true, () => false);
  const missing = [];
  for (const [name, port] of Object.entries(emulatorPorts)) {
    if (!(await isPortOpen(port))) missing.push(name);
  }

  if (missing.length > 0) {
    if (isWindowsArm64) {
      if (missing.includes('auth')) startFirebaseCli(['auth'], hasSnapshot);

      if (missing.includes('database')) {
        await access(databaseJar);
        startWindowsArm64JavaEmulator('database', databaseJar, emulatorPorts.database);
      }

      if (missing.includes('firestore')) {
        await access(firestoreJar);
        startWindowsArm64JavaEmulator('firestore', firestoreJar, emulatorPorts.firestore);
      }
    } else {
      startFirebaseCli(missing, hasSnapshot);
    }
  }

  await Promise.all(Object.values(emulatorPorts).map((port) => waitForPort(port)));
  await assertLocalEmulators();
  await readResponse(await fetch(`http://localhost:9000/.settings/rules.json?ns=${projectId}`, {
    method: 'PUT', redirect: 'error', headers: adminHeaders, body: await readFile(path.join(repoRoot, 'database.rules.json'), 'utf8'),
  }));
  if (isWindowsArm64 && hasSnapshot && missing.includes('database')) {
    await importRtdbSnapshot(path.join(snapshotDir, 'database_export', `${projectId}.json`), false);
  }
  console.log(`[Firebase] Local emulators ready for project ${projectId}.`);
};

let hasSnapshot = false;

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

const importRtdbSnapshot = async (snapshotPath, seed = true) => {
  if (!snapshotPath) throw new Error('Usage: node scripts/local-firebase.mjs import-rtdb <snapshot.json>');

  const resolvedPath = path.resolve(repoRoot, snapshotPath);
  const snapshot = await readFile(resolvedPath, 'utf8');
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

export const replaceSnapshot = async (stagingDir, destinationDir) => {
  const backupDir = `${destinationDir}.previous`;
  await rm(backupDir, { recursive: true, force: true });
  let movedExistingSnapshot = false;
  try {
    await rename(destinationDir, backupDir);
    movedExistingSnapshot = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await rename(stagingDir, destinationDir);
  } catch (error) {
    if (movedExistingSnapshot) await rename(backupDir, destinationDir);
    throw error;
  }
  if (movedExistingSnapshot) await rm(backupDir, { recursive: true, force: true });
};

const saveSnapshot = async () => {
  await check();
  const stagingDir = `${snapshotDir}.next`;
  for (const directory of [snapshotDir, stagingDir, `${snapshotDir}.previous`]) {
    assert.ok(path.relative(repoRoot, directory).startsWith(`tmp${path.sep}`), 'Snapshot must stay inside the workspace tmp directory.');
  }
  await rm(stagingDir, { recursive: true, force: true });
  try {
    await mkdir(path.join(stagingDir, 'database_export'), { recursive: true });
    await mkdir(path.join(stagingDir, 'auth_export'), { recursive: true });
    const databaseSnapshot = await readResponse(await fetch(`http://localhost:9000/.json?ns=${projectId}&format=export`, { redirect: 'error', headers: adminHeaders }));
    await writeFile(path.join(stagingDir, 'database_export', `${projectId}.json`), JSON.stringify(databaseSnapshot));
    const authSnapshot = await readResponse(await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=-1`, { redirect: 'error', headers: adminHeaders }));
    await writeFile(path.join(stagingDir, 'auth_export', 'accounts.json'), JSON.stringify(authSnapshot));
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
    await replaceSnapshot(stagingDir, snapshotDir);
    console.log(`[Firebase] Saved local Auth, RTDB and Firestore to ${snapshotDir}.`);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
};

const check = async () => {
  const status = await Promise.all(Object.entries(emulatorPorts).map(async ([name, port]) => [name, await isPortOpen(port)]));
  const unavailable = status.filter(([, available]) => !available).map(([name]) => name);
  if (unavailable.length > 0) throw new Error(`Local Firebase emulators unavailable: ${unavailable.join(', ')}.`);
  await assertLocalEmulators();
  console.log(`[Firebase] Local emulators are running for ${projectId}.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || 'start';
  if (command === 'start') {
    await startEmulators();
    await seedAccounts();
  } else if (command === 'seed') {
    await seedAccounts();
  } else if (command === 'check') {
    await check();
  } else if (command === 'save') {
    await saveSnapshot();
  } else if (command === 'import-rtdb') {
    await importRtdbSnapshot(process.argv[3]);
  } else {
    console.error('Usage: node scripts/local-firebase.mjs <start|seed|check|save|import-rtdb> [snapshot.json]');
    process.exitCode = 1;
  }
}
