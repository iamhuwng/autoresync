import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';
import type { MaterialBookMetadata } from '../src/types/materialCatalog.types';
import type { ReadingV2MaterialMetadata } from '../src/services/reading-v2/readingV2MaterialMetadata.service';
import {
  buildExpectedMaterialSummaries,
  buildMaterialSummaryParityReport,
  buildMaterialSummaryReconciliationUpdatePayload,
  planMaterialSummaryReconciliation,
  type MaterialSummaryReconciliationInput,
} from '../src/services/materialCatalog/materialSummaryReconciliation.service';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';

export interface MaterialSummaryReconciliationCliOptions {
  readonly projectId: string;
  readonly write: boolean;
  readonly approvedBy?: string;
  readonly fromReportPath?: string;
  readonly reportPath?: string;
  readonly help: boolean;
}

const MATERIAL_SUMMARY_RECONCILIATION_SCRIPT = 'material-summary-reconciliation.ts';
const MATERIAL_SUMMARY_RECONCILIATION_FLAGS = new Set([
  '--write',
  '--dry-run',
  '--project',
  '--approved',
  '--approved-by',
  '--from-report',
  '--report',
  '--help',
  '-h',
]);

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

export const normalizeMaterialSummaryReconciliationCliArgs = (
  argv: readonly string[],
): string[] => {
  const scriptIndex = argv.findIndex((arg) =>
    normalizeScriptPath(arg).endsWith(MATERIAL_SUMMARY_RECONCILIATION_SCRIPT));
  const args = scriptIndex >= 0 ? argv.slice(scriptIndex + 1) : [...argv];
  const separatorIndex = args.indexOf('--');
  const candidateArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;
  const firstCliFlagIndex = candidateArgs.findIndex((arg) =>
    MATERIAL_SUMMARY_RECONCILIATION_FLAGS.has(arg));

  return firstCliFlagIndex >= 0
    ? candidateArgs.slice(firstCliFlagIndex)
    : candidateArgs;
};

export const parseMaterialSummaryReconciliationArgs = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): MaterialSummaryReconciliationCliOptions => {
  let projectId = env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';
  let write = false;
  let approvedBy: string | undefined;
  let fromReportPath: string | undefined;
  let reportPath: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      write = true;
    } else if (arg === '--dry-run') {
      write = false;
    } else if (arg === '--project') {
      projectId = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--approved' || arg === '--approved-by') {
      approvedBy = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--from-report') {
      fromReportPath = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--report') {
      reportPath = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (write && (!approvedBy || !fromReportPath)) {
    throw new Error(
      'Material summary write requires --approved <approval-id> and --from-report <dry-run-report.json>.',
    );
  }
  return {
    projectId,
    write,
    approvedBy,
    fromReportPath,
    reportPath,
    help,
  };
};

const firebaseArgs = (args: readonly string[]): string[] =>
  process.platform === 'win32' ? ['/c', 'firebase', ...args] : [...args];

const runFirebase = async (args: readonly string[]): Promise<string> => {
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
  const output = await runFirebase([
    'database:get',
    `/${path}`,
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
    `material-summary-reconciliation-${process.pid}-${Date.now()}.json`,
  );
  await writeFile(tempFile, JSON.stringify(payload), 'utf8');
  try {
    await runFirebase([
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

const recordMap = (value: unknown): Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

const rtdbArray = (value: unknown): any[] =>
  Array.isArray(value)
    ? value
    : Object.values(recordMap(value));

const normalizeReadingMetadata = (
  value: unknown,
): ReadingV2MaterialMetadata => {
  const metadata = recordMap(value);
  return {
    ...metadata,
    testTypeIds: rtdbArray(metadata.testTypeIds),
    tags: rtdbArray(metadata.tags),
    relationshipSurfaces: rtdbArray(metadata.relationshipSurfaces),
  } as ReadingV2MaterialMetadata;
};

const normalizeBook = (value: unknown): MaterialBookMetadata => {
  const book = recordMap(value);
  return {
    ...book,
    authors: rtdbArray(book.authors),
    testTypeIds: rtdbArray(book.testTypeIds),
    tags: rtdbArray(book.tags),
  } as MaterialBookMetadata;
};

export const reviewedReportMatches = (
  report: any,
  current: ReturnType<typeof planMaterialSummaryReconciliation>,
  projectId: string,
): boolean =>
  report?.dryRun === true &&
  report?.projectId === projectId &&
  report?.mutation?.status === 'not-run' &&
  report?.totals?.readFailures === 0 &&
  Array.isArray(report?.readFailures) &&
  report.readFailures.length === 0 &&
  report?.totals?.operations === current.operationCount &&
  report?.totals?.operationDigest === current.operationDigest;

export const buildMaterialSummaryPostWriteVerification = (
  input: MaterialSummaryReconciliationInput,
) => {
  const reconciliation = planMaterialSummaryReconciliation(input);
  const expected = buildExpectedMaterialSummaries(input);
  const parity = buildMaterialSummaryParityReport(
    expected,
    recordMap(input.currentIndex).by_id,
  );

  return { reconciliation, parity };
};

export const assertMaterialSummaryPostWriteVerified = (
  input: MaterialSummaryReconciliationInput,
) => {
  const verification = buildMaterialSummaryPostWriteVerification(input);
  if (
    verification.reconciliation.operationCount !== 0 ||
    verification.parity.parity !== true
  ) {
    throw new Error(
      `Post-write verification failed: operations=${verification.reconciliation.operationCount} parity=${verification.parity.parity}.`,
    );
  }

  return verification;
};

const printUsage = () => {
  console.log(`Material summary reconciliation

Usage:
  npm run repair:material-summaries -- --dry-run --project <id> --report <file>
  npm run repair:material-summaries -- --write --project <id> --approved <id> --from-report <file>
`);
};

export const runMaterialSummaryReconciliationCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  loadEnv();
  const options = parseMaterialSummaryReconciliationArgs(
    normalizeMaterialSummaryReconciliationCliArgs(argv),
  );
  if (options.help) {
    printUsage();
    return 0;
  }

  const readFailures: Array<{ path: string; error: string }> = [];
  const read = async (path: string) => {
    try {
      return await readFirebaseJson(path, options.projectId);
    } catch (error) {
      readFailures.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };
  const [tests, readingMetadata, books, currentIndex] = await Promise.all([
    read('tests'),
    read('reading_v2/material_metadata'),
    read('material_catalog/books'),
    read('material_catalog/material_summary_indexes/v1'),
  ]);

  const input = {
    legacyTests: recordMap(tests),
    readingV2Metadata: Object.fromEntries(
      Object.entries(recordMap(readingMetadata))
        .map(([id, value]) => [id, normalizeReadingMetadata(value)]),
    ),
    books: Object.fromEntries(
      Object.entries(recordMap(books))
        .map(([id, value]) => [id, normalizeBook(value)]),
    ),
    currentIndex,
  };
  const reconciliation = planMaterialSummaryReconciliation(input);
  const expected = buildExpectedMaterialSummaries(input);
  const parity = buildMaterialSummaryParityReport(
    expected,
    recordMap(currentIndex).by_id,
  );
  let mutation: {
    status: 'not-run' | 'committed' | 'failed';
    approvedBy?: string;
    error?: string;
    verifiedAt?: string;
    postWriteOperationCount?: number;
    postWriteParity?: boolean;
  } = { status: 'not-run' };
  let postWriteVerification: ReturnType<
    typeof buildMaterialSummaryPostWriteVerification
  > | undefined;

  if (options.write) {
    try {
      if (readFailures.length > 0) {
        throw new Error('Write aborted because one or more Firebase reads failed.');
      }
      const reviewed = JSON.parse(
        await readFile(resolve(options.fromReportPath!), 'utf8'),
      );
      if (!reviewedReportMatches(reviewed, reconciliation, options.projectId)) {
        throw new Error(
          'Write aborted because reviewed dry-run report does not match current operations.',
        );
      }
      await updateFirebaseRoot(
        buildMaterialSummaryReconciliationUpdatePayload(
          reconciliation.operations,
        ),
        options.projectId,
      );
      const readFailureCountBeforeVerification = readFailures.length;
      const postWriteIndex = await read(
        'material_catalog/material_summary_indexes/v1',
      );
      if (readFailures.length > readFailureCountBeforeVerification) {
        throw new Error(
          'Write verification aborted because the post-write Firebase read failed.',
        );
      }
      postWriteVerification = assertMaterialSummaryPostWriteVerified({
        ...input,
        currentIndex: postWriteIndex,
      });
      mutation = {
        status: 'committed',
        approvedBy: options.approvedBy,
        verifiedAt: new Date().toISOString(),
        postWriteOperationCount:
          postWriteVerification.reconciliation.operationCount,
        postWriteParity: postWriteVerification.parity.parity,
      };
    } catch (error) {
      mutation = {
        status: 'failed',
        approvedBy: options.approvedBy,
        error: error instanceof Error ? error.message : String(error),
        postWriteOperationCount:
          postWriteVerification?.reconciliation.operationCount,
        postWriteParity: postWriteVerification?.parity.parity,
      };
    }
  }

  const report = {
    dryRun: !options.write,
    projectId: options.projectId,
    generatedAt: new Date().toISOString(),
    totals: {
      operations: reconciliation.operationCount,
      operationDigest: reconciliation.operationDigest,
      readFailures: readFailures.length,
    },
    reconciliation,
    parity,
    operations: reconciliation.operations,
    readFailures,
    mutation,
    postWriteVerification,
  };
  if (options.reportPath) {
    const absolute = resolve(options.reportPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(
    `Material summaries project=${options.projectId} operations=${reconciliation.operationCount} parity=${parity.parity} readFailures=${readFailures.length} mutation=${mutation.status}`,
  );
  return readFailures.length > 0 || mutation.status === 'failed' ? 1 : 0;
};

const normalizeScriptPath = (value: string): string =>
  value.replace(/\\/g, '/');

const isScriptArg = (arg: string, currentFile: string): boolean => {
  if (!arg || arg.startsWith('-')) {
    return false;
  }
  try {
    const rawCandidate = arg.startsWith('file:')
      ? fileURLToPath(arg)
      : arg;
    const candidate = normalizeScriptPath(rawCandidate);
    const resolvedCandidate = normalizeScriptPath(resolve(rawCandidate));
    return (
      resolvedCandidate === currentFile ||
      (!candidate.includes(':') && currentFile.endsWith(`/${candidate.replace(/^\.?\//u, '')}`))
    );
  } catch {
    return false;
  }
};

export const isMaterialSummaryReconciliationDirectRun = (
  metaUrl: string = import.meta.url,
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  if (env.VITEST_WORKER_ID) {
    return false;
  }
  const currentFile = normalizeScriptPath(fileURLToPath(metaUrl));
  return argv.slice(1).some((arg) => isScriptArg(arg, currentFile));
};

if (isMaterialSummaryReconciliationDirectRun()) {
  runMaterialSummaryReconciliationCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
