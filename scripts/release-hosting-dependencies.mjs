import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { collectSourceState, sharedHomeworkInputs } from './release-check.mjs';
import { isObserved } from './release-evidence.mjs';
import { canonical, readListeningProvider, workerInvariants } from './release-listening-evidence.mjs';
import { reviewedListeningPreviewRelease as pins } from './release-listening-preview-pins.mjs';

const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(canonical(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const workerNames = ['luyentap-notification-command', 'luyentap-notification-firestore-qa', 'r2-backup-worker', 'r2-upload-signer'];
const unchangedConfig = ['firebase.json', '.firebaserc'];
const qualificationKeys = ['API_KEY', 'HOSTING_SITE', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
const unsupportedPath = file => /^functions\//u.test(file) || /^vite\.config/u.test(file);
export const isHostingDependenciesObserved = value => observations.has(value);

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
  if (local.indexes) validateHostingIndexes(local.indexes, provider.firestoreIndexes);
  assert.equal(provider.rulesSha256, local.rulesSha256, 'Hosting active RTDB rules differ from candidate');
  assert(local.firestoreRulesSha256s.includes(provider.firestoreRules?.sourceSha256), 'Hosting active Firestore rules differ from candidate');
  assert.equal(provider.firestoreRules?.release?.name, 'projects/temp-a1437/releases/cloud.firestore', 'Hosting Firestore project changed');
  assert.equal(digest(provider.common), pins.commonSha256, 'Hosting dependency routing or account changed');
  assert.deepEqual(provider.functions, [], 'Hosting dependency Functions inventory changed');
  assert.equal(provider.writesEnabled, true, 'Hosting dependency authoring writes are disabled');
  assert(provider.restore === null || provider.restore === false || provider.restore?.active === false, 'Hosting dependency restore is active or ambiguous');
  const bucket = provider.privateAudioBucket;
  assert.equal(bucket?.bucketName, pins.privateAudio.bucketName, 'Hosting private audio bucket changed');
  assert.equal(bucket.managedDomain?.enabled, false, 'Hosting private audio bucket is public or unavailable');
  assert.deepEqual(bucket.customDomains?.domains, [], 'Hosting private audio custom domains changed');
  assert.equal(local.lifecycleSha256, pins.privateAudio.lifecycleSha256, 'Hosting private audio lifecycle source changed');
  assert.equal(digest(bucket.lifecycle), local.lifecycleSha256, 'Hosting private audio lifecycle changed');
  assert.deepEqual(Object.keys(provider.workers).sort(), workerNames, 'Hosting dependency Worker inventory changed');
  for (const [name, worker] of Object.entries(provider.workers)) {
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
      assert.equal(vars.FIREBASE_PROJECT_ID, 'temp-a1437', `Hosting ${name} Firebase project changed`);
      assert.equal(vars.FIREBASE_DB_URL, 'https://temp-a1437-default-rtdb.firebaseio.com', `Hosting ${name} Firebase database changed`);
    }
    for (const [key, value] of Object.entries(vars)) if (/EMULATOR/iu.test(key)) {
      assert(key === 'LOCAL_EMULATOR_AUTH' && value === 'false', `Hosting ${name} emulator is enabled or configured`);
    }
  }
}

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert(!result.error && result.status === 0, `Hosting dependency Git read failed: ${args[0]}`);
  return result.stdout.trim();
};

async function readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile) {
  const actualSource = await collectSourceState(cwd, source.baseRevision);
  const input = file => ({ path: file, candidate: git(cwd, ['rev-parse', '--verify', `${actualSource.revision}:${file}`]), base: git(cwd, ['rev-parse', '--verify', `${actualSource.baseRevision}:${file}`]) });
  const firestore = (await readFile(path.join(cwd, 'firestore.rules'), 'utf8')).replace(/\r\n/gu, '\n');
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
  const indexesChanged = input('firestore.indexes.json');
  return { source, actualSource, hosting: { revision: hostingObservation.revision, tree: hostingObservation.tree,
    sourceKnown: hostingObservation.sourceKnown, environment: hostingObservation.manifest.environment, fingerprint: hostingObservation.fingerprint,
    baseTree: git(cwd, ['rev-parse', `${actualSource.baseRevision}^{tree}`]), envFingerprint: hostingObservation.manifest.envFingerprint },
  envFingerprint, environmentBinding, sharedInputs: [...sharedHomeworkInputs].map(input),
  ...(indexesChanged.candidate !== indexesChanged.base ? { indexes: {
    base: JSON.parse(git(cwd, ['show', `${actualSource.baseRevision}:firestore.indexes.json`])),
    candidate: JSON.parse(await readFile(path.join(cwd, 'firestore.indexes.json'), 'utf8')),
  } } : {}),
  unchangedPaths: [...new Set([...unchangedConfig, ...actualSource.files.filter(unsupportedPath)])].sort().map(input),
  rulesSha256: digest(JSON.parse(await readFile(path.join(cwd, 'database.rules.json'), 'utf8'))),
  firestoreRulesSha256s: [hash(firestore), hash(firestore.replace(/\n/gu, '\r\n'))],
  lifecycleSha256: digest(JSON.parse(await readFile(path.join(cwd, 'cloudflare/r2-lifecycle.listening-private.json'), 'utf8'))) };
}

export async function observeHostingDependencies({ cwd, source, hostingObservation, envFingerprint, productionEnvFile } = {}) {
  assert(isObserved(hostingObservation), 'Untrusted Hosting observation rejected');
  const local = await readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile);
  const options = { firestore: true, privateAudio: true, firestoreIndexes: Boolean(local.indexes), hosting: true };
  const provider = await readListeningProvider(cwd, options);
  validateHostingDependencies(local, provider);
  assert.deepEqual(await readListeningProvider(cwd, options), provider, 'Hosting dependencies changed during observation');
  assert.deepEqual(await readLocal(cwd, source, hostingObservation, envFingerprint, productionEnvFile), local, 'Hosting dependency source changed during observation');
  const providerFingerprint = digest(provider);
  const observation = freeze({ schemaVersion: 1, scope: 'hosting-dependencies', source: structuredClone(source),
    envFingerprint, environmentBinding: local.environmentBinding, hostingFingerprint: hostingObservation.fingerprint, providerFingerprint,
    fingerprint: digest({ sourceFingerprint: source.fingerprint, envFingerprint, hostingFingerprint: hostingObservation.fingerprint, providerFingerprint }),
    services: { rtdb: { sha256: provider.rulesSha256 }, firestore: provider.firestoreRules, ...(provider.firestoreIndexes ? { firestoreIndexes: provider.firestoreIndexes } : {}),
      workers: Object.fromEntries(Object.entries(provider.workers).map(([name, worker]) => [name, {
        versionId: worker.versionId, modules: worker.modules, invariantSha256: digest(workerInvariants(worker)), sourceKnown: false,
      }])), privateAudio: { bucketName: provider.privateAudioBucket.bucketName, lifecycleSha256: local.lifecycleSha256 } },
    observedAt: new Date().toISOString(), readOnly: true, authorization: 'NOT_AUTHORIZED', workerDeploymentReady: false,
    limitation: 'Active backend dependencies observed for Hosting compatibility review only; candidate Worker equivalence and deployment readiness are unverified.' });
  observations.add(observation);
  return observation;
}
