import {
  LISTENING_AUTHORING_PATHS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';
import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationResult,
} from './contracts';

export type {
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationResult,
};
export type {
  ClaimOperationInput,
  InMemoryListeningAuthoringRepository,
  InMemoryRepositoryOptions,
  InMemorySeedState,
  LegacyFirstEditTransactionInput,
  LegacyFirstEditTransactionResult,
  LifecycleTransactionInput,
  LifecycleTransactionResult,
  ListeningAuthoringRepository,
  OperationClaim,
  PublishBlocker,
  PublishDraftTransactionInput,
  PublishDraftTransactionResult,
  PublishedDraftTransactionPayload,
  SaveDraftTransactionInput,
  SaveDraftTransactionResult,
  UpdateDraftTransactionResult,
} from './repository.types';

export type DraftRecordState = 'active' | 'soft-deleted';
export type SourceDraftPath = 'drafts' | 'revision_drafts' | 'legacy_tests';
export type DraftBackedSourceDraftPath = Exclude<SourceDraftPath, 'legacy_tests'>;
export type RepositoryIdPrefix = 'draft' | 'version' | 'operation';

export interface LegacyAuthoringVersioningMetadata {
  frozen: true;
  versionId: string;
  versionNumber: 1;
  frozenAt: number;
  frozenBy: string;
  decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20';
}

export interface LegacyListeningTestRecord extends ListeningAuthoringDocumentV1 {
  id: string;
  ownerId: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  isPublished: boolean;
  authoringVersioning?: LegacyAuthoringVersioningMetadata;
}

export const LISTENING_AUTHORING_ROOT =
  LISTENING_AUTHORING_PATHS.drafts.split('/')[0] ?? 'listening_authoring';

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const cloneJsonCompatibleValue = <T>(value: T): T => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('repository only supports JSON-compatible values.');
    }

    return value;
  }

  if (value === undefined) {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error('repository only supports JSON-compatible values.');
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const normalized = cloneJsonCompatibleValue(entry);
      return normalized === undefined ? null : normalized;
    }) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).reduce<Array<[string, unknown]>>((entries, [key, entry]) => {
        const normalized = cloneJsonCompatibleValue(entry);
        if (normalized !== undefined) {
          entries.push([key, normalized]);
        }

        return entries;
      }, []),
    ) as T;
  }

  throw new Error('repository only supports JSON-compatible values.');
};

export const cloneRecord = <T>(record: T): T => cloneJsonCompatibleValue(record);

export const extractSequence = (value: string, prefix: RepositoryIdPrefix): number | undefined => {
  if (!value.startsWith(`${prefix}-`)) {
    return undefined;
  }

  const suffix = value.slice(prefix.length + 1);
  const parsed = Number(suffix);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export interface DraftSoftDeleteMetadata {
  deletedAt: number;
  deletedBy: string;
  reasonCode?: string;
  priorConflictToken: number;
  retentionDecisionRef?: string;
  restoredAt?: number;
  restoredBy?: string;
  restoreCount: number;
}

export interface BaseDraftRecord {
  schemaVersion: typeof LISTENING_AUTHORING_SCHEMA_VERSION;
  draftId: string;
  testId: string;
  ownerId: string;
  state: DraftRecordState;
  conflictToken: number;
  document: ListeningAuthoringDocumentV1;
  validationIssues?: readonly Record<string, unknown>[];
  assetIds: Record<string, true>;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  lastOperationId: string;
  softDelete?: DraftSoftDeleteMetadata;
}

export interface ListeningDraftRecord extends BaseDraftRecord {
  recordType: 'draft';
  latestPublishedVersionId?: string;
}

export interface ListeningRevisionDraftRecord extends BaseDraftRecord {
  recordType: 'revision-draft';
  createdFromVersionId: string;
  createdFromVersionNumber: number;
}

export type ListeningAuthoringDraftRecord =
  | ListeningDraftRecord
  | ListeningRevisionDraftRecord;

export interface BaseListeningPublishedVersionRecord {
  schemaVersion: typeof LISTENING_AUTHORING_SCHEMA_VERSION;
  recordType: 'published-version';
  versionId: string;
  versionNumber: number;
  testId: string;
  ownerId: string;
  previousVersionId?: string;
  document: ListeningAuthoringDocumentV1;
  assetIds: Record<string, true>;
  publishedAt: number;
  publishedBy: string;
  publishOperationId: string;
  documentHash: string;
  archive: {
    state: 'active' | 'archived';
    archivedAt?: number;
    archivedBy?: string;
    reasonCode?: string;
  };
  compatibility: {
    legacyTestPath?: string;
    frozenLegacyVersion1: boolean;
  };
}

export interface ListeningPublishedVersionFromDraftRecord extends BaseListeningPublishedVersionRecord {
  sourceDraftPath: DraftBackedSourceDraftPath;
  sourceDraftId: string;
  sourceLegacyTestId?: never;
}

export interface ListeningPublishedVersionFromLegacyTestRecord
  extends BaseListeningPublishedVersionRecord {
  sourceDraftPath: 'legacy_tests';
  sourceLegacyTestId: string;
  sourceDraftId?: never;
}

export type ListeningPublishedVersionRecord =
  | ListeningPublishedVersionFromDraftRecord
  | ListeningPublishedVersionFromLegacyTestRecord;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type CreateListeningPublishedVersionInput = DistributiveOmit<
  ListeningPublishedVersionRecord,
  'versionNumber'
>;

export const cloneDraftRecord = (
  record: ListeningAuthoringDraftRecord,
): ListeningAuthoringDraftRecord => cloneRecord(record);

export const cloneVersionRecord = (
  record: ListeningPublishedVersionRecord,
): ListeningPublishedVersionRecord => cloneRecord(record);

export const normalizeDraftRecord = (
  record: ListeningAuthoringDraftRecord,
): ListeningAuthoringDraftRecord => cloneDraftRecord(record);

export const normalizeVersionRecord = (
  record: unknown,
): ListeningPublishedVersionRecord => {
  const normalized = cloneRecord(record);
  if (!isPlainObject(normalized)) {
    throw new Error('published-version record must be a plain object.');
  }

  const versionId =
    typeof normalized.versionId === 'string' && normalized.versionId.trim().length > 0
      ? normalized.versionId
      : '<unknown-version>';

  switch (normalized.sourceDraftPath) {
    case 'drafts':
    case 'revision_drafts':
      if (
        typeof normalized.sourceDraftId !== 'string' ||
        normalized.sourceDraftId.trim().length === 0
      ) {
        throw new Error(
          `published-version ${versionId} requires non-empty sourceDraftId for ${normalized.sourceDraftPath}.`,
        );
      }
      if (normalized.sourceLegacyTestId !== undefined) {
        throw new Error(
          `published-version ${versionId} forbids sourceLegacyTestId for ${normalized.sourceDraftPath}.`,
        );
      }
      break;
    case 'legacy_tests':
      if (
        typeof normalized.sourceLegacyTestId !== 'string' ||
        normalized.sourceLegacyTestId.trim().length === 0
      ) {
        throw new Error(
          `published-version ${versionId} requires non-empty sourceLegacyTestId for legacy_tests.`,
        );
      }
      if (normalized.sourceDraftId !== undefined) {
        throw new Error(
          `published-version ${versionId} forbids sourceDraftId for legacy_tests.`,
        );
      }
      break;
    default:
      throw new Error(`published-version ${versionId} has invalid sourceDraftPath.`);
  }

  return normalized as unknown as ListeningPublishedVersionRecord;
};

export const normalizeVersionMap = (
  value: Record<string, unknown>,
): Record<string, ListeningPublishedVersionRecord> =>
  Object.fromEntries(
    Object.entries(value).map(([versionId, record]) => [versionId, normalizeVersionRecord(record)]),
  );
