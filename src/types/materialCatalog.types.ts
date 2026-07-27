declare const materialCatalogIdBrand: unique symbol;

export type MaterialCatalogId<K extends string> = string & {
  readonly [materialCatalogIdBrand]: K;
};

export type MaterialTestTypeId = MaterialCatalogId<'testTypeId'>;
export type MaterialBookId = MaterialCatalogId<'bookId'>;
export type MaterialBookNodeId = MaterialCatalogId<'bookNodeId'>;
export type MaterialBookRefId = MaterialCatalogId<'bookRefId'>;
export type MaterialActivityId = MaterialCatalogId<'activityId'>;
export type MaterialActivityVersionId = MaterialCatalogId<'activityVersionId'>;

const asMaterialCatalogId =
  <K extends string>() =>
  (value: string): MaterialCatalogId<K> => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new Error('Material Catalog IDs must be non-empty strings.');
    }

    return trimmed as MaterialCatalogId<K>;
  };

export const materialCatalogIds = {
  testTypeId: asMaterialCatalogId<'testTypeId'>(),
  bookId: asMaterialCatalogId<'bookId'>(),
  nodeId: asMaterialCatalogId<'bookNodeId'>(),
  refId: asMaterialCatalogId<'bookRefId'>(),
  activityId: asMaterialCatalogId<'activityId'>(),
  activityVersionId: asMaterialCatalogId<'activityVersionId'>(),
} as const;

export const MATERIAL_CATALOG_MATERIAL_KINDS = [
  'full-test',
  'reading-passage',
  'book',
  'draft',
  'listening-part',
  'writing-prompt',
  'vocabulary-set',
  'grammar-worksheet',
  'interactive-activity',
  'video',
  'file-attachment',
  'thcs-thpt-test',
] as const;

export type MaterialCatalogMaterialKind =
  (typeof MATERIAL_CATALOG_MATERIAL_KINDS)[number];

/**
 * Identity/provenance is system-owned. Activity revision JSON is deliberately
 * not represented here: it must never be able to replace these fields.
 */
export type ActivityMaterialOriginalProvenance =
  | {
      readonly kind: 'original';
      readonly createdFrom: 'manual';
      readonly createdAt: string;
      readonly createdBy: string;
    }
  | {
      readonly kind: 'original';
      readonly createdFrom: 'import';
      readonly originalActivityKey: string;
      readonly sourceBookId: MaterialBookId;
      readonly sourceVersionId: string;
      readonly manifestVersionId: string;
      readonly createdFromNodeKey: string;
      readonly createdAt: string;
      readonly createdBy: string;
    };

export type ActivityMaterialProvenance =
  | ActivityMaterialOriginalProvenance
  | {
      readonly kind: 'fork';
      readonly forkedFromMaterialId: MaterialActivityId;
      readonly forkedFromVersionId: MaterialActivityVersionId;
      readonly createdAt: string;
      readonly createdBy: string;
    };

export interface ActivityMaterialIdentity {
  readonly materialId: MaterialActivityId;
  readonly activityId: MaterialActivityId;
  readonly materialKind: 'interactive-activity';
  readonly ownerId: string;
  readonly provenance: ActivityMaterialProvenance;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly currentDraftVersionId?: MaterialActivityVersionId;
  readonly currentPublishedVersionId?: MaterialActivityVersionId;
}

export interface ActivityMaterialVersionIdentity {
  readonly materialId: MaterialActivityId;
  readonly activityId: MaterialActivityId;
  readonly activityVersionId: MaterialActivityVersionId;
  readonly revisionOfVersionId?: MaterialActivityVersionId;
  readonly createdAt: string;
  readonly createdBy: string;
}

/** Fields forbidden from editable Activity JSON and candidate imports. */
export const ACTIVITY_EDITABLE_JSON_FORBIDDEN_IDENTITY_FIELDS = [
  'activityId',
  'materialId',
  'versionId',
  'activityVersionId',
  'currentDraftVersionId',
  'currentPublishedVersionId',
  'snapshotVersionId',
  'placementId',
  'bookId',
  'nodeId',
  'pageGroupIds',
  'ownerId',
  'createdAt',
  'createdBy',
  'publishedAt',
  'publishedBy',
  'provenance',
] as const;

export interface MaterialTestTypeConfig {
  readonly testTypeId: MaterialTestTypeId;
  readonly canonicalKey: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly aliases: readonly string[];
  readonly active: boolean;
  readonly teacherSelectable: boolean;
  readonly displayOrder: number;
  readonly defaultPinnedRank?: number | null;
  readonly readingSourceOrderLabel: string;
  readonly readingSourceOrderLabelPlural: string;
  readonly logoUrl?: string;
  readonly logoAlt: string;
  readonly colorToken?: string;
  readonly iconToken?: string;
  readonly allowedMaterialKinds: readonly MaterialCatalogMaterialKind[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface TeacherTestTypePreference {
  readonly teacherId: string;
  readonly pinnedTestTypeIds: readonly MaterialTestTypeId[];
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export const READING_PASSAGE_VISIBILITY_SCOPES = ['private', 'public'] as const;

export type ReadingPassageVisibilityScope =
  (typeof READING_PASSAGE_VISIBILITY_SCOPES)[number];

export const MATERIAL_BOOK_VISIBILITIES = [
  'private',
  'public-library-pending-review',
  'public-library-published',
  'public-library-rejected',
] as const;

export type MaterialBookVisibility = (typeof MATERIAL_BOOK_VISIBILITIES)[number];

export const MATERIAL_BOOK_STATUSES = [
  'draft-empty',
  'draft-in-progress',
  'ready',
  'needs-repair',
  'archived',
] as const;

export type MaterialBookStatus = (typeof MATERIAL_BOOK_STATUSES)[number];

export const MATERIAL_BOOK_MODES = ['materials', 'pdf'] as const;

export type MaterialBookMode = (typeof MATERIAL_BOOK_MODES)[number];

export const isMaterialBookMode = (value: unknown): value is MaterialBookMode =>
  typeof value === 'string' && MATERIAL_BOOK_MODES.includes(value as MaterialBookMode);

export const resolveMaterialBookMode = (value: unknown): MaterialBookMode => {
  if (value === undefined) {
    return 'materials';
  }

  if (isMaterialBookMode(value)) {
    return value;
  }

  throw new Error(`Invalid Material Book mode: ${String(value)}`);
};

export type MaterialBookPublicReviewStatus =
  | 'pending-review'
  | 'approved'
  | 'rejected'
  | 'returned-private';

export interface MaterialBookModeSuccessorLineage {
  readonly kind: 'mode-successor';
  readonly predecessorBookId: MaterialBookId;
  readonly fromMode: MaterialBookMode;
  readonly toMode: MaterialBookMode;
  readonly reason: string;
  readonly actorId: string;
  readonly createdAt: string;
}

export interface MaterialBookReusedActivityRef {
  readonly activityId: string;
  readonly versionId: string;
}

/** Trusted publication provenance; never a browser-controlled mode mutation. */
export interface MaterialBookSourceStrategySuccessorLineage {
  readonly kind: 'source-strategy-successor';
  readonly predecessorBookId: MaterialBookId;
  readonly predecessorPublicationId: string;
  readonly predecessorManifestVersionId: string;
  readonly fromStrategy: 'full_pdf' | 'component_pdfs';
  readonly toStrategy: 'full_pdf' | 'component_pdfs';
  readonly actorId: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
}

export interface MaterialBookPublicReviewState {
  readonly status: MaterialBookPublicReviewStatus;
  readonly reason?: string;
  readonly requestedAt?: string;
  readonly requestedBy?: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

export interface MaterialBookMetadata {
  readonly bookId: MaterialBookId;
  /** Optional only for legacy records; repository reads resolve it to `materials`. */
  readonly bookMode?: MaterialBookMode;
  /** Trusted-command provenance. Browser clients cannot create or retarget it. */
  readonly modeSuccessorLineage?: MaterialBookModeSuccessorLineage;
  /** Identity/version only; never carries predecessor placement or delivery state. */
  readonly reusedActivityRefs?: readonly MaterialBookReusedActivityRef[];
  /** Publication successor provenance; it never carries context bindings. */
  readonly sourceStrategySuccessorLineage?: MaterialBookSourceStrategySuccessorLineage;
  readonly ownerId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly edition?: string;
  readonly series?: string;
  readonly isbn?: string;
  readonly coverUrl?: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly tags: readonly string[];
  readonly description?: string;
  readonly visibility: MaterialBookVisibility;
  readonly status: MaterialBookStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly publicReview?: MaterialBookPublicReviewState;
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly brokenRefReasons?: readonly string[];
}

export const MATERIAL_BOOK_NODE_TYPES = [
  'intro-placeholder',
  'toc-placeholder',
  'note-placeholder',
  'section',
  'chapter',
  'unit',
  'test',
] as const;

export type MaterialBookNodeType = (typeof MATERIAL_BOOK_NODE_TYPES)[number];

export const MATERIAL_REF_AVAILABILITIES = [
  'available',
  'archived',
  'missing',
  'inaccessible',
  'missing-version',
  'missing-projection',
] as const;

export type MaterialRefAvailability = (typeof MATERIAL_REF_AVAILABILITIES)[number];

export const MATERIAL_REF_UPDATE_STATES = [
  'current',
  'newer-version-available',
  'unknown',
] as const;

export type MaterialRefUpdateState = (typeof MATERIAL_REF_UPDATE_STATES)[number];

export interface MaterialBookMaterialRef {
  readonly refId: MaterialBookRefId;
  readonly materialId: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly snapshotVersionId?: string;
  readonly titleSnapshot: string;
  readonly testTypeIdsSnapshot: readonly MaterialTestTypeId[];
  readonly visibilitySnapshot?: string;
  readonly availability: MaterialRefAvailability;
  readonly updateState: MaterialRefUpdateState;
  readonly ownerIdSnapshot?: string;
  readonly order: number;
  readonly addedAt: string;
  readonly addedBy: string;
}

export interface MaterialBookNode {
  readonly nodeId: MaterialBookNodeId;
  readonly bookId: MaterialBookId;
  readonly parentNodeId: MaterialBookNodeId | null;
  readonly type: MaterialBookNodeType;
  readonly title: string;
  readonly order: number;
  readonly materialRefs: readonly MaterialBookMaterialRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ReadingPassageListScope = 'private' | 'public' | 'archived';

export type BookListScope = 'private' | 'public' | 'public-review-pending';

export interface MaterialBookPublicProjectionRef {
  readonly refId: MaterialBookRefId;
  readonly materialId: string;
  readonly materialKind: Exclude<MaterialCatalogMaterialKind, 'draft'>;
  readonly snapshotVersionId: string;
  readonly title: string;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly order: number;
}

export interface MaterialBookPublicProjectionNode {
  readonly nodeId: MaterialBookNodeId;
  readonly parentNodeId: MaterialBookNodeId | null;
  readonly type: MaterialBookNodeType;
  readonly title: string;
  readonly order: number;
  readonly materialRefs: readonly MaterialBookPublicProjectionRef[];
}

export interface MaterialBookPublicProjection {
  readonly bookId: MaterialBookId;
  /** Optional only for legacy records; repository reads resolve it to `materials`. */
  readonly bookMode?: MaterialBookMode;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly series?: string;
  readonly coverUrl?: string;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly tags: readonly string[];
  readonly visibility: 'public-library-published';
  readonly status: 'ready';
  readonly updatedAt: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  readonly nodes: readonly MaterialBookPublicProjectionNode[];
}
