import { get, ref, type Database } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { database as defaultDatabase } from '../firebase';
import {
  listMaterialCatalogIndexPaths,
  type MaterialCatalogIndexRow,
  type MaterialCatalogIndexSummary,
} from '../materialCatalog/materialCatalogIndexes.service';
import type {
  MaterialTestTypeConfig,
  MaterialTestTypeId,
  ReadingPassageListScope,
} from '../../types/materialCatalog.types';
import {
  countReadingV2ProjectionInteractions,
} from './readingV2LaunchIntegration.service';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2PassageLibraryIndexQuery {
  readonly scope: ReadingPassageListScope;
  readonly teacherId: string;
}

export interface ReadingV2PassageLibraryReader {
  readonly listIndexRows: (
    query: ReadingV2PassageLibraryIndexQuery,
  ) => Promise<readonly MaterialCatalogIndexRow[]>;
  readonly readMetadata: (materialId: string) => Promise<ReadingV2MaterialMetadata | null>;
  readonly readStudentSafeProjection?: (
    materialId: string,
    snapshotVersionId: string,
  ) => Promise<Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'> | null>;
  readonly readCanonicalMaterial?: (materialId: string) => Promise<unknown>;
}

export interface ReadingV2PassageLibraryAction {
  readonly key: 'open' | 'view' | 'assign-homework' | 'revise' | 'archive';
  readonly label: string;
  readonly ownerOnly?: boolean;
}

export interface ReadingV2PassageLibraryTestTypeSummary {
  readonly testTypeId: MaterialTestTypeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly active: boolean;
}

export interface ReadingV2PassageLibraryRow {
  readonly id: string;
  readonly materialId: string;
  readonly ownerId: string;
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly title: string;
  readonly materialKind: 'reading-passage';
  readonly skill: 'Reading';
  readonly skillType: 'reading-v2';
  readonly questionCount: number;
  readonly duration: number;
  readonly durationMinutes: number;
  readonly updatedAt: string;
  readonly visibility: ReadingPassageListScope;
  readonly scope: ReadingPassageListScope;
  readonly isOwner: boolean;
  readonly selectable: boolean;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly primaryTestTypeState?: string;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypes: readonly ReadingV2PassageLibraryTestTypeSummary[];
  readonly sourceOrderDisplay?: string;
  readonly sourceQuestionRange?: string;
  readonly sourceFullTestId?: string;
  readonly sourceFullTestTitle?: string;
  readonly publishedSnapshotVersionId?: string;
  readonly hasStudentSafeProjection: boolean;
  readonly accessible: boolean;
  readonly archived: boolean;
  readonly actions: readonly ReadingV2PassageLibraryAction[];
  readonly metadata: {
    readonly title: string;
    readonly description?: string;
    readonly tags: readonly string[];
    readonly visibility?: string;
    readonly materialKind: 'reading-passage';
    readonly deliveryEngine: typeof READING_V2_ENGINE;
    readonly productLabel: string;
    readonly sourceOrderDisplay?: string;
    readonly sourceQuestionRange?: string;
    readonly sourceFullTestTitle?: string;
    readonly publishedSnapshotVersionId?: string;
  };
}

export interface ListTeacherReadingPassagesInput {
  readonly teacherId: string | undefined;
  readonly scope: ReadingPassageListScope;
  readonly searchTerm?: string;
  readonly testTypeId?: MaterialTestTypeId | null;
  readonly reader?: ReadingV2PassageLibraryReader;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}

export interface ReadingV2PassageArchiveRepository {
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
}

export interface ReadingV2PassageArchiveInput {
  readonly teacherId: string;
  readonly passage: Pick<
    ReadingV2PassageLibraryRow,
    | 'materialId'
    | 'ownerId'
    | 'title'
    | 'visibility'
    | 'materialKind'
    | 'testTypeIds'
    | 'sourceFullTestId'
    | 'updatedAt'
    | 'publishedSnapshotVersionId'
  >;
  readonly repository: ReadingV2PassageArchiveRepository;
  readonly now?: string;
}

const materialIndexPath = (
  bucket: 'by_owner' | 'by_visibility',
  key: string,
): string => `material_catalog/material_indexes/${bucket}/${key}`;

const isIndexRow = (value: unknown): value is MaterialCatalogIndexRow =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as MaterialCatalogIndexRow).materialId === 'string' &&
  typeof (value as MaterialCatalogIndexRow).ownerId === 'string' &&
  (value as MaterialCatalogIndexRow).materialKind === 'reading-passage';

const isReadingPassageMetadata = (value: unknown): value is ReadingV2MaterialMetadata =>
  Boolean(value) &&
  typeof value === 'object' &&
  (value as ReadingV2MaterialMetadata).deliveryEngine === READING_V2_ENGINE &&
  (value as ReadingV2MaterialMetadata).materialKind === 'reading-passage' &&
  typeof (value as ReadingV2MaterialMetadata).materialId === 'string' &&
  typeof (value as ReadingV2MaterialMetadata).ownerId === 'string';

const listRowsFromSnapshotValue = (value: unknown): MaterialCatalogIndexRow[] =>
  Object.values(value ?? {}).filter(isIndexRow);

export const createReadingV2PassageLibraryFirebaseReader = (
  database: Database = defaultDatabase,
): ReadingV2PassageLibraryReader => ({
  async listIndexRows(queryInput) {
    const path = queryInput.scope === 'private'
      ? materialIndexPath('by_owner', queryInput.teacherId)
      : materialIndexPath('by_visibility', 'public');
    const snapshot = await get(ref(database, path));

    return snapshot.exists() ? listRowsFromSnapshotValue(snapshot.val()) : [];
  },
  async readMetadata(materialId) {
    const snapshot = await get(ref(database, readingV2StoragePaths.materialMetadata(materialId)));
    const value = snapshot.exists() ? snapshot.val() : null;

    return isReadingPassageMetadata(value) ? value : null;
  },
  async readStudentSafeProjection(materialId, snapshotVersionId) {
    const snapshot = await get(
      ref(database, readingV2StoragePaths.studentSafeTests(materialId, snapshotVersionId)),
    );

    return snapshot.exists()
      ? snapshot.val() as Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'>
      : null;
  },
});

const testTypeSummary = (
  testTypeId: MaterialTestTypeId,
  configs: readonly MaterialTestTypeConfig[] | undefined,
): ReadingV2PassageLibraryTestTypeSummary => {
  const config = configs?.find((entry) => entry.testTypeId === testTypeId);
  const fallback = String(testTypeId).toUpperCase();

  return {
    testTypeId,
    label: config?.label ?? fallback,
    shortLabel: config?.shortLabel ?? fallback,
    active: config?.active ?? false,
  };
};

const normalizeSearch = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? '';

const metadataListVisibility = (
  metadata: ReadingV2MaterialMetadata,
): ReadingPassageListScope | null => {
  if (metadata.visibility === 'private') {
    return 'private';
  }

  if (metadata.visibility === 'library-eligible') {
    return 'public';
  }

  return null;
};

const rowMatchesScope = (
  row: MaterialCatalogIndexRow,
  metadata: ReadingV2MaterialMetadata,
  input: ListTeacherReadingPassagesInput,
): boolean => {
  const metadataScope = metadataListVisibility(metadata);

  if (input.scope === 'private') {
    return row.ownerId === input.teacherId &&
      metadata.ownerId === input.teacherId &&
      row.visibility === 'private' &&
      metadataScope === 'private';
  }

  return row.visibility === 'public' && metadataScope === 'public';
};

const rowMatchesTestType = (
  metadata: ReadingV2MaterialMetadata,
  testTypeId: MaterialTestTypeId | null | undefined,
): boolean => !testTypeId || metadata.testTypeIds.includes(testTypeId);

const searchableText = (
  metadata: ReadingV2MaterialMetadata,
  testTypes: readonly ReadingV2PassageLibraryTestTypeSummary[],
): string =>
  [
    metadata.title,
    metadata.description,
    ...(metadata.tags ?? []),
    ...testTypes.flatMap((testType) => [testType.label, testType.shortLabel]),
    metadata.sourceTitleSnapshot,
    metadata.sourceOrderDisplaySnapshot,
  ]
    .filter((entry): entry is string => typeof entry === 'string')
    .join(' ')
    .toLowerCase();

const rowMatchesSearch = (
  metadata: ReadingV2MaterialMetadata,
  testTypes: readonly ReadingV2PassageLibraryTestTypeSummary[],
  searchTerm: string | undefined,
): boolean => {
  const query = normalizeSearch(searchTerm);

  if (!query) {
    return true;
  }

  return searchableText(metadata, testTypes).includes(query);
};

const buildActions = (
  isOwner: boolean,
): readonly ReadingV2PassageLibraryAction[] =>
  isOwner
    ? [
        { key: 'open', label: 'Open' },
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'revise', label: 'Revise', ownerOnly: true },
        { key: 'archive', label: 'Archive', ownerOnly: true },
      ]
    : [
        { key: 'view', label: 'View' },
        { key: 'assign-homework', label: 'Assign homework' },
      ];

const createRow = (input: {
  readonly metadata: ReadingV2MaterialMetadata;
  readonly projection?: Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'> | null;
  readonly scope: ReadingPassageListScope;
  readonly teacherId: string;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}): ReadingV2PassageLibraryRow => {
  const testTypes = input.metadata.testTypeIds.map((testTypeId) =>
    testTypeSummary(testTypeId, input.testTypeConfigs),
  );
  const questionCount = countReadingV2ProjectionInteractions(input.projection);
  const isOwner = input.metadata.ownerId === input.teacherId;
  const archived = input.metadata.state === 'archived';
  const accessible = !archived &&
    Boolean(input.metadata.publishedSnapshotVersionId) &&
    Boolean(input.projection);

  return {
    id: input.metadata.materialId,
    materialId: input.metadata.materialId,
    ownerId: input.metadata.ownerId,
    deliveryEngine: READING_V2_ENGINE,
    title: input.metadata.title,
    materialKind: 'reading-passage',
    skill: 'Reading',
    skillType: 'reading-v2',
    questionCount,
    duration: input.metadata.durationMinutes,
    durationMinutes: input.metadata.durationMinutes,
    updatedAt: input.metadata.updatedAt,
    visibility: metadataListVisibility(input.metadata) ?? input.scope,
    scope: input.scope,
    isOwner,
    selectable: true,
    primaryTestTypeId: input.metadata.primaryTestTypeId,
    primaryTestTypeState: input.metadata.primaryTestTypeState,
    testTypeIds: input.metadata.testTypeIds,
    testTypes,
    sourceOrderDisplay: input.metadata.sourceOrderDisplaySnapshot,
    sourceQuestionRange: input.metadata.sourceQuestionRange,
    sourceFullTestId: input.metadata.sourceFullTestId,
    sourceFullTestTitle: input.metadata.sourceTitleSnapshot,
    publishedSnapshotVersionId: input.metadata.publishedSnapshotVersionId,
    hasStudentSafeProjection: Boolean(input.projection),
    accessible,
    archived,
    actions: buildActions(isOwner),
    metadata: {
      title: input.metadata.title,
      description: input.metadata.description,
      tags: input.metadata.tags,
      visibility: input.metadata.visibility,
      materialKind: 'reading-passage',
      deliveryEngine: READING_V2_ENGINE,
      productLabel: input.metadata.productLabel,
      sourceOrderDisplay: input.metadata.sourceOrderDisplaySnapshot,
      sourceQuestionRange: input.metadata.sourceQuestionRange,
      sourceFullTestTitle: input.metadata.sourceTitleSnapshot,
      publishedSnapshotVersionId: input.metadata.publishedSnapshotVersionId,
    },
  };
};

const archiveSummaryFromPassage = (
  passage: ReadingV2PassageArchiveInput['passage'],
): MaterialCatalogIndexSummary => ({
  materialId: passage.materialId,
  ownerId: passage.ownerId,
  title: passage.title,
  visibility: passage.visibility === 'public' ? 'public' : 'private',
  materialKind: passage.materialKind,
  testTypeIds: passage.testTypeIds,
  sourceFullTestId: passage.sourceFullTestId,
  updatedAt: passage.updatedAt,
});

export const archiveReadingV2PassageMaterial = async (
  input: ReadingV2PassageArchiveInput,
): Promise<void> => {
  const materialId = input.passage.materialId?.trim();

  if (!materialId) {
    throw new Error('Reading Passage archive requires a material id.');
  }

  if (input.passage.ownerId !== input.teacherId) {
    throw new Error('Only the owner teacher can archive this Reading Passage.');
  }

  const archivedAt = input.now ?? new Date().toISOString();
  const metadataBasePath = readingV2StoragePaths.materialMetadata(materialId);
  const materialBasePath = readingV2StoragePaths.readingPassageMaterials(materialId);
  const writes = [
    { path: `${metadataBasePath}/state`, value: 'archived' },
    { path: `${metadataBasePath}/archivedAt`, value: archivedAt },
    { path: `${metadataBasePath}/archivedBy`, value: input.teacherId },
    { path: `${metadataBasePath}/updatedAt`, value: archivedAt },
    { path: `${materialBasePath}/state`, value: 'archived' },
    { path: `${materialBasePath}/archivedAt`, value: archivedAt },
    { path: `${materialBasePath}/archivedBy`, value: input.teacherId },
    { path: `${materialBasePath}/updatedAt`, value: archivedAt },
  ];

  if (input.passage.publishedSnapshotVersionId) {
    const versionBasePath = readingV2StoragePaths.readingPassageMaterialVersions(
      materialId,
      input.passage.publishedSnapshotVersionId,
    );
    writes.push(
      { path: `${versionBasePath}/state`, value: 'archived' },
      { path: `${versionBasePath}/archivedAt`, value: archivedAt },
      { path: `${versionBasePath}/archivedBy`, value: input.teacherId },
    );
  }

  await Promise.all(writes.map((write) => input.repository.write(write.path, write.value)));
  await Promise.all(
    listMaterialCatalogIndexPaths(archiveSummaryFromPassage(input.passage))
      .map((path) => input.repository.remove(path)),
  );
};

export const listTeacherReadingPassages = async (
  input: ListTeacherReadingPassagesInput,
): Promise<ReadingV2PassageLibraryRow[]> => {
  if (!input.teacherId) {
    return [];
  }

  const teacherId = input.teacherId;
  const reader = input.reader ?? createReadingV2PassageLibraryFirebaseReader();
  const indexRows = await reader.listIndexRows({
    scope: input.scope,
    teacherId,
  });
  const rows = await Promise.all(
    indexRows
      .filter((row) => row.materialKind === 'reading-passage')
      .map(async (indexRow) => {
        const metadata = await reader.readMetadata(indexRow.materialId);

        if (!metadata || !isReadingPassageMetadata(metadata)) {
          return null;
        }

        if (!rowMatchesScope(indexRow, metadata, input) || !rowMatchesTestType(metadata, input.testTypeId)) {
          return null;
        }

        const testTypes = metadata.testTypeIds.map((testTypeId) =>
          testTypeSummary(testTypeId, input.testTypeConfigs),
        );

        if (!rowMatchesSearch(metadata, testTypes, input.searchTerm)) {
          return null;
        }

        const projection = metadata.publishedSnapshotVersionId
          ? await reader.readStudentSafeProjection?.(
              metadata.materialId,
              metadata.publishedSnapshotVersionId,
            )
          : null;

        return createRow({
          metadata,
          projection,
          scope: input.scope,
          teacherId,
          testTypeConfigs: input.testTypeConfigs,
        });
      }),
  );

  return rows
    .filter((row): row is ReadingV2PassageLibraryRow => row !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};
