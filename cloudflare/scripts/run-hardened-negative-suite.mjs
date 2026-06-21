import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { insecureBaselineManifest } from '../test/insecure-baseline-manifest.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const vitestPath = join(packageRoot, 'node_modules', 'vitest', 'vitest.mjs');
const testPath = '__tests__/hardened-negative-contract.test.js';
const expectedTitles = Object.keys(insecureBaselineManifest);
const tempDirectory = await mkdtemp(join(tmpdir(), 'prd-0056-green-'));
const reportPath = join(tempDirectory, 'vitest-hardened-negative.json');

let exitCode = 1;
try {
  const result = spawnSync(
    process.execPath,
    [
      vitestPath,
      'run',
      '--config',
      'vitest.config.mjs',
      testPath,
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  );

  if (result.error) throw result.error;

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const assertions = (report.testResults ?? []).flatMap(
    (testFile) => testFile.assertionResults ?? [],
  );
  const actualTitles = assertions.map((assertion) => assertion.title);
  const titleCounts = (titles) =>
    titles.reduce((counts, title) => counts.set(title, (counts.get(title) ?? 0) + 1), new Map());
  const expectedCounts = titleCounts(expectedTitles);
  const actualCounts = titleCounts(actualTitles);
  const missingCount = expectedTitles.reduce(
    (count, title) => count + Math.max(0, (expectedCounts.get(title) ?? 0) - (actualCounts.get(title) ?? 0)),
    0,
  );
  const extraCount = actualTitles.reduce(
    (count, title) => count + Math.max(0, (actualCounts.get(title) ?? 0) - (expectedCounts.get(title) ?? 0)),
    0,
  );
  const failedCount = assertions.filter((assertion) => assertion.status !== 'passed').length;

  if (
    result.status !== 0 ||
    missingCount !== 0 ||
    extraCount !== 0 ||
    failedCount !== 0 ||
    assertions.length !== expectedTitles.length
  ) {
    console.error(
      `Hardened negative suite failed: missing=${missingCount}, extra=${extraCount}, failed=${failedCount}.`,
    );
  } else {
    console.log(`Hardened negative suite passed: ${assertions.length}/${expectedTitles.length}.`);
    exitCode = 0;
  }
} catch {
  console.error('Hardened negative suite results unreadable.');
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}

process.exitCode = exitCode;
