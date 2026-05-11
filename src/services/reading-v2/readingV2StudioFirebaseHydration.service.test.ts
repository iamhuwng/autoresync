import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, ref } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { loadReadingV2PublishedRevisionSource } from './readingV2StudioFirebaseHydration.service';

vi.mock('firebase/database', () => ({
  get: vi.fn(),
  ref: vi.fn((_database, path) => path),
}));

vi.mock('../firebase', () => ({
  database: {},
}));

describe('readingV2StudioFirebaseHydration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads material metadata and the referenced canonical published snapshot', async () => {
    const document = {
      ...createReadingV2CanonicalFixture('sentence-completion'),
      title: 'Live published title',
    } as any;
    delete document.validationState;
    Object.values(document.taskGroups).forEach((taskGroup: any) => {
      delete taskGroup.optionSetRefs;
      delete taskGroup.validationState;
    });

    vi.mocked(get).mockImplementation(async (target: any) => {
      const valueByPath: Record<string, unknown> = {
        'reading_v2/material_metadata/material-v2': {
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          deliveryEngine: READING_V2_ENGINE,
          productLabel: 'Reading V2',
          title: 'Live published title',
          materialKind: 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          targetBand: 'Band 6-7',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-live',
          updatedAt: '2026-04-29T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        'reading_v2/published_snapshots/material-v2/snapshot-live': {
          snapshotVersionId: 'snapshot-live',
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'teacher-1',
        },
      };
      const value = valueByPath[target];

      return {
        exists: () => value !== undefined,
        val: () => value,
      } as any;
    });

    const source = await loadReadingV2PublishedRevisionSource('material-v2');

    expect(source.status).toBe('loaded');
    expect(source.snapshot?.document.title).toBe('Live published title');
    expect(source.snapshot?.document.validationState.issues).toEqual([]);
    expect(Object.values(source.snapshot?.document.taskGroups ?? {})[0]?.optionSetRefs).toEqual([]);
    expect(ref).toHaveBeenCalledWith({}, 'reading_v2/material_metadata/material-v2');
    expect(ref).toHaveBeenCalledWith({}, 'reading_v2/published_snapshots/material-v2/snapshot-live');
  });

  it('fails closed when metadata does not point to a published snapshot version', async () => {
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        materialId: 'material-v2',
        ownerId: 'teacher-1',
        title: 'Missing version',
      }),
    } as any);

    const source = await loadReadingV2PublishedRevisionSource('material-v2');

    expect(source.status).toBe('missing-snapshot-version');
  });
});
