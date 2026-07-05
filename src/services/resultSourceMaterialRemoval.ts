export const ORIGINAL_MATERIAL_REMOVED_LABEL = 'Original material removed';

export const RETAINED_RESULT_SOURCE_REMOVAL_PRESERVED_FIELDS = [
  'resultId',
  'sessionCode',
  'testId',
  'studentId',
  'studentName',
  'testTitle',
  'testType',
  'testSkill',
  'totalScore',
  'maxScore',
  'percentage',
  'bandScore',
  'submittedAt',
  'createdAt',
  'updatedAt',
  'questionResults',
  'correct',
  'incorrect',
  'partialCredit',
  'totalQuestions',
  'context',
  'visibility',
  'courseId',
  'courseName',
  'classId',
  'className',
  'moduleId',
  'moduleName',
  'thcsData',
  'ieltsData',
  'formativeFeedback',
  'feedbackGenerationMeta',
] as const;

export const RETAINED_RESULT_SOURCE_REMOVAL_INDEX_ROOTS = [
  'test_results_by_session',
  'test_results_by_student',
  'test_results_by_teacher',
  'test_results_by_course',
  'test_results_by_class',
  'test_results_solo_practice_by_student',
] as const;

export interface SourceMaterialRemovedFlag {
  sourceMaterialRemoved?: boolean;
}

export type SourceMaterialRemovedResultPatch = Readonly<{
  sourceMaterialRemoved: true;
}>;

export function isSourceMaterialRemovedResult(
  result: SourceMaterialRemovedFlag | null | undefined,
): boolean {
  return result?.sourceMaterialRemoved === true;
}

export function buildSourceMaterialRemovedResultPatch(): SourceMaterialRemovedResultPatch {
  return {
    sourceMaterialRemoved: true,
  };
}
