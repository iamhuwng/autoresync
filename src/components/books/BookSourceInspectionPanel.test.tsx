import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookSourceInspectionPanel from './BookSourceInspectionPanel';

const { inspectSourcePdf, invalidateSourcePdfInspectionClaim, isSourcePdfInspectionClaimForFile, toast } = vi.hoisted(() => ({
  inspectSourcePdf: vi.fn(),
  invalidateSourcePdfInspectionClaim: vi.fn(),
  isSourcePdfInspectionClaimForFile: vi.fn(() => true),
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/book-source-delivery/sourcePdfInspection.browser', () => ({
  inspectSourcePdf,
  invalidateSourcePdfInspectionClaim,
  isSourcePdfInspectionClaimForFile,
  SourcePdfInspectionError: class SourcePdfInspectionError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock('../modern/ToastNotification', () => ({ toast }));

const file = () => new File(['%PDF-1.4'], 'source.pdf', { type: 'application/pdf' });
const claim = {
  schemaVersion: 1 as const,
  trust: 'browser-supplied-untrusted' as const,
  state: 'complete' as const,
  displayFilename: 'source.pdf',
  exactByteSize: 8,
  sha256Hex: 'a'.repeat(64),
  physicalPageCount: 2,
  pdfType: 'application/pdf' as const,
  readability: 'readable' as const,
};

const renderPanel = (overrides: Partial<ComponentProps<typeof BookSourceInspectionPanel>> = {}) => {
  const onAction = vi.fn();
  const onClaimChange = vi.fn();
  const onRequestUploadAuthorization = vi.fn();
  render(
    <BookSourceInspectionPanel
      canRequestUploadAuthorization
      onAction={onAction}
      onClaimChange={onClaimChange}
      onRequestUploadAuthorization={onRequestUploadAuthorization}
      {...overrides}
    />,
  );
  return { onAction, onClaimChange, onRequestUploadAuthorization };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  isSourcePdfInspectionClaimForFile.mockReturnValue(true);
});

describe('BookSourceInspectionPanel', () => {
  it('inspects the selected File and only continues with an exact valid claim', async () => {
    inspectSourcePdf.mockResolvedValue(claim);
    const selected = file();
    const harness = renderPanel();
    fireEvent.change(screen.getByLabelText('Source PDF'), { target: { files: [selected] } });

    await screen.findByText('source.pdf');
    expect(inspectSourcePdf).toHaveBeenCalledWith(selected, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(harness.onAction).toHaveBeenCalledWith(
      'book_source_pdf_inspection_completed',
      expect.objectContaining({ physicalPageCount: 2 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }));
    expect(harness.onRequestUploadAuthorization).toHaveBeenCalledWith({ file: selected, claim });
  });

  it('exposes the optional guided presentation without changing the inspection handlers', () => {
    renderPanel({ guided: true });

    const panel = screen.getByRole('heading', { name: 'Choose your PDF' }).closest('section');
    expect(panel).toHaveAttribute('data-presentation', 'guided');
    expect(screen.getByText(
      'Step 1 of 2: verify the exact PDF before any upload authorization is requested.',
    )).toBeInTheDocument();
  });

  it('keeps continuation disabled when authorization is unavailable', async () => {
    inspectSourcePdf.mockResolvedValue(claim);
    const selected = file();
    renderPanel({ canRequestUploadAuthorization: false });
    fireEvent.change(screen.getByLabelText('Source PDF'), { target: { files: [selected] } });

    await screen.findByText('source.pdf');
    expect(screen.getByRole('button', { name: 'Continue to upload' })).toBeDisabled();
    expect(screen.getByText('Upload authorization is disabled in this view.')).toBeInTheDocument();
  });

  it('cancels an in-flight inspection and invalidates the selected claim', async () => {
    inspectSourcePdf.mockImplementation(() => new Promise(() => undefined));
    const selected = file();
    const harness = renderPanel();
    fireEvent.change(screen.getByLabelText('Source PDF'), { target: { files: [selected] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel inspection' }));

    expect(invalidateSourcePdfInspectionClaim).toHaveBeenCalledWith(selected);
    expect(harness.onClaimChange).toHaveBeenLastCalledWith(null);
    expect(harness.onAction).toHaveBeenCalledWith('book_source_pdf_inspection_canceled');
    expect(toast.info).toHaveBeenCalledWith('PDF inspection canceled.');
  });

  it('turns a hung local inspection into a retryable error', async () => {
    vi.useFakeTimers();
    try {
      inspectSourcePdf.mockImplementation(() => new Promise(() => undefined));
      const selected = file();
      const harness = renderPanel();
      fireEvent.change(screen.getByLabelText('Source PDF'), { target: { files: [selected] } });

      expect(screen.getByText('Inspecting PDF locally…')).toBeInTheDocument();
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'PDF inspection timed out. Check the file and try again.',
      );
      expect(screen.getByRole('button', { name: 'Retry inspection' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to upload' })).toBeDisabled();
      expect(harness.onAction).toHaveBeenCalledWith(
        'book_source_pdf_inspection_failed',
        { code: 'timeout' },
      );
      expect(toast.error).toHaveBeenCalledWith(
        'PDF inspection timed out. Check the file and try again.',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers a retry after failure and invalidates on unmount', async () => {
    inspectSourcePdf
      .mockRejectedValueOnce(new Error('corrupt'))
      .mockResolvedValueOnce(claim);
    const selected = file();
    const harness = renderPanel();
    fireEvent.change(screen.getByLabelText('Source PDF'), { target: { files: [selected] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry inspection' }));
    await waitFor(() => expect(inspectSourcePdf).toHaveBeenCalledTimes(2));
    expect(harness.onAction).toHaveBeenCalledWith('book_source_pdf_inspection_retried', {
      exactByteSize: selected.size,
    });

    cleanup();
    expect(invalidateSourcePdfInspectionClaim).toHaveBeenCalledWith(selected);
    expect(harness.onClaimChange).toHaveBeenLastCalledWith(null);
  });
});
