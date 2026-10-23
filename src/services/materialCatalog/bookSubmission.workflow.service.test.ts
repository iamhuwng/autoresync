import { beforeEach, describe, expect, it, vi } from 'vitest';

const local = vi.hoisted(() => ({
  loadPdf: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock('./localBookAuthoring.service', () => ({
  loadLocalBookAuthoringPdf: local.loadPdf,
  loadLocalBookAuthoringDraft: local.loadDraft,
  saveLocalBookAuthoringDraft: local.saveDraft,
  discardLocalBookAuthoringDraft: local.discardDraft,
}));

vi.mock('./bookSubmissionInput.service', () => ({
  normalizeBookSubmissionMetadata: (value: unknown) => value,
  computeBookSubmissionFingerprint: vi.fn(async (_metadata: unknown, authoring: { pdfs: readonly unknown[] }) => `f${authoring.pdfs.length}`),
}));

import { resolveLocalBookSubmission, retryCommittedBookDraftCleanup, submitLocalBookDraft } from './bookSubmission.workflow.service';
import type { LocalBookAuthoringDraft } from './localBookAuthoring.service';
import { SourceUploadClientError } from '../book-source-delivery/sourceUpload.client';

const draft = (submission = { state: 'idle' as const }): LocalBookAuthoringDraft => ({
  schemaVersion: 2, draftId: 'draft-1', ownerId: 'teacher-1',
  metadata: { bookMode: 'pdf', title: 'Draft', authors: [], testTypeIds: [], tags: [], visibility: 'private' },
  strategy: 'full', step: 5, structureJson: '{}', unitsJson: '{}', pageMappingJson: '{}',
  validationState: 'ready', previewRevision: 1, revision: 1, updatedAt: '2026-01-01T00:00:00.000Z',
  pdfs: [{ id: 'pdf-1', sourceKey: 'full', name: 'book.pdf', size: 4, type: 'application/pdf', lastModified: 0, blobKey: 'blob-1' }],
  submission,
});

const operation = (state: 'preparing' | 'committing' | 'committed' = 'preparing') => ({
  schemaVersion: 1 as const, operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1',
  idempotencyKey: 'draft-1-f1', fingerprint: 'f1', state, completedSteps: ['begin' as const],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const claim = { schemaVersion: 1 as const, trust: 'browser-supplied-untrusted' as const, state: 'complete' as const, displayFilename: 'book.pdf', exactByteSize: 4, sha256Hex: 'a'.repeat(64), physicalPageCount: 2, pdfType: 'application/pdf' as const, readability: 'readable' as const };

const setup = () => {
  const current = draft();
  local.loadPdf.mockResolvedValue(new File(['%PDF'], 'book.pdf', { type: 'application/pdf' }));
  local.loadDraft.mockResolvedValue(current);
  local.saveDraft.mockImplementation(async (value: LocalBookAuthoringDraft, patch: Partial<LocalBookAuthoringDraft>) => ({ ...value, ...patch, submission: patch.submission ?? value.submission, revision: value.revision + 1 }));
  local.discardDraft.mockResolvedValue(undefined);
  return current;
};

describe('book submission workflow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cleans the server-composed component document before discarding its local draft', async () => {
    const current = { ...setup(), strategy: 'component' as const,
      submission: { state: 'retryable' as const, operationId: 'submission-1', uploads: [] } };
    const options = base(current);
    options.source.status.mockResolvedValue({ status: 'verified_completed' });
    const source = { ...options.source, reconcile: vi.fn().mockResolvedValue({ status: 'released' }) };
    source.status.mockResolvedValueOnce({ status: 'verified_completed' }).mockResolvedValueOnce({ status: 'cleanup_pending' });
    const submission = { status: vi.fn().mockResolvedValue({ operation: { ...operation(), state: 'canceled' } }), cancel: vi.fn() };
    await resolveLocalBookSubmission({ draft: current, source: source as never, submission: submission as never });
    expect(source.requestCancellation).toHaveBeenCalledOnce();
    expect(source.reconcile).toHaveBeenCalledWith(source.requestCancellation.mock.calls[0][0]);
    expect(local.discardDraft).not.toHaveBeenCalled();
  });

  it('retains the draft and waits for the authoritative cleanup time before reconciliation', async () => {
    const current = { ...setup(), submission: { state: 'retryable' as const, operationId: 'submission-1',
      uploads: [{ descriptorId: 'pdf-1', sourceKey: 'full', operationId: 'upload-1', reservationId: 'reservation-1', phase: 'verified' as const }] } };
    const source = { ...base(current).source, reconcile: vi.fn() };
    source.status.mockResolvedValue({ status: 'cleanup_pending', nextRetryAt: new Date(Date.now() + 60_000).toISOString() });
    const submission = { status: vi.fn(async () => ({ operation: operation() })), cancel: vi.fn() };
    await expect(resolveLocalBookSubmission({ draft: current, source: source as never, submission: submission as never }))
      .rejects.toThrow('book_submission_cleanup_pending');
    expect(submission.cancel).toHaveBeenCalledOnce();
    expect(source.requestCancellation).toHaveBeenCalledOnce();
    expect(source.reconcile).not.toHaveBeenCalled();
    expect(local.discardDraft).not.toHaveBeenCalled();
  });

  it('keeps a component submission and upload identity when storage verification blocks begin', async () => {
    const current = { ...setup(), strategy: 'component' as const,
      pdfs: ['component-1', 'component-2'].map((sourceKey, index) => ({ id: `pdf-${index + 1}`, sourceKey, name: `${sourceKey}.pdf`, size: 4, type: 'application/pdf', lastModified: 0, blobKey: sourceKey })),
      submission: { state: 'retryable' as const, operationId: 'submission-1', fingerprint: 'f2', idempotencyKey: 'draft-1-f2', uploads: [{ descriptorId: 'pdf-1', sourceKey: 'component-1', operationId: '12345678-1234-4123-8123-123456789abc', phase: 'begin-pending' as const }] },
    };
    let retained: LocalBookAuthoringDraft = current;
    local.loadDraft.mockImplementation(async () => retained);
    local.saveDraft.mockImplementation(async (value: LocalBookAuthoringDraft, patch: Partial<LocalBookAuthoringDraft>) => {
      retained = { ...value, ...patch, revision: value.revision + 1 };
      return retained;
    });
    const options = base(current);
    options.source.begin.mockRejectedValue(new SourceUploadClientError('provider_reconciliation_required', 503));
    const submission = { status: vi.fn().mockResolvedValue({ operation: { ...operation(), fingerprint: 'f2', idempotencyKey: 'draft-1-f2' } }), begin: vi.fn(), prepareComponent: vi.fn(), commit: vi.fn() };
    await expect(submitLocalBookDraft({ ...options, submission })).rejects.toMatchObject({ code: 'provider_reconciliation_required' });
    expect(submission.status).toHaveBeenCalledWith('submission-1');
    expect(submission.begin).not.toHaveBeenCalled();
    expect(options.source.begin).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', operationId: '12345678-1234-4123-8123-123456789abc' }));
    expect(options.uploadSourcePdf).not.toHaveBeenCalled();
    expect(submission.prepareComponent).not.toHaveBeenCalled();
    expect(submission.commit).not.toHaveBeenCalled();
    expect(retained.submission).toMatchObject({ state: 'retryable', operationId: 'submission-1', lastError: 'source_upload_provider_reconciliation_required' });
    expect(retained.submission.uploads?.[0].operationId).toBe('12345678-1234-4123-8123-123456789abc');
    expect(local.discardDraft).not.toHaveBeenCalled();
  });

  it('restarts a canceled submission after proving a lost begin did not reserve a source', async () => {
    const current = { ...setup(), submission: { state: 'retryable' as const, operationId: 'submission-1', fingerprint: 'f1', idempotencyKey: 'draft-1-f1', uploads: [{ descriptorId: 'pdf-1', sourceKey: 'full', operationId: '12345678-1234-4123-8123-123456789abc', phase: 'begin-pending' as const }] } };
    const submission = {
      status: vi.fn().mockResolvedValue({ status: 'canceled', operation: { ...operation(), state: 'canceled' } }),
      begin: vi.fn().mockResolvedValue({ status: 'created', operation: { ...operation(), operationId: 'submission-2', finalBookId: 'book-2' } }),
      cancel: vi.fn(),
      commit: vi.fn().mockResolvedValue({ receipt: { status: 'committed', operationId: 'submission-2', ownerId: 'teacher-1', finalBookId: 'book-2', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' } }),
    };
    const options = base(current);
    options.source.status.mockRejectedValueOnce(new SourceUploadClientError('reservation_not_found', 404));
    const result = await submitLocalBookDraft({ ...options, submission });
    expect(result.receipt.finalBookId).toBe('book-2');
    expect(options.source.status.mock.invocationCallOrder[0]).toBeLessThan(submission.begin.mock.invocationCallOrder[0]);
    expect(submission.begin.mock.calls[0][0].idempotencyKey).not.toBe('draft-1-f1');
    expect(options.source.begin).toHaveBeenCalledOnce();
    expect(options.source.begin.mock.calls[0][0].bookId).toBe('book-2');
    expect(options.source.begin.mock.calls[0][0].submissionOperationId).toBe('submission-2');
    expect(options.source.requestCancellation).not.toHaveBeenCalled();
  });

  it('keeps a canceled draft recoverable when old reservation status is unavailable', async () => {
    const current = { ...setup(), submission: { state: 'retryable' as const, operationId: 'submission-1', uploads: [{ descriptorId: 'pdf-1', sourceKey: 'full', operationId: '12345678-1234-4123-8123-123456789abc', phase: 'begin-pending' as const }] } };
    const options = base(current);
    options.source.status.mockRejectedValue(new SourceUploadClientError('unavailable', 503));
    const submission = { status: vi.fn().mockResolvedValue({ operation: { ...operation(), state: 'canceled' } }), begin: vi.fn(), cancel: vi.fn(), commit: vi.fn() };
    await expect(submitLocalBookDraft({ ...options, submission })).rejects.toThrow();
    expect(submission.begin).not.toHaveBeenCalled();
    expect(options.source.begin).not.toHaveBeenCalled();
    expect(local.discardDraft).not.toHaveBeenCalled();
  });

  it('reuses the durably saved begin identity when its response was lost', async () => {
    const current = { ...setup(), submission: { state: 'preparing' as const, fingerprint: 'f1', idempotencyKey: 'draft-1-f1-7' } };
    const submission = { status: vi.fn(), begin: vi.fn().mockRejectedValue(new Error('unavailable')), cancel: vi.fn(), commit: vi.fn() };
    await expect(submitLocalBookDraft({ ...base(current), submission })).rejects.toThrow('unavailable');
    expect(submission.begin).toHaveBeenCalledWith({ fingerprint: 'f1', idempotencyKey: 'draft-1-f1-7' });
    expect(local.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(submission.begin.mock.invocationCallOrder[0]);
    expect(local.discardDraft).not.toHaveBeenCalled();
  });

  it('checks operation status before reading local files and recovers a committed receipt', async () => {
    const current = draft({ state: 'committing', operationId: 'submission-1', fingerprint: 'f1' });
    const submission = {
      status: vi.fn().mockResolvedValue({ status: 'committed', operation: operation('committed'), receipt: { status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' } }),
      begin: vi.fn(), cancel: vi.fn(), commit: vi.fn(),
    };
    const result = await submitLocalBookDraft({ ...base(current), submission });
    expect(result.receipt.finalBookId).toBe('book-1');
    expect(local.loadPdf).not.toHaveBeenCalled();
    expect(submission.status).toHaveBeenCalledOnce();
  });

  it('persists the frozen input before begin and reuses a verified reservation', async () => {
    const current = { ...setup(), submission: { state: 'preparing' as const, operationId: 'submission-1', fingerprint: 'f1', uploads: [{ descriptorId: 'pdf-1', sourceKey: 'full', operationId: 'upload-op-1', reservationId: 'reservation-1', sourceVersionId: 'source-1', sha256Hex: 'a'.repeat(64), byteSize: 4, physicalPageCount: 2, studentSafeStatus: 'ready' as const }] } };
    const submission = {
      status: vi.fn().mockRejectedValue(new Error('operation_not_found')),
      begin: vi.fn().mockResolvedValue({ status: 'created', operation: operation() }),
      cancel: vi.fn(), commit: vi.fn().mockResolvedValue({ status: 'committed', operation: operation('committed'), receipt: { status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' } }),
    };
    const source = { begin: vi.fn(), status: vi.fn().mockResolvedValue({ status: 'verified_completed' }), complete: vi.fn().mockResolvedValue({ sourceVersionId: 'source-1', checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) } }), decideStudentSafeSource: vi.fn(), requestCancellation: vi.fn() };
    const result = await submitLocalBookDraft({ ...base(current), submission, source: source as never });
    expect(result.receipt.finalBookId).toBe('book-1');
    expect(local.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(submission.begin.mock.invocationCallOrder[0]);
    expect(source.status).toHaveBeenCalledOnce();
    expect(source.begin).not.toHaveBeenCalled();
  });

  it('prepares component PDFs before committing the component route', async () => {
    const current = {
      ...setup(),
      strategy: 'component' as const,
      pdfs: [
        { id: 'pdf-1', sourceKey: 'component-1', name: 'one.pdf', size: 4, type: 'application/pdf', lastModified: 0, blobKey: 'blob-1' },
        { id: 'pdf-2', sourceKey: 'component-2', name: 'two.pdf', size: 4, type: 'application/pdf', lastModified: 0, blobKey: 'blob-2' },
      ],
    };
    const submission = {
      status: vi.fn().mockRejectedValue(new Error('operation_not_found')),
      begin: vi.fn().mockResolvedValue({ status: 'created', operation: operation() }),
      prepareComponent: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({
        status: 'committed',
        operation: operation('committed'),
        receipt: {
          status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1',
          fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    };
    const result = await submitLocalBookDraft({ ...base(current), submission });
    expect(result.receipt.finalBookId).toBe('book-1');
    expect(submission.prepareComponent).toHaveBeenCalledOnce();
    expect(submission.prepareComponent.mock.calls[0][1].authoring.strategy).toBe('component');
    expect(submission.commit).toHaveBeenCalledOnce();
  });

  it('retries cleanup from a committed receipt without touching submission or upload clients', async () => {
    const current = draft({
      state: 'committed', operationId: 'submission-1', committedBookId: 'book-1', fingerprint: 'f1',
      receipt: { status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' },
      cleanupPending: true,
    });
    const discard = vi.fn().mockResolvedValue(undefined);

    await expect(retryCommittedBookDraftCleanup({ ownerId: 'teacher-1', draft: current, discardDraft: discard })).resolves.toBe('released');
    expect(discard).toHaveBeenCalledWith('teacher-1', 'draft-1');
    expect(local.loadPdf).not.toHaveBeenCalled();
  });

  it('does not replay a committed draft when the old operation is no longer readable', async () => {
    const current = draft({
      state: 'committed', operationId: 'submission-1', committedBookId: 'book-1', fingerprint: 'f1',
      receipt: { status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' },
      cleanupPending: true,
    });
    const submission = { status: vi.fn().mockRejectedValue(new Error('operation_not_found')), begin: vi.fn(), cancel: vi.fn(), commit: vi.fn() };
    const source = { begin: vi.fn(), status: vi.fn(), complete: vi.fn(), decideStudentSafeSource: vi.fn(), requestCancellation: vi.fn() };

    const result = await submitLocalBookDraft({ ...base(current), submission, source: source as never });
    expect(result.receipt.finalBookId).toBe('book-1');
    expect(submission.status).not.toHaveBeenCalled();
    expect(submission.begin).not.toHaveBeenCalled();
    expect(submission.commit).not.toHaveBeenCalled();
    expect(source.begin).not.toHaveBeenCalled();
  });

  it('keeps the committed marker when local discard fails', async () => {
    const current = draft({
      state: 'committed', operationId: 'submission-1', committedBookId: 'book-1', fingerprint: 'f1',
      receipt: { status: 'committed', operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'f1', committedAt: '2026-01-01T00:00:00.000Z' },
      cleanupPending: true,
    });
    local.discardDraft.mockRejectedValue(new Error('indexeddb_unavailable'));

    await expect(retryCommittedBookDraftCleanup({ ownerId: 'teacher-1', draft: current, discardDraft: local.discardDraft, saveDraft: local.saveDraft })).resolves.toBe('cleanup_pending');
    expect(local.saveDraft).toHaveBeenCalledWith(current, { submission: { ...current.submission, cleanupPending: true } });
  });
});

const base = (current: LocalBookAuthoringDraft) => ({
  ownerId: current.ownerId, draft: current,
  source: { begin: vi.fn().mockResolvedValue({ reservationId: 'reservation-1', sourceVersionId: 'source-1', upload: {} }), status: vi.fn().mockResolvedValue({ status: 'reserved' }), complete: vi.fn().mockResolvedValue({ sourceVersionId: 'source-1', checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) } }), decideStudentSafeSource: vi.fn().mockResolvedValue({ studentSafeStatus: 'ready' }), requestCancellation: vi.fn() },
  inspectSourcePdf: vi.fn().mockResolvedValue(claim), uploadSourcePdf: vi.fn().mockResolvedValue(undefined),
  saveDraft: local.saveDraft, discardDraft: local.discardDraft,
});
