import { BookDeliveryEntitlementLifecycle } from './bookDelivery.entitlementLifecycle';
import type { BookDeliveryBinding } from './bookDelivery.types';
import type { BookDeliveryRepository } from './bookDelivery.entitlement';
import type { CourseBookPlacement, CourseBookPlacementRepository } from './courseBookPlacement.service';

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * #102 bridges Course authority to the canonical scoped Book Delivery
 * lifecycle.  It deliberately has no storage of its own and exposes only the
 * immutable projection consumed later by #104.
 */
export const createCourseBookDeliveryAdapter = (options: {
  readonly placements: CourseBookPlacementRepository;
  readonly delivery: BookDeliveryRepository;
  readonly now: () => string;
}) => {
  const lifecycle = new BookDeliveryEntitlementLifecycle({
    repository: options.delivery,
    adapterContexts: ['course'],
    authorizeIssuer: (binding) => binding.issuer.authorityBoundary === 'book-owner'
      && binding.context.kind === 'course'
      && binding.context.ownerId === binding.issuer.ownerId,
    authorizeRecipient: (studentId, courseMaterialId) => {
      const placement = options.placements.read(courseMaterialId);
      return Boolean(placement && placement.status === 'active' && studentId.length > 0);
    },
  });

  const placementFor = (courseMaterialId: string): CourseBookPlacement => {
    const placement = options.placements.read(courseMaterialId);
    if (!placement || placement.status !== 'active') throw new Error('course_book_placement_not_active');
    return placement;
  };

  return {
    async issue(input: { readonly placement: CourseBookPlacement; readonly binding: BookDeliveryBinding; readonly operationId: string }) {
      const { placement, binding } = input;
      if (placement.status !== 'active'
        || binding.context.kind !== 'course'
        || binding.context.contextId !== placement.courseMaterialId
        || binding.context.ownerId !== placement.ownerId
        || binding.book.bookId !== placement.pins.bookId
        || binding.book.publicationId !== placement.pins.publicationId
        || binding.book.publicationRevision < 1
        || binding.placements.some((item) => item.activityId !== placement.pins.activityId
          || item.activityVersionId !== placement.pins.activityVersionId)) {
        throw new Error('course_book_binding_pin_mismatch');
      }
      const draft = await lifecycle.createDraft(binding, input.operationId, options.now());
      if (!['created', 'replayed'].includes(draft.status)) return draft;
      return lifecycle.activate(binding.bindingId, 0, input.operationId.replace(/.$/u, '1'), options.now());
    },

    async resolve(input: { readonly studentId: string; readonly courseMaterialId: string; readonly placement: CourseBookPlacement }) {
      const placement = placementFor(input.courseMaterialId);
      if (!equal(placement, input.placement)) throw new Error('course_book_placement_stale');
      const entitlement = await lifecycle.resolve(input.studentId, placement.courseMaterialId);
      if (!entitlement || entitlement.record.binding.context.kind !== 'course'
        || entitlement.record.binding.context.contextId !== placement.courseMaterialId
        || entitlement.record.binding.book.bookId !== placement.pins.bookId
        || entitlement.record.binding.book.publicationId !== placement.pins.publicationId
        || entitlement.record.binding.placements.some((item) => item.activityId !== placement.pins.activityId
          || item.activityVersionId !== placement.pins.activityVersionId)) {
        throw new Error('course_book_delivery_denied');
      }
      return entitlement;
    },

    async revoke(input: { readonly courseMaterialId: string; readonly bindingId: string; readonly expectedRecordRevision: number; readonly operationId: string }) {
      const placement = placementFor(input.courseMaterialId);
      const record = await options.delivery.readBinding(input.bindingId);
      if (!record || record.binding.context.kind !== 'course'
        || record.binding.context.contextId !== placement.courseMaterialId) throw new Error('course_book_delivery_denied');
      return lifecycle.revoke(input.bindingId, input.expectedRecordRevision, input.bindingId, input.operationId, options.now());
    },
  };
};
