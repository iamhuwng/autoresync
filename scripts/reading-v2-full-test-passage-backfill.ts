import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';

import { DEFAULT_MATERIAL_TEST_TYPES } from '../src/services/materialCatalog/testTypeConfig.service';
import {
  createReadingV2FullTestPassageBackfillWritePlan,
  planReadingV2FullTestPassageBackfill,
  type ReadingV2FullTestPassageBackfillSource,
  type ReadingV2FullTestPassageBackfillWrite,
} from '../src/services/reading-v2/readingV2Backfill.service';
import { readingV2StoragePaths } from '../src/services/reading-v2/readingV2StoragePaths.service';
import { ReadingV2PublishGateError } from '../src/services/reading-v2/readingV2Validation.service';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
} from '../src/types/readingV2.types';
import {
  materialCatalogIds,
  type MaterialTestTypeId,
} from '../src/types/materialCatalog.types';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';

type JsonRecord = Record<string, unknown>;

export interface ReadingV2BackfillCliOptions {
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly approvedBy?: string;
  readonly ownerId?: string;
  readonly materialId?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly limit?: number;
  readonly reportPath?: string;
  readonly fromReportPath?: string;
  readonly projectId: string;
  readonly help: boolean;
}

export type BackfillSkippedReason = 'filtered-out' | 'invalid-source' | 'permission-failure';

export interface BackfillSkippedMaterial {
  readonly materialId: string;
  readonly reason: BackfillSkippedReason;
  readonly detail: string;
}

export interface BackfillFirebaseSnapshot {
  readonly materialMetadata: unknown;
  readonly publishedSnapshots: unknown;
  readonly fullTestCompositions: unknown;
}

export interface BackfillSourceBuildResult {
  readonly sources: readonly ReadingV2FullTestPassageBackfillSource[];
  readonly skippedMaterials: readonly BackfillSkippedMaterial[];
}

export interface BackfillReadFailure {
  readonly path: string;
  readonly error: string;
}

const defaultProjectId = (): string => process.env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getString = (value: JsonRecord, key: string): string | undefined => {
  const entry = value[key];
  return typeof entry === 'string' && entry.trim() ? entry.trim() : undefined;
};

const getNumber = (value: JsonRecord, key: string): number | undefined => {
  const entry = value[key];
  return typeof entry === 'number' && Number.isFinite(entry) ? entry : undefined;
};

const getStringArray = (value: JsonRecord, key: string): string[] | undefined => {
  const entry = value[key];
  if (!Array.isArray(entry)) {
    return undefined;
  }

  const strings = entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? strings.map((item) => item.trim()) : undefined;
};

const parsePositiveInteger = (raw: string, flag: string): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }

  return Math.floor(parsed);
};

const requireValue = (argv: readonly string[], index: number, flag: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
};

const normalizeIsoDate = (value: string, flag: string): string => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} requires an ISO date or timestamp.`);
  }

  return new Date(parsed).toISOString();
};

export const parseBackfillCliArgs = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ReadingV2BackfillCliOptions => {
  let write = false;
  let approvedBy: string | undefined;
  let ownerId: string | undefined;
  let materialId: string | undefined;
  let createdFrom: string | undefined;
  let createdTo: string | undefined;
  let limit: number | undefined;
  let reportPath: string | undefined;
  let fromReportPath: string | undefined;
  let projectId = env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';
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
      case '--owner':
      case '--owner-id':
        ownerId = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--material-id':
        materialId = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--created-from':
        createdFrom = normalizeIsoDate(requireValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--created-to':
        createdTo = normalizeIsoDate(requireValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--limit':
        limit = parsePositiveInteger(requireValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--report':
      case '--report-path':
        reportPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--from-report':
        fromReportPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--project':
        projectId = requireValue(argv, index, arg);
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
        if (arg.startsWith('--owner=')) {
          ownerId = arg.slice('--owner='.length).trim();
          break;
        }
        if (arg.startsWith('--owner-id=')) {
          ownerId = arg.slice('--owner-id='.length).trim();
          break;
        }
        if (arg.startsWith('--material-id=')) {
          materialId = arg.slice('--material-id='.length).trim();
          break;
        }
        if (arg.startsWith('--created-from=')) {
          createdFrom = normalizeIsoDate(arg.slice('--created-from='.length), '--created-from');
          break;
        }
        if (arg.startsWith('--created-to=')) {
          createdTo = normalizeIsoDate(arg.slice('--created-to='.length), '--created-to');
          break;
        }
        if (arg.startsWith('--limit=')) {
          limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
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
        if (arg.startsWith('--from-report=')) {
          fromReportPath = arg.slice('--from-report='.length).trim();
          break;
        }
        if (arg.startsWith('--project=')) {
          projectId = arg.slice('--project='.length).trim();
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (write && !approvedBy?.trim()) {
    throw new Error('Mutation mode requires --write and --approved <approval-id>.');
  }

  if (write && !fromReportPath?.trim()) {
    throw new Error('Mutation mode requires --from-report <dry-run-report.json>.');
  }

  return {
    dryRun: !write,
    write,
    approvedBy: approvedBy?.trim() || undefined,
    ownerId,
    materialId,
    createdFrom,
    createdTo,
    limit,
    reportPath,
    fromReportPath: fromReportPath?.trim() || undefined,
    projectId,
    help,
  };
};

const isReadingV2Document = (value: unknown): value is ReadingV2Document =>
  isRecord(value) &&
  typeof value.documentId === 'string' &&
  typeof value.title === 'string' &&
  Array.isArray(value.sectionIds) &&
  isRecord(value.sections) &&
  isRecord(value.stimuli) &&
  isRecord(value.taskGroups) &&
  isRecord(value.interactions);

const isPublishedSnapshot = (
  value: unknown,
  materialId: string,
  snapshotVersionId: string,
): value is ReadingV2PublishedSnapshot =>
  isRecord(value) &&
  getString(value, 'materialId') === materialId &&
  getString(value, 'snapshotVersionId') === snapshotVersionId &&
  typeof value.ownerId === 'string' &&
  typeof value.publishedAt === 'string' &&
  typeof value.publishedBy === 'string' &&
  isReadingV2Document(value.document);

const isFullTestComposition = (value: unknown): value is ReadingV2FullTestComposition =>
  isRecord(value) &&
  typeof value.testMaterialId === 'string' &&
  Array.isArray(value.passageRefs);

const asRecordMap = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const getExistingComposition = (
  compositions: Record<string, unknown>,
  materialId: string,
): ReadingV2FullTestComposition | null => {
  const match = Object.values(compositions).find((composition) =>
    isFullTestComposition(composition) &&
    composition.testMaterialId === materialId &&
    composition.passageRefs.length > 0
  );

  return match && isFullTestComposition(match) ? match : null;
};

const timestampFor = (metadata: JsonRecord, snapshot: ReadingV2PublishedSnapshot): string | undefined =>
  getString(metadata, 'publishedAt') ?? getString(metadata, 'updatedAt') ?? snapshot.publishedAt;

const matchesFilters = (
  metadata: JsonRecord,
  snapshot: ReadingV2PublishedSnapshot,
  options: Pick<ReadingV2BackfillCliOptions, 'ownerId' | 'materialId' | 'createdFrom' | 'createdTo'>,
): boolean => {
  if (options.ownerId && getString(metadata, 'ownerId') !== options.ownerId) {
    return false;
  }

  if (options.materialId && getString(metadata, 'materialId') !== options.materialId) {
    return false;
  }

  const timestamp = timestampFor(metadata, snapshot);
  if (!timestamp) {
    return true;
  }

  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) {
    return true;
  }

  if (options.createdFrom && time < Date.parse(options.createdFrom)) {
    return false;
  }

  if (options.createdTo && time > Date.parse(options.createdTo)) {
    return false;
  }

  return true;
};

const testTypeIdsFor = (metadata: JsonRecord): MaterialTestTypeId[] | undefined =>
  getStringArray(metadata, 'testTypeIds')?.map((id) => materialCatalogIds.testTypeId(id));

const toSource = (
  metadata: JsonRecord,
  snapshot: ReadingV2PublishedSnapshot,
  existingComposition: ReadingV2FullTestComposition | null,
): ReadingV2FullTestPassageBackfillSource => {
  const materialId = readingV2Ids.materialId(getString(metadata, 'materialId') ?? snapshot.materialId);
  const snapshotVersionId = readingV2Ids.snapshotVersionId(snapshot.snapshotVersionId);
  const primaryTestTypeId = getString(metadata, 'primaryTestTypeId');
  const visibility = getString(metadata, 'visibility') === 'library-eligible' ? 'public' : 'private';

  return {
    materialId,
    ownerId: getString(metadata, 'ownerId') ?? snapshot.ownerId,
    title: getString(metadata, 'title') ?? snapshot.document.title,
    document: snapshot.document,
    sourceSnapshotVersionId: snapshotVersionId,
    publishedBy: snapshot.publishedBy,
    sourceFullTestId: readingV2Ids.fullTestId(materialId),
    primaryTestTypeId: primaryTestTypeId ? materialCatalogIds.testTypeId(primaryTestTypeId) : undefined,
    testTypeIds: testTypeIdsFor(metadata),
    testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    visibility,
    publicShareable: metadata.publicShareable === true,
    durationMinutes: getNumber(metadata, 'durationMinutes'),
    existingComposition,
  };
};

export const buildBackfillSourcesFromFirebaseSnapshot = (
  snapshot: BackfillFirebaseSnapshot,
  options: Partial<Pick<
    ReadingV2BackfillCliOptions,
    'ownerId' | 'materialId' | 'createdFrom' | 'createdTo' | 'limit'
  >> = {},
): BackfillSourceBuildResult => {
  const materialMetadata = asRecordMap(snapshot.materialMetadata);
  const publishedSnapshots = asRecordMap(snapshot.publishedSnapshots);
  const compositions = asRecordMap(snapshot.fullTestCompositions);
  const skippedMaterials: BackfillSkippedMaterial[] = [];
  const sources: ReadingV2FullTestPassageBackfillSource[] = [];

  Object.entries(materialMetadata).forEach(([metadataKey, rawMetadata]) => {
    if (!isRecord(rawMetadata)) {
      skippedMaterials.push({
        materialId: metadataKey,
        reason: 'invalid-source',
        detail: 'Material metadata row is not an object.',
      });
      return;
    }

    const materialId = getString(rawMetadata, 'materialId') ?? metadataKey;

    if (getString(rawMetadata, 'materialKind') !== 'full-test') {
      return;
    }

    if (getString(rawMetadata, 'state') === 'archived') {
      skippedMaterials.push({
        materialId,
        reason: 'filtered-out',
        detail: 'Archived full tests are not backfilled.',
      });
      return;
    }

    const snapshotVersionId = getString(rawMetadata, 'publishedSnapshotVersionId');
    if (!snapshotVersionId) {
      skippedMaterials.push({
        materialId,
        reason: 'invalid-source',
        detail: 'Missing publishedSnapshotVersionId.',
      });
      return;
    }

    const materialSnapshots = asRecordMap(publishedSnapshots[materialId]);
    const rawSnapshot = materialSnapshots[snapshotVersionId];
    if (!isPublishedSnapshot(rawSnapshot, materialId, snapshotVersionId)) {
      skippedMaterials.push({
        materialId,
        reason: 'invalid-source',
        detail: `Published snapshot ${snapshotVersionId} is missing or invalid.`,
      });
      return;
    }

    if (!matchesFilters(rawMetadata, rawSnapshot, options)) {
      skippedMaterials.push({
        materialId,
        reason: 'filtered-out',
        detail: 'Source did not match CLI filters.',
      });
      return;
    }

    if (options.limit && sources.length >= options.limit) {
      skippedMaterials.push({
        materialId,
        reason: 'filtered-out',
        detail: `Source skipped because --limit ${options.limit} was reached.`,
      });
      return;
    }

    sources.push(toSource(rawMetadata, rawSnapshot, getExistingComposition(compositions, materialId)));
  });

  return { sources, skippedMaterials };
};

export const buildBackfillUpdatePayload = (
  writes: readonly ReadingV2FullTestPassageBackfillWrite[],
): Record<string, unknown> =>
  Object.fromEntries(writes.map((write) => [write.path, write.value]));

const normalizeBackfillDigestValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeBackfillDigestValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['createdAt', 'updatedAt', 'extractedAt', 'publishedAt', 'publishedBy'].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeBackfillDigestValue(entry)]),
  );
};

const buildBackfillReportDigest = (report: Pick<ReadingV2FullTestPassageBackfillReport, 'rows' | 'totals'>): string =>
  createHash('sha256')
    .update(JSON.stringify(normalizeBackfillDigestValue({
      totals: report.totals,
      rows: report.rows,
    })))
    .digest('hex');

const getReviewedProjectId = (report: unknown): string | undefined =>
  isRecord(report) && typeof report.projectId === 'string' ? report.projectId : undefined;

const getReviewedMutationStatus = (report: unknown): string | undefined =>
  isRecord(report) &&
  isRecord(report.mutation) &&
  typeof report.mutation.status === 'string'
    ? report.mutation.status
    : undefined;

const isReviewedBackfillReport = (report: unknown): report is ReadingV2FullTestPassageBackfillReport & {
  readonly projectId: string;
  readonly mutation: { readonly status: string };
} =>
  isRecord(report) &&
  report.dryRun === true &&
  typeof report.generatedAt === 'string' &&
  isRecord(report.totals) &&
  Array.isArray(report.rows) &&
  getReviewedMutationStatus(report) === 'not-run';

const readReviewedReport = async (reportPath: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(reportPath), 'utf8'));

export const buildBackfillWritePayloadFromReviewedReport = (input: {
  readonly options: ReadingV2BackfillCliOptions;
  readonly currentReport: ReadingV2FullTestPassageBackfillReport;
  readonly readFailures: readonly BackfillReadFailure[];
  readonly reviewedReport: unknown;
}): Record<string, unknown> => {
  if (input.readFailures.length > 0) {
    throw new Error(`Backfill write aborted because ${input.readFailures.length} Firebase read(s) failed.`);
  }

  if (
    !isReviewedBackfillReport(input.reviewedReport) ||
    getReviewedProjectId(input.reviewedReport) !== input.options.projectId ||
    input.reviewedReport.rows.length !== input.currentReport.rows.length ||
    buildBackfillReportDigest(input.reviewedReport) !== buildBackfillReportDigest(input.currentReport)
  ) {
    throw new Error('Backfill write aborted because the reviewed dry-run report does not match current operations.');
  }

  const writes = createReadingV2FullTestPassageBackfillWritePlan({
    report: input.reviewedReport,
    approvedBy: input.options.approvedBy,
  });

  return buildBackfillUpdatePayload(writes);
};

const firebaseArgs = (args: readonly string[]): string[] =>
  process.platform === 'win32' ? ['/c', 'firebase', ...args] : [...args];

export const normalizeFirebaseDatabasePath = (path: string): string =>
  path === '/' || path.startsWith('/') ? path : `/${path}`;

export const describeBackfillMutationError = (
  error: unknown,
): {
  readonly error: string;
  readonly blockingIssues?: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
    readonly objectId?: string;
  }[];
} => {
  if (error instanceof ReadingV2PublishGateError) {
    return {
      error: error.message,
      blockingIssues: error.result.blockingIssues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        objectId: issue.objectId,
      })),
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
  };
};

const runFirebaseCli = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(firebaseBinary, firebaseArgs(args), {
    cwd: process.cwd(),
    maxBuffer: 100 * 1024 * 1024,
  });

  return stdout.trim();
};

const readFirebaseJson = async (path: string, projectId: string): Promise<unknown> => {
  const output = await runFirebaseCli(['database:get', normalizeFirebaseDatabasePath(path), '--project', projectId]);
  return output ? JSON.parse(output) : null;
};

const updateFirebaseJson = async (path: string, data: unknown, projectId: string): Promise<void> => {
  const tempFile = join(
    tmpdir(),
    `reading-v2-passage-backfill-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  await writeFile(tempFile, JSON.stringify(data), 'utf8');

  try {
    await runFirebaseCli([
      'database:update',
      normalizeFirebaseDatabasePath(path),
      tempFile,
      '--project',
      projectId,
      '--force',
    ]);
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
};

const readPathWithFailure = async (
  path: string,
  projectId: string,
  failures: BackfillReadFailure[],
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

const loadFirebaseBackfillSnapshot = async (projectId: string): Promise<{
  readonly snapshot: BackfillFirebaseSnapshot;
  readonly readFailures: readonly BackfillReadFailure[];
}> => {
  const readFailures: BackfillReadFailure[] = [];
  const [materialMetadata, publishedSnapshots, fullTestCompositions] = await Promise.all([
    readPathWithFailure('reading_v2/material_metadata', projectId, readFailures),
    readPathWithFailure('reading_v2/published_snapshots', projectId, readFailures),
    readPathWithFailure('reading_v2/full_test_compositions', projectId, readFailures),
  ]);

  return {
    snapshot: {
      materialMetadata,
      publishedSnapshots,
      fullTestCompositions,
    },
    readFailures,
  };
};

const writeReport = async (reportPath: string | undefined, report: unknown): Promise<void> => {
  if (!reportPath) {
    return;
  }

  const absolute = resolve(reportPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const printUsage = (): void => {
  console.log(`Reading V2 full-test passage backfill

Usage:
  npm run backfill:reading-v2-passages -- [options]

Options:
  --dry-run                  Report candidates only (default)
  --write                    Persist planned writes through RTDB multi-location update
  --approved <id>            Required with --write; approval ticket or lead id
  --from-report <path>       Required with --write; previous dry-run report to verify
  --owner <teacherId>        Filter source full tests by owner
  --material-id <id>         Backfill one source full-test material id
  --created-from <iso>       Include sources at or after timestamp
  --created-to <iso>         Include sources at or before timestamp
  --limit <n>                Cap split planning source count
  --report <path>            Write JSON report to path
  --project <projectId>      Firebase project id (default: VITE_FIREBASE_PROJECT_ID or temp-a1437)
  --help                     Show this help
`);
};

export const runReadingV2PassageBackfillCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  loadEnv();
  const options = parseBackfillCliArgs(argv, process.env);

  if (options.help) {
    printUsage();
    return 0;
  }

  const { snapshot, readFailures } = await loadFirebaseBackfillSnapshot(options.projectId || defaultProjectId());
  const buildResult = buildBackfillSourcesFromFirebaseSnapshot(snapshot, options);
  const report = planReadingV2FullTestPassageBackfill({
    fullTests: buildResult.sources,
  });

  let mutation:
    | {
        readonly status: 'not-run' | 'committed' | 'failed';
        readonly approvedBy?: string;
        readonly plannedWriteCount: number;
        readonly error?: string;
      }
    | undefined;

  if (options.write) {
    try {
      const reviewedReport = await readReviewedReport(options.fromReportPath!);
      const updatePayload = buildBackfillWritePayloadFromReviewedReport({
        options,
        currentReport: report,
        readFailures,
        reviewedReport,
      });
      await updateFirebaseJson('/', updatePayload, options.projectId);
      mutation = {
        status: 'committed',
        approvedBy: options.approvedBy,
        plannedWriteCount: Object.keys(updatePayload).length,
      };
    } catch (error) {
      mutation = {
        status: 'failed',
        approvedBy: options.approvedBy,
        plannedWriteCount: 0,
        ...describeBackfillMutationError(error),
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
    generatedAt: report.generatedAt,
    filters: {
      ownerId: options.ownerId,
      materialId: options.materialId,
      createdFrom: options.createdFrom,
      createdTo: options.createdTo,
      limit: options.limit,
    },
    totals: report.totals,
    rows: report.rows,
    readFailures,
    skippedMaterials: [
      ...buildResult.skippedMaterials,
      ...readFailures.map((failure) => ({
        materialId: failure.path,
        reason: 'permission-failure' as const,
        detail: failure.error,
      })),
    ],
    mutation,
    storagePaths: {
      materialMetadata: 'reading_v2/material_metadata',
      publishedSnapshots: 'reading_v2/published_snapshots',
      fullTestCompositions: 'reading_v2/full_test_compositions',
      readingPassageMaterials: readingV2StoragePaths.readingPassageMaterials('{passageMaterialId}'),
    },
  };

  await writeReport(options.reportPath, cliReport);

  console.log(
    [
      `Reading V2 passage backfill ${options.write ? 'write' : 'dry-run'}`,
      `project=${options.projectId}`,
      `total=${report.totals.total}`,
      `splitReady=${report.totals.splitReady}`,
      `manualReview=${report.totals.manualReview}`,
      `alreadyBackfilled=${report.totals.alreadyBackfilled}`,
      `skipped=${cliReport.skippedMaterials.length}`,
      `readFailures=${readFailures.length}`,
      `mutation=${mutation.status}`,
    ].join(' '),
  );

  if (options.reportPath) {
    console.log(`Report: ${resolve(options.reportPath)}`);
  }

  return mutation.status === 'failed' ? 1 : 0;
};

const isDirectRun = (): boolean => {
  if (process.env.VITEST_WORKER_ID) {
    return false;
  }

  if (
    process.env.npm_lifecycle_event === 'backfill:reading-v2-passages' ||
    process.env.npm_lifecycle_script?.includes('reading-v2-full-test-passage-backfill.ts')
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
  runReadingV2PassageBackfillCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
