import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonical, workerInvariants } from '../release-listening-evidence.mjs';
import { validateListeningEditorEvidence, assertListeningEditorSource, isListeningEditorObserved } from '../release-listening-editor-evidence.mjs';
import { assess } from '../release-check.mjs';
import { selectReleaseSource, assertListeningHostingReady } from '../deploy-live.mjs';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function fixture(phase = 'predeploy') {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false, files: ['cloudflare/worker.js'] };
  const local = { source, moduleName: 'worker.js', submitEndpoint: 'https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit' };
  const pins = { ...source, filesSha256: digest(source.files), commonSha256: digest({ routes: [] }), unchangedWorkers: {} };
  for (const key of ['bundleSha256', 'configSha256', 'sourceConfigSha256', 'envSha256', 'rulesSha256']) local[key] = pins[key] = 'd'.repeat(64);
  const provider = { rulesSha256: pins.rulesSha256, common: { routes: [] }, writesEnabled: true, restore: null, functions: [], workers: {} };
  for (const name of ['r2-upload-signer', 'r2-backup-worker', 'luyentap-notification-command', 'luyentap-notification-firestore-qa']) {
    const updated = name === 'r2-upload-signer' && phase === 'postupload';
    const worker = { versionId: updated ? 'new' : 'old', settings: { bindings: [] }, bindings: [], runtime: {}, handlers: ['fetch'], namedHandlers: [], schedules: [], subdomain: {}, modules: [{ name: 'worker.js', sha256: updated ? pins.bundleSha256 : '0'.repeat(64) }] };
    worker.deployment = { versions: [{ version_id: worker.versionId, percentage: 100 }] };
    worker.deploymentAfter = structuredClone(worker.deployment);
    provider.workers[name] = worker;
    const expected = { versionId: 'old', modules: [{ name: 'worker.js', sha256: '0'.repeat(64) }], invariantSha256: digest(workerInvariants(worker)) };
    if (name === 'r2-upload-signer') pins.upload = expected;
    else pins.unchangedWorkers[name] = expected;
  }
  return { local, provider, pins };
}

test('editor profile accepts only its exact predeploy or postupload state; pure evidence is untrusted', () => {
  for (const phase of ['predeploy', 'postupload']) {
    const { local, provider, pins } = fixture(phase);
    validateListeningEditorEvidence(local, provider, phase, pins);
    assert.throws(() => validateListeningEditorEvidence(local, provider, phase === 'predeploy' ? 'postupload' : 'predeploy', pins));
    assert.equal(isListeningEditorObserved(provider), false);
  }
});

test('editor profile fails closed for source, artifact, unchanged service and runtime drift', () => {
  for (const mutate of [
    ({ local }) => { local.source.revision = 'e'.repeat(40); },
    ({ local }) => { local.source.tree = 'e'.repeat(40); },
    ({ local }) => { local.source.baseRevision = 'e'.repeat(40); },
    ({ local }) => { local.source.dirty = true; },
    ({ local }) => { local.source.files.push('unreviewed'); },
    ...['bundleSha256', 'configSha256', 'sourceConfigSha256', 'envSha256', 'rulesSha256'].map(key => ({ local }) => { local[key] = 'e'.repeat(64); }),
    ({ provider }) => { provider.rulesSha256 = 'e'.repeat(64); },
    ({ provider }) => { provider.common.routes.push('route'); },
    ({ provider }) => { provider.writesEnabled = false; },
    ({ provider }) => { provider.restore = { active: true }; },
    ({ provider }) => { provider.restore = {}; },
    ({ provider }) => { provider.functions.push({ name: 'function' }); },
    ({ provider }) => { provider.workers['r2-backup-worker'].modules = []; },
    ({ provider }) => { provider.workers['luyentap-notification-command'].versionId = 'new'; },
    ({ provider }) => { provider.workers['r2-upload-signer'].schedules.push('* * * * *'); },
    ({ provider }) => { provider.workers['r2-upload-signer'].deployment.versions[0].percentage = 50; },
    ({ local }) => { local.submitEndpoint = 'https://other.invalid'; },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateListeningEditorEvidence(value.local, value.provider, 'predeploy', value.pins));
  }
  assert.throws(() => assertListeningEditorSource(fixture().local.source, {}), /not reviewed/);
  assert.equal(isListeningEditorObserved({ phase: 'postupload', readOnly: true }), false);
});

test('editor checker and Hosting route cannot mix profiles or activate before postupload', async () => {
  await assert.rejects(assess({ observeListeningEditorRelease: true, observeListening: true }), /one Listening/);
  await assert.rejects(assess({ observeListeningEditorRelease: true, observe: true, baselinePath: 'assertion.json' }), /caller baseline/);
  await assert.rejects(assess({ observeListeningEditorRelease: true, listeningHomeworkBundle: 'worker.js' }), /does not deploy/);
  assert.throws(() => selectReleaseSource({ observeListeningEditorRelease: true, listeningPhase: 'predeploy' }), /postupload/);
  assert.throws(() => assertListeningHostingReady({ hostingReady: true }, false, true), /postupload/);
  assert.doesNotThrow(() => assertListeningHostingReady({ hostingReady: true, editorObservation: { phase: 'postupload' } }, false, true));
  const foreign = fixture();
  foreign.local.source.revision = 'f'.repeat(40);
  assert.throws(() => assertListeningEditorSource(foreign.local.source, foreign.pins), /revision changed/);
});
