import {
  MATERIAL_CATALOG_MATERIAL_KINDS,
  materialCatalogIds,
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import { MATERIAL_KIND_TAXONOMY_REGISTRY } from './materialIntegrationRegistry';
import {
  MATERIAL_SUMMARY_SCHEMA_VERSION,
  MaterialSummaryContractError,
  type MaterialSummary,
} from './materialSummaryPort.service';

export type LegacyTestRecord = Readonly<Record<string, unknown>>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const nonEmpty = (value: unknown): string | undefined => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
};

const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => nonEmpty(entry) ?? []);
  }
  const single = nonEmpty(value);
  return single ? [single] : [];
};

const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)];

const timestamp = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const text = nonEmpty(value);
  if (text) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
  }
  throw new MaterialSummaryContractError(
    'Legacy test summary requires updatedAt or createdAt.',
  );
};

const testTypeId = (value: string): MaterialTestTypeId => {
  const aliases: Record<string, string> = {
    'thcs-thpt': 'thcs-thpt',
    thcs: 'thcs-thpt',
    thpt: 'thcs-thpt',
    ielts: 'ielts',
    toeic: 'toeic',
  };
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return materialCatalogIds.testTypeId(aliases[normalized] ?? normalized);
};

const supportedKind = (value: unknown): MaterialCatalogMaterialKind | undefined =>
  typeof value === 'string' &&
  (MATERIAL_CATALOG_MATERIAL_KINDS as readonly string[]).includes(value)
    ? value as MaterialCatalogMaterialKind
    : undefined;

const classify = (test: LegacyTestRecord): {
  readonly producerId: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly skillId?: string;
} => {
  const skill = (
    nonEmpty(test.skill) ??
    nonEmpty(record(test.metadata).skill) ??
    ''
  ).toLowerCase();
  const type = (
    nonEmpty(test.testType) ??
    nonEmpty(test.type) ??
    ''
  ).toLowerCase();

  if (type === 'thcs-thpt' || skill === 'thcs' || skill === 'thpt') {
    return {
      producerId: 'thcs-thpt',
      materialKind: 'thcs-thpt-test',
      skillId: 'thcs',
    };
  }
  if (skill === 'writing') {
    return {
      producerId: 'writing',
      materialKind: 'writing-prompt',
      skillId: 'writing',
    };
  }
  if (skill === 'listening') {
    return {
      producerId: 'listening',
      materialKind: 'listening-part',
      skillId: 'listening',
    };
  }

  const materialKind = supportedKind(test.materialKind) ?? 'full-test';
  return {
    producerId: 'generic-test',
    materialKind,
    skillId: skill || undefined,
  };
};

const questionCount = (test: LegacyTestRecord): number | undefined => {
  if (typeof test.questionCount === 'number' && test.questionCount >= 0) {
    return test.questionCount;
  }
  return Array.isArray(test.questions) ? test.questions.length : undefined;
};

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

export const createLegacyTestMaterialSummary = (
  materialIdInput: string,
  testInput: Readonly<object>,
  lifecycleState?: MaterialSummary['lifecycleState'],
): MaterialSummary => {
  const test = record(testInput);
  const materialId = materialIdInput.trim();
  const ownerId = (
    nonEmpty(test.ownerId) ??
    nonEmpty(test.createdBy) ??
    ''
  );
  const metadata = record(test.metadata);
  const title = (
    nonEmpty(test.title) ??
    nonEmpty(metadata.title) ??
    ''
  );
  if (!materialId || !ownerId || !title) {
    throw new MaterialSummaryContractError(
      'Legacy test summary requires materialId, ownerId, and title.',
    );
  }

  const classification = classify(test);
  const rawTestTypeIds = unique([
    ...stringArray(test.primaryTestTypeId),
    ...stringArray(test.testTypeIds),
    ...stringArray(test.testType),
    ...stringArray(test.type),
  ]).map(testTypeId);
  const resolvedTestTypeIds = rawTestTypeIds.length > 0
    ? rawTestTypeIds
    : [materialCatalogIds.testTypeId('custom')];
  const rawTags = unique(stringArray(metadata.tags));
  const state = nonEmpty(test.state)?.toLowerCase();
  const resolvedLifecycle = lifecycleState ??
    (state === 'archived' ? 'archived' : state === 'removed' ? 'removed' : 'active');
  const taxonomy = MATERIAL_KIND_TAXONOMY_REGISTRY[classification.materialKind];
  const requestedPublic = test.isPublic === true || test.visibility === 'public';

  return withoutUndefined({
    schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
    materialId,
    producerId: classification.producerId,
    materialKind: classification.materialKind,
    surfaceFamily: taxonomy.surfaceFamily,
    ownerId,
    title,
    description: nonEmpty(test.description) ?? nonEmpty(metadata.description),
    visibility: requestedPublic && taxonomy.publicEligible ? 'public' : 'private',
    lifecycleState: resolvedLifecycle,
    skillId: classification.skillId,
    primaryTestTypeId: resolvedTestTypeIds[0],
    testTypeIds: resolvedTestTypeIds,
    tags: rawTags.length > 0 ? rawTags : [classification.materialKind],
    questionCount: questionCount(test),
    durationMinutes: optionalNumber(test.duration),
    sourceSnapshotVersionId: nonEmpty(test.publishedSnapshotVersionId),
    hasBrokenRefs: typeof test.hasBrokenRefs === 'boolean'
      ? test.hasBrokenRefs
      : undefined,
    brokenRefCount: optionalNumber(test.brokenRefCount),
    updatedAt: timestamp(test.updatedAt ?? test.createdAt),
  }) as unknown as MaterialSummary;
};
