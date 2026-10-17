import type {
  BookDeliverySourcePageScope,
  BookDeliverySourceStrategy,
  BookRuntimeDeliveryDocumentRequest,
} from './bookDelivery.types';

/** Student-safe component descriptor. Provider/storage identity never enters this type. */
export interface BookDeliveryComponentDescriptor {
  readonly componentId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey: string;
  readonly localPageScope: BookDeliverySourcePageScope;
  readonly documentRequest: BookRuntimeDeliveryDocumentRequest;
  readonly placementIds: readonly string[];
  readonly activityIds: readonly string[];
}

export interface BookDeliveryComponentProjection {
  readonly strategy: BookDeliverySourceStrategy;
  readonly components: readonly BookDeliveryComponentDescriptor[];
  readonly fullPdfRequest: BookRuntimeDeliveryDocumentRequest | null;
}

export interface BookDeliveryComponentProjectionValidationError {
  readonly path: string;
  readonly message: string;
}

export interface BookDeliveryComponentProjectionValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookDeliveryComponentProjectionValidationError[];
}
