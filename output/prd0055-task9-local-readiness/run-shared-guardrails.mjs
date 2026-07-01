import { writeFileSync } from 'node:fs';
import { runAssessmentGuardrails } from '../../scripts/check-assessment-unification-guardrails.mjs';
import readiness from './boundary-static-readiness-report.json' with { type: 'json' };

const result = runAssessmentGuardrails(process.cwd(), {
  changedFiles: readiness.sharedFiles,
});

const text = [
  `[assessment-guardrails] changed files: ${result.changedFiles.length}`,
  ...result.protectedPathChanges.map(
    (file) => `[assessment-guardrails] protected path changed for reviewer attention: ${file}`,
  ),
  ...(result.violations.length === 0
    ? ['[assessment-guardrails] OK']
    : result.violations.map(
        (violation) =>
          `[assessment-guardrails] ${violation.file}:${violation.line} ${violation.rule}: ${violation.message}`,
      )),
  '',
].join('\n');

writeFileSync(
  'output/prd0055-task9-local-readiness/assessment-guardrails-shared-report.txt',
  text,
  'utf8',
);
writeFileSync(
  'output/prd0055-task9-local-readiness/assessment-guardrails-shared-report.json',
  JSON.stringify(result, null, 2) + '\n',
  'utf8',
);
console.log(text.trimEnd());
if (result.violations.length > 0) {
  process.exitCode = 1;
}
