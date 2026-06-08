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
import { generateReadingV2StudentSafeProjection } from './readingV2Projection.service';
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
  const anchorPairs = stimulus.anchorIds.map((anchorId, index) => [
    anchorId,
    readingV2Ids.anchorId(`extra-stimulus-anchor-${index + 1}`),
  ] as const);
  const anchorIdMap = new Map(anchorPairs);
  const remappedContent = stimulus.content.kind === 'passage-content'
    ? {
        ...stimulus.content,
        paragraphs: stimulus.content.paragraphs.map((paragraph) => ({
          ...paragraph,
          anchorId: paragraph.anchorId ? anchorIdMap.get(paragraph.anchorId) ?? paragraph.anchorId : undefined,
        })),
      }
    : stimulus.content;

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
        content: remappedContent,
        anchorIds: anchorPairs.map(([, newAnchorId]) => newAnchorId),
      },
    },
    anchors: {
      ...document.anchors,
      ...Object.fromEntries(anchorPairs.map(([originalAnchorId, newAnchorId]) => {
        const originalAnchor = document.anchors[originalAnchorId];
        return [
          newAnchorId,
          {
            ...originalAnchor,
            anchorId: newAnchorId,
            stimulusId: secondStimulusId,
          },
        ];
      })),
    },
  };
};

const missingVisibleCompletionPromptDocument = (): ReadingV2Document => {
  const document = legacyDocument('Missing Visible Completion Prompt');
  const taskGroups = Object.fromEntries(
    Object.entries(document.taskGroups).map(([taskGroupId, taskGroup]) => {
      const legacyTaskGroup = { ...taskGroup } as Partial<ReadingV2Document['taskGroups'][string]>;
      delete legacyTaskGroup.optionSetRefs;
      delete legacyTaskGroup.validationState;
      return [taskGroupId, legacyTaskGroup];
    }),
  ) as ReadingV2Document['taskGroups'];
  const interactions = Object.fromEntries(
    Object.entries(document.interactions).map(([interactionId, interaction]) => {
      const legacyInteraction = { ...interaction } as Partial<ReadingV2Document['interactions'][string]>;
      delete legacyInteraction.promptText;
      return [interactionId, legacyInteraction];
    }),
  ) as ReadingV2Document['interactions'];

  return {
    ...document,
    taskGroups,
    interactions,
  };
};

const duplicateStimulusRegistryDocument = (): ReadingV2Document => {
  const document = legacyDocument('Duplicate Stimulus Registry');
  const stimulus = Object.values(document.stimuli)[0];
  const anchorId = stimulus.anchorIds[0];

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        anchorIds: [...stimulus.anchorIds, anchorId],
      },
    },
  };
};

const duplicateVisibleNumberDocument = (): ReadingV2Document => {
  const document = legacyDocument('Duplicate Visible Number');
  const interactionEntries = Object.entries(document.interactions);
  const [firstInteractionId, firstInteraction] = interactionEntries[0];
  const [secondInteractionId, secondInteraction] = interactionEntries[1];

  return {
    ...document,
    interactions: {
      ...document.interactions,
      [firstInteractionId]: {
        ...firstInteraction,
        reviewLabel: { displayNumber: 9 },
      },
      [secondInteractionId]: {
        ...secondInteraction,
        reviewLabel: { displayNumber: 9 },
      },
    },
  };
};

const missingAnchorDocument = (): ReadingV2Document => {
  const document = legacyDocument('Missing Anchor');
  const stimulus = Object.values(document.stimuli)[0];
  const missingAnchorId = stimulus.anchorIds[0];
  const anchors = { ...document.anchors };
  delete anchors[missingAnchorId];

  return {
    ...document,
    anchors,
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

  it('routes extracted legacy passages that fail the publish gate to manual review without writes', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('legacy-publish-blocked', {
          document: missingVisibleCompletionPromptDocument(),
        }),
      ],
      now: NOW,
    });

    expect(report.totals).toEqual({
      total: 1,
      splitReady: 0,
      manualReview: 1,
      alreadyBackfilled: 0,
    });
    expect(report.rows[0]?.status).toBe('manual-review');
    expect(report.rows[0]?.canonicalSafety.classification).toBe('unsafe-to-write');
    expect(report.rows[0]?.issues.map((issue) => issue.code)).toContain('backfill-canonical-validation-blocked');
    expect(createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' })).toEqual([]);
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
      'reading_v2/published_snapshots/legacy-ready-passage-1/legacy-ready-snapshot',
    );
    expect(paths).toContain(
      'reading_v2/full_test_compositions/composition-legacy-ready-legacy-ready-snapshot',
    );

    const passageSnapshot = first.find((write) =>
      write.path === 'reading_v2/published_snapshots/legacy-ready-passage-1/legacy-ready-snapshot'
    );

    expect(passageSnapshot?.writeKind).toBe('reading-passage-published-snapshot');
    expect(JSON.stringify(passageSnapshot?.value)).toMatch(/acceptableAnswers|scoringRule/);
  });

  it('builds writes from reviewed JSON reports when extracted legacy task groups have no validation state', () => {
    const report = JSON.parse(JSON.stringify(planReadingV2FullTestPassageBackfill({
      fullTests: [fullTest('legacy-ready')],
      now: NOW,
    }))) as ReturnType<typeof planReadingV2FullTestPassageBackfill>;
    const splitReadyRow = report.rows.find((row) => row.status === 'split-ready');

    expect(splitReadyRow?.extraction).toBeDefined();

    splitReadyRow?.extraction?.passages.forEach((passage) => {
      Object.values(passage.document.taskGroups).forEach((taskGroup) => {
        delete (taskGroup as { validationState?: unknown }).validationState;
      });
    });

    expect(() =>
      createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' }),
    ).not.toThrow();
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

  it('classifies deterministic duplicate stimulus registries as auto-repairable before extraction writes', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('legacy-auto-repairable', {
          document: duplicateStimulusRegistryDocument(),
        }),
      ],
      now: NOW,
    });
    const row = report.rows[0];

    expect(row.status).toBe('split-ready');
    expect(row.canonicalSafety?.classification).toBe('auto-repairable');
    expect(row.canonicalSafety?.issues.map((issue) => issue.code)).toContain('duplicate-stimulus-anchor-id');

    const extractedStimulus = row.extraction?.passages[0]?.document.stimuli[
      Object.keys(row.extraction.passages[0].document.stimuli)[0]
    ];
    expect(extractedStimulus?.anchorIds).toEqual([...new Set(extractedStimulus?.anchorIds)]);

    const writes = createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' });
    expect(writes.length).toBeGreaterThan(0);
  });

  it('routes duplicate visible numbers to manual review without writes', () => {
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('legacy-duplicate-visible', {
          document: duplicateVisibleNumberDocument(),
        }),
      ],
      now: NOW,
    });

    expect(report.rows[0]?.status).toBe('manual-review');
    expect(report.rows[0]?.passageCount).toBe(0);
    expect(report.rows[0]?.canonicalSafety?.classification).toBe('manual-review-required');
    expect(report.rows[0]?.canonicalSafety?.issues.map((issue) => issue.code)).toContain('duplicate-visible-number');
    expect(createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' })).toEqual([]);
  });

  it('classifies missing anchor objects as unsafe-to-write and blocks derived passage writes', () => {
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        fullTest('legacy-missing-anchor', {
          document: missingAnchorDocument(),
        }),
      ],
      now: NOW,
      onDiagnosticEvent: (event, payload) => events.push({ event, payload }),
    });

    expect(report.rows[0]?.status).toBe('manual-review');
    expect(report.rows[0]?.passageCount).toBe(0);
    expect(report.rows[0]?.canonicalSafety?.classification).toBe('unsafe-to-write');
    expect(report.rows[0]?.canonicalSafety?.issues.map((issue) => issue.code)).toContain('missing-stimulus-anchor');
    expect(createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' })).toEqual([]);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'backfill_canonical_validation_blocked',
        payload: expect.objectContaining({
          outcome: 'blocked',
          issueCode: 'missing-stimulus-anchor',
          materialId: 'legacy-missing-anchor',
          sourceTitleSlug: 'legacy-missing-anchor',
        }),
      }),
    ]));
  });

  it('reports stored projection anchor mismatches during dry-run safety scan', () => {
    const document = legacyDocument('Projection Mismatch');
    const source = fullTest('legacy-projection-mismatch', { document });
    const projection = generateReadingV2StudentSafeProjection({
      snapshotVersionId: source.sourceSnapshotVersionId,
      materialId: source.materialId,
      ownerId: source.ownerId,
      document,
      publishedAt: NOW,
      publishedBy: source.publishedBy,
    }, NOW);
    const mismatchedProjection = {
      ...projection,
      content: {
        ...projection.content,
        stimuli: projection.content.stimuli.map((stimulus, index) =>
          index === 0
            ? {
                ...stimulus,
                anchorIds: [...stimulus.anchorIds, 'projection-only-anchor'],
              }
            : stimulus,
        ),
      },
    };

    const report = planReadingV2FullTestPassageBackfill({
      fullTests: [
        {
          ...source,
          studentSafeProjection: mismatchedProjection,
        },
      ],
      now: NOW,
    });

    expect(report.rows[0]?.status).toBe('manual-review');
    expect(report.rows[0]?.canonicalSafety?.classification).toBe('unsafe-to-write');
    expect(report.rows[0]?.canonicalSafety?.issues.map((issue) => issue.code)).toContain('projection-anchor-mismatch');
    expect(createReadingV2FullTestPassageBackfillWritePlan({ report, approvedBy: 'lead-1' })).toEqual([]);
  });
});
