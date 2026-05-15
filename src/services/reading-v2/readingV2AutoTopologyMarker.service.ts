import type { AIStructuredGenerationOptions } from '../ai/ai.service';
import type { Result } from '../../types/result.types';
import {
  formatReadingV2AutoSourceNumberRanges,
  type ReadingV2AutoSourceLedger,
  type ReadingV2AutoSourceLine,
} from './readingV2AutoImportSourceLedger.service';

export interface ReadingV2AutoLineIndexLine extends ReadingV2AutoSourceLine {
  readonly trimmedTextHash: string;
}

export interface ReadingV2AutoLineIndex {
  readonly sourceHash: string;
  readonly lines: readonly ReadingV2AutoLineIndexLine[];
}

export interface ReadingV2AutoLineSpan {
  readonly startLine: number;
  readonly endLine: number;
}

export interface ReadingV2AutoQuestionRange {
  readonly start: number;
  readonly end: number;
}

export interface ReadingV2AutoTopologyGroupHint {
  readonly questionRange: ReadingV2AutoQuestionRange;
  readonly lines: ReadingV2AutoLineSpan;
  readonly taskTypeHint?: string;
  readonly referenceBankLines?: readonly ReadingV2AutoLineSpan[];
}

export interface ReadingV2AutoTopologyAnswerKeyRow {
  readonly questionNumber: number;
  readonly answer: string;
  readonly sourceLine: number;
  readonly alternativeAnswers?: readonly string[];
  readonly uncertaintyCode?: string;
}

export interface ReadingV2AutoTopologyPackageMarker {
  readonly passageNumber: number;
  readonly passageTitleLines?: ReadingV2AutoLineSpan;
  readonly passageBodyLines: ReadingV2AutoLineSpan;
  readonly questionAreaLines: ReadingV2AutoLineSpan;
  readonly expectedQuestionRange: ReadingV2AutoQuestionRange;
  readonly groups: readonly ReadingV2AutoTopologyGroupHint[];
  readonly referenceBankLineSpans: readonly ReadingV2AutoLineSpan[];
  readonly excludedLineSpans: readonly ReadingV2AutoLineSpan[];
  readonly uncertaintyDiagnostics: readonly string[];
}

export interface ReadingV2AutoTopologyMarker {
  readonly sourceHash?: string;
  readonly packages: readonly ReadingV2AutoTopologyPackageMarker[];
  readonly answerKeyRows: readonly ReadingV2AutoTopologyAnswerKeyRow[];
  readonly diagnostics: readonly string[];
}

export type ReadingV2AutoTopologyMarkerDiagnosticCode =
  | 'topology-marker-malformed'
  | 'topology-marker-source-hash-mismatch'
  | 'topology-marker-package-count-mismatch'
  | 'topology-marker-duplicate-passage'
  | 'topology-marker-impossible-span'
  | 'topology-marker-passage-heading-missing'
  | 'topology-marker-question-area-missing'
  | 'topology-marker-question-coverage-missing'
  | 'topology-marker-answer-row-missing'
  | 'topology-marker-answer-row-source-mismatch'
  | 'topology-marker-package-span-overlap'
  | 'topology-marker-pollution-overlap';

export interface ReadingV2AutoTopologyMarkerDiagnostic {
  readonly code: ReadingV2AutoTopologyMarkerDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly sourceRange?: string;
}

export interface ReadingV2AutoTopologyMarkerGenerator {
  generateStructuredJson(
    prompt: string,
    options?: AIStructuredGenerationOptions,
  ): Promise<Result<unknown>>;
}

export interface ReadingV2AutoTopologyMarkerResult {
  readonly marker: ReadingV2AutoTopologyMarker;
  readonly lineIndex: ReadingV2AutoLineIndex;
  readonly prompt: string;
  readonly diagnostics: readonly ReadingV2AutoTopologyMarkerDiagnostic[];
}

const TOPOLOGY_MARKER_MAX_OUTPUT_TOKENS = 16_384;

export const READING_V2_AUTO_TOPOLOGY_MARKER_SYSTEM_INSTRUCTION = [
  'You are a Reading V2 topology marker.',
  'Return valid JSON only. Do not return Markdown fences, comments, or prose.',
  'Mark coordinates only: line spans, question ranges, task hints, pollution spans, and answer-key rows.',
  'Do not copy passage body text. Do not copy full question text. Do not solve answers.',
  'Do not create canonical Reading V2 ids. Local code owns final draft, scoring, validation, and publish readiness.',
].join('\n');

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const compact = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const sourceLinesFor = (normalizedText: string): readonly ReadingV2AutoSourceLine[] => {
  const rawLines = normalizedText ? normalizedText.split('\n') : [];
  let charStart = 0;

  return rawLines.map((text, index) => {
    const line: ReadingV2AutoSourceLine = {
      lineNumber: index + 1,
      charStart,
      charEnd: charStart + text.length,
      text,
    };
    charStart += text.length + 1;
    return line;
  });
};

export const buildReadingV2AutoLineIndex = (
  ledger: ReadingV2AutoSourceLedger,
): ReadingV2AutoLineIndex => ({
  sourceHash: ledger.sourceHash,
  lines: sourceLinesFor(ledger.normalizedText).map((line) => ({
    ...line,
    trimmedTextHash: hashString(compact(line.text)),
  })),
});

const numberedLinesForPrompt = (lineIndex: ReadingV2AutoLineIndex): string =>
  lineIndex.lines
    .map((line) => `${String(line.lineNumber).padStart(4, '0')} [${line.trimmedTextHash}] ${line.text}`)
    .join('\n');

const ledgerExpectationsForPrompt = (ledger: ReadingV2AutoSourceLedger): string => [
  `sourceHash: ${ledger.sourceHash}`,
  `expectedFullTest: ${ledger.expectedFullTest ? 'yes' : 'no'}`,
  `expectedPassageCount: ${ledger.passages.length}`,
  `expectedQuestionNumbers: ${formatReadingV2AutoSourceNumberRanges(ledger.questionNumbers) || 'unknown'}`,
  `sourceQuestionRanges: ${ledger.questionRanges.map((range) => `${range.start}-${range.end}`).join(', ') || 'unknown'}`,
  `visibleAnswerKeyRows: ${ledger.answerKeyRows.length}`,
  `pollutionLines: ${ledger.pollutionMarkers.map((marker) => marker.lineNumber).join(', ') || 'none'}`,
].join('\n');

export const buildReadingV2AutoTopologyMarkerPrompt = (
  ledger: ReadingV2AutoSourceLedger,
  lineIndex: ReadingV2AutoLineIndex = buildReadingV2AutoLineIndex(ledger),
): string => [
  'Mark the topology of this IELTS Reading source.',
  '',
  'Return JSON with this exact shape:',
  '{',
  '  "sourceHash": "source hash copied from prompt",',
  '  "packages": [',
  '    {',
  '      "passageNumber": 1,',
  '      "passageTitleLines": [1, 2],',
  '      "passageBodyLines": [2, 20],',
  '      "questionAreaLines": [21, 45],',
  '      "expectedQuestionRange": [1, 13],',
  '      "groups": [',
  '        { "questionRange": [1, 5], "lines": [21, 30], "taskTypeHint": "true-false-not-given", "referenceBankLines": [[24, 28]] }',
  '      ],',
  '      "referenceBankLineSpans": [[24, 28]],',
  '      "excludedLineSpans": [],',
  '      "uncertaintyDiagnostics": []',
  '    }',
  '  ],',
  '  "answerKeyRows": [',
  '    { "questionNumber": 1, "answer": "TRUE", "sourceLine": 90, "alternativeAnswers": [], "uncertaintyCode": "" }',
  '  ],',
  '  "diagnostics": []',
  '}',
  '',
  'Rules:',
  '1. Return exactly three packages when the source is a full IELTS Reading test.',
  '2. Use line coordinates only. Do not copy passage body or full question text.',
  '3. Mark questionAreaLines as every line needed to reconstruct question formatting for that passage.',
  '4. questionAreaLines must include headings, instructions, options, reference banks, tables, notes, summaries, flowcharts, diagrams, and numbered question lines.',
  '5. passageBodyLines must exclude answer-key and unrelated pollution lines.',
  '6. Normalize answer-key rows only from visible source answer-key rows. Do not solve answers from the passage.',
  '7. If a span or answer row is uncertain, keep coordinates conservative and add a short diagnostic code.',
  '8. passageTitleLines should include the visible READING PASSAGE N heading line when present; passageBodyLines may start at the real passage title/body after heading-only or web-clip noise.',
  '',
  'Ledger expectations:',
  ledgerExpectationsForPrompt(ledger),
  '',
  'Numbered source lines:',
  '<NUMBERED_READING_SOURCE>',
  numberedLinesForPrompt(lineIndex),
  '</NUMBERED_READING_SOURCE>',
].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberFrom = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const spanFrom = (value: unknown): ReadingV2AutoLineSpan | undefined => {
  if (Array.isArray(value)) {
    const startLine = numberFrom(value[0]);
    const endLine = numberFrom(value[1]);
    return startLine && endLine ? { startLine, endLine } : undefined;
  }

  if (isRecord(value)) {
    const startLine = numberFrom(value.startLine ?? value.start);
    const endLine = numberFrom(value.endLine ?? value.end);
    return startLine && endLine ? { startLine, endLine } : undefined;
  }

  return undefined;
};

const rangeFrom = (value: unknown): ReadingV2AutoQuestionRange | undefined => {
  if (Array.isArray(value)) {
    const start = numberFrom(value[0]);
    const end = numberFrom(value[1]);
    return start && end ? { start: Math.min(start, end), end: Math.max(start, end) } : undefined;
  }

  if (isRecord(value)) {
    const start = numberFrom(value.start);
    const end = numberFrom(value.end);
    return start && end ? { start: Math.min(start, end), end: Math.max(start, end) } : undefined;
  }

  return undefined;
};

const spansFrom = (value: unknown): readonly ReadingV2AutoLineSpan[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const span = spanFrom(item);
        return span ? [span] : [];
      })
    : [];

const stringsFrom = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const normalizeGroup = (value: unknown): ReadingV2AutoTopologyGroupHint | null => {
  if (!isRecord(value)) {
    return null;
  }

  const questionRange = rangeFrom(value.questionRange ?? value.range);
  const lines = spanFrom(value.lines ?? value.lineSpan);
  if (!questionRange || !lines) {
    return null;
  }

  return {
    questionRange,
    lines,
    ...(typeof value.taskTypeHint === 'string' && value.taskTypeHint.trim()
      ? { taskTypeHint: value.taskTypeHint.trim() }
      : {}),
    referenceBankLines: spansFrom(value.referenceBankLines),
  };
};

const normalizePackage = (value: unknown): ReadingV2AutoTopologyPackageMarker | null => {
  if (!isRecord(value)) {
    return null;
  }

  const passageNumber = numberFrom(value.passageNumber ?? value.passage);
  const passageBodyLines = spanFrom(value.passageBodyLines ?? value.bodyLines);
  const questionAreaLines = spanFrom(value.questionAreaLines ?? value.questionLines);
  const expectedQuestionRange = rangeFrom(value.expectedQuestionRange ?? value.questionRange);
  if (!passageNumber || !passageBodyLines || !questionAreaLines || !expectedQuestionRange) {
    return null;
  }

  const passageTitleLines = spanFrom(value.passageTitleLines ?? value.titleLines);

  return {
    passageNumber,
    ...(passageTitleLines ? { passageTitleLines } : {}),
    passageBodyLines,
    questionAreaLines,
    expectedQuestionRange,
    groups: Array.isArray(value.groups)
      ? value.groups.flatMap((group) => {
          const normalized = normalizeGroup(group);
          return normalized ? [normalized] : [];
        })
      : [],
    referenceBankLineSpans: spansFrom(value.referenceBankLineSpans),
    excludedLineSpans: spansFrom(value.excludedLineSpans ?? value.pollutionLineSpans),
    uncertaintyDiagnostics: stringsFrom(value.uncertaintyDiagnostics),
  };
};

const normalizeAnswerKeyRow = (value: unknown): ReadingV2AutoTopologyAnswerKeyRow | null => {
  if (!isRecord(value)) {
    return null;
  }

  const questionNumber = numberFrom(value.questionNumber ?? value.question);
  const sourceLine = numberFrom(value.sourceLine ?? value.line);
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  if (!questionNumber || !sourceLine || !answer) {
    return null;
  }

  return {
    questionNumber,
    answer,
    sourceLine,
    alternativeAnswers: stringsFrom(value.alternativeAnswers ?? value.alternatives),
    ...(typeof value.uncertaintyCode === 'string' && value.uncertaintyCode.trim()
      ? { uncertaintyCode: value.uncertaintyCode.trim() }
      : {}),
  };
};

export const normalizeReadingV2AutoTopologyMarker = (
  data: unknown,
): ReadingV2AutoTopologyMarker | null => {
  if (!isRecord(data)) {
    return null;
  }

  const packages = Array.isArray(data.packages)
    ? data.packages.flatMap((item) => {
        const normalized = normalizePackage(item);
        return normalized ? [normalized] : [];
      })
    : [];
  const answerKeyRows = Array.isArray(data.answerKeyRows)
    ? data.answerKeyRows.flatMap((item) => {
        const normalized = normalizeAnswerKeyRow(item);
        return normalized ? [normalized] : [];
      })
    : [];

  if (packages.length === 0 && answerKeyRows.length === 0 && !Array.isArray(data.diagnostics)) {
    return null;
  }

  return {
    ...(typeof data.sourceHash === 'string' ? { sourceHash: data.sourceHash } : {}),
    packages,
    answerKeyRows,
    diagnostics: stringsFrom(data.diagnostics),
  };
};

const spanLabel = (span: ReadingV2AutoLineSpan): string =>
  `${span.startLine}-${span.endLine}`;

const lineExists = (lineIndex: ReadingV2AutoLineIndex, lineNumber: number): boolean =>
  lineNumber >= 1 && lineNumber <= lineIndex.lines.length;

const validateSpan = (
  span: ReadingV2AutoLineSpan | undefined,
  lineIndex: ReadingV2AutoLineIndex,
): boolean =>
  Boolean(span)
  && span!.startLine <= span!.endLine
  && lineExists(lineIndex, span!.startLine)
  && lineExists(lineIndex, span!.endLine);

const linesInSpan = (
  lineIndex: ReadingV2AutoLineIndex,
  span: ReadingV2AutoLineSpan,
): readonly ReadingV2AutoLineIndexLine[] =>
  lineIndex.lines.filter((line) => line.lineNumber >= span.startLine && line.lineNumber <= span.endLine);

const spanContainsPassageHeading = (
  lineIndex: ReadingV2AutoLineIndex,
  span: ReadingV2AutoLineSpan,
  passageNumber: number,
): boolean =>
  linesInSpan(lineIndex, span).some((line) =>
    new RegExp(`^\\s*(?:#{1,6}\\s*)?READING\\s+PASSAGE\\s+${passageNumber}\\b`, 'i').test(line.text),
  );

const spanIsAnchoredAfterLedgerPassageHeading = (
  span: ReadingV2AutoLineSpan,
  questionAreaSpan: ReadingV2AutoLineSpan,
  passageNumber: number,
  ledger: ReadingV2AutoSourceLedger,
): boolean => {
  const ledgerPassage = ledger.passages.find((passage) => passage.passageNumber === passageNumber);
  if (!ledgerPassage) {
    return false;
  }

  return span.startLine >= ledgerPassage.lineNumber
    && span.startLine < questionAreaSpan.startLine
    && span.endLine < questionAreaSpan.startLine;
};

const spanContainsQuestionEvidence = (
  lineIndex: ReadingV2AutoLineIndex,
  span: ReadingV2AutoLineSpan,
  range: ReadingV2AutoQuestionRange,
): boolean =>
  linesInSpan(lineIndex, span).some((line) => {
    const compacted = compact(line.text);
    return new RegExp(`^Questions?\\s+${range.start}\\s*(?:-|\\u2013|\\u2014)\\s*${range.end}\\b`, 'i').test(compacted)
      || new RegExp(`^(?:[-*]\\s*)?(?:\\*\\*)?${range.start}(?:\\*\\*)?(?:\\\\?[\\).])?(?:\\*\\*)?\\s+\\S+`, 'i').test(compacted);
  });

const rangeNumbers = (range: ReadingV2AutoQuestionRange): readonly number[] => {
  const numbers: number[] = [];
  for (let number = range.start; number <= range.end; number += 1) {
    numbers.push(number);
  }
  return numbers;
};

const spansOverlap = (left: ReadingV2AutoLineSpan, right: ReadingV2AutoLineSpan): boolean =>
  left.startLine <= right.endLine && right.startLine <= left.endLine;

export const validateReadingV2AutoTopologyMarker = (
  marker: ReadingV2AutoTopologyMarker,
  ledger: ReadingV2AutoSourceLedger,
  lineIndex: ReadingV2AutoLineIndex = buildReadingV2AutoLineIndex(ledger),
): readonly ReadingV2AutoTopologyMarkerDiagnostic[] => {
  const diagnostics: ReadingV2AutoTopologyMarkerDiagnostic[] = [];

  if (marker.sourceHash && marker.sourceHash !== ledger.sourceHash) {
    diagnostics.push({
      code: 'topology-marker-source-hash-mismatch',
      severity: 'error',
      message: 'Gemini topology marker returned a source hash that does not match the local ledger.',
    });
  }

  if (ledger.expectedFullTest && marker.packages.length !== 3) {
    diagnostics.push({
      code: 'topology-marker-package-count-mismatch',
      severity: 'error',
      message: `Expected 3 passage packages for full Reading test, got ${marker.packages.length}.`,
    });
  }

  const seenPassages = new Set<number>();
  marker.packages.forEach((packageMarker) => {
    if (seenPassages.has(packageMarker.passageNumber)) {
      diagnostics.push({
        code: 'topology-marker-duplicate-passage',
        severity: 'error',
        message: `Gemini topology marker duplicated passage ${packageMarker.passageNumber}.`,
        passageNumber: packageMarker.passageNumber,
      });
    }
    seenPassages.add(packageMarker.passageNumber);

    const spans = [
      packageMarker.passageTitleLines,
      packageMarker.passageBodyLines,
      packageMarker.questionAreaLines,
      ...packageMarker.referenceBankLineSpans,
      ...packageMarker.excludedLineSpans,
      ...packageMarker.groups.map((group) => group.lines),
      ...packageMarker.groups.flatMap((group) => group.referenceBankLines ?? []),
    ].filter((span): span is ReadingV2AutoLineSpan => Boolean(span));

    spans.forEach((span) => {
      if (!validateSpan(span, lineIndex)) {
        diagnostics.push({
          code: 'topology-marker-impossible-span',
          severity: 'error',
          message: `Gemini topology marker returned impossible line span ${spanLabel(span)}.`,
          passageNumber: packageMarker.passageNumber,
          sourceRange: spanLabel(span),
        });
      }
    });

    const passageSpan = packageMarker.passageTitleLines
      ? {
          startLine: Math.min(packageMarker.passageTitleLines.startLine, packageMarker.passageBodyLines.startLine),
          endLine: Math.max(packageMarker.passageTitleLines.endLine, packageMarker.passageBodyLines.endLine),
        }
      : packageMarker.passageBodyLines;
    const ledgerPassage = ledger.passages.find((passage) => passage.passageNumber === packageMarker.passageNumber);
    if (
      ledgerPassage
      && validateSpan(passageSpan, lineIndex)
      && !spanContainsPassageHeading(lineIndex, passageSpan, packageMarker.passageNumber)
      && !spanIsAnchoredAfterLedgerPassageHeading(
        passageSpan,
        packageMarker.questionAreaLines,
        packageMarker.passageNumber,
        ledger,
      )
    ) {
      diagnostics.push({
        code: 'topology-marker-passage-heading-missing',
        severity: 'error',
        message: `Passage ${packageMarker.passageNumber} span does not include the strict source heading.`,
        passageNumber: packageMarker.passageNumber,
        sourceRange: spanLabel(passageSpan),
      });
    }

    if (!spanContainsQuestionEvidence(lineIndex, packageMarker.questionAreaLines, packageMarker.expectedQuestionRange)) {
      diagnostics.push({
        code: 'topology-marker-question-area-missing',
        severity: 'error',
        message: `Passage ${packageMarker.passageNumber} question area does not include visible range evidence.`,
        passageNumber: packageMarker.passageNumber,
        questionNumber: packageMarker.expectedQuestionRange.start,
        sourceRange: spanLabel(packageMarker.questionAreaLines),
      });
    }

    if (spansOverlap(packageMarker.passageBodyLines, packageMarker.questionAreaLines)) {
      diagnostics.push({
        code: 'topology-marker-package-span-overlap',
        severity: 'error',
        message: `Passage ${packageMarker.passageNumber} body span overlaps question-area span.`,
        passageNumber: packageMarker.passageNumber,
        sourceRange: `${spanLabel(packageMarker.passageBodyLines)} + ${spanLabel(packageMarker.questionAreaLines)}`,
      });
    }

    packageMarker.excludedLineSpans.forEach((excluded) => {
      if (spansOverlap(excluded, packageMarker.passageBodyLines) || spansOverlap(excluded, packageMarker.questionAreaLines)) {
        diagnostics.push({
          code: 'topology-marker-pollution-overlap',
          severity: 'error',
          message: `Passage ${packageMarker.passageNumber} package span overlaps excluded pollution lines.`,
          passageNumber: packageMarker.passageNumber,
          sourceRange: spanLabel(excluded),
        });
      }
    });
  });

  const markerQuestions = new Set(marker.packages.flatMap((packageMarker) => rangeNumbers(packageMarker.expectedQuestionRange)));
  const missingQuestions = ledger.questionNumbers.filter((questionNumber) => !markerQuestions.has(questionNumber));
  if (ledger.expectedFullTest && missingQuestions.length > 0) {
    diagnostics.push({
      code: 'topology-marker-question-coverage-missing',
      severity: 'error',
      message: `Gemini topology marker omitted source questions ${formatReadingV2AutoSourceNumberRanges(missingQuestions)}.`,
      questionNumber: missingQuestions[0],
    });
  }

  const markerAnswerQuestions = new Set(marker.answerKeyRows.map((row) => row.questionNumber));
  const missingAnswerRows = ledger.answerKeyRows
    .map((row) => row.questionNumber)
    .filter((questionNumber) => !markerAnswerQuestions.has(questionNumber));
  if (ledger.answerKeyRows.length > 0 && missingAnswerRows.length > 0) {
    diagnostics.push({
      code: 'topology-marker-answer-row-missing',
      severity: 'error',
      message: `Gemini topology marker omitted answer-key rows ${formatReadingV2AutoSourceNumberRanges(missingAnswerRows)}.`,
      questionNumber: missingAnswerRows[0],
    });
  }

  marker.answerKeyRows.forEach((row) => {
    const sourceLine = lineIndex.lines[row.sourceLine - 1];
    const answerHash = hashString(`${row.questionNumber}:${row.answer.toLowerCase()}`);
    const ledgerRow = ledger.answerKeyRows.find((candidate) =>
      candidate.questionNumber === row.questionNumber
      && candidate.sourceLine === row.sourceLine
      && candidate.answerHash === answerHash,
    );
    if (!sourceLine || !ledgerRow) {
      diagnostics.push({
        code: 'topology-marker-answer-row-source-mismatch',
        severity: 'error',
        message: `Answer-key row for question ${row.questionNumber} cannot be bound to the local source ledger at line ${row.sourceLine}.`,
        questionNumber: row.questionNumber,
        sourceRange: String(row.sourceLine),
      });
    }
  });

  return diagnostics;
};

export const markReadingV2AutoTopology = async (input: {
  readonly ledger: ReadingV2AutoSourceLedger;
  readonly generator: ReadingV2AutoTopologyMarkerGenerator;
}): Promise<Result<ReadingV2AutoTopologyMarkerResult>> => {
  const lineIndex = buildReadingV2AutoLineIndex(input.ledger);
  const prompt = buildReadingV2AutoTopologyMarkerPrompt(input.ledger, lineIndex);
  const result = await input.generator.generateStructuredJson(prompt, {
    systemInstruction: READING_V2_AUTO_TOPOLOGY_MARKER_SYSTEM_INSTRUCTION,
    temperature: 0,
    maxOutputTokens: TOPOLOGY_MARKER_MAX_OUTPUT_TOKENS,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const marker = normalizeReadingV2AutoTopologyMarker(result.data);
  if (!marker) {
    return { success: false, error: 'Gemini topology marker returned malformed JSON.' };
  }

  const diagnostics = validateReadingV2AutoTopologyMarker(marker, input.ledger, lineIndex);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: false,
      error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message
        ?? 'Gemini topology marker failed local verification.',
    };
  }

  return {
    success: true,
    data: {
      marker,
      lineIndex,
      prompt,
      diagnostics,
    },
  };
};
