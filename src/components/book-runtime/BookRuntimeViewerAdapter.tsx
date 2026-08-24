import { useMemo, type ReactNode } from 'react';
import type { BookRuntimeDeliveryDocumentRequest } from '../../services/book-delivery/bookDelivery.types';
import type { BookRuntimeViewerAdapter, BookRuntimeViewerRenderInput } from './BookRuntimeShell';
import { BookPdfViewerHost, type BookPdfViewerHostProps } from './BookPdfViewerHost';

export interface BookRuntimeViewerAdapterOptions {
  readonly title?: string;
  readonly env?: BookPdfViewerHostProps['env'];
  readonly getIdToken?: BookPdfViewerHostProps['getIdToken'];
  readonly transportFactory?: BookPdfViewerHostProps['transportFactory'];
}

export interface BookRuntimeViewerAdapterViewProps {
  readonly title: string;
  readonly request: BookRuntimeDeliveryDocumentRequest | null;
  readonly physicalPageNumber: number;
  readonly env?: BookPdfViewerHostProps['env'];
  readonly getIdToken?: BookPdfViewerHostProps['getIdToken'];
  readonly transportFactory?: BookPdfViewerHostProps['transportFactory'];
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
  physicalPageNumber,
  env,
  getIdToken,
  transportFactory,
}: BookRuntimeViewerAdapterViewProps) => {
  const route = useMemo(() => request === null ? null : ({
    opaqueRouteKey: request.opaqueRouteKey,
    sourceVersionId: request.sourceVersionId,
  }), [request?.opaqueRouteKey, request?.sourceVersionId]);
  if (route === null) return unavailable();
  return (
    <BookPdfViewerHost
      title={title}
      route={route}
      initialPage={physicalPageNumber}
      env={env}
      getIdToken={getIdToken}
      transportFactory={transportFactory}
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
      physicalPageNumber={input.physicalPageNumber}
      env={options.env}
      getIdToken={options.getIdToken}
      transportFactory={options.transportFactory}
    />
  );
  return { title, render };
};

export default createBookRuntimeViewerAdapter;
