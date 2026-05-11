import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  buildReadingV2TrustedSubmissionPlan,
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
});
