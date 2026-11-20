import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { assess, classifyPaths, collectSourceState, hostingImpactPaths, parseCompatibilityReviewBinding } from './release-check.mjs';
import { hasHostingDependencyProbes, isHostingDependenciesObserved, observeHostingDependencies, selectHostingDependencyScope } from './release-hosting-dependencies.mjs';
import { writeHostingManifest, observeHosting, observeHostingProvider, readLiveHostingManifestFingerprint, isObserved, waitForHostingLive, assertHostingArtifact, hostingRollbackCommand } from './release-evidence.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const expectedProjectId = 'temp-a1437';
const expectedHostingTarget = 'kahut1';
export const hostingReleaseMessage = value => value.length <= 255 ? value : `${value.slice(0, 252)}...`;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const writeOperationOutcome = async ({ file, outcome, cwd = repoRoot } = {}) => {
  const configured = file || process.env.LUYENTAP_RELEASE_OUTCOME_FILE;
  if (!configured) return null;
  const destination = path.resolve(cwd, configured);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(outcome)}\n`, 'utf8');
  return destination;
};
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
const qualificationFirebaseKeys = [...requiredFirebaseKeys.map(key => key.replace('VITE_FIREBASE_', 'VITE_FIREBASE_QUALIFICATION_')), 'VITE_FIREBASE_QUALIFICATION_HOSTING_SITE'];
export const assertQualificationFirebaseValues = values => {
  const qualificationPresent = qualificationFirebaseKeys.filter(key => values[key]?.trim()).length;
  if (qualificationPresent !== 0 && qualificationPresent !== qualificationFirebaseKeys.length) {
    fail('qualification Firebase configuration must provide all VITE_FIREBASE_QUALIFICATION_* keys or none.');
  }
  for (const key of qualificationFirebaseKeys) {
    if (!values[key]) continue;
    if (isPlaceholder(values[key]) || isLocalValue(values[key])) fail(`${key} is placeholder or local-only.`);
  }
};
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

export const selectReleaseSource = ({ sourceCwd, cwd = repoRoot } = {}) => {
  if (sourceCwd) fail('external source cwd is not supported for production deployment.');
  return path.resolve(cwd);
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

export const readProductionEnv = async (cwd = repoRoot) => {
  const configuredPath = process.env.LUYENTAP_PRODUCTION_ENV_FILE
    || path.join(os.homedir(), '.luyentap', 'env', '.env.production');
  const envFile = path.resolve(configuredPath);
  let raw, qualificationRaw = '';
  try {
    raw = await readFile(envFile, 'utf8');
  } catch {
    fail(`missing ${envFile}. Create this machine-local file with the reviewed production VITE_* values; do not reuse .env.local.`);
  }
  const configuredQualificationPath = process.env.LUYENTAP_QUALIFICATION_ENV_FILE;
  if (configuredQualificationPath) {
    const qualificationFile = path.resolve(configuredQualificationPath);
    try {
      qualificationRaw = await readFile(qualificationFile, 'utf8');
    } catch {
      fail(`missing ${qualificationFile}. Provide the separate qualification environment when qualification settings are required.`);
    }
  }

  const dotenv = createRequire(path.join(cwd, 'package.json'))('dotenv');
  const productionValues = dotenv.parse(raw);
  const qualificationValues = dotenv.parse(qualificationRaw);
  for (const [key, value] of Object.entries(productionValues)) {
    if (!key.startsWith('VITE_')) fail(`${key} is not a VITE_* production setting.`);
    if (qualificationFirebaseKeys.includes(key)) fail(`${key} belongs in LUYENTAP_QUALIFICATION_ENV_FILE, not the production environment.`);
    if (/^VITE_(?:GEMINI|GROQ)_API_KEY(?:_\d+)?$/iu.test(key)) {
      fail(`${key} is a provider credential setting; keep provider secrets in the AI gateway.`);
    }
    if (isPlaceholder(value)) fail(`${key} is still a placeholder.`);
    if (key.endsWith('_EMULATOR_HOST') && value.trim()) fail(`${key} is present in the production environment.`);
    if (isLocalValue(value)) fail(`${key} contains a local/demo endpoint.`);
  }
  for (const key of Object.keys(qualificationValues)) {
    if (!qualificationFirebaseKeys.includes(key)) fail(`${key} is not a supported qualification Firebase setting.`);
  }
  const values = { ...productionValues, ...qualificationValues };
  for (const key of requiredFirebaseKeys) {
    const value = values[key]?.trim();
    if (!value || isPlaceholder(value)) fail(`${key} is missing or still a placeholder in ${envFile}.`);
  }
  assertQualificationFirebaseValues(values);
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
    buildInputFingerprint: qualificationRaw
      ? crypto.createHash('sha256').update(Buffer.concat([Buffer.from(raw), Buffer.from('\0'), Buffer.from(qualificationRaw)])).digest('hex')
      : crypto.createHash('sha256').update(raw).digest('hex'),
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

const defaultSleep = delay => new Promise(resolve => setTimeout(resolve, delay));
const providerIdentity = observation => `${observation?.provider?.version}@${observation?.provider?.releaseTime}`;
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const revisionPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

export async function assertBuiltArtifact({ cwd = repoRoot, artifactSha256, source, envFingerprint, buildInputFingerprint, expectedHotfixes } = {}) {
  const manifest = JSON.parse(await readFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8'));
  const manifestSha256 = digest(JSON.stringify(manifest));
  if (artifactSha256 && manifestSha256 !== artifactSha256) fail('built artifact manifest differs from the approved artifact digest.');
  if (!source || manifest.revision !== source.revision || manifest.tree !== source.tree) fail('built artifact source identity differs from the assessed source.');
  if (manifest.envFingerprint !== envFingerprint) fail('built artifact environment fingerprint differs from the assessed environment.');
  if (buildInputFingerprint !== undefined && manifest.buildInputFingerprint !== buildInputFingerprint) fail('built artifact build-input fingerprint differs from the assessed build inputs.');
  if (expectedHotfixes !== undefined && !isDeepStrictEqual(manifest.hotfixes || [], expectedHotfixes)) fail('built artifact hotfix metadata differs from the assessed live baseline.');
  await assertHostingArtifact(cwd, manifest);
  return manifest;
}

export async function verifyExistingHosting({ operationId, expectedManifestSha256, expectedRevision, expectedTree,
  observeProvider = observeHostingProvider, observeSource = observeHosting, poll = {} } = {}) {
  if (operationId === undefined && expectedManifestSha256 === undefined && expectedRevision === undefined) {
    throw new Error('Verification requires operationId, expectedManifestSha256, or expectedRevision.');
  }
  if (operationId !== undefined && !operationIdPattern.test(operationId)) throw new Error('operationId must be a UUID.');
  if (expectedManifestSha256 !== undefined && !digestPattern.test(expectedManifestSha256)) throw new Error('expectedManifestSha256 must be a 64-hex digest.');
  if (expectedRevision !== undefined && !revisionPattern.test(expectedRevision)) throw new Error('expectedRevision must be a 40-hex revision.');
  if (expectedTree !== undefined && !revisionPattern.test(expectedTree)) throw new Error('expectedTree must be a 40-hex tree.');
  const { timeoutMs = 30_000, initialDelayMs = 2_000, maxDelayMs = 10_000, backoffFactor = 1.5,
    sleep = defaultSleep, now = Date.now } = poll || {};
  for (const [name, value] of Object.entries({ timeoutMs, initialDelayMs, maxDelayMs, backoffFactor })) {
    if (!Number.isFinite(value) || value < 0 || (name === 'maxDelayMs' && value < initialDelayMs) || (name === 'backoffFactor' && value < 1)) {
      throw new Error(`Verification poll ${name} must be finite and valid.`);
    }
  }
  if (typeof sleep !== 'function' || typeof now !== 'function') throw new Error('Verification poll hooks must be functions.');
  const deadline = now() + timeoutMs;
  let delay = initialDelayMs;
  let lastError = 'live Hosting verification did not match the requested identity';
  while (true) {
    try {
      const provider = await observeProvider();
      if (operationId !== undefined && !provider?.provider?.message?.startsWith(`[luyentap:${operationId}] `)) {
        throw new Error('live Hosting provider message does not match operationId');
      }
      const source = await observeSource();
      if (expectedManifestSha256 !== undefined && source.fingerprint !== expectedManifestSha256) throw new Error('live Hosting manifest fingerprint differs from expected.');
      if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new Error('live Hosting revision differs from expected.');
      if (expectedTree !== undefined && source.tree !== expectedTree) throw new Error('live Hosting tree differs from expected.');
      const after = await observeProvider();
      if (providerIdentity(after) !== providerIdentity(provider)) throw new Error('provider release changed during verification.');
      return { id: operationId || null, status: 'verified', siteUrl: 'https://kahut1.web.app', operationId: operationId || null, providerVersion: provider.provider.version,
        releaseTime: provider.provider.releaseTime, providerMessage: provider.provider.message,
        revision: source.revision, tree: source.tree, manifestSha256: source.fingerprint,
        verifiedFiles: source.manifest?.files?.length || 0, evidenceRefs: [provider.evidenceRef, source.evidenceRef] };
    } catch (error) { lastError = error?.message || String(error); }
    if (now() >= deadline) throw new Error(`Hosting verification timed out after ${Math.round(timeoutMs / 1000)}s: ${lastError}`);
    await sleep(Math.min(delay, Math.max(0, deadline - now())));
    delay = Math.min(Math.max(delay * backoffFactor, delay), maxDelayMs);
  }
}

export const deployHosting = async ({ cwd = repoRoot, base, env, assessment, objective,
  expectedPriorProviderIdentity, observeSource = observeHosting, observeProvider = observeHostingProvider,
  readLiveManifest = readLiveHostingManifestFingerprint, runDeploy = run,
  poll = { timeoutMs: 90_000, initialDelayMs: 2_000, maxDelayMs: 10_000 } } = {}) => {
  const source = await collectSourceState(cwd, base);
  if (source.dirty) fail('deployment requires a clean candidate source.');
  const expected = JSON.parse(await readFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8'));
  if (!assessment || !['PASS', 'NOT_APPLICABLE'].includes(assessment.decision)
    || assessment.schemaVersion !== 1 || assessment.mode !== 'release' || assessment.target !== 'hosting'
    || assessment.source?.fingerprint !== source.fingerprint || assessment.observed?.revision !== base) {
    fail('deployment requires the current exact-source assessment.');
  }
  const scope = selectHostingDependencyScope(hostingImpactPaths(cwd, source));
  if (assessment.hostingDependencies && !isHostingDependenciesObserved(assessment.hostingDependencies)) fail('deployment rejects caller-supplied Hosting dependency evidence.');
  if (hasHostingDependencyProbes(scope)) {
    const dependencies = assessment.hostingDependencies;
    if (!isHostingDependenciesObserved(dependencies) || dependencies.source?.fingerprint !== source.fingerprint
      || dependencies.hostingFingerprint !== assessment.observed?.fingerprint || dependencies.envFingerprint !== assessment.productionEnvFingerprint) {
      fail('deployment requires native Hosting dependencies bound to the reviewed candidate.');
    }
  }
  if (expected.revision !== source.revision || expected.tree !== source.tree || expected.envFingerprint !== assessment.productionEnvFingerprint) fail('built Hosting manifest differs from the assessed source or environment.');
  if (assessment.hotfixes !== undefined && !isDeepStrictEqual(expected.hotfixes || [], assessment.hotfixes)) fail('built Hosting manifest hotfix metadata differs from the assessed live baseline.');
  await assertHostingArtifact(cwd, expected);
  const expectedManifestSha256 = digest(JSON.stringify(expected));
  const before = await observeProvider();
  if (expectedPriorProviderIdentity && providerIdentity(before) !== expectedPriorProviderIdentity) fail('production changed while preparing publication.');
  const rollbackCommand = hostingRollbackCommand(before.provider.version);
  if (assessment.observed.revision === expected.revision && assessment.observed.tree === expected.tree
    && assessment.observed.manifest?.envFingerprint === expected.envFingerprint) {
    fail('this candidate is already published; use --verify-existing instead of publishing it again.');
  }
  const liveHead = await readLiveManifest();
  const provider = await observeProvider();
  if (liveHead.fingerprint !== assessment.observed.fingerprint
    || liveHead.revision !== assessment.observed.revision
    || liveHead.tree !== assessment.observed.tree
    || providerIdentity(provider) !== providerIdentity(before)) fail('production changed while preparing publication.');
  if (assessment.hostingDependencies) {
    const hostingObservation = isObserved(assessment.observed) ? assessment.observed : await observeSource();
    const currentDependencies = await observeHostingDependencies({ cwd, source, hostingObservation, envFingerprint: assessment.productionEnvFingerprint });
    if (!isHostingDependenciesObserved(currentDependencies) || currentDependencies.fingerprint !== assessment.hostingDependencies.fingerprint) fail('backend dependencies changed while preparing publication.');
  }
  const id = crypto.randomUUID();
  const description = String(objective || `Hosting release ${source.revision.slice(0, 12)}`).trim() || `Hosting release ${source.revision.slice(0, 12)}`;
  const verifyCommand = `npm run release:verify-existing -- --operation-id ${id} --expected-manifest ${expectedManifestSha256} --expected-revision ${expected.revision}`;
  const failWithRecovery = (phase, label, error) => {
    const target = error instanceof Error ? error : new Error(String(error));
    console.error(label);
    console.error(`Rollback command: ${rollbackCommand}`);
    console.error(`Verify command: ${verifyCommand}`);
    Object.assign(target, { operationId: id, phase, rollbackCommand, verifyCommand, priorVersion: before.provider.version, manifestSha256: expectedManifestSha256, revision: expected.revision });
    throw target;
  };
  try {
    await runDeploy([path.join(cwd, 'scripts/tooling-where.mjs'), '--exec', 'firebase', 'deploy', '--only', `hosting:${expectedHostingTarget}`, '--project', expectedProjectId, '--non-interactive', '--message', hostingReleaseMessage(`[luyentap:${id}] ${description}`)], env, cwd);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES') throw error;
    return failWithRecovery('deploy', 'Firebase deploy failed; verify live state before retrying (rollback is only needed if the live version changed).', error);
  }
  try {
    const result = await waitForHostingLive({ expectedManifestFingerprint: expectedManifestSha256, beforeProviderIdentity: providerIdentity(before), operationId: id, observeProvider, observeSource, ...poll });
    if (result.verification !== 'passed') throw new Error(`Hosting verification ${result.verification || 'failed'}: ${result.lastError || 'live readback did not match.'}`);
    return { id, operationId: id, status: 'verified', siteUrl: 'https://kahut1.web.app', revision: expected.revision, tree: expected.tree, manifestSha256: expectedManifestSha256,
      priorVersion: before.provider.version, liveVersion: result.provider.provider.version, releaseTime: result.provider.provider.releaseTime,
      verifiedFiles: result.source.manifest.files.length, attempts: result.attempts, rollbackCommand, verifyCommand };
  } catch (error) {
    return failWithRecovery('readback', 'Hosting deployment completed; live readback did not confirm.', error);
  }
};

export async function assertProductionBundle(cwd = repoRoot) {
  const distRoot = path.join(cwd, 'dist');
  const files = [];
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && /\.(?:html|js|mjs|json|css|map)$/iu.test(entry.name)) files.push(entryPath);
    }
  };
  try { await visit(distRoot); } catch { fail('the production build did not create dist/.'); }
  for (const file of files) {
    const marker = findForbiddenBundleMarker(await readFile(file, 'utf8'));
    if (marker) fail(`built file ${path.relative(cwd, file)} contains local marker ${marker}.`);
  }
}

const readAssessmentHotfixes = async (cwd, file) => {
  if (!file) return [];
  const parsed = JSON.parse(await readFile(path.resolve(cwd, file), 'utf8'));
  return Array.isArray(parsed.hotfixes) ? parsed.hotfixes : [];
};

export async function resolveBuiltDeploymentAssessment({ cwd = repoRoot, loaded, assessmentFile,
  observedFingerprint, observedProviderIdentity, compatibilityBinding,
  observeSource = observeHosting, observeProvider = observeHostingProvider,
  readLiveManifest = readLiveHostingManifestFingerprint, assessRelease = assess } = {}) {
  const fallback = async () => {
    const observed = await observeSource();
    if (observedFingerprint && observed.fingerprint !== observedFingerprint) fail('production Hosting changed since the approved observation.');
    const assessment = await assessRelease({ cwd, mode: 'release', target: 'hosting', base: observed.revision,
      hostingObservation: observed, productionEnvFingerprint: loaded.envFingerprint, productionEnvFile: loaded.envFile,
      ...(compatibilityBinding ? { inlineCompatibilityReview: compatibilityBinding.review } : {}) });
    return { assessment, observed, reused: false };
  };
  if (!assessmentFile || !observedFingerprint || !observedProviderIdentity) return fallback();
  let receipt;
  try { receipt = JSON.parse(await readFile(path.resolve(cwd, assessmentFile), 'utf8')); } catch { return fallback(); }
  const reusableShape = ['PASS', 'NOT_APPLICABLE'].includes(receipt?.decision)
    && receipt.schemaVersion === 1
    && receipt.mode === 'release'
    && receipt.target === 'hosting'
    && receipt.observed?.fingerprint === observedFingerprint
    && receipt.observedProviderIdentity === observedProviderIdentity
    && receipt.productionEnvFingerprint === loaded.envFingerprint
    && typeof receipt.observed?.revision === 'string'
    && typeof receipt.observed?.tree === 'string';
  if (!reusableShape) return fallback();
  const source = await collectSourceState(cwd, receipt.observed.revision);
  if (source.dirty || source.fingerprint !== receipt.source?.fingerprint) fail('approved release source changed since the approved observation.');
  const liveProvider = await observeProvider();
  const liveHead = await readLiveManifest();
  if (providerIdentity(liveProvider) !== observedProviderIdentity
    || liveHead.fingerprint !== receipt.observed.fingerprint
    || liveHead.revision !== receipt.observed.revision
    || liveHead.tree !== receipt.observed.tree
    || (liveHead.envFingerprint ?? null) !== (receipt.observed.manifest?.envFingerprint ?? null)
    || !isDeepStrictEqual(liveHead.hotfixes, receipt.hotfixes || [])) {
    fail('production Hosting changed since the approved observation.');
  }
  const impactPaths = hostingImpactPaths(cwd, source);
  const services = classifyPaths(impactPaths);
  const dependencyScope = selectHostingDependencyScope(impactPaths);
  if (!hasHostingDependencyProbes(dependencyScope)
    && services.length > 0 && !services.includes('migrations') && !services.includes('backblaze')
    && liveHead.hotfixes.length === 0 && !compatibilityBinding) {
    return { assessment: { ...receipt, source: { ...source, services: receipt.source?.services || [] } }, observed: receipt.observed, reused: true };
  }
  return fallback();
}

const verifyArgs = rawArgs => {
  let operationId;
  const result = {};
  for (let index = 1; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (value === '--operation-id') { if (operationId || !rawArgs[index + 1]) fail('missing --operation-id value.'); operationId = rawArgs[++index]; }
    else if (value === '--expected-manifest') { if (!rawArgs[index + 1]) fail('missing --expected-manifest value.'); result.expectedManifestSha256 = rawArgs[++index]; }
    else if (value === '--expected-revision') { if (!rawArgs[index + 1]) fail('missing --expected-revision value.'); result.expectedRevision = rawArgs[++index]; }
    else if (value === '--expected-tree') { if (!rawArgs[index + 1]) fail('missing --expected-tree value.'); result.expectedTree = rawArgs[++index]; }
    else if (value.startsWith('--')) fail(`unknown argument ${value}`);
    else if (operationId) fail('unexpected positional operation id.');
    else operationId = value;
  }
  return { operationId, ...result };
};

const main = async () => {
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === '--verify-existing') {
    let inputs;
    try {
      inputs = verifyArgs(rawArgs);
      const result = await verifyExistingHosting(inputs);
      await writeOperationOutcome({ outcome: result, cwd: repoRoot });
      console.log(JSON.stringify(result));
    } catch (error) {
      const outcome = { id: inputs?.operationId || null, operationId: inputs?.operationId || null, status: 'failed', siteUrl: 'https://kahut1.web.app', error: error.message, ...(error.rollbackCommand ? { rollbackCommand: error.rollbackCommand } : {}) };
      await writeOperationOutcome({ outcome, cwd: repoRoot });
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }
  const allowed = new Set(['--build-only', '--deploy-built']);
  const args = new Set(rawArgs);
  if ([...args].some(value => !allowed.has(value))) fail('only --build-only or --deploy-built is supported by this script.');
  const buildOnly = args.has('--build-only');
  const deployBuilt = args.has('--deploy-built');
  if (buildOnly && deployBuilt) fail('--build-only and --deploy-built are mutually exclusive.');
  let tempEnvDir;
  let cwd = repoRoot;
  try {
    cwd = selectReleaseSource({ sourceCwd: process.env.LUYENTAP_RELEASE_SOURCE_CWD });
    const loaded = await readProductionEnv(cwd);
    tempEnvDir = loaded.tempEnvDir;
    assertCleanWorkingTree(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', windowsHide: true }));
    if (buildOnly) {
      run([path.join(cwd, 'scripts/tooling-where.mjs'), '--exec', 'vite', 'build', '--mode', 'production'], loaded.env, cwd);
      run([path.join(cwd, 'scripts/check-bundle-budget.mjs')], loaded.env, cwd);
      await assertProductionBundle(cwd);
      const hotfixes = await readAssessmentHotfixes(cwd, process.env.LUYENTAP_RELEASE_ASSESSMENT_FILE);
      const manifest = await writeHostingManifest({ cwd, envFingerprint: loaded.envFingerprint, buildInputFingerprint: loaded.buildInputFingerprint, hotfixes });
      await assertHostingArtifact(cwd, manifest);
      console.log('[Production] Build and local-value checks passed; no remote mutation was performed.');
      return;
    }
    const binding = process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_BINDING
      ? parseCompatibilityReviewBinding(process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_BINDING) : undefined;
    let observed, assessment;
    if (deployBuilt && process.env.LUYENTAP_RELEASE_ASSESSMENT_FILE
      && process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT
      && process.env.LUYENTAP_RELEASE_OBSERVED_PROVIDER_IDENTITY) {
      ({ assessment, observed } = await resolveBuiltDeploymentAssessment({ cwd, loaded,
        assessmentFile: process.env.LUYENTAP_RELEASE_ASSESSMENT_FILE,
        observedFingerprint: process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT,
        observedProviderIdentity: process.env.LUYENTAP_RELEASE_OBSERVED_PROVIDER_IDENTITY,
        compatibilityBinding: binding }));
    } else {
      observed = await observeHosting();
      if (process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT && observed.fingerprint !== process.env.LUYENTAP_RELEASE_OBSERVED_FINGERPRINT) fail('production Hosting changed since the approved observation.');
      assessment = await assess({ cwd, mode: 'release', target: 'hosting', base: observed.revision, hostingObservation: observed,
        productionEnvFingerprint: loaded.envFingerprint, productionEnvFile: loaded.envFile, ...(binding ? { inlineCompatibilityReview: binding.review } : {}) });
    }
    if (!['PASS', 'NOT_APPLICABLE'].includes(assessment.decision)) fail(`release assessment is ${assessment.decision}; deployment is gated.`);
    const source = assessment.source;
    if (deployBuilt) {
      await assertBuiltArtifact({ cwd, artifactSha256: process.env.LUYENTAP_RELEASE_ARTIFACT_SHA256, source, envFingerprint: loaded.envFingerprint, buildInputFingerprint: loaded.buildInputFingerprint, expectedHotfixes: assessment.hotfixes || [] });
      run([path.join(cwd, 'scripts/check-bundle-budget.mjs')], loaded.env, cwd);
      await assertProductionBundle(cwd);
    } else {
      run([path.join(cwd, 'scripts/tooling-where.mjs'), '--exec', 'vite', 'build', '--mode', 'production'], loaded.env, cwd);
      run([path.join(cwd, 'scripts/check-bundle-budget.mjs')], loaded.env, cwd);
      await assertProductionBundle(cwd);
      await writeHostingManifest({ cwd, envFingerprint: loaded.envFingerprint, buildInputFingerprint: loaded.buildInputFingerprint, hotfixes: assessment.hotfixes });
      await assertHostingArtifact(cwd, JSON.parse(await readFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8')));
    }
    const result = await deployHosting({ cwd, base: observed.revision, env: loaded.env, assessment, objective: process.env.LUYENTAP_RELEASE_OBJECTIVE,
      expectedPriorProviderIdentity: process.env.LUYENTAP_RELEASE_OBSERVED_PROVIDER_IDENTITY });
    await writeOperationOutcome({ outcome: result, cwd });
    console.log(`[Release] liveVersion=${result.liveVersion} manifestSha256=${result.manifestSha256} rollback=${result.rollbackCommand}`);
  } catch (error) {
    const outcome = { id: error.operationId || null, operationId: error.operationId || null, phase: error.phase || null, status: 'failed', siteUrl: 'https://kahut1.web.app', error: error.message, rollbackCommand: error.rollbackCommand || null, verifyCommand: error.verifyCommand || null, priorVersion: error.priorVersion || null, manifestSha256: error.manifestSha256 || null, revision: error.revision || null };
    await writeOperationOutcome({ outcome, cwd });
    console.error(error.message);
    process.exitCode = 1;
  } finally { if (tempEnvDir) await rm(tempEnvDir, { recursive: true, force: true }); }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
