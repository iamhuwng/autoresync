import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assess } from '../release-check.mjs';
import { assertNotificationWorkerSource, isNotificationWorkerObserved, normalizeNotificationOutsideTarget, observeNotificationWorker, reviewedNotificationRelease, validateNotificationWorkerEvidence } from '../release-notification-worker-evidence.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = hash('fixture artifact');

function fixture() {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), baseRevision: reviewedNotificationRelease.baseRevision, dirty: false, files: ['database.rules.json'] };
  const baseRules = { rules: { test_results: { $resultId: { '.read': 'existing read', '.write': false } }, private: { '.read': false } } };
  const rules = structuredClone(baseRules);
  rules.rules.test_results.$resultId['.read'] = 'reviewed trusted schema 3 read';
  const deployment = {
    vars: { FIREBASE_PROJECT_ID: 'temp-a1437' }, secrets: { required: ['EXISTING_SECRET'] }, durable_objects: { bindings: [{ name: 'NOTIFICATION_BRIDGE_OBJECT', class_name: 'NotificationBridgeObject' }] },
    ratelimits: [{ name: 'NOTIFICATION_RATE_LIMITER', namespace_id: '205512', simple: { limit: 30, period: 60 } }], compatibility_date: '2026-09-19', compatibility_flags: ['nodejs_compat'], triggers: { crons: [] }, workers_dev: true, preview_urls: false, keep_vars: true,
    migrations: [{ tag: 'notification-bridge-v1', new_sqlite_classes: ['NotificationBridgeObject'] }], observability: { enabled: true },
  };
  const provider = { workers: [{ name: 'luyentap-notification-command', modules: [{ name: 'notification-command-active.mjs', outsideTargetSha256: digest }],
    settings: { compatibility_date: deployment.compatibility_date, compatibility_flags: deployment.compatibility_flags, observability: { enabled: true, redact_query_string: false }, bindings: [
      { name: 'FIREBASE_PROJECT_ID', type: 'plain_text', text: 'temp-a1437' }, { name: 'EXISTING_SECRET', type: 'secret_text' },
      { ...deployment.durable_objects.bindings[0], type: 'durable_object_namespace', namespace_id: 'existing-namespace' }, { ...deployment.ratelimits[0], type: 'ratelimit' },
    ] }, runtime: { migration_tag: 'notification-bridge-v1' }, schedules: { schedules: [] }, subdomain: { enabled: true, previews_enabled: false } }], rules: { treeSha256: hash(canonical(baseRules)) } };
  const local = { source, activeSha256: digest, entrySha256: digest, configSha256: digest, outsideTargetSha256: digest, rulesSha256: digest, baseRulesSha256: provider.rules.treeSha256, baseRules, rules, deployment };
  const pins = { ...reviewedNotificationRelease, ...source, files: [...source.files], ...Object.fromEntries(Object.entries(local).filter(([key]) => key.endsWith('Sha256'))), baseReadSha256: hash('existing read'), providerSha256: hash(canonical(provider)) };
  return { local, provider, pins };
}

test('pure validation cannot mint or deserialize a trusted provider observation', () => {
  const { local, provider, pins } = fixture();
  validateNotificationWorkerEvidence(local, provider, pins);
  assert.equal(isNotificationWorkerObserved(provider), false);
  assert.equal(isNotificationWorkerObserved(JSON.parse(JSON.stringify({ ...provider, readOnly: true, sourceKnown: false }))), false);
});

test('candidate, outside-target, deployment and RTDB drift fail closed', async t => {
  for (const [name, mutate, reason] of [
    ['revision', a => { a.source.revision = 'c'.repeat(40); }, /revision changed/],
    ['tree', a => { a.source.tree = 'c'.repeat(40); }, /tree changed/],
    ['base', a => { a.source.baseRevision = 'c'.repeat(40); }, /base changed/],
    ['dirty', a => { a.source.dirty = true; }, /worktree is dirty/],
    ['file allowlist', a => { a.source.files.push('firestore.rules'); }, /changed-file list changed/],
    ['active module', a => { a.activeSha256 = hash('changed'); }, /activeSha256 changed/],
    ['entry module', a => { a.entrySha256 = hash('changed'); }, /entrySha256 changed/],
    ['deploy config', a => { a.configSha256 = hash('changed'); }, /configSha256 changed/],
    ['outside target', a => { a.outsideTargetSha256 = hash('changed'); }, /outsideTargetSha256 changed/],
    ['rules write boundary', a => { a.rules.rules.test_results.$resultId['.write'] = true; }, /outside the result read branch/],
    ['unrelated rule', a => { a.rules.rules.private['.read'] = true; }, /outside the result read branch/],
    ['unchanged read', a => { a.rules = structuredClone(a.baseRules); }, /was not changed/],
    ['live rules', (_, b) => { b.rules.treeSha256 = hash('changed'); }, /live RTDB rules changed/],
    ['live code or adapter', (_, b) => { b.workers[0].modules[0].outsideTargetSha256 = hash('changed'); }, /provider configuration or code changed/],
    ['effective variable', a => { a.deployment.vars.FIREBASE_PROJECT_ID = 'other'; }, /variables differ/],
    ['secret binding', a => { a.deployment.secrets.required = []; }, /secret names differ/],
    ['DO binding', a => { a.deployment.durable_objects.bindings[0].script_name = 'other'; }, /Durable Object binding changed/],
    ['schedule', a => { a.deployment.triggers.crons.push('* * * * *'); }, /schedules changed/],
    ['migration', a => { a.deployment.migrations[0].tag = 'v2'; }, /migration changed/],
  ]) await t.test(name, () => {
    const { local, provider, pins } = fixture();
    mutate(local, provider);
    assert.throws(() => validateNotificationWorkerEvidence(local, provider, pins), reason);
  });
});

test('normalization masks only the two delimited functions', () => {
  const module = body => `header\nasync function deliverHomeworkNotice(input) {${body}}\nvar ID, row, deny, time, HOMEWORK_KINDS;\nother code\n    createNotificationFirestoreBridge = /* @__PURE__ */ __name((fetcher = fetch) => ({${body}\n    }), "createNotificationFirestoreBridge");\nfooter`;
  assert.equal(normalizeNotificationOutsideTarget(module('before')), normalizeNotificationOutsideTarget(module('after')));
  assert.notEqual(normalizeNotificationOutsideTarget(module('before')), normalizeNotificationOutsideTarget(module('after').replace('other code', 'changed code')));
  assert.throws(() => normalizeNotificationOutsideTarget(module('before').replace('var ID, row', 'var changed, row')), /delimiters changed/);
  assert.throws(() => normalizeNotificationOutsideTarget(module('before') + '\nasync function deliverHomeworkNotice(input) {'), /delimiters changed/);
});

test('unreviewed pins and missing artifacts stop before native provider observation', async () => {
  assert.throws(() => assertNotificationWorkerSource(fixture().local.source, { ...reviewedNotificationRelease, revision: null }), /pins are not reviewed/);
  await assert.rejects(() => observeNotificationWorker(), /paths are required/);
});

test('fixed observer cannot mix Hosting, other Worker, baseline JSON or arbitrary modes', async () => {
  for (const conflicting of [{ observeHomework: true }, { observe: true }, { observeProvider: true }, { hostingObservation: { readOnly: true } }, { baselinePath: 'caller.json' }, { mode: 'hotfix' }, { compatibilityReviewPath: 'review.json' }]) {
    await assert.rejects(() => assess({ observeNotification: true, workerBundlePath: 'active.mjs', workerConfigPath: 'config.json', ...conflicting }), /only one fixed Worker|cannot be combined/);
  }
  await assert.rejects(() => assess({ observeNotification: true }), /requires --worker-bundle/);
});

test('shared checker preserves full source classification and generic Worker UNVERIFIED', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'notification-release-test-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    await mkdir(path.join(cwd, 'cloudflare'));
    await writeFile(path.join(cwd, 'cloudflare', 'notification.ts'), 'before');
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    await writeFile(path.join(cwd, 'cloudflare', 'notification.ts'), 'after');
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'candidate');
    const fixed = await assess({ cwd, base, observeNotification: true, workerBundlePath: 'active.mjs', workerConfigPath: 'config.json' });
    assert.equal(fixed.decision, 'UNVERIFIED');
    assert.equal(fixed.observed, null);
    assert.deepEqual(fixed.source.files, ['cloudflare/notification.ts']);
    assert.deepEqual(fixed.source.changedServices, ['worker']);
    assert.equal(fixed.authorization, 'NOT_AUTHORIZED');
    assert.equal(fixed.execution, 'NOT_EXECUTED');
    const generic = await assess({ cwd, base });
    assert.equal(generic.decision, 'UNVERIFIED');
    assert(generic.findings.some(finding => /own deployed version/.test(finding.message)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
