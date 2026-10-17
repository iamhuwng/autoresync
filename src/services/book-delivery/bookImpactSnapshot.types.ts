import type {
  BookImpactDiscoveryContextKind,
  BookImpactSummary,
} from './bookImpactDiscovery.types';

export const BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const BOOK_IMPACT_SNAPSHOT_DEFAULT_TTL_MS = 15 * 60 * 1000;
export const BOOK_IMPACT_SNAPSHOT_MAX_TTL_MS = 30 * 60 * 1000;

export const BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS = Object.freeze([
  'solo',
  'homework',
  'course',
  'class',
  'public-reference',
] as const satisfies readonly BookImpactDiscoveryContextKind[]);

export type BookImpactSnapshotChoice =
  | 'review-only'
  | 'retain-current'
  | 'apply-without-redo'
  | 'apply-with-redo'
  | 'include-required'
  | 'exclude-added'
  | 'remove-from-current'
  | 'retain-historical'
  | 'adopt-successor'
  | 'invalidate-context';

export interface BookImpactSnapshotImmutableInputs {
  readonly oldActivityVersionId: string;
  readonly newActivityVersionId: string;
  readonly oldActivityFingerprint: string;
  readonly newActivityFingerprint: string;
  readonly placementFingerprint: string;
  readonly manifestFingerprint: string;
  readonly sourceFingerprint: string;
  readonly scheduleFingerprint: string;
}

export interface BookImpactSnapshotAdapterEvidence {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly contractVersion: number;
}

export interface BookImpactSnapshotActivityChoice {
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly placementId: string;
  readonly primaryEffect: BookImpactSummary['classification']['primaryEffect'];
  readonly allowedChoices: readonly BookImpactSnapshotChoice[];
  readonly selectedChoice: null;
}

export interface BookImpactSnapshotContext {
  readonly contextKey: string;
  readonly impact: BookImpactSummary;
  readonly updateAuthority: {
    readonly ownerId: string;
    readonly actorId: string;
    readonly permitted: true;
  };
  readonly recipientScope: {
    readonly recipientId: string;
    readonly lifecycle: BookImpactSummary['lifecycle'];
    readonly status: BookImpactSummary['status'];
  };
  readonly activityChoices: readonly BookImpactSnapshotActivityChoice[];
  readonly estimatedCheckpointCount: number;
  readonly estimatedNotificationCount: number;
}

export interface BookImpactSnapshotRecoveryPolicy {
  readonly backupInventory: 'include-metadata';
  readonly restoreBehavior: 'retain-read-only';
  readonly expiryBehavior: 'retain-audit-deny-reuse';
  readonly sideEffectsOnReplay: 'none';
  readonly recoveryLedgerRoot: 'book_impact_snapshot_recovery';
}

export interface BookImpactSnapshot {
  readonly schemaVersion: typeof BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly actorId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly inputFingerprint: string;
  readonly immutableInputs: BookImpactSnapshotImmutableInputs;
  readonly adapters: readonly BookImpactSnapshotAdapterEvidence[];
  readonly contexts: readonly BookImpactSnapshotContext[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly recovery: BookImpactSnapshotRecoveryPolicy;
}

export type BookImpactSnapshotReadResult =
  | { readonly status: 'ready'; readonly snapshot: BookImpactSnapshot }
  | { readonly status: 'expired'; readonly snapshotId: string; readonly expiresAt: string }
  | { readonly status: 'stale'; readonly snapshotId: string }
  | { readonly status: 'missing' }
  | { readonly status: 'denied' };

export const isBookImpactSnapshotExpired = (
  snapshot: Pick<BookImpactSnapshot, 'expiresAt'>,
  now: string,
): boolean => Date.parse(snapshot.expiresAt) <= Date.parse(now);
