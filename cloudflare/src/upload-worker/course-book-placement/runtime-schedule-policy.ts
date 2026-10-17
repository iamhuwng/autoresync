import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookRuntimeSchedulePolicy } from '../book-runtime/authorization.ts';
import { resolveCurrentCourseBook } from './production.ts';
import type { RepositoryEnv } from '../listening-authoring/rtdb.ts';

type Env = RepositoryEnv & Record<string, unknown>;

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const bindingMatches = (
  binding: BookDeliveryBinding,
  projection: Awaited<ReturnType<typeof resolveCurrentCourseBook>>,
): boolean => {
  if (projection.projectionKind !== 'book-runtime-delivery'
    || projection.bindingId !== binding.bindingId
    || projection.bindingRevision !== binding.revision
    || projection.recipientId !== binding.recipient.recipientId
    || projection.context.kind !== 'course'
    || projection.context.contextId !== binding.context.contextId
    || projection.context.entitlementBasis !== 'enrollment'
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

/** Re-resolves Course enrollment, release, placement and Delivery authority on each Runtime authorization. */
export const createCourseBookRuntimeSchedulePolicy = (env: Env): BookRuntimeSchedulePolicy => ({
  async authorize(input) {
    const binding = input.binding;
    if (binding.context.kind !== 'course') return { outcome: 'denied', code: 'runtime_course_context_invalid' };
    const placement = binding.placements.find((candidate) => (
      candidate.placementId === input.target.placementId
      && candidate.activityId === input.target.activityId
      && candidate.activityVersion === input.target.activityVersion
    ));
    if (!placement) return { outcome: 'denied', code: 'runtime_course_placement_stale' };
    try {
      const current = await resolveCurrentCourseBook(env, input.actorUid, binding.context.contextId);
      if (!bindingMatches(binding, current)) {
        return { outcome: 'conflict', code: 'runtime_course_delivery_stale' };
      }
      return { outcome: 'allowed' };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      return code === 'course_book_resolution_denied'
        ? { outcome: 'denied', code: 'runtime_course_enrollment_denied' }
        : { outcome: 'unavailable', code: 'runtime_course_authority_unavailable' };
    }
  },
  async revalidate(input) {
    const { previousAuthority: _previousAuthority, ...authorizationInput } = input;
    return this.authorize(authorizationInput);
  },
});
