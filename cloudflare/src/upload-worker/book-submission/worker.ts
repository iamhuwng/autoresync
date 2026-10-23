import type {
  BookSubmissionBeginResult,
  BookSubmissionCancelResult,
  BookSubmissionCommitResult,
  BookSubmissionOperation,
  BookSubmissionSourceReceipt,
  BookSubmissionStatusResult,
} from '../../../../src/services/materialCatalog/bookSubmission.contract.ts';
import type { PreparedComponentPdfArtifact } from './component-preparation.ts';

export interface BookSubmissionRepository {
  begin(input: { ownerId: string; fingerprint: string; idempotencyKey: string }): Promise<BookSubmissionBeginResult>;
  status(input: { ownerId: string; operationId: string }): Promise<BookSubmissionStatusResult>;
  cancel(input: { ownerId: string; operationId: string }): Promise<BookSubmissionCancelResult>;
  commit(input: {
    ownerId: string;
    operationId: string;
    fingerprint: string;
    commit: (operation: BookSubmissionOperation, preparedComponent?: PreparedComponentPdfArtifact) => Promise<void>;
  }): Promise<BookSubmissionCommitResult>;
  /** Client-driven heavy preparation. The artifact is persisted by the repository before it is returned. */
  prepareComponent?(input: {
    ownerId: string;
    operationId: string;
    fingerprint: string;
    prepare: (operation: BookSubmissionOperation) => Promise<PreparedComponentPdfArtifact>;
  }): Promise<{ status: 'prepared' | 'replayed'; operation: BookSubmissionOperation; artifact: PreparedComponentPdfArtifact }>;
}

export interface BookSubmissionCommitAdapterInput {
  readonly operation: BookSubmissionOperation;
  readonly payload: Record<string, unknown>;
  readonly request: Request;
  readonly env: Record<string, unknown>;
  readonly uid: string;
  readonly preparedComponent?: PreparedComponentPdfArtifact;
}
export type BookSubmissionCommitAdapter = (input: BookSubmissionCommitAdapterInput) => Promise<void>;

export interface BookSubmissionCommitAdapterOptions {
  readonly readSourceReceipt: (input: {
    readonly uid: string;
    readonly operation: BookSubmissionOperation;
    readonly receipt: BookSubmissionSourceReceipt;
    readonly env: BookSubmissionWorkerEnv;
  }) => Promise<boolean>;
}

export const createBookSubmissionCommitAdapter = (
  options: BookSubmissionCommitAdapterOptions,
): BookSubmissionCommitAdapter => async (input) => {
  const metadata = input.payload.metadata;
  if (metadata !== undefined && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
    throw new BookSubmissionWorkerError('book_submission_metadata_invalid', 409);
  }
  const receipts = input.payload.sourceReceipts;
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw new BookSubmissionWorkerError('book_submission_source_receipts_required', 409);
  }
  for (const value of receipts) {
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
    if (!candidate || Object.keys(candidate).some((key) => ![
      'sourceKey', 'sourceVersionId', 'purpose', 'sha256Hex', 'byteSize', 'physicalPageCount',
      'verifiedUsable', 'studentSafeStatus',
    ].includes(key)) || typeof candidate.sourceKey !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u.test(candidate.sourceKey)
      || typeof candidate.sourceVersionId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(candidate.sourceVersionId)
      || (candidate.purpose !== 'book-source' && candidate.purpose !== 'student-document')
      || typeof candidate.sha256Hex !== 'string' || !/^[a-f0-9]{64}$/iu.test(candidate.sha256Hex)
      || !Number.isSafeInteger(candidate.byteSize) || (candidate.byteSize as number) <= 0
      || !Number.isSafeInteger(candidate.physicalPageCount) || (candidate.physicalPageCount as number) <= 0
      || candidate.verifiedUsable !== true || candidate.studentSafeStatus !== 'ready'
      || !(await options.readSourceReceipt({ uid: input.uid, operation: input.operation,
        receipt: candidate as unknown as BookSubmissionSourceReceipt, env: input.env }))) {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
  }
};

export interface BookSubmissionWorkerEnv extends Record<string, unknown> {
  readonly FIREBASE_DB_URL?: unknown;
  readonly BOOK_SUBMISSION_SERVICE_IDENTITY?: unknown;
  readonly BOOK_SUBMISSION_GOOGLE_SA_KEY?: unknown;
}

export class BookSubmissionWorkerError extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super(code);
    this.name = 'BookSubmissionWorkerError';
  }
}

const CONTRACT_ERROR_STATUS: Record<string, number> = {
  invalid_input: 400,
  operation_not_found: 404,
  operation_owner_mismatch: 403,
  idempotency_conflict: 409,
  invalid_transition: 409,
};

const errorResult = (error: unknown): { body: { code: string }; init: ResponseInit } => {
  if (error instanceof BookSubmissionWorkerError) return { body: { code: error.code }, init: { status: error.status } };
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  console.error(JSON.stringify({ event: 'book_submission_error', code: code || 'book_submission_unavailable', name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message.slice(0, 240) : 'unknown' }));
  return { body: { code: code || 'book_submission_unavailable' }, init: { status: CONTRACT_ERROR_STATUS[code] ?? 503 } };
};

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
);

const body = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookSubmissionWorkerError('invalid_input', 400);
  }
  let value: unknown;
  try { value = await request.json(); } catch { throw new BookSubmissionWorkerError('invalid_input', 400); }
  const parsed = record(value);
  if (!parsed) throw new BookSubmissionWorkerError('invalid_input', 400);
  return parsed;
};

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const expected = new Set(allowed);
  return Object.keys(value).every((key) => expected.has(key));
};

const operationId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value)) {
    throw new BookSubmissionWorkerError('invalid_input', 400);
  }
  return value;
};

const fingerprint = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) {
    throw new BookSubmissionWorkerError('invalid_input', 400);
  }
  return value.toLowerCase();
};

const idempotency = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256
    || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value)) {
    throw new BookSubmissionWorkerError('invalid_input', 400);
  }
  return value;
};

export interface BookSubmissionWorkerOptions {
  readonly repository?: BookSubmissionRepository;
  readonly repositoryFactory?: (env: BookSubmissionWorkerEnv) => Promise<BookSubmissionRepository> | BookSubmissionRepository;
  readonly commitAdapter?: BookSubmissionCommitAdapter;
  readonly componentPreparationAdapter?: (input: {
    readonly operation: BookSubmissionOperation;
    readonly payload: Record<string, unknown>;
    readonly request: Request;
    readonly env: BookSubmissionWorkerEnv;
    readonly uid: string;
  }) => Promise<PreparedComponentPdfArtifact>;
}

export const createBookSubmissionWorkerHandlers = (options: BookSubmissionWorkerOptions = {}) => {
  const repository = async (env: BookSubmissionWorkerEnv) => {
    if (options.repository) return options.repository;
    if (options.repositoryFactory) return options.repositoryFactory(env);
    throw new BookSubmissionWorkerError('book_submission_repository_unavailable', 503);
  };
  const commit = options.commitAdapter ?? (async () => {
    throw new BookSubmissionWorkerError('book_submission_commit_unavailable', 503);
  });
  const prepareComponent = options.componentPreparationAdapter;
  return {
    async begin(input: { request: Request; env: BookSubmissionWorkerEnv; uid: string }) {
      try {
        const value = await body(input.request);
        if (!exactKeys(value, ['fingerprint', 'idempotencyKey'])) throw new BookSubmissionWorkerError('invalid_input', 400);
        const result = await (await repository(input.env)).begin({
          ownerId: input.uid,
          fingerprint: fingerprint(value.fingerprint),
          idempotencyKey: idempotency(value.idempotencyKey),
        });
        return { body: result };
      } catch (error) { return errorResult(error); }
    },
    async status(input: { request: Request; env: BookSubmissionWorkerEnv; uid: string; operationId: string }) {
      try {
        const result = await (await repository(input.env)).status({ ownerId: input.uid, operationId: operationId(input.operationId) });
        return { body: result };
      } catch (error) { return errorResult(error); }
    },
    async cancel(input: { request: Request; env: BookSubmissionWorkerEnv; uid: string; operationId: string }) {
      try {
        const value = await body(input.request);
        if (Object.keys(value).length !== 0) throw new BookSubmissionWorkerError('invalid_input', 400);
        const result = await (await repository(input.env)).cancel({ ownerId: input.uid, operationId: operationId(input.operationId) });
        return { body: result };
      } catch (error) { return errorResult(error); }
    },
    async commit(input: { request: Request; env: BookSubmissionWorkerEnv; uid: string; operationId: string }) {
      try {
        const value = await body(input.request);
        if (!exactKeys(value, ['fingerprint', 'metadata', 'authoring', 'sourceReceipts'])
          || value.authoring === undefined || value.sourceReceipts === undefined) {
          throw new BookSubmissionWorkerError('invalid_input', 400);
        }
        const result = await (await repository(input.env)).commit({
          ownerId: input.uid,
          operationId: operationId(input.operationId),
          fingerprint: fingerprint(value.fingerprint),
          commit: (operation, preparedComponent) => commit({ operation, payload: value, request: input.request, env: input.env, uid: input.uid,
            ...(preparedComponent ? { preparedComponent } : {}) }),
        });
        return { body: result };
      } catch (error) { return errorResult(error); }
    },
    async prepareComponent(input: { request: Request; env: BookSubmissionWorkerEnv; uid: string; operationId: string }) {
      try {
        if (!prepareComponent) throw new BookSubmissionWorkerError('book_submission_component_preparation_unavailable', 503);
        const value = await body(input.request);
        const authoring = record(value.authoring);
        if (!exactKeys(value, ['fingerprint', 'authoring', 'sourceReceipts', 'descriptorRevision'])
          || !authoring || authoring.strategy !== 'component'
          || !Array.isArray(value.sourceReceipts) || value.sourceReceipts.length === 0
          || !Number.isSafeInteger(value.descriptorRevision) || (value.descriptorRevision as number) < 1) {
          throw new BookSubmissionWorkerError('invalid_input', 400);
        }
        const repositoryValue = await (await repository(input.env)).prepareComponent?.({
          ownerId: input.uid,
          operationId: operationId(input.operationId),
          fingerprint: fingerprint(value.fingerprint),
          prepare: (operation) => prepareComponent({ operation, payload: value, request: input.request, env: input.env, uid: input.uid }),
        });
        if (!repositoryValue) throw new BookSubmissionWorkerError('book_submission_component_preparation_unavailable', 503);
        return { body: repositoryValue };
      } catch (error) { return errorResult(error); }
    },
  };
};
