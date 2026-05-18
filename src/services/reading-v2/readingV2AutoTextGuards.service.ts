const COMPLETION_BLANK_PATTERN_SOURCE = String.raw`(?:\\_){3,}|_{3,}|(?:\\\.){3,}|\.{3,}|\u2026|\u00e2\u20ac\u00a6|\[\s*(?:blank|\d+)\s*\]|\{\{\s*(?:blank|\d+)\s*\}\}`;
const QUESTION_LINE_DECORATION_SOURCE = String.raw`\s*(?:(?:[-*]|\u2022|\u25cf)\s*)?`;

export const READING_V2_AUTO_COMPLETION_BLANK_PATTERN = new RegExp(COMPLETION_BLANK_PATTERN_SOURCE, 'i');
const READING_V2_AUTO_COMPLETION_BLANK_GLOBAL_PATTERN = new RegExp(COMPLETION_BLANK_PATTERN_SOURCE, 'gi');

const compactText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const questionNumberMarkerSourceFor = (questionNumber: number): string =>
  String.raw`(?:\*\*|__)?${questionNumber}(?:\*\*|__)?(?:[.)])?`;

const questionLinePrefixPatternFor = (questionNumber: number): RegExp =>
  new RegExp(String.raw`^${QUESTION_LINE_DECORATION_SOURCE}${questionNumberMarkerSourceFor(questionNumber)}(?:\s|$)`);

const embeddedQuestionBlankPatternFor = (questionNumber: number): RegExp =>
  new RegExp(String.raw`(?:^|\D)${questionNumberMarkerSourceFor(questionNumber)}\s+`);

const QUESTION_MARKER_BEFORE_BLANK_PATTERN = new RegExp(
  String.raw`(?:\*\*|__)?\s*\d{1,3}\s*(?:\*\*|__)?(?:[.)])?\s*(?=${COMPLETION_BLANK_PATTERN_SOURCE})`,
  'gi',
);

const LINE_START_QUESTION_MARKER_BEFORE_BLANK_PATTERN = new RegExp(
  String.raw`(^|[\r\n])(${QUESTION_LINE_DECORATION_SOURCE})\d{1,3}(?:[.)])?\s*(?=${COMPLETION_BLANK_PATTERN_SOURCE})`,
  'gi',
);

export const countReadingV2AutoCompletionBlanks = (value: string): number =>
  (value.match(READING_V2_AUTO_COMPLETION_BLANK_GLOBAL_PATTERN) ?? []).length;

export const replaceReadingV2AutoCompletionBlanks = (value: string, replacement: string): string =>
  value.replace(READING_V2_AUTO_COMPLETION_BLANK_GLOBAL_PATTERN, replacement);

export const readingV2AutoLineMatchesQuestionNumber = (
  lineText: string,
  questionNumber: number,
): boolean => {
  const text = compactText(lineText);
  return questionLinePrefixPatternFor(questionNumber).test(text)
    || (
      embeddedQuestionBlankPatternFor(questionNumber).test(text)
      && READING_V2_AUTO_COMPLETION_BLANK_PATTERN.test(text)
    );
};

export const normalizeReadingV2AutoSourceProofText = (value: string): string =>
  replaceReadingV2AutoCompletionBlanks(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(LINE_START_QUESTION_MARKER_BEFORE_BLANK_PATTERN, '$1$2')
      .replace(QUESTION_MARKER_BEFORE_BLANK_PATTERN, ''),
    ' blank ',
  )
    .replace(/[`*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!:,;]+$/g, '')
    .toLowerCase();
