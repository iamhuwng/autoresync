import { describe, expect, it } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import {
  READING_V2_PROJECTION_FIXTURES,
  READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE,
} from './fixtures/readingV2ProjectionFixtures';
import {
  composeReadingPassageSetProjection,
  getReadingPassageHomeworkLaunchItems,
  getReadingPassageHomeworkSummary,
} from './readingV2PassageHomeworkLaunch.service';

const clone = <T>(value: T): T => structuredClone(value) as T;

const makeHomework = (overrides: Partial<HomeworkAssignment>): HomeworkAssignment => ({
  id: 'homework-1',
  createdBy: 'teacher-1',
  createdAt: 1,
  updatedAt: 1,
  materialId: 'passage-a',
  materialTitle: 'Passage A',
  materialType: 'reading-passage',
  materialSkill: 'reading',
  target: { type: 'students', studentIds: ['student-1'] },
  scheduling: { dueDate: 999 },
  config: {
    timerMinutes: null,
    maxAttempts: 1,
    feedbackTiming: 'after_completion',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: true,
    showAttempts: true,
    showDueDate: true,
    showQuestionCount: true,
    showDuration: true,
  },
  status: 'active',
  stats: { totalAssigned: 1, started: 0, submitted: 0, lateSubmissions: 0 },
  ...overrides,
});

const makeProjection = (
  materialId: string,
  snapshotVersionId: string,
  title: string,
  baseProjection: ReadingV2DerivedProjection = READING_V2_PROJECTION_FIXTURES.studentSafe,
): ReadingV2DerivedProjection => {
  const projection = clone(baseProjection);

  return {
    ...projection,
    materialId: materialId as ReadingV2DerivedProjection['materialId'],
    projectionId: `student-safe:${materialId}:${snapshotVersionId}`,
    sourceSnapshotVersionId: snapshotVersionId as ReadingV2DerivedProjection['sourceSnapshotVersionId'],
    content: {
      ...projection.content,
      title,
      materialId,
    },
  };
};

describe('readingV2PassageHomeworkLaunch service', () => {
  it('summarizes single Reading Passage homework from assignment snapshot', () => {
    const homework = makeHomework({
      readingPassageSnapshot: {
        passageMaterialId: 'passage-a',
        snapshotVersionId: 'snapshot-a',
        titleSnapshot: 'Passage A',
        questionCount: 10,
        testTypeIds: ['ielts'],
        sourceOrderDisplay: 'Passage 1',
        sourceFullTestTitle: 'Source Test',
      },
    });

    expect(getReadingPassageHomeworkLaunchItems(homework)).toEqual([
      expect.objectContaining({
        passageMaterialId: 'passage-a',
        snapshotVersionId: 'snapshot-a',
        titleSnapshot: 'Passage A',
      }),
    ]);
    expect(getReadingPassageHomeworkSummary(homework)).toEqual(expect.objectContaining({
      kind: 'single',
      label: 'Reading Passage',
      title: 'Passage A',
      questionCount: 10,
      meta: ['Passage 1', 'Source Test', 'Snapshot snapshot-a'],
      sourceLabels: ['Passage 1 - Source Test'],
      testTypeLabels: ['IELTS'],
    }));
  });

  it('summarizes ordered Reading Passage set homework', () => {
    const homework = makeHomework({
      materialId: 'reading-passage-set:homework-1',
      materialTitle: 'Selected Reading Passages',
      materialType: 'reading-passage-set',
      readingPassageSet: {
        titleSnapshot: 'Selected Reading Passages',
        items: [
          {
            order: 2,
            passageMaterialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            titleSnapshot: 'Passage B',
            questionCount: 8,
            testTypeIds: ['ielts'],
            sourceOrderDisplay: 'Passage 2',
            sourceFullTestTitle: 'Source Test B',
          },
          {
            order: 1,
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCount: 10,
            testTypeIds: ['ielts'],
            sourceOrderDisplay: 'Passage 1',
            sourceFullTestTitle: 'Source Test A',
          },
        ],
      },
    });

    expect(getReadingPassageHomeworkLaunchItems(homework).map((item) => item.passageMaterialId)).toEqual([
      'passage-a',
      'passage-b',
    ]);
    expect(getReadingPassageHomeworkSummary(homework)).toEqual(expect.objectContaining({
      kind: 'set',
      label: 'Reading Passage Set',
      title: 'Selected Reading Passages',
      passageCount: 2,
      questionCount: 18,
      meta: ['2 passages', '18 questions'],
      sourceLabels: ['Passage 1 - Source Test A', 'Passage 2 - Source Test B'],
      testTypeLabels: ['IELTS'],
    }));
  });

  it('composes a Reading Passage set projection with stable ordered sections and collision-safe ids', () => {
    const homework = makeHomework({
      id: 'homework-set-1',
      materialId: 'reading-passage-set:homework-set-1',
      materialTitle: 'Selected Reading Passages',
      materialType: 'reading-passage-set',
      readingPassageSet: {
        titleSnapshot: 'Selected Reading Passages',
        items: [
          {
            order: 1,
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
          {
            order: 2,
            passageMaterialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            titleSnapshot: 'Passage B',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
        ],
      },
    });
    const firstProjection = makeProjection('passage-a', 'snapshot-a', 'Passage A');
    const secondProjection = makeProjection(
      'passage-b',
      'snapshot-b',
      'Passage B',
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['matching-features'].studentSafe,
    );

    const composed = composeReadingPassageSetProjection({
      homework,
      projections: [firstProjection, secondProjection],
      generatedAt: '2026-06-01T00:00:00.000Z',
    });
    const interactionIds = composed.content.taskGroups.flatMap((group) =>
      group.interactions.map((interaction) => interaction.interactionId),
    );
    const firstInteractionCount = firstProjection.content.taskGroups.reduce(
      (total, group) => total + group.interactions.length,
      0,
    );
    const optionSetIds = new Set(composed.content.optionSets.map((optionSet) => optionSet.optionSetId));
    const responseShapeOptionSetIds = composed.content.taskGroups.flatMap((group) =>
      group.interactions.flatMap((interaction) =>
        'optionSetId' in interaction.responseShape ? [interaction.responseShape.optionSetId] : [],
      ),
    );

    expect(composed.projectionId).toBe('homework-set:homework-set-1');
    expect(composed.content.title).toBe('Selected Reading Passages');
    expect(composed.content.sections[0].title).toContain('Passage 1: Passage A');
    expect(composed.content.sections.at(-1)?.title).toContain('Passage 2: Passage B');
    expect(interactionIds).toHaveLength(new Set(interactionIds).size);
    expect(interactionIds.every((interactionId) => interactionId.startsWith('passage-'))).toBe(true);
    expect(composed.content.taskGroups[0].interactions[0].displayNumber).toBe(1);
    expect(composed.content.taskGroups[firstProjection.content.taskGroups.length].interactions[0].displayNumber)
      .toBe(firstInteractionCount + 1);
    expect(responseShapeOptionSetIds.length).toBeGreaterThan(0);
    expect(responseShapeOptionSetIds.every((optionSetId) => optionSetIds.has(optionSetId))).toBe(true);
    expect(composed.analytics?.interactionCount).toBe(interactionIds.length);
  });

  it('composes a Reading Passage set when Firebase omits an empty optionSets array', () => {
    const homework = makeHomework({
      id: 'homework-set-1',
      materialId: 'reading-passage-set:homework-set-1',
      materialTitle: 'Selected Reading Passages',
      materialType: 'reading-passage-set',
      readingPassageSet: {
        titleSnapshot: 'Selected Reading Passages',
        items: [
          {
            order: 1,
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
          {
            order: 2,
            passageMaterialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            titleSnapshot: 'Passage B',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
        ],
      },
    });
    const firstProjection = makeProjection('passage-a', 'snapshot-a', 'Passage A');
    const secondProjection = makeProjection(
      'passage-b',
      'snapshot-b',
      'Passage B',
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['matching-features'].studentSafe,
    );
    delete (firstProjection.content as unknown as Record<string, unknown>).optionSets;

    const composed = composeReadingPassageSetProjection({
      homework,
      projections: [firstProjection, secondProjection],
      generatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(composed.content.optionSets).toEqual(
      secondProjection.content.optionSets.map((optionSet) =>
        expect.objectContaining({ optionSetId: `passage-2:${optionSet.optionSetId}` }),
      ),
    );
    expect(composed.analytics?.interactionCount).toBe(
      composed.content.taskGroups.reduce((sum, group) => sum + group.interactions.length, 0),
    );
  });
});
