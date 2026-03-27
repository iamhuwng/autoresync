export type ReadingOptionDisplayFormat = 'letter' | 'roman' | 'number';

export type ReadingOptionDisplayValue =
  | string
  | {
      label?: string;
      text?: string;
      content?: string;
      value?: string;
      display?: string;
    };

const ROMAN_SEQUENCE = [
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
];

const LETTER_A_CODE = 'A'.charCodeAt(0);
const LEADING_LABEL_PATTERN =
  /^\s*(?:\*\*|__)?\s*\(?\s*([A-Za-z]|\d+|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s*\)?\s*(?:\*\*|__)?(?:\s*[\.\):\-]\s*(.*)|\s+(.+))?\s*$/i;

interface ParsedReadingLabel {
  label: string;
  text: string;
}

export interface SplitReadingOptionLabel {
  label?: string;
  text: string;
}

const normalizeLabelToken = (value: string): string => value.replace(/[()]/g, '').trim();

const extractLeadingLabel = (value: string): ParsedReadingLabel | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(LEADING_LABEL_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const label = normalizeLabelToken(match[1]);
  if (!label) {
    return null;
  }

  return {
    label,
    text: (match[2] ?? match[3] ?? '').trim(),
  };
};

export const buildFallbackReadingLabel = (
  index: number,
  format: ReadingOptionDisplayFormat = 'letter',
): string => {
  if (format === 'roman') {
    return ROMAN_SEQUENCE[index] || String(index + 1);
  }

  if (format === 'number') {
    return String(index + 1);
  }

  return String.fromCharCode(LETTER_A_CODE + index);
};

export const splitReadingOptionLabel = (
  option: ReadingOptionDisplayValue,
): SplitReadingOptionLabel => {
  if (typeof option !== 'string') {
    const label = normalizeLabelToken(option.label || '');
    const text = (option.text ?? option.content ?? option.display ?? option.value ?? '').trim();
    const embedded = text ? extractLeadingLabel(text) : null;

    if (!label) {
      return embedded ? { label: embedded.label, text: embedded.text } : { text };
    }

    if (embedded && embedded.label.toLowerCase() === label.toLowerCase()) {
      return { label, text: embedded.text };
    }

    return { label, text };
  }

  const trimmed = option.trim();
  const parsed = extractLeadingLabel(trimmed);
  return parsed ? { label: parsed.label, text: parsed.text } : { text: trimmed };
};

export const getReadingOptionLabel = (
  option: ReadingOptionDisplayValue,
  index: number,
  format: ReadingOptionDisplayFormat = 'letter',
): string => splitReadingOptionLabel(option).label || buildFallbackReadingLabel(index, format);

export const getReadingOptionText = (option: ReadingOptionDisplayValue): string =>
  splitReadingOptionLabel(option).text;

export const getReadingOptionDisplayText = (
  option: ReadingOptionDisplayValue,
  index: number,
  format: ReadingOptionDisplayFormat = 'letter',
  includeFallbackLabel = true,
): string => {
  const split = splitReadingOptionLabel(option);
  if (split.label) {
    return split.text ? `${split.label}. ${split.text}` : split.label;
  }

  if (!includeFallbackLabel) {
    return split.text;
  }

  const fallbackLabel = buildFallbackReadingLabel(index, format);
  return split.text ? `${fallbackLabel}. ${split.text}` : fallbackLabel;
};

export const getReadingOptionSelectionValue = (
  option: ReadingOptionDisplayValue,
  index: number,
  format: ReadingOptionDisplayFormat = 'letter',
  preferLabelValue = false,
): string => {
  const split = splitReadingOptionLabel(option);
  if (preferLabelValue) {
    return split.label || buildFallbackReadingLabel(index, format);
  }

  return split.text || split.label || buildFallbackReadingLabel(index, format);
};

export const getReadingQuestionOptions = <
  TQuestion extends {
    options?: ReadingOptionDisplayValue[] | null;
    labeledOptions?: ReadingOptionDisplayValue[] | null;
  },
>(
  question?: TQuestion | null,
): ReadingOptionDisplayValue[] =>
  (question?.labeledOptions && question.labeledOptions.length > 0
    ? question.labeledOptions
    : question?.options) || [];
