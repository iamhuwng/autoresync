import type {
  BookRuntimeAttemptRecord,
  BookRuntimeResultRecord,
} from '../book-activity/activityRuntimeAttempt.types';
import type { BookDeliveryRecord, BookDeliveryRepository } from './bookDelivery.entitlement';
import type { BookRuntimeDeliveryDocumentRequest } from './bookDelivery.types';
import type {
  BookAttemptHistoricalDocumentResource,
  BookAttemptSourceContextMetadata,
  BookAttemptSourceContextProjection,
  BookHistoricalSourceAvailability,
} from './attemptSourceContextProjection.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SAFE_ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;

export interface BookAttemptSourceRecord {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly availability: BookHistoricalSourceAvailability;
  readonly documentRequest?: BookRuntimeDeliveryDocumentRequest;
}

export interface ProjectBookAttemptSourceContextInput {
  readonly attempt: BookRuntimeAttemptRecord;
  readonly result: BookRuntimeResultRecord;
  readonly historicalDelivery: BookDeliveryRecord | null;
  readonly sources: readonly BookAttemptSourceRecord[];
}

export type ResolveBookAttemptSourceContextInput =
  Omit<ProjectBookAttemptSourceContextInput, 'historicalDelivery'> & {
    readonly repository: Pick<BookDeliveryRepository, 'readBinding'>;
  };

const frozen = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => frozen((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const unavailable = (
  reason: Extract<BookAttemptSourceContextProjection, { state: 'historical_source_unavailable' }>['reason'],
  metadata: BookAttemptSourceContextMetadata | null = null,
): BookAttemptSourceContextProjection => frozen({
  schemaVersion: 1,
  state: 'historical_source_unavailable',
  reason,
  metadata,
  documentResource: null,
});

const sameValues = (left: readonly string[] | readonly number[], right: readonly string[] | readonly number[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const pageAllowed = (
  request: BookRuntimeDeliveryDocumentRequest,
  physicalPageNumber: number,
): boolean => request.localPageScope.kind === 'all'
  || request.localPageScope.pages.includes(physicalPageNumber);

const validResource = (
  request: BookRuntimeDeliveryDocumentRequest | undefined,
  metadata: BookAttemptSourceContextMetadata,
): request is BookRuntimeDeliveryDocumentRequest => Boolean(
  request
  && request.sourceKey === metadata.sourceKey
  && request.sourceVersionId === metadata.sourceVersionId
  && SAFE_ROUTE_KEY.test(request.opaqueRouteKey)
  && pageAllowed(request, metadata.physicalPageNumber),
);

const terminalIdentityMatches = (
  attempt: BookRuntimeAttemptRecord,
  result: BookRuntimeResultRecord,
): boolean => (
  result.attemptId === attempt.attemptId
  && result.bindingId === attempt.bindingId
  && result.bindingRevision === attempt.bindingRevision
  && result.recipientId === attempt.recipientId
  && result.contextId === attempt.contextId
  && result.placementId === attempt.placementId
  && result.activityId === attempt.activityId
  && result.activityVersionId === attempt.activityVersionId
  && result.activityVersion === attempt.activityVersion
  && result.interactionId === attempt.interactionId
  && sameValues(result.pageGroupKeys, attempt.pageGroupKeys)
  && result.sourceProvenance.length === attempt.sourceProvenance.length
  && result.sourceProvenance.every((source, index) => {
    const expected = attempt.sourceProvenance[index];
    return expected !== undefined
      && source.sourceKey === expected.sourceKey
      && source.sourceVersionId === expected.sourceVersionId
      && sameValues(source.pages, expected.pages);
  })
);

export const projectBookAttemptSourceContext = (
  input: ProjectBookAttemptSourceContextInput,
): BookAttemptSourceContextProjection => {
  const { attempt, result } = input;
  if (!terminalIdentityMatches(attempt, result)) return unavailable('malformed_context');
  const record = input.historicalDelivery;
  if (!record) return unavailable('missing_context');
  const binding = record.binding;
  if (
    binding.bindingId !== attempt.bindingId
    || binding.revision !== attempt.bindingRevision
    || binding.recipient.recipientId !== attempt.recipientId
    || binding.context.recipientId !== attempt.recipientId
    || binding.context.contextId !== attempt.contextId
    || (binding.context.kind !== 'solo' && binding.context.kind !== 'homework')
  ) {
    return unavailable('malformed_context');
  }
  const placement = binding.placements.find((candidate) => candidate.placementId === attempt.placementId);
  if (
    !placement
    || placement.activityId !== attempt.activityId
    || placement.activityVersionId !== attempt.activityVersionId
    || placement.activityVersion !== attempt.activityVersion
    || placement.pageGroupKeys.length !== 1
    || attempt.pageGroupKeys.length !== 1
    || placement.pageGroupKeys[0] !== attempt.pageGroupKeys[0]
    || placement.sourcePageScopes.length !== 1
    || attempt.sourceProvenance.length !== 1
  ) {
    return unavailable('malformed_context');
  }
  const placementSource = placement.sourcePageScopes[0]!;
  const provenance = attempt.sourceProvenance[0]!;
  if (
    placementSource.pages.length !== 1
    || provenance.pages.length !== 1
    || placementSource.sourceKey !== provenance.sourceKey
    || !sameValues(placementSource.pages, provenance.pages)
  ) {
    return unavailable('malformed_context');
  }
  const boundSource = binding.sourceSet.sources.find(
    (candidate) => candidate.sourceKey === provenance.sourceKey,
  );
  if (!boundSource || boundSource.sourceVersionId !== provenance.sourceVersionId) {
    return unavailable('malformed_context');
  }
  const source = input.sources.find((candidate) => candidate.sourceKey === provenance.sourceKey);
  if (
    !source
    || source.sourceVersionId !== provenance.sourceVersionId
    || !SAFE_ID.test(source.sourceKey)
    || !SAFE_ID.test(source.sourceVersionId)
  ) {
    return unavailable('missing_context');
  }
  const metadata: BookAttemptSourceContextMetadata = frozen({
    attemptId: attempt.attemptId,
    resultId: result.resultId,
    bookId: binding.book.bookId,
    studentId: attempt.recipientId,
    surface: binding.context.kind,
    contextId: attempt.contextId,
    ownerId: binding.context.ownerId,
    componentId: provenance.sourceKey,
    sourceKey: provenance.sourceKey,
    sourceVersionId: provenance.sourceVersionId,
    physicalPageNumber: provenance.pages[0]!,
    pageGroupId: attempt.pageGroupKeys[0]!,
    placementId: attempt.placementId,
    activityId: attempt.activityId,
    activityVersionId: attempt.activityVersionId,
    activityVersion: attempt.activityVersion,
    interactionFocusId: attempt.interactionId,
    correspondence: placement.contextMode === 'required' ? 'source-assisted' : 'reference-only',
  });
  if (source.availability !== 'available') return unavailable(source.availability, metadata);
  if (!validResource(source.documentRequest, metadata)) {
    return unavailable('authorization_unavailable', metadata);
  }
  const documentResource: BookAttemptHistoricalDocumentResource = frozen({
    sourceKey: source.documentRequest.sourceKey,
    sourceVersionId: source.documentRequest.sourceVersionId,
    opaqueRouteKey: source.documentRequest.opaqueRouteKey,
    localPageScope: source.documentRequest.localPageScope.kind === 'all'
      ? { kind: 'all', pages: [] }
      : { kind: 'pages', pages: [...source.documentRequest.localPageScope.pages] },
  });
  return frozen({
    schemaVersion: 1,
    state: 'available',
    metadata,
    documentResource,
  });
};

export const resolveBookAttemptSourceContext = async (
  input: ResolveBookAttemptSourceContextInput,
): Promise<BookAttemptSourceContextProjection> => projectBookAttemptSourceContext({
  attempt: input.attempt,
  result: input.result,
  historicalDelivery: await input.repository.readBinding(input.attempt.bindingId),
  sources: input.sources,
});

export const historicalSourceUnavailableProjection = (
  reason: 'missing_context' | 'malformed_context' = 'missing_context',
): BookAttemptSourceContextProjection => unavailable(reason);

const validMetadata = (metadata: BookAttemptSourceContextMetadata): boolean =>
  SAFE_ID.test(metadata.attemptId)
  && SAFE_ID.test(metadata.resultId)
  && SAFE_ID.test(metadata.bookId)
  && SAFE_ID.test(metadata.studentId)
  && SAFE_ID.test(metadata.contextId)
  && SAFE_ID.test(metadata.ownerId)
  && SAFE_ID.test(metadata.componentId)
  && SAFE_ID.test(metadata.sourceKey)
  && metadata.componentId === metadata.sourceKey
  && SAFE_ID.test(metadata.sourceVersionId)
  && Number.isSafeInteger(metadata.physicalPageNumber)
  && metadata.physicalPageNumber > 0
  && SAFE_ID.test(metadata.pageGroupId)
  && SAFE_ID.test(metadata.placementId)
  && SAFE_ID.test(metadata.activityId)
  && SAFE_ID.test(metadata.activityVersionId)
  && Number.isSafeInteger(metadata.activityVersion)
  && metadata.activityVersion > 0
  && SAFE_ID.test(metadata.interactionFocusId)
  && ['solo', 'homework'].includes(metadata.surface)
  && ['reference-only', 'source-assisted'].includes(metadata.correspondence);

export const isBookAttemptSourceContextProjection = (
  value: unknown,
): value is BookAttemptSourceContextProjection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<BookAttemptSourceContextProjection>;
  if (candidate.schemaVersion !== 1 || candidate.documentResource === undefined) return false;
  if (candidate.state === 'historical_source_unavailable') {
    return candidate.documentResource === null
      && (candidate.metadata === null || validMetadata(candidate.metadata))
      && [
        'missing', 'deleted', 'replaced', 'invalidated', 'revoked',
        'missing_context', 'malformed_context', 'authorization_unavailable',
      ].includes(candidate.reason ?? '');
  }
  if (candidate.state !== 'available' || !candidate.metadata || !candidate.documentResource) return false;
  const metadata = candidate.metadata;
  const resource = candidate.documentResource;
  return validMetadata(metadata)
    && resource.sourceKey === metadata.sourceKey
    && resource.sourceVersionId === metadata.sourceVersionId
    && SAFE_ROUTE_KEY.test(resource.opaqueRouteKey)
    && pageAllowed(resource, metadata.physicalPageNumber);
};
