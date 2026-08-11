import type { BookImpactSnapshot, BookImpactSnapshotReadResult } from '../book-delivery/bookImpactSnapshot.types';
import type { BookSourceCapacityUsage } from '../../types/bookSource.types';
import type {
  ReplacementSourceSetDelta,
  ReplacementSourceSetDeltaInput,
} from '../book-assembly/replacementSourceSetDelta.types';

export const REPLACEMENT_PLAN_SCHEMA_VERSION = 1 as const;
export const REPLACEMENT_PLAN_DEFAULT_TTL_MS = 15 * 60 * 1000;
export const REPLACEMENT_PLAN_MAX_TTL_MS = 60 * 60 * 1000;
export const REPLACEMENT_PLAN_MAX_CONTEXTS = 10_000;
export const REPLACEMENT_PLAN_MAX_SOURCE_SCOPES = 2_000;
export const REPLACEMENT_PLAN_CAPACITY_BYTES = 9_000_000_000;

export interface ReplacementCurrentRevisions {
  readonly bookRevision: number;
  readonly publicationRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceVersionRevisions: Readonly<Record<string, number>>;
}

export interface ReplacementSnapshotRevisionVector {
  readonly values: Readonly<Record<string, number>>;
}

export interface ReplacementSnapshotAuthority {
  readonly snapshot: BookImpactSnapshot;
  readonly revisionVector: ReplacementSnapshotRevisionVector;
  readonly currentRevisions: ReplacementCurrentRevisions;
}

export interface ReplacementAdapterVersion {
  readonly contextKind: string;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contractVersion: number;
}

export interface ReplacementPlanBuildInput {
  readonly ownerId: string;
  readonly bookId: string;
  readonly currentRevisions: ReplacementCurrentRevisions;
  readonly targetSourceSetRevision: number;
  readonly sourceSetDelta: ReplacementSourceSetDeltaInput;
  readonly impactSnapshot: ReplacementSnapshotAuthority;
  readonly capacity: {
    readonly current: BookSourceCapacityUsage;
    readonly additionalBytes: number;
  };
  readonly now: string;
  readonly ttlMs?: number;
}

export interface ReplacementPlanSourceScope {
  readonly sourceKey: string;
  readonly pageCount: number;
  readonly placementCount: number;
}

export interface ReplacementPlanContextProjection {
  readonly contextKey: string;
  readonly contextKind: string;
  readonly classification: string;
  readonly effects: readonly string[];
  readonly reasons: readonly string[];
  readonly lifecycle: string;
  readonly status: string;
  readonly sourceScopes: readonly ReplacementPlanSourceScope[];
  readonly activityCount: number;
  readonly placementCount: number;
  readonly checkpointCount: number;
  readonly notificationCount: number;
}

export type ReplacementPlanReviewState = 'unreviewed' | 'reviewed' | 'canceled';

export interface ReplacementPlanCapacityFacts {
  readonly current: BookSourceCapacityUsage;
  readonly additionalBytes: number;
  readonly projected: number;
  readonly limit: typeof REPLACEMENT_PLAN_CAPACITY_BYTES;
  readonly available: boolean;
}

export interface ReplacementPlanRecord {
  readonly schemaVersion: typeof REPLACEMENT_PLAN_SCHEMA_VERSION;
  readonly planId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly publicationRevision: number;
  readonly sourceSetRevision: number;
  readonly targetSourceSetRevision: number;
  readonly sourceVersionRevisions: Readonly<Record<string, number>>;
  readonly sourceSetDelta: ReplacementSourceSetDelta;
  readonly deltaFingerprint: string;
  readonly impactSnapshotId: string;
  readonly impactSnapshotFingerprint: string;
  readonly impactSnapshotRevisionVector: Readonly<Record<string, number>>;
  readonly impactSnapshotExpiresAt: string;
  readonly adapters: readonly ReplacementAdapterVersion[];
  readonly contexts: readonly ReplacementPlanContextProjection[];
  /** Intentionally empty at creation; #116 owns any later context choice. */
  readonly selectedContextKeys: readonly [];
  readonly capacity: ReplacementPlanCapacityFacts;
  readonly reviewState: ReplacementPlanReviewState;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly planFingerprint: string;
}

export interface ReplacementPlanReviewRecord {
  readonly schemaVersion: typeof REPLACEMENT_PLAN_SCHEMA_VERSION;
  readonly reviewId: string;
  readonly planId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly planFingerprint: string;
  readonly deltaFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly reviewedAt: string;
  readonly expiresAt: string;
  readonly state: 'reviewed' | 'canceled';
}

export interface ReplacementCurrentPlanPointer {
  readonly planId: string;
  readonly planFingerprint: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly status: 'current' | 'canceled' | 'replanned';
  readonly updatedAt: string;
}

export type ReplacementPlanReadResult =
  | { readonly status: 'ready'; readonly plan: ReplacementPlanRecord; readonly pointer: ReplacementCurrentPlanPointer }
  | { readonly status: 'expired'; readonly planId: string; readonly expiresAt: string }
  | { readonly status: 'stale'; readonly planId: string }
  | { readonly status: 'missing' }
  | { readonly status: 'denied' };

export interface ReplacementPlanOperationReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly status: 'created' | 'replayed' | 'conflict' | 'canceled' | 'reviewed';
  readonly planId?: string;
  readonly reviewId?: string;
  readonly createdAt: string;
}

export interface ReplacementTokenRecord {
  readonly schemaVersion: typeof REPLACEMENT_PLAN_SCHEMA_VERSION;
  readonly tokenHash: string;
  readonly purpose: 'replacement-confirmation';
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly planFingerprint: string;
  readonly deltaFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly adapterFingerprint: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: 'canceled' | 'replanned' | 'revision-changed' | 'expired';
}

export interface ReplacementConfirmationHandoff {
  readonly purpose: 'replacement-confirmation';
  readonly token: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly planFingerprint: string;
  readonly deltaFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly expiresAt: string;
}

export type ReplacementPlanClientCreateRequest = Omit<ReplacementPlanBuildInput, 'ownerId' | 'impactSnapshot'> & {
  readonly snapshotFingerprint: string;
  readonly snapshotRevisionVector: ReplacementSnapshotRevisionVector;
};

export interface ReplacementPlanClient {
  create(input: ReplacementPlanClientCreateRequest & { readonly idempotencyKey: string }): Promise<ReplacementPlanRecord>;
  readCurrent(input: { readonly bookId: string; readonly now?: string }): Promise<ReplacementPlanReadResult>;
  review(input: {
    readonly bookId: string;
    readonly planId: string;
    readonly planFingerprint: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly plan: ReplacementPlanRecord; readonly review: ReplacementPlanReviewRecord; readonly handoff: ReplacementConfirmationHandoff }>;
  cancel(input: { readonly bookId: string; readonly planId: string; readonly planFingerprint: string; readonly idempotencyKey: string }): Promise<ReplacementPlanOperationReceipt>;
}

export interface ReplacementPlanSnapshotReader {
  readCurrent(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly expectedFingerprint?: string;
    readonly now: string;
  }): Promise<BookImpactSnapshotReadResult>;
}
