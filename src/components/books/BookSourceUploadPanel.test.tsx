import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourcePdfInspectionClaim } from '../../services/book-source-delivery/sourcePdfInspection.browser';
import type {
  SourceUploadBrowserWorkflow,
} from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type {
  SourceUploadSafeOperationState,
} from '../../services/book-source-delivery/sourceUpload.client';
import BookSourceUploadPanel from './BookSourceUploadPanel';

const { toast } = vi.hoisted(() => ({
  toast: {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  },
}));

vi.mock('../modern/ToastNotification', () => ({ toast }));

const claim: SourcePdfInspectionClaim = {
  schemaVersion: 1,
  trust: 'browser-supplied-untrusted',
  state: 'complete',
  displayFilename: 'book.pdf',
  exactByteSize: 8,
  sha256Hex: 'a'.repeat(64),
  physicalPageCount: 2,
  pdfType: 'application/pdf',
  readability: 'readable',
};

const selection = {
  file: new File(['%PDF-1.4'], 'book.pdf', { type: 'application/pdf' }),
  claim,
};

const operation = (
  phase: SourceUploadSafeOperationState['phase'],
): SourceUploadSafeOperationState => ({
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
  phase,
  ...(phase === 'completion_pending' || phase === 'verified'
    ? { providerFileId: '4_file', providerFileVersionId: '4_version' }
    : {}),
});

const workflow = (
  loaded: SourceUploadSafeOperationState | null = null,
): SourceUploadBrowserWorkflow => ({
  load: vi.fn(async () => loaded),
  start: vi.fn(async (input) => {
    input.onProgress?.({
      confirmed: true,
      loadedBytes: 8,
      totalBytes: 8,
      percent: 100,
    });
    return {
      state: operation('verified'),
      completion: {
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      },
    };
  }),
  retryBytes: vi.fn(async () => ({
    state: operation('verified'),
    completion: {
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    },
  })),
  retryCompletion: vi.fn(async () => ({
    state: operation('verified'),
    completion: {
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    },
  })),
  requestCancellation: vi.fn(async () => true),
  retryCleanup: vi.fn(async () => 'released' as const),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BookSourceUploadPanel', () => {
  it('announces upload, reports confirmed transferred bytes, and keeps verified inline state', async () => {
    const client = workflow();
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={selection}
        workflow={client}
      />,
    );
    await waitFor(() => expect(client.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));

    await screen.findByText('One verified ready Source Version is recorded for this operation.');
    expect(client.start).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      file: selection.file,
      claim,
      kind: 'initial',
    }));
    expect(toast.info).toHaveBeenCalledWith('PDF upload started.');
    expect(toast.success).toHaveBeenCalledWith(
      'PDF upload verified. Source Version is ready.',
    );
  });

  it('shows exact streamed bytes separately from B2 confirmation', async () => {
    const client = workflow();
    vi.mocked(client.start).mockImplementationOnce((input) => {
      input.onProgress?.({
        confirmed: false,
        loadedBytes: 2,
        totalBytes: 8,
        percent: 25,
      });
      return new Promise(() => undefined);
    });
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={selection}
        workflow={client}
      />,
    );
    await waitFor(() => expect(client.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));

    const progress = await screen.findByRole('progressbar', {
      name: 'Source PDF upload progress',
    });
    expect(progress).toHaveAttribute('value', '25');
    expect(screen.getByText('2 / 8 bytes (25%)')).toBeInTheDocument();
    expect(screen.getByText(
      'Streaming PDF bytes to the exact B2 destination',
    )).toBeInTheDocument();
  });

  it('restores completion-only state and retries no PDF bytes', async () => {
    const client = workflow(operation('completion_pending'));
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={null}
        workflow={client}
      />,
    );
    fireEvent.click(await screen.findByRole('button', {
      name: 'Retry verification only',
    }));

    await waitFor(() => expect(client.retryCompletion).toHaveBeenCalledWith('book-1'));
    expect(client.retryBytes).not.toHaveBeenCalled();
    expect(screen.getByText(
      'One verified ready Source Version is recorded for this operation.',
    )).toBeInTheDocument();
  });

  it('aborts active bytes and requests cleanup without provider-deletion claim', async () => {
    const client = workflow();
    vi.mocked(client.start).mockImplementationOnce((input) => {
      input.onProgress?.({
        confirmed: false,
        loadedBytes: 2,
        totalBytes: 8,
        percent: 25,
      });
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener(
          'abort',
          () => reject(new Error('transport aborted')),
          { once: true },
        );
      });
    });
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={selection}
        workflow={client}
      />,
    );
    await waitFor(() => expect(client.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload' }));

    await waitFor(() => expect(client.requestCancellation).toHaveBeenCalledWith('book-1'));
    expect(toast.info).toHaveBeenCalledWith(
      'Upload canceled. Cleanup requested; provider deletion is not yet confirmed.',
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/provider deletion confirmed/iu)).not.toBeInTheDocument();
  });

  it('ignores a late verified result after the user cancels the active run', async () => {
    const client = workflow();
    let resolveStart!: (result: Awaited<ReturnType<typeof client.start>>) => void;
    vi.mocked(client.start).mockReturnValueOnce(new Promise((resolve) => {
      resolveStart = resolve;
    }));
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={selection}
        workflow={client}
      />,
    );
    await waitFor(() => expect(client.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload' }));
    await waitFor(() => expect(client.requestCancellation).toHaveBeenCalledWith('book-1'));

    resolveStart({
      state: operation('verified'),
      completion: {
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      },
    });
    await Promise.resolve();

    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText(
      'One verified ready Source Version is recorded for this operation.',
    )).not.toBeInTheDocument();
  });

  it('keeps fresh upload disabled while status/completion remain visible and explains immutable replacement', async () => {
    const client = workflow(operation('completion_pending'));
    render(
      <BookSourceUploadPanel
        allowFreshUpload={false}
        bookId="book-1"
        immutablePublished
        selection={selection}
        workflow={client}
      />,
    );

    expect(await screen.findByText(/Published source bytes are immutable/iu))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry verification only' }))
      .toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Upload PDF' }))
      .not.toBeInTheDocument();
  });

  it('recovers stable UI and announces when cancellation request throws', async () => {
    const client = workflow(operation('reserved'));
    vi.mocked(client.requestCancellation).mockRejectedValueOnce(new TypeError('offline'));
    vi.mocked(client.retryBytes).mockImplementationOnce((input) => new Promise(
      (_resolve, reject) => input.signal?.addEventListener(
        'abort',
        () => reject(new Error('transport aborted')),
        { once: true },
      ),
    ));
    render(
      <BookSourceUploadPanel
        allowFreshUpload
        bookId="book-1"
        immutablePublished={false}
        selection={selection}
        workflow={client}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry PDF bytes' }));
    const cancelButton = await screen.findByRole('button', { name: 'Cancel upload' });
    fireEvent.click(cancelButton);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Upload stopped, but cleanup request was not confirmed. Retry cleanup later.',
    ));
    expect(screen.queryByRole('button', { name: 'Cancel upload' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request cleanup' })).toBeEnabled();
  });

  it('keeps cleanup retry reachable after reload without the original File', async () => {
    const client = workflow(operation('cancel_requested'));
    render(
      <BookSourceUploadPanel
        allowFreshUpload={false}
        bookId="book-1"
        immutablePublished={false}
        selection={null}
        workflow={client}
      />,
    );

    fireEvent.click(await screen.findByRole('button', {
      name: 'Retry cleanup',
    }));
    await waitFor(() => expect(client.retryCleanup).toHaveBeenCalledWith('book-1'));
    expect(toast.success).toHaveBeenCalledWith(
      'Upload cleanup confirmed. Reserved capacity was released.',
    );
  });
});
