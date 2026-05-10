import type {
  QuestionType,
  ReadingLabeledOption,
  ReadingOptionLabelFormat,
  ReadingSectionReference,
} from '../types/document.types';

export interface ReadingQuestionLike {
  number?: number;
  questionNumber?: number;
  type?: string;
  question?: string;
  questionText?: string;
  options?: Array<string | ReadingLabeledOption> | null;
  labeledOptions?: ReadingLabeledOption[] | null;
  optionLabelFormat?: ReadingOptionLabelFormat | null;
  sectionReferences?: ReadingSectionReference[] | null;
  sectionInstructionId?: string | null;
  groupId?: string | null;
  blankId?: string | null;
  anchorId?: string | null;
  groupTaskType?: 'table-completion' | null;
  tableGroupSchemaVersion?: number | null;
}

export interface ReadingQuestionIssue {
  code:
    | 'missing-section-references'
    | 'mixed-option-labels'
    | 'duplicate-option-label'
    | 'empty-option-text'
    | 'empty-option-label'
    | 'inconsistent-option-label-format'
    | 'conflicting-option-label-text'
    | 'canonical-table-question-missing-linkage'
    | 'unsupported-table-completion-schema';
  message: string;
}

export interface CanonicalReadingQuestionResult {
  questionText: string;
  question: string;
  options?: string[];
  labeledOptions?: ReadingLabeledOption[];
  optionLabelFormat?: ReadingOptionLabelFormat;
  sectionReferences?: ReadingSectionReference[];
  issues: ReadingQuestionIssue[];
}

const READING_TEXT_OPTION_TYPES = new Set<QuestionType>([
  'matching-headings',
  'matching-features',
  'matching-sentence-endings',
  'summary-completion-list',
  'multiple-choice',
  'multiple-select',
]);

const READING_LABEL_CONTRACT_TYPES = new Set<QuestionType>([
  ...READING_TEXT_OPTION_TYPES,
  'matching-information',
]);

const DEFAULT_LABEL_FORMAT_BY_TYPE: Partial<Record<QuestionType, ReadingOptionLabelFormat>> = {
  'matching-headings': 'roman',
  'matching-information': 'letter',
  'matching-features': 'letter',
  'matching-sentence-endings': 'letter',
  'summary-completion-list': 'letter',
  'multiple-choice': 'letter',
  'multiple-select': 'letter',
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
const EXPLICIT_STRUCTURED_LABEL_PATTERN =
  /^\s*(?:\*\*|__)?\s*\(?\s*([A-Za-z]|\d+|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s*\)?\s*(?:\*\*|__)?\s*[\.\):\-]\s*(.+)\s*$/i;
const EMPHASIZED_STRUCTURED_LABEL_PATTERN =
  /^\s*(?:\*\*|__)\s*([A-Za-z]|\d+|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s*(?:\*\*|__)\s+(.+)\s*$/i;
const PARENTHESIZED_STRUCTURED_LABEL_PATTERN =
  /^\s*\(\s*([A-Za-z]|\d+|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s*\)\s+(.+)\s*$/i;

interface ParsedLeadingLabel {
  label: string;
  text: string;
  format?: ReadingOptionLabelFormat;
}

interface NormalizedOption {
  label: string;
  text: string;
  format?: ReadingOptionLabelFormat;
  conflictingEmbeddedLabel?: string;
}

interface NormalizedSectionReference {
  label: string;
  title?: string;
  paragraph?: string;
  format?: ReadingOptionLabelFormat;
  conflictingEmbeddedLabel?: string;
}

const normalizeLabelToken = (value: string): string => value.replace(/[()]/g, '').trim();

const classifyOptionLabel = (label: string): ReadingOptionLabelFormat | undefined => {
  if (/^\d+$/.test(label)) return 'number';
  if (/^[A-Z]$/.test(label)) return 'letter';
  if (/^(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)$/i.test(label)) return 'roman';
  if (/^[A-Z]$/i.test(label)) return 'letter';
  return undefined;
};

const buildGeneratedLabel = (index: number, format: ReadingOptionLabelFormat): string => {
  if (format === 'number') return String(index + 1);
  if (format === 'roman') return ROMAN_SEQUENCE[index] || String(index + 1);
  return String.fromCharCode(LETTER_A_CODE + index);
};

const defaultLabelFormatForType = (type?: string): ReadingOptionLabelFormat => {
  if (!type) return 'letter';
  return DEFAULT_LABEL_FORMAT_BY_TYPE[type as QuestionType] || 'letter';
};

const extractLeadingLabel = (value: string): ParsedLeadingLabel | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(LEADING_LABEL_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const label = normalizeLabelToken(match[1]);
  if (!label) {
    return null;
  }

  const text = (match[2] ?? match[3] ?? '').trim();
  return {
    label,
    text,
    format: classifyOptionLabel(label),
  };
};

const extractStructuredLeadingLabel = (value: string): ParsedLeadingLabel | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match =
    trimmed.match(EXPLICIT_STRUCTURED_LABEL_PATTERN) ||
    trimmed.match(EMPHASIZED_STRUCTURED_LABEL_PATTERN) ||
    trimmed.match(PARENTHESIZED_STRUCTURED_LABEL_PATTERN);

  if (!match?.[1]) {
    return null;
  }

  const label = normalizeLabelToken(match[1]);
  const text = (match[2] || '').trim();

  if (!label) {
    return null;
  }

  return {
    label,
    text,
    format: classifyOptionLabel(label),
  };
};

const normalizeStructuredOption = (option: ReadingLabeledOption): NormalizedOption => {
  const label = normalizeLabelToken(option.label || '');
  const text = (option.text || '').trim();
  const embedded = text ? extractStructuredLeadingLabel(text) : null;

  if (!label) {
    return embedded
      ? { label: embedded.label, text: embedded.text, format: embedded.format }
      : { label: '', text };
  }

  if (!embedded) {
    return {
      label,
      text,
      format: classifyOptionLabel(label),
    };
  }

  if (embedded.label.toLowerCase() === label.toLowerCase()) {
    return {
      label,
      text: embedded.text,
      format: classifyOptionLabel(label),
    };
  }

  return {
    label,
    text,
    format: classifyOptionLabel(label),
    conflictingEmbeddedLabel: embedded.label,
  };
};

const toNormalizedOption = (option: string | ReadingLabeledOption): NormalizedOption => {
  if (typeof option !== 'string') {
    return normalizeStructuredOption(option);
  }

  const trimmed = option.trim();
  const parsed = extractLeadingLabel(trimmed);
  if (!parsed) {
    return { label: '', text: trimmed };
  }

  return {
    label: parsed.label,
    text: parsed.text,
    format: parsed.format,
  };
};

const toNormalizedSectionReference = (
  section: ReadingSectionReference | ReadingLabeledOption | string,
): NormalizedSectionReference => {
  if (typeof section === 'string') {
    const normalized = toNormalizedOption(section);
    return {
      label: normalized.label,
      title: normalized.text || undefined,
      format: normalized.format,
      conflictingEmbeddedLabel: normalized.conflictingEmbeddedLabel,
    };
  }

  if ('title' in section || 'paragraph' in section) {
    const label = normalizeLabelToken(section.label || '');
    const title = (section.title || '').trim();
    const paragraph = section.paragraph?.trim();
    const embedded = title ? extractStructuredLeadingLabel(title) : null;

    if (!label && embedded) {
      return {
        label: embedded.label,
        title: embedded.text || undefined,
        paragraph,
        format: embedded.format,
      };
    }

    if (label && embedded && embedded.label.toLowerCase() !== label.toLowerCase()) {
      return {
        label,
        title,
        paragraph,
        format: classifyOptionLabel(label),
        conflictingEmbeddedLabel: embedded.label,
      };
    }

    return {
      label,
      title: embedded && label ? embedded.text || undefined : title || undefined,
      paragraph,
      format: label ? classifyOptionLabel(label) : embedded?.format,
    };
  }

  const normalized = normalizeStructuredOption(section as ReadingLabeledOption);
  return {
    label: normalized.label,
    title: normalized.text || undefined,
    format: normalized.format,
    conflictingEmbeddedLabel: normalized.conflictingEmbeddedLabel,
  };
};

const collectLabelIssues = (
  questionNumber: number | undefined,
  normalizedEntries: Array<{
    label: string;
    format?: ReadingOptionLabelFormat;
    conflictingEmbeddedLabel?: string;
  }>,
  issues: ReadingQuestionIssue[],
): {
  hasLabels: boolean;
  optionLabelFormat: ReadingOptionLabelFormat;
} => {
  const labeledCount = normalizedEntries.filter((entry) => entry.label).length;
  const hasLabels = labeledCount > 0;
  const allHaveLabels = labeledCount === normalizedEntries.length;

  const inferredFormats = Array.from(
    new Set(
      normalizedEntries
        .map((entry) => entry.format)
        .filter((format): format is ReadingOptionLabelFormat => Boolean(format)),
    ),
  );

  if (hasLabels && !allHaveLabels) {
    issues.push({
      code: 'mixed-option-labels',
      message: `Question ${questionNumber || '?'} mixes labeled and unlabeled options.`,
    });
  }

  if (inferredFormats.length > 1) {
    issues.push({
      code: 'inconsistent-option-label-format',
      message: `Question ${questionNumber || '?'} mixes multiple option label formats.`,
    });
  }

  normalizedEntries.forEach((entry) => {
    if (!entry.conflictingEmbeddedLabel) return;
    issues.push({
      code: 'conflicting-option-label-text',
      message:
        `Question ${questionNumber || '?'} has label "${entry.label}" but text starts with ` +
        `"${entry.conflictingEmbeddedLabel}".`,
    });
  });

  return {
    hasLabels,
    optionLabelFormat: inferredFormats[0] || 'letter',
  };
};

export const isCanonicalReadingOptionType = (type?: string): boolean =>
  Boolean(type && READING_TEXT_OPTION_TYPES.has(type as QuestionType));

export const isCanonicalReadingContractType = (type?: string): boolean =>
  Boolean(type && READING_LABEL_CONTRACT_TYPES.has(type as QuestionType));

export const isMatchingInformationType = (type?: string): boolean => type === 'matching-information';

export const sanitizeReadingQuestionText = (text: string, questionNumber?: number): string => {
  const normalized = (text || '').trim();
  if (!questionNumber) return normalized;

  const pattern = new RegExp(
    `^\\s*(?:\\*\\*|__)?\\s*\\(?\\s*${questionNumber}\\s*\\)?\\s*(?:\\*\\*|__)?(?:\\s*[\\.\\):\\-]\\s*|\\s+)`,
    'i',
  );

  return normalized.replace(pattern, '').trim();
};

export const createDefaultReadingOptions = (
  count = 4,
  format: ReadingOptionLabelFormat = 'letter',
): ReadingLabeledOption[] =>
  Array.from({ length: count }, (_, index) => ({
    label: buildGeneratedLabel(index, format),
    text: '',
  }));

export const createDefaultReadingSectionReferences = (
  count = 6,
  format: ReadingOptionLabelFormat = 'letter',
): ReadingSectionReference[] =>
  Array.from({ length: count }, (_, index) => ({
    label: buildGeneratedLabel(index, format),
  }));

export const canonicalizeReadingQuestion = (
  question: ReadingQuestionLike,
): CanonicalReadingQuestionResult => {
  const questionNumber = question.questionNumber || question.number;
  const rawQuestionText = question.questionText ?? question.question ?? '';
  const questionText = sanitizeReadingQuestionText(rawQuestionText, questionNumber);
  const issues: ReadingQuestionIssue[] = [];

  if (question.groupTaskType === 'table-completion') {
    if (question.tableGroupSchemaVersion !== 1) {
      issues.push({
        code: 'unsupported-table-completion-schema',
        message:
          `Question ${questionNumber || '?'} belongs to unsupported table-completion ` +
          `schemaVersion ${question.tableGroupSchemaVersion ?? 'unknown'}.`,
      });
    }

    if (!question.groupId || !question.blankId || !question.anchorId || !question.sectionInstructionId) {
      issues.push({
        code: 'canonical-table-question-missing-linkage',
        message:
          `Question ${questionNumber || '?'} is missing canonical table linkage fields.`,
      });
    }

    return {
      questionText,
      question: questionText,
      options: Array.isArray(question.options)
        ? question.options.map((option) =>
            typeof option === 'string' ? option.trim() : (option.text || '').trim(),
          )
        : undefined,
      labeledOptions: Array.isArray(question.labeledOptions) ? question.labeledOptions : undefined,
      optionLabelFormat: question.optionLabelFormat || undefined,
      sectionReferences: Array.isArray(question.sectionReferences) ? question.sectionReferences : undefined,
      issues,
    };
  }

  if (isMatchingInformationType(question.type)) {
    const sourceSections =
      (Array.isArray(question.sectionReferences) && question.sectionReferences.length > 0
        ? question.sectionReferences
        : Array.isArray(question.labeledOptions) && question.labeledOptions.length > 0
          ? question.labeledOptions
          : Array.isArray(question.options)
            ? question.options
            : []) || [];

    if (!sourceSections.length) {
      issues.push({
        code: 'missing-section-references',
        message: `Question ${questionNumber || '?'} requires section references.`,
      });

      return {
        questionText,
        question: questionText,
        options: [],
        optionLabelFormat: question.optionLabelFormat || defaultLabelFormatForType(question.type),
        sectionReferences: [],
        issues,
      };
    }

    const normalizedSections = sourceSections.map(toNormalizedSectionReference);
    const { hasLabels, optionLabelFormat: inferredFormat } = collectLabelIssues(
      questionNumber,
      normalizedSections,
      issues,
    );

    const optionLabelFormat =
      question.optionLabelFormat ||
      inferredFormat ||
      defaultLabelFormatForType(question.type);

    const canonicalSections = normalizedSections.map((section, index) => {
      const label = section.label || (!hasLabels ? buildGeneratedLabel(index, optionLabelFormat) : '');
      const title = section.title?.trim();
      const paragraph = section.paragraph?.trim();

      return {
        label,
        ...(title ? { title } : {}),
        ...(paragraph ? { paragraph } : {}),
      };
    });

    const duplicateLabels = new Set<string>();
    const seenLabels = new Set<string>();
    canonicalSections.forEach((section) => {
      const normalizedLabel = section.label.trim().toLowerCase();
      if (!normalizedLabel) return;
      if (seenLabels.has(normalizedLabel)) duplicateLabels.add(section.label);
      seenLabels.add(normalizedLabel);
    });

    duplicateLabels.forEach((label) => {
      issues.push({
        code: 'duplicate-option-label',
        message: `Question ${questionNumber || '?'} repeats option label "${label}".`,
      });
    });

    canonicalSections.forEach((section, index) => {
      if (!section.label.trim()) {
        issues.push({
          code: 'empty-option-label',
          message: `Question ${questionNumber || '?'} section ${index + 1} is missing a label.`,
        });
      }
    });

    return {
      questionText,
      question: questionText,
      options: canonicalSections.map((section) => section.label),
      optionLabelFormat,
      sectionReferences: canonicalSections,
      issues,
    };
  }

  if (!isCanonicalReadingOptionType(question.type)) {
    return {
      questionText,
      question: questionText,
      options: Array.isArray(question.options)
        ? question.options.map((option) =>
            typeof option === 'string' ? option.trim() : (option.text || '').trim(),
          )
        : undefined,
      labeledOptions: Array.isArray(question.labeledOptions) ? question.labeledOptions : undefined,
      optionLabelFormat: question.optionLabelFormat || undefined,
      sectionReferences: Array.isArray(question.sectionReferences) ? question.sectionReferences : undefined,
      issues,
    };
  }

  const sourceOptions =
    (Array.isArray(question.labeledOptions) && question.labeledOptions.length > 0
      ? question.labeledOptions
      : Array.isArray(question.options)
        ? question.options
        : []) || [];

  if (!sourceOptions.length) {
    return {
      questionText,
      question: questionText,
      optionLabelFormat: question.optionLabelFormat || defaultLabelFormatForType(question.type),
      issues,
    };
  }

  const normalizedOptions = sourceOptions.map(toNormalizedOption);
  const { hasLabels, optionLabelFormat: inferredFormat } = collectLabelIssues(
    questionNumber,
    normalizedOptions,
    issues,
  );

  const optionLabelFormat =
    question.optionLabelFormat ||
    inferredFormat ||
    defaultLabelFormatForType(question.type);

  const generatedOptions = normalizedOptions.map((option, index) => ({
    label: option.label || (!hasLabels ? buildGeneratedLabel(index, optionLabelFormat) : ''),
    text: option.text,
  }));

  const duplicateLabels = new Set<string>();
  const seenLabels = new Set<string>();
  generatedOptions.forEach((option) => {
    const normalizedLabel = option.label.trim().toLowerCase();
    if (!normalizedLabel) return;
    if (seenLabels.has(normalizedLabel)) duplicateLabels.add(option.label);
    seenLabels.add(normalizedLabel);
  });

  duplicateLabels.forEach((label) => {
    issues.push({
      code: 'duplicate-option-label',
      message: `Question ${questionNumber || '?'} repeats option label "${label}".`,
    });
  });

  generatedOptions.forEach((option, index) => {
    if (!option.text.trim()) {
      issues.push({
        code: 'empty-option-text',
        message: `Question ${questionNumber || '?'} option ${index + 1} is missing text.`,
      });
    }

    if (!option.label.trim()) {
      issues.push({
        code: 'empty-option-label',
        message: `Question ${questionNumber || '?'} option ${index + 1} is missing a label.`,
      });
    }
  });

  return {
    questionText,
    question: questionText,
    options: generatedOptions.map((option) => option.text),
    labeledOptions: generatedOptions,
    optionLabelFormat,
    issues,
  };
};

export const validateCanonicalReadingQuestion = (
  question: ReadingQuestionLike,
): ReadingQuestionIssue[] => canonicalizeReadingQuestion(question).issues;

export const hasBlockingReadingIssues = (question: ReadingQuestionLike): boolean =>
  validateCanonicalReadingQuestion(question).length > 0;

export const formatReadingOption = (option: ReadingLabeledOption): string =>
  option.text ? `${option.label}. ${option.text}` : option.label;

export const formatReadingSectionReference = (section: ReadingSectionReference): string =>
  section.title ? `${section.label}. ${section.title}` : section.label;
