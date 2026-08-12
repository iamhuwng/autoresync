import { getAuth } from 'firebase/auth';

import { resolveR2UploadEndpoint } from '../r2UploadClient';
import { trimWorkerEndpoint } from '../r2WorkerEndpoint';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';
import type { CourseBookCompletionAggregationPolicy, CourseBookPlacement, CourseBookSelection } from './courseBookPlacement.service';
import type { CourseBookSelectionCatalog } from './courseBookPlacement.selection';
import { BOOK_CONTENT_NODE_TYPES } from '../../types/bookAssembly.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;
const MAX_RESPONSE_BYTES = 1_200_000;

export interface CourseBookPlacementBrowserEnv {
  readonly DEV?: boolean;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
  readonly VITE_BOOK_COURSE_PLACEMENT_PRESENTATION?: string;
}

export interface CourseBookPlacementClientOptions {
  readonly env?: CourseBookPlacementBrowserEnv;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: typeof fetch;
}

export type CourseBookPlacementSelection = Readonly<{
  readonly bookId: string;
  readonly scope: CourseBookSelection;
  readonly completionAggregationPolicy?: CourseBookCompletionAggregationPolicy;
}>;

export interface CourseBookPlacementPlaceInput {
  readonly operationId: string;
  readonly courseId: string;
  readonly moduleId: string;
  readonly courseMaterialId: string;
  readonly selection: CourseBookPlacementSelection;
}

export interface CourseBookPlacementPrepareInput {
  readonly operationId: string;
  readonly courseMaterialId: string;
  readonly legacyEnrollmentId: string;
}

export interface CourseBookPlacementRevokeInput {
  readonly operationId: string;
  readonly courseMaterialId: string;
}

export interface CourseBookPlacementPlaceResult {
  readonly status: 'created' | 'replayed';
  readonly placement: CourseBookPlacement;
}

export interface CourseBookPlacementRevokeResult {
  readonly status: 'revoked' | 'replayed';
}

export interface CourseBookPlacementSelectedActivityV1 {
  readonly placementId: string;
  readonly nodeKey: string;
  readonly unitStableKey: string;
  readonly unitVersionId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly sourceVersionIds: readonly string[];
}

export interface CourseBookPlacementPinsV1 {
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly bindingRevision: number;
  readonly selectedActivities: readonly CourseBookPlacementSelectedActivityV1[];
}

export type CourseBookPlacementPins = CourseBookPlacementPinsV1;

export interface CourseBookPlacementRuntimeProjectionV1 {
  readonly projectionKind: 'course-book-delivery-v1';
  readonly context: {
    readonly kind: 'course';
    readonly contextId: string;
    readonly courseId: string;
  };
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementRevision: number;
  readonly completionAggregationPolicy: CourseBookCompletionAggregationPolicy;
  readonly selection: CourseBookSelection;
  readonly pins: CourseBookPlacementPins;
  readonly activityKeys: readonly {
    readonly placementId: string;
    readonly progressKey: string;
    readonly resultKey: string;
  }[];
}

export type CourseBookRuntimeProjection =
  | CourseBookPlacementRuntimeProjectionV1
  | BookRuntimeDeliveryProjection;

export interface CourseBookPlacementClient {
  catalog(bookId: string): Promise<CourseBookSelectionCatalog>;
  place(input: CourseBookPlacementPlaceInput): Promise<CourseBookPlacementPlaceResult>;
  prepare(input: CourseBookPlacementPrepareInput): Promise<CourseBookRuntimeProjection>;
  revoke(input: CourseBookPlacementRevokeInput): Promise<CourseBookPlacementRevokeResult>;
  current(courseMaterialId: string): Promise<CourseBookRuntimeProjection>;
}

export type CourseBookPlacementClientErrorCode =
  | 'unavailable'
  | 'unauthorized'
  | 'token_unavailable'
  | 'network_failure'
  | 'response_binding_mismatch'
  | 'response_too_large'
  | 'invalid_response'
  | 'invalid_operation_id'
  | 'invalid_course_id'
  | 'invalid_module_id'
  | 'invalid_course_material_id'
  | 'invalid_enrollment_id'
  | 'invalid_selection'
  | 'http_error'
  | (string & {});

export class CourseBookPlacementClientError extends Error {
  constructor(
    readonly code: CourseBookPlacementClientErrorCode,
    readonly status = 0,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'CourseBookPlacementClientError';
  }
}

function fail(code: CourseBookPlacementClientErrorCode, status = 0): never {
  throw new CourseBookPlacementClientError(code, status);
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value);
  return keys.length >= required.length
    && required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
};

const safeText = (value: unknown, maximum: number): value is string => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= maximum
  && !/[\u0000-\u001f\u007f]/u.test(value)
);

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) fail(`invalid_${label}` as CourseBookPlacementClientErrorCode);
  return value;
};

const safeOperationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) fail('invalid_operation_id');
  return value;
};

const safePositiveInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail('invalid_response', 502);
  return value as number;
};

const uniqueStrings = (values: readonly string[]): boolean => new Set(values).size === values.length;

function assertScope(value: unknown): asserts value is CourseBookSelection {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'nodeKeys', 'placementIds'])
    || !Array.isArray(value.nodeKeys) || !Array.isArray(value.placementIds)
    || !value.nodeKeys.every((item) => typeof item === 'string' && ID.test(item))
    || !value.placementIds.every((item) => typeof item === 'string' && ID.test(item))
    || !uniqueStrings(value.nodeKeys as string[]) || !uniqueStrings(value.placementIds as string[])) {
    fail('invalid_selection');
  }
  if (value.kind === 'subtree'
    && (value.nodeKeys.length < 1 || value.placementIds.length !== 0)) {
    fail('invalid_selection');
  }
  if (value.kind === 'placements'
    && (value.nodeKeys.length !== 0 || value.placementIds.length < 1)) {
    fail('invalid_selection');
  }
  if (value.kind !== 'subtree' && value.kind !== 'placements') fail('invalid_selection');
}

const normalizeSelection = (value: unknown): CourseBookPlacementSelection => {
  if (!isRecord(value) || !exactKeys(value, ['bookId', 'scope'], ['completionAggregationPolicy'])) fail('invalid_selection');
  safeId(value.bookId, 'book_id');
  assertScope(value.scope);
  if (value.completionAggregationPolicy !== undefined
    && value.completionAggregationPolicy !== 'all-activities'
    && value.completionAggregationPolicy !== 'all-activities-with-derived-homework-credit') fail('invalid_selection');
  return {
    bookId: value.bookId,
    scope: value.scope,
    ...(value.completionAggregationPolicy === undefined ? {} : {
      completionAggregationPolicy: value.completionAggregationPolicy,
    }),
  } as CourseBookPlacementSelection;
};

const assertV1SelectedActivities = (value: unknown): void => {
  if (!Array.isArray(value) || value.length < 1) fail('invalid_response', 502);
  const placementIds: string[] = [];
  value.forEach((item) => {
    if (!isRecord(item) || !exactKeys(item, [
      'placementId', 'nodeKey', 'unitStableKey', 'unitVersionId',
      'activityId', 'activityVersionId', 'sourceVersionIds',
    ])
      || ![item.placementId, item.nodeKey, item.unitStableKey, item.unitVersionId,
        item.activityId, item.activityVersionId]
        .every((entry) => typeof entry === 'string' && ID.test(entry))
      || !Array.isArray(item.sourceVersionIds) || item.sourceVersionIds.length < 1
      || !item.sourceVersionIds.every((entry) => typeof entry === 'string' && ID.test(entry))
      || !uniqueStrings(item.sourceVersionIds as string[])) {
      fail('invalid_response', 502);
    }
    placementIds.push(item.placementId as string);
  });
  if (!uniqueStrings(placementIds)) fail('invalid_response', 502);
};

const assertPins = (value: unknown): void => {
  if (!isRecord(value) || !exactKeys(value, [
    'bookId', 'publicationId', 'publicationRevision', 'manifestVersionId',
    'bindingRevision', 'selectedActivities',
  ])
    || typeof value.bookId !== 'string' || !ID.test(value.bookId)
    || typeof value.publicationId !== 'string' || !ID.test(value.publicationId)
    || typeof value.manifestVersionId !== 'string' || !ID.test(value.manifestVersionId)
    || typeof value.bindingRevision !== 'number' || !Number.isSafeInteger(value.bindingRevision)
    || value.bindingRevision < 1) {
    fail('invalid_response', 502);
  }
  safePositiveInteger(value.publicationRevision);
  assertV1SelectedActivities(value.selectedActivities);
};

function assertPlacement(value: unknown): asserts value is CourseBookPlacement {
  if (!isRecord(value)) fail('invalid_response', 502);
  const committed = exactKeys(value, [
    'courseMaterialId', 'courseId', 'moduleId', 'ownerId', 'displayTitle',
    'selection', 'placementRevision', 'completionAggregationPolicy', 'status', 'pins',
  ]);
  if (!committed
    || typeof value.courseMaterialId !== 'string' || !ID.test(value.courseMaterialId)
    || typeof value.courseId !== 'string' || !ID.test(value.courseId)
    || typeof value.moduleId !== 'string' || !ID.test(value.moduleId)
    || typeof value.ownerId !== 'string' || !ID.test(value.ownerId)
    || !safeText(value.displayTitle, 512)
    || !Number.isSafeInteger(value.placementRevision) || (value.placementRevision as number) < 1
    || (value.completionAggregationPolicy !== 'all-activities'
      && value.completionAggregationPolicy !== 'all-activities-with-derived-homework-credit')
    || (value.status !== 'active' && value.status !== 'revoked')) {
    fail('invalid_response', 502);
  }
  assertScope(value.selection);
  assertPins(value.pins);
  assertV1SelectedActivities((value.pins as Record<string, unknown>).selectedActivities);
}

const assertProjectionKeys = (value: unknown): void => {
  if (!isRecord(value)) fail('invalid_response', 502);
  const projectionKey = value;
  if (!safeText(projectionKey.progressKey, 1_024)
    || !safeText(projectionKey.resultKey, 1_024)
    || /[\\/]/u.test(projectionKey.progressKey)
    || /[\\/]/u.test(projectionKey.resultKey)) {
    fail('invalid_response', 502);
  }
};

const assertCourseProjectionV1 = (value: Record<string, unknown>): void => {
  if (!exactKeys(value, [
    'projectionKind', 'context', 'bindingId', 'bindingRevision', 'placementRevision',
    'completionAggregationPolicy', 'selection', 'pins', 'activityKeys',
  ]) || value.projectionKind !== 'course-book-delivery-v1'
    || !isRecord(value.context)
    || !exactKeys(value.context, ['kind', 'contextId', 'courseId'])
    || value.context.kind !== 'course'
    || typeof value.context.contextId !== 'string' || !ID.test(value.context.contextId)
    || typeof value.context.courseId !== 'string' || !ID.test(value.context.courseId)
    || typeof value.bindingId !== 'string' || !ID.test(value.bindingId)
    || typeof value.bindingRevision !== 'number' || !Number.isSafeInteger(value.bindingRevision)
    || value.bindingRevision < 1
    || typeof value.placementRevision !== 'number' || !Number.isSafeInteger(value.placementRevision)
    || value.placementRevision < 1
    || (value.completionAggregationPolicy !== 'all-activities'
      && value.completionAggregationPolicy !== 'all-activities-with-derived-homework-credit')
    || !Array.isArray(value.activityKeys) || value.activityKeys.length < 1) {
    fail('invalid_response', 502);
  }
  assertScope(value.selection);
  assertPins(value.pins);
  const placementIds: string[] = [];
  value.activityKeys.forEach((item) => {
    if (!isRecord(item) || !exactKeys(item, ['placementId', 'progressKey', 'resultKey'])
      || typeof item.placementId !== 'string' || !ID.test(item.placementId)) {
      fail('invalid_response', 502);
    }
    assertProjectionKeys(item);
    placementIds.push(item.placementId);
  });
  if (!uniqueStrings(placementIds)) fail('invalid_response', 502);
};

const assertSourcePageScope = (value: unknown): void => {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'pages'])
    || (value.kind !== 'all' && value.kind !== 'pages')
    || !Array.isArray(value.pages)
    || value.pages.some((page) => !Number.isSafeInteger(page) || (page as number) < 1)) {
    fail('invalid_response', 502);
  }
};

const assertGenericRuntimeProjection = (value: Record<string, unknown>): void => {
  if (!exactKeys(value, [
    'schemaVersion', 'projectionKind', 'bindingId', 'bindingRevision', 'recipientId',
    'context', 'book', 'scope', 'outline', 'sourceSet', 'documentRequests',
    'activities', 'actionFlags', 'provenance',
  ]) || value.schemaVersion !== 1 || value.projectionKind !== 'book-runtime-delivery'
    || typeof value.bindingId !== 'string' || !ID.test(value.bindingId)
    || typeof value.bindingRevision !== 'number' || !Number.isSafeInteger(value.bindingRevision)
    || value.bindingRevision < 1
    || typeof value.recipientId !== 'string' || !ID.test(value.recipientId)
    || !isRecord(value.context) || !exactKeys(value.context, ['contextId', 'kind', 'entitlementBasis'])
    || typeof value.context.contextId !== 'string' || !ID.test(value.context.contextId)
    || value.context.kind !== 'course'
    || value.context.entitlementBasis !== 'enrollment'
    || !isRecord(value.book) || !exactKeys(value.book, [
      'bookId', 'bookMode', 'bookRevision', 'manifestVersionId', 'publicationId', 'publicationRevision', 'publicationStatus',
    ])
    || typeof value.book.bookId !== 'string' || !ID.test(value.book.bookId)
    || value.book.bookMode !== 'pdf'
    || typeof value.book.bookRevision !== 'number' || !Number.isSafeInteger(value.book.bookRevision)
    || (value.book.bookRevision as number) < 1
    || typeof value.book.manifestVersionId !== 'string' || !ID.test(value.book.manifestVersionId)
    || typeof value.book.publicationId !== 'string' || !ID.test(value.book.publicationId)
    || typeof value.book.publicationRevision !== 'number' || !Number.isSafeInteger(value.book.publicationRevision)
    || (value.book.publicationRevision as number) < 1
    || value.book.publicationStatus !== 'published') {
    fail('invalid_response', 502);
  }
  assertScope(value.scope);
  const sourceSet = value.sourceSet;
  if (!Array.isArray(value.outline) || !isRecord(sourceSet)
    || !exactKeys(sourceSet, ['strategy', 'sources']) || !Array.isArray(sourceSet.sources)
    || (sourceSet.strategy !== 'full_pdf' && sourceSet.strategy !== 'component_pdfs')) {
    fail('invalid_response', 502);
  }
  value.outline.forEach((node) => {
    if (!isRecord(node) || !exactKeys(node, ['nodeKey', 'parentNodeKey', 'nodeType', 'order'], ['titleSnapshot'])
      || typeof node.nodeKey !== 'string' || !ID.test(node.nodeKey)
      || (node.parentNodeKey !== null && (typeof node.parentNodeKey !== 'string' || !ID.test(node.parentNodeKey)))
      || typeof node.nodeType !== 'string' || !Number.isSafeInteger(node.order) || (node.order as number) < 0
      || node.titleSnapshot !== undefined && !safeText(node.titleSnapshot, 512)) {
      fail('invalid_response', 502);
    }
  });
  const sourceKeys: string[] = [];
  sourceSet.sources.forEach((source) => {
    if (!isRecord(source) || !exactKeys(source, ['sourceKey', 'sourceVersionId', 'lifecycle', 'localPageScope'], ['sourceOrder', 'ownerNodeKey'])
      || typeof source.sourceKey !== 'string' || !ID.test(source.sourceKey)
      || typeof source.sourceVersionId !== 'string' || !ID.test(source.sourceVersionId)
      || source.lifecycle !== 'verified-usable'
      || source.sourceOrder !== undefined && (!Number.isSafeInteger(source.sourceOrder) || (source.sourceOrder as number) < 1)
      || source.ownerNodeKey !== undefined && (typeof source.ownerNodeKey !== 'string' || !ID.test(source.ownerNodeKey))) {
      fail('invalid_response', 502);
    }
    assertSourcePageScope(source.localPageScope);
    sourceKeys.push(source.sourceKey);
  });
  if (!uniqueStrings(sourceKeys) || !Array.isArray(value.documentRequests)
    || value.documentRequests.length !== sourceKeys.length) {
    fail('invalid_response', 502);
  }
  value.documentRequests.forEach((request) => {
    if (!isRecord(request) || !exactKeys(request, ['sourceKey', 'sourceVersionId', 'opaqueRouteKey', 'localPageScope'])
      || typeof request.sourceKey !== 'string' || !sourceKeys.includes(request.sourceKey)
      || typeof request.sourceVersionId !== 'string' || !ID.test(request.sourceVersionId)
      || typeof request.opaqueRouteKey !== 'string' || !OPAQUE_ROUTE_KEY.test(request.opaqueRouteKey)) {
      fail('invalid_response', 502);
    }
    assertSourcePageScope(request.localPageScope);
  });
  if (!Array.isArray(value.activities) || value.activities.length < 1) fail('invalid_response', 502);
  value.activities.forEach((activity) => {
    if (!isRecord(activity) || !exactKeys(activity, [
      'placementId', 'activityId', 'activityVersion', 'activityVersionId', 'nodeKey',
      'order', 'contextMode', 'sourceContext',
    ], ['titleSnapshot', 'scheduleWindow'])
      || typeof activity.placementId !== 'string' || !ID.test(activity.placementId)
      || typeof activity.activityId !== 'string' || !ID.test(activity.activityId)
      || typeof activity.activityVersion !== 'number' || !Number.isSafeInteger(activity.activityVersion)
      || (activity.activityVersion as number) < 1
      || typeof activity.activityVersionId !== 'string' || !ID.test(activity.activityVersionId)
      || typeof activity.nodeKey !== 'string' || !ID.test(activity.nodeKey)
      || typeof activity.order !== 'number' || !Number.isSafeInteger(activity.order) || (activity.order as number) < 0
      || !['none', 'optional', 'required'].includes(activity.contextMode as string)
      || activity.titleSnapshot !== undefined && !safeText(activity.titleSnapshot, 512)
      || !isRecord(activity.sourceContext)
      || !exactKeys(activity.sourceContext, ['available', 'description', 'pageGroupKeys', 'sourcePageScopes'])
      || typeof activity.sourceContext.available !== 'boolean'
      || !safeText(activity.sourceContext.description, 1_024)
      || !Array.isArray(activity.sourceContext.pageGroupKeys)
      || !activity.sourceContext.pageGroupKeys.every((key) => typeof key === 'string' && ID.test(key))
      || !Array.isArray(activity.sourceContext.sourcePageScopes)) {
      fail('invalid_response', 502);
    }
    activity.sourceContext.sourcePageScopes.forEach((scope) => {
      if (!isRecord(scope) || !exactKeys(scope, ['sourceKey', 'pages'])
        || typeof scope.sourceKey !== 'string' || !sourceKeys.includes(scope.sourceKey)
        || !Array.isArray(scope.pages)
        || scope.pages.some((page) => !Number.isSafeInteger(page) || (page as number) < 1)) {
        fail('invalid_response', 502);
      }
    });
  });
  if (!isRecord(value.actionFlags) || !exactKeys(value.actionFlags, ['canAutosave', 'canSubmit', 'canReview'])
    || typeof value.actionFlags.canAutosave !== 'boolean'
    || typeof value.actionFlags.canSubmit !== 'boolean'
    || typeof value.actionFlags.canReview !== 'boolean'
    || !isRecord(value.provenance)
    || !exactKeys(value.provenance, ['publicationId', 'publicationRevision', 'bindingId', 'bindingRevision'])
    || typeof value.provenance.publicationId !== 'string' || !ID.test(value.provenance.publicationId)
    || typeof value.provenance.publicationRevision !== 'number' || !Number.isSafeInteger(value.provenance.publicationRevision)
    || (value.provenance.publicationRevision as number) < 1
    || typeof value.provenance.bindingId !== 'string' || !ID.test(value.provenance.bindingId)
    || typeof value.provenance.bindingRevision !== 'number' || !Number.isSafeInteger(value.provenance.bindingRevision)
    || (value.provenance.bindingRevision as number) < 1) {
    fail('invalid_response', 502);
  }
};

export function assertCourseBookRuntimeProjection(value: unknown): asserts value is CourseBookRuntimeProjection {
  if (!isRecord(value)) fail('invalid_response', 502);
  if (value.projectionKind === 'course-book-delivery-v1') {
    assertCourseProjectionV1(value);
    return;
  }
  if (value.projectionKind === 'book-runtime-delivery') {
    assertGenericRuntimeProjection(value);
    return;
  }
  fail('invalid_response', 502);
}

export function assertCourseBookPlacement(value: unknown): asserts value is CourseBookPlacement {
  assertPlacement(value);
}

const assertPlaceResult = (value: Record<string, unknown>): CourseBookPlacementPlaceResult => {
  if (!exactKeys(value, ['status', 'placement'])
    || (value.status !== 'created' && value.status !== 'replayed')) {
    fail('invalid_response', 502);
  }
  assertPlacement(value.placement);
  return value as unknown as CourseBookPlacementPlaceResult;
};

const assertRevokeResult = (value: Record<string, unknown>): CourseBookPlacementRevokeResult => {
  if (!exactKeys(value, ['status']) || (value.status !== 'revoked' && value.status !== 'replayed')) {
    fail('invalid_response', 502);
  }
  return value as unknown as CourseBookPlacementRevokeResult;
};

const assertCatalog = (value: Record<string, unknown>): CourseBookSelectionCatalog => {
  if (!exactKeys(value, [
    'bookId', 'publicationId', 'publicationRevision', 'manifestVersionId',
    'sourceStrategy', 'sources', 'nodes', 'placements',
  ])
    || typeof value.bookId !== 'string' || !ID.test(value.bookId)
    || typeof value.publicationId !== 'string' || !ID.test(value.publicationId)
    || typeof value.manifestVersionId !== 'string' || !ID.test(value.manifestVersionId)
    || !Number.isSafeInteger(value.publicationRevision) || (value.publicationRevision as number) < 1
    || (value.sourceStrategy !== 'full_pdf' && value.sourceStrategy !== 'component_pdfs')
    || !Array.isArray(value.sources) || value.sources.length < 1
    || !Array.isArray(value.nodes) || value.nodes.length < 1
    || !Array.isArray(value.placements) || value.placements.length < 1) {
    fail('invalid_response', 502);
  }
  const sourceKeys: string[] = [];
  value.sources.forEach((source) => {
    if (!isRecord(source) || !exactKeys(source, ['sourceKey'], ['ownerNodeKey'])
      || typeof source.sourceKey !== 'string' || !ID.test(source.sourceKey)
      || (value.sourceStrategy === 'full_pdf' && source.ownerNodeKey !== undefined)
      || (value.sourceStrategy === 'component_pdfs'
        && (typeof source.ownerNodeKey !== 'string' || !ID.test(source.ownerNodeKey)))) {
      fail('invalid_response', 502);
    }
    sourceKeys.push(source.sourceKey);
  });
  const nodeKeys: string[] = [];
  value.nodes.forEach((node) => {
    if (!isRecord(node) || !exactKeys(node, ['nodeKey', 'parentNodeKey', 'nodeType', 'order'])
      || typeof node.nodeKey !== 'string' || !ID.test(node.nodeKey)
      || (node.parentNodeKey !== null && (typeof node.parentNodeKey !== 'string' || !ID.test(node.parentNodeKey)))
      || typeof node.nodeType !== 'string' || !BOOK_CONTENT_NODE_TYPES.includes(node.nodeType as never)
      || !Number.isSafeInteger(node.order) || (node.order as number) < 0) {
      fail('invalid_response', 502);
    }
    nodeKeys.push(node.nodeKey);
  });
  const placementIds: string[] = [];
  value.placements.forEach((placement) => {
    if (!isRecord(placement) || !exactKeys(placement, [
      'placementId', 'nodeKey', 'activityId', 'activityVersionId', 'sourceKeys',
    ])
      || ![placement.placementId, placement.nodeKey, placement.activityId, placement.activityVersionId]
        .every((entry) => typeof entry === 'string' && ID.test(entry))
      || !Array.isArray(placement.sourceKeys) || placement.sourceKeys.length < 1
      || !placement.sourceKeys.every((key) => typeof key === 'string' && sourceKeys.includes(key))
      || !uniqueStrings(placement.sourceKeys as string[])) {
      fail('invalid_response', 502);
    }
    placementIds.push(placement.placementId as string);
  });
  if (!uniqueStrings(sourceKeys) || !uniqueStrings(nodeKeys) || !uniqueStrings(placementIds)) {
    fail('invalid_response', 502);
  }
  return value as unknown as CourseBookSelectionCatalog;
};

const defaultGetIdToken = async (): Promise<string | null | undefined> => {
  try {
    return await getAuth().currentUser?.getIdToken();
  } catch {
    return undefined;
  }
};

const normalizeEndpoint = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CourseBookPlacementClientError('unavailable');
  }
  if (url.protocol !== 'https:' || url.username || url.password
    || url.search || url.hash || !/^\/+$/u.test(url.pathname)) {
    throw new CourseBookPlacementClientError('unavailable');
  }
  return trimWorkerEndpoint(url.origin);
};

export const resolveCourseBookPlacementEndpoint = (
  env: CourseBookPlacementBrowserEnv = import.meta.env as CourseBookPlacementBrowserEnv,
): string => normalizeEndpoint(
  env.VITE_BOOK_DELIVERY_WORKER_URL?.trim()
  || resolveR2UploadEndpoint(env),
);

export const isCourseBookPlacementPresentationEnabled = (
  env: CourseBookPlacementBrowserEnv = import.meta.env as CourseBookPlacementBrowserEnv,
): boolean => env.VITE_BOOK_COURSE_PLACEMENT_PRESENTATION?.trim().toLowerCase() === 'enabled';

const parseJson = async (response: Response): Promise<Record<string, unknown>> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RESPONSE_BYTES) {
      throw new CourseBookPlacementClientError('response_too_large', 502);
    }
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new CourseBookPlacementClientError('invalid_response', 502, { cause: error });
  }
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new CourseBookPlacementClientError('response_too_large', 502);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new Error('not_record');
    return value;
  } catch (error) {
    if (error instanceof CourseBookPlacementClientError) throw error;
    throw new CourseBookPlacementClientError('invalid_response', 502, { cause: error });
  }
};

const tokenFor = async (
  getIdToken: () => Promise<string | null | undefined>,
): Promise<string> => {
  let value: string | null | undefined;
  try {
    value = await getIdToken();
  } catch (error) {
    throw new CourseBookPlacementClientError('token_unavailable', 401, { cause: error });
  }
  const token = typeof value === 'string' ? value.trim() : '';
  if (!token) throw new CourseBookPlacementClientError('unauthorized', 401);
  return token;
};

export const createCourseBookPlacementClient = (
  options: CourseBookPlacementClientOptions = {},
): CourseBookPlacementClient => {
  const base = resolveCourseBookPlacementEndpoint(options.env);
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const getIdToken = options.getIdToken ?? defaultGetIdToken;

  const request = async (
    path: string,
    method: 'GET' | 'POST',
    payload?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const url = `${base}${path}`;
    const token = await tokenFor(getIdToken);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const init: RequestInit = {
      method,
      credentials: 'omit',
      redirect: 'error',
      headers,
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = String(payload.operationId ?? '');
      init.body = JSON.stringify(payload);
    }
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      if (error instanceof CourseBookPlacementClientError) throw error;
      throw new CourseBookPlacementClientError('network_failure', 0, { cause: error });
    }
    if (response.redirected || (response.url !== '' && response.url !== url)) {
      throw new CourseBookPlacementClientError('response_binding_mismatch', 502);
    }
    const parsed = await parseJson(response);
    if (!response.ok) {
      const code = typeof parsed.code === 'string' && parsed.code.trim()
        ? parsed.code
        : `http_${response.status}`;
      throw new CourseBookPlacementClientError(code, response.status);
    }
    return parsed;
  };

  return Object.freeze({
    async catalog(bookId: string): Promise<CourseBookSelectionCatalog> {
      const requestedBookId = safeId(bookId, 'book_id');
      const value = assertCatalog(await request(
        `/course-book-placement/catalog/${encodeURIComponent(requestedBookId)}`,
        'GET',
      ));
      if (value.bookId !== requestedBookId) fail('response_binding_mismatch', 502);
      return value;
    },
    async place(input: CourseBookPlacementPlaceInput): Promise<CourseBookPlacementPlaceResult> {
      const payload = {
        operationId: safeOperationId(input.operationId),
        courseId: safeId(input.courseId, 'course_id'),
        moduleId: safeId(input.moduleId, 'module_id'),
        courseMaterialId: safeId(input.courseMaterialId, 'course_material_id'),
        selection: normalizeSelection(input.selection),
      };
      return assertPlaceResult(await request('/course-book-placement/place', 'POST', payload));
    },
    async prepare(input: CourseBookPlacementPrepareInput): Promise<CourseBookRuntimeProjection> {
      const payload = {
        operationId: safeOperationId(input.operationId),
        courseMaterialId: safeId(input.courseMaterialId, 'course_material_id'),
        legacyEnrollmentId: safeId(input.legacyEnrollmentId, 'enrollment_id'),
      };
      const value = await request('/course-book-placement/prepare', 'POST', payload);
      assertCourseBookRuntimeProjection(value);
      return value;
    },
    async revoke(input: CourseBookPlacementRevokeInput): Promise<CourseBookPlacementRevokeResult> {
      const payload = {
        operationId: safeOperationId(input.operationId),
        courseMaterialId: safeId(input.courseMaterialId, 'course_material_id'),
      };
      return assertRevokeResult(await request('/course-book-placement/revoke', 'POST', payload));
    },
    async current(courseMaterialId: string): Promise<CourseBookRuntimeProjection> {
      const materialId = safeId(courseMaterialId, 'course_material_id');
      const value = await request(`/course-book-placement/current/${encodeURIComponent(materialId)}`, 'GET');
      assertCourseBookRuntimeProjection(value);
      return value;
    },
  });
};

export const createCourseBookPlacementBrowserClient = createCourseBookPlacementClient;
