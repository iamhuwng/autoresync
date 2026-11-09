import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { scoreReadingV2Answer } from './readingV2AnswerScoring';

const interactionFor = (acceptableAnswers: readonly string[]) => {
  const interaction = Object.values(createReadingV2CanonicalFixture('sentence-completion').interactions)[0];
  if (!interaction) {
    throw new Error('Expected a sentence-completion fixture interaction.');
  }

  return {
    ...interaction,
    responseShape: { kind: 'free-text' as const, wordLimit: 3 },
    scoringRule: {
      maxScore: 1,
      acceptableAnswers,
      caseSensitive: false,
      punctuationSensitive: false,
    },
  };
};

const groupedMultiSelectInteraction = () => {
  const interaction = Object.values(createReadingV2CanonicalFixture('multiple-select').interactions)[0];
  if (!interaction || interaction.responseShape.kind !== 'multi-select') {
    throw new Error('Expected a multiple-select fixture interaction.');
  }

  return {
    ...interaction,
    responseShape: { ...interaction.responseShape, selectionLimit: 3 as const },
    scoringRule: { maxScore: 3, acceptableAnswers: ['A', 'B', 'C'], orderMatters: false },
    reviewLabel: { displayNumber: 8, answerSlotCount: 3 },
  };
};

describe('readingV2AnswerScoring', () => {
  it.each([
    ['1,000', '1000', 1],
    ['3,000', '3.000', 0],
    ['1.5', '1,5', 0],
    ['1,000', '1.000', 0],
    ['10 kg', '10', 0],
    ['km/h', 'kmh', 0],
    ['A/B', 'A/B', 1],
    ['A/B', 'AB', 0],
  ] as const)('scores %s against %s as %s', (expected, student, score) => {
    expect(scoreReadingV2Answer(student, interactionFor([expected])).score).toBe(score);
  });

  it.each([
    [['A', 'B', 'C'], 3],
    [['B', 'C', 'A'], 3],
    [['C', 'A', 'B'], 3],
    [['A', 'A', 'C'], 2],
  ] as const)('scores grouped multiple-answer selections one-to-one', (student, score) => {
    const result = scoreReadingV2Answer(student, groupedMultiSelectInteraction());
    expect(result.score).toBe(score);
    expect(result.answerSlotScores).toHaveLength(3);
  });
});
