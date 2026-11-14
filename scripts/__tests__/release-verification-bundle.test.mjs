import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectSourceState } from '../release-check.mjs';
import { createVerificationBundle, bundleBytes, bundleDigest, validateVerificationBundle, readVerificationBundle, publishVerificationBundle, verificationTag } from '../release-verification-bundle.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
async function fixture(t) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'verification-bundle-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q'); git(cwd, 'config', 'user.name', 'Verification Test'); git(cwd, 'config', 'user.email', 'verification@example.invalid');
  await writeFile(path.join(cwd, 'src.txt'), 'base\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  await writeFile(path.join(cwd, 'src.txt'), 'application change\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'application');
  const source = await collectSourceState(cwd, base);
  const record = { schemaVersion: 1, requirement: 'required', decision: 'verified', observedAt: new Date().toISOString(), method: 'Codex browser', scenario: 'application journey', sourceRevision: source.revision, sourceFingerprint: source.fingerprint, checks: [{ name: 'journey', result: 'passed' }], evidenceRefs: ['bundle://artifact/browser'], summary: 'journey passed' };
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), 'verification-evidence-')); t.after(() => rm(evidenceDir, { recursive: true, force: true }));
  const recordPath = path.join(evidenceDir, 'record.json'), environmentPath = path.join(evidenceDir, 'environment.env'), artifactPath = path.join(evidenceDir, 'browser.json'), output = path.join(evidenceDir, 'bundle.json');
  await writeFile(recordPath, JSON.stringify(record)); await writeFile(environmentPath, 'ENV=fixture\n'); await writeFile(artifactPath, '{"journey":"passed"}\n');
  return { cwd, base, source, record, recordPath, environmentPath, artifactPath, output };
}
function provider(bytes, tag) {
  const calls = []; let release = { id: 42, tag_name: tag, draft: false, prerelease: true, assets: [{ name: 'verification-bundle.json', id: 7, size: bytes.length }] };
  return { calls, exec(command, args, options) {
    assert.equal(command, 'gh'); calls.push(args);
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { release: { databaseId: 42 } } } }), stderr: '' };
    if (args[0] === 'api' && args[1].startsWith('repos/iamhuwng/autoresync/git/ref/tags/')) return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: tag.replace('verification-', '') } }), stderr: '' };
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/releases/42') return { status: 0, stdout: JSON.stringify(release), stderr: '' };
    if (args[0] === 'api' && args[1].includes('/releases/assets/7')) return { status: 0, stdout: bytes, stderr: '' };
    throw new Error(args.join(' '));
  } };
}
test('creates an external source-bound bundle for a realistic application change', async t => {
  const f = await fixture(t);
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath, mediaType: 'application/json' }], output: f.output });
  assert.equal(result.bundle.source.revision, f.source.revision);
  assert.equal(result.bundle.source.baseRevision, f.base);
  assert.equal(result.bundle.verification.sourceFingerprint, f.source.fingerprint);
  assert.equal(result.bundle.verification.evidenceRefs[0], 'bundle://artifact/browser');
  assert.equal(bundleDigest(bundleBytes(result.bundle)), result.sha256);
  assert.deepEqual(JSON.parse(await readFile(f.output, 'utf8')), result.bundle);
});
test('rejects missing, stale, mismatched, fabricated and altered evidence', async t => {
  const f = await fixture(t);
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const cases = [
    ['missing reference', value => { value.verification.evidenceRefs = ['bundle://artifact/missing']; }],
    ['altered artifact', value => { value.artifacts[0].contentBase64 = Buffer.from('altered').toString('base64'); }],
    ['wrong revision', value => { value.source.revision = 'a'.repeat(40); }],
    ['stale', value => { value.createdAt = '2020-01-01T00:00:00.000Z'; }],
    ['wrong environment', value => { value.environment.fingerprint = hash('other'); }],
  ];
  for (const [name, mutate] of cases) { const value = structuredClone(result.bundle); mutate(value); assert.throws(() => validateVerificationBundle(value, { environmentFingerprint: result.bundle.environment.fingerprint }), undefined, name); }
});
test('readback validates retained bundle bytes and digest', async t => {
  const f = await fixture(t);
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const remote = provider(result.bytes, result.bundle.tag);
  const readback = readVerificationBundle({ tag: result.bundle.tag, sha256: result.sha256, exec: remote.exec });
  assert.equal(readback.sha256, result.sha256);
  assert.throws(() => readVerificationBundle({ tag: result.bundle.tag, sha256: hash('wrong'), exec: remote.exec }), /readback digest differs/u);
});
test('publishes a source-keyed prerelease and reads back its exact asset', async t => {
  const f = await fixture(t);
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const remote = { release: null, calls: [], exec(command, args, options) {
    assert.equal(command, 'gh'); this.calls.push(args);
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { release: this.release ? { databaseId: 42 } : null } } }), stderr: '' };
    if (args[0] === 'api' && args[1].startsWith('repos/iamhuwng/autoresync/git/ref/tags/')) return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: result.bundle.source.revision } }), stderr: '' };
    if (args[0] === 'api' && args[1].startsWith('repos/iamhuwng/autoresync/git/ref/tags/')) return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: tag.replace('verification-', '') } }), stderr: '' };
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/releases/42') return { status: 0, stdout: JSON.stringify({ ...this.release, assets: this.release?.assets || [] }), stderr: '' };
    if (args[0] === 'release' && args[1] === 'create') { this.release = { id: 42, tag_name: result.bundle.tag, draft: true, prerelease: false, assets: [] }; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'release' && args[1] === 'upload') { this.release.assets = [{ name: 'verification-bundle.json', id: 7, size: result.bytes.length }]; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'release' && args[1] === 'edit') { this.release.draft = false; this.release.prerelease = true; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'api' && args[1].includes('/releases/assets/7')) return { status: 0, stdout: result.bytes, stderr: '' };
    throw new Error(args.join(' '));
  } };
  const published = publishVerificationBundle({ bundleFile: f.output, exec: remote.exec.bind(remote) });
  assert.equal(published.sha256, result.sha256);
  assert(remote.calls.some(args => args[0] === 'release' && args[1] === 'edit'));
});
test('verification tags are source keyed and cannot be reused for another revision', () => {
  assert.equal(verificationTag('a'.repeat(40)), 'verification-' + 'a'.repeat(40));
  assert.throws(() => verificationTag('short'), /full Git revision/u);
});