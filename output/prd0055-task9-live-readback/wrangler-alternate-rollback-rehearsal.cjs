const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cloudflareDir = path.join(repoRoot, 'cloudflare');
const wranglerBin = path.join(cloudflareDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const bundledX64Node = 'C:\\Users\\The Lord\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const wranglerNode = fs.existsSync(bundledX64Node) ? bundledX64Node : process.execPath;
const activeVersionId = '993acdc9-dd93-4ee8-8764-15847146ac3a';
const candidateSummary = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'wrangler-equivalent-candidate-summary.json'), 'utf8'),
);
const candidateVersionId = candidateSummary.candidateVersionId;

if (!candidateSummary.safeForTrafficSplit || !candidateSummary.equivalent) {
  throw new Error('Equivalent candidate is not marked safe for alternate rollback rehearsal');
}

function run(name, cwd, commandArgs, options = {}) {
  const artifact = path.join(__dirname, `wrangler-alternate-rollback-${name}.${options.json ? 'json' : 'txt'}`);
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
  return run(name, cloudflareDir, [wranglerNode, wranglerBin, ...args], options);
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

function assertSingleVersion(status, versionId, label) {
  const versions = status.json?.versions ?? [];
  const share = versions.find((version) => version.version_id === versionId)?.percentage;
  if (versions.length !== 1 || share !== 100) {
    throw new Error(`${label} readback did not show ${versionId} at 100%`);
  }
}

const summary = {
  createdAt: new Date().toISOString(),
  activeVersionId,
  candidateVersionId,
  wranglerNode,
  candidateSummaryPath: 'output/prd0055-task9-live-readback/wrangler-equivalent-candidate-summary.json',
  operations: [],
  explicitNonActions: [
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No code-version upload during this alternate rollback rehearsal; both versions already existed.',
  ],
};

let candidateActivated = false;
try {
  const candidateDeploy = runWrangler('candidate-100-deploy', [
    'versions',
    'deploy',
    `${candidateVersionId}@100`,
    '--message',
    'PRD-0055 alternate equivalent candidate recovery rehearsal',
    '-y',
  ]);
  summary.operations.push(candidateDeploy);
  if (!candidateDeploy.ok) {
    throw new Error('Candidate 100% deploy failed');
  }
  candidateActivated = true;

  const candidateStatus = runWrangler('candidate-100-status', ['deployments', 'status', '--json'], { json: true });
  summary.operations.push(candidateStatus);
  if (!candidateStatus.ok) {
    throw new Error('Candidate 100% status readback failed');
  }
  assertSingleVersion(candidateStatus, candidateVersionId, 'candidate');

  const candidateSmoke = runSmoke('candidate-100-smoke');
  summary.operations.push(candidateSmoke);
  if (!candidateSmoke.ok || !candidateSmoke.passed) {
    throw new Error('Candidate 100% live private smoke failed');
  }
} finally {
  const restore = runWrangler('restore-active-100-deploy', [
    'versions',
    'deploy',
    `${activeVersionId}@100`,
    '--message',
    candidateActivated
      ? 'PRD-0055 restore active version after alternate candidate rehearsal'
      : 'PRD-0055 restore active version after failed alternate candidate rehearsal attempt',
    '-y',
  ]);
  summary.operations.push(restore);

  const restoreStatus = runWrangler('restore-active-100-status', ['deployments', 'status', '--json'], { json: true });
  summary.operations.push(restoreStatus);

  if (restore.ok && restoreStatus.ok) {
    try {
      assertSingleVersion(restoreStatus, activeVersionId, 'restore');
      summary.restoredActive100 = true;
    } catch (error) {
      summary.restoredActive100 = false;
      summary.restoreError = error.message;
    }
  } else {
    summary.restoredActive100 = false;
  }
}

if (summary.restoredActive100) {
  const restoreSmoke = runSmoke('restore-active-100-smoke');
  summary.operations.push(restoreSmoke);
  summary.passed = restoreSmoke.ok && restoreSmoke.passed;
  if (!summary.passed) {
    summary.error = 'Restore active 100% live private smoke failed';
  }
} else {
  summary.passed = false;
  summary.error = 'Active version was not restored to sole 100% traffic';
}

const summaryPath = path.join(__dirname, 'wrangler-alternate-rollback-rehearsal-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));

if (!summary.passed) {
  process.exitCode = 1;
}
