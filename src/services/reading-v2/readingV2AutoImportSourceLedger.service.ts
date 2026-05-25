import { parseReadingV2TeacherAnswerKey } from './readingV2ImportNormalization.service';

export type ReadingV2AutoSourceCategory =
  | 'full-test-with-answer-key'
  | 'full-test-missing-answer-key'
  | 'single-passage-or-partial-extract'
  | 'polluted-web-clip'
  | 'unsupported-or-ambiguous-source';

export type ReadingV2AutoSourceLedgerIssueCode =
  | 'source-empty'
  | 'source-passage-boundary-missing'
  | 'source-question-range-missing'
  | 'source-question-coverage-gap'
  | 'source-answer-key-missing'
  | 'source-pollution-detected'
  | 'source-full-test-incomplete'
  | 'source-ambiguous-topology';

export type ReadingV2AutoSourceVerifierCode =
  | 'source-passage-missing'
  | 'source-passage-extra'
  | 'source-question-missing'
  | 'source-question-extra'
  | 'source-answer-row-unbound'
  | 'source-question-range-missing'
  | 'source-reference-bank-missing'
  | 'source-reference-bank-mismatch'
  | 'source-instruction-task-type-mismatch'
  | 'source-instruction-word-limit-mismatch'
  | 'source-instruction-vocabulary-mismatch'
  | 'source-instruction-reuse-mismatch'
  | 'source-passage-trim-risk';

export interface ReadingV2AutoSourceLine {
  readonly lineId: string;
  readonly lineNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly text: string;
}

export interface ReadingV2AutoSourceLineIndexEntry {
  readonly lineId: string;
  readonly lineNumber: number;
  readonly rawText: string;
  readonly normalizedText: string;
}

export interface ReadingV2ImportSourceArtifact {
  readonly artifactId: string;
  readonly createdAt: string;
  readonly sourceKind: 'teacher-paste';
  readonly rawTextOriginal: string;
  readonly rawTextSha256: string;
  readonly normalizedTextSha256: string;
  readonly lineIndex: readonly ReadingV2AutoSourceLineIndexEntry[];
  readonly retention: {
    readonly scope: 'draft-author-only';
    readonly includeInStudentProjection: false;
    readonly includeInSessionProjection: false;
    readonly includeInPublicPayload: false;
  };
}

export interface ReadingV2AutoSourcePassageBoundary {
  readonly passageNumber: number;
  readonly lineNumber: number;
  readonly charStart: number;
  readonly title?: string;
}

export interface ReadingV2AutoSourceQuestionRange {
  readonly start: number;
  readonly end: number;
  readonly lineNumber: number;
  readonly passageNumber?: number;
  readonly instructionPreview?: string;
}

export interface ReadingV2AutoSourceAnswerKeyRow {
  readonly questionNumber: number;
  readonly sourceLine: number;
  readonly answerHash: string;
  readonly normalizedAnswerHash: string;
}

export type ReadingV2AutoSourceReferenceBankKind =
  | 'paragraph-labels'
  | 'people-list'
  | 'headings-list'
  | 'option-set'
  | 'matching-endings';

export interface ReadingV2AutoSourceReferenceBank {
  readonly kind: ReadingV2AutoSourceReferenceBankKind;
  readonly lineNumber: number;
  readonly passageNumber?: number;
  readonly questionRange?: {
    readonly start: number;
    readonly end: number;
  };
  readonly itemCount: number;
  readonly labels: readonly string[];
  readonly labelSummary: string;
}

export interface ReadingV2AutoSourcePollutionMarker {
  readonly code: 'advertisement' | 'navigation' | 'share-footer' | 'related-link' | 'repeated-title';
  readonly lineNumber: number;
}

export interface ReadingV2AutoSourceLedgerIssue {
  readonly code: ReadingV2AutoSourceLedgerIssueCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface ReadingV2AutoSourceLedger {
  readonly sourceName?: string;
  readonly title?: string;
  readonly sourceHash: string;
  readonly normalizedText: string;
  readonly lineCount: number;
  readonly lineIndex: readonly ReadingV2AutoSourceLineIndexEntry[];
  readonly category: ReadingV2AutoSourceCategory;
  readonly passages: readonly ReadingV2AutoSourcePassageBoundary[];
  readonly questionRanges: readonly ReadingV2AutoSourceQuestionRange[];
  readonly questionNumbers: readonly number[];
  readonly answerKeyRows: readonly ReadingV2AutoSourceAnswerKeyRow[];
  readonly referenceBanks: readonly ReadingV2AutoSourceReferenceBank[];
  readonly pollutionMarkers: readonly ReadingV2AutoSourcePollutionMarker[];
  readonly issues: readonly ReadingV2AutoSourceLedgerIssue[];
  readonly expectedFullTest: boolean;
}

export interface ReadingV2AutoLedgerPayloadQuestion {
  readonly number?: number;
  readonly questionNumber?: number;
}

export interface ReadingV2AutoLedgerPayloadMaterial {
  readonly passageNumber?: number;
  readonly passages?: readonly { readonly content?: string }[];
  readonly sectionInstructions?: readonly {
    readonly questionRange?: {
      readonly start?: number;
      readonly end?: number;
    };
    readonly sourceInstructionEvidence?: string;
    readonly taskType?: string;
    readonly wordLimit?: number;
    readonly wordLimitText?: string;
    readonly vocabulary?: string;
    readonly optionReuse?: string;
    readonly optionLabelRange?: string;
    readonly referenceLabelRange?: string;
    readonly sectionReferences?: readonly {
      readonly label?: string;
    }[];
    readonly labeledOptions?: readonly {
      readonly label?: string;
    }[];
  }[];
  readonly questions?: readonly ReadingV2AutoLedgerPayloadQuestion[];
}

export interface ReadingV2AutoLedgerPayload {
  readonly answerKeyText?: string;
  readonly materials?: readonly ReadingV2AutoLedgerPayloadMaterial[];
}

export interface ReadingV2AutoSourceVerifierIssue {
  readonly code: ReadingV2AutoSourceVerifierCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
}

const PASSAGE_HEADING_PATTERN = /^\s*(?:#{1,6}\s*)?READING\s+PASSAGE\s+(\d+)\s*(?::\s*(.+?)\s*)?$/i;
const QUESTION_RANGE_PATTERN = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Questions?\s+(\d+)\s*(?:-|\u2013|\u2014|\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|to|and)\s*(\d+)\b/i;
const QUESTION_SINGLE_PATTERN = /^\s*(?:#{1,6}\s*)?Question\s+(\d+)\b/i;
const NUMBERED_LINE_PATTERN = /^\s*(?:[-*]\s*)?(?:\*\*)?(\d{1,3})(?:\*\*)?(?:\\?[\).])?(?:\*\*)?\s+(.+)$/;
const ALPHA_REFERENCE_ROW_PATTERN = /^\s*(?:[-*]\s*)?([A-Z])(?:[\).:]|\s+[-\u2013\u2014])?\s+\S+/;
const ROMAN_REFERENCE_ROW_PATTERN = /^\s*(?:[-*]\s*)?([ivxlcdm]{1,8})(?:[\).:]|\s+[-\u2013\u2014])?\s+\S+/i;
const PARAGRAPH_LABEL_RANGE_PATTERN =
  /\b(?:paragraphs?|sections?)\s+([A-Z])\s*(?:-|\u2013|\u2014|to)\s*([A-Z])\b/i;
const PARAGRAPH_LETTER_RANGE_PATTERN =
  /\bparagraph\b.*\bletter,?\s+([A-Z])\s*(?:-|\u2013|\u2014|to)\s*([A-Z])\b/i;
const HEADINGS_BANK_CUE_PATTERN = /\blist\s+of\s+headings\b/i;
const PEOPLE_BANK_CUE_PATTERN = /\b(?:list\s+of\s+people|people\s+below|researchers\s+below|scientists\s+below|experts\s+below|writers\s+below)\b/i;
const MATCHING_ENDINGS_CUE_PATTERN = /\b(?:list\s+of\s+endings|correct\s+ending|sentence\s+endings?)\b/i;
const OPTION_BANK_CUE_PATTERN = /\b(?:choose\s+the\s+correct\s+(?:letter|answer)|correct\s+letter,?\s+[A-Z])\b/i;
const ANSWER_KEY_HEADING_PATTERN =
  /^\s*(?:#{1,6}\s*)?(?:answers?|answer\s+key|key|solutions?|answer(?:s|\s+key)?\s+reading\s+test\s+\d+)(?:\s+(?:reading\s+)?test\s+\d+)?\s*:?\s*$/i;
const ANSWER_KEY_SECTION_MARKER_PATTERN = /^\s*(?:#{1,6}\s*)?(?:(?:reading\s+)?passage|section|reading\s+test)\s+\d+\s*:?\s*$/i;
const ANSWER_KEY_ROW_PATTERN = /^\s*(?:Q(?:uestion)?\s*)?\d{1,3}(?:\\?[\).:\-=])?\s+.+$/i;
const SHORT_ANSWER_VALUE_PATTERN =
  /^(?:true|false|yes|no|not\s+given|[A-Z](?:\s*(?:[|,;/]|or)\s*[A-Z])*|[ivxlcdm]+(?:\s*(?:[|,;/]|or)\s*[ivxlcdm]+)*|\d{3,4}|[\d.,%/-]+|[\w'()-]+(?:\s+[\w'()-]+){0,4})$/i;
const BLANK_MARKER_PATTERN = /(?:_{3,}|\u2026{1,}|\.{3,}|\[\s*(?:blank|\d+)\s*\])/i;

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const sha256Hex = async (value: string): Promise<string> => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    return hashString(value);
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await cryptoApi.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const canonicalAnswerText = (value: string): string =>
  compact(value)
    .replace(/\\([()./|:-])/g, '$1')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\|\s*/g, '|')
    .toLowerCase();

const answerHashFor = (questionNumber: number, answerText: string): string =>
  hashString(`${questionNumber}:${canonicalAnswerText(answerText)}`);

const normalizeSourceText = (rawText: string): string =>
  rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();

const sourceLinesFor = (normalizedText: string): readonly ReadingV2AutoSourceLine[] => {
  const rawLines = normalizedText ? normalizedText.split('\n') : [];
  let charStart = 0;

  return rawLines.map((text, index) => {
    const lineNumber = index + 1;
    const line: ReadingV2AutoSourceLine = {
      lineId: `line-${String(lineNumber).padStart(4, '0')}`,
      lineNumber,
      charStart,
      charEnd: charStart + text.length,
      text,
    };
    charStart += text.length + 1;
    return line;
  });
};

const lineIndexFromSourceLines = (
  lines: readonly ReadingV2AutoSourceLine[],
): readonly ReadingV2AutoSourceLineIndexEntry[] =>
  lines.map((line) => ({
    lineId: line.lineId,
    lineNumber: line.lineNumber,
    rawText: line.text,
    normalizedText: compact(line.text),
  }));

const compact = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const stripMarkdownInline = (value: string): string =>
  compact(value
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1'));

const isInstructionLikeTitle = (value: string): boolean => {
  const normalized = stripMarkdownInline(value).toLowerCase();
  return !normalized
    || /^reading passage\s+\d+\b/.test(normalized)
    || /^questions?\s+\d+\b/.test(normalized)
    || /^answers?\b/.test(normalized)
    || /\byou should spend about\b/.test(normalized)
    || /\bbased on reading passage\b/.test(normalized)
    || /\bwrite your answers? in boxes?\b/.test(normalized)
    || /\bchoose\b.*\bfrom the passage\b/.test(normalized)
    || /\bcomplete the\b/.test(normalized);
};

const frontmatterPassageTitle = (
  lines: readonly ReadingV2AutoSourceLine[],
  passageNumber: number,
): string | undefined =>
  lines
    .slice(0, 40)
    .map((line) =>
      line.text.match(new RegExp(`^p${passageNumber}_title:\\s*"?([^"\\n]+)"?\\s*$`, 'i'))?.[1]?.trim(),
    )
    .map((value) => value ? stripMarkdownInline(value) : undefined)
    .find((value): value is string => Boolean(value && !isInstructionLikeTitle(value)));

const titleAfterPassageHeading = (
  lines: readonly ReadingV2AutoSourceLine[],
  passageLineNumber: number,
): string | undefined => {
  for (const line of lines.filter((candidate) =>
    candidate.lineNumber > passageLineNumber && candidate.lineNumber <= passageLineNumber + 8,
  )) {
    const trimmed = line.text.trim();
    if (!trimmed) {
      continue;
    }
    if (PASSAGE_HEADING_PATTERN.test(trimmed) || QUESTION_RANGE_PATTERN.test(trimmed)) {
      return undefined;
    }
    if (isInstructionLikeTitle(trimmed)) {
      continue;
    }

    return stripMarkdownInline(trimmed);
  }

  return undefined;
};

const titleFrom = (
  lines: readonly ReadingV2AutoSourceLine[],
  sourceName?: string,
): string | undefined => {
  const frontmatterTitle = lines
    .slice(0, 20)
    .map((line) => line.text.match(/^title:\s*"?([^"\n]+)"?\s*$/i)?.[1]?.trim())
    .find((value): value is string => Boolean(value));

  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  const heading = lines
    .map((line) => line.text.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim())
    .find((value): value is string => {
      if (!value) {
        return false;
      }

      return !/^READING PASSAGE\s+\d+/i.test(value)
        && !/^Questions?\s+\d+/i.test(value)
        && !/^Answers?/i.test(value);
    });

  return heading ?? sourceName;
};

const passageNumberForLine = (
  passages: readonly ReadingV2AutoSourcePassageBoundary[],
  lineNumber: number,
): number | undefined =>
  [...passages]
    .reverse()
    .find((passage) => passage.lineNumber <= lineNumber)
    ?.passageNumber;

const pollutionMarkerForLine = (
  line: ReadingV2AutoSourceLine,
): ReadingV2AutoSourcePollutionMarker | null => {
  const value = compact(line.text).toLowerCase();

  if (!value) {
    return null;
  }

  if (/^advertisements?$/.test(value) || value.includes('advertisement')) {
    return { code: 'advertisement', lineNumber: line.lineNumber };
  }

  if (/\b(?:previous|next)\s+(?:post|article|test)\b/.test(value)) {
    return { code: 'navigation', lineNumber: line.lineNumber };
  }

  if (/\b(?:share this|follow us|comments?|leave a reply)\b/.test(value)) {
    return { code: 'share-footer', lineNumber: line.lineNumber };
  }

  if (/\b(?:related posts?|you may also like|more ielts reading|ielts reading practice test)\b/.test(value)) {
    return { code: 'related-link', lineNumber: line.lineNumber };
  }

  return null;
};

const answerTextFromPotentialRow = (line: string): string | undefined => {
  const match = line.trim().match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:\\?[\).:\-=])?\s+(.+)$/i);
  return match?.[2]?.trim();
};

const normalizedAnswerKeyRow = (line: string): string | undefined =>
  ANSWER_KEY_ROW_PATTERN.test(line)
    ? line.trim().replace(/^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:\\?[\).:\-=])?\s+/i, '$1 ')
    : undefined;

const isLikelyAnswerRow = (line: string): boolean => {
  if (!ANSWER_KEY_ROW_PATTERN.test(line)) {
    return false;
  }

  const answer = answerTextFromPotentialRow(line);
  if (!answer || answer.length > 90 || answer.endsWith('?') || BLANK_MARKER_PATTERN.test(answer)) {
    return false;
  }

  return SHORT_ANSWER_VALUE_PATTERN.test(compact(answer.replace(/\([^)]*\bcapitals?\s+optional\b[^)]*\)/i, '')));
};

const firstAnswerHeadingLine = (lines: readonly ReadingV2AutoSourceLine[]): number | null =>
  lines.find((line) => ANSWER_KEY_HEADING_PATTERN.test(line.text.trim()))?.lineNumber ?? null;

const collectAnswerKeyRows = (
  lines: readonly ReadingV2AutoSourceLine[],
): readonly ReadingV2AutoSourceAnswerKeyRow[] => {
  const headingLine = firstAnswerHeadingLine(lines);
  const lateStartLine = Math.max(1, Math.floor(lines.length * 0.45));
  const rowLines: string[] = [];
  const sourceLines: number[] = [];
  let collecting = false;

  lines.forEach((line) => {
    const trimmed = line.text.trim();
    const afterHeading = headingLine !== null && line.lineNumber > headingLine;
    const canStartUnheaded = headingLine === null && line.lineNumber >= lateStartLine && isLikelyAnswerRow(trimmed);

    if (!afterHeading && !canStartUnheaded && !collecting) {
      return;
    }

    if (!trimmed || ANSWER_KEY_SECTION_MARKER_PATTERN.test(trimmed) || ANSWER_KEY_HEADING_PATTERN.test(trimmed)) {
      return;
    }

    const row = afterHeading ? normalizedAnswerKeyRow(trimmed) : undefined;
    if (row || isLikelyAnswerRow(trimmed)) {
      collecting = true;
      rowLines.push(row ?? normalizedAnswerKeyRow(trimmed)!);
      sourceLines.push(line.lineNumber);
      return;
    }

    if (collecting) {
      collecting = false;
    }
  });

  const parsed = parseReadingV2TeacherAnswerKey(rowLines.join('\n'));
  return parsed.rows
    .filter((row) =>
      row.parsedAnswerValues.length > 0
      && !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    )
    .map((row) => ({
      questionNumber: row.questionNumber,
      sourceLine: sourceLines[row.sourceLine - 1] ?? row.sourceLine,
      answerHash: hashString(`${row.questionNumber}:${row.rawAnswerText.toLowerCase()}`),
      normalizedAnswerHash: answerHashFor(row.questionNumber, row.rawAnswerText),
    }));
};

const detectPassages = (
  lines: readonly ReadingV2AutoSourceLine[],
): readonly ReadingV2AutoSourcePassageBoundary[] =>
  lines.flatMap((line) => {
    const match = line.text.match(PASSAGE_HEADING_PATTERN);

    if (!match?.[1]) {
      return [];
    }

    return [{
      passageNumber: Number(match[1]),
      lineNumber: line.lineNumber,
      charStart: line.charStart,
      title: frontmatterPassageTitle(lines, Number(match[1]))
        ?? (match[2] && !isInstructionLikeTitle(match[2]) ? stripMarkdownInline(match[2]) : undefined)
        ?? titleAfterPassageHeading(lines, line.lineNumber),
    }];
  });

const instructionPreviewFrom = (
  lines: readonly ReadingV2AutoSourceLine[],
  rangeLineNumber: number,
): string | undefined => {
  const preview = lines
    .filter((line) => line.lineNumber > rangeLineNumber && line.lineNumber <= rangeLineNumber + 4)
    .map((line) => compact(line.text))
    .filter((text) => text && !NUMBERED_LINE_PATTERN.test(text))
    .join(' ');

  return preview ? preview.slice(0, 180) : undefined;
};

const detectQuestionRanges = (
  lines: readonly ReadingV2AutoSourceLine[],
  passages: readonly ReadingV2AutoSourcePassageBoundary[],
  answerHeadingLine: number | null,
): readonly ReadingV2AutoSourceQuestionRange[] =>
  lines.flatMap((line) => {
    if (answerHeadingLine !== null && line.lineNumber >= answerHeadingLine) {
      return [];
    }

    const rangeMatch = line.text.match(QUESTION_RANGE_PATTERN);
    if (rangeMatch?.[1] && rangeMatch[2]) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);

      return [{
        start: Math.min(start, end),
        end: Math.max(start, end),
        lineNumber: line.lineNumber,
        passageNumber: passageNumberForLine(passages, line.lineNumber),
        instructionPreview: instructionPreviewFrom(lines, line.lineNumber),
      }];
    }

    const singleMatch = line.text.match(QUESTION_SINGLE_PATTERN);
    if (singleMatch?.[1]) {
      const questionNumber = Number(singleMatch[1]);
      return [{
        start: questionNumber,
        end: questionNumber,
        lineNumber: line.lineNumber,
        passageNumber: passageNumberForLine(passages, line.lineNumber),
        instructionPreview: instructionPreviewFrom(lines, line.lineNumber),
      }];
    }

    return [];
  });

const detectVisibleQuestionNumbers = (
  lines: readonly ReadingV2AutoSourceLine[],
  answerHeadingLine: number | null,
): readonly number[] => {
  const numbers = new Set<number>();

  lines.forEach((line) => {
    if (answerHeadingLine !== null && line.lineNumber >= answerHeadingLine) {
      return;
    }

    const match = line.text.match(NUMBERED_LINE_PATTERN);
    const number = match?.[1] ? Number(match[1]) : NaN;
    const rest = match?.[2]?.trim() ?? '';

    if (!Number.isFinite(number) || number < 1 || number > 80 || !rest || isLikelyAnswerRow(line.text)) {
      return;
    }

    numbers.add(number);
  });

  return [...numbers].sort((left, right) => left - right);
};

const numbersFromRanges = (
  ranges: readonly ReadingV2AutoSourceQuestionRange[],
): readonly number[] => {
  const numbers = new Set<number>();

  ranges.forEach((range) => {
    for (let number = range.start; number <= range.end; number += 1) {
      numbers.add(number);
    }
  });

  return [...numbers].sort((left, right) => left - right);
};

const labelsFromAlphaRange = (start: string, end: string): readonly string[] => {
  const startCode = start.toUpperCase().charCodeAt(0);
  const endCode = end.toUpperCase().charCodeAt(0);
  const min = Math.min(startCode, endCode);
  const max = Math.max(startCode, endCode);

  if (min < 65 || max > 90 || max - min > 25) {
    return [];
  }

  return Array.from({ length: max - min + 1 }, (_, index) => String.fromCharCode(min + index));
};

const ROMAN_REFERENCE_LABELS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
];

const labelsFromRomanRange = (start: string, end: string): readonly string[] => {
  const startIndex = ROMAN_REFERENCE_LABELS.indexOf(start.toUpperCase());
  const endIndex = ROMAN_REFERENCE_LABELS.indexOf(end.toUpperCase());

  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const min = Math.min(startIndex, endIndex);
  const max = Math.max(startIndex, endIndex);
  return ROMAN_REFERENCE_LABELS.slice(min, max + 1);
};

const labelsFromReferenceRange = (range: string | undefined): readonly string[] => {
  const match = compact(range ?? '').match(/^([A-Z]|[IVXLCDM]+)\s*(?:-|\u2013|\u2014|to)\s*([A-Z]|[IVXLCDM]+)$/i);
  if (!match?.[1] || !match[2]) {
    return [];
  }

  if (/^[A-Z]$/i.test(match[1]) && /^[A-Z]$/i.test(match[2])) {
    return labelsFromAlphaRange(match[1], match[2]);
  }

  return labelsFromRomanRange(match[1], match[2]);
};

const summarizeReferenceLabels = (labels: readonly string[]): string => {
  const unique = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return 'unknown';
  }

  if (unique.length === 1) {
    return unique[0] ?? 'unknown';
  }

  return `${unique[0]}-${unique[unique.length - 1]}`;
};

const nearestQuestionRangeForLine = (
  ranges: readonly ReadingV2AutoSourceQuestionRange[],
  lineNumber: number,
): ReadingV2AutoSourceQuestionRange | undefined =>
  [...ranges]
    .reverse()
    .find((range) => range.lineNumber <= lineNumber);

const referenceQuestionRangeFor = (
  ranges: readonly ReadingV2AutoSourceQuestionRange[],
  lineNumber: number,
): ReadingV2AutoSourceReferenceBank['questionRange'] => {
  const range = nearestQuestionRangeForLine(ranges, lineNumber);
  return range ? { start: range.start, end: range.end } : undefined;
};

const collectReferenceRowsAfter = (
  lines: readonly ReadingV2AutoSourceLine[],
  lineNumber: number,
  answerHeadingLine: number | null,
  pattern: RegExp,
): readonly string[] => {
  const labels: string[] = [];
  let collecting = false;

  lines
    .filter((line) => line.lineNumber > lineNumber && line.lineNumber <= lineNumber + 18)
    .some((line) => {
      const trimmed = line.text.trim();

      if (answerHeadingLine !== null && line.lineNumber >= answerHeadingLine) {
        return true;
      }

      if (PASSAGE_HEADING_PATTERN.test(trimmed) || QUESTION_RANGE_PATTERN.test(trimmed)) {
        return true;
      }

      const match = trimmed.match(pattern);
      if (match?.[1]) {
        collecting = true;
        labels.push(match[1].toUpperCase());
        return false;
      }

      if (collecting && trimmed) {
        return true;
      }

      return false;
    });

  return labels.length >= 2 ? labels : [];
};

const referenceBankFromLabels = (input: {
  readonly kind: ReadingV2AutoSourceReferenceBankKind;
  readonly line: ReadingV2AutoSourceLine;
  readonly labels: readonly string[];
  readonly questionRanges: readonly ReadingV2AutoSourceQuestionRange[];
  readonly passages: readonly ReadingV2AutoSourcePassageBoundary[];
}): ReadingV2AutoSourceReferenceBank => {
  const passageNumber = passageNumberForLine(input.passages, input.line.lineNumber);
  const questionRange = referenceQuestionRangeFor(input.questionRanges, input.line.lineNumber);

  return {
    kind: input.kind,
    lineNumber: input.line.lineNumber,
    ...(passageNumber !== undefined ? { passageNumber } : {}),
    ...(questionRange ? { questionRange } : {}),
    itemCount: input.labels.length,
    labels: [...new Set(input.labels)],
    labelSummary: summarizeReferenceLabels(input.labels),
  };
};

const detectReferenceBanks = (
  lines: readonly ReadingV2AutoSourceLine[],
  passages: readonly ReadingV2AutoSourcePassageBoundary[],
  questionRanges: readonly ReadingV2AutoSourceQuestionRange[],
  answerHeadingLine: number | null,
): readonly ReadingV2AutoSourceReferenceBank[] => {
  const banks: ReadingV2AutoSourceReferenceBank[] = [];

  lines.forEach((line) => {
    const trimmed = line.text.trim();
    if (!trimmed || (answerHeadingLine !== null && line.lineNumber >= answerHeadingLine)) {
      return;
    }

    const paragraphMatch = trimmed.match(PARAGRAPH_LABEL_RANGE_PATTERN)
      ?? trimmed.match(PARAGRAPH_LETTER_RANGE_PATTERN);
    if (paragraphMatch?.[1] && paragraphMatch[2]) {
      const labels = labelsFromAlphaRange(paragraphMatch[1], paragraphMatch[2]);
      if (labels.length > 0) {
        banks.push(referenceBankFromLabels({
          kind: 'paragraph-labels',
          line,
          labels,
          questionRanges,
          passages,
        }));
      }
    }

    if (HEADINGS_BANK_CUE_PATTERN.test(trimmed)) {
      const labels = collectReferenceRowsAfter(lines, line.lineNumber, answerHeadingLine, ROMAN_REFERENCE_ROW_PATTERN);
      if (labels.length > 0) {
        banks.push(referenceBankFromLabels({
          kind: 'headings-list',
          line,
          labels,
          questionRanges,
          passages,
        }));
      }
    }

    if (PEOPLE_BANK_CUE_PATTERN.test(trimmed)) {
      const labels = collectReferenceRowsAfter(lines, line.lineNumber, answerHeadingLine, ALPHA_REFERENCE_ROW_PATTERN);
      if (labels.length > 0) {
        banks.push(referenceBankFromLabels({
          kind: 'people-list',
          line,
          labels,
          questionRanges,
          passages,
        }));
      }
    }

    if (MATCHING_ENDINGS_CUE_PATTERN.test(trimmed)) {
      const labels = collectReferenceRowsAfter(lines, line.lineNumber, answerHeadingLine, ALPHA_REFERENCE_ROW_PATTERN);
      if (labels.length > 0) {
        banks.push(referenceBankFromLabels({
          kind: 'matching-endings',
          line,
          labels,
          questionRanges,
          passages,
        }));
      }
    } else if (OPTION_BANK_CUE_PATTERN.test(trimmed)) {
      const labels = collectReferenceRowsAfter(lines, line.lineNumber, answerHeadingLine, ALPHA_REFERENCE_ROW_PATTERN);
      if (labels.length > 0) {
        banks.push(referenceBankFromLabels({
          kind: 'option-set',
          line,
          labels,
          questionRanges,
          passages,
        }));
      }
    }
  });

  const seen = new Set<string>();
  return banks.filter((bank) => {
    const key = [
      bank.kind,
      bank.lineNumber,
      bank.questionRange?.start ?? '',
      bank.questionRange?.end ?? '',
      bank.labelSummary,
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const missingNumbersInSpan = (numbers: readonly number[]): readonly number[] => {
  if (numbers.length === 0) {
    return [];
  }

  const numberSet = new Set(numbers);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const missing: number[] = [];

  for (let number = min; number <= max; number += 1) {
    if (!numberSet.has(number)) {
      missing.push(number);
    }
  }

  return missing;
};

export const formatReadingV2AutoSourceNumberRanges = (numbers: readonly number[]): string => {
  const unique = [...new Set(numbers)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  unique.forEach((number) => {
    if (start === null || previous === null || number !== previous + 1) {
      if (start !== null && previous !== null) {
        ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      }
      start = number;
    }
    previous = number;
  });

  if (start !== null && previous !== null) {
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  }

  return ranges.join(', ');
};

const buildIssues = (input: {
  readonly normalizedText: string;
  readonly passages: readonly ReadingV2AutoSourcePassageBoundary[];
  readonly questionRanges: readonly ReadingV2AutoSourceQuestionRange[];
  readonly questionNumbers: readonly number[];
  readonly answerKeyRows: readonly ReadingV2AutoSourceAnswerKeyRow[];
  readonly pollutionMarkers: readonly ReadingV2AutoSourcePollutionMarker[];
  readonly expectedFullTest: boolean;
}): readonly ReadingV2AutoSourceLedgerIssue[] => {
  const issues: ReadingV2AutoSourceLedgerIssue[] = [];

  if (!input.normalizedText) {
    issues.push({
      code: 'source-empty',
      severity: 'error',
      message: 'Source text is empty.',
    });
  }

  if (input.passages.length === 0) {
    issues.push({
      code: 'source-passage-boundary-missing',
      severity: 'error',
      message: 'No strict READING PASSAGE heading was detected.',
    });
  }

  if (input.questionRanges.length === 0) {
    issues.push({
      code: 'source-question-range-missing',
      severity: input.questionNumbers.length > 0 ? 'warning' : 'error',
      message: 'No explicit question-range headings were detected.',
    });
  }

  const gaps = missingNumbersInSpan(input.questionNumbers);
  if (gaps.length > 0) {
    issues.push({
      code: 'source-question-coverage-gap',
      severity: 'warning',
      message: `Question topology has gaps: ${formatReadingV2AutoSourceNumberRanges(gaps)}.`,
    });
  }

  if (input.expectedFullTest && input.answerKeyRows.length === 0) {
    issues.push({
      code: 'source-answer-key-missing',
      severity: 'warning',
      message: 'Full-test source has no detected answer-key rows.',
    });
  }

  if (input.pollutionMarkers.length > 0) {
    issues.push({
      code: 'source-pollution-detected',
      severity: 'warning',
      message: 'Potential clipped web pollution was detected and will be ignored by topology checks.',
    });
  }

  if (input.expectedFullTest && (input.passages.length < 3 || input.questionNumbers.length < 40)) {
    issues.push({
      code: 'source-full-test-incomplete',
      severity: 'warning',
      message: 'Source looks like a full IELTS Reading test but topology is incomplete.',
    });
  }

  if (input.passages.length > 0 && input.questionNumbers.length === 0) {
    issues.push({
      code: 'source-ambiguous-topology',
      severity: 'error',
      message: 'Passage text was detected but no question topology was found.',
    });
  }

  return issues;
};

const classifySource = (input: {
  readonly passages: readonly ReadingV2AutoSourcePassageBoundary[];
  readonly questionNumbers: readonly number[];
  readonly answerKeyRows: readonly ReadingV2AutoSourceAnswerKeyRow[];
  readonly pollutionMarkers: readonly ReadingV2AutoSourcePollutionMarker[];
  readonly expectedFullTest: boolean;
}): ReadingV2AutoSourceCategory => {
  if (input.pollutionMarkers.length > 0 && !input.expectedFullTest) {
    return 'polluted-web-clip';
  }

  if (input.expectedFullTest && input.answerKeyRows.length > 0) {
    return 'full-test-with-answer-key';
  }

  if (input.expectedFullTest) {
    return 'full-test-missing-answer-key';
  }

  if (input.passages.length > 0 || input.questionNumbers.length > 0) {
    return 'single-passage-or-partial-extract';
  }

  return 'unsupported-or-ambiguous-source';
};

export const buildReadingV2AutoSourceLedger = (input: {
  readonly rawText: string;
  readonly sourceName?: string;
}): ReadingV2AutoSourceLedger => {
  const normalizedText = normalizeSourceText(input.rawText);
  const lines = sourceLinesFor(normalizedText);
  const lineIndex = lineIndexFromSourceLines(lines);
  const passages = detectPassages(lines);
  const answerHeadingLine = firstAnswerHeadingLine(lines);
  const questionRanges = detectQuestionRanges(lines, passages, answerHeadingLine);
  const rangeNumbers = numbersFromRanges(questionRanges);
  const visibleNumbers = detectVisibleQuestionNumbers(lines, answerHeadingLine);
  const questionNumbers = [...new Set([...rangeNumbers, ...visibleNumbers])].sort((left, right) => left - right);
  const answerKeyRows = collectAnswerKeyRows(lines);
  const referenceBanks = detectReferenceBanks(lines, passages, questionRanges, answerHeadingLine);
  const pollutionMarkers = lines
    .map(pollutionMarkerForLine)
    .filter((marker): marker is ReadingV2AutoSourcePollutionMarker => marker !== null);
  const expectedFullTest =
    passages.length >= 3
    || (questionNumbers.includes(1) && questionNumbers.includes(40));
  const issues = buildIssues({
    normalizedText,
    passages,
    questionRanges,
    questionNumbers,
    answerKeyRows,
    pollutionMarkers,
    expectedFullTest,
  });
  const category = classifySource({
    passages,
    questionNumbers,
    answerKeyRows,
    pollutionMarkers,
    expectedFullTest,
  });

  return {
    sourceName: input.sourceName,
    title: titleFrom(lines, input.sourceName),
    sourceHash: hashString(normalizedText),
    normalizedText,
    lineCount: lines.length,
    lineIndex,
    category,
    passages,
    questionRanges,
    questionNumbers,
    answerKeyRows,
    referenceBanks,
    pollutionMarkers,
    issues,
    expectedFullTest,
  };
};

export const buildReadingV2ImportSourceArtifact = async (input: {
  readonly rawTextOriginal: string;
  readonly sourceName?: string;
  readonly createdAt?: string;
}): Promise<ReadingV2ImportSourceArtifact> => {
  const normalizedText = normalizeSourceText(input.rawTextOriginal);
  const normalizedLines = sourceLinesFor(normalizedText);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const rawTextSha256 = await sha256Hex(input.rawTextOriginal);
  const normalizedTextSha256 = await sha256Hex(normalizedText);

  return {
    artifactId: [
      'reading-v2-import-source',
      input.sourceName?.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'teacher-paste',
      normalizedTextSha256.slice(0, 16),
    ].join('-'),
    createdAt,
    sourceKind: 'teacher-paste',
    rawTextOriginal: input.rawTextOriginal,
    rawTextSha256,
    normalizedTextSha256,
    lineIndex: lineIndexFromSourceLines(normalizedLines),
    retention: {
      scope: 'draft-author-only',
      includeInStudentProjection: false,
      includeInSessionProjection: false,
      includeInPublicPayload: false,
    },
  };
};

export const buildReadingV2AutoLedgerPromptSummary = (
  ledger: ReadingV2AutoSourceLedger,
  passageNumber?: number,
): string => {
  const ranges = passageNumber
    ? ledger.questionRanges.filter((range) => range.passageNumber === passageNumber)
    : ledger.questionRanges;
  const questionNumbers = ranges.length > 0
    ? numbersFromRanges(ranges)
    : ledger.questionNumbers;

  return [
    'SOURCE_LEDGER_EXPECTATIONS:',
    `- local ledger is topology authority; Gemini is extraction witness only`,
    `- source hash: ${ledger.sourceHash}`,
    `- category: ${ledger.category}`,
    `- expected passage count: ${ledger.passages.length}`,
    passageNumber ? `- current passage number: ${passageNumber}` : undefined,
    `- expected question numbers: ${formatReadingV2AutoSourceNumberRanges(questionNumbers) || 'unknown'}`,
    `- source question ranges: ${
      ranges.map((range) => `${range.start}-${range.end}`).join(', ') || 'unknown'
    }`,
    `- detected reference banks: ${
      ledger.referenceBanks
        .map((bank) => `${bank.kind} ${bank.labelSummary}${bank.questionRange ? ` Q${bank.questionRange.start}-${bank.questionRange.end}` : ''}`)
        .join('; ') || 'none'
    }`,
    `- visible answer-key row count: ${ledger.answerKeyRows.length}`,
    `- source issue codes: ${ledger.issues.map((issue) => issue.code).join(', ') || 'none'}`,
    'Rules from ledger:',
    '1. Do not create extra passages or question numbers absent from the ledger.',
    '2. Do not omit any expected question number from this source unit.',
    '3. If source content is unclear, return diagnostics instead of guessing topology.',
    '4. Copy answer-key rows only from visible source answer-key rows.',
  ].filter((line): line is string => Boolean(line)).join('\n');
};

const questionNumberFor = (question: ReadingV2AutoLedgerPayloadQuestion): number =>
  typeof question.questionNumber === 'number'
    ? question.questionNumber
    : typeof question.number === 'number'
      ? question.number
      : Number(question.questionNumber ?? question.number) || 0;

const payloadQuestionNumbers = (
  payload: ReadingV2AutoLedgerPayload,
): readonly number[] =>
  [...new Set(
    (payload.materials ?? []).flatMap((material) =>
      (material.questions ?? [])
        .map(questionNumberFor)
        .filter((number) => Number.isFinite(number) && number > 0),
    ),
  )].sort((left, right) => left - right);

const payloadQuestionRanges = (
  payload: ReadingV2AutoLedgerPayload,
): readonly { readonly start: number; readonly end: number }[] =>
  (payload.materials ?? []).flatMap((material) =>
    (material.sectionInstructions ?? []).flatMap((instruction) => {
      const start = Number(instruction.questionRange?.start);
      const end = Number(instruction.questionRange?.end);
      return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
        ? [{ start: Math.min(start, end), end: Math.max(start, end) }]
        : [];
    }),
  );

const payloadInstructionLabels = (
  instruction: NonNullable<ReadingV2AutoLedgerPayloadMaterial['sectionInstructions']>[number],
): readonly string[] =>
  [...new Set([
    ...labelsFromReferenceRange(instruction.optionLabelRange),
    ...labelsFromReferenceRange(instruction.referenceLabelRange),
    ...(instruction.sectionReferences ?? []).map((item) => item.label ?? ''),
    ...(instruction.labeledOptions ?? []).map((item) => item.label ?? ''),
  ].map((label) => label.trim().toUpperCase()).filter(Boolean))];

const rangesOverlap = (
  left: { readonly start: number; readonly end: number } | undefined,
  right: { readonly start: number; readonly end: number } | undefined,
): boolean => {
  if (!left || !right) {
    return true;
  }

  return left.start <= right.end && right.start <= left.end;
};

const taskTypeHintFromReferenceBanks = (
  range: ReadingV2AutoSourceQuestionRange,
  ledger: ReadingV2AutoSourceLedger,
): string | undefined => {
  const overlappingKinds = ledger.referenceBanks
    .filter((candidate) =>
      candidate.questionRange
      && rangesOverlap(
        { start: range.start, end: range.end },
        candidate.questionRange,
      ),
    )
    .map((candidate) => candidate.kind);

  for (const kind of ['matching-endings', 'people-list', 'headings-list', 'paragraph-labels'] as const) {
    if (!overlappingKinds.includes(kind)) {
      continue;
    }

    switch (kind) {
      case 'paragraph-labels':
        return 'matching-information';
      case 'people-list':
        return 'matching-features';
      case 'headings-list':
        return 'matching-headings';
      case 'matching-endings':
        return 'matching-sentence-endings';
      default:
        break;
    }
  }

  return undefined;
};

const WORD_NUMBER_BY_TEXT = new Map<string, number>([
  ['ONE', 1],
  ['TWO', 2],
  ['THREE', 3],
  ['FOUR', 4],
  ['FIVE', 5],
]);

const wordLimitFromInstructionText = (value: string | undefined): number | undefined => {
  const text = compact(value ?? '').toUpperCase();
  const wordOnlyMatch = text.match(/\b(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\s+ONLY\b/);
  const noMoreThanMatch = text.match(/\bNO\s+MORE\s+THAN\s+(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\b/);
  const match = wordOnlyMatch ?? noMoreThanMatch;
  const raw = match?.[1];

  if (!raw) {
    return undefined;
  }

  const parsed = WORD_NUMBER_BY_TEXT.get(raw) ?? Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const judgementVocabularyFromInstructionText = (value: string | undefined): 'TFNG' | 'YNNG' | undefined => {
  const text = compact(value ?? '').toUpperCase();

  if (/\bTRUE\b/.test(text) && /\bFALSE\b/.test(text) && /\bNOT\s+GIVEN\b/.test(text)) {
    return 'TFNG';
  }

  if (/\bYES\b/.test(text) && /\bNO\b/.test(text) && /\bNOT\s+GIVEN\b/.test(text)) {
    return 'YNNG';
  }

  return undefined;
};

const taskTypeHintFromInstructionText = (value: string | undefined): string | undefined => {
  const text = compact(value ?? '').toLowerCase();

  if (!text) {
    return undefined;
  }

  if (/\blist\s+of\s+headings\b/.test(text)) {
    return 'matching-headings';
  }

  if (/\b(?:list\s+of\s+people|people\s+below|researchers\s+below|scientists\s+below|experts\s+below|writers\s+below)\b/.test(text)) {
    return 'matching-features';
  }

  if (/\bwhich\s+paragraph\b|\bparagraph\s+contains\b|\bcontains\s+the\s+following\s+information\b/.test(text)) {
    return 'matching-information';
  }

  if (/\btable\b/.test(text) && /\bcomplete\b/.test(text)) {
    return 'table-completion';
  }

  if (/\bflow\s*-?\s*chart\b|\bflowchart\b/.test(text)) {
    return 'flowchart-completion';
  }

  if (/\bdiagram\b/.test(text) && /\b(?:label|labelling|labeling)\b/.test(text)) {
    return 'diagram-labeling';
  }

  if (/\bcomplete\b/.test(text) && /\bnotes?\b/.test(text)) {
    return 'note-completion';
  }

  if (/\bcomplete\b/.test(text) && /\bsummary\b/.test(text) && /\blist\s+of\s+words?\b/.test(text)) {
    return 'summary-completion-list';
  }

  if (/\bcomplete\b/.test(text) && /\bsummary\b/.test(text)) {
    return 'summary-completion-text';
  }

  if (
    (/\bcomplete\b/.test(text) && /\bsentences?\b/.test(text) && /\bcorrect\s+ending\b/.test(text))
    || /\blist\s+of\s+endings\b/.test(text)
    || /\bsentence\s+endings?\b/.test(text)
  ) {
    return 'matching-sentence-endings';
  }

  if (/\bcomplete\b/.test(text) && /\bsentences?\b/.test(text)) {
    return 'sentence-completion';
  }

  if (judgementVocabularyFromInstructionText(text) === 'TFNG') {
    return 'true-false-not-given';
  }

  if (judgementVocabularyFromInstructionText(text) === 'YNNG') {
    return 'yes-no-not-given';
  }

  if (/\bchoose\s+the\s+correct\s+letter\b|\bmultiple\s+choice\b/.test(text)) {
    return 'multiple-choice';
  }

  return undefined;
};

const normalizedTaskType = (value: string | undefined): string | undefined =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

const instructionAllowsReuse = (value: string | undefined): boolean =>
  /\b(?:letter|letters|option|options|heading|headings)\b.{0,40}\b(?:used|use)\b.{0,30}\bmore\s+than\s+once\b/i.test(value ?? '')
  || /\b(?:used|use)\b.{0,30}\bmore\s+than\s+once\b.{0,40}\b(?:letter|letters|option|options|heading|headings)\b/i.test(value ?? '');

const payloadInstructionText = (
  instruction: NonNullable<ReadingV2AutoLedgerPayloadMaterial['sectionInstructions']>[number],
): string => [
  instruction.taskType,
  instruction.sourceInstructionEvidence,
  instruction.wordLimitText,
  instruction.optionLabelRange,
  instruction.referenceLabelRange,
  instruction.vocabulary,
  instruction.optionReuse,
].filter((value): value is string => typeof value === 'string').join(' ');

const instructionRange = (
  instruction: NonNullable<ReadingV2AutoLedgerPayloadMaterial['sectionInstructions']>[number],
): { readonly start: number; readonly end: number } | undefined => {
  const start = Number(instruction.questionRange?.start);
  const end = Number(instruction.questionRange?.end);

  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
    ? { start: Math.min(start, end), end: Math.max(start, end) }
    : undefined;
};

const payloadInstructionCoverageIssues = (
  payload: ReadingV2AutoLedgerPayload,
  ledger: ReadingV2AutoSourceLedger,
): readonly ReadingV2AutoSourceVerifierIssue[] => {
  const payloadInstructions = (payload.materials ?? [])
    .flatMap((material) => material.sectionInstructions ?? [])
    .map((instruction) => ({
      instruction,
      range: instructionRange(instruction),
      text: payloadInstructionText(instruction),
    }));

  return ledger.questionRanges.flatMap((range) => {
    const sourceInstruction = range.instructionPreview ?? '';
    const expectedTaskType =
      taskTypeHintFromReferenceBanks(range, ledger)
      ?? taskTypeHintFromInstructionText(sourceInstruction);
    const expectedWordLimit = wordLimitFromInstructionText(sourceInstruction);
    const expectedVocabulary = judgementVocabularyFromInstructionText(sourceInstruction);
    const expectedReuse = instructionAllowsReuse(sourceInstruction);

    if (!expectedTaskType && !expectedWordLimit && !expectedVocabulary && !expectedReuse) {
      return [];
    }

    const matchingInstruction = payloadInstructions.find((candidate) =>
      rangesOverlap({ start: range.start, end: range.end }, candidate.range),
    );
    const issues: ReadingV2AutoSourceVerifierIssue[] = [];
    const issueBase = {
      severity: 'error' as const,
      ...(range.passageNumber !== undefined ? { passageNumber: range.passageNumber } : {}),
      questionNumber: range.start,
    };

    if (!matchingInstruction) {
      return [{
        ...issueBase,
        code: 'source-question-range-missing',
        message: `Source instruction for Questions ${range.start}-${range.end} has required constraints, but Gemini output omitted the matching instruction range.`,
      }];
    }

    const generatedTaskType = normalizedTaskType(matchingInstruction.instruction.taskType);
    if (expectedTaskType && generatedTaskType && generatedTaskType !== expectedTaskType) {
      issues.push({
        ...issueBase,
        code: 'source-instruction-task-type-mismatch',
        message: `Source instruction for Questions ${range.start}-${range.end} looks like ${expectedTaskType}, but Gemini output returned ${generatedTaskType}.`,
      });
    }

    const generatedWordLimit = typeof matchingInstruction.instruction.wordLimit === 'number'
      ? matchingInstruction.instruction.wordLimit
      : wordLimitFromInstructionText(matchingInstruction.text);
    if (expectedWordLimit && generatedWordLimit !== expectedWordLimit) {
      issues.push({
        ...issueBase,
        code: 'source-instruction-word-limit-mismatch',
        message: `Source instruction for Questions ${range.start}-${range.end} requires a ${expectedWordLimit}-word limit, but Gemini output did not preserve it.`,
      });
    }

    const generatedVocabulary = judgementVocabularyFromInstructionText(matchingInstruction.text)
      ?? (matchingInstruction.instruction.vocabulary?.toUpperCase() === 'TFNG'
        || matchingInstruction.instruction.vocabulary?.toUpperCase() === 'YNNG'
        ? matchingInstruction.instruction.vocabulary.toUpperCase() as 'TFNG' | 'YNNG'
        : undefined);
    if (expectedVocabulary && generatedVocabulary !== expectedVocabulary) {
      issues.push({
        ...issueBase,
        code: 'source-instruction-vocabulary-mismatch',
        message: `Source instruction for Questions ${range.start}-${range.end} uses ${expectedVocabulary} vocabulary, but Gemini output did not preserve it.`,
      });
    }

    const generatedAllowsReuse =
      matchingInstruction.instruction.optionReuse === 'allowed'
      || instructionAllowsReuse(matchingInstruction.text);
    if (expectedReuse && !generatedAllowsReuse) {
      issues.push({
        ...issueBase,
        code: 'source-instruction-reuse-mismatch',
        message: `Source instruction for Questions ${range.start}-${range.end} allows letter reuse, but Gemini output did not preserve that rule.`,
      });
    }

    return issues;
  });
};

const payloadReferenceBankIssues = (
  payload: ReadingV2AutoLedgerPayload,
  ledger: ReadingV2AutoSourceLedger,
): readonly ReadingV2AutoSourceVerifierIssue[] =>
  ledger.referenceBanks.flatMap((bank) => {
    const issueFor = (
      code: Extract<ReadingV2AutoSourceVerifierCode, 'source-reference-bank-missing' | 'source-reference-bank-mismatch'>,
      message: string,
    ): ReadingV2AutoSourceVerifierIssue => ({
      code,
      severity: 'error',
      message,
      ...(bank.passageNumber !== undefined ? { passageNumber: bank.passageNumber } : {}),
      ...(bank.questionRange ? { questionNumber: bank.questionRange.start } : {}),
    });
    const expectedLabels = [...new Set(bank.labels.map((label) => label.toUpperCase()))];
    const matchingInstructions = (payload.materials ?? [])
      .flatMap((material) => material.sectionInstructions ?? [])
      .map((instruction) => {
        const start = Number(instruction.questionRange?.start);
        const end = Number(instruction.questionRange?.end);
        const range = Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
          ? { start: Math.min(start, end), end: Math.max(start, end) }
          : undefined;

        return {
          range,
          labels: payloadInstructionLabels(instruction),
        };
      })
      .filter((candidate) =>
        rangesOverlap(bank.questionRange, candidate.range)
        && candidate.labels.length > 0,
      );

    if (matchingInstructions.length === 0) {
      return [issueFor(
        'source-reference-bank-missing',
        `Source ledger detected ${bank.kind} bank ${bank.labelSummary}, but Gemini output omitted matching option/reference labels.`,
      )];
    }

    const matched = matchingInstructions.find((candidate) =>
      expectedLabels.every((label) => candidate.labels.includes(label)),
    );

    if (!matched) {
      return [issueFor(
        'source-reference-bank-mismatch',
        `Source ledger expected ${bank.kind} labels ${bank.labelSummary}, but Gemini output returned different option/reference labels.`,
      )];
    }

    return [];
  });

const payloadAnswerKeyNumbers = (
  answerKeyText: string | undefined,
): readonly number[] =>
  parseReadingV2TeacherAnswerKey(answerKeyText).rows
    .filter((row) =>
      row.parsedAnswerValues.length > 0
      && !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    )
    .map((row) => row.questionNumber);

const payloadPassageContentLength = (material: ReadingV2AutoLedgerPayloadMaterial): number =>
  (material.passages ?? [])
    .map((passage) => compact(passage.content ?? '').length)
    .reduce((sum, value) => sum + value, 0);

export const verifyReadingV2AutoPayloadAgainstLedger = (
  payload: ReadingV2AutoLedgerPayload,
  ledger: ReadingV2AutoSourceLedger,
): readonly ReadingV2AutoSourceVerifierIssue[] => {
  const issues: ReadingV2AutoSourceVerifierIssue[] = [];
  const expectedQuestions = new Set(ledger.questionNumbers);
  const generatedQuestions = new Set(payloadQuestionNumbers(payload));
  const answerKeyQuestions = new Set(ledger.answerKeyRows.map((row) => row.questionNumber));
  const answerKeyQuestionsToEnforce = new Set(
    ledger.expectedFullTest
      ? [...answerKeyQuestions]
      : [...answerKeyQuestions].filter((number) => expectedQuestions.has(number)),
  );
  const effectiveExpectedQuestions = new Set([...expectedQuestions, ...answerKeyQuestionsToEnforce]);
  const missingQuestions = [...effectiveExpectedQuestions]
    .filter((number) => !generatedQuestions.has(number))
    .sort((left, right) => left - right);
  const extraQuestions = [...generatedQuestions]
    .filter((number) =>
      expectedQuestions.size > 0
      && !expectedQuestions.has(number)
      && !answerKeyQuestionsToEnforce.has(number),
    )
    .sort((left, right) => left - right);

  if (ledger.passages.length > 0 && (payload.materials?.length ?? 0) < ledger.passages.length) {
    issues.push({
      code: 'source-passage-missing',
      severity: 'error',
      message: `Source ledger detected ${ledger.passages.length} passages, but Gemini output has ${payload.materials?.length ?? 0}.`,
      passageNumber: ledger.passages[payload.materials?.length ?? 0]?.passageNumber,
    });
  }

  if (ledger.passages.length > 0 && (payload.materials?.length ?? 0) > ledger.passages.length) {
    issues.push({
      code: 'source-passage-extra',
      severity: 'error',
      message: `Gemini output added ${(payload.materials?.length ?? 0) - ledger.passages.length} passage material(s) absent from strict source headings.`,
      passageNumber: ledger.passages[ledger.passages.length - 1]?.passageNumber,
    });
  }

  if (missingQuestions.length > 0) {
    issues.push({
      code: 'source-question-missing',
      severity: 'error',
      message: `Source ledger detected questions ${formatReadingV2AutoSourceNumberRanges(missingQuestions)}, but Gemini output omitted them.`,
      questionNumber: missingQuestions[0],
    });
  }

  if (extraQuestions.length > 0) {
    issues.push({
      code: 'source-question-extra',
      severity: 'error',
      message: `Gemini output added question numbers absent from the source ledger: ${formatReadingV2AutoSourceNumberRanges(extraQuestions)}.`,
      questionNumber: extraQuestions[0],
    });
  }

  const generatedRanges = payloadQuestionRanges(payload);
  const missingRanges = ledger.questionRanges.filter((range) =>
    !generatedRanges.some((generatedRange) => generatedRange.start <= range.start && generatedRange.end >= range.end)
    && ![...generatedQuestions].some((number) => number >= range.start && number <= range.end),
  );

  missingRanges.forEach((range) => {
    issues.push({
      code: 'source-question-range-missing',
      severity: 'error',
      message: `Source question range ${range.start}-${range.end} is not represented in Gemini output.`,
      passageNumber: range.passageNumber,
      questionNumber: range.start,
    });
  });

  issues.push(...payloadReferenceBankIssues(payload, ledger));
  issues.push(...payloadInstructionCoverageIssues(payload, ledger));

  const generatedAnswerKeyNumbers = new Set(payloadAnswerKeyNumbers(payload.answerKeyText));
  const unboundAnswerRows = [...answerKeyQuestionsToEnforce]
    .filter((number) => !generatedQuestions.has(number) || !generatedAnswerKeyNumbers.has(number))
    .sort((left, right) => left - right);

  if (unboundAnswerRows.length > 0) {
    issues.push({
      code: 'source-answer-row-unbound',
      severity: 'error',
      message: `Source answer-key rows cannot bind to generated questions: ${formatReadingV2AutoSourceNumberRanges(unboundAnswerRows)}.`,
      questionNumber: unboundAnswerRows[0],
    });
  }

  ledger.passages.forEach((passage, index) => {
    const material = (payload.materials ?? [])[index];
    const contentLength = material ? payloadPassageContentLength(material) : 0;
    const nextPassage = ledger.passages[index + 1];
    const sourceSlice = ledger.normalizedText.slice(passage.charStart, nextPassage?.charStart ?? ledger.normalizedText.length);
    const sourceBeforeQuestions = sourceSlice.split(
      /\n\s*(?:(?:#{1,6}\s*)?Questions?\s+\d+|(?:[-*]\s*)?(?:\*\*)?\d{1,3}(?:\*\*)?(?:\\?[\).])?(?:\*\*)?\s+)/i,
    )[0] ?? '';
    const sourceLength = compact(sourceBeforeQuestions).length;

    if (sourceLength >= 500 && contentLength > 0 && contentLength < sourceLength * 0.25) {
      issues.push({
        code: 'source-passage-trim-risk',
        severity: 'error',
        message: `Passage ${passage.passageNumber} output is much shorter than the source ledger slice.`,
        passageNumber: passage.passageNumber,
      });
    }
  });

  return issues;
};

export const readingV2AutoSourceLedgerEvidence = (
  ledger: ReadingV2AutoSourceLedger,
): readonly string[] => [
  `Source ledger category: ${ledger.category}`,
  `Source ledger hash: ${ledger.sourceHash}`,
  `Source ledger passages: ${ledger.passages.length}`,
  `Source ledger question ranges: ${ledger.questionRanges.map((range) => `${range.start}-${range.end}`).join(', ') || 'none'}`,
  `Source ledger task groups: ${ledger.questionRanges.length}`,
  `Source ledger questions: ${formatReadingV2AutoSourceNumberRanges(ledger.questionNumbers) || 'none'}`,
  `Source ledger answer-key rows: ${ledger.answerKeyRows.length}`,
];
