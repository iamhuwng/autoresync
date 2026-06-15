import { describe, expect, it, vi } from 'vitest';
import { refreshReadingV2MasterAssignmentFromLatest } from './readingV2AssignmentRefreshRepository.service';

const composition = {
  deliveryEngine: 'reading-v2',
  plane: 'packaging',
  schemaVersion: 1,
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  title: 'Published Master',
  ownerId: 'teacher-1',
  publishedVersionId: 'composition-version-2',
  skill: 'reading',
  testTypeIds: ['ielts'],
  passageRefs: [{
    refId: 'ref-1',
    passageMaterialId: 'passage-1',
    materialId: 'passage-1',
    snapshotVersionId: 'snapshot-new',
    order: 1,
    sourceOrderDisplaySnapshot: 'Passage 1',
    titleSnapshot: 'Making Time for Science',
    questionCountSnapshot: 1,
    testTypeIdsSnapshot: ['ielts'],
    source: { sourceOrderDisplay: 'Passage 1' },
  }],
  questionCount: 1,
  numbering: { interactionDisplayNumbers: { q1: 1 }, passageRanges: [], totalQuestionCount: 1 },
  visibility: 'private',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const projection = {
  deliveryEngine: 'reading-v2',
  plane: 'projection',
  projectionId: 'student-safe:passage-1:snapshot-new',
  ownerId: 'teacher-1',
  materialId: 'passage-1',
  sourceSnapshotVersionId: 'snapshot-new',
  projectionKind: 'student-safe',
  generatedAt: '2026-06-10T00:00:00.000Z',
  runtimeContract: 'student-runtime',
  content: {
    title: 'Making Time for Science',
    materialId: 'passage-1',
    sections: [{ sectionId: 'section-1', title: 'Passage 1', stimulusIds: [], taskGroupIds: ['task-1'] }],
    stimuli: [],
    anchors: [],
    taskGroups: [{
      taskGroupId: 'task-1',
      engineeringFamily: 'multiple-choice',
      instructionBlocks: [],
      stimulusRefs: [],
      interactions: [{ interactionId: 'q1', taskGroupId: 'task-1', displayNumber: 1, responseShape: { kind: 'free-text' } }],
    }],
    optionSets: [],
  },
  analytics: { taskGroupCount: 1, interactionCount: 1, familyCounts: { 'multiple-choice': 1 } },
};

const homework = {
  id: 'homework-1',
  materialType: 'reading-passage-set',
  materialId: 'master-1',
  materialTitle: 'Published Master',
  readingPassageSet: {
    titleSnapshot: 'Published Master',
    compositionId: 'composition-1',
    compositionVersionId: 'composition-version-1',
    items: [{
      passageMaterialId: 'passage-1',
      snapshotVersionId: 'snapshot-old',
      titleSnapshot: 'Making Time for Science',
      questionCount: 1,
      testTypeIds: ['ielts'],
      order: 1,
    }],
  },
};

describe('readingV2AssignmentRefreshRepository.service', () => {
  it('loads latest composition/projections and writes frozen payload before homework patch', async () => {
    const writes: string[] = [];
    const updateHomeworkAssignment = vi.fn(async () => {
      writes.push('homework');
    });

    const result = await refreshReadingV2MasterAssignmentFromLatest({
      homework: homework as any,
      submissions: [{ id: 'sub-1', status: 'not_started' }] as any,
      generatedAt: '2026-06-10T00:00:00.000Z',
      adapter: {
        readRtdb: async (path) => {
          if (path === 'reading_v2/full_test_compositions/composition-1') {
            return composition;
          }
          if (path === 'reading_v2/projections/student_safe_tests/passage-1:snapshot-new') {
            return projection;
          }
          return null;
        },
        writeRtdb: async (path) => {
          writes.push(`payload:${path}`);
        },
        updateHomeworkAssignment,
      },
    });

    expect(writes).toEqual([
      'payload:reading_v2/projections/assignment_payloads/homework-1:composition-version-2',
      'homework',
    ]);
    expect(updateHomeworkAssignment).toHaveBeenCalledWith('homework-1', expect.objectContaining({
      readingV2AssignmentPayloadPath: 'reading_v2/projections/assignment_payloads/homework-1:composition-version-2',
      readingPassageSet: expect.objectContaining({
        compositionVersionId: 'composition-version-2',
        items: [expect.objectContaining({ snapshotVersionId: 'snapshot-new' })],
      }),
    }));
    expect(result.passageCount).toBe(1);
  });

  it('blocks from raw submission records before any writes', async () => {
    const writeRtdb = vi.fn(async () => undefined);

    await expect(refreshReadingV2MasterAssignmentFromLatest({
      homework: homework as any,
      submissions: [{ id: 'sub-1', status: 'assigned' }] as any,
      adapter: {
        readRtdb: async (path) => {
          if (path === 'reading_v2/full_test_compositions/composition-1') {
            return composition;
          }
          if (path === 'reading_v2/projections/student_safe_tests/passage-1:snapshot-new') {
            return projection;
          }
          return null;
        },
        writeRtdb,
        updateHomeworkAssignment: async () => undefined,
      },
    })).rejects.toThrow('already started');

    expect(writeRtdb).not.toHaveBeenCalled();
  });

  it('blocks broken current master refresh before reading projections or writing payloads', async () => {
    const readRtdb = vi.fn(async (path: string) => {
      if (path === 'reading_v2/full_test_compositions/composition-1') {
        return {
          ...composition,
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['archived'],
        };
      }
      return null;
    });
    const writeRtdb = vi.fn(async () => undefined);
    const updateHomeworkAssignment = vi.fn(async () => undefined);

    await expect(refreshReadingV2MasterAssignmentFromLatest({
      homework: homework as any,
      submissions: [{ id: 'sub-1', status: 'not_started' }] as any,
      adapter: {
        readRtdb,
        writeRtdb,
        updateHomeworkAssignment,
      },
    })).rejects.toThrow('unresolved broken Reading Passage refs');

    expect(readRtdb).toHaveBeenCalledTimes(1);
    expect(writeRtdb).not.toHaveBeenCalled();
    expect(updateHomeworkAssignment).not.toHaveBeenCalled();
  });
});
