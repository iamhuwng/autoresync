import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  BookDocumentTransport,
  BookDocumentTransportError,
  BookDocumentTransportMetadata,
} from '../../services/book-delivery/bookDocumentTransport.browser';
import './BookPdfViewer.css';

type PdfDataRangeTransportCtor = typeof import('pdfjs-dist')['PDFDataRangeTransport'];
type PdfDocumentLoadingTask = import('pdfjs-dist').PDFDocumentLoadingTask;
type PdfDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;
type PdfPageProxy = import('pdfjs-dist').PDFPageProxy;
type RenderTask = import('pdfjs-dist').RenderTask;

const MAX_ZOOM = 3;
const MIN_ZOOM = 0.5;
const ZOOM_STEP = 0.1;
const DEFAULT_CUSTOM_ZOOM = 1;
const RANGE_CHUNK_SIZE = 64 * 1024;

type LoadStatus =
  | { readonly state: 'loading'; readonly message: string }
  | {
      readonly state: 'ready';
      readonly metadata: BookDocumentTransportMetadata;
      readonly pageCount: number;
    }
  | { readonly state: 'error'; readonly message: string; readonly code?: string };

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

export interface BookPdfViewerProps {
  readonly documentTitle: string;
  readonly transport: BookDocumentTransport;
  readonly initialPage?: number;
  readonly initialZoom?: number;
  readonly onRetry?: () => void;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const transportErrorMessage = (error: unknown): { readonly message: string; readonly code?: string } => {
  if (isTransportError(error)) {
    return {
      code: error.code,
      message: error.code === 'route_expired'
        ? 'PDF route is no longer available. Retry or reopen the viewer.'
        : error.code === 'unauthorized'
          ? 'PDF access was denied. Sign in again and retry.'
          : error.code === 'forbidden'
            ? 'You do not have access to this PDF.'
            : error.code === 'missing_user' || error.code === 'token_unavailable'
              ? 'PDF access token is unavailable. Sign in again and retry.'
              : error.code === 'rate_limited'
                ? 'PDF access is temporarily rate limited. Retry in a moment.'
                : error.code === 'server_unavailable'
                  ? 'PDF service is unavailable. Retry.'
                  : error.code === 'invalid_route'
                    ? 'PDF route is invalid.'
                    : error.code === 'range_not_satisfiable'
                      ? 'Requested PDF range is outside document bounds.'
                      : 'PDF viewer could not load this document.',
    };
  }

  return {
    message: error instanceof Error
      ? error.message
      : 'PDF viewer could not load this document.',
  };
};

const isTransportError = (error: unknown): error is BookDocumentTransportError =>
  error instanceof Error
  && error.name === 'BookDocumentTransportError'
  && isRecord(error)
  && typeof (error as Record<string, unknown>).code === 'string';

const readStream = async (body: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const resolveScale = (
  page: PdfPageProxy,
  canvasHost: HTMLElement,
  zoomMode: ZoomMode,
  customZoom: number,
): number => {
  const baseViewport = page.getViewport({ scale: 1 });
  const { width, height } = canvasHost.getBoundingClientRect();
  const availableWidth = Math.max(320, (width > 0 ? width : 960) - 32);
  const availableHeight = Math.max(280, (height > 0 ? height : 720) - 32);
  const rawScale = zoomMode === 'fit-page'
    ? Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
    : zoomMode === 'fit-width'
      ? availableWidth / baseViewport.width
      : customZoom;
  return clamp(rawScale, MIN_ZOOM, MAX_ZOOM);
};

const formatZoomLabel = (zoomMode: ZoomMode, customZoom: number): string => {
  if (zoomMode === 'fit-width') return 'Fit width';
  if (zoomMode === 'fit-page') return 'Fit page';
  return `${Math.round(customZoom * 100)}%`;
};

const createRangeTransport = (
  PdfDataRangeTransport: PdfDataRangeTransportCtor,
  transport: BookDocumentTransport,
  documentLength: number,
  onFailure: (error: unknown) => void,
): import('pdfjs-dist').PDFDataRangeTransport => {
  const pendingControllers = new Set<AbortController>();

  class BookPdfRangeTransport extends PdfDataRangeTransport {
    constructor() {
      super(documentLength, null);
      this.transportReady();
    }

    override requestDataRange(begin: number, end: number): void {
      if (begin < 0 || end <= begin) return;
      const controller = new AbortController();
      pendingControllers.add(controller);
      void (async () => {
        try {
          const response = await transport.get(
            { kind: 'closed', start: begin, end: end - 1 },
            { signal: controller.signal },
          );
          const bytes = await readStream(response.body);
          response.release();
          if (controller.signal.aborted) return;
          this.onDataRange(begin, bytes);
          this.onDataProgress(begin + bytes.byteLength, documentLength);
        } catch (error) {
          if (controller.signal.aborted) return;
          onFailure(error);
        } finally {
          pendingControllers.delete(controller);
        }
      })();
    }

    override abort(): void {
      for (const controller of pendingControllers) {
        controller.abort();
      }
      pendingControllers.clear();
      super.abort();
    }
  }

  return new BookPdfRangeTransport();
};

export const BookPdfViewer = ({
  documentTitle,
  transport,
  initialPage = 1,
  initialZoom = DEFAULT_CUSTOM_ZOOM,
  onRetry,
}: BookPdfViewerProps) => {
  const titleId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const loadingTaskRef = useRef<PdfDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pdfDocumentRef = useRef<PdfDocumentProxy | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({
    state: 'loading',
    message: 'Loading PDF...',
  });
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pageDraft, setPageDraft] = useState(String(initialPage));
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [customZoom, setCustomZoom] = useState(initialZoom);
  const [layoutTick, setLayoutTick] = useState(0);
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle');
  const [renderMessage, setRenderMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const abortController = new AbortController();
    let rangeTransport: import('pdfjs-dist').PDFDataRangeTransport | null = null;
    let workerReady = false;

    const cleanup = async (): Promise<void> => {
      abortController.abort();
      rangeTransport?.abort();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      pdfDocumentRef.current = null;
      await loadingTaskRef.current?.destroy().catch(() => undefined);
      loadingTaskRef.current = null;
    };

    const load = async (): Promise<void> => {
      setLoadStatus({ state: 'loading', message: 'Loading PDF...' });
      setRenderState('idle');
      setRenderMessage('');
      try {
        const metadata = await transport.head(undefined, { signal: abortController.signal });
        if (abortController.signal.aborted || disposed) return;
        const [{ getDocument, GlobalWorkerOptions, PDFDataRangeTransport }, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (abortController.signal.aborted || disposed) return;
        GlobalWorkerOptions.workerSrc = workerModule.default;
        workerReady = true;
        rangeTransport = createRangeTransport(
          PDFDataRangeTransport,
          transport,
          metadata.contentLength,
          (error) => {
            if (disposed || abortController.signal.aborted) return;
            void cleanup();
            const failure = transportErrorMessage(error);
            setLoadStatus({ state: 'error', ...failure });
            setRenderState('error');
            setRenderMessage(failure.message);
          },
        );
        const loadingTask = getDocument({
          range: rangeTransport,
          rangeChunkSize: RANGE_CHUNK_SIZE,
          disableAutoFetch: true,
          disableStream: true,
          stopAtErrors: true,
        });
        loadingTaskRef.current = loadingTask;
        const document = await loadingTask.promise;
        if (disposed || abortController.signal.aborted) {
          await document.destroy().catch(() => undefined);
          return;
        }
        pdfDocumentRef.current = document;
        setLoadStatus({
          state: 'ready',
          metadata,
          pageCount: document.numPages,
        });
        const nextPage = clamp(initialPage, 1, document.numPages);
        setPageNumber(nextPage);
        setPageDraft(String(nextPage));
        setRenderState('idle');
      } catch (error) {
        if (disposed || abortController.signal.aborted) return;
        const failure = transportErrorMessage(error);
        setLoadStatus({ state: 'error', ...failure });
        setRenderState('error');
        setRenderMessage(failure.message);
      }
    };

    void load();

    return () => {
      disposed = true;
      if (workerReady) {
        rangeTransport?.abort();
      }
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      pdfDocumentRef.current = null;
      void loadingTaskRef.current?.destroy().catch(() => undefined);
      loadingTaskRef.current = null;
      abortController.abort();
    };
  }, [initialPage, transport]);

  useEffect(() => {
    if (loadStatus.state !== 'ready') return;
    const nextPage = clamp(pageNumber, 1, loadStatus.pageCount);
    if (nextPage !== pageNumber) {
      setPageNumber(nextPage);
      setPageDraft(String(nextPage));
    }
  }, [loadStatus, pageNumber]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || typeof ResizeObserver !== 'function') {
      const onResize = () => setLayoutTick((value) => value + 1);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const observer = new ResizeObserver(() => setLayoutTick((value) => value + 1));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (loadStatus.state !== 'ready') return;
    const document = pdfDocumentRef.current;
    const canvas = canvasRef.current;
    const host = canvasHostRef.current;
    if (!document || !canvas || !host) return;

    let destroyed = false;
    const render = async (): Promise<void> => {
      setRenderState('rendering');
      try {
        const page = await document.getPage(pageNumber);
        if (destroyed) return;
        const scale = resolveScale(page, host, zoomMode, customZoom);
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas 2D context unavailable.');
        }
        renderTaskRef.current?.cancel();
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);
        const task = page.render({ canvas: canvas as HTMLCanvasElement, canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (destroyed) return;
        page.cleanup();
        setRenderState('ready');
        setRenderMessage(`Page ${pageNumber} of ${loadStatus.pageCount} rendered at ${formatZoomLabel(zoomMode, customZoom)}.`);
      } catch (error) {
        if (destroyed) return;
        const cancelled = isRecord(error) && typeof (error as { name?: unknown }).name === 'string' && (error as { name: string }).name === 'RenderingCancelledException';
        if (cancelled) return;
        setRenderState('error');
        setRenderMessage('Could not render this PDF page.');
      }
    };

    void render();

    return () => {
      destroyed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [customZoom, layoutTick, loadStatus, pageNumber, zoomMode]);

  const pageCount = loadStatus.state === 'ready' ? loadStatus.pageCount : 0;
  const canGoPrev = loadStatus.state === 'ready' && pageNumber > 1;
  const canGoNext = loadStatus.state === 'ready' && pageNumber < pageCount;
  const zoomLabel = formatZoomLabel(zoomMode, customZoom);
  const statusText = useMemo(() => {
    if (loadStatus.state === 'loading') return loadStatus.message;
    if (loadStatus.state === 'error') return loadStatus.message;
    if (renderState === 'rendering') return `Rendering page ${pageNumber} of ${pageCount}...`;
    if (renderState === 'error') return renderMessage || 'PDF page render failed.';
    return renderMessage || `Page ${pageNumber} of ${pageCount} ready.`;
  }, [loadStatus, pageCount, pageNumber, renderMessage, renderState]);

  const commitPageDraft = () => {
    if (loadStatus.state !== 'ready') return;
    const requested = Number.parseInt(pageDraft, 10);
    if (!Number.isFinite(requested)) {
      setPageDraft(String(pageNumber));
      return;
    }
    const next = clamp(requested, 1, pageCount);
    setPageNumber(next);
    setPageDraft(String(next));
  };

  const pageLabel = loadStatus.state === 'ready'
    ? `Page ${pageNumber} of ${pageCount}`
    : 'Page unavailable';

  return (
    <section className="book-pdf-viewer" aria-labelledby={titleId}>
      <header className="book-pdf-viewer__header">
        <div>
          <p className="book-pdf-viewer__eyebrow">PDF viewer</p>
          <h2 id={titleId}>{documentTitle}</h2>
        </div>
        <div className="book-pdf-viewer__meta" aria-label="PDF source metadata">
          {loadStatus.state === 'ready' ? (
            <>
              <span>{loadStatus.metadata.sourceVersionId}</span>
              <span>{loadStatus.metadata.contentLength.toLocaleString()} bytes</span>
            </>
          ) : null}
        </div>
      </header>

      <div className="book-pdf-viewer__toolbar" aria-label="PDF viewer controls">
        <button type="button" onClick={() => setPageNumber((value) => clamp(value - 1, 1, pageCount))} disabled={!canGoPrev}>
          Previous page
        </button>
        <button type="button" onClick={() => setPageNumber((value) => clamp(value + 1, 1, pageCount))} disabled={!canGoNext}>
          Next page
        </button>
        <label className="book-pdf-viewer__page-input">
          <span>Page</span>
          <input
            aria-label="Page number"
            disabled={loadStatus.state !== 'ready'}
            inputMode="numeric"
            min={1}
            max={pageCount || undefined}
            onBlur={commitPageDraft}
            onChange={(event) => setPageDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPageDraft();
              }
            }}
            type="number"
            value={pageDraft}
          />
        </label>
        <button type="button" onClick={() => setZoomMode('fit-width')}>
          Fit width
        </button>
        <button type="button" onClick={() => setZoomMode('fit-page')}>
          Fit page
        </button>
        <button
          type="button"
          onClick={() => {
            setZoomMode('custom');
            setCustomZoom((value) => clamp(Number((value - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
          }}
        >
          Zoom out
        </button>
        <button
          type="button"
          onClick={() => {
            setZoomMode('custom');
            setCustomZoom((value) => clamp(Number((value + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
          }}
        >
          Zoom in
        </button>
        <span className="book-pdf-viewer__zoom" aria-label="Zoom level">{zoomLabel}</span>
      </div>

      <div
        className="book-pdf-viewer__canvas-host"
        data-render-state={renderState}
        ref={canvasHostRef}
      >
        {loadStatus.state === 'ready' ? (
          <canvas
            aria-label={pageLabel}
            className="book-pdf-viewer__canvas"
            ref={canvasRef}
          />
        ) : null}
        {loadStatus.state === 'loading' ? (
          <div className="book-pdf-viewer__state" role="status">
            {loadStatus.message}
          </div>
        ) : null}
        {loadStatus.state === 'error' ? (
          <div className="book-pdf-viewer__state" role="alert">
            <p>{loadStatus.message}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry}>Retry</button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p aria-live="polite" className="book-pdf-viewer__status">
        {statusText}
      </p>
    </section>
  );
};

export default BookPdfViewer;
