import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { insecureBaselineManifest } from '../test/insecure-baseline-manifest.js';

const EXPECTED_FIXTURE_HASH =
  '93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c';
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = join(packageRoot, 'test', 'fixtures', 'insecure-current-worker.js');
const vitestPath = join(packageRoot, 'node_modules', 'vitest', 'vitest.mjs');

const normalizeFixture = (source) => source.replace(/\r\n/g, '\n').replace(/\n$/, '');
const fixtureSource = await readFile(fixturePath, 'utf8');
const fixtureHash = createHash('sha256')
  .update(normalizeFixture(fixtureSource), 'utf8')
  .digest('hex');

if (fixtureHash !== EXPECTED_FIXTURE_HASH) {
  console.error(
    `Fixture hash mismatch: expected ${EXPECTED_FIXTURE_HASH}, received ${fixtureHash}`,
  );
  process.exit(1);
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'prd-0056-red-'));
const reportPath = join(tempDirectory, 'vitest-security.json');

try {
  const result = spawnSync(
    process.execPath,
    [
      vitestPath,
      'run',
      '--config',
      'vitest.security.config.mjs',
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  );

  if (result.error) throw result.error;

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const actualOutcomes = new Map();
  for (const testFile of report.testResults ?? []) {
    for (const assertion of testFile.assertionResults ?? []) {
      actualOutcomes.set(
        assertion.title,
        assertion.status === 'passed' ? 'pass' : 'fail',
      );
    }
  }

  const mismatches = [];
  for (const [testName, expectedOutcome] of Object.entries(insecureBaselineManifest)) {
    const actualOutcome = actualOutcomes.get(testName) ?? 'missing';
    if (actualOutcome !== expectedOutcome) {
      mismatches.push(`${testName}: expected ${expectedOutcome}, received ${actualOutcome}`);
    }
  }

  for (const testName of actualOutcomes.keys()) {
    if (!(testName in insecureBaselineManifest)) {
      mismatches.push(`${testName}: missing from manifest`);
    }
  }

  if (mismatches.length > 0) {
    console.error('Insecure-baseline outcome mismatch:');
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    process.exitCode = 1;
  } else {
    const outcomes = Object.values(insecureBaselineManifest);
    const expectedRed = outcomes.filter((outcome) => outcome === 'fail').length;
    const expectedSafe = outcomes.filter((outcome) => outcome === 'pass').length;
    console.log(`Fixture SHA-256: ${fixtureHash}`);
    console.log(
      `Insecure baseline matched manifest: ${expectedRed} expected RED failures, ${expectedSafe} already-safe passes.`,
    );
  }
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
