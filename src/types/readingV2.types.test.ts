import { describe, expect, it } from 'vitest';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2PassageRef,
  type ReadingV2ProjectionPayload,
  type ReadingV2ReadingPassageMaterial,
  type ReadingV2ValidationIssue,
} from './readingV2.types';
import { READING_V2_ENGINE } from '../config/readingV2FeatureFlags';
import { materialCatalogIds } from './materialCatalog.types';

describe('readingV2.types', () => {
  it('brands every required phase-2 ID class from non-empty strings', () => {
    expect(readingV2Ids.documentId('doc-1')).toBe('doc-1');
    expect(readingV2Ids.sectionId('section-1')).toBe('section-1');
    expect(readingV2Ids.stimulusId('stimulus-1')).toBe('stimulus-1');
    expect(readingV2Ids.taskGroupId('task-group-1')).toBe('task-group-1');
    expect(readingV2Ids.interactionId('interaction-1')).toBe('interaction-1');
    expect(readingV2Ids.anchorId('anchor-1')).toBe('anchor-1');
    expect(readingV2Ids.optionSetId('option-set-1')).toBe('option-set-1');
    expect(readingV2Ids.importEvidenceId('import-evidence-1')).toBe('import-evidence-1');
    expect(readingV2Ids.materialId('material-1')).toBe('material-1');
    expect(readingV2Ids.fullTestId('full-test-1')).toBe('full-test-1');
    expect(readingV2Ids.readingPassageMaterialId('passage-material-1')).toBe('passage-material-1');
    expect(readingV2Ids.fullTestCompositionId('composition-1')).toBe('composition-1');
    expect(readingV2Ids.passageRefId('passage-ref-1')).toBe('passage-ref-1');
    expect(readingV2Ids.snapshotVersionId('snapshot-1')).toBe('snapshot-1');
    expect(() => readingV2Ids.documentId('   ')).toThrow(/non-empty/);
  });

  it('models canonical and projection planes with incompatible discriminators', () => {
    const canonical = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'canonical',
      schemaVersion: READING_V2_SCHEMA_VERSION,
    } satisfies Pick<ReadingV2Document, 'deliveryEngine' | 'plane' | 'schemaVersion'>;

    const projection = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'projection',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      ownerId: 'teacher-1',
      projectionKind: 'student-safe',
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      generatedAt: '2026-04-25T00:00:00.000Z',
    } satisfies ReadingV2ProjectionPayload;

    expect(canonical.plane).toBe('canonical');
    expect(projection.plane).toBe('projection');
  });

  it('models Reading Passage materials as canonical versioned packageable units', () => {
    const passage = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'canonical',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      passageMaterialId: readingV2Ids.readingPassageMaterialId('passage-material-1'),
      ownerId: 'teacher-1',
      visibility: 'private',
      state: 'published',
      currentSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      title: 'Cambridge 18 Test 2 - Reading Passage 1',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      stimulusId: readingV2Ids.stimulusId('stimulus-1'),
      taskGroupIds: [readingV2Ids.taskGroupId('task-group-1')],
      interactionIds: [readingV2Ids.interactionId('interaction-1')],
      answerKeyLocation: 'canonical',
      scoringRuleLocation: 'canonical',
      sourceFullTestId: readingV2Ids.fullTestId('full-test-1'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('source-snapshot-1'),
      sourceOrder: {
        kind: 'numeric',
        value: 1,
        labelSnapshot: 'Passage',
        displaySnapshot: 'Passage 1',
      },
      sourceQuestionRange: '1-13',
      sourceTitleSnapshot: 'Cambridge 18 Test 2',
      durationMinutes: 20,
      provenance: { sourceMaterialId: 'full-test-1' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    } satisfies ReadingV2ReadingPassageMaterial;

    expect(passage.sourceOrder.displaySnapshot).toBe('Passage 1');
    expect(passage.answerKeyLocation).toBe('canonical');
  });

  it('models full-test compositions as ordered passage refs, not duplicated payloads', () => {
    const passageRef = {
      refId: readingV2Ids.passageRefId('passage-ref-1'),
      passageMaterialId: readingV2Ids.readingPassageMaterialId('passage-material-1'),
      materialId: readingV2Ids.readingPassageMaterialId('passage-material-1'),
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      order: 1,
      sourcePassageNumber: 1,
      sourceOrderLabelSnapshot: 'Passage',
      sourceOrderDisplaySnapshot: 'Passage 1',
      titleSnapshot: 'Source Passage 1',
      title: 'Source Passage 1',
      source: {
        sourceOrderLabel: 'Passage',
        sourceOrderDisplay: 'Passage 1',
      },
      questionRangeSnapshot: '1-13',
      questionCountSnapshot: 13,
      questionCount: 13,
      durationSnapshot: 20,
      ownerId: 'teacher-1',
      visibility: 'private',
      currentVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      testType: {
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      },
      testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
    } satisfies ReadingV2PassageRef;

    const composition = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'packaging',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      compositionId: readingV2Ids.fullTestCompositionId('composition-1'),
      testMaterialId: readingV2Ids.materialId('material-1'),
      title: 'IELTS Reading Full Test',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      skill: 'reading',
      passageRefs: [passageRef],
      questionCount: 13,
      numbering: {
        interactionDisplayNumbers: {},
        passageRanges: [{
          order: 1,
          passageMaterialId: 'passage-material-1',
          snapshotVersionId: 'snapshot-1',
          firstDisplayNumber: 1,
          lastDisplayNumber: 13,
          questionCount: 13,
        }],
        totalQuestionCount: 13,
      },
      durationMinutes: 20,
      visibility: 'private',
      ownerId: 'teacher-1',
      publishedVersionId: readingV2Ids.snapshotVersionId('composition-snapshot-1'),
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    } satisfies ReadingV2FullTestComposition;

    expect(composition.passageRefs).toHaveLength(1);
    expect('document' in composition.passageRefs[0]).toBe(false);
  });

  it('freezes validation severities to info, warning, and error', () => {
    const issues: ReadingV2ValidationIssue[] = [
      { code: 'note', severity: 'info', message: 'Informational.' },
      { code: 'advisory', severity: 'warning', message: 'Teacher-visible warning.' },
      {
        code: 'orphan-anchor-reference',
        severity: 'error',
        message: 'Publish-blocking error.',
      },
    ];

    expect(issues.map((issue) => issue.severity)).toEqual(['info', 'warning', 'error']);
  });
});
