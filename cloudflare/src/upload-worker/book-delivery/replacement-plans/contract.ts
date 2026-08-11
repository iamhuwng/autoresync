import type { BookImpactSnapshotReadResult } from '../../../../../src/services/book-delivery/bookImpactSnapshot.types.ts';
import type {
  ReplacementCurrentRevisions,
  ReplacementConfirmationHandoff,
  ReplacementCurrentPlanPointer,
  ReplacementPlanClientCreateRequest,
  ReplacementPlanOperationReceipt,
  ReplacementPlanReadResult,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
  ReplacementPlanSnapshotReader,
  ReplacementTokenRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import type { ReplacementTrustedSourceSet } from '../../../../../src/services/book-assembly/replacementSourceSetDelta.types.ts';

export const REPLACEMENT_PLAN_ROOT = 'book_replacement_plans';
export const REPLACEMENT_PLAN_MAX_BODY_BYTES = 512 * 1024;
export const REPLACEMENT_PLAN_MAX_IDEMPOTENCY_RECORDS = 128;

export interface ReplacementPlanRepository {
  createPlan(input: {
    readonly plan: ReplacementPlanRecord;
    readonly operationId: string;
    readonly now: string;
  }): Promise<{ readonly status: 'created' | 'replayed'; readonly plan: ReplacementPlanRecord; readonly receipt: ReplacementPlanOperationReceipt }>;
  readPlan(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string }): Promise<ReplacementPlanRecord | null>;
  readCurrent(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly now: string;
    readonly expectedPlanFingerprint?: string;
  }): Promise<ReplacementPlanReadResult>;
  saveReview(input: {
    readonly review: ReplacementPlanReviewRecord;
    readonly operationId: string;
    readonly now: string;
  }): Promise<{ readonly status: 'reviewed' | 'replayed'; readonly review: ReplacementPlanReviewRecord; readonly receipt: ReplacementPlanOperationReceipt }>;
  readReview(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string }): Promise<ReplacementPlanReviewRecord | null>;
  cancel(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly planId: string;
    readonly planFingerprint: string;
    readonly operationId: string;
    readonly now: string;
  }): Promise<{ readonly status: 'canceled' | 'replayed'; readonly pointer: ReplacementCurrentPlanPointer; readonly receipt: ReplacementPlanOperationReceipt }>;
  saveToken(input: { readonly token: ReplacementTokenRecord }): Promise<void>;
  readToken(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string }): Promise<ReplacementTokenRecord | null>;
  invalidateTokens(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reason: 'canceled' | 'replanned' | 'revision-changed'; readonly now: string }): Promise<void>;
}

export interface ReplacementPlanSourceSetAuthority {
  resolve(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly requested: ReplacementPlanClientCreateRequest['sourceSetDelta'];
  }): Promise<{ readonly old: ReplacementTrustedSourceSet; readonly next: ReplacementTrustedSourceSet } | null>;
}

export interface ReplacementPlanRevisionAuthority {
  read(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly snapshotId: string;
    readonly snapshotFingerprint: string;
  }): Promise<{
    readonly revisionVector: { readonly values: Readonly<Record<string, number>> };
    readonly currentRevisions: ReplacementCurrentRevisions;
    readonly adapterFingerprint: string;
  } | null>;
}

export interface ReplacementPlanRouteDependencies {
  readonly repository: ReplacementPlanRepository;
  readonly snapshots: ReplacementPlanSnapshotReader;
  readonly sourceSets: ReplacementPlanSourceSetAuthority;
  readonly revisions: ReplacementPlanRevisionAuthority;
  readonly enabled?: boolean;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export interface ReplacementPlanRouteInput {
  readonly request: Request;
  /** Firebase identity verified by the fixed #59 composition boundary. */
  readonly uid?: string;
  readonly dependencies: ReplacementPlanRouteDependencies;
}

export interface ReplacementPlanCurrentResponse {
  readonly status: ReplacementPlanReadResult['status'];
  readonly plan?: ReplacementPlanRecord;
  readonly pointer?: ReplacementCurrentPlanPointer;
  readonly planId?: string;
  readonly expiresAt?: string;
}

export interface ReplacementPlanReviewResponse {
  readonly status: 'reviewed' | 'replayed';
  readonly plan: ReplacementPlanRecord;
  readonly review: ReplacementPlanReviewRecord;
  readonly handoff: ReplacementConfirmationHandoff;
}

export interface ReplacementPlanCancelResponse {
  readonly status: 'canceled' | 'replayed';
  readonly receipt: ReplacementPlanOperationReceipt;
}

export type { BookImpactSnapshotReadResult };
