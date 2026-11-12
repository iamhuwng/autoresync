import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { assess, classifyPaths, collectSourceState } from './release-check.mjs';
import { isHostingDependenciesObserved, observeHostingDependencies } from './release-hosting-dependencies.mjs';
import { listeningEditorHostingReady } from './release-listening-editor-evidence.mjs';
import { writeHostingManifest, observeHosting, observeHostingProvider } from './release-evidence.mjs';
import { prepareDeploymentChangelog, reconcileHostingChangelog } from './release-changelog.mjs';
import { reviewedChanges } from './lib/changeRecords.mjs';
import { executeRecordedOperation } from './release-operation.mjs';
import { beginRelease, settleRelease } from './lib/releaseChangelog.mjs';
import { runReleaseVerification, assertReleaseVerification } from './release-verification.mjs';
import { createHostingArchive, readHostingArchive, recordHostingArchiveOutcome, assertHostingArtifact } from './release-archive.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const expectedProjectId = 'temp-a1437';
const expectedHostingTarget = 'kahut1';
export const hostingReleaseMessage = value => value.length <= 255 ? value : `${value.slice(0, 252)}...`;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const operationMessage = (id, description) => hostingReleaseMessage(`[luyentap:${id}] ${description}`);
const operationIdPattern = /Release ([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):/u;
export const writeOperationEvidence = async ({ id, status, error, cwd = repoRoot } = {}) => {
  if (!id) return;
  const targets = [...new Set([process.env.LUYENTAP_RELEASE_OPERATION_FILE, process.env.LUYENTAP_RELEASE_OUTCOME_FILE].filter(Boolean))];
  const bytes = `${JSON.stringify({ schemaVersion: 1, operationId: id, status, error: error || null, recordedAt: new Date().toISOString() })}\n`;
  for (const target of targets) {
    const destination = path.resolve(cwd, target);
    try {
      const existing = JSON.parse(await readFile(destination, 'utf8'));
      if (existing.operationId === id && ['changelog-pending', 'changelog-pending-integration', 'changelog-reconciled'].includes(existing.status)
        && ['published-verified', 'pending-verification-or-failed'].includes(status)) continue;
    } catch { /* no prior evidence */ }
    await writeFile(destination, bytes, 'utf8');
  }
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

export const assertReleaseAssessment = async ({ mode = 'release', baselinePath, baselineSha256, base, fingerprint, productionEnvFingerprint, currentProductionEnvFingerprint, observedFingerprint, compatibilityReviewPath, compatibilityReviewSha256, cwd = repoRoot, observeListening = false, observeListeningEditorRelease = false, listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig }) => {
  selectReleaseSource({ observeListening, observeListeningEditorRelease, listeningPhase, cwd });
  if (mode === 'acceptance') fail('acceptance assessments cannot invoke the production deployment route.');
  if (!base) fail('missing LUYENTAP_RELEASE_BASE; deployment source must be explicitly compared with a reviewed revision.');
  if (!fingerprint) fail('missing LUYENTAP_RELEASE_FINGERPRINT; deployment approval must bind to the assessed source tree.');
  if (baselinePath && !baselineSha256) fail('missing LUYENTAP_RELEASE_BASELINE_SHA256; deployment approval must bind to the exact baseline evidence.');
  if (!productionEnvFingerprint) fail('missing LUYENTAP_RELEASE_ENV_FINGERPRINT; deployment approval must bind to the exact production environment.');
  if (productionEnvFingerprint !== currentProductionEnvFingerprint) fail('production environment changed since release assessment.');
  if (!observedFingerprint) fail('missing LUYENTAP_RELEASE_OBSERVED_FINGERPRINT; reviewed remote state must be bound to preflight.');
  if (compatibilityReviewPath && (!/^[a-f0-9]{64}$/u.test(compatibilityReviewSha256 || '')
    || digest(await readFile(path.resolve(cwd, compatibilityReviewPath))) !== compatibilityReviewSha256)) fail('compatibility review changed or lacks LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256.');
  const result = await assess({ cwd, mode, target: observeListening || observeListeningEditorRelease ? 'all' : 'hosting', base, baselinePath, productionEnvFingerprint, compatibilityReviewPath, observe: true, observeListening, observeListeningEditorRelease, listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig });
  assertListeningHostingReady(result, observeListening, observeListeningEditorRelease);
  if (!baselinePath && !result.observed) fail('no independently observed production baseline is available; complete the one-time Hosting evidence bootstrap or supply per-service evidence.');
  if (result.observed?.fingerprint !== observedFingerprint) fail('production Hosting changed since review.');
  if (result.source.fingerprint !== fingerprint) fail('release assessment fingerprint does not match the approved source tree.');
  if (result.baseline?.sha256 !== baselineSha256) fail('release assessment baseline fingerprint does not match the approved evidence.');
  if (result.compatibilityReview && result.compatibilityReview.sha256 !== compatibilityReviewSha256) fail('compatibility review changed during assessment.');
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

export async function assertRetainedArtifact({ cwd = repoRoot, artifactSha256 }) {
  const manifest = JSON.parse(await readFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8'));
  if (digest(JSON.stringify(manifest)) !== artifactSha256) fail('retained artifact manifest differs from the approved release card.');
  await assertHostingArtifact(cwd, manifest);
  return manifest;
}

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

const providerIdentity = observation => `${observation.provider.version}@${observation.provider.releaseTime}`;
const archiveReference = id => `https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-${id}`;
const recordedIntent = record => ({ id: record.id, description: record.description,
  targets: record.targets.map(({ publication, verification, providerIdentity, evidenceRefs, ...target }) => target),
  evidenceRefs: record.evidenceRefs });

async function observeRecordedHosting(archive, { observeSource, observeProvider }) {
  const { id, expectedManifest, before, request } = archive.intent;
  const provider = await observeProvider();
  if (providerIdentity(provider) === providerIdentity(before)
    || !provider.provider.message?.startsWith(`[luyentap:${id}] `)) {
    throw new Error(`Release ${id} is not confirmed as the current provider release; inspect its recorded operation. No deployment was performed by verification.`);
  }
  let verification = 'unverified';
  let source;
  try {
    source = await observeSource();
    const after = await observeProvider();
    if (providerIdentity(after) === providerIdentity(provider)
      && source.fingerprint === digest(JSON.stringify(expectedManifest))) verification = 'passed';
  } catch (error) {
    console.error(`[Release ${id}] Publication confirmed; verification pending: ${error.message}`);
  }
  return { outcomes: [{ id: request.targets[0].id, publication: 'published', verification,
    providerIdentity: providerIdentity(provider), evidenceRefs: [archive.evidenceRef, provider.evidenceRef,
      ...(source?.evidenceRef ? [source.evidenceRef] : [])] }] };
}

export async function verifyExistingHosting({ id, sha256, storeDir, readArchive = readHostingArchive,
  saveOutcome = recordHostingArchiveOutcome, observeSource = observeHosting, observeProvider = observeHostingProvider,
  cwd = repoRoot, reconcile = reconcileHostingChangelog }) {
  const archive = await readArchive({ id, sha256 });
  const request = archive.intent.request;
  // Remote intent is revalidated independently; a locally edited journal cannot choose verification inputs.
  const record = beginRelease(request, storeDir);
  const outcome = await observeRecordedHosting(archive, { observeSource, observeProvider });
  if (record.targets[0].publication === 'published'
    && record.targets[0].providerIdentity !== outcome.outcomes[0].providerIdentity) throw new Error('The recorded provider identity differs; verification cannot reassign publication.');
  const result = settleRelease(id, outcome, storeDir);
  await saveOutcome(archive, outcome);
  if (outcome.outcomes[0].verification !== 'passed') throw new Error(`Release ${id} was published; verification remains pending. Retry --verify-existing ${id}, not deployment.`);
  await settleChangelog(archive, cwd, reconcile);
  return result;
}

const settleChangelog = async (archive, cwd, reconcile) => {
  try {
    await reconcile(archive, { cwd });
    await writeOperationEvidence({ id: archive.id, status: 'changelog-pending-integration', cwd });
  } catch (error) {
    await writeOperationEvidence({ id: archive.id, status: 'changelog-pending', error: error.message, cwd });
    console.warn(`[Changelog] Operation ${archive.id} is recorded; documentation pending: ${error.message}. Resume: node scripts/release-changelog.mjs --reconcile ${archive.id}. Do not redeploy.`);
  }
};

export const deployHosting = async ({ base, env, cwd = repoRoot, runDeploy = run, storeDir,
  assessment, verification, verificationPlanSha256, sourceRef, revalidate,
  retainArchive = createHostingArchive, saveOutcome = recordHostingArchiveOutcome, reconcile = reconcileHostingChangelog,
  observeSource = observeHosting, observeProvider = observeHostingProvider }) => {
  const changes = reviewedChanges(cwd, (await collectSourceState(cwd, base)).revision, assessment?.compatibilityReview, true);
  const changelog = prepareDeploymentChangelog(base, cwd, storeDir, { changeIds: changes.changeIds });
  const expected = JSON.parse(await readFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8'));
  if (expected.revision !== changelog.targets[0].binding.sourceRevision) throw new Error('Hosting build source differs from the approved changelog source; rebuild before deployment.');
  const source = await collectSourceState(cwd, base);
  assertReleaseVerification(verification, { source, envFingerprint: expected.envFingerprint, planSha256: verificationPlanSha256 });
  if (!assessment || !['PASS', 'NOT_APPLICABLE'].includes(assessment.decision)
    || assessment.source.fingerprint !== source.fingerprint || assessment.observed.revision !== base) fail('deployment requires the current exact-source assessment.');
  if (assessment.hostingDependencies && !isHostingDependenciesObserved(assessment.hostingDependencies)) fail('deployment rejects caller-supplied Hosting dependency evidence.');
  if (assessment.target === 'hosting' && classifyPaths(source.files).some(service => ['worker', 'backup-worker', 'firebase-rules'].includes(service))
    && (!isHostingDependenciesObserved(assessment.hostingDependencies)
      || assessment.hostingDependencies.source.fingerprint !== source.fingerprint
      || assessment.compatibilityReview?.dependenciesFingerprint !== assessment.hostingDependencies.fingerprint)) {
    fail('deployment requires native Hosting dependencies bound to the reviewed candidate.');
  }
  const config = { firebase: JSON.parse(await readFile(path.join(cwd, 'firebase.json'), 'utf8')),
    firebaseRc: JSON.parse(await readFile(path.join(cwd, '.firebaserc'), 'utf8')) };
  const before = await observeProvider();
  const priorOperation = before.provider.message?.match(/^\[luyentap:([a-f0-9-]{36})\] /u)?.[1];
  if (priorOperation && assessment.observed.revision === expected.revision && assessment.observed.tree === expected.tree
    && assessment.observed.manifest?.envFingerprint === expected.envFingerprint) {
    fail(`this candidate is already published; use --verify-existing ${priorOperation} instead of publishing it again.`);
  }
  const id = crypto.randomUUID();
  const request = { ...changelog, id, evidenceRefs: [...changelog.evidenceRefs, archiveReference(id)],
    targets: changelog.targets.map(target => ({ ...target, binding: { ...target.binding,
      artifactSha256: digest(JSON.stringify(expected)), configSha256: digest(JSON.stringify(config)) } })) };
  let archive;
  return executeRecordedOperation(request, {
    storeDir,
    onStarted: record => writeOperationEvidence({ id: record.id, status: 'prepared', cwd }),
    prepare: async record => {
      archive = await retainArchive({ cwd, id, sourceRef, verification, intent: {
        schemaVersion: 1, id, request: recordedIntent(record), expectedManifest: expected, before, source,
        envFingerprint: expected.envFingerprint, verification, config,
        assessment: { decision: assessment.decision, source: assessment.source, observed: assessment.observed,
          findings: assessment.findings, compatibilityReview: assessment.compatibilityReview,
          target: assessment.target, hostingDependencies: assessment.hostingDependencies ? {
            scope: assessment.hostingDependencies.scope, source: assessment.hostingDependencies.source,
            envFingerprint: assessment.hostingDependencies.envFingerprint,
            hostingFingerprint: assessment.hostingDependencies.hostingFingerprint,
            providerFingerprint: assessment.hostingDependencies.providerFingerprint,
            fingerprint: assessment.hostingDependencies.fingerprint,
            services: assessment.hostingDependencies.services, observedAt: assessment.hostingDependencies.observedAt,
            workerDeploymentReady: false,
          } : undefined },
        review: assessment.compatibilityReview,
      } });
      const live = await observeSource();
      const provider = await observeProvider();
      if (live.fingerprint !== assessment.observed.fingerprint || providerIdentity(provider) !== providerIdentity(before)) {
        fail('production changed while preserving the archive; reassess before publication.');
      }
      if (assessment.hostingDependencies) {
        const currentDependencies = await observeHostingDependencies({ cwd, source, hostingObservation: live,
          envFingerprint: expected.envFingerprint });
        if (currentDependencies.fingerprint !== assessment.hostingDependencies.fingerprint) {
          fail('backend dependencies changed while preserving the archive; reassess before publication.');
        }
      }
      await revalidate?.();
      const current = await collectSourceState(cwd, base);
      assertReleaseVerification(verification, { source: current, envFingerprint: expected.envFingerprint, planSha256: verificationPlanSha256 });
      await assertHostingArtifact(cwd, expected);
    },
    execute: record => {
      console.log(record.description);
      runDeploy([path.join(cwd, 'scripts/tooling-where.mjs'), '--exec', 'firebase', 'deploy',
        '--only', `hosting:${expectedHostingTarget}`, '--project', expectedProjectId,
        '--non-interactive', '--message', operationMessage(record.id, record.targets[0].annotation ?? record.description)], env, cwd);
    },
    observe: async record => {
      const outcome = await observeRecordedHosting(archive, { observeSource, observeProvider });
      // Preserve local provider identity even if the append-only remote outcome upload is interrupted.
      settleRelease(record.id, outcome, storeDir);
      await saveOutcome(archive, outcome);
      await settleChangelog(archive, cwd, reconcile);
      return outcome;
    },
  });
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
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === '--verify-existing' && rawArgs.length === 2) {
    try { console.log(JSON.stringify(await verifyExistingHosting({ id: rawArgs[1] }))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    return;
  }
  const args = new Set(rawArgs);
  if ([...args].some((arg) => !['--build-only', '--deploy-retained'].includes(arg))) fail('only --build-only or --deploy-retained is supported by this script.');
  const buildOnly = args.has('--build-only');
  const retainedArtifact = args.has('--deploy-retained');
  if (buildOnly && retainedArtifact) fail('--build-only and --deploy-retained are mutually exclusive.');
  let tempEnvDir, releaseAssessment, verification;
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
      if (!/^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(process.env.LUYENTAP_RELEASE_SOURCE_REF || '')) {
        fail('LUYENTAP_RELEASE_SOURCE_REF must name the existing exact GitHub source branch or tag.');
      }
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
        compatibilityReviewSha256: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256,
        cwd,
        ...listeningOptions,
      });
      if (!process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE || !/^[a-f0-9]{64}$/u.test(process.env.LUYENTAP_RELEASE_TEST_PLAN_SHA256 || '')) {
        fail('reviewed LUYENTAP_RELEASE_TEST_PLAN_FILE and LUYENTAP_RELEASE_TEST_PLAN_SHA256 are required.');
      }
      if (digest(await readFile(path.resolve(cwd, process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE))) !== process.env.LUYENTAP_RELEASE_TEST_PLAN_SHA256) {
        fail('verification plan differs from its reviewed digest.');
      }
      verification = await runReleaseVerification({ cwd, base: releaseAssessment.source.baseRevision,
        planPath: process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE, envFingerprint: loaded.envFingerprint });
      assertReleaseVerification(verification, { source: releaseAssessment.source, envFingerprint: loaded.envFingerprint,
        planSha256: process.env.LUYENTAP_RELEASE_TEST_PLAN_SHA256 });
    }
    console.log(`[Production] ${buildOnly ? 'Building' : retainedArtifact ? 'Deploying retained artifact' : 'Building and deploying'} ${expectedProjectId}/${expectedHostingTarget} with ${loaded.envFile}`);
    if (retainedArtifact) {
      await assertRetainedArtifact({ cwd, artifactSha256: process.env.LUYENTAP_RELEASE_ARTIFACT_SHA256 });
      run([path.join(sourceScripts, 'check-bundle-budget.mjs')], loaded.env, cwd);
      await assertProductionBundle(cwd);
    } else {
      run([path.join(sourceScripts, 'tooling-where.mjs'), '--exec', 'vite', 'build', '--mode', 'production'], loaded.env, cwd);
      run([path.join(sourceScripts, 'check-bundle-budget.mjs')], loaded.env, cwd);
      await assertProductionBundle(cwd);
      await writeHostingManifest({ cwd, envFingerprint: loaded.envFingerprint, hotfixes: releaseAssessment?.hotfixes || [] });
    }
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
      compatibilityReviewSha256: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256,
      cwd,
      ...listeningOptions,
    });
    const operation = await deployHosting({ base: releaseAssessment.observed.revision, env: loaded.env, cwd,
      assessment: releaseAssessment, verification, verificationPlanSha256: process.env.LUYENTAP_RELEASE_TEST_PLAN_SHA256,
      sourceRef: process.env.LUYENTAP_RELEASE_SOURCE_REF,
      revalidate: async () => {
        if (digest(await readFile(loaded.envFile)) !== loaded.envFingerprint) fail('production environment changed while archiving.');
        if (digest(await readFile(path.resolve(cwd, process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE))) !== verification.planSha256) fail('verification plan changed while archiving.');
        if (process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE
          && digest(await readFile(path.resolve(cwd, process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE))) !== process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256) fail('compatibility review changed while archiving.');
      },
    });
    console.log(`[Release] operation=${operation.id}`);
    await writeOperationEvidence({ id: operation.id, status: 'published-verified', cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const id = message.match(operationIdPattern)?.[1];
    if (id) await writeOperationEvidence({ id, status: 'pending-verification-or-failed', error: message, cwd });
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (tempEnvDir) await rm(tempEnvDir, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
