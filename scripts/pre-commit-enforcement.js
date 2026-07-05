#!/usr/bin/env node

/**
 * Pre-commit / CI enforcement script.
 *
 * Local mode:
 *   node scripts/pre-commit-enforcement.js
 *   - inspects staged files only
 *
 * CI mode:
 *   node scripts/pre-commit-enforcement.js --check
 *   - inspects the current commit diff (or PR base diff when available)
 *
 * Explicit file mode:
 *   node scripts/pre-commit-enforcement.js --check --files path/one path/two
 *   - useful for local verification of the result-governance gate
 *
 * Rules enforced:
 * - Rule 15: no new @mantine/* imports in new or modified src files
 * - PRD-0040: result-related changes must include the living governance docs
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const isCI = args.includes('--check');
const explicitFilesIndex = args.indexOf('--files');
const explicitFiles = explicitFilesIndex >= 0
  ? args.slice(explicitFilesIndex + 1).filter((arg) => !arg.startsWith('--'))
  : [];

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const REQUIRED_RESULT_DOCS = [
  'documentation/architecture/result-view-map.md',
  'documentation/architecture/result-view-permission-matrix.md',
  'documentation/architecture/result-view-fr-closure-matrix.md',
];

const REQUIRED_RESULT_CHANGE_RECORDS = [
  'documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md',
  'documentation/tasks/tasks-0040-prd-unified-result-view-architecture-and-governance.md',
  'documentation/tasks/findings-of-tasks-0040-prd-unified-result-view-architecture-and-governance.md',
  'documentation/architecture/prd0040-preflight-ledger.md',
];

const RESULT_RELATED_PATH_PATTERNS = [
  /^src\/components\/results\//,
  /^src\/components\/guest\/ClaimResultsModal\.(ts|tsx|js|jsx)$/,
  /^src\/components\/test\/TestResultsModal\.(ts|tsx|js|jsx)$/,
  /^src\/components\/writing-monitor\/WritingPeekModal\.(ts|tsx|js|jsx)$/,
  /^src\/components\/writing-results\/(WritingResultDetailModal|WritingResultView|WritingTestResultsSection)\.(ts|tsx|js|jsx)$/,
  /^src\/hooks\/test\/useTestSubmission\.(ts|tsx)$/,
  /^src\/pages\/StudentClassDetailPage\.(ts|tsx|js|jsx)$/,
  /^src\/pages\/(AcademicRecordPage|GuestResultsPage|ProfileCompletionPage|ResultDetailPage|StudentDashboardPage(?:\.teachers)?|StudentHomeworkDetailPage|StudentHomeworkListPage|StudentTestResultsPage|StudentWaitingRoomPage|SubmissionCompletePage|TeacherGradingPage|TeacherResultsDashboard|TeacherTestMonitorPage|TeacherTestResultsPage|WritingGradingPage|WritingGradingQueuePage)\.(ts|tsx|js|jsx)$/,
  /^src\/services\/(guestResultsService|resultFeedbackGeneration\.service|testResults\.service)\.(ts|js)$/,
  /^src\/App\.jsx$/,
  /^src\/config\/featureRegistry\.ts$/,
  /^src\/hooks\/monitor\/useMonitorControls\.(ts|tsx)$/,
  /^src\/hooks\/test\/useTeacherEndRedirect\.(ts|tsx)$/,
  /^src\/types\/class\.types\.ts$/,
  /^src\/types\/releaseState\.types\.ts$/,
  /^src\/config\/routeSecurity\.ts$/,
  /^documentation\/architecture\/(prd0040-preflight-ledger|result-view-map|result-view-permission-matrix|result-view-fr-closure-matrix)\.md$/,
  /^documentation\/tasks\/(0040-prd-unified-result-view-architecture-and-governance|tasks-0040-prd-unified-result-view-architecture-and-governance|findings-of-tasks-0040-prd-unified-result-view-architecture-and-governance)\.md$/,
  /^documentation\/rules\/result-view-reuse\.md$/,
];

function normalizeFiles(files) {
  return [...new Set(
    files
      .map((file) => file.trim())
      .filter(Boolean)
      .map((file) => file.replace(/\\/g, '/')),
  )];
}

function runGit(command) {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return normalizeFiles(output.split('\n'));
  } catch {
    return [];
  }
}

function getStagedChangedFiles() {
  return runGit('git diff --cached --name-only --diff-filter=ACM');
}

function getStagedNewFiles() {
  return runGit('git diff --cached --name-only --diff-filter=A');
}

function getStagedModifiedFiles() {
  return runGit('git diff --cached --name-only --diff-filter=M');
}

function getCiChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;

  if (baseRef) {
    const prFiles = runGit(`git diff --name-only --diff-filter=ACM origin/${baseRef}...HEAD`);
    if (prFiles.length > 0) {
      return prFiles;
    }
  }

  const recentCommitFiles = runGit('git diff --name-only --diff-filter=ACM HEAD~1...HEAD');
  if (recentCommitFiles.length > 0) {
    return recentCommitFiles;
  }

  return runGit('git diff-tree --no-commit-id --name-only -r HEAD');
}

function getChangedFiles() {
  if (explicitFiles.length > 0) {
    return normalizeFiles(explicitFiles);
  }

  if (isCI) {
    return getCiChangedFiles();
  }

  return getStagedChangedFiles();
}

function getNewMantineImportsInModifiedFile(filePath) {
  try {
    const diff = execSync(`git diff --cached -U0 "${filePath}"`, { encoding: 'utf-8' });
    const addedLines = diff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.substring(1));

    return addedLines.filter((line) =>
      /import\s+.*from\s+['"]@mantine\//.test(line)
      || /require\(['"]@mantine\//.test(line),
    );
  } catch {
    return [];
  }
}

function checkMantineInNewFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const violations = [];

    lines.forEach((line, index) => {
      if (
        /import\s+.*from\s+['"]@mantine\//.test(line)
        || /require\(['"]@mantine\//.test(line)
      ) {
        violations.push({ line: index + 1, content: line.trim() });
      }
    });

    return violations;
  } catch {
    return [];
  }
}

function isResultRelatedChange(filePath) {
  return RESULT_RELATED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

console.log(`\n${BOLD}Pre-commit Rule Enforcement${RESET}\n`);

let hasErrors = false;

// Rule 15: No Mantine in new files
const newFiles = getStagedNewFiles()
  .filter((file) => /\.(tsx|jsx|ts)$/.test(file) && file.startsWith('src/'));

if (newFiles.length > 0) {
  console.log(`${DIM}Checking ${newFiles.length} new file(s) for @mantine imports...${RESET}`);

  for (const file of newFiles) {
    const violations = checkMantineInNewFile(file);
    if (violations.length > 0) {
      hasErrors = true;
      console.log(`\n${RED}${BOLD}Rule 15 violation: ${file}${RESET}`);
      console.log(`${RED}  New file contains @mantine imports. This is banned for new code.${RESET}`);
      for (const violation of violations) {
        console.log(`${RED}  Line ${violation.line}: ${violation.content}${RESET}`);
      }
      console.log(`${DIM}  Use native HTML/CSS instead.${RESET}`);
    }
  }
}

// Rule 15: No new Mantine imports in modified files
const modifiedFiles = getStagedModifiedFiles()
  .filter((file) => /\.(tsx|jsx|ts)$/.test(file) && file.startsWith('src/'));

if (modifiedFiles.length > 0) {
  console.log(`${DIM}Checking ${modifiedFiles.length} modified file(s) for new @mantine imports...${RESET}`);

  for (const file of modifiedFiles) {
    const newImports = getNewMantineImportsInModifiedFile(file);
    if (newImports.length > 0) {
      hasErrors = true;
      console.log(`\n${RED}${BOLD}Rule 15 violation: ${file}${RESET}`);
      console.log(`${RED}  Adding new @mantine imports to existing files is banned.${RESET}`);
      for (const importLine of newImports) {
        console.log(`${RED}  + ${importLine.trim()}${RESET}`);
      }
      console.log(`${DIM}  Existing Mantine usage may remain, but new imports are blocked.${RESET}`);
    }
  }
}

// PRD-0040 governance docs
const changedFiles = getChangedFiles();
const resultRelatedChangedFiles = changedFiles.filter(isResultRelatedChange);

if (resultRelatedChangedFiles.length > 0) {
  console.log(`${DIM}Checking ${resultRelatedChangedFiles.length} result-related changed file(s) for PRD-0040 governance artifacts...${RESET}`);

  const changedSet = new Set(changedFiles);
  const missingDocs = REQUIRED_RESULT_DOCS.filter((doc) => !changedSet.has(doc));
  const hasChangeRecord = REQUIRED_RESULT_CHANGE_RECORDS.some((doc) => changedSet.has(doc));

  if (missingDocs.length > 0 || !hasChangeRecord) {
    hasErrors = true;
    console.log(`\n${RED}${BOLD}PRD-0040 governance violation${RESET}`);
    console.log(`${RED}  Result-related changes must be reviewable with the living architecture docs.${RESET}`);
    console.log(`${RED}  Changed result-related files:${RESET}`);
    resultRelatedChangedFiles.forEach((file) => {
      console.log(`${RED}  - ${file}${RESET}`);
    });

    if (missingDocs.length > 0) {
      console.log(`${RED}  Missing required staged/changed governance docs:${RESET}`);
      missingDocs.forEach((doc) => {
        console.log(`${RED}  - ${doc}${RESET}`);
      });
    }

    if (!hasChangeRecord) {
      console.log(`${RED}  Missing required change record. Stage at least one of:${RESET}`);
      REQUIRED_RESULT_CHANGE_RECORDS.forEach((doc) => {
        console.log(`${RED}  - ${doc}${RESET}`);
      });
    }

    console.log(`${DIM}  See documentation/rules/result-view-reuse.md for the PRD-0040 review gate.${RESET}`);
  }
}

console.log('');
if (hasErrors) {
  console.log(`${RED}${BOLD}Commit/check blocked. Fix the violations above.${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}All enforcement checks passed.${RESET}`);
process.exit(0);
