import { describe, expect, it } from 'vitest';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';
import { InMemoryCourseBookPlacementRepository } from './courseBookPlacement.service';
import { createCourseBookDeliveryAdapter } from './courseBookDelivery.adapter';
import { makeBookDeliveryTestBinding } from '../../../cloudflare/test/book-delivery.fixture';

describe('Course Book Delivery adapter', () => {
  it('issues and resolves only the exact scoped course material binding', async () => {
    const pins = { bookId: 'book-pdf-1', publicationId: 'publication-1', manifestVersionId: 'manifest-1', unitStableKey: 'unit-1', unitVersionId: 'unit-1', sourceVersionId: 'source-v1', activityId: 'activity-1', activityVersionId: 'activity-1-v1', bindingRevision: 'binding-v1' };
    const placement = { courseMaterialId: 'course-material-1', courseId: 'course-1', moduleId: 'module-1', ownerId: 'teacher-1', bindingId: 'placement-binding', placementRevision: 1, completionAggregationPolicy: 'all-activities' as const, status: 'active' as const, pins };
    const placements = new InMemoryCourseBookPlacementRepository(new Map([[placement.courseMaterialId, placement]]));
    const delivery = new InMemoryBookDeliveryRepository();
    const binding = { ...makeBookDeliveryTestBinding(), bindingId: 'course-binding-1', context: { kind: 'course' as const, contextId: placement.courseMaterialId, recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'enrollment' as const }, recipient: { recipientId: 'student-1', recipientKind: 'student' as const }, status: 'draft' as const };
    const adapter = createCourseBookDeliveryAdapter({ placements, delivery, now: () => '2026-08-05T00:00:00.000Z' });
    await adapter.issue({ placement, binding, operationId: '00000000-0000-4000-8000-000000000100' });
    expect((await adapter.resolve({ studentId: 'student-1', courseMaterialId: placement.courseMaterialId, placement })).record.binding.bindingId).toBe('course-binding-1');
    await expect(adapter.resolve({ studentId: 'student-2', courseMaterialId: placement.courseMaterialId, placement })).rejects.toThrow('course_book_delivery_denied');
  });
});
