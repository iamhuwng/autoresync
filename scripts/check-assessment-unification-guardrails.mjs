#!/usr/bin/env node

import { execSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']);
const ASSESSMENT_PRODUCTION_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const FINDINGS_PATH = 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';

const SHARED_BOUNDARY_ROOTS = 'components\\/reading-v2|services\\/reading-v2|skills\\/listening|services\\/listeningTestStorage|services\\/r2Storage|hooks\\/audio|hooks\\/monitor';
const LISTENING_READING_ROOTS = 'components\\/reading-v2|services\\/reading-v2|reading-v2';
const LISTENING_CYCLE_ROOTS = 'skills\\/listening\\/builders\\/ListeningTestBuilder|services\\/listeningTestStorage|services\\/r2Storage';

function importPatternFor(rootAlternatives) {
  return new RegExp(
    `(?:\\bfrom\\s+['"][^'"]*(?:${rootAlternatives})[^'"]*['"]`
    + `|\\bimport\\s+['"][^'"]*(?:${rootAlternatives})[^'"]*['"]`
    + `|\\brequire\\(\\s*['"][^'"]*(?:${rootAlternatives})[^'"]*['"]\\s*\\))`,
  );
}

const SHARED_BOUNDARY_IMPORT_PATTERN = importPatternFor(SHARED_BOUNDARY_ROOTS);

const SHARED_AUTHORITY_SYMBOL_PATTERN = /\b(?:audioCommand|masterAudioState|hasAudio|isReading|isListening|isLiveSession|AudioPlayer|ListeningTestPage|ListeningPracticeView|ReadingV2RuntimeShell|useMasterAudioState|useAudioSync|useMonitorControls|parser|storage|publishedPayload|published-payload)\b/;

const LISTENING_READING_IMPORT_PATTERN = importPatternFor(LISTENING_READING_ROOTS);

const LISTENING_CYCLE_IMPORT_PATTERN = importPatternFor(LISTENING_CYCLE_ROOTS);

const PROTECTED_PATH_PATTERNS = [
  /^cloudflare\//,
  /^firebase\.(json|rc)$/,
  /^\.firebaserc$/,
  /^storage\.rules$/,
  /^database\.rules\.json$/,
  /^firestore\.rules$/,
  /^src\/services\/r2Storage\.ts$/,
  /^src\/services\/listeningTestStorage\.ts$/,
  /^src\/services\/reading-v2\//,
  /^src\/components\/reading-v2\/runtime\//,
  /^src\/skills\/listening\/components\/(?:AudioPlayer|ListeningTestPage)\.tsx$/,
  /^src\/components\/practice\/ListeningPracticeView\.tsx$/,
  /^src\/components\/test\/AudioProgressPanel\.tsx$/,
  /^src\/pages\/TeacherTestMonitorPage\.tsx$/,
  /^src\/hooks\/audio\//,
  /^src\/hooks\/monitor\/useMonitorControls\.tsx?$/,
  /^r2-backup-worker\//,
];

const ASSESSMENT_PRODUCTION_PATH_PATTERNS = [
  /^src\/features\/assessment\/shared\//,
  /^src\/features\/assessment\/listening\//,
  /^src\/components\/reading-v2\/studio\//,
  /^src\/skills\/listening\/builders\//,
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function toAbsolutePath(repoRoot, relativePath) {
  return path.join(repoRoot, ...normalizePath(relativePath).split('/'));
}

function readUtf8(filePath) {
  return readFileSync(filePath, 'utf8');
}

function listTextFiles(repoRoot, relativeDir) {
  const absoluteDir = toAbsolutePath(repoRoot, relativeDir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const files = [];
  const stack = [absoluteDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile() || !TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      files.push(normalizePath(path.relative(repoRoot, absolutePath)));
    }
  }

  return files.sort();
}

function lineViolations(repoRoot, files, checks) {
  const violations = [];

  for (const file of files) {
    const absolutePath = toAbsolutePath(repoRoot, file);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const lines = readUtf8(absolutePath).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const check of checks) {
        if (check.pattern.test(line)) {
          violations.push({
            rule: check.rule,
            file,
            line: index + 1,
            message: check.message(line),
          });
        }
      }
    });
  }

  return violations;
}

export function scanSharedBoundary(repoRoot = process.cwd()) {
  const files = listTextFiles(repoRoot, 'src/features/assessment/shared');

  return lineViolations(repoRoot, files, [
    {
      rule: 'shared-boundary',
      pattern: SHARED_BOUNDARY_IMPORT_PATTERN,
      message: () => 'Neutral shared assessment code must not import Reading V2/Listening/runtime/storage internals.',
    },
    {
      rule: 'shared-boundary',
      pattern: SHARED_AUTHORITY_SYMBOL_PATTERN,
      message: (line) => `Neutral shared assessment code contains prohibited authority symbol: ${line.trim()}`,
    },
  ]);
}

export function scanListeningDirection(repoRoot = process.cwd()) {
  const files = listTextFiles(repoRoot, 'src/features/assessment/listening');

  return lineViolations(repoRoot, files, [
    {
      rule: 'listening-direction',
      pattern: LISTENING_READING_IMPORT_PATTERN,
      message: () => 'Listening assessment feature code must not import Reading V2 internals.',
    },
    {
      rule: 'listening-direction',
      pattern: LISTENING_CYCLE_IMPORT_PATTERN,
      message: () => 'Listening assessment feature code must not import cycle-prone dependency roots.',
    },
  ]);
}

function isAssessmentProductionFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!ASSESSMENT_PRODUCTION_EXTENSIONS.has(path.extname(normalized))) {
    return false;
  }
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(normalized)) {
    return false;
  }
  return ASSESSMENT_PRODUCTION_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findingsHasBudgetJustification(repoRoot, relativePath) {
  const findingsPath = toAbsolutePath(repoRoot, FINDINGS_PATH);
  if (!existsSync(findingsPath)) {
    return false;
  }

  const findings = readUtf8(findingsPath);
  const escapedPath = normalizePath(relativePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathMention = new RegExp(escapedPath.replace(/\//g, '[\\\\/]'));
  const justification = /(?:400-line soft budget|line budget|size budget)/i.test(findings);
  const approval = /(?:approval|justification|approved deferral|approved exception)/i.test(findings);
  return pathMention.test(findings) && justification && approval;
}

function countLogicalLines(content) {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const withoutFinalNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;

  if (withoutFinalNewline.length === 0) {
    return 1;
  }

  return withoutFinalNewline.split('\n').length;
}

export function evaluateLineBudget(repoRoot = process.cwd(), changedFiles = []) {
  const violations = [];

  for (const file of changedFiles.map(normalizePath).filter(isAssessmentProductionFile)) {
    const absolutePath = toAbsolutePath(repoRoot, file);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const lineCount = countLogicalLines(readUtf8(absolutePath));
    if (lineCount <= 400) {
      continue;
    }

    if (!findingsHasBudgetJustification(repoRoot, file)) {
      violations.push({
        rule: 'assessment-line-budget',
        file,
        line: lineCount,
        message: `${file} has ${lineCount} lines and needs findings justification/approval for the 400-line soft budget.`,
      });
    }
  }

  return violations;
}

export function findProtectedPathChanges(changedFiles = []) {
  return changedFiles
    .map(normalizePath)
    .filter((file) => PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(file)));
}

function runGitChangedFiles(command, repoRoot = process.cwd()) {
  try {
    const output = execSync(command, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).map(normalizePath).filter(Boolean);
  } catch {
    return [];
  }
}

export function buildChangedFileCommands(
  baseRef = process.env.GITHUB_BASE_REF,
  eventBefore = process.env.GITHUB_EVENT_BEFORE,
) {
  const commands = [];

  if (baseRef) {
    commands.push(`git diff --name-only --diff-filter=ACMR origin/${baseRef}...HEAD`);
  } else if (eventBefore && !/^0+$/.test(eventBefore)) {
    commands.push(`git diff --name-only --diff-filter=ACMR ${eventBefore}...HEAD`);
  }

  commands.push('git diff --name-only --diff-filter=ACMR HEAD');
  commands.push('git diff --name-only --diff-filter=ACMR HEAD~1...HEAD');

  return commands;
}

export function getChangedFilesFromGit(repoRoot = process.cwd()) {
  const changedFiles = new Set();

  for (const command of buildChangedFileCommands()) {
    const trackedFiles = runGitChangedFiles(command, repoRoot);
    trackedFiles.forEach((file) => changedFiles.add(file));
    if (trackedFiles.length > 0) {
      break;
    }
  }

  runGitChangedFiles('git ls-files --others --exclude-standard', repoRoot)
    .forEach((file) => changedFiles.add(file));

  return [...changedFiles].sort();
}

function parseCliArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    changedFiles: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') {
      options.repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--changed-files') {
      options.changedFiles = (argv[index + 1] ?? '')
        .split(',')
        .map((file) => file.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--changed-file') {
      options.changedFiles = [...(options.changedFiles ?? []), argv[index + 1]].filter(Boolean);
      index += 1;
    }
  }

  return options;
}

export function runAssessmentGuardrails(repoRoot = process.cwd(), options = {}) {
  const changedFiles = options.changedFiles ?? getChangedFilesFromGit();
  const violations = [
    ...scanSharedBoundary(repoRoot),
    ...scanListeningDirection(repoRoot),
    ...evaluateLineBudget(repoRoot, changedFiles),
  ];

  return {
    changedFiles: changedFiles.map(normalizePath),
    violations,
    protectedPathChanges: findProtectedPathChanges(changedFiles),
  };
}

function printResult(result) {
  console.log('[assessment-guardrails] changed files:', result.changedFiles.length);

  for (const protectedPath of result.protectedPathChanges) {
    console.log(`[assessment-guardrails] protected path changed for reviewer attention: ${protectedPath}`);
  }

  if (result.violations.length === 0) {
    console.log('[assessment-guardrails] OK');
    return;
  }

  for (const violation of result.violations) {
    console.error(`[assessment-guardrails] ${violation.file}:${violation.line} ${violation.rule}: ${violation.message}`);
  }
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const options = parseCliArgs(process.argv.slice(2));
  const result = runAssessmentGuardrails(options.repoRoot, {
    changedFiles: options.changedFiles,
  });
  printResult(result);
  if (result.violations.length > 0) {
    process.exitCode = 1;
  }
}
