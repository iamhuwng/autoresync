import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  describeBackfillMutationError,
  buildBackfillWritePayloadFromReviewedReport,
  buildBackfillSourcesFromFirebaseSnapshot,
  buildBackfillUpdatePayload,
  normalizeFirebaseDatabasePath,
  parseBackfillCliArgs,
} from '../../../scripts/reading-v2-full-test-passage-backfill';
import { planReadingV2FullTestPassageBackfill } from './readingV2Backfill.service';
import { ReadingV2PublishGateError } from './readingV2Validation.service';

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
    expect(() => parseBackfillCliArgs(['--write', '--approved', 'lead-1'])).toThrow(/from-report/i);

    expect(parseBackfillCliArgs(['--write', '--approved', 'lead-1', '--from-report', 'dry-run.json'])).toMatchObject({
      dryRun: false,
      write: true,
      approvedBy: 'lead-1',
      fromReportPath: 'dry-run.json',
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
      studentSafeProjections: {
        'legacy-ready:snapshot-1': {
          deliveryEngine: 'reading-v2',
          plane: 'projection',
          schemaVersion: 1,
          projectionId: 'student-safe:legacy-ready:snapshot-1',
          projectionKind: 'student-safe',
          ownerId: 'teacher-1',
          sourceSnapshotVersionId: 'snapshot-1',
          sourceDocumentId: document.documentId,
          generatedAt: '2026-05-15T00:00:00.000Z',
          materialId: 'legacy-ready',
          content: {
            title: document.title,
            materialId: 'legacy-ready',
            sections: [],
            stimuli: [],
            anchors: [],
            taskGroups: [],
            optionSets: [],
          },
        },
      },
      reviewProjections: {
        'legacy-ready:snapshot-1': {
          deliveryEngine: 'reading-v2',
          plane: 'projection',
          schemaVersion: 1,
          projectionId: 'review:legacy-ready:snapshot-1',
          projectionKind: 'review',
          ownerId: 'teacher-1',
          sourceSnapshotVersionId: 'snapshot-1',
          sourceDocumentId: document.documentId,
          generatedAt: '2026-05-15T00:00:00.000Z',
          materialId: 'legacy-ready',
          content: {
            title: document.title,
            materialId: 'legacy-ready',
            sections: [],
            stimuli: [],
            anchors: [],
            taskGroups: [],
            optionSets: [],
          },
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
    expect(result.sources[0].studentSafeProjection?.projectionKind).toBe('student-safe');
    expect(result.sources[0].reviewProjection?.projectionKind).toBe('review');
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

  it('normalizes Firebase CLI database paths with a leading slash', () => {
    expect(normalizeFirebaseDatabasePath('reading_v2/material_metadata')).toBe('/reading_v2/material_metadata');
    expect(normalizeFirebaseDatabasePath('/reading_v2/published_snapshots')).toBe('/reading_v2/published_snapshots');
    expect(normalizeFirebaseDatabasePath('/')).toBe('/');
  });

  it('serializes publish-gate errors with blocking issue details for failed write reports', () => {
    const details = describeBackfillMutationError(new ReadingV2PublishGateError({
      issues: [
        {
          code: 'missing-scoring-response-shape',
          severity: 'error',
          message: 'Interaction q1 needs a visible blank marker.',
          objectId: 'q1',
        },
      ],
      blockingIssues: [
        {
          code: 'missing-scoring-response-shape',
          severity: 'error',
          message: 'Interaction q1 needs a visible blank marker.',
          objectId: 'q1',
        },
      ],
      warningIssues: [],
      informationalIssues: [],
      canPublish: false,
    }));

    expect(details).toEqual({
      error: 'Reading V2 publish is blocked by validation errors.',
      blockingIssues: [
        {
          code: 'missing-scoring-response-shape',
          message: 'Interaction q1 needs a visible blank marker.',
          objectId: 'q1',
          severity: 'error',
        },
      ],
    });
  });

  it('binds write mode to a reviewed dry-run report and aborts mismatches/read failures', () => {
    const { sources } = buildBackfillSourcesFromFirebaseSnapshot({
      materialMetadata: {
        'legacy-ready': {
          materialId: 'legacy-ready',
          ownerId: 'teacher-1',
          title: 'Legacy Ready',
          materialKind: 'full-test',
          state: 'published',
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          durationMinutes: 60,
          primaryTestTypeId: 'ielts',
          testTypeIds: ['ielts'],
        },
      },
      publishedSnapshots: {
        'legacy-ready': {
          'snapshot-1': snapshot,
        },
      },
      fullTestCompositions: {},
    }, {});
    const currentReport = planReadingV2FullTestPassageBackfill({
      fullTests: sources,
      now: '2026-06-04T00:00:00.000Z',
    });
    const reviewedReport = {
      ...currentReport,
      projectId: 'temp-a1437',
      mutation: { status: 'not-run' },
    };

    expect(() => buildBackfillWritePayloadFromReviewedReport({
      options: parseBackfillCliArgs([
        '--write',
        '--approved',
        'lead-1',
        '--from-report',
        'dry-run.json',
        '--project',
        'temp-a1437',
      ]),
      currentReport,
      readFailures: [{ path: 'reading_v2/material_metadata', error: 'permission denied' }],
      reviewedReport,
    })).toThrow(/read/i);

    expect(() => buildBackfillWritePayloadFromReviewedReport({
      options: parseBackfillCliArgs([
        '--write',
        '--approved',
        'lead-1',
        '--from-report',
        'dry-run.json',
        '--project',
        'other-project',
      ]),
      currentReport,
      readFailures: [],
      reviewedReport,
    })).toThrow(/reviewed dry-run/i);

    const payload = buildBackfillWritePayloadFromReviewedReport({
      options: parseBackfillCliArgs([
        '--write',
        '--approved',
        'lead-1',
        '--from-report',
        'dry-run.json',
        '--project',
        'temp-a1437',
      ]),
      currentReport,
      readFailures: [],
      reviewedReport,
    });

    expect(Object.keys(payload)).toEqual(expect.arrayContaining([
      'reading_v2/reading_passage_materials/legacy-ready-passage-1',
      'reading_v2/full_test_compositions/composition-legacy-ready-snapshot-1',
      'reading_v2/full_test_composition_versions/composition-legacy-ready-snapshot-1/snapshot-1',
    ]));
  });
});
