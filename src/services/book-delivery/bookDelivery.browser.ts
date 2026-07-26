import { resolveR2UploadEndpoint } from '../r2UploadClient';
import {
  createBookDocumentTransport,
  BookDocumentTransportError,
  type BookDocumentRoute,
  type BookDocumentTransport,
  type BookDocumentTransportOptions,
} from './bookDocumentTransport.browser';

export interface BookDeliveryBrowserEnv {
  readonly DEV?: boolean;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface BookDocumentRouteInput {
  readonly workerOrigin?: string;
  readonly opaqueRouteKey: string;
  readonly sourceVersionId: string;
  readonly expectedByteLength?: number;
  readonly expectedEtag?: string;
  readonly physicalPageNumber?: number;
}

const ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;

const defaultEnv = (): BookDeliveryBrowserEnv =>
  (import.meta.env ?? {}) as BookDeliveryBrowserEnv;

const exactWorkerOrigin = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BookDocumentTransportError('invalid_route');
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:')
    || (url.protocol === 'http:' && url.hostname !== 'localhost')
    || url.username !== ''
    || url.password !== ''
    || !/^\/+$/u.test(url.pathname)
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new BookDocumentTransportError('invalid_route');
  }
  return url.origin;
};

export const resolveBookDeliveryWorkerOrigin = (
  env: BookDeliveryBrowserEnv = defaultEnv(),
): string => {
  const explicit = env.VITE_BOOK_DELIVERY_WORKER_URL?.trim();
  if (explicit) return exactWorkerOrigin(explicit);
  return exactWorkerOrigin(resolveR2UploadEndpoint(env));
};

export const createBookDocumentRoute = (
  input: BookDocumentRouteInput,
  env: BookDeliveryBrowserEnv = defaultEnv(),
): BookDocumentRoute => {
  if (!ROUTE_KEY.test(input.opaqueRouteKey)) {
    throw new BookDocumentTransportError('invalid_route');
  }
  const origin = exactWorkerOrigin(input.workerOrigin ?? resolveBookDeliveryWorkerOrigin(env));
  return Object.freeze({
    url: `${origin}/v1/book-delivery/document/${encodeURIComponent(input.opaqueRouteKey)}`,
    sourceVersionId: input.sourceVersionId,
    expectedByteLength: input.expectedByteLength,
    expectedEtag: input.expectedEtag,
    physicalPageNumber: input.physicalPageNumber,
  });
};

export const createBookDeliveryDocumentTransport = (
  options: Omit<BookDocumentTransportOptions, 'route'> & {
    readonly route: BookDocumentRouteInput | BookDocumentRoute;
    readonly env?: BookDeliveryBrowserEnv;
  },
): BookDocumentTransport => {
  const route = 'opaqueRouteKey' in options.route
    ? createBookDocumentRoute(options.route, options.env)
    : options.route;
  return createBookDocumentTransport({ ...options, route });
};
