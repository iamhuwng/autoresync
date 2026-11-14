import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDatabase, get as getDatabaseValue, ref as databaseRef, remove as removeDatabaseValue, set as setDatabaseValue } from 'firebase/database';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\0\r\n]/u.test(value)) throw new Error(`${label} is invalid`);
  return value.trim();
};
const parseArgs = argv => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--card') result.card = argv[++i];
    else if (value === '--binding') result.binding = argv[++i];
    else if (value === '--artifact-dir') result.artifactDir = argv[++i];
    else if (value === '--qualification-env-file') result.qualificationEnvFile = argv[++i];
    else if (value === '--output-dir') result.outputDir = argv[++i];
    else if (value === '--project') result.project = argv[++i];
    else if (value === '--site') result.site = argv[++i];
    else if (value === '--journey-command-file') result.journeyCommandFile = argv[++i];
    else throw new Error(`Unknown argument ${value}`);
  }
  return result;
};
const parseEnv = raw => Object.fromEntries(raw.split(/\r?\n/u).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/gu, '')]] : [];
}));
const run = (args, env, { allowFailure = false } = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, env, encoding: 'utf8', windowsHide: true });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`Command failed: ${args.join(' ')}`);
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
};
const journeyText = (value, label) => text(value, label);
export const parseJourneyCommand = value => {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !['command', 'label', 'services'].includes(key))) throw new Error('journey command must contain only command, label and services');
  if (!Array.isArray(value.command) || value.command.length < 1 || value.command.length > 32) throw new Error('journey command must be a bounded argument array');
  value.command.forEach((part, index) => journeyText(part, `journey command argument ${index}`));
  const services = value.services === undefined ? ['hosting', 'firebase-auth', 'firebase-rtdb', 'firebase-rules'] : value.services;
  if (!Array.isArray(services) || services.length < 1 || services.length > 5 || services.some(service => !stagingScope.included.includes(service))) throw new Error('journey services must be supported staging services');
  return { command: value.command, label: value.label === undefined ? 'Codex-selected staging journey' : journeyText(value.label, 'journey label'), services: [...new Set(services)] };
};
const readJourneyCommand = async file => {
  if (!file) return { command: ['scripts/tooling-where.mjs', '--exec', 'playwright', 'test', 'e2e/release-promotion-browser.spec.ts', '--config', 'playwright.release-promotion.config.mjs'], label: 'optional fixed Playwright experiment', services: ['hosting', 'firebase-auth', 'firebase-rtdb', 'firebase-rules'] };
  let value;
  try { value = JSON.parse(await readFile(path.resolve(file), 'utf8')); } catch { throw new Error('journey command file must contain valid JSON'); }
  return parseJourneyCommand(value);
};
const runJourney = async ({ journey, env, outputDir, redactions }) => {
  const result = spawnSync(journey.command[0], journey.command.slice(1), { cwd: repoRoot, env, encoding: 'utf8', windowsHide: true });
  const redact = value => redactions.reduce((output, secret) => secret ? output.replaceAll(secret, '[redacted]') : output, String(value || ''));
  await writeFile(path.join(outputDir, 'journey-command.json'), `${JSON.stringify({ label: journey.label, services: journey.services, command: journey.command }, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'journey-output.log'), `${redact(result.stdout)}\n${redact(result.stderr)}`);
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
};
export const stagingWorkerBindings = (values, required = false) => {
  const bindings = Object.fromEntries(Object.entries(values).filter(([key, value]) => /^VITE_.*WORKER.*(?:URL|ORIGIN)$/u.test(key) && /^https:\/\//u.test(value || '')));
  if (required && Object.keys(bindings).length === 0) throw new Error('selected staging journey requires non-production Worker endpoint bindings');
  return bindings;
};
const firebase = (args, env, options) => run(['scripts/tooling-where.mjs', '--exec', 'firebase', ...args], env, options);
const redactedCliOutput = value => String(value || '')
  .replace(/Bearer\s+\S+/giu, 'Bearer [redacted]')
  .replace(/AIza[0-9A-Za-z_-]+/gu, '[redacted-api-key]')
  .slice(-1200);
const oauthToken = () => process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() || execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', windowsHide: true }).trim();
const authHeaders = token => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const requestJson = async (url, init = {}) => {
  const response = await fetch(url, { redirect: 'error', ...init });
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
  if (!response.ok) { const error = new Error(`Remote request failed (${response.status})`); error.status = response.status; error.body = parsed; throw error; }
  return parsed;
};
const manifestDigest = manifest => sha256(JSON.stringify(manifest));
const canonicalFirebaseConfig = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
const canonicalHostingConfig = (Array.isArray(canonicalFirebaseConfig.hosting) ? canonicalFirebaseConfig.hosting : [canonicalFirebaseConfig.hosting])
  .find(entry => entry?.target === 'kahut1');
if (!canonicalHostingConfig) throw new Error('Canonical kahut1 Hosting configuration is missing');
export const qualificationHostingConfig = ({ site, publicDir = path.join(repoRoot, 'dist'), rulesPath = 'qualification-database.rules.json' } = {}) => {
  const hosting = JSON.parse(JSON.stringify(canonicalHostingConfig));
  delete hosting.target;
  hosting.site = text(site, 'Firebase qualification site');
  hosting.public = path.resolve(publicDir);
  // The retained manifest is a required hidden artifact; the canonical route and headers remain shared.
  hosting.ignore = (hosting.ignore || []).filter(pattern => pattern !== '**/.*');
  return { hosting, database: { rules: text(rulesPath, 'Firebase qualification rules path') } };
};
export const qualificationDatabaseRules = {
  rules: {
    '.read': false,
    '.write': false,
    users: {
      '$uid': {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': 'auth != null && auth.uid === $uid',
        role: {
          '.validate': "newData.val() === 'student' && (!data.exists() || newData.val() === data.val())",
        },
        status: {
          '.validate': "newData.val() === 'active' && (!data.exists() || newData.val() === data.val())",
        },
      },
    },
  },
};
export const stagingScope = Object.freeze({
  included: ['hosting', 'firebase-auth', 'firebase-rtdb', 'firebase-rules', 'workers'],
  excluded: ['backblaze', 'storage', 'functions', 'migrations', 'production-data'],
});
export const waitForManifest = async (url, expectedDigest, timeoutMs = 120_000, label = 'Hosting preview') => {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'manifest unavailable';
  while (Date.now() < deadline) {
    try {
      const manifest = await requestJson(`${url}/.well-known/luyentap-release.json`, { headers: { 'cache-control': 'no-cache' } });
      if (manifestDigest(manifest) !== expectedDigest) throw new Error('preview manifest differs from retained artifact');
      await Promise.all(manifest.files.map(async file => {
        const response = await fetch(`${url}${file.path}`, { headers: { 'cache-control': 'no-cache' }, redirect: 'error' });
        if (!response.ok) throw new Error(`preview asset unavailable: ${file.path}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (sha256(bytes) !== file.sha256) throw new Error(`preview asset differs from retained artifact: ${file.path}`);
      }));
      return manifest;
    } catch (error) { lastError = error.message; await new Promise(resolve => setTimeout(resolve, 1500)); }
  }
  throw new Error(`${label} manifest readback failed at ${url}: ${lastError}`);
};
export const outputUrl = output => [...output.matchAll(/https:\/\/[^\s)]+(?:\.web\.app|\.firebaseapp\.com)[^\s)]*/gu)].at(-1)?.[0]?.replace(/[.,]+$/u, '') || '';
export const assertBrowserEvidenceVerified = evidence => {
  if (evidence?.decision !== 'verified') throw new Error(evidence?.summary || `Browser qualification is ${evidence?.decision || 'invalid'}`);
  return evidence;
};
export const accountState = async ({ project, uid, token }) => {
  try {
    const result = await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ localId: [uid] }) });
    return (result.users || []).some(user => user.localId === uid) ? 'present' : 'absent';
  } catch (error) {
    if (error.status === 400 && error.body?.error?.message === 'USER_NOT_FOUND') return 'absent';
    throw error;
  }
};
const deleteAccount = async ({ project, uid, token, databaseUrl, profileSession, profileAttempted }) => {
  const errors = [];
  if (profileAttempted && profileSession) {
    try {
      const profile = databaseRef(profileSession.database, `users/${uid}`);
      await removeDatabaseValue(profile);
      if ((await getDatabaseValue(profile)).exists()) errors.push(`RTDB profile remains after deletion: ${uid}`);
    } catch (error) { errors.push(`Profile deletion failed for ${uid}: ${error.message}`); }
    try { await signOut(profileSession.auth); } catch (error) { errors.push(`Firebase profile session cleanup failed for ${uid}: ${error.message}`); }
    try { await deleteApp(profileSession.app); } catch (error) { errors.push(`Firebase app cleanup failed for ${uid}: ${error.message}`); }
  } else if (profileAttempted) {
    try { await requestJson(`${databaseUrl}/users/${encodeURIComponent(uid)}.json`, { method: 'DELETE', headers: authHeaders(token) }); }
    catch (error) { errors.push(`Administrative profile deletion failed for ${uid}: ${error.message}`); }
    try {
      if (await requestJson(`${databaseUrl}/users/${encodeURIComponent(uid)}.json`, { headers: authHeaders(token) }) !== null) errors.push(`RTDB profile remains after deletion: ${uid}`);
    } catch (error) { errors.push(`Unable to verify RTDB profile deletion for ${uid}: ${error.message}`); }
  }
  try { await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ localId: uid }) }); }
  catch (error) { errors.push(`Auth deletion failed for ${uid}: ${error.message}`); }
  try { if (await accountState({ project, uid, token }) !== 'absent') errors.push(`Auth account remains after deletion: ${uid}`); }
  catch (error) { errors.push(`Unable to verify Auth account deletion for ${uid}: ${error.message}`); }
  if (errors.length) throw new Error(errors.join('; '));
};
const deleteChannel = (channel, site, project, env, config) => {
  const result = firebase(['hosting:channel:delete', channel, '--site', site, '--project', project, '--config', config, '--force'], env, { allowFailure: true });
  if (result.status !== 0) throw new Error(`Hosting channel deletion failed for ${channel}`);
};
const channelExists = (channel, site, project, env, config) => {
  const result = firebase(['hosting:channel:list', '--site', site, '--project', project, '--config', config, '--json', '--non-interactive'], env, { allowFailure: true });
  const detail = redactedCliOutput(`status=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  if (result.status !== 0) return { present: null, detail };
  try { return { present: (JSON.parse(result.stdout).result?.channels || []).some(entry => entry.name?.endsWith(`/channels/${channel}`)), detail }; }
  catch { return { present: null, detail: `${detail}\nresponse=invalid-json` }; }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if ((!args.card && !args.binding) || !args.qualificationEnvFile || !args.outputDir) throw new Error('binding or card, qualification environment and output directory are required');
  const binding = JSON.parse(await readFile(path.resolve(args.binding || args.card), 'utf8'));
  const source = binding.source;
  const artifact = binding.artifact;
  const envBytes = await readFile(path.resolve(args.qualificationEnvFile));
  const env = parseEnv(envBytes.toString('utf8'));
  const project = text(args.project || env.VITE_FIREBASE_QUALIFICATION_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID, 'Firebase qualification project');
  const site = text(args.site || env.VITE_FIREBASE_QUALIFICATION_HOSTING_SITE || env.VITE_FIREBASE_HOSTING_SITE, 'Firebase qualification site');
  if (project === 'temp-a1437' || env.VITE_FIREBASE_LOCAL_ONLY === 'true') throw new Error('qualification Firebase must be a dedicated non-production project');
  if (sha256(envBytes) === binding.environmentFingerprint) throw new Error('retained production artifact is bound to the production Firebase environment; build a qualification-bound artifact before browser qualification');
  const qualificationKey = key => env[`VITE_FIREBASE_QUALIFICATION_${key.replace('VITE_FIREBASE_', '')}`] || env[key];
  const configuredDatabaseUrl = qualificationKey('VITE_FIREBASE_DATABASE_URL');
  if (!configuredDatabaseUrl) throw new Error('qualification environment must include VITE_FIREBASE_QUALIFICATION_DATABASE_URL');
  for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID']) {
    if (!qualificationKey(key)) throw new Error(`qualification environment is missing VITE_FIREBASE_QUALIFICATION_${key.replace('VITE_FIREBASE_', '')}`);
  }
  const outputDir = path.resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });
  const journey = await readJourneyCommand(args.journeyCommandFile);
  const channel = `qualification-release-${process.env.GITHUB_RUN_ID || 'local'}-${randomUUID().slice(0, 8)}`;
  const recoveryChannel = `${channel}-recovery`;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const accountPassword = `Q${randomUUID().replaceAll('-', '')}!a9`;
  const accounts = [
    { role: 'teacher', email: `release.teacher.${suffix}@qualification.invalid`, uid: `${channel}-teacher`, displayName: `Release Smoke Teacher ${suffix}` },
    { role: 'student', email: `release.student.${suffix}@qualification.invalid`, uid: `${channel}-student`, displayName: `Release Smoke Student ${suffix}` },
  ];
  const attemptedAccounts = [];
  const profileSessions = new Map();
  const profileAttempts = new Set();
  const baseUrl = new URL(configuredDatabaseUrl);
  const databaseUrl = `${baseUrl.protocol}//${baseUrl.host}`;
  let previewUrl = '', recoveryUrl = '', token = '', failure;
  const cleanupErrors = [];
  const configPath = path.join(outputDir, 'qualification-firebase.json');
  const rulesPath = path.join(outputDir, 'qualification-database.rules.json');
  await writeFile(configPath, `${JSON.stringify(qualificationHostingConfig({ site, publicDir: args.artifactDir || path.join(repoRoot, 'dist'), rulesPath: path.basename(rulesPath) }), null, 2)}\n`);
  await writeFile(rulesPath, `${JSON.stringify(qualificationDatabaseRules, null, 2)}\n`);
  const childEnv = { ...process.env, CI: 'true' };
  try {
    token = oauthToken();
    const deploy = firebase(['hosting:channel:deploy', channel, '--project', project, '--config', configPath, '--non-interactive'], childEnv);
    previewUrl = outputUrl(`${deploy.stdout}\n${deploy.stderr}`);
    if (!previewUrl) throw new Error('Firebase did not return a qualification preview URL');
    await waitForManifest(previewUrl, artifact.manifestSha256, 120_000, 'Disposable Hosting channel');
    const rulesDeploy = firebase(['deploy', '--only', 'database', '--project', project, '--config', configPath, '--non-interactive'], childEnv, { allowFailure: true });
    if (rulesDeploy.status !== 0) throw new Error(`Qualification database rules deployment failed: ${redactedCliOutput(`${rulesDeploy.stderr}\n${rulesDeploy.stdout}`)}`);
    for (const account of accounts) {
      attemptedAccounts.push(account);
      await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchCreate`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ allowOverwrite: false, users: [{ localId: account.uid, email: account.email, rawPassword: accountPassword, displayName: account.displayName, emailVerified: true }] }) });
      const profile = { uid: account.uid, email: account.email, displayName: account.displayName, firstName: account.displayName, familyName: 'Release Smoke', role: account.role, status: 'active', createdAt: Date.now(), lastLoginAt: Date.now(), profileCompletedAt: Date.now(), forceReauth: false, releaseSmoke: { sourceRevision: source.revision, backendRevision: source.baseRevision } };
      if (account.role === 'teacher') {
        profileAttempts.add(account.uid);
        await requestJson(`${databaseUrl}/users/${encodeURIComponent(account.uid)}.json`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(profile) });
        continue;
      }
      const app = initializeApp({
        apiKey: qualificationKey('VITE_FIREBASE_API_KEY'),
        authDomain: qualificationKey('VITE_FIREBASE_AUTH_DOMAIN'),
        databaseURL: qualificationKey('VITE_FIREBASE_DATABASE_URL'),
        projectId: qualificationKey('VITE_FIREBASE_PROJECT_ID'),
        storageBucket: qualificationKey('VITE_FIREBASE_STORAGE_BUCKET'),
        messagingSenderId: qualificationKey('VITE_FIREBASE_MESSAGING_SENDER_ID'),
        appId: qualificationKey('VITE_FIREBASE_APP_ID'),
      }, `release-qualification-${account.uid}`);
      const auth = getAuth(app);
      const database = getDatabase(app);
      const profileSession = { app, auth, database };
      profileSessions.set(account.uid, profileSession);
      await signInWithEmailAndPassword(auth, account.email, accountPassword);
      profileAttempts.add(account.uid);
      await setDatabaseValue(databaseRef(database, `users/${account.uid}`), profile);
    }
    const stagingWorkerUrls = stagingWorkerBindings(env, journey.services.includes('workers'));
    const browserEnv = { ...childEnv, RELEASE_STAGING_BASE_URL: previewUrl, RELEASE_STAGING_OUTPUT_DIR: outputDir, RELEASE_STAGING_PROJECT: project, RELEASE_STAGING_SITE: site, RELEASE_STAGING_DATABASE_URL: databaseUrl, RELEASE_STAGING_API_KEY: qualificationKey('VITE_FIREBASE_API_KEY'), RELEASE_STAGING_WORKER_URLS: JSON.stringify(stagingWorkerUrls), RELEASE_STAGING_SOURCE_REVISION: source.revision, RELEASE_STAGING_SOURCE_FINGERPRINT: source.fingerprint, RELEASE_BROWSER_BASE_URL: previewUrl, RELEASE_BROWSER_OUTPUT_DIR: outputDir, RELEASE_BROWSER_TEACHER_EMAIL: accounts[0].email, RELEASE_BROWSER_STUDENT_EMAIL: accounts[1].email, RELEASE_BROWSER_PASSWORD: accountPassword, RELEASE_BROWSER_DATABASE_URL: databaseUrl, RELEASE_BROWSER_API_KEY: qualificationKey('VITE_FIREBASE_API_KEY') };
    const browser = await runJourney({ journey, env: browserEnv, outputDir, redactions: [accountPassword, accounts[0].email, accounts[1].email, qualificationKey('VITE_FIREBASE_API_KEY')] });
    if (browser.status !== 0) throw new Error(`${journey.label} failed`);
    const clone = firebase(['hosting:clone', `${site}:${channel}`, `${site}:${recoveryChannel}`, '--project', project, '--non-interactive'], childEnv);
    recoveryUrl = outputUrl(`${clone.stdout}\n${clone.stderr}`);
    if (!recoveryUrl) throw new Error('Firebase did not return a recovery channel URL');
    await waitForManifest(recoveryUrl, artifact.manifestSha256, 120_000, 'Native Hosting clone channel');
  } catch (error) { failure = error; }
  finally {
    for (const account of attemptedAccounts) { try { await deleteAccount({ project, uid: account.uid, token, databaseUrl, profileSession: profileSessions.get(account.uid), profileAttempted: profileAttempts.has(account.uid) }); } catch (error) { cleanupErrors.push(error.message); } }
    for (const name of [recoveryChannel, channel]) {
      const observed = channelExists(name, site, project, childEnv, configPath);
      if (observed.present === null) { cleanupErrors.push(`Unable to verify Hosting channel cleanup: ${name}; ${observed.detail}`); continue; }
      if (!observed.present) continue;
      try { deleteChannel(name, site, project, childEnv, configPath); } catch (error) { cleanupErrors.push(error.message); continue; }
      const remains = channelExists(name, site, project, childEnv, configPath);
      if (remains.present === null) cleanupErrors.push(`Unable to verify Hosting channel cleanup after deletion: ${name}; ${remains.detail}`);
      else if (remains.present) cleanupErrors.push(`Hosting channel remains after deletion: ${name}`);
    }
  }
  await rm(configPath, { force: true });
  await rm(rulesPath, { force: true });
  const browserEvidence = { decision: !failure && cleanupErrors.length === 0 ? 'verified' : 'blocked', observedAt: new Date().toISOString(), scenario: journey.label, services: journey.services, stagingScope, sourceRevision: source.revision, sourceFingerprint: source.fingerprint, runtimeEnvironmentFingerprint: sha256(envBytes), artifactEnvironmentFingerprint: artifact.environmentFingerprint, configurationFingerprint: binding.configurationFingerprint, evidenceRefs: [`github-actions://run/${process.env.GITHUB_RUN_ID || 'local'}/artifacts/release-browser-evidence`, ...(previewUrl ? [previewUrl] : []), ...(recoveryUrl ? [recoveryUrl] : [])], summary: !failure && cleanupErrors.length === 0 ? `Selected staging journey, retained-artifact manifest readback, native clone recovery, and independently verified cleanup passed: ${journey.label}.` : `Staging verification blocked: ${[failure?.message, ...cleanupErrors].filter(Boolean).join('; ') || 'unknown failure'}` };
  await writeFile(path.join(outputDir, 'browser.json'), `${JSON.stringify(browserEvidence, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'coordinated-change.json'), `${JSON.stringify({ schemaVersion: 1, decision: 'unqualified', reason: 'No coordinated frontend/backend deployment experiment or rollback rejection was performed by this browser lane.', sourceRevision: source.revision }, null, 2)}\n`);
  assertBrowserEvidenceVerified(browserEvidence);
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
