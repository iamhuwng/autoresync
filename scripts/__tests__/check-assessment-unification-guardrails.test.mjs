import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  buildChangedFileCommands,
  evaluateLineBudget,
  findProtectedPathChanges,
  getChangedFilesFromGit,
  runAssessmentGuardrails,
  scanListeningDirection,
  scanSharedBoundary,
} from '../check-assessment-unification-guardrails.mjs';

function makeFixture(name) {
  const root = join(tmpdir(), `assessment-guardrails-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function write(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

test('scanSharedBoundary rejects module imports and authority symbols in neutral shared code', () => {
  const root = makeFixture('shared-boundary');
  write(
    root,
    'src/features/assessment/shared/components/Bad.tsx',
    [
      "import { Shell } from '../../../components/reading-v2/runtime/Shell';",
      'export const leaked = "audioCommand";',
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 2);
  assert.equal(violations[0].rule, 'shared-boundary');
  assert.match(violations[0].message, /Reading V2\/Listening/);
  assert.match(violations[1].message, /audioCommand/);
});

test('scanSharedBoundary rejects bare side-effect imports from prohibited roots', () => {
  const root = makeFixture('shared-side-effect');
  write(
    root,
    'src/features/assessment/shared/components/BadSideEffect.tsx',
    [
      "import '../../../components/reading-v2/runtime/Shell';",
      "import '../../../skills/listening/builders/ListeningTestBuilder';",
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 2);
  assert.equal(violations[0].rule, 'shared-boundary');
  assert.equal(violations[1].rule, 'shared-boundary');
});

test('scanListeningDirection rejects Reading V2 imports and cycle-prone dependencies', () => {
  const root = makeFixture('listening-direction');
  write(
    root,
    'src/features/assessment/listening/adapter.ts',
    [
      "import { normalize } from '../../components/reading-v2/studio/ReadingV2SettingsPanel';",
      "import { save } from '../../../services/listeningTestStorage';",
      '',
    ].join('\n'),
  );

  const violations = scanListeningDirection(root);

  assert.equal(violations.length, 2);
  assert.match(violations[0].message, /Reading V2 internals/);
  assert.match(violations[1].message, /cycle-prone dependency/);
});

test('scanListeningDirection rejects bare side-effect imports from prohibited roots', () => {
  const root = makeFixture('listening-side-effect');
  write(
    root,
    'src/features/assessment/listening/adapter.ts',
    [
      "import '../../components/reading-v2/studio/ReadingV2SettingsPanel';",
      "import '../../../services/listeningTestStorage';",
      '',
    ].join('\n'),
  );

  const violations = scanListeningDirection(root);

  assert.equal(violations.length, 2);
  assert.match(violations[0].message, /Reading V2 internals/);
  assert.match(violations[1].message, /cycle-prone dependency/);
});

test('evaluateLineBudget requires findings justification for oversized changed production files', () => {
  const root = makeFixture('line-budget');
  const relativePath = 'src/features/assessment/shared/components/Huge.tsx';
  write(root, relativePath, `${Array.from({ length: 401 }, (_, index) => `export const n${index} = ${index};`).join('\n')}\n`);
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  const blocked = evaluateLineBudget(root, [relativePath]);

  assert.equal(blocked.length, 1);
  assert.match(blocked[0].message, /400-line soft budget/);

  write(
    root,
    'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md',
    `# Findings\n\n${relativePath}: 400-line soft budget justification and approval recorded.\n`,
  );

  assert.deepEqual(evaluateLineBudget(root, [relativePath]), []);
});

test('evaluateLineBudget allows exactly 400 logical lines with a trailing newline', () => {
  const root = makeFixture('line-budget-boundary');
  const relativePath = 'src/features/assessment/shared/components/ExactBudget.tsx';
  write(root, relativePath, `${Array.from({ length: 400 }, (_, index) => `export const n${index} = ${index};`).join('\n')}\n`);
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  assert.deepEqual(evaluateLineBudget(root, [relativePath]), []);
});

test('changed-file commands include renamed assessment files', () => {
  const commands = buildChangedFileCommands('main');

  assert.equal(commands.length, 3);
  assert.ok(commands.every((command) => command.includes('--diff-filter=ACMR')));
});

test('changed-file commands include the full pushed range when provided', () => {
  const commands = buildChangedFileCommands(undefined, 'abc123');

  assert.deepEqual(commands, [
    'git diff --name-only --diff-filter=ACMR abc123...HEAD',
    'git diff --name-only --diff-filter=ACMR HEAD',
    'git diff --name-only --diff-filter=ACMR HEAD~1...HEAD',
  ]);
});

test('changed-file discovery includes untracked files alongside tracked diffs', () => {
  const root = makeFixture('git-discovery');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' });
  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });

  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 2;\n');
  write(root, 'scripts/check-assessment-unification-guardrails.mjs', 'export {};\n');

  assert.deepEqual(getChangedFilesFromGit(root).sort(), [
    'scripts/check-assessment-unification-guardrails.mjs',
    'src/features/assessment/shared/components/Tracked.tsx',
  ]);
});

test('protected path scan annotates protected scope without failing guardrail-only runs', () => {
  const changedFiles = [
    'cloudflare/worker.js',
    'src/features/assessment/shared/components/AssessmentStatusState.tsx',
  ];

  assert.deepEqual(findProtectedPathChanges(changedFiles), ['cloudflare/worker.js']);
});

test('runAssessmentGuardrails passes clean neutral fixtures and reports protected annotations', () => {
  const root = makeFixture('clean');
  write(root, 'src/features/assessment/shared/components/Neutral.tsx', 'export const Neutral = () => null;\n');
  write(root, 'src/features/assessment/listening/adapter.ts', "import { Neutral } from '../shared/components/Neutral';\n");
  write(root, 'cloudflare/worker.js', 'export default {};\n');
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  const result = runAssessmentGuardrails(root, {
    changedFiles: [
      'src/features/assessment/shared/components/Neutral.tsx',
      'cloudflare/worker.js',
    ],
  });

  assert.equal(result.violations.length, 0);
  assert.deepEqual(result.protectedPathChanges, ['cloudflare/worker.js']);
});
