import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateWritingHomeworkEvidence, normalizeWritingHomeworkOutsideTarget,
  isWritingHomeworkObserved, observeWritingHomework } from '../release-writing-homework-evidence.mjs';
import { assess } from '../release-check.mjs';
import { validateTeacherHomeworkNotificationProvider, isTeacherHomeworkNotificationObserved } from '../release-teacher-homework-notification-evidence.mjs';

function fixture() {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: 'c'.repeat(40), dirty: false, files: ['reviewed.js'] };
  const deployment = { name: 'luyentap-notification-command', account_id: 'e41db829dabe9993f03674afdfd56510',
    no_bundle: true, minify: false, keep_vars: false, vars: { HOMEWORK_RESULT_AUTHORITY_ENABLED: 'true',
      RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME: 'projects/temp-a1437/rulesets/reviewed',
      RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF: '2026-10-02T02:22:09.862Z' } };
  const provider = { command: { versionId: 'old-version', modules: { 'notification-command-active.mjs': 'old-artifact' },
    outsideTargetSha256: 'outside', settings: { bindings: [{ name: 'KEY', type: 'secret_text' }] } },
    public: { versionId: 'public-version' }, rtdbRulesSha256: 'rules',
    firestore: { rulesetName: deployment.vars.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME, sourceSha256: 'firestore-rules' } };
  const local = { source, bundleSha256: 'artifact', entrySha256: 'entry', configSha256: 'config', outsideTargetSha256: 'outside', deployment };
  const pins = { ...source, bundleSha256: 'artifact', entrySha256: 'entry', configSha256: 'config', outsideTargetSha256: 'outside', provider };
  return { local, provider: structuredClone(provider), pins };
}

test('fixed Worker qualification validates artifacts without minting a trusted observation', () => {
  const f = fixture();
  validateWritingHomeworkEvidence(f.local, f.provider, 'predeploy', f.pins);
  assert.equal(isWritingHomeworkObserved(f.provider), false);
  const after = structuredClone(f.provider);
  after.command.versionId = 'new-version';
  after.command.modules['notification-command-active.mjs'] = f.local.bundleSha256;
  after.command.settings.bindings.push(...Object.entries(f.local.deployment.vars).map(([name, text]) => ({ name, text, type: 'plain_text' })));
  after.command.settings.bindings.sort((a, b) => a.name.localeCompare(b.name));
  validateWritingHomeworkEvidence(f.local, after, 'postdeploy', f.pins);
});

test('source, artifact, secret, routing and Firebase drift fail closed', () => {
  for (const change of [
    f => { f.local.source.revision = 'foreign'; }, f => { f.local.source.dirty = true; },
    f => { f.local.source.files.push('unreviewed.js'); }, f => { f.local.bundleSha256 = 'foreign'; },
    f => { f.local.entrySha256 = 'foreign'; }, f => { f.local.configSha256 = 'foreign'; },
    f => { f.local.outsideTargetSha256 = 'foreign'; }, f => { f.provider.command.versionId = 'foreign'; },
    f => { f.provider.command.settings.bindings.push({ name: 'EXTRA', type: 'secret_text' }); },
    f => { f.provider.public.versionId = 'foreign'; }, f => { f.provider.rtdbRulesSha256 = 'foreign'; },
    f => { f.provider.firestore.sourceSha256 = 'foreign'; }, f => { f.provider.routes = ['unreviewed']; },
  ]) {
    const f = fixture();
    f.pins = structuredClone(f.pins);
    change(f);
    assert.throws(() => validateWritingHomeworkEvidence(f.local, f.provider, 'predeploy', f.pins));
  }
});

test('normalization masks only the reviewed authority regions', () => {
  const sample = 'before\nasync function verifyHomeworkResultAuthority(input) {changed}\nvar ID2, record, timestamp;\n'
    + '    createNotificationFirestoreBridge = /* @__PURE__ */ __name((fetcher = fetch) => ({changed    }), "createNotificationFirestoreBridge");\nafter';
  const normalized = normalizeWritingHomeworkOutsideTarget(sample);
  assert(normalized.startsWith('before\n') && normalized.endsWith('after'));
  assert(!normalized.includes('changed'));
  assert.throws(() => normalizeWritingHomeworkOutsideTarget('unrecognized-artifact'));
});

test('native qualification rejects foreign sources before provider I/O and cannot combine evidence', async () => {
  await assert.rejects(observeWritingHomework({ cwd: process.cwd(), source: { revision: 'foreign' }, phase: 'predeploy' }));
  await assert.rejects(assess({ observeWritingHomeworkWorker: true, observe: true, workerPhase: 'predeploy' }));
  await assert.rejects(assess({ observeWritingHomeworkWorker: true, workerPhase: 'unknown' }));
});

test('teacher notification qualification allows only the active command module and version to change', () => {
  const bundle = 'notification-command-active.mjs';
  const priorVersion = '7f4edb63-4727-4d0c-9e46-ade6dd51a602';
  const priorBundle = 'previous-module';
  const nextBundle = 'new-module';
  const vars = { HOMEWORK_RESULT_AUTHORITY_ENABLED: 'true' };
  const provider = {
    rules: { rtdbRulesSha256: 'rtdb', firestore: { rulesetName: 'firestore' } },
    workers: {
      command: { modules: { [bundle]: priorBundle }, settings: { bindings: [
        { name: 'HOMEWORK_RESULT_AUTHORITY_ENABLED', text: 'true', type: 'plain_text' },
        { name: 'KEY', type: 'secret_text' },
      ] }, versionId: priorVersion },
      public: { versionId: 'public-adapter' },
      routes: [],
    },
  };
  const pins = { rules: structuredClone(provider.rules), priorVersion, priorBundle,
    artifact: { bundleSha256: nextBundle },
    workersSha256: createHash('sha256').update(JSON.stringify(provider.workers)).digest('hex') };
  validateTeacherHomeworkNotificationProvider(provider, vars, 'predeploy', pins);
  assert.equal(isTeacherHomeworkNotificationObserved(provider), false);
  const deployed = structuredClone(provider);
  deployed.workers.command.versionId = '1d3cce5a-f873-4bf4-a547-50ed4a387ab6';
  deployed.workers.command.modules[bundle] = nextBundle;
  validateTeacherHomeworkNotificationProvider(deployed, vars, 'postdeploy', pins);
  for (const change of [
    p => { p.workers.public.versionId = 'other-adapter'; },
    p => { p.workers.routes.push('unexpected-route'); },
    p => { p.workers.command.settings.bindings.pop(); },
    p => { p.workers.command.modules['notification-command-entry.js'] = 'different-entry'; },
    p => { p.workers.command.modules[bundle] = 'different-active-module'; },
    p => { p.rules.rtdbRulesSha256 = 'different-rules'; },
  ]) {
    const drift = structuredClone(deployed);
    change(drift);
    assert.throws(() => validateTeacherHomeworkNotificationProvider(drift, vars, 'postdeploy', pins));
  }
  assert.throws(() => validateTeacherHomeworkNotificationProvider(provider, vars, 'postdeploy', pins));
  assert.throws(() => validateTeacherHomeworkNotificationProvider(deployed, vars, 'predeploy', pins));
});

test('the teacher notification profile remains independent of the Writing profile and rejects foreign source', async () => {
  const base = 'HEAD';
  const result = await assess({ base, observeTeacherHomeworkNotificationWorker: true, workerPhase: 'predeploy' });
  assert.equal(result.scope, 'isolated-teacher-homework-notification');
  assert.notEqual(result.decision, 'PASS');
  assert.match(result.findings[0].message, /source differs/u);
  await assert.rejects(assess({ base, observeTeacherHomeworkNotificationWorker: true, observeWritingHomeworkWorker: true, workerPhase: 'predeploy' }));
});
