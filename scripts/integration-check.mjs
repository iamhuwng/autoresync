import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const integrationCheckName = 'LuyenTap integration';

export const candidateJobs = {
  verify: 'Release checker tests, RTDB access rules, acceptance build and bundle budget',
  guardrails: 'Assessment, Mantine, result governance, activity coverage and focused app suites',
  'notification-workflows': 'Candidate notification Worker workflows',
  'candidate-homework': 'Candidate Homework/backup Worker tests and dry-run build',
};
const retentionJob = 'deployed-homework-rebuild';
const gitId = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

export function checkIntegration(needs, revision, tree) {
  const errors = [];
  if (!gitId(revision) || !gitId(tree)) errors.push('Missing or invalid integration checkout identity');
  const rows = Object.entries(candidateJobs).map(([id, scope]) => {
    const job = needs?.[id];
    if (job?.result !== 'success') errors.push(`${id}: ${job?.result ?? 'missing'}`);
    if (!gitId(job?.outputs?.revision) || !gitId(job?.outputs?.tree)
      || job.outputs.revision !== revision || job.outputs.tree !== tree) {
      errors.push(`${id}: candidate source mismatch or missing evidence`);
    }
    return `| ${id} | ${job?.result ?? 'missing'} | ${job?.outputs?.revision ?? 'missing'} | ${job?.outputs?.tree ?? 'missing'} | ${scope} |`;
  });
  const retained = needs?.[retentionJob];
  if (retained?.result !== 'success') errors.push(`${retentionJob}: ${retained?.result ?? 'missing'}`);
  const summary = [
    `## ${integrationCheckName}`,
    `Candidate checkout: \`${revision}\`; tree: \`${tree}\`. PRs use the tested merge commit; merge queue uses its group commit.`,
    '',
    '| Required candidate job | Result | Tested commit | Tested tree | Scope (logs contain test counts) |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Retention evidence: **${retentionJob}: ${retained?.result ?? 'missing'}**. This rebuilds the recorded deployed revision and does not cover the candidate.`,
    '',
    errors.length ? `**FAIL**\n${errors.map(error => `- ${error}`).join('\n')}` : '**PASS**: every required job succeeded with matching candidate source evidence.',
    '',
    'This bounded CI scope is integration evidence, not production deployment authorization or complete browser acceptance.',
    '',
  ].join('\n');
  return { errors, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'test-report') {
    const { parseVitestReport } = await import('./release-verification.mjs');
    const files = process.argv[4] === '--files-file'
      ? JSON.parse(readFileSync(process.argv[5], 'utf8')).map(entry => path.relative(process.cwd(), entry.file))
      : process.argv.slice(4);
    if (process.argv[4] === '--files-file') {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', ...files], { stdio: 'pipe', windowsHide: true });
    }
    const counts = parseVitestReport(JSON.parse(readFileSync(process.argv[3], 'utf8')), files, process.cwd());
    const summary = `### Candidate tests\n${files.length} explicit files: ${counts.passed}/${counts.total} passed, zero failures/skips/TODO.\n\n${files.map(file => `- \`${file}\``).join('\n')}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
  } else {
    const result = checkIntegration(JSON.parse(process.env.INTEGRATION_NEEDS ?? '{}'), process.env.GITHUB_SHA, process.env.INTEGRATION_TREE);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary);
    console.log(result.summary);
    if (result.errors.length) process.exitCode = 1;
  }
}
