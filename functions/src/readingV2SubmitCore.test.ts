import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  buildReadingV2TrustedSubmissionPlan,
  composeReadingPassageSetTrustedRecords,
  composeReadingV2CompositionTrustedRecords,
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

const makeFullTestComposition = () => ({
  compositionId: 'composition-master-1',
  testMaterialId: 'master-1',
  ownerId: 'teacher-1',
  title: 'IELTS Full Test',
  passageRefs: [
    {
      order: 1,
      passageMaterialId: 'passage-a',
      snapshotVersionId: 'snapshot-a',
      title: 'Passage A',
      titleSnapshot: 'Passage A',
      questionCount: 1,
      sourceOrderDisplaySnapshot: 'Passage 1',
      source: {
        sourceFullTestTitle: 'IELTS Full Test',
      },
    },
    {
      order: 2,
      passageMaterialId: 'passage-b',
      snapshotVersionId: 'snapshot-b',
      title: 'Passage B',
      titleSnapshot: 'Passage B',
      questionCount: 1,
      sourceOrderDisplaySnapshot: 'Passage 2',
      source: {
        sourceFullTestTitle: 'IELTS Full Test',
      },
    },
  ],
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
      integrityReport: {
        violationCount: 1,
        totalEvents: 1,
        events: [],
      },
      context: {
        surface: 'solo-practice',
      },
    });

    expect(request.answers[0]).toEqual(expect.objectContaining({
      displayNumber: 1,
      value: 'answer one',
    }));
    expect(request.integrityReport).toEqual(expect.objectContaining({
      violationCount: 1,
      totalEvents: 1,
    }));
    expect(() => parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: READING_V2_ENGINE,
      projectionId: 'student-safe:material-1:snapshot-1',
      sourceSnapshotVersionId: 'snapshot-1',
      materialId: 'material-1',
      answers: [],
      integrityReport: 'invalid',
    })).toThrow('integrityReport');
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
      integrityReport: {
        violationCount: 2,
        totalEvents: 3,
        riskLevel: 'medium',
        events: [],
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
        integrityReport: expect.objectContaining({
          violationCount: 2,
          riskLevel: 'medium',
        }),
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
    expect(plan.savedResult).toEqual(expect.objectContaining({
      integrityReport: expect.objectContaining({
        violationCount: 2,
        totalEvents: 3,
      }),
    }));
    expect(JSON.stringify(plan.savedResult.readingV2.reviewPayload)).not.toContain('scoringRule');
  });

  it('keeps multi-anchor table cell excerpts in trusted review payloads', () => {
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
      context: { surface: 'solo-practice' },
    });
    const reviewProjection = {
      ...makeReviewProjection(),
      content: {
        ...makeReviewProjection().content,
        title: 'Trusted multi-anchor table',
        stimuli: [{
          stimulusId: 'stimulus_table',
          kind: 'table',
          title: 'Trusted table',
          content: {
            kind: 'table-content',
            rows: [
              [{ text: 'Feature', role: 'header' }, { text: 'Detail', role: 'header' }],
              [
                { text: 'Shared label' },
                {
                  text: 'Shared worker table cell for questions 1 and 2',
                  anchorId: 'anchor_1',
                  anchorIds: ['anchor_1', 'anchor_2'],
                },
              ],
            ],
          },
        }],
        anchors: [
          { anchorId: 'anchor_1', stimulusId: 'stimulus_table', kind: 'table-cell', label: 'Question 1 table blank' },
          { anchorId: 'anchor_2', stimulusId: 'stimulus_table', kind: 'table-cell', label: 'Question 2 table blank' },
        ],
        taskGroups: [{
          taskGroupId: 'task_group_1',
          officialTaskType: 'table-completion',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction_1', text: 'Complete the table.' }],
          stimulusRefs: [{ stimulusId: 'stimulus_table', anchorIds: ['anchor_2'] }],
          interactions: [{
            interactionId: 'interaction_1',
            taskGroupId: 'task_group_1',
            displayNumber: 1,
          }],
        }],
      },
    };

    const plan = buildReadingV2TrustedSubmissionPlan({
      request,
      auth: { uid: 'student-1', name: 'Student One' },
      records: {
        snapshot: makeSnapshot(),
        reviewProjection,
        metadata: { title: 'Trusted multi-anchor table', durationMinutes: 60 },
        session: null,
      },
      identity: {
        resultId: 'result-multi-anchor-table',
        attemptId: 'attempt-multi-anchor-table',
        submittedAtIso: '2026-06-06T00:00:00.000Z',
        submittedAtMs: 1780272300000,
      },
    });

    expect(plan.savedResult.readingV2.reviewPayload.taskGroups[0].stimulusContext[0]).toEqual(expect.objectContaining({
      anchorLabels: ['Question 2 table blank'],
      excerpt: expect.stringContaining('Shared worker table cell for questions 1 and 2'),
    }));
  });

  it('prefixes only canonical structured-content anchors when composing passage-set trusted records', () => {
    const homework = {
      ...makeReadingPassageSetHomework(),
      readingPassageSet: {
        titleSnapshot: 'Structured Passage Set',
        items: [makeReadingPassageSetHomework().readingPassageSet.items[0]],
      },
    };
    const item = homework.readingPassageSet.items[0];
    const reviewProjection = {
      ...makePassageReviewProjection({
        snapshotVersionId: item.snapshotVersionId,
        title: item.titleSnapshot,
      }),
      content: {
        ...makePassageReviewProjection({
          snapshotVersionId: item.snapshotVersionId,
          title: item.titleSnapshot,
        }).content,
        stimuli: [
          {
            stimulusId: 'stimulus_table',
            kind: 'table',
            anchorIds: ['anchor_1', 'anchor_2'],
            content: {
              kind: 'table-content',
              rows: [[{
                text: 'Structured table blank',
                anchorId: 'anchor_1',
                anchorIds: ['anchor_1', 'anchor_2'],
              }]],
            },
          },
          {
            stimulusId: 'stimulus_media',
            kind: 'image',
            anchorIds: [],
            content: {
              kind: 'media-content',
              alt: 'Media',
              sourceInfo: {
                anchorId: 'external-anchor-like-key',
                anchorIds: ['external-anchor-like-array'],
              },
            },
          },
        ],
        anchors: [
          { anchorId: 'anchor_1', stimulusId: 'stimulus_table', kind: 'table-cell', label: 'Anchor 1' },
          { anchorId: 'anchor_2', stimulusId: 'stimulus_table', kind: 'table-cell', label: 'Anchor 2' },
        ],
        taskGroups: [{
          taskGroupId: 'task_group_1',
          officialTaskType: 'table-completion',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction_1', text: 'Complete the table.' }],
          stimulusRefs: [{ stimulusId: 'stimulus_table', anchorIds: ['anchor_1', 'anchor_2'] }],
          interactions: [{
            interactionId: 'interaction_1',
            taskGroupId: 'task_group_1',
            displayNumber: 1,
          }],
        }],
      },
    };

    const records = composeReadingPassageSetTrustedRecords({
      homework,
      passageRecords: [{
        item,
        snapshot: makePassageSnapshot({
          materialId: item.passageMaterialId,
          snapshotVersionId: item.snapshotVersionId,
          answer: 'Answer A',
        }),
        reviewProjection,
      }],
      generatedAt: '2026-06-06T00:00:00.000Z',
    });
    const table = records.reviewProjection.content.stimuli.find((stimulus: Record<string, any>) =>
      stimulus.stimulusId === 'passage-1:stimulus_table',
    );
    const media = records.reviewProjection.content.stimuli.find((stimulus: Record<string, any>) =>
      stimulus.stimulusId === 'passage-1:stimulus_media',
    );

    expect(table.content.rows[0][0]).toEqual(expect.objectContaining({
      anchorId: 'passage-1:anchor_1',
      anchorIds: ['passage-1:anchor_1', 'passage-1:anchor_2'],
    }));
    expect(media.content.sourceInfo).toEqual({
      anchorId: 'external-anchor-like-key',
      anchorIds: ['external-anchor-like-array'],
    });
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

  it('scores composition-first master tests against generated passage snapshots', () => {
    const composition = makeFullTestComposition();
    const trustedRecords = composeReadingV2CompositionTrustedRecords({
      composition,
      materialId: 'master-1',
      snapshotVersionId: 'master-snapshot',
      metadata: {
        materialId: 'master-1',
        title: 'IELTS Full Test',
        materialKind: 'reading-v2-full-test-composition',
        durationMinutes: 60,
      },
      passageRecords: [
        {
          item: composition.passageRefs[0],
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
          item: composition.passageRefs[1],
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
      projectionId: 'student-safe:master-1:master-snapshot',
      sourceSnapshotVersionId: 'master-snapshot',
      materialId: 'master-1',
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
        surface: 'solo-practice',
        sourceName: 'IELTS Full Test',
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
        resultId: 'result-master-1',
        attemptId: 'attempt-master-1',
        submittedAtIso: '2026-06-01T00:05:00.000Z',
        submittedAtMs: 1780272300000,
      },
    });

    expect(plan.response).toEqual(expect.objectContaining({
      totalScore: 2,
      maxScore: 2,
      percentage: 100,
    }));
    expect(plan.savedResult.testId).toBe('master-1');
    expect(plan.savedResult.readingV2.reviewPayload).toEqual(expect.objectContaining({
      materialKind: 'reading-v2-full-test-composition',
      materialLabel: 'Reading V2 Full Test',
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
