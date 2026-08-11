import type {
  ReplacementSagaContextItem,
  ReplacementSagaRecord,
  ReplacementSagaContextOwner,
} from '../replacement-saga/contract.ts';

export const REPLACEMENT_CONTEXT_SCHEMA_VERSION = 1 as const;
export const REPLACEMENT_CONTEXT_ROOT = 'book_replacement_contexts';
export const REPLACEMENT_CONTEXT_MAX_DELIVERIES = 128 as const;

export type ReplacementContextChoice =
  | 'adopt-current-replacement'
  | 'decline-retain-unavailable';

export type ReplacementContextStatus =
  | 'pending'
  | 'adopted'
  | 'declined-unavailable';

export type ReplacementContextFailureCode =
  | 'replacement_context_disabled'
  | 'invalid-request'
  | 'context-authority-missing'
  | 'context-choice-missing'
  | 'context-provenance-invalid'
  | 'context-cross-owner'
  | 'context-cross-book'
  | 'context-cross-plan'
  | 'context-cross-saga'
  | 'context-operation-mismatch'
  | 'context-kind-unsupported'
  | 'context-choice-unsupported'
  | 'context-choice-not-allowed'
  | 'context-duplicate-delivery'
  | 'context-delivery-pin-stale'
  | 'context-delivery-pin-missing'
  | 'context-version-pin-stale'
  | 'context-version-pin-invalid'
  | 'context-revision-stale'
  | 'context-replay-conflict'
  | 'context-cas-conflict'
  | 'context-delivery-authority-missing'
  | 'context-delivery-authority-unavailable'
  | 'context-delivery-cas-conflict'
  | 'context-delivery-readback-pending'
  | 'context-mutation-unavailable'
  | 'context-clock-unavailable';

export interface ReplacementContextDeliveryPin {
  readonly deliveryId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly sourceVersionIds: readonly string[];
  readonly status: 'active' | 'revoked';
}

export interface ReplacementContextCurrentPin {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly sourceVersionIds: readonly string[];
}

export interface ReplacementContextAuthority {
  readonly schemaVersion: typeof REPLACEMENT_CONTEXT_SCHEMA_VERSION;
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly contextKey: string;
  readonly contextKind: string;
  readonly recipientId: string;
  readonly contextRevision: number;
  readonly status: ReplacementContextStatus;
  readonly current: ReplacementContextCurrentPin | null;
  readonly retiredDeliveries: readonly ReplacementContextDeliveryPin[];
  /** Hash of immutable Activity attempts/results/checkpoints/history. Never changes. */
  readonly immutableActivityWorkFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly allowedChoices: readonly ReplacementContextChoice[];
  readonly completedOperationId: string | null;
  readonly completedChoice: ReplacementContextChoice | null;
  readonly updatedAt: string;
}

export interface ReplacementContextDecision {
  readonly schemaVersion: typeof REPLACEMENT_CONTEXT_SCHEMA_VERSION;
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly contextKey: string;
  readonly contextKind: string;
  readonly choice: ReplacementContextChoice;
  readonly allowedChoices: readonly ReplacementContextChoice[];
  readonly planFingerprint: string;
  readonly deltaFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly revisionVector: Readonly<Record<string, number>>;
  readonly decisionRevision: number;
  readonly decidedAt: string;
}

export interface ReplacementContextOperationReceipt {
  readonly operationId: string;
  readonly requestFingerprint: string;
  readonly choice: ReplacementContextChoice;
  readonly outcome: Exclude<ReplacementContextStatus, 'pending'>;
  readonly contextRevision: number;
  readonly allRetiredDeliveriesRevoked: true;
  readonly createdAt: string;
}

/**
 * The authoritative book_delivery binding projection used by document
 * authorization. #117 never treats its copied scope as delivery authority.
 */
export interface ReplacementContextAuthoritativeDelivery {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly recipientId: string;
  readonly sourceVersionIds: readonly string[];
  readonly status: 'active' | 'revoked';
}

export type ReplacementContextDeliveryMutationResult =
  | {
      readonly status: 'advanced' | 'replayed';
      readonly current: ReplacementContextAuthoritativeDelivery | null;
    }
  | { readonly status: 'conflict' | 'unavailable'; readonly current?: ReplacementContextAuthoritativeDelivery | null };

/**
 * Explicit adapter port for the existing authoritative book_delivery
 * supersede/revoke seam. Implementations must perform exact CAS/provenance
 * checks and be idempotent by operationId; #117 performs independent
 * readback before claiming completion.
 */
export interface ReplacementContextDeliveryAuthority {
  readBinding(input: { readonly bindingId: string }): Promise<ReplacementContextAuthoritativeDelivery | null>;
  readCurrent(input: {
    readonly recipientId: string;
    readonly contextKey: string;
  }): Promise<ReplacementContextAuthoritativeDelivery | null>;
  adoptCurrentReplacement(input: {
    readonly operationId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly recipientId: string;
    readonly expectedCurrent: ReplacementContextCurrentPin;
    readonly retiredDeliveries: readonly ReplacementContextDeliveryPin[];
    readonly nextSourceVersionIds: readonly string[];
    readonly now: string;
  }): Promise<ReplacementContextDeliveryMutationResult>;
  declineRetainUnavailable(input: {
    readonly operationId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly recipientId: string;
    readonly expectedCurrent: ReplacementContextCurrentPin | null;
    readonly retiredDeliveries: readonly ReplacementContextDeliveryPin[];
    readonly now: string;
  }): Promise<ReplacementContextDeliveryMutationResult>;
}

export interface ReplacementContextCommitInput {
  readonly saga: ReplacementSagaRecord;
  readonly item: ReplacementSagaContextItem;
  readonly operationId: string;
  readonly requestFingerprint: string;
  readonly authority: ReplacementContextAuthority;
  readonly decision: ReplacementContextDecision;
  readonly choice: ReplacementContextChoice;
  readonly nextCurrent: ReplacementContextCurrentPin | null;
  readonly expectedRevision: number;
  readonly revokedDeliveryIds: readonly string[];
  readonly immutableActivityWorkFingerprint: string;
  readonly now: string;
}

export type ReplacementContextCommitResult =
  | {
      readonly status: 'advanced';
      readonly authority: ReplacementContextAuthority;
      readonly receipt: ReplacementContextOperationReceipt;
    }
  | {
      readonly status: 'replayed';
      readonly authority: ReplacementContextAuthority;
      readonly receipt: ReplacementContextOperationReceipt;
    }
  | { readonly status: 'conflict' | 'missing' };

export interface ReplacementContextRepository {
  readAuthority(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
  }): Promise<ReplacementContextAuthority | null>;
  readDecision(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly planId: string;
    readonly reviewId: string;
    readonly contextKey: string;
  }): Promise<ReplacementContextDecision | null>;
  findOperation(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly operationId: string;
  }): Promise<ReplacementContextOperationReceipt | null>;
  commit(input: ReplacementContextCommitInput): Promise<ReplacementContextCommitResult>;
}

export interface ReplacementContextOwnerResultBase {
  readonly allRetiredDeliveriesRevoked: boolean;
  readonly choice: ReplacementContextChoice;
  readonly contextStatus: Exclude<ReplacementContextStatus, 'pending'>;
}

export type ReplacementContextOwnerResult =
  | (ReplacementContextOwnerResultBase & {
      readonly status: 'adopted' | 'replayed';
      readonly authority: ReplacementContextAuthority;
    })
  | { readonly status: 'pending'; readonly code: ReplacementContextFailureCode }
  | { readonly status: 'blocked'; readonly code: ReplacementContextFailureCode };

export interface ReplacementContextOwnerDependencies {
  readonly repository: ReplacementContextRepository;
  /** Required for enabled operation; omitted only for the disabled route. */
  readonly deliveryAuthority?: ReplacementContextDeliveryAuthority;
  readonly enabled?: boolean;
  readonly now?: () => Date;
}

/** Factory output intentionally remains assignable to #116's port. */
export interface ReplacementContextOwner extends ReplacementSagaContextOwner {
  resolveContext(input: {
    readonly saga: ReplacementSagaRecord;
    readonly item: ReplacementSagaContextItem;
    readonly operationId: string;
  }): Promise<ReplacementContextOwnerResult>;
}
