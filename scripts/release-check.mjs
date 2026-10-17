import crypto from 'node:crypto';
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { observeHosting, observeHostingProvider, isObserved } from './release-evidence.mjs';

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

export async function assess({ cwd = repoRoot, mode = 'release', base, baselinePath, productionEnvFingerprint, observe = false, observeProvider = false, hostingObservation, compatibilityReviewPath, hostingOrigin } = {}) {
  if (observe && observeProvider) throw new Error('Choose either manifest or Firebase Hosting provider observation, not both.');
  if (hostingOrigin && mode !== 'acceptance') throw new Error('Hosting origin override is restricted to acceptance mode.');
  if (!['release', 'hotfix', 'acceptance'].includes(mode)) throw new Error(`Unsupported mode ${mode}.`);
  const source = await collectSourceState(cwd, base), findings = [];
  findings.push(source.dirty ? { status: STATUS.BLOCKED, message: 'Candidate worktree is dirty; isolate and review exact changes before release.' } : { status: STATUS.PASS, message: 'Candidate worktree is clean.' });
  const services = classifyPaths(source.files);
  if (services.includes('migrations')) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Review additive migration prerequisites, deployment order and recovery; emulator state is never promoted.' });
  if (services.includes('backup-worker')) findings.push({ status: STATUS.UNVERIFIED, message: 'Backup Worker active version, R2 bindings, schedules and retention need separate provider readback.' });
  if (services.includes('backblaze')) findings.push({ status: STATUS.UNVERIFIED, message: 'Verify B2 bucket/prefix ownership and credential capabilities; local and production mutable prefixes must not overlap.' });
  findings.push(services.length ? { status: STATUS.PASS, message: `Affected services: ${services.join(', ')}.` } : { status: STATUS.REVIEW_REQUIRED, message: 'No changed service paths were identified.' });
  if (services.includes('worker')) findings.push(...await workerFindings(cwd, source.files));
  if (services.includes('hosting') || services.includes('firebase-rules')) findings.push(...await firebaseFindings(cwd));
  if (services.includes('hosting') && services.includes('worker')) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Frontend and Worker changed together; verify endpoint and payload compatibility.' });
  if (services.includes('hosting') && services.includes('firebase-rules')) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Frontend and Firebase rules changed together; verify authorization and migration order.' });
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
  if (applicationFrontendChange) {
    if (!compatibilityReviewPath) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Explicit compatibility review is required for frontend dependence on deployed Worker endpoints, gates, payloads and Firebase permissions.' });
    else try {
      const raw = await readFile(path.resolve(cwd, compatibilityReviewPath), 'utf8');
      const review = JSON.parse(raw);
      const valid = review.schemaVersion === 1 && review.decision === 'verified' && typeof review.reviewer === 'string' && review.reviewer.trim() && typeof review.reviewedAt === 'string' && !Number.isNaN(Date.parse(review.reviewedAt)) && Date.now() - Date.parse(review.reviewedAt) <= baselineMaxAgeMs && review.sourceRevision === source.revision && review.baseRevision === source.baseRevision && (!observation || review.observedFingerprint === observation.fingerprint) && Array.isArray(review.scope) && review.scope.length > 0;
      if (!valid) findings.push({ status: STATUS.REVIEW_REQUIRED, message: 'Compatibility review is stale, incomplete, or bound to different source/baseline evidence.' });
      else { compatibilityReview = { sha256: sha256(raw), reviewer: review.reviewer, reviewedAt: review.reviewedAt, scope: review.scope }; findings.push({ status: STATUS.PASS, message: `Compatibility review recorded by ${review.reviewer}.` }); }
    } catch (error) { findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Compatibility review unavailable: ${error.message}` }); }
  }
  const observedHostingBaseline = isObserved(observation) && observation.revision === source.baseRevision && services.every(service => service === 'hosting' || service === 'tooling');
  if (!baselinePath && observedHostingBaseline) findings.push({ status: STATUS.PASS, message: 'Observed Hosting manifest is the verified baseline for this Hosting-only candidate.' });
  else if (!baselinePath && !observation) findings.push({ status: STATUS.UNVERIFIED, message: 'A baseline file or independent provider observation is required.' });
  if (mode === 'hotfix' && (!isObserved(observation) || observation.revision !== source.baseRevision)) findings.push({ status: STATUS.UNVERIFIED, message: 'Hotfix base is not verified against production source.' });
  const hotfixes = [...(isObserved(observation) ? observation.manifest?.hotfixes || [] : []), ...(baseline?.hotfixes || [])];
  for (const hotfix of hotfixes) {
    if (!hotfix.revision) { findings.push({ status: STATUS.REVIEW_REQUIRED, message: `Hotfix ${hotfix.id || 'unknown'} lacks Git/content evidence; filename overlap proves nothing.` }); continue; }
    try {
      const paths = names(git(['diff-tree', '--no-commit-id', '--name-only', '-r', hotfix.baseRevision || `${hotfix.revision}^`, hotfix.revision], cwd));
      const mismatched = paths.filter(file => git(['ls-tree', hotfix.revision, '--', file], cwd) !== git(['ls-tree', source.revision, '--', file], cwd));
      findings.push({ status: mismatched.length ? STATUS.REVIEW_REQUIRED : STATUS.PASS, message: mismatched.length ? `Hotfix ${hotfix.id || hotfix.revision} content differs: review equivalence or regression (${mismatched.join(', ')}).` : `Hotfix ${hotfix.id || hotfix.revision} exact content is present.` });
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
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), mode, source: { ...source, services }, baseline: baseline ? { sha256: baselineFingerprint } : null, observed: isObserved(observation) ? observation : null, compatibilityReview, hotfixes, requiredActions, deploymentOrder, recovery, authorization: 'NOT_AUTHORIZED', execution: 'NOT_EXECUTED', productionEnvFingerprint: productionEnvFingerprint || null, findings, decision, readOnly: true };
}

export const formatReport = result => [`Release assessment: ${result.decision}`, `Mode: ${result.mode}`, `Revision: ${result.source.revision}`, `Branch: ${result.source.branch || 'detached'}`, `Worktree: ${result.source.dirty ? 'DIRTY' : 'clean'}`, `Services: ${result.source.services.join(', ') || 'none identified'}`, ...result.findings.map(finding => `[${finding.status}] ${finding.message}`)].join('\n');
const parseArgs = argv => { const args = { mode: 'release' }; for (let i = 0; i < argv.length; i += 1) { const value = argv[i]; if (value === '--cwd') args.cwd = path.resolve(argv[++i]); else if (value === '--observe-hosting') args.observe = true; else if (value === '--observe-hosting-provider') args.observeProvider = true; else if (value === '--hosting-origin') args.hostingOrigin = argv[++i]; else if (value === '--compatibility-review') args.compatibilityReviewPath = argv[++i]; else if (value === '--mode') args.mode = argv[++i]; else if (value === '--base') args.base = argv[++i]; else if (value === '--baseline') args.baselinePath = argv[++i]; else if (value === '--env-fingerprint') args.productionEnvFingerprint = argv[++i]; else if (value === '--receipt') args.receipt = argv[++i]; else if (value === '--json') args.json = true; else throw new Error(`Unknown argument ${value}`); } return args; };
const receiptPath = async (cwd, value) => { if (!value) return null; const root = path.resolve(cwd, 'tmp', 'release-receipts'); const target = path.resolve(cwd, value); const relative = path.relative(root, target); if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Receipt must be written under tmp/release-receipts.'); for (let cursor = path.dirname(target); ; cursor = path.dirname(cursor)) { try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Receipt directory cannot contain symlinks.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } if (cursor === root) break; if (cursor === path.dirname(cursor)) throw new Error('Receipt path could not be contained under tmp/release-receipts.'); } const repoRelative = path.relative(cwd, target); if (git(['ls-files', '--', repoRelative], cwd).trim()) throw new Error('Receipt path is tracked; choose a generated path.'); try { await access(target); throw new Error('Receipt already exists; choose a new generated path.'); } catch (error) { if (error.message.startsWith('Receipt already exists')) throw error; } return target; };
export async function main(argv = process.argv.slice(2), cwd = repoRoot) { try { const args = parseArgs(argv), result = await assess({ cwd, ...args }), target = await receiptPath(cwd, args.receipt); if (target) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); } console.log(args.json ? JSON.stringify(result, null, 2) : formatReport(result)); return [STATUS.PASS, STATUS.NOT_APPLICABLE].includes(result.decision) ? 0 : 2; } catch (error) { console.error(`[Release assessment failed] ${error.message}`); return 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
