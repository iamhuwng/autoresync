declare const materialCatalogIdBrand: unique symbol;

export type MaterialCatalogId<K extends string> = string & {
  readonly [materialCatalogIdBrand]: K;
};

export type MaterialTestTypeId = MaterialCatalogId<'testTypeId'>;
export type MaterialBookId = MaterialCatalogId<'bookId'>;
export type MaterialBookNodeId = MaterialCatalogId<'bookNodeId'>;
export type MaterialBookRefId = MaterialCatalogId<'bookRefId'>;

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
  'video',
  'file-attachment',
  'thcs-thpt-test',
] as const;

export type MaterialCatalogMaterialKind =
  (typeof MATERIAL_CATALOG_MATERIAL_KINDS)[number];

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
  'archived',
] as const;

export type MaterialBookStatus = (typeof MATERIAL_BOOK_STATUSES)[number];

export interface MaterialBookMetadata {
  readonly bookId: MaterialBookId;
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
}

export const MATERIAL_BOOK_NODE_TYPES = [
  'intro-placeholder',
  'toc-placeholder',
  'note-placeholder',
  'section',
  'chapter',
  'test',
] as const;

export type MaterialBookNodeType = (typeof MATERIAL_BOOK_NODE_TYPES)[number];

export const MATERIAL_REF_AVAILABILITIES = [
  'available',
  'archived',
  'missing',
  'inaccessible',
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

export type ReadingPassageListScope = 'private' | 'public';

export type BookListScope = 'private' | 'public';
