import type { TestType } from '../../types/draft.types';
import {
  materialCatalogIds,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';

const LEGACY_TEST_TYPE_TO_MATERIAL_TEST_TYPE_ID: Partial<Record<TestType, MaterialTestTypeId>> = {
  IELTS: materialCatalogIds.testTypeId('ielts'),
  TOEIC: materialCatalogIds.testTypeId('toeic'),
  'THCS-THPT': materialCatalogIds.testTypeId('thcs'),
};

const MATERIAL_TEST_TYPE_ID_TO_LEGACY_LABEL: Readonly<Record<string, string>> = {
  ielts: 'IELTS',
  toeic: 'TOEIC',
  thcs: 'THCS-THPT',
  thpt: 'THCS-THPT',
};

export const resolveMaterialTestTypeIdsFromLegacyTestType = (
  testType: TestType | string | null | undefined,
): readonly MaterialTestTypeId[] => {
  if (!testType) {
    return [];
  }

  const normalized = testType.trim().toUpperCase();
  const materialTestTypeId =
    LEGACY_TEST_TYPE_TO_MATERIAL_TEST_TYPE_ID[normalized as TestType];

  return materialTestTypeId ? [materialTestTypeId] : [];
};

export const resolveLegacyTestTypeLabelFromMaterialTestTypeIds = (
  testTypeIds: readonly (MaterialTestTypeId | string | undefined)[] | null | undefined,
  fallback = 'IELTS',
): string => {
  const firstKnownId = (testTypeIds ?? [])
    .map((testTypeId) => testTypeId?.trim().toLowerCase())
    .find((testTypeId): testTypeId is string => Boolean(testTypeId));

  if (!firstKnownId) {
    return fallback;
  }

  return MATERIAL_TEST_TYPE_ID_TO_LEGACY_LABEL[firstKnownId] ?? firstKnownId.toUpperCase();
};
