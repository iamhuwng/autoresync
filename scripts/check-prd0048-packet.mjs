import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const REQUIRED_TASK_TYPE_PACKET_FILES = [
  'documentation/tasks/PRD0048/reading-v2-type-diagram-labeling.md',
  'documentation/tasks/PRD0048/reading-v2-type-flowchart-completion.md',
  'documentation/tasks/PRD0048/reading-v2-type-matching-features.md',
  'documentation/tasks/PRD0048/reading-v2-type-matching-headings.md',
  'documentation/tasks/PRD0048/reading-v2-type-matching-information.md',
  'documentation/tasks/PRD0048/reading-v2-type-matching-sentence-endings.md',
  'documentation/tasks/PRD0048/reading-v2-type-multiple-choice.md',
  'documentation/tasks/PRD0048/reading-v2-type-multiple-select.md',
  'documentation/tasks/PRD0048/reading-v2-type-note-completion.md',
  'documentation/tasks/PRD0048/reading-v2-type-sentence-completion.md',
  'documentation/tasks/PRD0048/reading-v2-type-short-answer.md',
  'documentation/tasks/PRD0048/reading-v2-type-summary-completion-list.md',
  'documentation/tasks/PRD0048/reading-v2-type-summary-completion-text.md',
  'documentation/tasks/PRD0048/reading-v2-type-table-completion.md',
  'documentation/tasks/PRD0048/reading-v2-type-true-false-not-given.md',
  'documentation/tasks/PRD0048/reading-v2-type-yes-no-not-given.md',
];

export const REQUIRED_PACKET_FILES = [
  'documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md',
  'documentation/tasks/PRD0048/assessment-0048-preservation-and-foundational-plan.md',
  'documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md',
  'documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md',
  'documentation/tasks/PRD0048/reading-v2-taskgroup-object.md',
  'documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md',
  ...REQUIRED_TASK_TYPE_PACKET_FILES,
  'documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md',
  'documentation/tasks/PRD0048/reading-v2-family-choice.md',
  'documentation/tasks/PRD0048/reading-v2-family-completion.md',
  'documentation/tasks/PRD0048/reading-v2-family-matching.md',
  'documentation/tasks/PRD0048/reading-v2-family-structured-layout.md',
  'documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md',
  'documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md',
  'documentation/tasks/PRD0048/reading-v2-page-schema-studio.md',
  'documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md',
  'documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md',
  'documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md',
  'documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md',
  'documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md',
  'documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md',
  'documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md',
];

export const PACKET_SCAN_FILES = [
  'documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md',
  'documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md',
];

export const PACKET_SCAN_DIRECTORIES = ['documentation/tasks/PRD0048'];

export const PACKET_SCAN_EXCLUSIONS = new Set([
  'documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md',
  'documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md',
]);

export const STALE_REFERENCE_PATTERNS = [
  {
    label: 'deleted-teacher-lobby-page-schema',
    pattern: /reading-v2-page-schema-teacher-lobby\.md/i,
  },
  {
    label: 'deleted-teacher-result-review-page-schema',
    pattern: /reading-v2-page-schema-teacher-result-review\.md/i,
  },
  {
    label: 'deleted-student-result-review-page-schema',
    pattern: /reading-v2-page-schema-student-result-review\.md/i,
  },
  {
    label: 'missing-page-schema-docs-like-this',
    pattern: /missing\s+page-schema\s+docs?\s+like\s+this/i,
  },
  {
    label: 'stale-future-doc-sequence',
    pattern:
      /future\s+taskgroup\s+docs?,\s*future\s+family\s+docs?,\s*future\s+task-type\s+docs?/i,
  },
  {
    label: 'missing-integration-contract-sequence',
    pattern: /missing\s+integration\s+contracts?/i,
  },
];

const toAbsolute = (rootDir, relativePath) => path.join(rootDir, relativePath);

async function pathExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(rootDir, relativeDir) {
  const absoluteDir = toAbsolute(rootDir, relativeDir);

  if (!(await pathExists(absoluteDir))) {
    return [];
  }

  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = path.posix.join(
      relativeDir.replaceAll('\\', '/'),
      entry.name,
    );

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(rootDir, entryRelativePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryRelativePath);
    }
  }

  return files;
}

export async function findMissingPacketFiles(rootDir = process.cwd()) {
  const missing = [];

  for (const relativePath of REQUIRED_PACKET_FILES) {
    if (!(await pathExists(toAbsolute(rootDir, relativePath)))) {
      missing.push(relativePath);
    }
  }

  return missing;
}

export async function collectPacketScanFiles(rootDir = process.cwd()) {
  const files = new Set(PACKET_SCAN_FILES);

  for (const directory of PACKET_SCAN_DIRECTORIES) {
    const markdownFiles = await collectMarkdownFiles(rootDir, directory);
    markdownFiles.forEach((file) => files.add(file));
  }

  return Array.from(files)
    .filter((file) => !PACKET_SCAN_EXCLUSIONS.has(file))
    .sort();
}

export async function findStalePacketReferences(rootDir = process.cwd()) {
  const violations = [];
  const files = await collectPacketScanFiles(rootDir);

  for (const relativePath of files) {
    const absolutePath = toAbsolute(rootDir, relativePath);

    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const content = await readFile(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const { label, pattern } of STALE_REFERENCE_PATTERNS) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            label,
            excerpt: line.trim(),
          });
        }
      });
    }
  }

  return violations;
}

export async function runPrd0048PacketCheck(rootDir = process.cwd()) {
  const missingFiles = await findMissingPacketFiles(rootDir);
  const staleReferences = await findStalePacketReferences(rootDir);
  const scannedFiles = await collectPacketScanFiles(rootDir);

  return {
    ok: missingFiles.length === 0 && staleReferences.length === 0,
    missingFiles,
    staleReferences,
    scannedFiles,
  };
}

function formatReport(result) {
  const lines = ['PRD0048 packet check'];

  if (result.ok) {
    lines.push('PASS');
    lines.push(`Scanned ${result.scannedFiles.length} markdown files.`);
    return lines.join('\n');
  }

  lines.push('FAIL');

  if (result.missingFiles.length > 0) {
    lines.push('Missing required packet files:');
    result.missingFiles.forEach((file) => {
      lines.push(`- ${file}`);
    });
  }

  if (result.staleReferences.length > 0) {
    lines.push('Stale packet references:');
    result.staleReferences.forEach((violation) => {
      lines.push(
        `- ${violation.file}:${violation.line} [${violation.label}] ${violation.excerpt}`,
      );
    });
  }

  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = await runPrd0048PacketCheck(rootDir);
  console.log(formatReport(result));
  process.exitCode = result.ok ? 0 : 1;
}
