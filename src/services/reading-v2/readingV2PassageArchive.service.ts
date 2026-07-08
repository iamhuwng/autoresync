import {
  buildMaterialCatalogIndexWrites,
  listMaterialCatalogIndexPaths,
  type MaterialCatalogIndexRow,
  type MaterialCatalogIndexSummary,
} from '../materialCatalog/materialCatalogIndexes.service';
import { createReadingV2PassageMaterialSummary } from '../materialCatalog/materialSummaryAdapters.service';
import { buildMaterialSummaryUpdatePayload } from '../materialCatalog/materialSummaryPort.service';
import type {
  MaterialCatalogMaterialKind,
  MaterialTestTypeId,
  ReadingPassageListScope,
} from '../../types/materialCatalog.types';
import {
  type ReadingV2AuditActorRole,
  buildReadingV2AuditEvent,
  getReadingV2AuditEventPath,
} from './readingV2AuditTrail.service';
import {
  getReadingV2DuplicateIndexPath,
  validateReadingV2DuplicateIndexRow,
  type ReadingV2DuplicateIndexRow,
  type ReadingV2DuplicateIndexState,
} from './readingV2PassageDuplicateGuard.service';
import { isReadingV2PublicVisibility } from './readingV2MaterialMetadata.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2PassageArchiveRepository {
  readonly read?: (path: string) => Promise<unknown>;
  readonly update: (updates: Record<string, unknown | null>) => Promise<void>;
  readonly write?: (path: string, value: unknown) => Promise<void>;
  readonly remove?: (path: string) => Promise<void>;
}

export interface ReadingV2PassageArchiveUsageSummary {
  readonly usedElsewhere: boolean;
  readonly usageCategories: readonly string[];
}

export interface ReadingV2PassageArchiveMaterial {
  readonly materialId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly visibility: ReadingPassageListScope | string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly testTypeIds: readonly MaterialTestTypeId[] | readonly string[];
  readonly sourceFullTestId?: string;
  readonly source?: string;
  readonly testType?: string;
  readonly updatedAt: string;
  readonly currentVersionId?: string;
  readonly publishedSnapshotVersionId?: string;
  readonly questionCount?: number;
  readonly archivedAt?: string;
}

export interface ReadingV2ArchiveIndexRow {
  readonly materialId: string;
  readonly title: string;
  readonly source?: string;
  readonly testType?: string;
  readonly ownerId: string;
  readonly visibility: 'private' | 'public';
  readonly archivedAt: string;
  readonly archivedBy: string;
  readonly currentVersionId: string;
  readonly questionCount: number;
  readonly hasBrokenRefs?: boolean;
}

export interface ReadingV2PassageArchiveInput {
  readonly actorUserId: string;
  readonly actorRole: ReadingV2AuditActorRole;
  readonly passage: ReadingV2PassageArchiveMaterial;
  readonly repository: ReadingV2PassageArchiveRepository;
  readonly now?: string;
  readonly correlationId: string;
  readonly sourceFeatureId: string;
  readonly sourceRoute: string;
  readonly usageSummary?: ReadingV2PassageArchiveUsageSummary;
}

export interface ReadingV2PassageRestoreInput extends Omit<ReadingV2PassageArchiveInput, 'usageSummary'> {
  readonly restoreVisibility: 'private' | 'public';
}

export interface ReadingV2PassageArchiveResult {
  readonly changedPaths: readonly string[];
}

export interface ReadingV2ArchivedPassageListReader {
  readonly listArchiveRows: (ownerId: string) => Promise<readonly ReadingV2ArchiveIndexRow[]>;
}

const normalizeActiveVisibility = (visibility: string): 'private' | 'public' =>
  isReadingV2PublicVisibility(visibility) ? 'public' : 'private';

const metadataVisibilityFor = (visibility: 'private' | 'public'): 'private' | 'public' =>
  visibility === 'public' ? 'public' : 'private';

const materialVisibilityFor = (visibility: 'private' | 'public'): 'private' | 'public' =>
  visibility === 'public' ? 'public' : 'private';

const currentVersionIdFor = (passage: ReadingV2PassageArchiveMaterial): string =>
  String(passage.currentVersionId || passage.publishedSnapshotVersionId || '').trim();

const assertArchiveOwner = (input: {
  readonly actorUserId: string;
  readonly actorRole: ReadingV2AuditActorRole;
  readonly ownerId: string;
}): void => {
  if (input.actorRole === 'super_admin') {
    return;
  }

  if (input.actorUserId !== input.ownerId) {
    throw new Error('Only the owner teacher can archive or restore this Reading Passage.');
  }
};

const toIndexSummary = (
  passage: ReadingV2PassageArchiveMaterial,
  visibility = normalizeActiveVisibility(String(passage.visibility)),
): MaterialCatalogIndexSummary => ({
  materialId: passage.materialId,
  ownerId: passage.ownerId,
  title: passage.title,
  visibility,
  materialKind: passage.materialKind,
  testTypeIds: passage.testTypeIds as readonly MaterialTestTypeId[],
  sourceFullTestId: passage.sourceFullTestId,
  updatedAt: passage.updatedAt,
});

const toUniversalSummary = (
  passage: ReadingV2PassageArchiveMaterial,
  lifecycleState: 'active' | 'archived' | 'removed',
  updatedAt: string,
  visibility = normalizeActiveVisibility(String(passage.visibility)),
) => createReadingV2PassageMaterialSummary({
  materialId: passage.materialId,
  ownerId: passage.ownerId,
  title: passage.title,
  visibility,
  lifecycleState,
  testTypeIds: passage.testTypeIds as readonly MaterialTestTypeId[],
  questionCount: passage.questionCount,
  sourceSnapshotVersionId:
    passage.currentVersionId ?? passage.publishedSnapshotVersionId,
  sourceFullTestId: passage.sourceFullTestId,
  updatedAt,
});

export const getReadingV2ArchiveIndexPath = (ownerId: string, materialId: string): string =>
  `material_catalog/material_archive_indexes/by_owner/${ownerId}/reading-passage/${materialId}`;

const auditEventIdPart = (value: string): string =>
  value.replace(/[.#$[\]/]/g, '-');

const auditEventId = (correlationId: string, action: string, entityId: string, createdAt: string): string =>
  [correlationId, action, entityId, createdAt].map(auditEventIdPart).join(':');

const buildArchiveIndexRow = (input: {
  readonly passage: ReadingV2PassageArchiveMaterial;
  readonly archivedAt: string;
  readonly archivedBy: string;
  readonly usageSummary?: ReadingV2PassageArchiveUsageSummary;
}): ReadingV2ArchiveIndexRow => {
  const currentVersionId = currentVersionIdFor(input.passage);

  if (!currentVersionId) {
    throw new Error('Reading Passage archive requires a current version id.');
  }

  return {
    materialId: input.passage.materialId,
    title: input.passage.title,
    ownerId: input.passage.ownerId,
    visibility: normalizeActiveVisibility(String(input.passage.visibility)),
    archivedAt: input.archivedAt,
    archivedBy: input.archivedBy,
    currentVersionId,
    questionCount: Number(input.passage.questionCount ?? 0),
    ...(input.passage.source ? { source: input.passage.source } : {}),
    ...(input.passage.testType ? { testType: input.passage.testType } : {}),
    ...(input.usageSummary?.usedElsewhere ? { hasBrokenRefs: true } : {}),
  };
};

const buildAuditWrite = (
  input: ReadingV2PassageArchiveInput,
  action: 'reading_passage_archived' | 'reading_passage_restored',
  createdAt: string,
  after: unknown,
): { readonly path: string; readonly value: unknown } => {
  const eventId = auditEventId(input.correlationId, action, input.passage.materialId, createdAt);
  const event = buildReadingV2AuditEvent({
    eventId,
    createdAt,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action,
    entityType: 'reading-passage',
    entityId: input.passage.materialId,
    ownerId: input.passage.ownerId,
    materialId: input.passage.materialId,
    snapshotVersionId: currentVersionIdFor(input.passage),
    titleSnapshot: input.passage.title,
    usedElsewhere: input.usageSummary?.usedElsewhere,
    usageCategories: input.usageSummary?.usageCategories,
    after,
    adminOverride: input.actorRole === 'super_admin' || undefined,
    correlationId: input.correlationId,
    sourceFeatureId: input.sourceFeatureId,
    sourceRoute: input.sourceRoute,
  });
  const path = getReadingV2AuditEventPath(eventId);
  return { path, value: event };
};

const toUpdatePayload = (
  writes: readonly { readonly path: string; readonly value: unknown | null }[],
): Record<string, unknown | null> =>
  Object.fromEntries(writes.map((write) => [write.path, write.value]));

const hasExistingValue = (value: unknown): boolean =>
  value !== null && value !== undefined;

const requireLifecycleRead = (
  repository: ReadingV2PassageArchiveRepository,
  action: 'archive' | 'restore',
): ((path: string) => Promise<unknown>) => {
  if (!repository.read) {
    throw new Error(`Reading Passage ${action} requires lifecycle preflight reads.`);
  }

  return repository.read;
};

const buildExistingRemovalWrites = async (
  read: (path: string) => Promise<unknown>,
  paths: readonly string[],
): Promise<Array<{ readonly path: string; readonly value: null }>> => {
  const existingPaths = await Promise.all(paths.map(async (path) => ({
    path,
    value: await read(path),
  })));

  return existingPaths
    .filter(({ value }) => hasExistingValue(value))
    .map(({ path }) => ({ path, value: null }));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ownedRecordExists = (value: unknown, ownerId: string): boolean =>
  isRecord(value) && value.ownerId === ownerId;

const recordState = (value: unknown): string | null =>
  isRecord(value) && typeof value.state === 'string'
    ? value.state
    : null;

const readArchivePreflight = async (input: {
  readonly read: (path: string) => Promise<unknown>;
  readonly materialId: string;
  readonly ownerId: string;
}): Promise<{ readonly alreadyArchived: boolean }> => {
  const [metadata, material, archiveIndex] = await Promise.all([
    input.read(readingV2StoragePaths.materialMetadata(input.materialId)),
    input.read(readingV2StoragePaths.readingPassageMaterials(input.materialId)),
    input.read(getReadingV2ArchiveIndexPath(input.ownerId, input.materialId)),
  ]);

  if (!ownedRecordExists(metadata, input.ownerId) || !ownedRecordExists(material, input.ownerId)) {
    throw new Error('Reading Passage archive requires existing owned material metadata and passage records.');
  }

  return {
    alreadyArchived:
      recordState(metadata) === 'archived' ||
      recordState(material) === 'archived' ||
      hasExistingValue(archiveIndex),
  };
};

const buildDuplicateIndexStateWrite = async (input: {
  readonly read: (path: string) => Promise<unknown>;
  readonly ownerId: string;
  readonly materialId: string;
  readonly state: ReadingV2DuplicateIndexState;
  readonly updatedAt: string;
  readonly visibility?: 'private' | 'public';
}): Promise<{ readonly path: string; readonly value: ReadingV2DuplicateIndexRow } | null> => {
  const path = getReadingV2DuplicateIndexPath(input.ownerId, input.materialId);
  const existingValue = await input.read(path);

  if (!hasExistingValue(existingValue)) {
    return null;
  }

  const row = validateReadingV2DuplicateIndexRow(existingValue);
  if (row.ownerId !== input.ownerId || row.passageMaterialId !== input.materialId) {
    throw new Error('Reading Passage archive/restore found a duplicate index row with mismatched identity.');
  }

  return {
    path,
    value: {
      ...row,
      state: input.state,
      ...(input.visibility ? { visibility: input.visibility } : {}),
      updatedAt: input.updatedAt,
    },
  };
};

export const archiveReadingV2PassageMaterial = async (
  input: ReadingV2PassageArchiveInput,
): Promise<ReadingV2PassageArchiveResult> => {
  const materialId = input.passage.materialId.trim();
  if (!materialId) {
    throw new Error('Reading Passage archive requires a material id.');
  }
  assertArchiveOwner({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ownerId: input.passage.ownerId,
  });

  const read = requireLifecycleRead(input.repository, 'archive');
  const archivedAt = input.now ?? new Date().toISOString();
  const preflight = await readArchivePreflight({
    read,
    materialId,
    ownerId: input.passage.ownerId,
  });
  const metadataBasePath = readingV2StoragePaths.materialMetadata(materialId);
  const materialBasePath = readingV2StoragePaths.readingPassageMaterials(materialId);
  const writes = [
    { path: `${metadataBasePath}/state`, value: 'archived' },
    { path: `${metadataBasePath}/archivedAt`, value: archivedAt },
    { path: `${metadataBasePath}/archivedBy`, value: input.actorUserId },
    { path: `${metadataBasePath}/updatedAt`, value: archivedAt },
    { path: `${materialBasePath}/state`, value: 'archived' },
    { path: `${materialBasePath}/archivedAt`, value: archivedAt },
    { path: `${materialBasePath}/archivedBy`, value: input.actorUserId },
    { path: `${materialBasePath}/updatedAt`, value: archivedAt },
    {
      path: getReadingV2ArchiveIndexPath(input.passage.ownerId, materialId),
      value: buildArchiveIndexRow({
        passage: input.passage,
        archivedAt,
        archivedBy: input.actorUserId,
        usageSummary: input.usageSummary,
      }),
    },
  ];

  const cleanupWrites = preflight.alreadyArchived
    ? []
    : listMaterialCatalogIndexPaths(toIndexSummary(input.passage))
      .map((path) => ({ path, value: null }));
  const legacyTestBridgeCleanupWrite = { path: `tests/${materialId}`, value: null };
  const duplicateIndexWrite = await buildDuplicateIndexStateWrite({
    read,
    ownerId: input.passage.ownerId,
    materialId,
    state: 'archived',
    updatedAt: archivedAt,
  });
  const auditWrite = buildAuditWrite(input, 'reading_passage_archived', archivedAt, {
    state: 'archived',
    archivedAt,
  });
  const updatePayload = toUpdatePayload([
    ...writes,
    ...cleanupWrites,
    legacyTestBridgeCleanupWrite,
    ...(duplicateIndexWrite ? [duplicateIndexWrite] : []),
    auditWrite,
  ]);
  Object.assign(
    updatePayload,
    buildMaterialSummaryUpdatePayload(
      toUniversalSummary(input.passage, 'archived', archivedAt),
      toUniversalSummary(input.passage, 'active', input.passage.updatedAt),
    ),
  );

  await input.repository.update(updatePayload);

  return { changedPaths: Object.keys(updatePayload) };
};

const assertRestoreProjectionIsValid = async (
  input: ReadingV2PassageRestoreInput,
  currentVersionId: string,
  read: (path: string) => Promise<unknown>,
): Promise<void> => {
  const version = await read(
    readingV2StoragePaths.readingPassageMaterialVersions(input.passage.materialId, currentVersionId),
  );
  if (!version || typeof version !== 'object') {
    throw new Error('Reading Passage restore requires an existing current version.');
  }

  const projection = await read(
    readingV2StoragePaths.studentSafeTests(input.passage.materialId, currentVersionId),
  );
  if (!projection || typeof projection !== 'object') {
    throw new Error('Reading Passage restore requires an existing student-safe projection.');
  }
};

export const restoreReadingV2PassageMaterial = async (
  input: ReadingV2PassageRestoreInput,
): Promise<ReadingV2PassageArchiveResult> => {
  const materialId = input.passage.materialId.trim();
  const currentVersionId = currentVersionIdFor(input.passage);
  if (!materialId || !currentVersionId) {
    throw new Error('Reading Passage restore requires a material id and current version id.');
  }
  assertArchiveOwner({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ownerId: input.passage.ownerId,
  });
  const read = requireLifecycleRead(input.repository, 'restore');
  await assertRestoreProjectionIsValid(input, currentVersionId, read);

  const restoredAt = input.now ?? new Date().toISOString();
  const metadataBasePath = readingV2StoragePaths.materialMetadata(materialId);
  const materialBasePath = readingV2StoragePaths.readingPassageMaterials(materialId);
  const activeVisibility = materialVisibilityFor(input.restoreVisibility);
  const writes = [
    { path: `${metadataBasePath}/state`, value: 'published' },
    { path: `${metadataBasePath}/visibility`, value: metadataVisibilityFor(input.restoreVisibility) },
    { path: `${metadataBasePath}/restoredAt`, value: restoredAt },
    { path: `${metadataBasePath}/restoredBy`, value: input.actorUserId },
    { path: `${metadataBasePath}/updatedAt`, value: restoredAt },
    { path: `${materialBasePath}/state`, value: 'published' },
    { path: `${materialBasePath}/visibility`, value: activeVisibility },
    { path: `${materialBasePath}/restoredAt`, value: restoredAt },
    { path: `${materialBasePath}/restoredBy`, value: input.actorUserId },
    { path: `${materialBasePath}/updatedAt`, value: restoredAt },
    ...buildMaterialCatalogIndexWrites(toIndexSummary({
      ...input.passage,
      visibility: input.restoreVisibility,
      updatedAt: restoredAt,
    }, input.restoreVisibility)),
  ];

  const archivePath = getReadingV2ArchiveIndexPath(input.passage.ownerId, materialId);
  const archiveRemovalWrites = await buildExistingRemovalWrites(read, [archivePath]);
  const duplicateIndexWrite = await buildDuplicateIndexStateWrite({
    read,
    ownerId: input.passage.ownerId,
    materialId,
    state: 'published',
    visibility: input.restoreVisibility,
    updatedAt: restoredAt,
  });
  const auditWrite = buildAuditWrite(
    input,
    'reading_passage_restored',
    restoredAt,
    { state: 'published', visibility: input.restoreVisibility, restoredAt },
  );
  const updatePayload = toUpdatePayload([
    ...writes,
    ...archiveRemovalWrites,
    ...(duplicateIndexWrite ? [duplicateIndexWrite] : []),
    auditWrite,
  ]);
  Object.assign(
    updatePayload,
    buildMaterialSummaryUpdatePayload(
      toUniversalSummary(
        input.passage,
        'active',
        restoredAt,
        input.restoreVisibility,
      ),
      toUniversalSummary(input.passage, 'archived', input.passage.updatedAt),
    ),
  );

  await input.repository.update(updatePayload);

  return { changedPaths: Object.keys(updatePayload) };
};

export const listArchivedReadingV2PassagesForOwner = async (input: {
  readonly ownerId: string;
  readonly reader: ReadingV2ArchivedPassageListReader;
}): Promise<readonly ReadingV2ArchiveIndexRow[]> =>
  (await input.reader.listArchiveRows(input.ownerId))
    .filter((row) => row.ownerId === input.ownerId)
    .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));

export const getReadingV2PassageUsageSummary = (input: {
  readonly masterRefCount?: number;
  readonly bookRefCount?: number;
  readonly activeHomeworkCount?: number;
}): ReadingV2PassageArchiveUsageSummary => {
  const usageCategories = [
    input.masterRefCount ? 'master' : null,
    input.bookRefCount ? 'book' : null,
    input.activeHomeworkCount ? 'homework' : null,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    usedElsewhere: usageCategories.length > 0,
    usageCategories,
  };
};

export const isArchiveIndexRow = (value: unknown): value is MaterialCatalogIndexRow & ReadingV2ArchiveIndexRow =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as ReadingV2ArchiveIndexRow).materialId === 'string' &&
  typeof (value as ReadingV2ArchiveIndexRow).ownerId === 'string' &&
  typeof (value as ReadingV2ArchiveIndexRow).archivedAt === 'string' &&
  typeof (value as ReadingV2ArchiveIndexRow).currentVersionId === 'string';
