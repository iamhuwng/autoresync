import { describe, expect, it } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2PassageRef,
} from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  assertReadingV2RefOnlyFullTestComposition,
  createReadingV2FullTestCompositionFromRefs,
  getReadingV2PassageRefUpdateState,
  planReadingV2PassageEditFromCompositionRef,
  resolveReadingV2FullTestComposition,
} from './readingV2FullTestComposition.service';

const NOW = '2026-06-01T00:00:00.000Z';

const documentWithPassageNumber = (title = 'Legacy Reading Test'): ReadingV2Document => {
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

const passageRef = (overrides: Partial<ReadingV2PassageRef> = {}): ReadingV2PassageRef => ({
  refId: readingV2Ids.passageRefId('ref-shared-passage'),
  passageMaterialId: readingV2Ids.readingPassageMaterialId('shared-passage'),
  materialId: readingV2Ids.readingPassageMaterialId('shared-passage'),
  snapshotVersionId: readingV2Ids.snapshotVersionId('shared-version-1'),
  order: 1,
  sourcePassageNumber: 1,
  sourceOrderLabelSnapshot: 'Passage',
  sourceOrderDisplaySnapshot: 'Passage 1',
  titleSnapshot: 'Shared passage',
  title: 'Shared passage',
  source: {
    sourceOrderDisplay: 'Passage 1',
  },
  questionRangeSnapshot: '1-13',
  questionCountSnapshot: 13,
  questionCount: 13,
  ownerId: 'teacher-1',
  visibility: 'public',
  currentVersionId: readingV2Ids.snapshotVersionId('shared-version-1'),
  testType: {
    primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
    testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  },
  testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
  ...overrides,
});

describe('readingV2FullTestComposition.service', () => {
  it('uses native composition records when passageRefs are available', () => {
    const composition = createReadingV2FullTestCompositionFromRefs({
      compositionId: readingV2Ids.fullTestCompositionId('composition-native'),
      testMaterialId: readingV2Ids.materialId('native-full-test'),
      title: 'Native composition',
      ownerId: 'teacher-1',
      publishedVersionId: readingV2Ids.snapshotVersionId('snapshot-native'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      visibility: 'public',
      passageRefs: [passageRef()],
      createdAt: NOW,
    });

    const resolved = resolveReadingV2FullTestComposition({ composition });

    expect(resolved.compatibilityMode).toBe('native-composition');
    expect(resolved.composition).toBe(composition);
    expect(composition.numbering.totalQuestionCount).toBe(13);
  });

  it('rejects embedded payload fields in ref-only master compositions', () => {
    const composition = createReadingV2FullTestCompositionFromRefs({
      compositionId: readingV2Ids.fullTestCompositionId('composition-ref-only'),
      testMaterialId: readingV2Ids.materialId('ref-only-full-test'),
      title: 'Ref-only composition',
      ownerId: 'teacher-1',
      publishedVersionId: readingV2Ids.snapshotVersionId('snapshot-ref-only'),
      passageRefs: [passageRef()],
      createdAt: NOW,
    });

    expect(() =>
      assertReadingV2RefOnlyFullTestComposition({
        ...composition,
        document: documentWithPassageNumber(),
      }),
    ).toThrow(/embedded master payload field: document/);

    expect(() =>
      assertReadingV2RefOnlyFullTestComposition({
        ...composition,
        passageRefs: [{ ...composition.passageRefs[0], taskGroups: [] }],
      }),
    ).toThrow(/embedded master payload field: passageRefs\.0\.taskGroups/);
  });

  it('builds a compatibility composition from legacy full-test documents without passageRefs', () => {
    const resolved = resolveReadingV2FullTestComposition({
      legacyDocument: documentWithPassageNumber(),
      ownerId: 'teacher-1',
      testMaterialId: readingV2Ids.materialId('legacy-full-test'),
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('legacy-snapshot'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      createdAt: NOW,
    });

    expect(resolved.compatibilityMode).toBe('legacy-document-extraction');
    expect(resolved.composition.testMaterialId).toBe('legacy-full-test');
    expect(resolved.composition.passageRefs).toHaveLength(1);
    expect(resolved.composition.passageRefs[0]).toMatchObject({
      sourceOrderDisplaySnapshot: 'Passage 1',
      questionRangeSnapshot: '1-13',
    });
    expect(resolved.validationIssues).toEqual([]);
  });

  it('allows two full tests to reference the same Reading Passage version', () => {
    const shared = passageRef();
    const first = createReadingV2FullTestCompositionFromRefs({
      compositionId: readingV2Ids.fullTestCompositionId('composition-first'),
      testMaterialId: readingV2Ids.materialId('full-test-first'),
      title: 'First full test',
      ownerId: 'teacher-1',
      publishedVersionId: readingV2Ids.snapshotVersionId('snapshot-first'),
      passageRefs: [shared],
      createdAt: NOW,
    });
    const second = createReadingV2FullTestCompositionFromRefs({
      compositionId: readingV2Ids.fullTestCompositionId('composition-second'),
      testMaterialId: readingV2Ids.materialId('full-test-second'),
      title: 'Second full test',
      ownerId: 'teacher-2',
      publishedVersionId: readingV2Ids.snapshotVersionId('snapshot-second'),
      passageRefs: [{ ...shared, refId: readingV2Ids.passageRefId('ref-shared-passage-second') }],
      createdAt: NOW,
    });

    expect(first.passageRefs[0]?.passageMaterialId).toBe(second.passageRefs[0]?.passageMaterialId);
    expect(first.passageRefs[0]?.snapshotVersionId).toBe(second.passageRefs[0]?.snapshotVersionId);
  });

  it('defaults referenced-passage edits inside a full test to a test-specific fork', () => {
    const plan = planReadingV2PassageEditFromCompositionRef({
      compositionId: readingV2Ids.fullTestCompositionId('composition-edit'),
      ref: passageRef(),
    });

    expect(plan.mode).toBe('test-specific-fork');
    expect(plan.sourcePassageMaterialId).toBe('shared-passage');
    expect(plan.targetPassageMaterialId).not.toBe('shared-passage');
    expect(plan.baseSnapshotVersionId).toBe('shared-version-1');
  });

  it('requires explicit confirmation before editing shared source passage consumers', () => {
    expect(() =>
      planReadingV2PassageEditFromCompositionRef({
        compositionId: readingV2Ids.fullTestCompositionId('composition-edit-shared'),
        ref: passageRef(),
        editScope: 'shared-source',
      }),
    ).toThrow(/explicit shared-source edit confirmation/);

    const sharedPlan = planReadingV2PassageEditFromCompositionRef({
      compositionId: readingV2Ids.fullTestCompositionId('composition-edit-shared'),
      ref: passageRef(),
      editScope: 'shared-source',
      confirmSharedSourceEdit: true,
    });

    expect(sharedPlan.mode).toBe('shared-source-edit');
    expect(sharedPlan.targetPassageMaterialId).toBe('shared-passage');
  });

  it('marks composition refs as newer-version-available when source passage current version changes', () => {
    expect(
      getReadingV2PassageRefUpdateState(passageRef(), {
        'shared-passage': readingV2Ids.snapshotVersionId('shared-version-2'),
      }),
    ).toBe('newer-version-available');
    expect(
      getReadingV2PassageRefUpdateState(passageRef(), {
        'shared-passage': readingV2Ids.snapshotVersionId('shared-version-1'),
      }),
    ).toBe('current');
  });
});
