import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { addManualChangelog, generateChangelog, prepareDeploymentChangelog, previewChangelog, readLiveRevision, migrateHostingDraft, HOSTING_TARGET } from '../release-changelog.mjs';
import { readDraft, beginRelease, settleRelease } from '../lib/releaseChangelog.mjs';

test('changelog follows live source in both directions, excludes backend-only commits and dirty edits', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'changelog-test-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Changelog Test');
    git('config', 'user.email', 'test@example.invalid');
    await mkdir(path.join(cwd, 'src'));
    await writeFile(path.join(cwd, 'src/app.js'), 'baseline');
    git('add', '.'); git('commit', '-qm', 'Baseline');
    const base = git('rev-parse', 'HEAD');
    await writeFile(path.join(cwd, 'src/app.js'), 'fixed');
    git('add', '.'); git('commit', '-qm', 'Fix homework submission');
    const fixed = git('rev-parse', 'HEAD');
    await mkdir(path.join(cwd, 'r2-backup-worker'));
    await writeFile(path.join(cwd, 'r2-backup-worker/worker.ts'), 'backend');
    git('add', '.'); git('commit', '-qm', 'Separate Worker change');
    await writeFile(path.join(cwd, 'src/app.js'), 'unfinished');
    const summary = generateChangelog(base, cwd);
    assert.match(summary, /> .*Fix homework submission/u);
    assert.doesNotMatch(summary, /Separate Worker change|unfinished/u);
    assert.match(generateChangelog(fixed, cwd), /No Hosting source-file changes/u);
    git('checkout', '--', 'src/app.js');
    git('checkout', '-q', '--detach', base);
    assert.match(generateChangelog(fixed, cwd), /< .*Fix homework submission/u);
    assert.throws(() => generateChangelog('HEAD^', cwd), /full live source revision/u);
    assert.throws(() => generateChangelog('f'.repeat(40), cwd), /Cannot generate changelog/u);
    await writeFile(path.join(cwd, 'src/app.js'), 'large release');
    git('add', '.'); git('commit', '-qm', 'Long change '.repeat(150));
    const bounded = generateChangelog(base, cwd);
    assert.ok(bounded.length <= 1000);
    assert.match(bounded, /more commits/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('manual preview reads only the production manifest and rejects unavailable or wrong-site data', async () => {
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40) };
  assert.equal(await readLiveRevision(async (url, options) => {
    assert.equal(url, 'https://kahut1.web.app/.well-known/luyentap-release.json');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => manifest };
  }), manifest.revision);
  await assert.rejects(() => readLiveRevision(async () => ({ ok: false, status: 503 })), /HTTP 503/u);
  await assert.rejects(() => readLiveRevision(async () => ({ ok: true, json: async () => ({ ...manifest, environment: 'acceptance' }) })), /production Hosting source/u);
});

test('Hosting preview and draft match committed contents, invalidate config edits, and stay read-only', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'changelog-preview-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Changelog Test'); git('config', 'user.email', 'test@example.invalid');
    await writeFile(path.join(cwd, 'index.html'), 'baseline');
    git('add', '.'); git('commit', '-qm', 'Baseline');
    const base = git('rev-parse', 'HEAD');
    const storeDir = path.join(cwd, '.git', 'journal');
    assert.match(previewChangelog(base, cwd, storeDir), /No pending manual entry/u);
    assert.equal(fs.existsSync(storeDir), false);
    await writeFile(path.join(cwd, 'index.html'), 'attempt');
    const draft = addManualChangelog(base, 'Unique manual attempt', cwd, storeDir);
    const state = path.join(storeDir, 'state.json');
    const saved = fs.readFileSync(state, 'utf8');
    const dirty = previewChangelog(base, cwd, storeDir);
    assert.match(dirty, /Provisional selection.*pending manual description/u);
    assert.match(dirty, /Uncommitted changes block/u);
    assert.match(dirty, /Unique manual attempt/u);
    assert.equal(fs.readFileSync(state, 'utf8'), saved);
    git('add', '.'); git('commit', '-qm', 'Commit unchanged attempt');
    assert.match(previewChangelog(base, cwd, storeDir), /Next guarded Hosting deployment would use: pending manual description/u);
    await writeFile(path.join(cwd, 'postcss.config.cjs'), 'module.exports = {};');
    git('add', '.'); git('commit', '-qm', 'Change website CSS processing');
    const stale = previewChangelog(base, cwd, storeDir);
    assert.match(stale, /stale/u);
    assert.match(stale, /Change website CSS processing/u);
    assert.doesNotMatch(stale, /Unique manual attempt/u);
    assert.equal(readDraft(storeDir).id, draft.id);
    const plan = prepareDeploymentChangelog(base, cwd, storeDir);
    const record = beginRelease(plan, storeDir);
    assert.equal(readDraft(storeDir).id, draft.id);
    settleRelease(record.id, { outcomes: [{ id: HOSTING_TARGET, publication: 'published', providerIdentity: 'version-1', verification: 'passed', evidenceRefs: ['fixture://publication'] }] }, storeDir);
    assert.equal(readDraft(storeDir), null, 'confirmed replacement removes the stale description');
    assert.match(previewChangelog(base, cwd, storeDir), /LIVE means confirmed publication, not satisfaction or verification/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('explicit migration preserves the unrelated pending Hosting entry', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'changelog-move-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Changelog Test'); git('config', 'user.email', 'test@example.invalid');
    await writeFile(path.join(cwd, 'index.html'), 'baseline'); git('add', '.'); git('commit', '-qm', 'Baseline');
    const revision = git('rev-parse', 'HEAD');
    const old = path.join(cwd, '.git', 'hosting-changelog.json');
    await writeFile(old, JSON.stringify({ status: 'not-live', text: 'Changelog feature is not yet published', revision, fingerprint: 'a'.repeat(64) }));
    const storeDir = path.join(cwd, '.git', 'journal');
    migrateHostingDraft(cwd, storeDir);
    assert.equal(readDraft(storeDir).description, 'Changelog feature is not yet published');
    assert.equal(readDraft(storeDir).status, 'not-live');
    assert.equal(fs.existsSync(old), false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
