import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { describeImpact, formatPlan, planRelease } from '../release-plan.mjs';
import { observeHosting } from '../release-evidence.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
async function fixture(t, { file = 'scripts/release-example.mjs', content = 'export const example = 1;\n', hotfixes = [] } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'luyentap-plan-test-'));
  t.after(async () => {
    assert.equal(path.dirname(cwd), path.resolve(os.tmpdir()));
    assert(path.basename(cwd).startsWith('luyentap-plan-test-'));
    await rm(cwd, { recursive: true, force: true });
  });
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Planner Test');
  git(cwd, 'config', 'user.email', 'planner@example.invalid');
  await mkdir(path.join(cwd, 'src'));
  await writeFile(path.join(cwd, '.gitignore'), 'tmp/\ndist/\n');
  await writeFile(path.join(cwd, 'src/App.js'), 'export const value = 1;\n');
  await writeFile(path.join(cwd, 'src/App.test.js'), 'test fixture\n');
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'baseline');
  const base = git(cwd, 'rev-parse', 'HEAD'), tree = git(cwd, 'rev-parse', 'HEAD^{tree}');
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), content);
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'candidate');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1',
    revision: base, tree, envFingerprint: hash('fixture environment'), hotfixes,
    files: [{ path: '/index.html', sha256: hash('fixture artifact') }] };
  const observed = await observeHosting({ maxAttempts: 1, fetchImpl: async url => new Response(
    url.endsWith('/.well-known/luyentap-release.json') ? JSON.stringify(manifest) : 'fixture artifact', { status: 200 }) });
  const envFile = path.join(cwd, 'tmp/env'); await mkdir(path.dirname(envFile)); await writeFile(envFile, 'fixture environment');
  return { cwd, base, envFile, hostingObservation: observed };
}

test('impact inspects changed content and never grants compatibility approval', () => {
  assert.equal(describeImpact(['src/style.css'], '-.x { color: red }\n+.x { color: blue }').presentationCandidate, true);
  const external = describeImpact(['src/style.css'], '+@import url(https://example.invalid/a.css);');
  assert.equal(external.presentationCandidate, false);
  const behavior = describeImpact(['src/Button.tsx'], '+onClick={() => setDoc(ref, payload)}');
  assert.equal(behavior.presentationCandidate, false);
  assert(behavior.signals.some(signal => signal.category === 'stateful'));
  assert(behavior.signals.some(signal => signal.category === 'contractual'));
  assert(describeImpact(['src/auth/access.ts'], '+const authorization = false;').signals.some(signal => signal.category === 'security-sensitive'));
  assert.equal(describeImpact(['src/style.css'], '').presentationCandidate, false);
});

test('native live baseline is selected automatically; normal source selection does not authorize deployment', async t => {
  const options = await fixture(t);
  const before = git(options.cwd, 'status', '--porcelain');
  const result = await planRelease(options);
  assert.equal(result.selection, 'NORMAL_CANDIDATE', JSON.stringify(result.blockers));
  assert.equal(result.source.baseRevision, options.base);
  assert.equal(result.integration.containsCandidate, true);
  assert.equal(result.integration.requiredCI, 'NOT_OBSERVED');
  assert.equal(result.verification.execution, 'NOT_RUN');
  assert.equal(result.authorization, 'NOT_AUTHORIZED');
  assert.equal(result.deploymentReady, false);
  assert.equal(git(options.cwd, 'status', '--porcelain'), before);
  assert.match(formatPlan(result), /remote\/CI not checked/u);
});

test('presentation hints cannot clear existing frontend compatibility gates', async t => {
  const options = await fixture(t, { file: 'src/style.css', content: '.x { color: blue }\n' });
  const result = await planRelease(options);
  assert.equal(result.impact.presentationCandidate, true);
  assert.equal(result.selection, 'QUALIFICATION_REQUIRED');
  assert(result.blockers.some(message => /compatibility review/iu.test(message)));
});

test('dirty source, stale explicit baseline and offline comparisons never become normal release selections', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.cwd, 'src/App.js'), 'export const value = 2;\n');
  assert.equal((await planRelease(options)).selection, 'CLEAN_CANDIDATE_REQUIRED');
  const stale = await planRelease({ ...options, base: 'HEAD' });
  assert(stale.blockers.some(message => /base does not match observed/u.test(message)));
  const { hostingObservation, ...offline } = options;
  const result = await planRelease({ ...offline, offline: true });
  assert.equal(result.live, null);
  assert(result.blockers.some(message => /Offline comparison/u.test(message)));
  await assert.rejects(planRelease({ ...offline, base: undefined, offline: true }), /explicit --base/u);
  await assert.rejects(planRelease({ ...options, hostingObservation: JSON.parse(JSON.stringify(hostingObservation)) }), /native Hosting observation/u);
});

test('unintegrated candidate and missing live Git objects are explained rather than silently reconstructed', async t => {
  const options = await fixture(t);
  git(options.cwd, 'branch', 'integration', options.base);
  const result = await planRelease({ ...options, integrationRef: 'refs/heads/integration' });
  assert.equal(result.selection, 'INTEGRATION_REQUIRED');
  assert.equal(result.integration.containsCandidate, false);
  const unknown = await planRelease({ ...options, base: 'f'.repeat(40) });
  assert.equal(unknown.selection, 'SOURCE_EVIDENCE_REQUIRED');
  assert(unknown.blockers.some(message => /Candidate assessment unavailable/u.test(message)));
});

test('hotfix disagreements and affected test suggestions come from the selected source and shared assessment', async t => {
  const options = await fixture(t, { file: 'src/App.js', content: 'export const value = 2;\n' });
  const result = await planRelease(options);
  assert.deepEqual(result.verification.suggestedTests, ['src/App.test.js']);
  const bytes = await readFile(path.join(options.cwd, 'src/App.js'), 'utf8');
  assert.equal(bytes, 'export const value = 2;\n');
  const hotfix = await fixture(t, { hotfixes: [{ revision: 'f'.repeat(40) }] });
  assert((await planRelease(hotfix)).blockers.some(message => /Hotfix .*Git evidence unavailable/u.test(message)));
});
