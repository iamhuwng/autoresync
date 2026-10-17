import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectStage0AcceptedBaseline, validateManifest } from '../validate-prd0062-stage-0-baseline.mjs';

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const write = (repo, relativePath, content = 'fixture\n') => {
  const target = path.join(repo, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
};
const commit = (repo, message) => {
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=Stage Zero', '-c', 'user.email=stage0@example.test', 'commit', '-qm', message]);
  return git(repo, ['rev-parse', 'HEAD']);
};
const withRepo = (callback) => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'prd0062-stage0-'));
  try {
    git(repo, ['init', '-q']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    callback(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
};
const manifestFor = (acceptedCommit, settledCommit = acceptedCommit) => ({
  schemaVersion: 1,
  acceptedProducer: { ref: 'accepted', commit: acceptedCommit },
  settledCommits: [{ id: 'settled-producer', commit: settledCommit }],
  requiredPaths: [{ id: 'producer-path', path: 'src/producer.txt' }],
});
const writeManifest = (repo, manifest) => {
  const manifestPath = path.join(repo, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  return manifestPath;
};

test('passes only when settled ancestry and object-tree paths reach HEAD', () => withRepo((repo) => {
  write(repo, 'src/producer.txt');
  const acceptedCommit = commit(repo, 'accepted producer');
  git(repo, ['branch', 'accepted']);
  const result = inspectStage0AcceptedBaseline({ repo, manifestPath: writeManifest(repo, manifestFor(acceptedCommit)) });
  assert.equal(result.status, 'PASS');
  assert.equal(result.acceptedProducer.headIncludes, true);
  assert.deepEqual(result.missingItems, []);
}));

test('blocks a candidate even when an uncommitted working-tree file imitates the producer path', () => withRepo((repo) => {
  write(repo, 'README.md');
  const baseCommit = commit(repo, 'base');
  git(repo, ['checkout', '-qb', 'accepted']);
  write(repo, 'src/producer.txt');
  const acceptedCommit = commit(repo, 'accepted producer');
  git(repo, ['checkout', '-qB', 'candidate', baseCommit]);
  write(repo, 'src/producer.txt', 'uncommitted imitation\n');
  const result = inspectStage0AcceptedBaseline({ repo, manifestPath: writeManifest(repo, manifestFor(acceptedCommit)) });
  assert.equal(result.status, 'BLOCKED_INTEGRATION');
  assert.deepEqual(result.missingItems.map((item) => item.kind), [
    'accepted_producer_ancestry',
    'settled_commit_ancestry',
    'head_tree_path',
  ]);
  assert.equal(result.pathChecks[0].headTreeExists, false);
}));

test('fails closed for malformed manifests, duplicate IDs, missing refs, and non-Git directories', () => withRepo((repo) => {
  write(repo, 'src/producer.txt');
  const acceptedCommit = commit(repo, 'accepted producer');
  const malformed = manifestFor(acceptedCommit);
  malformed.settledCommits.push({ ...malformed.settledCommits[0] });
  const malformedResult = inspectStage0AcceptedBaseline({ repo, manifestPath: writeManifest(repo, malformed) });
  assert.equal(malformedResult.status, 'INVALID_INPUT');
  assert.deepEqual(malformedResult.diagnostics, [
    { code: 'INVALID_MANIFEST', detail: 'duplicate_settled_commit_id:settled-producer' },
  ]);
  const missingRef = manifestFor(acceptedCommit);
  missingRef.acceptedProducer.ref = 'missing-ref';
  const missingRefResult = inspectStage0AcceptedBaseline({ repo, manifestPath: writeManifest(repo, missingRef) });
  assert.deepEqual(missingRefResult.diagnostics, [
    { code: 'ACCEPTED_REF_MISSING', detail: 'accepted_producer_ref_could_not_be_resolved' },
  ]);
  const nonGit = mkdtempSync(path.join(os.tmpdir(), 'prd0062-stage0-nongit-'));
  try {
    const nonGitResult = inspectStage0AcceptedBaseline({ repo: nonGit, manifestPath: writeManifest(repo, manifestFor(acceptedCommit)) });
    assert.deepEqual(nonGitResult.diagnostics, [
      { code: 'NOT_A_GIT_REPOSITORY', detail: 'repo_must_be_a_git_work_tree' },
    ]);
  } finally {
    rmSync(nonGit, { recursive: true, force: true });
  }
}));

test('validates stable schema details and produces semantically identical results', () => withRepo((repo) => {
  write(repo, 'src/producer.txt');
  const acceptedCommit = commit(repo, 'accepted producer');
  git(repo, ['branch', 'accepted']);
  const manifest = manifestFor(acceptedCommit);
  assert.deepEqual(validateManifest(manifest), []);
  const manifestPath = writeManifest(repo, manifest);
  assert.deepEqual(
    inspectStage0AcceptedBaseline({ repo, manifestPath }),
    inspectStage0AcceptedBaseline({ repo, manifestPath }),
  );
}));
