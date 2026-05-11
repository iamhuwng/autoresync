import { describe, expect, it } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2PassageAssetVersion,
} from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from './readingV2Repository.service';
import {
  extractReadingV2TaskGroupMaterialDraft,
  searchReadingV2PassageAssets,
  selectReadingV2PassageAssetForDraft,
  writeReadingV2WhereUsedForPublish,
} from './readingV2PassageAssetWorkflow.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const fixtureStimulusContent = () => {
  const document = fixtureDocument();
  const [stimulusId] = Object.keys(document.stimuli);
  return document.stimuli[stimulusId].content;
};

const saveAsset = (repository: ReturnType<typeof createReadingV2Repository>) => {
  const assetId = readingV2Ids.passageAssetId('asset-search');
  const version: ReadingV2PassageAssetVersion = {
    passageAssetId: assetId,
    versionId: 'v1',
    title: 'Climate passage',
    content: fixtureStimulusContent(),
    source: 'Teacher source',
    topic: 'climate',
    paragraphAnchorIds: [],
  };

  repository.savePassageAsset({
    passageAssetId: assetId,
    ownerId: 'teacher-1',
    state: 'published',
    currentVersionId: 'v1',
  });
  repository.savePassageAssetVersion(version);

  return { assetId, version };
};

describe('readingV2PassageAssetWorkflow.service', () => {
  it('searches passage assets and selects a version into Studio draft stimulus context', () => {
    const repository = createReadingV2Repository();
    const { assetId, version } = saveAsset(repository);
    const results = searchReadingV2PassageAssets(repository, {
      ownerId: 'teacher-1',
      query: 'climate',
    });
    const selected = selectReadingV2PassageAssetForDraft(fixtureDocument(), {
      passageAssetId: assetId,
      version,
    });
    const [stimulusId] = Object.keys(selected.stimuli);

    expect(results).toHaveLength(1);
    expect(selected.stimuli[stimulusId].title).toBe('Climate passage');
    expect(selected.stimuli[stimulusId].content).toEqual(version.content);
  });

  it('rejects passage asset selection when the chosen version belongs to another asset', () => {
    const repository = createReadingV2Repository();
    const { assetId, version } = saveAsset(repository);

    expect(() =>
      selectReadingV2PassageAssetForDraft(fixtureDocument(), {
        passageAssetId: readingV2Ids.passageAssetId(`${assetId}-other`),
        version,
      }),
    ).toThrow(/selected asset/);
  });

  it('writes where-used graph entries through the repository boundary', () => {
    const repository = createReadingV2Repository();
    const { assetId } = saveAsset(repository);
    const entry = writeReadingV2WhereUsedForPublish(repository, {
      passageAssetId: assetId,
      ownerId: 'teacher-1',
      consumerId: 'material-1',
      consumerKind: 'task-group-material',
    });

    expect(entry.consumerId).toBe('material-1');
    expect(repository.getWhereUsedEntries(assetId)).toHaveLength(1);
  });

  it('extracts passage plus task group as an independent draft with hidden provenance only', () => {
    const repository = createReadingV2Repository();
    const { assetId } = saveAsset(repository);
    const sourceDocument = fixtureDocument();
    const [sourceTaskGroupId] = Object.keys(sourceDocument.taskGroups).map(readingV2Ids.taskGroupId);
    const sourceMaterialId = readingV2Ids.materialId('source-material');
    const newMaterialId = readingV2Ids.materialId('extracted-material');
    const draft = extractReadingV2TaskGroupMaterialDraft(repository, {
      sourceDocument,
      taskGroupIds: [sourceTaskGroupId],
      sourceMaterialId,
      sourceSnapshotVersionId: 'snapshot-source-1',
      sourcePassageAssetId: assetId,
      sourcePassageAssetVersion: 'v1',
      newDraftId: 'draft-extracted',
      newMaterialId,
      ownerId: 'teacher-1',
      extractedBy: 'teacher-1',
      extractedAt: '2026-04-25T00:00:00.000Z',
    });

    expect(draft.materialId).toBe(newMaterialId);
    expect(draft.document.documentId).not.toBe(sourceDocument.documentId);
    expect(Object.keys(draft.document.taskGroups)[0]).not.toBe(sourceTaskGroupId);
    expect(repository.store.taskGroupMaterials.get(newMaterialId)?.provenance?.sourceMaterialId).toBe(sourceMaterialId);
    expect(repository.store.taskGroupMaterials.get(newMaterialId)?.provenance?.sourceSnapshotVersionId).toBe('snapshot-source-1');
    expect(JSON.stringify(draft.document)).not.toContain('sourceMaterialId');
  });

  it('keeps extracted copies independent from later source edits', () => {
    const repository = createReadingV2Repository();
    const { assetId } = saveAsset(repository);
    const sourceDocument = fixtureDocument();
    const [sourceTaskGroupId] = Object.keys(sourceDocument.taskGroups).map(readingV2Ids.taskGroupId);
    const draft = extractReadingV2TaskGroupMaterialDraft(repository, {
      sourceDocument,
      taskGroupIds: [sourceTaskGroupId],
      sourceMaterialId: readingV2Ids.materialId('source-material-independent'),
      sourcePassageAssetId: assetId,
      sourcePassageAssetVersion: 'v1',
      newDraftId: 'draft-independent',
      newMaterialId: readingV2Ids.materialId('extracted-independent'),
      ownerId: 'teacher-1',
      extractedBy: 'teacher-1',
    });
    const editedSource = {
      ...sourceDocument,
      title: 'Edited source after extraction',
    };

    expect(draft.document.title).not.toBe(editedSource.title);
    expect(repository.loadDraft(draft.draftId)?.document.title).toBe(draft.document.title);
  });
});
