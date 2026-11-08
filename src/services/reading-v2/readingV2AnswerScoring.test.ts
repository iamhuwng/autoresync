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
});
