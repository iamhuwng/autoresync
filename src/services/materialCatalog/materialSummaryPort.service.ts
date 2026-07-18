import type {
  MaterialCatalogMaterialKind,
  MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import {
  MATERIAL_CATALOG_MATERIAL_KINDS,
} from '../../types/materialCatalog.types';
import {
  MATERIAL_KIND_TAXONOMY_REGISTRY,
  getMaterialProducerRegistration,
} from './materialIntegrationRegistry';

export const MATERIAL_SUMMARY_SCHEMA_VERSION = 1 as const;

export type MaterialSummaryVisibility = 'private' | 'public';
export type MaterialSummaryLifecycleState = 'active' | 'archived' | 'removed';
export type MaterialSummarySurfaceFamily =
  | 'assessment'
  | 'passage'
  | 'book'
  | 'draft'
  | 'resource';

export interface MaterialSummary {
  readonly schemaVersion: typeof MATERIAL_SUMMARY_SCHEMA_VERSION;
  readonly materialId: string;
  readonly producerId: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly surfaceFamily: MaterialSummarySurfaceFamily;
  readonly ownerId: string;
  readonly title: string;
  readonly description?: string;
  readonly visibility: MaterialSummaryVisibility;
  readonly lifecycleState: MaterialSummaryLifecycleState;
  readonly skillId?: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypeMembership: Readonly<Record<string, true>>;
  readonly tags: readonly string[];
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly sourceSnapshotVersionId?: string;
  readonly sourceFullTestId?: string;
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly updatedAt: string;
}

export type MaterialSummaryInput =
  Omit<MaterialSummary, 'testTypeMembership'> &
  Partial<Pick<MaterialSummary, 'testTypeMembership'>>;

export interface MaterialSummaryIndexWrite {
  readonly path: string;
  readonly value: MaterialSummary | null;
}

export type MaterialSummaryListQuery =
  | {
      readonly scope: 'owned';
      readonly ownerId: string;
    }
  | {
      readonly scope: 'public';
    };

export interface MaterialSummaryReader {
  readonly read: (path: string) => Promise<unknown>;
}

export interface MaterialSummaryStore extends MaterialSummaryReader {
  readonly updateRoot: (
    updates: Readonly<Record<string, MaterialSummary | null>>,
  ) => Promise<void>;
}

const MATERIAL_SUMMARY_FIELDS = new Set([
  'schemaVersion',
  'materialId',
  'producerId',
  'materialKind',
  'surfaceFamily',
  'ownerId',
  'title',
  'description',
  'visibility',
  'lifecycleState',
  'skillId',
  'primaryTestTypeId',
  'testTypeIds',
  'testTypeMembership',
  'tags',
  'questionCount',
  'durationMinutes',
  'sourceSnapshotVersionId',
  'sourceFullTestId',
  'hasBrokenRefs',
  'brokenRefCount',
  'updatedAt',
]);

const RTDB_FORBIDDEN_KEY_PATTERN = /[.#$/[\]\u0000-\u001f\u007f]/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasUndefined = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => entry === undefined || hasUndefined(entry));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some((entry) =>
    entry === undefined || hasUndefined(entry),
  );
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

const isSafeRtdbKey = (value: unknown): value is string =>
  isNonEmptyString(value) && !RTDB_FORBIDDEN_KEY_PATTERN.test(value.trim());

const isOptionalNonNegativeNumber = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);

const MATERIAL_SUMMARY_SURFACE_FAMILIES = new Set<MaterialSummarySurfaceFamily>([
  'assessment',
  'passage',
  'book',
  'draft',
  'resource',
]);

const unique = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)];

const hasMatchingTestTypeMembership = (
  testTypeIds: unknown,
  membership: unknown,
): boolean => {
  if (!isStringArray(testTypeIds) || !isRecord(membership)) {
    return false;
  }

  const uniqueTestTypeIds = unique(testTypeIds.map((testTypeId) => testTypeId.trim()));
  const membershipKeys = Object.keys(membership);

  return (
    membershipKeys.length === uniqueTestTypeIds.length &&
    membershipKeys.every((key) =>
      isSafeRtdbKey(key) &&
      uniqueTestTypeIds.includes(key) &&
      membership[key] === true) &&
    uniqueTestTypeIds.every((testTypeId) => membership[testTypeId] === true)
  );
};

const isMaterialSummary = (value: unknown): value is MaterialSummary => {
  if (
    !isRecord(value) ||
    hasUndefined(value) ||
    Object.keys(value).some((key) => !MATERIAL_SUMMARY_FIELDS.has(key))
  ) {
    return false;
  }

  const taxonomy = isNonEmptyString(value.materialKind)
    ? MATERIAL_KIND_TAXONOMY_REGISTRY[
        value.materialKind as MaterialCatalogMaterialKind
      ]
    : undefined;
  const producer = isNonEmptyString(value.producerId)
    ? (() => {
        try {
          return getMaterialProducerRegistration(value.producerId);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  return (
    value.schemaVersion === MATERIAL_SUMMARY_SCHEMA_VERSION &&
    isSafeRtdbKey(value.materialId) &&
    isSafeRtdbKey(value.producerId) &&
    producer?.materialKinds.includes(
      value.materialKind as MaterialCatalogMaterialKind,
    ) === true &&
    isNonEmptyString(value.materialKind) &&
    (MATERIAL_CATALOG_MATERIAL_KINDS as readonly string[]).includes(value.materialKind) &&
    isNonEmptyString(value.surfaceFamily) &&
    MATERIAL_SUMMARY_SURFACE_FAMILIES.has(
      value.surfaceFamily as MaterialSummarySurfaceFamily,
    ) &&
    taxonomy?.surfaceFamily === value.surfaceFamily &&
    isSafeRtdbKey(value.ownerId) &&
    isNonEmptyString(value.title) &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.visibility === 'private' || value.visibility === 'public') &&
    (value.visibility !== 'public' || taxonomy?.publicEligible === true) &&
    (
      value.lifecycleState === 'active' ||
      value.lifecycleState === 'archived' ||
      value.lifecycleState === 'removed'
    ) &&
    (value.skillId === undefined || isNonEmptyString(value.skillId)) &&
    (
      value.primaryTestTypeId === undefined ||
      isSafeRtdbKey(value.primaryTestTypeId)
    ) &&
    isStringArray(value.testTypeIds) &&
    value.testTypeIds.every(isSafeRtdbKey) &&
    hasMatchingTestTypeMembership(value.testTypeIds, value.testTypeMembership) &&
    isStringArray(value.tags) &&
    isOptionalNonNegativeNumber(value.questionCount) &&
    isOptionalNonNegativeNumber(value.durationMinutes) &&
    (
      value.sourceSnapshotVersionId === undefined ||
      isNonEmptyString(value.sourceSnapshotVersionId)
    ) &&
    (
      value.sourceFullTestId === undefined ||
      isNonEmptyString(value.sourceFullTestId)
    ) &&
    (value.hasBrokenRefs === undefined || typeof value.hasBrokenRefs === 'boolean') &&
    isOptionalNonNegativeNumber(value.brokenRefCount) &&
    isNonEmptyString(value.updatedAt)
  );
};

export const normalizeMaterialSummary = (summary: MaterialSummaryInput): MaterialSummary => {
  const testTypeIds = unique(summary.testTypeIds.map((testTypeId) =>
    testTypeId.trim() as MaterialTestTypeId));

  return Object.fromEntries(Object.entries({
    ...summary,
    materialId: summary.materialId.trim(),
    producerId: summary.producerId.trim(),
    ownerId: summary.ownerId.trim(),
    title: summary.title.trim(),
    description: summary.description?.trim(),
    skillId: summary.skillId?.trim(),
    testTypeIds,
    testTypeMembership: Object.fromEntries(testTypeIds.map((testTypeId) => [testTypeId, true])),
    tags: unique(summary.tags.map((tag) => tag.trim())),
    updatedAt: summary.updatedAt.trim(),
  }).filter(([, value]) => value !== undefined)) as unknown as MaterialSummary;
};

export class MaterialSummaryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialSummaryContractError';
  }
}

const READING_V2_DELIVERY_METADATA_FIELDS = new Set([
  'hasStudentSafeProjection',
  'studentSafeProjectionReady',
  'deliveryProjectionReady',
  'passageRefCount',
]);

const normalizeReadingV2DeliveryMetadataForRead = (
  value: unknown,
): unknown => {
  if (
    !isRecord(value) ||
    value.producerId !== 'reading-v2-full-test' ||
    value.materialKind !== 'full-test'
  ) {
    return value;
  }

  const booleanFields = [
    'hasStudentSafeProjection',
    'studentSafeProjectionReady',
    'deliveryProjectionReady',
  ];
  const hasInvalidBoolean = booleanFields.some((field) =>
    Object.hasOwn(value, field) && typeof value[field] !== 'boolean',
  );
  const passageRefCount = value.passageRefCount;
  const hasInvalidPassageRefCount =
    Object.hasOwn(value, 'passageRefCount') &&
    (
      typeof passageRefCount !== 'number' ||
      !Number.isFinite(passageRefCount) ||
      passageRefCount < 0
    );

  if (hasInvalidBoolean || hasInvalidPassageRefCount) {
    throw new MaterialSummaryContractError(
      'Reading V2 delivery metadata violates the compatibility contract.',
    );
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([field]) => !READING_V2_DELIVERY_METADATA_FIELDS.has(field),
    ),
  );
};

const isMaterialSummaryInput = (value: unknown): value is MaterialSummaryInput => {
  if (isMaterialSummary(value)) {
    return true;
  }

  if (!isRecord(value) || Object.hasOwn(value, 'testTypeMembership')) {
    return false;
  }

  try {
    return isMaterialSummary(normalizeMaterialSummary(value as MaterialSummaryInput));
  } catch {
    return false;
  }
};

export const assertMaterialSummary: (
  value: unknown,
) => asserts value is MaterialSummaryInput = (value) => {
  if (!isMaterialSummaryInput(value)) {
    throw new MaterialSummaryContractError(
      'Material summary violates the shared listing contract.',
    );
  }
};

export const MATERIAL_SUMMARY_INDEX_ROOT =
  'material_catalog/material_summary_indexes/v1';

const indexPath = (
  bucket: 'by_id' | 'by_owner' | 'by_visibility' | 'by_material_kind' | 'by_test_type',
  key: string,
  materialId?: string,
): string => [
  MATERIAL_SUMMARY_INDEX_ROOT,
  bucket,
  key,
  materialId,
].filter(Boolean).join('/');

export const getMaterialSummaryRecordPath = (materialId: string): string => {
  if (!isSafeRtdbKey(materialId)) {
    throw new MaterialSummaryContractError(
      'Material summary record path requires materialId.',
    );
  }

  return indexPath('by_id', materialId.trim());
};

export const getMaterialSummaryListPath = (
  query: MaterialSummaryListQuery,
): string => {
  if (query.scope === 'owned' && !isSafeRtdbKey(query.ownerId)) {
    throw new MaterialSummaryContractError('Owned material query requires ownerId.');
  }

  return query.scope === 'owned'
    ? indexPath('by_owner', query.ownerId.trim())
    : indexPath('by_visibility', 'public');
};

export const buildMaterialSummaryIndexPlan = (
  summaryInput: MaterialSummaryInput,
  previousSummaryInput?: MaterialSummaryInput | null,
): readonly MaterialSummaryIndexWrite[] => {
  assertMaterialSummary(summaryInput);
  const summary = normalizeMaterialSummary(summaryInput);
  assertMaterialSummary(summary);
  const previousSummary = previousSummaryInput
    ? (() => {
        assertMaterialSummary(previousSummaryInput);
        return normalizeMaterialSummary(previousSummaryInput);
      })()
    : null;
  if (previousSummary) {
    assertMaterialSummary(previousSummary);
  }

  const nextActivePaths = summary.lifecycleState === 'active' ? [
    indexPath('by_owner', summary.ownerId, summary.materialId),
    indexPath('by_visibility', summary.visibility, summary.materialId),
    indexPath('by_material_kind', summary.materialKind, summary.materialId),
    ...summary.testTypeIds.map((testTypeId) =>
      indexPath('by_test_type', testTypeId, summary.materialId)),
  ] : [];
  const cleanup = previousSummary
    ? buildMaterialSummaryIndexCleanup(previousSummary)
        .filter((write) => !nextActivePaths.includes(write.path))
    : [];

  return [
    ...cleanup,
    {
      path: getMaterialSummaryRecordPath(summary.materialId),
      value: summary,
    },
    ...nextActivePaths.map((path) => ({ path, value: summary } as const)),
  ];
};

export const buildMaterialSummaryIndexCleanup = (
  summaryInput: MaterialSummaryInput,
): readonly MaterialSummaryIndexWrite[] => {
  assertMaterialSummary(summaryInput);
  const summary = normalizeMaterialSummary(summaryInput);
  assertMaterialSummary(summary);

  return [
    indexPath('by_owner', summary.ownerId, summary.materialId),
    indexPath('by_visibility', summary.visibility, summary.materialId),
    indexPath('by_material_kind', summary.materialKind, summary.materialId),
    ...summary.testTypeIds.map((testTypeId) =>
      indexPath('by_test_type', testTypeId, summary.materialId)),
  ].map((path) => ({ path, value: null }));
};

const queryPath = (query: MaterialSummaryListQuery): string =>
  getMaterialSummaryListPath(query);

export const buildMaterialSummaryUpdatePayload = (
  summary: MaterialSummaryInput,
  previousSummary?: MaterialSummaryInput | null,
): Readonly<Record<string, MaterialSummary | null>> =>
  Object.fromEntries(
    buildMaterialSummaryIndexPlan(summary, previousSummary)
      .map((write) => [write.path, write.value]),
  );

export const synchronizeMaterialSummary = async (
  summaryInput: MaterialSummaryInput,
  store: MaterialSummaryStore,
): Promise<void> => {
  assertMaterialSummary(summaryInput);
  const summary = normalizeMaterialSummary(summaryInput);
  assertMaterialSummary(summary);
  const registration = getMaterialProducerRegistration(summary.producerId);
  if (registration.integrationMode !== 'summary-v1') {
    throw new MaterialSummaryContractError(
      `Material producer ${summary.producerId} is not registered for summary-v1 writes.`,
    );
  }

  const previousValue = await store.read(
    getMaterialSummaryRecordPath(summary.materialId),
  );
  const previousSummary = previousValue !== null && previousValue !== undefined
    ? (() => {
        assertMaterialSummary(previousValue);
        return normalizeMaterialSummary(previousValue);
      })()
    : null;
  if (previousValue !== null && previousValue !== undefined) {
    assertMaterialSummary(previousSummary);
  }

  await store.updateRoot(buildMaterialSummaryUpdatePayload(
    summary,
    previousSummary,
  ));
};

export const listActiveMaterialSummaries = async (
  query: MaterialSummaryListQuery,
  reader: MaterialSummaryReader,
): Promise<MaterialSummary[]> => {
  if (query.scope === 'owned' && !isSafeRtdbKey(query.ownerId)) {
    throw new MaterialSummaryContractError('Owned material query requires ownerId.');
  }

  const normalizedQuery = query.scope === 'owned'
    ? { ...query, ownerId: query.ownerId.trim() }
    : query;
  const value = await reader.read(queryPath(normalizedQuery));
  if (value === null || value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    throw new MaterialSummaryContractError(
      'Material summary index returned a non-object payload.',
    );
  }

  const summaries = Object.values(value).map((candidate) => {
    const compatibleCandidate = normalizeReadingV2DeliveryMetadataForRead(candidate);
    assertMaterialSummary(compatibleCandidate);
    return normalizeMaterialSummary(compatibleCandidate);
  });

  const invalidScopeRow = summaries.find((summary) =>
    summary.lifecycleState !== 'active' ||
    (
      normalizedQuery.scope === 'owned'
        ? summary.ownerId !== normalizedQuery.ownerId
        : summary.visibility !== 'public'
    ));
  if (invalidScopeRow) {
    throw new MaterialSummaryContractError(
      `Material summary index contains an invalid ${query.scope} row.`,
    );
  }

  return summaries.sort((left, right) => {
    const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
    return updatedOrder !== 0
      ? updatedOrder
      : left.materialId.localeCompare(right.materialId);
  });
};
