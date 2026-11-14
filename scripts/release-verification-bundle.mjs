import crypto from 'node:crypto';
import { readFile, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repository = 'iamhuwng/autoresync';
const shaPattern = /^[a-f0-9]{64}$/u;
const revisionPattern = /^[a-f0-9]{40}$/u;
const runIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const assetName = 'verification-bundle.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('Verification bundle: ' + message); };
const text = (value, label, maximum = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0\r\n]/u.test(value)) fail(label + ' must be bounded single-line text');
  if (/[?&](?:key|token|secret|password|authorization)=|:\/\/[^\/\s]*@/iu.test(value)) fail(label + ' cannot contain credentials');
  return value.trim();
};
const exactFields = (value, fields, label) => {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !fields.includes(key))) fail(label + ' contains unknown fields');
};
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/u.test(value);
const command = (executable, args, options = {}, exec = spawnSync) => {
  const result = exec(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) fail(executable + ' failed: ' + (result.error?.message || result.stderr || result.status));
  return result.stdout;
};
const gh = (args, exec) => command('gh', args, {}, exec);
const api = (endpoint, exec) => JSON.parse(gh(['api', 'repos/' + repository + '/' + endpoint], exec));
export const verificationTag = (revision, runId = crypto.randomUUID()) => {
  if (!revisionPattern.test(revision || '')) fail('source revision must be a full Git revision');
  if (!runIdPattern.test(runId || '')) fail('verification run ID must be a UUID');
  return `verification-${revision}-${runId}`;
};
export const isVerificationTagForSource = (tag, revision) => revisionPattern.test(revision || '')
  && typeof tag === 'string'
  && tag.startsWith(`verification-${revision}-`)
  && runIdPattern.test(tag.slice(`verification-${revision}-`.length));
export const buildIdentityFor = (source, environmentFingerprint) => {
  if (!source || !revisionPattern.test(source.revision || '') || !revisionPattern.test(source.tree || '') || !shaPattern.test(environmentFingerprint || '')) fail('build identity inputs are invalid');
  return digest(Buffer.from(source.revision + '\n' + source.tree + '\n' + environmentFingerprint));
};
export const parseEvidenceArgument = value => {
  if (typeof value !== 'string') fail('evidence arguments must use --evidence=<id>:<file>');
  const separator = value.indexOf(':');
  if (separator < 1 || separator === value.length - 1) fail('evidence arguments must use --evidence=<id>:<file>');
  return { id: value.slice(0, separator), file: value.slice(separator + 1) };
};
function validateArtifact(artifact) {
  exactFields(artifact, ['id', 'mediaType', 'size', 'sha256', 'contentBase64'], 'verification artifact');
  if (!safeId(artifact.id)) fail('verification artifact id is invalid');
  text(artifact.mediaType, 'verification artifact media type', 200);
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 1 || artifact.size > 32 * 1024 * 1024) fail('verification artifact size is invalid');
  if (!shaPattern.test(artifact.sha256 || '') || typeof artifact.contentBase64 !== 'string') fail('verification artifact digest or content is invalid');
  const bytes = Buffer.from(artifact.contentBase64, 'base64');
  if (bytes.length !== artifact.size || digest(bytes) !== artifact.sha256) fail('verification artifact ' + artifact.id + ' content digest differs');
}
export function validateVerificationBundle(bundle, { source, requirement = 'required', environmentFingerprint, expectedBuildIdentity, now = Date.now() } = {}) {
  exactFields(bundle, ['schemaVersion', 'tag', 'asset', 'createdAt', 'source', 'environment', 'build', 'verification', 'artifacts'], 'verification bundle');
  if (bundle.schemaVersion !== 1 || bundle.asset !== assetName || !isVerificationTagForSource(bundle.tag, bundle.source?.revision)) fail('verification bundle identity is invalid');
  if (!Number.isFinite(Date.parse(bundle.createdAt)) || new Date(bundle.createdAt).toISOString() !== bundle.createdAt || Date.parse(bundle.createdAt) > now + 600000 || now - Date.parse(bundle.createdAt) > 86400000) fail('verification bundle is stale or dated in the future');
  exactFields(bundle.source, ['revision', 'tree', 'baseRevision', 'fingerprint'], 'verification bundle source');
  for (const [key, pattern] of [['revision', revisionPattern], ['tree', revisionPattern], ['baseRevision', revisionPattern], ['fingerprint', shaPattern]]) if (!pattern.test(bundle.source?.[key] || '')) fail('verification bundle source ' + key + ' is invalid');
  exactFields(bundle.environment, ['fingerprint', 'identity'], 'verification bundle environment');
  if (!shaPattern.test(bundle.environment?.fingerprint || '')) fail('verification environment fingerprint is invalid');
  if (environmentFingerprint !== undefined && bundle.environment.fingerprint !== environmentFingerprint) fail('verification environment differs from the assessed environment');
  text(bundle.environment.identity, 'verification environment identity', 500);
  exactFields(bundle.build, ['identity'], 'verification bundle build');
  if (!shaPattern.test(bundle.build?.identity || '')) fail('verification build identity is invalid');
  if (expectedBuildIdentity !== undefined && bundle.build.identity !== expectedBuildIdentity) fail('verification build identity differs from the assessed inputs');
  exactFields(bundle.verification, ['schemaVersion', 'requirement', 'decision', 'observedAt', 'method', 'scenario', 'sourceRevision', 'sourceFingerprint', 'checks', 'evidenceRefs', 'summary'], 'verification bundle record');
  if (bundle.verification.schemaVersion !== 1 || bundle.verification.requirement !== requirement || bundle.verification.decision !== 'verified') fail('verification bundle record is not a required verified decision');
  if (bundle.verification.sourceRevision !== bundle.source.revision || bundle.verification.sourceFingerprint !== bundle.source.fingerprint) fail('verification record differs from its source');
  if (!Number.isFinite(Date.parse(bundle.verification.observedAt)) || new Date(bundle.verification.observedAt).toISOString() !== bundle.verification.observedAt || now - Date.parse(bundle.verification.observedAt) > 86400000 || Date.parse(bundle.verification.observedAt) > now + 600000) fail('verification evidence is stale or dated in the future');
  if (!Array.isArray(bundle.verification.checks) || bundle.verification.checks.length < 1 || bundle.verification.checks.length > 30) fail('verification checks are invalid');
  bundle.verification.checks.forEach(check => { exactFields(check, ['name', 'result'], 'verification check'); text(check.name, 'verification check name', 500); if (check.result !== 'passed') fail('verification checks must pass'); });
  const refs = bundle.verification.evidenceRefs;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 30 || new Set(refs).size !== refs.length) fail('verification evidence references are invalid');
  if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length < 1 || bundle.artifacts.length > 30 || new Set(bundle.artifacts.map(a => a.id)).size !== bundle.artifacts.length) fail('verification artifacts are invalid');
  bundle.artifacts.forEach(validateArtifact);
  const ids = new Set(bundle.artifacts.map(a => 'bundle://artifact/' + a.id));
  if (refs.some(ref => typeof ref !== 'string' || !ids.has(ref))) fail('verification evidence reference does not resolve to a retained artifact');
  if (source) for (const key of ['revision', 'tree', 'baseRevision', 'fingerprint']) if (bundle.source[key] !== source[key]) fail('verification bundle source differs from the assessed source');
  return bundle;
}
export const bundleBytes = bundle => {
  const bytes = Buffer.from(JSON.stringify(bundle) + '\n');
  if (bytes.length > 64 * 1024 * 1024) fail('verification bundle exceeds the size bound');
  return bytes;
};
export const bundleDigest = bytes => digest(bytes);
export async function createVerificationBundle({ cwd, base, recordPath, environmentPath, environmentIdentity, buildIdentity, evidence = [], output } = {}) {
  if (!cwd || !base || !recordPath || !environmentPath || !environmentIdentity || !buildIdentity || !output) fail('bundle creation requires source, base, record, environment, build and output inputs');
  const { collectSourceState } = await import('./release-check.mjs');
  const source = await collectSourceState(cwd, base);
  if (source.dirty) fail('candidate source must be clean before creating a verification bundle');
  const { readFile: read, writeFile: write } = await import('node:fs/promises');
  const record = JSON.parse(await read(path.resolve(recordPath), 'utf8'));
  if (record.sourceRevision !== source.revision || record.sourceFingerprint !== source.fingerprint || record.requirement !== 'required' || record.decision !== 'verified') fail('verification record is not bound to the clean candidate');
  const environmentBytes = await read(path.resolve(environmentPath));
  const build = buildIdentity === 'none' ? buildIdentityFor(source, digest(environmentBytes)) : buildIdentity;
  if (!shaPattern.test(build)) fail('build identity must be a SHA-256 digest or none');
  const artifacts = [];
  for (const entry of evidence) {
    if (!entry || !safeId(entry.id) || !entry.file) fail('verification evidence input is invalid');
    const bytes = await read(path.resolve(entry.file));
    artifacts.push({ id: entry.id, mediaType: text(entry.mediaType || 'application/octet-stream', 'verification artifact media type', 200), size: bytes.length, sha256: digest(bytes), contentBase64: bytes.toString('base64') });
  }
  const bundle = { schemaVersion: 1, tag: verificationTag(source.revision), asset: assetName, createdAt: new Date().toISOString(), source: { revision: source.revision, tree: source.tree, baseRevision: source.baseRevision, fingerprint: source.fingerprint }, environment: { fingerprint: digest(environmentBytes), identity: text(environmentIdentity, 'verification environment identity', 500) }, build: { identity: build }, verification: record, artifacts };
  validateVerificationBundle(bundle, { source });
  const bytes = bundleBytes(bundle);
  await write(path.resolve(output), bytes);
  return { bundle, bytes, sha256: bundleDigest(bytes) };
}
function releaseFor(tag, exec) {
  if (!/^verification-[a-f0-9]{40}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(tag || '')) fail('verification bundle tag is invalid');
  const lookup = JSON.parse(gh(['api', 'graphql', '-f', 'query=query($tag: String!) { repository(owner: "iamhuwng", name: "autoresync") { release(tagName: $tag) { databaseId } } }', '-f', 'tag=' + tag], exec));
  const releaseId = lookup.data?.repository?.release?.databaseId;
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) fail('verification bundle release was not found');
  const release = api('releases/' + releaseId, exec);
  if (release.id !== releaseId || release.tag_name !== tag || (release.draft !== true && release.prerelease !== true)) fail('verification bundle release is not a retained verification release');
  return release;
}
function resolveTag(tag, exec) {
  const ref = api('git/ref/tags/' + tag, exec);
  if (ref.object?.type !== 'commit' || !revisionPattern.test(ref.object.sha || '')) fail('verification bundle tag does not resolve to a commit');
  return ref.object.sha;
}
function requireImmutableReleasesEnabled(exec) {
  const settings = api('immutable-releases', exec);
  if (settings?.enabled !== true) fail('GitHub immutable releases must be enabled before publishing verification evidence');
}
function downloadAsset(asset, exec) {
  if (!Number.isSafeInteger(asset?.id) || !Number.isSafeInteger(asset?.size) || asset.size < 1 || asset.size > 64 * 1024 * 1024) fail('verification asset identity or size is invalid');
  const bytes = command('gh', ['api', 'repos/' + repository + '/releases/assets/' + asset.id, '-H', 'Accept: application/octet-stream'], { encoding: null }, exec);
  if (!Buffer.isBuffer(bytes) || bytes.length !== asset.size) fail('verification asset size differs');
  return bytes;
}
export function readVerificationBundle({ tag, sha256: expectedSha256, exec = spawnSync } = {}) {
  const release = releaseFor(tag, exec);
  if (release.draft !== false || release.prerelease !== true || release.immutable !== true) fail('verification bundle release must be a published immutable prerelease');
  if (release.draft === true || release.prerelease !== true) fail('verification bundle release is not an immutable prerelease');
  const matches = (release.assets || []).filter(asset => asset.name === assetName);
  if (matches.length !== 1) fail('verification bundle asset is missing or duplicated');
  const bytes = downloadAsset(matches[0], exec);
  const actual = digest(bytes);
  if (!shaPattern.test(expectedSha256 || '') || actual !== expectedSha256) fail('verification bundle readback digest differs');
  let bundle; try { bundle = JSON.parse(bytes.toString('utf8')); } catch { fail('verification bundle is not valid JSON'); }
  if (bundle.tag !== tag || bundle.asset !== assetName) fail('verification bundle tag or asset differs');
  if (resolveTag(tag, exec) !== bundle.source.revision) fail('verification bundle tag source differs from its record');
  validateVerificationBundle(bundle);
  return { bundle, bytes, sha256: actual, tag, asset: assetName };
}
export function publishVerificationBundle({ bundleFile, exec = spawnSync } = {}) {
  if (!bundleFile) fail('bundle file is required for publication');
  requireImmutableReleasesEnabled(exec);
  const bytes = readFileSync(bundleFile);
  let bundle; try { bundle = JSON.parse(bytes.toString('utf8')); } catch { fail('verification bundle is not valid JSON'); }
  validateVerificationBundle(bundle);
  const expected = digest(bytes);
  const tag = bundle.tag;
  let release;
  try { release = releaseFor(tag, exec); } catch (error) {
    if (!/(?:was not found|not found|HTTP 404)/iu.test(error.message)) throw error;
    gh(['release', 'create', tag, '--repo', repository, '--target', bundle.source.revision, '--draft', '--title', 'Codex verification ' + bundle.source.revision, '--notes', 'Source-bound application verification evidence; not deployment authorization.'], exec);
    release = releaseFor(tag, exec);
  }
  const existing = (release.assets || []).filter(asset => asset.name === assetName);
  if (existing.length > 1) fail('verification bundle asset is duplicated');
  if (existing.length) { if (digest(downloadAsset(existing[0], exec)) !== expected) fail('an existing verification bundle cannot be replaced'); if (release.draft === true) gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease'], exec); if (readVerificationBundle({ tag, sha256: expected, exec }).sha256 !== expected) fail('verification bundle readback differs'); }
  else { gh(['release', 'upload', tag, bundleFile, '--repo', repository], exec); gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease'], exec); if (readVerificationBundle({ tag, sha256: expected, exec }).sha256 !== expected) fail('verification bundle upload readback differs'); }
  return { tag, asset: assetName, sha256: expected };
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/release-verification-bundle.mjs')) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  try {
    if (args.includes('--create')) {
      const evidence = args.filter(arg => arg.startsWith('--evidence='))
        .map(arg => parseEvidenceArgument(arg.slice('--evidence='.length)));
      const result = await createVerificationBundle({
        cwd: process.cwd(), base: value('--base'), recordPath: value('--record'), environmentPath: value('--environment'),
        environmentIdentity: value('--environment-identity'), buildIdentity: value('--build-identity') || 'none',
        evidence, output: value('--output'),
      });
      process.stdout.write(result.sha256 + '\n');
    } else if (args.includes('--publish')) {
      const result = publishVerificationBundle({ bundleFile: value('--publish') });
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      throw new Error('Use --create ... or --publish <bundle-file>');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}