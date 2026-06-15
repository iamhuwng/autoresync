import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from './readingV2Repository.service';
import { assertReadingV2ProjectionIsStudentSanitized } from './readingV2Projection.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  dispatchReadingV2PublishCommitPlanToSinks,
  generateReadingV2PreviewOnly,
  publishReadingV2Material,
} from './readingV2PublishPipeline.service';
import { buildReadingV2DuplicateIndexRow } from './readingV2PassageDuplicateGuard.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const withSectionTitleAndNumbers = (
  document: ReadingV2Document,
  sectionTitle: string,
  reviewNumbers: readonly number[],
): ReadingV2Document => {
  const sectionId = document.sectionIds[0];

  if (!sectionId) {
    throw new Error('Fixture document missing section.');
  }

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...document.sections[sectionId],
        title: sectionTitle,
      },
    },
    interactions: Object.fromEntries(
      Object.entries(document.interactions).map(([interactionId, interaction], index) => [
        interactionId,
        {
          ...interaction,
          reviewLabel: {
            ...interaction.reviewLabel,
            displayNumber: reviewNumbers[index],
          },
        },
      ]),
    ),
  };
};

const twoPassageDocument = (): ReadingV2Document => {
  const first = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('sentence-completion'),
    'Reading Passage 1',
    [1, 13],
  );
  const second = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('true-false-not-given'),
    'Reading Passage 2',
    [14, 26],
  );

  return {
    ...first,
    documentId: readingV2Ids.documentId('doc-publish-two-passages'),
    title: 'Publish Two Passage Test',
    sectionIds: [...first.sectionIds, ...second.sectionIds],
    sections: { ...first.sections, ...second.sections },
    stimuli: { ...first.stimuli, ...second.stimuli },
    anchors: { ...first.anchors, ...second.anchors },
    taskGroups: { ...first.taskGroups, ...second.taskGroups },
    interactions: { ...first.interactions, ...second.interactions },
    optionSets: { ...first.optionSets, ...second.optionSets },
    validationState: { issues: [] },
  };
};

const tableDocumentWithMultiAnchorCell = (): ReadingV2Document => {
  const document = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('table-completion'),
    'Reading Passage 1',
    [1, 2],
  );
  const stimulus = Object.values(document.stimuli).find((candidate) => candidate.content.kind === 'table-content');

  if (!stimulus || stimulus.content.kind !== 'table-content') {
    throw new Error('Table fixture missing table stimulus.');
  }

  const [firstAnchorId, secondAnchorId] = stimulus.anchorIds;
  const bodyRow = stimulus.content.rows[1];
  const firstBodyCell = bodyRow?.[0];
  const secondBodyCell = bodyRow?.[1];

  if (!firstAnchorId || !secondAnchorId || !bodyRow || !firstBodyCell || !secondBodyCell) {
    throw new Error('Table fixture missing body cells or anchors.');
  }

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        content: {
          ...stimulus.content,
          rows: [
            stimulus.content.rows[0]!,
            [
              {
                ...firstBodyCell,
                anchorId: firstAnchorId,
                anchorIds: [firstAnchorId, secondAnchorId],
                text: 'First _____ and second _____ share one source cell',
              },
              {
                ...secondBodyCell,
                anchorId: undefined,
                anchorIds: undefined,
                isBlank: false,
                text: 'Continuation detail',
              },
            ],
          ],
        },
      },
    },
  };
};

describe('readingV2PublishPipeline.service', () => {
  it('previews without creating live session, assignment, attempt, homework, course, or result records', () => {
    const preview = generateReadingV2PreviewOnly({
      draftId: 'draft-preview-only',
      ownerId: 'teacher-1',
      document: fixtureDocument(),
    });

    expect(preview.projection.projectionKind).toBe('preview');
    expect(preview.projection.localOnlyAnswerState).toBe(true);
    expect(preview.permanentWrites).toEqual([]);
    expect(preview.projection.runtimeContract).toBe('teacher-preview');
    expect(() => assertReadingV2ProjectionIsStudentSanitized(preview.projection)).not.toThrow();
    expect(JSON.stringify(preview)).not.toContain('assignment');
    expect(JSON.stringify(preview)).not.toContain('session');
    expect(JSON.stringify(preview)).not.toContain('attempt');
    expect(JSON.stringify(preview)).not.toContain('result');
  });

  it('publishes by validating, creating immutable snapshot, projections, metadata, relationship indexes, and where-used writes', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-publish');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-publish');
    const passageAssetId = readingV2Ids.passageAssetId('asset-publish');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-04-25T00:00:00.000Z',
      passageAssetUses: [{ passageAssetId, consumerKind: 'task-group-material' }],
      returnContext: 'teacher-lobby',
    });

    expect(result.validation.canPublish).toBe(true);
    expect(result.projections.map((projection) => projection.projectionKind).sort()).toEqual([
      'analytics',
      'review',
      'session-safe',
      'student-safe',
    ]);
    expect(repository.loadPublishedSnapshot(materialId, snapshotVersionId)?.snapshotVersionId).toBe(snapshotVersionId);
    expect(result.relationshipIndexWrites.every((write) => write.source !== 'published-metadata' || write.materialId === materialId)).toBe(true);
    expect(result.relationshipIndexWrites.map((write) => write.surface)).toEqual(
      expect.arrayContaining([
        'library-listing',
        'homework-assignment',
        'course-material',
        'live-launch-summary',
        'solo-launch',
        'result-identity',
        'analytics',
      ]),
    );
    expect(repository.getWhereUsedEntries(passageAssetId)).toHaveLength(1);
    expect(result.commitPlan.commitKey).toBe(`${materialId}/${snapshotVersionId}`);
    expect(result.commitPlan.operations.map((operation) => operation.kind)).toEqual(
      expect.arrayContaining([
        'published-snapshot',
        'projection',
        'material-metadata',
        'relationship-index',
        'where-used',
        'return-context-notification',
      ]),
    );
    expect(new Set(result.commitPlan.operations.map((operation) => operation.operationKey)).size).toBe(
      result.commitPlan.operations.length,
    );
  });

  it('does not publish or expose student payloads when blocking validation fails', () => {
    const repository = createReadingV2Repository();
    const document = fixtureDocument();
    const [interactionId] = Object.keys(document.interactions);
    const invalidDocument = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...document.interactions[interactionId],
          placeholder: true,
        },
      },
    };
    const projectionSink = vi.fn();

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-blocked'),
        ownerId: 'teacher-1',
        document: invalidDocument,
        publishedBy: 'teacher-1',
        snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-blocked'),
      }),
    ).toThrow(/blocked/);
    expect(projectionSink).not.toHaveBeenCalled();
    expect(repository.store.publishedSnapshots.size).toBe(0);
  });

  it('blocks master publish when unresolved broken refs are present before creating writes', () => {
    const repository = createReadingV2Repository();

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-broken-master'),
        ownerId: 'teacher-1',
        document: fixtureDocument(),
        publishedBy: 'teacher-1',
        metadata: {
          title: 'Broken master',
          materialKind: 'reading-v2-full-test-composition',
          durationMinutes: 60,
          visibility: 'private',
        },
        masterComposition: {
          compositionId: 'composition-broken-master',
          testMaterialId: 'material-broken-master',
          ownerId: 'teacher-1',
          title: 'Broken master',
          publishedVersionId: 'composition-version-1',
          passageRefs: [],
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['archived'],
        } as any,
      }),
    ).toThrow(/unresolved broken Reading Passage refs/);
    expect(repository.store.publishedSnapshots.size).toBe(0);
  });

  it('blocks duplicate stimulus anchors before creating any publish writes', () => {
    const repository = createReadingV2Repository();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const document = fixtureDocument();
    const [stimulusId] = Object.keys(document.stimuli);
    const stimulus = stimulusId ? document.stimuli[stimulusId] : undefined;
    const [anchorId] = stimulus?.anchorIds ?? [];

    if (!stimulusId || !stimulus || !anchorId) {
      throw new Error('Fixture missing stimulus anchor.');
    }

    const invalidDocument: ReadingV2Document = {
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulusId]: {
          ...stimulus,
          anchorIds: [anchorId, anchorId],
        },
      },
    };

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-duplicate-anchor-blocked'),
        ownerId: 'teacher-1',
        document: invalidDocument,
        publishedBy: 'teacher-1',
        snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-duplicate-anchor-blocked'),
        onDiagnosticEvent: (event, payload) => events.push({ event, payload }),
      }),
    ).toThrow(/blocked/);
    expect(repository.store.publishedSnapshots.size).toBe(0);
    expect(repository.store.fullTests.size).toBe(0);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'publish_canonical_validation_blocked',
        payload: expect.objectContaining({
          outcome: 'blocked',
          issueCode: 'duplicate-stimulus-anchor',
          materialId: 'material-duplicate-anchor-blocked',
          stimulusId,
        }),
      }),
    ]));
  });

  it('dispatches external sink writes only from an explicit commit plan', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-dispatch');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-dispatch');
    const projectionSink = vi.fn();
    const metadataSink = vi.fn();
    const indexSink = vi.fn();
    const notifySink = vi.fn();
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      returnContext: 'teacher-lobby',
    });

    expect(projectionSink).not.toHaveBeenCalled();
    const dispatchedKeys = dispatchReadingV2PublishCommitPlanToSinks(result.commitPlan, {
      writeProjection: projectionSink,
      writeMaterialMetadata: metadataSink,
      writeRelationshipIndex: indexSink,
      notifyReturnContext: notifySink,
    });

    expect(projectionSink).toHaveBeenCalledTimes(4);
    expect(metadataSink).toHaveBeenCalledOnce();
    expect(indexSink).toHaveBeenCalledTimes(10);
    expect(notifySink).toHaveBeenCalledWith({
      materialId,
      snapshotVersionId,
      context: 'teacher-lobby',
    });
    expect(dispatchedKeys.every((operationKey) => operationKey.startsWith(`${materialId}/${snapshotVersionId}/`))).toBe(true);
  });

  it('rolls back repository commit when a committed operation fails', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-repository-rollback');
    const passageAssetId = readingV2Ids.passageAssetId('asset-rollback');
    const previousSnapshotId = readingV2Ids.snapshotVersionId('snapshot-previous');
    const nextSnapshotId = readingV2Ids.snapshotVersionId('snapshot-next');
    const document = fixtureDocument();

    repository.publishSnapshot({
      materialId,
      snapshotVersionId: previousSnapshotId,
      ownerId: 'teacher-1',
      document,
      publishedBy: 'teacher-1',
    });
    const failingRepository = {
      ...repository,
      addWhereUsedEntry: vi.fn(() => {
        throw new Error('where-used failed');
      }),
    };

    expect(() =>
      publishReadingV2Material({
        repository: failingRepository,
        materialId,
        ownerId: 'teacher-1',
        document: {
          ...document,
          title: 'Next publish attempt',
        },
        publishedBy: 'teacher-1',
        snapshotVersionId: nextSnapshotId,
        passageAssetUses: [{ passageAssetId, consumerKind: 'task-group-material' }],
      }),
    ).toThrow(/where-used failed/);

    expect(repository.loadPublishedSnapshot(materialId, previousSnapshotId)?.document.title).toBe(document.title);
    expect(repository.loadPublishedSnapshot(materialId, nextSnapshotId)).toBeNull();
    expect(repository.getWhereUsedEntries(passageAssetId)).toHaveLength(0);
  });

  it('adds Reading Passage entities, projections, metadata, composition, and listing indexes to the publish plan', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-full-test-with-passages');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-full-test-with-passages');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: twoPassageDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        title: 'Publish Two Passage Test',
        materialKind: 'reading-v2-full-test-composition',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'library-eligible',
      },
      readingPassageExtraction: {
        sourceFullTestId: readingV2Ids.fullTestId('full-test-with-passages'),
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'public',
      },
    });

    const storageWrites = result.commitPlan.operations.filter((operation) => operation.kind === 'storage-write');
    const byPath = Object.fromEntries(
      storageWrites.map((operation) => [operation.path, operation.value]),
    );
    const firstPassageId = 'material-full-test-with-passages-passage-1';
    const secondPassageId = 'material-full-test-with-passages-passage-2';

    expect(result.readingPassageExtraction?.passages).toHaveLength(2);
    expect(result.readingPassageExtraction?.composition.passageRefs.map((ref) => ref.passageMaterialId)).toEqual([
      firstPassageId,
      secondPassageId,
    ]);
    expect(result.projections.map((projection) => projection.projectionKind).sort()).toEqual([
      'review',
      'session-safe',
      'student-safe',
    ]);
    const masterStudentProjection = result.projections.find((projection) =>
      projection.projectionKind === 'student-safe'
    );
    expect(masterStudentProjection).toMatchObject({
      materialId,
      projectionId: `student-safe:${materialId}:${snapshotVersionId}`,
      sourceSnapshotVersionId: snapshotVersionId,
      runtimeContract: 'student-runtime',
      content: expect.objectContaining({
        title: 'Publish Two Passage Test',
      }),
    });
    expect(masterStudentProjection?.content.sections).toHaveLength(2);
    expect(JSON.stringify(masterStudentProjection)).not.toMatch(/acceptableAnswers|scoringRule|importEvidence|hiddenProvenance/);
    expect(Object.keys(byPath)).toEqual(
      expect.arrayContaining([
        readingV2StoragePaths.readingPassageMaterials(firstPassageId),
        readingV2StoragePaths.readingPassageMaterialVersions(firstPassageId, snapshotVersionId),
        readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId),
        readingV2StoragePaths.studentSafeTests(firstPassageId, snapshotVersionId),
        readingV2StoragePaths.reviewProjections(firstPassageId, snapshotVersionId),
        readingV2StoragePaths.materialMetadata(firstPassageId),
        readingV2StoragePaths.fullTestCompositions(result.readingPassageExtraction!.composition.compositionId),
        readingV2StoragePaths.fullTestCompositionVersions(
          result.readingPassageExtraction!.composition.compositionId,
          snapshotVersionId,
        ),
        'material_catalog/material_indexes/by_owner/teacher-1/material-full-test-with-passages-passage-1',
        'material_catalog/material_indexes/by_visibility/public/material-full-test-with-passages-passage-1',
        'material_catalog/material_indexes/by_material_kind/reading-passage/material-full-test-with-passages-passage-1',
        'material_catalog/material_indexes/by_test_type/ielts/material-full-test-with-passages-passage-1',
        'material_catalog/material_indexes/by_source_full_test/full-test-with-passages/material-full-test-with-passages-passage-1',
      ]),
    );
    expect(Object.keys(byPath)).not.toContain(readingV2StoragePaths.publishedSnapshots(materialId, snapshotVersionId));
    expect(Object.keys(byPath)).not.toContain(readingV2StoragePaths.studentSafeTests(materialId, snapshotVersionId));
    expect(Object.keys(byPath)).not.toContain(readingV2StoragePaths.reviewProjections(materialId, snapshotVersionId));
    expect(result.commitPlan.operations.some((operation) =>
      operation.kind === 'published-snapshot' && operation.snapshot.materialId === materialId,
    )).toBe(false);
    expect(byPath[readingV2StoragePaths.materialMetadata(firstPassageId)]).toMatchObject({
      materialKind: 'reading-passage',
      sourceFullTestId: 'full-test-with-passages',
      sourceOrderDisplaySnapshot: 'Passage 1',
      sourceQuestionRange: '1-13',
    });
    expect(byPath[readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId)]).toMatchObject({
      materialId: firstPassageId,
      snapshotVersionId,
      document: expect.objectContaining({
        sectionIds: expect.arrayContaining([expect.stringContaining('section')]),
        sections: expect.objectContaining({
          'section-sentence-completion': expect.objectContaining({
            title: expect.stringContaining('Passage 1'),
          }),
        }),
      }),
    });
    expect(JSON.stringify(byPath[readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId)]))
      .toMatch(/acceptableAnswers|scoringRule/);
    expect(byPath[readingV2StoragePaths.fullTestCompositions(result.readingPassageExtraction!.composition.compositionId)])
      .toMatchObject({
        testMaterialId: materialId,
        numbering: expect.objectContaining({
          totalQuestionCount: 4,
        }),
        passageRefs: [
          expect.objectContaining({
            materialId: firstPassageId,
            passageMaterialId: firstPassageId,
            title: expect.stringContaining('Passage 1'),
            source: expect.objectContaining({
              sourceOrderDisplay: 'Passage 1',
            }),
            testType: expect.objectContaining({
              primaryTestTypeId: 'ielts',
              testTypeIds: ['ielts'],
            }),
            questionCount: 2,
            ownerId: 'teacher-1',
            visibility: 'public',
            currentVersionId: snapshotVersionId,
            sourceOrderDisplaySnapshot: 'Passage 1',
          }),
          expect.objectContaining({
            materialId: secondPassageId,
            passageMaterialId: secondPassageId,
            title: expect.stringContaining('Passage 2'),
            questionCount: 2,
            ownerId: 'teacher-1',
            visibility: 'public',
            currentVersionId: snapshotVersionId,
            sourceOrderDisplaySnapshot: 'Passage 2',
          }),
        ],
      });
    expect(JSON.stringify(byPath[readingV2StoragePaths.fullTestCompositions(result.readingPassageExtraction!.composition.compositionId)]))
      .not.toMatch(/"document"|"sections"|"stimuli"|"taskGroups"|"interactions"|"optionSets"|"answerKey"|"correctAnswers"/);
    expect(JSON.stringify(byPath[readingV2StoragePaths.fullTestCompositionVersions(
      result.readingPassageExtraction!.composition.compositionId,
      snapshotVersionId,
    )]))
      .not.toMatch(/"document"|"sections"|"stimuli"|"taskGroups"|"interactions"|"optionSets"|"answerKey"|"correctAnswers"/);
    expect(JSON.stringify(byPath[readingV2StoragePaths.studentSafeTests(firstPassageId, snapshotVersionId)]))
      .not.toMatch(/acceptableAnswers|scoringRule|importEvidence|hiddenProvenance/);
    expect(JSON.stringify(byPath['material_catalog/material_indexes/by_owner/teacher-1/material-full-test-with-passages-passage-1']))
      .not.toMatch(/acceptableAnswers|scoringRule|document|teacherAdminProvenance/);
    expect(result.commitPlan.operations.map((operation) => operation.operationKey)).toEqual(
      expect.arrayContaining([
        `${materialId}/${snapshotVersionId}/storage/${readingV2StoragePaths.readingPassageMaterials(firstPassageId)}`,
        `${materialId}/${snapshotVersionId}/storage/${readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId)}`,
        `${materialId}/${snapshotVersionId}/storage/${readingV2StoragePaths.fullTestCompositions(result.readingPassageExtraction!.composition.compositionId)}`,
      ]),
    );
  });

  it('keeps same-source full-test split publish idempotent for generated passage identities', () => {
    const firstRepository = createReadingV2Repository();
    const secondRepository = createReadingV2Repository();
    const input = {
      materialId: readingV2Ids.materialId('material-idempotent-full-test'),
      ownerId: 'teacher-1',
      document: twoPassageDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-idempotent-full-test'),
      publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        title: 'Idempotent Full Test',
        materialKind: 'reading-v2-full-test-composition' as const,
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'library-eligible' as const,
      },
      readingPassageExtraction: {
        sourceFullTestId: readingV2Ids.fullTestId('full-test-idempotent'),
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'public' as const,
      },
    };

    const first = publishReadingV2Material({ ...input, repository: firstRepository });
    const second = publishReadingV2Material({ ...input, repository: secondRepository });
    const firstStoragePaths = first.commitPlan.operations
      .filter((operation) => operation.kind === 'storage-write')
      .map((operation) => operation.path);
    const secondStoragePaths = second.commitPlan.operations
      .filter((operation) => operation.kind === 'storage-write')
      .map((operation) => operation.path);

    expect(second.readingPassageExtraction?.passages.map((candidate) => candidate.material.passageMaterialId)).toEqual(
      first.readingPassageExtraction?.passages.map((candidate) => candidate.material.passageMaterialId),
    );
    expect(second.readingPassageExtraction?.composition.compositionId).toBe(
      first.readingPassageExtraction?.composition.compositionId,
    );
    expect(secondStoragePaths).toEqual(firstStoragePaths);
  });

  it('uses the PRD-0054 duplicate guard and writes safe generated-passage duplicate index rows', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-duplicate-guard-full-test');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-duplicate-guard-full-test');
    const duplicateSourceDocument = withSectionTitleAndNumbers(
      createReadingV2CanonicalFixture('sentence-completion'),
      'Reading Passage 1',
      [1, 13],
    );
    const duplicateStimulus = Object.values(duplicateSourceDocument.stimuli)[0]!;
    const duplicateTaskGroups = Object.values(duplicateSourceDocument.taskGroups);
    const duplicateInteractions = Object.values(duplicateSourceDocument.interactions);
    const duplicateOptionSets = Object.values(duplicateSourceDocument.optionSets);
    const duplicateBodyText = JSON.stringify({ stimulus: duplicateStimulus.content });
    const duplicateQuestionText = JSON.stringify({
      taskGroups: duplicateTaskGroups.map((taskGroup) => ({
        taskGroupId: taskGroup.taskGroupId,
        officialTaskType: taskGroup.officialTaskType,
        groupTitle: taskGroup.groupTitle,
        instructionBlocks: taskGroup.instructionBlocks,
        answerRule: taskGroup.answerRule,
        stimulusRefs: taskGroup.stimulusRefs,
        optionSetRefs: taskGroup.optionSetRefs,
      })),
      interactions: duplicateInteractions.map((interaction) => ({
        interactionId: interaction.interactionId,
        responseShape: interaction.responseShape,
        reviewLabel: interaction.reviewLabel,
        promptText: interaction.promptText,
        primaryAnchorId: interaction.primaryAnchorId,
        contextAnchorIds: interaction.contextAnchorIds,
      })),
      optionSets: duplicateOptionSets,
    });
    const duplicateRows = [
      buildReadingV2DuplicateIndexRow({
        ownerId: 'teacher-1',
        passageMaterialId: 'existing-duplicate-passage',
        currentVersionId: 'existing-snapshot',
        title: 'Existing duplicate passage',
        state: 'published',
        visibility: 'private',
        source: { sourceFullTestId: 'source-old', sourceOrderDisplay: 'Passage 1' },
        testType: { primaryTestTypeId: materialCatalogIds.testTypeId('ielts'), testTypeIds: [materialCatalogIds.testTypeId('ielts')] },
        questionCount: 2,
        updatedAt: '2026-05-01T00:00:00.000Z',
        bodyText: duplicateBodyText,
        questionText: duplicateQuestionText,
      }),
      buildReadingV2DuplicateIndexRow({
        ownerId: 'teacher-1',
        passageMaterialId: 'archived-duplicate-passage',
        currentVersionId: 'archived-snapshot',
        title: 'Archived duplicate passage',
        state: 'archived',
        visibility: 'private',
        source: { sourceFullTestId: 'source-old', sourceOrderDisplay: 'Passage 1' },
        testType: { primaryTestTypeId: materialCatalogIds.testTypeId('ielts'), testTypeIds: [materialCatalogIds.testTypeId('ielts')] },
        questionCount: 2,
        updatedAt: '2026-05-01T00:00:00.000Z',
        bodyText: duplicateBodyText,
        questionText: duplicateQuestionText,
      }),
    ];

    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: twoPassageDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        title: 'Duplicate Guard Full Test',
        materialKind: 'reading-v2-full-test-composition',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'library-eligible',
      },
      readingPassageExtraction: {
        sourceFullTestId: readingV2Ids.fullTestId('full-test-duplicate-guard'),
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'public',
      },
      duplicateIndexRows: duplicateRows,
    });
    const storageWrites = result.commitPlan.operations.filter((operation) => operation.kind === 'storage-write');
    const duplicateIndexWrites = storageWrites.filter(
      (operation) => operation.writeKind === 'reading-passage-duplicate-index',
    );

    expect(result.duplicateWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        passageMaterialId: 'material-duplicate-guard-full-test-passage-1',
        result: expect.objectContaining({
          shouldWarn: true,
          blockPublish: false,
          matches: expect.arrayContaining([
            expect.objectContaining({
              materialId: 'existing-duplicate-passage',
              actions: expect.arrayContaining(['use-existing', 'create-new-anyway']),
            }),
            expect.objectContaining({
              materialId: 'archived-duplicate-passage',
              actions: expect.arrayContaining(['restore-and-use', 'create-new-anyway']),
            }),
          ]),
        }),
      }),
    ]));
    expect(duplicateIndexWrites.map((operation) => operation.path)).toContain(
      'reading_v2/duplicate_indexes/passages_by_owner/teacher-1/material-duplicate-guard-full-test-passage-1',
    );
    expect(JSON.stringify(duplicateIndexWrites)).not.toMatch(/bodyText|questionText|document|answerKey|scoringRule/);
  });

  it('blocks auto-split publish when the duplicate index is missing or stale', () => {
    const repository = createReadingV2Repository();

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-stale-duplicate-index'),
        ownerId: 'teacher-1',
        document: twoPassageDocument(),
        publishedBy: 'teacher-1',
        snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-stale-duplicate-index'),
        metadata: {
          title: 'Stale Duplicate Index Full Test',
          materialKind: 'reading-v2-full-test-composition',
          primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
          testTypeIds: [materialCatalogIds.testTypeId('ielts')],
          testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
          visibility: 'library-eligible',
        },
        duplicateIndexStatus: 'stale',
      }),
    ).toThrow(/duplicate index is stale/);
  });

  it('publishes standalone Reading Passage material from a valid multi-anchor table cell', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-multi-anchor-table-full-test');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-multi-anchor-table-full-test');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: tableDocumentWithMultiAnchorCell(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        title: 'Multi Anchor Table Full Test',
        materialKind: 'full-test',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'library-eligible',
      },
    });
    const firstPassageId = 'material-multi-anchor-table-full-test-passage-1';
    const storageWrites = result.commitPlan.operations.filter((operation) => operation.kind === 'storage-write');
    const byPath = Object.fromEntries(storageWrites.map((operation) => [operation.path, operation.value]));
    const passageSnapshotPath = readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId);
    const passageSnapshot = byPath[passageSnapshotPath] as { document?: ReadingV2Document } | undefined;
    const tableStimulus = passageSnapshot
      ? Object.values(passageSnapshot.document?.stimuli ?? {}).find((stimulus) => stimulus.content.kind === 'table-content')
      : undefined;
    const tableCell = tableStimulus?.content.kind === 'table-content'
      ? tableStimulus.content.rows[1]?.[0]
      : undefined;

    expect(result.validation.canPublish).toBe(true);
    expect(result.readingPassageExtraction?.canPublish).toBe(true);
    expect(result.readingPassageExtraction?.passages).toHaveLength(1);
    expect(tableCell).toMatchObject({
      text: 'First _____ and second _____ share one source cell',
      anchorIds: expect.arrayContaining([
        expect.stringContaining('anchor-table-completion-1'),
        expect.stringContaining('anchor-table-completion-2'),
      ]),
    });
    expect(Object.keys(byPath)).toEqual(expect.arrayContaining([
      readingV2StoragePaths.readingPassageMaterials(firstPassageId),
      passageSnapshotPath,
      readingV2StoragePaths.studentSafeTests(firstPassageId, snapshotVersionId),
      readingV2StoragePaths.reviewProjections(firstPassageId, snapshotVersionId),
    ]));
  });

  it('auto-extracts Reading Passages when full-test metadata is published without caller opt-in', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-auto-full-test-passages');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-auto-full-test-passages');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: twoPassageDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        title: 'Auto Extract Full Test',
        materialKind: 'full-test',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        visibility: 'library-eligible',
      },
    });

    const storageWrites = result.commitPlan.operations.filter((operation) => operation.kind === 'storage-write');
    const firstPassageId = 'material-auto-full-test-passages-passage-1';

    expect(result.readingPassageExtraction?.composition).toMatchObject({
      testMaterialId: materialId,
      visibility: 'public',
      passageRefs: expect.arrayContaining([
        expect.objectContaining({ passageMaterialId: firstPassageId }),
      ]),
    });
    expect(result.metadata.compositionId).toBe(
      result.readingPassageExtraction?.composition.compositionId,
    );
    expect(result.readingPassageExtraction?.passages[0]?.material.sourceFullTestId).toBe(materialId);
    expect(storageWrites.map((operation) => operation.path)).toEqual(
      expect.arrayContaining([
        readingV2StoragePaths.readingPassageMaterials(firstPassageId),
        readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId),
        readingV2StoragePaths.studentSafeTests(firstPassageId, snapshotVersionId),
        'material_catalog/material_indexes/by_visibility/public/material-auto-full-test-passages-passage-1',
        'material_catalog/material_indexes/by_source_full_test/material-auto-full-test-passages/material-auto-full-test-passages-passage-1',
      ]),
    );
  });

  it('updates standalone Reading Passage canonical and catalog rows on republish', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-standalone-passage');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-standalone-passage');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: withSectionTitleAndNumbers(fixtureDocument(), 'Reading Passage 1', [1, 13]),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-06-15T19:12:11.000Z',
      metadata: {
        title: 'Standalone Passage',
        materialKind: 'reading-passage',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        sourceFullTestId: readingV2Ids.materialId('source-full-test'),
        sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('source-snapshot'),
        sourceQuestionRange: '1-13',
        visibility: 'library-eligible',
      },
    });
    const storageWrites = result.commitPlan.operations.filter((operation) => operation.kind === 'storage-write');
    const byPath = Object.fromEntries(storageWrites.map((operation) => [operation.path, operation.value]));

    expect(byPath[readingV2StoragePaths.readingPassageMaterials(materialId)]).toMatchObject({
      passageMaterialId: materialId,
      ownerId: 'teacher-1',
      visibility: 'public',
      state: 'published',
      currentSnapshotVersionId: snapshotVersionId,
      title: 'Standalone Passage',
      sourceFullTestId: 'source-full-test',
      sourceSnapshotVersionId: 'source-snapshot',
      sourceQuestionRange: '1-13',
    });
    expect(byPath[readingV2StoragePaths.readingPassageMaterialVersions(materialId, snapshotVersionId)])
      .toMatchObject({
        passageMaterialId: materialId,
        currentSnapshotVersionId: snapshotVersionId,
        ownerId: 'teacher-1',
      });
    expect(byPath[`material_catalog/material_indexes/by_visibility/public/${materialId}`]).toMatchObject({
      materialId,
      ownerId: 'teacher-1',
      visibility: 'public',
      materialKind: 'reading-passage',
    });
    expect(byPath[`material_catalog/material_indexes/by_visibility/private/${materialId}`]).toBeNull();
  });

  it('does not auto-extract Reading Passages for explicit task-group material publishes', () => {
    const repository = createReadingV2Repository();
    const result = publishReadingV2Material({
      repository,
      materialId: readingV2Ids.materialId('material-task-group-no-passages'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-task-group-no-passages'),
      metadata: {
        title: 'Task Group Publish',
        materialKind: 'task-group-material',
      },
    });

    expect(result.readingPassageExtraction).toBeUndefined();
    expect(result.commitPlan.operations.some((operation) => operation.kind === 'storage-write')).toBe(false);
  });

  it('blocks full-test publish when Reading Passage extraction reports a blocking issue', () => {
    const repository = createReadingV2Repository();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-missing-type'),
        ownerId: 'teacher-1',
        document: fixtureDocument(),
        publishedBy: 'teacher-1',
        snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-missing-type'),
        readingPassageExtraction: {
          visibility: 'public',
        },
        onDiagnosticEvent: (event, payload) => events.push({ event, payload }),
      }),
    ).toThrow(/passage extraction blocked publish.*missing-test-type/);
    expect(repository.store.publishedSnapshots.size).toBe(0);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'passage_extraction_canonical_validation_blocked',
        payload: expect.objectContaining({
          outcome: 'blocked',
          issueCode: 'missing-test-type',
          materialId: 'material-missing-type',
        }),
      }),
    ]));
  });
});
