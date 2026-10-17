import {
  BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS,
  isBookImpactDiscoverySafeId,
  type BookImpactDiscoveryAuthorizationResult,
  type BookImpactDiscoveryContextKind,
} from './contract.ts';

export interface BookImpactReadIdentity {
  readonly actorId: string;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly ownerScope: 'actor-owned-solo' | 'uploader-owned-homework';
  readonly maxContexts?: number;
}

/**
 * The Worker boundary receives a trusted identity declaration, never a
 * browser-supplied owner or recipient.  No context record is read here.
 */
export const authorizeBookImpactRead = (
  identity: BookImpactReadIdentity | null | undefined,
): BookImpactDiscoveryAuthorizationResult => {
  if (!identity || !isBookImpactDiscoverySafeId(identity.actorId)) {
    return { authorized: false, code: 'invalid-actor' };
  }
  const expectedScope = identity.contextKind === 'solo'
    ? 'actor-owned-solo'
    : identity.contextKind === 'homework'
      ? 'uploader-owned-homework'
      : null;
  if (!expectedScope || identity.ownerScope !== expectedScope) {
    return { authorized: false, code: 'unauthorized' };
  }
  const maxContexts = identity.maxContexts ?? BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS;
  if (!Number.isSafeInteger(maxContexts) || maxContexts <= 0 || maxContexts > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) {
    return { authorized: false, code: 'uncertain' };
  }
  return {
    authorized: true,
    actorId: identity.actorId,
    contextKind: identity.contextKind,
    ownerScope: identity.ownerScope,
    maxContexts,
  };
};

export const authorizeBookSoloImpactRead = (identity: {
  readonly actorId: string;
  readonly maxContexts?: number;
} | null | undefined): BookImpactDiscoveryAuthorizationResult => authorizeBookImpactRead(
  identity ? { ...identity, contextKind: 'solo', ownerScope: 'actor-owned-solo' } : null,
);

export const authorizeBookHomeworkImpactRead = (identity: {
  readonly actorId: string;
  readonly maxContexts?: number;
} | null | undefined): BookImpactDiscoveryAuthorizationResult => authorizeBookImpactRead(
  identity ? { ...identity, contextKind: 'homework', ownerScope: 'uploader-owned-homework' } : null,
);
