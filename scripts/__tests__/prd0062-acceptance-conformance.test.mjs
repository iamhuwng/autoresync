import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HARNESS_CONTRACT, toolNames } from '../harness/contract.mjs';
import { validateHarnessContract } from '../lib/prd0062-harness-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'documentation/tasks/PRD0062/supporting/prd0062-v1-acceptance-matrix.json');
const checkerArgument = 'scripts/lib/prd0062-acceptance-conformance.ts';
const dispatcherPath = path.join(repoRoot, 'scripts/harness/run-tool.mjs');
const x64WrapperPath = path.join(repoRoot, 'scripts/harness/run-x64.ps1');

const parseJsonRecord = (stdout) => {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed;
  } catch {
    // Fall back to line records when a harness emits additional diagnostics.
  }
  for (const record of stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).reverse()) {
    try {
      const parsed = JSON.parse(record);
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed;
    } catch {
      // Ignore harness diagnostics and keep looking for the semantic record.
    }
  }
  throw new Error(`No JSON record in harness output: ${stdout}`);
};

const runSemantic = (matrix) => {
  fs.mkdirSync(path.join(repoRoot, 'tmp'), { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(repoRoot, 'tmp', 'prd0062-51a-conformance-'));
  const temporaryMatrixPath = path.join(temporaryRoot, 'prd0062-v1-acceptance-matrix.json');
  const temporaryMatrixArgument = path.relative(repoRoot, temporaryMatrixPath).replaceAll(path.sep, '/');
  fs.writeFileSync(temporaryMatrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  try {
    const result = spawnSync(process.execPath, [dispatcherPath, 'vite-node', '.', checkerArgument, temporaryMatrixArgument], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      output: JSON.parse(result.stdout.trim()),
      stderr: result.stderr,
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const loadMatrix = () => JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

test('semantic authority accepts the frozen matrix', () => {
  const result = runSemantic(loadMatrix());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.output.counts, {
    capabilityRows: 32,
    acceptedRegistrations: 32,
    fixtureEntries: 33,
    activityRows: 32,
  });
  assert.deepEqual(result.output.issues, []);
});

test('semantic authority rejects schema-valid stale Listening support claims', () => {
  const matrix = loadMatrix();
  const listeningRow = matrix.capabilityRows.find((row) => row.domain === 'listening');
  listeningRow.supportState = 'explicitly-unsupported-release-blocking';
  const result = runSemantic(matrix);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.code === 'stale-listening-status'));
});

test('semantic authority rejects source registry adapter drift', () => {
  const matrix = loadMatrix();
  matrix.capabilityRows[0].sourceAdapterProfile = 'listening-authoring-v1';
  const result = runSemantic(matrix);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.code === 'adapter-profile-drift'));
});

test('semantic authority rejects schema-valid capability-to-fixture drift and hash drift', () => {
  const matrix = loadMatrix();
  matrix.capabilityRows[0].fixtureId = 'stale-fixture';
  matrix.fixtureManifest.sha256 = '0'.repeat(64);
  const result = runSemantic(matrix);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.code === 'fixture-manifest-hash-drift'));
  assert.ok(result.output.issues.some((issue) => issue.code === 'fixture-manifest-missing'));
});

test('semantic authority rejects direct npx, vite, vitest, and wrangler command drift', () => {
  const matrix = loadMatrix();
  matrix.cases[0].command = 'npx playwright test --config stale.config.mjs';
  matrix.cases[1].command = 'vite test';
  matrix.cases[2].command = 'vitest run stale.test.ts';
  matrix.cases[3].command = 'wrangler deploy';
  matrix.cases[4].command = 'node scripts/harness/run-tool.mjs playwright test --config stale.config.mjs';
  matrix.cases[5].command = 'node scripts/harness/run-tool.mjs playwright wrong-project test --config stale.config.mjs';
  const result = runSemantic(matrix);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.filter((issue) => issue.code === 'harness-command-drift').length >= 6);
});

test('harness dispatchers declare the supported tools and canonical Playwright entrypoint', () => {
  const dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
  const x64Wrapper = fs.readFileSync(x64WrapperPath, 'utf8');
  assert.ok(toolNames.includes('playwright'));
  assert.ok(toolNames.includes('vite-node'));
  assert.equal(HARNESS_CONTRACT.grammar, 'node scripts/harness/run-tool.mjs <tool> <project> [...args]');
  assert.equal(HARNESS_CONTRACT.tools.playwright.entry, '@playwright/test/cli.js');
  assert.equal(HARNESS_CONTRACT.tools['vite-node'].entry, 'vite-node/vite-node.mjs');
  assert.match(dispatcher, /HARNESS_CONTRACT/u);
  assert.match(x64Wrapper, /run-isolated\.mjs/u);
  assert.equal(fs.existsSync(dispatcherPath), true);
  assert.equal(fs.existsSync(x64WrapperPath), true);
  assert.equal(execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).startsWith('v'), true);
});

test('harness contract validation fails closed when dispatchers are absent or omit Playwright', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prd0062-harness-contract-'));
  try {
    const missing = validateHarnessContract({ rootDir: temporaryRoot });
    assert.equal(missing.filter((issue) => issue.code === 'harness-contract-missing').length, 2);
    fs.mkdirSync(path.join(temporaryRoot, 'scripts/harness'), { recursive: true });
    fs.writeFileSync(path.join(temporaryRoot, 'scripts/harness/run-tool.mjs'), "const tools = new Set(['vitest']);\n", 'utf8');
    fs.writeFileSync(path.join(temporaryRoot, 'scripts/harness/run-x64.ps1'), "[ValidateSet('vitest')]\n", 'utf8');
    const unsupported = validateHarnessContract({ rootDir: temporaryRoot });
    assert.ok(unsupported.some((issue) => issue.code === 'harness-playwright-unsupported'));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('semantic CLI succeeds through the repository harness', () => {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/validate-prd0062-acceptance-matrix.mjs'), '--semantic'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = parseJsonRecord(result.stdout);
  assert.equal(output.semantic, 'PASS');
  assert.deepEqual(output.counts, {
    capabilityRows: 32,
    acceptedRegistrations: 32,
    fixtureEntries: 33,
    activityRows: 32,
  });
});

test('canary manifest CLI executes the matrix-owned names-and-scope validation', () => {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/validate-prd0062-acceptance-matrix.mjs'), '--canary-manifest'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, 'PASS');
  assert.equal(output.semantic, 'SKIPPED');
  assert.equal(output.canaryManifest, 'PASS');
});

test('browser acceptance enables mutation controls only in its local Vite server', async () => {
  const source = await fs.promises.readFile(path.join(repoRoot, 'playwright.prd0062-acceptance.config.mjs'), 'utf8');
  assert.match(source, /VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION:\s*'enabled'/u);
  assert.doesNotMatch(source, /process\.env\.VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION/u);
});

test('semantic checker dispatcher dependencies are present for the harness', () => {
  assert.equal(fs.existsSync(dispatcherPath), true);
  assert.equal(fs.existsSync(x64WrapperPath), true);
  assert.equal(execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).startsWith('v'), true);
});
