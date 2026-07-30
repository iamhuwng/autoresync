import { describe, expect, it, vi } from 'vitest';
import {
  inspectSourcePdf,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import {
  createSourceUploadBrowserWorkflow,
  SourceUploadWorkflowError,
} from './sourceUpload.browserWorkflow';
import {
  createSourceUploadClient,
  SourceUploadClientError,
  type SourceUploadSafeOperationState,
  type SourceUploadStatePort,
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
    status: vi.fn(async () => ({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'cleanup_pending' as const,
      retryKind: 'cleanup' as const,
    })),
    reconcile: vi.fn(async () => ({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'released' as const,
      retryKind: 'none' as const,
    })),
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
  it('persists the same idempotency key across a rejected durable begin response and HTTP replay', async () => {
    const state = statePort();
    const operationIds: string[] = [];
    let beginAttempt = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/upload/begin')) {
        beginAttempt += 1;
        const command = JSON.parse(String(init?.body)) as { operationId: string };
        operationIds.push(command.operationId);
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(command.operationId);
        return Response.json({
          status: beginAttempt === 1 ? 'reserved' : 'replayed',
          reservationId: 'reservation-1',
          sourceVersionId: 'source-version-1',
          upload: {
            ...upload,
            expiresAt: beginAttempt === 1
              ? '2020-01-01T00:00:00.000Z'
              : upload.expiresAt,
          },
        });
      }
      if (String(url).endsWith('/complete')) {
        return Response.json({
          status: 'verified_completed',
          reservationId: 'reservation-1',
          sourceVersionId: 'source-version-1',
        });
      }
      throw new Error(`unexpected request: ${String(url)}`);
    });
    const control = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });
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
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);

    await expect(workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(state.get()).toMatchObject({ phase: 'begin_pending' });
    await expect(workflow.retryBytes({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).resolves.toMatchObject({ state: { phase: 'verified' } });
    expect(operationIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('clears begin-pending state only when the server proves no reservation was created', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.begin.mockRejectedValueOnce(
      new SourceUploadClientError('authority_denied', 403),
    );

    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'authority_denied' });
    expect(harness.state.get()).toBeNull();
  });

  it('fences an abort during begin and requests cleanup after the reservation becomes known', async () => {
    const harness = setup();
    let resolveBegin!: (value: Awaited<ReturnType<typeof harness.control.begin>>) => void;
    harness.control.begin.mockReturnValueOnce(new Promise((resolve) => {
      resolveBegin = resolve;
    }));
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
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
      phase: 'begin_pending',
    }));
    controller.abort();
    resolveBegin({
      status: 'reserved',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      upload,
    });

    await expect(started).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
    expect(harness.control.requestCancellation).toHaveBeenCalledWith({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    });
    expect(harness.directUpload).not.toHaveBeenCalled();
  });

  it('replays the original operation after begin reserved remotely but its response was rejected', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.begin.mockRejectedValueOnce(
      new SourceUploadClientError('invalid_response', 502),
    );

    await expect(harness.workflow.start({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
    })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(harness.state.get()).toMatchObject({
      phase: 'begin_pending',
      operationId: '11111111-1111-4111-8111-111111111111',
    });

    const reloaded = createSourceUploadBrowserWorkflow({
      control: harness.control,
      state: harness.state.port,
      allowedB2Origins: ['https://s3.us-west-004.backblazeb2.com'],
      upload: harness.directUpload,
      createOperationId: () => '22222222-2222-4222-8222-222222222222',
    });
    await expect(reloaded.retryBytes({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim,
    })).resolves.toMatchObject({ state: { phase: 'verified' } });
    expect(harness.control.begin.mock.calls.map(([command]) => command.operationId))
      .toEqual([
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ]);
  });

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

  it('reloads server cleanup status and settles cleanup without PDF bytes', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'cancel_requested',
    });
    await expect(harness.workflow.load('book-1')).resolves.toMatchObject({
      phase: 'cancel_requested',
    });
    await expect(harness.workflow.retryCleanup('book-1')).resolves.toBe('released');
    await expect(harness.state.port.load('book-1')).resolves.toBeNull();
    expect(harness.control.reconcile).toHaveBeenCalledWith({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    });
    expect(harness.directUpload).not.toHaveBeenCalled();
  });

  it('uses authoritative retry kind to replace stale local byte retry with cleanup', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'reserved',
    });
    harness.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'cleanup_pending',
      retryKind: 'cleanup',
    });

    await expect(harness.workflow.load('book-1')).resolves.toMatchObject({
      phase: 'cancel_requested',
    });
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    await expect(harness.workflow.retryBytes({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim: await inspect(file),
    })).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(harness.control.begin).not.toHaveBeenCalled();
  });

  it('replays a persisted reserved operation with its original binding', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'reserved',
    });
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    await expect(harness.workflow.retryBytes({
      bookId: 'book-1',
      sourceKey: 'main',
      kind: 'initial',
      file,
      claim: await inspect(file),
    })).resolves.toMatchObject({
      state: {
        phase: 'verified',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      },
    });
    expect(harness.control.begin).toHaveBeenCalledWith(expect.objectContaining({
      operationId: '11111111-1111-4111-8111-111111111111',
    }));
  });

  it('restores verified server state and clears released server state on reload', async () => {
    const operation = {
      schemaVersion: 1 as const,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial' as const,
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'cancel_requested' as const,
    };
    const verified = setup();
    await verified.state.port.save(operation);
    verified.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'verified_completed',
      retryKind: 'none',
    });
    await expect(verified.workflow.load('book-1')).resolves.toMatchObject({
      phase: 'verified',
    });
    expect(verified.state.port.save).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'verified',
    }));

    const released = setup();
    await released.state.port.save(operation);
    released.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'released',
      retryKind: 'none',
    });
    await expect(released.workflow.load('book-1')).resolves.toBeNull();
    expect(released.state.port.clear).toHaveBeenCalledWith('book-1');
    expect(released.directUpload).not.toHaveBeenCalled();
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

  it('does not overwrite a newer cleanup state after delayed completion returns', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.complete.mockImplementationOnce(async () => {
      const current = harness.state.get();
      expect(current).toMatchObject({ phase: 'completion_pending' });
      if (!current || current.phase !== 'completion_pending') {
        throw new Error('expected completion-pending state');
      }
      await harness.state.port.save({
        ...current,
        phase: 'cancel_requested',
      });
      return {
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      };
    });

    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
  });

  it('cancels an ambiguous upload and forbids byte retry until cleanup', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.directUpload.mockRejectedValueOnce(new Error('network'));
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toThrow('network');
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
    expect(harness.control.requestCancellation).toHaveBeenCalledWith({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    });

    await expect(harness.workflow.retryBytes({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(harness.control.begin).toHaveBeenCalledTimes(1);
    expect(harness.directUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps ambiguous upload canceled when the cancellation request also fails', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.directUpload.mockRejectedValueOnce(new Error('network'));
    harness.control.requestCancellation.mockRejectedValueOnce(new Error('offline'));
    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toThrow('network');
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
    await expect(harness.workflow.retryBytes({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'invalid_operation' });
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

  it('forbids byte retry while a canceled provider attempt can still settle', async () => {
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
    })).rejects.toMatchObject({ code: 'invalid_operation' });

    resolveStaleUpload({
      providerFileId: '4_stale_file',
      providerFileVersionId: '4_stale_version',
    });
    await expect(staleAttempt).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.control.complete).not.toHaveBeenCalled();
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
  });

  it('keeps verified operations in cleanup recovery until version reconciliation succeeds', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'cancel_requested',
    });
    harness.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'verified_completed',
      retryKind: 'cleanup',
    });
    harness.control.reconcile.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'verified_completed',
      retryKind: 'none',
    });

    await expect(harness.workflow.load('book-1')).resolves.toMatchObject({
      phase: 'cancel_requested',
    });
    await expect(harness.workflow.retryCleanup('book-1'))
      .resolves.toBe('verified_completed');
    expect(harness.state.get()).toMatchObject({ phase: 'verified' });
  });

  it('normalizes authoritative byte retry and removes stale provider identity', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'completion_pending',
      providerFileId: 'stale-file',
      providerFileVersionId: 'stale-version',
    });
    harness.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'reserved',
      retryKind: 'bytes',
    });

    await expect(harness.workflow.load('book-1')).resolves.toEqual(expect.objectContaining({
      phase: 'reserved',
    }));
    expect(harness.state.get()).not.toHaveProperty('providerFileId');
    expect(harness.state.get()).not.toHaveProperty('providerFileVersionId');
  });

  it('rejects misbound status and cleanup responses without mutating local recovery', async () => {
    const harness = setup();
    await harness.state.port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'cancel_requested',
    });
    harness.control.status.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'wrong-source-version',
      status: 'released',
      retryKind: 'none',
    });

    await expect(harness.workflow.load('book-1')).resolves.toMatchObject({
      phase: 'cancel_requested',
      sourceVersionId: 'source-version-1',
    });
    expect(harness.state.get()).toMatchObject({ sourceVersionId: 'source-version-1' });

    harness.control.reconcile.mockResolvedValueOnce({
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'wrong-source-version',
      status: 'released',
      retryKind: 'none',
    });
    await expect(harness.workflow.retryCleanup('book-1'))
      .rejects.toMatchObject({ code: 'response_binding_mismatch' });
    expect(harness.state.get()).toMatchObject({ phase: 'cancel_requested' });
  });

  it('does not let a stale status response clear a newer operation', async () => {
    const harness = setup();
    const original = {
      schemaVersion: 1 as const,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial' as const,
      displayFilename: 'book.pdf',
      exactByteSize: 8,
      sha256Hex: 'a'.repeat(64),
      phase: 'cancel_requested' as const,
    };
    const replacement = {
      schemaVersion: 1 as const,
      bookId: 'book-1',
      operationId: '22222222-2222-4222-8222-222222222222',
      sourceKey: 'replacement',
      kind: 'initial' as const,
      displayFilename: 'replacement.pdf',
      exactByteSize: 9,
      sha256Hex: 'b'.repeat(64),
      phase: 'begin_pending' as const,
    };
    await harness.state.port.save(original);
    harness.control.status.mockImplementationOnce(async () => {
      await harness.state.port.save(replacement);
      return {
        reservationId: 'reservation-1',
        bookId: 'book-1',
        sourceVersionId: 'source-version-1',
        status: 'released',
        retryKind: 'none',
      };
    });

    await expect(harness.workflow.load('book-1')).resolves.toEqual(replacement);
    expect(harness.state.get()).toEqual(replacement);
  });

  it('does not let a deterministic old begin failure clear a replacement operation', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    const replacement = {
      schemaVersion: 1 as const,
      bookId: 'book-1',
      operationId: '22222222-2222-4222-8222-222222222222',
      sourceKey: 'replacement',
      kind: 'initial' as const,
      displayFilename: 'replacement.pdf',
      exactByteSize: 9,
      sha256Hex: 'b'.repeat(64),
      phase: 'begin_pending' as const,
    };
    harness.control.begin.mockImplementationOnce(async () => {
      await harness.state.port.save(replacement);
      throw new SourceUploadClientError('forbidden', 403);
    });

    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ status: 403 });
    expect(harness.state.get()).toEqual(replacement);
  });

  it('checks the cancellation fence again after delayed completion returns', async () => {
    const harness = setup();
    const file = new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' });
    const claim = await inspect(file);
    harness.control.complete.mockImplementationOnce(async () => {
      await harness.workflow.requestCancellation('book-1');
      const canceled = harness.state.get();
      expect(canceled).toMatchObject({ phase: 'cancel_requested' });
      if (!canceled || canceled.phase !== 'cancel_requested') {
        throw new Error('expected cancel-requested state');
      }
      await harness.state.port.save({ ...canceled, phase: 'completion_pending' });
      return {
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      };
    });

    await expect(harness.workflow.start({
      bookId: 'book-1', sourceKey: 'main', kind: 'initial', file, claim,
    })).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(harness.state.get()).toMatchObject({ phase: 'completion_pending' });
  });
});
