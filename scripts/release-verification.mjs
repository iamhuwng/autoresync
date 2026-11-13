import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { collectSourceState } from './release-check.mjs';

const verified = new WeakSet();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`Release verification: ${message}`); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const fields = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) fail('invalid plan fields');
};
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
};
const execute = (command, args, cwd, allowNonzero = false) => {
  const child = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false, windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
  if (child.error || child.signal || (!allowNonzero && child.status !== 0)) fail(`runner failed (${child.error?.code || child.signal || child.status})`);
  return child;
};

async function trackedPath(cwd, value, test = false) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/u.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')
    || (test && !/\.(?:test|spec)\.(?:[cm]?js|[jt]sx?)$/u.test(value))) fail(`paths must be explicit relative tracked files: ${String(value)}`);
  const absolute = path.resolve(cwd, value);
  if (!inside(cwd, absolute) || !inside(cwd, await realpath(absolute)) || !(await stat(absolute)).isFile()) fail('path escapes candidate or is not a file');
  if (!value.startsWith('tmp/release-receipts/')) execute('git', ['ls-files', '--error-unmatch', '--', value], cwd);
  return value;
}

const nodeReporter = `
import { createHash } from 'node:crypto';
export default async function* (events) {
  const output = createHash('sha256');
  let summary;
  let actualTests = 0;
  for await (const event of events) {
    output.update(JSON.stringify(event));
    if (event.type === 'test:pass' && event.data.details.type === 'test' && event.data.name !== event.data.file) actualTests++;
    if (event.type === 'test:summary' && !event.data.file) summary = event.data;
  }
  if (!summary) throw new Error('Missing final test summary');
  yield JSON.stringify({summary,actualTests,outputSha256:output.digest('hex')});
}
`;

const validCounts = counts => {
  if (Object.values(counts).some(value => !Number.isSafeInteger(value) || value < 0)
    || counts.total < 1 || counts.failed || counts.skipped || counts.passed !== counts.total) fail('suite must execute nonzero tests without failures or skips');
  return counts;
};

export function parseVitestReport(report, expectedFiles, cwd) {
  const failedFiles = expectedFiles.filter(file => report?.testResults?.some(result =>
    path.resolve(result.name) === path.resolve(cwd, file) && result.status !== 'passed'));
  if (failedFiles.length) fail(`Vitest failed in ${failedFiles.join(', ')}`);
  if (!report || report.success !== true || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0
    || !Array.isArray(report.testResults) || report.testResults.length !== expectedFiles.length
    || report.testResults.some(result => result.status !== 'passed')
    || expectedFiles.some(file => !report.testResults.some(result => path.resolve(result.name) === path.resolve(cwd, file)))) fail('Vitest did not verify the explicit suite');
  return validCounts({ total: report.numTotalTests, passed: report.numPassedTests,
    failed: report.numFailedTests, skipped: report.numPendingTests + report.numTodoTests });
}

export const isReleaseVerification = value => Boolean(value && verified.has(value));

export function assertReleaseVerification(value, { source, envFingerprint, planSha256 } = {}) {
  if (!isReleaseVerification(value) || !source || source.dirty
    || !['revision', 'tree', 'baseRevision', 'fingerprint'].every(key => value.source[key] === source[key])
    || value.envFingerprint !== envFingerprint || value.planSha256 !== planSha256) fail('untrusted or stale candidate, environment, or plan binding');
  return value;
}

export async function runReleaseVerification({ cwd, base, planPath, envFingerprint }) {
  if (!digest(envFingerprint)) fail('environment fingerprint must be a SHA-256 digest');
  cwd = await realpath(cwd);
  const source = await collectSourceState(cwd, base);
  if (source.dirty) fail('candidate must be clean before verification');
  const planBytes = await readFile(path.resolve(cwd, planPath));
  const plan = JSON.parse(planBytes.toString('utf8'));
  fields(plan, ['schemaVersion', 'suites']);
  if (plan.schemaVersion !== 1 || !Array.isArray(plan.suites) || !plan.suites.length || plan.suites.length > 30) fail('plan requires schemaVersion 1 and explicit suites');
  for (const suite of plan.suites) {
    fields(suite, ['runner', 'files', 'config']);
    if (!['node', 'vitest'].includes(suite.runner) || !Array.isArray(suite.files) || !suite.files.length
      || suite.files.length > 200 || new Set(suite.files).size !== suite.files.length
      || (suite.runner === 'node' && suite.config !== undefined)) fail('invalid suite');
    for (const file of suite.files) await trackedPath(cwd, file, true);
    if (suite.config !== undefined) await trackedPath(cwd, suite.config);
  }
  const startedAt = new Date().toISOString();
  const suites = [];
  for (const suite of plan.suites) {
    let counts, outputSha256;
    if (suite.runner === 'node') {
      const child = execute(process.execPath, ['--test', '--test-concurrency=1',
        `--test-reporter=data:text/javascript,${encodeURIComponent(nodeReporter)}`,
        ...suite.files.map(file => path.resolve(cwd, file))], cwd);
      const result = JSON.parse(child.stdout);
      if (!result.actualTests) fail('suite must execute nonzero tests');
      const summary = result.summary;
      counts = validCounts({ total: summary.counts.tests, passed: summary.counts.passed,
        failed: summary.counts.failed + summary.counts.cancelled, skipped: summary.counts.skipped + summary.counts.todo });
      outputSha256 = hash(`${result.outputSha256}\n${child.stderr}`);
    } else {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'luyentap-verification-'));
      try {
        const outputFile = path.join(temporary, 'vitest.json');
        const child = execute(process.execPath, [path.join(cwd, 'scripts/tooling-where.mjs'), '--exec', 'vitest', 'run',
          ...suite.files, ...(suite.config ? ['--config', suite.config] : []), '--reporter=json', '--outputFile', outputFile,
          '--passWithNoTests=false', '--maxWorkers=1'], cwd, true);
        const reportBytes = await readFile(outputFile);
        counts = parseVitestReport(JSON.parse(reportBytes), suite.files, cwd);
        if (child.status !== 0) fail(`Vitest runner exited ${child.status} despite its passing report`);
        outputSha256 = hash(`${child.stdout}\n${child.stderr}\n${reportBytes}`);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    suites.push(Object.freeze({ ...suite, files: Object.freeze([...suite.files]), counts: Object.freeze(counts), outputSha256 }));
  }
  const after = await collectSourceState(cwd, base);
  if (after.dirty || after.fingerprint !== source.fingerprint) fail('candidate changed during verification');
  if (!planBytes.equals(await readFile(path.resolve(cwd, planPath)))) fail('plan changed during verification');
  const result = Object.freeze({ schemaVersion: 1, decision: 'PASS',
    source: Object.freeze({ revision: source.revision, tree: source.tree, baseRevision: source.baseRevision, fingerprint: source.fingerprint, dirty: false }),
    envFingerprint, planSha256: hash(planBytes), startedAt, completedAt: new Date().toISOString(), suites: Object.freeze(suites) });
  verified.add(result);
  return result;
}
