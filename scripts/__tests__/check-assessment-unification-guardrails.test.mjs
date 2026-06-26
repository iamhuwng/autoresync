import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, test } from 'node:test';

import {
  buildChangedFileCommands,
  evaluateLineBudget,
  findProtectedPathChanges,
  getChangedFilesFromGit,
  runAssessmentGuardrails,
  scanListeningDirection,
  scanSharedBoundary,
} from '../check-assessment-unification-guardrails.mjs';

const fixtureRoots = [];

function makeFixture(name) {
  const root = join(tmpdir(), `assessment-guardrails-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  fixtureRoots.push(root);
  return root;
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop(), { recursive: true, force: true });
  }
});

function write(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function withEnv(overrides, callback) {
  const original = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    original.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('scanSharedBoundary rejects module imports and authority symbols in neutral shared code', () => {
  const root = makeFixture('shared-boundary');
  write(
    root,
    'src/features/assessment/shared/components/Bad.tsx',
    [
      "import { Shell } from '../../../components/reading-v2/runtime/Shell';",
      'export const audioCommand = true;',
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

test('scanSharedBoundary extracts multiline static, export-from, dynamic, and require specifiers', () => {
  const root = makeFixture('shared-module-specifiers');
  write(
    root,
    'src/features/assessment/shared/components/BadImports.tsx',
    [
      'import {',
      '  RuntimeShell,',
      '} from',
      "  '../../../components/reading-v2/runtime/ReadingV2RuntimeShell';",
      'export {',
      '  ListeningTestBuilder,',
      '} from',
      "  '../../../skills/listening/builders/ListeningTestBuilder';",
      "const runtime = await import('../../../services/reading-v2/runtime');",
      "const loadedModule = require('../../../services/r2Storage');",
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 4);
  assert.ok(violations.every((violation) => violation.rule === 'shared-boundary'));
});

test('scanSharedBoundary rejects prohibited authority identifiers in aliased import/export specifiers', () => {
  const root = makeFixture('shared-authority-aliases');
  write(
    root,
    'src/features/assessment/shared/components/AliasedAuthority.tsx',
    [
      "import { audioSections as neutralSections, safeLocal as teacherSessionState } from './neutral';",
      "export { publishPayload as safePayload, safeStorage as storagePath } from './neutral';",
      'export const keep = 1;',
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);
  const matchedSymbols = violations.map(
    (violation) => violation.message.match(/(?:audioSections|teacherSessionState|publishPayload|storagePath)/)?.[0],
  );

  assert.deepEqual(
    matchedSymbols,
    ['audioSections', 'teacherSessionState', 'publishPayload', 'storagePath'],
  );
});

test('scanSharedBoundary fails closed on non-literal dynamic import and require', () => {
  const root = makeFixture('shared-non-literal-module-specifiers');
  write(
    root,
    'src/features/assessment/shared/components/NonLiteral.tsx',
    [
      "const runtime = await import('../../../services/' + 'r2Storage');",
      "const loaded = require('../../../services/' + 'reading-v2/runtime');",
      '',
    ].join('\n'),
  );
  write(
    root,
    'src/features/assessment/shared/components/NonLiteral.test.tsx',
    [
      "const ignoredRuntime = await import('../../../services/' + 'r2Storage');",
      "const ignoredLoaded = require('../../../services/' + 'reading-v2/runtime');",
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 2);
  assert.ok(violations.every((violation) => violation.rule === 'shared-boundary'));
  assert.ok(violations.every((violation) => /string literal|prove/i.test(violation.message)));
});

test('scanSharedBoundary rejects TypeScript import types from prohibited shared roots', () => {
  const root = makeFixture('shared-import-types');
  write(
    root,
    'src/features/assessment/shared/components/Typed.ts',
    [
      "type ReadingRuntime = import('../../../components/reading-v2/runtime/ReadingV2RuntimeShell').Thing;",
      "type ListeningBuilder = import('../../../skills/listening/builders/ListeningTestBuilder').Thing;",
      "type ListeningStorage = import('../../../services/listeningTestStorage').Thing;",
      "type R2Storage = import('../../../services/r2Storage').R2StorageService;",
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 4);
  assert.ok(violations.every((violation) => violation.rule === 'shared-boundary'));
});

test('scanSharedBoundary fails closed on malformed scanned source', () => {
  const root = makeFixture('shared-malformed');
  write(
    root,
    'src/features/assessment/shared/components/Malformed.tsx',
    'export const broken = <div>;\n',
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'source-scan-error');
  assert.match(violations[0].message, /parse/i);
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

test('scanListeningDirection rejects Reading V2 imports from current Listening builders', () => {
  const root = makeFixture('listening-builder-direction');
  write(
    root,
    'src/skills/listening/builders/BuilderAdapter.tsx',
    "const runtime = await import('../../../components/reading-v2/runtime/ReadingV2RuntimeShell');\n",
  );

  const violations = scanListeningDirection(root);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'listening-direction');
  assert.match(violations[0].message, /Reading V2 internals/);
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

test('scanListeningDirection fails closed on non-literal dynamic import and require in current and future Listening files', () => {
  const root = makeFixture('listening-non-literal-module-specifiers');
  write(
    root,
    'src/features/assessment/listening/adapter.ts',
    "const shared = await import('../' + 'shared/components/Neutral');\n",
  );
  write(
    root,
    'src/skills/listening/builders/BuilderAdapter.tsx',
    "const storage = require('../' + 'safe-module');\n",
  );
  write(
    root,
    'src/features/assessment/listening/adapter.test.ts',
    "const ignored = await import('../' + 'shared/components/Neutral');\n",
  );

  const violations = scanListeningDirection(root);

  assert.equal(violations.length, 2);
  assert.ok(violations.every((violation) => violation.rule === 'listening-direction'));
  assert.ok(violations.every((violation) => /string literal|prove/i.test(violation.message)));
});

test('scanListeningDirection reports one parse error for a malformed future Listening file', () => {
  const root = makeFixture('listening-malformed-parse-error');
  write(
    root,
    'src/features/assessment/listening/Malformed.tsx',
    'export const broken = <div>;\n',
  );

  const violations = scanListeningDirection(root);
  const parseErrors = violations.filter((violation) => violation.rule === 'source-scan-error');

  assert.equal(parseErrors.length, 1);
  assert.match(parseErrors[0].message, /parse/i);
});

test('scanListeningDirection rejects TypeScript import types to Reading V2 roots in future and current Listening files', () => {
  const root = makeFixture('listening-import-types');
  write(
    root,
    'src/features/assessment/listening/Typed.ts',
    "type FutureRuntime = import('../../../components/reading-v2/runtime/ReadingV2RuntimeShell').Thing;\n",
  );
  write(
    root,
    'src/skills/listening/builders/Typed.ts',
    "type BuilderRuntime = import('../../../components/reading-v2/runtime/ReadingV2RuntimeShell').Thing;\n",
  );

  const violations = scanListeningDirection(root);

  assert.equal(violations.length, 2);
  assert.ok(violations.every((violation) => violation.rule === 'listening-direction'));
});

test('evaluateLineBudget requires exact current structured approval for each oversized file', () => {
  const root = makeFixture('line-budget');
  const relativePath = 'src/features/assessment/shared/components/Huge.tsx';
  write(root, relativePath, `${Array.from({ length: 401 }, (_, index) => `export const n${index} = ${index};`).join('\n')}\n`);
  const findingsPath = 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';
  write(
    root,
    findingsPath,
    [
      '# Findings',
      '',
      'approval justification line budget',
      `${relativePath}: approval and justification recorded at 400 lines.`,
      '',
    ].join('\n'),
  );

  const blocked = evaluateLineBudget(root, [relativePath]);

  assert.equal(blocked.length, 1);
  assert.match(blocked[0].message, /400-line soft budget/);

  write(
    root,
    findingsPath,
    [
      '# Findings',
      '',
      '<!-- assessment-line-budget-exception',
      `path: ${relativePath}`,
      'line-count: 401',
      'responsibilities: schema normalization',
      'split-alternatives: schema walker helper; validation mapper',
      'rejection-reason: schema walker helper => duplicates same traversal state; validation mapper => fragments one exported adapter contract',
      'approver: Jane Reviewer',
      'approver-role: Assessment Architecture Reviewer',
      'status: approved',
      '-->',
      '',
    ].join('\n'),
  );

  assert.deepEqual(evaluateLineBudget(root, [relativePath]), []);

  write(
    root,
    findingsPath,
    [
      '# Findings',
      '',
      '<!-- assessment-line-budget-exception',
      `path: ${relativePath}`,
      'line-count: 402',
      'responsibilities: schema normalization; validation ordering',
      'split-alternatives: schema walker helper; validation mapper',
      'rejection-reason: schema walker helper => duplicates same traversal state; validation mapper => fragments one exported adapter contract',
      'approver: Jane Reviewer',
      'approver-role: Assessment Architecture Reviewer',
      'status: approved',
      '-->',
      '',
    ].join('\n'),
  );

  assert.equal(evaluateLineBudget(root, [relativePath]).length, 1);
});

test('evaluateLineBudget rejects duplicate same-path exception blocks even when one block is valid', () => {
  const root = makeFixture('line-budget-duplicate-path');
  const relativePath = 'src/features/assessment/shared/components/DuplicatePath.tsx';
  const findingsPath = 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';
  const baseFile = `${Array.from({ length: 401 }, (_, index) => `export const n${index} = ${index};`).join('\n')}\n`;
  const validBlock = [
    '<!-- assessment-line-budget-exception',
    `path: ${relativePath}`,
    'line-count: 401',
    'responsibilities: schema normalization; validation ordering',
    'split-alternatives: schema walker helper; validation mapper',
    'rejection-reason: schema walker helper => duplicates same traversal state; validation mapper => fragments one exported adapter contract',
    'approver: Jane Reviewer',
    'approver-role: Assessment Architecture Reviewer',
    'status: approved',
    '-->',
  ].join('\n');
  const staleCountBlock = validBlock.replace('line-count: 401', 'line-count: 402');
  const partialPathOnlyBlock = [
    '<!-- assessment-line-budget-exception',
    `path: ${relativePath}`,
    '-->',
  ].join('\n');

  write(root, relativePath, baseFile);

  for (const duplicateBlock of [validBlock, staleCountBlock, partialPathOnlyBlock]) {
    write(
      root,
      findingsPath,
      [
        '# Findings',
        '',
        validBlock,
        '',
        duplicateBlock,
        '',
      ].join('\n'),
    );

    assert.equal(evaluateLineBudget(root, [relativePath]).length, 1);
  }
});

test('evaluateLineBudget accepts structured reviewer evidence without a closed reviewer-role allowlist', () => {
  const root = makeFixture('line-budget-open-reviewer-role');
  const relativePath = 'src/features/assessment/shared/components/OpenReviewerRole.tsx';
  write(root, relativePath, `${Array.from({ length: 401 }, (_, index) => `export const openRole${index} = ${index};`).join('\n')}\n`);
  write(
    root,
    'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md',
    [
      '# Findings',
      '',
      '<!-- assessment-line-budget-exception',
      `path: ${relativePath}`,
      'line-count: 401',
      'responsibilities: authoring-state projection',
      'split-alternatives: projection helper file; summary mapper wrapper',
      'rejection-reason: projection helper file => duplicates same derived-state traversal; summary mapper wrapper => hides one reviewer-facing contract behind two partial exports',
      'approver: Cher',
      'approver-role: Independent Architecture Reviewer',
      'status: approved',
      '-->',
      '',
    ].join('\n'),
  );

  assert.deepEqual(evaluateLineBudget(root, [relativePath]), []);
});

test('evaluateLineBudget excludes fixture paths and generated headers from 400-line enforcement', () => {
  const root = makeFixture('line-budget-exclusions');
  const fixturePath = 'src/features/assessment/shared/components/__fixtures__/FixtureOversize.tsx';
  const generatedPath = 'src/features/assessment/shared/components/Report.generated.tsx';
  write(
    root,
    fixturePath,
    `${Array.from({ length: 401 }, (_, index) => `export const fixture${index} = ${index};`).join('\n')}\n`,
  );
  write(
    root,
    generatedPath,
    [
      '// Generated file - do not edit.',
      '// Source: deterministic task fixture.',
      ...Array.from({ length: 399 }, (_, index) => `export const generated${index} = ${index};`),
      '',
    ].join('\n'),
  );
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  assert.deepEqual(evaluateLineBudget(root, [fixturePath, generatedPath]), []);
});

test('evaluateLineBudget ignores generated markers outside the header window', () => {
  const root = makeFixture('line-budget-deep-generated-marker');
  const relativePath = 'src/features/assessment/shared/components/DeepMarker.tsx';
  const lines = Array.from({ length: 401 }, (_, index) => {
    if (index === 24) {
      return '// Generated file - do not edit.';
    }
    return `export const deep${index} = ${index};`;
  });
  write(root, relativePath, `${lines.join('\n')}\n`);
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  assert.equal(evaluateLineBudget(root, [relativePath]).length, 1);
});

test('evaluateLineBudget rejects generic justification and weak approver evidence', () => {
  const root = makeFixture('line-budget-weak-approval');
  const relativePath = 'src/features/assessment/shared/components/WeakApproval.tsx';
  write(root, relativePath, `${Array.from({ length: 401 }, (_, index) => `export const item${index} = ${index};`).join('\n')}\n`);
  write(
    root,
    'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md',
    [
      '# Findings',
      '',
      '<!-- assessment-line-budget-exception',
      `path: ${relativePath}`,
      'line-count: 401',
      'justification: Responsibility reviewed carefully and split options were considered, but current shape stays as-is for now.',
      'approver: xx',
      'approver-role: yy',
      'status: approved',
      '-->',
      '',
    ].join('\n'),
  );

  assert.equal(evaluateLineBudget(root, [relativePath]).length, 1);
});

test('evaluateLineBudget allows exactly 400 logical lines with a trailing newline', () => {
  const root = makeFixture('line-budget-boundary');
  const relativePath = 'src/features/assessment/shared/components/ExactBudget.tsx';
  write(root, relativePath, `${Array.from({ length: 400 }, (_, index) => `export const n${index} = ${index};`).join('\n')}\n`);
  write(root, 'tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md', '# Findings\n');

  assert.deepEqual(evaluateLineBudget(root, [relativePath]), []);
});

test('evaluateLineBudget skips nonexistent deleted files while protected annotations retain paths', () => {
  const deletedAssessmentPath = 'src/features/assessment/shared/components/Deleted.tsx';
  const deletedProtectedPath = 'src/services/r2Storage.ts';

  assert.deepEqual(evaluateLineBudget(makeFixture('deleted-budget'), [deletedAssessmentPath]), []);
  assert.deepEqual(findProtectedPathChanges([deletedProtectedPath]), [deletedProtectedPath]);
});

test('changed-file command builders reject unsafe Git refs', () => {
  assert.throws(
    () => buildChangedFileCommands('main && echo nope'),
    /invalid git/i,
  );
  assert.throws(
    () => buildChangedFileCommands(undefined, 'abc123 && echo nope'),
    /invalid git/i,
  );
});

test('changed-file commands include renamed assessment files', () => {
  const commands = buildChangedFileCommands('main');

  assert.equal(commands.length, 3);
  assert.ok(commands.every((command) => command.includes('--name-status')));
  assert.ok(commands.every((command) => command.includes('--diff-filter=ACDMR')));
});

test('changed-file commands include the full pushed range when provided', () => {
  const commands = buildChangedFileCommands(undefined, 'abc123');

  assert.deepEqual(commands, [
    'git diff --name-status -z --diff-filter=ACDMR abc123...HEAD',
    'git diff --name-status -z --diff-filter=ACDMR HEAD',
    'git diff --name-status -z --diff-filter=ACDMR HEAD~1...HEAD',
  ]);
});

test('changed-file discovery includes untracked, deleted, and both sides of renamed files', () => {
  const root = makeFixture('git-discovery');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' });
  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 1;\n');
  write(root, 'src/services/r2Storage.ts', 'export const storage = 1;\n');
  write(root, 'src/features/assessment/shared/components/Before.tsx', 'export const renamed = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });

  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 2;\n');
  write(root, 'scripts/check-assessment-unification-guardrails.mjs', 'export {};\n');
  rmSync(join(root, 'src/services/r2Storage.ts'));
  execFileSync(
    'git',
    [
      'mv',
      'src/features/assessment/shared/components/Before.tsx',
      'src/features/assessment/shared/components/After.tsx',
    ],
    { cwd: root, stdio: 'ignore' },
  );

  assert.deepEqual(getChangedFilesFromGit(root).sort(), [
    'scripts/check-assessment-unification-guardrails.mjs',
    'src/features/assessment/shared/components/After.tsx',
    'src/features/assessment/shared/components/Before.tsx',
    'src/features/assessment/shared/components/Tracked.tsx',
    'src/services/r2Storage.ts',
  ]);
});

test('changed-file discovery falls back when origin main is missing and local dirty diff succeeds', () => {
  const root = makeFixture('git-discovery-fallback');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' });
  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });

  write(root, 'src/features/assessment/shared/components/Tracked.tsx', 'export const tracked = 2;\n');

  withEnv({ GITHUB_BASE_REF: 'main', GITHUB_EVENT_BEFORE: undefined }, () => {
    assert.deepEqual(getChangedFilesFromGit(root), [
      'src/features/assessment/shared/components/Tracked.tsx',
    ]);
  });
});

test('changed-file discovery includes range and dirty tracked files in push mode', () => {
  const root = makeFixture('git-discovery-push-range');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' });
  write(root, 'src/features/assessment/shared/components/Base.tsx', 'export const base = 1;\n');
  write(root, 'src/features/assessment/shared/components/Dirty.tsx', 'export const dirty = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'base'], { cwd: root, stdio: 'ignore' });
  const firstCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  write(root, 'src/features/assessment/shared/components/Range.tsx', 'export const range = 2;\n');
  execFileSync('git', ['add', 'src/features/assessment/shared/components/Range.tsx'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'range'], { cwd: root, stdio: 'ignore' });
  write(root, 'src/features/assessment/shared/components/Dirty.tsx', 'export const dirty = 3;\n');

  withEnv({ GITHUB_EVENT_BEFORE: firstCommit, GITHUB_BASE_REF: undefined }, () => {
    assert.deepEqual(getChangedFilesFromGit(root), [
      'src/features/assessment/shared/components/Dirty.tsx',
      'src/features/assessment/shared/components/Range.tsx',
    ]);
  });
});

test('changed-file discovery throws when Git commands fail', () => {
  const root = makeFixture('git-discovery-failure');

  assert.throws(
    () => getChangedFilesFromGit(root),
    /Git changed-file discovery failed/,
  );
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

test('scanSharedBoundary rejects prohibited shared CSS imports, selectors, properties, custom properties, and urls', () => {
  const root = makeFixture('shared-css-boundary');
  write(
    root,
    'src/features/assessment/shared/components/BadStyles.css',
    [
      '/* audioSections in comment must not count */',
      "@import '../../../components/reading-v2/runtime/runtime.css';",
      '.audioSections {',
      "  background-image: url(../../../services/r2Storage/icon.svg);",
      '  storagePath: 1;',
      '  --publishPayload: 1;',
      '  content: "teacherSessionState";',
      '}',
      '',
    ].join('\n'),
  );

  const violations = scanSharedBoundary(root);

  assert.equal(violations.length, 5);
  assert.ok(violations.every((violation) => violation.rule === 'shared-boundary'));
  assert.ok(violations.some((violation) => /@import/i.test(violation.message)));
  assert.ok(violations.some((violation) => /url/i.test(violation.message)));
  assert.ok(violations.some((violation) => /audioSections/.test(violation.message)));
  assert.ok(violations.some((violation) => /storagePath/.test(violation.message)));
  assert.ok(violations.some((violation) => /publishPayload/.test(violation.message)));
});

test('scanSharedBoundary keeps harmless CSS comments and quoted prose green', () => {
  const root = makeFixture('shared-css-harmless');
  write(
    root,
    'src/features/assessment/shared/components/Harmless.css',
    [
      '/* teacherSessionState in comment must stay green */',
      "@import './safe.css';",
      '.parser-label {',
      '  content: "audioSections parser storage";',
      '  background-image: url(/assets/safe.svg);',
      '}',
      '',
    ].join('\n'),
  );

  assert.deepEqual(scanSharedBoundary(root), []);
});

test('scanSharedBoundary rejects authority identifiers in code contexts but ignores ordinary string literals, prose, and tests', () => {
  const root = makeFixture('shared-authority-terms');
  write(
    root,
    'src/features/assessment/shared/components/BadAuthority.tsx',
    [
      'const source = { audioSections: [], fallback: 1 };',
      'const teacher = source.teacherSessionState;',
      'const { publishPayload } = source;',
      "const storagePathValue = source['storagePath'];",
      'const parser = buildParser();',
      'const storage = createStorage();',
      '',
    ].join('\n'),
  );
  write(
    root,
    'src/features/assessment/shared/components/Harmless.tsx',
    [
      'export const parserLabel = "parser";',
      'export const storageLabel = "storage";',
      'export const copy = "Do not mention audioSections in shared user-facing prose.";',
      '',
    ].join('\n'),
  );
  write(
    root,
    'src/features/assessment/shared/components/Harmless.test.tsx',
    'export const teacherSessionState = {};\n',
  );

  const violations = scanSharedBoundary(root);
  const matchedSymbols = violations.map(
    (violation) => violation.message.match(/(?:audioSections|teacherSessionState|publishPayload|storagePath|parser|storage)/)?.[0],
  );

  assert.deepEqual(
    matchedSymbols,
    ['audioSections', 'teacherSessionState', 'publishPayload', 'storagePath', 'parser', 'storage'],
  );
});

test('workflow uses deterministic install and runs guardrail plus focused suites', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github/workflows/assessment-unification-guardrails.yml'),
    'utf8',
  );

  assert.match(workflow, /run: npm ci(?:\s|$)/);
  assert.match(workflow, /node --test scripts\/__tests__\/check-assessment-unification-guardrails\.test\.mjs/);
  assert.match(workflow, /node scripts\/check-assessment-unification-guardrails\.mjs/);
  assert.match(workflow, /src\/features\/assessment\/shared\/components\/AssessmentAuthoringSection\.test\.tsx/);
  assert.match(workflow, /src\/skills\/listening\/builders\/ListeningTestBuilder\.test\.tsx/);
});
