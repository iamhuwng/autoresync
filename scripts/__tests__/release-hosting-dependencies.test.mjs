import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sharedHomeworkInputs } from '../release-check.mjs';
import { canonical } from '../release-listening-evidence.mjs';
import { isHostingDependenciesObserved, observeHostingDependencies, validateHostingDependencies } from '../release-hosting-dependencies.mjs';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function fixture() {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false,
    files: ['database.rules.json', 'src/example.ts'], fingerprint: 'd'.repeat(64) };
  const input = path => ({ path, candidate: 'e'.repeat(40), base: 'e'.repeat(40) });
  const lifecycle = JSON.parse(readFileSync(new URL('../../cloudflare/r2-lifecycle.listening-private.json', import.meta.url), 'utf8'));
  const local = { source, actualSource: structuredClone(source),
    hosting: { revision: source.baseRevision, tree: 'f'.repeat(40), baseTree: 'f'.repeat(40), environment: 'production', fingerprint: '0'.repeat(64), envFingerprint: '1'.repeat(64) },
    envFingerprint: '1'.repeat(64), sharedInputs: [...sharedHomeworkInputs].map(input),
    unchangedPaths: ['.firebaserc', 'firebase.json', 'firestore.indexes.json'].map(input),
    rulesSha256: '2'.repeat(64), firestoreRulesSha256s: ['3'.repeat(64), '4'.repeat(64)], lifecycleSha256: digest(lifecycle) };
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

test('caller-supplied Hosting JSON never reaches native dependency reads or creates trusted evidence', async () => {
  await assert.rejects(observeHostingDependencies({ hostingObservation: { revision: 'a'.repeat(40), readOnly: true } }), /Untrusted Hosting/);
});
