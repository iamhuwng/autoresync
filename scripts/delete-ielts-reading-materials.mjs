import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_MANIFEST_PATH = path.join(ROOT, 'public', 'tmp', 'ielts-reading-materials-import.json');
const FIREBASE_PROJECT_ID = 'temp-a1437';

function runFirebaseCli(args) {
  return execFileSync(
    'cmd',
    ['/c', 'firebase', ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
}

function readAllTestsFromFirebase() {
  const raw = runFirebaseCli(['database:get', '/tests', '--project', FIREBASE_PROJECT_ID, '--pretty']);

  return JSON.parse(raw || '{}');
}

function deleteTestById(testId) {
  runFirebaseCli(['database:set', `/tests/${testId}`, '--data', 'null', '--force', '--project', FIREBASE_PROJECT_ID]);
  runFirebaseCli(['database:set', `/student_safe_tests/${testId}`, '--data', 'null', '--force', '--project', FIREBASE_PROJECT_ID]);
}

function parseCliOptions(argv) {
  const options = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: undefined,
    sourceFile: undefined,
    passageNumber: undefined,
  };

  for (const arg of argv) {
    if (arg.startsWith('--manifest=')) {
      options.manifestPath = path.resolve(ROOT, arg.slice('--manifest='.length));
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.outputPath = path.resolve(ROOT, arg.slice('--output='.length));
      continue;
    }

    if (arg.startsWith('--source-file=')) {
      options.sourceFile = arg.slice('--source-file='.length);
      continue;
    }

    if (arg.startsWith('--passage=')) {
      const rawValue = Number(arg.slice('--passage='.length));
      if (Number.isFinite(rawValue) && rawValue > 0) {
        options.passageNumber = rawValue;
      }
    }
  }

  return options;
}

async function main() {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(cliOptions.manifestPath, 'utf8'));
  const titles = new Set(
    (manifest.materials || [])
      .filter((material) => !cliOptions.sourceFile || material.sourceFile === cliOptions.sourceFile)
      .filter((material) => !cliOptions.passageNumber || material.passageNumber === cliOptions.passageNumber)
      .map((material) => material.title),
  );

  const allTests = readAllTestsFromFirebase();
  const matchedTests = Object.entries(allTests)
    .map(([id, test]) => ({ id, ...(test || {}) }))
    .filter((test) => titles.has(test.title) && test.skill === 'Reading' && test.type === 'IELTS');

  matchedTests.forEach((test) => deleteTestById(test.id));
  const deletedIds = matchedTests.map((test) => test.id);
  const result = {
    manifestPath: cliOptions.manifestPath,
    deletedCount: deletedIds.length,
    deletedTests: matchedTests.map((test) => ({
      id: test.id,
      title: test.title,
      ownerId: test.ownerId,
      isPublic: test.isPublic,
      createdAt: test.createdAt,
    })),
  };

  if (cliOptions.outputPath) {
    await fs.mkdir(path.dirname(cliOptions.outputPath), { recursive: true });
    await fs.writeFile(cliOptions.outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
