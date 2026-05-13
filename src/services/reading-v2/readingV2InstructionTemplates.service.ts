import type { ReadingV2CanonicalTaskType } from '../../types/readingV2Taxonomy';

export const READING_V2_INSTRUCTION_TEXT_SOURCE =
  'documentation/samples/IELTS-question-task-type-samples.md';

export const READING_V2_INSTRUCTION_DISPLAY_SOURCE =
  'documentation/samples/IELTS-reading-question-type-display-design.md';

export interface ReadingV2InstructionRange {
  readonly start: number;
  readonly end: number;
}

export interface ReadingV2InstructionSemantics {
  readonly questionRange?: ReadingV2InstructionRange;
  readonly wordLimit?: number;
  readonly wordLimitText?: string;
  readonly passageNumber?: number;
  readonly selectionLimit?: number;
  readonly optionLabelRange?: string;
  readonly referenceLabelRange?: string;
  readonly reuseAllowed?: boolean;
}

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  1: 'ONE',
  2: 'TWO',
  3: 'THREE',
  4: 'FOUR',
  5: 'FIVE',
};

const cleanInstructionComparable = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/[_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const boundedWordLimit = (wordLimit: number | undefined): number | undefined =>
  Number.isFinite(wordLimit)
    ? Math.max(1, Math.min(5, Math.round(wordLimit ?? 0)))
    : undefined;

const wordLimitPhrase = (
  taskType: ReadingV2CanonicalTaskType,
  semantics: ReadingV2InstructionSemantics,
): string | undefined => {
  const explicit = semantics.wordLimitText?.trim();
  if (explicit) {
    return explicit.toUpperCase();
  }

  const wordLimit = boundedWordLimit(semantics.wordLimit);
  const word = wordLimit ? NUMBER_WORDS[wordLimit] ?? String(wordLimit) : undefined;

  if (!wordLimit || !word) {
    switch (taskType) {
      case 'sentence-completion':
      case 'diagram-labeling':
        return 'ONE WORD ONLY';
      case 'summary-completion-text':
      case 'table-completion':
      case 'flowchart-completion':
        return 'NO MORE THAN TWO WORDS';
      case 'note-completion':
        return 'ONE WORD AND/OR A NUMBER';
      case 'short-answer':
        return 'NO MORE THAN THREE WORDS AND/OR A NUMBER';
      default:
        return undefined;
    }
  }

  if (taskType === 'note-completion') {
    return wordLimit === 1
      ? 'ONE WORD AND/OR A NUMBER'
      : `NO MORE THAN ${word} WORDS AND/OR A NUMBER`;
  }

  if (taskType === 'short-answer') {
    return `NO MORE THAN ${word} ${wordLimit === 1 ? 'WORD' : 'WORDS'} AND/OR A NUMBER`;
  }

  if (wordLimit === 1) {
    return 'ONE WORD ONLY';
  }

  return `NO MORE THAN ${word} WORDS`;
};

const passageLabel = (semantics: ReadingV2InstructionSemantics): string =>
  semantics.passageNumber ? `Reading Passage ${semantics.passageNumber}` : 'the passage';

const boxTarget = (range: ReadingV2InstructionRange | undefined): string | undefined => {
  if (!range || !range.start || !range.end) {
    return undefined;
  }

  return range.start === range.end ? `box ${range.start}` : `boxes ${range.start}-${range.end}`;
};

const writeAnswersLine = (
  range: ReadingV2InstructionRange | undefined,
  noun = 'answers',
): string | undefined => {
  const target = boxTarget(range);
  if (!target) {
    return undefined;
  }

  const singular = target.startsWith('box ');
  return `Write your ${singular ? noun.replace(/s$/, '') : noun} in ${target} on your answer sheet.`;
};

const writeCorrectLetterLine = (
  range: ReadingV2InstructionRange | undefined,
  labelRange: string | undefined,
  plural = false,
): string | undefined => {
  const target = boxTarget(range);
  if (!target) {
    return undefined;
  }

  const labelSuffix = labelRange ? `, ${labelRange},` : '';
  return `Write the correct ${plural ? 'letters' : 'letter'}${labelSuffix} in ${target} on your answer sheet.`;
};

const compact = (values: readonly (string | undefined)[]): readonly string[] =>
  values.filter((value): value is string => Boolean(value?.trim()));

const selectionPhrase = (selectionLimit: number | undefined): string => {
  const bounded = boundedWordLimit(selectionLimit) ?? 2;
  return NUMBER_WORDS[bounded] ?? String(bounded);
};

export const getReadingV2InstructionText = (
  taskType: ReadingV2CanonicalTaskType,
  semantics: ReadingV2InstructionSemantics = {},
): string => getReadingV2InstructionParagraphs(taskType, semantics).join('\n\n');

export const getReadingV2InstructionParagraphs = (
  taskType: ReadingV2CanonicalTaskType,
  semantics: ReadingV2InstructionSemantics = {},
): readonly string[] => {
  const range = semantics.questionRange;
  const limitPhrase = wordLimitPhrase(taskType, semantics);
  const optionRange = semantics.optionLabelRange ?? 'A-D';
  const multipleSelectRange = semantics.optionLabelRange ?? 'A-E';
  const referenceRange = semantics.referenceLabelRange;

  switch (taskType) {
    case 'sentence-completion':
      return compact([
        'Complete the sentences below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'summary-completion-text':
      return compact([
        'Complete the summary below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'summary-completion-list':
      return compact([
        `Complete the summary using the list of phrases, ${semantics.optionLabelRange ?? 'A-H'}, below.`,
        writeCorrectLetterLine(range, semantics.optionLabelRange ?? 'A-H'),
      ]);
    case 'note-completion':
      return compact([
        'Complete the notes below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'table-completion':
      return compact([
        'Complete the table below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'flowchart-completion':
      return compact([
        'Complete the flow-chart below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'diagram-labeling':
      return compact([
        'Label the diagram below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
    case 'true-false-not-given':
      return compact([
        `Do the following statements agree with the information given in ${passageLabel(semantics)}?`,
        range ? `In ${boxTarget(range)} on your answer sheet, write` : undefined,
        'TRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this',
      ]);
    case 'yes-no-not-given':
      return compact([
        `Do the following statements agree with the claims of the writer in ${passageLabel(semantics)}?`,
        range ? `In ${boxTarget(range)} on your answer sheet, write` : undefined,
        'YES if the statement agrees with the claims of the writer\nNO if the statement contradicts the claims of the writer\nNOT GIVEN if it is impossible to say what the writer thinks about this',
      ]);
    case 'matching-headings':
      return compact([
        'Choose the correct heading for each section from the list of headings below.',
        referenceRange
          ? `Write the correct number, ${referenceRange}, in ${boxTarget(range) ?? 'the boxes'} on your answer sheet.`
          : writeCorrectLetterLine(range, undefined),
      ]);
    case 'matching-information':
      return compact([
        'Which paragraph contains the following information?',
        writeCorrectLetterLine(range, referenceRange ?? 'A-F'),
        semantics.reuseAllowed ? 'NB You may use any letter more than once.' : undefined,
      ]);
    case 'matching-features':
      return compact([
        'Look at the following statements and the list below.',
        `Match each statement with the correct option, ${referenceRange ?? 'A-E'}.`,
        writeCorrectLetterLine(range, referenceRange ?? 'A-E'),
      ]);
    case 'matching-sentence-endings':
      return compact([
        `Complete each sentence with the correct ending, ${referenceRange ?? 'A-F'}, below.`,
        writeCorrectLetterLine(range, referenceRange ?? 'A-F'),
      ]);
    case 'multiple-choice':
      return compact([
        `Choose the correct letter, ${optionRange}.`,
        writeCorrectLetterLine(range, optionRange),
      ]);
    case 'multiple-select':
      return compact([
        `Choose ${selectionPhrase(semantics.selectionLimit)} letters, ${multipleSelectRange}.`,
        writeCorrectLetterLine(range, multipleSelectRange, true),
      ]);
    case 'short-answer':
      return compact([
        'Answer the questions below.',
        limitPhrase ? `Choose ${limitPhrase} from the passage for each answer.` : undefined,
        writeAnswersLine(range),
      ]);
  }
};

export const readingV2InstructionLooksStandard = (
  taskType: ReadingV2CanonicalTaskType,
  text: string | undefined,
  semantics: ReadingV2InstructionSemantics = {},
): boolean => {
  const normalized = cleanInstructionComparable(text ?? '');
  if (!normalized) {
    return true;
  }

  const canonical = cleanInstructionComparable(getReadingV2InstructionText(taskType, semantics));
  if (canonical && (canonical.includes(normalized) || normalized.includes(canonical))) {
    return true;
  }

  if (normalized.includes(taskType) || normalized.includes(taskType.replace(/-/g, ' '))) {
    return true;
  }

  switch (taskType) {
    case 'true-false-not-given':
      return normalized.includes('statements agree')
        && normalized.includes('information')
        && normalized.includes('true')
        && normalized.includes('false')
        && normalized.includes('not given');
    case 'yes-no-not-given':
      return (normalized.includes('claims') || normalized.includes('views') || normalized.includes('writer'))
        && normalized.includes('yes')
        && normalized.includes('no')
        && normalized.includes('not given');
    case 'short-answer':
      return normalized.includes('answer the questions') && normalized.includes('passage');
    case 'table-completion':
      return normalized.includes('complete the table');
    case 'flowchart-completion':
      return normalized.includes('complete the flowchart') || normalized.includes('complete the flow-chart');
    case 'diagram-labeling':
      return normalized.includes('label the diagram');
    case 'matching-headings':
      return normalized.includes('choose the correct heading') || normalized.includes('list of headings');
    case 'matching-information':
      return normalized.includes('matching information')
        || normalized.includes('which paragraph contains')
        || (normalized.includes('which paragraph') && normalized.includes('following information'));
    case 'matching-features':
      return normalized.includes('match') && (normalized.includes('option') || normalized.includes('list'));
    case 'matching-sentence-endings':
      return normalized.includes('sentence ending') || normalized.includes('complete each sentence');
    case 'multiple-choice':
      return normalized.includes('choose the correct') || normalized.includes('multiple choice');
    case 'multiple-select':
      return normalized.includes('choose') && normalized.includes('letters');
    case 'summary-completion-text':
    case 'summary-completion-list':
      return normalized.includes('complete the summary');
    case 'note-completion':
      return normalized.includes('complete the notes');
    case 'sentence-completion':
      return normalized.includes('complete the sentence') || normalized.includes('complete the sentences');
  }
};
