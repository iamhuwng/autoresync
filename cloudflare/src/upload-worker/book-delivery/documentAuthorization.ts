import { createFirebaseVerifier } from '../firebase-verification.js';
import type {
  BookDeliveryRepositoryEnv,
} from './repository.ts';
import type {
  BookDeliveryRepository,
  BookDeliveryResolvedEntitlement,
} from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import type { BookSourceVersionStorageIdentity } from '../../../../src/types/bookSource.types.ts';

const SAFE_ID = /^[A-Za-z0-9._~-]{1,160}$/u;
const SAFE_OBJECT_KEY =
  /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u;

export interface BookDocumentAuthorizationEnv extends BookDeliveryRepositoryEnv {
  readonly FIREBASE_PROJECT_ID?: string;
}

export interface BookDocumentAuthorizationDecision {
  readonly kind: 'book-document-authorized';
  readonly uid: string;
  readonly bindingId: string;
  readonly contextId: string;
  readonly contextKind: BookDeliveryResolvedEntitlement['pointer']['contextKind'];
  readonly bookId: string;
  readonly bookRevision: number;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly sourceStrategy: BookDeliveryResolvedEntitlement['record']['binding']['sourceSet']['strategy'];
  readonly sourceVersionIds: readonly string[];
  readonly sourceLocations: readonly BookDocumentAuthorizedSource[];
  readonly scope: BookDeliveryResolvedEntitlement['record']['binding']['scope'];
}

export interface BookDocumentAuthorizedSource extends BookSourceVersionStorageIdentity {
  readonly provider: 'b2';
  readonly bucket: string;
  readonly objectKey: string;
}

export interface LiveBookDocumentAuthority {
  readonly publicationStatus: 'published' | 'unpublished';
  readonly scheduleOpen: boolean;
  readonly sourceVersionIds: readonly string[];
  readonly revokedSourceVersionIds: readonly string[];
  readonly sourceLocations: readonly BookDocumentAuthorizedSource[];
}

export type BookDocumentAuthorizationFailureCode =
  | 'unauthorized'
  | 'not-found'
  | 'inactive-profile'
  | 'stale-binding'
  | 'unpublished'
  | 'unsafe-source'
  | 'unsupported-context';

export type BookDocumentAuthorizationResult =
  | { readonly ok: true; readonly decision: BookDocumentAuthorizationDecision }
  | {
      readonly ok: false;
      readonly code: BookDocumentAuthorizationFailureCode;
    };

export interface BookDocumentProfile {
  readonly role: 'student';
  readonly status: 'active';
}

const activeProfile = (value: unknown): value is BookDocumentProfile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (
    profile.role === 'student' &&
    profile.status === 'active'
  );
};

const safeId = (value: string): boolean => SAFE_ID.test(value);
const safeObjectKey = (value: string): boolean => SAFE_OBJECT_KEY.test(value);

export const authorizeBookDocumentRequest = async (input: {
  readonly repository: BookDeliveryRepository;
  readonly uid: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly profile: unknown;
  readonly readCurrentAuthority: (
    binding: BookDeliveryResolvedEntitlement['record']['binding'],
  ) => Promise<LiveBookDocumentAuthority>;
}): Promise<BookDocumentAuthorizationResult> => {
  if (
    !safeId(input.uid) ||
    !safeId(input.recipientId) ||
    !safeId(input.contextId) ||
    input.uid !== input.recipientId
  ) {
    return { ok: false, code: 'unauthorized' };
  }
  if (!activeProfile(input.profile)) {
    return { ok: false, code: 'inactive-profile' };
  }

  const resolved = await input.repository.resolveCurrent(
    input.recipientId,
    input.contextId,
  );
  if (!resolved) return { ok: false, code: 'not-found' };

  const { record, pointer } = resolved;
  const binding = record.binding;
  if (
    record.status !== 'active' ||
    binding.status !== 'active' ||
    pointer.status !== 'active' ||
    pointer.bindingId !== binding.bindingId ||
    pointer.bindingRevision !== binding.revision ||
    pointer.recipientId !== binding.recipient.recipientId ||
    pointer.contextId !== binding.context.contextId ||
    binding.recipient.recipientId !== input.uid ||
    binding.context.recipientId !== input.uid ||
    binding.recipient.recipientKind !== 'student'
  ) {
    return { ok: false, code: 'stale-binding' };
  }
  if (binding.context.kind !== 'solo' &&
      binding.context.kind !== 'homework' &&
      binding.context.kind !== 'course' &&
      binding.context.kind !== 'class') {
    return {
      ok: false,
      code: 'unsupported-context',
    };
  }
  if (
    binding.sourceSet.sources.length === 0 ||
    binding.sourceSet.sources.some(
      (source) =>
        !safeId(source.sourceKey) ||
        !safeId(source.sourceVersionId) ||
        source.lifecycle !== 'verified-usable',
    )
  ) {
    return { ok: false, code: 'unsafe-source' };
  }
  const authority = await input.readCurrentAuthority(binding);
  const expectedSourceIds = binding.sourceSet.sources
    .map((source) => source.sourceVersionId)
    .sort();
  if (
    authority.publicationStatus !== 'published' ||
    authority.scheduleOpen !== true ||
    authority.revokedSourceVersionIds.length > 0 ||
    authority.sourceVersionIds.slice().sort().join('\u0000') !==
      expectedSourceIds.join('\u0000') ||
    authority.sourceLocations.length !== expectedSourceIds.length ||
    new Set(authority.sourceLocations.map((location) => location.sourceVersionId)).size !==
      expectedSourceIds.length ||
    authority.sourceLocations.map((location) => location.sourceVersionId).sort().join('\u0000') !==
      expectedSourceIds.join('\u0000') ||
    authority.sourceLocations.some((location) =>
      !safeId(location.sourceVersionId) ||
      !safeId(location.storageLocationId) ||
      location.providerKind !== 'backblaze-b2-s3' ||
      !safeId(location.privateBucketId) ||
      !safeId(location.bucket) ||
      !safeObjectKey(location.objectKey) ||
      !safeId(location.providerFileId) ||
      !safeId(location.providerFileVersionId) ||
      location.providerObjectKey !== location.objectKey ||
      location.checksum.algorithm !== 'sha-256' ||
      !/^[a-f0-9]{64}$/u.test(location.checksum.value) ||
      !Number.isSafeInteger(location.byteSize) ||
      location.byteSize < 1 ||
      location.byteSize > 500 * 1024 * 1024 ||
      location.provider !== 'b2')
  ) {
    return {
      ok: false,
      code: authority.publicationStatus !== 'published'
        ? 'unpublished'
        : 'stale-binding',
    };
  }

  return {
    ok: true,
    decision: {
      kind: 'book-document-authorized',
      uid: input.uid,
      bindingId: binding.bindingId,
      contextId: binding.context.contextId,
      contextKind: binding.context.kind,
      bookId: binding.book.bookId,
      bookRevision: binding.book.bookRevision,
      publicationId: binding.book.publicationId,
      publicationRevision: binding.book.publicationRevision,
      sourceStrategy: binding.sourceSet.strategy,
      sourceVersionIds: binding.sourceSet.sources.map((source) => source.sourceVersionId),
      sourceLocations: authority.sourceLocations,
      scope: binding.scope,
    },
  };
};

export interface BookDocumentAuthorizationHostOptions {
  readonly repository: BookDeliveryRepository;
  readonly resolveRouteKey: (
    routeKey: string,
  ) => Promise<{ readonly recipientId: string; readonly contextId: string } | null>;
  readonly readCurrentAuthority: (
    binding: BookDeliveryResolvedEntitlement['record']['binding'],
  ) => Promise<LiveBookDocumentAuthority>;
  readonly verifier?: {
    verifyAuthorizationHeader(
      authorization: string | null,
      env: BookDocumentAuthorizationEnv,
    ): Promise<{ readonly valid: boolean; readonly uid?: string }>;
  };
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-book-server-only': '1',
    },
  });

const routeFor = (
  request: Request,
): { readonly routeKey: string } | null => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0) return null;
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (
    segments.length !== 4 ||
    segments[0] !== 'v1' ||
    segments[1] !== 'book-delivery' ||
    segments[2] !== 'document' ||
    !safeId(segments[3]!)
  ) {
    return null;
  }
  return { routeKey: segments[3]! };
};

export const createBookDocumentAuthorizationHost = (
  options: BookDocumentAuthorizationHostOptions,
) => ({
  async fetch(
    request: Request,
    env: BookDocumentAuthorizationEnv,
  ): Promise<Response> {
    try {
      const route = routeFor(request);
      if (!route) return json({ code: 'not_found' }, 404);

      const authorization = await (options.verifier ?? createFirebaseVerifier())
        .verifyAuthorizationHeader(request.headers.get('authorization'), env);
      if (!authorization.valid || !authorization.uid) {
        return json({ code: 'unauthorized' }, 401);
      }
      const profile = env.readDatabaseValue
        ? await env.readDatabaseValue(`users/${authorization.uid}`)
        : null;
      if (!profile) return json({ code: 'inactive-profile' }, 403);
      const resolvedRoute = await options.resolveRouteKey(route.routeKey);
      if (!resolvedRoute) return json({ code: 'not_found' }, 404);

      const result = await authorizeBookDocumentRequest({
        repository: options.repository,
        uid: authorization.uid,
        recipientId: resolvedRoute.recipientId,
        contextId: resolvedRoute.contextId,
        profile,
        readCurrentAuthority: options.readCurrentAuthority,
      });
      if (!result.ok) {
        return json(
          { code: result.code },
          result.code === 'not-found' ? 404 : 403,
        );
      }
      // The decision is consumed in-process by 09B. Never serialize it.
      return json({ status: 'authorized' }, 200);
    } catch {
      return json({ code: 'authorization_unavailable' }, 503);
    }
  },
});
