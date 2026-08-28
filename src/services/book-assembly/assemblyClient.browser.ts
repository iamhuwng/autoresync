import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookAssemblyPublicationPointer,
  BookAssemblySourceStrategySuccessorImpact,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';
import type { SourceStrategyMigrationRemap } from './sourceStrategyMigration.service';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from './unitAssembly.types';
import type { LoadedCurrentAssemblyDraft } from './unitAssembly.repository';
import type { BookAssemblyPublicationStatus } from './publicationTransaction.service';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RESPONSE_BYTES = 1_200_000;
const RESULT_STATUSES = new Set<BookAssemblyMutationResult['status']>([
  'created', 'replaced', 'validated', 'discarded', 'loaded', 'replayed',
  'conflict', 'not-found', 'forbidden', 'invalid', 'idempotency-conflict',
]);
const PUBLICATION_STATUSES = new Set<BookAssemblyPublicationStatus>([
  'published', 'replayed', 'rolled-back', 'conflict', 'invalid',
  'idempotency-conflict', 'not-found', 'forbidden',
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

export interface MigrateAssemblySourceStrategyInput {
  readonly operationId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly expectedCandidateRevision: number;
  readonly targetSourceSetRevision: number;
  readonly targetSourceSet: SourceSetCandidate;
  readonly remaps?: readonly SourceStrategyMigrationRemap[];
}

export interface ConfirmAssemblySourceStrategyMigrationInput {
  readonly operationId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly migrationCandidateId: string;
  readonly expectedCurrentCandidateId: string;
  readonly expectedCurrentCandidateRevision: number;
  readonly expectedMigrationCandidateRevision: number;
}

export interface DiscardAssemblySourceStrategyMigrationInput {
  readonly operationId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly migrationCandidateId: string;
  readonly expectedCurrentCandidateId: string;
  readonly expectedCurrentCandidateRevision: number;
  readonly expectedMigrationCandidateRevision: number;
}

export interface BookAssemblyMigrationClient {
  migrate(input: MigrateAssemblySourceStrategyInput): Promise<BookAssemblyMutationResult>;
  confirm(input: ConfirmAssemblySourceStrategyMigrationInput): Promise<BookAssemblyMutationResult>;
  discardMigration(input: DiscardAssemblySourceStrategyMigrationInput): Promise<BookAssemblyMutationResult>;
}

export interface PublishSourceStrategySuccessorInput {
  readonly operationId: string;
  readonly bookId: string;
  readonly expectedCurrentPublicationId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly targetSourceSetRevision: number;
  readonly targetSourceSet: SourceSetCandidate;
  readonly remaps?: readonly SourceStrategyMigrationRemap[];
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
}

export interface BookAssemblySourceStrategySuccessorResult {
  readonly status: BookAssemblyPublicationStatus;
  readonly pointer?: BookAssemblyPublicationPointer;
  readonly version?: BookAssemblyImmutableManifestVersion;
  readonly impact?: BookAssemblySourceStrategySuccessorImpact;
  readonly failureCode?: string;
}

export interface BookAssemblySourceStrategySuccessorClient {
  publishSuccessor(input: PublishSourceStrategySuccessorInput): Promise<BookAssemblySourceStrategySuccessorResult>;
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
const savedActivityKeysByUnit = (value: unknown): Readonly<Record<string, readonly string[]>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookAssemblyClientError('invalid_response', 502);
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([unitKey, activityKeys]) => {
    safeId(unitKey, 'unit_key');
    if (!Array.isArray(activityKeys)) throw new BookAssemblyClientError('invalid_response', 502);
    return [unitKey, activityKeys.map((activityKey) => safeId(activityKey, 'activity_key'))];
  }));
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
const publicationResult = (value: Record<string, unknown>): BookAssemblySourceStrategySuccessorResult => {
  if (typeof value.status !== 'string'
    || !PUBLICATION_STATUSES.has(value.status as BookAssemblyPublicationStatus)) {
    throw new BookAssemblyClientError('invalid_response', 502);
  }
  return value as unknown as BookAssemblySourceStrategySuccessorResult;
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
  const requestPublication = async (
    path: string,
    payload: PublishSourceStrategySuccessorInput,
  ): Promise<BookAssemblySourceStrategySuccessorResult> => {
    const token = (await options.getIdToken()).trim();
    if (!token) throw new BookAssemblyClientError('unauthorized', 401);
    const url = `${base}${path}`;
    const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.operationId,
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
    return publicationResult(parsed);
  };
  const validateCreateInput = (input: CreateAssemblyCandidateInput): void => {
    safeOperationId(input.operationId);
    safeId(input.bookId, 'book_id');
    safeId(input.unitKey, 'unit_key');
    safeRevision(input.expectedBookRevision, 'expected_book_revision');
    safeRevision(input.expectedSourceSetRevision, 'expected_source_set_revision');
  };
  const validateMigrationInput = (input: MigrateAssemblySourceStrategyInput): void => {
    safeOperationId(input.operationId);
    safeId(input.bookId, 'book_id');
    safeId(input.unitKey, 'unit_key');
    safeId(input.candidateId, 'candidate_id');
    safeRevision(input.expectedBookRevision, 'expected_book_revision');
    safeRevision(input.expectedSourceSetRevision, 'expected_source_set_revision');
    safeRevision(input.expectedCandidateRevision, 'expected_candidate_revision');
    safeRevision(input.targetSourceSetRevision, 'target_source_set_revision');
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
    migrate(input: MigrateAssemblySourceStrategyInput) {
      validateMigrationInput(input);
      return request(`/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/migrations`, 'POST', { ...input });
    },
    confirm(input: ConfirmAssemblySourceStrategyMigrationInput) {
      safeOperationId(input.operationId);
      safeId(input.bookId, 'book_id');
      safeId(input.unitKey, 'unit_key');
      safeId(input.migrationCandidateId, 'migration_candidate_id');
      safeId(input.expectedCurrentCandidateId, 'expected_current_candidate_id');
      safeRevision(input.expectedCurrentCandidateRevision, 'expected_current_candidate_revision');
      safeRevision(input.expectedMigrationCandidateRevision, 'expected_migration_candidate_revision');
      const { bookId, unitKey, migrationCandidateId, ...payload } = input;
      return request(`/book-assembly/books/${encodeURIComponent(bookId)}/units/${encodeURIComponent(unitKey)}/migrations/${encodeURIComponent(migrationCandidateId)}/confirm`, 'POST', payload);
    },
    discardMigration(input: DiscardAssemblySourceStrategyMigrationInput) {
      safeOperationId(input.operationId);
      safeId(input.bookId, 'book_id');
      safeId(input.unitKey, 'unit_key');
      safeId(input.migrationCandidateId, 'migration_candidate_id');
      safeId(input.expectedCurrentCandidateId, 'expected_current_candidate_id');
      safeRevision(input.expectedCurrentCandidateRevision, 'expected_current_candidate_revision');
      safeRevision(input.expectedMigrationCandidateRevision, 'expected_migration_candidate_revision');
      const { bookId, unitKey, migrationCandidateId, ...payload } = input;
      return request(`/book-assembly/books/${encodeURIComponent(bookId)}/units/${encodeURIComponent(unitKey)}/migrations/${encodeURIComponent(migrationCandidateId)}`, 'DELETE', payload);
    },
    publishSuccessor(input: PublishSourceStrategySuccessorInput) {
      safeOperationId(input.operationId);
      safeId(input.bookId, 'book_id');
      safeId(input.expectedCurrentPublicationId, 'expected_current_publication_id');
      safeRevision(input.expectedBookRevision, 'expected_book_revision');
      safeRevision(input.expectedSourceSetRevision, 'expected_source_set_revision');
      safeRevision(input.targetSourceSetRevision, 'target_source_set_revision');
      return requestPublication('/book-assembly/source-strategy-successors', input);
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
    async loadCurrent(bookId: string, unitKey: string): Promise<LoadedCurrentAssemblyDraft | null> {
      const token = (await options.getIdToken()).trim();
      safeId(bookId, 'book_id');
      safeId(unitKey, 'unit_key');
      if (!token) throw new BookAssemblyClientError('unauthorized', 401);
      const url = `${base}/book-assembly/books/${encodeURIComponent(bookId)}/units/${encodeURIComponent(unitKey)}/current`;
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
      if (!response.ok || (parsed.status !== 'loaded' && parsed.status !== 'empty')) {
        throw new BookAssemblyClientError(
          typeof parsed.code === 'string' ? parsed.code : `http_${response.status}`,
          response.status,
        );
      }
      if (parsed.status === 'empty') return null;
      if (!parsed.candidate || typeof parsed.candidate !== 'object' || Array.isArray(parsed.candidate)) {
        throw new BookAssemblyClientError('invalid_response', 502);
      }
      return {
        candidate: parsed.candidate as BookAssemblyCandidateRecord,
        savedActivityKeysByUnit: savedActivityKeysByUnit(parsed.savedActivityKeysByUnit),
      };
    },
  };
};
