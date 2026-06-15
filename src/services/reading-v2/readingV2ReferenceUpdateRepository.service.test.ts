import { describe, expect, it, vi } from 'vitest';
import { createReadingV2ReferenceUpdateRepository } from './readingV2ReferenceUpdateRepository.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

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
  it('persists selected owned master and Book reference updates only', async () => {
    const update = vi.fn(async () => undefined);
    const repository = createReadingV2ReferenceUpdateRepository({
      read: async (path) => {
        if (path === 'reading_v2/full_test_compositions') {
          return { [composition.compositionId]: composition };
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
      selectedTargetIds: [
        'master:composition-1:ref-1',
        'book:book-1:node-1:book-ref-1',
      ],
    });

    expect(result.updatedTargetIds.sort()).toEqual([
      'book:book-1:node-1:book-ref-1',
      'master:composition-1:ref-1',
    ]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      [readingV2StoragePaths.fullTestCompositions('composition-1')]: expect.objectContaining({
        passageRefs: [expect.objectContaining({ snapshotVersionId: 'snapshot-new' })],
      }),
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
        if (path === 'reading_v2/full_test_compositions') {
          return { [composition.compositionId]: composition };
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
});
