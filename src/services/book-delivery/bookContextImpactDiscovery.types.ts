import type { BookImpactClassification, BookImpactEffect } from './bookImpactClassification.service';

export const BOOK_CONTEXT_IMPACT_DISCOVERY_VERSION = 1 as const;
export const BOOK_CONTEXT_IMPACT_MAX_CONTEXTS = 100 as const;
export const BOOK_CONTEXT_IMPACT_MAX_PLACEMENTS = 200 as const;

export type BookContextImpactKind = 'course' | 'class' | 'public-reference';
export type BookContextImpactFailure = 'invalid-actor' | 'unauthorized' | 'missing' | 'malformed' | 'cross-owner' | 'stale' | 'ambiguous' | 'uncertain' | 'unbounded' | 'unsupported';
export type BookContextImpactIdentity =
  | { readonly kind: 'course'; readonly courseId: string; readonly moduleId: string; readonly courseMaterialId: string; readonly unitStableKey: string; readonly unitVersionId: string; readonly sourceVersionId: string; readonly placementRevision: number }
  | { readonly kind: 'class'; readonly classId: string; readonly copyId: string; readonly classPlacementId: string; readonly courseMaterialId: string; readonly unitStableKey: string; readonly unitVersionId: string; readonly sourceVersionId: string; readonly placementRevision: number }
  | { readonly kind: 'public-reference'; readonly referenceKind: 'reference' | 'fork'; readonly referenceId: string; readonly sourceBookId: string; readonly targetBookId: string; readonly targetPlacementId: string; readonly sourceOwnerId: string; readonly downstreamOwnerId: string; readonly provenanceId: string };

export interface BookContextImpactPlacement {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly sourceVersionId: string;
  readonly order: number;
}

/** A privacy-safe, already-authorized immutable 39D fact record. */
export interface BookContextImpactInput {
  readonly contextId: string;
  readonly kind: BookContextImpactKind;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly bookId: string;
  readonly publicationId: string;
  readonly manifestVersionId: string;
  readonly status: 'active' | 'closed' | 'archived' | 'revoked';
  readonly lifecycle: 'not-started' | 'in-progress' | 'submitted' | 'completed';
  readonly identity: BookContextImpactIdentity;
  readonly placements: readonly BookContextImpactPlacement[];
  readonly classification: Pick<BookImpactClassification, 'primaryEffect' | 'effects' | 'reasons' | 'requiresRedo' | 'requiresRegrade'>;
  readonly sourceReplacement: { readonly mode: 'invalidation-only' | 'owner-adopts-replacement'; readonly ownerChoice: 'retain-owner' | 'owner-adopts-replacement' | 'invalidate-context'; readonly replacementSourceVersionId: string | null };
  readonly observedAt: string;
}

export interface BookContextImpactAuthorization {
  readonly authorized: true;
  readonly actorId: string;
  readonly contextKind: BookContextImpactKind;
  readonly ownerScope: 'teacher-owned-course' | 'teacher-owned-class' | 'source-owner-public-reference';
  readonly maxContexts: number;
}
export type BookContextImpactAuthorizationResult = BookContextImpactAuthorization | { readonly authorized: false; readonly code: Extract<BookContextImpactFailure, 'invalid-actor' | 'unauthorized' | 'uncertain'> };
export interface BookContextImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookContextImpactAuthorizationResult>;
  readAuthorizedContexts(input: { readonly actorId: string; readonly limit: number }): Promise<{ readonly complete: true; readonly contexts: readonly unknown[] }>;
}
export interface BookContextImpactQuery { readonly actorId: string; readonly evaluatedAt: string; readonly limit?: number }
export type BookContextImpactResult =
  | { readonly status: 'ok'; readonly version: typeof BOOK_CONTEXT_IMPACT_DISCOVERY_VERSION; readonly adapterId: string; readonly adapterVersion: number; readonly contextKind: BookContextImpactKind; readonly evaluatedAt: string; readonly impacts: readonly BookContextImpactInput[] }
  | { readonly status: 'blocked'; readonly version: typeof BOOK_CONTEXT_IMPACT_DISCOVERY_VERSION; readonly adapterId: string; readonly adapterVersion: number; readonly contextKind: BookContextImpactKind; readonly evaluatedAt: string; readonly code: BookContextImpactFailure };

export const BOOK_CONTEXT_IMPACT_EFFECTS: readonly BookImpactEffect[] = Object.freeze(['unchanged', 'display-only', 'regrade', 'redo-required', 'added', 'removed', 'reordered', 'moved', 'mapping-source-context', 'successor', 'invalidation', 'unsupported']);
