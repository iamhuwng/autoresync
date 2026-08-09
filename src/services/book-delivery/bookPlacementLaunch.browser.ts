import { getAuth } from 'firebase/auth';
import type { RouteParams } from '../../constants/routes';
import {
  createClassBookPlacementBrowserClient,
  type ClassBookPlacementBrowserClient,
} from './classBookPlacement.browser';
import {
  classBookBindingContextId,
} from './classBookPlacement.types';
import {
  createCourseBookPlacementBrowserClient,
  type CourseBookPlacementClient,
} from './courseBookPlacement.browser';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';
import { resolveBookDeliveryWorkerOrigin } from './bookDelivery.browser';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ROUTE_KEY = /^[A-Za-z0-9._~-]{1,160}$/u;

export type BookPlacementSurface = 'course' | 'class';

export interface CourseBookPlacementLaunch {
  readonly kind: 'course';
  readonly surface: 'course';
  readonly courseMaterialId: string;
  readonly bindingId: string;
}

export interface ClassBookPlacementLaunch {
  readonly kind: 'class';
  readonly surface: 'class';
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly bindingId: string;
}

export type ValidBookPlacementLaunch =
  | CourseBookPlacementLaunch
  | ClassBookPlacementLaunch;

export type BookPlacementLaunchQuery =
  | { readonly kind: 'none'; readonly explicit: false }
  | { readonly kind: 'invalid'; readonly explicit: true; readonly reason: BookPlacementLaunchParseReason }
  | (ValidBookPlacementLaunch & { readonly explicit: true });

export type BookPlacementLaunchParseReason =
  | 'unsupported-surface'
  | 'duplicate-parameter'
  | 'unexpected-parameter'
  | 'missing-parameter'
  | 'invalid-parameter';

const courseKeys = new Set(['bookSurface', 'courseMaterialId', 'bindingId']);
const classKeys = new Set([
  'bookSurface',
  'classId',
  'copyId',
  'classPlacementId',
  'classCourseMaterialId',
  'bindingId',
]);

const queryInput = (value: string | URLSearchParams | { readonly search: string }): URLSearchParams => {
  if (typeof value === 'string') return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
  if (value instanceof URLSearchParams) return new URLSearchParams(value.toString());
  return new URLSearchParams(value.search.startsWith('?') ? value.search.slice(1) : value.search);
};

const invalid = (reason: BookPlacementLaunchParseReason): BookPlacementLaunchQuery => ({
  kind: 'invalid',
  explicit: true,
  reason,
});

/**
 * Parse only an explicit Book launch query. A query without bookSurface is
 * deliberately treated as a legacy route, even when it contains materialId.
 */
export const parseBookPlacementLaunchQuery = (
  value: string | URLSearchParams | { readonly search: string },
): BookPlacementLaunchQuery => {
  const params = queryInput(value);
  if (!params.has('bookSurface')) return { kind: 'none', explicit: false };

  const surface = params.get('bookSurface');
  if (surface !== 'course' && surface !== 'class') return invalid('unsupported-surface');

  const allowed = surface === 'course' ? courseKeys : classKeys;
  for (const key of new Set(params.keys())) {
    if (!allowed.has(key)) return invalid('unexpected-parameter');
    if (params.getAll(key).length !== 1) return invalid('duplicate-parameter');
  }

  const required = surface === 'course'
    ? ['courseMaterialId', 'bindingId']
    : ['classId', 'copyId', 'classPlacementId', 'classCourseMaterialId', 'bindingId'];
  for (const key of required) {
    const valueForKey = params.get(key);
    if (valueForKey === null || valueForKey.length === 0) return invalid('missing-parameter');
    if (!SAFE_ID.test(valueForKey)) return invalid('invalid-parameter');
  }

  if (surface === 'course') {
    return {
      kind: 'course',
      surface,
      explicit: true,
      courseMaterialId: params.get('courseMaterialId')!,
      bindingId: params.get('bindingId')!,
    };
  }

  return {
    kind: 'class',
    surface,
    explicit: true,
    classId: params.get('classId')!,
    copyId: params.get('copyId')!,
    classPlacementId: params.get('classPlacementId')!,
    classCourseMaterialId: params.get('classCourseMaterialId')!,
    bindingId: params.get('bindingId')!,
  };
};

/** Short alias for callers that already have the browser Location object. */
export const parseBookPlacementLaunch = parseBookPlacementLaunchQuery;

export const isExplicitBookPlacementLaunch = (
  value: BookPlacementLaunchQuery,
): value is Exclude<BookPlacementLaunchQuery, { readonly kind: 'none' }> => value.explicit;

export interface BookPlacementLaunchClients {
  readonly course?: Pick<CourseBookPlacementClient, 'current'>;
  readonly class?: Pick<ClassBookPlacementBrowserClient, 'resolveCurrent'>;
}

export interface ResolveBookPlacementLaunchInput {
  readonly launch: ValidBookPlacementLaunch;
  readonly studentId: string;
  readonly clients?: BookPlacementLaunchClients;
}

export type BookPlacementLaunchBlockReason =
  | 'authentication-required'
  | 'client-unavailable'
  | 'projection-unavailable'
  | 'projection-kind-mismatch'
  | 'context-mismatch'
  | 'binding-mismatch'
  | 'recipient-mismatch'
  | 'legacy-projection';

export type BookPlacementLaunchResolution =
  | { readonly status: 'resolved'; readonly projection: BookRuntimeDeliveryProjection }
  | { readonly status: 'blocked'; readonly reason: BookPlacementLaunchBlockReason; readonly error?: unknown };

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

/**
 * This guard intentionally checks the canonical discriminator and identity
 * fields before the context-specific checks below. In particular, the old
 * class-book-delivery-v1 projection is never adapted into a runtime payload.
 */
const isCanonicalBookRuntimeDeliveryProjection = (
  value: unknown,
): value is BookRuntimeDeliveryProjection => {
  if (!record(value)
    || value.projectionKind !== 'book-runtime-delivery'
    || value.schemaVersion !== 1
    || typeof value.bindingId !== 'string'
    || !SAFE_ID.test(value.bindingId)
    || !Number.isSafeInteger(value.bindingRevision)
    || (value.bindingRevision as number) < 1
    || typeof value.recipientId !== 'string'
    || !SAFE_ID.test(value.recipientId)
    || !record(value.context)
    || typeof value.context.contextId !== 'string'
    || !SAFE_ID.test(value.context.contextId)
    || (value.context.kind !== 'course' && value.context.kind !== 'class')
    || (value.context.entitlementBasis !== 'enrollment'
      && value.context.entitlementBasis !== 'membership')
    || !record(value.book)
    || typeof value.book.bookId !== 'string'
    || !SAFE_ID.test(value.book.bookId)
    || value.book.bookMode !== 'pdf'
    || !Number.isSafeInteger(value.book.bookRevision)
    || (value.book.bookRevision as number) < 1
    || typeof value.book.publicationId !== 'string'
    || !SAFE_ID.test(value.book.publicationId)
    || !Number.isSafeInteger(value.book.publicationRevision)
    || (value.book.publicationRevision as number) < 1
    || value.book.publicationStatus !== 'published'
    || !record(value.scope)
    || (value.scope.kind !== 'subtree' && value.scope.kind !== 'placements')
    || !Array.isArray(value.scope.nodeKeys)
    || !value.scope.nodeKeys.every((key) => typeof key === 'string' && SAFE_ID.test(key))
    || !Array.isArray(value.scope.placementIds)
    || !value.scope.placementIds.every((key) => typeof key === 'string' && SAFE_ID.test(key))
    || !Array.isArray(value.outline)
    || !record(value.sourceSet)
    || (value.sourceSet.strategy !== 'full_pdf' && value.sourceSet.strategy !== 'component_pdfs')
    || !Array.isArray(value.sourceSet.sources)
    || !Array.isArray(value.documentRequests)
    || !Array.isArray(value.activities)
    || !record(value.actionFlags)
    || typeof value.actionFlags.canAutosave !== 'boolean'
    || typeof value.actionFlags.canSubmit !== 'boolean'
    || typeof value.actionFlags.canReview !== 'boolean'
    || !record(value.provenance)
    || typeof value.provenance.publicationId !== 'string'
    || value.provenance.publicationId !== value.book.publicationId
    || value.provenance.publicationRevision !== value.book.publicationRevision
    || typeof value.provenance.bindingId !== 'string'
    || !SAFE_ID.test(value.provenance.bindingId)
    || value.provenance.bindingId !== value.bindingId
    || !Number.isSafeInteger(value.provenance.bindingRevision)
    || value.provenance.bindingRevision !== value.bindingRevision) {
    return false;
  }
  return value.documentRequests.every((request) => record(request)
      && typeof request.sourceKey === 'string' && SAFE_ID.test(request.sourceKey)
      && typeof request.sourceVersionId === 'string' && SAFE_ID.test(request.sourceVersionId)
      && typeof request.opaqueRouteKey === 'string' && ROUTE_KEY.test(request.opaqueRouteKey)
      && record(request.localPageScope)
      && (request.localPageScope.kind === 'all' || request.localPageScope.kind === 'pages')
      && Array.isArray(request.localPageScope.pages))
    && value.activities.every((activity) => record(activity)
      && typeof activity.placementId === 'string' && SAFE_ID.test(activity.placementId)
      && typeof activity.activityId === 'string' && SAFE_ID.test(activity.activityId)
      && typeof activity.activityVersionId === 'string' && SAFE_ID.test(activity.activityVersionId)
      && Number.isSafeInteger(activity.activityVersion)
      && (activity.activityVersion as number) > 0
      && typeof activity.nodeKey === 'string' && SAFE_ID.test(activity.nodeKey)
      && Number.isSafeInteger(activity.order)
      && record(activity.sourceContext)
      && typeof activity.sourceContext.available === 'boolean'
      && typeof activity.sourceContext.description === 'string'
      && Array.isArray(activity.sourceContext.pageGroupKeys)
      && Array.isArray(activity.sourceContext.sourcePageScopes));
};

const blocked = (
  reason: BookPlacementLaunchBlockReason,
  error?: unknown,
): BookPlacementLaunchResolution => ({ status: 'blocked', reason, ...(error === undefined ? {} : { error }) });

const defaultClassClient = (): Pick<ClassBookPlacementBrowserClient, 'resolveCurrent'> => (
  createClassBookPlacementBrowserClient({
    baseUrl: resolveBookDeliveryWorkerOrigin(),
    getIdToken: async () => getAuth().currentUser?.getIdToken() ?? null,
  })
);

const resolveCourse = async (
  launch: CourseBookPlacementLaunch,
  studentId: string,
  client: Pick<CourseBookPlacementClient, 'current'>,
): Promise<BookPlacementLaunchResolution> => {
  let candidate: unknown;
  try {
    candidate = await client.current(launch.courseMaterialId);
  } catch (error) {
    return blocked('projection-unavailable', error);
  }
  if (!isCanonicalBookRuntimeDeliveryProjection(candidate)) {
    return record(candidate) && candidate.projectionKind === 'course-book-delivery-v1'
      ? blocked('legacy-projection')
      : blocked('projection-kind-mismatch');
  }
  if (candidate.context.kind !== 'course'
    || candidate.context.contextId !== launch.courseMaterialId) return blocked('context-mismatch');
  if (candidate.bindingId !== launch.bindingId) return blocked('binding-mismatch');
  if (candidate.recipientId !== studentId) return blocked('recipient-mismatch');
  return { status: 'resolved', projection: candidate };
};

const resolveClass = async (
  launch: ClassBookPlacementLaunch,
  studentId: string,
  client: Pick<ClassBookPlacementBrowserClient, 'resolveCurrent'>,
): Promise<BookPlacementLaunchResolution> => {
  let candidate: unknown;
  try {
    candidate = await client.resolveCurrent({
      classId: launch.classId,
      copyId: launch.copyId,
      classPlacementId: launch.classPlacementId,
      classCourseMaterialId: launch.classCourseMaterialId,
      bindingId: launch.bindingId,
    });
  } catch (error) {
    return blocked('projection-unavailable', error);
  }
  if (!isCanonicalBookRuntimeDeliveryProjection(candidate)) {
    return record(candidate) && candidate.projectionKind === 'class-book-delivery-v1'
      ? blocked('legacy-projection')
      : blocked('projection-kind-mismatch');
  }
  const expectedContextId = classBookBindingContextId(
    launch.classId,
    launch.copyId,
    launch.classCourseMaterialId,
    launch.classPlacementId,
  );
  if (candidate.context.kind !== 'class'
    || candidate.context.contextId !== expectedContextId) return blocked('context-mismatch');
  if (candidate.bindingId !== launch.bindingId) return blocked('binding-mismatch');
  if (candidate.recipientId !== studentId) return blocked('recipient-mismatch');
  return { status: 'resolved', projection: candidate };
};

export const resolveBookPlacementLaunch = async (
  input: ResolveBookPlacementLaunchInput,
): Promise<BookPlacementLaunchResolution> => {
  if (!SAFE_ID.test(input.studentId)) return blocked('authentication-required');
  if (input.launch.kind === 'course') {
    let client: Pick<CourseBookPlacementClient, 'current'>;
    try {
      client = input.clients?.course ?? createCourseBookPlacementBrowserClient();
    } catch (error) {
      return blocked('client-unavailable', error);
    }
    return resolveCourse(input.launch, input.studentId, client);
  }

  let client: Pick<ClassBookPlacementBrowserClient, 'resolveCurrent'>;
  try {
    client = input.clients?.class ?? defaultClassClient();
  } catch (error) {
    return blocked('client-unavailable', error);
  }
  return resolveClass(input.launch, input.studentId, client);
};

export const resolveBookPlacementLaunchDecision = resolveBookPlacementLaunch;

export const resolveBookPlacementLaunchProjection = async (
  input: ResolveBookPlacementLaunchInput,
): Promise<BookRuntimeDeliveryProjection> => {
  const result = await resolveBookPlacementLaunch(input);
  if (result.status !== 'resolved') {
    throw new Error(`book_launch_${result.reason}`);
  }
  return result.projection;
};

/**
 * `useNavigation` has no separate query argument, so this value includes the
 * encoded route parameter and the explicit launch query.
 */
export const buildBookPlacementPracticeRouteParam = (
  materialId: string,
  launch: ValidBookPlacementLaunch,
): string => {
  if (!SAFE_ID.test(materialId)) throw new Error('book_launch_material_id_invalid');
  const query = new URLSearchParams({
    bookSurface: launch.surface,
    ...(launch.kind === 'course'
      ? {
        courseMaterialId: launch.courseMaterialId,
        bindingId: launch.bindingId,
      }
      : {
        classId: launch.classId,
        copyId: launch.copyId,
        classPlacementId: launch.classPlacementId,
        classCourseMaterialId: launch.classCourseMaterialId,
        bindingId: launch.bindingId,
      }),
  });
  return `${encodeURIComponent(materialId)}?${query.toString()}`;
};

export const buildBookPlacementPracticeRouteParams = (
  materialId: string,
  launch: ValidBookPlacementLaunch,
): RouteParams => ({ materialId: buildBookPlacementPracticeRouteParam(materialId, launch) });
