import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BookDocumentTransport } from '../../services/book-delivery/bookDocumentTransport.browser';
import { BookPdfViewer } from './BookPdfViewer';

const getDocument = vi.fn();

vi.mock('pdfjs-dist', async () => {
  class PDFDataRangeTransport {
    readonly length: number;
    readonly initialData: Uint8Array | null;
    private rangeListeners: Array<(begin: number, chunk: Uint8Array | null) => void> = [];
    private progressListeners: Array<(loaded: number, total: number | undefined) => void> = [];
    constructor(length: number, initialData: Uint8Array | null) {
      this.length = length;
      this.initialData = initialData;
    }
    addRangeListener(listener: (begin: number, chunk: Uint8Array | null) => void) {
      this.rangeListeners.push(listener);
    }
    addProgressListener(listener: (loaded: number, total: number | undefined) => void) {
      this.progressListeners.push(listener);
    }
    addProgressiveReadListener() {}
    addProgressiveDoneListener() {}
    onDataRange(begin: number, chunk: Uint8Array | null) {
      for (const listener of this.rangeListeners) listener(begin, chunk);
    }
    onDataProgress(loaded: number, total: number | undefined) {
      for (const listener of this.progressListeners) listener(loaded, total);
    }
    onDataProgressiveRead() {}
    onDataProgressiveDone() {}
    transportReady() {}
    requestDataRange() {}
    abort() {}
  }

  return {
    GlobalWorkerOptions: { workerSrc: '' },
    PDFDataRangeTransport,
    getDocument,
  };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'worker-url',
}));

const canvasContext = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  createLinearGradient: vi.fn(),
  createPattern: vi.fn(),
  createRadialGradient: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
} as unknown as CanvasRenderingContext2D;

afterEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
    return contextId === '2d' ? canvasContext : null;
  });
});

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nsmoke');
const etag = `"${'a'.repeat(64)}"`;

const transport = (): BookDocumentTransport => {
  const head = vi.fn(async () => ({
    acceptRanges: 'bytes' as const,
    contentLength: pdfBytes.byteLength,
    contentType: 'application/pdf' as const,
    etag,
    sourceVersionId: 'source-v1',
    status: 200 as const,
  }));
  const get = vi.fn(async (range?: { readonly kind: 'closed'; readonly start: number; readonly end: number }) => {
    const slice = range
      ? pdfBytes.slice(range.start, range.end + 1)
      : pdfBytes;
    return {
      acceptRanges: 'bytes' as const,
      contentLength: slice.byteLength,
      contentRange: range
        ? {
            start: range.start,
            end: range.end,
            total: pdfBytes.byteLength,
          }
        : undefined,
      contentType: 'application/pdf' as const,
      etag,
      sourceVersionId: 'source-v1',
      status: range ? 206 as const : 200 as const,
      body: new Response(slice, {
        status: range ? 206 : 200,
        headers: {
          'accept-ranges': 'bytes',
          'content-length': String(slice.byteLength),
          'content-type': 'application/pdf',
          etag,
          ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${pdfBytes.byteLength}` } : {}),
        },
      }).body!,
      release: vi.fn(),
    };
  });
  return {
    head,
    get,
    switchRoute: vi.fn(),
    destroy: vi.fn(),
    get activeRequestCount() {
      return 0;
    },
  };
};

const makeDocument = () => {
  const renderTask = { promise: Promise.resolve(undefined), cancel: vi.fn() };
  const page = {
    getViewport: ({ scale }: { readonly scale: number }) => ({
      width: 1000 * scale,
      height: 1400 * scale,
    }),
    render: vi.fn(() => renderTask),
    cleanup: vi.fn(),
  };
  const document = {
    numPages: 2,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(async () => undefined),
  };
  return { document, page, renderTask };
};

describe('BookPdfViewer', () => {
  it('loads a document through the transport bridge and supports page and zoom controls', async () => {
    const user = userEvent.setup();
    const fakeTransport = transport();
    const { document, page } = makeDocument();
    vi.mocked(getDocument).mockImplementation((options: any) => {
      queueMicrotask(() => options.range?.requestDataRange(0, 4));
      return {
        promise: Promise.resolve(document),
        destroy: vi.fn(async () => undefined),
      };
    });
    const { container } = render(
      <BookPdfViewer documentTitle="Smoke PDF" transport={fakeTransport} />,
    );

    await waitFor(() => expect(screen.getByText('Page 1 of 2 rendered at Fit width.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByLabelText('Zoom level')).toHaveTextContent('Fit width');
    expect(fakeTransport.head).toHaveBeenCalledTimes(1);
    expect(fakeTransport.get).toHaveBeenCalledWith(
      { kind: 'closed', start: 0, end: 3 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(page.render).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByLabelText('Page 2 of 2')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(screen.getByLabelText('Zoom level')).toHaveTextContent('110%'));

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await waitFor(() => expect(screen.getByLabelText('Zoom level')).toHaveTextContent('100%'));

    await user.clear(screen.getByLabelText('Page number'));
    await user.type(screen.getByLabelText('Page number'), '1{enter}');
    await waitFor(() => expect(screen.getByLabelText('Page 1 of 2')).toBeInTheDocument());

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('shows a safe retryable message when the transport fails', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const failingTransport = {
      head: vi.fn(async () => {
        throw Object.assign(new Error('denied'), {
          name: 'BookDocumentTransportError',
          code: 'unauthorized',
        });
      }),
      get: vi.fn(),
      switchRoute: vi.fn(),
      destroy: vi.fn(),
      get activeRequestCount() {
        return 0;
      },
    } satisfies BookDocumentTransport;

    render(
      <BookPdfViewer
        documentTitle="Smoke PDF"
        onRetry={onRetry}
        transport={failingTransport}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PDF access was denied.'));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows source-revoked copy without exposing route or token details', async () => {
    const failingTransport = {
      head: vi.fn(async () => {
        throw Object.assign(new Error('route expired for smoke-viewer-token'), {
          name: 'BookDocumentTransportError',
          code: 'route_expired',
        });
      }),
      get: vi.fn(),
      switchRoute: vi.fn(),
      destroy: vi.fn(),
      get activeRequestCount() {
        return 0;
      },
    } satisfies BookDocumentTransport;

    render(
      <BookPdfViewer
        documentTitle="Smoke PDF"
        transport={failingTransport}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'PDF route is no longer available. Retry or reopen the viewer.',
      );
    });
    expect(document.body).not.toHaveTextContent('smoke-viewer-token');
    expect(document.body).not.toHaveTextContent('Bearer');
  });

  it('destroys a pending PDF.js loading task on unmount', async () => {
    const fakeTransport = transport();
    const destroyLoadingTask = vi.fn(async () => undefined);
    vi.mocked(getDocument).mockImplementation(() => ({
      promise: new Promise(() => undefined),
      destroy: destroyLoadingTask,
    }));

    const { unmount } = render(
      <BookPdfViewer documentTitle="Smoke PDF" transport={fakeTransport} />,
    );

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(destroyLoadingTask).toHaveBeenCalledTimes(1));
  });
});
