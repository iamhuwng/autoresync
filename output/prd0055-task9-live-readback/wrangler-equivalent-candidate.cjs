const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cloudflareDir = path.join(repoRoot, 'cloudflare');
const wranglerBin = path.join(cloudflareDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const activeVersionId = '993acdc9-dd93-4ee8-8764-15847146ac3a';
const tag = `prd0055-active-equivalent-${Date.now()}`;
const message = 'PRD-0055 active-equivalent percentage rollout candidate';

function runText(name, args) {
  const artifact = path.join(__dirname, `wrangler-equivalent-candidate-${name}.txt`);
  try {
    const stdout = execFileSync(process.execPath, [wranglerBin, ...args], {
      cwd: cloudflareDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
    fs.writeFileSync(artifact, stdout, 'utf8');
    return { name, ok: true, args, artifact: path.relative(repoRoot, artifact), stdout };
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
    return { name, ok: false, args, artifact: path.relative(repoRoot, artifact), stdout: payload, status: error.status };
  }
}

function runJson(name, args) {
  const textResult = runText(name, args);
  const artifact = path.join(__dirname, `wrangler-equivalent-candidate-${name}.json`);
  if (!textResult.ok) {
    fs.writeFileSync(artifact, JSON.stringify(textResult, null, 2), 'utf8');
    return { ...textResult, jsonArtifact: path.relative(repoRoot, artifact), json: null };
  }
  const json = JSON.parse(textResult.stdout);
  fs.writeFileSync(artifact, JSON.stringify(json, null, 2), 'utf8');
  return { ...textResult, jsonArtifact: path.relative(repoRoot, artifact), json };
}

function bindingSummary(version) {
  return (version?.resources?.bindings ?? [])
    .map((binding) => ({
      name: binding.name,
      type: binding.type,
      bucket_name: binding.bucket_name,
      class_name: binding.class_name,
      namespace_id: binding.namespace_id,
      text: Object.prototype.hasOwnProperty.call(binding, 'text') ? binding.text : undefined,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function scriptSummary(version) {
  return {
    etag: version?.resources?.script?.etag ?? null,
    migration_tag: version?.resources?.script_runtime?.migration_tag ?? null,
    compatibility_date: version?.resources?.script_runtime?.compatibility_date ?? null,
    compatibility_flags: version?.resources?.script_runtime?.compatibility_flags ?? [],
    bindings: bindingSummary(version),
  };
}

const dryRun = runText('dry-run-upload', [
  'versions',
  'upload',
  '--keep-vars',
  '--message',
  message,
  '--tag',
  `${tag}-dry-run`,
  '--dry-run',
]);

if (!dryRun.ok) {
  throw new Error('Dry-run upload failed');
}

const upload = runText('upload', [
  'versions',
  'upload',
  '--keep-vars',
  '--message',
  message,
  '--tag',
  tag,
]);

const match = upload.stdout.match(/Worker Version ID:\s*([0-9a-f-]{36})/i);
if (!upload.ok || !match) {
  throw new Error('Candidate upload failed or did not return Worker Version ID');
}

const candidateVersionId = match[1];
const active = runJson('active-view', ['versions', 'view', activeVersionId, '--json']);
const candidate = runJson('candidate-view', ['versions', 'view', candidateVersionId, '--json']);

const activeComparable = scriptSummary(active.json);
const candidateComparable = scriptSummary(candidate.json);
const equivalent = JSON.stringify(activeComparable) === JSON.stringify(candidateComparable);

const summary = {
  createdAt: new Date().toISOString(),
  message,
  tag,
  activeVersionId,
  candidateVersionId,
  dryRun: { ok: dryRun.ok, artifact: dryRun.artifact },
  upload: { ok: upload.ok, artifact: upload.artifact },
  activeViewArtifact: active.jsonArtifact,
  candidateViewArtifact: candidate.jsonArtifact,
  activeComparable,
  candidateComparable,
  equivalent,
  safeForTrafficSplit: equivalent,
  explicitNonActions: [
    'No traffic split was performed by this script.',
    'No rollback was performed by this script.',
    'No cleanup/delete was performed by this script.',
    'No commit/push/merge was performed by this script.',
  ],
};

const summaryPath = path.join(__dirname, 'wrangler-equivalent-candidate-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
