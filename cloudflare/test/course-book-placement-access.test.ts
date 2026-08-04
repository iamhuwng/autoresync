import { describe, expect, it } from 'vitest';
import {
  deriveDirectCourseModuleRelease,
  requireActiveDirectCourseEnrollment,
} from '../src/upload-worker/course-book-placement/access.ts';

describe('#102 direct-Course access facts', () => {
  it('accepts only the exact active non-expired direct-Course legacy row', () => {
    expect(requireActiveDirectCourseEnrollment({
      legacyEnrollmentId: 'legacy-001', courseId: 'course-001', studentId: 'student-001', now: 1_000,
      value: { courseId: 'course-001', studentId: 'student-001', enrollmentType: 'individual', status: 'active', expiresAt: 2_000, revision: 3 },
    })).toMatchObject({ legacyEnrollmentId: 'legacy-001', revision: 3, expiresAt: 2_000 });
    expect(() => requireActiveDirectCourseEnrollment({
      legacyEnrollmentId: 'legacy-001', courseId: 'course-001', studentId: 'student-001', now: 1_000,
      value: { courseId: 'course-001', studentId: 'student-001', enrollmentType: 'class-based', status: 'active', expiresAt: 2_000 },
    })).toThrow('course_enrollment_not_direct_course');
    expect(() => requireActiveDirectCourseEnrollment({
      legacyEnrollmentId: 'legacy-001', courseId: 'course-001', studentId: 'student-001', now: 2_000,
      value: { courseId: 'course-001', studentId: 'student-001', enrollmentType: 'public', status: 'active', expiresAt: 2_000 },
    })).toThrow('course_enrollment_expired');
  });

  it('derives open and sequential release from exact module order and progress', () => {
    const open = { id: 'module-001', courseId: 'course-001', order: 0, accessType: 'open' };
    expect(deriveDirectCourseModuleRelease({
      courseId: 'course-001', moduleId: 'module-001', module: open,
      courseModules: { 'module-001': open }, progress: null,
    })).toBe(true);
    const sequential = { id: 'module-002', courseId: 'course-001', order: 1, accessType: 'sequential' };
    const courseModules = { 'module-001': open, 'module-002': sequential };
    expect(deriveDirectCourseModuleRelease({
      courseId: 'course-001', moduleId: 'module-002', module: sequential,
      courseModules, progress: { completedModules: { 'module-001': { completedAt: 1 } } },
    })).toBe(true);
    expect(deriveDirectCourseModuleRelease({
      courseId: 'course-001', moduleId: 'module-002', module: sequential,
      courseModules, progress: { completedModules: {} },
    })).toBe(false);
  });
});
