import { describe, expect, it } from 'vitest';

import {
  buildSourceMaterialRemovedResultPatch,
  isSourceMaterialRemovedResult,
  ORIGINAL_MATERIAL_REMOVED_LABEL,
  RETAINED_RESULT_SOURCE_REMOVAL_INDEX_ROOTS,
  RETAINED_RESULT_SOURCE_REMOVAL_PRESERVED_FIELDS,
} from './resultSourceMaterialRemoval';

describe('resultSourceMaterialRemoval', () => {
  it('treats only an explicit true marker as removed source material', () => {
    expect(isSourceMaterialRemovedResult({ sourceMaterialRemoved: true })).toBe(true);
    expect(isSourceMaterialRemovedResult({ sourceMaterialRemoved: false })).toBe(false);
    expect(isSourceMaterialRemovedResult({})).toBe(false);
    expect(isSourceMaterialRemovedResult(null)).toBe(false);
  });

  it('builds a narrow purge-facing marker patch without result payload fields', () => {
    expect(buildSourceMaterialRemovedResultPatch()).toEqual({
      sourceMaterialRemoved: true,
    });
    expect(Object.keys(buildSourceMaterialRemovedResultPatch())).toEqual(['sourceMaterialRemoved']);
  });

  it('documents retained result fields and indexes that later purge must preserve', () => {
    expect(ORIGINAL_MATERIAL_REMOVED_LABEL).toBe('Original material removed');
    expect(RETAINED_RESULT_SOURCE_REMOVAL_PRESERVED_FIELDS).toEqual(
      expect.arrayContaining([
        'testTitle',
        'testType',
        'testSkill',
        'totalScore',
        'percentage',
        'bandScore',
        'submittedAt',
        'questionResults',
        'formativeFeedback',
      ]),
    );
    expect(RETAINED_RESULT_SOURCE_REMOVAL_INDEX_ROOTS).toEqual(
      expect.arrayContaining([
        'test_results_by_session',
        'test_results_by_student',
        'test_results_by_teacher',
        'test_results_by_course',
        'test_results_by_class',
      ]),
    );
  });
});
