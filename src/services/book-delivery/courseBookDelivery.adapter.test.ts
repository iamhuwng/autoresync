import { describe, expect, it } from 'vitest';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';
import { InMemoryCourseBookPlacementRepository, type CourseBookPlacement } from './courseBookPlacement.service';
import { createCourseBookDeliveryAdapter } from './courseBookDelivery.adapter';
import { makeBookDeliveryTestBinding } from '../../../cloudflare/test/book-delivery.fixture';

const placement: CourseBookPlacement = {
  courseMaterialId: 'course-material-1', courseId: 'course-1', moduleId: 'module-1', ownerId: 'teacher-1',
  displayTitle: 'Unit 1', selection: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
  placementRevision: 1, completionAggregationPolicy: 'all-activities', status: 'active',
  pins: {
    bookId: 'book-pdf-1', publicationId: 'publication-1', publicationRevision: 4,
    manifestVersionId: 'manifest-1', bindingRevision: 1,
    selectedActivities: [{
      placementId: 'placement-1', nodeKey: 'unit-1', unitStableKey: 'unit-1', unitVersionId: 'unit-projection-1',
      activityId: 'activity-1', activityVersionId: 'activity-1-v1', sourceVersionIds: ['source-v1'],
    }],
  },
};

const courseBinding = () => ({
  ...makeBookDeliveryTestBinding(), bindingId: 'course-binding-1',
  context: { kind: 'course' as const, contextId: placement.courseMaterialId, recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'enrollment' as const },
  recipient: { recipientId: 'student-1', recipientKind: 'student' as const }, status: 'draft' as const,
});

describe('Course Book Delivery adapter', () => {
  it('issues and resolves the exact per-student scoped Course binding', async () => {
    const placements = new InMemoryCourseBookPlacementRepository(new Map([[placement.courseMaterialId, placement]]));
    const delivery = new InMemoryBookDeliveryRepository();
    const adapter = createCourseBookDeliveryAdapter({ placements, delivery, now: () => '2026-08-05T00:00:00.000Z' });
    await adapter.issue({
      placement, binding: courseBinding(),
      createOperationId: '00000000-0000-4000-8000-000000000100',
      activateOperationId: '00000000-0000-4000-8000-000000000101',
    });
    expect((await adapter.resolve({ studentId: 'student-1', courseMaterialId: placement.courseMaterialId, placement })).record.binding.bindingId).toBe('course-binding-1');
    await expect(adapter.resolve({ studentId: 'student-2', courseMaterialId: placement.courseMaterialId, placement })).rejects.toThrow('course_book_delivery_denied');
  });

  it('denies a binding whose canonical Activity set differs from placement pins', async () => {
    const placements = new InMemoryCourseBookPlacementRepository(new Map([[placement.courseMaterialId, placement]]));
    const adapter = createCourseBookDeliveryAdapter({ placements, delivery: new InMemoryBookDeliveryRepository(), now: () => '2026-08-05T00:00:00.000Z' });
    await expect(adapter.issue({
      placement: { ...placement, pins: { ...placement.pins, selectedActivities: [{ ...placement.pins.selectedActivities[0]!, activityVersionId: 'activity-other-v1' }] } },
      binding: courseBinding(), createOperationId: '00000000-0000-4000-8000-000000000102',
      activateOperationId: '00000000-0000-4000-8000-000000000103',
    })).rejects.toThrow('course_book_binding_pin_mismatch');
  });
});
