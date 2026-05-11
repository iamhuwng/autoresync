import { describe, expect, it } from 'vitest';
import { canonicalizeReadingV2JudgementAnswer } from './readingV2JudgementAnswers.service';

describe('readingV2JudgementAnswers.service', () => {
  it.each([
    ['TRUE', 'TFNG', 'True'],
    ['true', 'TFNG', 'True'],
    ['t', 'TFNG', 'True'],
    ['FALSE', 'TFNG', 'False'],
    ['false', 'TFNG', 'False'],
    ['f', 'TFNG', 'False'],
    ['NOT GIVEN', 'TFNG', 'Not Given'],
    ['not given', 'TFNG', 'Not Given'],
    ['ng', 'TFNG', 'Not Given'],
    ['N.G.', 'TFNG', 'Not Given'],
  ] as const)('canonicalizes TFNG alias %s', (value, vocabulary, expected) => {
    expect(canonicalizeReadingV2JudgementAnswer(value, vocabulary)).toBe(expected);
  });

  it.each([
    ['YES', 'YNNG', 'Yes'],
    ['y', 'YNNG', 'Yes'],
    ['NO', 'YNNG', 'No'],
    ['n', 'YNNG', 'No'],
    ['not-given', 'YNNG', 'Not Given'],
  ] as const)('canonicalizes YNNG alias %s', (value, vocabulary, expected) => {
    expect(canonicalizeReadingV2JudgementAnswer(value, vocabulary)).toBe(expected);
  });

  it('does not cross TFNG and YNNG positive or negative labels', () => {
    expect(canonicalizeReadingV2JudgementAnswer('yes', 'TFNG')).toBeNull();
    expect(canonicalizeReadingV2JudgementAnswer('false', 'YNNG')).toBeNull();
  });

  it('rejects misspellings instead of guessing teacher or student intent', () => {
    expect(canonicalizeReadingV2JudgementAnswer('FLASE', 'TFNG')).toBeNull();
  });
});
