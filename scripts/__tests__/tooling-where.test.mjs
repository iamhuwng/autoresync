import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { entries, executionFor } from '../tooling-where.mjs';

test('Worker resolver selects Windows x64 only on ARM64 and refuses WSL', () => {
  const canonicalX64Node = path.join(
    process.env.CODEX_WINDOWS_TOOLS_ROOT || path.join(os.homedir(), '.codex', 'tools', 'windows-arm64'),
    'node',
    '22-x64',
    'node.exe',
  );

  for (const name of ['cloudflare-vitest', 'cloudflare-wrangler', 'r2-vitest', 'r2-wrangler']) {
    const entry = entries[name];
    assert.deepEqual(executionFor(name, entry, { platform: 'win32', arch: 'arm64', isWsl: false }), { command: canonicalX64Node, args: [entry.path] });
    assert.equal(executionFor(name, entry, { platform: 'linux', arch: 'arm64', isWsl: false }).command, process.execPath);
    assert.throws(() => executionFor(name, entry, { platform: 'linux', arch: 'x64', isWsl: true }), /Windows-authoritative checkout/u);
  }
});

test('resolver forwards cwd, quoted arguments, and exit status without switching native Node', () => {
  const argumentsList = ['value with spaces', 'quote"roundtrip', '--equals=a=b'];
  const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../tooling-where.mjs'), '--exec', 'node-native', '-e', 'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1),execPath:process.execPath}));process.exitCode=27', '--', ...argumentsList], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 27, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { cwd: os.tmpdir(), args: argumentsList, execPath: process.execPath });
});

test('selected x64 Node propagates to child commands without changing the parent PATH', { skip: process.platform !== 'win32' || !fs.existsSync(entries['node-x64'].path) }, () => {
  const originalPath = process.env.PATH;
  const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../tooling-where.mjs'), '--exec', 'node-x64', '-e', 'const {spawnSync}=require("node:child_process");const child=spawnSync("node",["-p","process.arch"],{encoding:"utf8"});console.log(JSON.stringify({arch:process.arch,child:child.stdout.trim(),status:child.status}));'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { arch: 'x64', child: 'x64', status: 0 });
  assert.equal(process.env.PATH, originalPath);
});
