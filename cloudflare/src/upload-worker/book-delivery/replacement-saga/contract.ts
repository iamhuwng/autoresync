import type {
  ReplacementCurrentPlanPointer,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
  ReplacementTokenRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import type {
  ReplacementPlanRepository,
  ReplacementPlanRevisionAuthority,
} from '../replacement-plans/contract.ts';
import type { ReplacementSourceSetDelta } from '../../../../../src/services/book-assembly/replacementSourceSetDelta.types.ts';

export const REPLACEMENT_SAGA_ROOT = 'book_replacement_sagas';
export const REPLACEMENT_SAGA_SCHEMA_VERSION = 1 as const;
export const REPLACEMENT_SAGA_MAX_ITEMS = 10_000;
export const REPLACEMENT_SAGA_MAX_AUDIT_EVENTS = 32;

export type ReplacementSagaState =
  | 'accepted'
  | 'staging'
  | 'staged'
  | 'visible'
  | 'contexts-pending'
  | 'awaiting-retired-byte-deletion'
  | 'compensating'
  | 'compensated';

export type ReplacementSagaItemState = 'pending' | 'retired-revoked';

export interface ReplacementSagaContextItem {
  readonly contextKey: string;
  readonly contextKind: string;
  readonly classification: string;
  readonly lifecycle: string;
  readonly status: string;
  readonly sourceScopes: readonly {
    readonly sourceKey: string;
    readonly pageCount: number;
    readonly placementCount: number;
  }[];
  readonly state: ReplacementSagaItemState;
  readonly stateRevision: number;
  readonly operationId: string;
}

export interface ReplacementSagaAuditEvent {
  readonly state: ReplacementSagaState;
  readonly stateRevision: number;
  readonly at: string;
  readonly code?: string;
}

export interface ReplacementSagaRecord {
  readonly schemaVersion: typeof REPLACEMENT_SAGA_SCHEMA_VERSION;
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly idempotencyKey: string;
  /** Digest of the request token; opaque token bytes are never persisted. */
  readonly tokenHash: string;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly deltaFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly adapterFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly sourceSetDelta: ReplacementSourceSetDelta;
  readonly sourceVersionIds: readonly string[];
  readonly targetSourceSetRevision: number;
  readonly contexts: Readonly<Record<string, ReplacementSagaContextItem>>;
  readonly state: ReplacementSagaState;
  readonly stateRevision: number;
  readonly acceptedAt: string;
  readonly updatedAt: string;
  readonly stagedReceipt: string | null;
  readonly visibility: {
    readonly receipt: string;
    readonly visibleAt: string;
  } | null;
  readonly retiredByteHandoff: {
    readonly status: 'queued' | 'replayed';
    readonly sourceVersionIds: readonly string[];
    readonly queuedAt: string;
  } | null;
  readonly audit: {
    readonly itemCount: number;
    readonly retiredItemCount: number;
    readonly oldSourceVersionIds: readonly string[];
    readonly newSourceVersionIds: readonly string[];
    readonly events: readonly ReplacementSagaAuditEvent[];
  };
  readonly recovery: {
    readonly resumeBehavior: 'forward-only-after-visible';
    readonly rollbackBoundary: 'staged-only';
    readonly contextOwner: '#117';
    readonly retiredByteOwner: '#119';
  };
}

export interface ReplacementSagaExecutionInput {
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
}

export type ReplacementSagaExecutionResult =
  | { readonly status: 'awaiting-retired-byte-deletion' | 'compensated' | 'replayed'; readonly saga: ReplacementSagaRecord }
  | { readonly status: 'pending'; readonly code: string; readonly saga: ReplacementSagaRecord }
  | { readonly status: 'blocked'; readonly code: string };

export interface ReplacementSagaLedger {
  findByIdempotency(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly idempotencyKey: string;
  }): Promise<ReplacementSagaRecord | null>;
  accept(input: {
    readonly saga: ReplacementSagaRecord;
  }): Promise<{ readonly status: 'created' | 'replayed' | 'conflict'; readonly saga?: ReplacementSagaRecord }>;
  read(input: { readonly ownerId: string; readonly sagaId: string }): Promise<ReplacementSagaRecord | null>;
  compareAndSet(input: {
    readonly ownerId: string;
    readonly sagaId: string;
    readonly expectedState: ReplacementSagaState;
    readonly expectedRevision: number;
    readonly next: ReplacementSagaRecord;
  }): Promise<{ readonly status: 'advanced' | 'conflict' | 'missing'; readonly saga?: ReplacementSagaRecord }>;
}

export interface ReplacementSagaVisibilityPort {
  /** Stage trusted metadata/provider work. This is before Firebase visibility. */
  prepare(input: {
    readonly saga: ReplacementSagaRecord;
    readonly operationId: string;
  }): Promise<{ readonly status: 'prepared' | 'replayed'; readonly receipt: string }>;
  /** The one explicit visibility/linearization point. Implementations must be idempotent by operationId. */
  publish(input: {
    readonly saga: ReplacementSagaRecord;
    readonly operationId: string;
  }): Promise<{ readonly status: 'visible' | 'replayed'; readonly receipt: string; readonly visibleAt: string }>;
  /** Only staged, not-yet-visible work may be rolled back. */
  rollbackStaged(input: {
    readonly saga: ReplacementSagaRecord;
    readonly operationId: string;
  }): Promise<{ readonly status: 'rolled-back' | 'replayed' | 'pending' }>;
}

/** #117 owns context adoption and revocation; #116 only calls this port. */
export interface ReplacementSagaContextOwner {
  adoptAndRevoke(input: {
    readonly saga: ReplacementSagaRecord;
    readonly item: ReplacementSagaContextItem;
    readonly operationId: string;
  }): Promise<{
    readonly status: 'adopted' | 'replayed' | 'pending';
    readonly allRetiredDeliveriesRevoked: boolean;
  }>;
}

/** #119 owns exact retired-byte deletion; this port is metadata-only handoff. */
export interface ReplacementSagaRetiredByteOwner {
  enqueueExactDeletion(input: {
    readonly saga: ReplacementSagaRecord;
    readonly operationId: string;
    readonly sourceVersionIds: readonly string[];
    readonly precondition: 'all-contexts-retired-deliveries-revoked';
  }): Promise<{ readonly status: 'queued' | 'replayed' | 'pending' }>;
}

export interface ReplacementSagaDependencies {
  readonly plans: ReplacementPlanRepository;
  readonly revisions: ReplacementPlanRevisionAuthority;
  readonly ledger: ReplacementSagaLedger;
  readonly visibility: ReplacementSagaVisibilityPort;
  readonly contexts: ReplacementSagaContextOwner;
  readonly retiredBytes: ReplacementSagaRetiredByteOwner;
  readonly enabled?: boolean;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export type ReplacementSagaValidationFacts = {
  readonly plan: ReplacementPlanRecord;
  readonly review: ReplacementPlanReviewRecord;
  readonly current: ReplacementCurrentPlanPointer;
  readonly token: ReplacementTokenRecord;
};
