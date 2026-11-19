import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSparePreview } from '../release-spare-readback.mjs';
import { readQualificationHostingBuild } from '../release-evidence.mjs';
import { createSpareBuildIdentity, spareIdentityFile, sparePreviewMiddleware, spareSourceIdentity } from '../spare-preview-identity.mjs';

test('a consecutive spare build requires a new preview process and the current clean revision', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'spare-preview-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.name', 'Preview Test');
  git('config', 'user.email', 'preview@example.invalid');
  await writeFile(path.join(cwd, '.gitignore'), 'dist-spare/\n');
  await mkdir(path.join(cwd, 'dist-spare'));
  const commit = async value => {
    await writeFile(path.join(cwd, 'app.txt'), value);
    git('add', '.');
    git('commit', '-qm', value);
  };
  const build = async () => {
    const identity = createSpareBuildIdentity(spareSourceIdentity(cwd), {});
    await writeFile(spareIdentityFile(cwd), JSON.stringify(identity));
    return identity;
  };
  await commit('first');
  const first = await build();
  let middleware = sparePreviewMiddleware(cwd);
  const server = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise((resolve, reject) => server.listen(0, 'localhost', resolve).once('error', reject));
  const origin = 'http://localhost:5173';
  const read = () => readSparePreview({ cwd, origin, fetchImpl: (url, options) =>
    fetch('http://localhost:' + server.address().port + new URL(url).pathname, options) });
  assert.deepEqual((await read()).identity, first);
  await assert.rejects(readSparePreview({ cwd, origin, fetchImpl: async () =>
    new Response(JSON.stringify(first), { headers: { 'content-type': 'application/json' } }) }), /identity is unavailable/u);
  await commit('second');
  await assert.rejects(read, /does not match the clean candidate/u);
  const second = await build();
  assert.notEqual(first.buildId, second.buildId);
  await assert.rejects(read, /identity is unavailable/u);
  middleware = sparePreviewMiddleware(cwd);
  assert.deepEqual((await read()).identity, second);
  await writeFile(path.join(cwd, 'app.txt'), 'uncommitted');
  await assert.rejects(read, /does not match the clean candidate/u);
});

test('spare channel readback binds the served manifest and files to the local Hosting artifact', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'spare-channel-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const origin = 'https://luyentap-pdf-qa-20261021--qualification-release-fixture.web.app';
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const html = '<!doctype html><title>Candidate</title>';
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1',
    revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: digest(html) }] };
  const raw = JSON.stringify(manifest) + '\n';
  const manifestPath = '/.well-known/luyentap-release.json';
  await mkdir(path.join(cwd, 'dist', '.well-known'), { recursive: true });
  await writeFile(path.join(cwd, 'dist', manifestPath), raw);
  const read = remoteManifest => readQualificationHostingBuild({ cwd, origin, fetchImpl: async url =>
    new Response(url === origin + manifestPath ? remoteManifest : html) });
  assert.equal((await read(raw)).manifestSha256, digest(JSON.stringify(manifest)));
  await assert.rejects(read(JSON.stringify({ ...manifest, revision: 'c'.repeat(40) })), /Served manifest differs/u);
  await assert.rejects(readQualificationHostingBuild({ cwd, origin: 'https://kahut1.web.app' }), /disposable Hosting channel/u);
});
