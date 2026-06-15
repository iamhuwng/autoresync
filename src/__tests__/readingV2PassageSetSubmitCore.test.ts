import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  buildReadingV2TrustedSubmissionPlan,
  composeReadingPassageSetTrustedRecords,
  parseReadingV2TrustedSubmissionRequest,
} from '../../functions/src/readingV2SubmitCore';
import { composeReadingV2CompositionNumbering } from '../services/reading-v2/readingV2CompositionNumbering.service';

const makeSnapshot = (input: { materialId: string; snapshotVersionId: string; answer: string }) => ({
  snapshotVersionId: input.snapshotVersionId,
  materialId: input.materialId,
  ownerId: 'teacher-1',
  publishedAt: '2026-06-01T00:00:00.000Z',
  publishedBy: 'teacher-1',
  document: {
    interactions: {
      interaction_1: {
        interactionId: 'interaction_1',
        taskGroupId: 'task_group_1',
        responseShape: { kind: 'free-text' },
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: [input.answer],
        },
      },
    },
    taskGroups: {
      task_group_1: {
        taskGroupId: 'task_group_1',
        officialTaskType: 'sentence-completion',
        engineeringFamily: 'completion',
      },
    },
  },
});

const makeReviewProjection = (input: { snapshotVersionId: string; title: string }) => ({
  deliveryEngine: READING_V2_ENGINE,
  projectionKind: 'review',
  sourceSnapshotVersionId: input.snapshotVersionId,
  content: {
    title: input.title,
    stimuli: [{
      stimulusId: 'stimulus_1',
      kind: 'passage',
      title: input.title,
      content: {
        kind: 'passage-content',
        paragraphs: [{ anchorId: 'anchor_1', text: `${input.title} text.` }],
      },
    }],
    anchors: [{
      anchorId: 'anchor_1',
      stimulusId: 'stimulus_1',
      kind: 'paragraph',
      label: 'Paragraph 1',
    }],
    taskGroups: [{
      taskGroupId: 'task_group_1',
      groupTitle: `Questions for ${input.title}`,
      officialTaskType: 'sentence-completion',
      engineeringFamily: 'completion',
      instructionBlocks: [{ id: 'instruction_1', text: 'Complete the answer.' }],
      stimulusRefs: [{ stimulusId: 'stimulus_1', anchorIds: ['anchor_1'] }],
      interactions: [{
        interactionId: 'interaction_1',
        taskGroupId: 'task_group_1',
        displayNumber: 1,
      }],
    }],
  },
});

const homework = {
  id: 'hw-set-1',
  materialId: 'reading-passage-set:hw-set-1',
  materialType: 'reading-passage-set',
  title: 'Selected Reading Passages',
  createdBy: 'teacher-1',
  readingPassageSet: {
    titleSnapshot: 'Selected Reading Passages',
    items: [
      {
        order: 1,
        passageMaterialId: 'passage-a',
        snapshotVersionId: 'snapshot-a',
        titleSnapshot: 'Passage A',
        questionCount: 1,
        sourceOrderDisplay: 'Passage 1',
        sourceFullTestTitle: 'Mock Test A',
      },
      {
        order: 2,
        passageMaterialId: 'passage-b',
        snapshotVersionId: 'snapshot-b',
        titleSnapshot: 'Passage B',
        questionCount: 1,
        sourceOrderDisplay: 'Passage 2',
        sourceFullTestTitle: 'Mock Test B',
      },
    ],
  },
};

const buildRecords = () => composeReadingPassageSetTrustedRecords({
  homework,
  passageRecords: [
    {
      item: homework.readingPassageSet.items[0],
      snapshot: makeSnapshot({ materialId: 'passage-a', snapshotVersionId: 'snapshot-a', answer: 'Answer A' }),
      reviewProjection: makeReviewProjection({ snapshotVersionId: 'snapshot-a', title: 'Passage A' }),
    },
    {
      item: homework.readingPassageSet.items[1],
      snapshot: makeSnapshot({ materialId: 'passage-b', snapshotVersionId: 'snapshot-b', answer: 'Answer B' }),
      reviewProjection: makeReviewProjection({ snapshotVersionId: 'snapshot-b', title: 'Passage B' }),
    },
  ],
});

describe('Reading Passage set trusted submission core', () => {
  it('scores assigned set passages through the trusted Reading V2 plan', () => {
    const numbering = composeReadingV2CompositionNumbering({
      passages: [
        {
          order: 1,
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          interactions: [{ interactionId: 'passage-1:interaction_1' }],
        },
        {
          order: 2,
          passageMaterialId: 'passage-b',
          snapshotVersionId: 'snapshot-b',
          interactions: [{ interactionId: 'passage-2:interaction_1' }],
        },
      ],
    });
    const request = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'homework-set:hw-set-1',
      sourceSnapshotVersionId: 'homework-set:hw-set-1',
      materialId: 'reading-passage-set:hw-set-1',
      answers: [
        {
          interactionId: 'passage-1:interaction_1',
          taskGroupId: 'passage-1:task_group_1',
          displayNumber: numbering.interactionDisplayNumbers['passage-1:interaction_1']!,
          value: 'answer a',
        },
        {
          interactionId: 'passage-2:interaction_1',
          taskGroupId: 'passage-2:task_group_1',
          displayNumber: numbering.interactionDisplayNumbers['passage-2:interaction_1']!,
          value: 'answer b',
        },
      ],
      context: {
        surface: 'homework',
        homeworkId: 'hw-set-1',
      },
    });

    const plan = buildReadingV2TrustedSubmissionPlan({
      request,
      auth: { uid: 'student-1', name: 'Student One' },
      records: buildRecords(),
      identity: {
        resultId: 'result-set-1',
        attemptId: 'attempt-set-1',
        submittedAtIso: '2026-06-01T00:05:00.000Z',
        submittedAtMs: 1780272300000,
      },
    });

    expect(plan.response).toEqual(expect.objectContaining({
      totalScore: 2,
      maxScore: 2,
      percentage: 100,
    }));
    expect(plan.savedResult.readingV2.reviewPayload).toEqual(expect.objectContaining({
      materialKind: 'reading-passage-set',
      materialLabel: 'Reading Passage Set',
    }));
    expect(plan.savedResult.readingV2.reviewPayload.taskGroups[0].passageSection).toEqual(expect.objectContaining({
      title: 'Passage A',
      snapshotVersionId: 'snapshot-a',
      sourceFullTestTitle: 'Mock Test A',
    }));
  });

  it('rejects answers that do not bind to the assigned set projection', () => {
    const request = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'homework-set:hw-set-1',
      sourceSnapshotVersionId: 'homework-set:hw-set-1',
      materialId: 'reading-passage-set:hw-set-1',
      answers: [{
        interactionId: 'passage-1:interaction_1',
        taskGroupId: 'passage-1:task_group_1',
        displayNumber: 99,
        value: 'answer a',
      }],
      context: {
        surface: 'homework',
        homeworkId: 'hw-set-1',
      },
    });

    expect(() => buildReadingV2TrustedSubmissionPlan({
      request,
      auth: { uid: 'student-1' },
      records: buildRecords(),
      identity: {
        resultId: 'result-set-1',
        attemptId: 'attempt-set-1',
        submittedAtIso: '2026-06-01T00:05:00.000Z',
        submittedAtMs: 1780272300000,
      },
    })).toThrow('display number binding');
  });
});
