import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertSupportedQuestionGroups,
  buildReadingTestData,
  buildStudentSafeTestData,
  buildTableCompletionPublishReport,
} from './ielts-reading-materials-firebase.mjs';
import { closeTableCompletionRuntime } from './table-completion-runtime.mjs';

const ROOT = process.cwd();
const DEFAULT_MANIFEST_PATH = path.join(ROOT, 'public', 'tmp', 'ielts-reading-materials-import.json');
const DEFAULT_OWNER_ID = 'AkwZW3CT4AUvkMpJfgg9FwUh3ug2';
const FIREBASE_PROJECT_ID = 'temp-a1437';
const TEMP_PUBLISH_DIR = path.join(ROOT, 'public', 'tmp', 'firebase-publish');

function runFirebaseCli(args) {
  return execFileSync(
    'cmd',
    ['/c', 'firebase', ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
}

function parseCliOptions(argv) {
  const options = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: undefined,
    sourceFile: undefined,
    passageNumber: undefined,
    createdBy: DEFAULT_OWNER_ID,
    ownerId: DEFAULT_OWNER_ID,
    isPublic: true,
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
      continue;
    }

    if (arg.startsWith('--created-by=')) {
      options.createdBy = arg.slice('--created-by='.length);
      continue;
    }

    if (arg.startsWith('--owner-id=')) {
      options.ownerId = arg.slice('--owner-id='.length);
      continue;
    }

    if (arg === '--private') {
      options.isPublic = false;
    }
  }

  return options;
}

function writeStructuredError(report) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
}

export async function publishMaterials(cliOptions) {
  const manifest = JSON.parse(await fs.readFile(cliOptions.manifestPath, 'utf8'));
  const materials = (manifest.materials || [])
    .filter((material) => !cliOptions.sourceFile || material.sourceFile === cliOptions.sourceFile)
    .filter((material) => !cliOptions.passageNumber || material.passageNumber === cliOptions.passageNumber);
  const materialReports = [];
  const schemaBlockedMaterials = [];

  for (const material of materials) {
    try {
      assertSupportedQuestionGroups(
        material.questionGroups || [],
        material.title || material.sourceFile || 'material',
      );
      materialReports.push({
        material,
        publishReport: await buildTableCompletionPublishReport(material),
      });
    } catch (error) {
      schemaBlockedMaterials.push({
        kind: 'schema-rejection',
        title: material.title,
        sourceFile: material.sourceFile,
        passageNumber: material.passageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const blockedMaterials = materialReports.filter(
    ({ publishReport }) => !publishReport.isPublishable,
  );

  if (schemaBlockedMaterials.length > 0 || blockedMaterials.length > 0) {
    writeStructuredError({
      code: schemaBlockedMaterials.length > 0
        ? 'table-completion-publish-schema-blocked'
        : 'table-completion-publish-blocked',
      manifestPath: cliOptions.manifestPath,
      blockedMaterials: [
        ...schemaBlockedMaterials,
        ...blockedMaterials.map(({ material, publishReport }) => ({
          kind: 'validation',
          title: material.title,
          sourceFile: material.sourceFile,
          passageNumber: material.passageNumber,
          highestSeverity: publishReport.highestSeverity,
          diagnostics: publishReport.diagnostics,
        })),
      ],
    });
    process.exitCode = 1;
    return [];
  }

  const writtenTests = [];

  for (const { material } of materialReports) {
    const testData = await buildReadingTestData(material, {
      createdBy: cliOptions.createdBy,
      ownerId: cliOptions.ownerId,
      isPublic: cliOptions.isPublic,
    });

    await fs.mkdir(TEMP_PUBLISH_DIR, { recursive: true });
    const canonicalPath = path.join(TEMP_PUBLISH_DIR, `${testData.id}.json`);
    const studentSafePath = path.join(TEMP_PUBLISH_DIR, `${testData.id}.student-safe.json`);
    await fs.writeFile(canonicalPath, JSON.stringify(testData, null, 2), 'utf8');
    await fs.writeFile(studentSafePath, JSON.stringify(await buildStudentSafeTestData(testData), null, 2), 'utf8');

    runFirebaseCli(['database:set', `/tests/${testData.id}`, canonicalPath, '--force', '--project', FIREBASE_PROJECT_ID]);
    runFirebaseCli(['database:set', `/student_safe_tests/${testData.id}`, studentSafePath, '--force', '--project', FIREBASE_PROJECT_ID]);

    writtenTests.push(testData);
  }

  if (cliOptions.outputPath) {
    await fs.mkdir(path.dirname(cliOptions.outputPath), { recursive: true });
    await fs.writeFile(
      cliOptions.outputPath,
      JSON.stringify(writtenTests.length === 1 ? writtenTests[0] : writtenTests, null, 2),
      'utf8',
    );
  }

  return writtenTests;
}

export async function main(argv = process.argv.slice(2)) {
  const cliOptions = parseCliOptions(argv);

  try {
    const writtenTests = await publishMaterials(cliOptions);

    if (process.exitCode === 1) {
      return;
    }

    console.log(JSON.stringify({
      manifestPath: cliOptions.manifestPath,
      publishedCount: writtenTests.length,
      tests: writtenTests.map((test) => ({
        id: test.id,
        title: test.title,
        ownerId: test.ownerId,
        createdBy: test.createdBy,
        isPublic: test.isPublic,
      })),
    }, null, 2));
    process.exitCode = 0;
  } catch (error) {
    writeStructuredError({
      code: 'table-completion-publish-error',
      manifestPath: cliOptions.manifestPath,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await closeTableCompletionRuntime();
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
