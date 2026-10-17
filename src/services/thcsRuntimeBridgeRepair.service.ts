import type {
  THCSDraft,
  THCSSection,
  THCSTest,
  THCSTestMetadata,
} from '../types/thcs-test.types';
import { createLegacyTestMaterialSummary } from './materialCatalog/legacyTestMaterialSummary.service';
import {
  buildMaterialSummaryIndexPlan,
  type MaterialSummary,
} from './materialCatalog/materialSummaryPort.service';

type JsonRecord = Record<string, unknown>;

export type ThcsRuntimeBridgeRepairOperationKind =
  | 'thcs-runtime-write'
  | 'material-summary-write'
  | 'material-summary-remove';

export type ThcsRuntimeBridgeRepairReason =
  | 'missing-runtime-from-published-draft'
  | 'missing-summary-row'
  | 'stale-summary-row'
  | 'stale-summary-path';

export type ThcsRuntimeBridgeRepairSkipReason =
  | 'missing-published-test-id'
  | 'missing-owner'
  | 'missing-metadata'
  | 'missing-sections'
  | 'missing-timestamp'
  | 'existing-runtime'
  | 'removed-summary-tombstone'
  | 'not-published';

export interface ThcsRuntimeBridgeRepairOperation {
  readonly kind: ThcsRuntimeBridgeRepairOperationKind;
  readonly path: string;
  readonly testId: string;
  readonly draftId?: string;
  readonly value: unknown | null;
  readonly reason: ThcsRuntimeBridgeRepairReason;
}

export interface ThcsRuntimeBridgeRepairSkip {
  readonly testId?: string;
  readonly draftId?: string;
  readonly libraryId?: string;
  readonly title?: string;
  readonly reason: ThcsRuntimeBridgeRepairSkipReason;
}

export interface ThcsRuntimeBridgeRepairInput {
  readonly draftsById?: Readonly<Record<string, unknown>>;
  readonly libraryById?: Readonly<Record<string, unknown>>;
  readonly testsById?: Readonly<Record<string, unknown>>;
  readonly currentSummaryIndex?: unknown;
}

export interface ThcsRuntimeBridgeRepairPlan {
  readonly operations: readonly ThcsRuntimeBridgeRepairOperation[];
  readonly skips: readonly ThcsRuntimeBridgeRepairSkip[];
  readonly totals: {
    readonly publishedDrafts: number;
    readonly repairableDrafts: number;
    readonly runtimeWrites: number;
    readonly summaryWrites: number;
    readonly summaryRemoves: number;
    readonly existingRuntime: number;
    readonly unbackfillableLibraryRows: number;
    readonly operations: number;
    readonly countsBySkipReason: Readonly<Record<ThcsRuntimeBridgeRepairSkipReason, number>>;
  };
}

const SKIP_REASONS: readonly ThcsRuntimeBridgeRepairSkipReason[] = [
  'missing-published-test-id',
  'missing-owner',
  'missing-metadata',
  'missing-sections',
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

const gradeLevel = (value: unknown): THCSTestMetadata['gradeLevel'] | undefined => {
  const parsed = numberValue(value);
  return parsed === 6 ||
    parsed === 7 ||
    parsed === 8 ||
    parsed === 9 ||
    parsed === 10 ||
    parsed === 11 ||
    parsed === 12
    ? parsed
    : undefined;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => nonEmptyString(entry) ?? [])
    : [];

const timerMode = (
  value: unknown,
): THCSTestMetadata['timerMode'] | undefined =>
  value === 'strict' || value === 'informational' || value === 'none'
    ? value
    : undefined;

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

const countQuestions = (sections: readonly THCSSection[]): number =>
  sections.reduce((total, section) =>
    total + (Array.isArray(section.questions) ? section.questions.length : 0), 0);

const countPoints = (sections: readonly THCSSection[]): number =>
  sections.reduce((total, section) =>
    total + (nonNegativeNumber(section.totalPoints) ?? 0), 0);

const normalizeSections = (value: unknown): THCSSection[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const sections = removeUndefined(value) as THCSSection[];
  return countQuestions(sections) > 0 ? sections : null;
};

const getLibraryTestId = (libraryId: string, library: JsonRecord): string | undefined =>
  nonEmptyString(library.testId) ?? nonEmptyString(library.id) ?? libraryId;

const buildLibraryByTestId = (
  libraryById: Readonly<Record<string, unknown>>,
): Map<string, JsonRecord & { readonly _libraryId: string }> => {
  const byTestId = new Map<string, JsonRecord & { readonly _libraryId: string }>();
  Object.entries(libraryById).forEach(([libraryId, rawLibrary]) => {
    const library = asRecord(rawLibrary);
    const testId = getLibraryTestId(libraryId, library);
    if (testId) {
      byTestId.set(testId, { ...library, _libraryId: libraryId });
    }
  });
  return byTestId;
};

const buildMetadata = (
  draftMetadata: JsonRecord,
  library: JsonRecord | undefined,
): THCSTestMetadata | null => {
  const title =
    nonEmptyString(draftMetadata.title) ??
    nonEmptyString(library?.title);
  const duration =
    nonNegativeNumber(draftMetadata.duration) ??
    nonNegativeNumber(library?.duration);
  const resolvedGrade =
    gradeLevel(draftMetadata.gradeLevel) ??
    gradeLevel(library?.gradeLevel);
  const examType =
    nonEmptyString(draftMetadata.examType) ??
    nonEmptyString(library?.examType);

  if (!title || duration === undefined || !resolvedGrade || !examType) {
    return null;
  }

  return removeUndefined({
    title,
    duration,
    gradeLevel: resolvedGrade,
    examType,
    subjectVariant:
      nonEmptyString(draftMetadata.subjectVariant) ??
      nonEmptyString(library?.subjectVariant),
    province:
      nonEmptyString(draftMetadata.province) ??
      nonEmptyString(library?.province),
    school: nonEmptyString(draftMetadata.school),
    description:
      nonEmptyString(draftMetadata.description) ??
      nonEmptyString(library?.description),
    tags: stringArray(draftMetadata.tags).length > 0
      ? stringArray(draftMetadata.tags)
      : stringArray(library?.tags),
    timerMode: timerMode(draftMetadata.timerMode),
  }) as THCSTestMetadata;
};

const isPublishedDraft = (draft: JsonRecord): boolean =>
  draft.status === 'published' || Boolean(nonEmptyString(draft.publishedTestId));

const buildRepairableTest = (
  draftId: string,
  rawDraft: unknown,
  libraryByTestId: ReadonlyMap<string, JsonRecord>,
): { readonly test: THCSTest } | { readonly skip: ThcsRuntimeBridgeRepairSkip } => {
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

  const library = libraryByTestId.get(testId);
  const metadata = buildMetadata(asRecord(draft.metadata), library);
  if (!metadata) {
    return { skip: { testId, draftId, title, reason: 'missing-metadata' } };
  }

  const sections = normalizeSections(draft.sections);
  if (!sections) {
    return {
      skip: {
        testId,
        draftId,
        title: metadata.title,
        reason: 'missing-sections',
      },
    };
  }

  const createdAt =
    timestampMs(draft.createdAt) ??
    timestampMs(library?.createdAt) ??
    timestampMs(draft.updatedAt);
  const updatedAt =
    timestampMs(draft.updatedAt) ??
    timestampMs(library?.updatedAt) ??
    createdAt;
  const publishedAt =
    timestampMs(draft.publishedAt) ??
    timestampMs(library?.publishedAt) ??
    updatedAt;

  if (createdAt === undefined || updatedAt === undefined || publishedAt === undefined) {
    return {
      skip: {
        testId,
        draftId,
        title: metadata.title,
        reason: 'missing-timestamp',
      },
    };
  }

  const sectionQuestionCount = countQuestions(sections);
  const draftQuestionCount = nonNegativeNumber(draft.questionCount);
  const questionCount =
    draftQuestionCount !== undefined && draftQuestionCount > 0
      ? draftQuestionCount
      : sectionQuestionCount;
  const resolvedTotalPoints =
    nonNegativeNumber(draft.totalPoints) ?? countPoints(sections);
  const totalPoints = resolvedTotalPoints > 0 ? resolvedTotalPoints : 10;

  return {
    test: removeUndefined({
      id: testId,
      testType: 'THCS-THPT',
      metadata,
      sections,
      questionCount,
      totalPoints,
      createdBy: ownerId,
      ownerId,
      isPublic: library?.isPublic === true,
      isComplete: true,
      createdAt,
      updatedAt,
      publishedAt,
      sourceDraftId: draftId,
      settings: {
        showTimer: true,
        showResults: 'immediate',
        allowReview: true,
      },
    }) as THCSTest,
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
): ThcsRuntimeBridgeRepairOperation[] =>
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
): ThcsRuntimeBridgeRepairOperation[] => {
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

  return writes.flatMap((write): ThcsRuntimeBridgeRepairOperation[] => {
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
  skips: readonly ThcsRuntimeBridgeRepairSkip[],
): Record<ThcsRuntimeBridgeRepairSkipReason, number> => {
  const counts = Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<ThcsRuntimeBridgeRepairSkipReason, number>;
  skips.forEach((skip) => {
    counts[skip.reason] += 1;
  });
  return counts;
};

export const planThcsRuntimeBridgeRepair = (
  input: ThcsRuntimeBridgeRepairInput,
): ThcsRuntimeBridgeRepairPlan => {
  const drafts = input.draftsById ?? {};
  const libraryByTestId = buildLibraryByTestId(input.libraryById ?? {});
  const testsById = input.testsById ?? {};
  const currentSummaryRows = flattenSummaryIndex(input.currentSummaryIndex);
  const operations: ThcsRuntimeBridgeRepairOperation[] = [];
  const skips: ThcsRuntimeBridgeRepairSkip[] = [];
  const repairableTestIds = new Set<string>();
  const tombstonedTestIds = new Set<string>();
  let publishedDrafts = 0;
  let repairableDrafts = 0;
  let existingRuntime = 0;

  Object.entries(drafts).forEach(([draftId, rawDraft]) => {
    if (isPublishedDraft(asRecord(rawDraft))) {
      publishedDrafts += 1;
    }

    const repairable = buildRepairableTest(draftId, rawDraft, libraryByTestId);
    if ('skip' in repairable) {
      skips.push(repairable.skip);
      return;
    }

    const currentByIdSummary = currentSummaryRows.get(byIdSummaryPath(repairable.test.id));
    if (isRemovedSummaryTombstone(currentByIdSummary)) {
      tombstonedTestIds.add(repairable.test.id);
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
    repairableTestIds.add(repairable.test.id);
    const currentTest = testsById[repairable.test.id];
    if (!isExisting(currentTest)) {
      operations.push({
        kind: 'thcs-runtime-write',
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

  libraryByTestId.forEach((library, testId) => {
    if (
      isExisting(testsById[testId]) ||
      repairableTestIds.has(testId) ||
      tombstonedTestIds.has(testId)
    ) {
      return;
    }

    const matchingSkip = skips.find((skip) => skip.testId === testId);
    skips.push({
      testId,
      libraryId: nonEmptyString(library._libraryId),
      title: nonEmptyString(library.title) ?? matchingSkip?.title,
      reason: matchingSkip?.reason ?? 'missing-sections',
    });
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
        operation.kind === 'thcs-runtime-write').length,
      summaryWrites,
      summaryRemoves,
      existingRuntime,
      unbackfillableLibraryRows: skips.filter((skip) =>
        skip.libraryId &&
        skip.reason !== 'existing-runtime' &&
        skip.reason !== 'removed-summary-tombstone').length,
      operations: operations.length,
      countsBySkipReason: skipCounts(skips),
    },
  };
};

export const buildThcsRuntimeBridgeRepairUpdatePayload = (
  operations: readonly ThcsRuntimeBridgeRepairOperation[],
): Record<string, unknown | null> =>
  Object.fromEntries(operations.map((operation) => [operation.path, operation.value]));
