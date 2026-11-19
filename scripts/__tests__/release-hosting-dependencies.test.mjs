import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sharedHomeworkInputs } from '../release-check.mjs';
import { assertHostingFederation, canonical, PRODUCTION_WORKER_NAMES } from '../release-provider-readback.mjs';
import { isHostingDependenciesObserved, observeHostingDependencies, selectHostingDependencyScope, validateHostingDependencies, reconcileLegacyEnvironment, validateHostingIndexes } from '../release-hosting-dependencies.mjs';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

test('Hosting readback accepts the configured Google federation and rejects a different identity', () => {
  const account = 'release-reader@temp-a1437.iam.gserviceaccount.com';
  const provider = 'projects/123456/locations/global/workloadIdentityPools/github/providers/releases';
  const config = {
    type: 'external_account',
    audience: `//iam.googleapis.com/${provider}`,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
  };
  assert.doesNotThrow(() => assertHostingFederation(config, account, provider));
  assert.throws(() => assertHostingFederation(config, undefined, provider), /service account is missing/u);
  assert.throws(() => assertHostingFederation(config, account, undefined), /provider is missing/u);
  assert.throws(() => assertHostingFederation({ ...config, type: 'service_account' }, account, provider), /requires Google workload identity federation/u);
  assert.throws(() => assertHostingFederation(config, account, provider + '-other'), /provider changed/u);
  assert.throws(() => assertHostingFederation(config, 'other@temp-a1437.iam.gserviceaccount.com', provider), /service account changed/u);
  assert.throws(() => assertHostingFederation(config, 'release-reader@another-project.iam.gserviceaccount.com', provider), /another project/u);
});

test('Hosting dependency scope selects only affected backend probes', () => {
  assert.deepEqual(selectHostingDependencyScope(['src/App.tsx']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: false, workers: [], cloudflareCommon: false,
  });
  assert.deepEqual(selectHostingDependencyScope(['database.rules.json', 'firestore.rules', 'firestore.indexes.json', 'functions/src/index.ts']), {
    rtdbRules: true, rtdbFlags: true, firestoreRules: true, firestoreIndexes: true, functions: true,
    privateAudio: false, workers: [], cloudflareCommon: false,
  });
  assert.deepEqual(selectHostingDependencyScope(['cloudflare/src/upload-worker/index.ts', 'cloudflare/test/fixture.ts']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: false, workers: ['r2-upload-signer'], cloudflareCommon: true,
  });
  assert.deepEqual(selectHostingDependencyScope([sharedHomeworkInputs[0]]), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: true,
    privateAudio: false, workers: ['r2-backup-worker'], cloudflareCommon: true,
  });
  assert.deepEqual(selectHostingDependencyScope(['src/services/reading-v2/readingV2AnswerScoring.ts']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: false, workers: ['r2-backup-worker'], cloudflareCommon: true,
  });
  assert.deepEqual(selectHostingDependencyScope(['r2-backup-worker/src/index.ts']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: false, workers: ['r2-backup-worker'], cloudflareCommon: true,
  });
  assert.deepEqual(selectHostingDependencyScope(['cloudflare/notification-command-worker.js']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: false, workers: ['luyentap-notification-command'], cloudflareCommon: true,
  });
  assert.deepEqual(selectHostingDependencyScope(['cloudflare/r2-lifecycle.listening-private.json']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: true, workers: [], cloudflareCommon: false,
  });
  assert.deepEqual(selectHostingDependencyScope(['cloudflare/wrangler.jsonc']), {
    rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false,
    privateAudio: true, workers: ['r2-upload-signer'], cloudflareCommon: true,
  });
});

function fixture() {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false,
    files: ['database.rules.json', 'src/example.ts'], fingerprint: 'd'.repeat(64) };
  const input = path => ({ path, candidate: 'e'.repeat(40), base: 'e'.repeat(40) });
  const lifecycle = JSON.parse(readFileSync(new URL('../../cloudflare/r2-lifecycle.listening-private.json', import.meta.url), 'utf8'));
  const local = { source, actualSource: structuredClone(source),
    hosting: { revision: source.baseRevision, tree: 'f'.repeat(40), baseTree: 'f'.repeat(40), environment: 'production', fingerprint: '0'.repeat(64), envFingerprint: '1'.repeat(64) },
    envFingerprint: '1'.repeat(64), sharedInputs: [...sharedHomeworkInputs].map(input),
    unchangedPaths: ['.firebaserc', 'firebase.json'].map(input),
    rulesSha256: '2'.repeat(64), firestoreRulesSha256s: ['3'.repeat(64), '4'.repeat(64)], lifecycleSha256: digest(lifecycle),
    scope: { rtdbRules: true, rtdbFlags: true, firestoreRules: true, firestoreIndexes: false, functions: true, privateAudio: true, workers: [...PRODUCTION_WORKER_NAMES], cloudflareCommon: true } };
  const provider = { rulesSha256: local.rulesSha256,
    firestoreRules: { release: { name: 'projects/temp-a1437/releases/cloud.firestore' }, sourceSha256: '3'.repeat(64) },
    common: { accountSubdomain: { subdomain: 'iamhuwng' }, domains: [], zones: ['1aae6fb9889672cf695927eb575a5bbe'], routes: [] },
    functions: [], writesEnabled: true, restore: null,
    privateAudioBucket: { bucketName: 'luyentap-listening-audio-private', managedDomain: { enabled: false }, customDomains: { domains: [] }, lifecycle }, workers: {} };
  for (const name of ['r2-upload-signer', 'r2-backup-worker', 'luyentap-notification-command', 'luyentap-notification-firestore-qa']) {
    const bindings = name === 'luyentap-notification-firestore-qa' ? [] : [
      { name: 'FIREBASE_PROJECT_ID', text: 'temp-a1437', type: 'plain_text' },
      { name: 'FIREBASE_DB_URL', text: 'https://temp-a1437-default-rtdb.firebaseio.com', type: 'plain_text' },
    ];
    const deployment = { versions: [{ version_id: 'active-version', percentage: 100 }] };
    provider.workers[name] = { versionId: 'active-version', bindings, settings: { bindings: structuredClone(bindings) },
      deployment, deploymentAfter: structuredClone(deployment), modules: [{ name: 'index.js', sha256: '5'.repeat(64) }] };
  }
  return { local, provider };
}

test('Hosting dependency validation accepts active dependencies without claiming candidate Worker equivalence', () => {
  const { local, provider } = fixture();
  validateHostingDependencies(local, provider);
  provider.firestoreRules.sourceSha256 = local.firestoreRulesSha256s[1];
  validateHostingDependencies(local, provider);
  provider.workers['r2-backup-worker'].modules[0].sha256 = '6'.repeat(64);
  validateHostingDependencies(local, provider);
  const worker = provider.workers['r2-backup-worker'];
  worker.bindings.push({ name: 'LOCAL_EMULATOR_AUTH', type: 'plain_text', text: 'false' });
  worker.settings.bindings = structuredClone(worker.bindings);
  validateHostingDependencies(local, provider);
  assert.equal(isHostingDependenciesObserved(provider), false);
  assert.equal(isHostingDependenciesObserved({ scope: 'hosting-dependencies', readOnly: true }), false);
});

test('Hosting dependency validation rejects source, environment, rules and unsupported interface changes', () => {
  for (const mutate of [
    ({ local }) => { local.actualSource.revision = 'f'.repeat(40); },
    ({ local }) => { local.source.dirty = local.actualSource.dirty = true; },
    ({ local }) => { local.hosting.sourceKnown = false; },
    ({ local }) => { local.hosting.environment = 'acceptance'; },
    ({ local }) => { local.hosting.revision = 'f'.repeat(40); },
    ({ local }) => { local.hosting.baseTree = '0'.repeat(40); },
    ({ local }) => { local.envFingerprint = '0'.repeat(64); },
    ({ local }) => { local.sharedInputs.pop(); },
    ({ local }) => { local.sharedInputs[0].candidate = '0'.repeat(40); },
    ({ local }) => { local.unchangedPaths[0].candidate = '0'.repeat(40); },
    ({ local }) => { local.source.files.push('functions/src/new.ts'); local.actualSource.files.push('functions/src/new.ts'); },
    ({ provider }) => { provider.rulesSha256 = '0'.repeat(64); },
    ({ provider }) => { provider.firestoreRules.sourceSha256 = '0'.repeat(64); },
  ]) {
    const values = fixture(); mutate(values);
    assert.throws(() => validateHostingDependencies(values.local, values.provider));
  }
});

test('Hosting dependency validation rejects provider configuration, storage and service drift', () => {
  for (const mutate of [
    p => { p.common.routes.push({ pattern: 'other.invalid/*' }); },
    p => { p.functions.push({ name: 'new-function' }); },
    p => { p.restore = {}; },
    p => { p.restore = { active: true }; },
    p => { p.writesEnabled = false; },
    p => { p.privateAudioBucket.managedDomain.enabled = true; },
    p => { p.privateAudioBucket.customDomains.domains.push('public.invalid'); },
    p => { p.privateAudioBucket.lifecycle = {}; },
    p => { p.workers.foreign = {}; },
    p => { p.workers['r2-backup-worker'].deployment.versions[0].percentage = 50; },
    p => { p.workers['r2-backup-worker'].deploymentAfter.versions[0].version_id = 'new'; },
    p => { p.workers['r2-upload-signer'].settings.bindings.pop(); },
    p => { const w = p.workers['r2-upload-signer']; w.bindings[0].text = 'other-project'; w.settings.bindings = structuredClone(w.bindings); },
    p => { const w = p.workers['r2-upload-signer']; w.bindings.push({ name: 'FIREBASE_AUTH_EMULATOR_HOST', type: 'plain_text', text: 'localhost:9099' }); w.settings.bindings = structuredClone(w.bindings); },
    p => { p.workers['r2-backup-worker'].modules = []; },
  ]) {
    const { local, provider } = fixture(); mutate(provider);
    assert.throws(() => validateHostingDependencies(local, provider));
  }
});

test('scoped Hosting validation ignores unrelated provider state and rejects scoped drift', () => {
  const { local, provider } = fixture();
  local.scope = { rtdbRules: true, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false, privateAudio: false, workers: [], cloudflareCommon: false };
  delete local.firestoreRulesSha256s;
  delete local.lifecycleSha256;
  const rules = provider.rulesSha256;
  provider.firestoreRules.sourceSha256 = '0'.repeat(64);
  provider.functions.push({ name: 'ignored' });
  assert.doesNotThrow(() => validateHostingDependencies(local, provider));
  provider.rulesSha256 = '0'.repeat(64);
  assert.throws(() => validateHostingDependencies(local, provider), /RTDB rules/u);
  provider.rulesSha256 = rules;
  local.scope = { rtdbRules: false, rtdbFlags: false, firestoreRules: false, firestoreIndexes: false, functions: false, privateAudio: false, workers: ['r2-upload-signer'], cloudflareCommon: true };
  provider.workers = { 'r2-upload-signer': provider.workers['r2-upload-signer'] };
  assert.doesNotThrow(() => validateHostingDependencies(local, provider));
  provider.common.routes.push({ pattern: 'drift.invalid/*' });
  assert.throws(() => validateHostingDependencies(local, provider), /routes/u);
});

test('caller-supplied Hosting JSON never reaches native dependency reads or creates trusted evidence', async () => {
  await assert.rejects(observeHostingDependencies({ hostingObservation: { revision: 'a'.repeat(40), readOnly: true } }), /Untrusted Hosting/);
});

test('historical combined fingerprint requires exact production bytes, QA suffix and live workflow', () => {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const keys = ['API_KEY', 'HOSTING_SITE', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
  const qualification = Object.fromEntries(keys.map(key => [key, 'fixture-' + key]));
  const productionRaw = 'VITE_FIREBASE_PROJECT_ID=production\n';
  const workflow = 'cat >> "$RUNNER_TEMP/.env.production" <<EOF\n' + keys.map(key => `VITE_FIREBASE_QUALIFICATION_${key}=$QUALIFICATION_${key}\n`).join('') + 'EOF';
  const suffix = keys.map(key => `VITE_FIREBASE_QUALIFICATION_${key}=${qualification[key]}\n`).join('');
  const options = { productionRaw, qualification, workflow, envFingerprint: hash(productionRaw), manifestFingerprint: hash(productionRaw + suffix) };
  const binding = reconcileLegacyEnvironment(options);
  const { local, provider } = fixture();
  local.envFingerprint = binding.productionFingerprint; local.hosting.envFingerprint = binding.buildInputFingerprint; local.environmentBinding = binding;
  validateHostingDependencies(local, provider);
  for (const change of [
    { productionRaw: productionRaw + 'VITE_CHANGED=true\n' },
    { manifestFingerprint: 'a'.repeat(64) },
    { qualification: { ...qualification, API_KEY: 'changed' } },
    { qualification: {} },
    { workflow: workflow.replace('cat >>', 'cat >') },
  ]) assert.throws(() => reconcileLegacyEnvironment({ ...options, ...change }));
  local.environmentBinding.productionFingerprint = 'f'.repeat(64);
  assert.throws(() => validateHostingDependencies(local, provider), /production environment differs/u);
});

test('Hosting index qualification checks added requirements against native READY indexes without deleting extras', () => {
  const existing = { collectionGroup: 'existing', queryScope: 'COLLECTION', fields: [{ fieldPath: 'userId', order: 'ASCENDING' }, { fieldPath: 'time', order: 'DESCENDING' }] };
  const added = { ...existing, collectionGroup: 'new' };
  const config = { base: { indexes: [existing] }, candidate: { indexes: [existing, added] } };
  const actual = { name: 'projects/temp-a1437/databases/(default)/collectionGroups/new/indexes/native', queryScope: 'COLLECTION', state: 'READY', fields: [...added.fields, { fieldPath: '__name__', order: 'DESCENDING' }] };
  validateHostingIndexes(config, [actual]);
  validateHostingIndexes({ ...config, candidate: { indexes: [added] } }, [actual]);
  for (const indexes of [[], [{ ...actual, state: 'CREATING' }], [{ ...actual, queryScope: 'COLLECTION_GROUP' }], [{ ...actual, name: actual.name.replace('temp-a1437', 'foreign') }], [{ ...actual, fields: [...added.fields, { fieldPath: '__name__', order: 'ASCENDING' }] }]]) assert.throws(() => validateHostingIndexes(config, indexes), /missing or not READY/u);
  assert.throws(() => validateHostingIndexes({ ...config, candidate: { ...config.candidate, fieldOverrides: [{ collectionGroup: 'new' }] } }, [actual]), /field overrides/u);
  assert.throws(() => validateHostingIndexes({ ...config, candidate: { indexes: [{ ...added, fields: [{ fieldPath: 'single', order: 'ASCENDING' }] }] } }, [actual]), /Unsupported/u);
});
