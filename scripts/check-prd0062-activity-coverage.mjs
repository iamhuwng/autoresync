import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadAndValidateCoverageMatrix } from './lib/prd0062-activity-coverage/validator.mjs';

const usage = 'Usage: node scripts/check-prd0062-activity-coverage.mjs [--release]';
const parseArgs = (args) => {
  let release = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--release') {
      if (release) throw new Error('Duplicate --release flag.');
      release = true;
      continue;
    }
    throw new Error(`Unknown or malformed argument: ${arg}`);
  }
  return { release };
};

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    issues: [{
      code: 'invalid-arguments',
      path: '$args',
      message: error instanceof Error ? error.message : String(error),
    }],
    usage,
  }, null, 2));
  process.exit(2);
}
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
try {
  const result = await loadAndValidateCoverageMatrix({
    rootDir,
    release: parsed.release,
  });
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, issues: result.issues }, null, 2));
    process.exitCode = 1;
  } else {
    const fixtureChecker = path.join(scriptDir, 'lib/prd0062-activity-coverage/validate-matrix-fixtures.ts');
    const matrixPath = path.join(rootDir, 'documentation/architecture/data/prd0062-activity-coverage.matrix.json');
    const fixtureRun = spawnSync(
      process.execPath,
      [path.join(rootDir, 'node_modules/vite-node/vite-node.mjs'), fixtureChecker, matrixPath],
      { cwd: rootDir, encoding: 'utf8' },
    );
    let fixtureResult;
    try {
      fixtureResult = JSON.parse(fixtureRun.stdout.trim());
    } catch {
      fixtureResult = {
        ok: false,
        issues: [{
          code: 'fixture-checker-protocol',
          path: '$fixtures',
          message: fixtureRun.stderr.trim() || 'Fixture checker returned invalid output.',
        }],
      };
    }
    if (fixtureRun.status !== 0 || fixtureResult.ok !== true) {
      console.error(JSON.stringify({
        ok: false,
        issues: Array.isArray(fixtureResult.issues)
          ? fixtureResult.issues
          : [{
            code: 'fixture-checker-failed',
            path: '$fixtures',
            message: fixtureRun.stderr.trim() || 'Fixture checker failed.',
          }],
      }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(`Activity schema fixtures: PASS (${fixtureResult.fixtureCount} independent fixtures).`);
      console.log(`PRD0062 activity coverage: PASS (${result.rows.length} rows${parsed.release ? ', release' : ''}).`);
    }
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    issues: [{
      code: 'coverage-check-failed',
      path: '$',
      message: error instanceof Error ? error.message : String(error),
    }],
  }, null, 2));
  process.exitCode = 1;
}
