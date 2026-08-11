import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const payload = JSON.parse(Buffer.from(process.argv[2] || '', 'base64').toString('utf8'));
if (!payload.version || !Array.isArray(payload.arguments)) {
  process.stderr.write('WSL_WRANGLER_PROTOCOL_INVALID\n');
  process.exit(2);
}

const identity = `${payload.version}-node${process.versions.modules}-${process.arch}-harness${payload.contractVersion}`;
const root = path.join(os.homedir(), '.cache', 'codex-harness', 'wrangler', identity);
const entry = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!fs.existsSync(entry)) {
  fs.mkdirSync(path.dirname(root), { recursive: true });
  const lock = `${root}.lock`;
  const deadline = Date.now() + 30 * 60 * 1000;
  while (true) {
    try { fs.mkdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  try {
    if (!fs.existsSync(entry)) {
      if (fs.existsSync(root)) throw new Error(`incomplete WSL Wrangler cache: ${root}`);
      const staging = `${root}.install-${process.pid}-${crypto.randomUUID()}`;
      fs.mkdirSync(staging, { recursive: true });
      const initialized = spawnSync('npm', ['init', '--yes'], { cwd: staging, stdio: 'ignore', shell: false });
      if (initialized.status !== 0) process.exit(initialized.status ?? 2);
      const installed = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', `wrangler@${payload.version}`], { cwd: staging, encoding: 'utf8', shell: false });
      if (installed.stdout) process.stderr.write(installed.stdout);
      if (installed.stderr) process.stderr.write(installed.stderr);
      if (installed.status !== 0) process.exit(installed.status ?? 2);
      fs.renameSync(staging, root);
    }
  } finally {
    fs.rmdirSync(lock);
  }
}

const runtime = { platform: process.platform, architecture: process.arch, nodeVersion: process.version, nodeAbi: process.versions.modules, executable: process.execPath, dependencyCache: root };
process.stderr.write(`HARNESS_WSL_RUNTIME ${Buffer.from(JSON.stringify(runtime), 'utf8').toString('base64')}\n`);
process.stderr.write(`harness WSL: Wrangler ${payload.version}, Node ${process.version} ${process.arch}, cache ${root}\n`);
const result = spawnSync(process.execPath, [entry, ...payload.arguments], { cwd: process.cwd(), stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
