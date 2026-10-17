import {
  createBookDeliveryDocumentTransport,
  type BookDeliveryBrowserEnv,
} from './bookDelivery.browser';
import type {
  BookDocumentTransport,
  BookDocumentTransportOptions,
} from './bookDocumentTransport.browser';
import type {
  BookDeliveryComponentDescriptor,
  BookDeliveryComponentProjection,
} from './bookDeliveryComponentProjection.types';

export const selectBookDeliveryComponent = (
  projection: BookDeliveryComponentProjection,
  componentId: string,
): BookDeliveryComponentDescriptor | null => (
  projection.components.find((component) => component.componentId === componentId) ?? null
);

export interface BookDeliveryComponentDocumentTransportOptions
  extends Omit<BookDocumentTransportOptions, 'route'> {
  readonly component: BookDeliveryComponentDescriptor;
  readonly env?: BookDeliveryBrowserEnv;
  readonly workerOrigin?: string;
}

/** Component selection only. 09A/09B still own token, binding, and byte authorization. */
export const createBookDeliveryComponentDocumentTransport = (
  options: BookDeliveryComponentDocumentTransportOptions,
): BookDocumentTransport => createBookDeliveryDocumentTransport({
  ...options,
  env: options.env,
  route: {
    workerOrigin: options.workerOrigin,
    opaqueRouteKey: options.component.documentRequest.opaqueRouteKey,
    sourceVersionId: options.component.sourceVersionId,
  },
});
