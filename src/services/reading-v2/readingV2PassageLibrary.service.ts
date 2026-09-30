import { endBefore, get, limitToLast, orderByChild, query as dbQuery, ref, type Database } from 'firebase/database';
import { READING_V2_ENGINE, READING_V2_PRODUCT_LABEL } from '../../config/readingV2FeatureFlags';
import { database as defaultDatabase } from '../firebase';
import {
  type MaterialCatalogIndexRow,
} from '../materialCatalog/materialCatalogIndexes.service';
import {
  compareMaterialSummaryRecency,
  listActiveMaterialSummaries,
  listMaterialSummaryPage,
  type MaterialSummaryPageCursor,
  type MaterialSummary,
} from '../materialCatalog/materialSummaryPort.service';
import type {
  MaterialTestTypeConfig,
  MaterialTestTypeId,
  ReadingPassageListScope,
} from '../../types/materialCatalog.types';
import {
  countReadingV2ProjectionInteractions,
} from './readingV2LaunchIntegration.service';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import { isReadingV2PublicVisibility } from './readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import {
  archiveReadingV2PassageMaterial as archiveReadingV2PassageMaterialLifecycle,
  isArchiveIndexRow,
  type ReadingV2PassageArchiveUsageSummary,
  type ReadingV2PassageArchiveRepository as ReadingV2PassageArchiveLifecycleRepository,
} from './readingV2PassageArchive.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2PassageLibraryIndexQuery {
  readonly scope: ReadingPassageListScope;
  readonly teacherId: string;
}

export interface ReadingV2PassageLibraryReader {
  readonly listSummaryRows: (
    query: ReadingV2PassageLibraryIndexQuery,
  ) => Promise<readonly (MaterialSummary | MaterialCatalogIndexRow)[]>;
  readonly readMetadata: (materialId: string) => Promise<ReadingV2MaterialMetadata | null>;
  readonly readStudentSafeProjection?: (
    materialId: string,
    snapshotVersionId: string,
  ) => Promise<Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'> | null>;
  readonly readCanonicalMaterial?: (materialId: string) => Promise<unknown>;
  readonly listSummaryPage?: (query: ReadingV2PassageLibraryIndexQuery, testTypeId?: MaterialTestTypeId | null, cursor?: MaterialSummaryPageCursor) => Promise<{ rows: MaterialSummary[]; cursor: MaterialSummaryPageCursor | null; hasMore: boolean }>;
  readonly listArchiveRowsPage?: (teacherId: string, cursor?: MaterialSummaryPageCursor) => Promise<{ rows: MaterialCatalogIndexRow[]; cursor: MaterialSummaryPageCursor | null; hasMore: boolean }>;
}

export interface ReadingV2PassageLibraryAction {
  readonly key: 'edit' | 'open' | 'view' | 'clone-reading-passage' | 'assign-homework' | 'revise' | 'archive' | 'restore';
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

export const listTeacherReadingPassagesPage = async (
  input: ListTeacherReadingPassagesInput,
  cursor?: MaterialSummaryPageCursor,
): Promise<{ rows: ReadingV2PassageLibraryRow[]; cursor: MaterialSummaryPageCursor | null; hasMore: boolean }> => {
  if (!input.teacherId) return { rows: [], cursor: null, hasMore: false };
  const reader = input.reader ?? createReadingV2PassageLibraryFirebaseReader();
  const page = input.scope === 'archived'
    ? await reader.listArchiveRowsPage?.(input.teacherId, cursor)
    : await reader.listSummaryPage?.({ scope: input.scope, teacherId: input.teacherId }, input.testTypeId, cursor);
  if (!page) throw new Error('Bounded Reading Passage summary query is unavailable.');
  const rows = await listTeacherReadingPassages({ ...input, reader: {
    ...reader,
    listSummaryRows: async () => page.rows,
  } });
  return { ...page, rows };
};

const readArchivePassagePage = async (database: Database, teacherId: string, cursor?: MaterialSummaryPageCursor) => {
  const path = `material_catalog/material_archive_indexes/by_owner/${teacherId}/reading-passage`;
  const snapshot = await get(dbQuery(ref(database, path), orderByChild('archivedAt'),
    ...(cursor ? [endBefore(cursor.updatedAt, cursor.materialId)] : []), limitToLast(26)));
  const rows = snapshot.exists() ? listArchiveRowsFromSnapshotValue(snapshot.val(), teacherId) : [];
  rows.sort(compareMaterialSummaryRecency);
  const page = rows.slice(0, 25);
  const last = page.at(-1);
  return { rows: page, cursor: last ? { updatedAt: last.updatedAt, materialId: last.materialId } : null, hasMore: rows.length > 25 };
};

export interface ReadingV2PassageArchiveRepository {
  readonly read: (path: string) => Promise<unknown>;
  readonly update: (updates: Record<string, unknown | null>) => Promise<void>;
  readonly write?: (path: string, value: unknown) => Promise<void>;
  readonly remove?: (path: string) => Promise<void>;
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
  readonly usageSummary?: ReadingV2PassageArchiveUsageSummary;
}

const isReadingPassageMetadata = (value: unknown): value is ReadingV2MaterialMetadata =>
  Boolean(value) &&
  typeof value === 'object' &&
  (value as ReadingV2MaterialMetadata).deliveryEngine === READING_V2_ENGINE &&
  (value as ReadingV2MaterialMetadata).materialKind === 'reading-passage' &&
  typeof (value as ReadingV2MaterialMetadata).materialId === 'string' &&
  typeof (value as ReadingV2MaterialMetadata).ownerId === 'string';

const listArchiveRowsFromSnapshotValue = (value: unknown, teacherId: string): MaterialCatalogIndexRow[] => {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Reading Passage archive index returned an invalid payload.');
  }
  return Object.entries(value).map(([key, candidate]) => {
    if (!isArchiveIndexRow(candidate) || candidate.materialId !== key ||
      candidate.ownerId !== teacherId || !candidate.title ||
      !['private', 'public'].includes(candidate.visibility) ||
      !candidate.archivedAt || !candidate.currentVersionId) {
      throw new Error(`Reading Passage archive index contains an invalid row: ${key}`);
    }
    const row = candidate;
    return {
      materialId: row.materialId,
      ownerId: row.ownerId,
      title: row.title,
      visibility: row.visibility,
      materialKind: 'reading-passage',
      testTypeIds: [],
      testTypeMembership: {},
      updatedAt: row.archivedAt,
    };
  });
};

export const createReadingV2PassageLibraryFirebaseReader = (
  database: Database = defaultDatabase,
): ReadingV2PassageLibraryReader => ({
  async listSummaryPage(queryInput, testTypeId, cursor) {
    return listMaterialSummaryPage(queryInput.scope === 'private'
      ? { scope: 'owned', ownerId: queryInput.teacherId, surfaceFamily: 'passage', materialKind: 'reading-passage', testTypeId: testTypeId ?? undefined }
      : { scope: 'public', surfaceFamily: 'passage', materialKind: 'reading-passage', testTypeId: testTypeId ?? undefined }, {
      readPage: async (path, limit, pageCursor) => {
        const snapshot = await get(dbQuery(ref(database, path), orderByChild('updatedAt'),
          ...(pageCursor ? [endBefore(pageCursor.updatedAt, pageCursor.materialId)] : []), limitToLast(limit)));
        return snapshot.exists() ? snapshot.val() : null;
      },
    }, { cursor });
  },
  listArchiveRowsPage: (teacherId, cursor) => readArchivePassagePage(database, teacherId, cursor),
  async listSummaryRows(queryInput) {
    if (queryInput.scope !== 'archived') {
      return listActiveMaterialSummaries(
        queryInput.scope === 'private'
          ? { scope: 'owned', ownerId: queryInput.teacherId }
          : { scope: 'public' },
        {
          async read(path) {
            const snapshot = await get(ref(database, path));
            return snapshot.exists() ? snapshot.val() : null;
          },
        },
      );
    }

    const path = `material_catalog/material_archive_indexes/by_owner/${queryInput.teacherId}/reading-passage`;
    const snapshot = await get(ref(database, path));

    if (!snapshot.exists()) {
      return [];
    }

    return listArchiveRowsFromSnapshotValue(snapshot.val(), queryInput.teacherId);
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

  if (isReadingV2PublicVisibility(metadata.visibility)) {
    return 'public';
  }

  return null;
};

const rowMatchesScope = (
  row: MaterialSummary | MaterialCatalogIndexRow,
  metadata: ReadingV2MaterialMetadata,
  input: ListTeacherReadingPassagesInput,
): boolean => {
  const metadataScope = metadataListVisibility(metadata);
  const archived = metadata.state === 'archived';

  if (input.scope === 'archived') {
    return row.ownerId === input.teacherId &&
      metadata.ownerId === input.teacherId &&
      archived;
  }

  if (archived) {
    return false;
  }

  if (input.scope === 'private') {
    return row.ownerId === input.teacherId &&
      metadata.ownerId === input.teacherId &&
      metadataScope !== null;
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
  scope: ReadingPassageListScope,
): readonly ReadingV2PassageLibraryAction[] =>
  scope === 'archived' && isOwner
    ? [
        { key: 'view', label: 'View read-only' },
        { key: 'restore', label: 'Restore', ownerOnly: true },
      ]
    :
  isOwner
    ? [
        { key: 'edit', label: 'Edit' },
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'archive', label: 'Remove from library', ownerOnly: true },
      ]
    : [
        { key: 'clone-reading-passage', label: 'Clone to my library' },
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
  const publicationState = input.metadata.state;
  const archived = publicationState === 'archived';
  const published = !publicationState || publicationState === 'published';
  const accessible = published &&
    !archived &&
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
    selectable: accessible,
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
    actions: buildActions(isOwner, input.scope),
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

export const archiveReadingV2PassageMaterial = async (
  input: ReadingV2PassageArchiveInput,
): Promise<void> => {
  await archiveReadingV2PassageMaterialLifecycle({
    actorUserId: input.teacherId,
    actorRole: 'teacher',
    passage: {
      ...input.passage,
      currentVersionId: input.passage.publishedSnapshotVersionId,
    },
    repository: input.repository as ReadingV2PassageArchiveLifecycleRepository,
    now: input.now,
    correlationId: `${input.teacherId}:${input.passage.materialId}:${input.now ?? 'archive'}`,
    sourceFeatureId: 'teacher_materials_reading_passage_archive',
    sourceRoute: '/lobby',
    usageSummary: input.usageSummary,
  });
};

export const listTeacherReadingPassages = async (
  input: ListTeacherReadingPassagesInput,
): Promise<ReadingV2PassageLibraryRow[]> => {
  if (!input.teacherId) {
    return [];
  }

  const teacherId = input.teacherId;
  const reader = input.reader ?? createReadingV2PassageLibraryFirebaseReader();
  const indexRows = await reader.listSummaryRows({
    scope: input.scope,
    teacherId,
  });
  const readingPassageIndexRows = indexRows.filter((row) => row.materialKind === 'reading-passage');

  if (input.scope !== 'archived') {
    return readingPassageIndexRows
      .filter((row): row is MaterialSummary => 'surfaceFamily' in row && row.surfaceFamily === 'passage')
      .filter((row) => row.lifecycleState === 'active' && (input.scope === 'private'
        ? row.ownerId === teacherId
        : row.visibility === 'public'))
      .filter((row) => !input.testTypeId || row.testTypeIds.includes(input.testTypeId))
      .map((summary): ReadingV2PassageLibraryRow => {
        const testTypes = summary.testTypeIds.map((testTypeId) =>
          testTypeSummary(testTypeId, input.testTypeConfigs));
        const isOwner = summary.ownerId === teacherId;
        const hasStudentSafeProjection = summary.hasStudentSafeProjection === true;
        const accessible = hasStudentSafeProjection && Boolean(summary.sourceSnapshotVersionId);
        return {
          id: summary.materialId,
          materialId: summary.materialId,
          ownerId: summary.ownerId,
          deliveryEngine: READING_V2_ENGINE,
          title: summary.title,
          materialKind: 'reading-passage',
          skill: 'Reading',
          skillType: 'reading-v2',
          questionCount: summary.questionCount ?? 0,
          duration: summary.durationMinutes ?? 0,
          durationMinutes: summary.durationMinutes ?? 0,
          updatedAt: summary.updatedAt,
          visibility: summary.visibility,
          scope: input.scope,
          isOwner,
          selectable: accessible,
          primaryTestTypeId: summary.primaryTestTypeId,
          testTypeIds: summary.testTypeIds,
          testTypes,
          sourceOrderDisplay: summary.sourceOrderDisplay,
          sourceQuestionRange: summary.sourceQuestionRange,
          sourceFullTestId: summary.sourceFullTestId,
          sourceFullTestTitle: summary.sourceFullTestTitle,
          publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
          hasStudentSafeProjection,
          accessible,
          archived: false,
          actions: buildActions(isOwner, input.scope),
          metadata: {
            title: summary.title,
            description: summary.description,
            tags: summary.tags,
            visibility: summary.visibility,
            materialKind: 'reading-passage',
            deliveryEngine: READING_V2_ENGINE,
            productLabel: READING_V2_PRODUCT_LABEL,
            sourceOrderDisplay: summary.sourceOrderDisplay,
            sourceQuestionRange: summary.sourceQuestionRange,
            sourceFullTestTitle: summary.sourceFullTestTitle,
            publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
          },
        };
      })
      .filter((row) => {
        const testTypes = row.testTypes;
        const query = normalizeSearch(input.searchTerm);
        return !query || [row.title, row.metadata.description, ...row.metadata.tags,
          ...testTypes.flatMap((testType) => [testType.label, testType.shortLabel]),
          row.sourceFullTestTitle, row.sourceOrderDisplay]
          .filter((entry): entry is string => typeof entry === 'string')
          .join(' ').toLowerCase().includes(query);
      })
      .sort(compareMaterialSummaryRecency);
  }

  const rows = await Promise.all(
    readingPassageIndexRows
      .map(async (indexRow) => {
        let metadata: ReadingV2MaterialMetadata | null = null;

        try {
          metadata = await reader.readMetadata(indexRow.materialId);
        } catch (error) {
          throw new Error(
            `Reading Passage summary could not hydrate metadata for ${indexRow.materialId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        if (!metadata || !isReadingPassageMetadata(metadata)) {
          throw new Error(
            `Reading Passage summary is missing valid metadata: ${indexRow.materialId}`,
          );
        }

        if (!rowMatchesScope(indexRow, metadata, input)) {
          return null;
        }

        if (!rowMatchesTestType(metadata, input.testTypeId)) {
          return null;
        }

        const testTypes = metadata.testTypeIds.map((testTypeId) =>
          testTypeSummary(testTypeId, input.testTypeConfigs),
        );

        if (!rowMatchesSearch(metadata, testTypes, input.searchTerm)) {
          return null;
        }

        return { ...createRow({
          metadata,
          scope: input.scope,
          teacherId,
          testTypeConfigs: input.testTypeConfigs,
        }), updatedAt: indexRow.updatedAt };
      }),
  );

  return rows
    .filter((row): row is ReadingV2PassageLibraryRow => row !== null)
    .sort(compareMaterialSummaryRecency);
};
