import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('the resolver requires the checkout’s own tool and forwards arguments with native Node', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'luyentap-native-tools-'));
  try {
    const checkout = path.join(parent, 'checkout');
    const script = path.join(checkout, 'scripts', 'tooling-where.mjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.resolve(import.meta.dirname, '../tooling-where.mjs'), script);
    const ancestorTool = path.join(parent, 'node_modules', 'vite', 'bin', 'vite.js');
    fs.mkdirSync(path.dirname(ancestorTool), { recursive: true });
    fs.writeFileSync(ancestorTool, 'process.exit(99);');
    const run = () => spawnSync(process.execPath, [script, '--exec', 'vite', 'two words'], { cwd: checkout, encoding: 'utf8' });
    assert.match(run().stderr, /Missing tool:/u);
    const checkoutTool = path.join(checkout, 'node_modules', 'vite', 'bin', 'vite.js');
    fs.mkdirSync(path.dirname(checkoutTool), { recursive: true });
    fs.writeFileSync(checkoutTool, 'console.log(JSON.stringify([process.execPath, process.cwd(), process.argv[2]])); process.exitCode = 4;');
    const result = run();
    assert.equal(result.status, 4, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [process.execPath, checkout, 'two words']);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
