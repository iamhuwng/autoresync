import type {
  BookActivityCandidateRecord,
  BookActivityDraftRecord,
  BookActivityEditableJson,
  BookActivityMaterialRecord,
  BookActivityStudentSafeProjection,
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';

export const PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION = 1 as const;

export const PUBLIC_BOOK_SELECTION_KINDS = [
  'book',
  'section',
  'chapter',
  'unit',
  'activity',
] as const;
export type PublicBookSelectionKind = (typeof PUBLIC_BOOK_SELECTION_KINDS)[number];

export const PUBLIC_BOOK_RUNTIME_STATES = [
  'metadata-only',
  'tree-public-runtime-blocked',
  'playable',
] as const;
export type PublicBookRuntimeState = (typeof PUBLIC_BOOK_RUNTIME_STATES)[number];

export const PUBLIC_BOOK_REFERENCE_STATUSES = [
  'current',
  'newer-version-available',
  'revoked',
  'replaced',
  'adoption-required',
] as const;
export type PublicBookReferenceStatus = (typeof PUBLIC_BOOK_REFERENCE_STATUSES)[number];

export type PublicBookPublicationStatus = 'trusted' | 'untrusted' | 'revoked' | 'replaced';
export type PublicBookSourceReadiness = 'ready' | 'blocked' | 'revoked' | 'replaced';
export type PublicBookEntitlementStatus = 'active' | 'revoked' | 'missing';
export type PublicBookContextMode = 'none' | 'book-source-reference';

export interface PublicBookPublicationSnapshot {
  readonly publicationId: string;
  readonly revision: number;
  readonly status: PublicBookPublicationStatus;
  readonly publishedAt: string;
  readonly updatedAt: string;
}

/**
 * Deliberately excludes provider, bucket, object, credential, and private
 * source identity. It is the only source information allowed past the
 * catalog boundary.
 */
export interface PublicBookSourceSafetySnapshot {
  readonly sourceVersionId: string;
  readonly lifecycleState: PublicBookSourceReadiness;
  readonly studentSafeStatus: PublicBookSourceReadiness;
  readonly documentDeliveryStatus: PublicBookSourceReadiness;
  readonly replacementSourceVersionId?: string;
}

export interface PublicBookNodeSnapshot {
  readonly nodeId: string;
  readonly nodeKind: 'section' | 'chapter' | 'unit';
  readonly title: string;
  readonly order: number;
  readonly selectionPath: readonly string[];
}

export interface PublicBookActivitySelectionSnapshot {
  readonly activityId: string;
  readonly versionId: string;
  readonly title: string;
  readonly order: number;
  readonly selectionPath: readonly string[];
  readonly projection: BookActivityStudentSafeProjection;
  /** Trusted server-side source used only when creating an owned fork. */
  readonly canonicalVersion?: BookActivityVersionRecord;
}

export interface PublicBookSelectionSnapshot {
  readonly bookId: string;
  readonly title: string;
  readonly publicTree: boolean;
  readonly publication: PublicBookPublicationSnapshot;
  readonly source: PublicBookSourceSafetySnapshot;
  readonly nodes: readonly PublicBookNodeSnapshot[];
  readonly activities: readonly PublicBookActivitySelectionSnapshot[];
}

export interface PublicBookTargetBookSnapshot {
  readonly bookId: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly status: 'draft' | 'ready' | 'archived';
}

export interface PublicBookEntitlementSnapshot {
  readonly entitlementId: string;
  readonly studentId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly status: PublicBookEntitlementStatus;
  readonly contextId: string;
  readonly authorizedSelectionPaths?: readonly string[][];
}

export type PublicBookSourceContextChoice =
  | { readonly mode: 'none' }
  | {
    readonly mode: 'book-source-reference';
    readonly sourceBookId: string;
    readonly sourceVersionId: string;
    readonly selectionPath: readonly string[];
    readonly pageGroupIds: readonly string[];
  };

export interface PublicBookSelectionRequest {
  readonly sourceBookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly kind: PublicBookSelectionKind;
  readonly selectionPath: readonly string[];
  readonly activities: readonly {
    readonly activityId: string;
    readonly activityVersionId: string;
    readonly order: number;
  }[];
}

export interface PublicBookReferenceTarget {
  readonly bookId: string;
  readonly nodeId: string;
  readonly placementId: string;
}

export interface PublicBookReferenceSource {
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly selectionKind: PublicBookSelectionKind;
  readonly selectionPath: readonly string[];
  readonly activities: readonly {
    readonly activityId: string;
    readonly activityVersionId: string;
    readonly order: number;
  }[];
  readonly sourceVersionId: string;
}

export interface PublicBookReferenceRecord {
  readonly schemaVersion: typeof PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION;
  readonly recordKind: 'public-book-reference';
  readonly referenceId: string;
  readonly revision: number;
  readonly operation: 'create' | 'adopt' | 'rollback';
  readonly origin: 'direct' | 'legacy-migration';
  readonly target: PublicBookReferenceTarget;
  readonly source: PublicBookReferenceSource;
  readonly context: PublicBookSourceContextChoice;
  readonly status: PublicBookReferenceStatus;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly previousRevision?: number;
  readonly legacyReferenceId?: string;
}

export interface PublicBookReferencePlacementRecord {
  readonly schemaVersion: typeof PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION;
  readonly placementKind: 'public-book-reference' | 'forked-activity';
  readonly target: PublicBookReferenceTarget;
  readonly materialId: string;
  readonly materialKind: 'interactive-activity' | 'book-reference';
  readonly snapshotVersionId: string;
  readonly order: number;
  readonly referenceId?: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface PublicBookForkHistoryRecord {
  readonly schemaVersion: typeof PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION;
  readonly historyKind: 'public-book-fork';
  readonly forkId: string;
  readonly forkedActivityId: string;
  /** Candidate identity is the first immutable fork revision, not a published source version. */
  readonly candidateVersionId: string;
  readonly candidateId: string;
  readonly draftId: string;
  readonly source: PublicBookReferenceSource & {
    readonly sourceActivityId: string;
    readonly sourceActivityVersionId: string;
  };
  readonly target: PublicBookReferenceTarget;
  readonly context: PublicBookSourceContextChoice;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface PublicBookForkMaterialProvenance {
  readonly source: 'fork';
  readonly forkedFromMaterialId: string;
  readonly forkedFromVersionId: string;
  readonly sourceBookId: string;
  readonly sourcePublicationId: string;
  readonly sourcePublicationRevision: number;
  readonly sourceSelectionPath: readonly string[];
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface PublicBookForkMaterialRecord
  extends Omit<BookActivityMaterialRecord, 'provenance'> {
  readonly provenance: PublicBookForkMaterialProvenance;
}

export interface PublicBookForkedActivity {
  readonly material: PublicBookForkMaterialRecord;
  readonly candidate: BookActivityCandidateRecord;
  readonly draft: BookActivityDraftRecord;
  readonly candidateVersionId: string;
  readonly sourceActivityVersionId: string;
}

export interface PublicBookCatalogView {
  readonly bookId: string;
  readonly title: string;
  readonly publicState: PublicBookRuntimeState;
  readonly publicationStatus: PublicBookPublicationStatus;
  readonly sourceReadiness: PublicBookSourceReadiness;
  readonly nodes: readonly PublicBookNodeSnapshot[];
  readonly activities: readonly Pick<PublicBookActivitySelectionSnapshot, 'activityId' | 'versionId' | 'title' | 'order' | 'selectionPath'>[];
  readonly newerVersionAvailable: boolean;
}

export interface PublicBookRuntimePreparation {
  readonly bookId: string;
  readonly title: string;
  readonly sourceVersionId: string;
  readonly activityIds: readonly string[];
  readonly selectionPath: readonly string[];
  readonly sourceContext: PublicBookSourceContextChoice;
  readonly document?: {
    readonly resourcePath: string;
    readonly expiresAt: string;
    readonly byteSize: number;
    readonly contentType: 'application/pdf';
  };
}

export interface PublicBookStudentProjection {
  readonly projectionKind: 'public-book-student-safe';
  readonly bookId: string;
  readonly title: string;
  readonly publicState: PublicBookRuntimeState;
  readonly selectionKind: PublicBookSelectionKind;
  readonly selectionPath: readonly string[];
  readonly newerVersionAvailable: boolean;
  readonly runtime?: PublicBookRuntimePreparation;
}

export interface PublicBookReferenceForkStore {
  readPublicBook(bookId: string): Promise<PublicBookSelectionSnapshot | null>;
  readTargetBook(bookId: string): Promise<PublicBookTargetBookSnapshot | null>;
  readEntitlement(input: {
    readonly studentId: string;
    readonly entitlementId: string;
  }): Promise<PublicBookEntitlementSnapshot | null>;
  readCurrentReference(referenceId: string): Promise<PublicBookReferenceRecord | null>;
  readReferenceRevision(referenceId: string, revision: number): Promise<PublicBookReferenceRecord | null>;
  writeReferenceMutation(input: {
    readonly operationId: string;
    readonly reference: PublicBookReferenceRecord;
    readonly placement: PublicBookReferencePlacementRecord;
  }): Promise<void>;
  writeForkMutation(input: {
    readonly operationId: string;
    readonly placements: readonly PublicBookReferencePlacementRecord[];
    readonly activities: readonly PublicBookForkedActivity[];
    readonly history: readonly PublicBookForkHistoryRecord[];
  }): Promise<void>;
}

export interface PublicBookDocumentIssuer {
  issue(input: {
    readonly studentId: string;
    readonly bookId: string;
    readonly sourceVersionId: string;
    readonly entitlementId: string;
    readonly contextId: string;
  }): Promise<{
    readonly resourcePath: string;
    readonly expiresAt: string;
    readonly byteSize: number;
    readonly contentType: 'application/pdf';
  }>;
}

export type PublicBookReferenceForkIdFactory = (kind: string) => string;

export interface PublicBookReferenceForkServiceOptions {
  readonly store: PublicBookReferenceForkStore;
  readonly now?: () => string;
  readonly createId?: PublicBookReferenceForkIdFactory;
  readonly mutationsEnabled?: boolean;
  readonly rollbackEnabled?: boolean;
  readonly documentIssuer?: PublicBookDocumentIssuer;
}

export interface PublicBookReferenceForkResolveInput {
  readonly actorId: string;
  readonly role: 'student' | 'teacher' | 'super_admin';
  readonly selection: PublicBookSelectionRequest;
  readonly entitlementId?: string;
  readonly context?: PublicBookSourceContextChoice;
}

export interface PublicBookReferenceForkMutationInput {
  readonly actorId: string;
  readonly target: PublicBookReferenceTarget;
  readonly selection: PublicBookSelectionRequest;
  readonly context?: PublicBookSourceContextChoice;
  readonly operationId?: string;
}

export interface PublicBookLegacyReferenceMigrationInput {
  readonly actorId: string;
  readonly operationId: string;
  readonly legacyReferenceId: string;
  readonly target: PublicBookReferenceTarget;
  readonly selection: PublicBookSelectionRequest;
  readonly context?: PublicBookSourceContextChoice;
  readonly migratedAt: string;
}

export interface PublicBookReferenceMigrationReceipt {
  readonly schemaVersion: typeof PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION;
  readonly operationId: string;
  readonly legacyReferenceId: string;
  readonly referenceId: string;
  readonly revision: number;
  readonly migratedAt: string;
  readonly mode: 'explicit-public-book-reference';
}

export interface PublicBookReferenceForkService {
  browse(input: {
    readonly actorId: string;
    readonly role: 'student' | 'teacher' | 'super_admin';
    readonly bookId: string;
    readonly entitlementId?: string;
  }): Promise<PublicBookCatalogView>;
  resolve(input: PublicBookReferenceForkResolveInput): Promise<PublicBookStudentProjection>;
  prepareRuntime(input: PublicBookReferenceForkResolveInput): Promise<PublicBookRuntimePreparation>;
  reference(input: PublicBookReferenceForkMutationInput): Promise<PublicBookReferenceRecord>;
  migrateLegacyReference(input: PublicBookLegacyReferenceMigrationInput): Promise<{
    readonly reference: PublicBookReferenceRecord;
    readonly receipt: PublicBookReferenceMigrationReceipt;
  }>;
  fork(input: PublicBookReferenceForkMutationInput): Promise<{
    readonly activities: readonly PublicBookForkedActivity[];
    readonly history: readonly PublicBookForkHistoryRecord[];
    readonly placements: readonly PublicBookReferencePlacementRecord[];
  }>;
  status(input: {
    readonly actorId: string;
    readonly referenceId: string;
  }): Promise<PublicBookReferenceStatus>;
  adopt(input: {
    readonly actorId: string;
    readonly referenceId: string;
    readonly expectedRevision: number;
  }): Promise<PublicBookReferenceRecord>;
  rollback(input: {
    readonly actorId: string;
    readonly referenceId: string;
    readonly expectedRevision: number;
  }): Promise<PublicBookReferenceRecord>;
}
