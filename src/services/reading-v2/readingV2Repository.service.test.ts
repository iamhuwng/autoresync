import { describe, expect, it } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2PassageAssetVersion,
} from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  ReadingV2RepositoryConflictError,
  createReadingV2Repository,
} from './readingV2Repository.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const fixtureStimulusContent = () => {
  const document = fixtureDocument();
  const [stimulusId] = Object.keys(document.stimuli);
  return document.stimuli[stimulusId].content;
};

describe('readingV2Repository.service', () => {
  it('creates, loads, saves, autosaves, lists, discards, and duplicates isolated V2 drafts', () => {
    const repository = createReadingV2Repository();
    const draftId = readingV2Ids.draftId('draft-1');
    const duplicateDraftId = readingV2Ids.draftId('draft-2');
    const created = repository.createDraft({
      draftId,
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      now: '2026-04-25T00:00:00.000Z',
    });

    expect(repository.loadDraft(draftId)?.revisionToken).toBe(created.revisionToken);
    expect(created.revisionToken).toBe('draft-1-rev-1');

    const saved = repository.saveDraft({
      draftId,
      baseRevisionToken: created.revisionToken,
      document: created.document,
      now: '2026-04-25T00:01:00.000Z',
    });

    expect(saved.revisionToken).toBe('draft-1-rev-2');

    const autosaved = repository.autosaveDraft({
      draftId,
      baseRevisionToken: saved.revisionToken,
      document: saved.document,
    });
    expect(autosaved.revisionToken).toBe('draft-1-rev-3');
    const duplicated = repository.duplicateDraft(draftId, duplicateDraftId, 'teacher-1');

    expect(duplicated.draftId).toBe(duplicateDraftId);
    expect(repository.listDrafts('teacher-1')).toHaveLength(2);

    repository.discardDraft(draftId, autosaved.revisionToken);

    expect(repository.listDrafts('teacher-1').map((draft) => draft.draftId)).toEqual([
      duplicateDraftId,
    ]);
  });

  it('rejects stale revision tokens and returns conflict recovery options', () => {
    const repository = createReadingV2Repository();
    const created = repository.createDraft({
      draftId: readingV2Ids.draftId('draft-conflict'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
    });
    repository.saveDraft({
      draftId: created.draftId,
      baseRevisionToken: created.revisionToken,
      document: created.document,
    });

    expect(() =>
      repository.saveDraft({
        draftId: created.draftId,
        baseRevisionToken: created.revisionToken,
        document: created.document,
      }),
    ).toThrow(ReadingV2RepositoryConflictError);

    try {
      repository.saveDraft({
        draftId: created.draftId,
        baseRevisionToken: created.revisionToken,
        document: created.document,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReadingV2RepositoryConflictError);
      expect((error as ReadingV2RepositoryConflictError).payload.currentRevisionToken).toBe(
        'draft-conflict-rev-2',
      );
    }
  });

  it('preserves stable canonical object IDs across draft saves', () => {
    const repository = createReadingV2Repository();
    const created = repository.createDraft({
      draftId: readingV2Ids.draftId('draft-stable'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
    });
    const saved = repository.saveDraft({
      draftId: created.draftId,
      baseRevisionToken: created.revisionToken,
      document: {
        ...created.document,
        title: 'Renamed fixture',
      },
    });

    expect(saved.document.documentId).toBe(created.document.documentId);
    expect(saved.document.sectionIds).toEqual(created.document.sectionIds);
    expect(Object.keys(saved.document.interactions)).toEqual(Object.keys(created.document.interactions));
  });

  it('creates immutable published snapshots and never mutates old versions on republish', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-1');
    const snapshotOneId = readingV2Ids.snapshotVersionId('snapshot-1');
    const snapshotTwoId = readingV2Ids.snapshotVersionId('snapshot-2');
    const document = fixtureDocument();

    const first = repository.publishSnapshot({
      materialId,
      snapshotVersionId: snapshotOneId,
      ownerId: 'teacher-1',
      document,
      publishedBy: 'teacher-1',
    });
    const second = repository.publishSnapshot({
      materialId,
      snapshotVersionId: snapshotTwoId,
      ownerId: 'teacher-1',
      document: { ...document, title: 'Republished document' },
      publishedBy: 'teacher-1',
    });

    expect(first.snapshotVersionId).not.toBe(second.snapshotVersionId);
    expect(first.ownerId).toBe('teacher-1');
    expect(repository.loadPublishedSnapshot(materialId, snapshotOneId)?.document.title).toBe(document.title);
    expect(() =>
      repository.publishSnapshot({
        materialId,
        snapshotVersionId: snapshotOneId,
        ownerId: 'teacher-1',
        document,
        publishedBy: 'teacher-1',
      }),
    ).toThrow(/immutable/);
  });

  it('tracks passage asset dependencies and requires derivative versions instead of mutating published dependents', () => {
    const repository = createReadingV2Repository();
    const assetId = readingV2Ids.passageAssetId('asset-1');
    const derivativeAssetId = readingV2Ids.passageAssetId('asset-2');
    const version: ReadingV2PassageAssetVersion = {
      passageAssetId: assetId,
      versionId: 'v1',
      title: 'Original passage',
      content: fixtureStimulusContent(),
      paragraphAnchorIds: [],
    };

    repository.savePassageAsset({
      passageAssetId: assetId,
      ownerId: 'teacher-1',
      state: 'published',
      currentVersionId: 'v1',
    });
    repository.savePassageAssetVersion(version);
    repository.addWhereUsedEntry({
      passageAssetId: assetId,
      ownerId: 'teacher-1',
      consumerId: 'material-1',
      consumerKind: 'task-group-material',
    });

    expect(() => repository.savePassageAssetVersion(version)).toThrow(/immutable/);

    const derivative = repository.createDerivativePassageAsset({
      sourcePassageAssetId: assetId,
      derivativePassageAssetId: derivativeAssetId,
      ownerId: 'teacher-1',
      version: {
        versionId: 'v1',
        title: 'Adapted passage',
        content: fixtureStimulusContent(),
        paragraphAnchorIds: [],
      },
    });

    expect(derivative.passageAssetId).toBe(derivativeAssetId);
    expect(derivative.provenance?.sourcePassageAssetId).toBe(assetId);
    expect(repository.getWhereUsedEntries(assetId)).toHaveLength(1);
  });

  it('upserts duplicate where-used edges for the same consumer instead of appending copies', () => {
    const repository = createReadingV2Repository();
    const passageAssetId = readingV2Ids.passageAssetId('asset-dedupe');

    repository.addWhereUsedEntry({
      passageAssetId,
      ownerId: 'teacher-1',
      consumerId: 'material-1',
      consumerKind: 'task-group-material',
    });
    repository.addWhereUsedEntry({
      passageAssetId,
      ownerId: 'teacher-1',
      consumerId: 'material-1',
      consumerKind: 'task-group-material',
    });

    expect(repository.getWhereUsedEntries(passageAssetId)).toHaveLength(1);
  });

  it('creates packaging records with Reading V2 discriminators instead of legacy shape sniffing', () => {
    const repository = createReadingV2Repository();
    const material = repository.createTaskGroupMaterial({
      materialId: readingV2Ids.materialId('material-packaging'),
      ownerId: 'teacher-1',
      state: 'draft',
      primaryPassageAssetVersionId: 'asset-1/v1',
      taskGroupIds: [readingV2Ids.taskGroupId('task-group-1')],
    });

    expect(material.deliveryEngine).toBe('reading-v2');
    expect(material.plane).toBe('packaging');
    expect(material.ownerId).toBe('teacher-1');
  });
});
