import { describe, expect, it, vi } from 'vitest';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  archiveReadingV2PassageMaterial,
  getReadingV2ArchiveIndexPath,
  listArchivedReadingV2PassagesForOwner,
  restoreReadingV2PassageMaterial,
} from './readingV2PassageArchive.service';
import { getReadingV2DuplicateIndexPath } from './readingV2PassageDuplicateGuard.service';

const passage = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'passage-1',
  ownerId: 'teacher-1',
  title: 'Academic Reading Test 1 - Passage 2',
  visibility: 'private',
  materialKind: 'reading-passage',
  testTypeIds: ['ielts'],
  sourceFullTestId: 'full-test-1',
  updatedAt: '2026-06-01T00:00:00.000Z',
  currentVersionId: 'snapshot-1',
  publishedSnapshotVersionId: 'snapshot-1',
  questionCount: 13,
  ...overrides,
});

const activeIndexPaths = [
  'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
  'material_catalog/material_indexes/by_visibility/private/passage-1',
  'material_catalog/material_indexes/by_material_kind/reading-passage/passage-1',
  'material_catalog/material_indexes/by_test_type/ielts/passage-1',
  'material_catalog/material_indexes/by_source_full_test/full-test-1/passage-1',
] as const;

const activeIndexReadMap = (): Record<string, unknown> =>
  Object.fromEntries(activeIndexPaths.map((path) => [
    path,
    {
      materialId: 'passage-1',
      ownerId: 'teacher-1',
      title: 'Academic Reading Test 1 - Passage 2',
      visibility: 'private',
      materialKind: 'reading-passage',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ]));

const duplicateIndexPath = getReadingV2DuplicateIndexPath('teacher-1', 'passage-1');

const duplicateIndexRow = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  ownerId: 'teacher-1',
  passageMaterialId: 'passage-1',
  currentVersionId: 'snapshot-1',
  title: 'Academic Reading Test 1 - Passage 2',
  state: 'published',
  visibility: 'private',
  source: { sourceFullTestId: 'full-test-1' },
  testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
  questionCount: 13,
  updatedAt: '2026-06-01T00:00:00.000Z',
  bodyShingleSize: 5,
  questionShingleSize: 3,
  bodyShingleHashes: ['a'.repeat(64)],
  questionShingleHashes: ['b'.repeat(64)],
  ...overrides,
});

const lifecyclePreflightReadMap = (state: 'published' | 'archived' = 'published') => ({
  [readingV2StoragePaths.materialMetadata('passage-1')]: {
    materialId: 'passage-1',
    ownerId: 'teacher-1',
    state,
  },
  [readingV2StoragePaths.readingPassageMaterials('passage-1')]: {
    passageMaterialId: 'passage-1',
    ownerId: 'teacher-1',
    state,
  },
});

const repository = (readMap: Record<string, unknown> = {}) => {
  const writes: Array<{ path: string; value: unknown }> = [];
  const removes: string[] = [];
  const updates: Record<string, unknown>[] = [];

  return {
    writes,
    removes,
    updates,
    adapter: {
      read: vi.fn(async (path: string) => readMap[path] ?? null),
      write: vi.fn(async (path: string, value: unknown) => {
        writes.push({ path, value });
      }),
      remove: vi.fn(async (path: string) => {
        removes.push(path);
      }),
      update: vi.fn(async (payload: Record<string, unknown>) => {
        updates.push(payload);
      }),
    },
  };
};

describe('readingV2PassageArchive.service', () => {
  it('archives with one atomic update that includes the append-only audit event', async () => {
    const repo = repository(lifecyclePreflightReadMap());

    await archiveReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage(),
      repository: repo.adapter,
      now: '2026-06-02T00:00:00.000Z',
      correlationId: 'corr-archive-atomic',
      sourceFeatureId: 'teacher_materials_reading_passage_archive',
      sourceRoute: '/lobby',
      usageSummary: {
        usedElsewhere: true,
        usageCategories: ['master'],
      },
    });

    expect(repo.adapter.update).toHaveBeenCalledTimes(1);
    expect(repo.adapter.write).not.toHaveBeenCalled();
    expect(repo.adapter.remove).not.toHaveBeenCalled();
    expect(repo.updates[0]).toEqual(expect.objectContaining({
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/state`]: 'archived',
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: expect.objectContaining({
        materialId: 'passage-1',
        archivedAt: '2026-06-02T00:00:00.000Z',
      }),
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': null,
    }));
    expect(Object.keys(repo.updates[0] ?? {})).toEqual(expect.arrayContaining([
      expect.stringMatching(/^reading_v2\/audit_events\/corr-archive-atomic:reading_passage_archived:passage-1:/),
    ]));
  });

  it('archives owned passages, writes a lightweight archive index, audits, and preserves immutable snapshots', async () => {
    const repo = repository({
      ...lifecyclePreflightReadMap(),
      [duplicateIndexPath]: duplicateIndexRow(),
    });

    const result = await archiveReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage(),
      repository: repo.adapter,
      now: '2026-06-02T00:00:00.000Z',
      correlationId: 'corr-archive-1',
      sourceFeatureId: 'teacher_materials_reading_passage_archive',
      sourceRoute: '/lobby',
      usageSummary: {
        usedElsewhere: true,
        usageCategories: ['master', 'book'],
      },
    });

    expect(repo.adapter.update).toHaveBeenCalledTimes(1);
    expect(repo.updates[0]).toEqual(expect.objectContaining({
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/state`]: 'archived',
      [`${readingV2StoragePaths.readingPassageMaterials('passage-1')}/state`]: 'archived',
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: expect.objectContaining({
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        title: 'Academic Reading Test 1 - Passage 2',
        currentVersionId: 'snapshot-1',
        questionCount: 13,
        archivedAt: '2026-06-02T00:00:00.000Z',
        hasBrokenRefs: true,
      }),
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': null,
      'material_catalog/material_indexes/by_visibility/private/passage-1': null,
      'material_catalog/material_indexes/by_material_kind/reading-passage/passage-1': null,
      'material_catalog/material_indexes/by_test_type/ielts/passage-1': null,
      'material_catalog/material_indexes/by_source_full_test/full-test-1/passage-1': null,
      [duplicateIndexPath]: expect.objectContaining({
        passageMaterialId: 'passage-1',
        state: 'archived',
        updatedAt: '2026-06-02T00:00:00.000Z',
      }),
    }));
    expect(Object.entries(repo.updates[0] ?? {})).toEqual(expect.arrayContaining([
      [
        expect.stringMatching(/^reading_v2\/audit_events\/corr-archive-1:reading_passage_archived:passage-1:/),
        expect.objectContaining({
          action: 'reading_passage_archived',
          entityType: 'reading-passage',
          entityId: 'passage-1',
          usedElsewhere: true,
          usageCategories: ['master', 'book'],
        }),
      ],
    ]));
    expect(Object.keys(repo.updates[0] ?? {}).some((path) =>
      path.includes('/published_snapshots/') || path.includes('/reading_passage_material_versions/'),
    )).toBe(false);
    expect(repo.writes).toEqual([]);
    expect(repo.removes).toEqual([]);
    expect(result.changedPaths).toEqual(expect.arrayContaining([
      getReadingV2ArchiveIndexPath('teacher-1', 'passage-1'),
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
    ]));
  });

  it('restores archived passages only when current version and projection are valid', async () => {
    const readMap = {
      [readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-1')]: {
        passageMaterialId: 'passage-1',
        currentSnapshotVersionId: 'snapshot-1',
        ownerId: 'teacher-1',
      },
      [readingV2StoragePaths.studentSafeTests('passage-1', 'snapshot-1')]: {
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
        sourceSnapshotVersionId: 'snapshot-1',
      },
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: {
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        title: 'Academic Reading Test 1 - Passage 2',
        visibility: 'private',
        archivedAt: '2026-06-02T00:00:00.000Z',
        archivedBy: 'teacher-1',
        currentVersionId: 'snapshot-1',
        questionCount: 13,
      },
      [duplicateIndexPath]: duplicateIndexRow({ state: 'archived' }),
    };
    const repo = repository(readMap);

    await restoreReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage({ archivedAt: '2026-06-02T00:00:00.000Z' }),
      restoreVisibility: 'public',
      repository: repo.adapter,
      now: '2026-06-03T00:00:00.000Z',
      correlationId: 'corr-restore-1',
      sourceFeatureId: 'teacher_materials_reading_passage_restore',
      sourceRoute: '/lobby',
    });

    expect(repo.adapter.update).toHaveBeenCalledTimes(1);
    expect(repo.updates[0]).toEqual(expect.objectContaining({
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/state`]: 'published',
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/visibility`]: 'library-eligible',
      'material_catalog/material_indexes/by_visibility/public/passage-1': expect.objectContaining({
        materialId: 'passage-1',
        visibility: 'public',
      }),
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: null,
      [duplicateIndexPath]: expect.objectContaining({
        passageMaterialId: 'passage-1',
        state: 'published',
        visibility: 'public',
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    }));
    expect(Object.entries(repo.updates[0] ?? {})).toEqual(expect.arrayContaining([
      [
        expect.stringMatching(/^reading_v2\/audit_events\/corr-restore-1:reading_passage_restored:passage-1:/),
        expect.objectContaining({
          action: 'reading_passage_restored',
        }),
      ],
    ]));
    expect(repo.writes).toEqual([]);
    expect(repo.removes).toEqual([]);
  });

  it('skips missing active-index and duplicate-index cleanup writes on archive retry preflight', async () => {
    const repo = repository({
      ...lifecyclePreflightReadMap('archived'),
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: {
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        title: 'Academic Reading Test 1 - Passage 2',
        visibility: 'private',
        archivedAt: '2026-06-02T00:00:00.000Z',
        archivedBy: 'teacher-1',
        currentVersionId: 'snapshot-1',
        questionCount: 13,
      },
    });

    await archiveReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage(),
      repository: repo.adapter,
      now: '2026-06-02T00:00:00.000Z',
      correlationId: 'corr-archive-retry',
      sourceFeatureId: 'teacher_materials_reading_passage_archive',
      sourceRoute: '/lobby',
      usageSummary: {
        usedElsewhere: false,
        usageCategories: [],
      },
    });

    activeIndexPaths.forEach((path) => {
      expect(repo.updates[0]).not.toHaveProperty(path);
    });
    expect(repo.updates[0]).not.toHaveProperty(duplicateIndexPath);
    expect(repo.updates[0]).toEqual(expect.objectContaining({
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/state`]: 'archived',
      [getReadingV2ArchiveIndexPath('teacher-1', 'passage-1')]: expect.objectContaining({
        materialId: 'passage-1',
      }),
    }));
  });

  it('skips missing archive-index delete on restore retry preflight', async () => {
    const repo = repository({
      [readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-1')]: {
        passageMaterialId: 'passage-1',
        currentSnapshotVersionId: 'snapshot-1',
        ownerId: 'teacher-1',
      },
      [readingV2StoragePaths.studentSafeTests('passage-1', 'snapshot-1')]: {
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
        sourceSnapshotVersionId: 'snapshot-1',
      },
    });

    await restoreReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage({ archivedAt: '2026-06-02T00:00:00.000Z' }),
      restoreVisibility: 'private',
      repository: repo.adapter,
      now: '2026-06-03T00:00:00.000Z',
      correlationId: 'corr-restore-retry',
      sourceFeatureId: 'teacher_materials_reading_passage_restore',
      sourceRoute: '/lobby',
    });

    expect(repo.updates[0]).not.toHaveProperty(getReadingV2ArchiveIndexPath('teacher-1', 'passage-1'));
    expect(repo.updates[0]).not.toHaveProperty(duplicateIndexPath);
    expect(repo.updates[0]).toEqual(expect.objectContaining({
      [`${readingV2StoragePaths.materialMetadata('passage-1')}/state`]: 'published',
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': expect.objectContaining({
        materialId: 'passage-1',
      }),
    }));
  });

  it('rejects restore when current projection is missing and rejects non-owner actions', async () => {
    const repo = repository({
      [readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-1')]: {
        passageMaterialId: 'passage-1',
        currentSnapshotVersionId: 'snapshot-1',
        ownerId: 'teacher-1',
      },
    });

    await expect(restoreReadingV2PassageMaterial({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      passage: passage(),
      restoreVisibility: 'private',
      repository: repo.adapter,
      correlationId: 'corr-restore-2',
      sourceFeatureId: 'teacher_materials_reading_passage_restore',
      sourceRoute: '/lobby',
    })).rejects.toThrow(/student-safe projection/);

    await expect(archiveReadingV2PassageMaterial({
      actorUserId: 'teacher-2',
      actorRole: 'teacher',
      passage: passage(),
      repository: repo.adapter,
      correlationId: 'corr-archive-2',
      sourceFeatureId: 'teacher_materials_reading_passage_archive',
      sourceRoute: '/lobby',
    })).rejects.toThrow(/owner/);
  });

  it('lists archived passages from the owner-scoped archive index without canonical payloads', async () => {
    const rows = await listArchivedReadingV2PassagesForOwner({
      ownerId: 'teacher-1',
      reader: {
        listArchiveRows: vi.fn(async () => [
          {
            materialId: 'passage-1',
            ownerId: 'teacher-1',
            title: 'Archived passage',
            source: 'Test 1',
            testType: 'IELTS',
            visibility: 'private',
            archivedAt: '2026-06-02T00:00:00.000Z',
            archivedBy: 'teacher-1',
            currentVersionId: 'snapshot-1',
            questionCount: 13,
            hasBrokenRefs: true,
          },
        ]),
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        hasBrokenRefs: true,
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('answerKey');
    expect(JSON.stringify(rows)).not.toContain('document');
  });
});
