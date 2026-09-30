import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Attempt, type ReadingV2PublishedSnapshot } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE } from './fixtures/readingV2ProjectionFixtures';
import { scoreReadingV2Attempt } from './readingV2Scoring.service';
import { buildReadingV2TrustedSubmissionPlan } from '../../../functions/src/readingV2SubmitCore';

const answersFor = (taskType: keyof typeof READING_V2_CANONICAL_FIXTURES): readonly [string, string] => {
  switch (taskType) {
    case 'multiple-choice':
    case 'matching-features':
      return ['A', 'B'];
    case 'true-false-not-given':
      return ['True', 'False'];
    default:
      return ['answer one', 'answer two'];
  }
};

const attemptFor = (taskType: keyof typeof READING_V2_CANONICAL_FIXTURES): ReadingV2Attempt => ({
  attemptId: readingV2Ids.attemptId(`attempt-${taskType}`),
  studentId: 'student-1',
  sourceSnapshotVersionId: readingV2Ids.snapshotVersionId(`projection-fixture-snapshot-${taskType}`),
  context: { mode: 'solo-practice' },
  answers: {
    [`interaction-${taskType}-1`]: {
      taskGroupId: `task-group-${taskType}`,
      visibleNumber: 1,
      value: answersFor(taskType)[0],
    },
    [`interaction-${taskType}-2`]: {
      taskGroupId: `task-group-${taskType}`,
      visibleNumber: 2,
      value: answersFor(taskType)[1],
    },
  },
});

const snapshotFor = (taskType: keyof typeof READING_V2_CANONICAL_FIXTURES): ReadingV2PublishedSnapshot => ({
  snapshotVersionId: readingV2Ids.snapshotVersionId(`projection-fixture-snapshot-${taskType}`),
  materialId: readingV2Ids.materialId(`projection-fixture-material-${taskType}`),
  ownerId: 'teacher-1',
  document: READING_V2_CANONICAL_FIXTURES[taskType],
  publishedAt: '2026-04-28T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

describe('readingV2Scoring.service', () => {
  it.each(['multiple-choice', 'multiple-select', 'matching-features', 'true-false-not-given'] as const)(
    'trusted submit scores %s identically to the local scorer', (taskType) => {
      const original = snapshotFor(taskType);
      const interactions = Object.fromEntries(Object.entries(original.document.interactions).map(([id, interaction]) => {
        const expected = interaction.scoringRule.acceptableAnswers![0]!;
        if (taskType === 'true-false-not-given') {
          return [id, { ...interaction, scoringRule: { ...interaction.scoringRule, acceptableAnswers: [expected === 'True' ? 'T' : 'F'] } }];
        } else {
          const optionSet = Object.values(original.document.optionSets)[0]!;
          return [id, { ...interaction, scoringRule: { ...interaction.scoringRule, acceptableAnswers: interaction.scoringRule.acceptableAnswers!.map(answer => optionSet.options.find(option => option.label === answer)!.optionId) } }];
        }
      }));
      const snapshot = { ...original, document: { ...original.document, interactions } };
      const attempt = taskType === 'multiple-select'
        ? { ...attemptFor(taskType), answers: Object.fromEntries(Object.entries(original.document.interactions).map(([id, interaction], index) => [id, {
            taskGroupId: interaction.taskGroupId, visibleNumber: index + 1,
            value: [...interaction.scoringRule.acceptableAnswers!].reverse(),
          }])) }
        : attemptFor(taskType);
      const projection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review;
      const local = scoreReadingV2Attempt({ resultId: 'parity', testId: snapshot.materialId, studentId: 'student-1', ownerId: 'teacher-1', attempt, snapshot, projection });
      const trusted = buildReadingV2TrustedSubmissionPlan({
        request: {
          deliveryEngine: 'reading-v2', projectionId: projection.projectionId,
          sourceSnapshotVersionId: snapshot.snapshotVersionId, materialId: snapshot.materialId,
          answers: Object.entries(attempt.answers).map(([interactionId, record]) => {
            const answer = record as { taskGroupId: string; visibleNumber: number; value: string | readonly string[] };
            return { interactionId, taskGroupId: answer.taskGroupId, displayNumber: answer.visibleNumber, value: answer.value };
          }),
          context: { surface: 'solo-practice' },
        },
        auth: { uid: 'student-1' },
        records: { snapshot, reviewProjection: projection },
        identity: { resultId: 'parity', attemptId: 'parity-attempt', submittedAtIso: '2026-09-30T00:00:00Z', submittedAtMs: 1790726400000 },
      });
      expect(local.interactions.map(row => row.score)).toEqual([1, 1]);
      expect(trusted.savedResult.readingV2.result.interactions.map((row: { score: number }) => row.score)).toEqual([1, 1]);
      expect(trusted.savedResult.questionResults.map((row: { correctAnswer: unknown }) => row.correctAnswer)).toEqual(local.interactions.map(row => row.scoredAnswer));
    },
  );
  it.each([
    'sentence-completion',
    'multiple-choice',
    'true-false-not-given',
    'matching-features',
    'table-completion',
  ] as const)('scores %s from canonical snapshot answer rules', (taskType) => {
    const result = scoreReadingV2Attempt({
      resultId: `result-${taskType}`,
      testId: `material-${taskType}`,
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt: attemptFor(taskType),
      snapshot: snapshotFor(taskType),
      projection: READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].review,
    });

    expect(result.interactions.map((interaction) => interaction.score)).toEqual([1, 1]);
    expect(result.interactions.map((interaction) => interaction.displayNumber)).toEqual([1, 2]);
  });
});
