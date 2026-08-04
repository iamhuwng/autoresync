import { describe, expect, it } from 'vitest';
import {
  CourseBookPlacementError,
  InMemoryCourseBookPlacementRepository,
  InMemoryCourseEnrollmentAuthorityPort,
  createCourseBookPlacementService,
} from './courseBookPlacement.service';

const pins = { bookId: 'book-001', publicationId: 'pub-001', manifestVersionId: 'manifest-v1', unitStableKey: 'unit-key-1', unitVersionId: 'unit-v1', sourceVersionId: 'source-v1', activityId: 'activity-001', activityVersionId: 'activity-v1', bindingRevision: 'binding-v1' };
const publication = { ownerId: 'teacher-001', bookId: pins.bookId, publicationId: pins.publicationId, manifestVersionId: pins.manifestVersionId, lifecycle: 'published' as const };
const placementInput = { actorId: 'teacher-001', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001', courseOwnerId: 'teacher-001', contextOwnerId: 'teacher-001', publication, pins };
const enrollment = { legacyEnrollmentId: 'legacy-001', courseId: 'course-001', studentId: 'student-001', status: 'active' as const, revision: 1, operationId: 'operation-001' };

describe('Course Book placement', () => {
  it('creates and replays one immutable private-owner placement', () => {
    const api = createCourseBookPlacementService(new InMemoryCourseBookPlacementRepository());
    expect(api.place(placementInput).kind).toBe('created');
    expect(api.place(placementInput).kind).toBe('replayed');
    expect(() => api.place({ ...placementInput, pins: { ...pins, sourceVersionId: 'source-v2' } })).toThrow('pin-conflict');
    expect(() => api.place({ ...placementInput, contextOwnerId: 'teacher-002' })).toThrow('forbidden');
    expect(() => api.place({ ...placementInput, publication: { ...publication, ownerId: 'teacher-002' } })).toThrow('forbidden');
  });

  it('uses a bounded direct-Course enrollment authority lifecycle', () => {
    const port = new InMemoryCourseEnrollmentAuthorityPort();
    expect(port.transitionDirectCourseEnrollment(enrollment)).toEqual(enrollment);
    expect(port.transitionDirectCourseEnrollment(enrollment)).toEqual(enrollment);
    expect(() => port.transitionDirectCourseEnrollment({ ...enrollment, revision: 3, operationId: 'operation-002' })).toThrow('enrollment-revision-conflict');
    expect(port.transitionDirectCourseEnrollment({ ...enrollment, status: 'revoked', revision: 2, operationId: 'operation-002' }).status).toBe('revoked');
  });

  it('resolves only the exact active student, Course, module, and accepted immutable pins', () => {
    const api = createCourseBookPlacementService(new InMemoryCourseBookPlacementRepository());
    api.place(placementInput);
    const one = api.resolve({ actorId: 'student-001', studentId: 'student-001', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001', enrollment, moduleReleased: true, publication });
    const two = api.resolve({ actorId: 'student-002', studentId: 'student-002', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001', enrollment: { ...enrollment, studentId: 'student-002' }, moduleReleased: true, publication });
    expect(one.progressKey).not.toBe(two.progressKey);
    expect(one.resultKey).toBe(one.progressKey);
    expect(one.completionAggregationPolicy).toBe('all-activities');
    for (const denial of [
      { courseMaterialId: undefined },
      { courseId: 'course-002' },
      { moduleId: 'module-002' },
      { enrollment: { ...enrollment, status: 'revoked' as const } },
      { enrollment: { ...enrollment, expiresAt: '2020-01-01T00:00:00.000Z' }, gate: { now: '2021-01-01T00:00:00.000Z' } },
      { moduleReleased: false },
      { publication: { ...publication, publicationId: 'pub-002' } },
      { gate: { courseArchived: true } },
    ]) expect(() => api.resolve({ actorId: 'student-001', studentId: 'student-001', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001', enrollment, moduleReleased: true, publication, ...denial })).toThrow(CourseBookPlacementError);
  });

  it('denies new issuance during rollback or restore while preserving historical resolution', () => {
    const api = createCourseBookPlacementService(new InMemoryCourseBookPlacementRepository());
    expect(() => api.place({ ...placementInput, gate: { rollbackEnabled: true } })).toThrow('course-book-writes-disabled');
    api.place(placementInput);
    expect(() => api.revoke({ actorId: 'teacher-001', courseMaterialId: 'course-material-001', gate: { restoreInProgress: true } })).toThrow('course-book-writes-disabled');
    expect(() => api.resolve({ actorId: 'student-001', studentId: 'student-001', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001', enrollment, moduleReleased: true, publication, gate: { restoreInProgress: true } })).toThrow('denied');
  });
});
