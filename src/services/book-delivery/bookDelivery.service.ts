import { isRunnableBookDeliveryBinding } from './bookDelivery.schema';
import type {
  BookDeliveryBinding,
  BookDeliveryContextKind,
  BookDeliveryPlacement,
  BookRuntimeDeliveryProjection,
} from './bookDelivery.types';
import type { BookDeliveryRepository } from './bookDelivery.entitlement';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ROUTE_KEY_SAFE = /[^A-Za-z0-9._~-]/gu;
const runnableContexts = new Set<BookDeliveryContextKind>(['solo', 'preview', 'homework']);

export interface BookDeliveryActor {
  readonly uid: string;
}

export interface ResolveBookDeliveryProjectionInput {
  readonly recipientId: string;
  readonly contextId: string;
  readonly actor: BookDeliveryActor;
}

export type BookDeliveryProjectionFailureCode =
  | 'invalid-book-delivery-request'
  | 'book-delivery-forbidden'
  | 'book-delivery-not-found'
  | 'book-delivery-unsupported-context'
  | 'book-delivery-stale-binding';

export class BookDeliveryProjectionError extends Error {
  constructor(readonly code: BookDeliveryProjectionFailureCode, readonly status = 400) {
    super(code);
    this.name = 'BookDeliveryProjectionError';
  }
}

const assertId = (value: string): void => {
  if (!ID.test(value)) throw new BookDeliveryProjectionError('invalid-book-delivery-request');
};

const routeKey = (binding: BookDeliveryBinding, sourceKey: string, sourceVersionId: string): string => (
  `${binding.bindingId}-${binding.revision}-${sourceKey}-${sourceVersionId}`
    .replace(ROUTE_KEY_SAFE, '_')
    .slice(0, 160)
);

const contextDescription = (
  sourceSet: BookDeliveryBinding['sourceSet'],
  placement: BookDeliveryPlacement,
): string => {
  const parts = placement.sourcePageScopes.map((scope) => {
    const source = sourceSet.sources.find((candidate) => candidate.sourceKey === scope.sourceKey);
    const prefix = sourceSet.strategy === 'component_pdfs'
      ? `component ${scope.sourceKey}`
      : `PDF ${scope.sourceKey}`;
    const pages = scope.pages.join(', ');
    return source?.ownerNodeKey
      ? `${prefix} pages ${pages} owned by ${source.ownerNodeKey}`
      : `${prefix} pages ${pages}`;
  });
  return parts.length > 0 ? parts.join('; ') : 'No source context required.';
};

const actionFlags = (kind: BookDeliveryContextKind): BookRuntimeDeliveryProjection['actionFlags'] => ({
  canAutosave: kind === 'solo' || kind === 'preview' || kind === 'homework',
  canSubmit: kind === 'solo' || kind === 'homework',
  canReview: kind === 'preview',
});

export const createBookDeliveryProjectionResolver = (options: {
  readonly repository: BookDeliveryRepository;
  readonly makeOpaqueRouteKey?: (
    binding: BookDeliveryBinding,
    sourceKey: string,
    sourceVersionId: string,
  ) => string;
}) => {
  const makeOpaqueRouteKey = options.makeOpaqueRouteKey ?? routeKey;

  return {
    async resolve(input: ResolveBookDeliveryProjectionInput): Promise<BookRuntimeDeliveryProjection> {
      assertId(input.recipientId);
      assertId(input.contextId);
      assertId(input.actor.uid);
      if (input.actor.uid !== input.recipientId) {
        throw new BookDeliveryProjectionError('book-delivery-forbidden', 403);
      }
      const entitlement = await options.repository.resolveCurrent(input.recipientId, input.contextId);
      if (!entitlement) throw new BookDeliveryProjectionError('book-delivery-not-found', 404);
      const { record, pointer } = entitlement;
      const { binding } = record;
      if (pointer.bindingId !== binding.bindingId
        || pointer.bindingRevision !== binding.revision
        || pointer.recipientId !== input.recipientId
        || pointer.contextId !== input.contextId
        || record.status !== 'active'
        || binding.status !== 'active'
        || binding.book.publicationStatus !== 'published'
        || !isRunnableBookDeliveryBinding(binding)) {
        throw new BookDeliveryProjectionError('book-delivery-stale-binding', 409);
      }
      if (!runnableContexts.has(binding.context.kind)) {
        throw new BookDeliveryProjectionError('book-delivery-unsupported-context', 422);
      }
      const documentRequests = binding.sourceSet.sources.map((source) => ({
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        opaqueRouteKey: makeOpaqueRouteKey(binding, source.sourceKey, source.sourceVersionId),
        localPageScope: source.localPageScope,
      }));
      return {
        schemaVersion: 1,
        projectionKind: 'book-runtime-delivery',
        bindingId: binding.bindingId,
        bindingRevision: binding.revision,
        recipientId: binding.recipient.recipientId,
        context: {
          contextId: binding.context.contextId,
          kind: binding.context.kind,
          entitlementBasis: binding.context.entitlementBasis,
        },
        book: binding.book,
        scope: binding.scope,
        sourceSet: binding.sourceSet,
        documentRequests,
        activities: binding.placements.map((placement) => ({
          placementId: placement.placementId,
          activityId: placement.activityId,
          activityVersion: placement.activityVersion,
          nodeKey: placement.nodeKey,
          order: placement.order,
          contextMode: placement.contextMode,
          sourceContext: {
            available: placement.sourcePageScopes.length > 0,
            description: contextDescription(binding.sourceSet, placement),
            sourcePageScopes: placement.sourcePageScopes,
          },
        })),
        actionFlags: actionFlags(binding.context.kind),
        provenance: {
          publicationId: binding.book.publicationId,
          publicationRevision: binding.book.publicationRevision,
          bindingId: binding.bindingId,
          bindingRevision: binding.revision,
        },
      };
    },
  };
};
