import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationResult,
  ListeningAuthoringOperationTargetType,
  ListeningAuthoringOperationType,
  ListeningLifecycleOperationType,
} from './contracts';
import type {
  CreateListeningPublishedVersionInput,
  LegacyListeningTestRecord,
  ListeningAuthoringDraftRecord,
  ListeningPublishedVersionRecord,
  RepositoryIdPrefix,
} from './repository.shared';

export type OperationClaim<T extends ListeningAuthoringOperationResult = ListeningAuthoringOperationResult> =
  | { kind: 'claimed'; record: ListeningAuthoringOperationRecord<T> }
  | { kind: 'existing'; record: ListeningAuthoringOperationRecord<T> }
  | { kind: 'conflict'; record: ListeningAuthoringOperationRecord<T> };

export interface ClaimOperationInput {
  operationId: string;
  operationType: ListeningAuthoringOperationType;
  targetType: ListeningAuthoringOperationTargetType;
  ownerId: string;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken?: number;
}

export type UpdateDraftTransactionResult =
  | { kind: 'updated'; conflictToken: number }
  | { kind: 'conflict'; currentConflictToken: number }
  | { kind: 'missing' };

export interface SaveDraftTransactionInput {
  ownerId: string;
  draftId: string;
  operationId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  document: ListeningAuthoringDocumentV1;
  allowCreate: boolean;
  expectedConflictToken?: number;
}

export type SaveDraftTransactionResult =
  | { kind: 'saved'; created: boolean; result: Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>> }
  | { kind: 'replayed'; created: boolean; result: Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>> }
  | { kind: 'idempotency-conflict'; draftId: string; operationId: string }
  | {
      kind: 'conflict';
      draftId: string;
      expectedConflictToken?: number;
      currentConflictToken: number;
    }
  | { kind: 'not-found'; draftId: string };

export interface PublishBlocker {
  field: string;
  severity: 'blocker';
  guidance: string;
}

export interface PublishDraftTransactionInput {
  ownerId: string;
  draftId: string;
  operationId: string;
  versionId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken: number;
  publishedAt: number;
}

export interface LegacyFirstEditTransactionInput {
  ownerId: string;
  legacyTestId: string;
  operationId: string;
  versionId: string;
  revisionDraftId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  publishedAt: number;
}

export type LegacyFirstEditTransactionResult =
  | { kind: 'published'; result: PublishedDraftTransactionPayload }
  | { kind: 'replayed'; result: PublishedDraftTransactionPayload }
  | { kind: 'idempotency-conflict'; draftId: string; operationId: string }
  | { kind: 'not-found'; draftId: string };

export type PublishedDraftTransactionPayload =
  Required<Pick<
    ListeningAuthoringOperationResult,
    'draftId' | 'versionId' | 'versionNumber' | 'conflictToken'
  >>;

export type PublishDraftTransactionResult =
  | { kind: 'published'; result: PublishedDraftTransactionPayload }
  | { kind: 'replayed'; result: PublishedDraftTransactionPayload }
  | { kind: 'blocked'; draftId: string; conflictToken: number; blockers: readonly PublishBlocker[] }
  | { kind: 'idempotency-conflict'; draftId: string; operationId: string }
  | {
      kind: 'conflict';
      draftId: string;
      expectedConflictToken: number;
      currentConflictToken: number;
    }
  | { kind: 'not-found'; draftId: string };

export interface LifecycleTransactionInput {
  ownerId: string;
  operationId: string;
  operationType: ListeningLifecycleOperationType;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken: number;
  completedAt: number;
  reasonCode?: string;
}

export type LifecycleTransactionResult =
  | { kind: 'soft-deleted' | 'restored' | 'discarded'; result: Required<Pick<ListeningAuthoringOperationResult, 'draftId' | 'conflictToken'>> }
  | { kind: 'archived'; result: Required<Pick<ListeningAuthoringOperationResult, 'versionId' | 'versionNumber'>> }
  | { kind: 'conflict'; targetId: string; expectedConflictToken: number; currentConflictToken: number }
  | { kind: 'idempotency-conflict'; targetId: string; operationId: string }
  | { kind: 'invalid-state' | 'not-found'; targetId: string };

export interface ListeningAuthoringRepository {
  allocateId(prefix: RepositoryIdPrefix): string;
  getDraft(draftId: string): Promise<ListeningAuthoringDraftRecord | null>;
  writeDraft(record: ListeningAuthoringDraftRecord): Promise<void>;
  updateDraftTransaction(
    draftId: string,
    expectedConflictToken: number,
    updateFn: (draft: ListeningAuthoringDraftRecord) => ListeningAuthoringDraftRecord,
  ): Promise<UpdateDraftTransactionResult>;
  claimOperation(input: ClaimOperationInput): Promise<OperationClaim>;
  completeOperation<T extends ListeningAuthoringOperationResult>(
    operationId: string,
    result: T,
  ): Promise<void>;
  saveDraftTransaction(input: SaveDraftTransactionInput): Promise<SaveDraftTransactionResult>;
  publishDraftTransaction(input: PublishDraftTransactionInput): Promise<PublishDraftTransactionResult>;
  legacyFirstEditTransaction(
    input: LegacyFirstEditTransactionInput,
  ): Promise<LegacyFirstEditTransactionResult>;
  lifecycleTransaction(input: LifecycleTransactionInput): Promise<LifecycleTransactionResult>;
  createVersionTransaction(
    input: CreateListeningPublishedVersionInput,
  ): Promise<
    | { kind: 'created'; record: ListeningPublishedVersionRecord }
    | { kind: 'exists'; record: ListeningPublishedVersionRecord }
  >;
  nextVersionNumberTransaction(testId: string): Promise<number>;
}

export interface InMemoryListeningAuthoringRepository extends ListeningAuthoringRepository {
  getLegacyTest(testId: string): Promise<LegacyListeningTestRecord | null>;
  events(): readonly string[];
  listOperationClaims(): readonly ListeningAuthoringOperationRecord[];
  listVersions(): readonly ListeningPublishedVersionRecord[];
}

export interface InMemorySeedState {
  legacyTests?: readonly LegacyListeningTestRecord[];
  drafts?: readonly ListeningAuthoringDraftRecord[];
  versions?: readonly ListeningPublishedVersionRecord[];
  operations?: readonly ListeningAuthoringOperationRecord[];
}

export interface InMemoryRepositoryOptions {
  now?: () => number;
  seed?: InMemorySeedState;
}
