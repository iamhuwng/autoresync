import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildThcsRuntimeBridgeRepairUpdatePayload,
  planThcsRuntimeBridgeRepair,
} from '../src/services/thcsRuntimeBridgeRepair.service';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';
const gcloudBinary = process.platform === 'win32' ? 'cmd' : 'gcloud';

export interface ThcsRuntimeBridgeRepairCliOptions {
  readonly projectId: string;
  readonly write: boolean;
  readonly approvedBy?: string;
  readonly fromReportPath?: string;
  readonly reportPath?: string;
  readonly help: boolean;
}

interface ReadFailure {
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

export const parseThcsRuntimeBridgeRepairCliArgs = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ThcsRuntimeBridgeRepairCliOptions => {
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
      'THCS runtime bridge repair mutation requires --write, --approved <approval-id>, and --from-report <dry-run-report.json>.',
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

const gcloudArgs = (args: readonly string[]): string[] =>
  process.platform === 'win32' ? ['/c', 'gcloud', ...args] : [...args];

const runFirebaseCli = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(firebaseBinary, firebaseArgs(args), {
    cwd: process.cwd(),
    maxBuffer: 100 * 1024 * 1024,
  });
  return stdout.trim();
};

const runGcloudCli = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(gcloudBinary, gcloudArgs(args), {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
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
    `thcs-runtime-bridge-repair-${process.pid}-${Date.now()}.json`,
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

const decodeFirestoreValue = (value: any): unknown => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {})
        .map(([key, entry]) => [key, decodeFirestoreValue(entry)]),
    );
  }
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  return undefined;
};

const decodeFirestoreDocument = (document: any): [string, Record<string, unknown>] => {
  const id = String(document.name ?? '').split('/').pop() || '';
  const data = Object.fromEntries(
    Object.entries(document.fields ?? {})
      .map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
  return [id, { ...data, id }];
};

const readFirestoreCollection = async (
  collectionId: string,
  projectId: string,
  token: string,
): Promise<Record<string, unknown>> => {
  const rows: Record<string, unknown> = {};
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`,
    );
    url.searchParams.set('pageSize', '300');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Firestore ${collectionId} read failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = await response.json();
    (body.documents ?? []).forEach((document: unknown) => {
      const [id, data] = decodeFirestoreDocument(document);
      if (id) {
        rows[id] = data;
      }
    });
    pageToken = body.nextPageToken;
  } while (pageToken);

  return rows;
};

const readPath = async (
  path: string,
  projectId: string,
  failures: ReadFailure[],
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

const readFirestorePath = async (
  collectionId: string,
  projectId: string,
  token: string,
  failures: ReadFailure[],
): Promise<Record<string, unknown>> => {
  try {
    return await readFirestoreCollection(collectionId, projectId, token);
  } catch (error) {
    failures.push({
      path: `firestore/${collectionId}`,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableValue(record[key])]),
  );
};

const stableJson = (value: unknown): string =>
  JSON.stringify(stableValue(value));

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

export const reviewedReportMatches = (
  report: any,
  plan: ReturnType<typeof planThcsRuntimeBridgeRepair>,
  projectId: string,
): boolean =>
  report?.dryRun === true &&
  report?.projectId === projectId &&
  report?.totals?.readFailures === 0 &&
  Array.isArray(report?.readFailures) &&
  report.readFailures.length === 0 &&
  report?.totals?.operations === plan.operations.length &&
  stableJson(report?.operations ?? []) === stableJson(plan.operations);

const printUsage = (): void => {
  console.log(`THCS runtime bridge repair

Usage:
  npm run repair:thcs-runtime-bridges -- --dry-run --project <id> --report <file>
  npm run repair:thcs-runtime-bridges -- --write --project <id> --approved <id> --from-report <file>
`);
};

export const runThcsRuntimeBridgeRepairCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  const options = parseThcsRuntimeBridgeRepairCliArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const readFailures: ReadFailure[] = [];
  let accessToken = '';
  try {
    accessToken = await runGcloudCli(['auth', 'print-access-token']);
  } catch (error) {
    readFailures.push({
      path: 'gcloud/auth/print-access-token',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const [drafts, library, tests, currentSummaryIndex] = await Promise.all([
    accessToken
      ? readFirestorePath('thcs_drafts', options.projectId, accessToken, readFailures)
      : Promise.resolve({}),
    accessToken
      ? readFirestorePath('thcs_library', options.projectId, accessToken, readFailures)
      : Promise.resolve({}),
    readPath('/tests', options.projectId, readFailures),
    readPath('/material_catalog/material_summary_indexes/v1', options.projectId, readFailures),
  ]);

  const input = {
    draftsById: drafts,
    libraryById: library,
    testsById: asRecord(tests),
    currentSummaryIndex,
  };
  const plan = planThcsRuntimeBridgeRepair(input);
  let mutation: {
    status: 'not-run' | 'committed' | 'failed';
    approvedBy?: string;
    error?: string;
    verifiedAt?: string;
    postWriteOperationCount?: number;
  } = { status: 'not-run' };
  let postWriteTotals: ReturnType<typeof planThcsRuntimeBridgeRepair>['totals'] | undefined;

  if (options.write) {
    try {
      if (readFailures.length > 0) {
        throw new Error('Write aborted because one or more Firebase/Firestore reads failed.');
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
        buildThcsRuntimeBridgeRepairUpdatePayload(plan.operations),
        options.projectId,
      );
      const readFailureCountBeforeVerification = readFailures.length;
      const [postWriteTests, postWriteSummaryIndex] = await Promise.all([
        readPath('/tests', options.projectId, readFailures),
        readPath('/material_catalog/material_summary_indexes/v1', options.projectId, readFailures),
      ]);
      if (readFailures.length > readFailureCountBeforeVerification) {
        throw new Error(
          'Write verification aborted because the post-write Firebase read failed.',
        );
      }
      const postWritePlan = planThcsRuntimeBridgeRepair({
        ...input,
        testsById: asRecord(postWriteTests),
        currentSummaryIndex: postWriteSummaryIndex,
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
        postWriteOperationCount: postWriteTotals?.operations,
      };
    }
  }

  const report = {
    dryRun: !options.write,
    projectId: options.projectId,
    generatedAt: new Date().toISOString(),
    totals: {
      ...plan.totals,
      readFailures: readFailures.length,
    },
    operations: plan.operations,
    skips: plan.skips,
    readFailures,
    mutation,
    postWriteTotals,
    storagePaths: {
      thcsDrafts: 'firestore/thcs_drafts',
      thcsLibrary: 'firestore/thcs_library',
      tests: '/tests',
      materialSummaryIndex: '/material_catalog/material_summary_indexes/v1',
    },
  };

  await writeReport(options.reportPath, report);
  console.log(
    [
      'THCS runtime bridge repair',
      `project=${options.projectId}`,
      `operations=${plan.operations.length}`,
      `runtimeWrites=${plan.totals.runtimeWrites}`,
      `summaryWrites=${plan.totals.summaryWrites}`,
      `summaryRemoves=${plan.totals.summaryRemoves}`,
      `unbackfillableLibraryRows=${plan.totals.unbackfillableLibraryRows}`,
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
    process.env.npm_lifecycle_event === 'repair:thcs-runtime-bridges' ||
    process.env.npm_lifecycle_script?.includes('thcs-runtime-bridge-repair.ts')
  ) {
    return true;
  }
  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((arg) =>
    Boolean(arg) && !arg.startsWith('-') && resolve(arg) === currentFile);
};

if (isDirectRun()) {
  runThcsRuntimeBridgeRepairCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
