import {
  readingV2Ids,
  type ReadingV2Document,
} from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { extractReadingV2PassageMaterials } from './readingV2PassageExtraction.service';

type FixtureTaskType = Parameters<typeof createReadingV2CanonicalFixture>[0];

interface PassageFixtureInput {
  readonly taskType: FixtureTaskType;
  readonly sectionTitle: string;
  readonly reviewNumbers?: readonly number[];
}

const NOW = '2026-06-01T00:00:00.000Z';

const withSectionTitleAndNumbers = (
  document: ReadingV2Document,
  input: PassageFixtureInput,
): ReadingV2Document => {
  const sectionId = document.sectionIds[0];

  if (!sectionId) {
    throw new Error('Fixture document is missing section id.');
  }

  const section = document.sections[sectionId];

  if (!section) {
    throw new Error('Fixture document is missing section.');
  }

  const interactions = Object.fromEntries(
    Object.entries(document.interactions).map(([interactionId, interaction], index) => [
      interactionId,
      {
        ...interaction,
        reviewLabel: {
          ...interaction.reviewLabel,
          displayNumber: input.reviewNumbers?.[index],
        },
      },
    ]),
  );

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        title: input.sectionTitle,
      },
    },
    interactions,
  };
};

const buildFullTestDocument = (
  title: string,
  inputs: readonly PassageFixtureInput[],
): ReadingV2Document => {
  const documents = inputs.map((input) =>
    withSectionTitleAndNumbers(createReadingV2CanonicalFixture(input.taskType), input),
  );
  const [first] = documents;

  if (!first) {
    throw new Error('At least one passage fixture is required.');
  }

  return {
    ...first,
    documentId: readingV2Ids.documentId(`doc-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
    title,
    sectionIds: documents.flatMap((document) => document.sectionIds),
    sections: Object.fromEntries(documents.flatMap((document) => Object.entries(document.sections))),
    stimuli: Object.fromEntries(documents.flatMap((document) => Object.entries(document.stimuli))),
    anchors: Object.fromEntries(documents.flatMap((document) => Object.entries(document.anchors))),
    taskGroups: Object.fromEntries(documents.flatMap((document) => Object.entries(document.taskGroups))),
    interactions: Object.fromEntries(documents.flatMap((document) => Object.entries(document.interactions))),
    optionSets: Object.fromEntries(documents.flatMap((document) => Object.entries(document.optionSets))),
    validationState: { issues: [] },
  };
};

describe('readingV2PassageExtraction.service', () => {
  it('extracts a 3-passage IELTS full test into passage materials and one composition', () => {
    const document = buildFullTestDocument('IELTS Academic Reading Test 1', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [1, 13] },
      { taskType: 'true-false-not-given', sectionTitle: 'Reading Passage 2', reviewNumbers: [14, 26] },
      { taskType: 'multiple-choice', sectionTitle: 'Reading Passage 3', reviewNumbers: [27, 40] },
    ]);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('full-test-ielts-1'),
      testMaterialId: readingV2Ids.materialId('material-full-test-ielts-1'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-ielts-1'),
      sourceTitleSnapshot: 'IELTS Academic Reading Test 1',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      visibility: 'public',
      createdAt: NOW,
    });

    expect(result.canPublish).toBe(true);
    expect(result.validationIssues).toEqual([]);
    expect(result.passages).toHaveLength(3);
    expect(result.composition.passageRefs).toHaveLength(3);
    expect(result.composition.questionCount).toBe(6);
    expect(result.composition.testMaterialId).toBe('material-full-test-ielts-1');
    expect(result.passages.map((candidate) => candidate.material.title)).toEqual([
      'IELTS Academic Reading Test 1: Passage 1',
      'IELTS Academic Reading Test 1: Passage 2',
      'IELTS Academic Reading Test 1: Passage 3',
    ]);
    expect(result.passages.map((candidate) => candidate.material.sourceOrder)).toEqual([
      {
        kind: 'numeric',
        value: 1,
        labelSnapshot: 'Passage',
        displaySnapshot: 'Passage 1',
      },
      {
        kind: 'numeric',
        value: 2,
        labelSnapshot: 'Passage',
        displaySnapshot: 'Passage 2',
      },
      {
        kind: 'numeric',
        value: 3,
        labelSnapshot: 'Passage',
        displaySnapshot: 'Passage 3',
      },
    ]);
    expect(result.passages.map((candidate) => candidate.material.sourceQuestionRange)).toEqual([
      '1-13',
      '14-26',
      '27-40',
    ]);
    expect(result.passages[0]?.stimulus.kind).toBe('passage');
    expect(result.passages[0]?.taskGroups).toHaveLength(1);
    expect(result.passages[0]?.interactions).toHaveLength(2);
    expect(result.passages[0]?.interactions[0]?.scoringRule.acceptableAnswers).toEqual(['answer one']);
    expect(result.passages[0]?.material.sourceFullTestId).toBe('full-test-ielts-1');
    expect(result.passages[0]?.material.sourceSnapshotVersionId).toBe('snapshot-ielts-1');
    expect(result.passages[0]?.material.sourceTitleSnapshot).toBe('IELTS Academic Reading Test 1');
    expect(result.passages[0]?.teacherAdminProvenance.sourceSectionId).toBe(document.sectionIds[0]);
    expect(JSON.stringify(result.composition)).not.toMatch(/teacherAdminProvenance|importEvidence|acceptableAnswers/);
  });

  it('uses the source passage title as the generated Reading Passage title while preserving source metadata', () => {
    const baseDocument = buildFullTestDocument('IELTS Cambridge 10 - Test 02: Reading', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading - Source unknown', reviewNumbers: [1, 13] },
    ]);
    const stimulusId = baseDocument.sections[baseDocument.sectionIds[0]!]!.stimulusIds[0]!;
    const document: ReadingV2Document = {
      ...baseDocument,
      stimuli: {
        ...baseDocument.stimuli,
        [stimulusId]: {
          ...baseDocument.stimuli[stimulusId]!,
          title: 'The History of Coffee',
        },
      },
    };

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('cambridge-10-test-02'),
      testMaterialId: readingV2Ids.materialId('material-cambridge-10-test-02'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-cambridge-10-test-02'),
      sourceTitleSnapshot: 'IELTS Cambridge 10 - Test 02: Reading',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages[0]?.material.title).toBe('The History of Coffee');
    expect(result.passages[0]?.document.title).toBe('The History of Coffee');
    expect(result.passages[0]?.material.sourceTitleSnapshot).toBe('IELTS Cambridge 10 - Test 02: Reading');
    expect(result.passages[0]?.material.sourceFullTestId).toBe('cambridge-10-test-02');
    expect(result.passages[0]?.material.sourceSnapshotVersionId).toBe('snapshot-cambridge-10-test-02');
    expect(result.passages[0]?.material.sourceOrder.displaySnapshot).toBe('Passage unknown');
  });

  it('accepts a published snapshot package as source input', () => {
    const document = buildFullTestDocument('Package Source Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [1, 2] },
    ]);

    const result = extractReadingV2PassageMaterials({
      publishPackage: {
        materialId: readingV2Ids.materialId('published-package-material'),
        title: 'Package Source Test',
        snapshot: {
          deliveryEngine: 'reading-v2',
          plane: 'canonical',
          schemaVersion: 1,
          snapshotVersionId: readingV2Ids.snapshotVersionId('published-snapshot-1'),
          materialId: readingV2Ids.materialId('published-package-material'),
          ownerId: 'teacher-1',
          document,
          publishedAt: NOW,
          publishedBy: 'teacher-1',
        },
      },
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]?.material.ownerId).toBe('teacher-1');
    expect(result.passages[0]?.material.sourceSnapshotVersionId).toBe('published-snapshot-1');
    expect(result.composition.testMaterialId).toBe('published-package-material');
  });

  it('uses Test-Type configured non-IELTS source labels', () => {
    const document = buildFullTestDocument('TOEIC Reading Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Part 2', reviewNumbers: [11, 20] },
    ]);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('toeic-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('toeic-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('toeic'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages[0]?.material.sourceOrder).toEqual({
      kind: 'numeric',
      value: 2,
      labelSnapshot: 'Part',
      displaySnapshot: 'Part 2',
    });
    expect(result.composition.passageRefs[0]?.sourceOrderDisplaySnapshot).toBe('Part 2');
  });

  it('supports non-numeric source order labels such as Section A', () => {
    const document = buildFullTestDocument('THCS Reading Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Section A', reviewNumbers: [1, 5] },
    ]);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('thcs-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('thcs-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('thcs'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages[0]?.material.sourceOrder).toEqual({
      kind: 'label',
      value: 'A',
      labelSnapshot: 'Section',
      displaySnapshot: 'Section A',
    });
    expect(result.composition.passageRefs[0]?.sourcePassageNumber).toBeNull();
  });

  it('uses unknown source order display without inventing passage numbers', () => {
    const document = buildFullTestDocument('THCS Reading Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Warmup reading', reviewNumbers: [1, 5] },
    ]);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('thcs-unknown-order'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('thcs-unknown-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('thcs'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages[0]?.material.sourceOrder).toEqual({
      kind: 'unknown',
      value: null,
      labelSnapshot: 'Section',
      displaySnapshot: 'Section unknown',
    });
    expect(result.passages[0]?.material.title).toBe('THCS Reading Test: Passage 1');
  });

  it('blocks publish when passage boundaries are missing instead of silently merging sections', () => {
    const document = buildFullTestDocument('Broken Reading Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [1, 2] },
    ]);
    const sectionId = document.sectionIds[0];
    const brokenDocument: ReadingV2Document = {
      ...document,
      sections: {
        ...document.sections,
        [sectionId]: {
          ...document.sections[sectionId],
          stimulusIds: [],
        },
      },
    };

    const result = extractReadingV2PassageMaterials({
      document: brokenDocument,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('broken-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('broken-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.canPublish).toBe(false);
    expect(result.passages).toEqual([]);
    expect(result.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous-passage-boundary',
          severity: 'error',
          sectionId,
        }),
      ]),
    );
  });

  it('preserves questions but blocks publish when answer keys are missing', () => {
    const document = buildFullTestDocument('Missing Answer Key Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [1, 2] },
    ]);
    const firstInteractionId = Object.keys(document.interactions)[0];
    const firstInteraction = document.interactions[firstInteractionId];
    const brokenDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          scoringRule: {
            maxScore: 1,
          },
        },
      },
    };

    const result = extractReadingV2PassageMaterials({
      document: brokenDocument,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('answer-key-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('answer-key-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.canPublish).toBe(false);
    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]?.interactions).toHaveLength(2);
    expect(result.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-answer-key',
          severity: 'error',
          interactionId: firstInteractionId,
        }),
      ]),
    );
  });

  it('blocks public/library eligibility when Test Type is missing but keeps a private draft candidate', () => {
    const document = buildFullTestDocument('Missing Test Type', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [1, 2] },
    ]);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('missing-type-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('missing-type-snapshot'),
      visibility: 'public',
      createdAt: NOW,
    });

    expect(result.canPublish).toBe(false);
    expect(result.canSavePrivateDraft).toBe(true);
    expect(result.passages[0]?.material.visibility).toBe('private');
    expect(result.passages[0]?.material.state).toBe('draft');
    expect(result.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-test-type',
          severity: 'error',
        }),
      ]),
    );
  });

  it('extracts source question ranges from review labels and does not mutate input documents', () => {
    const document = buildFullTestDocument('Immutable Range Test', [
      { taskType: 'sentence-completion', sectionTitle: 'Reading Passage 1', reviewNumbers: [6, 13] },
    ]);
    const before = structuredClone(document);

    const result = extractReadingV2PassageMaterials({
      document,
      ownerId: 'teacher-1',
      sourceFullTestId: readingV2Ids.fullTestId('immutable-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('immutable-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(result.passages[0]?.material.sourceQuestionRange).toBe('6-13');
    expect(document).toEqual(before);
  });
});
