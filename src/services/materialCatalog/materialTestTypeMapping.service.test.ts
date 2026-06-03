import { describe, expect, it } from 'vitest';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import {
  resolveLegacyTestTypeLabelFromMaterialTestTypeIds,
  resolveMaterialTestTypeIdsFromLegacyTestType,
} from './materialTestTypeMapping.service';

describe('materialTestTypeMapping.service', () => {
  it('maps legacy Test Creation Modal test types into Material Catalog ids', () => {
    expect(resolveMaterialTestTypeIdsFromLegacyTestType('IELTS')).toEqual(['ielts']);
    expect(resolveMaterialTestTypeIdsFromLegacyTestType('TOEIC')).toEqual(['toeic']);
    expect(resolveMaterialTestTypeIdsFromLegacyTestType('THCS-THPT')).toEqual(['thcs']);
  });

  it('maps Material Catalog ids back to legacy labels for compatibility markers', () => {
    expect(resolveLegacyTestTypeLabelFromMaterialTestTypeIds([
      materialCatalogIds.testTypeId('ielts'),
    ])).toBe('IELTS');
    expect(resolveLegacyTestTypeLabelFromMaterialTestTypeIds([
      materialCatalogIds.testTypeId('toeic'),
    ])).toBe('TOEIC');
    expect(resolveLegacyTestTypeLabelFromMaterialTestTypeIds([
      materialCatalogIds.testTypeId('toefl'),
    ])).toBe('TOEFL');
  });
});
