import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  buildReadingV2TrustedSubmissionPlan,
  composeReadingPassageSetTrustedRecords,
  parseReadingV2TrustedSubmissionRequest,
} from './readingV2SubmitCore';

const makeSnapshot = () => ({
  snapshotVersionId: 'snapshot-1',
  materialId: 'material-1',
  ownerId: 'teacher-1',
  publishedAt: '2026-04-29T00:00:00.000Z',
  publishedBy: 'teacher-1',
  document: {
    interactions: {
      interaction_1: {
        interactionId: 'interaction_1',
        taskGroupId: 'task_group_1',
        responseShape: { kind: 'free-text' },
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: ['Answer One'],
        },
        reviewLabel: { displayNumber: 1 },
      },
      interaction_2: {
        interactionId: 'interaction_2',
        taskGroupId: 'task_group_1',
        responseShape: { kind: 'single-choice' },
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: ['B'],
        },
        reviewLabel: { displayNumber: 2 },
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

const makeReviewProjection = () => ({
  deliveryEngine: READING_V2_ENGINE,
  projectionKind: 'review',
  sourceSnapshotVersionId: 'snapshot-1',
  content: {
    title: 'Trusted Reading Test',
    stimuli: [{
      stimulusId: 'stimulus_1',
      kind: 'passage',
      content: {
        kind: 'passage-content',
        paragraphs: [{
          anchorId: 'anchor_1',
          text: 'A short passage for review context.',
        }],
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
      officialTaskType: 'sentence-completion',
      engineeringFamily: 'completion',
      instructionBlocks: [{ id: 'instruction_1', text: 'Complete the answers.' }],
      stimulusRefs: [{ stimulusId: 'stimulus_1', anchorIds: ['anchor_1'] }],
      interactions: [
        {
          interactionId: 'interaction_1',
          taskGroupId: 'task_group_1',
          displayNumber: 1,
        },
        {
          interactionId: 'interaction_2',
          taskGroupId: 'task_group_1',
          displayNumber: 2,
        },
      ],
    }],
  },
});

const makePassageSnapshot = (input: {
  materialId: string;
  snapshotVersionId: string;
  answer: string;
}) => ({
  ...makeSnapshot(),
  materialId: input.materialId,
  snapshotVersionId: input.snapshotVersionId,
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
        reviewLabel: { displayNumber: 1 },
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

const makePassageReviewProjection = (input: {
  snapshotVersionId: string;
  title: string;
}) => ({
  ...makeReviewProjection(),
  sourceSnapshotVersionId: input.snapshotVersionId,
  content: {
    ...makeReviewProjection().content,
    title: input.title,
    taskGroups: [{
      taskGroupId: 'task_group_1',
      groupTitle: input.title,
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

const makeReadingPassageSetHomework = () => ({
  id: 'hw-set-1',
  materialId: 'reading-passage-set:hw-set-1',
  materialType: 'reading-passage-set',
  title: 'Selected Reading Passages',
  materialTitle: 'Selected Reading Passages',
  createdBy: 'teacher-1',
  config: {
    timerMinutes: 40,
  },
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
});

describe('readingV2SubmitCore', () => {
  it('parses a browser-safe request and rejects unsupported payloads', () => {
    const request = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'student-safe:material-1:snapshot-1',
      sourceSnapshotVersionId: 'snapshot-1',
      materialId: 'material-1',
      answers: [{
        interactionId: 'interaction_1',
        taskGroupId: 'task_group_1',
        displayNumber: 1,
        value: 'answer one',
      }],
      context: {
        surface: 'solo-practice',
      },
    });

    expect(request.answers[0]).toEqual(expect.objectContaining({
      displayNumber: 1,
      value: 'answer one',
    }));
    expect(() => parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: 'legacy-reading',
      answers: [],
    })).toThrow('reading-v2');
  });

  it('scores on canonical data and writes the canonical result before secondary indexes', () => {
    const request = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'student-safe:material-1:snapshot-1',
      sourceSnapshotVersionId: 'snapshot-1',
      materialId: 'material-1',
      answers: [
        {
          interactionId: 'interaction_1',
          taskGroupId: 'task_group_1',
          displayNumber: 1,
          value: 'answer one',
        },
        {
          interactionId: 'interaction_2',
          taskGroupId: 'task_group_1',
          displayNumber: 2,
          value: 'B',
        },
      ],
      context: {
        surface: 'live-session',
        sessionCode: 'LIVE123',
        sourceName: 'Live Reading',
      },
    });

    const plan = buildReadingV2TrustedSubmissionPlan({
      request,
      auth: {
        uid: 'student-1',
        name: 'Student One',
      },
      records: {
        snapshot: makeSnapshot(),
        reviewProjection: makeReviewProjection(),
        metadata: { title: 'Trusted Reading Test', durationMinutes: 60 },
        session: {
          createdByUserId: 'teacher-session',
          players: {
            'student-1': { name: 'Student One' },
          },
        },
      },
      identity: {
        resultId: 'result-1',
        attemptId: 'attempt-1',
        submittedAtIso: '2026-04-29T00:05:00.000Z',
        submittedAtMs: 1777395900000,
      },
    });

    expect(plan.canonicalResultPath).toBe('test_results/result-1');
    expect(plan.response).toEqual({
      resultId: 'result-1',
      attemptId: 'attempt-1',
      totalScore: 2,
      maxScore: 2,
      percentage: 100,
    });
    expect(plan.secondaryUpdates).toEqual(expect.objectContaining({
      'reading_v2/attempts/attempt-1': expect.objectContaining({
        studentId: 'student-1',
      }),
      'reading_v2/review_indexes/result-1': expect.objectContaining({
        title: 'Trusted Reading Test',
      }),
      'test_results_by_student/student-1/result-1': expect.objectContaining({
        resultId: 'result-1',
      }),
      'test_results_by_teacher/teacher-session/result-1': expect.objectContaining({
        resultId: 'result-1',
      }),
      'game_sessions/LIVE123/players/student-1/hasCompletedTest': true,
    }));
    expect(JSON.stringify(plan.savedResult.readingV2.reviewPayload)).not.toContain('scoringRule');
  });

  it('scores Reading Passage set homework against assigned passage snapshots', () => {
    const homework = makeReadingPassageSetHomework();
    const trustedRecords = composeReadingPassageSetTrustedRecords({
      homework,
      passageRecords: [
        {
          item: homework.readingPassageSet.items[0],
          snapshot: makePassageSnapshot({
            materialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            answer: 'Answer A',
          }),
          reviewProjection: makePassageReviewProjection({
            snapshotVersionId: 'snapshot-a',
            title: 'Passage A',
          }),
        },
        {
          item: homework.readingPassageSet.items[1],
          snapshot: makePassageSnapshot({
            materialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            answer: 'Answer B',
          }),
          reviewProjection: makePassageReviewProjection({
            snapshotVersionId: 'snapshot-b',
            title: 'Passage B',
          }),
        },
      ],
      generatedAt: '2026-06-01T00:00:00.000Z',
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
          displayNumber: 1,
          value: 'answer a',
        },
        {
          interactionId: 'passage-2:interaction_1',
          taskGroupId: 'passage-2:task_group_1',
          displayNumber: 2,
          value: 'answer b',
        },
      ],
      context: {
        surface: 'homework',
        homeworkId: 'hw-set-1',
        sourceName: 'Selected Reading Passages',
      },
    });

    const plan = buildReadingV2TrustedSubmissionPlan({
      request,
      auth: {
        uid: 'student-1',
        name: 'Student One',
      },
      records: {
        ...trustedRecords,
        studentProfile: null,
        session: null,
      },
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
    expect(plan.savedResult.testId).toBe('reading-passage-set:hw-set-1');
    expect(plan.savedResult.visibility).toEqual(expect.objectContaining({
      contextType: 'homework',
      sourceId: 'hw-set-1',
      homeworkId: 'hw-set-1',
    }));
    expect(plan.savedResult.readingV2.reviewPayload.taskGroups).toEqual([
      expect.objectContaining({
        taskGroupId: 'passage-1:task_group_1',
        passageSection: expect.objectContaining({
          title: 'Passage A',
          snapshotVersionId: 'snapshot-a',
          sourceOrderDisplay: 'Passage 1',
        }),
      }),
      expect.objectContaining({
        taskGroupId: 'passage-2:task_group_1',
        passageSection: expect.objectContaining({
          title: 'Passage B',
          snapshotVersionId: 'snapshot-b',
          sourceOrderDisplay: 'Passage 2',
        }),
      }),
    ]);
    expect(plan.savedResult.readingV2.reviewPayload).toEqual(expect.objectContaining({
      materialKind: 'reading-passage-set',
      materialLabel: 'Reading Passage Set',
    }));
    expect(plan.secondaryUpdates['reading_v2/review_indexes/result-set-1']).toEqual(expect.objectContaining({
      taskGroupIds: ['passage-1:task_group_1', 'passage-2:task_group_1'],
    }));
  });

  it('rejects malformed Reading Passage set responses and mismatched assigned snapshots', () => {
    const homework = makeReadingPassageSetHomework();
    const trustedRecords = composeReadingPassageSetTrustedRecords({
      homework,
      passageRecords: [
        {
          item: homework.readingPassageSet.items[0],
          snapshot: makePassageSnapshot({
            materialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            answer: 'Answer A',
          }),
          reviewProjection: makePassageReviewProjection({
            snapshotVersionId: 'snapshot-a',
            title: 'Passage A',
          }),
        },
        {
          item: homework.readingPassageSet.items[1],
          snapshot: makePassageSnapshot({
            materialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            answer: 'Answer B',
          }),
          reviewProjection: makePassageReviewProjection({
            snapshotVersionId: 'snapshot-b',
            title: 'Passage B',
          }),
        },
      ],
    });
    const malformedRequest = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'homework-set:hw-set-1',
      sourceSnapshotVersionId: 'homework-set:hw-set-1',
      materialId: 'reading-passage-set:hw-set-1',
      answers: [{
        interactionId: 'passage-9:interaction_1',
        taskGroupId: 'passage-9:task_group_1',
        displayNumber: 1,
        value: 'answer a',
      }],
      context: {
        surface: 'homework',
        homeworkId: 'hw-set-1',
      },
    });

    expect(() => buildReadingV2TrustedSubmissionPlan({
      request: malformedRequest,
      auth: {
        uid: 'student-1',
      },
      records: trustedRecords,
      identity: {
        resultId: 'result-malformed',
        attemptId: 'attempt-malformed',
        submittedAtIso: '2026-06-01T00:05:00.000Z',
        submittedAtMs: 1780272300000,
      },
    })).toThrow('not bound');

    expect(() => composeReadingPassageSetTrustedRecords({
      homework,
      passageRecords: [{
        item: homework.readingPassageSet.items[0],
        snapshot: makePassageSnapshot({
          materialId: 'wrong-passage',
          snapshotVersionId: 'snapshot-a',
          answer: 'Answer A',
        }),
        reviewProjection: makePassageReviewProjection({
          snapshotVersionId: 'snapshot-a',
          title: 'Passage A',
        }),
      }],
    })).toThrow('one passage record per assigned passage');
  });
});
