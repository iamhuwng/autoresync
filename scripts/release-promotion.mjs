import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runReleaseVerification } from './release-verification.mjs';
import { classifyPaths, collectSourceState } from './release-check.mjs';
import { observeHosting } from './release-evidence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/u;
const revisionPattern = /^[a-f0-9]{40}$/u;
const sourceRefPattern = /^refs\/heads\/main$/u;
const trackedPathPattern = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/u;
const maxBrowserEvidenceAgeMs = 24 * 60 * 60 * 1000;
const maxCardAgeMs = 2 * 60 * 60 * 1000;
const maxClockSkewMs = 10 * 60 * 1000;
const fail = message => { throw new Error(`Release promotion: ${message}`); };

const text = (value, label, maximum = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0\r\n]/u.test(value)) fail(`${label} must be bounded single-line text`);
  if (/[?&](?:key|token|secret|password|authorization)=|:\/\/[^/\s]*@/iu.test(value)) fail(`${label} cannot contain credentials`);
  return value.trim();
};

const digestField = (value, label) => {
  if (!shaPattern.test(value || '')) fail(`${label} must be a lower-case SHA-256 digest`);
  return value;
};

const exactFields = (value, fields, label) => {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !fields.includes(key))) fail(`${label} contains unknown fields`);
};

const revisionField = (value, label) => {
  if (!revisionPattern.test(value || '')) fail(`${label} must be a full Git revision`);
  return value;
};

const timestamp = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label} must be an ISO timestamp`);
  return value;
};

const evidenceRefs = value => {
  if (!Array.isArray(value) || value.length > 30) fail('browser evidence references must be a bounded array');
  return value.map(reference => text(reference, 'browser evidence reference', 1000));
};

export const validateTrackedPath = (value, label) => {
  if (typeof value !== 'string' || !trackedPathPattern.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')
    || value.startsWith('/') || value.endsWith('/')) fail(`${label} must be an explicit tracked relative path`);
  return value;
};

const validatePlanPath = value => {
  validateTrackedPath(value, 'verification plan file');
  if (!value.startsWith('tmp/release-receipts/')) {
    try { git(repoRoot, ['ls-files', '--error-unmatch', '--', value]); }
    catch { fail('verification plan file must be tracked or generated beneath tmp/release-receipts'); }
  }
  return value;
};

export function validateVerificationResult(value, { source, environmentFingerprint, planSha256 } = {}) {
  exactFields(value, ['schemaVersion', 'decision', 'source', 'envFingerprint', 'planSha256', 'startedAt', 'completedAt', 'suites'], 'verification result');
  if (value.schemaVersion !== 1 || value.decision !== 'PASS') fail('verification result must be a passing schemaVersion 1 result');
  exactFields(value.source, ['revision', 'tree', 'baseRevision', 'fingerprint', 'dirty'], 'verification source');
  for (const key of ['revision', 'tree', 'baseRevision']) revisionField(value.source?.[key], `verification source ${key}`);
  digestField(value.source?.fingerprint, 'verification source fingerprint');
  if (!source || value.source.revision !== source.revision || value.source.tree !== source.tree || value.source.fingerprint !== source.fingerprint || value.source.dirty !== false) fail('verification result source differs from the assessed source');
  if (value.envFingerprint !== environmentFingerprint || value.planSha256 !== planSha256) fail('verification result environment or plan binding differs');
  timestamp(value.startedAt, 'verification start');
  timestamp(value.completedAt, 'verification completion');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) fail('verification completion precedes its start');
  if (!Array.isArray(value.suites) || value.suites.length < 1 || value.suites.length > 30) fail('verification result must contain bounded suites');
  for (const suite of value.suites) {
    exactFields(suite, ['runner', 'files', 'config', 'counts', 'outputSha256'], 'verification suite');
    if (!['node', 'vitest'].includes(suite.runner) || !Array.isArray(suite.files) || suite.files.length < 1 || suite.files.length > 200) fail('verification suite runner or files are invalid');
    suite.files.forEach(file => validateTrackedPath(file, 'verification suite file'));
    if (suite.config !== undefined) validateTrackedPath(suite.config, 'verification suite config');
    exactFields(suite.counts, ['total', 'passed', 'failed', 'skipped'], 'verification counts');
    if (!Number.isSafeInteger(suite.counts?.total) || suite.counts.total < 1 || suite.counts.passed !== suite.counts.total || suite.counts.failed !== 0 || suite.counts.skipped !== 0) fail('verification suite counts are not a complete passing result');
    digestField(suite.outputSha256, 'verification suite output digest');
  }
  return value;
}

export function validateBrowserEvidence(value, { source, environmentFingerprint, configurationFingerprint } = {}) {
  exactFields(value, ['decision', 'observedAt', 'scenario', 'sourceRevision', 'sourceFingerprint', 'runtimeEnvironmentFingerprint', 'artifactEnvironmentFingerprint', 'configurationFingerprint', 'evidenceRefs', 'summary'], 'browser evidence');
  if (!['verified', 'blocked', 'not-run', 'waived'].includes(value.decision)) fail('browser evidence decision is invalid');
  timestamp(value.observedAt, 'browser evidence observation');
  const observedAt = Date.parse(value.observedAt);
  const now = Date.now();
  if (value.decision === 'verified' && (observedAt > now + maxClockSkewMs || now - observedAt > maxBrowserEvidenceAgeMs)) fail('browser evidence is stale or dated in the future');
  text(value.scenario, 'browser evidence scenario');
  text(value.summary, 'browser evidence summary');
  revisionField(value.sourceRevision, 'browser evidence source revision');
  digestField(value.sourceFingerprint, 'browser evidence source fingerprint');
  digestField(value.runtimeEnvironmentFingerprint, 'browser runtime environment fingerprint');
  digestField(value.artifactEnvironmentFingerprint, 'browser artifact environment fingerprint');
  digestField(value.configurationFingerprint, 'browser evidence configuration fingerprint');
  if (!source || value.sourceRevision !== source.revision || value.sourceFingerprint !== source.fingerprint) fail('browser evidence source differs from the assessed source');
  if (value.artifactEnvironmentFingerprint !== environmentFingerprint || value.configurationFingerprint !== configurationFingerprint) fail('browser evidence artifact environment or configuration differs');
  const refs = evidenceRefs(value.evidenceRefs);
  if (value.decision === 'verified' && refs.length === 0) fail('verified browser evidence requires evidence references');
  return value;
}

export function assertBrowserReady(card) {
  validatePromotionCard(card);
  if (card.browser.decision !== 'verified') fail(`promotion requires verified browser evidence; current decision is ${card.browser.decision}`);
  return card;
}

const readArtifactManifest = cwd => {
  const manifest = JSON.parse(readFileSync(path.join(cwd, 'dist/.well-known/luyentap-release.json'), 'utf8'));
  if (manifest?.schemaVersion !== 1 || manifest.environment !== 'production' || manifest.project !== 'temp-a1437' || manifest.site !== 'kahut1'
    || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 2000) fail('artifact manifest identity is invalid');
  revisionField(manifest.revision, 'artifact manifest revision');
  revisionField(manifest.tree, 'artifact manifest tree');
  digestField(manifest.envFingerprint, 'artifact manifest environment fingerprint');
  return manifest;
};

const optionalReview = (file, digest) => {
  if ((file === undefined || file === '') && (digest === undefined || digest === '')) return undefined;
  if (typeof file !== 'string' || typeof digest !== 'string') fail('compatibility review path and digest must be supplied together');
  return { file: validateTrackedPath(file, 'compatibility review file'), sha256: digestField(digest, 'compatibility review digest') };
};

export function validatePromotionCard(card) {
  if (!card || Object.getPrototypeOf(card) !== Object.prototype || card.schemaVersion !== 1) fail('card schema is invalid');
  const allowed = ['schemaVersion', 'generatedAt', 'repository', 'event', 'source', 'baseline', 'verification', 'artifact', 'configuration', 'environment', 'dependencies', 'scope', 'recovery', 'assessment', 'browser', 'impact', 'missingProof'];
  if (Object.keys(card).some(key => !allowed.includes(key))) fail('card contains unknown fields');
  if (card.repository !== 'iamhuwng/autoresync') fail('card repository is invalid');
  exactFields(card.event, ['name', 'ref', 'sha'], 'event');
  if (!card.event || card.event.name !== 'workflow_dispatch' || card.event.ref !== 'refs/heads/main') fail('card event is not a protected main dispatch');
  revisionField(card.event.sha, 'event SHA');
  exactFields(card.source, ['ref', 'revision', 'tree', 'baseRevision', 'fingerprint', 'dirty'], 'source');
  if (!card.source || card.source.ref !== 'refs/heads/main' || !sourceRefPattern.test(card.source.ref)
    || card.source.dirty !== false) fail('card source must be clean protected main');
  revisionField(card.source.revision, 'source revision');
  revisionField(card.source.tree, 'source tree');
  revisionField(card.source.baseRevision, 'source base revision');
  digestField(card.source.fingerprint, 'source fingerprint');
  if (card.event.sha !== card.source.revision) fail('event SHA differs from source revision');
  exactFields(card.baseline, ['revision', 'tree', 'fingerprint'], 'baseline');
  if (!card.baseline) fail('card baseline is missing');
  revisionField(card.baseline.revision, 'baseline revision');
  revisionField(card.baseline.tree, 'baseline tree');
  digestField(card.baseline.fingerprint, 'baseline fingerprint');
  if (card.source.baseRevision !== card.baseline.revision) fail('source base revision differs from observed Hosting baseline');
  exactFields(card.configuration, ['firebaseSha256'], 'configuration');
  digestField(card.configuration?.firebaseSha256, 'Firebase configuration digest');
  exactFields(card.environment, ['fingerprint'], 'environment');
  digestField(card.environment?.fingerprint, 'production environment fingerprint');
  exactFields(card.verification, ['planFile', 'planSha256', 'actual', 'compatibilityReview'], 'verification');
  if (!card.verification) fail('card verification binding is missing');
  validatePlanPath(card.verification.planFile);
  digestField(card.verification.planSha256, 'verification plan digest');
  validateVerificationResult(card.verification.actual, { source: card.source, environmentFingerprint: card.environment?.fingerprint, planSha256: card.verification.planSha256 });
  if (card.verification.actual.source.baseRevision !== card.baseline.revision) fail('verification source base revision differs from observed Hosting baseline');
  if (card.verification.compatibilityReview) {
    exactFields(card.verification.compatibilityReview, ['file', 'sha256'], 'compatibility review');
    optionalReview(card.verification.compatibilityReview.file, card.verification.compatibilityReview.sha256);
  }
  exactFields(card.artifact, ['manifestSha256', 'revision', 'tree', 'environmentFingerprint', 'fileCount'], 'artifact');
  digestField(card.artifact?.manifestSha256, 'artifact manifest digest');
  revisionField(card.artifact?.revision, 'artifact revision');
  revisionField(card.artifact?.tree, 'artifact tree');
  digestField(card.artifact?.environmentFingerprint, 'artifact environment fingerprint');
  if (!Number.isSafeInteger(card.artifact?.fileCount) || card.artifact.fileCount < 1 || card.artifact.fileCount > 2000) fail('artifact file count is invalid');
  if (card.artifact.revision !== card.source.revision || card.artifact.tree !== card.source.tree || card.artifact.environmentFingerprint !== card.environment.fingerprint) fail('artifact identity differs from source or environment');
  if (card.dependencies !== undefined) exactFields(card.dependencies, ['fingerprint'], 'dependencies');
  if (card.dependencies?.fingerprint !== undefined) digestField(card.dependencies.fingerprint, 'dependency fingerprint');
  exactFields(card.assessment, ['decision', 'target', 'receiptSha256'], 'assessment');
  if (!card.assessment || !['PASS', 'NOT_APPLICABLE'].includes(card.assessment.decision)) fail('assessment is not publishable');
  digestField(card.assessment.receiptSha256, 'assessment receipt digest');
  exactFields(card.scope, ['included', 'excluded'], 'scope');
  exactFields(card.recovery, ['target', 'limits'], 'recovery');
  exactFields(card.browser, ['decision', 'observedAt', 'scenario', 'sourceRevision', 'sourceFingerprint', 'runtimeEnvironmentFingerprint', 'artifactEnvironmentFingerprint', 'configurationFingerprint', 'evidenceRefs', 'summary'], 'browser');
  validateBrowserEvidence(card.browser, { source: card.source, environmentFingerprint: card.environment?.fingerprint, configurationFingerprint: card.configuration?.firebaseSha256 });
  text(card.impact, 'release impact');
  text(card.missingProof, 'missing proof');
  text(card.scope?.included, 'included scope');
  text(card.scope?.excluded, 'excluded scope');
  text(card.recovery?.target, 'recovery target');
  text(card.recovery?.limits, 'recovery limits');
  if (!card.generatedAt || new Date(card.generatedAt).toISOString() !== card.generatedAt) fail('card timestamp is invalid');
  const generatedAt = Date.parse(card.generatedAt), now = Date.now();
  if (generatedAt > now + maxClockSkewMs || now - generatedAt > maxCardAgeMs) fail('release card is stale or dated in the future');
  return card;
}

const jsonDigest = value => sha256(JSON.stringify(value));

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const defaultVerificationFiles = Object.freeze([
  'scripts/__tests__/release-promotion.test.mjs',
  'scripts/__tests__/release-promotion-workflow.test.mjs',
  'scripts/__tests__/release-check.test.mjs',
  'scripts/__tests__/release-plan.test.mjs',
  'scripts/__tests__/release-verification.test.mjs',
  'scripts/__tests__/release-archive.test.mjs',
  'scripts/__tests__/deployment-safety.test.mjs',
]);

const tracked = (cwd, file) => {
  try { git(cwd, ['ls-files', '--error-unmatch', '--', file]); return true; }
  catch { return false; }
};

const candidateTests = (cwd, files) => [...new Set(files.flatMap(file => {
  const candidates = /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)
    ? [file]
    : [file.replace(/\.([cm]?[jt]sx?)$/u, '.test.$1'), file.replace(/^scripts\/([^/]+)\.mjs$/u, 'scripts/__tests__/$1.test.mjs')];
  return candidates.filter(candidate => tracked(cwd, candidate));
}))].sort();

export function createVerificationPlan(files) {
  const nodeFiles = files.filter(file => file.startsWith('scripts/__tests__/') && file.endsWith('.mjs'));
  const vitestFiles = files.filter(file => !nodeFiles.includes(file));
  return {
    schemaVersion: 1,
    suites: [
      ...(nodeFiles.length ? [{ runner: 'node', files: nodeFiles }] : []),
      ...(vitestFiles.length ? [{ runner: 'vitest', config: 'vitest.config.ts', files: vitestFiles }] : []),
    ],
  };
}

export async function preparePromotionInputs({ cwd = repoRoot, productionEnvFile, objective } = {}) {
  if (!productionEnvFile) fail('production environment file is required for automatic preparation');
  if (!objective) fail('release objective is required; technical inputs are derived automatically');
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventRef = process.env.GITHUB_REF;
  const eventSha = process.env.GITHUB_SHA;
  if (eventName !== 'workflow_dispatch' || eventRef !== 'refs/heads/main') fail('promotion preparation requires workflow_dispatch on refs/heads/main');
  revisionField(eventSha, 'event SHA');
  if (git(cwd, ['rev-parse', 'HEAD']) !== eventSha) fail('checked-out source differs from the workflow event SHA');
  const envBytes = await readFile(path.resolve(productionEnvFile));
  const environmentFingerprint = sha256(envBytes);
  const observed = await observeHosting();
  if (!observed.sourceKnown || !observed.revision || !observed.tree) fail('live Hosting source provenance is unavailable; automatic preparation cannot select a baseline');
  const source = await collectSourceState(cwd, observed.revision);
  if (source.dirty) fail('candidate source must be clean before automatic preparation');
  const planFile = 'tmp/release-receipts/ci-verification-plan.json';
  const changedTests = candidateTests(cwd, source.files);
  const files = [...new Set([...defaultVerificationFiles, ...changedTests])].filter(file => tracked(cwd, file));
  const plan = createVerificationPlan(files);
  await mkdir(path.dirname(path.resolve(cwd, planFile)), { recursive: true });
  await writeFile(path.resolve(cwd, planFile), `${JSON.stringify(plan, null, 2)}\n`);
  const configurationFingerprint = configurationDigest(cwd);
  const reviewPath = 'documentation/release-evidence/compatibility-review.json';
  let compatibilityReviewFile = '';
  let compatibilityReviewSha256 = '';
  if (tracked(cwd, reviewPath)) {
    compatibilityReviewFile = reviewPath;
    compatibilityReviewSha256 = sha256(await readFile(path.resolve(cwd, reviewPath)));
  }
  const browserPath = path.join(cwd, 'documentation/release-evidence/browser.json');
  let browser;
  try {
    browser = JSON.parse(await readFile(browserPath, 'utf8'));
  } catch {
    browser = { decision: 'blocked', observedAt: new Date().toISOString(), scenario: 'authenticated teacher and student browser verification', sourceRevision: source.revision, sourceFingerprint: source.fingerprint, runtimeEnvironmentFingerprint: environmentFingerprint, artifactEnvironmentFingerprint: environmentFingerprint, configurationFingerprint, evidenceRefs: [], summary: 'No source-bound browser evidence was available to the automatic release preparer; dependable runtime ownership remains unqualified.' };
  }
  const missing = browser.decision === 'verified' ? (changedTests.length ? 'No known missing automated evidence.' : 'No directly collocated affected test was discovered; inspect the selected release suites.') : 'Dependable authenticated browser evidence is not available for this candidate.';
  return {
    schemaVersion: 1,
    sourceRef: 'refs/heads/main', eventRef, eventName, eventSha,
    baseRevision: observed.revision, observedFingerprint: observed.fingerprint,
    sourceFingerprint: source.fingerprint, environmentFingerprint,
    planFile, planSha256: sha256(Buffer.from(`${JSON.stringify(plan, null, 2)}\n`)),
    artifactSha256: null, compatibilityReviewFile, compatibilityReviewSha256,
    browser, configurationFingerprint, objective: text(objective, 'release objective'),
    includedScope: `${objective}; affected services: ${classifyPaths(source.files).join(', ') || 'none identified'}`,
    excludedScope: 'Workers, rules, storage, database and application data unless separately qualified and authorized.',
    impact: `Automatic assessment classified affected services as: ${classifyPaths(source.files).join(', ') || 'none identified'}.`,
    missingProof: missing,
    recoveryTarget: 'previous verified Hosting release',
    recoveryLimits: 'Hosting recovery does not reverse Worker, rules, storage, database or application-data changes.',
  };
}

export function configurationDigest(cwd = repoRoot) {
  const firebase = JSON.parse(readFileSync(path.join(cwd, 'firebase.json'), 'utf8'));
  const firebaseRc = JSON.parse(readFileSync(path.join(cwd, '.firebaserc'), 'utf8'));
  return jsonDigest({ firebase, firebaseRc });
}

export function createPromotionCard({ cwd = repoRoot, assessment, assessmentSha256, sourceRef, eventRef, eventName, eventSha, planFile, planSha256, compatibilityReviewFile, compatibilityReviewSha256, artifactSha256, environmentFingerprint, includedScope, excludedScope, recoveryTarget, recoveryLimits, verification, browserEvidence, impact, missingProof } = {}) {
  if (!assessment || !['PASS', 'NOT_APPLICABLE'].includes(assessment.decision)) fail('assessment must be PASS or NOT_APPLICABLE');
  if (!sourceRefPattern.test(sourceRef) || eventName !== 'workflow_dispatch' || eventRef !== 'refs/heads/main') fail('promotion requires explicit workflow_dispatch context on protected main');
  revisionField(eventSha, 'event SHA');
  const source = assessment.source;
  if (!source || source.dirty || !revisionPattern.test(source.revision || '') || !revisionPattern.test(source.tree || '') || !revisionPattern.test(source.baseRevision || '') || !shaPattern.test(source.fingerprint || '')) fail('assessment source is not exact and clean');
  if (source.revision !== eventSha) fail('event SHA differs from the assessed source revision');
  if (source.baseRevision !== assessment.observed?.revision) fail('assessment source base revision differs from the observed Hosting baseline');
  if (!assessment.observed || assessment.observed.revision !== source.baseRevision || !revisionPattern.test(assessment.observed.tree || '')) fail('assessment source base revision differs from the observed Hosting baseline');
  if (assessment.productionEnvFingerprint !== environmentFingerprint) fail('assessment environment fingerprint differs from the release card');
  const review = optionalReview(compatibilityReviewFile, compatibilityReviewSha256);
  const manifest = readArtifactManifest(cwd);
  if (manifest.revision !== source.revision || manifest.tree !== source.tree || manifest.envFingerprint !== environmentFingerprint) fail('artifact manifest does not match the assessed source or environment');
  const manifestSha256 = jsonDigest(manifest);
  if (artifactSha256 !== manifestSha256) fail('artifact manifest digest differs from the retained artifact');
  validateVerificationResult(verification, { source, environmentFingerprint, planSha256 });
  if (verification.source.baseRevision !== source.baseRevision) fail('verification source base revision differs from the assessment source base revision');
  validateBrowserEvidence(browserEvidence, { source, environmentFingerprint, configurationFingerprint: configurationDigest(cwd) });
  const card = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: 'iamhuwng/autoresync',
    event: { name: eventName, ref: eventRef, sha: eventSha },
    source: { ref: sourceRef, revision: source.revision, tree: source.tree, baseRevision: source.baseRevision, fingerprint: source.fingerprint, dirty: false },
    baseline: { revision: assessment.observed.revision, tree: assessment.observed.tree, fingerprint: assessment.observed.fingerprint },
    verification: { planFile: validatePlanPath(planFile), planSha256: digestField(planSha256, 'verification plan digest'), actual: verification, ...(review ? { compatibilityReview: review } : {}) },
    artifact: { manifestSha256: manifestSha256, revision: manifest.revision, tree: manifest.tree, environmentFingerprint: manifest.envFingerprint, fileCount: manifest.files.length },
    configuration: { firebaseSha256: configurationDigest(cwd) },
    environment: { fingerprint: digestField(environmentFingerprint, 'production environment fingerprint') },
    ...(assessment.hostingDependencies ? { dependencies: { fingerprint: digestField(assessment.hostingDependencies.fingerprint, 'dependency fingerprint') } } : {}),
    assessment: { decision: assessment.decision, target: assessment.target, receiptSha256: digestField(assessmentSha256, 'assessment receipt digest') },
    scope: { included: text(includedScope, 'included scope'), excluded: text(excludedScope, 'excluded scope') },
    recovery: { target: text(recoveryTarget, 'recovery target'), limits: text(recoveryLimits, 'recovery limits') },
    browser: browserEvidence,
    impact: text(impact, 'release impact'),
    missingProof: text(missingProof, 'missing proof'),
  };
  validatePromotionCard(card);
  return card;
}

export const cardBytes = card => Buffer.from(`${JSON.stringify(validatePromotionCard(card), null, 2)}\n`, 'utf8');

export const cardDigest = card => sha256(cardBytes(card));

export function promotionEnvironment(card) {
  validatePromotionCard(card);
  const values = {
    LUYENTAP_RELEASE_SOURCE_REF: card.source.ref,
    LUYENTAP_RELEASE_BASE: card.baseline.revision,
    LUYENTAP_RELEASE_FINGERPRINT: card.source.fingerprint,
    LUYENTAP_RELEASE_ENV_FINGERPRINT: card.environment.fingerprint,
    LUYENTAP_RELEASE_OBSERVED_FINGERPRINT: card.baseline.fingerprint,
    LUYENTAP_RELEASE_TEST_PLAN_FILE: card.verification.planFile,
    LUYENTAP_RELEASE_TEST_PLAN_SHA256: card.verification.planSha256,
    LUYENTAP_RELEASE_ARTIFACT_SHA256: card.artifact.manifestSha256,
  };
  if (card.verification.compatibilityReview) {
    values.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE = card.verification.compatibilityReview.file;
    values.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256 = card.verification.compatibilityReview.sha256;
  }
  return values;
}

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--assessment') args.assessment = argv[++index];
    else if (value === '--output') args.output = argv[++index];
    else if (value === '--prepare') args.prepare = true;
    else if (value === '--objective') args.objective = argv[++index];
    else if (value === '--production-env-file') args.productionEnvFile = argv[++index];
    else if (value === '--export-inputs') args.exportInputs = argv[++index];
    else if (value === '--check-card') args.checkCard = argv[++index];
    else if (value === '--export-env') args.exportEnv = argv[++index];
    else if (value === '--run-verification') args.runVerification = true;
    else if (value === '--require-browser') args.requireBrowser = argv[++index];
    else if (value === '--artifact-digest') args.artifactDigest = true;
    else throw new Error(`Unknown argument ${value}`);
  }
  return args;
};

const main = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.prepare) {
    if (!args.output) fail('--output is required for --prepare');
    const inputs = await preparePromotionInputs({ cwd: process.cwd(), productionEnvFile: args.productionEnvFile, objective: args.objective });
    await writeFile(path.resolve(args.output), `${JSON.stringify(inputs, null, 2)}\n`);
    return;
  }
  if (args.exportInputs) {
    const inputs = JSON.parse(await readFile(path.resolve(args.exportInputs), 'utf8'));
    const output = process.env.GITHUB_ENV;
    if (!output) fail('GITHUB_ENV is required for --export-inputs');
    const values = {
      LUYENTAP_RELEASE_BASE: inputs.baseRevision,
      LUYENTAP_RELEASE_OBSERVED_FINGERPRINT: inputs.observedFingerprint,
      LUYENTAP_RELEASE_FINGERPRINT: inputs.sourceFingerprint,
      LUYENTAP_RELEASE_ENV_FINGERPRINT: inputs.environmentFingerprint,
      LUYENTAP_RELEASE_TEST_PLAN_FILE: inputs.planFile,
      LUYENTAP_RELEASE_TEST_PLAN_SHA256: inputs.planSha256,
      LUYENTAP_RELEASE_SOURCE_REF: inputs.sourceRef,
      LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE: inputs.compatibilityReviewFile,
      LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256: inputs.compatibilityReviewSha256,
      LUYENTAP_RELEASE_SCOPE: inputs.includedScope,
      LUYENTAP_RELEASE_EXCLUDED: inputs.excludedScope,
      LUYENTAP_RELEASE_IMPACT: inputs.impact,
      LUYENTAP_RELEASE_MISSING_PROOF: inputs.missingProof,
      LUYENTAP_RELEASE_RECOVERY_TARGET: inputs.recoveryTarget,
      LUYENTAP_RELEASE_RECOVERY_LIMITS: inputs.recoveryLimits,
    };
    await writeFile(output, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { flag: 'a' });
    return;
  }
  if (args.runVerification) {
    if (!args.output) fail('--output is required for --run-verification');
    const result = await runReleaseVerification({ cwd: process.cwd(), base: process.env.LUYENTAP_RELEASE_BASE, planPath: process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE, envFingerprint: process.env.LUYENTAP_RELEASE_ENV_FINGERPRINT });
    await writeFile(path.resolve(args.output), `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (args.artifactDigest) {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'dist/.well-known/luyentap-release.json'), 'utf8'));
    process.stdout.write(`${jsonDigest(manifest)}\n`);
    return;
  }
  if (args.checkCard) {
    const card = JSON.parse(await readFile(path.resolve(args.checkCard), 'utf8'));
    validatePromotionCard(card);
    process.stdout.write(`${cardDigest(card)}\n`);
    return;
  }
  if (args.requireBrowser) {
    const card = JSON.parse(await readFile(path.resolve(args.requireBrowser), 'utf8'));
    assertBrowserReady(card);
    process.stdout.write(`${cardDigest(card)}\n`);
    return;
  }
  if (args.exportEnv) {
    const card = JSON.parse(await readFile(path.resolve(args.exportEnv), 'utf8'));
    const output = process.env.GITHUB_ENV;
    if (!output) fail('GITHUB_ENV is required for --export-env');
    const lines = Object.entries(promotionEnvironment(card)).map(([key, value]) => `${key}=${value}`);
    await writeFile(output, `${lines.join('\n')}\n`, { flag: 'a' });
    return;
  }
  if (args.assessment && args.output) {
    const assessmentBytes = await readFile(path.resolve(args.assessment));
    const assessment = JSON.parse(assessmentBytes.toString('utf8'));
    const discovered = process.env.LUYENTAP_RELEASE_INPUTS_FILE
      ? JSON.parse(await readFile(path.resolve(process.env.LUYENTAP_RELEASE_INPUTS_FILE), 'utf8'))
      : {};
    const readEvidence = async (name, label) => {
      const file = process.env[name];
      if (file) return JSON.parse(await readFile(path.resolve(file), 'utf8'));
      if (name === 'LUYENTAP_RELEASE_BROWSER_EVIDENCE_FILE' && discovered.browser) return discovered.browser;
      if (name === 'LUYENTAP_RELEASE_VERIFICATION_FILE' && discovered.verification) return discovered.verification;
      fail(`${name} is required for ${label}`);
    };
    const card = createPromotionCard({
      cwd: process.cwd(), assessment, assessmentSha256: sha256(assessmentBytes),
      sourceRef: process.env.LUYENTAP_RELEASE_SOURCE_REF || discovered.sourceRef,
      eventRef: process.env.GITHUB_REF || discovered.eventRef,
      eventName: process.env.GITHUB_EVENT_NAME || discovered.eventName,
      eventSha: process.env.GITHUB_SHA || discovered.eventSha,
      planFile: process.env.LUYENTAP_RELEASE_TEST_PLAN_FILE || discovered.planFile,
      planSha256: process.env.LUYENTAP_RELEASE_TEST_PLAN_SHA256 || discovered.planSha256,
      compatibilityReviewFile: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE || discovered.compatibilityReviewFile,
      compatibilityReviewSha256: process.env.LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256 || discovered.compatibilityReviewSha256,
      artifactSha256: process.env.LUYENTAP_RELEASE_ARTIFACT_SHA256 || discovered.artifactSha256,
      environmentFingerprint: process.env.LUYENTAP_RELEASE_ENV_FINGERPRINT || discovered.environmentFingerprint,
      includedScope: process.env.LUYENTAP_RELEASE_SCOPE || discovered.includedScope,
      excludedScope: process.env.LUYENTAP_RELEASE_EXCLUDED || discovered.excludedScope,
      recoveryTarget: process.env.LUYENTAP_RELEASE_RECOVERY_TARGET || discovered.recoveryTarget,
      recoveryLimits: process.env.LUYENTAP_RELEASE_RECOVERY_LIMITS || discovered.recoveryLimits,
      verification: await readEvidence('LUYENTAP_RELEASE_VERIFICATION_FILE', 'actual verification evidence'),
      browserEvidence: await readEvidence('LUYENTAP_RELEASE_BROWSER_EVIDENCE_FILE', 'browser evidence'),
      impact: process.env.LUYENTAP_RELEASE_IMPACT || discovered.impact,
      missingProof: process.env.LUYENTAP_RELEASE_MISSING_PROOF || discovered.missingProof,
    });
    await writeFile(path.resolve(args.output), cardBytes(card));
    process.stdout.write(`${cardDigest(card)}\n`);
    return;
  }
  throw new Error('Use --prepare --objective <text> --production-env-file <file> --output <file>, --artifact-digest, --run-verification --output <file>, --assessment <file> --output <file>, --check-card <file>, --require-browser <card>, or --export-env <card>');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
