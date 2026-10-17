import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import { classBookBindingContextId } from '../../../../src/services/book-delivery/classBookPlacement.types.ts';
import type { BookRuntimeSchedulePolicy } from '../book-runtime/authorization.ts';
import type { RepositoryEnv } from '../listening-authoring/rtdb.ts';
import { resolveCurrentClassBookDelivery } from './production.ts';

type Env = RepositoryEnv & Record<string, unknown>;
type Projection = Awaited<ReturnType<typeof resolveCurrentClassBookDelivery>>;

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const bindingMatches = (binding: BookDeliveryBinding, projection: Projection): boolean => {
  if (projection.projectionKind !== 'book-runtime-delivery'
    || projection.bindingId !== binding.bindingId
    || projection.bindingRevision !== binding.revision
    || projection.recipientId !== binding.recipient.recipientId
    || projection.context.kind !== 'class'
    || projection.context.contextId !== binding.context.contextId
    || projection.context.entitlementBasis !== 'membership'
    || projection.book.bookId !== binding.book.bookId
    || projection.book.bookMode !== binding.book.bookMode
    || projection.book.bookRevision !== binding.book.bookRevision
    || projection.book.manifestVersionId !== binding.book.manifestVersionId
    || projection.book.publicationId !== binding.book.publicationId
    || projection.book.publicationRevision !== binding.book.publicationRevision
    || projection.book.publicationStatus !== binding.book.publicationStatus
    || !same(projection.scope, binding.scope)
    || projection.provenance.bindingId !== binding.bindingId
    || projection.provenance.bindingRevision !== binding.revision
    || projection.provenance.publicationId !== binding.book.publicationId
    || projection.provenance.publicationRevision !== binding.book.publicationRevision
    || projection.activities.length !== binding.placements.length) return false;
  const combined = binding.sourceSet.strategy === 'component_pdfs'
    && projection.sourceSet.sources.length === 0
    && projection.documentRequests.length === 1
    && 'expectedByteLength' in projection.documentRequests[0]!;
  if (projection.sourceSet.strategy !== binding.sourceSet.strategy
    || (!combined && !same(projection.sourceSet, binding.sourceSet))) return false;
  return binding.placements.every((placement) => projection.activities.some((activity) => (
    activity.placementId === placement.placementId
    && activity.activityId === placement.activityId
    && activity.activityVersion === placement.activityVersion
    && activity.activityVersionId === placement.activityVersionId
    && activity.nodeKey === placement.nodeKey
    && activity.order === placement.order
    && activity.contextMode === placement.contextMode
    && same(activity.sourceContext.pageGroupKeys, placement.pageGroupKeys)
    && (combined || same(activity.sourceContext.sourcePageScopes, placement.sourcePageScopes))
  )));
};

/** Re-resolves Class placement, copy, membership, lock and publication on each Runtime authorization. */
export const createClassBookRuntimeSchedulePolicy = (env: Env): BookRuntimeSchedulePolicy => ({
  async authorize(input) {
    const binding = input.binding;
    if (binding.context.kind !== 'class') return { outcome: 'denied', code: 'runtime_class_context_invalid' };
    const locator = binding.context.classLocator;
    try {
      if (binding.context.contextId !== classBookBindingContextId(
        locator.classId, locator.copyId, locator.courseMaterialId, locator.classPlacementId,
      )) return { outcome: 'conflict', code: 'runtime_class_locator_stale' };
    } catch {
      return { outcome: 'denied', code: 'runtime_class_locator_invalid' };
    }
    const placement = binding.placements.find((candidate) => (
      candidate.placementId === input.target.placementId
      && candidate.activityId === input.target.activityId
      && candidate.activityVersion === input.target.activityVersion
    ));
    if (!placement) return { outcome: 'denied', code: 'runtime_class_placement_stale' };
    try {
      const current = await resolveCurrentClassBookDelivery(env, {
        classId: locator.classId,
        copyId: locator.copyId,
        classPlacementId: locator.classPlacementId,
        classCourseMaterialId: locator.courseMaterialId,
        studentId: input.actorUid,
        bindingId: binding.bindingId,
      });
      return bindingMatches(binding, current)
        ? { outcome: 'allowed' }
        : { outcome: 'conflict', code: 'runtime_class_delivery_stale' };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      return code === 'class_book_enrollment_denied' || code === 'class_book_locked'
        ? { outcome: 'denied', code: 'runtime_class_membership_denied' }
        : code === 'class_book_delivery_context_denied' || code.includes('placement') || code.includes('publication')
          ? { outcome: 'conflict', code: 'runtime_class_authority_stale' }
          : { outcome: 'unavailable', code: 'runtime_class_authority_unavailable' };
    }
  },
  async revalidate(input) {
    const { previousAuthority: _previousAuthority, ...authorizationInput } = input;
    return this.authorize(authorizationInput);
  },
});
