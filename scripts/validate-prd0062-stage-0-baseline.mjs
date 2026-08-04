#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const PATH_PATTERN = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const SCHEMA_VERSION = 1;

const diagnostic = (code, detail) => ({ code, detail });
const stableResult = (result) => JSON.parse(JSON.stringify(result));

const runGit = (repo, args) => {
  try {
    return { ok: true, value: execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() };
  } catch (error) {
    return { ok: false, status: typeof error.status === 'number' ? error.status : null };
  }
};

const gitIsAncestor = (repo, older, newer) => {
  const result = runGit(repo, ['merge-base', '--is-ancestor', older, newer]);
  if (result.ok) return true;
  return result.status === 1 ? false : null;
};
const gitPathExists = (repo, treeish, relativePath) => {
  const result = runGit(repo, ['ls-tree', '--name-only', treeish, '--', relativePath]);
  if (!result.ok) return null;
  return result.value.split(/\r?\n/u).includes(relativePath);
};
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/u.test(value);

export const validateManifest = (manifest) => {
  const diagnostics = [];
  if (!isObject(manifest)) return [diagnostic('INVALID_MANIFEST', 'manifest_must_be_an_object')];
  if (manifest.schemaVersion !== SCHEMA_VERSION) diagnostics.push(diagnostic('INVALID_MANIFEST', 'schema_version_must_be_1'));
  if (!isObject(manifest.acceptedProducer)) {
    diagnostics.push(diagnostic('INVALID_MANIFEST', 'accepted_producer_must_be_an_object'));
  } else {
    if (typeof manifest.acceptedProducer.ref !== 'string' || manifest.acceptedProducer.ref.trim() === '') diagnostics.push(diagnostic('INVALID_MANIFEST', 'accepted_producer_ref_must_be_nonempty'));
    if (typeof manifest.acceptedProducer.commit !== 'string' || !COMMIT_PATTERN.test(manifest.acceptedProducer.commit)) diagnostics.push(diagnostic('INVALID_MANIFEST', 'accepted_producer_commit_must_be_a_full_lowercase_sha'));
  }
  for (const [key, items] of [['settledCommits', manifest.settledCommits], ['requiredPaths', manifest.requiredPaths]]) {
    if (!Array.isArray(items) || items.length === 0) diagnostics.push(diagnostic('INVALID_MANIFEST', `${key}_must_be_a_nonempty_array`));
  }
  if (!Array.isArray(manifest.settledCommits) || !Array.isArray(manifest.requiredPaths)) return diagnostics;

  const commitIds = new Set();
  for (const entry of manifest.settledCommits) {
    if (!isObject(entry) || !isId(entry.id) || typeof entry.commit !== 'string' || !COMMIT_PATTERN.test(entry.commit)) {
      diagnostics.push(diagnostic('INVALID_MANIFEST', 'settled_commit_must_have_id_and_full_lowercase_sha'));
      continue;
    }
    if (commitIds.has(entry.id)) diagnostics.push(diagnostic('INVALID_MANIFEST', `duplicate_settled_commit_id:${entry.id}`));
    commitIds.add(entry.id);
  }
  const pathIds = new Set();
  const paths = new Set();
  for (const entry of manifest.requiredPaths) {
    if (!isObject(entry) || !isId(entry.id) || typeof entry.path !== 'string' || !PATH_PATTERN.test(entry.path)) {
      diagnostics.push(diagnostic('INVALID_MANIFEST', 'required_path_must_have_id_and_repo_relative_path'));
      continue;
    }
    if (pathIds.has(entry.id)) diagnostics.push(diagnostic('INVALID_MANIFEST', `duplicate_required_path_id:${entry.id}`));
    if (paths.has(entry.path)) diagnostics.push(diagnostic('INVALID_MANIFEST', `duplicate_required_path:${entry.path}`));
    pathIds.add(entry.id);
    paths.add(entry.path);
  }
  return diagnostics;
};

const loadManifest = (manifestPath) => {
  try {
    return { ok: true, value: JSON.parse(readFileSync(manifestPath, 'utf8')) };
  } catch {
    return { ok: false };
  }
};

const failClosed = (diagnostics) => stableResult({
  schemaVersion: SCHEMA_VERSION,
  status: 'INVALID_INPUT',
  branch: null,
  head: null,
  acceptedProducer: null,
  commitAncestry: [],
  pathChecks: [],
  missingItems: [],
  diagnostics,
});

export const inspectStage0AcceptedBaseline = ({ repo, manifestPath }) => {
  const absoluteRepo = path.resolve(repo);
  const absoluteManifest = path.resolve(manifestPath);
  const repositoryCheck = existsSync(absoluteRepo)
    ? runGit(absoluteRepo, ['rev-parse', '--is-inside-work-tree'])
    : { ok: false };
  if (!repositoryCheck.ok || repositoryCheck.value !== 'true') {
    return failClosed([diagnostic('NOT_A_GIT_REPOSITORY', 'repo_must_be_a_git_work_tree')]);
  }
  const loaded = loadManifest(absoluteManifest);
  if (!loaded.ok) return failClosed([diagnostic('MANIFEST_UNREADABLE', 'manifest_must_be_readable_json')]);
  const manifestDiagnostics = validateManifest(loaded.value);
  if (manifestDiagnostics.length > 0) return failClosed(manifestDiagnostics);
  const manifest = loaded.value;
  const headResult = runGit(absoluteRepo, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!headResult.ok) return failClosed([diagnostic('GIT_COMMAND_FAILED', 'head_commit_could_not_be_resolved')]);
  const acceptedRefResult = runGit(absoluteRepo, ['rev-parse', '--verify', `${manifest.acceptedProducer.ref}^{commit}`]);
  if (!acceptedRefResult.ok) return failClosed([diagnostic('ACCEPTED_REF_MISSING', 'accepted_producer_ref_could_not_be_resolved')]);
  const branchResult = runGit(absoluteRepo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const acceptedCommit = manifest.acceptedProducer.commit;
  const acceptedRefCommit = acceptedRefResult.value;
  const acceptedRefIncludesManifestCommit = gitIsAncestor(absoluteRepo, acceptedCommit, acceptedRefCommit);
  if (acceptedRefIncludesManifestCommit === null) {
    return failClosed([diagnostic('GIT_COMMAND_FAILED', 'accepted_producer_ancestry_could_not_be_checked')]);
  }
  if (!acceptedRefIncludesManifestCommit) {
    return failClosed([diagnostic('ACCEPTED_REF_MISMATCH', 'accepted_producer_ref_does_not_contain_manifest_commit')]);
  }
  const unresolvedCommits = manifest.settledCommits
    .filter((entry) => !runGit(absoluteRepo, ['rev-parse', '--verify', `${entry.commit}^{commit}`]).ok);
  if (unresolvedCommits.length > 0) {
    return failClosed(unresolvedCommits.map((entry) => diagnostic('SETTLED_COMMIT_MISSING', entry.id)));
  }
  const settledLineage = manifest.settledCommits.map((entry) => ({
    entry,
    included: gitIsAncestor(absoluteRepo, entry.commit, acceptedCommit),
  }));
  if (settledLineage.some(({ included }) => included === null)) {
    return failClosed([diagnostic('GIT_COMMAND_FAILED', 'settled_commit_ancestry_could_not_be_checked')]);
  }
  const commitsOutsideAcceptedLineage = settledLineage
    .filter(({ included }) => !included)
    .map(({ entry }) => entry);
  if (commitsOutsideAcceptedLineage.length > 0) {
    return failClosed(commitsOutsideAcceptedLineage.map((entry) => diagnostic('SETTLED_COMMIT_NOT_IN_ACCEPTED_LINEAGE', entry.id)));
  }

  const head = headResult.value;
  const headCommitInclusion = manifest.settledCommits.map((entry) => ({ entry, included: gitIsAncestor(absoluteRepo, entry.commit, head) }));
  const acceptedProducerIncludedByHead = gitIsAncestor(absoluteRepo, acceptedCommit, head);
  if (acceptedProducerIncludedByHead === null || headCommitInclusion.some(({ included }) => included === null)) {
    return failClosed([diagnostic('GIT_COMMAND_FAILED', 'head_ancestry_could_not_be_checked')]);
  }
  const commitAncestry = headCommitInclusion.map(({ entry, included }) => ({
    id: entry.id,
    commit: entry.commit,
    acceptedProducerIncludes: true,
    headIncludes: included,
  }));
  const pathChecks = manifest.requiredPaths.map((entry) => ({
    id: entry.id,
    path: entry.path,
    acceptedTreeExists: gitPathExists(absoluteRepo, acceptedCommit, entry.path),
    headTreeExists: gitPathExists(absoluteRepo, head, entry.path),
  }));
  if (pathChecks.some((entry) => entry.acceptedTreeExists === null || entry.headTreeExists === null)) {
    return failClosed([diagnostic('GIT_COMMAND_FAILED', 'object_tree_path_could_not_be_checked')]);
  }
  const missingItems = [
    ...(acceptedProducerIncludedByHead ? [] : [{ kind: 'accepted_producer_ancestry', id: 'accepted-producer', commit: acceptedCommit }]),
    ...commitAncestry.filter((entry) => !entry.headIncludes).map((entry) => ({ kind: 'settled_commit_ancestry', id: entry.id, commit: entry.commit })),
    ...pathChecks.flatMap((entry) => [
      ...(entry.acceptedTreeExists ? [] : [{ kind: 'accepted_tree_path', id: entry.id, path: entry.path }]),
      ...(entry.headTreeExists ? [] : [{ kind: 'head_tree_path', id: entry.id, path: entry.path }]),
    ]),
  ];
  return stableResult({
    schemaVersion: SCHEMA_VERSION,
    status: missingItems.length === 0 ? 'PASS' : 'BLOCKED_INTEGRATION',
    branch: branchResult.ok ? branchResult.value : 'DETACHED',
    head,
    acceptedProducer: {
      ref: manifest.acceptedProducer.ref,
      commit: acceptedCommit,
      refCommit: acceptedRefCommit,
      headIncludes: acceptedProducerIncludedByHead,
    },
    commitAncestry,
    pathChecks,
    missingItems,
    diagnostics: [],
  });
};

const parseArgs = (argv) => {
  const options = { repo: '.', manifest: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--repo', '--manifest', '--output'].includes(option) || index + 1 >= argv.length) return null;
    options[option.slice(2)] = argv[index + 1];
    index += 1;
  }
  return options.manifest ? options : null;
};

export const main = (argv, cwd = process.cwd()) => {
  const options = parseArgs(argv);
  if (!options) {
    const result = failClosed([diagnostic('INVALID_ARGUMENTS', 'usage_requires_repo_and_manifest_options')]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  const result = inspectStage0AcceptedBaseline({
    repo: path.resolve(cwd, options.repo),
    manifestPath: path.resolve(cwd, options.manifest),
  });
  if (result.status !== 'INVALID_INPUT' && options.output) {
    writeFileSync(path.resolve(cwd, options.output), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === 'PASS' ? 0 : result.status === 'BLOCKED_INTEGRATION' ? 2 : 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
