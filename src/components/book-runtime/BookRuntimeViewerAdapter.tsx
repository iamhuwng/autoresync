import { useMemo, type ReactNode } from 'react';
import type {
  BookRuntimeDeliveryDocumentRequest,
  BookRuntimeStudentDocumentRequest,
} from '../../services/book-delivery/bookDelivery.types';
import type { BookRuntimeViewerAdapter, BookRuntimeViewerRenderInput } from './BookRuntimeShell';
import { BookPdfViewerHost, type BookPdfViewerHostProps } from './BookPdfViewerHost';

export interface BookRuntimeViewerAdapterOptions {
  readonly title?: string;
  readonly env?: BookPdfViewerHostProps['env'];
  readonly getIdToken?: BookPdfViewerHostProps['getIdToken'];
  readonly transportFactory?: BookPdfViewerHostProps['transportFactory'];
  readonly onRouteExpired?: BookPdfViewerHostProps['onRouteExpired'];
}

export interface BookRuntimeViewerAdapterViewProps {
  readonly title: string;
  readonly request: BookRuntimeDeliveryDocumentRequest | BookRuntimeStudentDocumentRequest | null;
  readonly combinedPhysicalPage: number;
  readonly env?: BookPdfViewerHostProps['env'];
  readonly getIdToken?: BookPdfViewerHostProps['getIdToken'];
  readonly transportFactory?: BookPdfViewerHostProps['transportFactory'];
  readonly onRouteExpired?: BookPdfViewerHostProps['onRouteExpired'];
  readonly allowedPages?: readonly number[];
  readonly onPageChange?: (page: number) => void;
  readonly onPageReady?: (page: number) => void;
}

const unavailable = (message = 'The Book reference is unavailable for this Activity.') => (
  <section className="book-runtime-viewer__unavailable" role="status" aria-live="polite">
    <h2>Book reference unavailable</h2>
    <p>{message}</p>
  </section>
);

export const BookRuntimeViewerAdapterView = ({
  title,
  request,
  combinedPhysicalPage,
  env,
  getIdToken,
  transportFactory,
  onRouteExpired,
  allowedPages,
  onPageChange,
  onPageReady,
}: BookRuntimeViewerAdapterViewProps) => {
  const route = useMemo(() => request === null ? null : ({
    opaqueRouteKey: request.opaqueRouteKey,
    ...('sourceVersionId' in request ? { sourceVersionId: request.sourceVersionId } : {}),
    expectedByteLength: request.expectedByteLength,
    expectedEtag: request.expectedEtag,
  }), [request?.expectedByteLength, request?.expectedEtag, request?.opaqueRouteKey,
    request && 'sourceVersionId' in request ? request.sourceVersionId : undefined]);
  if (route === null) return unavailable();
  return (
    <BookPdfViewerHost
      title={title}
      route={route}
      initialPage={combinedPhysicalPage}
      allowedPages={allowedPages}
      onPageChange={onPageChange}
      onPageReady={onPageReady}
      env={env}
      getIdToken={getIdToken}
      transportFactory={transportFactory}
      onRouteExpired={onRouteExpired}
    />
  );
};

export const createBookRuntimeViewerAdapter = (
  options: BookRuntimeViewerAdapterOptions = {},
): BookRuntimeViewerAdapter => {
  const title = options.title?.trim() || 'Book reference';
  const render = (input: BookRuntimeViewerRenderInput): ReactNode => (
    <BookRuntimeViewerAdapterView
      title={title}
      request={input.request}
      combinedPhysicalPage={input.combinedPhysicalPage}
      allowedPages={input.allowedPages}
      onPageChange={input.onPageChange}
      onPageReady={input.onPageReady}
      env={options.env}
      getIdToken={options.getIdToken}
      transportFactory={options.transportFactory}
      onRouteExpired={options.onRouteExpired}
    />
  );
  return { title, render, reportsPageReady: true };
};

export default createBookRuntimeViewerAdapter;
