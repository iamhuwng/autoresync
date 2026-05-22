import type { ReadingV2AutoSourceLedger } from './readingV2AutoImportSourceLedger.service';
import {
  type ReadingV2AutoLineIndex,
  type ReadingV2AutoLineIndexLine,
  type ReadingV2AutoLineSpan,
  type ReadingV2AutoQuestionRange,
  type ReadingV2AutoTopologyAnswerKeyRow,
  type ReadingV2AutoTopologyGroupHint,
  type ReadingV2AutoTopologyMarker,
  type ReadingV2AutoTopologyPackageMarker,
} from './readingV2AutoTopologyMarker.service';

export type ReadingV2AutoPassagePackageDiagnosticCode =
  | 'passage-package-missing-source-lines'
  | 'passage-package-question-area-empty'
  | 'passage-package-passage-body-leaked-to-groq';

export interface ReadingV2AutoPassagePackageDiagnostic {
  readonly code: ReadingV2AutoPassagePackageDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
}

export interface ReadingV2AutoPassagePackageLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly trimmedTextHash: string;
}

export interface ReadingV2AutoPassagePackage {
  readonly passageNumber: number;
  readonly passageTitle: string;
  readonly expectedQuestionRange: ReadingV2AutoQuestionRange;
  readonly passageBodyLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly questionAreaLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly referenceBankLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly passageBodyText: string;
  readonly questionAreaText: string;
  readonly groupHints: readonly ReadingV2AutoTopologyGroupHint[];
  readonly referenceBankLineSpans: readonly ReadingV2AutoLineSpan[];
  readonly excludedLineSpans: readonly ReadingV2AutoLineSpan[];
  readonly answerKeyRows: readonly ReadingV2AutoTopologyAnswerKeyRow[];
  readonly sourceHash: string;
  readonly groqInputText: string;
  readonly diagnostics: readonly ReadingV2AutoPassagePackageDiagnostic[];
}

const linesInSpan = (
  lineIndex: ReadingV2AutoLineIndex,
  span: ReadingV2AutoLineSpan,
): readonly ReadingV2AutoLineIndexLine[] =>
  lineIndex.lines.filter((line) => line.lineNumber >= span.startLine && line.lineNumber <= span.endLine);

const packageLinesFrom = (
  lineIndex: ReadingV2AutoLineIndex,
  span: ReadingV2AutoLineSpan,
): readonly ReadingV2AutoPassagePackageLine[] =>
  linesInSpan(lineIndex, span).map((line) => ({
    lineNumber: line.lineNumber,
    text: line.text,
    trimmedTextHash: line.trimmedTextHash,
  }));

const textFromLines = (lines: readonly ReadingV2AutoPassagePackageLine[]): string =>
  lines.map((line) => line.text).join('\n').trim();

const rangeContains = (range: ReadingV2AutoQuestionRange, questionNumber: number): boolean =>
  questionNumber >= range.start && questionNumber <= range.end;

const titleFrom = (
  marker: ReadingV2AutoTopologyPackageMarker,
  lineIndex: ReadingV2AutoLineIndex,
  ledger: ReadingV2AutoSourceLedger,
): string => {
  const titleSpan = marker.passageTitleLines;
  const titleLines = titleSpan ? linesInSpan(lineIndex, titleSpan).map((line) => line.text.trim()).filter(Boolean) : [];
  const explicitTitle = titleLines
    .map((line) => line.replace(/^#{1,6}\s*/, '').replace(/^READING\s+PASSAGE\s+\d+\s*:?\s*/i, '').trim())
    .find((line) => Boolean(line));
  const ledgerTitle = ledger.passages.find((passage) => passage.passageNumber === marker.passageNumber)?.title;

  return explicitTitle || ledgerTitle || `Reading Passage ${marker.passageNumber}`;
};

const redactAnswerRow = (row: ReadingV2AutoTopologyAnswerKeyRow): string =>
  `Q${row.questionNumber} answerLength=${row.answer.length} sourceLine=${row.sourceLine}`;

const lineBlockForGroq = (lines: readonly ReadingV2AutoPassagePackageLine[]): string =>
  lines
    .map((line) => `${String(line.lineNumber).padStart(4, '0')} [${line.trimmedTextHash}] ${line.text}`)
    .join('\n');

const uniqueLines = (
  lines: readonly ReadingV2AutoPassagePackageLine[],
): readonly ReadingV2AutoPassagePackageLine[] => {
  const byLineNumber = new Map<number, ReadingV2AutoPassagePackageLine>();
  lines.forEach((line) => {
    byLineNumber.set(line.lineNumber, line);
  });
  return [...byLineNumber.values()].sort((left, right) => left.lineNumber - right.lineNumber);
};

const BANK_LINE_PATTERN = /^([A-Z]|\d+|[ivxlcdm]+)(?:[.)])?(?:\s+(.*))?$/i;

const isBankLine = (line: ReadingV2AutoPassagePackageLine): boolean =>
  BANK_LINE_PATTERN.test(line.text.trim());

const referenceBankLinesFromPassageBody = (
  passageBodyLines: readonly ReadingV2AutoPassagePackageLine[],
): readonly ReadingV2AutoPassagePackageLine[] =>
  uniqueLines(passageBodyLines.filter(isBankLine));

const referenceBankLinesFrom = (
  lineIndex: ReadingV2AutoLineIndex,
  marker: ReadingV2AutoTopologyPackageMarker,
  passageBodyLines: readonly ReadingV2AutoPassagePackageLine[],
): readonly ReadingV2AutoPassagePackageLine[] => {
  const spans = [
    ...marker.referenceBankLineSpans,
    ...marker.groups.flatMap((group) => group.referenceBankLines ?? []),
  ];
  const referenceLines = uniqueLines(spans.flatMap((span) => packageLinesFrom(lineIndex, span)));

  return referenceLines.length > 0
    ? referenceLines
    : referenceBankLinesFromPassageBody(passageBodyLines);
};

const buildGroqInputText = (input: {
  readonly packageMarker: ReadingV2AutoTopologyPackageMarker;
  readonly questionAreaLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly referenceBankLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly answerKeyRows: readonly ReadingV2AutoTopologyAnswerKeyRow[];
  readonly sourceHash: string;
}): string => [
  `READING_V2_AUTO_V3_PASSAGE_PACKAGE ${input.packageMarker.passageNumber}`,
  `sourceHash: ${input.sourceHash}`,
  `expectedQuestionRange: ${input.packageMarker.expectedQuestionRange.start}-${input.packageMarker.expectedQuestionRange.end}`,
  `groupHints: ${JSON.stringify(input.packageMarker.groups)}`,
  `referenceBankLineSpans: ${JSON.stringify(input.packageMarker.referenceBankLineSpans)}`,
  `answerRows: ${input.answerKeyRows.map(redactAnswerRow).join('; ') || 'none'}`,
  '',
  'REFERENCE_BANK_LINES_ONLY:',
  input.referenceBankLines.length > 0 ? lineBlockForGroq(input.referenceBankLines) : 'none',
  '',
  'QUESTION_AREA_LINES_ONLY:',
  lineBlockForGroq(input.questionAreaLines),
].join('\n');

export const buildReadingV2AutoPassagePackage = (input: {
  readonly marker: ReadingV2AutoTopologyPackageMarker;
  readonly lineIndex: ReadingV2AutoLineIndex;
  readonly ledger: ReadingV2AutoSourceLedger;
  readonly answerKeyRows: readonly ReadingV2AutoTopologyAnswerKeyRow[];
}): ReadingV2AutoPassagePackage => {
  const passageBodyLines = packageLinesFrom(input.lineIndex, input.marker.passageBodyLines);
  const questionAreaLines = packageLinesFrom(input.lineIndex, input.marker.questionAreaLines);
  const referenceBankLines = referenceBankLinesFrom(input.lineIndex, input.marker, passageBodyLines);
  const passageBodyText = textFromLines(passageBodyLines);
  const questionAreaText = textFromLines(questionAreaLines);
  const answerKeyRows = input.answerKeyRows.filter((row) =>
    rangeContains(input.marker.expectedQuestionRange, row.questionNumber),
  );
  const groqInputText = buildGroqInputText({
    packageMarker: input.marker,
    questionAreaLines,
    referenceBankLines,
    answerKeyRows,
    sourceHash: input.lineIndex.sourceHash,
  });
  const diagnostics: ReadingV2AutoPassagePackageDiagnostic[] = [];

  if (passageBodyLines.length === 0) {
    diagnostics.push({
      code: 'passage-package-missing-source-lines',
      severity: 'error',
      message: `Passage ${input.marker.passageNumber} body lines could not be reconstructed from the local source.`,
      passageNumber: input.marker.passageNumber,
    });
  }

  if (questionAreaLines.length === 0 || !questionAreaText) {
    diagnostics.push({
      code: 'passage-package-question-area-empty',
      severity: 'error',
      message: `Passage ${input.marker.passageNumber} question area is empty.`,
      passageNumber: input.marker.passageNumber,
    });
  }

  if (passageBodyText && groqInputText.includes(passageBodyText)) {
    diagnostics.push({
      code: 'passage-package-passage-body-leaked-to-groq',
      severity: 'error',
      message: `Passage ${input.marker.passageNumber} Groq input contains passage body text.`,
      passageNumber: input.marker.passageNumber,
    });
  }

  return {
    passageNumber: input.marker.passageNumber,
    passageTitle: titleFrom(input.marker, input.lineIndex, input.ledger),
    expectedQuestionRange: input.marker.expectedQuestionRange,
    passageBodyLines,
    questionAreaLines,
    referenceBankLines,
    passageBodyText,
    questionAreaText,
    groupHints: input.marker.groups,
    referenceBankLineSpans: input.marker.referenceBankLineSpans,
    excludedLineSpans: input.marker.excludedLineSpans,
    answerKeyRows,
    sourceHash: input.lineIndex.sourceHash,
    groqInputText,
    diagnostics,
  };
};

export const buildReadingV2AutoPassagePackages = (input: {
  readonly marker: ReadingV2AutoTopologyMarker;
  readonly lineIndex: ReadingV2AutoLineIndex;
  readonly ledger: ReadingV2AutoSourceLedger;
}): readonly ReadingV2AutoPassagePackage[] =>
  input.marker.packages
    .slice()
    .sort((left, right) => left.passageNumber - right.passageNumber)
    .map((packageMarker) =>
      buildReadingV2AutoPassagePackage({
        marker: packageMarker,
        lineIndex: input.lineIndex,
        ledger: input.ledger,
        answerKeyRows: input.marker.answerKeyRows,
      }),
    );
