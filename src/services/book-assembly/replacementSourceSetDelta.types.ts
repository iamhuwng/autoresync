import type {
  SourcePageReference,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';

export const REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION = 1 as const;
export const REPLACEMENT_SOURCE_DELTA_MAX_MAPPINGS = 20_000;
export const REPLACEMENT_SOURCE_DELTA_MAX_PAGE_GROUPS_PER_SOURCE = 1_000;

export type ReplacementPageRotation = 0 | 90 | 180 | 270;

export interface ReplacementSourceBounds {
  readonly width: number;
  readonly height: number;
}

export interface ReplacementPageGroupDescriptor {
  readonly pageGroupKey: string;
  readonly label: string;
  readonly sourceKey: string;
  readonly ownerNodeKey?: string;
  readonly pages: readonly number[];
  readonly mode: 'activity' | 'reference_only';
}

/** Safe, trusted metadata for one immutable Source Version. */
export interface ReplacementSourceDescriptor {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey?: string;
  readonly label: string;
  readonly rotation: ReplacementPageRotation;
  readonly physicalPageCount: number;
  readonly bounds: ReplacementSourceBounds;
  readonly pageGroups: readonly ReplacementPageGroupDescriptor[];
}

/** The Source Set identity/order comes from the accepted assembly authority. */
export interface ReplacementTrustedSourceSet {
  readonly sourceSet: SourceSetCandidate;
  readonly sources: readonly ReplacementSourceDescriptor[];
}

export interface ReplacementSourceAssistedScope {
  readonly scopeKey: string;
  readonly sourceKey: string;
  readonly pageGroupKey?: string;
  readonly affectedPageCount: number;
}

export type ReplacementPageMappingKind =
  | 'retained'
  | 'added'
  | 'removed'
  | 'reassigned';

export interface ReplacementPageMapping {
  readonly mappingId: string;
  readonly from: SourcePageReference | null;
  readonly to: SourcePageReference | null;
  readonly kind: ReplacementPageMappingKind;
  readonly sourceAssistedScopes: readonly ReplacementSourceAssistedScope[];
}

export interface ReplacementSourceSetDeltaInput {
  readonly schemaVersion?: typeof REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION;
  readonly old: ReplacementTrustedSourceSet;
  readonly next: ReplacementTrustedSourceSet;
  readonly mappings: readonly ReplacementPageMapping[];
}

export interface ReplacementSourceSetDelta extends ReplacementSourceSetDeltaInput {
  readonly schemaVersion: typeof REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION;
  readonly fingerprint: string;
}

export type ReplacementSourceDeltaErrorCode =
  | 'invalid-record'
  | 'invalid-id'
  | 'invalid-label'
  | 'invalid-order'
  | 'duplicate-key'
  | 'missing-source'
  | 'source-identity-mismatch'
  | 'invalid-owner'
  | 'invalid-rotation'
  | 'invalid-bounds'
  | 'invalid-page-count'
  | 'invalid-page-group'
  | 'duplicate-page'
  | 'out-of-range-page'
  | 'invalid-mapping'
  | 'duplicate-mapping'
  | 'incomplete-mapping'
  | 'invalid-scope'
  | 'too-large';

export interface ReplacementSourceDeltaError {
  readonly code: ReplacementSourceDeltaErrorCode;
  readonly path: string;
  readonly message: string;
}

export interface ReplacementSourceSetDeltaResult {
  readonly valid: boolean;
  readonly errors: readonly ReplacementSourceDeltaError[];
  readonly delta: ReplacementSourceSetDelta | null;
}
