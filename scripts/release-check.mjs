import crypto from 'node:crypto';
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { observeHosting, observeHostingProvider, isObserved } from './release-evidence.mjs';
import { assertHomeworkWorkerSource, observeHomeworkWorker, isHomeworkWorkerObserved } from './release-homework-worker-evidence.mjs';
import { assertNotificationWorkerSource, observeNotificationWorker, isNotificationWorkerObserved } from './release-notification-worker-evidence.mjs';
import { assertReadingV2WorkerSource, observeReadingV2Worker, isReadingV2WorkerObserved } from './release-reading-v2-worker-evidence.mjs';
import { observeListeningRelease, isListeningReleaseObserved } from './release-listening-evidence.mjs';
import { assertListeningEditorSource, observeListeningEditor, isListeningEditorObserved, listeningEditorHostingReady } from './release-listening-editor-evidence.mjs';
import { reviewedListeningPreviewRelease } from './release-listening-preview-pins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
export const STATUS = Object.freeze({ PASS: 'PASS', NOT_APPLICABLE: 'NOT_APPLICABLE', REVIEW_REQUIRED: 'REVIEW_REQUIRED', UNVERIFIED: 'UNVERIFIED', BLOCKED: 'BLOCKED' });
const rank = { PASS: 0, NOT_APPLICABLE: 0, REVIEW_REQUIRED: 1, UNVERIFIED: 2, BLOCKED: 3 };
const baselineMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const rules = [
  ['hosting', p => /^(src|public|index\.html|vite\.config|firebase\.json|\.firebaserc|scripts\/deploy-live\.mjs|package(?:\.json|-lock\.json))/.test(p)],
  ['firebase-rules', p => /^(database\.rules\.json|firestore\.rules|firestore\.indexes\.json|functions\/|scripts\/(?:import-live-firebase|local-firebase)\.mjs)/.test(p)],
  ['worker', p => /^(cloudflare\/|scripts\/local-book-source-worker\.mjs)/.test(p)],
  ['backup-worker', p => /^r2-backup-worker\//u.test(p)],
  ['migrations', p => /(^|\/)(migrations?\/|[^/]*(?:migrate|backfill|reconciliation)[^/]*\.(?:mjs|ts|js)$)/iu.test(p)],
  ['backblaze', p => /(backblaze|book-source|wrangler\.book-source|B2)/i.test(p)],
  ['tooling', p => /^(package(?:\.json|-lock\.json)|scripts\/(?:tooling|harness|dev-env|branch-doctor|release-|hotfix-|deploy-live|local-dev))/.test(p)],
];
const git = (args, cwd) => { const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }); if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.error?.message || result.stderr?.trim() || result.status}`); return result.stdout; };
const names = output => [...new Set(output.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))].sort();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonc = source => JSON.parse(source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1').replace(/,\s*([}\]])/gu, '$1'));

export const classifyPaths = files => { const services = new Set(); for (const file of files) for (const [service, matches] of rules) if (matches(file)) services.add(service); return [...services].sort(); };

export async function collectSourceState(cwd = repoRoot, base) {
  if (!base) throw new Error('An explicit reviewed --base revision is required; HEAD^ is not a production baseline.');
  const baseRevision = git(['rev-parse', '--verify', `${base}^{commit}`], cwd).trim();
  const revision = git(['rev-parse', 'HEAD'], cwd).trim();
  const branch = git(['branch', '--show-current'], cwd).trim() || 'detached';
  const tree = git(['rev-parse', 'HEAD^{tree}'], cwd).trim();
  const statusOutput = git(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  const dirtyFiles = statusOutput.split(/\r?\n/u).filter(Boolean).map(line => line.slice(3).replace(/^"|"$/gu, ''));
  const changed = new Set(names(git(['diff-tree', '--no-commit-id', '--name-only', '-r', baseRevision, revision], cwd)));
  for (const file of dirtyFiles) changed.add(file);
  const dirty = Boolean(statusOutput.trim());
  const fileState = await Promise.all([...changed].sort().map(async file => { try { return `${file}\0${sha256(await readFile(path.join(cwd, file)))}`; } catch { return `${file}\0missing`; } }));
  const fingerprint = sha256(`${baseRevision}\n${revision}\n${tree}\n${statusOutput}\n${fileState.join('\n')}`);
  return { revision, baseRevision, branch, tree, dirty, files: [...changed].sort(), fingerprint };
}

const workerFindings = async (cwd, files) => {
  const touchesBookWorker = files.some(file => /^cloudflare\/(?:worker\.(?:js|ts)$|wrangler\.book-source[^/]*\.jsonc$|src\/(?:book-source-worker\/|upload-worker\/(?:book-|notifications\/)))/u.test(file));
  if (!touchesBookWorker) return [{
    status: STATUS.UNVERIFIED,
    message: 'Changed Worker source needs its own deployed version, bindings and endpoint compatibility evidence; unrelated Book rollout configuration is outside this change.',
  }];
  let config;
  try { config = jsonc(await readFile(path.join(cwd, 'cloudflare', 'wrangler.book-source.jsonc'), 'utf8')); }
  catch (error) { return [{ status: STATUS.UNVERIFIED, message: `Worker configuration unavailable: ${error.message}` }]; }
  const vars = config.vars || {}, findings = [], rolloutRaw = vars.BOOK_ROLLOUT_CONFIG_JSON;
  if (!rolloutRaw) findings.push({ status: STATUS.UNVERIFIED, message: 'Worker rollout configuration is not present.' });
  else try {
    const rollout = JSON.parse(rolloutRaw);
    if (rollout.expiresAt && Date.parse(rollout.expiresAt) <= Date.now()) findings.push({ status: STATUS.BLOCKED, message: `Worker rollout expired at ${rollout.expiresAt}.` });
    if (rollout.environment && rollout.environment !== 'production') findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Worker rollout environment is ${rollout.environment}.` });
  } catch { findings.push({ status: STATUS.BLOCKED, message: 'Worker rollout configuration is not valid JSON.' }); }
  const origin = String(vars.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN || '');
  if (/localhost|127(?:\.\d{1,3}){3}/iu.test(origin)) findings.push({ status: STATUS.BLOCKED, message: `Worker allowed origin is local: ${origin}.` });
  findings.push((config.secrets?.required || []).length ? { status: STATUS.UNVERIFIED, message: 'Worker secret values are remote-only; names are declared but not read.' } : { status: STATUS.REVIEW_REQUIRED, message: 'Worker declares no required secrets.' });
  const prefix = String(vars.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX || '');
  if (/preview|local/iu.test(prefix)) findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Backblaze object prefix looks non-production: ${prefix}.` });
  return findings;
};

const firebaseFindings = async cwd => {
  const findings = [];
  try {
    const config = JSON.parse(await readFile(path.join(cwd, 'firebase.json'), 'utf8'));
    const hosting = (Array.isArray(config.hosting) ? config.hosting : [config.hosting]).filter(Boolean);
    findings.push(hosting.some(entry => entry.target === 'kahut1' && entry.public === 'dist') ? { status: STATUS.PASS, message: 'Hosting target kahut1 publishes dist.' } : { status: STATUS.BLOCKED, message: 'Hosting target kahut1/dist is not configured.' });
  } catch (error) { findings.push({ status: STATUS.UNVERIFIED, message: `Firebase configuration unavailable: ${error.message}` }); }
  try {
    const rc = JSON.parse(await readFile(path.join(cwd, '.firebaserc'), 'utf8'));
    findings.push(rc.projects?.default === 'temp-a1437' ? { status: STATUS.PASS, message: 'Firebase default project is temp-a1437.' } : { status: STATUS.BLOCKED, message: 'Firebase default project is not temp-a1437.' });
  } catch (error) { findings.push({ status: STATUS.UNVERIFIED, message: `.firebaserc unavailable: ${error.message}` }); }
  return findings;
};

const validateBaseline = (baseline, services, sourceFiles) => {
  const findings = [{ status: STATUS.UNVERIFIED, message: 'Baseline JSON is caller-supplied assertion only; no independent provider readback was performed, so it cannot establish production readiness.' }];
  const provenanceValid = baseline?.provenance?.kind === 'read-only-provider' && baseline.provenance.provider && baseline.provenance.evidenceHash;
  const shapeValid = baseline && baseline.schemaVersion === 1 && baseline.evidenceVersion === 1 && baseline.verified === true && typeof baseline.observedAt === 'string' && !Number.isNaN(Date.parse(baseline.observedAt)) && Date.now() - Date.parse(baseline.observedAt) <= baselineMaxAgeMs && typeof baseline.services === 'object';
  if (!provenanceValid) findings.push({ status: STATUS.UNVERIFIED, message: 'Baseline provenance is not an independently collected read-only provider observation.' });
  if (!shapeValid) findings.push({ status: STATUS.UNVERIFIED, message: 'Baseline must be verified schema/evidence version 1 with a fresh observedAt and per-service records.' });
  if (!shapeValid) {
    for (const hotfix of baseline?.hotfixes || []) findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Hotfix ${hotfix.id || 'without an id'} requires Git/content evidence; filename overlap is not proof of reconciliation.` });
    return findings;
  }
  const required = services.filter(service => ['hosting', 'worker', 'backblaze', 'firebase-rules'].includes(service));
  const missing = required.filter(service => !baseline.services[service]?.identity || !baseline.services[service]?.evidenceRef || !baseline.services[service]?.fingerprint);
  findings.push(missing.length ? { status: STATUS.UNVERIFIED, message: `Baseline lacks identity, fingerprint, or evidence references for: ${missing.join(', ')}.` } : { status: STATUS.PASS, message: 'Per-service baseline identities, fingerprints, and evidence references are present.' });
  if (services.includes('hosting')) {
    const dependencies = baseline.dependencies || {};
    if (dependencies.worker?.compatibility !== 'verified' || dependencies.firebaseRules?.compatibility !== 'verified') findings.push({ status: STATUS.UNVERIFIED, message: 'Hosting requires verified Worker and Firebase-rules compatibility evidence.' });
  }
  return findings;
};

async function assessHomeworkWorker({ cwd, source, bundlePath, configPath }) {
  const findings = [{ status: source.dirty ? STATUS.BLOCKED : STATUS.PASS, message: source.dirty ? 'Candidate worktree is dirty.' : 'Candidate worktree is clean.' }];
  let observation = null;
  try {
    assertHomeworkWorkerSource(source);
    observation = await observeHomeworkWorker({ cwd, bundlePath, configPath });
    if (!isHomeworkWorkerObserved(observation)) throw new Error('Untrusted Homework Worker observation rejected.');
    for (const field of ['revision', 'tree', 'baseRevision']) if (observation.source[field] !== source[field]) throw new Error(`Worker observation ${field} does not match selected source.`);
    if ((await collectSourceState(cwd, source.baseRevision)).fingerprint !== source.fingerprint) throw new Error('Candidate changed during Worker observation.');
    findings.push({ status: STATUS.PASS, message: 'Fixed Homework Worker artifact and current provider code, bindings, routing and schedule independently verified. Historical deployed Git provenance remains unknown; reviewed artifact equivalence is recorded.' });
  } catch (error) {
    observation = null;
    findings.push({ status: STATUS.UNVERIFIED, message: `Homework Worker readback: ${error.message}` });
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'release', scope: 'isolated-homework-worker',
    source: { ...source, services: ['backup-worker'], changedServices: classifyPaths(source.files) },
    baseline: null, observed: observation, compatibilityReview: null, hotfixes: [],
    requiredActions: ['Obtain separate authorization and repeat fresh verification immediately before deploying only the pinned prebuilt Worker artifact.'],
    deploymentOrder: ['r2-backup-worker only; no Hosting, Functions, Firebase rules/data or other Worker release.'],
    recovery: ['Prior Worker version f37869c0-c597-41cc-893b-7f7652d80e41 is the prepared recovery target; rollback is not rehearsed and does not undo assignment data writes.'],
    authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: null,
    findings, decision: findings.reduce((status, finding) => rank[finding.status] > rank[status] ? finding.status : status, STATUS.PASS), readOnly: true,
  };
}

async function assessNotificationWorker({ cwd, source, bundlePath, configPath }) {
  const findings = [{ status: source.dirty ? STATUS.BLOCKED : STATUS.PASS, message: source.dirty ? 'Candidate worktree is dirty.' : 'Candidate worktree is clean.' }];
  let observation = null;
  try {
    assertNotificationWorkerSource(source);
    observation = await observeNotificationWorker({ cwd, bundlePath, configPath });
    if (!isNotificationWorkerObserved(observation)) throw new Error('Untrusted notification observation rejected.');
    for (const field of ['revision', 'tree', 'baseRevision']) if (observation.source[field] !== source[field]) throw new Error(`Notification observation ${field} does not match selected source.`);
    if ((await collectSourceState(cwd, source.baseRevision)).fingerprint !== source.fingerprint) throw new Error('Candidate changed during notification observation.');
    findings.push({ status: STATUS.PASS, message: 'Fixed notification modules, effective configuration, unchanged public Durable Object adapter and RTDB baseline independently verified. Historical deployed Git provenance remains unknown.' });
  } catch (error) {
    observation = null;
    findings.push({ status: STATUS.UNVERIFIED, message: `Notification Homework QA readback: ${error.message}` });
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'release', scope: 'isolated-notification-homework-qa',
    source: { ...source, services: ['worker', 'firebase-rules'], changedServices: classifyPaths(source.files) },
    baseline: null, observed: observation, compatibilityReview: null, hotfixes: [],
    requiredActions: ['Obtain independent review and separate authorization for the pinned notification Worker and RTDB result-read correction; repeat fresh verification immediately before execution.'],
    deploymentOrder: ['Only the reviewed luyentap-notification-command modules and database.rules.json result-read correction; Hosting, Firestore, Book and other Workers are excluded.'],
    recovery: ['Retain command Worker version 541166ae-93db-4d92-8eda-5fb291325b42 and exact prior RTDB rules. Recovery is not rehearsed and does not undo delivered notices or authority receipts.'],
    authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: null,
    findings, decision: findings.reduce((status, finding) => rank[finding.status] > rank[status] ? finding.status : status, STATUS.PASS), readOnly: true,
  };
}

async function assessReadingV2Worker({ cwd, source, bundlePath, configPath, phase }) {
  const findings = [{ status: source.dirty ? STATUS.BLOCKED : STATUS.PASS, message: source.dirty ? 'Candidate worktree is dirty.' : 'Candidate worktree is clean.' }];
  let observation = null;
  try {
    assertReadingV2WorkerSource(source);
    observation = await observeReadingV2Worker({ cwd, bundlePath, configPath, phase });
    if (!isReadingV2WorkerObserved(observation)) throw new Error('Untrusted Reading V2 Worker observation rejected.');
    for (const field of ['revision', 'tree', 'baseRevision']) if (observation.source[field] !== source[field]) throw new Error(`Reading V2 Worker observation ${field} does not match selected source.`);
    if ((await collectSourceState(cwd, source.baseRevision)).fingerprint !== source.fingerprint) throw new Error('Reading V2 Worker candidate changed during provider observation.');
    findings.push({ status: STATUS.PASS, message: `Fixed Reading V2 Worker artifact and current provider code, bindings, routing and schedule independently verified for ${phase}. Historical deployed Git provenance remains unknown.` });
  } catch (error) {
    observation = null;
    findings.push({ status: STATUS.UNVERIFIED, message: `Reading V2 Worker readback: ${error.message}` });
  }
  const isPostdeploy = phase === 'postdeploy';
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'release', scope: 'isolated-reading-v2-worker',
    source: { ...source, services: ['backup-worker'], changedServices: classifyPaths(source.files) },
    baseline: null, observed: observation, compatibilityReview: null, hotfixes: [],
    requiredActions: [isPostdeploy ? 'Verify and deploy the compatible Hosting candidate after the Worker release.' : 'After deployment, repeat fresh provider verification with --worker-phase postdeploy.'],
    deploymentOrder: ['r2-backup-worker only; no Hosting, Functions, Firebase rules/data or other Worker release.'],
    recovery: ['Prior Worker version 6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25 is the prepared recovery target; rollback is not rehearsed and does not undo assignment data writes.'],
    authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: null,
    findings, decision: findings.reduce((status, finding) => rank[finding.status] > rank[status] ? finding.status : status, STATUS.PASS), readOnly: true,
  };
}

export async function assess({ cwd = repoRoot, mode = 'release', base, baselinePath, productionEnvFingerprint, observe = false, observeProvider = false, hostingObservation, compatibilityReviewPath, hostingOrigin, observeHomework = false, observeNotification = false, observeReadingV2Worker = false, workerPhase, workerBundlePath, workerConfigPath, observeListening = false, observeListeningEditorRelease = false, listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig } = {}) {
  const fixedWorkerCount = [observeHomework, observeNotification, observeReadingV2Worker].filter(Boolean).length;
  if (!fixedWorkerCount && (workerBundlePath || workerConfigPath)) throw new Error('Worker artifact paths require --observe-homework-worker, --observe-notification-worker, or --observe-reading-v2-worker.');
  if (fixedWorkerCount > 1) throw new Error('Choose only one fixed Worker observer.');
  const hasFixedWorker = fixedWorkerCount === 1;
  if (observeListening && observeListeningEditorRelease) throw new Error('Choose only one Listening release profile.');
  const qualifiedListening = observeListening || observeListeningEditorRelease;
  const editorWorkerOnly = observeListeningEditorRelease && !observe;
  if (observeListeningEditorRelease && (listeningHomeworkBundle || listeningHomeworkConfig)) throw new Error('Editor release does not deploy the homework Worker.');
  if (qualifiedListening && (hasFixedWorker || mode !== 'release' || (!observe && !editorWorkerOnly) || observeProvider || hostingObservation || hostingOrigin || baselinePath || (editorWorkerOnly && compatibilityReviewPath))) throw new Error('Listening qualification requires release mode and native observation without other observers or caller baseline.');
  if (!qualifiedListening && [listeningPhase, listeningUploadBundle, listeningUploadConfig, listeningHomeworkBundle, listeningHomeworkConfig].some(Boolean)) throw new Error('Listening options require --observe-listening-release.');
  if (hasFixedWorker && (mode !== 'release' || observe || observeProvider || hostingObservation || hostingOrigin || baselinePath || compatibilityReviewPath || productionEnvFingerprint)) throw new Error('Fixed Worker observation cannot be combined with other release modes or evidence.');
  if (observeNotification && (!workerBundlePath || !workerConfigPath)) throw new Error('Fixed notification observation requires --worker-bundle and --worker-config.');
  if (observeNotification) return assessNotificationWorker({ cwd, source: await collectSourceState(cwd, base), bundlePath: path.resolve(cwd, workerBundlePath), configPath: path.resolve(cwd, workerConfigPath) });
  if (observeHomework && (!workerBundlePath || !workerConfigPath)) throw new Error('Fixed Homework Worker observation requires --worker-bundle and --worker-config.');
  if (observeHomework) return assessHomeworkWorker({ cwd, source: await collectSourceState(cwd, base), bundlePath: path.resolve(cwd, workerBundlePath), configPath: path.resolve(cwd, workerConfigPath) });
  if (observeReadingV2Worker && (!workerBundlePath || !workerConfigPath)) throw new Error('Fixed Reading V2 Worker observation requires --worker-bundle and --worker-config.');
  if (observeReadingV2Worker && !['predeploy', 'postdeploy'].includes(workerPhase)) throw new Error('Fixed Reading V2 Worker observation requires --worker-phase predeploy or postdeploy.');
  if (observeReadingV2Worker) return assessReadingV2Worker({ cwd, source: await collectSourceState(cwd, base), bundlePath: path.resolve(cwd, workerBundlePath), configPath: path.resolve(cwd, workerConfigPath), phase: workerPhase });
  if (observe && observeProvider) throw new Error('Choose either manifest or Firebase Hosting provider observation, not both.');
  if (hostingOrigin && mode !== 'acceptance') throw new Error('Hosting origin override is restricted to acceptance mode.');
  if (!['release', 'hotfix', 'acceptance'].includes(mode)) throw new Error(`Unsupported mode ${mode}.`);
  const source = await collectSourceState(cwd, base), findings = [];
  findings.push(source.dirty ? { status: STATUS.BLOCKED, message: 'Candidate worktree is dirty; isolate and review exact changes before release.' } : { status: STATUS.PASS, message: 'Candidate worktree is clean.' });
  const services = classifyPaths(source.files);
  let listeningObservation = null;
  let editorObservation = null;
  if (observeListeningEditorRelease) try {
    if (editorWorkerOnly) assertListeningEditorSource(source, reviewedListeningPreviewRelease);
    editorObservation = await observeListeningEditor({ cwd, phase: listeningPhase, uploadBundle: listeningUploadBundle, uploadConfig: listeningUploadConfig });
    if (!isListeningEditorObserved(editorObservation)) throw new Error('Untrusted editor observation rejected.');
    if (productionEnvFingerprint !== editorObservation.local.envSha256) throw new Error('Editor environment fingerprint differs from observed input.');
    for (const field of ['revision', 'tree', 'baseRevision']) if (editorObservation.source[field] !== source[field]) throw new Error('Editor observation source differs from assessment.');
    if ((await collectSourceState(cwd, base)).fingerprint !== source.fingerprint) throw new Error('Editor source changed during observation.');
    findings.push({ status: STATUS.PASS, message: `Fixed ${editorObservation.profile} release independently verified at ${listeningPhase}; scope ${editorObservation.scope}.` });
  } catch (error) {
    editorObservation = null;
    findings.push({ status: STATUS.UNVERIFIED, message: `Editor release readback: ${error.message}` });
  }
  if (editorWorkerOnly) return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), mode, scope: 'upload-worker-only',
    source: { ...source, services: ['worker'], changedServices: services }, baseline: null, observed: null,
    compatibilityReview: null, listeningObservation: null, editorObservation, hostingReady: false, hotfixes: [],
    requiredActions: ['Require independent review, fresh native verification and separate Upload Worker authorization.'],
    deploymentOrder: ['Upload Worker only; Hosting, rules, storage bindings, homework Worker and notifications are excluded.'],
    recovery: [`Retain Upload Worker version ${reviewedListeningPreviewRelease.upload.versionId}; recovery does not reverse data writes.`],
    authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: productionEnvFingerprint || null,
    findings, decision: findings.reduce((status, finding) => rank[finding.status] > rank[status] ? finding.status : status, STATUS.PASS), readOnly: true,
  };
  if (observeListening) try {
    listeningObservation = await observeListeningRelease({ cwd, phase: listeningPhase, uploadBundle: listeningUploadBundle, uploadConfig: listeningUploadConfig, homeworkBundle: listeningHomeworkBundle, homeworkConfig: listeningHomeworkConfig });
    if (!isListeningReleaseObserved(listeningObservation)) throw new Error('Untrusted Listening observation rejected.');
    if (productionEnvFingerprint !== listeningObservation.local.envSha256) throw new Error('Listening production environment fingerprint differs from observed input.');
    for (const field of ['revision', 'tree', 'baseRevision']) if (listeningObservation.source[field] !== source[field]) throw new Error(`Listening observation ${field} differs from assessed source.`);
    if ((await collectSourceState(cwd, base)).fingerprint !== source.fingerprint) throw new Error('Listening candidate changed during observation.');
    findings.push({ status: STATUS.PASS, message: `Fixed Listening release independently verified at ${listeningPhase}; Hosting activation requires homework phase.` });
  } catch (error) {
    listeningObservation = null;
    findings.push({ status: STATUS.UNVERIFIED, message: `Listening release readback: ${error.message}` });
  }
  if (services.includes('migrations')) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Review additive migration prerequisites, deployment order and recovery; emulator state is never promoted.' });
  if (services.includes('backup-worker') && !listeningObservation && !editorObservation) findings.push({ status: STATUS.UNVERIFIED, message: 'Backup Worker active version, R2 bindings, schedules and retention need separate provider readback.' });
  if (services.includes('backblaze')) {
    const backblazePaths = source.files.filter(file => classifyPaths([file]).includes('backblaze'));
    const privateLocalBindingOnly = isListeningEditorObserved(editorObservation) && editorObservation.profile === 'private-audio'
      && editorObservation.local.localListeningBindingOnly === true
      && backblazePaths.length === 1 && backblazePaths[0] === 'scripts/local-book-source-worker.mjs';
    findings.push(privateLocalBindingOnly
      ? { status: STATUS.PASS, message: 'The exact native private-audio profile verifies only the local Listening R2 binding correction; Book/B2 bytes are unchanged.' }
      : { status: STATUS.UNVERIFIED, message: 'Verify B2 bucket/prefix ownership and credential capabilities; local and production mutable prefixes must not overlap.' });
  }
  findings.push(services.length ? { status: STATUS.PASS, message: `Affected services: ${services.join(', ')}.` } : { status: STATUS.REVIEW_REQUIRED, message: 'No changed service paths were identified.' });
  if (services.includes('worker') && !listeningObservation && !editorObservation) findings.push(...await workerFindings(cwd, source.files));
  if (services.includes('hosting') || services.includes('firebase-rules')) findings.push(...await firebaseFindings(cwd));
  if (services.includes('hosting') && services.includes('worker') && !listeningObservation && !editorObservation) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Frontend and Worker changed together; verify endpoint and payload compatibility.' });
  if (services.includes('hosting') && services.includes('firebase-rules') && !listeningObservation && !editorObservation) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Frontend and Firebase rules changed together; verify authorization and migration order.' });
  let baseline = null, baselineFingerprint = null;
  if (baselinePath) try { const raw = await readFile(path.resolve(cwd, baselinePath), 'utf8'); baseline = JSON.parse(raw); baselineFingerprint = sha256(raw); findings.push(...validateBaseline(baseline, services, source.files)); } catch (error) { findings.push({ status: STATUS.UNVERIFIED, message: `Baseline evidence unavailable: ${error.message}` }); }
  else if (!hostingObservation && !observe) findings.push({ status: STATUS.UNVERIFIED, message: 'No deployed baseline evidence supplied; Git branches are not production truth.' });
  let observation = hostingObservation;
  if (observe || observeProvider) try { observation = observeProvider ? observeHostingProvider() : await observeHosting({ originOverride: hostingOrigin, expectedEnvironment: mode === 'acceptance' ? 'acceptance' : 'production' }); } catch (error) { findings.push({ status: STATUS.UNVERIFIED, message: `${mode === 'acceptance' ? 'Acceptance' : 'Production'} readback: ${error.message}` }); }
  if (observation) {
    if (!isObserved(observation)) findings.push({ status: STATUS.BLOCKED, message: 'Untrusted observation object rejected.' });
    else {
      findings.push({ status: STATUS.PASS, message: observation.sourceKnown === false ? `Firebase Hosting live release ${observation.provider.version} independently read back; source provenance is unavailable.` : 'Production Hosting source manifest and deployed file hashes independently read back.' });
      if (observation.sourceKnown === false) findings.push({ status: STATUS.UNVERIFIED, message: 'Firebase Hosting provider metadata does not identify the deployed Git revision or content tree.' });
      else if (observation.revision !== source.baseRevision) findings.push({ status: STATUS.BLOCKED, message: 'Reviewed base does not match observed production Hosting revision.' });
      if (baseline?.observed?.fingerprint && baseline.observed.fingerprint !== observation.fingerprint) findings.push({ status: STATUS.BLOCKED, message: 'Production Hosting changed since the reviewed observation.' });
    }
  }
  const applicationFrontendChange = source.files.some(file => /^(src\/|vite\.config|index\.html)/u.test(file));
  let compatibilityReview = null;
  if (applicationFrontendChange || compatibilityReviewPath) {
    if (!compatibilityReviewPath) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Explicit compatibility review is required for frontend dependence on deployed Worker endpoints, gates, payloads and Firebase permissions.' });
    else try {
      const raw = await readFile(path.resolve(cwd, compatibilityReviewPath), 'utf8');
      const review = JSON.parse(raw);
      const valid = review.schemaVersion === 1 && review.decision === 'verified' && typeof review.reviewer === 'string' && review.reviewer.trim() && typeof review.reviewedAt === 'string' && !Number.isNaN(Date.parse(review.reviewedAt)) && Date.parse(review.reviewedAt) <= Date.now() && Date.now() - Date.parse(review.reviewedAt) <= baselineMaxAgeMs && review.sourceRevision === source.revision && review.baseRevision === source.baseRevision && (!observation || review.observedFingerprint === observation.fingerprint) && Array.isArray(review.scope) && review.scope.length > 0;
      if (!valid) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Compatibility review is stale, incomplete, or bound to different source/baseline evidence.' });
      else {
        if (review.hotfixReconciliations !== undefined && !Array.isArray(review.hotfixReconciliations)) throw new Error('Hotfix reconciliations must be an array.');
        compatibilityReview = { sha256: sha256(raw), reviewer: review.reviewer, reviewedAt: review.reviewedAt, scope: review.scope, hotfixReconciliations: review.hotfixReconciliations || [] };
        findings.push({ status: STATUS.PASS, message: `Compatibility review recorded by ${review.reviewer}.` });
      }
    } catch (error) { findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Compatibility review unavailable: ${error.message}` }); }
  }
  const observedHostingBaseline = isObserved(observation) && observation.revision === source.baseRevision && services.every(service => service === 'hosting' || service === 'tooling');
  if (!baselinePath && observedHostingBaseline) findings.push({ status: STATUS.PASS, message: 'Observed Hosting manifest is the verified baseline for this Hosting-only candidate.' });
  else if (!baselinePath && !observation) findings.push({ status: STATUS.UNVERIFIED, message: 'A baseline file or independent provider observation is required.' });
  if (mode === 'hotfix' && (!isObserved(observation) || observation.revision !== source.baseRevision)) findings.push({ status: STATUS.UNVERIFIED, message: 'Hotfix base is not verified against production source.' });
  const hotfixes = [...(isObserved(observation) ? observation.manifest?.hotfixes || [] : []), ...(baseline?.hotfixes || [])];
  const reconciliations = compatibilityReview?.hotfixReconciliations || [];
  const validReconciliations = reconciliations.every((entry, index) => entry
    && hotfixes.some(hotfix => hotfix.revision === entry.revision)
    && reconciliations.findIndex(other => other?.revision === entry.revision) === index
    && typeof entry.rationale === 'string' && entry.rationale.trim()
    && Array.isArray(entry.paths) && entry.paths.length > 0 && entry.paths.every(file => typeof file === 'string'));
  if (!validReconciliations) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Hotfix reconciliation review contains unknown, duplicate or incomplete entries.' });
  for (const hotfix of hotfixes) {
    if (!hotfix.revision) { findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Hotfix ${hotfix.id || 'unknown'} lacks Git/content evidence; filename overlap proves nothing.` }); continue; }
    try {
      const paths = names(git(['diff-tree', '--no-commit-id', '--name-only', '-r', hotfix.baseRevision || `${hotfix.revision}^`, hotfix.revision], cwd));
      const mismatched = paths.filter(file => git(['ls-tree', hotfix.revision, '--', file], cwd) !== git(['ls-tree', source.revision, '--', file], cwd));
      const reconciliation = reconciliations.find(entry => entry?.revision === hotfix.revision);
      const reviewedChange = validReconciliations && isObserved(observation) && observation.revision === source.baseRevision
        && mismatched.length > 0 && reconciliation && JSON.stringify(reconciliation.paths) === JSON.stringify(mismatched);
      if (reconciliation && !reviewedChange) findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Hotfix ${hotfix.id || hotfix.revision} reconciliation must cover exactly its sorted differing paths against the observed baseline.` });
      findings.push({ status: mismatched.length && !reviewedChange ? STATUS.REVIEW_REQUIRED : STATUS.PASS, message: reviewedChange ? `Hotfix ${hotfix.id || hotfix.revision} successor changes explicitly reviewed: ${reconciliation.rationale}` : mismatched.length ? `Hotfix ${hotfix.id || hotfix.revision} content differs: review equivalence or regression (${mismatched.join(', ')}).` : `Hotfix ${hotfix.id || hotfix.revision} exact content is present.` });
    } catch { findings.push({ status: STATUS.UNVERIFIED, message: `Hotfix ${hotfix.id || hotfix.revision} Git evidence unavailable.` }); }
  }
  if (productionEnvFingerprint) findings.push({ status: STATUS.PASS, message: 'Production environment fingerprint is bound to this assessment.' });
  else if (services.includes('hosting')) findings.push({ status: STATUS.UNVERIFIED, message: 'Hosting assessment lacks a production environment fingerprint.' });
  if (mode === 'hotfix') hotfixes.push({ revision: source.revision, baseRevision: source.baseRevision, paths: source.files, reconciliation: 'REQUIRED' });
  const decision = findings.reduce((status, finding) => rank[finding.status] > rank[status] ? finding.status : status, STATUS.PASS);
  const requiredActions = [], deploymentOrder = [], recovery = [];
  if (services.includes('worker')) { requiredActions.push('Verify Worker version, bindings, required secret names and rollout settings.'); deploymentOrder.push('Worker readiness before activating frontend consumers.'); recovery.push('Record the prior Worker version; rollback does not reverse data migrations.'); }
  if (services.includes('firebase-rules')) { requiredActions.push('Review rules/indexes and any additive migration prerequisites.'); deploymentOrder.push('Deploy additive rules/indexes before activating dependent clients.'); recovery.push('Record prior rules/indexes; data writes and migrations require separate recovery.'); }
  if (services.includes('backblaze')) { requiredActions.push('Verify production bucket/prefix ownership and least-privilege capabilities.'); recovery.push('Backblaze cleanup and object adoption require provider-specific recovery evidence.'); }
  if (services.includes('backup-worker')) { requiredActions.push('Verify backup Worker version, R2 bindings, schedules and retention policy.'); recovery.push('Record the prior backup Worker version and R2 retention implications.'); }
  if (services.includes('hosting')) { deploymentOrder.push(services.includes('worker') ? 'Deploy and verify Worker before Hosting.' : 'Hosting-only deployment.'); recovery.push('Record the prior Hosting release; Hosting rollback does not reverse database or object changes.'); }
  if (editorObservation?.scope === 'upload-worker-only') deploymentOrder.splice(0, deploymentOrder.length, 'Upload Worker only; Hosting, rules, homework Worker and notifications are excluded.');
  if (['functional-completion', 'private-audio'].includes(editorObservation?.profile)) {
    const privateAudio = editorObservation.profile === 'private-audio';
    deploymentOrder.splice(0, deploymentOrder.length, 'Deploy and verify Upload Worker first.', privateAudio
      ? 'Deploy RTDB rules and verify their exact hash; verify Firestore remains unchanged before Hosting.'
      : 'Deploy RTDB and Firestore rules and verify both exact rulesets before Hosting.');
    recovery.push(privateAudio
      ? 'RTDB tightening requires no active Listening test. Hosting-only rollback is unsafe: coordinate Upload Worker, RTDB, storage and Hosting recovery while preserving Firestore.'
      : 'Rules tightening blocks older Listening clients during cutover; require no active Listening test. Hosting-only rollback is unsafe: coordinate Upload Worker, both rulesets and Hosting recovery.');
    if (privateAudio) {
      deploymentOrder.unshift('Verify the fixed private audio bucket has r2.dev disabled, no custom domains and the exact reviewed lifecycle.',
        'Verify private audio object-copy and ownership receipts before switching Upload bindings.');
      deploymentOrder.splice(3, 0, 'After Upload verification, remove only verified shared Listening copies before RTDB rules or Hosting.');
      recovery.push('Private audio bindings and object ownership require coordinated storage recovery; Hosting rollback does not restore copied or deleted objects.');
    }
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), mode, source: { ...source, services }, baseline: baseline ? { sha256: baselineFingerprint } : null, observed: isObserved(observation) ? observation : null, compatibilityReview, listeningObservation, editorObservation, hostingReady: editorObservation ? listeningEditorHostingReady(editorObservation) : listeningObservation ? listeningPhase === 'homework' : undefined, hotfixes, requiredActions, deploymentOrder, recovery, authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: productionEnvFingerprint || null, findings, decision, readOnly: true };
}

export const formatReport = result => [`Release assessment: ${result.decision}`, `Mode: ${result.mode}`, `Revision: ${result.source.revision}`, `Branch: ${result.source.branch || 'detached'}`, `Worktree: ${result.source.dirty ? 'DIRTY' : 'clean'}`, `Services: ${result.source.services.join(', ') || 'none identified'}`, ...result.findings.map(finding => `[${finding.status}] ${finding.message}`)].join('\n');
const parseArgs = argv => { const args = { mode: 'release' }; for (let i = 0; i < argv.length; i += 1) { const value = argv[i]; if (value === '--cwd') args.cwd = path.resolve(argv[++i]); else if (value === '--observe-listening-editor-release') args.observeListeningEditorRelease = true; else if (value === '--observe-listening-release') args.observeListening = true; else if (value === '--listening-phase') args.listeningPhase = argv[++i]; else if (value === '--listening-upload-bundle') args.listeningUploadBundle = argv[++i]; else if (value === '--listening-upload-config') args.listeningUploadConfig = argv[++i]; else if (value === '--listening-homework-bundle') args.listeningHomeworkBundle = argv[++i]; else if (value === '--listening-homework-config') args.listeningHomeworkConfig = argv[++i]; else if (value === '--observe-homework-worker') args.observeHomework = true; else if (value === '--observe-notification-worker') args.observeNotification = true; else if (value === '--observe-reading-v2-worker') args.observeReadingV2Worker = true; else if (value === '--worker-phase') args.workerPhase = argv[++i]; else if (value === '--worker-bundle') args.workerBundlePath = argv[++i]; else if (value === '--worker-config') args.workerConfigPath = argv[++i]; else if (value === '--observe-hosting') args.observe = true; else if (value === '--observe-hosting-provider') args.observeProvider = true; else if (value === '--hosting-origin') args.hostingOrigin = argv[++i]; else if (value === '--compatibility-review') args.compatibilityReviewPath = argv[++i]; else if (value === '--mode') args.mode = argv[++i]; else if (value === '--base') args.base = argv[++i]; else if (value === '--baseline') args.baselinePath = argv[++i]; else if (value === '--env-fingerprint') args.productionEnvFingerprint = argv[++i]; else if (value === '--receipt') args.receipt = argv[++i]; else if (value === '--json') args.json = true; else throw new Error(`Unknown argument ${value}`); } return args; };
const receiptPath = async (cwd, value) => { if (!value) return null; const root = path.resolve(cwd, 'tmp', 'release-receipts'); const target = path.resolve(cwd, value); const relative = path.relative(root, target); if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Receipt must be written under tmp/release-receipts.'); for (let cursor = path.dirname(target); ; cursor = path.dirname(cursor)) { try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Receipt directory cannot contain symlinks.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } if (cursor === root) break; if (cursor === path.dirname(cursor)) throw new Error('Receipt path could not be contained under tmp/release-receipts.'); } const repoRelative = path.relative(cwd, target); if (git(['ls-files', '--', repoRelative], cwd).trim()) throw new Error('Receipt path is tracked; choose a generated path.'); try { await access(target); throw new Error('Receipt already exists; choose a new generated path.'); } catch (error) { if (error.message.startsWith('Receipt already exists')) throw error; } return target; };
export async function main(argv = process.argv.slice(2), cwd = repoRoot) { try { const args = parseArgs(argv), result = await assess({ cwd, ...args }), target = await receiptPath(args.cwd || cwd, args.receipt); if (target) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); } console.log(args.json ? JSON.stringify(result, null, 2) : formatReport(result)); return [STATUS.PASS, STATUS.NOT_APPLICABLE].includes(result.decision) ? 0 : 2; } catch (error) { console.error(`[Release assessment failed] ${error.message}`); return 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
