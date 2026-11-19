import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { collectSourceState, hostingImpactPaths, sharedHomeworkInputs } from './release-check.mjs';
import { isObserved } from './release-evidence.mjs';
import { canonical, digest, FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID, PRIVATE_AUDIO_BUCKET_NAME, PRODUCTION_WORKER_NAMES, readProviderState, workerInvariants, CLOUDFLARE_ZONE_ID } from './release-provider-readback.mjs';

const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const unchangedConfig = ['firebase.json', '.firebaserc'];
const qualificationKeys = ['API_KEY', 'HOSTING_SITE', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
const unsupportedPath = file => /^functions\//u.test(file) || /^vite\.config/u.test(file);
export const isHostingDependenciesObserved = value => observations.has(value);

export function selectHostingDependencyScope(files) {
  const workers = new Set();
  for (const file of files) {
    if (/^r2-backup-worker\//u.test(file) || sharedHomeworkInputs.includes(file)) workers.add('r2-backup-worker');
    if (/^cloudflare\/(?:wrangler\.notifications\.jsonc|notification-command-worker\.js|notification-release\/notification-command-|homework-notification\.ts|homework-result-authority\.ts|course-enrollment-approval-(?:handler|route)\.ts)/u.test(file)) workers.add('luyentap-notification-command');
    if (/^cloudflare\/(?:wrangler\.notification-firestore-bridge\.jsonc|notification-firestore-(?:bridge|auth)\.ts|notification-release\/notification-firestore-)/u.test(file)) workers.add('luyentap-notification-firestore-qa');
    if (/^cloudflare\/(?:wrangler\.thcs-gemma\.jsonc|thcs-gemma-worker\.js|src\/ai-gateway\/)/u.test(file)) workers.add('thcs-gemma');
    if (/^cloudflare\/(?:wrangler\.jsonc|worker\.js|src\/upload-worker\/|src\/book-rollout-)/u.test(file)) workers.add('r2-upload-signer');
    if (/^cloudflare\//u.test(file) && !/^cloudflare\/r2-lifecycle\.listening-private\.json$/u.test(file)
      && !/^cloudflare\/(?:__tests__|test|scripts)\//u.test(file) && !/^cloudflare\/vitest[^/]*\.mjs$/u.test(file)
      && !/^cloudflare\/wrangler\.(?:qualification|remote-dev|canary|ticket[^/]*|book-source[^/]*)\.jsonc$/u.test(file)
      && !/^cloudflare\/src\/book-source-worker\//u.test(file)
      && !/^cloudflare\/(?:wrangler\.notifications\.jsonc|notification-command-worker\.js|notification-release\/notification-command-|homework-notification\.ts|homework-result-authority\.ts|course-enrollment-approval-(?:handler|route)\.ts|wrangler\.notification-firestore-bridge\.jsonc|notification-firestore-(?:bridge|auth)\.ts|notification-release\/notification-firestore-|wrangler\.thcs-gemma\.jsonc|thcs-gemma-worker\.js|src\/ai-gateway\/|wrangler\.jsonc|worker\.js|src\/upload-worker\/|src\/book-rollout-)/u.test(file)) {
      workers.add('luyentap-notification-command'); workers.add('luyentap-notification-firestore-qa'); workers.add('r2-upload-signer');
    }
  }
  return { rtdbRules: files.includes('database.rules.json'), rtdbFlags: files.includes('database.rules.json'),
    firestoreRules: files.includes('firestore.rules'), firestoreIndexes: files.includes('firestore.indexes.json'),
    functions: files.some(file => /^functions\//u.test(file)),
    privateAudio: files.includes('cloudflare/r2-lifecycle.listening-private.json') || files.includes('cloudflare/wrangler.jsonc'),
    workers: [...workers].sort(), cloudflareCommon: workers.size > 0 };
}

export const hasHostingDependencyProbes = scope => Boolean(scope?.rtdbRules || scope?.rtdbFlags || scope?.firestoreRules
  || scope?.firestoreIndexes || scope?.functions || scope?.privateAudio || scope?.cloudflareCommon || scope?.workers?.length);

export function reconcileLegacyEnvironment({ productionRaw, envFingerprint, manifestFingerprint, qualification, workflow }) {
  assert.equal(hash(productionRaw), envFingerprint, 'Production environment file differs from the requested identity');
  assert(!/^\s*VITE_FIREBASE_QUALIFICATION_/mu.test(productionRaw), 'Production environment contains qualification inputs');
  const block = 'cat >> "$RUNNER_TEMP/.env.production" <<EOF\n'
    + qualificationKeys.map(key => `VITE_FIREBASE_QUALIFICATION_${key}=$QUALIFICATION_${key}\n`).join('') + 'EOF';
  assert(workflow.split(/\r?\n/u).map(line => line.trim()).join('\n').includes(block), 'Live source does not use the historical combined environment workflow');
  for (const key of qualificationKeys) assert(typeof qualification[key] === 'string' && qualification[key].trim() && !/[\r\n\0]/u.test(qualification[key]), `Historical qualification input unavailable: ${key}`);
  const suffix = qualificationKeys.map(key => `VITE_FIREBASE_QUALIFICATION_${key}=${qualification[key]}\n`).join('');
  assert.equal(hash(productionRaw + suffix), manifestFingerprint, 'Historical build inputs do not reproduce the live environment fingerprint');
  return { kind: 'legacy-combined-input', productionFingerprint: envFingerprint, buildInputFingerprint: manifestFingerprint, qualificationFingerprint: hash(suffix) };
}

const indexKey = index => canonical({ collectionGroup: index.collectionGroup, queryScope: index.queryScope, fields: index.fields });
export function validateHostingIndexes({ base, candidate }, observed) {
  assert.deepEqual(candidate.fieldOverrides || [], base.fieldOverrides || [], 'Changed Firestore field overrides require separate qualification');
  assert(Object.keys(candidate).every(key => ['indexes', 'fieldOverrides'].includes(key)) && Array.isArray(candidate.indexes), 'Unsupported Firestore index configuration');
  for (const index of candidate.indexes) {
    assert(Object.keys(index).every(key => ['collectionGroup', 'queryScope', 'fields'].includes(key)) && typeof index.collectionGroup === 'string'
      && ['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope) && Array.isArray(index.fields) && index.fields.length >= 2, 'Unsupported composite index declaration');
    for (const field of index.fields) assert(typeof field.fieldPath === 'string' && field.fieldPath !== '__name__'
      && Object.keys(field).length === 2 && (['ASCENDING', 'DESCENDING'].includes(field.order) || field.arrayConfig === 'CONTAINS'), 'Unsupported composite index field');
  }
  const added = candidate.indexes.filter(index => !base.indexes.some(previous => indexKey(previous) === indexKey(index)));
  assert(Array.isArray(observed), 'Native Firestore indexes unavailable');
  for (const index of added) assert(observed.some(actual => {
    const fields = [...actual.fields];
    const last = fields.at(-1), defaultOrder = index.fields.filter(field => field.order).at(-1)?.order || 'ASCENDING';
    if (last?.fieldPath === '__name__' && last.order === defaultOrder) fields.pop();
    return actual.state === 'READY' && actual.name?.startsWith(`projects/temp-a1437/databases/(default)/collectionGroups/${index.collectionGroup}/indexes/`)
      && indexKey({ ...index, queryScope: actual.queryScope, fields }) === indexKey(index);
  }), `Required Firestore index is missing or not READY: ${indexKey(index)}`);
}

// Validation is reusable in tests; only native observation can create trusted evidence.
export function validateHostingDependencies(local, provider) {
  const scope = local.scope || selectHostingDependencyScope(local.source.files);
  assert.deepEqual(local.source, local.actualSource, 'Hosting dependency source changed');
  assert.equal(local.source.dirty, false, 'Hosting dependency source is dirty');
  assert.notEqual(local.source.sourceKnown, false, 'Hosting dependency source is unknown');
  for (const key of ['revision', 'tree', 'baseRevision']) assert.match(local.source[key] ?? '', /^[a-f0-9]{40}$/u, `Hosting dependency ${key} unavailable`);
  assert.match(local.source.fingerprint ?? '', /^[a-f0-9]{64}$/u, 'Hosting dependency source fingerprint unavailable');
  assert.notEqual(local.hosting.sourceKnown, false, 'Hosting source provenance unavailable');
  assert.equal(local.hosting.environment, 'production', 'Hosting dependency observation is not production');
  assert.equal(local.hosting.revision, local.source.baseRevision, 'Hosting dependency base differs from live Hosting');
  assert.equal(local.hosting.tree, local.hosting.baseTree, 'Hosting dependency base tree differs from live Hosting');
  assert.match(local.envFingerprint ?? '', /^[a-f0-9]{64}$/u, 'Hosting dependency environment fingerprint unavailable');
  if (local.envFingerprint !== local.hosting.envFingerprint) {
    assert.equal(local.environmentBinding?.kind, 'legacy-combined-input', 'Hosting dependency environment changed');
    assert.equal(local.environmentBinding.productionFingerprint, local.envFingerprint, 'Reconciled production environment differs');
    assert.equal(local.environmentBinding.buildInputFingerprint, local.hosting.envFingerprint, 'Reconciled build inputs differ');
    assert.match(local.environmentBinding.qualificationFingerprint, /^[a-f0-9]{64}$/u, 'Reconciled qualification identity unavailable');
  }
  assert.deepEqual(local.sharedInputs.map(input => input.path).sort(), [...sharedHomeworkInputs].sort(), 'Hosting shared input inventory changed');
  assert.deepEqual(local.unchangedPaths.map(input => input.path).sort(), [...new Set([...unchangedConfig, ...local.source.files.filter(unsupportedPath)])].sort(), 'Hosting configuration inventory changed');
  for (const input of [...local.sharedInputs, ...local.unchangedPaths]) {
    assert.match(input.candidate ?? '', /^[a-f0-9]{40}$/u, `Hosting dependency input unavailable: ${input.path}`);
    assert.equal(input.candidate, input.base, `Hosting dependency input changed: ${input.path}`);
  }
  if (scope.rtdbRules) assert.equal(provider.rulesSha256, local.rulesSha256, 'Hosting active RTDB rules differ from candidate');
  if (scope.firestoreRules) {
    assert(local.firestoreRulesSha256s.includes(provider.firestoreRules?.sourceSha256), 'Hosting active Firestore rules differ from candidate');
    assert.equal(provider.firestoreRules?.release?.name, `projects/${FIREBASE_PROJECT_ID}/releases/cloud.firestore`, 'Hosting Firestore project changed');
  }
  if (scope.firestoreIndexes) validateHostingIndexes(local.indexes, provider.firestoreIndexes);
  validateHostingInfrastructure(provider, { scope, lifecycleSha256: local.lifecycleSha256 });
}

export function validateHostingInfrastructure(provider, { scope, lifecycleSha256 } = {}) {
  scope ||= { rtdbRules: true, rtdbFlags: true, firestoreRules: true, firestoreIndexes: true, functions: true,
    privateAudio: true, workers: [...PRODUCTION_WORKER_NAMES], cloudflareCommon: true };
  if (scope.cloudflareCommon) {
    assert.equal(provider.common?.accountSubdomain?.subdomain, 'iamhuwng', 'Hosting account subdomain changed');
    assert.deepEqual(provider.common?.domains, [], 'Hosting custom domains changed');
    assert.deepEqual(provider.common?.routes, [], 'Hosting routes changed');
    assert.deepEqual(provider.common?.zones, [CLOUDFLARE_ZONE_ID], 'Hosting zone inventory changed');
  }
  if (scope.functions) assert.deepEqual(provider.functions, [], 'Hosting dependency Functions inventory changed');
  if (scope.rtdbFlags) {
    assert.equal(provider.writesEnabled, true, 'Hosting dependency authoring writes are disabled');
    assert(provider.restore === null || provider.restore === false || provider.restore?.active === false, 'Hosting dependency restore is active or ambiguous');
  }
  if (scope.privateAudio) {
    const bucket = provider.privateAudioBucket;
    assert.equal(bucket?.bucketName, PRIVATE_AUDIO_BUCKET_NAME, 'Hosting private audio bucket changed');
    assert.equal(bucket.managedDomain?.enabled, false, 'Hosting private audio bucket is public or unavailable');
    assert.deepEqual(bucket.customDomains?.domains, [], 'Hosting private audio custom domains changed');
    assert.equal(digest(bucket.lifecycle), lifecycleSha256, 'Hosting private audio lifecycle changed');
  }
  if (scope.workers?.length) {
    assert.deepEqual(Object.keys(provider.workers || {}).sort(), [...scope.workers].sort(), 'Hosting dependency Worker inventory changed');
  }
  for (const name of scope.workers || []) {
    const worker = provider.workers?.[name];
    assert(worker, `Hosting ${name} state unavailable`);
    assert.equal(typeof worker.versionId, 'string', `Hosting ${name} version unavailable`);
    assert(worker.versionId, `Hosting ${name} version unavailable`);
    assert.deepEqual(worker.deployment, worker.deploymentAfter, `Hosting ${name} deployment changed`);
    assert.deepEqual(worker.deployment.versions, [{ version_id: worker.versionId, percentage: 100 }], `Hosting ${name} traffic is split`);
    assert.deepEqual(worker.settings.bindings, worker.bindings, `Hosting ${name} effective bindings changed`);
    assert(worker.modules?.length > 0, `Hosting ${name} modules unavailable`);
    for (const module of worker.modules) {
      assert.match(module.name ?? '', /\.(m?js)$/u, `Hosting ${name} module type changed`);
      assert.match(module.sha256 ?? '', /^[a-f0-9]{64}$/u, `Hosting ${name} module hash unavailable`);
    }
    const vars = Object.fromEntries(worker.bindings.filter(binding => binding.type === 'plain_text').map(binding => [binding.name, binding.text]));
    if (name === 'luyentap-notification-firestore-qa') {
      assert.equal(vars.FIREBASE_PROJECT_ID, undefined, 'Hosting adapter Firebase project changed');
      assert.equal(vars.FIREBASE_DB_URL, undefined, 'Hosting adapter Firebase database changed');
    } else {
      assert.equal(vars.FIREBASE_PROJECT_ID, FIREBASE_PROJECT_ID, `Hosting ${name} Firebase project changed`);
      assert.equal(vars.FIREBASE_DB_URL, FIREBASE_DATABASE_URL, `Hosting ${name} Firebase database changed`);
    }
    for (const [key, value] of Object.entries(vars)) if (/EMULATOR/iu.test(key)) {
      assert(key === 'LOCAL_EMULATOR_AUTH' && value === 'false', `Hosting ${name} emulator is enabled or configured`);
    }
  }
}

// Health checks never create a trusted dependency observation or a release fingerprint.
export async function checkHostingDependencyHealth(cwd) {
  const diagnostics = [];
  try {
    const provider = await readProviderState(cwd, { hosting: true, rtdbRules: true, rtdbFlags: true,
      firestoreRules: true, firestoreIndexes: true, functions: true, workers: [...PRODUCTION_WORKER_NAMES], cloudflareCommon: true, privateAudio: true,
      onDiagnostic: message => diagnostics.push(message) });
    validateHostingInfrastructure(provider, { scope: { rtdbRules: true, rtdbFlags: true, firestoreRules: true, firestoreIndexes: true, functions: true, workers: [...PRODUCTION_WORKER_NAMES], cloudflareCommon: true, privateAudio: true }, lifecycleSha256: digest(JSON.parse(await readFile(path.join(cwd, 'cloudflare/r2-lifecycle.listening-private.json'), 'utf8'))) });
    return { readOnly: true, authorization: 'NOT_AUTHORIZED', status: 'HEALTHY', diagnostics };
  } catch (error) {
    return { readOnly: true, authorization: 'NOT_AUTHORIZED', status: 'UNVERIFIED', diagnostics: [...diagnostics, error.message] };
  }
}

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert(!result.error && result.status === 0, `Hosting dependency Git read failed: ${args[0]}`);
  return result.stdout.trim();
};

async function readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile) {
  const actualSource = await collectSourceState(cwd, source.baseRevision);
  const impactPaths = hostingImpactPaths(cwd, actualSource);
  const scope = selectHostingDependencyScope(impactPaths);
  const input = file => ({ path: file, candidate: git(cwd, ['rev-parse', '--verify', `${actualSource.revision}:${file}`]), base: git(cwd, ['rev-parse', '--verify', `${actualSource.baseRevision}:${file}`]) });
  let environmentBinding = { kind: 'exact', productionFingerprint: envFingerprint, buildInputFingerprint: envFingerprint };
  if (envFingerprint !== hostingObservation.manifest.envFingerprint) {
    let qualification = Object.fromEntries(qualificationKeys.map(key => [key, process.env[`LUYENTAP_QUALIFICATION_FIREBASE_${key}`]]));
    if (Object.values(qualification).every(value => !value) && process.env.GITHUB_ACTIONS !== 'true') {
      const result = spawnSync('gh', ['api', 'repos/iamhuwng/autoresync/actions/variables', '--paginate', '--slurp'], { encoding: 'utf8', windowsHide: true });
      assert(result.status === 0, 'Historical qualification variables could not be read');
      const variables = Object.fromEntries(JSON.parse(result.stdout).flatMap(page => page.variables).map(variable => [variable.name, variable.value]));
      qualification = Object.fromEntries(qualificationKeys.map(key => [key, variables[`LUYENTAP_QUALIFICATION_FIREBASE_${key}`]]));
    }
    environmentBinding = reconcileLegacyEnvironment({ productionRaw: await readFile(path.resolve(productionEnvFile || process.env.LUYENTAP_PRODUCTION_ENV_FILE || path.join(os.homedir(), '.luyentap/env/.env.production')), 'utf8'),
      envFingerprint, manifestFingerprint: hostingObservation.manifest.envFingerprint, qualification,
      workflow: git(cwd, ['show', `${hostingObservation.revision}:.github/workflows/release-promotion-phase3.yml`]) });
  }
  const firestore = scope.firestoreRules ? (await readFile(path.join(cwd, 'firestore.rules'), 'utf8')).replace(/\r\n/gu, '\n') : null;
  return { source, actualSource, hosting: { revision: hostingObservation.revision, tree: hostingObservation.tree,
    sourceKnown: hostingObservation.sourceKnown, environment: hostingObservation.manifest.environment, fingerprint: hostingObservation.fingerprint,
    baseTree: git(cwd, ['rev-parse', `${actualSource.baseRevision}^{tree}`]), envFingerprint: hostingObservation.manifest.envFingerprint },
  envFingerprint, environmentBinding, sharedInputs: [...sharedHomeworkInputs].map(input),
  ...(scope.firestoreIndexes ? { indexes: {
    base: JSON.parse(git(cwd, ['show', `${actualSource.baseRevision}:firestore.indexes.json`])),
    candidate: JSON.parse(await readFile(path.join(cwd, 'firestore.indexes.json'), 'utf8')),
  } } : {}),
  unchangedPaths: [...new Set([...unchangedConfig, ...actualSource.files.filter(unsupportedPath)])].sort().map(input),
  scope, impactPaths,
  ...(scope.rtdbRules ? { rulesSha256: digest(JSON.parse(await readFile(path.join(cwd, 'database.rules.json'), 'utf8'))) } : {}),
  ...(scope.firestoreRules ? { firestoreRulesSha256s: [hash(firestore), hash(firestore.replace(/\n/gu, '\r\n'))] } : {}),
  ...(scope.privateAudio ? { lifecycleSha256: digest(JSON.parse(await readFile(path.join(cwd, 'cloudflare/r2-lifecycle.listening-private.json'), 'utf8'))) } : {}) };
}

export async function observeHostingDependencies({ cwd, source, hostingObservation, envFingerprint, productionEnvFile } = {}) {
  assert(isObserved(hostingObservation), 'Untrusted Hosting observation rejected');
  const local = await readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile);
  const provider = await readProviderState(cwd, { hosting: true, ...local.scope });
  validateHostingDependencies(local, provider);
  assert.deepEqual(await readProviderState(cwd, { hosting: true, ...local.scope }), provider, 'Hosting dependencies changed during observation');
  assert.deepEqual(await readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile), local, 'Hosting dependency source changed during observation');
  const providerFingerprint = digest(provider);
  const observation = freeze({ schemaVersion: 1, scope: 'hosting-dependencies', source: structuredClone(source),
    envFingerprint, environmentBinding: local.environmentBinding, hostingFingerprint: hostingObservation.fingerprint, providerFingerprint,
    fingerprint: digest({ sourceFingerprint: source.fingerprint, envFingerprint, hostingFingerprint: hostingObservation.fingerprint, providerFingerprint }),
    services: {
      ...(provider.rulesSha256 ? { rtdb: { sha256: provider.rulesSha256 } } : {}),
      ...(provider.firestoreRules ? { firestore: provider.firestoreRules } : {}),
      ...(provider.firestoreIndexes ? { firestoreIndexes: provider.firestoreIndexes } : {}),
      ...(provider.workers ? { workers: Object.fromEntries(Object.entries(provider.workers).map(([name, worker]) => [name, {
        versionId: worker.versionId, modules: worker.modules, invariantSha256: digest(workerInvariants(worker)), sourceKnown: false,
      }])) } : {}),
      ...(provider.privateAudioBucket ? { privateAudio: { bucketName: provider.privateAudioBucket.bucketName, lifecycleSha256: local.lifecycleSha256 } } : {}),
      ...(provider.common ? { common: provider.common } : {}), ...(provider.functions ? { functions: provider.functions } : {}),
    }, observedScope: local.scope,
    observedAt: new Date().toISOString(), readOnly: true, authorization: 'NOT_AUTHORIZED', workerDeploymentReady: false,
    limitation: 'Active backend dependencies observed for Hosting compatibility review only; candidate Worker equivalence and deployment readiness are unverified.' });
  observations.add(observation);
  return observation;
}
