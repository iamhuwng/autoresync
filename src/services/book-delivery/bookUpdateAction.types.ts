import type { BookImpactSnapshotChoice } from './bookImpactSnapshot.types';

export const BOOK_UPDATE_ACTION_SCHEMA_VERSION = 1 as const;
export const BOOK_UPDATE_ACTION_MAX_SELECTIONS = 1_000;
export const BOOK_UPDATE_ACTION_MAX_REASON_LENGTH = 500;

export const BOOK_UPDATE_ACTION_STATES = Object.freeze([
  'accepted',
  'applying',
  'committed',
  'notification-pending',
  'completed',
  'compensating',
  'compensated',
  'terminal-failure',
] as const);

export type BookUpdateActionState = typeof BOOK_UPDATE_ACTION_STATES[number];

export interface BookUpdateActionSelection {
  readonly contextKey: string;
  readonly placementId: string;
  readonly choice: BookImpactSnapshotChoice;
  readonly replacementDeadline?: string;
}

export interface BookUpdateActionCommand {
  readonly actorId: string;
  readonly bookId: string;
  readonly snapshotId: string;
  readonly snapshotFingerprint: string;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly selections: readonly BookUpdateActionSelection[];
}

export interface BookUpdateActionAuditFacts {
  readonly actorId: string;
  readonly acceptedAt: string;
  readonly reason: string;
  readonly bookId: string;
  readonly oldActivityVersionId: string;
  readonly newActivityVersionId: string;
  readonly selectedContextKeys: readonly string[];
  readonly classifications: readonly string[];
  readonly affectedCount: number;
  readonly checkpointCount: number;
  readonly regradeCount: number;
  readonly notificationCount: number;
  readonly terminalStatus: BookUpdateActionState | null;
  readonly terminalAt: string | null;
}

export interface BookUpdateActionRecord {
  readonly schemaVersion: typeof BOOK_UPDATE_ACTION_SCHEMA_VERSION;
  readonly actionId: string;
  readonly actorId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly snapshotId: string;
  readonly snapshotFingerprint: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly reason: string;
  readonly selections: readonly BookUpdateActionSelection[];
  readonly state: BookUpdateActionState;
  readonly stateRevision: number;
  readonly acceptedAt: string;
  readonly committedAt: string | null;
  readonly updatedAt: string;
  readonly terminalFailureCode: string | null;
  readonly audit: BookUpdateActionAuditFacts;
  readonly recovery: {
    readonly restoreBehavior: 'resume-or-compensate';
    readonly replaySideEffects: 'none';
    readonly recoveryLedgerRoot: 'book_update_action_recovery';
  };
}

export type BookUpdateActionAcceptResult =
  | { readonly status: 'accepted' | 'replayed'; readonly action: BookUpdateActionRecord }
  | { readonly status: 'blocked'; readonly code: string };

export const isBookUpdateActionTerminal = (state: BookUpdateActionState): boolean => (
  state === 'completed' || state === 'compensated' || state === 'terminal-failure'
);
