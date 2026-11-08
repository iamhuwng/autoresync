import { describe, expect, it, vi } from 'vitest';
import { createReadingV2ReferenceUpdateRepository } from './readingV2ReferenceUpdateRepository.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { buildReadingV2AuthoringRecoveryRecord, readingV2AuthoringRecoveryRecordId } from './readingV2PublicationRecovery.service';

const composition = {
  deliveryEngine: 'reading-v2',
  plane: 'packaging',
  schemaVersion: 1,
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  title: 'Owned master',
  skill: 'reading',
  testTypeIds: ['ielts'],
  passageRefs: [{
    refId: 'ref-1',
    passageMaterialId: 'passage-1',
    materialId: 'passage-1',
    snapshotVersionId: 'snapshot-old',
    order: 1,
    sourceOrderLabelSnapshot: 'Passage 1',
    sourceOrderDisplaySnapshot: 'Passage 1',
    titleSnapshot: 'Old title',
    title: 'Old title',
    source: {},
    questionCountSnapshot: 13,
    questionCount: 13,
    ownerId: 'teacher-1',
    visibility: 'private',
    currentVersionId: 'snapshot-old',
    testType: { testTypeIds: ['ielts'] },
    testTypeIdsSnapshot: ['ielts'],
  }],
  questionCount: 13,
  numbering: { interactionDisplayNumbers: {}, passageRanges: [], totalQuestionCount: 13 },
  visibility: 'private',
  ownerId: 'teacher-1',
  publishedVersionId: 'master-version-1',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const ownerSummary = {
  materialId: 'master-1',
  ownerId: 'teacher-1',
  materialKind: 'full-test',
  lifecycleState: 'active',
};

const materialMetadata = {
  materialId: 'master-1',
  ownerId: 'teacher-1',
  materialKind: 'reading-v2-full-test-composition',
  compositionId: 'composition-1',
  state: 'published',
  materialRevision: 1,
  publishedSnapshotVersionId: 'master-version-1',
  title: 'Owned master',
};

const book = {
  bookId: 'book-1',
  ownerId: 'teacher-1',
  title: 'Owned Book',
  authors: [],
  visibility: 'private',
  status: 'ready',
  testTypeIds: ['ielts'],
  tags: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
};

const bookNode = {
  nodeId: 'node-1',
  bookId: 'book-1',
  parentNodeId: null,
  type: 'test',
  title: 'Node',
  order: 1,
  materialRefs: [{
    refId: 'book-ref-1',
    materialId: 'passage-1',
    materialKind: 'reading-passage',
    snapshotVersionId: 'snapshot-old',
    titleSnapshot: 'Old title',
    testTypeIdsSnapshot: ['ielts'],
    availability: 'available',
    updateState: 'current',
    order: 1,
    addedAt: '2026-06-10T00:00:00.000Z',
    addedBy: 'teacher-1',
  }],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

describe('readingV2ReferenceUpdateRepository.service', () => {
  it('discovers owner-indexed masters and persists selected Book reference updates only', async () => {
    const update = vi.fn(async () => undefined);
    const repository = createReadingV2ReferenceUpdateRepository({
      read: async (path) => {
        if (path === 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1') {
          return { [ownerSummary.materialId]: ownerSummary };
        }
        if (path === readingV2StoragePaths.materialMetadata('master-1')) {
          return materialMetadata;
        }
        if (path === readingV2StoragePaths.fullTestCompositions('composition-1')) {
          return { ...composition, materialRevision: 1 };
        }
        if (path === 'material_catalog/book_indexes/by_owner/teacher-1') {
          return { [book.bookId]: book };
        }
        if (path === 'material_catalog/book_nodes/book-1') {
          return { [bookNode.nodeId]: bookNode };
        }
        return null;
      },
      update,
    });

    const summary = await repository.discoverTargets({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      frozenAssignmentCount: 2,
      resultSnapshotCount: 3,
    });
    const result = await repository.applySelected({
      summary,
      selectedTargetIds: ['book:book-1:node-1:book-ref-1'],
    });

    expect(result.updatedTargetIds).toEqual(['book:book-1:node-1:book-ref-1']);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      'material_catalog/book_nodes/book-1/node-1': expect.objectContaining({
        materialRefs: [expect.objectContaining({ snapshotVersionId: 'snapshot-new' })],
      }),
    }));
    expect(JSON.stringify(update.mock.calls[0]?.[0])).not.toContain('assignment_payloads');
    expect(JSON.stringify(update.mock.calls[0]?.[0])).not.toContain('results');
  });

  it('writes nothing when no selectable targets are selected', async () => {
    const update = vi.fn(async () => undefined);
    const repository = createReadingV2ReferenceUpdateRepository({
      read: async (path) => {
        if (path === 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1') {
          return { [ownerSummary.materialId]: ownerSummary };
        }
        if (path === readingV2StoragePaths.materialMetadata('master-1')) {
          return materialMetadata;
        }
        if (path === readingV2StoragePaths.fullTestCompositions('composition-1')) {
          return { ...composition, materialRevision: 1 };
        }
        if (path === 'material_catalog/book_indexes/by_owner/teacher-1') {
          return {};
        }
        return null;
      },
      update,
    });

    const summary = await repository.discoverTargets({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
    });
    await repository.applySelected({ summary, selectedTargetIds: [] });

    expect(update).not.toHaveBeenCalled();
  });

  it('rebuilds composition-first child bases from the selected refs and immutable child versions', async () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const nextDocument = { ...document, title: 'New child title' };
    const recovery = buildReadingV2AuthoringRecoveryRecord({
      materialId: 'master-1' as any,
      snapshotVersionId: 'master-version-1' as any,
      ownerId: 'teacher-1', createdAt: '2026-06-10T00:00:00.000Z', createdBy: 'teacher-1',
      locator: { kind: 'inline', document },
      authoring: {
        metadata: { title: 'Owned master', materialKind: 'full-test', visibility: 'private' },
        expectedBases: {
          compositionId: 'composition-1',
          generatedPassages: [{
            sectionId: document.sectionIds[0], materialId: 'passage-1',
            snapshotVersionId: 'snapshot-old', materialRevision: 4,
          }],
        },
      },
    });
    const childMetadata = {
      materialId: 'passage-1', ownerId: 'teacher-1', title: 'Child', state: 'published',
      publishedSnapshotVersionId: 'snapshot-new', materialRevision: 5,
    };
    const childVersion = (snapshotVersionId: string, childDocument: typeof document, materialRevision: number) => ({
      passageMaterialId: 'passage-1', currentSnapshotVersionId: snapshotVersionId,
      ownerId: 'teacher-1', materialRevision,
      document: childDocument, publishedAt: '2026-06-10T00:00:00.000Z', publishedBy: 'teacher-1',
    });
    const records: Record<string, unknown> = {
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1': { [ownerSummary.materialId]: ownerSummary },
      [readingV2StoragePaths.materialMetadata('master-1')]: materialMetadata,
      [readingV2StoragePaths.fullTestCompositions('composition-1')]: { ...composition, state: 'published', materialRevision: 1 },
      'material_catalog/book_indexes/by_owner/teacher-1': {},
      [readingV2StoragePaths.provenance(readingV2AuthoringRecoveryRecordId('master-1' as any, 'master-version-1' as any))]: recovery,
      [readingV2StoragePaths.publishedSnapshots('passage-1', 'snapshot-old')]: {
        ...childVersion('snapshot-old', document, 4), materialId: 'passage-1', snapshotVersionId: 'snapshot-old',
      },
      [readingV2StoragePaths.publishedSnapshots('passage-1', 'snapshot-new')]: {
        ...childVersion('snapshot-new', nextDocument, 5), materialId: 'passage-1', snapshotVersionId: 'snapshot-new',
      },
      [readingV2StoragePaths.materialMetadata('passage-1')]: childMetadata,
      [readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-old')]: childVersion('snapshot-old', document, 4),
      [readingV2StoragePaths.readingPassageMaterialVersions('passage-1', 'snapshot-new')]: childVersion('snapshot-new', nextDocument, 5),
    };
    const update = vi.fn(async (payload: Record<string, unknown>) => {
      Object.assign(records, payload);
    });
    const repository = createReadingV2ReferenceUpdateRepository({
      read: async (path) => records[path] ?? null,
      update,
    });
    const summary = await repository.discoverTargets({
      ownerId: 'teacher-1', passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old', nextSnapshotVersionId: 'snapshot-new',
    });

    await repository.applySelected({
      summary,
      selectedTargetIds: ['master:composition-1:ref-1'],
    });

    const recoveryWrite = Object.values(update.mock.calls[0]?.[0] ?? {}).find((value) =>
      (value as any)?.kind === 'authoring-recovery' && (value as any)?.materialId === 'master-1') as any;
    expect(recoveryWrite).toEqual(expect.objectContaining({
      authoring: expect.objectContaining({
        expectedBases: expect.objectContaining({
          generatedPassages: [{
            sectionId: document.sectionIds[0], materialId: 'passage-1',
            snapshotVersionId: 'snapshot-new', materialRevision: 5,
          }],
        }),
      }),
    }));
  });
});
