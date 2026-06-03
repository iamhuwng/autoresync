import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, ref } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  archiveReadingV2PassageMaterial,
  createReadingV2PassageLibraryFirebaseReader,
  listTeacherReadingPassages,
  type ReadingV2PassageLibraryReader,
} from './readingV2PassageLibrary.service';

const firebaseDatabaseMocks = vi.hoisted(() => ({
  get: vi.fn(),
  ref: vi.fn((_database: unknown, path: string) => path),
}));

vi.mock('firebase/database', () => firebaseDatabaseMocks);
vi.mock('../firebase', () => ({
  database: {},
}));

const metadata = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'passage-1',
  ownerId: 'teacher-1',
  deliveryEngine: READING_V2_ENGINE,
  productLabel: 'Reading V2',
  title: 'Academic Reading Test 1 - Passage 2',
  materialKind: 'reading-passage',
  durationMinutes: 20,
  difficulty: 'intermediate',
  description: 'Teacher-owned Reading Passage summary.',
  tags: ['academic', 'environment'],
  visibility: 'private',
  primaryTestTypeId: 'ielts',
  primaryTestTypeState: 'active',
  testTypeIds: ['ielts'],
  sourceFullTestId: 'full-test-1',
  sourceSnapshotVersionId: 'snapshot-1',
  sourceOrderDisplaySnapshot: 'Passage 2',
  sourceQuestionRange: '14-26',
  sourceTitleSnapshot: 'Academic Reading Test 1',
  publishedSnapshotVersionId: 'snapshot-1',
  updatedAt: '2026-06-01T00:00:00.000Z',
  relationshipSurfaces: ['teacher-lobby', 'assignment-picker'],
  ...overrides,
});

const projection = (questionCount = 2) => ({
  projectionKind: 'student-safe',
  sourceSnapshotVersionId: 'snapshot-1',
  content: {
    taskGroups: [
      {
        interactions: Array.from({ length: questionCount }, (_unused, index) => ({
          interactionId: `interaction-${index + 1}`,
        })),
      },
    ],
  },
});

const indexRow = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'passage-1',
  ownerId: 'teacher-1',
  title: 'Academic Reading Test 1 - Passage 2',
  visibility: 'private',
  materialKind: 'reading-passage',
  testTypeIds: ['ielts'],
  testTypeMembership: { ielts: true },
  sourceFullTestId: 'full-test-1',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const reader = (overrides: Partial<ReadingV2PassageLibraryReader> = {}): ReadingV2PassageLibraryReader => ({
  listIndexRows: vi.fn(async () => [indexRow() as any]),
  readMetadata: vi.fn(async () => metadata() as any),
  readStudentSafeProjection: vi.fn(async () => projection(13) as any),
  readCanonicalMaterial: vi.fn(async () => {
    throw new Error('canonical read should not happen');
  }),
  ...overrides,
});

const snapshot = (value: unknown) => ({
  exists: () => value !== undefined && value !== null,
  val: () => value,
});

describe('readingV2PassageLibrary.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists teacher-owned private Reading Passages from indexes, metadata, and student-safe projection', async () => {
    const testReader = reader();

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      reader: testReader,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(testReader.listIndexRows).toHaveBeenCalledWith({
      scope: 'private',
      teacherId: 'teacher-1',
    });
    expect(testReader.readCanonicalMaterial).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'passage-1',
      materialId: 'passage-1',
      ownerId: 'teacher-1',
      title: 'Academic Reading Test 1 - Passage 2',
      materialKind: 'reading-passage',
      questionCount: 13,
      duration: 20,
      visibility: 'private',
      sourceOrderDisplay: 'Passage 2',
      sourceQuestionRange: '14-26',
      sourceFullTestTitle: 'Academic Reading Test 1',
      hasStudentSafeProjection: true,
      isOwner: true,
      selectable: true,
    });
    expect(rows[0]?.testTypes).toEqual([
      {
        testTypeId: 'ielts',
        label: 'IELTS',
        shortLabel: 'IELTS',
        active: true,
      },
    ]);
    expect(rows[0]?.actions.map((action) => action.key)).toEqual([
      'open',
      'assign-homework',
      'revise',
      'archive',
    ]);
  });

  it('lists public/library-eligible Reading Passages without mixing them into top-level Public Library semantics', async () => {
    const testReader = reader({
      listIndexRows: vi.fn(async () => [
        indexRow({
          materialId: 'public-passage',
          ownerId: 'teacher-2',
          visibility: 'public',
          testTypeIds: ['toeic'],
          testTypeMembership: { toeic: true },
        }) as any,
      ]),
      readMetadata: vi.fn(async () =>
        metadata({
          materialId: 'public-passage',
          ownerId: 'teacher-2',
          visibility: 'library-eligible',
          primaryTestTypeId: 'toeic',
          testTypeIds: ['toeic'],
          sourceOrderDisplaySnapshot: 'Part 3',
        }) as any,
      ),
      readStudentSafeProjection: vi.fn(async () => projection(10) as any),
    });

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'public',
      reader: testReader,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(testReader.listIndexRows).toHaveBeenCalledWith({
      scope: 'public',
      teacherId: 'teacher-1',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      materialId: 'public-passage',
      scope: 'public',
      isOwner: false,
      sourceOrderDisplay: 'Part 3',
      visibility: 'public',
    });
    expect(rows[0]?.actions.map((action) => action.key)).toEqual([
      'view',
      'assign-homework',
    ]);
  });

  it('combines search and active Test Type filter with AND semantics over summary fields only', async () => {
    const testReader = reader({
      listIndexRows: vi.fn(async () => [
        indexRow({ materialId: 'passage-ielts', title: 'Environment passage', testTypeIds: ['ielts'] }) as any,
        indexRow({ materialId: 'passage-toeic', title: 'Business passage', testTypeIds: ['toeic'] }) as any,
      ]),
      readMetadata: vi.fn(async (materialId) =>
        materialId === 'passage-ielts'
          ? metadata({
              materialId,
              title: 'Environment passage',
              tags: ['nature'],
              sourceTitleSnapshot: 'Academic Reading Test 1',
              sourceOrderDisplaySnapshot: 'Passage 2',
              testTypeIds: ['ielts'],
            }) as any
          : metadata({
              materialId,
              title: 'Business passage',
              tags: ['office'],
              sourceTitleSnapshot: 'TOEIC Practice',
              sourceOrderDisplaySnapshot: 'Part 3',
              primaryTestTypeId: 'toeic',
              testTypeIds: ['toeic'],
            }) as any,
      ),
      readStudentSafeProjection: vi.fn(async () => projection(2) as any),
    });

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      searchTerm: 'passage 2',
      testTypeId: materialCatalogIds.testTypeId('ielts'),
      reader: testReader,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(rows.map((row) => row.materialId)).toEqual(['passage-ielts']);
  });

  it('renders inactive Test Type metadata without dropping the row', async () => {
    const testReader = reader({
      readMetadata: vi.fn(async () =>
        metadata({
          primaryTestTypeId: 'thcs',
          primaryTestTypeState: 'inactive',
          testTypeIds: ['thcs'],
          sourceOrderDisplaySnapshot: 'Section unknown',
        }) as any,
      ),
    });
    const inactiveThcs = DEFAULT_MATERIAL_TEST_TYPES.map((config) =>
      config.testTypeId === 'thcs' ? { ...config, active: false } : config,
    );

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      reader: testReader,
      testTypeConfigs: inactiveThcs,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.testTypes).toEqual([
      {
        testTypeId: 'thcs',
        label: 'THCS',
        shortLabel: 'THCS',
        active: false,
      },
    ]);
    expect(rows[0]?.sourceOrderDisplay).toBe('Section unknown');
  });

  it('excludes full tests and non-Reading-Passage metadata from the dedicated Reading Passage list', async () => {
    const testReader = reader({
      listIndexRows: vi.fn(async () => [
        indexRow({ materialId: 'passage-1', materialKind: 'reading-passage' }) as any,
        indexRow({ materialId: 'full-test-1', materialKind: 'full-test' }) as any,
      ]),
      readMetadata: vi.fn(async (materialId) =>
        metadata({
          materialId,
          materialKind: materialId === 'full-test-1' ? 'full-test' : 'reading-passage',
        }) as any,
      ),
    });

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      reader: testReader,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(rows.map((row) => row.materialId)).toEqual(['passage-1']);
  });

  it('does not load canonical content for list rows', async () => {
    const canonicalRead = vi.fn(async () => {
      throw new Error('canonical read should not happen');
    });

    await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      reader: reader({ readCanonicalMaterial: canonicalRead }),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(canonicalRead).not.toHaveBeenCalled();
  });

  it('provides a Firebase reader that targets owner/visibility indexes and safe Reading V2 paths', async () => {
    const valueByPath: Record<string, unknown> = {
      'material_catalog/material_indexes/by_owner/teacher-1': {
        'passage-1': indexRow(),
      },
      [readingV2StoragePaths.materialMetadata('passage-1')]: metadata(),
      [readingV2StoragePaths.studentSafeTests('passage-1', 'snapshot-1')]: projection(5),
    };
    vi.mocked(get).mockImplementation(async (target: any) =>
      snapshot(valueByPath[typeof target === 'string' ? target : target.path]) as any,
    );

    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1',
      scope: 'private',
      reader: createReadingV2PassageLibraryFirebaseReader({} as any),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(ref).toHaveBeenCalledWith({}, 'material_catalog/material_indexes/by_owner/teacher-1');
    expect(ref).toHaveBeenCalledWith({}, readingV2StoragePaths.materialMetadata('passage-1'));
    expect(ref).toHaveBeenCalledWith({}, readingV2StoragePaths.studentSafeTests('passage-1', 'snapshot-1'));
    expect(rows[0]?.questionCount).toBe(5);
  });

  it('archives a Reading Passage and removes all canonical material index rows', async () => {
    const writes: Array<{ path: string; value: unknown }> = [];
    const removes: string[] = [];

    await archiveReadingV2PassageMaterial({
      teacherId: 'teacher-1',
      passage: {
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        title: 'Academic Reading Test 1 - Passage 2',
        visibility: 'private',
        materialKind: 'reading-passage',
        testTypeIds: ['ielts'],
        sourceFullTestId: 'full-test-1',
        updatedAt: '2026-06-01T00:00:00.000Z',
        publishedSnapshotVersionId: 'snapshot-1',
      },
      repository: {
        write: async (path, value) => {
          writes.push({ path, value });
        },
        remove: async (path) => {
          removes.push(path);
        },
      },
      now: '2026-06-02T00:00:00.000Z',
    });

    expect(writes).toEqual(expect.arrayContaining([
      {
        path: `${readingV2StoragePaths.materialMetadata('passage-1')}/state`,
        value: 'archived',
      },
      {
        path: `${readingV2StoragePaths.materialMetadata('passage-1')}/archivedAt`,
        value: '2026-06-02T00:00:00.000Z',
      },
      {
        path: `${readingV2StoragePaths.readingPassageMaterials('passage-1')}/state`,
        value: 'archived',
      },
      {
        path: `${readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-1')}/state`,
        value: 'archived',
      },
    ]));
    expect(removes).toEqual(expect.arrayContaining([
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
      'material_catalog/material_indexes/by_visibility/private/passage-1',
      'material_catalog/material_indexes/by_material_kind/reading-passage/passage-1',
      'material_catalog/material_indexes/by_test_type/ielts/passage-1',
      'material_catalog/material_indexes/by_source_full_test/full-test-1/passage-1',
    ]));
  });
});
