import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Attempt, type ReadingV2PublishedSnapshot } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE } from './fixtures/readingV2ProjectionFixtures';
import { scoreReadingV2Attempt } from './readingV2Scoring.service';

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
