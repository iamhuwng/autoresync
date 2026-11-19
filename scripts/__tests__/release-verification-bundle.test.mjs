import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectSourceState } from '../release-check.mjs';
import { createVerificationBundle, bundleBytes, bundleDigest, requireBrowserEvidence, requireReleaseReview, validateVerificationBundle, readVerificationBundle, publishVerificationBundle, verificationTag, isVerificationTagForSource, restoreVerifiedHostingArtifact, validateHostingArtifactBinding } from '../release-verification-bundle.mjs';
import { createPromotionCard, cardBytes, promotionEnvironment } from '../release-promotion.mjs';
import { runReleaseVerification } from '../release-verification.mjs';
import { createSpareBuildIdentity } from '../spare-preview-identity.mjs';

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
  await writeFile(path.join(cwd, '.gitignore'), 'dist/\ntmp/\n');
  await mkdir(path.join(cwd, 'src'));
  await writeFile(path.join(cwd, 'src/application.mjs'), 'export const message = "base";\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  await writeFile(path.join(cwd, 'src/application.mjs'), 'export const message = "application change";\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'application');
  const source = await collectSourceState(cwd, base);
  const record = { schemaVersion: 1, requirement: 'required', decision: 'verified', observedAt: new Date().toISOString(), method: 'Codex browser', scenario: 'application journey', sourceRevision: source.revision, sourceFingerprint: source.fingerprint, checks: [{ name: 'journey', result: 'passed' }], evidenceRefs: ['bundle://artifact/browser'], summary: 'journey passed' };
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), 'verification-evidence-')); t.after(() => rm(evidenceDir, { recursive: true, force: true }));
  const recordPath = path.join(evidenceDir, 'record.json'), environmentPath = path.join(evidenceDir, 'environment.env'), artifactPath = path.join(evidenceDir, 'browser.json'), output = path.join(evidenceDir, 'verification-bundle.json');
  await writeFile(recordPath, JSON.stringify(record)); await writeFile(environmentPath, 'ENV=fixture\n'); await writeFile(artifactPath, '{"journey":"passed"}\n');
  return { cwd, base, source, record, recordPath, environmentPath, artifactPath, output };
}
function provider(bytes, tag) {
  const calls = []; let release = { id: 42, tag_name: tag, draft: false, prerelease: true, immutable: true, assets: [{ name: 'verification-bundle.json', id: 7, size: bytes.length }] };
  return { calls, setImmutable(value) { release.immutable = value; }, exec(command, args, options) {
    assert.equal(command, 'gh'); calls.push(args);
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/immutable-releases') return { status: 0, stdout: JSON.stringify({ enabled: true }), stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { release: { databaseId: 42 } } } }), stderr: '' };
    if (args[0] === 'api' && args[1].startsWith('repos/iamhuwng/autoresync/git/ref/tags/')) return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: JSON.parse(bytes.toString('utf8')).source.revision } }), stderr: '' };
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
  assert.throws(() => requireReleaseReview(result.bundle), /requires a referenced release-review/u);
  assert.equal(bundleDigest(bundleBytes(result.bundle)), result.sha256);
  assert.deepEqual(JSON.parse(await readFile(f.output, 'utf8')), result.bundle);
});
test('browser-impacting release rejects missing visuals and stale or switched localhost previews', async t => {
  const f = await fixture(t);
  const create = evidence => createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath,
    environmentPath: f.environmentPath, environmentIdentity: 'spare', buildIdentity: 'none', evidence, output: f.output });
  const sourceOnly = await create([{ id: 'browser', file: f.artifactPath }]);
  assert.throws(() => requireBrowserEvidence(sourceOnly.bundle, f.source.files), /browser-impacting changes require/u);
  assert.doesNotThrow(() => requireBrowserEvidence(sourceOnly.bundle, ['src/application.test.mjs']));
  for (const file of ['firebase.json', 'package.json', 'package-lock.json']) {
    assert.throws(() => requireBrowserEvidence(sourceOnly.bundle, [file]), /browser-impacting changes require/u);
  }

  const identity = createSpareBuildIdentity({ revision: f.source.revision, tree: f.source.tree, clean: true }, {});
  const dir = path.dirname(f.recordPath);
  const before = { origin: 'http://localhost:5173', observedAt: new Date(Date.now() - 1000).toISOString(), identity };
  const after = { ...before, observedAt: new Date(Date.now() - 500).toISOString() };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f8AAAAASUVORK5CYII=', 'base64');
  const evidence = ['teacher-before.json', 'teacher-after.json', 'teacher-capture.png'].map(file =>
    ({ id: path.parse(file).name, file: path.join(dir, file) }));
  await writeFile(evidence[0].file, JSON.stringify(before));
  await writeFile(evidence[1].file, JSON.stringify(after));
  await writeFile(evidence[2].file, png);
  await writeFile(f.recordPath, JSON.stringify({ ...f.record, method: 'localhost-spare-browser',
    observedAt: new Date().toISOString(), evidenceRefs: evidence.map(item => 'bundle://artifact/' + item.id) }));
  const valid = await create(evidence);
  requireBrowserEvidence(valid.bundle, f.source.files);
  assert.equal(valid.bundle.artifacts[2].mediaType, 'image/png');
  const hosted = structuredClone(valid.bundle);
  hosted.verification.method = 'deployed-origin-browser';
  const retained = Buffer.from('fixture archive');
  const digest = hash('manifest');
  hosted.build = { identity: digest, hostingArtifact: { archiveId: 'hosting-artifact', manifestSha256: digest,
    environmentFingerprint: hash('environment'), buildInputFingerprint: hash('input') } };
  hosted.artifacts.push({ id: 'hosting-artifact', mediaType: 'application/gzip', size: retained.length,
    sha256: hash(retained), contentBase64: retained.toString('base64') });
  assert.throws(() => validateVerificationBundle(hosted), /requires a spare Hosting channel readback/u);
  for (const [phase, receipt] of [['before', before], ['after', after]]) {
    const id = 'channel-' + phase;
    hosted.verification.evidenceRefs.push('bundle://artifact/' + id);
    const bytes = Buffer.from(JSON.stringify({ origin: 'https://luyentap-pdf-qa-20261021--qualification-release-fixture.web.app',
      observedAt: receipt.observedAt, revision: f.source.revision, tree: f.source.tree, manifestSha256: digest }));
    hosted.artifacts.push({ id, mediaType: 'application/json', size: bytes.length, sha256: hash(bytes),
      contentBase64: bytes.toString('base64') });
  }
  hosted.verification.evidenceRefs.push('bundle://artifact/channel-capture');
  hosted.artifacts.push({ ...hosted.artifacts[2], id: 'channel-capture' });
  assert.doesNotThrow(() => validateVerificationBundle(hosted));
  hosted.build.hostingArtifact.manifestSha256 = hosted.build.identity = hash('new artifact');
  assert.throws(() => validateVerificationBundle(hosted), /differs from the tested candidate artifact/u);
  await assert.rejects(create(evidence.slice(0, 2)), /does not resolve/u);
  await writeFile(evidence[1].file, JSON.stringify({ ...after, identity: { ...identity, buildId: crypto.randomUUID() } }));
  await assert.rejects(create(evidence), /changed during the browser journey/u);
  await writeFile(evidence[1].file, JSON.stringify({ ...after, identity: { ...identity, revision: f.base } }));
  await assert.rejects(create(evidence), /does not match the clean candidate/u);
  await writeFile(evidence[1].file, JSON.stringify({ ...after, origin: 'https://kahut1.web.app' }));
  await assert.rejects(create(evidence), /invalid spare browser origin/u);
  await writeFile(evidence[1].file, JSON.stringify(after));
  await writeFile(evidence[2].file, 'not an image');
  await assert.rejects(create(evidence), /requires referenced PNG/u);

  await writeFile(evidence[2].file, png);
  const reviewFile = path.join(dir, 'release-review.json');
  evidence.push({ id: 'release-review', file: reviewFile });
  const record = JSON.parse(await readFile(f.recordPath, 'utf8'));
  record.evidenceRefs.push('bundle://artifact/release-review');
  await writeFile(f.recordPath, JSON.stringify(record));
  const review = { decision: 'pass', reviewer: 'codex', reviewedAt: new Date().toISOString(),
    criteria: [{ expectation: 'The requested state is visible after the action.',
      judgment: 'The capture shows the expected state after the action.', evidenceRefs: ['bundle://artifact/teacher-capture'] }],
    findings: [] };
  await writeFile(reviewFile, JSON.stringify(review));
  const reviewed = await create(evidence);
  assert.doesNotThrow(() => requireReleaseReview(reviewed.bundle));
  await writeFile(reviewFile, JSON.stringify({ ...review, reviewer: 'another-agent', decision: 'return-for-correction',
    findings: ['An unintended state appeared.'] }));
  await assert.rejects(create(evidence), /return the candidate for correction/u);
  await writeFile(reviewFile, JSON.stringify({ ...review, reviewedAt: before.observedAt }));
  await assert.rejects(create(evidence), /follow the verification/u);
  await writeFile(reviewFile, JSON.stringify({ ...review, criteria: [{ ...review.criteria[0],
    evidenceRefs: ['bundle://artifact/teacher-before'] }] }));
  await assert.rejects(create(evidence), /evaluate every retained browser capture/u);
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
  assert(isVerificationTagForSource(result.bundle.tag, result.bundle.source.revision));
  assert.throws(() => readVerificationBundle({ tag: result.bundle.tag, sha256: hash('wrong'), exec: remote.exec }), /readback digest differs/u);
  remote.setImmutable(false);
  assert.throws(() => readVerificationBundle({ tag: result.bundle.tag, sha256: result.sha256, exec: remote.exec }), /immutable prerelease/u);
});
test('publishes a source-keyed prerelease and reads back its exact asset', async t => {
  const f = await fixture(t);
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const remote = { release: null, calls: [], exec(command, args, options) {
    assert.equal(command, 'gh'); this.calls.push(args);
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/immutable-releases') return { status: 0, stdout: JSON.stringify({ enabled: true }), stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { release: this.release ? { databaseId: 42 } : null } } }), stderr: '' };
    if (args[0] === 'api' && args[1].startsWith('repos/iamhuwng/autoresync/git/ref/tags/')) return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: result.bundle.source.revision } }), stderr: '' };
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/releases/42') return { status: 0, stdout: JSON.stringify({ ...this.release, assets: this.release?.assets || [] }), stderr: '' };
    if (args[0] === 'release' && args[1] === 'create') { this.release = { id: 42, tag_name: result.bundle.tag, draft: true, prerelease: false, immutable: false, assets: [] }; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'release' && args[1] === 'upload') { this.release.assets = [{ name: 'verification-bundle.json', id: 7, size: result.bytes.length }]; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'release' && args[1] === 'edit') { this.release.draft = false; this.release.prerelease = true; this.release.immutable = true; return { status: 0, stdout: '{}', stderr: '' }; }
    if (args[0] === 'api' && args[1].includes('/releases/assets/7')) return { status: 0, stdout: result.bytes, stderr: '' };
    throw new Error(args.join(' '));
  } };
  const published = publishVerificationBundle({ bundleFile: f.output, exec: remote.exec.bind(remote) });
  assert.equal(published.sha256, result.sha256);
  assert(isVerificationTagForSource(result.bundle.tag, result.bundle.source.revision));
  assert(remote.calls.some(args => args[0] === 'release' && args[1] === 'edit'));
});
test('publishing fails closed when immutable releases are disabled', async t => {
  const f = await fixture(t);
  await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'acceptance-emulator', buildIdentity: 'none', evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const calls = [];
  const exec = (command, args) => {
    calls.push(args);
    if (args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/immutable-releases') return { status: 0, stdout: JSON.stringify({ enabled: false }), stderr: '' };
    throw new Error(args.join(' '));
  };
  assert.throws(() => publishVerificationBundle({ bundleFile: f.output, exec }), /immutable releases must be enabled/u);
  assert.equal(calls.some(args => args[0] === 'release' && args[1] === 'create'), false);
});
test('verification tags are source keyed and cannot be reused for another revision', () => {
  const tag = verificationTag('a'.repeat(40));
  assert.match(tag, /^verification-a{40}-[0-9a-f-]{36}$/u);
  assert(isVerificationTagForSource(tag, 'a'.repeat(40)));
  assert.throws(() => verificationTag('short'), /full Git revision/u);
});

test('tested Hosting bytes survive immutable readback, workflow restore and promotion-card validation', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.cwd, 'firebase.json'), '{"hosting":{"public":"dist"}}\n');
  await writeFile(path.join(f.cwd, '.firebaserc'), '{"projects":{"default":"temp-a1437"}}\n');
  await writeFile(path.join(f.cwd, 'src/application.test.mjs'), 'import test from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import { message } from "./application.mjs"; test("candidate source and built page", () => { assert.equal(message, "application change"); assert.ok(readFileSync("dist/index.html", "utf8").includes(message)); });\n');
  git(f.cwd, 'add', '.'); git(f.cwd, 'commit', '-qm', 'Hosting configuration');
  const source = await collectSourceState(f.cwd, f.base);
  const record = { ...f.record, sourceRevision: source.revision, sourceFingerprint: source.fingerprint };
  await writeFile(f.recordPath, JSON.stringify(record));
  await mkdir(path.join(f.cwd, 'dist/.well-known'), { recursive: true });
  const { message } = await import(new URL('file:///' + path.join(f.cwd, 'src/application.mjs').replaceAll('\\', '/')));
  const html = '<main>Verified candidate behavior: ' + message + '</main>';
  await writeFile(path.join(f.cwd, 'dist/index.html'), html);
  const environmentFingerprint = hash('production-only'), buildInputFingerprint = hash('production plus optional QA');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: source.revision, tree: source.tree, envFingerprint: environmentFingerprint, buildInputFingerprint, files: [{ path: '/index.html', sha256: hash(html) }] };
  await writeFile(path.join(f.cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
  const planFile = 'tmp/release-receipts/plan.json';
  await mkdir(path.join(f.cwd, 'tmp/release-receipts'), { recursive: true });
  await writeFile(path.join(f.cwd, planFile), JSON.stringify({ schemaVersion: 1, suites: [{ runner: 'node', files: ['src/application.test.mjs'] }] }));
  const verification = await runReleaseVerification({ cwd: f.cwd, base: f.base, planPath: planFile, envFingerprint: environmentFingerprint });
  assert.equal(verification.suites[0].counts.passed, 1);
  await writeFile(f.artifactPath, JSON.stringify(verification));
  const result = await createVerificationBundle({ cwd: f.cwd, base: f.base, recordPath: f.recordPath, environmentPath: f.environmentPath, environmentIdentity: 'isolated preview', buildIdentity: 'none', hostingArtifact: true, evidence: [{ id: 'browser', file: f.artifactPath }], output: f.output });
  const remote = provider(result.bytes, result.bundle.tag);
  const readback = readVerificationBundle({ tag: result.bundle.tag, sha256: result.sha256, exec: remote.exec });
  assert.equal(readback.bundle.build.identity, hash(JSON.stringify(manifest)));
  await rm(path.join(f.cwd, 'dist'), { recursive: true });
  // Run the same CLI that prepare uses. No build command or provider mutation runs.
  const inputsFile = path.join(path.dirname(f.output), 'promotion-inputs.json');
  await writeFile(inputsFile, JSON.stringify({ baseRevision: f.base, environmentFingerprint, verificationBundle: readback }));
  const restore = spawnSync(process.execPath, [path.resolve('scripts/release-promotion.mjs'), '--restore-artifact', inputsFile], { cwd: f.cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(restore.stdout.trim(), 'restored=true');
  assert.equal(await readFile(path.join(f.cwd, 'dist/index.html'), 'utf8'), html);
  const observed = { revision: f.base, tree: git(f.cwd, 'rev-parse', f.base + '^{tree}'), fingerprint: hash('live baseline') };
  const card = createPromotionCard({ cwd: f.cwd, assessment: { decision: 'PASS', target: 'hosting', productionEnvFingerprint: environmentFingerprint, source, observed }, assessmentSha256: hash('assessment'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: source.revision, planFile, planSha256: verification.planSha256, artifactSha256: hash(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence: record, verificationBundle: { tag: readback.tag, sha256: readback.sha256, bundle: readback.bundle }, impact: 'Synthetic application correction', missingProof: 'Synthetic provider only', includedScope: 'Hosting', excludedScope: 'Other services', recoveryTarget: 'Prior Hosting version', recoveryLimits: 'Hosting only' });
  const exported = promotionEnvironment(JSON.parse(cardBytes(card)));
  assert.equal(exported.LUYENTAP_RELEASE_ARTIFACT_SHA256, result.bundle.build.identity);
  for (const key of ['manifestSha256', 'environmentFingerprint', 'buildInputFingerprint']) {
    const altered = structuredClone(card); altered.artifact[key] = hash('other');
    assert.throws(() => cardBytes(altered), /differs|identity/u, key);
  }
  for (const [name, mutate] of [
    ['missing archive', bundle => { bundle.artifacts = bundle.artifacts.filter(a => a.id !== 'hosting-artifact'); }],
    ['altered archive', bundle => { bundle.artifacts.find(a => a.id === 'hosting-artifact').contentBase64 = 'YWx0ZXJlZA=='; }],
    ['wrong source', bundle => { bundle.source.tree = 'f'.repeat(40); }],
    ['stale', bundle => { bundle.createdAt = '2020-01-01T00:00:00.000Z'; }],
  ]) {
    const bundle = structuredClone(result.bundle); mutate(bundle);
    await assert.rejects(restoreVerifiedHostingArtifact({ cwd: f.cwd, bundle, source, environmentFingerprint }), undefined, name);
  }
  await assert.rejects(restoreVerifiedHostingArtifact({ cwd: f.cwd, bundle: result.bundle, source, environmentFingerprint: hash('another production environment') }), /environment differs/u);
  assert.throws(() => validateHostingArtifactBinding(result.bundle, { manifestSha256: hash('other') }), /differs/u);
  assert.equal(await restoreVerifiedHostingArtifact({ cwd: f.cwd }), false);
});
