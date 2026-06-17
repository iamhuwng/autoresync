import { beforeEach, describe, expect, it, vi } from 'vitest';
import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from './fixtures/readingV2ProjectionFixtures';
import {
  getReadingV2TeacherLobbyTests,
  mergeReadingV2TeacherLobbyTests,
} from './readingV2TeacherLobbyMaterials.service';

vi.mock('firebase/database', () => ({
  equalTo: vi.fn((value) => ({ type: 'equalTo', value })),
  get: vi.fn(),
  orderByChild: vi.fn((child) => ({ type: 'orderByChild', child })),
  query: vi.fn((target, ...constraints) => ({
    path: typeof target === 'string' ? target : target.path,
    constraints,
  })),
  ref: vi.fn((_database, path) => path),
}));

vi.mock('../firebase', () => ({
  database: {},
}));

describe('readingV2TeacherLobbyMaterials.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates teacher-owned Reading V2 lobby index rows into Teacher Lobby test cards', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;

    vi.mocked(get).mockImplementation(async (target: any) => {
      const path = typeof target === 'string' ? target : target.path;
      const valueByPath: Record<string, unknown> = {
        'reading_v2/relationship_indexes/teacher-lobby/': {
          'material-v2': {
            surface: 'teacher-lobby',
            materialId: 'material-v2',
            snapshotVersionId: projection.sourceSnapshotVersionId,
            source: 'published-metadata',
            ownerId: 'teacher-1',
            deliveryEngine: READING_V2_ENGINE,
          },
          'other-teacher-material': {
            surface: 'teacher-lobby',
            materialId: 'other-teacher-material',
            snapshotVersionId: 'snapshot-other',
            source: 'published-metadata',
            ownerId: 'teacher-2',
            deliveryEngine: READING_V2_ENGINE,
          },
        },
        'reading_v2/material_metadata/material-v2': {
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          compositionId: 'composition-material-v2-snapshot-v2',
          deliveryEngine: READING_V2_ENGINE,
          productLabel: 'Reading V2',
          title: 'Published Reading V2',
          materialKind: 'full-test',
          durationMinutes: 55,
          difficulty: 'intermediate',
          targetBand: '6.5',
          description: 'Teacher lobby material',
          tags: ['ielts'],
          visibility: 'private',
          publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
          updatedAt: '2026-01-01T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        [`reading_v2/projections/student_safe_tests/material-v2:${projection.sourceSnapshotVersionId}`]: projection,
      };
      const value = valueByPath[path];
      return {
        exists: () => value !== undefined && value !== null,
        val: () => value,
      } as any;
    });

    const materials = await getReadingV2TeacherLobbyTests('teacher-1');

    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({
      id: 'material-v2',
      materialId: 'material-v2',
      ownerId: 'teacher-1',
      deliveryEngine: READING_V2_ENGINE,
      title: 'Published Reading V2',
      testType: 'IELTS',
      skill: 'Reading',
      skillType: 'reading-v2',
      duration: 55,
      questionCount: 2,
      materialKind: 'full-test',
      compositionId: 'composition-material-v2-snapshot-v2',
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      passageRefCount: projection.content.sections.length,
      metadata: expect.objectContaining({
        hasStudentSafeProjection: true,
        deliveryProjectionReady: true,
        passageRefCount: projection.content.sections.length,
      }),
    });
    expect(ref).toHaveBeenCalledWith({}, 'reading_v2/relationship_indexes/teacher-lobby/');
    expect(orderByChild).toHaveBeenCalledWith('ownerId');
    expect(equalTo).toHaveBeenCalledWith('teacher-1');
    expect(query).toHaveBeenCalled();
  });

  it('treats canonical public metadata as public in Teacher Lobby cards', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;

    vi.mocked(get).mockImplementation(async (target: any) => {
      const path = typeof target === 'string' ? target : target.path;
      const valueByPath: Record<string, unknown> = {
        'reading_v2/relationship_indexes/teacher-lobby/': {
          'material-v2': {
            surface: 'teacher-lobby',
            materialId: 'material-v2',
            snapshotVersionId: projection.sourceSnapshotVersionId,
            source: 'published-metadata',
            ownerId: 'teacher-1',
            deliveryEngine: READING_V2_ENGINE,
          },
        },
        'reading_v2/material_metadata/material-v2': {
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          deliveryEngine: READING_V2_ENGINE,
          productLabel: 'Reading V2',
          title: 'Published Reading V2',
          materialKind: 'full-test',
          durationMinutes: 55,
          difficulty: 'intermediate',
          description: 'Teacher lobby material',
          tags: ['ielts'],
          visibility: 'public',
          publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
          updatedAt: '2026-01-01T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        [`reading_v2/projections/student_safe_tests/material-v2:${projection.sourceSnapshotVersionId}`]: projection,
      };
      const value = valueByPath[path];
      return {
        exists: () => value !== undefined && value !== null,
        val: () => value,
      } as any;
    });

    const materials = await getReadingV2TeacherLobbyTests('teacher-1');

    expect(materials).toHaveLength(1);
    expect(materials[0]?.isPublic).toBe(true);
    expect(materials[0]?.metadata.visibility).toBe('public');
  });

  it('does not request Reading V2 lobby rows without an owner id', async () => {
    const materials = await getReadingV2TeacherLobbyTests(undefined);

    expect(materials).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('dedupes Reading V2 rows when a legacy test already uses the same id', () => {
    const merged = mergeReadingV2TeacherLobbyTests(
      [{ id: 'material-v2', title: 'Legacy row' }],
      [{
        id: 'material-v2',
        materialId: 'material-v2',
        ownerId: 'teacher-1',
        deliveryEngine: READING_V2_ENGINE,
        title: 'Reading V2 row',
        testType: 'IELTS',
        type: 'IELTS',
        skill: 'Reading',
        skillType: 'reading-v2',
        duration: 60,
        questionCount: 2,
        isPublic: false,
        materialKind: 'full-test',
        productLabel: 'Reading V2',
        metadata: {
          title: 'Reading V2 row',
          duration: 60,
          tags: [],
          productLabel: 'Reading V2',
          materialKind: 'full-test',
          deliveryEngine: READING_V2_ENGINE,
        },
      }],
    );

    expect(merged).toEqual([{ id: 'material-v2', title: 'Legacy row' }]);
  });
});
