export type LegacyCourseEnrollment = Readonly<{ id: string; courseId: string; studentId: string; enrollmentType: 'individual' | 'public' | 'class-based'; status: 'active' | 'expired' | 'completed'; revision?: number }>;
export type CourseBookActivation = Readonly<{ courseId: string; studentId: string; legacyEnrollmentId: string; revision: number; status: 'active' | 'revoked'; operationId: string }>;

/** Explicit direct-Course-only activation; Class rows are never migrated. */
export const activateDirectCourseEnrollment = (input: { row: LegacyCourseEnrollment; existing?: CourseBookActivation; operationId: string; enabled: boolean; restoreInProgress?: boolean }): CourseBookActivation => {
  if (!input.enabled || input.restoreInProgress) throw new Error('course_book_activation_disabled');
  const row = input.row;
  if (row.enrollmentType === 'class-based' || row.status !== 'active') throw new Error('course_book_activation_ineligible');
  const next: CourseBookActivation = { courseId: row.courseId, studentId: row.studentId, legacyEnrollmentId: row.id, revision: (input.existing?.revision ?? 0) + 1, status: 'active', operationId: input.operationId };
  if (input.existing && input.existing.legacyEnrollmentId !== row.id) throw new Error('course_book_activation_conflict');
  return Object.freeze(next);
};

/** Rollback is deny-only: no records are removed or rewritten. */
export const canIssueCourseBookAuthority = (input: { enabled: boolean; rollback: boolean; restoreInProgress: boolean }): boolean => input.enabled && !input.rollback && !input.restoreInProgress;
