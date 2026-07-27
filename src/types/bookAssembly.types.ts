/** Pure, student-safe Mode 2 assembly candidate contract. */
export const BOOK_SOURCE_STRATEGIES = ['full_pdf', 'component_pdfs'] as const;
export type BookSourceStrategy = (typeof BOOK_SOURCE_STRATEGIES)[number];

export const BOOK_CONTENT_NODE_TYPES = [
  'intro-placeholder',
  'toc-placeholder',
  'note-placeholder',
  'section',
  'chapter',
  'unit',
  'test',
] as const;
export type BookContentNodeType = (typeof BOOK_CONTENT_NODE_TYPES)[number];

export const ACTIVITY_CONTEXT_REQUIREMENTS = ['required', 'optional', 'none'] as const;
export type ActivityContextRequirement = (typeof ACTIVITY_CONTEXT_REQUIREMENTS)[number];

export const PAGE_GROUP_MODES = ['activity', 'reference_only'] as const;
export type PageGroupMode = (typeof PAGE_GROUP_MODES)[number];

/** Logical candidate binding. Verification facts come only from injected authority. */
export interface FullPdfSourceCandidate {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey?: never;
}

export interface ComponentPdfSourceCandidate {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey: string;
}

export type BookSourceCandidate = FullPdfSourceCandidate | ComponentPdfSourceCandidate;

export interface FullPdfSourceSetCandidate {
  readonly sourceStrategy: 'full_pdf';
  readonly sources: readonly [FullPdfSourceCandidate];
}

export interface ComponentPdfsSourceSetCandidate {
  readonly sourceStrategy: 'component_pdfs';
  readonly sources: readonly [ComponentPdfSourceCandidate, ...ComponentPdfSourceCandidate[]];
}

export type SourceSetCandidate = FullPdfSourceSetCandidate | ComponentPdfsSourceSetCandidate;

/** Safe projection from the trusted immutable Source Version boundary. */
export interface TrustedBookSourceVersionProjection {
  readonly sourceVersionId: string;
  readonly bookId: string;
  readonly physicalPageCount: number;
  /**
   * Assembly usability from trusted lifecycle authority: verified, confirmed,
   * current, and not released/deleted/replaced. This is not student-safe
   * designation or delivery authorization.
   */
  readonly verifiedUsable: boolean;
}

/** Injected port. Implementations project 03A records without storage identity. */
export interface BookSourceVersionAuthority {
  getSourceVersion(sourceVersionId: string): TrustedBookSourceVersionProjection | undefined;
}

export interface BookContentTreeNodeCandidate {
  readonly nodeKey: string;
  readonly parentNodeKey: string | null;
  readonly nodeType: BookContentNodeType;
  readonly order: number;
}

/** A physical page is always local to a named immutable source. */
export interface SourcePageReference {
  readonly sourceKey: string;
  readonly physicalPageNumber: number;
}

export interface SourceQualifiedPageIdentity extends SourcePageReference {
  readonly sourceVersionId: string;
}

export interface BookActivitySlotCandidate {
  readonly activityKey: string;
  readonly order: number;
  readonly contextRequirement: ActivityContextRequirement;
  /** Must name at least one Page Group; `none` never means no source mapping. */
  readonly pageGroupKeys: readonly string[];
}

export interface BookPageGroupCandidate {
  readonly pageGroupKey: string;
  readonly sourceKey: string;
  readonly pages: readonly number[];
  readonly activityKeys: readonly string[];
  readonly mode: PageGroupMode;
  readonly defaultPhysicalPageNumber?: number;
}

/** One coherent Unit owns its ordered Activity slots and Page Groups. */
export interface BookUnitCandidate {
  /** Must identify a `unit` node in the Book Content Tree. */
  readonly unitKey: string;
  readonly activitySlots: readonly BookActivitySlotCandidate[];
  readonly pageGroups: readonly BookPageGroupCandidate[];
}

export interface BookAssemblyManifestCandidate {
  readonly bookId: string;
  readonly sourceSet: SourceSetCandidate;
  readonly nodes: readonly BookContentTreeNodeCandidate[];
  readonly units: readonly BookUnitCandidate[];
}

export const BOOK_ASSEMBLY_LIMITS = {
  maxCandidateBytes: 1_048_576,
  maxSources: 128,
  maxNodes: 2_000,
  maxUnits: 500,
  maxActivitySlots: 5_000,
  maxPageGroups: 10_000,
  maxPagesPerGroup: 1_000,
  maxActivitiesPerGroup: 500,
  maxKeyLength: 128,
} as const;

export type BookAssemblyValidationCode =
  | 'invalid-record'
  | 'unknown-field'
  | 'missing-field'
  | 'invalid-value'
  | 'payload-too-large'
  | 'limit-exceeded'
  | 'duplicate-key'
  | 'duplicate-order'
  | 'unknown-source-key'
  | 'unknown-source-version'
  | 'unverified-source-version'
  | 'source-book-mismatch'
  | 'unknown-node-key'
  | 'invalid-owner'
  | 'cycle'
  | 'depth-exceeded'
  | 'out-of-range-page'
  | 'invalid-page-group'
  | 'unmapped-activity'
  | 'mixed-source-strategy'
  | 'forbidden-field';

export interface BookAssemblyValidationError {
  readonly code: BookAssemblyValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface BookAssemblyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookAssemblyValidationError[];
}

export type BookAssemblyPublicationLifecycle = 'published' | 'rolled_back';

export type BookAssemblyPublicationFailureCode =
  | 'invalid-publication-plan'
  | 'invalid-fingerprint'
  | 'sensitive-payload'
  | 'stale-current-pointer'
  | 'duplicate-version'
  | 'idempotency-conflict'
  | 'unknown-version'
  | 'unauthorized-rollback';

export interface BookAssemblyPreviewApprovalReference {
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface BookAssemblyStudentSafePublicationProjection {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly sourceStrategy: BookSourceStrategy;
  readonly sourceSet: SourceSetCandidate;
  readonly units: readonly BookUnitCandidate[];
}

export interface BookAssemblyActivityVersionRecord {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly ownerId: string;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitKey: string;
  readonly activityKey: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
  readonly payloadFingerprint: string;
}

export interface BookAssemblyActivitySafeProjectionRecord {
  readonly schemaVersion: 1;
  readonly projectionId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly placementIds: readonly string[];
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
  readonly payloadFingerprint: string;
}

export interface BookAssemblyPlacementRecord {
  readonly schemaVersion: 1;
  readonly placementId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitKey: string;
  readonly nodeKey: string;
  readonly activityKey: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly order: number;
  readonly pageGroupKeys: readonly string[];
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
}

export interface BookAssemblyPublishedUnitProjectionRecord {
  readonly schemaVersion: 1;
  readonly unitProjectionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitKey: string;
  readonly placementIds: readonly string[];
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
  readonly createdByCommandId: string;
  readonly createdAt: string;
}

export interface BookAssemblyDeliveryPublicationPlan {
  readonly schemaVersion: 1;
  readonly deliveryPlanId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly sourceStrategy: BookSourceStrategy;
  readonly sourceSet: SourceSetCandidate;
  readonly placementIds: readonly string[];
  readonly unitProjectionIds: readonly string[];
  readonly createdByCommandId: string;
  readonly createdAt: string;
}

export interface BookAssemblyPublicationAtomicWriteSet {
  readonly activityVersions: readonly BookAssemblyActivityVersionRecord[];
  readonly activitySafeProjections: readonly BookAssemblyActivitySafeProjectionRecord[];
  readonly placements: readonly BookAssemblyPlacementRecord[];
  readonly unitProjections: readonly BookAssemblyPublishedUnitProjectionRecord[];
  readonly deliveryPlans: readonly BookAssemblyDeliveryPublicationPlan[];
}

export interface BookAssemblyPublicationAdapterPlan {
  readonly strategy: BookSourceStrategy;
  readonly planId: string;
  readonly adapterTicket: '16' | '17' | 'fixture';
  readonly ownerId: string;
  readonly bookId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly studentSafeProjection: BookAssemblyStudentSafePublicationProjection;
  readonly atomicWrites: BookAssemblyPublicationAtomicWriteSet;
  readonly previewApproval?: BookAssemblyPreviewApprovalReference;
}

export interface BookAssemblyImmutableManifestVersion {
  readonly schemaVersion: 1;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly lifecycle: BookAssemblyPublicationLifecycle;
  readonly ownerId: string;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly strategy: BookSourceStrategy;
  readonly adapterTicket: BookAssemblyPublicationAdapterPlan['adapterTicket'];
  readonly inputFingerprint: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly studentSafeProjection: BookAssemblyStudentSafePublicationProjection;
}

export interface BookAssemblyPublicationPointer {
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly inputFingerprint: string;
  readonly updatedAt: string;
  readonly updatedByCommandId: string;
}

export interface BookAssemblyPublicationAuditRecord {
  readonly auditId: string;
  readonly operationId: string;
  readonly action: 'publish' | 'rollback';
  readonly ownerId: string;
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly inputFingerprint: string;
  readonly status: 'committed' | 'replayed' | 'rejected';
  readonly failureCode?: BookAssemblyPublicationFailureCode;
  readonly createdAt: string;
}
