import type {
  BookRuntimeAttemptRecord,
  BookRuntimeResultRecord,
} from '../book-activity/activityRuntimeAttempt.types';
import type { BookDeliveryRecord, BookDeliveryRepository } from './bookDelivery.entitlement';
import type { BookRuntimeDeliveryDocumentRequest } from './bookDelivery.types';
import { createComponentStudentDocument, type ComponentStudentDocument } from '../book-assembly/componentStudentDocument.types';
import { fingerprintComponentPdfActivationValue } from '../book-assembly/componentPdfActivation.service';
import { STUDENT_DOCUMENT_MAX_PDF_BYTES } from '../../types/bookSource.types';
import type {
  BookAttemptHistoricalDocumentResource,
  BookAttemptSourceContextMetadata,
  BookAttemptSourceContextProjection,
  BookHistoricalSourceAvailability,
} from './attemptSourceContextProjection.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SAFE_ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;
const validId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export interface BookAttemptSourceRecord {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly availability: BookHistoricalSourceAvailability;
  readonly documentRequest?: BookRuntimeDeliveryDocumentRequest;
}

export interface ProjectBookAttemptSourceContextInput {
  readonly attempt: BookRuntimeAttemptRecord;
  readonly result: BookRuntimeResultRecord;
  readonly historicalDelivery: Pick<BookDeliveryRecord, 'binding'> | null;
  readonly sources: readonly BookAttemptSourceRecord[];
  readonly combinedDocument?: {
    readonly descriptor: ComponentStudentDocument;
    readonly opaqueRouteKey: string;
  };
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
): boolean => Boolean(request.localPageScope
  && Array.isArray(request.localPageScope.pages)
  && (request.localPageScope.kind === 'all' && request.localPageScope.pages.length === 0
    || request.localPageScope.kind === 'pages'
      && request.localPageScope.pages.every((page) => Number.isSafeInteger(page) && page > 0)
      && request.localPageScope.pages.includes(physicalPageNumber)));

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
    || binding.issuer.ownerId !== binding.context.ownerId
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
    || attempt.pageGroupKeys.length === 0
    || !sameValues(placement.pageGroupKeys, attempt.pageGroupKeys)
    || new Set(attempt.pageGroupKeys).size !== attempt.pageGroupKeys.length
    || attempt.pageGroupKeys.some((key) => !SAFE_ID.test(key))
    || placement.sourcePageScopes.length !== attempt.sourceProvenance.length
    || attempt.sourceProvenance.length === 0
    || new Set(attempt.sourceProvenance.map((source) => source.sourceKey)).size !== attempt.sourceProvenance.length
  ) {
    return unavailable('malformed_context');
  }
  const provenance = attempt.sourceProvenance[0]!;
  if (!attempt.sourceProvenance.every((entry, index) => {
    const scope = placement.sourcePageScopes[index];
    const bound = binding.sourceSet.sources.find((candidate) => candidate.sourceKey === entry.sourceKey);
    return scope && scope.sourceKey === entry.sourceKey && sameValues(scope.pages, entry.pages)
      && SAFE_ID.test(entry.sourceKey) && SAFE_ID.test(entry.sourceVersionId)
      && entry.pages.length > 0 && new Set(entry.pages).size === entry.pages.length
      && entry.pages.every((page) => Number.isSafeInteger(page) && page > 0
        && bound && pageAllowed({ ...bound, opaqueRouteKey: '' }, page))
      && bound?.sourceVersionId === entry.sourceVersionId;
  })) {
    return unavailable('malformed_context');
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
  for (const entry of attempt.sourceProvenance) {
    const source = input.sources.find((candidate) => candidate.sourceKey === entry.sourceKey
      && candidate.sourceVersionId === entry.sourceVersionId);
    if (!source) return unavailable('missing_context', metadata);
    if (source.availability !== 'available') return unavailable(source.availability, metadata);
  }
  if (binding.sourceSet.strategy === 'component_pdfs') {
    const combined = input.combinedDocument;
    if (!combined || !SAFE_ROUTE_KEY.test(combined.opaqueRouteKey)) {
      return unavailable('authorization_unavailable', metadata);
    }
    let descriptor: ComponentStudentDocument;
    try {
      descriptor = createComponentStudentDocument(combined.descriptor);
      if (fingerprintComponentPdfActivationValue(descriptor) !== fingerprintComponentPdfActivationValue(combined.descriptor)) {
        return unavailable('malformed_context', metadata);
      }
    } catch {
      return unavailable('malformed_context', metadata);
    }
    if (!binding.sourceSet.sources.every((source) => descriptor.components.some((component) =>
      component.sourceKey === source.sourceKey && component.sourceVersionId === source.sourceVersionId))) {
      return unavailable('malformed_context', metadata);
    }
    const pageContexts: NonNullable<BookAttemptSourceContextMetadata['pageContexts']>[number][] = [];
    for (const entry of attempt.sourceProvenance) {
      const component = descriptor.components.find((candidate) => candidate.sourceKey === entry.sourceKey
        && candidate.sourceVersionId === entry.sourceVersionId);
      if (!component || entry.pages.some((page) => page > component.localPageCount)) {
        return unavailable('malformed_context', metadata);
      }
      pageContexts.push(...entry.pages.map((page) => ({
        sourceKey: entry.sourceKey, sourceVersionId: entry.sourceVersionId,
        physicalPageNumber: page, combinedPhysicalPageNumber: component.combinedStartPage + page - 1,
      })));
    }
    return frozen({
      schemaVersion: 1,
      state: 'available',
      metadata: { ...metadata, combinedPhysicalPageNumber: pageContexts[0]!.combinedPhysicalPageNumber,
        pageContexts, pageGroupIds: [...attempt.pageGroupKeys] },
      documentResource: {
        sourceKey: 'student-document', sourceVersionId: descriptor.sourceVersionId,
        opaqueRouteKey: combined.opaqueRouteKey, localPageScope: { kind: 'all', pages: [] },
        studentDocument: { descriptorRevision: descriptor.descriptorRevision, sha256Hex: descriptor.sha256Hex,
          descriptorFingerprint: fingerprintComponentPdfActivationValue(descriptor), expectedByteLength: descriptor.byteSize,
          physicalPageCount: descriptor.physicalPageCount },
      },
    });
  }
  const source = input.sources.find((candidate) => candidate.sourceKey === provenance.sourceKey
    && candidate.sourceVersionId === provenance.sourceVersionId)!;
  if (!validResource(source.documentRequest, metadata)
    || attempt.sourceProvenance.some((entry) => entry.sourceKey !== source.sourceKey
      || entry.sourceVersionId !== source.sourceVersionId
      || entry.pages.some((page) => !pageAllowed(source.documentRequest!, page)))) {
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
  combinedDocument: input.combinedDocument,
});

export const historicalSourceUnavailableProjection = (
  reason: 'missing_context' | 'malformed_context' = 'missing_context',
): BookAttemptSourceContextProjection => unavailable(reason);

const validMetadata = (metadata: BookAttemptSourceContextMetadata): boolean =>
  plainObject(metadata)
  && validId(metadata.attemptId)
  && validId(metadata.resultId)
  && validId(metadata.bookId)
  && validId(metadata.studentId)
  && validId(metadata.contextId)
  && validId(metadata.ownerId)
  && validId(metadata.componentId)
  && validId(metadata.sourceKey)
  && metadata.componentId === metadata.sourceKey
  && validId(metadata.sourceVersionId)
  && Number.isSafeInteger(metadata.physicalPageNumber)
  && metadata.physicalPageNumber > 0
  && validId(metadata.pageGroupId)
  && validId(metadata.placementId)
  && validId(metadata.activityId)
  && validId(metadata.activityVersionId)
  && Number.isSafeInteger(metadata.activityVersion)
  && metadata.activityVersion > 0
  && validId(metadata.interactionFocusId)
  && ['solo', 'homework'].includes(metadata.surface)
  && ['reference-only', 'source-assisted'].includes(metadata.correspondence);

const validCombinedResource = (
  resource: BookAttemptHistoricalDocumentResource,
  metadata: BookAttemptSourceContextMetadata,
): boolean => {
  const pin = resource.studentDocument;
  const contexts = metadata.pageContexts;
  if (!plainObject(pin)
    || Object.keys(pin).sort().join(',') !== 'descriptorFingerprint,descriptorRevision,expectedByteLength,physicalPageCount,sha256Hex'
    || resource.sourceKey !== 'student-document' || !validId(resource.sourceVersionId)
    || !Number.isSafeInteger(pin.descriptorRevision) || pin.descriptorRevision < 0
    || typeof pin.sha256Hex !== 'string' || !/^[a-f0-9]{64}$/u.test(pin.sha256Hex)
    || typeof pin.descriptorFingerprint !== 'string' || !/^fnv1a64:[a-f0-9]{16}$/u.test(pin.descriptorFingerprint)
    || !Number.isSafeInteger(pin.expectedByteLength) || pin.expectedByteLength < 1
    || pin.expectedByteLength > STUDENT_DOCUMENT_MAX_PDF_BYTES
    || !Number.isSafeInteger(pin.physicalPageCount) || pin.physicalPageCount < 1
    || resource.localPageScope?.kind !== 'all' || !Array.isArray(resource.localPageScope.pages)
    || resource.localPageScope.pages.length !== 0
    || !Array.isArray(contexts) || contexts.length === 0
    || !Array.isArray(metadata.pageGroupIds) || metadata.pageGroupIds.length === 0
    || metadata.pageGroupIds[0] !== metadata.pageGroupId
    || new Set(metadata.pageGroupIds).size !== metadata.pageGroupIds.length
    || !metadata.pageGroupIds.every(validId)) return false;
  const first = contexts[0]!;
  return plainObject(first) && first.sourceKey === metadata.sourceKey && first.sourceVersionId === metadata.sourceVersionId
    && first.physicalPageNumber === metadata.physicalPageNumber
    && first.combinedPhysicalPageNumber === metadata.combinedPhysicalPageNumber
    && contexts.every((context) => plainObject(context) && validId(context.sourceKey)
      && validId(context.sourceVersionId)
      && typeof context.physicalPageNumber === 'number' && typeof context.combinedPhysicalPageNumber === 'number'
      && Number.isSafeInteger(context.physicalPageNumber) && context.physicalPageNumber > 0
      && Number.isSafeInteger(context.combinedPhysicalPageNumber) && context.combinedPhysicalPageNumber > 0
      && context.combinedPhysicalPageNumber <= pin.physicalPageCount);
};

export const isBookAttemptSourceContextProjection = (
  value: unknown,
): value is BookAttemptSourceContextProjection => {
  if (!plainObject(value)) return false;
  const candidate = value as Partial<BookAttemptSourceContextProjection>;
  if (candidate.schemaVersion !== 1 || candidate.documentResource === undefined) return false;
  if (candidate.state === 'historical_source_unavailable') {
    return candidate.documentResource === null
      && (candidate.metadata === null || candidate.metadata !== undefined && validMetadata(candidate.metadata)
        && candidate.metadata.combinedPhysicalPageNumber === undefined
        && candidate.metadata.pageContexts === undefined && candidate.metadata.pageGroupIds === undefined)
      && [
        'missing', 'deleted', 'replaced', 'invalidated', 'revoked',
        'missing_context', 'malformed_context', 'authorization_unavailable',
      ].includes(candidate.reason ?? '');
  }
  if (candidate.state !== 'available' || !candidate.metadata || !plainObject(candidate.documentResource)) return false;
  const metadata = candidate.metadata;
  const resource = candidate.documentResource;
  return validMetadata(metadata)
    && typeof resource.opaqueRouteKey === 'string' && SAFE_ROUTE_KEY.test(resource.opaqueRouteKey)
    && (resource.studentDocument !== undefined
      ? validCombinedResource(resource, metadata)
      : resource.sourceKey !== 'student-document'
        && metadata.combinedPhysicalPageNumber === undefined && metadata.pageContexts === undefined
        && metadata.pageGroupIds === undefined
        && resource.sourceKey === metadata.sourceKey && resource.sourceVersionId === metadata.sourceVersionId
        && pageAllowed(resource, metadata.physicalPageNumber));
};
