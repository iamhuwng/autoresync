import type { ReadingV2ResponseShape } from '../../types/readingV2.types';

export type ReadingV2JudgementVocabulary = Extract<
  ReadingV2ResponseShape,
  { readonly kind: 'binary-judgement' }
>['vocabulary'];

export const READING_V2_CANONICAL_JUDGEMENT_ANSWERS: Readonly<
  Record<ReadingV2JudgementVocabulary, readonly string[]>
> = {
  TFNG: ['True', 'False', 'Not Given'],
  YNNG: ['Yes', 'No', 'Not Given'],
};

const NOT_GIVEN_ALIASES = new Set(['notgiven', 'ng']);
const TRUE_ALIASES = new Set(['true', 't']);
const FALSE_ALIASES = new Set(['false', 'f']);
const YES_ALIASES = new Set(['yes', 'y']);
const NO_ALIASES = new Set(['no', 'n']);

const compactJudgementAnswer = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const canonicalizeReadingV2JudgementAnswer = (
  value: unknown,
  vocabulary: ReadingV2JudgementVocabulary,
): string | null => {
  const compact = compactJudgementAnswer(value);

  if (!compact) {
    return null;
  }

  if (NOT_GIVEN_ALIASES.has(compact)) {
    return 'Not Given';
  }

  if (vocabulary === 'TFNG') {
    if (TRUE_ALIASES.has(compact)) {
      return 'True';
    }

    if (FALSE_ALIASES.has(compact)) {
      return 'False';
    }
  }

  if (vocabulary === 'YNNG') {
    if (YES_ALIASES.has(compact)) {
      return 'Yes';
    }

    if (NO_ALIASES.has(compact)) {
      return 'No';
    }
  }

  return null;
};

export const normalizeReadingV2JudgementAnswerForStorage = (
  value: string,
  vocabulary: ReadingV2JudgementVocabulary,
): string => {
  const canonical = canonicalizeReadingV2JudgementAnswer(value, vocabulary);
  return canonical ?? value.replace(/\s+/g, ' ').trim();
};

export const readingV2JudgementAnswersMatch = (
  studentAnswer: unknown,
  expectedAnswer: unknown,
  vocabulary: ReadingV2JudgementVocabulary,
): boolean => {
  const studentCanonical = canonicalizeReadingV2JudgementAnswer(studentAnswer, vocabulary);
  const expectedCanonical = canonicalizeReadingV2JudgementAnswer(expectedAnswer, vocabulary);

  return Boolean(studentCanonical && expectedCanonical && studentCanonical === expectedCanonical);
};
