import { describe, expect, it, vi } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2ReadingPassageMaterial,
} from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  createReadingV2FullTestPassageBackfillWritePlan,
  planReadingV2FullTestPassageBackfill,
  runReadingV2FullTestPassageBackfill,
} from './readingV2Backfill.service';

const NOW = '2026-06-01T00:00:00.000Z';
const IELTS = materialCatalogIds.testTypeId('ielts');

const legacyDocument = (title = 'Legacy Reading Full Test'): ReadingV2Document => {
  const document = createReadingV2CanonicalFixture('sentence-completion');
  const sectionId = document.sectionIds[0];

  return {
    ...document,
    title,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...document.sections[sectionId],
        title: 'Reading Passage 1',
      },
    },
    interactions: Object.fromEntries(
      Object.entries(document.interactions).map(([interactionId, interaction], index) => [
        interactionId,
        {
          ...interaction,
          reviewLabel: {
            displayNumber: index === 0 ? 1 : 13,
          },
        },
      ]),
    ),
  };
};

const ambiguousDocument = (): ReadingV2Document => {
  const document = legacyDocument('Ambiguous Legacy Full Test');
  const sectionId = document.sectionIds[0];
  const stimulus = Object.values(document.stimuli)[0];
  const secondStimulusId = readingV2Ids.stimulusId('extra-stimulus');

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...document.sections[sectionId],
        stimulusIds: [...document.sections[sectionId].stimulusIds, secondStimulusId],
      },
    },
    stimuli: {
      ...document.stimuli,
      [secondStimulusId]: {
        ...stimulus,
        stimulusId: secondStimulusId,
      },
    },
  };
};

const nativeComposition = (): ReadingV2FullTestComposition => ({
  deliveryEngine: 'reading-v2',
  plane: 'packaging',
  schemaVersion: 1,
  compositionId: readingV2Ids.fullTestCompositionId('composition-existing'),
  testMaterialId: readingV2Ids.materialId('already-composed'),
  title: 'Already Composed',
  testTypeIds: [IELTS],
  skill: 'reading',
  passageRefs: [
    {
      refId: readingV2Ids.passageRefId('existing-ref'),
      passageMaterialId: readingV2Ids.readingPassageMaterialId('existing-passage'),
      snapshotVersionId: readingV2Ids.snapshotVersionId('existing-snapshot'),
      order: 1,
      sourceOrderLabelSnapshot: 'Passage',
      sourceOrderDisplaySnapshot: 'Passage 1',
      titleSnapshot: 'Existing Passage',
      questionCountSnapshot: 13,
      testTypeIdsSnapshot: [IELTS],
    },
  ],
  questionCount: 13,
  visibility: 'private',
  ownerId: 'teacher-1',
  publishedVersionId: readingV2Ids.snapshotVersionId('existing-snapshot'),
  createdAt: NOW,
  updatedAt: NOW,
});

const fullTest = (materialId: string, overrides: Partial<Parameters<typeof planReadingV2FullTestPassageBackfill>[0]['fullTests'][number]> = {}) => ({
  materialId: readingV2Ids.materialId(materialId),
  ownerId: 'teacher-1',
  title: materialId,
  document: legacyDocument(materialId),
  sourceSnapshotVersionId: readingV2Ids.snapshotVersionId(`${materialId}-snapshot`),
  publishedBy: 'teacher-1',
  primaryTestTypeId: IELTS,
  testTypeIds: [IELTS],
  testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
  visibility: 'private' as const,
  publicShareable: false,
  ...overrides,
});

describe('readingV2Backfill.service', () => {
  it('dry-run reports split-ready, manual-review, and already-backfilled counts without writes', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('legacy-ready'),
        fullTest('legacy-manual', { document: ambiguousDocument() }),
        fullTest('already-composed', { existingComposition: nativeComposition() }),
      ],
      now: NOW,
    });

    expect(report.dryRun).toBe(true);
    expect(report.totals).toEqual({
      total: 3,
      splitReady: 1,
      manualReview: 1,
      alreadyBackfilled: 1,
    });
    expect(report.rows.map((row) => row.status)).toEqual([
      'split-ready',
      'manual-review',
      'already-backfilled',
    ]);
    expect(report.rows[1].issues.map((issue) => issue.code)).toContain('ambiguous-passage-boundary');
  });

  it('requires explicit lead approval before applying any backfill writes', async () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [fullTest('legacy-ready')],
      now: NOW,
    });
    const write = vi.fn();

    await expect(
      runReadingV2FullTestPassageBackfill({
        report,
        write,
      }),
    ).rejects.toThrow(/lead approval/i);

    expect(write).not.toHaveBeenCalled();

    const result = await runReadingV2FullTestPassageBackfill({
      report,
      approvedBy: 'lead-1',
      write,
    });

    expect(result.written).toBeGreaterThan(0);
    expect(write).toHaveBeenCalled();
  });

  it('builds deterministic idempotent write paths for the same source snapshot', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [fullTest('legacy-ready')],
      now: NOW,
    });
    const first = createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' });
    const second = createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' });
    const paths = first.map((write) => write.path);

    expect(paths).toEqual(second.map((write) => write.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('reading_v2/reading_passage_materials/legacy-ready-passage-1');
    expect(paths).toContain(
      'reading_v2/full_test_compositions/composition-legacy-ready-legacy-ready-snapshot',
    );
  });

  it('records source full-test id and snapshot version while keeping non-shareable public sources private', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('public-not-shareable', {
          sourceFullTestId: readingV2Ids.fullTestId('full-test-public'),
          visibility: 'public',
          publicShareable: false,
        }),
      ],
      now: NOW,
    });
    const writes = createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' });
    const materialWrite = writes.find((write) => write.writeKind === 'reading-passage-material');
    const compositionWrite = writes.find((write) => write.writeKind === 'full-test-composition');
    const material = materialWrite?.value as ReadingV2ReadingPassageMaterial;
    const composition = compositionWrite?.value as ReadingV2FullTestComposition;

    expect(report.rows[0].visibilityDowngradedToPrivate).toBe(true);
    expect(material.visibility).toBe('private');
    expect(material.sourceFullTestId).toBe('full-test-public');
    expect(material.sourceSnapshotVersionId).toBe('public-not-shareable-snapshot');
    expect(composition.publishedVersionId).toBe('public-not-shareable-snapshot');
  });
});
