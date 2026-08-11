import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTANCE_MATRIX_PATH,
  loadPrd0062AcceptanceMatrix,
  validatePrd0062AcceptanceMatrix,
} from './lib/prd0062-acceptance-matrix.mjs';

const usage = 'Usage: node scripts/validate-prd0062-acceptance-matrix.mjs [--schema] [--semantic]';
const args = process.argv.slice(2);
const allowed = new Set(['--schema', '--semantic']);
if (args.some((arg) => !allowed.has(arg)) || new Set(args).size !== args.length) {
  console.error(JSON.stringify({ ok: false, phase: 'arguments', issues: [{ code: 'invalid-arguments', path: '$args', message: usage }] }, null, 2));
  process.exit(2);
}
const runSchema = args.length === 0 || args.includes('--schema');
const runSemantic = args.length === 0 || args.includes('--semantic');
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

let matrix;
try {
  matrix = loadPrd0062AcceptanceMatrix(rootDir);
} catch (error) {
  issues.push({ code: 'matrix-unreadable', path: '$', message: error instanceof Error ? error.message : String(error) });
}

if (runSchema && matrix) {
  for (const message of validatePrd0062AcceptanceMatrix(matrix, { repoRoot: rootDir })) {
    issues.push({ code: 'schema-invalid', path: '$', message });
  }
}

let semantic;
if (runSemantic && issues.length === 0) {
  const checker = 'scripts/lib/prd0062-acceptance-conformance.ts';
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts/harness/run-tool.mjs'), 'vite-node', '.', checker, ACCEPTANCE_MATRIX_PATH],
    { cwd: rootDir, encoding: 'utf8' },
  );
  try {
    const candidate = JSON.parse(result.stdout.trim());
    if (candidate && typeof candidate === 'object' && 'ok' in candidate && Array.isArray(candidate.issues)) semantic = candidate;
  } catch {
    // Fall back to line records when a harness emits additional stdout diagnostics.
  }
  if (!semantic) for (const record of result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).reverse()) {
    try {
      const candidate = JSON.parse(record);
      if (candidate && typeof candidate === 'object' && 'ok' in candidate && Array.isArray(candidate.issues)) {
        semantic = candidate;
        break;
      }
    } catch {
      // Harness diagnostics are ignored; only the one semantic JSON record is protocol data.
    }
  }
  if (!semantic) {
    semantic = { ok: false, issues: [{ code: 'semantic-protocol', path: '$', message: result.stderr.trim() || 'Semantic checker returned invalid JSON.' }] };
  }
  if (result.status !== 0 || semantic.ok !== true) {
    for (const entry of semantic.issues ?? []) issues.push({ code: entry.code ?? 'semantic-invalid', path: entry.path ?? '$', message: entry.message ?? 'Semantic conformance failed.' });
  }
}

if (issues.length > 0) {
  console.error(JSON.stringify({ ok: false, issues, ...(semantic?.counts ? { counts: semantic.counts } : {}) }, null, 2));
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'scripts/fixtures/prd0062-51a-acceptance-fixture-manifest.json'), 'utf8'));
console.log(JSON.stringify({
  ok: true,
  schema: runSchema ? 'PASS' : 'SKIPPED',
  semantic: runSemantic ? 'PASS' : 'SKIPPED',
  matrix: ACCEPTANCE_MATRIX_PATH,
  counts: semantic?.counts ?? { cases: matrix?.cases?.length ?? 0, fixtureEntries: manifest.entries?.length ?? 0 },
}, null, 2));
