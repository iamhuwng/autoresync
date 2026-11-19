import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkReleaseCheckout } from '../release-doctor.mjs';

test('local readiness detects source and operation drift without changing the Git index', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'release-doctor-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  await writeFile(path.join(cwd, 'fixture.txt'), 'original');
  git('add', 'fixture.txt');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  git('switch', '--detach');
  const index = path.join(cwd, '.git/index');
  const before = await readFile(index);
  assert.deepEqual((await checkReleaseCheckout(cwd)).map(([status]) => status), ['OK', 'OK']);
  assert.deepEqual(await readFile(index), before);
  await writeFile(path.join(cwd, 'untracked.txt'), 'outside release');
  await writeFile(path.join(cwd, '.git/MERGE_HEAD'), git('rev-parse', 'HEAD') + '\n');
  const checks = await checkReleaseCheckout(cwd);
  assert.deepEqual(checks.map(([status]) => status), ['BLOCKED', 'BLOCKED', 'OK']);
  assert.deepEqual(await readFile(index), before);
});
