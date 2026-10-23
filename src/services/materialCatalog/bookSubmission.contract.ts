/**
 * Operation-bound finalisation contract for locally authored PDF Books.
 *
 * This is deliberately provider-neutral. The Worker/auth composition can bind
 * the owner at its trusted boundary without accepting ownership from a client
 * payload or creating a canonical Book before commit.
 */

export const BOOK_SUBMISSION_SCHEMA_VERSION = 1 as const;
export const BOOK_SUBMISSION_FINGERPRINT = /^[a-f0-9]{64}$/iu;
export const BOOK_SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export const BOOK_SUBMISSION_STEPS = ['begin', 'status', 'cancel', 'commit'] as const;
export type BookSubmissionStep = (typeof BOOK_SUBMISSION_STEPS)[number];

export const BOOK_SUBMISSION_STATES = [
  'preparing',
  'committing',
  'committed',
  'canceled',
] as const;
export type BookSubmissionState = (typeof BOOK_SUBMISSION_STATES)[number];

export interface BookSubmissionBeginRequest {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

/** Trusted upload facts supplied at commit and rechecked by the Worker. */
export interface BookSubmissionSourceReceipt {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly purpose: 'book-source' | 'student-document';
  readonly sha256Hex: string;
  readonly byteSize: number;
  readonly physicalPageCount: number;
  readonly verifiedUsable: true;
  readonly studentSafeStatus: 'ready';
}

export interface BookSubmissionAuthoringPayload {
  readonly strategy: 'full' | 'component';
  readonly pdfs: readonly Readonly<Record<string, unknown>>[];
  readonly structureJson: string;
  readonly unitsJson: string;
  readonly pageMappingJson: string;
  readonly pdfPageCounts: Readonly<Record<string, number>>;
}

export interface BookSubmissionCommitRequest {
  readonly fingerprint: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly sourceReceipts?: readonly BookSubmissionSourceReceipt[];
  readonly authoring: BookSubmissionAuthoringPayload;
}

export interface BookSubmissionComponentPreparationRequest {
  readonly fingerprint: string;
  readonly authoring: BookSubmissionAuthoringPayload;
  readonly sourceReceipts: readonly BookSubmissionSourceReceipt[];
  readonly descriptorRevision: number;
}

export interface BookSubmissionOperation {
  readonly schemaVersion: typeof BOOK_SUBMISSION_SCHEMA_VERSION;
  readonly operationId: string;
  readonly ownerId: string;
  /** Allocated once at begin; it is not a canonical Book until commit succeeds. */
  readonly finalBookId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly state: BookSubmissionState;
  readonly completedSteps: readonly BookSubmissionStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Short-lived durable finalization fence. */
  readonly commitLeaseId?: string;
  readonly commitLeaseExpiresAt?: number;
  readonly committedAt?: string;
  readonly canceledAt?: string;
}

export interface BookSubmissionCommitReceipt {
  readonly status: 'committed';
  readonly operationId: string;
  readonly ownerId: string;
  readonly finalBookId: string;
  readonly fingerprint: string;
  readonly committedAt: string;
}

export interface BookSubmissionBeginResult {
  readonly status: 'created' | 'replayed';
  readonly operation: BookSubmissionOperation;
}

export interface BookSubmissionStatusResult {
  readonly status: 'preparing' | 'committing' | 'committed' | 'canceled' | 'replayed';
  readonly operation: BookSubmissionOperation;
  readonly receipt?: BookSubmissionCommitReceipt;
}

export interface BookSubmissionCancelResult {
  readonly status: 'canceled' | 'replayed';
  readonly operation: BookSubmissionOperation;
}

export interface BookSubmissionCommitResult {
  readonly status: 'committed' | 'replayed';
  readonly operation: BookSubmissionOperation;
  readonly receipt: BookSubmissionCommitReceipt;
}

export type BookSubmissionOperationResult =
  | BookSubmissionBeginResult
  | BookSubmissionStatusResult
  | BookSubmissionCancelResult
  | BookSubmissionCommitResult;

export type BookSubmissionErrorCode =
  | 'invalid_input'
  | 'operation_not_found'
  | 'operation_owner_mismatch'
  | 'idempotency_conflict'
  | 'invalid_transition';

export class BookSubmissionContractError extends Error {
  constructor(public readonly code: BookSubmissionErrorCode) {
    super(`book_submission_${code}`);
    this.name = 'BookSubmissionContractError';
  }
}

export const assertBookSubmissionId = (value: unknown, code = 'invalid_input'): string => {
  if (typeof value !== 'string' || !BOOK_SUBMISSION_ID.test(value)) {
    throw new BookSubmissionContractError(code as BookSubmissionErrorCode);
  }
  return value;
};

export const normalizeBookSubmissionFingerprint = (value: unknown): string => {
  if (typeof value !== 'string' || !BOOK_SUBMISSION_FINGERPRINT.test(value)) {
    throw new BookSubmissionContractError('invalid_input');
  }
  return value.toLowerCase();
};

export const assertBookSubmissionIdempotencyKey = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256
    || !BOOK_SUBMISSION_ID.test(value)) {
    throw new BookSubmissionContractError('invalid_input');
  }
  return value;
};

export const cloneBookSubmissionOperation = (
  operation: BookSubmissionOperation,
): BookSubmissionOperation => Object.freeze({
  ...operation,
  completedSteps: Object.freeze([...operation.completedSteps]),
});

export const cloneBookSubmissionReceipt = (
  receipt: BookSubmissionCommitReceipt,
): BookSubmissionCommitReceipt => Object.freeze({ ...receipt });
