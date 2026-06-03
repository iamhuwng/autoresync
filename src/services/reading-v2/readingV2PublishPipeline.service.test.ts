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
            title: 'Reading Passage 1',
          }),
        }),
      }),
    });
    expect(JSON.stringify(byPath[readingV2StoragePaths.publishedSnapshots(firstPassageId, snapshotVersionId)]))
      .toMatch(/acceptableAnswers|scoringRule/);
    expect(byPath[readingV2StoragePaths.fullTestCompositions(result.readingPassageExtraction!.composition.compositionId)])
      .toMatchObject({
        testMaterialId: materialId,
        passageRefs: [
          expect.objectContaining({
            passageMaterialId: firstPassageId,
            sourceOrderDisplaySnapshot: 'Passage 1',
          }),
          expect.objectContaining({
            passageMaterialId: secondPassageId,
            sourceOrderDisplaySnapshot: 'Passage 2',
          }),
        ],
      });
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
      }),
    ).toThrow(/passage extraction blocked publish.*missing-test-type/);
    expect(repository.store.publishedSnapshots.size).toBe(0);
  });
});
