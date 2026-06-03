import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  buildBackfillSourcesFromFirebaseSnapshot,
  buildBackfillUpdatePayload,
  parseBackfillCliArgs,
} from '../../../scripts/reading-v2-full-test-passage-backfill';

const document = createReadingV2CanonicalFixture('sentence-completion');

const snapshot = {
  snapshotVersionId: 'snapshot-1',
  materialId: 'legacy-ready',
  ownerId: 'teacher-1',
  document,
  publishedAt: '2026-05-15T00:00:00.000Z',
  publishedBy: 'teacher-1',
};

describe('reading-v2-full-test-passage-backfill script helpers', () => {
  it('defaults to dry-run and requires --approved for write mode', () => {
    expect(parseBackfillCliArgs(['--owner', 'teacher-1', '--limit', '5'])).toMatchObject({
      dryRun: true,
      write: false,
      ownerId: 'teacher-1',
      limit: 5,
    });

    expect(() => parseBackfillCliArgs(['--write'])).toThrow(/--approved/i);

    expect(parseBackfillCliArgs(['--write', '--approved', 'lead-1'])).toMatchObject({
      dryRun: false,
      write: true,
      approvedBy: 'lead-1',
    });
  });

  it('maps Firebase metadata and snapshots into filtered backfill sources with invalid-source skips', () => {
    const result = buildBackfillSourcesFromFirebaseSnapshot({
      materialMetadata: {
        'legacy-ready': {
          materialId: 'legacy-ready',
          ownerId: 'teacher-1',
          title: 'Legacy Ready',
          materialKind: 'full-test',
          state: 'published',
          visibility: 'library-eligible',
          publishedSnapshotVersionId: 'snapshot-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          durationMinutes: 60,
          primaryTestTypeId: 'ielts',
          testTypeIds: ['ielts'],
        },
        'missing-snapshot': {
          materialId: 'missing-snapshot',
          ownerId: 'teacher-1',
          title: 'Missing Snapshot',
          materialKind: 'full-test',
          state: 'published',
          visibility: 'private',
          publishedSnapshotVersionId: 'missing',
        },
      },
      publishedSnapshots: {
        'legacy-ready': {
          'snapshot-1': snapshot,
        },
      },
      fullTestCompositions: {
        'composition-existing': {
          deliveryEngine: 'reading-v2',
          plane: 'packaging',
          schemaVersion: 1,
          compositionId: 'composition-existing',
          testMaterialId: 'legacy-ready',
          title: 'Existing',
          testTypeIds: ['ielts'],
          skill: 'reading',
          passageRefs: [],
          questionCount: 0,
          visibility: 'private',
          ownerId: 'teacher-1',
          publishedVersionId: 'snapshot-1',
          createdAt: '2026-05-15T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
        },
      },
    }, {
      ownerId: 'teacher-1',
      createdFrom: '2026-05-01T00:00:00.000Z',
      createdTo: '2026-06-01T00:00:00.000Z',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      materialId: 'legacy-ready',
      sourceSnapshotVersionId: 'snapshot-1',
      visibility: 'public',
      publicShareable: false,
    });
    expect(result.skippedMaterials).toEqual([
      expect.objectContaining({
        materialId: 'missing-snapshot',
        reason: 'invalid-source',
      }),
    ]);
  });

  it('builds a root RTDB update payload from service write plans', () => {
    expect(
      buildBackfillUpdatePayload([
        {
          path: 'reading_v2/reading_passage_materials/passage-1',
          value: { title: 'Passage 1' },
          writeKind: 'reading-passage-material',
          idempotencyKey: 'material:snapshot',
        },
        {
          path: 'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
          value: { title: 'Passage 1' },
          writeKind: 'reading-passage-listing-index',
          idempotencyKey: 'material:snapshot',
        },
      ]),
    ).toEqual({
      'reading_v2/reading_passage_materials/passage-1': { title: 'Passage 1' },
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': { title: 'Passage 1' },
    });
  });
});
