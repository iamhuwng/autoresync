import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { readingV2Ids, type ReadingV2PublishedSnapshot, type ReadingV2Result } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE } from './fixtures/readingV2ProjectionFixtures';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import { composeReadingV2CompositionNumbering } from './readingV2CompositionNumbering.service';
import {
  buildReadingV2GroupedReviewPayload,
  buildReadingV2RegradePersistencePlan,
  buildReadingV2ResultPersistencePlan,
  buildReadingV2SavedResultRecord,
  captureReadingV2Attempt,
  createReadingV2RegradeArtifact,
  sanitizeReadingV2ResultForReleasePolicy,
  scoreReadingV2Attempt,
} from './readingV2ResultAdapter.service';

const publishedSnapshotFor = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
): ReadingV2PublishedSnapshot => ({
  snapshotVersionId: readingV2Ids.snapshotVersionId(`projection-fixture-snapshot-${taskType}`),
  materialId: readingV2Ids.materialId(`projection-fixture-material-${taskType}`),
  ownerId: 'teacher-1',
  document: READING_V2_CANONICAL_FIXTURES[taskType],
  publishedAt: '2026-04-28T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

const answerPayloadFor = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
  values: readonly string[],
) => {
  const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe;
  const interactions = projection.content.taskGroups.flatMap((taskGroup) => taskGroup.interactions);

  return {
    projectionId: projection.projectionId,
    sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
    materialId: projection.materialId,
    answers: interactions.map((interaction, index) => ({
      interactionId: interaction.interactionId,
      taskGroupId: interaction.taskGroupId,
      displayNumber: interaction.displayNumber,
      value: values[index] ?? '',
    })),
  };
};

const containsUndefined = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsUndefined);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsUndefined);
  }
  return false;
};

describe('readingV2ResultAdapter.service', () => {
  it('captures attempts with snapshot binding, stable interaction IDs, and visible numbers', () => {
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-1',
      studentId: 'student-1',
      submitPayload: answerPayloadFor('sentence-completion', ['answer one', 'wrong']),
      context: {
        mode: 'solo-practice',
      },
    });

    expect(attempt.sourceSnapshotVersionId).toBe('projection-fixture-snapshot-sentence-completion');
    expect(attempt.answers['interaction-sentence-completion-1']).toMatchObject({
      taskGroupId: 'task-group-sentence-completion',
      visibleNumber: 1,
      value: 'answer one',
    });
  });

  it.each([
    ['sentence-completion', ['answer one', 'answer two']],
    ['multiple-choice', ['A', 'B']],
    ['true-false-not-given', ['True', 'False']],
    ['matching-features', ['A', 'B']],
    ['table-completion', ['answer one', 'answer two']],
  ] as const)('scores %s from canonical answer rules', (taskType, values) => {
    const attempt = captureReadingV2Attempt({
      attemptId: `attempt-${taskType}`,
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, values),
      context: { mode: 'solo-practice' },
    });
    const snapshot = publishedSnapshotFor(taskType);
    const result = scoreReadingV2Attempt({
      resultId: `result-${taskType}`,
      testId: `material-${taskType}`,
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      submittedAt: '2026-04-28T00:05:00.000Z',
    });

    expect(result.deliveryEngine).toBe(READING_V2_ENGINE);
    expect(result.publishedSnapshotVersion).toBe(snapshot.snapshotVersionId);
    expect(result.interactions).toHaveLength(2);
    expect(result.interactions.every((interaction) => interaction.score === 1)).toBe(true);
    expect(result.interactions.map((interaction) => interaction.displayNumber)).toEqual([1, 2]);
  });

  it('builds review from frozen result numbering instead of recomputing projection numbers', () => {
    const projection = structuredClone(
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['sentence-completion'].review,
    ) as ReadingV2DerivedProjection;
    const firstGroup = projection.content.taskGroups[0]!;
    const interactions = firstGroup.interactions;
    const numbering = composeReadingV2CompositionNumbering({
      passages: [{
        order: 1,
        passageMaterialId: 'passage-a',
        snapshotVersionId: projection.sourceSnapshotVersionId,
        interactions: interactions.map((interaction) => ({ interactionId: interaction.interactionId })),
      }],
      previousInteractionDisplayNumbers: {
        [interactions[0]!.interactionId]: 31,
        [interactions[1]!.interactionId]: 32,
      },
      preserveBeforeOrder: 2,
    });
    const frozenResult = {
      resultId: readingV2Ids.resultId('result-frozen-numbering'),
      testId: 'material-sentence-completion',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      publishedSnapshotVersion: projection.sourceSnapshotVersionId,
      attemptId: readingV2Ids.attemptId('attempt-frozen-numbering'),
      attemptContext: { mode: 'homework' as const },
      interactions: interactions.map((interaction) => ({
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        displayNumber: numbering.interactionDisplayNumbers[interaction.interactionId]!,
        taskFamily: firstGroup.engineeringFamily,
        officialTaskType: firstGroup.officialTaskType,
        studentAnswer: 'answer',
        scoredAnswer: 'answer',
        score: 1,
        maxScore: 1,
        reviewState: 'released' as const,
      })),
      totalScore: 2,
      maxScore: 2,
      submittedAt: '2026-06-01T00:00:00.000Z',
    } satisfies ReadingV2Result;
    const liveProjection = {
      ...projection,
      content: {
        ...projection.content,
        taskGroups: projection.content.taskGroups.map((taskGroup) => ({
          ...taskGroup,
          interactions: taskGroup.interactions.map((interaction) => ({
            ...interaction,
            displayNumber: 1,
          })),
        })),
      },
    };

    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result: frozenResult,
      projection: liveProjection,
    });

    expect(reviewPayload.taskGroups[0]!.interactions.map((interaction) => interaction.displayNumber))
      .toEqual([31, 32]);
  });

  it('scores binary judgement aliases without accepting misspellings', () => {
    const taskType = 'true-false-not-given';
    const aliasAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-judgement-aliases',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['t', 'N.G.']),
      context: { mode: 'solo-practice' },
    });
    const misspelledAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-judgement-misspelling',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['TRUE', 'FLASE']),
      context: { mode: 'solo-practice' },
    });
    const snapshot = publishedSnapshotFor(taskType);
    const secondInteractionId = 'interaction-true-false-not-given-2';
    const secondInteraction = snapshot.document.interactions[secondInteractionId]!;
    const judgementSnapshot: ReadingV2PublishedSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        interactions: {
          ...snapshot.document.interactions,
          [secondInteractionId]: {
            ...secondInteraction,
            scoringRule: {
              ...secondInteraction.scoringRule,
              acceptableAnswers: ['Not Given'],
            },
          },
        },
      },
    };

    const aliasResult = scoreReadingV2Attempt({
      resultId: 'result-judgement-aliases',
      testId: 'material-judgement-aliases',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt: aliasAttempt,
      snapshot: judgementSnapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const misspelledResult = scoreReadingV2Attempt({
      resultId: 'result-judgement-misspelling',
      testId: 'material-judgement-misspelling',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt: misspelledAttempt,
      snapshot: judgementSnapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });

    expect(aliasResult.interactions.map((interaction) => interaction.score)).toEqual([1, 1]);
    expect(misspelledResult.interactions.map((interaction) => interaction.score)).toEqual([1, 0]);
  });

  it('scores unordered multi-select answers when the canonical rule does not require order', () => {
    const taskType = 'multiple-select';
    const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe;
    const [firstInteraction, secondInteraction] = projection.content.taskGroups.flatMap(
      (taskGroup) => taskGroup.interactions,
    );
    const snapshot = publishedSnapshotFor(taskType);
    const canonicalFirstInteraction = snapshot.document.interactions[firstInteraction.interactionId];
    const unorderedSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        interactions: {
          ...snapshot.document.interactions,
          [firstInteraction.interactionId]: {
            ...canonicalFirstInteraction,
            scoringRule: {
              ...canonicalFirstInteraction.scoringRule,
              acceptableAnswers: ['answer one', 'answer two'],
              orderMatters: false,
            },
          },
        },
      },
    };
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-unordered-multi-select',
      studentId: 'student-1',
      submitPayload: {
        projectionId: projection.projectionId,
        sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
        materialId: projection.materialId,
        answers: [
          {
            interactionId: firstInteraction.interactionId,
            taskGroupId: firstInteraction.taskGroupId,
            displayNumber: firstInteraction.displayNumber,
            value: ['answer two', 'answer one'],
          },
          {
            interactionId: secondInteraction.interactionId,
            taskGroupId: secondInteraction.taskGroupId,
            displayNumber: secondInteraction.displayNumber,
            value: ['B', 'C'],
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });

    const result = scoreReadingV2Attempt({
      resultId: 'result-unordered-multi-select',
      testId: 'material-unordered-multi-select',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: unorderedSnapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });

    expect(result.interactions[0].score).toBe(1);
  });

  it('scores choice and matching submissions when canonical keys or student answers use option IDs', () => {
    const matchingTaskType = 'matching-headings';
    const matchingProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[matchingTaskType].studentSafe;
    const matchingSnapshot = publishedSnapshotFor(matchingTaskType);
    const matchingOptionSet = Object.values(matchingSnapshot.document.optionSets)[0]!;
    const [matchingFirst, matchingSecond] = matchingProjection.content.taskGroups.flatMap(
      (taskGroup) => taskGroup.interactions,
    );
    const matchingIdSnapshot: ReadingV2PublishedSnapshot = {
      ...matchingSnapshot,
      document: {
        ...matchingSnapshot.document,
        interactions: {
          ...matchingSnapshot.document.interactions,
          [matchingFirst.interactionId]: {
            ...matchingSnapshot.document.interactions[matchingFirst.interactionId]!,
            scoringRule: {
              ...matchingSnapshot.document.interactions[matchingFirst.interactionId]!.scoringRule,
              acceptableAnswers: [matchingOptionSet.options[0]!.optionId],
            },
          },
          [matchingSecond.interactionId]: {
            ...matchingSnapshot.document.interactions[matchingSecond.interactionId]!,
            scoringRule: {
              ...matchingSnapshot.document.interactions[matchingSecond.interactionId]!.scoringRule,
              acceptableAnswers: [matchingOptionSet.options[1]!.label],
            },
          },
        },
      },
    };
    const matchingAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-matching-option-id',
      studentId: 'student-1',
      submitPayload: {
        projectionId: matchingProjection.projectionId,
        sourceSnapshotVersionId: matchingProjection.sourceSnapshotVersionId,
        materialId: matchingProjection.materialId,
        answers: [
          {
            interactionId: matchingFirst.interactionId,
            taskGroupId: matchingFirst.taskGroupId,
            displayNumber: matchingFirst.displayNumber,
            value: matchingOptionSet.options[0]!.label,
          },
          {
            interactionId: matchingSecond.interactionId,
            taskGroupId: matchingSecond.taskGroupId,
            displayNumber: matchingSecond.displayNumber,
            value: matchingOptionSet.options[1]!.optionId,
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });
    const matchingResult = scoreReadingV2Attempt({
      resultId: 'result-matching-option-id',
      testId: 'material-matching-option-id',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt: matchingAttempt,
      snapshot: matchingIdSnapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[matchingTaskType].review,
    });

    const multiTaskType = 'multiple-select';
    const multiProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[multiTaskType].studentSafe;
    const multiSnapshot = publishedSnapshotFor(multiTaskType);
    const multiOptionSet = Object.values(multiSnapshot.document.optionSets)[0]!;
    const [multiInteraction] = multiProjection.content.taskGroups.flatMap((taskGroup) => taskGroup.interactions);
    const multiIdSnapshot: ReadingV2PublishedSnapshot = {
      ...multiSnapshot,
      document: {
        ...multiSnapshot.document,
        interactions: {
          ...multiSnapshot.document.interactions,
          [multiInteraction.interactionId]: {
            ...multiSnapshot.document.interactions[multiInteraction.interactionId]!,
            scoringRule: {
              ...multiSnapshot.document.interactions[multiInteraction.interactionId]!.scoringRule,
              acceptableAnswers: [
                multiOptionSet.options[0]!.optionId,
                multiOptionSet.options[1]!.optionId,
              ],
              orderMatters: false,
            },
          },
        },
      },
    };
    const multiAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-multi-select-option-id',
      studentId: 'student-1',
      submitPayload: {
        projectionId: multiProjection.projectionId,
        sourceSnapshotVersionId: multiProjection.sourceSnapshotVersionId,
        materialId: multiProjection.materialId,
        answers: [
          {
            interactionId: multiInteraction.interactionId,
            taskGroupId: multiInteraction.taskGroupId,
            displayNumber: multiInteraction.displayNumber,
            value: [
              multiOptionSet.options[1]!.label,
              multiOptionSet.options[0]!.label,
            ],
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });
    const multiResult = scoreReadingV2Attempt({
      resultId: 'result-multi-select-option-id',
      testId: 'material-multi-select-option-id',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt: multiAttempt,
      snapshot: multiIdSnapshot,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[multiTaskType].review,
    });

    expect(matchingResult.interactions.map((interaction) => interaction.score)).toEqual([1, 1]);
    expect(matchingResult.interactions.map((interaction) => interaction.scoredAnswer)).toEqual(['i', 'ii']);
    expect(multiResult.interactions[0].score).toBe(1);
    expect(multiResult.interactions[0].scoredAnswer).toEqual(['A', 'B']);
  });

  it('rejects array-shaped answers for scalar interactions', () => {
    const taskType = 'sentence-completion';
    const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe;
    const [firstInteraction, secondInteraction] = projection.content.taskGroups.flatMap(
      (taskGroup) => taskGroup.interactions,
    );
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-scalar-array',
      studentId: 'student-1',
      submitPayload: {
        projectionId: projection.projectionId,
        sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
        materialId: projection.materialId,
        answers: [
          {
            interactionId: firstInteraction.interactionId,
            taskGroupId: firstInteraction.taskGroupId,
            displayNumber: firstInteraction.displayNumber,
            value: ['answer one'],
          },
          {
            interactionId: secondInteraction.interactionId,
            taskGroupId: secondInteraction.taskGroupId,
            displayNumber: secondInteraction.displayNumber,
            value: 'answer two',
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });

    expect(() =>
      scoreReadingV2Attempt({
        resultId: 'result-scalar-array',
        testId: 'material-scalar-array',
        studentId: 'student-1',
        ownerId: 'teacher-1',
        attempt,
        snapshot: publishedSnapshotFor(taskType),
        projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      }),
    ).toThrow(/scalar interaction .* cannot accept an array answer/i);
  });

  it('requires array-shaped answers for multi-select interactions', () => {
    const taskType = 'multiple-select';
    const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe;
    const [firstInteraction] = projection.content.taskGroups.flatMap((taskGroup) => taskGroup.interactions);
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-multi-select-scalar',
      studentId: 'student-1',
      submitPayload: {
        projectionId: projection.projectionId,
        sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
        materialId: projection.materialId,
        answers: [
          {
            interactionId: firstInteraction.interactionId,
            taskGroupId: firstInteraction.taskGroupId,
            displayNumber: firstInteraction.displayNumber,
            value: 'A',
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });

    expect(() =>
      scoreReadingV2Attempt({
        resultId: 'result-multi-select-scalar',
        testId: 'material-multi-select-scalar',
        studentId: 'student-1',
        ownerId: 'teacher-1',
        attempt,
        snapshot: publishedSnapshotFor(taskType),
        projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      }),
    ).toThrow(/multi-select interaction .* requires an array answer/i);
  });

  it('rejects tampered task-group and display-number bindings before scoring', () => {
    const taskType = 'sentence-completion';
    const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe;
    const [firstInteraction] = projection.content.taskGroups.flatMap((taskGroup) => taskGroup.interactions);
    const tamperedTaskGroupAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-tampered-task-group',
      studentId: 'student-1',
      submitPayload: {
        projectionId: projection.projectionId,
        sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
        materialId: projection.materialId,
        answers: [
          {
            interactionId: firstInteraction.interactionId,
            taskGroupId: 'wrong-task-group',
            displayNumber: firstInteraction.displayNumber,
            value: 'answer one',
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });
    const tamperedDisplayAttempt = captureReadingV2Attempt({
      attemptId: 'attempt-tampered-display',
      studentId: 'student-1',
      submitPayload: {
        projectionId: projection.projectionId,
        sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
        materialId: projection.materialId,
        answers: [
          {
            interactionId: firstInteraction.interactionId,
            taskGroupId: firstInteraction.taskGroupId,
            displayNumber: firstInteraction.displayNumber + 10,
            value: 'answer one',
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });
    const scoreInput = {
      resultId: 'result-tampered',
      testId: 'material-tampered',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    };

    expect(() => scoreReadingV2Attempt({ ...scoreInput, attempt: tamperedTaskGroupAttempt })).toThrow(
      /submitted task group does not match/i,
    );
    expect(() => scoreReadingV2Attempt({ ...scoreInput, attempt: tamperedDisplayAttempt })).toThrow(
      /submitted display number does not match/i,
    );
  });

  it('fails closed when an attempt is scored against a different snapshot', () => {
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-mismatch',
      studentId: 'student-1',
      submitPayload: answerPayloadFor('sentence-completion', ['answer one', 'answer two']),
      context: { mode: 'solo-practice' },
    });
    const snapshot = {
      ...publishedSnapshotFor('sentence-completion'),
      snapshotVersionId: readingV2Ids.snapshotVersionId('different-snapshot'),
    };

    expect(() =>
      scoreReadingV2Attempt({
        resultId: 'result-mismatch',
        testId: 'material-1',
        studentId: 'student-1',
        ownerId: 'teacher-1',
        attempt,
        snapshot,
        projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['sentence-completion'].review,
      }),
    ).toThrow(/snapshot binding/i);
  });

  it('fails closed when a review projection does not match the scored snapshot', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-projection-mismatch',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['answer one', 'answer two']),
      context: { mode: 'solo-practice' },
    });

    expect(() =>
      scoreReadingV2Attempt({
        resultId: 'result-projection-mismatch',
        testId: 'material-1',
        studentId: 'student-1',
        ownerId: 'teacher-1',
        attempt,
        snapshot: publishedSnapshotFor(taskType),
        projection: {
          ...READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
          sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('different-snapshot'),
        },
      }),
    ).toThrow(/projection binding/i);
  });

  it('builds an existing-shell saved result record with grouped Reading V2 review payload', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-saved',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['answer one', 'wrong']),
      context: { mode: 'homework', homeworkId: 'homework-1' },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-saved',
      testId: 'material-saved',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      submittedAt: '2026-04-28T00:05:00.000Z',
    });
    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload,
      studentName: 'Student One',
      testTitle: 'Reading V2 Result',
    });

    expect(savedResult.deliveryEngine).toBe(READING_V2_ENGINE);
    expect(savedResult.testType).toBe('ielts-reading-v2');
    expect(savedResult.readingV2.reviewPayload.taskGroups[0].interactions).toHaveLength(2);
    expect(savedResult.readingV2.reviewPayload.taskGroups[0].stimulusContext[0]).toMatchObject({
      stimulusId: 'stimulus-sentence-completion',
      title: 'Fixture stimulus for sentence-completion',
      excerpt: expect.stringContaining('Fixture passage paragraph A'),
    });
    expect(savedResult.questionResults.map((question) => question.questionNumber)).toEqual([1, 2]);
  });

  it('includes table cells selected through secondary cell.anchorIds in review excerpts', () => {
    const baseProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['table-completion'].review;
    const sourceSnapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-multi-anchor-review');
    const taskGroupId = readingV2Ids.taskGroupId('task-group-multi-anchor-review');
    const interactionId = readingV2Ids.interactionId('interaction-multi-anchor-review-2');
    const firstAnchorId = readingV2Ids.anchorId('anchor-multi-table-1');
    const secondAnchorId = readingV2Ids.anchorId('anchor-multi-table-2');
    const projection: ReadingV2DerivedProjection = {
      ...baseProjection,
      projectionId: 'review:multi-anchor-table',
      sourceSnapshotVersionId,
      content: {
        ...baseProjection.content,
        title: 'Multi-anchor review table',
        sections: [],
        stimuli: [
          {
            stimulusId: 'stimulus-multi-anchor-table',
            kind: 'table',
            title: 'Multi-anchor table',
            anchorIds: [firstAnchorId, secondAnchorId],
            content: {
              kind: 'table-content',
              rows: [
                [
                  { text: 'Feature', role: 'header' },
                  { text: 'Detail', role: 'header' },
                ],
                [
                  { text: 'Shared label' },
                  {
                    text: 'Shared table cell for questions 1 and 2',
                    isBlank: true,
                    anchorId: firstAnchorId,
                    anchorIds: [firstAnchorId, secondAnchorId],
                  },
                ],
              ],
            },
          },
        ],
        anchors: [
          { anchorId: firstAnchorId, stimulusId: 'stimulus-multi-anchor-table', kind: 'table-cell', label: 'Question 1 table blank' },
          { anchorId: secondAnchorId, stimulusId: 'stimulus-multi-anchor-table', kind: 'table-cell', label: 'Question 2 table blank' },
        ],
        taskGroups: [
          {
            taskGroupId,
            officialTaskType: 'table-completion',
            engineeringFamily: 'structured-layout',
            instructionBlocks: [{ id: 'instruction-1', text: 'Complete the table.' }],
            stimulusRefs: [{ stimulusId: 'stimulus-multi-anchor-table', anchorIds: [secondAnchorId] }],
            interactions: [
              {
                interactionId,
                taskGroupId,
                displayNumber: 2,
                responseShape: { kind: 'structured-entry', structure: 'table' },
                primaryAnchorId: secondAnchorId,
              },
            ],
          },
        ],
      },
    };
    const result: ReadingV2Result = {
      resultId: readingV2Ids.resultId('result-multi-anchor-review'),
      testId: 'material-multi-anchor-review',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      deliveryEngine: READING_V2_ENGINE,
      publishedSnapshotVersion: sourceSnapshotVersionId,
      attemptContext: { mode: 'solo-practice' },
      submittedAt: '2026-06-06T00:00:00.000Z',
      interactions: [
        {
          interactionId,
          taskGroupId,
          displayNumber: 2,
          taskFamily: 'structured-layout',
          officialTaskType: 'table-completion',
          studentAnswer: 'student answer',
          scoredAnswer: 'expected answer',
          score: 1,
          maxScore: 1,
          reviewState: 'pending',
          anchorRef: secondAnchorId,
        },
      ],
    };

    const reviewPayload = buildReadingV2GroupedReviewPayload({ result, projection });

    expect(reviewPayload.taskGroups[0]?.stimulusContext[0]).toEqual(expect.objectContaining({
      anchorLabels: ['Question 2 table blank'],
      excerpt: expect.stringContaining('Shared table cell for questions 1 and 2'),
    }));
  });

  it('builds a producer-consumer persistence plan for V2 and existing result readers', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-persist',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['answer one', 'answer two']),
      context: { mode: 'live-session', sessionCode: 'SESSION1' },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-persist',
      testId: 'material-persist',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload,
      studentName: 'Student One',
      testTitle: 'Reading V2 Result',
      sessionCode: 'SESSION1',
    });

    const plan = buildReadingV2ResultPersistencePlan({
      attempt,
      result,
      savedResult,
      reviewPayload,
    });

    expect(plan.operations.map((operation) => operation.path)).toEqual([
      'reading_v2/attempts/attempt-persist',
      'reading_v2/results/result-persist',
      'reading_v2/review_indexes/result-persist',
      'test_results/result-persist',
      'test_results_by_session/SESSION1/result-persist',
      'test_results_by_student/student-1/result-persist',
    ]);
  });

  it('fans out course-owned V2 results to every existing result consumer index without undefined fields', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-course-indexes',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['answer one', 'answer two']),
      context: {
        mode: 'course-material',
        courseId: 'course-1',
        classId: 'class-1',
        materialId: readingV2Ids.materialId('material-course-indexes'),
      },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-course-indexes',
      testId: 'material-course-indexes',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload,
      studentName: 'Student One',
      testTitle: 'Reading V2 Course Result',
      courseId: 'course-1',
      classId: 'class-1',
      visibility: {
        contextType: 'course_material',
        sourceType: 'course',
        sourceId: 'course-1',
        sourceNameSnapshot: 'Course One',
        visibilityOwnerTeacherId: 'teacher-1',
        ownerResolutionSource: 'course.ownerId',
        ownershipResolved: true,
        unresolvedReason: null,
        homeworkId: null,
        sessionCode: null,
        courseId: 'course-1',
        classId: 'class-1',
        assignmentId: null,
      },
    });

    const plan = buildReadingV2ResultPersistencePlan({
      attempt,
      result,
      savedResult,
      reviewPayload,
    });

    expect(plan.operations.map((operation) => operation.path)).toEqual(expect.arrayContaining([
      'test_results/result-course-indexes',
      'test_results_by_session/reading-v2/result-course-indexes',
      'test_results_by_student/student-1/result-course-indexes',
      'test_results_by_teacher/teacher-1/result-course-indexes',
      'test_results_by_course/course-1/student-1/result-course-indexes',
      'test_results_by_class/class-1/student-1/result-course-indexes',
    ]));
    expect(plan.operations.every((operation) => !containsUndefined(operation.value))).toBe(true);
    expect(plan.operations.find((operation) => operation.path === 'reading_v2/review_indexes/result-course-indexes')?.value)
      .toMatchObject({ ownerId: 'teacher-1' });
  });

  it('sanitizes student-visible Reading V2 review payloads by release policy', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-sanitized',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['wrong', 'wrong']),
      context: { mode: 'solo-practice' },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-sanitized',
      testId: 'material-sanitized',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload: buildReadingV2GroupedReviewPayload({
        result,
        projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      }),
      studentName: 'Student One',
      testTitle: 'Reading V2 Result',
    });

    const sanitized = sanitizeReadingV2ResultForReleasePolicy(savedResult, {
      showScore: true,
      showCorrectAnswers: false,
      showExplanations: false,
      showFeedback: false,
    });

    expect(sanitized.questionResults.every((question) => question.correctAnswer === '')).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain('answer one');
    expect(JSON.stringify(sanitized)).not.toContain('importEvidence');
    expect(JSON.stringify(sanitized)).not.toContain('hiddenProvenance');
  });

  it('honors score and explanation release-policy gates for Reading V2 result payloads', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-score-hidden',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['wrong', 'wrong']),
      context: { mode: 'solo-practice' },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-score-hidden',
      testId: 'material-score-hidden',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload: buildReadingV2GroupedReviewPayload({
        result,
        projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
      }),
      studentName: 'Student One',
      testTitle: 'Reading V2 Result',
    });
    const withExplanation = {
      ...savedResult,
      questionResults: savedResult.questionResults.map((question) => ({
        ...question,
        feedback: 'Question-level explanation',
      })),
      formativeFeedback: {
        analysis: { strengths: [], revision: [], critical: [] },
        deterministicFeedback: 'Saved deterministic feedback',
        generatedAt: 1,
        totalCorrect: 0,
        totalQuestions: 2,
        scaledScore: 0,
        questionExplanations: { '1': 'Hidden explanation' },
        fallbackQuestionExplanations: { '2': 'Hidden fallback explanation' },
      },
    };

    const sanitized = sanitizeReadingV2ResultForReleasePolicy(withExplanation, {
      showScore: false,
      showCorrectAnswers: true,
      showExplanations: false,
      showFeedback: true,
    });

    expect(sanitized.totalScore).toBe(0);
    expect(sanitized.percentage).toBe(0);
    expect(sanitized.questionResults.every((question) => question.score === 0 && question.maxScore === 0)).toBe(true);
    expect(sanitized.readingV2.reviewPayload.taskGroups[0].interactions[0]).toMatchObject({
      score: 0,
      maxScore: 0,
    });
    expect(sanitized.questionResults.every((question) => question.feedback === '')).toBe(true);
    expect(sanitized.formativeFeedback?.questionExplanations).toEqual({});
    expect(sanitized.formativeFeedback?.fallbackQuestionExplanations).toEqual({});
  });

  it('creates regrade artifacts without mutating historical result truth', () => {
    const taskType = 'sentence-completion';
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-regrade',
      studentId: 'student-1',
      submitPayload: answerPayloadFor(taskType, ['wrong', 'wrong']),
      context: { mode: 'solo-practice' },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'result-regrade',
      testId: 'material-regrade',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: publishedSnapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });
    const before = structuredClone(result);
    const artifact = createReadingV2RegradeArtifact({
      result,
      regradeId: 'regrade-1',
      reviewedScore: 2,
      changedBy: 'teacher-1',
      reason: 'Manual review accepted alternate answers',
      changedAt: '2026-04-28T00:10:00.000Z',
    });

    expect(artifact).toMatchObject({
      resultId: 'result-regrade',
      originalScore: 0,
      reviewedScore: 2,
      changedBy: 'teacher-1',
    });
    expect(result).toEqual(before);
  });

  it('plans append-only regrade artifact writes without replacing saved result truth', () => {
    const result: ReadingV2Result = {
      resultId: readingV2Ids.resultId('result-regrade'),
      testId: 'material-regrade',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      deliveryEngine: READING_V2_ENGINE,
      publishedSnapshotVersion: readingV2Ids.snapshotVersionId('snapshot-regrade'),
      attemptContext: { mode: 'solo-practice' },
      submittedAt: '2026-04-28T00:00:00.000Z',
      interactions: [
        {
          interactionId: readingV2Ids.interactionId('interaction-1'),
          taskGroupId: readingV2Ids.taskGroupId('task-group-1'),
          displayNumber: 1,
          taskFamily: 'completion',
          officialTaskType: 'sentence-completion',
          studentAnswer: 'alternate answer',
          scoredAnswer: 'canonical answer',
          score: 1,
          maxScore: 1,
          reviewState: 'released',
        },
      ],
    };
    const artifact = createReadingV2RegradeArtifact({
      result,
      regradeId: 'regrade-1',
      reviewedScore: 2,
      changedBy: 'teacher-1',
      reason: 'Accepted alternate answer',
      changedAt: '2026-04-28T00:10:00.000Z',
    });

    const plan = buildReadingV2RegradePersistencePlan({ artifact });

    expect(plan.operations).toEqual([
      {
        key: 'reading-v2-regrade-artifact:result-regrade:regrade-1',
        path: 'reading_v2/regrade_artifacts/result-regrade/regrade-1',
        value: artifact,
      },
      {
        key: 'existing-result-regrade-artifact:result-regrade:regrade-1',
        path: 'test_results/result-regrade/readingV2/regradeArtifactsById/regrade-1',
        value: artifact,
      },
    ]);
    expect(plan.operations.map((operation) => operation.path)).not.toContain('test_results/result-regrade');
  });
});
