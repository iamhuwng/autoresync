import { describe, expect, it } from 'vitest';
import {
  applyReadingV2SelectedReferenceUpdates,
  findReadingV2ReferenceUpdateTargets,
} from './readingV2ReferenceUpdate.service';

const passageRef = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const composition = (overrides: Record<string, unknown> = {}) => ({
  deliveryEngine: 'reading-v2',
  plane: 'packaging',
  schemaVersion: 1,
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  title: 'Owned master',
  skill: 'reading',
  testTypeIds: ['ielts'],
  passageRefs: [passageRef()],
  questionCount: 13,
  numbering: {
    interactionDisplayNumbers: {},
    passageRanges: [],
    totalQuestionCount: 13,
  },
  visibility: 'private',
  ownerId: 'teacher-1',
  publishedVersionId: 'master-version-1',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
  ...overrides,
});

const book = (overrides: Record<string, unknown> = {}) => ({
  bookId: 'book-1',
  title: 'Owned book',
  ownerId: 'teacher-1',
  nodes: [
    {
      id: 'node-1',
      kind: 'material',
      title: 'Old title',
      materialRef: {
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
      },
    },
  ],
  ...overrides,
});

describe('readingV2ReferenceUpdate.service', () => {
  it('finds only owned masters and books that still point at the previous single-passage version', () => {
    const summary = findReadingV2ReferenceUpdateTargets({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      masters: [
        composition(),
        composition({
          compositionId: 'composition-other',
          ownerId: 'teacher-2',
          title: 'Other teacher master',
        }),
        composition({
          compositionId: 'composition-current',
          title: 'Already current',
          passageRefs: [passageRef({ snapshotVersionId: 'snapshot-new' })],
        }),
      ] as any,
      books: [
        book(),
        book({ bookId: 'book-other', ownerId: 'teacher-2', title: 'Other teacher book' }),
      ] as any,
    });

    expect(summary.targets.map((target) => target.id).sort()).toEqual([
      'book:book-1:node-1:book-ref-1',
      'master:composition-1:ref-1',
    ]);
    expect(summary.targets.every((target) => target.selectable)).toBe(true);
    expect(summary.excluded.nonOwnedReferenceCount).toBe(2);
    expect(summary.excluded.alreadyCurrentCount).toBe(1);
    expect(summary.excluded.frozenAssignmentCount).toBe(0);
    expect(summary.excluded.resultSnapshotCount).toBe(0);
  });

  it('supports real Book nodes with nodeId and materialRefs arrays', () => {
    const summary = findReadingV2ReferenceUpdateTargets({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      masters: [],
      books: [{
        bookId: 'book-real',
        title: 'Real book',
        ownerId: 'teacher-1',
        nodes: [{
          nodeId: 'node-real',
          bookId: 'book-real',
          materialRefs: [
            {
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
            },
          ],
        }],
      }] as any,
    });

    expect(summary.targets.map((target) => target.id)).toEqual(['book:book-real:node-real:book-ref-1']);

    const result = applyReadingV2SelectedReferenceUpdates({
      summary,
      selectedTargetIds: ['book:book-real:node-real:book-ref-1'],
      masters: [],
      books: [{
        bookId: 'book-real',
        title: 'Real book',
        ownerId: 'teacher-1',
        nodes: [{
          nodeId: 'node-real',
          bookId: 'book-real',
          materialRefs: [
            {
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
            },
          ],
        }],
      }] as any,
    });

    expect(result.updatedBooks[0]?.nodes[0]?.materialRefs?.[0]?.snapshotVersionId).toBe('snapshot-new');
  });

  it('updates selected references only and never mutates frozen assignment or result projections', () => {
    const ownedMaster = composition();
    const ownedBook = book();
    const summary = findReadingV2ReferenceUpdateTargets({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-1',
      previousSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      masters: [ownedMaster] as any,
      books: [ownedBook] as any,
      frozenAssignmentCount: 3,
      resultSnapshotCount: 7,
    });

    const result = applyReadingV2SelectedReferenceUpdates({
      summary,
      selectedTargetIds: ['master:composition-1:ref-1'],
      masters: [ownedMaster] as any,
      books: [ownedBook] as any,
    });

    expect(result.updatedMasters).toHaveLength(1);
    expect(result.updatedMasters[0]?.passageRefs[0]?.snapshotVersionId).toBe('snapshot-new');
    expect(result.updatedBooks).toHaveLength(0);
    expect(result.skippedTargetIds).toEqual(['book:book-1:node-1:book-ref-1']);
    expect(result.immutableFrozenCounts).toEqual({
      frozenAssignmentCount: 3,
      resultSnapshotCount: 7,
    });
  });
});
