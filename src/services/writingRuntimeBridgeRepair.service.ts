import type {
  IELTSWritingTest,
  WritingTask,
  WritingTestMetadata,
} from '../types/ielts-writing.types';
import { createLegacyTestMaterialSummary } from './materialCatalog/legacyTestMaterialSummary.service';
import {
  buildMaterialSummaryIndexPlan,
  type MaterialSummary,
} from './materialCatalog/materialSummaryPort.service';

type JsonRecord = Record<string, unknown>;

export type WritingRuntimeBridgeRepairOperationKind =
  | 'writing-runtime-write'
  | 'material-summary-write'
  | 'material-summary-remove';

export type WritingRuntimeBridgeRepairReason =
  | 'missing-runtime-from-published-draft'
  | 'missing-summary-row'
  | 'stale-summary-row'
  | 'stale-summary-path';

export type WritingRuntimeBridgeRepairSkipReason =
  | 'missing-published-test-id'
  | 'missing-owner'
  | 'missing-metadata'
  | 'missing-tasks'
  | 'missing-timestamp'
  | 'existing-runtime'
  | 'removed-summary-tombstone'
  | 'not-published';

export interface WritingRuntimeBridgeRepairOperation {
  readonly kind: WritingRuntimeBridgeRepairOperationKind;
  readonly path: string;
  readonly testId: string;
  readonly draftId?: string;
  readonly value: unknown | null;
  readonly reason: WritingRuntimeBridgeRepairReason;
}

export interface WritingRuntimeBridgeRepairSkip {
  readonly testId?: string;
  readonly draftId?: string;
  readonly title?: string;
  readonly reason: WritingRuntimeBridgeRepairSkipReason;
}

export interface WritingRuntimeBridgeRepairInput {
  readonly draftsById?: Readonly<Record<string, unknown>>;
  readonly testsById?: Readonly<Record<string, unknown>>;
  readonly currentSummaryIndex?: unknown;
}

export interface WritingRuntimeBridgeRepairPlan {
  readonly operations: readonly WritingRuntimeBridgeRepairOperation[];
  readonly skips: readonly WritingRuntimeBridgeRepairSkip[];
  readonly totals: {
    readonly publishedDrafts: number;
    readonly repairableDrafts: number;
    readonly runtimeWrites: number;
    readonly summaryWrites: number;
    readonly summaryRemoves: number;
    readonly existingRuntime: number;
    readonly operations: number;
    readonly countsBySkipReason: Readonly<Record<WritingRuntimeBridgeRepairSkipReason, number>>;
  };
}

const SKIP_REASONS: readonly WritingRuntimeBridgeRepairSkipReason[] = [
  'missing-published-test-id',
  'missing-owner',
  'missing-metadata',
  'missing-tasks',
  'missing-timestamp',
  'existing-runtime',
  'removed-summary-tombstone',
  'not-published',
];

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord =>
  isRecord(value) ? value : {};

const nonEmptyString = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const isExisting = (value: unknown): boolean =>
  value !== undefined && value !== null;

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const nonNegativeNumber = (value: unknown): number | undefined => {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => nonEmptyString(entry) ?? [])
    : [];

const timestampMs = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (isRecord(value)) {
    const seconds = numberValue(value.seconds ?? value._seconds);
    const nanos = numberValue(value.nanoseconds ?? value._nanoseconds) ?? 0;
    if (seconds !== undefined) {
      return Math.round(seconds * 1000 + nanos / 1_000_000);
    }
  }
  return undefined;
};

const removeUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : removeUndefined(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)]),
  );
};

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

const stableJson = (value: unknown): string =>
  JSON.stringify(stableValue(removeUndefined(value)));

const isPublishedDraft = (draft: JsonRecord): boolean =>
  draft.status === 'published' || Boolean(nonEmptyString(draft.publishedTestId));

const buildMetadata = (draftMetadata: JsonRecord): WritingTestMetadata | null => {
  const title = nonEmptyString(draftMetadata.title);
  if (!title) {
    return null;
  }

  return removeUndefined({
    title,
    description: nonEmptyString(draftMetadata.description),
    duration: nonNegativeNumber(draftMetadata.duration) ?? 60,
    format: nonEmptyString(draftMetadata.format) ?? 'full-test',
    difficulty: nonEmptyString(draftMetadata.difficulty),
    targetBand: numberValue(draftMetadata.targetBand),
    tags: stringArray(draftMetadata.tags),
  }) as WritingTestMetadata;
};

const normalizeTasks = (value: unknown): WritingTask[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const tasks = removeUndefined(value) as WritingTask[];
  return tasks.length > 0 ? tasks : null;
};

const buildRepairableTest = (
  draftId: string,
  rawDraft: unknown,
): { readonly test: IELTSWritingTest } | { readonly skip: WritingRuntimeBridgeRepairSkip } => {
  const draft = asRecord(rawDraft);
  const testId = nonEmptyString(draft.publishedTestId);
  const title = nonEmptyString(asRecord(draft.metadata).title);

  if (!isPublishedDraft(draft)) {
    return { skip: { draftId, title, reason: 'not-published' } };
  }
  if (!testId) {
    return { skip: { draftId, title, reason: 'missing-published-test-id' } };
  }

  const ownerId = nonEmptyString(draft.userId);
  if (!ownerId) {
    return { skip: { testId, draftId, title, reason: 'missing-owner' } };
  }

  const metadata = buildMetadata(asRecord(draft.metadata));
  if (!metadata) {
    return { skip: { testId, draftId, title, reason: 'missing-metadata' } };
  }

  const tasks = normalizeTasks(draft.tasks);
  if (!tasks) {
    return { skip: { testId, draftId, title: metadata.title, reason: 'missing-tasks' } };
  }

  const createdAt = timestampMs(draft.createdAt) ?? timestampMs(draft.updatedAt);
  const updatedAt = timestampMs(draft.updatedAt) ?? createdAt;
  if (createdAt === undefined || updatedAt === undefined) {
    return { skip: { testId, draftId, title: metadata.title, reason: 'missing-timestamp' } };
  }

  return {
    test: removeUndefined({
      id: testId,
      type: 'IELTS',
      testType: 'IELTS',
      skill: 'Writing',
      title: metadata.title,
      duration: metadata.duration,
      questionCount: tasks.length,
      metadata,
      tasks,
      createdBy: ownerId,
      ownerId,
      sourceDraftId: draftId,
      isPublic: draft.isPublic === true,
      createdAt,
      updatedAt,
      publishedAt: updatedAt,
    }) as IELTSWritingTest,
  };
};

const flattenSummaryIndex = (currentSummaryIndex: unknown): Map<string, unknown> => {
  if (!isRecord(currentSummaryIndex)) {
    return new Map();
  }

  const rows = new Map<string, unknown>();
  const visit = (value: unknown, depth: number, path: string): void => {
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
      visit(child, depth - 1, `${path}/${key}`);
    });
  };

  Object.entries(currentSummaryIndex).forEach(([bucket, value]) => {
    visit(
      value,
      bucket === 'by_id' ? 0 : 1,
      `material_catalog/material_summary_indexes/v1/${bucket}`,
    );
  });

  return rows;
};

const byIdSummaryPath = (testId: string): string =>
  `material_catalog/material_summary_indexes/v1/by_id/${testId}`;

const isRemovedSummaryTombstone = (summary: unknown): boolean =>
  asRecord(summary).lifecycleState === 'removed';

const buildRemovedSummaryCleanupOperations = (
  testId: string,
  draftId: string | undefined,
  currentSummaryRows: ReadonlyMap<string, unknown>,
): WritingRuntimeBridgeRepairOperation[] =>
  Array.from(currentSummaryRows.entries())
    .filter(([path, value]) =>
      value !== undefined &&
      path !== byIdSummaryPath(testId) &&
      path.startsWith('material_catalog/material_summary_indexes/v1/') &&
      path.endsWith(`/${testId}`))
    .map(([path]) => ({
      kind: 'material-summary-remove',
      path,
      testId,
      draftId,
      value: null,
      reason: 'stale-summary-path',
    }));

const buildSummaryOperations = (
  testId: string,
  draftId: string | undefined,
  test: JsonRecord,
  currentSummaryRows: ReadonlyMap<string, unknown>,
): WritingRuntimeBridgeRepairOperation[] => {
  const expectedSummary = createLegacyTestMaterialSummary(testId, test);
  const previousSummary = currentSummaryRows.get(byIdSummaryPath(testId));
  let writes: ReturnType<typeof buildMaterialSummaryIndexPlan>;
  try {
    writes = buildMaterialSummaryIndexPlan(
      expectedSummary,
      previousSummary as MaterialSummary,
    );
  } catch {
    writes = buildMaterialSummaryIndexPlan(expectedSummary);
  }

  return writes.flatMap((write): WritingRuntimeBridgeRepairOperation[] => {
    const current = currentSummaryRows.get(write.path);
    if (write.value === null) {
      return current === undefined
        ? []
        : [{
          kind: 'material-summary-remove',
          path: write.path,
          testId,
          draftId,
          value: null,
          reason: 'stale-summary-path',
        }];
    }

    if (current !== undefined && stableJson(current) === stableJson(write.value)) {
      return [];
    }

    return [{
      kind: 'material-summary-write',
      path: write.path,
      testId,
      draftId,
      value: write.value,
      reason: current === undefined ? 'missing-summary-row' : 'stale-summary-row',
    }];
  });
};

const skipCounts = (
  skips: readonly WritingRuntimeBridgeRepairSkip[],
): Record<WritingRuntimeBridgeRepairSkipReason, number> => {
  const counts = Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<WritingRuntimeBridgeRepairSkipReason, number>;
  skips.forEach((skip) => {
    counts[skip.reason] += 1;
  });
  return counts;
};

export const planWritingRuntimeBridgeRepair = (
  input: WritingRuntimeBridgeRepairInput,
): WritingRuntimeBridgeRepairPlan => {
  const drafts = input.draftsById ?? {};
  const testsById = input.testsById ?? {};
  const currentSummaryRows = flattenSummaryIndex(input.currentSummaryIndex);
  const operations: WritingRuntimeBridgeRepairOperation[] = [];
  const skips: WritingRuntimeBridgeRepairSkip[] = [];
  let publishedDrafts = 0;
  let repairableDrafts = 0;
  let existingRuntime = 0;

  Object.entries(drafts).forEach(([draftId, rawDraft]) => {
    if (isPublishedDraft(asRecord(rawDraft))) {
      publishedDrafts += 1;
    }

    const repairable = buildRepairableTest(draftId, rawDraft);
    if ('skip' in repairable) {
      skips.push(repairable.skip);
      return;
    }

    const currentByIdSummary = currentSummaryRows.get(byIdSummaryPath(repairable.test.id));
    if (isRemovedSummaryTombstone(currentByIdSummary)) {
      skips.push({
        testId: repairable.test.id,
        draftId,
        title: repairable.test.metadata.title,
        reason: 'removed-summary-tombstone',
      });
      operations.push(...buildRemovedSummaryCleanupOperations(
        repairable.test.id,
        draftId,
        currentSummaryRows,
      ));
      return;
    }

    repairableDrafts += 1;
    const currentTest = testsById[repairable.test.id];
    if (!isExisting(currentTest)) {
      operations.push({
        kind: 'writing-runtime-write',
        path: `tests/${repairable.test.id}`,
        testId: repairable.test.id,
        draftId,
        value: repairable.test,
        reason: 'missing-runtime-from-published-draft',
      });
      operations.push(...buildSummaryOperations(
        repairable.test.id,
        draftId,
        repairable.test as unknown as JsonRecord,
        currentSummaryRows,
      ));
      return;
    }

    existingRuntime += 1;
    skips.push({
      testId: repairable.test.id,
      draftId,
      title: repairable.test.metadata.title,
      reason: 'existing-runtime',
    });
    operations.push(...buildSummaryOperations(
      repairable.test.id,
      draftId,
      asRecord(currentTest),
      currentSummaryRows,
    ));
  });

  operations.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.kind.localeCompare(right.kind));

  const summaryWrites = operations.filter((operation) =>
    operation.kind === 'material-summary-write').length;
  const summaryRemoves = operations.filter((operation) =>
    operation.kind === 'material-summary-remove').length;

  return {
    operations,
    skips,
    totals: {
      publishedDrafts,
      repairableDrafts,
      runtimeWrites: operations.filter((operation) =>
        operation.kind === 'writing-runtime-write').length,
      summaryWrites,
      summaryRemoves,
      existingRuntime,
      operations: operations.length,
      countsBySkipReason: skipCounts(skips),
    },
  };
};

export const buildWritingRuntimeBridgeRepairUpdatePayload = (
  operations: readonly WritingRuntimeBridgeRepairOperation[],
): Record<string, unknown | null> =>
  Object.fromEntries(operations.map((operation) => [operation.path, operation.value]));
