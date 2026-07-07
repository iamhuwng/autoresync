import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import type { ReadingV2MaterialMetadata } from '../reading-v2/readingV2MaterialMetadata.service';
import {
  createMaterialBookSummary,
  createReadingV2MaterialSummary,
} from './materialSummaryAdapters.service';
import {
  createLegacyTestMaterialSummary,
  type LegacyTestRecord,
} from './legacyTestMaterialSummary.service';
import {
  assertMaterialSummary,
  buildMaterialSummaryIndexPlan,
  type MaterialSummary,
} from './materialSummaryPort.service';

export interface MaterialSummaryReconciliationInput {
  readonly legacyTests?: Readonly<Record<string, LegacyTestRecord>>;
  readonly readingV2Metadata?: Readonly<Record<string, ReadingV2MaterialMetadata>>;
  readonly books?: Readonly<Record<string, MaterialBookMetadata>>;
  readonly currentIndex: unknown;
}

export interface MaterialSummaryReconciliationOperation {
  readonly path: string;
  readonly value: MaterialSummary | null;
  readonly reason: 'missing' | 'stale' | 'malformed' | 'orphan';
}

export interface MaterialSummaryReconciliationReport {
  readonly expectedSummaryCount: number;
  readonly currentRowCount: number;
  readonly operationCount: number;
  readonly operationDigest: string;
  readonly countsByReason: Readonly<Record<
    MaterialSummaryReconciliationOperation['reason'],
    number
  >>;
  readonly expectedCountsByProducer: Readonly<Record<string, number>>;
  readonly expectedCountsByKind: Readonly<Record<string, number>>;
  readonly operations: readonly MaterialSummaryReconciliationOperation[];
}

export class MaterialSummaryReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialSummaryReconciliationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
};

const stableJson = (value: unknown): string => JSON.stringify(stableValue(value));

const digest = (operations: readonly MaterialSummaryReconciliationOperation[]): string => {
  let hash = 2166136261;
  const text = stableJson(operations);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const flattenCurrentIndex = (
  currentIndex: unknown,
): Map<string, unknown> => {
  if (currentIndex === null || currentIndex === undefined) {
    return new Map();
  }
  if (!isRecord(currentIndex)) {
    throw new MaterialSummaryReconciliationError(
      'Current material summary index must be an object.',
    );
  }

  const rows = new Map<string, unknown>();
  const visitBucket = (
    bucket: string,
    value: unknown,
    depth: number,
    path: string,
  ) => {
    if (!isRecord(value)) {
      rows.set(path, value);
      return;
    }
    if (depth === 0) {
      Object.entries(value).forEach(([key, child]) => {
        rows.set(`${path}/${key}`, child);
      });
      return;
    }
    Object.entries(value).forEach(([key, child]) => {
      visitBucket(bucket, child, depth - 1, `${path}/${key}`);
    });
  };

  Object.entries(currentIndex).forEach(([bucket, value]) => {
    const depth = bucket === 'by_id' ? 0 : 1;
    visitBucket(
      bucket,
      value,
      depth,
      `material_catalog/material_summary_indexes/v1/${bucket}`,
    );
  });
  return rows;
};

const addSummary = (
  summaries: Map<string, MaterialSummary>,
  summary: MaterialSummary,
  source: string,
): void => {
  assertMaterialSummary(summary);
  const existing = summaries.get(summary.materialId);
  if (existing && stableJson(existing) !== stableJson(summary)) {
    throw new MaterialSummaryReconciliationError(
      `Conflicting canonical summaries for ${summary.materialId} from ${source}.`,
    );
  }
  summaries.set(summary.materialId, summary);
};

export const buildExpectedMaterialSummaries = (
  input: Omit<MaterialSummaryReconciliationInput, 'currentIndex'>,
): readonly MaterialSummary[] => {
  const summaries = new Map<string, MaterialSummary>();

  Object.entries(input.legacyTests ?? {}).forEach(([materialId, test]) => {
    if (test.deliveryEngine === 'reading-v2') {
      return;
    }
    try {
      addSummary(
        summaries,
        createLegacyTestMaterialSummary(materialId, test),
        `tests/${materialId}`,
      );
    } catch (error) {
      throw new MaterialSummaryReconciliationError(
        `Cannot summarize tests/${materialId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  Object.entries(input.readingV2Metadata ?? {}).forEach(([materialId, metadata]) => {
    try {
      const summary = createReadingV2MaterialSummary(metadata);
      if (summary) {
        addSummary(summaries, summary, `reading_v2/material_metadata/${materialId}`);
      }
    } catch (error) {
      throw new MaterialSummaryReconciliationError(
        `Cannot summarize reading_v2/material_metadata/${materialId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  Object.entries(input.books ?? {}).forEach(([bookId, book]) => {
    try {
      addSummary(
        summaries,
        createMaterialBookSummary(book),
        `material_catalog/books/${bookId}`,
      );
    } catch (error) {
      throw new MaterialSummaryReconciliationError(
        `Cannot summarize material_catalog/books/${bookId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  return [...summaries.values()].sort((left, right) =>
    left.materialId.localeCompare(right.materialId));
};

const countBy = (
  summaries: readonly MaterialSummary[],
  key: (summary: MaterialSummary) => string,
): Record<string, number> =>
  summaries.reduce<Record<string, number>>((counts, summary) => {
    const value = key(summary);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const MATERIAL_SUMMARY_BY_ID_INDEX_PREFIX =
  'material_catalog/material_summary_indexes/v1/by_id/';

const isByIdIndexPath = (path: string): boolean =>
  path.startsWith(MATERIAL_SUMMARY_BY_ID_INDEX_PREFIX);

const getByIdIndexPathMaterialId = (path: string): string | null =>
  isByIdIndexPath(path)
    ? path.slice(MATERIAL_SUMMARY_BY_ID_INDEX_PREFIX.length)
    : null;

const isValidInactiveMaterialSummary = (
  value: unknown,
  expectedMaterialId?: string,
): boolean => {
  try {
    assertMaterialSummary(value);
    return (
      value.lifecycleState !== 'active' &&
      (expectedMaterialId === undefined || value.materialId === expectedMaterialId)
    );
  } catch {
    return false;
  }
};

export const planMaterialSummaryReconciliation = (
  input: MaterialSummaryReconciliationInput,
): MaterialSummaryReconciliationReport => {
  const summaries = buildExpectedMaterialSummaries(input);
  const expectedRows = new Map<string, MaterialSummary>();
  summaries.forEach((summary) => {
    buildMaterialSummaryIndexPlan(summary).forEach((write) => {
      if (write.value) {
        expectedRows.set(write.path, write.value);
      }
    });
  });

  const currentRows = flattenCurrentIndex(input.currentIndex);
  const operations: MaterialSummaryReconciliationOperation[] = [];

  expectedRows.forEach((expected, path) => {
    const current = currentRows.get(path);
    if (current === undefined) {
      operations.push({ path, value: expected, reason: 'missing' });
      return;
    }
    try {
      assertMaterialSummary(current);
      if (stableJson(current) !== stableJson(expected)) {
        operations.push({ path, value: expected, reason: 'stale' });
      }
    } catch {
      operations.push({ path, value: expected, reason: 'malformed' });
    }
  });

  currentRows.forEach((current, path) => {
    if (expectedRows.has(path)) {
      return;
    }
    const byIdMaterialId = getByIdIndexPathMaterialId(path);
    if (
      byIdMaterialId &&
      isValidInactiveMaterialSummary(current, byIdMaterialId)
    ) {
      return;
    }
    let reason: MaterialSummaryReconciliationOperation['reason'] = 'orphan';
    try {
      assertMaterialSummary(current);
    } catch {
      reason = 'malformed';
    }
    operations.push({ path, value: null, reason });
  });

  operations.sort((left, right) => left.path.localeCompare(right.path));
  const countsByReason = {
    missing: 0,
    stale: 0,
    malformed: 0,
    orphan: 0,
  };
  operations.forEach((operation) => {
    countsByReason[operation.reason] += 1;
  });

  return {
    expectedSummaryCount: summaries.length,
    currentRowCount: currentRows.size,
    operationCount: operations.length,
    operationDigest: digest(operations),
    countsByReason,
    expectedCountsByProducer: countBy(summaries, (summary) => summary.producerId),
    expectedCountsByKind: countBy(summaries, (summary) => summary.materialKind),
    operations,
  };
};

export const buildMaterialSummaryReconciliationUpdatePayload = (
  operations: readonly MaterialSummaryReconciliationOperation[],
): Readonly<Record<string, MaterialSummary | null>> =>
  Object.fromEntries(operations.map((operation) => [
    operation.path,
    operation.value,
  ]));

export const buildMaterialSummaryParityReport = (
  expected: readonly MaterialSummary[],
  currentById: unknown,
) => {
  const current = isRecord(currentById) ? currentById : {};
  const expectedIds = expected.map((summary) => summary.materialId).sort();
  const currentIds = Object.entries(current)
    .filter(([, value]) => !isValidInactiveMaterialSummary(value))
    .map(([id]) => id)
    .sort();
  return {
    expectedCount: expectedIds.length,
    currentCount: currentIds.length,
    missingIds: expectedIds.filter((id) => !currentIds.includes(id)),
    orphanIds: currentIds.filter((id) => !expectedIds.includes(id)),
    parity:
      expectedIds.length === currentIds.length &&
      expectedIds.every((id, index) => id === currentIds[index]),
  };
};
