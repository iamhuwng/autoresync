import { describe, expect, it, vi } from 'vitest';
import {
  inspectSourcePdf,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import {
  createSourceUploadBrowserWorkflow,
  SourceUploadWorkflowError,
} from './sourceUpload.browserWorkflow';
import type {
  SourceUploadSafeOperationState,
  SourceUploadStatePort,
} from './sourceUpload.client';

const checksum = 'a'.repeat(64);
const upload = {
  url: 'https://s3.us-west-004.backblazeb2.com/private/exact.pdf?signature=one',
  expiresAt: '2099-01-01T00:00:00.000Z',
  requiredHeaders: {
    'content-type': 'application/pdf',
    'x-amz-content-sha256': checksum,
    'x-amz-meta-book-source-byte-size': '8',
    'x-amz-meta-book-source-sha256': checksum,
  },
};

const inspect = async (file: File): Promise<SourcePdfInspectionClaim> =>
  inspectSourcePdf(file, {
    __testDependencies: {
      readArrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer,
      digestSha256: async () => Uint8Array.from({ length: 32 }, () => 0xaa).buffer,
      loadPdfDocument: async () => ({ promise: Promise.resolve({ numPages: 2 }) }),
    },
  });

const statePort = () => {
  let current: SourceUploadSafeOperationState | null = null;
  const port: SourceUploadStatePort = {
    load: vi.fn(async () => current),
    save: vi.fn(async (state) => { current = state; }),
    clear: vi.fn(async () => { current = null; }),
  };
  return { port, get: () => current };
};

const setup = () => {
  const state = statePort();
  const control = {
    begin: vi.fn(async () => ({
      status: 'reserved' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      upload,
    })),
    complete: vi.fn(async () => ({
      status: 'verified_completed' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    })),
    requestCancellation: vi.fn(async () => undefined),
  };
  const directUpload = vi.fn(async () => ({
    providerFileId: '4_file',
    providerFileVersionId: '4_version',
  }));
  const workflow = createSourceUploadBrowserWorkflow({
    control,
    state: state.port,
    allowedB2Origins: ['https://s3.us-west-004.backblazeb2.com'],
    upload: directUpload,
    createOperationId: () => '11111111-1111-4111-8111-111111111111',
  });
  return { control, directUpload, state, workflow };
};

describe('sourceUpload.browserWorkflow', () => {
  it('runs metadata begin, direct File upload, then bound metadata completion', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    await expect(harness.workflow.start({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
    })).resolves.toMatchObject({ state: { phase: 'verified' } });

    expect(harness.control.begin).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      inspection: claim,
    }));
    expect(harness.control.begin.mock.calls[0]?.[0]).not.toHaveProperty('file');
    expect(harness.directUpload).toHaveBeenCalledWith(
      expect.objectContaining({ file, claim, authority: upload }),
      expect.any(Object),
    );
    expect(harness.control.complete).toHaveBeenCalledWith({
      bookId: 'book-1',
      reservationId: 'reservation-1',
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    });
    expect(harness.state.get()).toMatchObject({ phase: 'verified' });
    expect(JSON.stringify(harness.state.get())).not.toMatch(/signature|token|headers|%PDF/iu);
  });

  it('persists completion-only recovery and never uploads bytes again', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.complete.mockRejectedValueOnce(new Error('offline'));
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toThrow('offline');
    expect(harness.state.get()).toMatchObject({ phase: 'completion_pending' });

    await expect(harness.workflow.retryCompletion('book-1')).resolves.toMatchObject({
      state: { phase: 'verified' },
    });
    expect(harness.directUpload).toHaveBeenCalledTimes(1);
    expect(harness.control.complete).toHaveBeenCalledTimes(2);
  });

  it('rejects completion bound to another Source Version', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.complete.mockResolvedValueOnce({
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'different-source-version',
    });
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'response_binding_mismatch' });
    expect(harness.state.get()).toMatchObject({
      phase: 'completion_pending',
      sourceVersionId: 'source-version-1',
    });
  });

  it('reuses one operation and reservation for byte retry after reload', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.directUpload.mockRejectedValueOnce(new Error('network'));
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toThrow('network');
    expect(harness.state.get()).toMatchObject({ phase: 'reserved' });

    await harness.workflow.retryBytes({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    });
    expect(harness.control.begin).toHaveBeenCalledTimes(2);
    expect(harness.control.begin.mock.calls[0]?.[0].operationId)
      .toBe(harness.control.begin.mock.calls[1]?.[0].operationId);
    expect(harness.state.get()).toMatchObject({
      phase: 'verified',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    });
  });

  it('rejects stale File identity and prevents duplicate verified source start', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    await expect(harness.workflow.start({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file: new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' }),
      claim,
    })).rejects.toEqual(new SourceUploadWorkflowError('stale_file'));
    await harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    });
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'verified_source_exists' });
  });

  it('records cancel request without claiming provider deletion', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.directUpload.mockReturnValueOnce(new Promise(() => undefined));
    void harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    });
    await vi.waitFor(() => expect(harness.state.get()).toMatchObject({ phase: 'reserved' }));
    await expect(harness.workflow.requestCancellation('book-1')).resolves.toBe(true);
    expect(harness.control.requestCancellation).toHaveBeenCalledWith({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    });
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
    expect(harness.state.get()).not.toHaveProperty('providerDeleted');
  });

  it('prevents late byte success from overwriting a cancellation request', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    let resolveUpload!: (identity: {
      providerFileId: string;
      providerFileVersionId: string;
    }) => void;
    harness.directUpload.mockReturnValueOnce(new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    const controller = new AbortController();
    const started = harness.workflow.start({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(harness.state.get()).toMatchObject({
      phase: 'reserved',
    }));

    controller.abort();
    await expect(harness.workflow.requestCancellation('book-1')).resolves.toBe(true);
    resolveUpload({
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    });

    await expect(started).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.control.complete).not.toHaveBeenCalled();
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
  });

  it('retries a canceled operation while rejecting its stale byte attempt', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    let resolveStaleUpload!: (identity: {
      providerFileId: string;
      providerFileVersionId: string;
    }) => void;
    harness.directUpload.mockReturnValueOnce(new Promise((resolve) => {
      resolveStaleUpload = resolve;
    }));
    const staleAttempt = harness.workflow.start({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
    });
    await vi.waitFor(() => expect(harness.state.get()).toMatchObject({
      phase: 'reserved',
    }));
    await expect(harness.workflow.requestCancellation('book-1')).resolves.toBe(true);

    await expect(harness.workflow.retryBytes({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
    })).resolves.toMatchObject({ state: { phase: 'verified' } });

    resolveStaleUpload({
      providerFileId: '4_stale_file',
      providerFileVersionId: '4_stale_version',
    });
    await expect(staleAttempt).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.control.complete).toHaveBeenCalledTimes(1);
    expect(harness.state.get()).toMatchObject({ phase: 'verified' });
  });
});
