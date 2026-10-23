import type { BookSourceUploadAccountState, BookSourceUploadOperation, CanceledSubmissionRetirementGuard } from '../../../../src/types/bookSource.types.ts';
import { SourceUploadControlError } from '../../../../src/services/book-source-delivery/sourceUpload.service.ts';

export interface CanceledBookCreationFence {
  readonly bookId: string;
  readonly ownerId: string;
  readonly submissionOperationId: string;
  readonly inputFingerprint: string;
}

interface RetirementAuthority {
  readValue(path: string): Promise<unknown>;
  readWithEtag<T>(path: string): Promise<{ data: T; etag: string }>;
  writeIfMatch(path: string, value: unknown, etag: string): Promise<boolean>;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const id = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,255}$/u;
function denied(): never { throw new SourceUploadControlError('authority_denied'); }
const sameFence = (value: unknown, fence: CanceledBookCreationFence): boolean => {
  const row = record(value);
  return row !== null && Object.keys(row).length === 4
    && row.bookId === fence.bookId && row.ownerId === fence.ownerId
    && row.submissionOperationId === fence.submissionOperationId && row.inputFingerprint === fence.inputFingerprint;
};

/** Permanently blocks reuse of the canceled Book ID before any source bytes can be deleted. */
export const fenceCanceledSubmissionBook = async (
  rtdb: RetirementAuthority,
  operation: BookSourceUploadOperation,
): Promise<CanceledSubmissionRetirementGuard> => {
  const { bookId, ownerId, sourceVersionId, submissionOperationId } = operation;
  if (![bookId, ownerId, sourceVersionId, submissionOperationId].every((value) => typeof value === 'string' && id.test(value))) denied();
  const submission = record(await rtdb.readValue(`book_submission_operations/${ownerId}/operations/${submissionOperationId}`));
  if (!submission || submission.operationId !== submissionOperationId || submission.ownerId !== ownerId
    || submission.finalBookId !== bookId || submission.state !== 'canceled'
    || typeof submission.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(submission.fingerprint)) denied();
  const fence: CanceledBookCreationFence = { bookId, ownerId, submissionOperationId: submissionOperationId!, inputFingerprint: submission.fingerprint as string };
  const path = `material_catalog/book_creation_fences/${bookId}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await rtdb.readWithEtag<unknown>(path);
    if (current.data !== null) {
      if (!sameFence(current.data, fence)) denied();
      break;
    }
    if (await rtdb.writeIfMatch(path, fence, current.etag)) break;
    if (attempt === 2) denied();
  }
  // Read after the immutable fence: any earlier Book creation must now be visible.
  const references = await Promise.all([
    rtdb.readValue(`material_catalog/books/${bookId}`),
    rtdb.readValue(`book_assembly_publications/books/${bookId}`),
    rtdb.readValue(`book_delivery/current/${bookId}`),
  ]);
  if (references.some((value) => value !== null)) denied();
  return { kind: 'canceled-submission', ...fence, sourceVersionId,
    deletionId: `canceled-${operation.reservationId}` };
};

/** Cleanup retries must still prove the terminal parent, immutable fence and absence of a Book. */
export const authorizesCanceledSubmissionRetirement = async (
  readValue: RetirementAuthority['readValue'],
  operation: BookSourceUploadOperation,
): Promise<boolean> => {
  const guard = operation.retirementGuard;
  if (!guard || !('kind' in guard) || guard.kind !== 'canceled-submission'
    || guard.bookId !== operation.bookId || guard.ownerId !== operation.ownerId
    || guard.submissionOperationId !== operation.submissionOperationId || guard.sourceVersionId !== operation.sourceVersionId) return false;
  const [submission, fence, book, publication, delivery] = await Promise.all([
    readValue(`book_submission_operations/${guard.ownerId}/operations/${guard.submissionOperationId}`),
    readValue(`material_catalog/book_creation_fences/${guard.bookId}`),
    readValue(`material_catalog/books/${guard.bookId}`),
    readValue(`book_assembly_publications/books/${guard.bookId}`),
    readValue(`book_delivery/current/${guard.bookId}`),
  ]);
  const parent = record(submission);
  return book === null && publication === null && delivery === null
    && sameFence(fence, guard) && parent?.state === 'canceled'
    && parent.operationId === guard.submissionOperationId && parent.ownerId === guard.ownerId
    && parent.finalBookId === guard.bookId && parent.fingerprint === guard.inputFingerprint;
};

/** Bounds parent reads and advances past a rejected source so it cannot starve other canceled uploads. */
export const findCanceledSubmissionSource = async (
  state: BookSourceUploadAccountState,
  at: Date,
  readValue: RetirementAuthority['readValue'],
): Promise<{ readonly operation?: BookSourceUploadOperation; readonly afterReservationId?: string }> => {
  const candidates = Object.values(state.operations).filter((operation) => operation.submissionOperationId !== undefined
    && (operation.status === 'verified_completed'
      ? Date.parse(operation.expiresAt) <= at.getTime()
      : operation.cleanup !== undefined && Date.parse(operation.cleanup.nextRetryAt) <= at.getTime()));
  candidates.sort((left, right) => left.reservationId.localeCompare(right.reservationId));
  const after = state.canceledSubmissionScanAfterReservationId;
  const ordered = [...candidates.filter((source) => after === undefined || source.reservationId > after),
    ...candidates.filter((source) => after !== undefined && source.reservationId <= after)].slice(0, 4);
  for (const operation of ordered) {
    const parent = record(await readValue(`book_submission_operations/${operation.ownerId}/operations/${operation.submissionOperationId}`));
    if (parent?.state === 'canceled' && parent.ownerId === operation.ownerId
      && parent.operationId === operation.submissionOperationId && parent.finalBookId === operation.bookId
      && typeof parent.fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(parent.fingerprint)) {
      return { operation, afterReservationId: operation.reservationId };
    }
  }
  return ordered.length ? { afterReservationId: ordered.at(-1)!.reservationId } : {};
};
