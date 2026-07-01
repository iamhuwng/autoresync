const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mode = process.argv[2] || 'dry-run';
if (!['dry-run', 'apply'].includes(mode)) {
  throw new Error(`Unsupported mode: ${mode}`);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const cloudflareDir = path.join(repoRoot, 'cloudflare');
const wranglerBin = path.join(cloudflareDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const activeVersion = '993acdc9-dd93-4ee8-8764-15847146ac3a';
const message = mode === 'dry-run'
  ? 'PRD-0055 dry-run active version pin recovery rehearsal'
  : 'PRD-0055 active version pin recovery rehearsal';

function run(name, args) {
  const artifact = path.join(__dirname, `wrangler-active-pin-${mode}-${name}.txt`);
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
    const payload = [
      `status=${error.status ?? ''}`,
      `signal=${error.signal ?? ''}`,
      '--- stdout ---',
      error.stdout ? String(error.stdout) : '',
      '--- stderr ---',
      error.stderr ? String(error.stderr) : String(error.message || error),
    ].join('\n');
    fs.writeFileSync(artifact, payload, 'utf8');
    return { name, ok: false, args, artifact: path.relative(repoRoot, artifact), status: error.status };
  }
}

const deployArgs = [
  'versions',
  'deploy',
  `${activeVersion}@100`,
  '--message',
  message,
  '-y',
];

if (mode === 'dry-run') {
  deployArgs.push('--dry-run');
}

const commands = [
  ['deploy', deployArgs],
  ['status', ['deployments', 'status', '--json']],
];

const summary = {
  createdAt: new Date().toISOString(),
  mode,
  activeVersion,
  message,
  commands: commands.map(([name, args]) => run(name, args)),
};

const summaryPath = path.join(__dirname, `wrangler-active-pin-${mode}-summary.json`);
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
