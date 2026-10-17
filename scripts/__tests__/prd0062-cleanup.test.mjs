import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupFixtureRoot,
  loadCleanupManifest,
} from '../cleanup-prd0062-acceptance-fixtures.mjs';

const manifest = loadCleanupManifest();
const cleanupRoot = 'prd0062_acceptance/reading-sentence-completion';

const createWorkspace = () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prd0062-cleanup-'));
  fs.mkdirSync(path.join(workspaceRoot, 'prd0062_acceptance'), { recursive: true });
  return workspaceRoot;
};

const targetPath = (workspaceRoot) => path.join(workspaceRoot, cleanupRoot.replaceAll('/', path.sep));

const removeWorkspace = (workspaceRoot) => fs.rmSync(workspaceRoot, { recursive: true, force: true });

test('rejects unlisted cleanup roots and traversal', () => {
  const workspaceRoot = createWorkspace();
  try {
    assert.throws(() => cleanupFixtureRoot({ root: 'prd0062_acceptance/not-listed', workspaceRoot, manifest }), (error) => error?.code === 'prd0062_fixture_cleanup_root_not_manifested');
    assert.throws(() => cleanupFixtureRoot({ root: 'prd0062_acceptance/reading-sentence-completion/../other', workspaceRoot, manifest }), (error) => error?.code === 'prd0062_fixture_cleanup_root_not_manifested');
  } finally {
    removeWorkspace(workspaceRoot);
  }
});

test('rejects a target symlink or junction without deleting its referent', (t) => {
  const workspaceRoot = createWorkspace();
  const target = targetPath(workspaceRoot);
  const outside = path.join(workspaceRoot, 'outside');
  fs.mkdirSync(outside);
  try {
    try {
      fs.symlinkSync(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`symlink/junction unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    assert.throws(() => cleanupFixtureRoot({ root: cleanupRoot, workspaceRoot, manifest, apply: true }), (error) => error?.code === 'prd0062_fixture_cleanup_reparse_point');
    assert.equal(fs.existsSync(outside), true);
    assert.equal(fs.lstatSync(target).isSymbolicLink(), true);
  } finally {
    removeWorkspace(workspaceRoot);
  }
});

test('rejects a nested symlink before traversal or deletion', (t) => {
  const workspaceRoot = createWorkspace();
  const target = targetPath(workspaceRoot);
  const outside = path.join(workspaceRoot, 'outside');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(outside);
  try {
    try {
      fs.symlinkSync(outside, path.join(target, 'nested-link'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`symlink/junction unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    assert.throws(() => cleanupFixtureRoot({ root: cleanupRoot, workspaceRoot, manifest, apply: true }), (error) => error?.code === 'prd0062_fixture_cleanup_reparse_point');
    assert.equal(fs.existsSync(target), true);
    assert.equal(fs.existsSync(outside), true);
  } finally {
    removeWorkspace(workspaceRoot);
  }
});

test('dry-run inspects an exact target without deleting it', () => {
  const workspaceRoot = createWorkspace();
  const target = targetPath(workspaceRoot);
  fs.mkdirSync(target, { recursive: true });
  const marker = path.join(target, 'marker.txt');
  fs.writeFileSync(marker, 'fixture', 'utf8');
  try {
    assert.deepEqual(cleanupFixtureRoot({ root: cleanupRoot, workspaceRoot, manifest }), { ok: true, mode: 'dry-run', root: cleanupRoot });
    assert.equal(fs.readFileSync(marker, 'utf8'), 'fixture');
  } finally {
    removeWorkspace(workspaceRoot);
  }
});

test('apply is idempotent when the exact target is absent', () => {
  const workspaceRoot = createWorkspace();
  try {
    assert.deepEqual(cleanupFixtureRoot({ root: cleanupRoot, workspaceRoot, manifest, apply: true }), { ok: true, mode: 'already-absent', root: cleanupRoot });
  } finally {
    removeWorkspace(workspaceRoot);
  }
});

test('apply removes an exact normal disposable fixture directory', () => {
  const workspaceRoot = createWorkspace();
  const target = targetPath(workspaceRoot);
  fs.mkdirSync(path.join(target, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(target, 'nested', 'marker.txt'), 'fixture', 'utf8');
  try {
    assert.deepEqual(cleanupFixtureRoot({ root: cleanupRoot, workspaceRoot, manifest, apply: true }), { ok: true, mode: 'applied', root: cleanupRoot });
    assert.equal(fs.existsSync(target), false);
  } finally {
    removeWorkspace(workspaceRoot);
  }
});
