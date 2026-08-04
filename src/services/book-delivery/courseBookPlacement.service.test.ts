import { describe, expect, it } from 'vitest';
import {
  createCourseBookPlacementService,
  InMemoryCourseBookPlacementRepository,
  type CourseBookPins,
} from './courseBookPlacement.service';

const pins: CourseBookPins = {
  bookId: 'book-001', publicationId: 'publication-001', publicationRevision: 2,
  manifestVersionId: 'manifest-001', bindingRevision: 1,
  selectedActivities: [
    { placementId: 'placement-001', nodeKey: 'unit-001', unitStableKey: 'unit-001', unitVersionId: 'unit-projection-001', activityId: 'activity-001', activityVersionId: 'activity-version-001', sourceVersionIds: ['source-version-001'] },
    { placementId: 'placement-002', nodeKey: 'unit-002', unitStableKey: 'unit-002', unitVersionId: 'unit-projection-002', activityId: 'activity-002', activityVersionId: 'activity-version-002', sourceVersionIds: ['source-version-002'] },
  ],
};
const publication = { ownerId: 'teacher-001', bookId: 'book-001', publicationId: 'publication-001', publicationRevision: 2, manifestVersionId: 'manifest-001', lifecycle: 'published' as const };
const placementInput = {
  actorId: 'teacher-001', courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'course-material-001',
  courseOwnerId: 'teacher-001', contextOwnerId: 'teacher-001', displayTitle: 'Selected units', publication,
  selection: { kind: 'subtree' as const, nodeKeys: ['unit-001'], placementIds: [] as const }, pins,
};

describe('Course Book placement', () => {
  it('places and replays a subtree with multiple exact Activity pins', () => {
    const service = createCourseBookPlacementService(new InMemoryCourseBookPlacementRepository());
    expect(service.place(placementInput)).toMatchObject({ kind: 'created', placement: { displayTitle: 'Selected units' } });
    expect(service.place(placementInput)).toMatchObject({ kind: 'replayed' });
  });

  it('requires an Activity selection to cover the exact selected placement pins', () => {
    const service = createCourseBookPlacementService(new InMemoryCourseBookPlacementRepository());
    expect(() => service.place({
      ...placementInput,
      selection: { kind: 'placements', nodeKeys: [] as const, placementIds: ['placement-001'] },
    })).toThrow('selection-pin-mismatch');
    expect(service.place({
      ...placementInput,
      courseMaterialId: 'course-material-002',
      selection: { kind: 'placements', nodeKeys: [] as const, placementIds: ['placement-001'] },
      pins: { ...pins, selectedActivities: [pins.selectedActivities[0]!] },
    })).toMatchObject({ kind: 'created' });
  });

  it('isolates resolved progress by actual per-student Delivery binding and Activity Version', () => {
    const repository = new InMemoryCourseBookPlacementRepository();
    const service = createCourseBookPlacementService(repository);
    service.place(placementInput);
    const common = {
      actorId: 'student-001', studentId: 'student-001', courseId: 'course-001', moduleId: 'module-001',
      courseMaterialId: 'course-material-001', bindingId: 'binding_student_001', moduleReleased: true, publication,
      enrollment: { legacyEnrollmentId: 'legacy-001', courseId: 'course-001', studentId: 'student-001', status: 'active' as const, revision: 1, operationId: 'operation-001' },
    };
    const resolved = service.resolve(common);
    expect(resolved.context.contextId).toBe('course-material-001');
    expect(resolved.activityKeys).toHaveLength(2);
    expect(resolved.activityKeys[0]?.progressKey).toContain('binding_student_001:student-001:course-material-001:activity-version-001');
    expect(() => service.resolve({ ...common, actorId: 'student-002' })).toThrow('denied');
  });

  it('revokes deny-only and preserves immutable placement history', () => {
    const repository = new InMemoryCourseBookPlacementRepository();
    const service = createCourseBookPlacementService(repository);
    service.place(placementInput);
    const revoked = service.revoke({ actorId: 'teacher-001', courseMaterialId: 'course-material-001' });
    expect(revoked).toMatchObject({ status: 'revoked', placementRevision: 2 });
    expect(service.revoke({ actorId: 'teacher-001', courseMaterialId: 'course-material-001' })).toEqual(revoked);
  });
});
