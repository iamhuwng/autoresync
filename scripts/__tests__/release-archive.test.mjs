import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import * as tar from 'tar';
import { collectSourceState } from '../release-check.mjs';
import { writeHostingManifest } from '../release-evidence.mjs';
import { assertHostingArtifact, createHostingArchive, isHostingArchive, readHostingArchive, recordHostingArchiveOutcome } from '../release-archive.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
async function fixture(t) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'release-archive-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q'); git(cwd, 'config', 'user.name', 'Archive Test'); git(cwd, 'config', 'user.email', 'archive@example.invalid');
  git(cwd, 'remote', 'add', 'origin', 'https://github.com/iamhuwng/autoresync.git');
  await writeFile(path.join(cwd, '.gitignore'), 'dist/\n');
  await writeFile(path.join(cwd, 'source.txt'), 'retained exact source');
  await writeFile(path.join(cwd, '.gitattributes'), '*.ps1 text eol=crlf\n');
  await writeFile(path.join(cwd, 'source.ps1'), 'Write-Output retained\n');
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'candidate');
  const revision = git(cwd, 'rev-parse', 'HEAD');
  await mkdir(path.join(cwd, 'dist'));
  await writeFile(path.join(cwd, 'dist/index.html'), '<h1>retained artifact</h1>');
  const expectedManifest = await writeHostingManifest({ cwd, envFingerprint: 'a'.repeat(64) });
  const source = await collectSourceState(cwd, revision);
  const id = crypto.randomUUID(), config = { firebase: { hosting: { target: 'kahut1', public: 'dist' } } };
  const intent = { schemaVersion: 1, id, expectedManifest, source, verification: { decision: 'PASS', source: { ...source }, envFingerprint: expectedManifest.envFingerprint }, config,
    assessment: { decision: 'PASS', source: { ...source }, observed: { revision: source.baseRevision }, compatibilityReview: null },
    before: { identity: 'temp-a1437/kahut1', provider: { version: 'projects/temp-a1437/sites/kahut1/versions/abc123', releaseTime: '2026-11-11T00:00:00.000Z' } },
    envFingerprint: expectedManifest.envFingerprint, request: { id, targets: [{ id: 'firebase:temp-a1437:hosting:kahut1', operation: 'deploy',
      binding: { sourceRevision: source.revision, sourceFingerprint: source.fingerprint,
        artifactSha256: hash(JSON.stringify(expectedManifest)), configSha256: hash(JSON.stringify(config)) } }] } };
  return { cwd, id, intent, sourceRef: 'refs/heads/release-test' };
}

function provider(source) {
  let release = null, assetId = 1;
  const files = new Map(), calls = [];
  const state = { missingRef: false, movedRef: false, corruptAsset: null, missingAsset: null, annotated: false };
  const exec = (command, args, options) => {
    assert.equal(command, 'gh'); calls.push(args);
    const json = value => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
    if (args[0] === 'api') {
      if (args[1] === 'graphql') {
        assert(args.includes(`tag=${release?.tag_name}`), 'lookup must use the exact operation tag');
        return json({ data: { repository: { release: release ? { databaseId: release.id } : null } } });
      }
      const endpoint = args[1].replace('repos/iamhuwng/autoresync/', '');
      if (endpoint === 'git/refs' && args.includes('POST')) return json({ object: { type: 'commit', sha: source.revision } });
      if (endpoint.startsWith('git/ref/')) {
        if (state.missingRef) return { status: 1, stderr: 'reference not found' };
        const sha = state.movedRef && endpoint.includes('/heads/') ? 'b'.repeat(40) : source.revision;
        return json({ object: { type: state.annotated ? 'tag' : 'commit', sha } });
      }
      if (endpoint.startsWith('git/tags/')) return json({ object: { type: 'commit', sha: source.revision } });
      if (endpoint.startsWith('git/commits/')) return json({ sha: endpoint.split('/').at(-1), tree: { sha: source.tree } });
      if (endpoint.startsWith('releases/tags/')) {
        if (!release || release.draft) return { status: 1, stderr: 'HTTP 404: published release not found' };
        assert.fail('draft archives must not rely on published-release lookup');
      }
      if (endpoint === `releases/${release?.id}`) {
        return json({ ...release, assets: [...files].filter(([name]) => name !== state.missingAsset).map(([name, value]) => ({ name, id: value.id, size: value.bytes.length })) });
      }
      if (endpoint.startsWith('releases/assets/')) {
        assert.equal(options.encoding, null);
        const [name, value] = [...files].find(([, value]) => value.id === Number(endpoint.split('/').at(-1)));
        const bytes = Buffer.from(value.bytes);
        if (state.corruptAsset === name) bytes[0] ^= 1;
        return { status: 0, stdout: bytes };
      }
    }
    if (args[0] === 'release' && args[1] === 'create') {
      assert.equal(release, null, 'must not overwrite a release');
      release = { id: 1234, tag_name: args[2], draft: true };
      return json({});
    }
    if (args[0] === 'release' && args[1] === 'upload') {
      for (const file of args.slice(3, args.indexOf('--repo'))) {
        const name = path.basename(file); assert(!files.has(name), 'must not overwrite an asset');
        files.set(name, { id: assetId++, bytes: readFileSync(file) });
      }
      return json({});
    }
    if (args[0] === 'release' && args[1] === 'edit') { release.draft = false; return json({}); }
    assert.fail(`unexpected gh command ${args.join(' ')}`);
  };
  return { exec, files, calls, state, get release() { return release; } };
}

test('inaccessible or mismatched draft identity stops before reading assets', async () => {
  const id = crypto.randomUUID();
  for (const kind of ['inaccessible', 'wrong-id', 'wrong-tag']) {
    const exec = (command, args) => {
      assert.equal(command, 'gh');
      const value = args[1] === 'graphql'
        ? { data: { repository: { release: kind === 'inaccessible' ? null : { databaseId: 1234 } } } }
        : { id: kind === 'wrong-id' ? 9999 : 1234, tag_name: 'another-operation' };
      if (args[1] !== 'graphql') assert.equal(args[1], 'repos/iamhuwng/autoresync/releases/1234');
      return { status: 0, stdout: JSON.stringify(value), stderr: '' };
    };
    await assert.rejects(readHostingArchive({ id }, { exec }), /not found or not accessible|identity differs/u);
  }
});

test('retains and restores exact source/artifact, reopens remotely, and appends outcomes', async t => {
  const request = await fixture(t), remote = provider(request.intent.source);
  remote.state.annotated = true;
  const archive = await createHostingArchive(request, remote);
  assert(isHostingArchive(archive)); assert(!isHostingArchive({ ...archive }));
  assert.deepEqual(archive.intent, request.intent);
  assert.equal(remote.release.draft, true);
  assert(!remote.calls.some(args => args[0] === 'release' && args[1] === 'edit'));
  assert(!remote.calls.some(args => args[0] === 'api' && args[1].includes('/releases/tags/')));
  assert(remote.calls.some(args => args[0] === 'api' && args[1] === 'graphql'));
  assert(remote.calls.some(args => args[0] === 'api' && args[1] === 'repos/iamhuwng/autoresync/releases/1234'));
  assert.equal(archive.sha256, hash(remote.files.get('intent.json').bytes));
  assert(Object.isFrozen(archive.intent.source));
  const restore = path.join(request.cwd, 'restore'); await mkdir(restore);
  for (const name of ['source.tar.gz', 'artifact.tar.gz']) {
    const file = path.join(request.cwd, name); await writeFile(file, remote.files.get(name).bytes);
    const destination = path.join(restore, name); await mkdir(destination);
    tar.x({ file, cwd: destination, sync: true });
  }
  assert.equal(await readFile(path.join(restore, 'source.tar.gz/source.txt'), 'utf8'), 'retained exact source');
  assert.equal(await readFile(path.join(restore, 'artifact.tar.gz/index.html'), 'utf8'), '<h1>retained artifact</h1>');
  remote.state.movedRef = true;
  const reopened = await readHostingArchive({ id: archive.id, sha256: archive.sha256 }, remote);
  assert(isHostingArchive(reopened), 'historical archive survives source branch advancing');
  const outcome = verification => ({ outcomes: [{ id: 'firebase:temp-a1437:hosting:kahut1', publication: 'published', verification, providerIdentity: 'hosting/version-1' }] });
  const firstOutcome = await recordHostingArchiveOutcome(reopened, outcome('passed'), remote);
  assert.deepEqual(await recordHostingArchiveOutcome(reopened, outcome('passed'), remote), firstOutcome);
  await recordHostingArchiveOutcome(reopened, outcome('failed'), remote);
  await assert.rejects(recordHostingArchiveOutcome(reopened, { outcomes: [{ ...outcome('passed').outcomes[0], id: 'another-service' }] }, remote), /invalid Hosting outcome/u);
  assert.equal([...remote.files.keys()].filter(name => name.startsWith('outcome-')).length, 2);
  await assert.rejects(recordHostingArchiveOutcome({ ...reopened }, {}, remote), /trusted retained/u);
});

test('missing or altered source ref stops before retaining or publishing', async t => {
  for (const state of ['missingRef', 'movedRef']) await t.test(state, async t => {
    const request = await fixture(t), remote = provider(request.intent.source); remote.state[state] = true;
    await assert.rejects(createHostingArchive(request, remote), /reference not found|remote source ref differs/u);
    assert.equal(remote.release, null);
  });
});

test('compressed source retains committed Gitlink pointers without linked repository contents', async t => {
  const request = await fixture(t), linkedRevision = request.intent.source.revision;
  await mkdir(path.join(request.cwd, 'linked-repository'));
  git(request.cwd, 'update-index', '--add', '--cacheinfo', `160000,${linkedRevision},linked-repository`);
  git(request.cwd, 'commit', '-qm', 'retain linked repository pointer');
  const revision = git(request.cwd, 'rev-parse', 'HEAD');
  request.intent.source = await collectSourceState(request.cwd, revision);
  request.intent.verification.source = { ...request.intent.source };
  request.intent.assessment.source = { ...request.intent.source };
  request.intent.assessment.observed.revision = revision;
  request.intent.expectedManifest = await writeHostingManifest({ cwd: request.cwd, envFingerprint: request.intent.envFingerprint });
  request.intent.request.targets[0].binding = { ...request.intent.request.targets[0].binding,
    sourceRevision: revision, sourceFingerprint: request.intent.source.fingerprint, artifactSha256: hash(JSON.stringify(request.intent.expectedManifest)) };
  const remote = provider(request.intent.source), archive = await createHostingArchive(request, remote);
  const original = JSON.parse(remote.files.get('intent.json').bytes);
  assert.deepEqual(original.sourceGitlinks, [{ path: 'linked-repository', revision: linkedRevision }]);
  assert.deepEqual([...remote.files.get('source.tar.gz').bytes.subarray(0, 2)], [0x1f, 0x8b]);
  assert(isHostingArchive(await readHostingArchive({ id: archive.id, sha256: archive.sha256 }, remote)));
  const entries = [];
  const retainedFile = path.join(request.cwd, 'retained-source.tar.gz');
  await writeFile(retainedFile, remote.files.get('source.tar.gz').bytes);
  tar.t({ file: retainedFile, sync: true, onReadEntry: entry => entries.push(entry.path) });
  assert(!entries.some(name => name.startsWith('linked-repository/')) || entries.filter(name => name.startsWith('linked-repository/')).every(name => name === 'linked-repository/'));
  for (const gitlinks of [undefined, [], [{ path: '../unsafe', revision: linkedRevision }],
    [...original.sourceGitlinks, ...original.sourceGitlinks], [{ path: 'source.txt/child', revision: linkedRevision }],
    [{ path: 'linked-repository', revision: 'b'.repeat(40) }]]) {
    remote.files.get('intent.json').bytes = Buffer.from(JSON.stringify({ ...original, sourceGitlinks: gitlinks }));
    await assert.rejects(readHostingArchive({ id: archive.id }, remote), /sourceGitlinks|source Gitlink|conflicts with a Gitlink|declared Git tree/u);
  }
});

test('artifact omissions, extras, drift and unsafe manifests stop before remote writes', async t => {
  for (const change of ['missing', 'extra', 'drift', 'duplicate', 'unsafe']) await t.test(change, async t => {
    const request = await fixture(t), remote = provider(request.intent.source);
    if (change === 'missing') await rm(path.join(request.cwd, 'dist/index.html'));
    if (change === 'extra') await writeFile(path.join(request.cwd, 'dist/extra.txt'), 'extra');
    if (change === 'drift') await writeFile(path.join(request.cwd, 'dist/index.html'), 'drift');
    if (change === 'duplicate') request.intent.expectedManifest.files.push(request.intent.expectedManifest.files[0]);
    if (change === 'unsafe') request.intent.expectedManifest.files[0].path = '/../outside';
    await assert.rejects(createHostingArchive(request, remote), /artifact|manifest/u);
    assert.equal(remote.release, null);
  });
});

test('readback drift leaves draft recoverable and refuses a trusted handle', async t => {
  const request = await fixture(t), remote = provider(request.intent.source);
  remote.state.corruptAsset = 'source.tar.gz';
  await assert.rejects(createHostingArchive(request, remote), /readback hash differs/u);
  assert.equal(remote.release.draft, true);
  assert(!remote.calls.some(args => args[0] === 'release' && args[1] === 'edit'));
  await assert.rejects(readHostingArchive({ id: request.id }, remote), /readback hash differs/u);
});

test('source archives with export omissions cannot claim an exact source tree', async t => {
  const request = await fixture(t);
  await writeFile(path.join(request.cwd, '.gitattributes'), 'source.txt export-ignore\n');
  git(request.cwd, 'add', '.gitattributes'); git(request.cwd, 'commit', '-qm', 'archive omission');
  const revision = git(request.cwd, 'rev-parse', 'HEAD');
  request.intent.source = await collectSourceState(request.cwd, revision);
  request.intent.verification.source = request.intent.source;
  request.intent.assessment.source = request.intent.source;
  request.intent.assessment.observed.revision = revision;
  request.intent.expectedManifest = await writeHostingManifest({ cwd: request.cwd, envFingerprint: request.intent.envFingerprint });
  request.intent.request.targets[0].binding = { ...request.intent.request.targets[0].binding,
    sourceRevision: revision, sourceFingerprint: request.intent.source.fingerprint, artifactSha256: hash(JSON.stringify(request.intent.expectedManifest)) };
  const remote = provider(request.intent.source);
  await assert.rejects(createHostingArchive(request, remote), /does not restore the declared Git tree/u);
  assert.equal(remote.release, null);
});

test('dirty source, foreign origin and credential metadata fail before remote writes', async t => {
  for (const change of ['dirty', 'origin', 'credentials', 'unsafe-ref', 'artifact-binding', 'config-binding']) await t.test(change, async t => {
    const request = await fixture(t), remote = provider(request.intent.source);
    if (change === 'dirty') await writeFile(path.join(request.cwd, 'source.txt'), 'unreviewed');
    if (change === 'origin') git(request.cwd, 'remote', 'set-url', 'origin', 'https://github.com/another/repository.git');
    if (change === 'credentials') request.intent.review = { credentials: 'do not retain' };
    if (change === 'unsafe-ref') request.sourceRef = 'refs/heads/../main';
    if (change === 'artifact-binding') request.intent.request.targets[0].binding.artifactSha256 = '0'.repeat(64);
    if (change === 'config-binding') request.intent.config.firebase.hosting.public = 'other';
    await assert.rejects(createHostingArchive(request, remote), /dirty|fixed release repository|credential fields|fully qualified|binding differs/u);
    assert.equal(remote.release, null);
  });
});

test('resume rejects missing assets, changed bytes and mismatched intent digest', async t => {
  const request = await fixture(t), remote = provider(request.intent.source);
  const archive = await createHostingArchive(request, remote);
  remote.state.missingAsset = 'artifact.tar.gz';
  await assert.rejects(readHostingArchive(archive, remote), /missing or duplicate retained asset/u);
  remote.state.missingAsset = null; remote.state.corruptAsset = 'artifact.tar.gz';
  await assert.rejects(readHostingArchive(archive, remote), /readback hash differs/u);
  remote.state.corruptAsset = null;
  await assert.rejects(readHostingArchive({ id: archive.id, sha256: '0'.repeat(64) }, remote), /intent readback hash differs/u);
  await writeFile(path.join(request.cwd, 'dist/index.html'), 'tampered after archival');
  await assert.rejects(assertHostingArtifact(request.cwd, request.intent.expectedManifest), /artifact hash differs/u);
  const alteredTar = path.join(request.cwd, 'altered-source.tar.gz');
  tar.c({ file: alteredTar, cwd: request.cwd, sync: true }, ['source.txt']);
  remote.files.get('source.tar.gz').bytes = await readFile(alteredTar);
  const record = JSON.parse(remote.files.get('intent.json').bytes);
  record.sourceTarSha256 = hash(remote.files.get('source.tar.gz').bytes);
  remote.files.get('intent.json').bytes = Buffer.from(JSON.stringify(record));
  await assert.rejects(readHostingArchive({ id: archive.id }, remote), /does not restore the declared Git tree/u);
  tar.c({ file: alteredTar, cwd: request.cwd, prefix: '.GiT. ', sync: true }, ['source.txt']);
  remote.files.get('source.tar.gz').bytes = await readFile(alteredTar);
  record.sourceTarSha256 = hash(remote.files.get('source.tar.gz').bytes);
  remote.files.get('intent.json').bytes = Buffer.from(JSON.stringify(record));
  await assert.rejects(readHostingArchive({ id: archive.id }, remote), /unsafe or duplicate archive entry/u);
});

test('self-consistent JSON cannot substitute verification, assessment, environment or prior provider bindings', async t => {
  const request = await fixture(t), remote = provider(request.intent.source);
  for (const change of [
    intent => { intent.verification.source.fingerprint = '0'.repeat(64); },
    intent => { intent.assessment.decision = 'UNVERIFIED'; },
    intent => { intent.assessment.observed.revision = '0'.repeat(40); },
    intent => { intent.verification.envFingerprint = '0'.repeat(64); },
    intent => { intent.before.provider.version = 'projects/another/sites/kahut1/versions/abc'; },
    intent => { intent.review = { sha256: '0'.repeat(64) }; },
  ]) {
    const intent = structuredClone(request.intent); change(intent);
    await assert.rejects(createHostingArchive({ ...request, intent }, remote), /binding differs|provider identity/u);
  }
  assert.equal(remote.release, null);
});
