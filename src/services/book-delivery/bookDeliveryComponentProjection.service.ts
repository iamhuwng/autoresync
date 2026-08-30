import type { BookRuntimeProjection } from './bookDelivery.types';
import type {
  BookDeliveryComponentDescriptor,
  BookDeliveryComponentProjection,
  BookDeliveryComponentProjectionValidationError,
  BookDeliveryComponentProjectionValidationResult,
} from './bookDeliveryComponentProjection.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;

const validId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const validRouteKey = (value: unknown): value is string => typeof value === 'string' && ROUTE_KEY.test(value);
const positiveInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);

export class BookDeliveryComponentProjectionError extends Error {
  constructor(readonly errors: readonly BookDeliveryComponentProjectionValidationError[]) {
    super(errors[0]?.message ?? 'Invalid Book Delivery component projection.');
    this.name = 'BookDeliveryComponentProjectionError';
  }
}

const error = (
  errors: BookDeliveryComponentProjectionValidationError[],
  path: string,
  message: string,
): void => {
  errors.push({ path, message });
};

const sourceRequestMap = (
  projection: BookRuntimeProjection,
  errors: BookDeliveryComponentProjectionValidationError[],
): Map<string, BookRuntimeProjection['documentRequests'][number]> => {
  const requests = new Map<string, BookRuntimeProjection['documentRequests'][number]>();
  projection.documentRequests.forEach((request, index) => {
    const path = `documentRequests[${index}]`;
    if (!validId(request.sourceKey)) error(errors, `${path}.sourceKey`, 'Source key is invalid.');
    if (!validId(request.sourceVersionId)) error(errors, `${path}.sourceVersionId`, 'Source Version is invalid.');
    if (!validRouteKey(request.opaqueRouteKey)) error(errors, `${path}.opaqueRouteKey`, 'Opaque route key is invalid.');
    if (requests.has(request.sourceKey)) error(errors, `${path}.sourceKey`, 'Document request source key is duplicated.');
    requests.set(request.sourceKey, request);
  });
  return requests;
};

const sortedActivities = (projection: BookRuntimeProjection) => [...projection.activities].sort(
  (left, right) => left.order - right.order || left.activityId.localeCompare(right.activityId),
);

export const validateBookDeliveryComponentProjection = (
  projection: BookRuntimeProjection,
): BookDeliveryComponentProjectionValidationResult => {
  const errors: BookDeliveryComponentProjectionValidationError[] = [];
  const sources = projection.sourceSet.sources;
  const requests = sourceRequestMap(projection, errors);

  if (projection.sourceSet.strategy === 'full_pdf') {
    if (sources.length !== 1) error(errors, 'sourceSet.sources', 'full_pdf requires exactly one source.');
    if (projection.documentRequests.length !== 1) {
      error(errors, 'documentRequests', 'full_pdf requires exactly one document request.');
    }
    const source = sources[0];
    const request = source ? requests.get(source.sourceKey) : undefined;
    if (source && request?.sourceVersionId !== source.sourceVersionId) {
      error(errors, 'documentRequests', 'Document request Source Version does not match full-PDF source.');
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  if (sources.length === 0) error(errors, 'sourceSet.sources', 'component_pdfs requires at least one source.');
  const sourceOrders = new Set<number>();
  const sourceKeys = new Set<string>();
  sources.forEach((source, index) => {
    const path = `sourceSet.sources[${index}]`;
    if (!validId(source.sourceKey)) error(errors, `${path}.sourceKey`, 'Component source key is invalid.');
    if (!validId(source.sourceVersionId)) error(errors, `${path}.sourceVersionId`, 'Component Source Version is invalid.');
    if (!validId(source.ownerNodeKey)) error(errors, `${path}.ownerNodeKey`, 'Component owner node is invalid.');
    if (!positiveInteger(source.sourceOrder)) error(errors, `${path}.sourceOrder`, 'Component source order must be positive.');
    if (positiveInteger(source.sourceOrder) && sourceOrders.has(source.sourceOrder)) {
      error(errors, `${path}.sourceOrder`, 'Component source order is duplicated.');
    }
    if (validId(source.sourceKey) && sourceKeys.has(source.sourceKey)) {
      error(errors, `${path}.sourceKey`, 'Component source key is duplicated.');
    }
    const request = requests.get(source.sourceKey);
    if (!request) error(errors, `${path}.sourceKey`, 'Component has no matching document request.');
    else if (request.sourceVersionId !== source.sourceVersionId) {
      error(errors, `${path}.sourceVersionId`, 'Document request Source Version does not match component source.');
    }
    sourceOrders.add(source.sourceOrder!);
    sourceKeys.add(source.sourceKey);
  });
  if (requests.size !== sources.length) error(errors, 'documentRequests', 'Document requests must match authorized components exactly.');
  const sortedSourceOrders = [...sourceOrders].sort((left, right) => left - right);
  if (sourceOrders.size === sources.length && sortedSourceOrders.some((order, index) => order !== index + 1)) {
    error(errors, 'sourceSet.sources', 'Component source order must be dense and start at one.');
  }

  const placementIds = new Set<string>();
  const activityIds = new Set<string>();
  const sourceKeysFromPlacements = new Set<string>();
  projection.activities.forEach((activity, index) => {
    const path = `activities[${index}]`;
    if (!validId(activity.placementId) || placementIds.has(activity.placementId)) {
      error(errors, `${path}.placementId`, 'Placement ID must be unique and safe.');
    }
    if (!validId(activity.activityId) || activityIds.has(activity.activityId)) {
      error(errors, `${path}.activityId`, 'Activity ID must be unique and safe.');
    }
    placementIds.add(activity.placementId);
    activityIds.add(activity.activityId);
    activity.sourceContext.sourcePageScopes.forEach((scope, scopeIndex) => {
      if (!sourceKeys.has(scope.sourceKey)) {
        error(errors, `${path}.sourceContext.sourcePageScopes[${scopeIndex}]`, 'Activity references an unauthorized component.');
      }
      sourceKeysFromPlacements.add(scope.sourceKey);
    });
  });
  if (sources.some((source) => !sourceKeysFromPlacements.has(source.sourceKey))) {
    error(errors, 'activities', 'Every authorized component must retain its canonical component identity.');
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
};

export const createBookDeliveryComponentProjection = (
  projection: BookRuntimeProjection,
): BookDeliveryComponentProjection => {
  const validation = validateBookDeliveryComponentProjection(projection);
  if (!validation.valid) throw new BookDeliveryComponentProjectionError(validation.errors);
  if (projection.sourceSet.strategy === 'full_pdf') {
    return Object.freeze({
      strategy: 'full_pdf' as const,
      components: Object.freeze([]),
      fullPdfRequest: projection.documentRequests[0] ?? null,
    });
  }

  const requests = new Map(projection.documentRequests.map((request) => [request.sourceKey, request]));
  const placements = sortedActivities(projection);
  const components = [...projection.sourceSet.sources]
    .sort((left, right) => left.sourceOrder! - right.sourceOrder! || left.sourceKey.localeCompare(right.sourceKey))
    .map((source): BookDeliveryComponentDescriptor => {
      const componentPlacements = placements.filter((activity) => (
        activity.sourceContext.sourcePageScopes.some((scope) => scope.sourceKey === source.sourceKey)
      ));
      return Object.freeze({
        componentId: source.sourceKey,
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        sourceOrder: source.sourceOrder!,
        ownerNodeKey: source.ownerNodeKey!,
        localPageScope: source.localPageScope,
        documentRequest: requests.get(source.sourceKey)!,
        placementIds: Object.freeze(componentPlacements.map((activity) => activity.placementId)),
        activityIds: Object.freeze(componentPlacements.map((activity) => activity.activityId)),
      });
    });
  return Object.freeze({
    strategy: 'component_pdfs' as const,
    components: Object.freeze(components),
    fullPdfRequest: null,
  });
};
