import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonical, workerInvariants } from '../release-listening-evidence.mjs';
import { validateListeningEditorEvidence, assertListeningEditorSource, assertListeningPrivateLocalBindingChange, isListeningEditorObserved, selectListeningReleaseProfile, reviewedListeningEditorRelease } from '../release-listening-editor-evidence.mjs';
import { reviewedListeningProbeRelease } from '../release-listening-probe-pins.mjs';
import { reviewedListeningFunctionalRelease } from '../release-listening-functional-pins.mjs';
import { reviewedListeningPrivateRelease } from '../release-listening-private-pins.mjs';
import { assess } from '../release-check.mjs';
import { selectReleaseSource, assertListeningHostingReady } from '../deploy-live.mjs';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function fixture(phase = 'predeploy', changesRules = false) {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false, files: ['cloudflare/worker.js'] };
  const local = { source, moduleName: 'worker.js', submitEndpoint: 'https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit' };
  const pins = { ...source, filesSha256: digest(source.files), commonSha256: digest({ routes: [] }), unchangedWorkers: {} };
  for (const key of ['bundleSha256', 'configSha256', 'sourceConfigSha256', 'envSha256', 'rulesSha256']) local[key] = pins[key] = 'd'.repeat(64);
  const provider = { rulesSha256: pins.rulesSha256, common: { routes: [] }, writesEnabled: true, restore: null, functions: [], workers: {} };
  if (changesRules) {
    pins.priorRulesSha256 = '1'.repeat(64);
    pins.priorFirestoreRulesSha256 = '2'.repeat(64);
    local.firestoreRulesSha256 = pins.firestoreRulesSha256 = '3'.repeat(64);
    provider.rulesSha256 = phase === 'postrules' ? pins.rulesSha256 : pins.priorRulesSha256;
    provider.firestoreRules = { sourceSha256: phase === 'postrules' ? pins.firestoreRulesSha256 : pins.priorFirestoreRulesSha256 };
  }
  for (const name of ['r2-upload-signer', 'r2-backup-worker', 'luyentap-notification-command', 'luyentap-notification-firestore-qa']) {
    const updated = name === 'r2-upload-signer' && phase !== 'predeploy';
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

const privateLifecycle = { rules: [
  { id: 'Default Multipart Abort Rule', enabled: true, conditions: {},
    abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 604800 } } },
  { id: 'expire-listening-temp-after-one-day', enabled: true, conditions: { prefix: 'temp/listening/' },
    deleteObjectsTransition: { condition: { type: 'Age', maxAge: 86400 } } },
] };

function privateFixture(phase = 'predeploy') {
  const value = fixture(phase, true);
  const { local, provider, pins } = value;
  pins.privateAudio = { bucketName: 'luyentap-listening-audio-private', lifecycleSha256: digest(privateLifecycle) };
  local.lifecycleSha256 = pins.privateAudio.lifecycleSha256;
  local.localListeningBindingOnly = true;
  provider.privateAudioBucket = { bucketName: pins.privateAudio.bucketName, managedDomain: { enabled: false },
    customDomains: { domains: [] }, lifecycle: structuredClone(privateLifecycle) };
  // Firestore is observed in every phase even when its reviewed bytes do not change.
  pins.priorFirestoreRulesSha256 = pins.firestoreRulesSha256;
  provider.firestoreRules.sourceSha256 = pins.firestoreRulesSha256;
  const worker = provider.workers['r2-upload-signer'];
  const bindings = [{ name: 'BOOK_LIVE_FLAG', type: 'plain_text', text: 'true' },
    { name: 'R2_BUCKET', type: 'r2_bucket', bucket_name: 'kahoot-media' }];
  worker.settings.bindings = structuredClone(bindings);
  worker.bindings = structuredClone(bindings);
  pins.upload.invariantSha256 = digest(workerInvariants(worker));
  const next = structuredClone(worker);
  next.settings.bindings.push({ name: 'LISTENING_AUDIO_BUCKET', type: 'r2_bucket', bucket_name: pins.privateAudio.bucketName });
  next.bindings = structuredClone(next.settings.bindings);
  pins.postUploadInvariantSha256 = digest(workerInvariants(next));
  if (phase !== 'predeploy') {
    worker.settings = next.settings;
    worker.bindings = next.bindings;
  }
  return value;
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
  assert.doesNotThrow(() => assertListeningHostingReady({ hostingReady: true, editorObservation: { profile: 'editor-capability', scope: 'upload-worker-and-hosting', phase: 'postupload' } }, false, true));
  assert.throws(() => assertListeningHostingReady({ hostingReady: true, editorObservation: { phase: 'postupload', scope: 'upload-worker-only' } }, false, true), /Worker-only/);
  const foreign = fixture();
  foreign.local.source.revision = 'f'.repeat(40);
  assert.throws(() => assertListeningEditorSource(foreign.local.source, foreign.pins), /revision changed/);
});

test('native profile selection accepts only fixed revisions and preserves historical editor pins', () => {
  const original = selectListeningReleaseProfile(reviewedListeningEditorRelease.revision);
  assert.equal(original.pins, reviewedListeningEditorRelease);
  assert.equal(original.scope, 'upload-worker-and-hosting');
  assert.throws(() => selectListeningReleaseProfile('f'.repeat(40)), /no reviewed fixed profile/);
  assert.throws(() => selectListeningReleaseProfile(null), /invalid/);
  if (reviewedListeningProbeRelease.revision) {
    const hotfix = selectListeningReleaseProfile(reviewedListeningProbeRelease.revision);
    assert.equal(hotfix.pins, reviewedListeningProbeRelease);
    assert.equal(hotfix.scope, 'upload-worker-only');
    assert.equal(hotfix.name, 'probe-hotfix');
  }
  if (reviewedListeningFunctionalRelease.revision) {
    const functional = selectListeningReleaseProfile(reviewedListeningFunctionalRelease.revision);
    assert.equal(functional.pins, reviewedListeningFunctionalRelease);
    assert.equal(functional.scope, 'upload-worker-rules-and-hosting');
    assert.equal(functional.name, 'functional-completion');
  }
});

test('functional completion requires Upload before both rulesets and Hosting after postrules', () => {
  for (const phase of ['predeploy', 'postupload', 'postrules']) {
    const { local, provider, pins } = fixture(phase, true);
    validateListeningEditorEvidence(local, provider, phase, pins);
    for (const other of ['predeploy', 'postupload', 'postrules'].filter(value => value !== phase)) {
      assert.throws(() => validateListeningEditorEvidence(local, provider, other, pins));
    }
    const result = { hostingReady: true, editorObservation: { profile: 'functional-completion', scope: 'upload-worker-rules-and-hosting', phase } };
    if (phase === 'postrules') assert.doesNotThrow(() => assertListeningHostingReady(result, false, true));
    else assert.throws(() => assertListeningHostingReady(result, false, true), /postrules/);
  }
  for (const mutate of [
    ({ local }) => { local.firestoreRulesSha256 = 'e'.repeat(64); },
    ({ provider }) => { delete provider.firestoreRules; },
    ({ provider }) => { provider.firestoreRules.sourceSha256 = 'e'.repeat(64); },
    ({ provider, pins }) => { provider.rulesSha256 = pins.priorRulesSha256; },
    ({ provider, pins }) => { provider.firestoreRules.sourceSha256 = pins.priorFirestoreRulesSha256; },
    ({ provider, pins }) => { provider.workers['r2-upload-signer'].modules = pins.upload.modules; },
    ({ pins }) => { pins.priorRulesSha256 = null; },
    ({ pins }) => { pins.priorFirestoreRulesSha256 = null; },
  ]) {
    const value = fixture('postrules', true); mutate(value);
    assert.throws(() => validateListeningEditorEvidence(value.local, value.provider, 'postrules', value.pins));
  }
  const historical = fixture('postrules');
  assert.throws(() => validateListeningEditorEvidence(historical.local, historical.provider, 'postrules', historical.pins), /phase/);
  assert.throws(() => assertListeningHostingReady({ hostingReady: true, editorObservation: { profile: 'editor-capability', scope: 'upload-worker-and-hosting', phase: 'postrules' } }, false, true), /verified profile phase/);
});

test('private audio pins select the reviewed profile and preserve historical profiles', () => {
  assert.equal(reviewedListeningFunctionalRelease.revision, 'bb4a74349482a874dae0cadc1a935ca93fcab785');
  assert.equal(reviewedListeningPrivateRelease.baseRevision, reviewedListeningFunctionalRelease.revision);
  assert.equal(reviewedListeningPrivateRelease.upload.versionId, '4c8ade84-46a5-4b6b-98f3-42539972aab9');
  assert.equal(reviewedListeningPrivateRelease.upload.invariantSha256, '0d6807ba1a9ecff8ff79d9a17aa773a9c57f94388ae6767a8ac9f571b7d087b0');
  assert.equal(reviewedListeningPrivateRelease.privateAudio.lifecycleSha256, digest(privateLifecycle));
  const profile = selectListeningReleaseProfile(reviewedListeningPrivateRelease.revision);
  assert.equal(profile.name, 'private-audio');
  assert.equal(profile.scope, 'upload-worker-rules-and-hosting');
  assert.equal(profile.pins, reviewedListeningPrivateRelease);
  assert.equal(isListeningEditorObserved({ profile: 'private-audio', phase: 'postrules', readOnly: true }), false);
});

test('private audio requires old Upload bindings before deployment and exact new bindings after cutover', () => {
  for (const phase of ['predeploy', 'postupload', 'postrules']) {
    const value = privateFixture(phase);
    validateListeningEditorEvidence(value.local, value.provider, phase, value.pins);
    for (const other of ['predeploy', 'postupload', 'postrules'].filter(item => item !== phase)) {
      assert.throws(() => validateListeningEditorEvidence(value.local, value.provider, other, value.pins));
    }
    const result = { hostingReady: true, editorObservation: { profile: 'private-audio', scope: 'upload-worker-rules-and-hosting', phase } };
    if (phase === 'postrules') assert.doesNotThrow(() => assertListeningHostingReady(result, false, true));
    else assert.throws(() => assertListeningHostingReady(result, false, true), /postrules/);
  }
  const after = privateFixture('postupload');
  const before = privateFixture('predeploy');
  after.provider.workers['r2-upload-signer'].settings = before.provider.workers['r2-upload-signer'].settings;
  after.provider.workers['r2-upload-signer'].bindings = before.provider.workers['r2-upload-signer'].bindings;
  assert.throws(() => validateListeningEditorEvidence(after.local, after.provider, 'postupload', after.pins), /configuration changed/);
});

test('private audio rejects public domains, lifecycle drift and any non-target configuration change', () => {
  for (const mutate of [
    ({ provider }) => { provider.privateAudioBucket.managedDomain.enabled = true; },
    ({ provider }) => { delete provider.privateAudioBucket.managedDomain.enabled; },
    ({ provider }) => { provider.privateAudioBucket.customDomains.domains.push({ domain: 'public.example', enabled: false }); },
    ({ provider }) => { delete provider.privateAudioBucket.customDomains; },
    ({ provider }) => { provider.privateAudioBucket.bucketName = 'kahoot-media'; },
    ({ provider }) => { provider.privateAudioBucket.lifecycle.rules[1].conditions.prefix = ''; },
    ({ provider }) => { provider.privateAudioBucket.lifecycle.rules[1].deleteObjectsTransition.condition.maxAge = 1; },
    ({ provider }) => { provider.privateAudioBucket.lifecycle.rules[0].abortMultipartUploadsTransition.condition.maxAge = 1; },
    ({ provider }) => { provider.privateAudioBucket.lifecycle.rules.push({ enabled: true, conditions: {} }); },
    ({ local }) => { local.lifecycleSha256 = 'e'.repeat(64); },
    ({ local }) => { delete local.localListeningBindingOnly; },
    ({ pins }) => { pins.postUploadInvariantSha256 = pins.upload.invariantSha256; },
    ({ pins }) => { pins.postUploadInvariantSha256 = 'UNREVIEWED'; },
    ({ provider }) => { provider.workers['r2-upload-signer'].settings.bindings[0].text = 'false'; },
    ({ provider }) => { provider.workers['r2-upload-signer'].bindings[2].bucket_name = 'kahoot-media'; },
    ({ provider }) => { provider.workers['r2-backup-worker'].settings.bindings.push({ name: 'foreign' }); },
    ({ provider }) => { provider.workers['luyentap-notification-command'].modules = []; },
    ({ provider }) => { provider.firestoreRules.sourceSha256 = 'e'.repeat(64); },
  ]) {
    const value = privateFixture('postrules');
    mutate(value);
    assert.throws(() => validateListeningEditorEvidence(value.local, value.provider, 'postrules', value.pins));
  }
});

test('private audio native source review permits only the exact local Listening bucket addition', () => {
  const before = 'const config = `{\n  "r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "local-book-covers" }],\n  "vars": { "BOOK_FLAG": "disabled" }\n}`;';
  const after = before.replace('"bucket_name": "local-book-covers" }]',
    '"bucket_name": "local-book-covers" }, { "binding": "LISTENING_AUDIO_BUCKET", "bucket_name": "local-listening-audio-private" }]');
  assert.doesNotThrow(() => assertListeningPrivateLocalBindingChange(before, after.replace(/\n/g, '\r\n')));
  for (const changed of [before, after.replace('local-book-covers', 'production-book-covers'),
    after.replace('local-listening-audio-private', 'luyentap-listening-audio-private'),
    after.replace('"disabled"', '"enabled"'), `${after}\nextra()`]) {
    assert.throws(() => assertListeningPrivateLocalBindingChange(before, changed));
  }
});
