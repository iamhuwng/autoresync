const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cloudflareDir = path.join(repoRoot, 'cloudflare');
const wranglerBin = path.join(cloudflareDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const activeVersionId = '993acdc9-dd93-4ee8-8764-15847146ac3a';
const candidateSummary = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'wrangler-equivalent-candidate-summary.json'), 'utf8'),
);
const candidateVersionId = candidateSummary.candidateVersionId;

if (!candidateSummary.safeForTrafficSplit) {
  throw new Error('Candidate is not marked safeForTrafficSplit');
}

function run(name, cwd, commandArgs, options = {}) {
  const artifact = path.join(__dirname, `wrangler-percentage-${name}.${options.json ? 'json' : 'txt'}`);
  try {
    const stdout = execFileSync(commandArgs[0], commandArgs.slice(1), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
    fs.writeFileSync(artifact, options.json ? JSON.stringify(JSON.parse(stdout), null, 2) : stdout, 'utf8');
    return {
      name,
      ok: true,
      artifact: path.relative(repoRoot, artifact),
      stdout,
      json: options.json ? JSON.parse(stdout) : undefined,
    };
  } catch (error) {
    const payload = {
      name,
      ok: false,
      status: error.status,
      signal: error.signal,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
    fs.writeFileSync(artifact, JSON.stringify(payload, null, 2), 'utf8');
    return { ...payload, artifact: path.relative(repoRoot, artifact) };
  }
}

function runWrangler(name, args, options = {}) {
  return run(name, cloudflareDir, [process.execPath, wranglerBin, ...args], options);
}

function runSmoke(name) {
  const result = run(name, repoRoot, [process.execPath, 'scripts/prd0055-task8-selected-class-live-proof.mjs']);
  const match = result.stdout && result.stdout.match(/output[\\/]+prd0055-task9-live-readback[\\/]+prd0055-selected-class-live-\d+\.json/i);
  const proofPath = match ? match[0].replace(/\\/g, '/') : null;
  const proof = proofPath ? JSON.parse(fs.readFileSync(path.join(repoRoot, proofPath), 'utf8')) : null;
  return {
    ...result,
    proofPath,
    proofId: proof?.proofId,
    sessionCode: proof?.fixture?.sessionCode,
    passed: proof?.passed === true,
    checks: (proof?.checks ?? []).map((check) => ({
      name: check.name,
      status: check.status,
      issueStatus: check.issueStatus,
      refreshStatus: check.refreshStatus,
      code: check.code,
      rangeStatus: check.range?.status,
    })),
  };
}

const summary = {
  createdAt: new Date().toISOString(),
  activeVersionId,
  candidateVersionId,
  candidateEquivalent: candidateSummary.equivalent === true,
  candidateSummaryPath: 'output/prd0055-task9-live-readback/wrangler-equivalent-candidate-summary.json',
  operations: [],
  explicitNonActions: [
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No code-version deploy during this percentage split; both versions already existed.',
  ],
};

let splitSucceeded = false;
try {
  const split = runWrangler('split-99-1-deploy', [
    'versions',
    'deploy',
    `${activeVersionId}@99`,
    `${candidateVersionId}@1`,
    '--message',
    'PRD-0055 1 percent equivalent candidate rollout rehearsal',
    '-y',
  ]);
  summary.operations.push(split);
  if (!split.ok) {
    throw new Error('Percentage split deploy failed');
  }
  splitSucceeded = true;

  const splitStatus = runWrangler('split-99-1-status', ['deployments', 'status', '--json'], { json: true });
  summary.operations.push(splitStatus);
  if (!splitStatus.ok) {
    throw new Error('Percentage split status readback failed');
  }

  const splitVersions = splitStatus.json?.versions ?? [];
  const activeShare = splitVersions.find((version) => version.version_id === activeVersionId)?.percentage;
  const candidateShare = splitVersions.find((version) => version.version_id === candidateVersionId)?.percentage;
  if (activeShare !== 99 || candidateShare !== 1) {
    throw new Error(`Unexpected split readback active=${activeShare} candidate=${candidateShare}`);
  }

  const smoke = runSmoke('split-99-1-smoke');
  summary.operations.push(smoke);
  if (!smoke.ok || !smoke.passed) {
    throw new Error('Percentage split smoke failed');
  }
} finally {
  const restore = runWrangler('restore-active-100-deploy', [
    'versions',
    'deploy',
    `${activeVersionId}@100`,
    '--message',
    splitSucceeded
      ? 'PRD-0055 restore active version after 1 percent rollout rehearsal'
      : 'PRD-0055 restore active version after failed percentage rehearsal attempt',
    '-y',
  ]);
  summary.operations.push(restore);

  const restoreStatus = runWrangler('restore-active-100-status', ['deployments', 'status', '--json'], { json: true });
  summary.operations.push(restoreStatus);

  if (restore.ok && restoreStatus.ok) {
    const restoreVersions = restoreStatus.json?.versions ?? [];
    const activeShare = restoreVersions.find((version) => version.version_id === activeVersionId)?.percentage;
    summary.restoredActive100 = activeShare === 100 && restoreVersions.length === 1;
  } else {
    summary.restoredActive100 = false;
  }
}

if (!summary.restoredActive100) {
  summary.passed = false;
  summary.error = 'Active version was not restored to sole 100% traffic';
} else {
  const restoreSmoke = runSmoke('restore-active-100-smoke');
  summary.operations.push(restoreSmoke);
  summary.passed = restoreSmoke.ok && restoreSmoke.passed;
  if (!summary.passed) {
    summary.error = 'Restore smoke failed';
  }
}

const summaryPath = path.join(__dirname, 'wrangler-percentage-split-rehearsal-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));

if (!summary.passed) {
  process.exitCode = 1;
}
