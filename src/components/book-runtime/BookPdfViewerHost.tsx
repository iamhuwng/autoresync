import { useEffect, useState } from 'react';
import {
  createBookDeliveryDocumentTransport,
  type BookDeliveryBrowserEnv,
  type BookDocumentRouteInput,
} from '../../services/book-delivery/bookDelivery.browser';
import type { BookDocumentRoute, BookDocumentTransport } from '../../services/book-delivery/bookDocumentTransport.browser';
import { BookPdfViewer } from './BookPdfViewer';

export interface BookPdfViewerHostProps {
  readonly title: string;
  readonly route: BookDocumentRouteInput | BookDocumentRoute;
  readonly initialPage?: number;
  readonly initialZoom?: number;
  readonly env?: BookDeliveryBrowserEnv;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly transportFactory?: typeof createBookDeliveryDocumentTransport;
}
export const BookPdfViewerHost = ({
  title,
  route,
  initialPage,
  initialZoom,
  env,
  getIdToken,
  transportFactory = createBookDeliveryDocumentTransport,
}: BookPdfViewerHostProps) => {
  const [retryToken, setRetryToken] = useState(0);
  const [transport, setTransport] = useState<BookDocumentTransport | null>(null);

  useEffect(() => {
    const nextTransport = transportFactory({
      route,
      env,
      getIdToken: async (forceRefresh = false) => {
        if (getIdToken) {
          return getIdToken(forceRefresh);
        }
        const auth = await import('firebase/auth');
        return auth.getAuth().currentUser?.getIdToken(forceRefresh) ?? '';
      },
    });
    setTransport(nextTransport);

    return () => {
      nextTransport.destroy();
    };
  }, [env, getIdToken, retryToken, route, transportFactory]);

  if (!transport) {
    return <div role="status">Preparing PDF transport...</div>;
  }

  return (
    <BookPdfViewer
      documentTitle={title}
      initialPage={initialPage}
      initialZoom={initialZoom}
      onRetry={() => setRetryToken((value) => value + 1)}
      transport={transport}
    />
  );
};

export default BookPdfViewerHost;
