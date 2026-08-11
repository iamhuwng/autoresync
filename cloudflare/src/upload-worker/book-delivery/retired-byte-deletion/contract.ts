import type {
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../../../../src/types/bookSource.types.ts';
import type {
  ReplacementSagaContextItem,
  ReplacementSagaRecord,
  ReplacementSagaRetiredByteOwner,
} from '../replacement-saga/contract.ts';

export const RETIRED_BYTE_DELETION_ROOT = 'book_retired_byte_deletions';
export const RETIRED_BYTE_DELETION_SCHEMA_VERSION = 1 as const;

export type RetiredByteDeletionState =
  | 'queued'
  | 'preflighted'
  | 'delete-started'
  | 'absence-verified'
  | 'settled';

export type RetiredByteDeletionOutcome =
  | 'deleted'
  | 'provider-already-absent';

export interface RetiredByteDeleteIdentity {
  readonly kind: 'retired-byte-exact-version';
  readonly serviceIdentity: 'book_retired_byte_deletion_service';
  readonly capability: 'delete-exact-provider-file-version';
  readonly deletionId: string;
  readonly operationId: string;
}

export interface RetiredByteContextReadback {
  readonly complete: true;
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly operationId: string;
  readonly contextRevision: number;
  readonly immutableActivityWorkFingerprint: string;
  readonly authorityStatus: 'adopted' | 'declined-unavailable';
  readonly retiredDeliveries: readonly {
    readonly deliveryId: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly sourceVersionIds: readonly string[];
    readonly status: 'revoked';
  }[];
  readonly currentSourceVersionIds: readonly string[];
  readonly remainingActiveSourceVersionIds: readonly string[];
}

export interface RetiredByteSourceAuthority {
  readVersion(input: {
    readonly bookId: string;
    readonly sourceVersionId: string;
  }): Promise<BookSourceVersionStorageIdentity | null>;
}

export interface RetiredByteContextAuthority {
  readRevocation(input: {
    readonly sagaId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly operationId: string;
    readonly sourceVersionIds: readonly string[];
  }): Promise<RetiredByteContextReadback | null>;
}

export interface RetiredByteProvider {
  resolveExactVersion(
    operation: BookSourceUploadOperation,
  ): Promise<BookSourceVersionStorageIdentity | null>;
  deleteExactVersion(input: {
    readonly identity: BookSourceVersionStorageIdentity;
  }): Promise<void>;
}

export interface RetiredByteCapacityAuthority {
  settle(input: {
    readonly deletionId: string;
    readonly identity: BookSourceVersionStorageIdentity;
    readonly outcome: RetiredByteDeletionOutcome;
  }): Promise<'settled' | 'replayed'>;
}

export interface RetiredBytePreDeleteRecord {
  readonly recordedAt: string;
  readonly identity: BookSourceVersionStorageIdentity;
  readonly contextReadbackFingerprint: string;
  /** Explicitly metadata-only: no PDF bytes or backup object is created. */
  readonly metadataOnly: true;
  readonly backupBytesCreated: false;
}

export interface RetiredByteProviderProof {
  readonly outcome: RetiredByteDeletionOutcome;
  readonly verifiedAt: string;
  readonly identity: BookSourceVersionStorageIdentity;
}

export interface RetiredByteDeletionRecord {
  readonly schemaVersion: typeof RETIRED_BYTE_DELETION_SCHEMA_VERSION;
  readonly deletionId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceVersionIds: readonly [string];
  readonly contextPins: readonly {
    readonly contextKey: string;
    readonly operationId: string;
    readonly sourceVersionIds: readonly string[];
  }[];
  readonly deleteIdentity: RetiredByteDeleteIdentity;
  readonly identity: BookSourceVersionStorageIdentity | null;
  readonly preDelete: RetiredBytePreDeleteRecord | null;
  readonly providerProof: RetiredByteProviderProof | null;
  readonly irreversibleEffect: {
    readonly status: 'not-started' | 'started';
    readonly startedAt: string | null;
  };
  readonly capacity: {
    readonly status: 'held' | 'settled';
    readonly settledAt: string | null;
  };
  readonly recovery: {
    readonly metadataOnly: true;
    readonly rollbackBoundary: 'before-delete-boundary-only';
    readonly rollbackAfterBoundary: 'not-available';
  };
  readonly state: RetiredByteDeletionState;
  readonly stateRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RetiredByteDeletionRepository {
  findByIdempotency(input: {
    readonly ownerId: string;
    readonly bookId: string;
    readonly idempotencyKey: string;
  }): Promise<RetiredByteDeletionRecord | null>;
  enqueue(input: {
    readonly record: RetiredByteDeletionRecord;
  }): Promise<{ readonly status: 'created' | 'replayed' | 'conflict'; readonly record?: RetiredByteDeletionRecord }>;
  read(input: {
    readonly ownerId: string;
    readonly deletionId: string;
  }): Promise<RetiredByteDeletionRecord | null>;
  compareAndSet(input: {
    readonly ownerId: string;
    readonly deletionId: string;
    readonly expectedState: RetiredByteDeletionState;
    readonly expectedRevision: number;
    readonly next: RetiredByteDeletionRecord;
  }): Promise<{ readonly status: 'advanced' | 'conflict' | 'missing'; readonly record?: RetiredByteDeletionRecord }>;
}

export interface RetiredByteDeletionDependencies {
  readonly repository: RetiredByteDeletionRepository;
  readonly sourceVersions: RetiredByteSourceAuthority;
  readonly contexts: RetiredByteContextAuthority;
  readonly provider: RetiredByteProvider;
  readonly capacity: RetiredByteCapacityAuthority;
  readonly enabled?: boolean;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export type RetiredByteDeletionResult =
  | { readonly status: 'queued' | 'settled' | 'replayed' | 'pending'; readonly code?: string; readonly record: RetiredByteDeletionRecord }
  | { readonly status: 'blocked'; readonly code: string };

export interface RetiredByteDeletionOwner extends ReplacementSagaRetiredByteOwner {
  execute(input: {
    readonly ownerId: string;
    readonly deletionId: string;
  }): Promise<RetiredByteDeletionResult>;
}
