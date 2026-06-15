import { describe, expect, it } from 'vitest';
import {
  assertReadingV2AssignmentCanRefresh,
  createReadingV2AssignmentPayload,
  createReadingV2MasterHomeworkSet,
  createReadingPassageHomeworkSnapshot,
  createReadingPassageSetHomework,
  refreshReadingV2MasterAssignment,
} from './readingV2PassageHomework.service';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'passage-1',
  title: 'Making Time for Science',
  questionCount: 13,
  testTypeIds: ['ielts'],
  sourceOrderDisplay: 'Passage 1',
  sourceFullTestTitle: 'British Council Practice Test 01',
  publishedSnapshotVersionId: 'snapshot-1',
  hasStudentSafeProjection: true,
  accessible: true,
  archived: false,
  ...overrides,
});

const passageRef = (overrides: Record<string, unknown> = {}) => ({
  refId: 'ref-1',
  passageMaterialId: 'passage-1',
  materialId: 'passage-1',
  snapshotVersionId: 'snapshot-1',
  order: 1,
  sourceOrderDisplaySnapshot: 'Passage 1',
  titleSnapshot: 'Making Time for Science',
  questionCountSnapshot: 13,
  testTypeIdsSnapshot: ['ielts'],
  source: { sourceOrderDisplay: 'Passage 1', sourceFullTestTitle: 'British Council Practice Test 01' },
  ...overrides,
});

const composition = (overrides: Record<string, unknown> = {}) => ({
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  title: 'Published Master',
  ownerId: 'teacher-1',
  publishedVersionId: 'composition-version-1',
  passageRefs: [passageRef()],
  ...overrides,
});

const projection = (overrides: Record<string, unknown> = {}) => ({
  deliveryEngine: 'reading-v2',
  plane: 'projection',
  projectionId: 'projection-1',
  ownerId: 'teacher-1',
  materialId: 'passage-1',
  sourceSnapshotVersionId: 'snapshot-1',
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
      interactions: [{
        interactionId: 'q1',
        taskGroupId: 'task-1',
        displayNumber: 1,
        responseShape: { kind: 'free-text' },
      }],
    }],
    optionSets: [],
  },
  analytics: { taskGroupCount: 1, interactionCount: 1, familyCounts: { 'multiple-choice': 1 } },
  ...overrides,
});

describe('readingV2PassageHomework.service', () => {
  it('freezes a single Reading Passage to assignment-time snapshot metadata', () => {
    expect(createReadingPassageHomeworkSnapshot(candidate())).toEqual({
      passageMaterialId: 'passage-1',
      snapshotVersionId: 'snapshot-1',
      titleSnapshot: 'Making Time for Science',
      questionCount: 13,
      testTypeIds: ['ielts'],
      sourceOrderDisplay: 'Passage 1',
      sourceFullTestTitle: 'British Council Practice Test 01',
    });
  });

  it('freezes selected Reading Passages as an ordered homework set', () => {
    expect(createReadingPassageSetHomework([
      candidate({ materialId: 'passage-2', title: 'Second Passage', publishedSnapshotVersionId: 'snapshot-2' }),
      candidate({ materialId: 'passage-1', title: 'First Passage', publishedSnapshotVersionId: 'snapshot-1' }),
    ], 'Custom passage set')).toEqual({
      titleSnapshot: 'Custom passage set',
      items: [
        expect.objectContaining({
          order: 1,
          passageMaterialId: 'passage-2',
          snapshotVersionId: 'snapshot-2',
          titleSnapshot: 'Second Passage',
        }),
        expect.objectContaining({
          order: 2,
          passageMaterialId: 'passage-1',
          snapshotVersionId: 'snapshot-1',
          titleSnapshot: 'First Passage',
        }),
      ],
    });
  });

  it('rejects unpublished, archived, inaccessible, or projection-missing Reading Passages', () => {
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ publishedSnapshotVersionId: '' })))
      .toThrow('published snapshot');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ archived: true })))
      .toThrow('archived');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ accessible: false })))
      .toThrow('inaccessible');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ hasStudentSafeProjection: false })))
      .toThrow('student-safe projection');
  });

  it('freezes a composition master into assignment items and an immutable assignment payload path', () => {
    const homeworkSet = createReadingV2MasterHomeworkSet({
      composition: composition() as any,
      homeworkId: 'homework-1',
    });
    const payload = createReadingV2AssignmentPayload({
      homeworkId: 'homework-1',
      composition: composition() as any,
      homeworkSet,
      projections: [projection() as any],
      generatedAt: '2026-06-10T00:00:00.000Z',
    });

    expect(homeworkSet).toEqual(expect.objectContaining({
      titleSnapshot: 'Published Master',
      compositionId: 'composition-1',
      compositionVersionId: 'composition-version-1',
      assignmentPayloadPath: 'reading_v2/projections/assignment_payloads/homework-1:composition-version-1',
    }));
    expect(payload.path).toBe('reading_v2/projections/assignment_payloads/homework-1:composition-version-1');
    expect(payload.projection.sourceSnapshotVersionId).toBe('homework-set:homework-1');
    expect(payload.projection.assignmentManifest).toEqual(expect.objectContaining({
      compositionId: 'composition-1',
      compositionVersionId: 'composition-version-1',
      frozenAt: '2026-06-10T00:00:00.000Z',
    }));
  });

  it('blocks assigning removed or broken current master compositions', () => {
    expect(() => createReadingV2MasterHomeworkSet({
      composition: composition({
        state: 'removed',
      }) as any,
      homeworkId: 'homework-1',
    })).toThrow(/removed/);

    expect(() => createReadingV2MasterHomeworkSet({
      composition: composition({
        hasBrokenRefs: true,
        brokenRefCount: 1,
        brokenRefReasons: ['archived'],
      }) as any,
      homeworkId: 'homework-1',
    })).toThrow(/broken Reading Passage refs/);
  });

  it('blocks refresh once any real submission has started', () => {
    expect(() => assertReadingV2AssignmentCanRefresh([
      { id: 'submission-1', status: 'in_progress', startedAt: 1791565200000 },
    ] as any)).toThrow('already started');

    expect(() => assertReadingV2AssignmentCanRefresh([
      { id: 'submission-1', status: 'assigned' },
    ] as any)).toThrow('already started');

    expect(() => assertReadingV2AssignmentCanRefresh([
      { id: 'submission-1', status: 'not_started' },
    ] as any)).not.toThrow();
  });

  it('writes refreshed assignment payload before updating the homework pointer', async () => {
    const writes: string[] = [];
    const repository = {
      writeAssignmentPayload: async (path: string) => {
        writes.push(`payload:${path}`);
      },
      updateHomeworkAssignment: async (homeworkId: string) => {
        writes.push(`homework:${homeworkId}`);
      },
    };

    const result = await refreshReadingV2MasterAssignment({
      homeworkId: 'homework-1',
      composition: composition({ publishedVersionId: 'composition-version-2' }) as any,
      homeworkSet: createReadingV2MasterHomeworkSet({
        composition: composition({ publishedVersionId: 'composition-version-2' }) as any,
        homeworkId: 'homework-1',
      }),
      projections: [projection() as any],
      submissions: [],
      repository,
      generatedAt: '2026-06-10T00:00:00.000Z',
    });

    expect(writes).toEqual([
      'payload:reading_v2/projections/assignment_payloads/homework-1:composition-version-2',
      'homework:homework-1',
    ]);
    expect(result.homeworkPatch.readingPassageSet.assignmentPayloadPath).toBe(
      'reading_v2/projections/assignment_payloads/homework-1:composition-version-2',
    );
  });
});
