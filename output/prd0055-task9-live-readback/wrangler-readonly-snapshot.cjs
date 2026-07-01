const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cloudflareDir = path.join(repoRoot, 'cloudflare');
const wranglerBin = path.join(cloudflareDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const outDir = __dirname;

function run(name, args) {
  const artifact = path.join(outDir, `wrangler-readonly-${name}.json`);
  try {
    const stdout = execFileSync(process.execPath, [wranglerBin, ...args], {
      cwd: cloudflareDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
    fs.writeFileSync(artifact, stdout, 'utf8');
    return { name, ok: true, args, artifact: path.relative(repoRoot, artifact), bytes: Buffer.byteLength(stdout) };
  } catch (error) {
    const payload = {
      name,
      ok: false,
      args,
      status: error.status,
      signal: error.signal,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
    fs.writeFileSync(artifact, JSON.stringify(payload, null, 2), 'utf8');
    return { name, ok: false, args, artifact: path.relative(repoRoot, artifact), status: error.status };
  }
}

const commands = [
  ['version', ['--version']],
  ['whoami', ['whoami']],
  ['deployments-status', ['deployments', 'status', '--json']],
  ['versions-list', ['versions', 'list', '--json']],
  ['version-d219c36f', ['versions', 'view', 'd219c36f-0e0f-489c-a10b-a843ed339bf2', '--json']],
  ['version-993acdc9', ['versions', 'view', '993acdc9-dd93-4ee8-8764-15847146ac3a', '--json']],
];

const summary = {
  createdAt: new Date().toISOString(),
  node: process.execPath,
  wranglerBin,
  commands: commands.map(([name, args]) => run(name, args)),
};

const summaryPath = path.join(outDir, 'wrangler-readonly-snapshot-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
