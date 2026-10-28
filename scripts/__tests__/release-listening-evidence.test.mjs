import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assess } from '../release-check.mjs';
import { canonical, workerInvariants, validateListeningEvidence, assertListeningSource, isListeningReleaseObserved, validateFirestoreRulesReadback } from '../release-listening-evidence.mjs';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

test('Firestore readback hashes exact source bytes and rejects changed release or source inventory', () => {
  const release = { name: 'projects/temp-a1437/releases/cloud.firestore', rulesetName: 'projects/temp-a1437/rulesets/reviewed-id', updateTime: '2026-10-27T00:00:00Z' };
  const ruleset = { name: release.rulesetName, metadata: { services: ['cloud.firestore'] }, source: { files: [{ name: 'firestore.rules', content: 'rules_version = "2";\r\nservice cloud.firestore {}\n' }] } };
  const expectedHash = createHash('sha256').update(ruleset.source.files[0].content).digest('hex');
  assert.equal(validateFirestoreRulesReadback(release, ruleset, structuredClone(release)).sourceSha256, expectedHash);
  const alteredLineEndings = structuredClone(ruleset);
  alteredLineEndings.source.files[0].content = alteredLineEndings.source.files[0].content.replace('\r\n', '\n');
  assert.notEqual(validateFirestoreRulesReadback(release, alteredLineEndings, release).sourceSha256, expectedHash);
  for (const mutate of [
    value => { value.releaseAfter.updateTime = 'later'; },
    value => { value.release.name = 'projects/other/releases/cloud.firestore'; },
    value => { value.release.rulesetName = 'projects/other/rulesets/id'; },
    value => { value.ruleset.name = 'projects/temp-a1437/rulesets/other'; },
    value => { value.ruleset.metadata.services = ['firebase.storage']; },
    value => { value.ruleset.source.files.push({ name: 'other.rules', content: '' }); },
    value => { value.ruleset.source.files[0].name = 'other.rules'; },
    value => { delete value.ruleset.source.files[0].content; },
  ]) {
    const value = structuredClone({ release, ruleset, releaseAfter: structuredClone(release) }); mutate(value);
    assert.throws(() => validateFirestoreRulesReadback(value.release, value.ruleset, value.releaseAfter));
  }
});

function fixture(phase = 'predeploy') {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false, files: ['database.rules.json'] };
  const ruleTree = value => ({ rules: { homework_test_access: { $testId: { $studentId: { $homeworkId: { '.validate': value } } } }, unrelated: { '.read': false } } });
  const local = { source, rules: ruleTree('reviewed grant'), priorRules: ruleTree('prior grant'), workers: {}, envSha256: '1'.repeat(64), submitEndpoint: 'https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit' };
  const provider = { rulesSha256: digest(phase === 'predeploy' ? local.priorRules : local.rules), writesEnabled: true, restore: null, common: { routes: [] }, workers: {}, functions: [] };
  const pins = { ...source, filesSha256: digest(source.files), priorRulesSha256: digest(local.priorRules), rulesSha256: digest(local.rules), commonSha256: digest(provider.common), workers: {}, unchangedWorkers: {}, envSha256: local.envSha256 };
  for (const name of ['r2-upload-signer', 'r2-backup-worker']) {
    local.workers[name] = { bundleSha256: 'd'.repeat(64), configSha256: 'e'.repeat(64), sourceConfigSha256: 'f'.repeat(64), moduleName: 'index.js' };
    const deployed = ['predeploy', 'rules', 'upload', 'homework'].indexOf(phase) >= (name === 'r2-upload-signer' ? 2 : 3);
    const worker = { versionId: deployed ? 'new' : 'old', settings: { bindings: [{ name: 'KEY', type: 'secret_text' }] }, bindings: [{ name: 'KEY', type: 'secret_text' }], runtime: { compatibility_date: '2026-01-20' }, handlers: ['fetch'], namedHandlers: [], schedules: ['0 * * * *'], subdomain: { enabled: true }, modules: [{ name: 'index.js', sha256: deployed ? 'd'.repeat(64) : '0'.repeat(64) }] };
    worker.deployment = { versions: [{ version_id: worker.versionId, percentage: 100 }] };
    worker.deploymentAfter = structuredClone(worker.deployment);
    provider.workers[name] = worker;
    pins.workers[name] = { ...local.workers[name], baselineVersion: 'old', baselineModules: [{ name: 'index.js', sha256: '0'.repeat(64) }], invariantSha256: digest(workerInvariants(worker)) };
  }
  const notification = structuredClone(provider.workers['r2-upload-signer']);
  notification.versionId = 'old';
  notification.deployment = { versions: [{ version_id: 'old', percentage: 100 }] };
  notification.deploymentAfter = structuredClone(notification.deployment);
  notification.modules = [{ name: 'notification.js', sha256: '3'.repeat(64) }];
  provider.workers.notification = notification;
  pins.unchangedWorkers.notification = { baselineVersion: 'old', baselineModules: notification.modules, invariantSha256: digest(workerInvariants(notification)) };
  return { local, provider, pins };
}

test('Listening phases require exact ordered rules and Worker state', () => {
  for (const phase of ['predeploy', 'rules', 'upload', 'homework']) {
    const { local, provider, pins } = fixture(phase);
    validateListeningEvidence(local, provider, phase, pins);
    assert.equal(isListeningReleaseObserved(provider), false);
    for (const other of ['predeploy', 'rules', 'upload', 'homework'].filter(value => value !== phase)) {
      assert.throws(() => validateListeningEvidence(local, provider, other, pins));
    }
  }
});

test('Listening source, artifacts, rules, configuration and restore drift fail closed', () => {
  for (const mutate of [
    ({ local }) => { local.source.revision = 'f'.repeat(40); },
    ({ local }) => { local.source.tree = 'f'.repeat(40); },
    ({ local }) => { local.source.baseRevision = 'f'.repeat(40); },
    ({ local }) => { local.source.dirty = true; },
    ({ local }) => { local.source.files.push('foreign.ts'); },
    ({ local }) => { local.rules.rules.unrelated['.read'] = true; },
    ({ local }) => { local.workers['r2-upload-signer'].bundleSha256 = 'a'.repeat(64); },
    ({ local }) => { local.workers['r2-upload-signer'].configSha256 = 'a'.repeat(64); },
    ({ local }) => { local.workers['r2-backup-worker'].sourceConfigSha256 = 'a'.repeat(64); },
    ({ provider }) => { provider.rulesSha256 = 'a'.repeat(64); },
    ({ provider }) => { provider.restore = true; },
    ({ provider }) => { provider.restore = { active: true }; },
    ({ provider }) => { provider.restore = {}; },
    ({ provider }) => { provider.writesEnabled = false; },
    ({ provider }) => { provider.common.routes.push('foreign'); },
    ({ provider }) => { provider.functions.push({ name: 'unexpected' }); },
    ({ provider }) => { provider.workers.notification.versionId = 'unexpected'; },
    ({ provider }) => { provider.workers.notification.modules = []; },
    ({ local }) => { local.submitEndpoint = 'https://foreign.invalid'; },
    ({ local }) => { local.envSha256 = '2'.repeat(64); },
    ({ provider }) => { provider.workers['r2-upload-signer'].modules[0].sha256 = 'a'.repeat(64); },
    ({ provider }) => { provider.workers['r2-upload-signer'].settings.bindings.pop(); },
    ({ provider }) => { provider.workers['r2-upload-signer'].runtime.compatibility_date = '2020-01-01'; },
    ({ provider }) => { provider.workers['r2-backup-worker'].schedules = []; },
    ({ provider }) => { provider.workers['r2-backup-worker'].deployment.versions[0].percentage = 50; },
  ]) {
    const values = fixture();
    mutate(values);
    assert.throws(() => validateListeningEvidence(values.local, values.provider, 'predeploy', values.pins));
  }
  const { local, provider, pins } = fixture();
  assert.throws(() => validateListeningEvidence(local, provider, 'anything', pins));
  assert.throws(() => assertListeningSource(local.source, {}), /not reviewed/);
  local.rules.rules.unrelated['.read'] = true;
  pins.rulesSha256 = digest(local.rules);
  assert.throws(() => validateListeningEvidence(local, provider, 'predeploy', pins), /outside grant validation/);
  assert.equal(isListeningReleaseObserved({ readOnly: true, source: local.source, phase: 'homework' }), false);
});

test('Listening checker rejects incompatible observer modes and orphan options', async () => {
  await assert.rejects(assess({ observeListening: true, mode: 'acceptance' }), /requires release mode/);
  await assert.rejects(assess({ observeListening: true, observe: true, baselinePath: 'assertion.json' }), /caller baseline/);
  await assert.rejects(assess({ listeningPhase: 'homework' }), /require --observe-listening-release/);
});
