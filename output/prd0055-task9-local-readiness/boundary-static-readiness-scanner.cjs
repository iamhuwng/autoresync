const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = process.cwd();
const outDir = path.join(root, 'output', 'prd0055-task9-local-readiness');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function linesWith(pattern, file) {
  const text = fs.readFileSync(file, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line, lineNumber: i + 1 }))
    .filter((item) => pattern.test(item.line));
}

function importSpecs(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [];
  const re = /(?:import(?:[\s\S]*?from\s*)?|export(?:[\s\S]*?from\s*)?|require\()(["'])([^"']+)\1/g;
  let match;
  while ((match = re.exec(text))) specs.push(match[2]);
  return specs;
}

const sharedFiles = walk(path.join(root, 'src', 'features', 'assessment', 'shared'));
const readingFiles = walk(path.join(root, 'src', 'components', 'reading-v2'));
const listeningFiles = [
  ...walk(path.join(root, 'src', 'features', 'assessment', 'listening')),
  ...walk(path.join(root, 'src', 'skills', 'listening')),
].filter((value, index, all) => all.indexOf(value) === index);

const authorityTerms =
  /(reading-v2|ReadingV2|Listening|listening|audioCommand|masterAudioState|audio|passage|parser|storage|session|firebase|r2|cloudflare|@mantine|AppShell)/i;

const sharedAuthorityHits = [];
for (const file of sharedFiles) {
  const hits = linesWith(authorityTerms, file).filter(
    (item) =>
      !/AssessmentValidationSummary|AssessmentStatusState|AssessmentAuthoring|validation-summary|status-state|authoring-section|authoring-header/i.test(
        item.line,
      ) &&
      !/not\.toHaveTextContent\([^)]*Reading\|Listening\|audio\|parser\|storage\|runtime\|live/i.test(item.line),
  );
  for (const hit of hits) {
    sharedAuthorityHits.push({
      file: rel(file),
      lineNumber: hit.lineNumber,
      line: hit.line.trim(),
    });
  }
}

const listeningImportsReading = [];
for (const file of listeningFiles) {
  for (const spec of importSpecs(file)) {
    if (/(reading-v2|ReadingV2|readingV2)/.test(spec)) {
      listeningImportsReading.push({ file: rel(file), spec });
    }
  }
}

const readingImportsListening = [];
for (const file of readingFiles) {
  for (const spec of importSpecs(file)) {
    if (/(listening|Listening)/.test(spec)) {
      readingImportsListening.push({ file: rel(file), spec });
    }
  }
}

const addedProtectedPatterns = [];
let diff = '';
try {
  diff = cp.execFileSync('git', ['diff', '--unified=0', '--', 'src'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (error) {
  diff = error.stdout?.toString() || '';
}

for (const line of diff.split(/\r?\n/)) {
  if (!/^\+[^+]/.test(line)) continue;
  if (
    /(from ['"]@mantine|@mantine\/|localStorage|sessionStorage|IndexedDB|dangerouslySetInnerHTML|window\.innerWidth|window\.matchMedia)/.test(
      line,
    )
  ) {
    addedProtectedPatterns.push(line.slice(0, 500));
  }
}

const taskboxLines = fs
  .readFileSync(
    path.join(root, 'tasks', 'tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md'),
    'utf8',
  )
  .split(/\r?\n/)
  .map((line, index) => ({ lineNumber: index + 1, line }))
  .filter((item) => /^\s*- \[[ xX]\] (8\.14|8\.15|8\.16|8\.17|8\.18|9\.0|9\.)/.test(item.line));
const remainingTaskboxLines = taskboxLines.filter((item) => /^\s*- \[ \]/.test(item.line));

const report = {
  createdAt: new Date().toISOString(),
  scope:
    'PRD-0055 Task 9.5/9.11 local boundary/static closure under localhost-only scope; no rollout, deploy, cleanup, commit, or push',
  command: 'rtk node output/prd0055-task9-local-readiness/boundary-static-readiness-scanner.cjs',
  counts: {
    sharedFiles: sharedFiles.length,
    readingFiles: readingFiles.length,
    listeningFiles: listeningFiles.length,
    sharedAuthorityHits: sharedAuthorityHits.length,
    listeningImportsReading: listeningImportsReading.length,
    readingImportsListening: readingImportsListening.length,
    addedProtectedPatterns: addedProtectedPatterns.length,
    remainingTaskboxes: remainingTaskboxLines.length,
  },
  sharedFiles: sharedFiles.map(rel),
  readingFiles: readingFiles.map(rel),
  listeningFiles: listeningFiles.map(rel),
  findings: {
    sharedAuthorityHits,
    listeningImportsReading,
    readingImportsListening,
    addedProtectedPatterns,
  },
  checkedTargetTaskboxes: taskboxLines.filter((item) => /^\s*- \[[xX]\]/.test(item.line)),
  remainingTaskboxes: remainingTaskboxLines,
  verdict:
    sharedAuthorityHits.length ||
    listeningImportsReading.length ||
    readingImportsListening.length ||
    addedProtectedPatterns.length
      ? 'PARTIAL_WITH_FINDINGS'
      : 'LOCAL_STATIC_PASS',
  blockers: [],
  scopedNonActions: [
    'Live-domain/deployed proof, selected-user rollout, percentage rollout, full rollout, and human production acceptance are future-deferred non-gates.',
    'No production deploy, remote mutation, cleanup/delete, commit, or push is claimed.',
  ],
};

const out = path.join(outDir, 'boundary-static-readiness-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ report: rel(out), counts: report.counts, verdict: report.verdict }, null, 2));
