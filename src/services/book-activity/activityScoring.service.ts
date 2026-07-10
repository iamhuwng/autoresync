import type {
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';

export interface BookActivityScoreResult {
  readonly score: number;
  readonly maxScore: number;
  readonly requiresTeacherReview: boolean;
}

export class BookActivityScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookActivityScoringError';
  }
}

const equalNumberSets = (answer: unknown, expected: readonly number[]): boolean => (
  Array.isArray(answer) &&
  answer.every((entry): entry is number => Number.isInteger(entry)) &&
  answer.length === expected.length &&
  [...answer].sort().every((entry, index) => entry === [...expected].sort()[index])
);

const equalStringArrays = (answer: unknown, expected: readonly string[]): boolean => (
  Array.isArray(answer) &&
  answer.every((entry): entry is string => typeof entry === 'string') &&
  answer.length === expected.length &&
  answer.every((entry, index) => entry.trim() === expected[index].trim())
);

const matchesPairAnswer = (
  answer: unknown,
  expectedPairs: readonly { readonly left: string; readonly right: string }[],
): boolean => {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return false;
  }

  const submitted = answer as Record<string, unknown>;
  return Object.keys(submitted).length === expectedPairs.length &&
    expectedPairs.every((pair) => submitted[pair.left] === pair.right);
};

const assertObjectiveAnswerRule = (version: BookActivityVersionRecord): void => {
  const { answerRule, interactions } = version.content;

  if (answerRule.type === 'single-choice' &&
    (!answerRule.correctChoiceIndexes || answerRule.correctChoiceIndexes.length !== interactions.length)) {
    throw new BookActivityScoringError('single-choice Activity lacks one correct choice index per interaction.');
  }

  if (answerRule.type === 'multiple-choice' &&
    (!answerRule.correctChoiceIndexes || answerRule.correctChoiceIndexes.length === 0 || interactions.length !== 1)) {
    throw new BookActivityScoringError('multiple-choice Activity lacks a valid single-interaction answer key.');
  }

  if (answerRule.type === 'text-exact' &&
    (!answerRule.acceptableAnswers || answerRule.acceptableAnswers.length === 0)) {
    throw new BookActivityScoringError('text-exact Activity lacks acceptable answers.');
  }

  if (answerRule.type === 'matching' &&
    (!answerRule.matchingPairs || answerRule.matchingPairs.length === 0)) {
    throw new BookActivityScoringError('matching Activity lacks matching pairs.');
  }

  if (answerRule.type === 'ordering' &&
    (!answerRule.ordering || answerRule.ordering.length === 0)) {
    throw new BookActivityScoringError('ordering Activity lacks ordered answers.');
  }
};

export const scoreActivityAttempt = (
  version: BookActivityVersionRecord,
  answers: Readonly<Record<string, unknown>>,
): BookActivityScoreResult => {
  const maxScore = version.content.scoring?.points ?? version.content.interactions.length;

  if (version.content.answerRule.type === 'rubric') {
    return {
      score: 0,
      maxScore,
      requiresTeacherReview: true,
    };
  }

  assertObjectiveAnswerRule(version);

  let correct = 0;
  version.content.interactions.forEach((interaction, index) => {
    const answer = answers[`i${index + 1}`] ?? answers[interaction.hiddenInteractionId];

    if (
      version.content.answerRule.type === 'single-choice' &&
      Array.isArray(version.content.answerRule.correctChoiceIndexes) &&
      answer === version.content.answerRule.correctChoiceIndexes[index]
    ) {
      correct += 1;
    }

    if (
      version.content.answerRule.type === 'multiple-choice' &&
      Array.isArray(version.content.answerRule.correctChoiceIndexes) &&
      equalNumberSets(answer, version.content.answerRule.correctChoiceIndexes)
    ) {
      correct += 1;
    }

    if (
      version.content.answerRule.type === 'text-exact' &&
      Array.isArray(version.content.answerRule.acceptableAnswers) &&
      typeof answer === 'string' &&
      version.content.answerRule.acceptableAnswers
        .map((entry) => entry.trim().toLowerCase())
        .includes(answer.trim().toLowerCase())
    ) {
      correct += 1;
    }

    if (
      version.content.answerRule.type === 'matching' &&
      Array.isArray(version.content.answerRule.matchingPairs) &&
      matchesPairAnswer(answer, version.content.answerRule.matchingPairs)
    ) {
      correct += 1;
    }

    if (
      version.content.answerRule.type === 'ordering' &&
      Array.isArray(version.content.answerRule.ordering) &&
      equalStringArrays(answer, version.content.answerRule.ordering)
    ) {
      correct += 1;
    }
  });

  return {
    score: version.content.interactions.length === 0
      ? 0
      : (correct / version.content.interactions.length) * maxScore,
    maxScore,
    requiresTeacherReview: false,
  };
};
