import { BookDeliveryEntitlementLifecycle } from './bookDelivery.entitlementLifecycle';
import type { BookDeliveryBinding } from './bookDelivery.types';
import type { BookDeliveryRepository } from './bookDelivery.entitlement';
import type { CourseBookPlacement, CourseBookPlacementRepository } from './courseBookPlacement.service';

const equalSet = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])
);

const matchesPlacement = (binding: BookDeliveryBinding, placement: CourseBookPlacement): boolean => {
  if (binding.context.kind !== 'course' || binding.context.contextId !== placement.courseMaterialId
    || binding.context.ownerId !== placement.ownerId || binding.book.bookId !== placement.pins.bookId
    || binding.book.publicationId !== placement.pins.publicationId
    || binding.book.publicationRevision !== placement.pins.publicationRevision
    || binding.revision !== placement.pins.bindingRevision || binding.scope.kind !== placement.selection.kind
    || !equalSet(binding.scope.nodeKeys, placement.selection.nodeKeys)
    || !equalSet(binding.scope.placementIds, placement.selection.placementIds)) return false;
  const expected = new Map(placement.pins.selectedActivities.map((pin) => [pin.placementId, pin]));
  if (binding.placements.length !== expected.size) return false;
  for (const item of binding.placements) {
    const pin = expected.get(item.placementId);
    if (!pin || item.nodeKey !== pin.nodeKey || item.activityId !== pin.activityId
      || item.activityVersionId !== pin.activityVersionId) return false;
  }
  const sourceVersions = binding.sourceSet.sources.map((source) => source.sourceVersionId);
  return placement.pins.selectedActivities.every((pin) => pin.sourceVersionIds.every((version) => sourceVersions.includes(version)));
};

/** Bridges Course authority to the one canonical scoped Book Delivery lifecycle. */
export const createCourseBookDeliveryAdapter = (options: {
  readonly placements: CourseBookPlacementRepository;
  readonly delivery: BookDeliveryRepository;
  readonly now: () => string;
}) => {
  const lifecycle = new BookDeliveryEntitlementLifecycle({
    repository: options.delivery,
    adapterContexts: ['course'],
    authorizeIssuer: (binding) => binding.issuer.authorityBoundary === 'book-owner'
      && binding.context.kind === 'course' && binding.context.ownerId === binding.issuer.ownerId,
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
    async issue(input: { placement: CourseBookPlacement; binding: BookDeliveryBinding; createOperationId: string; activateOperationId: string }) {
      if (input.placement.status !== 'active' || !matchesPlacement(input.binding, input.placement)) {
        throw new Error('course_book_binding_pin_mismatch');
      }
      const draft = await lifecycle.createDraft(input.binding, input.createOperationId, options.now());
      if (!['created', 'replayed'].includes(draft.status)) return draft;
      const stored = draft.record ?? await options.delivery.readBinding(input.binding.bindingId);
      if (!stored) throw new Error('course_book_binding_missing_after_create');
      return lifecycle.activate(input.binding.bindingId, stored.recordRevision, input.activateOperationId, options.now());
    },
    async supersede(input: { placement: CourseBookPlacement; binding: BookDeliveryBinding; expectedCurrentBindingId: string; operationId: string }) {
      if (!matchesPlacement(input.binding, input.placement)) throw new Error('course_book_binding_pin_mismatch');
      return lifecycle.supersede(input.binding, input.expectedCurrentBindingId, input.operationId, options.now());
    },
    async resolve(input: { studentId: string; courseMaterialId: string; placement: CourseBookPlacement }) {
      const placement = placementFor(input.courseMaterialId);
      if (JSON.stringify(placement) !== JSON.stringify(input.placement)) throw new Error('course_book_placement_stale');
      const entitlement = await lifecycle.resolve(input.studentId, placement.courseMaterialId);
      if (!entitlement || entitlement.record.binding.recipient.recipientId !== input.studentId
        || !matchesPlacement(entitlement.record.binding, placement)) throw new Error('course_book_delivery_denied');
      return entitlement;
    },
    async revoke(input: { courseMaterialId: string; bindingId: string; expectedRecordRevision: number; operationId: string }) {
      const placement = placementFor(input.courseMaterialId);
      const record = await options.delivery.readBinding(input.bindingId);
      if (!record || !matchesPlacement(record.binding, placement)) throw new Error('course_book_delivery_denied');
      return lifecycle.revoke(input.bindingId, input.expectedRecordRevision, input.bindingId, input.operationId, options.now());
    },
  };
};
