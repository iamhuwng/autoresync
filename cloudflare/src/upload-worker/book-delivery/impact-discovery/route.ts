import {
  BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS,
  isBookImpactDiscoverySafeId,
  isBookImpactDiscoveryTimestamp,
  type BookImpactDiscoveryContextKind,
  type BookImpactDiscoveryResult,
} from '../../../../../src/services/book-delivery/bookImpactDiscovery.types.ts';
import {
  createBookImpactDiscoveryReadRepository,
  type BookImpactDiscoveryReadRepository,
  type BookImpactDiscoveryReadStore,
} from './repository.ts';
import {
  projectBookImpactDiscoveryResponse,
  type BookImpactDiscoveryHttpProjection,
} from './projection.ts';

export interface BookImpactDiscoveryRouteInput {
  readonly request: Request;
  /** Verified Firebase identity from the canonical Worker boundary. */
  readonly uid: string;
  readonly repository: BookImpactDiscoveryReadRepository;
}

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const contextKind = (value: string | null): BookImpactDiscoveryContextKind | null => (
  value === 'solo' || value === 'homework' ? value : null
);

/**
 * GET-only, default-disabled seam handler. Composition supplies the verified
 * UID and repository; this module never writes Firebase or delivery state.
 */
export const handleBookImpactDiscoveryRead = async (
  input: BookImpactDiscoveryRouteInput,
): Promise<Response> => {
  if (input.request.method !== 'GET' || !isBookImpactDiscoverySafeId(input.uid)) {
    return json({ code: 'book_impact_discovery_forbidden' }, 403);
  }
  const url = new URL(input.request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const kind = contextKind(url.searchParams.get('contextKind') ?? pathSegments[pathSegments.length - 1] ?? null);
  const evaluatedAt = url.searchParams.get('at');
  if (!kind || !evaluatedAt || !isBookImpactDiscoveryTimestamp(evaluatedAt)) {
    return json({ code: 'book_impact_discovery_query_invalid' }, 400);
  }
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0 || limit > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS)) {
    return json({ code: 'book_impact_discovery_limit_invalid' }, 413);
  }
  let result: BookImpactDiscoveryResult;
  try {
    result = await input.repository.discover(kind, {
      actorId: input.uid,
      evaluatedAt,
      ...(limit === undefined ? {} : { limit }),
    });
  } catch {
    return json({ code: 'book_impact_discovery_uncertain' }, 409);
  }
  let projection: BookImpactDiscoveryHttpProjection;
  try {
    projection = projectBookImpactDiscoveryResponse(result);
  } catch {
    return json({ code: 'book_impact_discovery_uncertain' }, 409);
  }
  return projection.ok
    ? json(projection.body, projection.status)
    : json({ code: projection.code }, projection.status);
};

/** Test/local composition helper; it still exposes no write operation. */
export const createBookImpactDiscoveryRoute = (
  store: BookImpactDiscoveryReadStore,
) => {
  const repository = createBookImpactDiscoveryReadRepository(store);
  return Object.freeze({
    read: (input: Omit<BookImpactDiscoveryRouteInput, 'repository'>) => handleBookImpactDiscoveryRead({
      ...input,
      repository,
    }),
  });
};
