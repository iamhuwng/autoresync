import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import { buildReadingV2TestBridgeRecord } from './readingV2TestBridge.service';

type JsonRecord = Record<string, unknown>;

export interface ReadingV2TestBridgeRepairInput {
  readonly metadataByMaterialId: Readonly<Record<string, unknown>>;
  readonly studentSafeProjectionsById: Readonly<Record<string, unknown>>;
  readonly testsById: Readonly<Record<string, unknown>>;
  readonly generatedAt: string;
}

export interface ReadingV2TestBridgeRepairOperation {
  readonly kind: 'test-bridge-write';
  readonly path: string;
  readonly materialId: string;
  readonly reason: 'missing-test-bridge' | 'stale-test-bridge';
  readonly value: Record<string, unknown>;
}

export interface ReadingV2TestBridgeRepairPlan {
  readonly operations: readonly ReadingV2TestBridgeRepairOperation[];
  readonly totals: {
    readonly activeFullTests: number;
    readonly currentBridges: number;
    readonly missingBridges: number;
    readonly staleBridges: number;
    readonly skippedMissingProjection: number;
    readonly skippedOutOfScope: number;
    readonly skippedInvalidMetadata: number;
  };
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isFullTestMaterialKind = (value: unknown): boolean =>
  value === 'full-test' || value === 'reading-v2-full-test-composition';

const isActiveState = (value: unknown): boolean =>
  value === undefined || value === 'published';

const isActiveFullTestCandidate = (value: unknown): boolean =>
  isRecord(value) &&
  value.deliveryEngine === READING_V2_ENGINE &&
  isFullTestMaterialKind(value.materialKind) &&
  isActiveState(value.state);

const normalizeRepairableMetadata = (
  value: unknown,
): ReadingV2MaterialMetadata | null => {
  if (
    !isRecord(value) ||
    value.deliveryEngine !== READING_V2_ENGINE ||
    typeof value.materialId !== 'string' ||
    typeof value.ownerId !== 'string' ||
    typeof value.title !== 'string' ||
    value.productLabel !== 'Reading V2' ||
    typeof value.durationMinutes !== 'number' ||
    typeof value.difficulty !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.visibility !== 'string' ||
    !isFullTestMaterialKind(value.materialKind) ||
    !isActiveState(value.state) ||
    typeof value.publishedSnapshotVersionId !== 'string'
  ) {
    return null;
  }

  const tags = value.tags === undefined
    ? []
    : Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')
      ? value.tags
      : null;
  const testTypeIds = value.testTypeIds === undefined
    ? []
    : Array.isArray(value.testTypeIds) &&
        value.testTypeIds.every((testTypeId) => typeof testTypeId === 'string')
      ? value.testTypeIds
      : null;

  if (!tags || !testTypeIds) {
    return null;
  }

  return {
    ...value,
    tags,
    testTypeIds,
    relationshipSurfaces: Array.isArray(value.relationshipSurfaces)
      ? value.relationshipSurfaces.filter((surface): surface is string =>
          typeof surface === 'string')
      : [],
  } as unknown as ReadingV2MaterialMetadata;
};

const isMatchingStudentSafeProjection = (
  value: unknown,
  metadata: ReadingV2MaterialMetadata,
): value is ReadingV2DerivedProjection =>
  isRecord(value) &&
  value.projectionKind === 'student-safe' &&
  value.ownerId === metadata.ownerId &&
  value.sourceSnapshotVersionId === metadata.publishedSnapshotVersionId &&
  isRecord(value.content);

const normalizeFirebaseValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    return value.map(normalizeFirebaseValue);
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, normalizeFirebaseValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    if (entries.length === 0) {
      return undefined;
    }
    return Object.fromEntries(entries);
  }

  return value;
};

const isCurrentBridge = (expected: unknown, actual: unknown): boolean =>
  JSON.stringify(normalizeFirebaseValue(expected)) ===
  JSON.stringify(normalizeFirebaseValue(actual));

const projectionId = (metadata: ReadingV2MaterialMetadata): string =>
  `${metadata.materialId}:${metadata.publishedSnapshotVersionId}`;

export const planReadingV2TestBridgeRepair = (
  input: ReadingV2TestBridgeRepairInput,
): ReadingV2TestBridgeRepairPlan => {
  const operations: ReadingV2TestBridgeRepairOperation[] = [];
  let activeFullTests = 0;
  let currentBridges = 0;
  let missingBridges = 0;
  let staleBridges = 0;
  let skippedMissingProjection = 0;
  let skippedOutOfScope = 0;
  let skippedInvalidMetadata = 0;

  Object.values(input.metadataByMaterialId).forEach((candidate) => {
    if (!isActiveFullTestCandidate(candidate)) {
      skippedOutOfScope += 1;
      return;
    }

    const metadata = normalizeRepairableMetadata(candidate);

    if (!metadata) {
      skippedInvalidMetadata += 1;
      return;
    }

    activeFullTests += 1;
    const projection = input.studentSafeProjectionsById[projectionId(metadata)];

    if (!isMatchingStudentSafeProjection(projection, metadata)) {
      skippedMissingProjection += 1;
      return;
    }

    const updatedAt = typeof metadata.updatedAt === 'string'
      ? metadata.updatedAt
      : input.generatedAt;
    const expected = buildReadingV2TestBridgeRecord({
      metadata,
      studentSafeProjection: projection,
      updatedAt,
    });
    const current = input.testsById[metadata.materialId];

    if (isCurrentBridge(expected, current)) {
      currentBridges += 1;
      return;
    }

    const reason = current === undefined || current === null
      ? 'missing-test-bridge'
      : 'stale-test-bridge';
    if (reason === 'missing-test-bridge') {
      missingBridges += 1;
    } else {
      staleBridges += 1;
    }
    operations.push({
      kind: 'test-bridge-write',
      path: `tests/${metadata.materialId}`,
      materialId: metadata.materialId,
      reason,
      value: expected,
    });
  });

  return {
    operations: operations.sort((left, right) =>
      left.materialId.localeCompare(right.materialId),
    ),
    totals: {
      activeFullTests,
      currentBridges,
      missingBridges,
      staleBridges,
      skippedMissingProjection,
      skippedOutOfScope,
      skippedInvalidMetadata,
    },
  };
};

export const buildReadingV2TestBridgeRepairUpdatePayload = (
  operations: readonly ReadingV2TestBridgeRepairOperation[],
): Record<string, unknown> =>
  Object.fromEntries(operations.map((operation) => [operation.path, operation.value]));
