import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';

import {
  buildMaterialCatalogRepairUpdatePayload,
  createMaterialCatalogRepairWritePlan,
  planMaterialCatalogRepairOperations,
  type MaterialCatalogRepairOperation,
  type PlanMaterialCatalogRepairOperationsInput,
} from '../src/services/materialCatalog/materialCatalogRepair.service';
import {
  MATERIAL_BOOK_STATUSES,
  MATERIAL_BOOK_VISIBILITIES,
  MATERIAL_CATALOG_MATERIAL_KINDS,
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeId,
} from '../src/types/materialCatalog.types';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';

type JsonRecord = Record<string, unknown>;

export interface MaterialCatalogRepairCliOptions {
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly approvedBy?: string;
  readonly fromReportPath?: string;
  readonly projectId: string;
  readonly reportPath?: string;
  readonly help: boolean;
}

export interface MaterialCatalogRepairFirebaseSnapshot {
  readonly materialMetadata: unknown;
  readonly materialIndexes: unknown;
  readonly books: unknown;
  readonly bookIndexes: unknown;
  readonly bookNodes: unknown;
  readonly readingV2FullTestCompositions: unknown;
  readonly readingV2FullTestCompositionVersions: unknown;
}

export interface MaterialCatalogRepairReadFailure {
  readonly path: string;
  readonly error: string;
}

type MaterialCatalogRepairMutationStatus = 'not-run' | 'committed' | 'failed';

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecordMap = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const getString = (value: JsonRecord, key: string): string | undefined => {
  const entry = value[key];
  return typeof entry === 'string' && entry.trim() ? entry.trim() : undefined;
};

const getStringArray = (value: JsonRecord, key: string): string[] => {
  const entry = value[key];
  return Array.isArray(entry)
    ? entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
};

const requireValue = (argv: readonly string[], index: number, flag: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
};

const defaultProjectId = (): string => process.env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';

export const toFirebaseDatabasePath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const parseMaterialCatalogRepairCliArgs = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): MaterialCatalogRepairCliOptions => {
  let write = false;
  let approvedBy: string | undefined;
  let fromReportPath: string | undefined;
  let projectId = env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';
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
      case '--approved':
      case '--approved-by':
        approvedBy = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--project':
        projectId = requireValue(argv, index, arg);
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
        if (arg.startsWith('--approved=')) {
          approvedBy = arg.slice('--approved='.length).trim();
          break;
        }
        if (arg.startsWith('--approved-by=')) {
          approvedBy = arg.slice('--approved-by='.length).trim();
          break;
        }
        if (arg.startsWith('--project=')) {
          projectId = arg.slice('--project='.length).trim();
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
        if (arg.startsWith('--report-path=')) {
          reportPath = arg.slice('--report-path='.length).trim();
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (write && !approvedBy?.trim()) {
    throw new Error('Material Catalog repair mutation requires --write and --approved <approval-id>.');
  }

  if (write && !fromReportPath?.trim()) {
    throw new Error('Material Catalog repair mutation requires --from-report <dry-run-report.json>.');
  }

  return {
    dryRun: !write,
    write,
    approvedBy: approvedBy?.trim() || undefined,
    fromReportPath: fromReportPath?.trim() || undefined,
    projectId,
    reportPath,
    help,
  };
};

const isMaterialKind = (value: string | undefined): value is MaterialCatalogMaterialKind =>
  Boolean(value) && (MATERIAL_CATALOG_MATERIAL_KINDS as readonly string[]).includes(value);

const toTestTypeIds = (value: JsonRecord): MaterialTestTypeId[] =>
  getStringArray(value, 'testTypeIds').map((id) => materialCatalogIds.testTypeId(id));

const normalizeMaterialCatalogVisibility = (visibility: string): 'private' | 'public' =>
  visibility === 'public' || visibility === 'library-eligible' ? 'public' : 'private';

const isInactiveMaterialMetadataState = (state: string | undefined): boolean =>
  state === 'archived' || state === 'removed';

const materialSummaryFromMetadata = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const title = getString(value, 'title');
  const visibility = getString(value, 'visibility');
  const materialKind = getString(value, 'materialKind');
  const state = getString(value, 'state');
  const updatedAt = getString(value, 'updatedAt') ?? getString(value, 'publishedAt');

  if (isInactiveMaterialMetadataState(state)) {
    return null;
  }

  if (!materialId || !ownerId || !title || !visibility || !isMaterialKind(materialKind) || !updatedAt) {
    return null;
  }

  return {
    materialId,
    ownerId,
    title,
    visibility: normalizeMaterialCatalogVisibility(visibility),
    materialKind,
    testTypeIds: toTestTypeIds(value),
    sourceFullTestId: getString(value, 'sourceFullTestId'),
    updatedAt,
  };
};

const isBookVisibility = (value: string | undefined): value is MaterialBookMetadata['visibility'] =>
  Boolean(value) && (MATERIAL_BOOK_VISIBILITIES as readonly string[]).includes(value);

const isBookStatus = (value: string | undefined): value is MaterialBookMetadata['status'] =>
  Boolean(value) && (MATERIAL_BOOK_STATUSES as readonly string[]).includes(value);

const bookFromMetadata = (value: unknown): MaterialBookMetadata | null => {
  if (!isRecord(value)) {
    return null;
  }

  const bookId = getString(value, 'bookId');
  const ownerId = getString(value, 'ownerId');
  const title = getString(value, 'title');
  const visibility = getString(value, 'visibility');
  const status = getString(value, 'status');
  const createdAt = getString(value, 'createdAt');
  const updatedAt = getString(value, 'updatedAt');
  const createdBy = getString(value, 'createdBy') ?? ownerId;
  const updatedBy = getString(value, 'updatedBy') ?? ownerId;
  const testTypeIds = toTestTypeIds(value);
  const primaryTestTypeId = getString(value, 'primaryTestTypeId');

  if (
    !bookId ||
    !ownerId ||
    !title ||
    !isBookVisibility(visibility) ||
    !isBookStatus(status) ||
    !createdAt ||
    !updatedAt ||
    !createdBy ||
    !updatedBy
  ) {
    return null;
  }

  return {
    bookId: materialCatalogIds.bookId(bookId),
    ownerId,
    title,
    subtitle: getString(value, 'subtitle'),
    authors: getStringArray(value, 'authors'),
    publisher: getString(value, 'publisher'),
    edition: getString(value, 'edition'),
    series: getString(value, 'series'),
    isbn: getString(value, 'isbn'),
    coverUrl: getString(value, 'coverUrl'),
    primaryTestTypeId: primaryTestTypeId ? materialCatalogIds.testTypeId(primaryTestTypeId) : undefined,
    testTypeIds: testTypeIds.length > 0
      ? testTypeIds
      : primaryTestTypeId
        ? [materialCatalogIds.testTypeId(primaryTestTypeId)]
        : [],
    tags: getStringArray(value, 'tags'),
    description: getString(value, 'description'),
    visibility,
    status,
    createdAt,
    updatedAt,
    createdBy,
    updatedBy,
  };
};

const flattenRowsByPath = (
  rootPath: string,
  value: unknown,
  isRow: (row: unknown) => boolean,
): Record<string, unknown> => {
  const rows: Record<string, unknown> = {};

  const walk = (entry: unknown, path: readonly string[]): void => {
    if (!isRecord(entry)) {
      return;
    }

    if (isRow(entry)) {
      rows[[rootPath, ...path].join('/')] = entry;
      return;
    }

    Object.entries(entry).forEach(([key, child]) => walk(child, [...path, key]));
  };

  walk(value, []);
  return rows;
};

const isMaterialIndexRow = (row: unknown): boolean =>
  isRecord(row) && typeof row.materialId === 'string';

const isBookIndexRow = (row: unknown): boolean =>
  isRecord(row) && typeof row.bookId === 'string';

const isCompositionVersionRow = (row: unknown): boolean =>
  isRecord(row) &&
  typeof row.compositionId === 'string' &&
  typeof row.publishedVersionId === 'string';

export const buildMaterialCatalogRepairInputFromFirebaseSnapshot = (
  snapshot: MaterialCatalogRepairFirebaseSnapshot,
): PlanMaterialCatalogRepairOperationsInput => ({
  materialSummaries: Object.values(asRecordMap(snapshot.materialMetadata))
    .map(materialSummaryFromMetadata)
    .filter((entry): entry is NonNullable<ReturnType<typeof materialSummaryFromMetadata>> => Boolean(entry)),
  materialIndexRowsByPath: flattenRowsByPath(
    'material_catalog/material_indexes',
    snapshot.materialIndexes,
    isMaterialIndexRow,
  ),
  books: Object.values(asRecordMap(snapshot.books))
    .map(bookFromMetadata)
    .filter((entry): entry is MaterialBookMetadata => Boolean(entry)),
  bookIndexRowsByPath: flattenRowsByPath(
    'material_catalog/book_indexes',
    snapshot.bookIndexes,
    isBookIndexRow,
  ),
  bookNodesByBookId: asRecordMap(snapshot.bookNodes),
  readingV2FullTestCompositions: asRecordMap(snapshot.readingV2FullTestCompositions),
  readingV2FullTestCompositionVersionsByPath: flattenRowsByPath(
    'reading_v2/full_test_composition_versions',
    snapshot.readingV2FullTestCompositionVersions,
    isCompositionVersionRow,
  ),
});

const firebaseArgs = (args: readonly string[]): string[] =>
  process.platform === 'win32' ? ['/c', 'firebase', ...args] : [...args];

const runFirebaseCli = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(firebaseBinary, firebaseArgs(args), {
    cwd: process.cwd(),
    maxBuffer: 100 * 1024 * 1024,
  });

  return stdout.trim();
};

const readFirebaseJson = async (path: string, projectId: string): Promise<unknown> => {
  const output = await runFirebaseCli(['database:get', toFirebaseDatabasePath(path), '--project', projectId]);
  return output ? JSON.parse(output) : null;
};

const updateFirebaseJson = async (path: string, data: unknown, projectId: string): Promise<void> => {
  const tempFile = join(
    tmpdir(),
    `material-catalog-repair-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  await writeFile(tempFile, JSON.stringify(data), 'utf8');

  try {
    await runFirebaseCli(['database:update', toFirebaseDatabasePath(path), tempFile, '--project', projectId, '--force']);
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
};

const readPathWithFailure = async (
  path: string,
  projectId: string,
  failures: MaterialCatalogRepairReadFailure[],
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

const loadFirebaseRepairSnapshot = async (projectId: string): Promise<{
  readonly snapshot: MaterialCatalogRepairFirebaseSnapshot;
  readonly readFailures: readonly MaterialCatalogRepairReadFailure[];
}> => {
  const readFailures: MaterialCatalogRepairReadFailure[] = [];
  const [
    materialMetadata,
    materialIndexes,
    books,
    bookIndexes,
    bookNodes,
    readingV2FullTestCompositions,
    readingV2FullTestCompositionVersions,
  ] = await Promise.all([
    readPathWithFailure('reading_v2/material_metadata', projectId, readFailures),
    readPathWithFailure('material_catalog/material_indexes', projectId, readFailures),
    readPathWithFailure('material_catalog/books', projectId, readFailures),
    readPathWithFailure('material_catalog/book_indexes', projectId, readFailures),
    readPathWithFailure('material_catalog/book_nodes', projectId, readFailures),
    readPathWithFailure('reading_v2/full_test_compositions', projectId, readFailures),
    readPathWithFailure('reading_v2/full_test_composition_versions', projectId, readFailures),
  ]);

  return {
    snapshot: {
      materialMetadata,
      materialIndexes,
      books,
      bookIndexes,
      bookNodes,
      readingV2FullTestCompositions,
      readingV2FullTestCompositionVersions,
    },
    readFailures,
  };
};

const summarizeOperations = (
  operations: readonly MaterialCatalogRepairOperation[],
): Record<string, number> =>
  operations.reduce<Record<string, number>>((acc, operation) => {
    acc[operation.kind] = (acc[operation.kind] ?? 0) + 1;
    return acc;
  }, {});

export const createMaterialCatalogRepairOperationDigest = (
  operations: readonly MaterialCatalogRepairOperation[],
): string =>
  createHash('sha256')
    .update(JSON.stringify(operations))
    .digest('hex');

const readReviewedReport = async (reportPath: string): Promise<unknown> => {
  const content = await readFile(resolve(reportPath), 'utf8');
  return JSON.parse(content);
};

const getReviewedOperationCount = (report: unknown): number | null =>
  isRecord(report) &&
  isRecord(report.totals) &&
  typeof report.totals.operations === 'number'
    ? report.totals.operations
    : null;

const getReviewedOperationDigest = (report: unknown): string | null =>
  isRecord(report) &&
  isRecord(report.totals) &&
  typeof report.totals.operationDigest === 'string'
    ? report.totals.operationDigest
    : null;

const getReviewedProjectId = (report: unknown): string | null =>
  isRecord(report) && typeof report.projectId === 'string' ? report.projectId : null;

const getReviewedMutationStatus = (report: unknown): string | null =>
  isRecord(report) &&
  isRecord(report.mutation) &&
  typeof report.mutation.status === 'string'
    ? report.mutation.status
    : null;

const isReviewedDryRunReport = (report: unknown): boolean =>
  isRecord(report) &&
  report.dryRun === true &&
  Array.isArray(report.operations) &&
  getReviewedMutationStatus(report) === 'not-run';

export const buildMaterialCatalogRepairWritePayloadFromReviewedReport = (input: {
  readonly options: MaterialCatalogRepairCliOptions;
  readonly operations: readonly MaterialCatalogRepairOperation[];
  readonly readFailures: readonly MaterialCatalogRepairReadFailure[];
  readonly reviewedReport: unknown;
}): Record<string, unknown | null> => {
  if (input.readFailures.length > 0) {
    throw new Error('Material Catalog repair write aborted because one or more Firebase reads failed.');
  }

  const reviewedProjectId = getReviewedProjectId(input.reviewedReport);
  const reviewedOperationCount = getReviewedOperationCount(input.reviewedReport);
  const reviewedOperationDigest = getReviewedOperationDigest(input.reviewedReport);
  const operationDigest = createMaterialCatalogRepairOperationDigest(input.operations);

  if (
    !isReviewedDryRunReport(input.reviewedReport) ||
    reviewedProjectId !== input.options.projectId ||
    reviewedOperationCount !== input.operations.length ||
    reviewedOperationDigest !== operationDigest
  ) {
    throw new Error('Material Catalog repair write aborted because the reviewed dry-run report does not match current operations.');
  }

  const writes = createMaterialCatalogRepairWritePlan({
    operations: input.operations,
    approvedBy: input.options.approvedBy,
  });

  return buildMaterialCatalogRepairUpdatePayload(writes);
};

const writeReport = async (reportPath: string | undefined, report: unknown): Promise<void> => {
  if (!reportPath) {
    return;
  }

  const absolute = resolve(reportPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

export const getMaterialCatalogRepairExitCode = (input: {
  readonly readFailureCount: number;
  readonly mutationStatus: MaterialCatalogRepairMutationStatus;
}): number =>
  input.readFailureCount > 0 || input.mutationStatus === 'failed' ? 1 : 0;

const printUsage = (): void => {
  console.log(`Material Catalog repair

Usage:
  npm run repair:material-catalog -- [options]

Options:
  --dry-run                  Report planned repair operations only (default)
  --write                    Persist planned repairs through RTDB multi-location update
  --approved <id>            Required with --write; approval ticket or lead id
  --from-report <path>       Required with --write; previous dry-run report to verify
  --report <path>            Write JSON report to path
  --project <projectId>      Firebase project id (default: VITE_FIREBASE_PROJECT_ID or temp-a1437)
  --help                     Show this help
`);
};

export const runMaterialCatalogRepairCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  loadEnv();
  const options = parseMaterialCatalogRepairCliArgs(argv, process.env);

  if (options.help) {
    printUsage();
    return 0;
  }

  const { snapshot, readFailures } = await loadFirebaseRepairSnapshot(options.projectId || defaultProjectId());
  const input = buildMaterialCatalogRepairInputFromFirebaseSnapshot(snapshot);
  const operations = planMaterialCatalogRepairOperations(input);

  let mutation:
    | {
        readonly status: MaterialCatalogRepairMutationStatus;
        readonly approvedBy?: string;
        readonly plannedWriteCount: number;
        readonly error?: string;
      };

  if (options.write) {
    try {
      const reviewedReport = await readReviewedReport(options.fromReportPath!);
      const updatePayload = buildMaterialCatalogRepairWritePayloadFromReviewedReport({
        options,
        operations,
        readFailures,
        reviewedReport,
      });
      await updateFirebaseJson('/', updatePayload, options.projectId);
      mutation = {
        status: 'committed',
        approvedBy: options.approvedBy,
        plannedWriteCount: operations.length,
      };
    } catch (error) {
      mutation = {
        status: 'failed',
        approvedBy: options.approvedBy,
        plannedWriteCount: operations.length,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    mutation = {
      status: 'not-run',
      plannedWriteCount: 0,
    };
  }

  const cliReport = {
    dryRun: options.dryRun,
    projectId: options.projectId,
    generatedAt: new Date().toISOString(),
    totals: {
      operations: operations.length,
      operationDigest: createMaterialCatalogRepairOperationDigest(operations),
      readFailures: readFailures.length,
      byKind: summarizeOperations(operations),
    },
    operations,
    readFailures,
    mutation,
    storagePaths: {
      materialMetadata: 'reading_v2/material_metadata',
      materialIndexes: 'material_catalog/material_indexes',
      books: 'material_catalog/books',
      bookIndexes: 'material_catalog/book_indexes',
      bookNodes: 'material_catalog/book_nodes',
      fullTestCompositions: 'reading_v2/full_test_compositions',
      fullTestCompositionVersions: 'reading_v2/full_test_composition_versions',
    },
  };

  await writeReport(options.reportPath, cliReport);

  console.log(
    [
      `Material Catalog repair ${options.write ? 'write' : 'dry-run'}`,
      `project=${options.projectId}`,
      `operations=${operations.length}`,
      `readFailures=${readFailures.length}`,
      `mutation=${mutation.status}`,
    ].join(' '),
  );

  if (options.reportPath) {
    console.log(`Report: ${resolve(options.reportPath)}`);
  }

  return getMaterialCatalogRepairExitCode({
    readFailureCount: readFailures.length,
    mutationStatus: mutation.status,
  });
};

const isDirectRun = (): boolean => {
  if (process.env.VITEST_WORKER_ID) {
    return false;
  }

  if (
    process.env.npm_lifecycle_event === 'repair:material-catalog' ||
    process.env.npm_lifecycle_script?.includes('material-catalog-repair.ts')
  ) {
    return true;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((arg) => {
    if (!arg || arg.startsWith('-')) {
      return false;
    }

    return resolve(arg) === currentFile;
  });
};

if (isDirectRun()) {
  runMaterialCatalogRepairCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
