export const BOOK_DELIVERY_SCHEMA_VERSION = 2 as const;
export const BOOK_DELIVERY_BINDING_STATUSES = ['draft', 'active', 'revoked'] as const;
export type BookDeliveryBindingStatus = (typeof BOOK_DELIVERY_BINDING_STATUSES)[number];

export const BOOK_DELIVERY_CONTEXT_KINDS = [
  'solo',
  'preview',
  'homework',
  'course',
  'class',
  'future_live',
] as const;
export type BookDeliveryContextKind = (typeof BOOK_DELIVERY_CONTEXT_KINDS)[number];

export const BOOK_DELIVERY_SCOPE_KINDS = ['subtree', 'placements'] as const;
export type BookDeliveryScopeKind = (typeof BOOK_DELIVERY_SCOPE_KINDS)[number];

export const BOOK_DELIVERY_SOURCE_STRATEGIES = ['full_pdf', 'component_pdfs'] as const;
export type BookDeliverySourceStrategy = (typeof BOOK_DELIVERY_SOURCE_STRATEGIES)[number];

export interface BookDeliveryRecipient {
  readonly recipientId: string;
  readonly recipientKind: 'student' | 'preview-user';
}

export interface BookDeliveryIssuer {
  readonly ownerId: string;
  readonly authorityBoundary: 'book-owner';
}

export interface BookDeliveryBookReference {
  readonly bookId: string;
  readonly bookMode: 'pdf';
  readonly bookRevision: number;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly publicationStatus: 'published';
}

export interface BookDeliveryScope {
  readonly kind: BookDeliveryScopeKind;
  readonly nodeKeys: readonly string[];
  readonly placementIds: readonly string[];
}

export interface BookDeliveryContextBase {
  readonly contextId: string;
  readonly recipientId: string;
  readonly ownerId: string;
}

export type BookDeliveryContext =
  | (BookDeliveryContextBase & { readonly kind: 'solo'; readonly entitlementBasis: 'solo' })
  | (BookDeliveryContextBase & { readonly kind: 'preview'; readonly entitlementBasis: 'preview' })
  | (BookDeliveryContextBase & { readonly kind: 'homework'; readonly entitlementBasis: 'assignment' })
  | (BookDeliveryContextBase & { readonly kind: 'course'; readonly entitlementBasis: 'enrollment' })
  | (BookDeliveryContextBase & { readonly kind: 'class'; readonly entitlementBasis: 'membership' })
  | (BookDeliveryContextBase & { readonly kind: 'future_live'; readonly entitlementBasis: 'reserved' });

export interface BookDeliverySchedulePolicyReference {
  readonly policyId: string;
  readonly policyRevision: number;
  readonly basis: 'immutable-reference';
}

export interface BookDeliverySourcePageScope {
  readonly kind: 'all' | 'pages';
  readonly pages: readonly number[];
}

export interface BookDeliverySourceBinding {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly lifecycle: 'verified-usable';
  readonly sourceOrder?: number;
  readonly ownerNodeKey?: string;
  readonly localPageScope: BookDeliverySourcePageScope;
}

export interface BookDeliverySourceSet {
  readonly strategy: BookDeliverySourceStrategy;
  readonly sources: readonly BookDeliverySourceBinding[];
}

export interface BookDeliveryPlacement {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
  readonly order: number;
  readonly contextMode: 'none' | 'optional' | 'required';
  readonly sourcePageScopes: readonly {
    readonly sourceKey: string;
    readonly pages: readonly number[];
  }[];
}

export interface BookDeliveryBinding {
  readonly schemaVersion: typeof BOOK_DELIVERY_SCHEMA_VERSION;
  readonly bindingId: string;
  readonly revision: number;
  readonly status: BookDeliveryBindingStatus;
  readonly recipient: BookDeliveryRecipient;
  readonly issuer: BookDeliveryIssuer;
  readonly book: BookDeliveryBookReference;
  readonly scope: BookDeliveryScope;
  readonly context: BookDeliveryContext;
  readonly sourceSet: BookDeliverySourceSet;
  readonly placements: readonly BookDeliveryPlacement[];
  readonly schedulePolicy: BookDeliverySchedulePolicyReference;
  readonly createdAt: string;
}

export interface BookRuntimeDeliveryDocumentRequest {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly opaqueRouteKey: string;
  readonly localPageScope: BookDeliverySourcePageScope;
}

export interface BookRuntimeDeliveryActivityProjection {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
  readonly order: number;
  readonly contextMode: BookDeliveryPlacement['contextMode'];
  readonly sourceContext: {
    readonly available: boolean;
    readonly description: string;
    readonly sourcePageScopes: BookDeliveryPlacement['sourcePageScopes'];
  };
}

export interface BookRuntimeDeliveryProjection {
  readonly schemaVersion: 1;
  readonly projectionKind: 'book-runtime-delivery';
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly recipientId: string;
  readonly context: Pick<BookDeliveryContext, 'contextId' | 'kind' | 'entitlementBasis'>;
  readonly book: BookDeliveryBookReference;
  readonly scope: BookDeliveryScope;
  readonly sourceSet: BookDeliverySourceSet;
  readonly documentRequests: readonly BookRuntimeDeliveryDocumentRequest[];
  readonly activities: readonly BookRuntimeDeliveryActivityProjection[];
  readonly actionFlags: {
    readonly canAutosave: boolean;
    readonly canSubmit: boolean;
    readonly canReview: boolean;
  };
  readonly provenance: {
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly bindingId: string;
    readonly bindingRevision: number;
  };
}

export interface BookDeliveryLegacyV1Read {
  readonly version: 1;
  readonly bindingId: string;
  readonly bookId: string;
  readonly recipientId: string;
  readonly sourceVersionId: string;
  readonly createdAt: string;
  readonly readOnly: true;
}

export type BookDeliveryValidationCode =
  | 'invalid-record'
  | 'unknown-field'
  | 'missing-field'
  | 'invalid-value'
  | 'duplicate-id'
  | 'duplicate-order'
  | 'contradictory-scope'
  | 'forbidden-field'
  | 'unsupported-context'
  | 'unrunnable-future-live'
  | 'invalid-source-strategy'
  | 'source-scope-mismatch'
  | 'invalid-publication'
  | 'legacy-mode-conflict';

export interface BookDeliveryValidationError {
  readonly code: BookDeliveryValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface BookDeliveryValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookDeliveryValidationError[];
}
