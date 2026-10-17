import { describe, expect, it } from 'vitest';
import { activateDirectCourseEnrollment, canIssueCourseBookAuthority } from './courseBookMigration.service';
describe('Course Book bounded activation', () => {
  it('activates one direct row and excludes class/rollback recovery', () => {
    expect(activateDirectCourseEnrollment({ row: { id: 'legacy-1', courseId: 'course-1', studentId: 'student-1', enrollmentType: 'individual', status: 'active' }, operationId: 'op-1', enabled: true })).toMatchObject({ legacyEnrollmentId: 'legacy-1', revision: 1 });
    expect(() => activateDirectCourseEnrollment({ row: { id: 'legacy-1', courseId: 'course-1', studentId: 'student-1', enrollmentType: 'class-based', status: 'active' }, operationId: 'op-1', enabled: true })).toThrow('ineligible');
    expect(canIssueCourseBookAuthority({ enabled: true, rollback: true, restoreInProgress: false })).toBe(false);
  });
});
