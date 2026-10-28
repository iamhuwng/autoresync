import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { assess } from './release-check.mjs';
import { listeningEditorHostingReady } from './release-listening-editor-evidence.mjs';
import { writeHostingManifest } from './release-evidence.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const expectedProjectId = 'temp-a1437';
const expectedHostingTarget = 'kahut1';
const notificationOrigin = 'https://luyentap-notification-firestore-qa.iamhuwng.workers.dev';
const notificationEndpointPaths = {
  VITE_HOMEWORK_NOTIFICATION_URL: '/',
  VITE_WRITING_NOTIFICATION_URL: '/',
  VITE_HOMEWORK_RESULT_AUTHORITY_URL: '/',
  VITE_COURSE_ENROLLMENT_APPROVAL_URL: '/course-enrollment-approval',
};
const requiredProductionModes = {
  VITE_READING_V2_ROLLOUT_MODE: 'public',
  VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY: 'opt-in',
  VITE_READING_PASSAGE_LIBRARY: 'enabled',
  VITE_READING_PASSAGE_HOMEWORK: 'enabled',
  VITE_MATERIAL_BOOKS: 'enabled',
  VITE_MATERIAL_BOOK_EDITOR: 'enabled',
  VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'disabled',
  VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION: 'disabled',
  VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION: 'disabled',
  VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION: 'disabled',
  VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'disabled',
  VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'disabled',
};
const requiredFirebaseKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const forbiddenBundleMarkers = [
  'demo-luyentap-local',
  'local-dev-key',
  'https://localhost:8787',
  'http://localhost:8787',
  'localhost:9000',
  'http://localhost:9000?ns=demo-luyentap-local',
  'localhost:9099',
  'localhost:8080',
  'localhost:5001',
];
const forbiddenBundlePatterns = [
  /(?:https?:\/\/)(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]):(8787|9000|9099|8080|5001)\b/iu,
];

const fail = (message) => {
  throw new Error(`[Production deploy blocked] ${message}`);
};

export const selectReleaseSource = ({ sourceCwd, observeListening = false, observeListeningEditorRelease = false, listeningPhase, cwd = repoRoot } = {}) => {
  if (sourceCwd && !observeListening && !observeListeningEditorRelease) fail('external source cwd requires qualified Listening observation.');
  if (observeListening && observeListeningEditorRelease) fail('Choose only one Listening release profile.');
  if (observeListeningEditorRelease && !['postupload', 'postrules'].includes(listeningPhase)) fail('Editor Hosting deployment requires postupload or postrules phase, as fixed by the reviewed profile.');
  if (observeListening && listeningPhase !== 'homework') fail('Listening Hosting deployment requires the homework phase.');
  return path.resolve(sourceCwd || cwd);
};

export const assertListeningHostingReady = (result, observeListening = false, observeListeningEditorRelease = false) => {
  if (observeListeningEditorRelease && result.editorObservation?.scope === 'upload-worker-only') fail('Worker-only qualification cannot deploy Hosting.');
  if (observeListeningEditorRelease && (!listeningEditorHostingReady(result.editorObservation) || result.hostingReady !== true)) fail('Editor Hosting deployment requires its verified profile phase (postupload for editor; postrules for functional completion/private audio) and hostingReady=true.');
  if (observeListening && (result.listeningObservation?.phase !== 'homework' || result.hostingReady !== true)) {
    fail(`Listening Hosting deployment requires verified homework phase and hostingReady=true. ${result.findings?.find(finding => finding.status !== 'PASS')?.message ?? 'Native homework observation is missing.'}`);
  }
};

export const assertReleaseAssessment = async ({ mode = 'release', baselinePath, baselineSha256, base, fingerprint, productionEnvFingerprint, currentProductionEnvFingerprint, observedFingerprint, compatibilityReviewPath, cwd = repoRoot, observeListening = false, observeListeningEditorRelease = false, listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig }) => {
  selectReleaseSource({ observeListening, observeListeningEditorRelease, listeningPhase, cwd });
  if (mode === 'acceptance') fail('acceptance assessments cannot invoke the production deployment route.');
  if (!base) fail('missing LUYENTAP_RELEASE_BASE; deployment source must be explicitly compared with a reviewed revision.');
  if (!fingerprint) fail('missing LUYENTAP_RELEASE_FINGERPRINT; deployment approval must bind to the assessed source tree.');
  if (baselinePath && !baselineSha256) fail('missing LUYENTAP_RELEASE_BASELINE_SHA256; deployment approval must bind to the exact baseline evidence.');
  if (!productionEnvFingerprint) fail('missing LUYENTAP_RELEASE_ENV_FINGERPRINT; deployment approval must bind to the exact production environment.');
  if (productionEnvFingerprint !== currentProductionEnvFingerprint) fail('production environment changed since release assessment.');
  if (!observedFingerprint) fail('missing LUYENTAP_RELEASE_OBSERVED_FINGERPRINT; reviewed remote state must be bound to preflight.');
  const result = await assess({ cwd, mode, base, baselinePath, productionEnvFingerprint, compatibilityReviewPath, observe: true, observeListening, observeListeningEditorRelease, listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig });
  assertListeningHostingReady(result, observeListening, observeListeningEditorRelease);
  if (!baselinePath && !result.observed) fail('no independently observed production baseline is available; complete the one-time Hosting evidence bootstrap or supply per-service evidence.');
  if (result.observed?.fingerprint !== observedFingerprint) fail('production Hosting changed since review.');
  if (result.source.fingerprint !== fingerprint) fail('release assessment fingerprint does not match the approved source tree.');
  if (result.baseline?.sha256 !== baselineSha256) fail('release assessment baseline fingerprint does not match the approved evidence.');
  if (!['PASS', 'NOT_APPLICABLE'].includes(result.decision)) fail(`release assessment is ${result.decision}; deployment is gated.`);
  return result;
};

const isLocalValue = (value) => /(?:\bdemo-[a-z0-9-]+\b|local-dev|localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|(?:^|[/:])::1(?:$|[/:]))/iu.test(value);

const isPlaceholder = (value) => /^(?:your[_-]|<|\$\{|placeholder$)/iu.test(value.trim());

export const cleanParentEnv = (parentEnv) => Object.fromEntries(
  Object.entries(parentEnv).filter(([key]) => !/^VITE_/iu.test(key)
    && !['LUYENTAP_ENV_DIR', 'LUYENTAP_VITE_CACHE_DIR'].includes(key)
    && !key.endsWith('_EMULATOR_HOST')),
);

export const assertCleanWorkingTree = (status) => {
  if (status.error || status.status !== 0) fail('cannot verify the Git working tree.');
  if (status.stdout.trim()) fail('the working tree has uncommitted changes. Review and commit the release before deploying.');
};

export const findForbiddenBundleMarker = (content) => {
  // shortcut: scan the fixed local identity and emulator ports; generic demo-* strings collide with Firebase SDK text.
  const exact = forbiddenBundleMarkers.find((candidate) => content.includes(candidate));
  if (exact) return exact;
  return forbiddenBundlePatterns.map((pattern) => content.match(pattern)?.[0]).find(Boolean);
};

const readProductionEnv = async (cwd = repoRoot) => {
  const configuredPath = process.env.LUYENTAP_PRODUCTION_ENV_FILE
    || path.join(os.homedir(), '.luyentap', 'env', '.env.production');
  const envFile = path.resolve(configuredPath);
  let raw;
  try {
    raw = await readFile(envFile, 'utf8');
  } catch {
    fail(`missing ${envFile}. Create this machine-local file with the reviewed production VITE_* values; do not reuse .env.local.`);
  }

  const dotenv = createRequire(path.join(cwd, 'package.json'))('dotenv');
  const values = dotenv.parse(raw);
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('VITE_')) fail(`${key} is not a VITE_* production setting.`);
    if (/^VITE_(?:GEMINI|GROQ)_API_KEY(?:_\d+)?$/iu.test(key)) {
      fail(`${key} is a provider credential setting; keep provider secrets in the AI gateway.`);
    }
    if (isPlaceholder(value)) fail(`${key} is still a placeholder.`);
    if (key.endsWith('_EMULATOR_HOST') && value.trim()) fail(`${key} is present in the production environment.`);
    if (isLocalValue(value)) fail(`${key} contains a local/demo endpoint.`);
  }
  for (const key of requiredFirebaseKeys) {
    const value = values[key]?.trim();
    if (!value || isPlaceholder(value)) fail(`${key} is missing or still a placeholder in ${envFile}.`);
  }
  if (values.VITE_FIREBASE_PROJECT_ID !== expectedProjectId) {
    fail(`VITE_FIREBASE_PROJECT_ID must be ${expectedProjectId}.`);
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(values.VITE_FIREBASE_DATABASE_URL);
  } catch {
    fail('VITE_FIREBASE_DATABASE_URL must be a valid HTTPS URL.');
  }
  const isProjectDatabase = databaseUrl.hostname === `${expectedProjectId}-default-rtdb.firebaseio.com`
    || new RegExp(`^${expectedProjectId}-default-rtdb\\.[a-z0-9-]+\\.firebasedatabase\\.app$`, 'u').test(databaseUrl.hostname);
  if (databaseUrl.protocol !== 'https:' || !isProjectDatabase
    || databaseUrl.username || databaseUrl.password || databaseUrl.port
    || databaseUrl.pathname !== '/' || databaseUrl.search || databaseUrl.hash) {
    fail(`VITE_FIREBASE_DATABASE_URL must identify the ${expectedProjectId} Realtime Database.`);
  }
  if (values.VITE_FIREBASE_AUTH_DOMAIN !== `${expectedProjectId}.firebaseapp.com`) {
    fail(`VITE_FIREBASE_AUTH_DOMAIN must be ${expectedProjectId}.firebaseapp.com.`);
  }
  if (![`${expectedProjectId}.appspot.com`, `${expectedProjectId}.firebasestorage.app`]
    .includes(values.VITE_FIREBASE_STORAGE_BUCKET)) {
    fail(`VITE_FIREBASE_STORAGE_BUCKET must identify the ${expectedProjectId} bucket.`);
  }
  if (values.VITE_FIREBASE_LOCAL_ONLY?.trim().toLowerCase() === 'true') {
    fail('VITE_FIREBASE_LOCAL_ONLY=true is a local-only setting.');
  }

  for (const [key, pathname] of Object.entries(notificationEndpointPaths)) {
    let endpoint;
    try { endpoint = new URL(values[key]); } catch { fail(`${key} must identify the reviewed ordinary notification endpoint.`); }
    if (endpoint.origin !== notificationOrigin || endpoint.pathname !== pathname
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      fail(`${key} must identify the reviewed ordinary notification endpoint.`);
    }
  }
  if (values.VITE_THCS_GEMMA_WORKER_URL?.replace(/\/$/u, '') !== 'https://thcs-gemma.iamhuwng.workers.dev') {
    fail('VITE_THCS_GEMMA_WORKER_URL must identify the reviewed AI gateway.');
  }
  for (const [key, mode] of Object.entries(requiredProductionModes)) {
    if (values[key]?.trim().toLowerCase() !== mode) {
      fail(`${key} must be ${mode} to preserve the reviewed live workflows and rollout boundaries.`);
    }
  }

  let firebaseRc;
  try {
    firebaseRc = JSON.parse(await readFile(path.join(cwd, '.firebaserc'), 'utf8'));
  } catch {
    fail('cannot read .firebaserc to verify the Hosting target.');
  }
  const hostingTargets = firebaseRc.targets?.[expectedProjectId]?.hosting || {};
  if (firebaseRc.projects?.default !== expectedProjectId
    || JSON.stringify(hostingTargets[expectedHostingTarget]) !== JSON.stringify([expectedHostingTarget])) {
    fail(`.firebaserc must map ${expectedProjectId} to Hosting target ${expectedHostingTarget}.`);
  }

  let firebaseConfig;
  try {
    firebaseConfig = JSON.parse(await readFile(path.join(cwd, 'firebase.json'), 'utf8'));
  } catch {
    fail('cannot read firebase.json to verify the Hosting public directory.');
  }
  const hostingEntries = Array.isArray(firebaseConfig.hosting) ? firebaseConfig.hosting : [firebaseConfig.hosting];
  const hostingConfigs = hostingEntries.filter((entry) => entry?.target === expectedHostingTarget);
  if (hostingConfigs.length !== 1 || hostingConfigs[0].public !== 'dist') {
    fail(`firebase.json must map Hosting target ${expectedHostingTarget} to public directory dist.`);
  }

  let tempEnvDir;
  try {
    tempEnvDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-production-'));
    await writeFile(path.join(tempEnvDir, '.env'), raw, { mode: 0o600 });
  } catch (error) {
    if (tempEnvDir) await rm(tempEnvDir, { recursive: true, force: true });
    throw error;
  }
  return {
    tempEnvDir,
    env: {
      ...cleanParentEnv(process.env),
      ...values,
      NODE_ENV: 'production',
      LUYENTAP_ENV_DIR: tempEnvDir,
      LUYENTAP_VITE_CACHE_DIR: path.join(tempEnvDir, 'vite-cache'),
    },
    envFile,
    envFingerprint: crypto.createHash('sha256').update(raw).digest('hex'),
  };
};

const run = (commandArgs, env, cwd = repoRoot) => {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}.`);
  }
};

const assertProductionBundle = async (cwd = repoRoot) => {
  const distRoot = path.join(cwd, 'dist');
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && /\.(?:html|js|mjs|json|css|map)$/iu.test(entry.name)) files.push(entryPath);
    }
  };
  try {
    await visit(distRoot);
  } catch {
    fail('the production build did not create dist/.');
  }
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const marker = findForbiddenBundleMarker(content);
    if (marker) fail(`built file ${path.relative(cwd, file)} contains local marker ${marker}.`);
  }
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--build-only')) fail('only --build-only is supported by this script.');
  const buildOnly = args.has('--build-only');
  let tempEnvDir, releaseAssessment;
  try {
    const listeningOptions = {
      observeListening: process.env.LUYENTAP_RELEASE_OBSERVE_LISTENING === 'true',
      observeListeningEditorRelease: process.env.LUYENTAP_RELEASE_OBSERVE_LISTENING_EDITOR === 'true',
      listeningPhase: process.env.LUYENTAP_LISTENING_PHASE,
      listeningUploadBundle: process.env.LUYENTAP_LISTENING_UPLOAD_BUNDLE,
      listeningUploadConfig: process.env.LUYENTAP_LISTENING_UPLOAD_CONFIG,
      listeningHomeworkBundle: process.env.LUYENTAP_LISTENING_HOMEWORK_BUNDLE,
      listeningHomeworkConfig: process.env.LUYENTAP_LISTENING_HOMEWORK_CONFIG,
    };
    const cwd = selectReleaseSource({ sourceCwd: process.env.LUYENTAP_RELEASE_SOURCE_CWD, ...listeningOptions });
    const sourceScripts = path.join(cwd, 'scripts');
    const loaded = await readProductionEnv(cwd);
    tempEnvDir = loaded.tempEnvDir;
    const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', windowsHide: true });
    assertCleanWorkingTree(status);
    if (!buildOnly) {
      releaseAssessment = await assertReleaseAssessment({
        mode: process.env.LUYENTAP_RELEASE_MODE || 'release',
        baselinePath: process.env.LUYENTAP_RELEASE_BASELINE_FILE,
        baselineSha256: process.env.LUYENTAP_RELEASE_BASELINE_SHA256,
        base: process.env.LUYENTAP_RELEASE_BASE,
        fingerprint: process.env.LUYENTAP_RELEASE_FINGERPRINT,
        productionEnvFingerprint: process.env.LUYENTAP_RELEASE_ENV_FINGERPRINT,
        currentProductionEnvFingerprint: loaded.envFingerprint,
        observedFingerprint: process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT,
        compatibilityReviewPath: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE,
        cwd,
        ...listeningOptions,
      });
    }
    console.log(`[Production] ${buildOnly ? 'Building' : 'Building and deploying'} ${expectedProjectId}/${expectedHostingTarget} with ${loaded.envFile}`);
    run([path.join(sourceScripts, 'tooling-where.mjs'), '--exec', 'vite', 'build', '--mode', 'production'], loaded.env, cwd);
    run([path.join(sourceScripts, 'check-bundle-budget.mjs')], loaded.env, cwd);
    await assertProductionBundle(cwd);
    await writeHostingManifest({ cwd, envFingerprint: loaded.envFingerprint, hotfixes: releaseAssessment?.hotfixes || [] });
    if (buildOnly) {
      console.log('[Production] Build and local-value checks passed; no remote mutation was performed.');
      return;
    }
    const currentEnv = crypto.createHash('sha256').update(await readFile(loaded.envFile)).digest('hex');
    await assertReleaseAssessment({
      mode: process.env.LUYENTAP_RELEASE_MODE || 'release',
      baselinePath: process.env.LUYENTAP_RELEASE_BASELINE_FILE,
      baselineSha256: process.env.LUYENTAP_RELEASE_BASELINE_SHA256,
      base: process.env.LUYENTAP_RELEASE_BASE,
      fingerprint: process.env.LUYENTAP_RELEASE_FINGERPRINT,
      productionEnvFingerprint: process.env.LUYENTAP_RELEASE_ENV_FINGERPRINT,
      currentProductionEnvFingerprint: currentEnv,
      observedFingerprint: process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT,
      compatibilityReviewPath: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE,
      cwd,
      ...listeningOptions,
    });
    run([
      path.join(sourceScripts, 'tooling-where.mjs'),
      '--exec', 'firebase', 'deploy',
      '--only', `hosting:${expectedHostingTarget}`,
      '--project', expectedProjectId,
      '--non-interactive',
    ], loaded.env, cwd);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (tempEnvDir) await rm(tempEnvDir, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
