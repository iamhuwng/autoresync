import {
  BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS,
  isBookImpactDiscoverySafeId,
  isBookImpactDiscoveryTimestamp,
  type BookImpactDiscoveryContextKind,
  type BookImpactDiscoveryResult,
  type BookImpactDiscoveryReadAdapters,
} from './contract.ts';
import {
  createBookImpactDiscoveryReadRepository,
  type BookImpactDiscoveryReadRepository,
} from './repository.ts';
import type { BookImpactDiscoveryReadStore } from './contract.ts';
import {
  projectBookImpactDiscoveryResponse,
  type BookImpactDiscoveryHttpProjection,
} from './projection.ts';

export interface BookImpactDiscoveryRouteInput {
  readonly request: Request;
  /** Verified Firebase identity from the canonical Worker boundary. */
  readonly uid: string;
  readonly repository: BookImpactDiscoveryReadRepository;
  /** Trusted server-composition clock input; never read from the URL. */
  readonly evaluatedAt?: string;
  readonly clock?: () => string;
  /** Trusted server-composition bound; never read from the URL. */
  readonly limit?: number;
}

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const contextKind = (value: string | undefined): BookImpactDiscoveryContextKind | null => (
  value === 'solo' || value === 'homework' ? value : null
);

/**
 * Cloudflare-local canonical matcher. The isolated Worker project cannot
 * import the root router graph; this mirrors its exact path/query boundary
 * without activating the #59 manifest or dispatcher.
 */
const canonicalImpactDiscoveryPath = /^\/v1\/book-impact\/discovery\/(solo|homework)$/u;

const matchCanonicalBookRoute = (
  request: Request,
): { readonly params: Readonly<{ readonly contextKind: string }> } | null => {
  const target = request.url;
  if (target.includes('?') || target.includes('#')) return null;
  const pathname = new URL(target).pathname;
  if (pathname.endsWith('/') || pathname.includes('//')) return null;
  const match = canonicalImpactDiscoveryPath.exec(pathname);
  if (!match) return null;
  let contextKind = match[1] ?? '';
  try {
    contextKind = decodeURIComponent(contextKind);
  } catch {
    return null;
  }
  return { params: { contextKind } };
};

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
  const matched = matchCanonicalBookRoute(input.request);
  if (!matched) {
    return json({ code: 'book_impact_discovery_canonical_route_required' }, 404);
  }
  const kind = contextKind(matched.params.contextKind);
  const evaluatedAt = input.evaluatedAt ?? input.clock?.();
  if (!kind || !evaluatedAt || !isBookImpactDiscoveryTimestamp(evaluatedAt)) {
    return json({ code: 'book_impact_discovery_composition_invalid' }, 400);
  }
  const limit = input.limit;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0
    || limit > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS)) {
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
  adapters: BookImpactDiscoveryReadAdapters,
) => {
  const repository = createBookImpactDiscoveryReadRepository(store, adapters);
  return Object.freeze({
    read: (input: Omit<BookImpactDiscoveryRouteInput, 'repository'>) => handleBookImpactDiscoveryRead({
      ...input,
      repository,
    }),
  });
};
