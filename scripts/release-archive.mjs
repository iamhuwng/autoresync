import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as tar from 'tar';
import { collectSourceState } from './release-check.mjs';
import { validateReleaseRequest } from './lib/releaseChangelog.mjs';

const repository = 'iamhuwng/autoresync';
const manifestPath = '.well-known/luyentap-release.json';
const handles = new WeakSet();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const fail = message => { throw new Error(`Hosting archive: ${message}`); };
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const shaPattern = /^[a-f0-9]{64}$/u;
const tag = id => { if (!idPattern.test(id)) fail('operation id must be a UUID'); return `hosting-operation-${id}`; };
const safePath = name => typeof name === 'string' && name && !name.includes('\\') && !name.includes('\0')
  && !/[\r\n:]/u.test(name) && !name.startsWith('/') && !name.split('/').some(part => part === '..' || part === '.' || part.replace(/[. ]+$/u, '').toLowerCase() === '.git');
const command = (executable, args, options = {}, exec = spawnSync) => {
  const result = exec(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) fail(`${executable} ${args[0]} failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout;
};
const git = (cwd, args) => command('git', args, { cwd }).trim();
const gh = (args, exec) => command('gh', args, {}, exec);
const api = (endpoint, exec) => JSON.parse(gh(['api', `repos/${repository}/${endpoint}`], exec));
const withTemporary = async action => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luyentap-hosting-archive-'));
  try { return await action(directory); } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('luyentap-hosting-archive-')) fail('unsafe temporary cleanup path');
    await rm(directory, { recursive: true, force: true });
  }
};

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.environment !== 'production'
    || manifest.project !== 'temp-a1437' || manifest.site !== 'kahut1'
    || !/^[a-f0-9]{40}$/u.test(manifest.revision || '') || !/^[a-f0-9]{40}$/u.test(manifest.tree || '')
    || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 2000) fail('invalid production manifest');
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || !file.path.startsWith('/') || !safePath(file.path.slice(1))
      || file.path.slice(1) === manifestPath || !shaPattern.test(file.sha256 || '') || paths.has(file.path)) fail('unsafe or duplicate manifest entry');
    paths.add(file.path);
  }
  if (!paths.has('/index.html')) fail('manifest lacks index.html');
}

export async function assertHostingArtifact(cwd, expectedManifest) {
  validateManifest(expectedManifest);
  const root = path.join(cwd, 'dist');
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) fail('artifact root must be a directory');
  const expected = new Map(expectedManifest.files.map(file => [file.path.slice(1), file.sha256]));
  expected.set(manifestPath, null);
  let total = 0;
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), name = path.relative(root, file).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) fail('artifact contains a symlink');
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile() || !expected.has(name)) fail(`unexpected artifact entry ${name}`);
      const size = (await lstat(file)).size;
      total += size;
      if (size > 32 * 1024 * 1024 || total > 256 * 1024 * 1024) fail('artifact exceeds size bound');
      const bytes = await readFile(file);
      if (name === manifestPath) {
        if (JSON.stringify(JSON.parse(bytes)) !== JSON.stringify(expectedManifest)) fail('artifact manifest differs from intent');
      } else if (digest(bytes) !== expected.get(name)) fail(`artifact hash differs: ${name}`);
      expected.delete(name);
    }
  };
  await visit(root);
  if (expected.size) fail(`artifact entries missing: ${[...expected.keys()].join(', ')}`);
}

function validateIntent(intent, id) {
  const keys = ['schemaVersion', 'id', 'request', 'expectedManifest', 'before', 'source', 'envFingerprint', 'verification', 'assessment', 'review', 'config'];
  if (!intent || Object.getPrototypeOf(intent) !== Object.prototype || Object.keys(intent).some(key => !keys.includes(key))
    || intent.schemaVersion !== 1 || intent.id !== id) fail('invalid operation intent');
  validateManifest(intent.expectedManifest);
  validateReleaseRequest(intent.request);
  const selectedIds = intent.request.targets[0]?.changeIds;
  if (selectedIds !== undefined && JSON.stringify(selectedIds) !== JSON.stringify(intent.review?.changeIds)) fail('reviewed change associations differ from retained intent');
  if (intent.source?.revision !== intent.expectedManifest.revision || intent.source?.tree !== intent.expectedManifest.tree) fail('intent source differs from manifest');
  const target = intent.request?.targets?.[0], binding = target?.binding;
  if (intent.request?.id !== id || intent.request.targets.length !== 1 || target.id !== 'firebase:temp-a1437:hosting:kahut1'
    || target.operation !== 'deploy' || binding?.sourceRevision !== intent.source.revision || !shaPattern.test(binding?.sourceFingerprint || '')
    || binding.artifactSha256 !== digest(JSON.stringify(intent.expectedManifest))
    || !intent.config || binding.configSha256 !== digest(JSON.stringify(intent.config))) fail('request target/source/artifact/config binding differs');
  if (!shaPattern.test(intent.envFingerprint || '') || intent.envFingerprint !== intent.expectedManifest.envFingerprint) fail('environment binding differs');
  const sourceKeys = ['revision', 'tree', 'baseRevision', 'fingerprint'];
  if (intent.source.dirty !== false || !/^[a-f0-9]{40}$/u.test(intent.source.baseRevision || '') || !shaPattern.test(intent.source.fingerprint || '')
    || intent.verification?.decision !== 'PASS' || intent.verification.envFingerprint !== intent.envFingerprint
    || intent.verification.source?.dirty !== false || intent.assessment?.source?.dirty !== false
    || !sourceKeys.every(key => intent.verification.source[key] === intent.source[key] && intent.assessment.source[key] === intent.source[key])
    || !['PASS', 'NOT_APPLICABLE'].includes(intent.assessment.decision)
    || intent.assessment.observed?.revision !== intent.source.baseRevision) fail('source verification/assessment binding differs');
  if (intent.before?.identity !== 'temp-a1437/kahut1' || !/^projects\/temp-a1437\/sites\/kahut1\/versions\/[a-z0-9]+$/u.test(intent.before.provider?.version || '')
    || !Number.isFinite(Date.parse(intent.before.provider.releaseTime))) fail('invalid prior Hosting provider identity');
  if (JSON.stringify(intent.review ?? null) !== JSON.stringify(intent.assessment.compatibilityReview ?? null)) fail('review binding differs');
  const dependencies = intent.assessment.hostingDependencies;
  if (Boolean(dependencies) !== Boolean(intent.review?.dependenciesFingerprint)) fail('Hosting dependency retention binding differs');
  if (dependencies && (intent.assessment.target !== 'hosting' || dependencies.scope !== 'hosting-dependencies'
    || dependencies.workerDeploymentReady !== false || !shaPattern.test(dependencies.fingerprint || '')
    || !shaPattern.test(dependencies.providerFingerprint || '')
    || dependencies.fingerprint !== intent.review?.dependenciesFingerprint
    || dependencies.hostingFingerprint !== intent.assessment.observed?.fingerprint
    || dependencies.envFingerprint !== intent.envFingerprint
    || dependencies.source?.dirty !== false || !sourceKeys.every(key => dependencies.source[key] === intent.source[key]))) {
    fail('Hosting dependency retention binding differs');
  }
  assertSafeMetadata(intent);
}

function assertSafeMetadata(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > 8 * 1024 * 1024) fail('metadata exceeds size bound');
  const visit = entry => {
    if (!entry || typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      if (/^(?:password|authorization|accessToken|refreshToken|privateKey|clientSecret|credentials)$/iu.test(key)) fail('credential fields cannot be retained');
      if (typeof child === 'string' && /[?&](?:key|token|secret|password|authorization)=|:\/\/[^/\s]*@/iu.test(child)) fail('credential-bearing references cannot be retained');
      visit(child);
    }
  };
  visit(value);
}

function resolveRef(ref, exec) {
  if (typeof ref !== 'string' || !/^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(ref)
    || ref.includes('..') || ref.includes('//') || ref.endsWith('/') || ref.endsWith('.lock')) fail('fully qualified remote source ref is required');
  let object = api(`git/ref/${ref.slice(5).split('/').map(encodeURIComponent).join('/')}`, exec).object;
  for (let depth = 0; object?.type === 'tag' && depth < 8; depth += 1) object = api(`git/tags/${object.sha}`, exec).object;
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/u.test(object.sha || '')) fail('remote ref does not resolve to a commit');
  const commit = api(`git/commits/${object.sha}`, exec);
  if (commit.sha !== object.sha || !/^[a-f0-9]{40}$/u.test(commit.tree?.sha || '')) fail('invalid remote commit identity');
  return { revision: commit.sha, tree: commit.tree.sha };
}

const releaseFor = (id, exec) => {
  // REST by tag only finds published releases; drafts need tag lookup followed by numeric ID.
  const lookup = JSON.parse(gh(['api', 'graphql', '-f',
    'query=query($tag: String!) { repository(owner: "iamhuwng", name: "autoresync") { release(tagName: $tag) { databaseId } } }',
    '-f', `tag=${tag(id)}`], exec));
  const releaseId = lookup.data?.repository?.release?.databaseId;
  if (lookup.errors?.length || !Number.isSafeInteger(releaseId) || releaseId < 1) fail('retained release not found or not accessible with the current credentials');
  const release = api(`releases/${releaseId}`, exec);
  if (release.id !== releaseId || release.tag_name !== tag(id)) fail('retained release identity differs');
  return release;
};
const download = (asset, exec) => {
  if (!Number.isSafeInteger(asset.id) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 256 * 1024 * 1024) fail('invalid retained asset identity/size');
  const bytes = command('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'], { encoding: null }, exec);
  if (!Buffer.isBuffer(bytes) || bytes.length !== asset.size) fail('retained asset size differs');
  return bytes;
};

function inspectTar(file, maximum, totalLimit = 256 * 1024 * 1024) {
  let count = 0, total = 0;
  const paths = new Set(), files = [];
  tar.t({ file, sync: true, strict: true, onReadEntry: entry => {
    const name = entry.path.replace(/\/$/u, '');
    if (!safePath(name) || paths.has(name) || !['File', 'Directory'].includes(entry.type)) fail('unsafe or duplicate archive entry');
    paths.add(name);
    if (entry.type === 'File') files.push({ path: name, mode: entry.mode & 0o111 ? '100755' : '100644' });
    total += entry.size;
    if (++count > maximum || entry.size > 32 * 1024 * 1024 || total > totalLimit) fail('archive exceeds extraction bounds');
  } });
  return { files, paths };
}

function validateGitlinks(gitlinks) {
  if (!Array.isArray(gitlinks) || gitlinks.length > 1000) fail('sourceGitlinks must be an explicit bounded array');
  const paths = [];
  for (const link of gitlinks) {
    if (!link || Object.keys(link).sort().join(',') !== 'path,revision' || !safePath(link.path)
      || link.path.split('/').some(part => !part) || !/^[a-f0-9]{40}$/u.test(link.revision || '') || link.revision === '0'.repeat(40)
      || paths.some(other => other === link.path || other.startsWith(`${link.path}/`) || link.path.startsWith(`${other}/`))) fail('unsafe, duplicate or conflicting source Gitlink');
    paths.push(link.path);
  }
}

async function assertSourceArchive(file, directory, tree, gitlinks) {
  validateGitlinks(gitlinks);
  const { files, paths } = inspectTar(file, 30000, 512 * 1024 * 1024);
  for (const link of gitlinks) {
    if ([...paths].some(name => name.startsWith(`${link.path}/`))
      || files.some(entry => entry.path === link.path || link.path.startsWith(`${entry.path}/`))) fail('source archive conflicts with a Gitlink');
  }
  await mkdir(directory);
  tar.x({ file, cwd: directory, sync: true, strict: true });
  git(directory, ['init', '-q']);
  const blobs = files.length ? command('git', ['hash-object', '-w', '--no-filters', '--stdin-paths'], { cwd: directory,
    input: `${files.map(file => JSON.stringify(file.path)).join('\n')}\n` }).trim().split(/\r?\n/u) : [];
  if (blobs.length !== files.length || blobs.some(blob => !/^[a-f0-9]{40}$/u.test(blob))) fail('source blob reconstruction failed');
  command('git', ['update-index', '-z', '--index-info'], { cwd: directory,
    input: files.map((file, index) => `${file.mode} ${blobs[index]}\t${file.path}\0`).join('')
      + gitlinks.map(link => `160000 ${link.revision}\t${link.path}\0`).join('') });
  const restoredTree = git(directory, ['write-tree']);
  if (restoredTree !== tree) fail('source archive does not restore the declared Git tree');
}

async function readArchive({ id, sha256 }, exec) {
  tag(id);
  const release = releaseFor(id, exec);
  if (release.tag_name !== tag(id)) fail('retained release tag differs');
  const asset = name => {
    const matches = release.assets?.filter(entry => entry.name === name) || [];
    if (matches.length !== 1) fail(`missing or duplicate retained asset ${name}`);
    return matches[0];
  };
  const raw = download(asset('intent.json'), exec);
  if (sha256 && digest(raw) !== sha256) fail('intent readback hash differs');
  const record = JSON.parse(raw);
  if (record.schemaVersion !== 1 || record.id !== id || !shaPattern.test(record.sourceTarSha256 || '') || !shaPattern.test(record.artifactTarSha256 || '')) fail('invalid retained archive metadata');
  validateIntent(record.intent, id);
  validateGitlinks(record.sourceGitlinks);
  const identity = resolveRef(`refs/tags/${tag(id)}`, exec);
  if (identity.revision !== record.intent.source.revision || identity.tree !== record.intent.source.tree) fail('retained tag source differs');
  await withTemporary(async directory => {
    for (const [name, hash] of [['source.tar.gz', record.sourceTarSha256], ['artifact.tar.gz', record.artifactTarSha256]]) {
      const bytes = download(asset(name), exec);
      if (digest(bytes) !== hash) fail(`${name} readback hash differs`);
      const file = path.join(directory, name);
      await writeFile(file, bytes);
      if (name === 'source.tar.gz') await assertSourceArchive(file, path.join(directory, 'source'), identity.tree, record.sourceGitlinks);
      else {
        inspectTar(file, 4000);
        await mkdir(path.join(directory, 'dist'));
        tar.x({ file, cwd: path.join(directory, 'dist'), sync: true, strict: true });
        await assertHostingArtifact(directory, record.intent.expectedManifest);
      }
    }
  });
  const handle = freeze({ id, sha256: digest(raw), evidenceRef: `https://github.com/${repository}/releases/tag/${tag(id)}`, intent: record.intent });
  handles.add(handle);
  return handle;
}

export const isHostingArchive = archive => handles.has(archive);
export const readHostingArchive = ({ id, sha256 }, { exec = spawnSync } = {}) => readArchive({ id, sha256 }, exec);

export async function createHostingArchive({ cwd, id, intent, sourceRef, verification }, { exec = spawnSync } = {}) {
  tag(id);
  validateIntent(intent, id);
  if (verification && JSON.stringify(verification) !== JSON.stringify(intent.verification)) fail('verification differs from intent');
  const origin = git(cwd, ['remote', 'get-url', 'origin']);
  if (!['https://github.com/iamhuwng/autoresync', 'https://github.com/iamhuwng/autoresync.git', 'git@github.com:iamhuwng/autoresync.git', 'ssh://git@github.com/iamhuwng/autoresync.git'].includes(origin)) fail('origin is not the fixed release repository');
  const source = await collectSourceState(cwd, intent.source.baseRevision);
  if (source.dirty || source.revision !== intent.source.revision || source.tree !== intent.source.tree || source.fingerprint !== intent.source.fingerprint) fail('candidate source changed or is dirty');
  const retained = resolveRef(sourceRef, exec);
  if (retained.revision !== source.revision || retained.tree !== source.tree) fail('remote source ref differs from candidate');
  await assertHostingArtifact(cwd, intent.expectedManifest);
  const sourceGitlinks = command('git', ['ls-tree', '-r', '-z', source.revision], { cwd }).split('\0')
    .filter(entry => entry.startsWith('160000 ')).map(entry => {
      const match = /^160000 commit ([a-f0-9]{40})\t([\s\S]+)$/u.exec(entry);
      if (!match) fail('invalid source Gitlink entry');
      return { path: match[2], revision: match[1] };
    });
  validateGitlinks(sourceGitlinks);
  return withTemporary(async directory => {
    const sourceFile = path.join(directory, 'source.tar.gz'), artifactFile = path.join(directory, 'artifact.tar.gz');
    const sourceRepository = path.join(directory, 'source-repository');
    git(directory, ['init', '--bare', '-q', sourceRepository]);
    await writeFile(path.join(sourceRepository, 'objects/info/alternates'), `${git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'objects']).replaceAll('\\', '/')}\n`);
    // Archive Git blobs without checkout encoding/EOL conversion; export modifiers still fail the tree check.
    await writeFile(path.join(sourceRepository, 'info/attributes'), '* -text -eol -working-tree-encoding\n');
    git(directory, ['--git-dir', sourceRepository, '-c', 'core.autocrlf=false', 'archive', '--format=tar.gz', `--output=${sourceFile}`, source.revision]);
    await assertSourceArchive(sourceFile, path.join(directory, 'source-check'), source.tree, sourceGitlinks);
    tar.c({ file: artifactFile, cwd: path.join(cwd, 'dist'), gzip: true, sync: true, portable: true }, await readdir(path.join(cwd, 'dist')));
    if ((await lstat(sourceFile)).size > 256 * 1024 * 1024 || (await lstat(artifactFile)).size > 256 * 1024 * 1024) fail('compressed archive exceeds size bound');
    const record = { schemaVersion: 1, id, sourceRef, sourceGitlinks, intent, sourceTarSha256: digest(await readFile(sourceFile)), artifactTarSha256: digest(await readFile(artifactFile)) };
    const intentFile = path.join(directory, 'intent.json');
    const raw = Buffer.from(`${JSON.stringify(record)}\n`);
    await writeFile(intentFile, raw);
    gh(['api', `repos/${repository}/git/refs`, '--method', 'POST', '-f', `ref=refs/tags/${tag(id)}`, '-f', `sha=${source.revision}`], exec);
    gh(['release', 'create', tag(id), '--repo', repository, '--verify-tag', '--target', source.revision, '--draft', '--title', `Hosting operation ${id}`, '--notes', 'Retained technical release evidence; this archive is not deployment authorization.'], exec);
    gh(['release', 'upload', tag(id), sourceFile, artifactFile, intentFile, '--repo', repository], exec);
    return readArchive({ id, sha256: digest(raw) }, exec);
  });
}

function validateOutcome(outcome) {
  if (!outcome || Object.getPrototypeOf(outcome) !== Object.prototype || Object.keys(outcome).some(key => !['outcomes', 'evidenceRefs'].includes(key))
    || !Array.isArray(outcome.outcomes) || outcome.outcomes.length !== 1) fail('invalid outcome fields');
  const target = outcome.outcomes[0];
  if (!target || Object.keys(target).some(key => !['id', 'publication', 'verification', 'providerIdentity', 'evidenceRefs'].includes(key))
    || target.id !== 'firebase:temp-a1437:hosting:kahut1'
    || !['published', 'not-published', 'unconfirmed'].includes(target.publication)
    || !['passed', 'failed', 'unverified'].includes(target.verification)
    || (target.publication === 'published' && (typeof target.providerIdentity !== 'string' || !target.providerIdentity.trim()))) fail('invalid Hosting outcome');
  for (const refs of [outcome.evidenceRefs, target.evidenceRefs]) if (refs !== undefined && (!Array.isArray(refs) || refs.some(ref => typeof ref !== 'string' || !ref.trim()))) fail('invalid outcome evidence references');
  assertSafeMetadata(outcome);
}

export function readHostingArchiveOutcomes(archive, { exec = spawnSync } = {}) {
  if (!isHostingArchive(archive)) fail('trusted retained archive handle required');
  const assets = releaseFor(archive.id, exec).assets.filter(asset => /^outcome-[a-f0-9]{64}\.json$/u.test(asset.name));
  if (assets.length > 1000 || new Set(assets.map(asset => asset.name)).size !== assets.length) fail('invalid outcome inventory');
  return assets.map(asset => {
    const bytes = download(asset, exec), saved = JSON.parse(bytes);
    if (!saved || Object.keys(saved).some(key => !['schemaVersion', 'archiveSha256', 'recordedAt', 'outcome'].includes(key))
      || saved.schemaVersion !== 1 || saved.archiveSha256 !== archive.sha256 || !Number.isFinite(Date.parse(saved.recordedAt))
      || new Date(saved.recordedAt).toISOString() !== saved.recordedAt
      || asset.name !== `outcome-${digest(JSON.stringify({ archiveSha256: archive.sha256, outcome: saved.outcome }))}.json`) fail('outcome binding differs');
    validateOutcome(saved.outcome);
    return { ...saved, evidenceRef: `${archive.evidenceRef}#${asset.name}` };
  }).sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.evidenceRef.localeCompare(right.evidenceRef));
}

export async function recordHostingArchiveOutcome(archive, outcome, { exec = spawnSync } = {}) {
  if (!isHostingArchive(archive)) fail('trusted retained archive handle required');
  validateOutcome(outcome);
  return withTemporary(async directory => {
    const name = `outcome-${digest(JSON.stringify({ archiveSha256: archive.sha256, outcome }))}.json`, file = path.join(directory, name);
    const existing = releaseFor(archive.id, exec).assets.filter(asset => asset.name === name);
    if (existing.length > 1) fail('duplicate outcome asset');
    if (existing.length) {
      const bytes = download(existing[0], exec), saved = JSON.parse(bytes);
      if (saved.schemaVersion !== 1 || saved.archiveSha256 !== archive.sha256 || JSON.stringify(saved.outcome) !== JSON.stringify(outcome)
        || !Number.isFinite(Date.parse(saved.recordedAt))) fail('existing outcome readback differs');
      return { sha256: digest(bytes), evidenceRef: `${archive.evidenceRef}#${name}` };
    }
    const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, archiveSha256: archive.sha256, recordedAt: new Date().toISOString(), outcome })}\n`);
    await writeFile(file, bytes);
    gh(['release', 'upload', tag(archive.id), file, '--repo', repository], exec);
    const release = releaseFor(archive.id, exec), matches = release.assets.filter(asset => asset.name === name);
    if (matches.length !== 1 || digest(download(matches[0], exec)) !== digest(bytes)) fail('outcome readback differs');
    return { sha256: digest(bytes), evidenceRef: `${archive.evidenceRef}#${name}` };
  });
}
