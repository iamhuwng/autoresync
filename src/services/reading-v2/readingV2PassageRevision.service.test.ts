import { describe, expect, it } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2ReadingPassageMaterial,
} from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  openReadingV2PassageRevisionDraft,
  republishReadingV2PassageRevisionDraft,
  type ReadingV2PassageRevisionDraft,
} from './readingV2PassageRevision.service';

const NOW = '2026-06-01T00:00:00.000Z';

const passageDocument = (): ReadingV2Document => createReadingV2CanonicalFixture('sentence-completion');

const passageMaterial = (): ReadingV2ReadingPassageMaterial => {
  const document = passageDocument();
  const sectionId = document.sectionIds[0];
  const section = document.sections[sectionId];
  const stimulusId = section.stimulusIds[0];
  const taskGroupId = section.taskGroupIds[0];
  const taskGroup = document.taskGroups[taskGroupId];

  return {
    deliveryEngine: 'reading-v2',
    plane: 'canonical',
    schemaVersion: 1,
    passageMaterialId: readingV2Ids.readingPassageMaterialId('published-passage'),
    ownerId: 'teacher-1',
    visibility: 'private',
    state: 'published',
    currentSnapshotVersionId: readingV2Ids.snapshotVersionId('published-version-1'),
    title: 'Published passage',
    primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
    testTypeIds: [materialCatalogIds.testTypeId('ielts')],
    stimulusId,
    taskGroupIds: [taskGroupId],
    interactionIds: [...taskGroup.interactionIds],
    answerKeyLocation: 'canonical',
    scoringRuleLocation: 'canonical',
    sourceOrder: {
      kind: 'numeric',
      value: 1,
      labelSnapshot: 'Passage',
      displaySnapshot: 'Passage 1',
    },
    sourceQuestionRange: '1-13',
    createdAt: NOW,
    updatedAt: NOW,
  };
};

describe('readingV2PassageRevision.service', () => {
  it('opens a published Reading Passage for editing by creating a draft revision', () => {
    const material = passageMaterial();
    const document = passageDocument();
    const draft = openReadingV2PassageRevisionDraft({
      material,
      publishedDocument: document,
      existingDrafts: [],
      openedBy: 'teacher-1',
      now: NOW,
    });

    expect(draft.state).toBe('draft-revision');
    expect(draft.sourcePassageMaterialId).toBe('published-passage');
    expect(draft.baseSnapshotVersionId).toBe('published-version-1');
    expect(draft.document).toEqual(document);
    expect(material.currentSnapshotVersionId).toBe('published-version-1');
  });

  it('resumes an existing draft revision for the same published version', () => {
    const material = passageMaterial();
    const document = passageDocument();
    const existing: ReadingV2PassageRevisionDraft = {
      draftId: readingV2Ids.draftId('existing-revision-draft'),
      ownerId: 'teacher-1',
      sourcePassageMaterialId: material.passageMaterialId,
      baseSnapshotVersionId: material.currentSnapshotVersionId,
      document,
      state: 'draft-revision',
      createdAt: NOW,
      updatedAt: NOW,
      openedBy: 'teacher-1',
    };

    const draft = openReadingV2PassageRevisionDraft({
      material,
      publishedDocument: document,
      existingDrafts: [existing],
      openedBy: 'teacher-1',
      now: '2026-06-01T01:00:00.000Z',
    });

    expect(draft).toBe(existing);
  });

  it('republishes a draft revision as a new version without mutating the live published version object', () => {
    const material = passageMaterial();
    const before = structuredClone(material);
    const document = {
      ...passageDocument(),
      title: 'Republished passage document',
    };
    const draft = openReadingV2PassageRevisionDraft({
      material,
      publishedDocument: document,
      existingDrafts: [],
      openedBy: 'teacher-1',
      now: NOW,
    });
    const republished = republishReadingV2PassageRevisionDraft({
      draft,
      currentMaterial: material,
      nextSnapshotVersionId: readingV2Ids.snapshotVersionId('published-version-2'),
      publishedBy: 'teacher-1',
      now: '2026-06-01T02:00:00.000Z',
    });

    expect(material).toEqual(before);
    expect(republished.previousSnapshotVersionId).toBe('published-version-1');
    expect(republished.material.currentSnapshotVersionId).toBe('published-version-2');
    expect(republished.material.updatedAt).toBe('2026-06-01T02:00:00.000Z');
    expect(republished.version.document.title).toBe('Republished passage document');
    expect(republished.version.snapshotVersionId).toBe('published-version-2');
    expect(republished.version.previousSnapshotVersionId).toBe('published-version-1');
  });
});
