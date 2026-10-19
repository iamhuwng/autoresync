// Pure scoring authority shared by trusted submission and local Reading V2 scoring.
import type { ReadingV2Interaction, ReadingV2OptionSet } from '../../types/readingV2.types';
import { readingV2JudgementAnswersMatch } from './readingV2JudgementAnswers.service';

const normalizeText = (value: unknown, options: {
  readonly caseSensitive?: boolean;
  readonly punctuationSensitive?: boolean;
}): string => {
  const joined = Array.isArray(value) ? value.join('|') : String(value ?? '');
  const cased = options.caseSensitive ? joined : joined.toLowerCase();
  const punctuated = options.punctuationSensitive ? cased : cased.replace(/[^\p{L}\p{N}\s|]/gu, '');
  return punctuated.replace(/\s+/g, ' ').trim();
};

const normalizeAnswerItems = (
  value: unknown,
  options: {
    readonly caseSensitive?: boolean;
    readonly punctuationSensitive?: boolean;
  },
  optionSet?: ReadingV2OptionSet,
): string[] => (Array.isArray(value) ? value : [value]).map((entry) =>
  normalizeText(optionLabelForAnswer(entry, optionSet), options),
);

const optionKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const optionLabelForAnswer = (
  value: unknown,
  optionSet: ReadingV2OptionSet | undefined,
): string => {
  const key = optionKey(value);
  const option = optionSet?.options.find((entry) =>
    optionKey(entry.label) === key || optionKey(entry.optionId) === key,
  );

  return option?.label ?? String(value ?? '');
};

const answerListsMatch = (
  studentItems: readonly string[],
  expectedItems: readonly string[],
  orderMatters: boolean,
): boolean => {
  if (studentItems.length !== expectedItems.length) {
    return false;
  }

  const left = orderMatters ? [...studentItems] : [...studentItems].sort();
  const right = orderMatters ? [...expectedItems] : [...expectedItems].sort();
  return left.every((entry, index) => entry === right[index]);
};

export const scoreReadingV2Answer = (
  studentAnswer: unknown,
  interaction: ReadingV2Interaction,
  optionSet?: ReadingV2OptionSet,
): {
  readonly score: number;
  readonly answerSlotScores?: readonly number[];
  readonly answerSlotAnswers?: readonly string[];
} => {
  const slotCount = interaction.reviewLabel.answerSlotCount ?? 1;
  if (interaction.responseShape.kind !== 'multi-select' || slotCount <= 1) {
    return {
      score: answerMatches(studentAnswer, interaction, optionSet) ? interaction.scoringRule.maxScore : 0,
    };
  }

  const answers = interaction.scoringRule.acceptableAnswers ?? [];
  const expected = normalizeAnswerItems(answers, interaction.scoringRule, optionSet).slice(0, slotCount);
  const selected = Array.isArray(studentAnswer)
    ? studentAnswer.map((answer) => optionLabelForAnswer(answer, optionSet))
    : [];
  const normalizedSelected = selected.map((answer) => normalizeText(answer, interaction.scoringRule));
  const used = new Set<number>();
  const answerSlotScores = Array.from({ length: slotCount }, () => 0);
  const answerSlotAnswers = Array.from({ length: slotCount }, () => '');

  Array.from({ length: slotCount }, (_value, slotIndex) => expected[slotIndex]).forEach((expectedAnswer, slotIndex) => {
    const correctIndex = expectedAnswer === undefined ? -1 : normalizedSelected.findIndex(
      (answer, index) => !used.has(index) && answer === expectedAnswer,
    );
    if (correctIndex >= 0) {
      used.add(correctIndex);
      answerSlotScores[slotIndex] = 1;
      answerSlotAnswers[slotIndex] = selected[correctIndex] ?? '';
    }
  });

  const unscoredSlots = answerSlotScores.flatMap((score, index) => score === 0 ? [index] : []);
  const unmatchedAnswers = selected.flatMap((answer, index) => used.has(index) ? [] : [answer]);
  unscoredSlots.forEach((slotIndex, index) => {
    answerSlotAnswers[slotIndex] = unmatchedAnswers[index] ?? '';
  });

  return {
    score: answerSlotScores.reduce((total, score) => total + score, 0),
    answerSlotScores,
    answerSlotAnswers,
  };
};

export const answerMatches = (
  studentAnswer: unknown,
  interaction: ReadingV2Interaction,
  optionSet?: ReadingV2OptionSet,
): boolean => {
  const acceptableAnswers = interaction.scoringRule.acceptableAnswers ?? [];
  const responseShape = interaction.responseShape;
  if (acceptableAnswers.length === 0) {
    return false;
  }

  if (responseShape.kind === 'binary-judgement') {
    if (Array.isArray(studentAnswer)) {
      return false;
    }
    return acceptableAnswers.some((answer) =>
      readingV2JudgementAnswersMatch(studentAnswer, answer, responseShape.vocabulary),
    );
  }

  if (responseShape.kind === 'multi-select') {
    if (!Array.isArray(studentAnswer)) {
      return false;
    }
    return answerListsMatch(
      normalizeAnswerItems(studentAnswer, interaction.scoringRule, optionSet),
      normalizeAnswerItems(acceptableAnswers, interaction.scoringRule, optionSet),
      interaction.scoringRule.orderMatters !== false,
    );
  }

  if (Array.isArray(studentAnswer)) {
    return false;
  }

  const normalizedStudent = normalizeText(optionLabelForAnswer(studentAnswer, optionSet), interaction.scoringRule);
  return acceptableAnswers.some(
    (answer) => normalizeText(optionLabelForAnswer(answer, optionSet), interaction.scoringRule) === normalizedStudent,
  );
};

export const optionSetIdForInteraction = (
  interaction: ReadingV2Interaction,
): string | undefined => {
  if (
    interaction.responseShape.kind === 'single-choice'
    || interaction.responseShape.kind === 'multi-select'
    || interaction.responseShape.kind === 'matching'
  ) {
    return interaction.responseShape.optionSetId;
  }

  return undefined;
};

export const correctAnswerForInteraction = (
  interaction: ReadingV2Interaction,
  optionSet?: ReadingV2OptionSet,
): unknown => {
  const acceptableAnswers = interaction.scoringRule.acceptableAnswers ?? [];
  const displayAnswers = acceptableAnswers.map((answer) => optionLabelForAnswer(answer, optionSet));

  return interaction.scoringRule.orderMatters === false ? displayAnswers : displayAnswers[0] ?? '';
};
