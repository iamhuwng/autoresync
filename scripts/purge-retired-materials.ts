import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import {
  buildRetiredMaterialInventory,
  type ReadOnlyDatabase,
} from './lib/retiredMaterialInventory';
import {
  classifyRetirementCandidate,
  type RetirementDecisionState,
} from '../src/services/retirement/retiredMaterialClassifier';
import {
  buildSourceMaterialRemovedResultPatch,
} from '../src/services/resultSourceMaterialRemoval';

const execFileAsync = promisify(execFile);
const firebaseBinary = resolve('node_modules/firebase-tools/lib/bin/firebase.js');

export const RETIRED_MATERIAL_PURGE_PROJECT_ID = 'temp-a1437';
export const RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION =
  'retired-material-purge-reviewed-manifest-v1';
export const RETIRED_MATERIAL_PURGE_MAX_MANIFEST_AGE_MS = 24 * 60 * 60 * 1000;
export const RETIRED_MATERIAL_PURGE_MAX_UPDATE_PATHS = 500;

const RETIREMENT_STATES: RetirementDecisionState[] = [
  'retire-reading-v1',
  'retire-quiz',
  'retire-drive-backed-listening',
  'protect-reading-v2',
  'protect-thcs',
  'protect-r2-listening',
  'unknown-blocked',
];

const RESULT_INDEX_ROOTS = [
  'test_results_by_student',
  'test_results_by_teacher',
  'test_results_by_session',
  'test_results_by_course',
  'test_results_by_class',
  'test_results_solo_practice_by_student',
] as const;

const ALLOWED_DELETION_ROOTS = [
  'quizzes',
  'tests',
  'drafts',
  'student_safe_tests',
  'homework_student_safe_tests',
  'homework_student_safe_test_access',
  'course_materials',
  'material_catalog',
  'materials',
  'session_test_payloads',
  'notifications',
] as const;

const PROTECTED_DELETION_ROOTS = [
  'reading_v2',
  'media_assets',
  'classes',
  'courses',
  'modules',
  'game_sessions',
  'test_results',
  ...RESULT_INDEX_ROOTS,
] as const;

type JsonRecord = Record<string, unknown>;

export interface RetiredMaterialPurgeCliOptions {
  readonly projectId: string;
  readonly manifestPath: string;
  readonly apply: true;
  readonly help: boolean;
}

export interface RetiredMaterialPurgeDatabase extends ReadOnlyDatabase {
  update(path: string, values: Record<string, unknown>): Promise<void>;
}

export interface RetiredMaterialPurgeManifestSnapshot {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly classifierSchemaVersion: string;
  readonly candidateCountsByReason: Record<string, number>;
  readonly candidateIdsByState: Record<RetirementDecisionState, string[]>;
  readonly markerEvidence: string[];
  readonly plannedDeletionPaths: string[];
  readonly retainedResultScrubPaths: string[];
  readonly driveUrlFieldPaths: string[];
  readonly unknownBlockedRecords: string[];
  readonly activeSessionCount: number;
  readonly protectedReadingV2CollisionCount: number;
  readonly plannedR2DeleteCount: number;
}

export interface ReviewedRetiredMaterialPurgeManifest
  extends RetiredMaterialPurgeManifestSnapshot {
  readonly schemaVersion: typeof RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION;
  readonly reviewStatus: 'approved-for-purge';
  readonly reviewedAt: string;
  readonly reviewedBy: string;
}

export interface RetiredMaterialPurgePlan {
  readonly projectId: string;
  readonly manifestFingerprint: string;
  readonly deletionPaths: string[];
  readonly retainedResultScrubPaths: string[];
  readonly retainedResultRoots: string[];
  readonly readBeforeMutationPaths: string[];
  readonly firebaseUpdates: Record<string, null | true>;
  readonly updateCount: number;
  readonly readbackExpectations: string[];
}

type RetiredMaterialInventoryReport = Awaited<ReturnType<typeof buildRetiredMaterialInventory>>;

export class RetiredMaterialPurgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetiredMaterialPurgeError';
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requireValue = (
  argv: readonly string[],
  index: number,
  option: string,
): string => {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith('--')) {
    throw new RetiredMaterialPurgeError(`${option} requires a value.`);
  }
  return value;
};

const requireString = (
  source: JsonRecord,
  field: string,
  context: string,
): string => {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RetiredMaterialPurgeError(`Malformed ${context}: ${field} is required.`);
  }
  return value.trim();
};

const requireNumber = (
  source: JsonRecord,
  field: string,
  context: string,
): number => {
  const value = source[field];
  if (!Number.isFinite(value)) {
    throw new RetiredMaterialPurgeError(`Malformed ${context}: ${field} must be a number.`);
  }
  return Number(value);
};

const requireStringArray = (
  source: JsonRecord,
  field: string,
  context: string,
): string[] => {
  const value = source[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new RetiredMaterialPurgeError(`Malformed ${context}: ${field} must be string[].`);
  }
  return sortUnique(value.map((item) => item.trim()).filter(Boolean));
};

const requireNumberRecord = (
  source: JsonRecord,
  field: string,
  context: string,
): Record<string, number> => {
  const value = source[field];
  if (
    !isRecord(value)
    || !Object.values(value).every((item) => Number.isFinite(item))
  ) {
    throw new RetiredMaterialPurgeError(
      `Malformed ${context}: ${field} must be a number map.`,
    );
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, Number(item)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};

const normalizeCandidateIdsByState = (
  value: unknown,
  context: string,
): Record<RetirementDecisionState, string[]> => {
  if (!isRecord(value)) {
    throw new RetiredMaterialPurgeError(
      `Malformed ${context}: candidateIdsByState must be an object.`,
    );
  }

  const output = {} as Record<RetirementDecisionState, string[]>;
  RETIREMENT_STATES.forEach((state) => {
    const stateValue = value[state];
    if (stateValue === undefined) {
      output[state] = [];
      return;
    }
    if (!Array.isArray(stateValue) || !stateValue.every((item) => typeof item === 'string')) {
      throw new RetiredMaterialPurgeError(
        `Malformed ${context}: candidateIdsByState.${state} must be string[].`,
      );
    }
    output[state] = sortUnique(stateValue.map((item) => item.trim()).filter(Boolean));
  });
  return output;
};

const sortUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const stripLeadingSlash = (path: string): string =>
  path.replace(/^\/+/, '');

const ensureLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

const pathSegments = (path: string): string[] =>
  stripLeadingSlash(path).split('/').filter(Boolean);

const pathRoot = (path: string): string =>
  pathSegments(path)[0] ?? '';

const normalizeDatabasePath = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

const validateTimestamp = (value: string, field: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RetiredMaterialPurgeError(`Malformed purge manifest: ${field} is invalid.`);
  }
  return parsed;
};

const snapshotFromRecord = (
  source: JsonRecord,
  context: string,
): RetiredMaterialPurgeManifestSnapshot => ({
  projectId: requireString(source, 'projectId', context),
  generatedAt: requireString(source, 'generatedAt', context),
  sourceRevision: requireString(source, 'sourceRevision', context),
  classifierSchemaVersion: requireString(source, 'classifierSchemaVersion', context),
  candidateCountsByReason: requireNumberRecord(source, 'candidateCountsByReason', context),
  candidateIdsByState: normalizeCandidateIdsByState(source.candidateIdsByState, context),
  markerEvidence: requireStringArray(source, 'markerEvidence', context),
  plannedDeletionPaths: requireStringArray(source, 'plannedDeletionPaths', context)
    .map(ensureLeadingSlash),
  retainedResultScrubPaths: requireStringArray(source, 'retainedResultScrubPaths', context)
    .map(ensureLeadingSlash),
  driveUrlFieldPaths: requireStringArray(source, 'driveUrlFieldPaths', context)
    .map(ensureLeadingSlash),
  unknownBlockedRecords: requireStringArray(source, 'unknownBlockedRecords', context)
    .map(ensureLeadingSlash),
  activeSessionCount: requireNumber(source, 'activeSessionCount', context),
  protectedReadingV2CollisionCount:
    requireNumber(source, 'protectedReadingV2CollisionCount', context),
  plannedR2DeleteCount: requireNumber(source, 'plannedR2DeleteCount', context),
});

const reviewedManifestSource = (raw: JsonRecord): {
  snapshotSource: JsonRecord;
  reviewSource: JsonRecord;
  schemaSource: JsonRecord;
} => {
  const snapshotSource = isRecord(raw.manifest) ? raw.manifest : raw;
  const reviewSource = isRecord(raw.review) ? raw.review : raw;
  return { snapshotSource, reviewSource, schemaSource: raw };
};

export const normalizeReviewedPurgeManifest = (
  raw: unknown,
): ReviewedRetiredMaterialPurgeManifest => {
  if (!isRecord(raw)) {
    throw new RetiredMaterialPurgeError('Malformed purge manifest: root must be an object.');
  }

  const { snapshotSource, reviewSource, schemaSource } = reviewedManifestSource(raw);
  const schemaVersion = requireString(schemaSource, 'schemaVersion', 'purge manifest');
  if (schemaVersion !== RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION) {
    throw new RetiredMaterialPurgeError(
      `Malformed purge manifest: schemaVersion must be ${RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION}.`,
    );
  }

  const reviewStatus = requireString(reviewSource, 'reviewStatus', 'purge manifest');
  if (reviewStatus !== 'approved-for-purge') {
    throw new RetiredMaterialPurgeError(
      'Malformed purge manifest: reviewStatus must be approved-for-purge.',
    );
  }

  const reviewedAt = requireString(reviewSource, 'reviewedAt', 'purge manifest');
  const reviewedBy = requireString(reviewSource, 'reviewedBy', 'purge manifest');
  const snapshot = snapshotFromRecord(snapshotSource, 'purge manifest');

  validateTimestamp(snapshot.generatedAt, 'generatedAt');
  validateTimestamp(reviewedAt, 'reviewedAt');

  return {
    ...snapshot,
    schemaVersion: RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION,
    reviewStatus: 'approved-for-purge',
    reviewedAt,
    reviewedBy,
  };
};

export const normalizeInventoryManifestSnapshot = (
  raw: unknown,
): RetiredMaterialPurgeManifestSnapshot => {
  if (!isRecord(raw)) {
    throw new RetiredMaterialPurgeError('Malformed current inventory: manifest missing.');
  }
  const snapshot = snapshotFromRecord(raw, 'current inventory manifest');
  validateTimestamp(snapshot.generatedAt, 'generatedAt');
  return snapshot;
};

export const parseReviewedPurgeManifestJson = (
  source: string,
): ReviewedRetiredMaterialPurgeManifest => {
  try {
    return normalizeReviewedPurgeManifest(JSON.parse(source));
  } catch (error) {
    if (error instanceof RetiredMaterialPurgeError) {
      throw error;
    }
    throw new RetiredMaterialPurgeError(
      `Malformed JSON purge manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const readReviewedPurgeManifest = async (
  manifestPath: string,
): Promise<ReviewedRetiredMaterialPurgeManifest> => {
  let source: string;
  try {
    source = await readFile(resolve(manifestPath), 'utf8');
  } catch (error) {
    throw new RetiredMaterialPurgeError(
      `Missing purge manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseReviewedPurgeManifestJson(source);
};

export const parseRetiredMaterialPurgeArgs = (
  argv: readonly string[],
): RetiredMaterialPurgeCliOptions => {
  let projectId = '';
  let manifestPath = '';
  let apply = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    switch (argument) {
      case '--project':
        projectId = requireValue(argv, index, argument);
        index += 1;
        break;
      case '--manifest':
        manifestPath = requireValue(argv, index, argument);
        index += 1;
        break;
      case '--apply':
        apply = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      default:
        if (argument.startsWith('--project=')) {
          projectId = argument.slice('--project='.length).trim();
          break;
        }
        if (argument.startsWith('--manifest=')) {
          manifestPath = argument.slice('--manifest='.length).trim();
          break;
        }
        throw new RetiredMaterialPurgeError(`Unknown argument: ${argument}`);
    }
  }

  if (help) {
    return {
      projectId,
      manifestPath,
      apply: true,
      help,
    };
  }
  if (!projectId) {
    throw new RetiredMaterialPurgeError('--project is required.');
  }
  if (!manifestPath) {
    throw new RetiredMaterialPurgeError('--manifest is required.');
  }
  if (!apply) {
    throw new RetiredMaterialPurgeError(
      '--apply is required. There is no implicit purge mode.',
    );
  }

  return {
    projectId,
    manifestPath,
    apply: true,
    help: false,
  };
};

export const buildPurgeManifestFingerprint = (
  manifest: RetiredMaterialPurgeManifestSnapshot,
): string => JSON.stringify(canonicalize({
  projectId: manifest.projectId,
  sourceRevision: manifest.sourceRevision,
  classifierSchemaVersion: manifest.classifierSchemaVersion,
  candidateCountsByReason: manifest.candidateCountsByReason,
  candidateIdsByState: manifest.candidateIdsByState,
  markerEvidence: manifest.markerEvidence,
  plannedDeletionPaths: manifest.plannedDeletionPaths,
  retainedResultScrubPaths: manifest.retainedResultScrubPaths,
  driveUrlFieldPaths: manifest.driveUrlFieldPaths,
  unknownBlockedRecords: manifest.unknownBlockedRecords,
  activeSessionCount: manifest.activeSessionCount,
  protectedReadingV2CollisionCount: manifest.protectedReadingV2CollisionCount,
  plannedR2DeleteCount: manifest.plannedR2DeleteCount,
}));

const assertSupportedProject = (projectId: string, label: string): void => {
  if (projectId !== RETIRED_MATERIAL_PURGE_PROJECT_ID) {
    throw new RetiredMaterialPurgeError(
      `${label} project must be ${RETIRED_MATERIAL_PURGE_PROJECT_ID}; got ${projectId}.`,
    );
  }
};

export const assertReviewedPurgeManifestFresh = (
  reviewed: ReviewedRetiredMaterialPurgeManifest,
  current: RetiredMaterialPurgeManifestSnapshot,
  now = new Date(),
  maxAgeMs = RETIRED_MATERIAL_PURGE_MAX_MANIFEST_AGE_MS,
): void => {
  assertSupportedProject(reviewed.projectId, 'Reviewed manifest');
  assertSupportedProject(current.projectId, 'Current inventory');
  if (reviewed.projectId !== current.projectId) {
    throw new RetiredMaterialPurgeError('Reviewed manifest project differs from current inventory.');
  }
  if (reviewed.sourceRevision !== current.sourceRevision) {
    throw new RetiredMaterialPurgeError('Reviewed manifest is stale: source revision changed.');
  }
  if (reviewed.classifierSchemaVersion !== current.classifierSchemaVersion) {
    throw new RetiredMaterialPurgeError('Reviewed manifest is stale: classifier schema changed.');
  }

  const generatedAtMs = validateTimestamp(reviewed.generatedAt, 'generatedAt');
  const reviewedAtMs = validateTimestamp(reviewed.reviewedAt, 'reviewedAt');
  if (reviewedAtMs < generatedAtMs) {
    throw new RetiredMaterialPurgeError(
      'Reviewed manifest is stale: reviewedAt is before generatedAt.',
    );
  }
  if (now.getTime() - generatedAtMs > maxAgeMs) {
    throw new RetiredMaterialPurgeError(
      'Reviewed manifest is stale: generatedAt exceeds the allowed age.',
    );
  }
};

const assertManifestMatchesCurrentInventory = (
  reviewed: RetiredMaterialPurgeManifestSnapshot,
  current: RetiredMaterialPurgeManifestSnapshot,
): string => {
  const reviewedFingerprint = buildPurgeManifestFingerprint(reviewed);
  const currentFingerprint = buildPurgeManifestFingerprint(current);
  if (reviewedFingerprint !== currentFingerprint) {
    throw new RetiredMaterialPurgeError(
      'Reviewed manifest differs from recomputed current inventory.',
    );
  }
  return reviewedFingerprint;
};

const assertDeletionPathIsSafe = (
  path: string,
  manifest: RetiredMaterialPurgeManifestSnapshot,
): void => {
  const normalized = ensureLeadingSlash(path);
  const segments = pathSegments(normalized);
  const root = segments[0] ?? '';

  if (segments.length < 2) {
    throw new RetiredMaterialPurgeError(`Unsafe purge path ${normalized}: root delete denied.`);
  }
  if ((PROTECTED_DELETION_ROOTS as readonly string[]).includes(root)) {
    throw new RetiredMaterialPurgeError(
      `Unsafe purge path ${normalized}: protected root deletion denied.`,
    );
  }
  if (!(ALLOWED_DELETION_ROOTS as readonly string[]).includes(root)) {
    throw new RetiredMaterialPurgeError(
      `Unsafe purge path ${normalized}: root is not purge-allowlisted.`,
    );
  }

  if (
    normalized.startsWith('/quizzes/')
    && !manifest.candidateIdsByState['retire-quiz'].includes(normalized)
  ) {
    throw new RetiredMaterialPurgeError(
      `Unsafe purge path ${normalized}: quiz record is not manifest-reviewed.`,
    );
  }
  if (
    normalized.startsWith('/tests/')
    && !manifest.candidateIdsByState['retire-reading-v1'].includes(normalized)
    && !manifest.candidateIdsByState['retire-drive-backed-listening'].includes(normalized)
  ) {
    throw new RetiredMaterialPurgeError(
      `Unsafe purge path ${normalized}: tests record is not manifest-reviewed as retired.`,
    );
  }
};

const assertRetainedResultScrubPathIsSafe = (path: string): void => {
  const normalized = ensureLeadingSlash(path);
  const segments = pathSegments(normalized);
  if (segments[0] !== 'test_results' || segments.length < 3) {
    throw new RetiredMaterialPurgeError(
      `Unsafe retained-result scrub path ${normalized}: must target a field below /test_results/{resultId}.`,
    );
  }
  if (segments[2] === 'questionResults') {
    throw new RetiredMaterialPurgeError(
      `Unsafe retained-result scrub path ${normalized}: answer-review fields are protected.`,
    );
  }
};

const resultRootFromScrubPath = (path: string): string => {
  assertRetainedResultScrubPathIsSafe(path);
  const [root, resultId] = pathSegments(path);
  return `/${root}/${resultId}`;
};

const assertPurgeManifestSafety = (
  manifest: RetiredMaterialPurgeManifestSnapshot,
): void => {
  assertSupportedProject(manifest.projectId, 'Purge manifest');
  if (manifest.activeSessionCount !== 0) {
    throw new RetiredMaterialPurgeError('Purge aborted: active sessions are present.');
  }
  if (manifest.unknownBlockedRecords.length > 0) {
    throw new RetiredMaterialPurgeError(
      'Purge aborted: unknown or malformed candidate shapes are present.',
    );
  }
  if (manifest.protectedReadingV2CollisionCount !== 0) {
    throw new RetiredMaterialPurgeError(
      'Purge aborted: protected Reading V2 marker collision is present.',
    );
  }
  if (manifest.plannedR2DeleteCount !== 0) {
    throw new RetiredMaterialPurgeError('Purge aborted: R2 delete operations are not allowed.');
  }

  manifest.plannedDeletionPaths.forEach((path) =>
    assertDeletionPathIsSafe(path, manifest));
  manifest.retainedResultScrubPaths.forEach(assertRetainedResultScrubPathIsSafe);
};

export const buildRetiredMaterialPurgePlan = (
  reviewed: ReviewedRetiredMaterialPurgeManifest,
  current: RetiredMaterialPurgeManifestSnapshot,
  options: Readonly<{ now?: Date; maxAgeMs?: number }> = {},
): RetiredMaterialPurgePlan => {
  assertReviewedPurgeManifestFresh(
    reviewed,
    current,
    options.now,
    options.maxAgeMs ?? RETIRED_MATERIAL_PURGE_MAX_MANIFEST_AGE_MS,
  );
  const manifestFingerprint = assertManifestMatchesCurrentInventory(reviewed, current);
  assertPurgeManifestSafety(reviewed);

  const deletionPaths = sortUnique(reviewed.plannedDeletionPaths.map(ensureLeadingSlash));
  const retainedResultScrubPaths = sortUnique(
    reviewed.retainedResultScrubPaths.map(ensureLeadingSlash),
  );
  const retainedResultRoots = sortUnique(retainedResultScrubPaths.map(resultRootFromScrubPath));
  const firebaseUpdates: Record<string, null | true> = {};

  deletionPaths.forEach((path) => {
    firebaseUpdates[stripLeadingSlash(path)] = null;
  });
  retainedResultScrubPaths.forEach((path) => {
    firebaseUpdates[stripLeadingSlash(path)] = null;
  });

  const resultPatch = buildSourceMaterialRemovedResultPatch();
  retainedResultRoots.forEach((root) => {
    firebaseUpdates[`${stripLeadingSlash(root)}/sourceMaterialRemoved`] =
      resultPatch.sourceMaterialRemoved;
  });

  const updateCount = Object.keys(firebaseUpdates).length;
  if (updateCount > RETIRED_MATERIAL_PURGE_MAX_UPDATE_PATHS) {
    throw new RetiredMaterialPurgeError(
      `Purge aborted: ${updateCount} Firebase updates exceeds ${RETIRED_MATERIAL_PURGE_MAX_UPDATE_PATHS}.`,
    );
  }
  if (!Object.values(firebaseUpdates).every((value) => value === null || value === true)) {
    throw new RetiredMaterialPurgeError('Purge aborted: non-idempotent update value planned.');
  }

  return {
    projectId: reviewed.projectId,
    manifestFingerprint,
    deletionPaths,
    retainedResultScrubPaths,
    retainedResultRoots,
    readBeforeMutationPaths: sortUnique([...deletionPaths, ...retainedResultRoots]),
    firebaseUpdates,
    updateCount,
    readbackExpectations: [
      'zero Quiz materials',
      'zero Reading V1 materials',
      'zero Drive-backed Listening materials',
      'zero stale active assignment/catalog/delivery references',
      'zero active sessions',
      'retained result counts unchanged',
      'zero Drive URLs in retained result source fields',
      'Reading V2 counts unchanged',
      'R2 delete count zero',
    ],
  };
};

const retiredCandidateCount = (report: RetiredMaterialInventoryReport): number =>
  report.manifest.candidateIdsByState['retire-quiz'].length
  + report.manifest.candidateIdsByState['retire-reading-v1'].length
  + report.manifest.candidateIdsByState['retire-drive-backed-listening'].length;

const retainedResultDriveUrlCount = (report: RetiredMaterialInventoryReport): number =>
  report.driveUrlFieldPaths.filter((path) => path.startsWith('/test_results/')).length;

export const assertRetiredMaterialPurgeReadback = (
  before: RetiredMaterialInventoryReport,
  after: RetiredMaterialInventoryReport,
): void => {
  if (after.readFailures.length > 0) {
    throw new RetiredMaterialPurgeError(
      `Purge readback failed: ${after.readFailures.length} roots failed to read.`,
    );
  }
  if (retiredCandidateCount(after) !== 0 || after.manifest.plannedDeletionPaths.length !== 0) {
    throw new RetiredMaterialPurgeError(
      'Purge readback failed: retired material or stale delivery references remain.',
    );
  }
  if (after.manifest.activeSessionCount !== 0) {
    throw new RetiredMaterialPurgeError('Purge readback failed: active sessions remain.');
  }
  if (after.results.records !== before.results.records) {
    throw new RetiredMaterialPurgeError(
      'Purge readback failed: retained result record count changed.',
    );
  }
  if (
    JSON.stringify(canonicalize(after.results.indexes))
    !== JSON.stringify(canonicalize(before.results.indexes))
  ) {
    throw new RetiredMaterialPurgeError('Purge readback failed: result index counts changed.');
  }
  if (retainedResultDriveUrlCount(after) !== 0) {
    throw new RetiredMaterialPurgeError(
      'Purge readback failed: Drive URLs remain in retained result source fields.',
    );
  }
  if (
    after.routingMetadata.explicitReadingV2PayloadCount
    !== before.routingMetadata.explicitReadingV2PayloadCount
  ) {
    throw new RetiredMaterialPurgeError('Purge readback failed: Reading V2 count changed.');
  }
  if (
    JSON.stringify(canonicalize(after.routingMetadata.readingV2MarkerOccurrences))
    !== JSON.stringify(canonicalize(before.routingMetadata.readingV2MarkerOccurrences))
  ) {
    throw new RetiredMaterialPurgeError('Purge readback failed: Reading V2 marker counts changed.');
  }
  if (after.manifest.plannedR2DeleteCount !== 0) {
    throw new RetiredMaterialPurgeError('Purge readback failed: R2 delete count is not zero.');
  }
};

const rootForClassification = (path: string): string => {
  if (path.startsWith('/material_catalog/material_indexes/')) {
    return 'material_catalog/material_indexes';
  }
  return pathRoot(path);
};

export const verifyPurgePreMutationReads = async (
  database: ReadOnlyDatabase,
  plan: RetiredMaterialPurgePlan,
): Promise<void> => {
  for (const path of plan.readBeforeMutationPaths) {
    const value = await database.read(stripLeadingSlash(path));
    if (value === null || value === undefined) {
      throw new RetiredMaterialPurgeError(
        `Purge aborted: pre-mutation read found missing candidate ${path}.`,
      );
    }

    if (path.startsWith('/test_results/')) {
      if (!isRecord(value)) {
        throw new RetiredMaterialPurgeError(
          `Purge aborted: retained result ${path} is malformed.`,
        );
      }
      continue;
    }

    const decision = classifyRetirementCandidate(value, {
      path,
      root: rootForClassification(path),
    });
    if (decision.state === 'protect-reading-v2' || decision.protectedReadingV2Collision) {
      throw new RetiredMaterialPurgeError(
        `Purge aborted: pre-mutation read found Reading V2 marker at ${path}.`,
      );
    }
    if (decision.state === 'unknown-blocked') {
      throw new RetiredMaterialPurgeError(
        `Purge aborted: pre-mutation read found unknown or malformed candidate ${path}.`,
      );
    }
  }
};

export const executeRetiredMaterialPurgePlan = async (
  database: RetiredMaterialPurgeDatabase,
  plan: RetiredMaterialPurgePlan,
): Promise<void> => {
  await verifyPurgePreMutationReads(database, plan);
  if (plan.updateCount > 0) {
    await database.update('/', plan.firebaseUpdates);
  }
};

export const createFirebaseCliPurgeDatabase = (
  projectId: string,
): RetiredMaterialPurgeDatabase => ({
  read: async (path) => {
    const { stdout } = await execFileAsync(process.execPath, [
      firebaseBinary,
      'database:get',
      normalizeDatabasePath(path),
      '--project',
      projectId,
    ], {
      cwd: process.cwd(),
      maxBuffer: 100 * 1024 * 1024,
    });
    const output = stdout.trim();
    return output && output !== 'null' ? JSON.parse(output) : null;
  },
  update: async (path, values) => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'retired-material-purge-'));
    const updateFile = join(tempRoot, 'firebase-update.json');
    try {
      await writeFile(updateFile, `${JSON.stringify(values, null, 2)}\n`, 'utf8');
      await execFileAsync(process.execPath, [
        firebaseBinary,
        'database:update',
        normalizeDatabasePath(path),
        updateFile,
        '--project',
        projectId,
      ], {
        cwd: process.cwd(),
        maxBuffer: 100 * 1024 * 1024,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  },
});

const readSourceRevision = async (): Promise<string> => {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
  });
  return stdout.trim();
};

const printUsage = (): void => {
  console.log(`Usage:
  npm run materials:purge-retired -- --project temp-a1437 --manifest <reviewedManifestPath> --apply

Destructive Phase 8 purge. Requires reviewed manifest and explicit --apply.
Never deletes Reading V2, completed results, result indexes, R2 state, classes, courses, modules, or closed sessions.`);
};

export const runRetiredMaterialPurgeCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  const options = parseRetiredMaterialPurgeArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  assertSupportedProject(options.projectId, 'CLI');

  const database = createFirebaseCliPurgeDatabase(options.projectId);
  const reviewedManifest = await readReviewedPurgeManifest(options.manifestPath);
  const currentReport = await buildRetiredMaterialInventory(database, {
    projectId: options.projectId,
    sourceRevision: await readSourceRevision(),
    generatedAt: new Date().toISOString(),
  });
  if (currentReport.readFailures.length > 0) {
    throw new RetiredMaterialPurgeError(
      `Purge aborted: ${currentReport.readFailures.length} inventory roots failed to read.`,
    );
  }
  const currentManifest = normalizeInventoryManifestSnapshot(currentReport.manifest);
  const plan = buildRetiredMaterialPurgePlan(reviewedManifest, currentManifest);

  await executeRetiredMaterialPurgePlan(database, plan);

  const readbackReport = await buildRetiredMaterialInventory(database, {
    projectId: options.projectId,
    sourceRevision: await readSourceRevision(),
    generatedAt: new Date().toISOString(),
  });
  assertRetiredMaterialPurgeReadback(currentReport, readbackReport);

  console.log(JSON.stringify({
    projectId: plan.projectId,
    mode: 'applied',
    manifestPath: resolve(options.manifestPath),
    manifestFingerprint: plan.manifestFingerprint,
    updateCount: plan.updateCount,
    deletionPathCount: plan.deletionPaths.length,
    retainedResultScrubPathCount: plan.retainedResultScrubPaths.length,
    retainedResultRootCount: plan.retainedResultRoots.length,
    readbackExpectations: plan.readbackExpectations,
    readback: {
      activeSessionCount: readbackReport.manifest.activeSessionCount,
      plannedR2DeleteCount: readbackReport.manifest.plannedR2DeleteCount,
      protectedReadingV2CollisionCount:
        readbackReport.manifest.protectedReadingV2CollisionCount,
      retainedResultCount: readbackReport.results.records,
      driveUrlFieldPathCount: readbackReport.driveUrlFieldPaths.length,
      readFailureCount: readbackReport.readFailures.length,
    },
  }, null, 2));

  return readbackReport.readFailures.length === 0 ? 0 : 2;
};

const isDirectExecution = (): boolean => {
  if (process.env.VITEST_WORKER_ID) {
    return false;
  }
  if (
    process.env.npm_lifecycle_event === 'materials:purge-retired'
    || process.env.npm_lifecycle_script?.includes('purge-retired-materials.ts')
  ) {
    return true;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((argument) =>
    Boolean(argument)
    && !argument.startsWith('-')
    && resolve(argument) === currentFile);
};

if (isDirectExecution()) {
  runRetiredMaterialPurgeCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
