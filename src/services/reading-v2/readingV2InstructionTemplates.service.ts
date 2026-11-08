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

export interface ReadingV2InstructionFacts {
  readonly wordLimit?: number;
  readonly numberAllowance?: 'none' | 'optional' | 'required' | 'alternative';
  readonly selectionLimit?: number;
  readonly vocabulary?: 'TFNG' | 'YNNG';
  readonly optionReuse?: 'allowed' | 'disallowed';
}

const WORD_LIMIT_PHRASE = /\b(?:NO MORE THAN\s+(?:ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORDS?(?:\s+(?:AND\s*\/\s*OR|AND|OR)\s+A\s+NUMBER)?|(?:ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORDS?\s+(?:ONLY|(?:AND\s*\/\s*OR|AND|OR)\s+A\s+NUMBER))\b/i;
const SELECTION_PHRASE = /\bCHOOSE\s+(?:EXACTLY\s+)?(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+LETTERS?\b/i;
const instructionNumber = (value: string): number =>
  ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[value.toUpperCase()] ?? Number(value));

export const readReadingV2WordLimitText = (value: string): string | undefined =>
  value.replace(/[*_]/g, '').match(WORD_LIMIT_PHRASE)?.[0].replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').toUpperCase();

/** Only explicit response rules are facts; task-type hints remain parser interpretations. */
export const readReadingV2InstructionFacts = (value: string): ReadingV2InstructionFacts => {
  const text = value.replace(/[*_]/g, '').replace(/\s+/g, ' ').toUpperCase();
  const phrase = readReadingV2WordLimitText(text);
  const word = phrase?.match(/\b(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORDS?\b/)?.[1];
  const wordLimit = word ? instructionNumber(word) : undefined;
  const numberAllowance = phrase ? /AND\/OR A NUMBER/.test(phrase) ? 'optional'
    : /AND A NUMBER/.test(phrase) ? 'required' : /OR A NUMBER/.test(phrase) ? 'alternative' : 'none' : undefined;
  const count = text.match(SELECTION_PHRASE)?.[1];
  const selectionLimit = count ? instructionNumber(count) : undefined;
  const vocabulary = /\bTRUE\b/.test(text) && /\bFALSE\b/.test(text) && /\bNOT GIVEN\b/.test(text) ? 'TFNG'
    : /\bYES\b/.test(text) && /\bNO\b/.test(text) && /\bNOT GIVEN\b/.test(text) ? 'YNNG' : undefined;
  const reuseMentioned = /\b(?:LETTER|OPTION|HEADING)S?\b/.test(text) && /MORE THAN ONCE|ONLY ONCE/.test(text);
  const optionReuse = reuseMentioned ? /\b(?:NOT|NEVER|CANNOT|CAN'T)\s+(?:BE\s+)?(?:USED|USE)\b|ONLY ONCE/.test(text) ? 'disallowed' : 'allowed' : undefined;
  return { ...(wordLimit && Number.isFinite(wordLimit) ? { wordLimit, numberAllowance } : {}),
    ...(selectionLimit && Number.isFinite(selectionLimit) ? { selectionLimit } : {}), ...(vocabulary ? { vocabulary } : {}), ...(optionReuse ? { optionReuse } : {}) };
};

export const updateReadingV2InstructionLimits = (text: string, limits: Pick<ReadingV2InstructionFacts, 'wordLimit' | 'selectionLimit'>): string => {
  if (limits.wordLimit !== undefined) {
    const word = NUMBER_WORDS[limits.wordLimit] ?? String(limits.wordLimit);
    text = text.replace(WORD_LIMIT_PHRASE, (phrase) => {
      const suffix = phrase.match(/\s+(?:AND\s*\/\s*OR|AND|OR)\s+A\s+NUMBER\b/i)?.[0].toUpperCase() ?? '';
      return `${limits.wordLimit === 1 ? `ONE WORD${suffix ? '' : ' ONLY'}` : `NO MORE THAN ${word} WORDS`}${suffix}`;
    });
  }
  if (limits.selectionLimit !== undefined) {
    const word = NUMBER_WORDS[limits.selectionLimit] ?? String(limits.selectionLimit);
    text = text.replace(SELECTION_PHRASE, `Choose ${word} ${limits.selectionLimit === 1 ? 'letter' : 'letters'}`);
  }
  return text;
};

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

const reuseInstruction = (semantics: ReadingV2InstructionSemantics, noun = 'letter'): string | undefined =>
  semantics.reuseAllowed === true ? `NB You may use any ${noun} more than once.`
    : semantics.reuseAllowed === false ? `Use each ${noun} only once.` : undefined;

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
        reuseInstruction(semantics, 'heading'),
      ]);
    case 'matching-information':
      return compact([
        'Which paragraph contains the following information?',
        writeCorrectLetterLine(range, referenceRange ?? 'A-F'),
        reuseInstruction(semantics),
      ]);
    case 'matching-features':
      return compact([
        'Look at the following statements and the list below.',
        `Match each statement with the correct option, ${referenceRange ?? 'A-E'}.`,
        writeCorrectLetterLine(range, referenceRange ?? 'A-E'),
        reuseInstruction(semantics),
      ]);
    case 'matching-sentence-endings':
      return compact([
        `Complete each sentence with the correct ending, ${referenceRange ?? 'A-F'}, below.`,
        writeCorrectLetterLine(range, referenceRange ?? 'A-F'),
        reuseInstruction(semantics),
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
        && (normalized.includes('information') || normalized.includes('views') || normalized.includes('writer'))
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
      return normalized.includes('complete the flowchart')
        || normalized.includes('complete the flow-chart')
        || normalized.includes('complete the flow chart');
    case 'diagram-labeling':
      return normalized.includes('label the diagram');
    case 'matching-headings':
      return normalized.includes('choose the correct heading') || normalized.includes('list of headings');
    case 'matching-information':
      return normalized.includes('matching information')
        || normalized.includes('which paragraph contains')
        || normalized.includes('which chapter contains')
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
