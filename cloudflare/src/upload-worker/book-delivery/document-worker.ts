import type {
  BookDocumentAuthorizationDecision,
  BookDocumentAuthorizedSource,
} from './documentAuthorization.ts';
import type {
  TeacherAssemblyDocumentAuthorizationDecision,
} from './teacher-assembly-authority.ts';
import {
  documentCorsHeaders,
  documentCorsPreflight,
  rejectDocumentCorsOrigin,
} from '../cors-policy.js';
import type {
  SourceProviderError,
  SourceProviderPort,
} from '../../../../src/services/book-source-delivery/sourceProvider.port.ts';
import type { BookSourceVersionStorageIdentity } from '../../../../src/types/bookSource.types.ts';
import type {
  BookAttemptSourceContextProjection,
} from '../../../../src/services/book-delivery/attemptSourceContextProjection.types.ts';

const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;
const MAX_RANGE_HEADER_BYTES = 4_096;
const STREAM_CHUNK_BYTES = 1024 * 1024;

export interface HistoricalAttemptDocumentAuthorizationDecision {
  readonly kind: 'book-historical-attempt-document-authorized';
  readonly uid: string;
  readonly viewerRole: 'student' | 'teacher';
  readonly attemptId: string;
  readonly resultId: string;
  readonly bookId: string;
  readonly studentId: string;
  readonly contextId: string;
  readonly contextKind: 'solo' | 'homework';
  readonly ownerId: string;
  readonly sourceVersionIds: readonly [string];
  readonly sourceLocations: readonly [BookDocumentAuthorizedSource];
}

export interface HistoricalAttemptDocumentViewer {
  readonly uid: string;
  readonly role: 'student' | 'teacher';
  readonly status: 'active' | 'disabled';
}

export interface HistoricalAttemptHomeworkAuthority {
  readonly homeworkId: string;
  readonly ownerId: string;
  readonly studentIds: readonly string[];
  readonly status: 'current' | 'replaced' | 'archived' | 'unresolved';
}

export type HistoricalAttemptDocumentAuthorizationResult =
  | {
      readonly ok: true;
      readonly decision: HistoricalAttemptDocumentAuthorizationDecision;
      readonly source: BookDocumentAuthorizedSource;
    }
  | {
      readonly ok: false;
      readonly status: 401 | 403 | 404 | 409;
      readonly code:
        | 'unauthorized'
        | 'forbidden'
        | 'not-found'
        | 'stale-binding'
        | 'historical_source_unavailable';
    };

const historicalRequestMatches = (
  request: {
    readonly attemptId: string;
    readonly resultId: string;
    readonly bookId: string;
    readonly componentId: string;
    readonly sourceVersionId: string;
    readonly physicalPageNumber: number;
    readonly pageGroupId: string;
    readonly placementId: string;
    readonly activityVersionId: string;
    readonly interactionFocusId: string;
    readonly opaqueRouteKey: string;
  },
  projection: Extract<BookAttemptSourceContextProjection, { state: 'available' }>,
): boolean => {
  const { metadata, documentResource } = projection;
  return request.attemptId === metadata.attemptId
    && request.resultId === metadata.resultId
    && request.bookId === metadata.bookId
    && request.componentId === metadata.componentId
    && request.sourceVersionId === metadata.sourceVersionId
    && request.physicalPageNumber === metadata.physicalPageNumber
    && request.pageGroupId === metadata.pageGroupId
    && request.placementId === metadata.placementId
    && request.activityVersionId === metadata.activityVersionId
    && request.interactionFocusId === metadata.interactionFocusId
    && request.opaqueRouteKey === documentResource.opaqueRouteKey;
};

/**
 * Historical access is derived from immutable attempt context plus a trusted
 * current viewer role. It deliberately never resolves the current Delivery.
 */
export const authorizeHistoricalAttemptDocument = (input: {
  readonly viewer: HistoricalAttemptDocumentViewer;
  readonly projection: BookAttemptSourceContextProjection;
  readonly homeworkAuthority?: HistoricalAttemptHomeworkAuthority | null;
  readonly source: BookDocumentAuthorizedSource | null;
  readonly sourceAvailability: 'available' | 'missing' | 'deleted' | 'replaced' | 'revoked';
  readonly request: Parameters<typeof historicalRequestMatches>[0];
}): HistoricalAttemptDocumentAuthorizationResult => {
  if (input.viewer.status !== 'active') {
    return { ok: false, status: 401, code: 'unauthorized' };
  }
  if (input.projection.state !== 'available'
    || input.sourceAvailability !== 'available'
    || input.source === null) {
    return { ok: false, status: 404, code: 'historical_source_unavailable' };
  }
  const metadata = input.projection.metadata;
  if (!historicalRequestMatches(input.request, input.projection)
    || input.source.sourceVersionId !== metadata.sourceVersionId
    || input.source.bookId !== metadata.bookId) {
    return { ok: false, status: 403, code: 'forbidden' };
  }
  if (input.viewer.role === 'student') {
    if (input.viewer.uid !== metadata.studentId) {
      return { ok: false, status: 403, code: 'forbidden' };
    }
  } else {
    const authority = input.homeworkAuthority;
    if (
      metadata.surface !== 'homework'
      || !authority
      || authority.status !== 'current'
      || authority.homeworkId !== metadata.contextId
      || authority.ownerId !== input.viewer.uid
      || metadata.ownerId !== input.viewer.uid
      || !authority.studentIds.includes(metadata.studentId)
    ) {
      return { ok: false, status: 403, code: 'forbidden' };
    }
  }
  return {
    ok: true,
    decision: {
      kind: 'book-historical-attempt-document-authorized',
      uid: input.viewer.uid,
      viewerRole: input.viewer.role,
      attemptId: metadata.attemptId,
      resultId: metadata.resultId,
      bookId: metadata.bookId,
      studentId: metadata.studentId,
      contextId: metadata.contextId,
      contextKind: metadata.surface,
      ownerId: metadata.ownerId,
      sourceVersionIds: [metadata.sourceVersionId],
      sourceLocations: [input.source],
    },
    source: input.source,
  };
};

export type BookDocumentWorkerAuthorization =
  | {
      readonly ok: true;
      readonly decision:
        | BookDocumentAuthorizationDecision
        | TeacherAssemblyDocumentAuthorizationDecision
        | HistoricalAttemptDocumentAuthorizationDecision;
      readonly source: BookDocumentAuthorizedSource;
    }
  | {
      readonly ok: false;
      readonly status: 401 | 403 | 404 | 409;
      readonly code:
        | 'unauthorized'
        | 'not-found'
        | 'forbidden'
        | 'stale-binding'
        | 'historical_source_unavailable';
    };

export interface BookDocumentWorkerOptions {
  readonly authorize: (
    request: Request,
    env: Record<string, unknown>,
  ) => Promise<BookDocumentWorkerAuthorization>;
  readonly provider: Pick<SourceProviderPort, 'readObjectMetadata' | 'readBounded'>;
}

type ByteRange = {
  readonly start: number;
  readonly end: number;
  readonly partial: boolean;
};

const safeIdentity = (source: BookSourceVersionStorageIdentity): boolean =>
  source.providerKind === 'backblaze-b2-s3'
  && source.providerFileId.length > 0
  && source.providerFileVersionId.length > 0
  && source.providerObjectKey.length > 0
  && source.storageLocationId.length > 0
  && source.privateBucketId.length > 0
  && source.checksum.algorithm === 'sha-256'
  && /^[a-f0-9]{64}$/u.test(source.checksum.value)
  && Number.isSafeInteger(source.byteSize)
  && source.byteSize > 0
  && source.byteSize <= MAX_DOCUMENT_BYTES;

const sameAuthorizedSource = (
  left: BookDocumentAuthorizedSource,
  right: BookDocumentAuthorizedSource,
): boolean =>
  left.bookId === right.bookId
  && left.sourceVersionId === right.sourceVersionId
  && left.storageLocationId === right.storageLocationId
  && left.providerKind === right.providerKind
  && left.privateBucketId === right.privateBucketId
  && left.providerObjectKey === right.providerObjectKey
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId
  && left.checksum.algorithm === right.checksum.algorithm
  && left.checksum.value === right.checksum.value
  && left.byteSize === right.byteSize
  && left.provider === right.provider
  && left.bucket === right.bucket
  && left.objectKey === right.objectKey;

const json = (body: Record<string, string>, status: number, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

const sourceErrorStatus = (error: unknown): number => {
  const code = (error as Partial<SourceProviderError>)?.code;
  if (code === 'not_found') return 404;
  if (code === 'conflict') return 409;
  if (code === 'timeout') return 504;
  if (code === 'aborted') return 499;
  return 502;
};

const parseRange = (value: string | null, total: number): ByteRange => {
  if (value === null) return { start: 0, end: total - 1, partial: false };
  if (new TextEncoder().encode(value).byteLength > MAX_RANGE_HEADER_BYTES) {
    throw new RangeError('range-too-large');
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (match[1] === '' && match[2] === '') || value.includes(',')) {
    throw new RangeError('range-invalid');
  }
  const startText = match[1]!;
  const endText = match[2]!;
  if (startText === '') {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix < 1 || total < 1) {
      throw new RangeError('range-unsatisfiable');
    }
    return {
      start: Math.max(0, total - suffix),
      end: total - 1,
      partial: true,
    };
  }
  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start < 0 || start >= total) {
    throw new RangeError('range-unsatisfiable');
  }
  const requestedEnd = endText === '' ? total - 1 : Number(endText);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    throw new RangeError('range-unsatisfiable');
  }
  return {
    start,
    end: Math.min(requestedEnd, total - 1),
    partial: true,
  };
};

const opaqueEtag = async (source: BookSourceVersionStorageIdentity): Promise<string> => {
  const material = [
    source.storageLocationId,
    source.privateBucketId,
    source.providerFileId,
    source.providerFileVersionId,
    source.checksum.value,
  ].join('\u0000');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)));
  const value = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `"${value}"`;
};

const responseHeaders = async (
  request: Request,
  source: BookSourceVersionStorageIdentity,
  total: number,
  range: ByteRange,
): Promise<Headers> => {
  const headers = documentCorsHeaders(request);
  headers.set('cache-control', 'private, no-store');
  headers.set('content-type', 'application/pdf');
  headers.set('accept-ranges', 'bytes');
  headers.set('content-length', String(range.end - range.start + 1));
  headers.set('etag', await opaqueEtag(source));
  if (range.partial) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${total}`);
  }
  return headers;
};

const readChunk = async (
  provider: Pick<SourceProviderPort, 'readBounded'>,
  identity: BookSourceVersionStorageIdentity,
  start: number,
  length: number,
  signal: AbortSignal,
) => provider.readBounded(
  { identity, range: { offset: start, length } },
  { signal, timeoutMs: 30_000 },
);

const streamBytes = (
  provider: Pick<SourceProviderPort, 'readBounded'>,
  identity: BookSourceVersionStorageIdentity,
  range: ByteRange,
  first: Uint8Array,
  request: Request,
): ReadableStream<Uint8Array> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  let next = range.start + first.byteLength;
  let firstPending = true;
  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        if (firstPending) {
          firstPending = false;
          streamController.enqueue(first);
          return;
        }
        if (next > range.end) {
          request.signal.removeEventListener('abort', abort);
          streamController.close();
          return;
        }
        const length = Math.min(STREAM_CHUNK_BYTES, range.end - next + 1);
        const chunk = await readChunk(provider, identity, next, length, controller.signal);
        if (chunk.offset !== next || chunk.bytes.byteLength !== length) {
          throw new Error('provider-truncated');
        }
        streamController.enqueue(chunk.bytes);
        next += length;
      } catch {
        request.signal.removeEventListener('abort', abort);
        streamController.error(new Error('document-stream-failed'));
      }
    },
    cancel() {
      controller.abort();
      request.signal.removeEventListener('abort', abort);
    },
  });
};

export const createBookDocumentWorker = (options: BookDocumentWorkerOptions) => ({
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    if (request.method === 'OPTIONS') return documentCorsPreflight(request);
    const corsRejection = rejectDocumentCorsOrigin(request);
    if (corsRejection) return corsRejection;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ code: 'method_not_allowed' }, 405, documentCorsHeaders(request));
    }

    let authorization: BookDocumentWorkerAuthorization;
    try {
      authorization = await options.authorize(request, env);
    } catch {
      return json({ code: 'authorization_unavailable' }, 503, documentCorsHeaders(request));
    }
    if (authorization.ok === false) {
      return json({ code: authorization.code }, authorization.status, documentCorsHeaders(request));
    }
    if (!authorization.decision.sourceLocations.some((candidate) =>
      sameAuthorizedSource(candidate, authorization.source))) {
      return json({ code: 'authorization-source-mismatch' }, 502, documentCorsHeaders(request));
    }
    if (!safeIdentity(authorization.source)) return json({ code: 'unsafe-source' }, 502, documentCorsHeaders(request));

    const identity = authorization.source;
    try {
      const metadata = await options.provider.readObjectMetadata({ identity }, { signal: request.signal, timeoutMs: 30_000 });
      if (metadata.identity !== identity
        || metadata.identity.providerFileId !== identity.providerFileId
        || metadata.identity.providerFileVersionId !== identity.providerFileVersionId
        || metadata.identity.providerObjectKey !== identity.providerObjectKey
        || metadata.identity.byteSize !== identity.byteSize) {
        return json({ code: 'provider-drift' }, 502, documentCorsHeaders(request));
      }
      const total = metadata.identity.byteSize;
      let range: ByteRange;
      try {
        range = parseRange(request.headers.get('range'), total);
      } catch {
        return new Response(null, {
          status: 416,
          headers: {
            ...Object.fromEntries(documentCorsHeaders(request)),
            'cache-control': 'no-store',
            'content-range': `bytes */${total}`,
          },
        });
      }
      const headers = await responseHeaders(request, identity, total, range);
      if (request.method === 'HEAD') return new Response(null, { status: range.partial ? 206 : 200, headers });

      const firstLength = Math.min(STREAM_CHUNK_BYTES, range.end - range.start + 1);
      const first = await readChunk(options.provider, identity, range.start, firstLength, request.signal);
      if (first.offset !== range.start || first.bytes.byteLength !== firstLength) {
        return json({ code: 'provider-truncated' }, 502, documentCorsHeaders(request));
      }
      return new Response(
        streamBytes(options.provider, identity, range, first.bytes, request),
        { status: range.partial ? 206 : 200, headers },
      );
    } catch (error) {
      return json({ code: 'document_provider_unavailable' }, sourceErrorStatus(error), documentCorsHeaders(request));
    }
  },
});
