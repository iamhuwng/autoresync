import {
  materialCatalogIds,
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import { materialCatalogPaths } from './materialCatalogPaths';

export interface MaterialCatalogAdminContext {
  readonly uid: string;
  readonly role: string;
  readonly now?: () => string;
}

export interface MaterialTestTypeConfigRepository {
  readonly listTestTypes: () => Promise<readonly MaterialTestTypeConfig[]>;
  readonly writeTestType: (config: MaterialTestTypeConfig) => Promise<void>;
  readonly deleteTestType?: (testTypeId: MaterialTestTypeId) => Promise<void>;
}

export interface MaterialCatalogRtdbAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
}

export type MaterialTestTypeConfigUpdate = Partial<
  Omit<MaterialTestTypeConfig, 'testTypeId' | 'createdAt' | 'createdBy'>
>;

const DEFAULT_TEST_TYPE_SEED_TIMESTAMP = '2026-06-01T00:00:00.000Z';

const defaultAllowedMaterialKinds: readonly MaterialCatalogMaterialKind[] = [
  'full-test',
  'reading-passage',
  'book',
];

const createDefaultTestType = (input: {
  readonly id: string;
  readonly canonicalKey: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly aliases?: readonly string[];
  readonly displayOrder: number;
  readonly defaultPinnedRank?: number | null;
  readonly readingSourceOrderLabel: string;
  readonly readingSourceOrderLabelPlural: string;
  readonly colorToken: string;
  readonly iconToken: string;
}): MaterialTestTypeConfig => ({
  testTypeId: materialCatalogIds.testTypeId(input.id),
  canonicalKey: input.canonicalKey,
  label: input.label,
  shortLabel: input.shortLabel,
  aliases: input.aliases ?? [],
  active: true,
  teacherSelectable: true,
  displayOrder: input.displayOrder,
  defaultPinnedRank: input.defaultPinnedRank ?? null,
  readingSourceOrderLabel: input.readingSourceOrderLabel,
  readingSourceOrderLabelPlural: input.readingSourceOrderLabelPlural,
  logoUrl: `/assets/material-test-types/${input.id}.svg`,
  logoAlt: `${input.label} logo`,
  colorToken: input.colorToken,
  iconToken: input.iconToken,
  allowedMaterialKinds: defaultAllowedMaterialKinds,
  createdAt: DEFAULT_TEST_TYPE_SEED_TIMESTAMP,
  updatedAt: DEFAULT_TEST_TYPE_SEED_TIMESTAMP,
  updatedBy: 'system',
});

export const DEFAULT_MATERIAL_TEST_TYPES: readonly MaterialTestTypeConfig[] = [
  createDefaultTestType({
    id: 'ielts',
    canonicalKey: 'IELTS',
    label: 'IELTS',
    shortLabel: 'IELTS',
    displayOrder: 1,
    defaultPinnedRank: 1,
    readingSourceOrderLabel: 'Passage',
    readingSourceOrderLabelPlural: 'Passages',
    colorToken: 'blue',
    iconToken: 'globe',
  }),
  createDefaultTestType({
    id: 'toeic',
    canonicalKey: 'TOEIC',
    label: 'TOEIC',
    shortLabel: 'TOEIC',
    displayOrder: 2,
    defaultPinnedRank: 2,
    readingSourceOrderLabel: 'Part',
    readingSourceOrderLabelPlural: 'Parts',
    colorToken: 'emerald',
    iconToken: 'headphones',
  }),
  createDefaultTestType({
    id: 'toefl',
    canonicalKey: 'TOEFL',
    label: 'TOEFL',
    shortLabel: 'TOEFL',
    aliases: ['TOFEL'],
    displayOrder: 3,
    defaultPinnedRank: 3,
    readingSourceOrderLabel: 'Passage',
    readingSourceOrderLabelPlural: 'Passages',
    colorToken: 'indigo',
    iconToken: 'book-open',
  }),
  createDefaultTestType({
    id: 'thcs',
    canonicalKey: 'THCS',
    label: 'THCS',
    shortLabel: 'THCS',
    displayOrder: 4,
    defaultPinnedRank: 4,
    readingSourceOrderLabel: 'Section',
    readingSourceOrderLabelPlural: 'Sections',
    colorToken: 'amber',
    iconToken: 'school',
  }),
  createDefaultTestType({
    id: 'thpt',
    canonicalKey: 'THPT',
    label: 'THPT',
    shortLabel: 'THPT',
    displayOrder: 5,
    readingSourceOrderLabel: 'Section',
    readingSourceOrderLabelPlural: 'Sections',
    colorToken: 'rose',
    iconToken: 'graduation-cap',
  }),
  createDefaultTestType({
    id: 'cefr',
    canonicalKey: 'CEFR',
    label: 'CEFR',
    shortLabel: 'CEFR',
    aliases: ['CELF'],
    displayOrder: 6,
    readingSourceOrderLabel: 'Unit',
    readingSourceOrderLabelPlural: 'Units',
    colorToken: 'violet',
    iconToken: 'languages',
  }),
] as const;

const cloneTestType = (config: MaterialTestTypeConfig): MaterialTestTypeConfig => ({
  ...config,
  aliases: [...config.aliases],
  allowedMaterialKinds: [...config.allowedMaterialKinds],
});

const isMaterialTestTypeConfig = (value: unknown): value is MaterialTestTypeConfig =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'testTypeId' in value &&
      'canonicalKey' in value &&
      'label' in value,
  );

const readTestTypeMap = (value: unknown): MaterialTestTypeConfig[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value as Record<string, unknown>)
    .filter(isMaterialTestTypeConfig)
    .map(cloneTestType);
};

export const createMaterialTestTypeConfigRepository = (
  adapter: MaterialCatalogRtdbAdapter,
): MaterialTestTypeConfigRepository => ({
  listTestTypes: async () => readTestTypeMap(await adapter.read('material_catalog/test_types')),
  writeTestType: async (config) => {
    await adapter.write(materialCatalogPaths.testTypes(config.testTypeId), cloneTestType(config));
  },
});

const normalizeToken = (value: string): string => value.trim().replace(/\s+/g, ' ').toUpperCase();

const getTimestamp = (context: MaterialCatalogAdminContext): string =>
  context.now?.() ?? new Date().toISOString();

const loadTestTypes = async (
  repository?: MaterialTestTypeConfigRepository,
): Promise<readonly MaterialTestTypeConfig[]> => {
  const records = repository ? await repository.listTestTypes() : DEFAULT_MATERIAL_TEST_TYPES;

  return records.map(cloneTestType);
};

export const sortMaterialTestTypesByDisplayOrder = (
  configs: readonly MaterialTestTypeConfig[],
): MaterialTestTypeConfig[] =>
  [...configs].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder ||
      left.label.localeCompare(right.label) ||
      left.canonicalKey.localeCompare(right.canonicalKey),
  );

export const normalizeTestTypeLabel = (
  value: string,
  configs: readonly MaterialTestTypeConfig[] = DEFAULT_MATERIAL_TEST_TYPES,
): string => {
  const normalized = normalizeToken(value);

  if (normalized.length === 0) {
    return '';
  }

  const match = configs.find((config) => {
    const tokens = [config.canonicalKey, config.label, config.shortLabel, ...config.aliases].map(
      normalizeToken,
    );

    return tokens.includes(normalized);
  });

  return match?.canonicalKey ?? normalized;
};

export const listActiveTestTypes = async (
  repository?: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig[]> =>
  sortMaterialTestTypesByDisplayOrder((await loadTestTypes(repository)).filter((config) => config.active));

export const listTeacherSelectableTestTypes = async (
  repository?: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig[]> =>
  (await listActiveTestTypes(repository)).filter((config) => config.teacherSelectable);

export const getTestTypeById = async (
  testTypeId: MaterialTestTypeId,
  repository?: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig | null> => {
  const records = await loadTestTypes(repository);
  const found = records.find((config) => config.testTypeId === testTypeId);

  return found ? cloneTestType(found) : null;
};

const requiredFieldLabels: ReadonlyArray<readonly [keyof MaterialTestTypeConfig, string]> = [
  ['canonicalKey', 'canonicalKey'],
  ['label', 'label'],
  ['shortLabel', 'shortLabel'],
  ['readingSourceOrderLabel', 'readingSourceOrderLabel'],
  ['readingSourceOrderLabelPlural', 'readingSourceOrderLabelPlural'],
  ['logoAlt', 'logoAlt'],
];

const isAllowedLogoUrl = (logoUrl: string | undefined): boolean => {
  const value = logoUrl?.trim() ?? '';

  return (
    value.length === 0 ||
    value.startsWith('/') ||
    /^https?:\/\//i.test(value)
  );
};

const getAliasCollisionTokens = (config: MaterialTestTypeConfig): Set<string> =>
  new Set(config.aliases.map(normalizeToken).filter(Boolean));

const getActiveLookupTokens = (config: MaterialTestTypeConfig): Set<string> =>
  new Set([config.canonicalKey, config.label, config.shortLabel, ...config.aliases].map(normalizeToken));

export const validateMaterialTestTypeConfig = (
  config: MaterialTestTypeConfig,
  existingConfigs: readonly MaterialTestTypeConfig[] = [],
): string[] => {
  const errors: string[] = [];

  requiredFieldLabels.forEach(([field, label]) => {
    const value = config[field];

    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${label} is required`);
    }
  });

  if (!isAllowedLogoUrl(config.logoUrl)) {
    errors.push('logoUrl must be empty, an absolute URL, or an app asset path');
  }

  if (!Number.isFinite(config.displayOrder)) {
    errors.push('displayOrder must be a finite number');
  }

  const aliasTokens = getAliasCollisionTokens(config);
  const hasCollision = existingConfigs
    .filter((existing) => existing.active && existing.testTypeId !== config.testTypeId)
    .some((existing) => {
      const existingTokens = getActiveLookupTokens(existing);

      return [...aliasTokens].some((aliasToken) => existingTokens.has(aliasToken));
    });

  if (hasCollision) {
    errors.push('aliases must not collide with another active Test Type');
  }

  return errors;
};

const assertValidConfig = (
  config: MaterialTestTypeConfig,
  existingConfigs: readonly MaterialTestTypeConfig[],
): void => {
  const errors = validateMaterialTestTypeConfig(config, existingConfigs);

  if (errors.length > 0) {
    throw new Error(`Invalid Test Type config: ${errors.join('; ')}`);
  }
};

const assertSuperAdmin = (context: MaterialCatalogAdminContext): void => {
  if (context.role !== 'super_admin') {
    throw new Error('Only super_admin can write Test Type configuration.');
  }
};

export const createTestType = async (
  config: MaterialTestTypeConfig,
  context: MaterialCatalogAdminContext,
  repository: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig> => {
  assertSuperAdmin(context);

  const existing = await loadTestTypes(repository);

  if (existing.some((record) => record.testTypeId === config.testTypeId)) {
    throw new Error(`Test Type already exists: ${config.testTypeId}`);
  }

  const now = getTimestamp(context);
  const next = {
    ...cloneTestType(config),
    createdAt: config.createdAt || now,
    updatedAt: now,
    updatedBy: context.uid,
  };

  assertValidConfig(next, existing);
  await repository.writeTestType(next);

  return cloneTestType(next);
};

export const updateTestType = async (
  testTypeId: MaterialTestTypeId,
  updates: MaterialTestTypeConfigUpdate,
  context: MaterialCatalogAdminContext,
  repository: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig> => {
  assertSuperAdmin(context);

  const existing = await loadTestTypes(repository);
  const current = existing.find((record) => record.testTypeId === testTypeId);

  if (!current) {
    throw new Error(`Test Type not found: ${testTypeId}`);
  }

  const next = {
    ...current,
    ...updates,
    updatedAt: getTimestamp(context),
    updatedBy: context.uid,
  };

  assertValidConfig(next, existing);
  await repository.writeTestType(next);

  return cloneTestType(next);
};

export const deactivateTestType = async (
  testTypeId: MaterialTestTypeId,
  context: MaterialCatalogAdminContext,
  repository: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig> =>
  updateTestType(testTypeId, { active: false }, context, repository);

export const setDefaultPinnedTestTypes = async (
  testTypeIds: readonly MaterialTestTypeId[],
  context: MaterialCatalogAdminContext,
  repository: MaterialTestTypeConfigRepository,
): Promise<MaterialTestTypeConfig[]> => {
  assertSuperAdmin(context);

  if (testTypeIds.length !== 4 || new Set(testTypeIds).size !== 4) {
    throw new Error('Default pinned Test Types must include exactly 4 unique ids.');
  }

  const existing = await loadTestTypes(repository);
  const activeIds = new Set(existing.filter((config) => config.active).map((config) => config.testTypeId));
  const allIdsAreActive = testTypeIds.every((testTypeId) => activeIds.has(testTypeId));

  if (!allIdsAreActive) {
    throw new Error('Default pinned Test Types must reference real active Test Type records.');
  }

  const rankById = new Map(testTypeIds.map((testTypeId, index) => [testTypeId, index + 1]));
  const now = getTimestamp(context);
  const updates = sortMaterialTestTypesByDisplayOrder(existing).map((config) => ({
    ...config,
    defaultPinnedRank: rankById.get(config.testTypeId) ?? null,
    updatedAt: now,
    updatedBy: context.uid,
  }));

  await Promise.all(updates.map((config) => repository.writeTestType(config)));

  return updates.map(cloneTestType);
};
