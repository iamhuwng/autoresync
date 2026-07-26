import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from './unitAssembly.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RESPONSE_BYTES = 1_200_000;
const RESULT_STATUSES = new Set<BookAssemblyMutationResult['status']>([
  'created', 'replaced', 'validated', 'discarded', 'loaded', 'replayed',
  'conflict', 'not-found', 'forbidden', 'invalid', 'idempotency-conflict',
]);

export class BookAssemblyClientError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'BookAssemblyClientError';
  }
}

export interface AssemblyClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export interface CreateAssemblyCandidateInput {
  readonly operationId: string;
  readonly bookId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly unitKey: string;
  readonly manifest: BookAssemblyManifestCandidate;
}

export interface ReplaceAssemblyCandidateInput extends CreateAssemblyCandidateInput {
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
}

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookAssemblyClientError(`invalid_${label}`, 0);
  }
  return value;
};
const safeOperationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) {
    throw new BookAssemblyClientError('invalid_operation_id', 0);
  }
  return value;
};
const safeRevision = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BookAssemblyClientError(`invalid_${label}`, 0);
  }
  return value as number;
};
const body = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new BookAssemblyClientError('response_too_large', 502);
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not_record');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BookAssemblyClientError('invalid_response', 502);
  }
};
const result = (value: Record<string, unknown>): BookAssemblyMutationResult => {
  const receipt = value.receipt;
  if (typeof value.status !== 'string'
    || !RESULT_STATUSES.has(value.status as BookAssemblyMutationResult['status'])
    || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new BookAssemblyClientError('invalid_response', 502);
  }
  const receiptRecord = receipt as Record<string, unknown>;
  if (typeof receiptRecord.operationId !== 'string'
    || typeof receiptRecord.fingerprint !== 'string'
    || typeof receiptRecord.status !== 'string'
    || !RESULT_STATUSES.has(receiptRecord.status as BookAssemblyMutationResult['status'])
    || typeof receiptRecord.createdAt !== 'string') {
    throw new BookAssemblyClientError('invalid_response', 502);
  }
  return value as unknown as BookAssemblyMutationResult;
};

export const createBookAssemblyClient = (options: AssemblyClientOptions) => {
  const base = (() => {
    let url: URL;
    try { url = new URL(options.baseUrl.trim()); } catch {
      throw new BookAssemblyClientError('unavailable', 0);
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new BookAssemblyClientError('unavailable', 0);
    }
    return url.href.replace(/\/$/u, '');
  })();
  const request = async (
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    payload: Record<string, unknown>,
  ): Promise<BookAssemblyMutationResult> => {
    const token = (await options.getIdToken()).trim();
    if (!token) throw new BookAssemblyClientError('unauthorized', 401);
    const url = `${base}${path}`;
    const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
      method,
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': String(payload.operationId ?? ''),
      },
      body: JSON.stringify(payload),
    });
    if (response.redirected || (response.url && response.url !== url)) {
      throw new BookAssemblyClientError('response_binding_mismatch', 502);
    }
    const parsed = await body(response);
    if (!response.ok) {
      throw new BookAssemblyClientError(
        typeof parsed.code === 'string' ? parsed.code : `http_${response.status}`,
        response.status,
      );
    }
    return result(parsed);
  };
  const validateCreateInput = (input: CreateAssemblyCandidateInput): void => {
    safeOperationId(input.operationId);
    safeId(input.bookId, 'book_id');
    safeId(input.unitKey, 'unit_key');
    safeRevision(input.expectedBookRevision, 'expected_book_revision');
    safeRevision(input.expectedSourceSetRevision, 'expected_source_set_revision');
  };
  return {
    create(input: CreateAssemblyCandidateInput) {
      validateCreateInput(input);
      return request(`/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates`, 'POST', { ...input });
    },
    replace(input: ReplaceAssemblyCandidateInput) {
      validateCreateInput(input);
      safeId(input.candidateId, 'candidate_id');
      safeRevision(input.expectedCandidateRevision, 'expected_candidate_revision');
      return request(`/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates/${encodeURIComponent(input.candidateId)}`, 'PUT', { ...input });
    },
    validate(input: {
      readonly operationId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly candidateId: string;
      readonly expectedCandidateRevision: number;
    }) {
      safeOperationId(input.operationId);
      safeId(input.bookId, 'book_id');
      safeId(input.unitKey, 'unit_key');
      safeId(input.candidateId, 'candidate_id');
      safeRevision(input.expectedCandidateRevision, 'expected_candidate_revision');
      return request(`/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates/${encodeURIComponent(input.candidateId)}/validate`, 'POST', { ...input });
    },
    discard(input: {
      readonly operationId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly candidateId: string;
      readonly expectedCandidateRevision: number;
    }) {
      safeOperationId(input.operationId);
      safeId(input.bookId, 'book_id');
      safeId(input.unitKey, 'unit_key');
      safeId(input.candidateId, 'candidate_id');
      safeRevision(input.expectedCandidateRevision, 'expected_candidate_revision');
      return request(`/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates/${encodeURIComponent(input.candidateId)}`, 'DELETE', { ...input });
    },
    async load(bookId: string, unitKey: string, candidateId: string): Promise<{
      status: 'loaded';
      candidate: BookAssemblyCandidateRecord;
      conflict: Record<string, unknown> | null;
    }> {
      const token = (await options.getIdToken()).trim();
      safeId(bookId, 'book_id');
      safeId(unitKey, 'unit_key');
      safeId(candidateId, 'candidate_id');
      if (!token) throw new BookAssemblyClientError('unauthorized', 401);
      const url = `${base}/book-assembly/books/${encodeURIComponent(bookId)}/units/${encodeURIComponent(unitKey)}/candidates/${encodeURIComponent(candidateId)}`;
      const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.redirected || (response.url && response.url !== url)) {
        throw new BookAssemblyClientError('response_binding_mismatch', 502);
      }
      const parsed = await body(response);
      if (!response.ok || parsed.status !== 'loaded' || !parsed.candidate) {
        throw new BookAssemblyClientError(
          typeof parsed.code === 'string' ? parsed.code : `http_${response.status}`,
          response.status,
        );
      }
      return parsed as unknown as {
        status: 'loaded';
        candidate: BookAssemblyCandidateRecord;
        conflict: Record<string, unknown> | null;
      };
    },
  };
};
