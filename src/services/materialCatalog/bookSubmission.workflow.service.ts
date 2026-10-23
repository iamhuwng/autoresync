import type {
  BookSubmissionAuthoringPayload,
  BookSubmissionCommitReceipt,
  BookSubmissionOperation,
  BookSubmissionSourceReceipt,
  BookSubmissionStatusResult,
} from './bookSubmission.contract.ts';
import type {
  LocalBookAuthoringDraft,
  LocalBookPdfDescriptor,
  LocalBookSubmissionUpload,
} from './localBookAuthoring.service';
import {
  loadLocalBookAuthoringPdf,
  loadLocalBookAuthoringDraft,
  saveLocalBookAuthoringDraft,
  discardLocalBookAuthoringDraft,
} from './localBookAuthoring.service';
import {
  computeBookSubmissionFingerprint,
  normalizeBookSubmissionMetadata,
} from './bookSubmissionInput.service';
import type { SourcePdfInspectionClaim } from '../book-source-delivery/sourcePdfInspection.browser';
import type { createBookSubmissionClient } from './bookSubmission.client';
import type { BeginSourceUploadResult, SourceUploadLifecycleStatus, createSourceUploadClient } from '../book-source-delivery/sourceUpload.client';
import { SourceUploadClientError } from '../book-source-delivery/sourceUpload.client';
import { sourceUploadReservationId } from '../book-source-delivery/sourceUpload.protocol';

type SubmissionClient = ReturnType<typeof createBookSubmissionClient>;

type SourceClient = Pick<ReturnType<typeof createSourceUploadClient>, 'begin' | 'status' | 'complete' | 'decideStudentSafeSource' | 'requestCancellation' | 'reconcile'>;

export interface BookSubmissionWorkflowOptions {
  readonly ownerId: string;
  readonly draft: LocalBookAuthoringDraft;
  readonly submission: SubmissionClient;
  readonly source: SourceClient;
  readonly inspectSourcePdf: (file: File, options: { purpose: 'book-source' }) => Promise<SourcePdfInspectionClaim>;
  readonly uploadSourcePdf: (input: {
    file: File;
    claim: SourcePdfInspectionClaim;
    authority: BeginSourceUploadResult['upload'];
  }) => Promise<void>;
  readonly loadPdf?: typeof loadLocalBookAuthoringPdf;
  readonly saveDraft?: typeof saveLocalBookAuthoringDraft;
  readonly discardDraft?: typeof discardLocalBookAuthoringDraft;
}

export interface BookSubmissionWorkflowResult {
  readonly receipt: BookSubmissionCommitReceipt;
  readonly cleanupPending: boolean;
}

export interface BookSubmissionCleanupRetryOptions {
  readonly ownerId: string;
  readonly draft: LocalBookAuthoringDraft;
  readonly saveDraft?: typeof saveLocalBookAuthoringDraft;
  readonly discardDraft?: typeof discardLocalBookAuthoringDraft;
}

type PreparedInput = {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly authoring: BookSubmissionAuthoringPayload;
  readonly fingerprint: string;
  readonly files: ReadonlyMap<string, File>;
  readonly claims: Readonly<Record<string, SourcePdfInspectionClaim>>;
};

const save = (options: BookSubmissionWorkflowOptions, draft: LocalBookAuthoringDraft, patch: Partial<LocalBookAuthoringDraft>) =>
  (options.saveDraft ?? saveLocalBookAuthoringDraft)(draft, patch);

const loadPdf = (options: BookSubmissionWorkflowOptions) => options.loadPdf ?? loadLocalBookAuthoringPdf;

const isOperationNotFound = (error: unknown): boolean => (
  error instanceof Error && /operation_not_found|http_404/u.test(error.message)
);

const sourceReceipt = (
  descriptor: LocalBookPdfDescriptor,
  claim: SourcePdfInspectionClaim,
  sourceVersionId: string,
  sha256Hex: string,
) : BookSubmissionSourceReceipt => ({
  sourceKey: descriptor.sourceKey,
  sourceVersionId,
  purpose: 'book-source' as const,
  sha256Hex,
  byteSize: claim.exactByteSize,
  physicalPageCount: claim.physicalPageCount,
  verifiedUsable: true as const,
  studentSafeStatus: 'ready' as const,
});

const frozenClaim = (draft: LocalBookAuthoringDraft, descriptor: LocalBookPdfDescriptor): SourcePdfInspectionClaim | undefined => {
  const pdf = draft.submission.authoring?.pdfs.find((entry) => entry.sourceKey === descriptor.sourceKey);
  if (!pdf || pdf.displayFilename !== descriptor.name || pdf.byteSize !== descriptor.size) return undefined;
  return {
    schemaVersion: 1, trust: 'browser-supplied-untrusted', state: 'complete',
    displayFilename: String(pdf.displayFilename), exactByteSize: Number(pdf.byteSize), sha256Hex: String(pdf.sha256Hex),
    physicalPageCount: Number(pdf.physicalPageCount), pdfType: 'application/pdf', readability: 'readable',
  };
};

const preparedAuthoring = (
  draft: LocalBookAuthoringDraft,
  claims: Readonly<Record<string, SourcePdfInspectionClaim>>,
): BookSubmissionAuthoringPayload => ({
  strategy: draft.strategy as 'full' | 'component',
  pdfs: draft.pdfs.map((descriptor) => {
    const claim = claims[descriptor.sourceKey];
    return {
      sourceKey: descriptor.sourceKey,
      displayFilename: claim.displayFilename,
      sha256Hex: claim.sha256Hex,
      byteSize: claim.exactByteSize,
      physicalPageCount: claim.physicalPageCount,
    };
  }),
  structureJson: draft.structureJson,
  unitsJson: draft.unitsJson,
  pageMappingJson: draft.pageMappingJson,
  pdfPageCounts: Object.fromEntries(Object.entries(claims).map(([key, claim]) => [key, claim.physicalPageCount])),
});

const prepare = async (options: BookSubmissionWorkflowOptions, draft: LocalBookAuthoringDraft): Promise<PreparedInput> => {
  const files = new Map<string, File>();
  const claims: Record<string, SourcePdfInspectionClaim> = {};
  for (const descriptor of draft.pdfs) {
    const file = await loadPdf(options)(draft.ownerId, draft.draftId, descriptor);
    if (file) {
      files.set(descriptor.id, file);
      claims[descriptor.sourceKey] = await options.inspectSourcePdf(file, { purpose: 'book-source' });
    } else {
      const claim = frozenClaim(draft, descriptor);
      if (!claim) throw new Error('book_submission_local_pdf_missing');
      claims[descriptor.sourceKey] = claim;
    }
  }
  const { bookMode: _bookMode, ...rawMetadata } = draft.metadata;
  const metadata = normalizeBookSubmissionMetadata(rawMetadata);
  const authoring = preparedAuthoring(draft, claims);
  const fingerprint = await computeBookSubmissionFingerprint(metadata, authoring);
  return { metadata, authoring, fingerprint, files, claims };
};

const cancelReservations = async (
  options: Pick<BookSubmissionWorkflowOptions, 'submission' | 'source'>,
  operation: BookSubmissionOperation | undefined,
  draft: LocalBookAuthoringDraft,
  uploads: readonly LocalBookSubmissionUpload[] | undefined,
): Promise<void> => {
  if (operation && operation.state !== 'committed' && operation.state !== 'canceled') {
    await options.submission.cancel(operation.operationId);
  }
  const cleanupUploads: Pick<LocalBookSubmissionUpload, 'operationId' | 'reservationId'>[] = [...(uploads ?? [])];
  if (operation && draft.strategy === 'component'
    && !cleanupUploads.some((upload) => upload.operationId === operation.operationId)) {
    // The server composes this PDF; it is not one of the browser's selected files.
    cleanupUploads.push({ operationId: operation.operationId });
  }
  for (const upload of cleanupUploads) {
    if (!operation) throw new Error('book_submission_cleanup_operation_missing');
    const reservationId = upload.reservationId
      ?? sourceUploadReservationId(draft.ownerId, operation.finalBookId, upload.operationId);
    let status: SourceUploadLifecycleStatus;
    try {
      status = await options.source.status({ bookId: operation.finalBookId, reservationId });
    } catch (error) {
      if (!upload.reservationId && error instanceof SourceUploadClientError && error.code === 'reservation_not_found') continue;
      throw error;
    }
    if (status.status === 'released') continue;
    await options.source.requestCancellation({ bookId: operation.finalBookId, reservationId });
    status = await options.source.status({ bookId: operation.finalBookId, reservationId });
    if (status.status === 'cleanup_pending' && Date.parse(status.nextRetryAt ?? '') > Date.now()) {
      throw new Error('book_submission_cleanup_pending');
    }
    if (status.status !== 'released') status = await options.source.reconcile({ bookId: operation.finalBookId, reservationId });
    if (status.status !== 'released') throw new Error('book_submission_cleanup_pending');
  }
};

const committed = async (
  options: BookSubmissionWorkflowOptions,
  draft: LocalBookAuthoringDraft,
  receipt: BookSubmissionCommitReceipt,
): Promise<BookSubmissionWorkflowResult> => {
  if (receipt.ownerId !== options.ownerId) throw new Error('book_submission_owner_mismatch');
  const marked = await save(options, draft, {
    submission: {
      ...draft.submission,
      state: 'committed',
      operationId: receipt.operationId,
      fingerprint: receipt.fingerprint,
      committedBookId: receipt.finalBookId,
      receipt,
      cleanupPending: false,
    },
  });
  try {
    await (options.discardDraft ?? discardLocalBookAuthoringDraft)(marked.ownerId, marked.draftId);
    return { receipt, cleanupPending: false };
  } catch {
    // Keep the committed marker. Resubmission would create a duplicate Book.
    try {
      await save(options, marked, { submission: { ...marked.submission, cleanupPending: true } });
    } catch {
      // Storage failure is reported by the caller; the server receipt remains authoritative.
    }
    return { receipt, cleanupPending: true };
  }
};

/** Retry local cleanup after the remote commit already returned a receipt. */
export const retryCommittedBookDraftCleanup = async (
  options: BookSubmissionCleanupRetryOptions,
): Promise<'released' | 'cleanup_pending'> => {
  const { draft } = options;
  const receipt = draft.submission.receipt;
  if (draft.ownerId !== options.ownerId || receipt?.ownerId !== options.ownerId) {
    throw new Error('book_submission_owner_mismatch');
  }
  if (draft.submission.state !== 'committed' || !receipt) {
    throw new Error('book_submission_receipt_missing');
  }

  try {
    await (options.discardDraft ?? discardLocalBookAuthoringDraft)(draft.ownerId, draft.draftId);
    return 'released';
  } catch {
    try {
      await (options.saveDraft ?? saveLocalBookAuthoringDraft)(draft, {
        submission: { ...draft.submission, cleanupPending: true },
      });
    } catch {
      // Keep the existing committed marker if local storage is unavailable.
    }
    return 'cleanup_pending';
  }
};

const runSubmitLocalBookDraft = async (
  options: BookSubmissionWorkflowOptions,
): Promise<BookSubmissionWorkflowResult> => {
  if (options.ownerId !== options.draft.ownerId) throw new Error('book_submission_owner_mismatch');
  let draft = options.draft;
  let existing: BookSubmissionStatusResult | null = null;

  if (draft.submission.state === 'committed' && draft.submission.receipt) {
    const cleanup = await retryCommittedBookDraftCleanup({
      ownerId: options.ownerId,
      draft,
      saveDraft: options.saveDraft,
      discardDraft: options.discardDraft,
    });
    return { receipt: draft.submission.receipt, cleanupPending: cleanup === 'cleanup_pending' };
  }

  // Status is intentionally first. A committed response can be recovered without local files.
  if (draft.submission.operationId) {
    try {
      existing = await options.submission.status(draft.submission.operationId);
      if (existing.operation.state === 'committed' && existing.receipt) {
        if (existing.receipt.ownerId !== options.ownerId) throw new Error('book_submission_owner_mismatch');
        if (draft.submission.fingerprint && draft.submission.fingerprint !== existing.receipt.fingerprint) {
          throw new Error('book_submission_committed_draft_changed');
        }
        return committed(options, draft, existing.receipt);
      }
      if (existing.operation.state === 'canceled') {
        await cancelReservations(options, existing.operation, draft, draft.submission.uploads);
        draft = await save(options, draft, { submission: { state: 'idle' } });
        existing = null;
      }
    } catch (error) {
      if (!isOperationNotFound(error)) throw error;
      existing = null;
    }
  }

  const input = await prepare(options, draft);
  let operation = existing?.operation;
  if (operation && operation.fingerprint !== input.fingerprint) {
    await cancelReservations(options, operation, draft, draft.submission.uploads);
    draft = await save(options, draft, { submission: { state: 'idle' } });
    operation = undefined;
  }

  // Freeze every input before the first remote begin.
  if (!operation) {
    const idempotencyKey = draft.submission.fingerprint === input.fingerprint && draft.submission.idempotencyKey
      ? draft.submission.idempotencyKey
      : `${draft.draftId}-${input.fingerprint.slice(0, 16)}-${draft.revision}`;
    draft = await save(options, draft, {
      submission: {
        ...draft.submission,
        state: 'preparing',
        metadata: input.metadata,
        authoring: input.authoring,
        fingerprint: input.fingerprint,
        idempotencyKey,
      },
    });
    const started = await options.submission.begin({
      fingerprint: input.fingerprint,
      idempotencyKey,
    });
    operation = started.operation;
    draft = await save(options, draft, {
      submission: {
        ...draft.submission,
        operationId: operation.operationId,
        finalBookId: operation.finalBookId,
        idempotencyKey: operation.idempotencyKey,
        state: 'preparing',
      },
    });
  } else {
    draft = await save(options, draft, {
      submission: {
        ...draft.submission,
        state: 'preparing',
        metadata: input.metadata,
        authoring: input.authoring,
        fingerprint: input.fingerprint,
      },
    });
  }

  if (!operation) throw new Error('book_submission_operation_missing');
  const receipts: BookSubmissionSourceReceipt[] = [];
  for (const descriptor of draft.pdfs) {
    const file = input.files.get(descriptor.id);
    const claim = input.claims[descriptor.sourceKey];
    if (!claim) throw new Error('book_submission_local_pdf_missing');
    const previous = draft.submission.uploads?.find((entry) => entry.descriptorId === descriptor.id);
    let reservation: LocalBookSubmissionUpload | undefined = previous;
    let lifecycle: SourceUploadLifecycleStatus | null = null;
    if (reservation?.reservationId) lifecycle = await options.source.status({ bookId: operation.finalBookId, reservationId: reservation.reservationId });
    const operationId = previous?.operationId ?? globalThis.crypto?.randomUUID?.();
    if (!operationId) throw new Error('book_submission_crypto_unavailable');
    if (!lifecycle || lifecycle.status !== 'verified_completed') {
      if (!file) throw new Error('book_submission_local_pdf_missing');
      const pending = {
        descriptorId: descriptor.id,
        sourceKey: descriptor.sourceKey,
        operationId,
        phase: 'begin-pending' as const,
      };
      draft = await save(options, draft, {
        submission: { ...draft.submission, state: 'uploading', uploads: [...(draft.submission.uploads ?? []).filter((entry) => entry.descriptorId !== descriptor.id), pending] },
      });
      const reserved = await options.source.begin({
        bookId: operation.finalBookId,
        submissionOperationId: operation.operationId,
        operationId,
        sourceKey: descriptor.sourceKey,
        kind: 'initial',
        purpose: 'book-source',
        inspection: claim,
      });
      reservation = {
        descriptorId: descriptor.id,
        sourceKey: descriptor.sourceKey,
        operationId,
        reservationId: reserved.reservationId,
        sourceVersionId: reserved.sourceVersionId,
      };
      draft = await save(options, draft, {
        submission: { ...draft.submission, state: 'uploading', uploads: [...(draft.submission.uploads ?? []).filter((entry) => entry.descriptorId !== descriptor.id), reservation] },
      });
      await options.uploadSourcePdf({ file, claim, authority: reserved.upload });
      const completed = await options.source.complete({ bookId: operation.finalBookId, reservationId: reservation.reservationId!, operationId });
      const safe = await options.source.decideStudentSafeSource({ bookId: operation.finalBookId, reservationId: reservation.reservationId!, operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' });
      if (safe.studentSafeStatus !== 'ready') throw new Error('book_submission_source_not_student_safe');
      reservation = { descriptorId: descriptor.id, sourceKey: descriptor.sourceKey, operationId,
        reservationId: reserved.reservationId, sourceVersionId: completed.sourceVersionId,
        sha256Hex: completed.checksum.value, byteSize: claim.exactByteSize,
        physicalPageCount: claim.physicalPageCount, studentSafeStatus: 'ready' };
      draft = await save(options, draft, {
        submission: { ...draft.submission, state: 'uploading', uploads: [...(draft.submission.uploads ?? []).filter((entry) => entry.descriptorId !== descriptor.id), reservation] },
      });
    } else if (!reservation?.sha256Hex) {
      const existingReservation = reservation;
      if (!existingReservation?.reservationId || !existingReservation.operationId) throw new Error('book_submission_source_reservation_missing');
      const completed = await options.source.complete({ bookId: operation.finalBookId, reservationId: existingReservation.reservationId, operationId: existingReservation.operationId });
      reservation = { ...existingReservation, sourceVersionId: completed.sourceVersionId, sha256Hex: completed.checksum.value, byteSize: claim.exactByteSize, physicalPageCount: claim.physicalPageCount, studentSafeStatus: 'ready' };
    }
    const completedReservation = reservation;
    if (!completedReservation?.sha256Hex || completedReservation.studentSafeStatus !== 'ready' || !completedReservation.sourceVersionId) throw new Error('book_submission_source_receipt_missing');
    receipts.push(sourceReceipt(descriptor, claim, completedReservation.sourceVersionId, completedReservation.sha256Hex));
  }

  if (input.authoring.strategy === 'component') {
    draft = await save(options, draft, { submission: { ...draft.submission, state: 'validating' } });
    await options.submission.prepareComponent(operation.operationId, {
      fingerprint: input.fingerprint,
      authoring: input.authoring,
      sourceReceipts: receipts,
      descriptorRevision: draft.revision,
    });
  }
  draft = await save(options, draft, { submission: { ...draft.submission, state: 'committing' } });
  try {
    const result = await options.submission.commit(operation.operationId, { fingerprint: input.fingerprint, metadata: input.metadata, sourceReceipts: receipts, authoring: input.authoring });
    return committed(options, draft, result.receipt);
  } catch (error) {
    // Commit response loss is resolved by authoritative operation status before reporting failure.
    try {
      const status = await options.submission.status(operation.operationId);
      if (status.operation.state === 'committed' && status.receipt) return committed(options, draft, status.receipt);
    } catch {
      // Preserve the retryable local marker below.
    }
    const reason = error instanceof Error ? error.message : 'book_submission_failed';
    await save(options, draft, { submission: { ...draft.submission, state: 'retryable', lastError: reason } });
    throw error;
  }
};

export const submitLocalBookDraft = async (
  options: BookSubmissionWorkflowOptions,
): Promise<BookSubmissionWorkflowResult> => {
  try {
    return await runSubmitLocalBookDraft(options);
  } catch (error) {
    const latest = await loadLocalBookAuthoringDraft(options.ownerId, options.draft.draftId);
    if (latest) {
      const reason = error instanceof Error ? error.message : 'book_submission_failed';
      await save(options, latest, {
        submission: { ...latest.submission, state: 'retryable', lastError: reason },
      });
    }
    throw error;
  }
};

/** Resolve remote state before deleting a local draft. */
export const resolveLocalBookSubmission = async (
  options: Pick<BookSubmissionWorkflowOptions, 'submission' | 'source'> & { readonly draft: LocalBookAuthoringDraft },
): Promise<void> => {
  const operationId = options.draft.submission.operationId;
  if (!operationId) return;
  let status: BookSubmissionStatusResult;
  try {
    status = await options.submission.status(operationId);
  } catch (error) {
    if (isOperationNotFound(error)) return;
    throw error;
  }
  if (status.operation.state === 'committed') throw new Error('book_submission_committed_cannot_discard');
  await cancelReservations(options as BookSubmissionWorkflowOptions, status.operation, options.draft, options.draft.submission.uploads);
};
