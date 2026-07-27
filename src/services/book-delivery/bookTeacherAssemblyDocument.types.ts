import {
  BookDocumentTransportError,
  type BookDocumentRoute,
} from './bookDocumentTransport.browser';

const SAFE_ID = /^[A-Za-z0-9._~-]{1,160}$/u;
export interface BookTeacherAssemblyDocumentRouteInput {
  readonly workerOrigin: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceSetRevision: number;
  readonly bookRevision: number;
  readonly expectedByteLength?: number;
  readonly expectedEtag?: string;
  readonly physicalPageNumber?: number;
}

/**
 * Browser-safe preview projection. The route tuple is not a capability;
 * every request is re-authorized against current server-owned Assembly facts.
 */
export interface BookTeacherAssemblyDocumentProjection {
  readonly kind: 'teacher_assembly';
  readonly bookId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly route: BookDocumentRoute;
}

const workerOrigin = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BookDocumentTransportError('invalid_route');
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:')
    || (url.protocol === 'http:' && url.hostname !== 'localhost')
    || url.username !== ''
    || url.password !== ''
    || !/^\/+$/u.test(url.pathname)
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new BookDocumentTransportError('invalid_route');
  }
  return url.origin;
};

export const createBookTeacherAssemblyDocumentRoute = (
  input: BookTeacherAssemblyDocumentRouteInput,
): BookDocumentRoute => {
  const ids = [
    input.bookId,
    input.unitKey,
    input.candidateId,
    input.sourceKey,
    input.sourceVersionId,
  ];
  if (
    ids.some((value) => !SAFE_ID.test(value))
    || !Number.isSafeInteger(input.candidateRevision)
    || input.candidateRevision < 1
    || !Number.isSafeInteger(input.sourceSetRevision)
    || input.sourceSetRevision < 0
    || !Number.isSafeInteger(input.bookRevision)
    || input.bookRevision < 0
  ) {
    throw new BookDocumentTransportError('invalid_route');
  }
  const origin = workerOrigin(input.workerOrigin);
  const segments = [
    input.bookId,
    input.unitKey,
    input.candidateId,
    String(input.candidateRevision),
    input.sourceKey,
    input.sourceVersionId,
    String(input.sourceSetRevision),
    String(input.bookRevision),
  ].map(encodeURIComponent);
  return Object.freeze({
    url: `${origin}/v1/book-delivery/teacher-assembly/${segments.join('/')}`,
    sourceVersionId: input.sourceVersionId,
    expectedByteLength: input.expectedByteLength,
    expectedEtag: input.expectedEtag,
    physicalPageNumber: input.physicalPageNumber,
  });
};

export const isCurrentBookTeacherAssemblyDocument = (
  projection: BookTeacherAssemblyDocumentProjection,
  current: {
    readonly bookId: string;
    readonly bookRevision: number;
    readonly sourceSetRevision: number;
    readonly candidateId: string;
    readonly candidateRevision: number;
    readonly candidateLifecycle: 'draft' | 'validated' | 'discarded';
    readonly sourceVersionIds: readonly string[];
  },
): boolean =>
  projection.kind === 'teacher_assembly'
  && current.candidateLifecycle !== 'discarded'
  && projection.bookId === current.bookId
  && projection.bookRevision === current.bookRevision
  && projection.sourceSetRevision === current.sourceSetRevision
  && projection.candidateId === current.candidateId
  && projection.candidateRevision === current.candidateRevision
  && projection.route.sourceVersionId === projection.sourceVersionId
  && current.sourceVersionIds.includes(projection.sourceVersionId);
