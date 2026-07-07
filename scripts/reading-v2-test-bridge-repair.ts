import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildReadingV2TestBridgeRepairUpdatePayload,
  planReadingV2TestBridgeRepair,
} from '../src/services/reading-v2/readingV2TestBridgeRepair.service';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';

export interface ReadingV2TestBridgeRepairCliOptions {
  readonly projectId: string;
  readonly write: boolean;
  readonly approvedBy?: string;
  readonly fromReportPath?: string;
  readonly reportPath?: string;
  readonly help: boolean;
}

export interface ReadingV2TestBridgeRepairReadFailure {
  readonly path: string;
  readonly error: string;
}

const requireValue = (
  argv: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
};

export const parseReadingV2TestBridgeRepairCliArgs = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ReadingV2TestBridgeRepairCliOptions => {
  let projectId = env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';
  let write = false;
  let approvedBy: string | undefined;
  let fromReportPath: string | undefined;
  let reportPath: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--dry-run':
        write = false;
        break;
      case '--write':
        write = true;
        break;
      case '--apply':
        throw new Error('Use --write with --approved and --from-report for mutation mode.');
      case '--project':
        projectId = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--approved':
      case '--approved-by':
        approvedBy = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--from-report':
        fromReportPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--report':
      case '--report-path':
        reportPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      default:
        if (arg.startsWith('--project=')) {
          projectId = arg.slice('--project='.length).trim();
          break;
        }
        if (arg.startsWith('--approved=')) {
          approvedBy = arg.slice('--approved='.length).trim();
          break;
        }
        if (arg.startsWith('--approved-by=')) {
          approvedBy = arg.slice('--approved-by='.length).trim();
          break;
        }
        if (arg.startsWith('--from-report=')) {
          fromReportPath = arg.slice('--from-report='.length).trim();
          break;
        }
        if (arg.startsWith('--report=')) {
          reportPath = arg.slice('--report='.length).trim();
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!projectId.trim()) {
    throw new Error('--project requires a non-empty value.');
  }
  if (write && (!approvedBy?.trim() || !fromReportPath?.trim())) {
    throw new Error(
      'Reading V2 test bridge repair mutation requires --write, --approved <approval-id>, and --from-report <dry-run-report.json>.',
    );
  }
  if (reportPath !== undefined && !reportPath.trim()) {
    throw new Error('--report requires a non-empty value.');
  }

  return {
    projectId: projectId.trim(),
    write,
    approvedBy: approvedBy?.trim(),
    fromReportPath: fromReportPath?.trim(),
    reportPath: reportPath?.trim(),
    help,
  };
};

const firebaseArgs = (args: readonly string[]): string[] =>
  process.platform === 'win32' ? ['/c', 'firebase', ...args] : [...args];

const runFirebaseCli = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(firebaseBinary, firebaseArgs(args), {
    cwd: process.cwd(),
    maxBuffer: 100 * 1024 * 1024,
  });
  return stdout.trim();
};

const readFirebaseJson = async (
  path: string,
  projectId: string,
): Promise<unknown> => {
  const output = await runFirebaseCli([
    'database:get',
    path,
    '--project',
    projectId,
  ]);
  return output ? JSON.parse(output) : null;
};

const updateFirebaseRoot = async (
  payload: unknown,
  projectId: string,
): Promise<void> => {
  const tempFile = join(
    tmpdir(),
    `reading-v2-test-bridge-repair-${process.pid}-${Date.now()}.json`,
  );
  await writeFile(tempFile, JSON.stringify(payload), 'utf8');
  try {
    await runFirebaseCli([
      'database:update',
      '/',
      tempFile,
      '--project',
      projectId,
      '--force',
    ]);
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
};

const readPath = async (
  path: string,
  projectId: string,
  failures: ReadingV2TestBridgeRepairReadFailure[],
): Promise<unknown> => {
  try {
    return await readFirebaseJson(path, projectId);
  } catch (error) {
    failures.push({
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const writeReport = async (
  reportPath: string | undefined,
  report: unknown,
): Promise<void> => {
  if (!reportPath) {
    return;
  }

  const absolutePath = resolve(reportPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const printUsage = (): void => {
  console.log(`Reading V2 test bridge repair

Usage:
  npm run repair:reading-v2-test-bridges -- [options]

Options:
  --dry-run                Read and report only (default)
  --write                  Commit reviewed repair operations
  --approved <id>          Required with --write
  --from-report <path>     Required with --write; reviewed dry-run report
  --project <projectId>    Firebase project id
  --report <path>          Write JSON report
  --help                   Show this help
`);
};

const reviewedReportMatches = (
  report: any,
  plan: ReturnType<typeof planReadingV2TestBridgeRepair>,
  projectId: string,
): boolean =>
  report?.dryRun === true &&
  report?.projectId === projectId &&
  report?.totals?.readFailures === 0 &&
  Array.isArray(report?.readFailures) &&
  report.readFailures.length === 0 &&
  report?.totals?.operations === plan.operations.length &&
  JSON.stringify(report?.operations ?? []) === JSON.stringify(plan.operations);

export const runReadingV2TestBridgeRepairDryRun = async (
  options: ReadingV2TestBridgeRepairCliOptions,
): Promise<number> => {
  if (options.help) {
    printUsage();
    return 0;
  }

  const generatedAt = new Date().toISOString();
  const readFailures: ReadingV2TestBridgeRepairReadFailure[] = [];
  const [metadata, projections, tests] = await Promise.all([
    readPath('/reading_v2/material_metadata', options.projectId, readFailures),
    readPath('/reading_v2/projections/student_safe_tests', options.projectId, readFailures),
    readPath('/tests', options.projectId, readFailures),
  ]);
  const plan = planReadingV2TestBridgeRepair({
    metadataByMaterialId: asRecord(metadata),
    studentSafeProjectionsById: asRecord(projections),
    testsById: asRecord(tests),
    generatedAt,
  });
  let mutation: {
    status: 'not-run' | 'committed' | 'failed';
    approvedBy?: string;
    error?: string;
    verifiedAt?: string;
    postWriteOperationCount?: number;
  } = { status: 'not-run' };
  let postWriteTotals: ReturnType<typeof planReadingV2TestBridgeRepair>['totals'] | undefined;

  if (options.write) {
    try {
      if (readFailures.length > 0) {
        throw new Error('Write aborted because one or more Firebase reads failed.');
      }
      const reviewed = JSON.parse(
        await readFile(resolve(options.fromReportPath!), 'utf8'),
      );
      if (!reviewedReportMatches(reviewed, plan, options.projectId)) {
        throw new Error(
          'Write aborted because reviewed dry-run report does not match current operations.',
        );
      }
      await updateFirebaseRoot(
        buildReadingV2TestBridgeRepairUpdatePayload(plan.operations),
        options.projectId,
      );
      const readFailureCountBeforeVerification = readFailures.length;
      const postWriteTests = await readPath(
        '/tests',
        options.projectId,
        readFailures,
      );
      if (readFailures.length > readFailureCountBeforeVerification) {
        throw new Error(
          'Write verification aborted because the post-write Firebase read failed.',
        );
      }
      const postWritePlan = planReadingV2TestBridgeRepair({
        metadataByMaterialId: asRecord(metadata),
        studentSafeProjectionsById: asRecord(projections),
        testsById: asRecord(postWriteTests),
        generatedAt,
      });
      postWriteTotals = postWritePlan.totals;
      if (postWritePlan.operations.length !== 0) {
        throw new Error(
          `Post-write verification failed: operations=${postWritePlan.operations.length}.`,
        );
      }
      mutation = {
        status: 'committed',
        approvedBy: options.approvedBy,
        verifiedAt: new Date().toISOString(),
        postWriteOperationCount: 0,
      };
    } catch (error) {
      mutation = {
        status: 'failed',
        approvedBy: options.approvedBy,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const report = {
    dryRun: !options.write,
    projectId: options.projectId,
    generatedAt,
    totals: {
      ...plan.totals,
      operations: plan.operations.length,
      readFailures: readFailures.length,
      publicWrites: plan.operations.filter((operation) =>
        operation.value.isPublic === true).length,
      privateWrites: plan.operations.filter((operation) =>
        operation.value.isPublic !== true).length,
    },
    operations: plan.operations,
    readFailures,
    mutation,
    postWriteTotals,
    storagePaths: {
      metadata: '/reading_v2/material_metadata',
      studentSafeProjections: '/reading_v2/projections/student_safe_tests',
      tests: '/tests',
    },
  };

  await writeReport(options.reportPath, report);
  console.log(
    [
      'Reading V2 test bridge repair',
      `project=${options.projectId}`,
      `operations=${plan.operations.length}`,
      `missing=${plan.totals.missingBridges}`,
      `stale=${plan.totals.staleBridges}`,
      `missingProjection=${plan.totals.skippedMissingProjection}`,
      `readFailures=${readFailures.length}`,
      `mutation=${mutation.status}`,
      mutation.postWriteOperationCount !== undefined
        ? `postWriteOperations=${mutation.postWriteOperationCount}`
        : null,
    ].filter(Boolean).join(' '),
  );
  if (options.reportPath) {
    console.log(`Report: ${resolve(options.reportPath)}`);
  }

  return readFailures.length > 0 || mutation.status === 'failed' ? 1 : 0;
};

const isDirectRun = (): boolean => {
  if (process.env.VITEST_WORKER_ID) {
    return false;
  }

  if (
    process.env.npm_lifecycle_event === 'repair:reading-v2-test-bridges' ||
    process.env.npm_lifecycle_script?.includes('reading-v2-test-bridge-repair.ts')
  ) {
    return true;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((arg) =>
    Boolean(arg) && !arg.startsWith('-') && resolve(arg) === currentFile);
};

if (isDirectRun()) {
  runReadingV2TestBridgeRepairDryRun(
    parseReadingV2TestBridgeRepairCliArgs(process.argv.slice(2)),
  ).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
