import type { AIStructuredGenerationOptions } from '../ai/ai.service';
import { geminiProvider } from '../ai/gemini.provider';
import type { Result } from '../../types/result.types';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
  parseReadingV2TeacherAnswerKey,
  type ReadingV2ImportCandidate,
} from './readingV2ImportNormalization.service';
import { validateReadingV2Draft } from './readingV2Validation.service';
import {
  buildReadingV2AutoImportPrompt,
  READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION,
} from './readingV2AutoImportPrompt';
import {
  buildReadingV2AutoLedgerPromptSummary,
  buildReadingV2AutoSourceLedger,
  readingV2AutoSourceLedgerEvidence,
  verifyReadingV2AutoPayloadAgainstLedger,
  type ReadingV2AutoLedgerPayload,
  type ReadingV2AutoSourceLedger,
  type ReadingV2AutoSourceVerifierIssue,
} from './readingV2AutoImportSourceLedger.service';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const DEFAULT_MAX_INPUT_CHARS = 120_000;
const DEFAULT_MIN_INPUT_CHARS = 80;
const DEFAULT_CHUNK_WAIT_MS = 6_500;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;
const READING_V2_AUTO_IMPORT_DIAG_PREFIX = '[Diag][ReadingV2AutoImport]';
const ANSWER_KEY_HEADING_PATTERN = /^\s*(?:answers?|answer\s+key|key|solutions?)(?:\s+(?:reading\s+)?test\s+\d+)?\s*:?\s*$/i;
const ANSWER_KEY_HEADING_SIGNAL_PATTERN = /\b(?:answers?|answer\s+key|key|solutions?)\b/i;
const ANSWER_KEY_SECTION_MARKER_PATTERN = /^\s*(?:(?:reading\s+)?passage|section|reading\s+test)\s+\d+\s*:?\s*$/i;
const ANSWER_KEY_ROW_PATTERN = /^\d{1,3}(?:\\?[\).])?\s+.+/;
const ANSWER_KEY_ROW_PREFIX_PATTERN = /^(\d{1,3})(?:\\?[\).])?\s+/;
const ANSWER_KEY_ROW_CAPTURE_PATTERN = /^(\d{1,3})(?:\\?[\).])?\s+(.+)$/;
const ANSWER_KEY_NEGATIVE_LINE_PATTERN =
  /\b(?:choose|complete|write\s+no\s+more|which\s+paragraph|do\s+the\s+following|questions?\s+\d+|reading\s+passage)\b/i;
const ANSWER_KEY_BLANK_PATTERN = /(?:_{3,}|\u2026{1,}|\.{3,}|\[\s*(?:blank|\d+)\s*\])/i;

const logReadingV2AutoImportDiag = (event: string, payload: Record<string, unknown>): void => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${READING_V2_AUTO_IMPORT_DIAG_PREFIX} ${event}`, payload);
};

export type ReadingV2AutoImportDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ReadingV2AutoRepairScope =
  | 'passage'
  | 'question-range'
  | 'task-group'
  | 'answer-key-region'
  | 'structured-layout-block';

export type ReadingV2AutoImportDiagnosticCode =
  | 'answer-key-missing'
  | 'answer-key-extracted'
  | 'answer-key-returned-by-gemini'
  | 'empty-input'
  | 'input-too-large'
  | 'gemini-request-failed'
  | 'malformed-json'
  | 'no-passages-detected'
  | 'no-questions-detected'
  | 'duplicate-question-number'
  | 'question-count-mismatch'
  | 'passage-count-mismatch'
  | 'possible-trimmed-passage'
  | 'guardrail-normalization-failed'
  | 'source-ledger-warning'
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
  | 'source-passage-trim-risk'
  | 'canonical-validation-blocked'
  | 'source-repair-attempted'
  | 'source-repair-failed'
  | 'source-repair-succeeded';

export interface ReadingV2AutoImportDiagnostic {
  readonly code: ReadingV2AutoImportDiagnosticCode;
  readonly severity: ReadingV2AutoImportDiagnosticSeverity;
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly attempt?: number;
  readonly sourceRange?: string;
  readonly verifierIssueCodes?: readonly ReadingV2AutoSourceVerifierIssue['code'][];
  readonly repairScopes?: readonly ReadingV2AutoRepairScope[];
  readonly providerResult?: 'success' | 'failure';
  readonly verifierResult?: 'passed' | 'failed';
}

export interface ReadingV2AutoImportRequest {
  readonly rawTestText: string;
  readonly sourceName?: string;
}

export interface ReadingV2AutoStructuredGenerator {
  generateStructuredJson(
    prompt: string,
    options?: AIStructuredGenerationOptions,
  ): Promise<Result<unknown>>;
}

export interface ReadingV2AutoImportOptions {
  readonly generator?: ReadingV2AutoStructuredGenerator;
  readonly waitBetweenChunksMs?: number;
  readonly maxInputChars?: number;
  readonly minInputChars?: number;
  readonly maxRepairAttempts?: number;
}

export type ReadingV2AutoImportResult =
  | {
      readonly success: true;
      readonly structuredPayloadText: string;
      readonly answerKeyText?: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly provider: 'gemini';
      readonly model: string;
      readonly candidate: ReadingV2ImportCandidate;
      readonly passageCount: number;
      readonly questionCount: number;
    }
  | {
      readonly success: false;
      readonly error: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly provider: 'gemini';
      readonly model?: string;
    };

interface AutoPayload {
  sourceFile?: string;
  answerKeyText?: string;
  materials?: AutoMaterial[];
  diagnostics?: AutoPayloadDiagnostic[];
}

interface AutoPayloadDiagnostic {
  severity?: string;
  code?: string;
  message?: string;
}

interface AutoMaterial {
  passageNumber?: number;
  title?: string;
  passages?: {
    title?: string;
    content?: string;
    contentBlocks?: unknown;
    notes?: unknown;
    media?: unknown;
    images?: unknown;
  }[];
  sectionInstructions?: unknown[];
  questions?: AutoQuestion[];
}

interface AutoQuestion {
  number?: number;
  questionNumber?: number;
  answer?: string | readonly string[];
  [key: string]: unknown;
}

interface SourceChunk {
  readonly passageNumber?: number;
  readonly text: string;
  readonly expectedQuestionNumbers?: readonly number[];
}

interface ChunkPayload {
  readonly chunk: SourceChunk;
  readonly payload: AutoPayload;
}

interface AutoPayloadState {
  readonly answerKeyText?: string;
  readonly payload: AutoPayload;
  readonly verifierIssues: readonly ReadingV2AutoSourceVerifierIssue[];
}

interface AnswerKeyCandidate {
  readonly rows: readonly string[];
  readonly score: number;
  readonly headingScore: number;
  readonly startIndex: number;
}

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const compactWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const normalizeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;

const questionNumberFor = (question: AutoQuestion): number =>
  normalizeNumber(question.questionNumber ?? question.number);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalNumberFrom = (value: unknown): number | undefined => {
  const number = normalizeNumber(value);
  return number > 0 ? number : undefined;
};

const ledgerLabelItemsFrom = (value: unknown): readonly { readonly label: string }[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.flatMap((item) => {
    if (!isObjectRecord(item) || typeof item.label !== 'string' || !item.label.trim()) {
      return [];
    }

    return [{ label: item.label.trim() }];
  });

  return items.length > 0 ? items : undefined;
};

const questionCountFor = (payload: AutoPayload): number =>
  (payload.materials ?? []).reduce((count, material) => count + (material.questions?.length ?? 0), 0);

const passageContentFor = (material: AutoMaterial): string =>
  (material.passages ?? [])
    .map((passage) => passage.content ?? '')
    .join('\n\n')
    .trim();

const normalizeDiagnosticSeverity = (severity: string | undefined): ReadingV2AutoImportDiagnosticSeverity => {
  if (severity === 'error' || severity === 'warning' || severity === 'info') {
    return severity;
  }

  return 'warning';
};

const payloadDiagnostics = (payload: AutoPayload): readonly ReadingV2AutoImportDiagnostic[] =>
  (payload.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.message || diagnostic.code)
    .map((diagnostic) => ({
      code: 'malformed-json',
      severity: normalizeDiagnosticSeverity(diagnostic.severity),
      message: diagnostic.message ?? diagnostic.code ?? 'Gemini reported an import diagnostic.',
    }));

const answerKeyHeadingScore = (line: string): number => {
  if (ANSWER_KEY_HEADING_PATTERN.test(line)) {
    return 35;
  }

  const cleaned = compactWhitespace(line);
  if (
    cleaned.length <= 80
    && ANSWER_KEY_HEADING_SIGNAL_PATTERN.test(cleaned)
    && !ANSWER_KEY_NEGATIVE_LINE_PATTERN.test(cleaned)
    && !/\b(?:must|written|boxes?|sheet)\b/i.test(cleaned)
  ) {
    return 20;
  }

  return 0;
};

const normalizedAnswerKeyRow = (line: string): string | undefined =>
  ANSWER_KEY_ROW_PATTERN.test(line)
    ? line.replace(ANSWER_KEY_ROW_PREFIX_PATTERN, '$1 ')
    : undefined;

const answerTextFromRow = (row: string): string => {
  const match = row.match(ANSWER_KEY_ROW_CAPTURE_PATTERN);
  return match?.[2]?.trim() ?? '';
};

const isLikelyAnswerValue = (answerText: string): boolean => {
  const cleaned = compactWhitespace(answerText.replace(/\([^)]*\bcapitals?\s+optional\b[^)]*\)/i, ''));
  if (!cleaned || cleaned.length > 90 || cleaned.endsWith('?') || ANSWER_KEY_BLANK_PATTERN.test(cleaned)) {
    return false;
  }

  if (/^(?:true|false|yes|no|not\s+given)$/i.test(cleaned)) {
    return true;
  }

  if (/^[A-Z](?:\s*(?:[|,;/]|or)\s*[A-Z])*$/i.test(cleaned)) {
    return true;
  }

  if (/^(?:[ivxlcdm]+)(?:\s*(?:[|,;/]|or)\s*(?:[ivxlcdm]+))*$/i.test(cleaned)) {
    return true;
  }

  if (/^\d{3,4}$/.test(cleaned) || /^[\d.,%/-]+$/.test(cleaned)) {
    return true;
  }

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return wordCount <= 5;
};

const collectAnswerKeyRows = (
  lines: readonly string[],
  startIndex: number,
): readonly string[] => {
  const rows: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';

    if (!line || ANSWER_KEY_SECTION_MARKER_PATTERN.test(line) || answerKeyHeadingScore(line) > 0) {
      continue;
    }

    const row = normalizedAnswerKeyRow(line);
    if (row) {
      rows.push(row);
      continue;
    }

    if (rows.length > 0) {
      break;
    }
  }

  return rows;
};

const scoreAnswerKeyCandidate = (
  rows: readonly string[],
  headingScore: number,
  startIndex: number,
  lineCount: number,
): AnswerKeyCandidate | null => {
  if (rows.length === 0) {
    return null;
  }

  const parsed = parseReadingV2TeacherAnswerKey(rows.join('\n'));
  const validRows = parsed.rows.filter((row) => !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error'));
  const answerLikeCount = validRows.filter((row) => isLikelyAnswerValue(row.rawAnswerText)).length;
  const uniqueQuestionCount = new Set(validRows.map((row) => row.questionNumber)).size;
  const questionNumbers = validRows.map((row) => row.questionNumber);
  const monotonicPairs = questionNumbers.filter((questionNumber, index) =>
    index === 0 || questionNumber >= questionNumbers[index - 1]!,
  ).length;
  const answerLikeRatio = validRows.length > 0 ? answerLikeCount / validRows.length : 0;
  const monotonicRatio = questionNumbers.length > 0 ? monotonicPairs / questionNumbers.length : 0;
  const positionRatio = lineCount > 0 ? startIndex / lineCount : 0;
  const rowScore = Math.min(validRows.length * 5, 45);
  const uniqueScore = Math.min(uniqueQuestionCount * 2, 20);
  const answerLikeScore = answerLikeRatio >= 0.75 ? 20 : Math.round((answerLikeRatio - 0.5) * 30);
  const monotonicScore = monotonicRatio >= 0.9 ? 10 : 0;
  const positionScore = positionRatio >= 0.45 ? 10 : 0;
  const duplicatePenalty = validRows.length - uniqueQuestionCount > 0 ? 25 : 0;
  const errorPenalty = parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 20 : 0;
  const score = headingScore + rowScore + uniqueScore + answerLikeScore + monotonicScore + positionScore
    - duplicatePenalty - errorPenalty;
  const threshold = headingScore > 0 ? 45 : 80;

  return answerLikeRatio >= 0.45 && score >= threshold
    ? { rows, score, headingScore, startIndex }
    : null;
};

const extractAnswerKeyTextFromRaw = (rawText: string): string | undefined => {
  const lines = rawText.split(/\r?\n/);
  const candidates: AnswerKeyCandidate[] = [];
  const earliestUnheadedStart = Math.floor(lines.length * 0.45);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const headingScore = answerKeyHeadingScore(line);
    const row = normalizedAnswerKeyRow(line);
    const canStartWithoutHeading =
      index >= earliestUnheadedStart
      && Boolean(row)
      && !ANSWER_KEY_NEGATIVE_LINE_PATTERN.test(line)
      && isLikelyAnswerValue(answerTextFromRow(row ?? ''));

    if (headingScore === 0 && !canStartWithoutHeading) {
      return;
    }

    const rows = collectAnswerKeyRows(lines, headingScore > 0 ? index + 1 : index);
    const candidate = scoreAnswerKeyCandidate(rows, headingScore, index, lines.length);

    if (candidate) {
      candidates.push(candidate);
    }
  });

  if (candidates.length === 0) {
    return undefined;
  }

  const bestCandidate = candidates.sort((left, right) =>
    right.score - left.score
    || right.headingScore - left.headingScore
    || right.startIndex - left.startIndex,
  )[0];
  const parsed = parseReadingV2TeacherAnswerKey(bestCandidate?.rows.join('\n'));
  return parsed.rows.length > 0 ? parsed.rawText : undefined;
};

const splitSourceIntoChunks = (
  rawText: string,
  sourceLedger?: ReadingV2AutoSourceLedger,
): readonly SourceChunk[] => {
  if (sourceLedger && sourceLedger.passages.length > 1) {
    return sourceLedger.passages.map((passage, index) => {
      const nextPassage = sourceLedger.passages[index + 1];
      const text = sourceLedger.normalizedText.slice(passage.charStart, nextPassage?.charStart ?? sourceLedger.normalizedText.length);
      const expectedQuestionNumbers = sourceLedger.questionRanges
        .filter((range) => range.passageNumber === passage.passageNumber)
        .flatMap((range) => {
          const numbers: number[] = [];
          for (let number = range.start; number <= range.end; number += 1) {
            numbers.push(number);
          }
          return numbers;
        });

      return {
        passageNumber: passage.passageNumber,
        text: text.trim(),
        expectedQuestionNumbers,
      };
    });
  }

  const headingRegex = /^\s*(?:#{0,3}\s*)?READING PASSAGE\s+(\d+)\b.*$/gim;
  const matches = [...rawText.matchAll(headingRegex)];

  if (matches.length <= 1) {
    return [{ passageNumber: matches[0] ? normalizeNumber(matches[0][1]) : undefined, text: rawText.trim() }];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? rawText.length;
    return {
      passageNumber: normalizeNumber(match[1]) || index + 1,
      text: rawText.slice(start, nextStart).trim(),
    };
  });
};

const coercePayload = (data: unknown): AutoPayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as AutoPayload & {
    structuredPayload?: AutoPayload;
    payload?: AutoPayload;
  };

  if (Array.isArray(candidate.materials)) {
    return candidate;
  }

  if (candidate.structuredPayload && Array.isArray(candidate.structuredPayload.materials)) {
    return candidate.structuredPayload;
  }

  if (candidate.payload && Array.isArray(candidate.payload.materials)) {
    return candidate.payload;
  }

  return null;
};

const stripAnswersWhenNoSourceKey = (payload: AutoPayload): AutoPayload => ({
  ...payload,
  answerKeyText: '',
  materials: (payload.materials ?? []).map((material) => ({
    ...material,
    questions: (material.questions ?? []).map((question) => ({
      ...question,
      answer: '',
    })),
  })),
});

const rawTextHasAnswerKeyHeading = (rawText: string): boolean =>
  rawText.split(/\r?\n/).some((line) => answerKeyHeadingScore(line.trim()) > 0);

const answerKeyValuesForQuestion = (answer: AutoQuestion['answer']): readonly string[] => {
  if (Array.isArray(answer)) {
    return answer
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return typeof answer === 'string' && answer.trim()
    ? [answer.trim()]
    : [];
};

const mergedAnswerKeyTextFromPayloads = (
  extractedAnswerKeyText: string | undefined,
  chunkPayloads: readonly ChunkPayload[],
  options: { readonly allowQuestionAnswerFallback: boolean },
): string | undefined => {
  const rows: string[] = [];
  const seen = new Set<string>();
  const addRow = (rawLine: string): void => {
    const line = rawLine.trim();
    if (!line || ANSWER_KEY_SECTION_MARKER_PATTERN.test(line) || answerKeyHeadingScore(line) > 0) {
      return;
    }

    const row = normalizedAnswerKeyRow(line) ?? line;
    const key = compactWhitespace(row).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  };

  [
    extractedAnswerKeyText,
    ...chunkPayloads.map(({ payload }) => payload.answerKeyText),
  ].forEach((source) => {
    source?.split(/\r?\n/).forEach(addRow);
  });

  if (rows.length === 0 && options.allowQuestionAnswerFallback) {
    chunkPayloads.forEach(({ payload }) => {
      (payload.materials ?? []).forEach((material) => {
        (material.questions ?? []).forEach((question) => {
          const questionNumber = questionNumberFor(question);
          const values = answerKeyValuesForQuestion(question.answer);
          if (questionNumber > 0 && values.length > 0) {
            addRow(`${questionNumber} ${values.join(' | ')}`);
          }
        });
      });
    });
  }

  return rows.length > 0 ? rows.join('\n') : undefined;
};

const answerKeyTextForSourceLedger = (
  answerKeyText: string | undefined,
  sourceLedger: ReadingV2AutoSourceLedger,
): string | undefined => {
  if (!answerKeyText || sourceLedger.expectedFullTest || sourceLedger.questionNumbers.length === 0) {
    return answerKeyText;
  }

  const sourceQuestionNumbers = new Set(sourceLedger.questionNumbers);
  const rows = answerKeyText.split(/\r?\n/).filter((rawLine) => {
    const match = rawLine.trim().match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:\\?[\).:\-=])?\s+.+$/i);
    return match?.[1] && sourceQuestionNumbers.has(Number(match[1]));
  });

  return rows.length > 0 ? rows.join('\n') : undefined;
};

const materialPassageNumberForChunk = (
  material: AutoMaterial,
  chunk: SourceChunk,
  materialCountInChunk: number,
  fallbackPassageNumber: number,
): number => {
  if (chunk.passageNumber && materialCountInChunk === 1) {
    return chunk.passageNumber;
  }

  return normalizeNumber(material.passageNumber) || chunk.passageNumber || fallbackPassageNumber;
};

const mergeChunkMaterials = (chunkPayloads: readonly ChunkPayload[]): AutoMaterial[] => {
  const usedPassageNumbers = new Set<number>();
  const materials: AutoMaterial[] = [];

  chunkPayloads.forEach(({ chunk, payload }) => {
    const chunkMaterials = payload.materials ?? [];

    chunkMaterials.forEach((material) => {
      const preferredPassageNumber = materialPassageNumberForChunk(
        material,
        chunk,
        chunkMaterials.length,
        materials.length + 1,
      );
      let passageNumber = preferredPassageNumber;

      while (usedPassageNumbers.has(passageNumber)) {
        passageNumber += 1;
      }

      usedPassageNumbers.add(passageNumber);
      materials.push({
        ...material,
        passageNumber,
      });
    });
  });

  return materials;
};

const ledgerPayloadFromAutoPayload = (payload: AutoPayload): ReadingV2AutoLedgerPayload => ({
  answerKeyText: payload.answerKeyText,
  materials: (payload.materials ?? []).map((material) => ({
    passageNumber: optionalNumberFrom(material.passageNumber),
    passages: (material.passages ?? []).map((passage) => ({ content: passage.content })),
    sectionInstructions: (material.sectionInstructions ?? []).flatMap((instruction) => {
      if (!isObjectRecord(instruction) || !isObjectRecord(instruction.questionRange)) {
        return [];
      }

      const sourceInstructionEvidence = typeof instruction.sourceInstructionEvidence === 'string'
        ? instruction.sourceInstructionEvidence
        : undefined;
      const taskType = typeof instruction.taskType === 'string'
        ? instruction.taskType
        : undefined;
      const wordLimit = optionalNumberFrom(instruction.wordLimit);
      const wordLimitText = typeof instruction.wordLimitText === 'string'
        ? instruction.wordLimitText
        : undefined;
      const vocabulary = typeof instruction.vocabulary === 'string'
        ? instruction.vocabulary
        : undefined;
      const optionReuse = typeof instruction.optionReuse === 'string'
        ? instruction.optionReuse
        : undefined;
      const optionLabelRange = typeof instruction.optionLabelRange === 'string'
        ? instruction.optionLabelRange
        : undefined;
      const referenceLabelRange = typeof instruction.referenceLabelRange === 'string'
        ? instruction.referenceLabelRange
        : undefined;
      const sectionReferences = ledgerLabelItemsFrom(instruction.sectionReferences);
      const labeledOptions = ledgerLabelItemsFrom(instruction.labeledOptions);

      return [{
        questionRange: {
          start: optionalNumberFrom(instruction.questionRange.start),
          end: optionalNumberFrom(instruction.questionRange.end),
        },
        ...(sourceInstructionEvidence ? { sourceInstructionEvidence } : {}),
        ...(taskType ? { taskType } : {}),
        ...(wordLimit ? { wordLimit } : {}),
        ...(wordLimitText ? { wordLimitText } : {}),
        ...(vocabulary ? { vocabulary } : {}),
        ...(optionReuse ? { optionReuse } : {}),
        ...(optionLabelRange ? { optionLabelRange } : {}),
        ...(referenceLabelRange ? { referenceLabelRange } : {}),
        ...(sectionReferences ? { sectionReferences } : {}),
        ...(labeledOptions ? { labeledOptions } : {}),
      }];
    }),
    questions: (material.questions ?? []).map((question) => ({
      number: optionalNumberFrom(question.number),
      questionNumber: optionalNumberFrom(question.questionNumber),
    })),
  })),
});

const buildAutoPayloadState = (
  request: ReadingV2AutoImportRequest,
  extractedAnswerKeyText: string | undefined,
  sourceLedger: ReadingV2AutoSourceLedger,
  chunkPayloads: readonly ChunkPayload[],
): AutoPayloadState => {
  const mergedAnswerKeyText = mergedAnswerKeyTextFromPayloads(extractedAnswerKeyText, chunkPayloads, {
    allowQuestionAnswerFallback: !extractedAnswerKeyText && rawTextHasAnswerKeyHeading(sourceLedger.normalizedText),
  });
  const answerKeyText = answerKeyTextForSourceLedger(mergedAnswerKeyText, sourceLedger);
  const mergedPayload: AutoPayload = {
    sourceFile: request.sourceName ?? 'auto-gemini-reading-v2.txt',
    answerKeyText: answerKeyText ?? '',
    materials: mergeChunkMaterials(chunkPayloads),
    diagnostics: chunkPayloads.flatMap(({ payload }) => payload.diagnostics ?? []),
  };
  const payload = answerKeyText ? mergedPayload : stripAnswersWhenNoSourceKey(mergedPayload);

  return {
    answerKeyText,
    payload,
    verifierIssues: verifyReadingV2AutoPayloadAgainstLedger(ledgerPayloadFromAutoPayload(payload), sourceLedger),
  };
};

const structuredPayloadText = (payload: AutoPayload): string =>
  [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: payload.sourceFile ?? 'auto-gemini-reading-v2.txt',
      ...(payload.answerKeyText?.trim() ? { answerKeyText: payload.answerKeyText } : {}),
      materials: payload.materials ?? [],
      diagnostics: payload.diagnostics ?? [],
    }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n');

const duplicateQuestionDiagnostics = (payload: AutoPayload): readonly ReadingV2AutoImportDiagnostic[] => {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  (payload.materials ?? []).forEach((material) => {
    (material.questions ?? []).forEach((question) => {
      const questionNumber = questionNumberFor(question);
      if (!questionNumber) {
        return;
      }
      if (seen.has(questionNumber)) {
        duplicates.add(questionNumber);
      }
      seen.add(questionNumber);
    });
  });

  return Array.from(duplicates).map((questionNumber) => ({
    code: 'duplicate-question-number',
    severity: 'error',
    message: `Question ${questionNumber} appears more than once in Gemini output.`,
    questionNumber,
  }));
};

const possibleTrimDiagnostics = (
  payload: AutoPayload,
  chunks: readonly SourceChunk[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  (payload.materials ?? []).flatMap((material, index) => {
    const generatedContent = compactWhitespace(passageContentFor(material));
    const sourcePassageText = (chunks[index]?.text ?? '').split(/\n\s*(?:Questions?\s+\d+|Answers?|Answer\s+Key)\b/i)[0] ?? '';
    const sourceText = compactWhitespace(sourcePassageText);

    if (!sourceText || !generatedContent || sourceText.length < 500) {
      return [];
    }

    return generatedContent.length < sourceText.length * 0.25
      ? [{
          code: 'possible-trimmed-passage' as const,
          severity: 'error' as const,
          message: `Passage ${material.passageNumber ?? index + 1} looks too short compared with the raw source.`,
          passageNumber: material.passageNumber ?? index + 1,
        }]
      : [];
  });

const ledgerIssueDiagnostics = (
  sourceLedger: ReadingV2AutoSourceLedger,
): readonly ReadingV2AutoImportDiagnostic[] =>
  sourceLedger.issues.map((issue) => {
    const code: ReadingV2AutoImportDiagnosticCode =
      issue.code === 'source-empty'
        ? 'empty-input'
        : issue.code === 'source-passage-boundary-missing'
          ? 'no-passages-detected'
          : issue.code === 'source-question-range-missing'
            ? 'source-question-range-missing'
            : issue.code === 'source-question-coverage-gap'
              ? 'source-question-missing'
              : issue.code === 'source-answer-key-missing'
                ? 'answer-key-missing'
                : 'source-ledger-warning';

    return {
      code,
      severity: issue.severity,
      message: issue.message,
    };
  });

const verifierIssueDiagnostics = (
  issues: readonly ReadingV2AutoSourceVerifierIssue[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    passageNumber: issue.passageNumber,
    questionNumber: issue.questionNumber,
  }));

const retryableVerifierIssueCodes = new Set<ReadingV2AutoSourceVerifierIssue['code']>([
  'source-passage-missing',
  'source-question-missing',
  'source-answer-row-unbound',
  'source-question-range-missing',
  'source-reference-bank-missing',
  'source-reference-bank-mismatch',
  'source-instruction-task-type-mismatch',
  'source-instruction-word-limit-mismatch',
  'source-instruction-vocabulary-mismatch',
  'source-instruction-reuse-mismatch',
  'source-passage-trim-risk',
]);

const chunkIndexForPassageNumber = (
  passageNumber: number | undefined,
  chunks: readonly SourceChunk[],
): number | undefined => {
  if (!passageNumber) {
    return undefined;
  }

  const index = chunks.findIndex((chunk) => chunk.passageNumber === passageNumber);
  return index >= 0 ? index : undefined;
};

const chunkIndexForQuestionNumber = (
  questionNumber: number | undefined,
  chunks: readonly SourceChunk[],
): number | undefined => {
  if (!questionNumber) {
    return undefined;
  }

  const index = chunks.findIndex((chunk) => chunk.expectedQuestionNumbers?.includes(questionNumber));
  return index >= 0 ? index : undefined;
};

const retryChunkIndexesForVerifierIssues = (
  issues: readonly ReadingV2AutoSourceVerifierIssue[],
  chunks: readonly SourceChunk[],
  payload: AutoPayload,
): readonly number[] => {
  const indexes = new Set<number>();
  const generatedQuestionNumbers = new Set<number>();

  (payload.materials ?? []).forEach((material) => {
    (material.questions ?? []).forEach((question) => {
      const questionNumber = questionNumberFor(question);
      if (questionNumber > 0) {
        generatedQuestionNumbers.add(questionNumber);
      }
    });
  });

  issues
    .filter((issue) => issue.severity === 'error' && retryableVerifierIssueCodes.has(issue.code))
    .forEach((issue) => {
      const index =
        chunkIndexForPassageNumber(issue.passageNumber, chunks)
        ?? chunkIndexForQuestionNumber(issue.questionNumber, chunks)
        ?? (chunks.length === 1 ? 0 : undefined);

      if (index !== undefined) {
        indexes.add(index);
      }

      if (
        issue.code === 'source-question-missing'
        || issue.code === 'source-answer-row-unbound'
        || issue.code === 'source-question-range-missing'
      ) {
        chunks.forEach((chunk, chunkIndex) => {
          if (chunk.expectedQuestionNumbers?.some((questionNumber) => !generatedQuestionNumbers.has(questionNumber))) {
            indexes.add(chunkIndex);
          }
        });
      }
    });

  return [...indexes].sort((left, right) => left - right);
};

const verifierIssueSourceRange = (issue: ReadingV2AutoSourceVerifierIssue): string => {
  if (issue.questionNumber) {
    return `Q${issue.questionNumber}`;
  }

  if (issue.passageNumber) {
    return `P${issue.passageNumber}`;
  }

  return 'source';
};

const repairScopeForVerifierIssue = (issue: ReadingV2AutoSourceVerifierIssue): ReadingV2AutoRepairScope => {
  switch (issue.code) {
    case 'source-passage-missing':
    case 'source-passage-extra':
    case 'source-passage-trim-risk':
      return 'passage';
    case 'source-answer-row-unbound':
      return 'answer-key-region';
    case 'source-question-missing':
    case 'source-question-extra':
    case 'source-question-range-missing':
      return 'question-range';
    case 'source-reference-bank-missing':
    case 'source-reference-bank-mismatch':
    case 'source-instruction-task-type-mismatch':
    case 'source-instruction-word-limit-mismatch':
    case 'source-instruction-vocabulary-mismatch':
    case 'source-instruction-reuse-mismatch':
      return 'task-group';
  }
};

const verifierIssueSummary = (
  issues: readonly ReadingV2AutoSourceVerifierIssue[],
): {
  readonly sourceRange: string;
  readonly verifierIssueCodes: readonly ReadingV2AutoSourceVerifierIssue['code'][];
  readonly repairScopes: readonly ReadingV2AutoRepairScope[];
} => ({
  sourceRange: [...new Set(issues.map(verifierIssueSourceRange))].join(', '),
  verifierIssueCodes: [...new Set(issues.map((issue) => issue.code))],
  repairScopes: [...new Set(issues.map(repairScopeForVerifierIssue))],
});

const generatedDraftEvidence = (payload: AutoPayload): readonly string[] => {
  const materialCount = payload.materials?.length ?? 0;
  const taskGroupCount = (payload.materials ?? []).reduce(
    (count, material) => count + (material.sectionInstructions?.length ?? 0),
    0,
  );

  return [
    `Generated draft passages: ${materialCount}`,
    `Generated draft task groups: ${taskGroupCount}`,
    `Generated draft questions: ${questionCountFor(payload)}`,
  ];
};

const validatePayload = (
  payload: AutoPayload,
  chunks: readonly SourceChunk[],
  sourceLedger: ReadingV2AutoSourceLedger,
  verifierIssues: readonly ReadingV2AutoSourceVerifierIssue[] = verifyReadingV2AutoPayloadAgainstLedger(
    ledgerPayloadFromAutoPayload(payload),
    sourceLedger,
  ),
): readonly ReadingV2AutoImportDiagnostic[] => {
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    ...ledgerIssueDiagnostics(sourceLedger),
    ...payloadDiagnostics(payload),
  ];
  const materialCount = payload.materials?.length ?? 0;
  const questionCount = questionCountFor(payload);

  if (materialCount === 0) {
    diagnostics.push({
      code: 'no-passages-detected',
      severity: 'error',
      message: 'Gemini did not return any Reading V2 passages.',
    });
  }

  if (questionCount === 0) {
    diagnostics.push({
      code: 'no-questions-detected',
      severity: 'error',
      message: 'Gemini did not return any Reading V2 questions.',
    });
  }

  if (chunks.length > 1 && materialCount !== chunks.length) {
    diagnostics.push({
      code: 'passage-count-mismatch',
      severity: 'error',
      message: `Expected ${chunks.length} passage chunks but Gemini returned ${materialCount}.`,
    });
  }

  diagnostics.push(...duplicateQuestionDiagnostics(payload));
  diagnostics.push(...possibleTrimDiagnostics(payload, chunks));
  diagnostics.push(...verifierIssueDiagnostics(verifierIssues));

  return diagnostics;
};

const callGeminiForChunk = async (
  generator: ReadingV2AutoStructuredGenerator,
  chunk: SourceChunk,
  request: ReadingV2AutoImportRequest,
  answerKeyText: string | undefined,
  sourceLedger: ReadingV2AutoSourceLedger,
): Promise<Result<AutoPayload>> => {
  const prompt = buildReadingV2AutoImportPrompt({
    rawTestText: chunk.text,
    sourceName: request.sourceName,
    passageNumber: chunk.passageNumber,
    answerKeyText,
    sourceLedgerSummary: buildReadingV2AutoLedgerPromptSummary(sourceLedger, chunk.passageNumber),
  });
  logReadingV2AutoImportDiag('gemini_chunk_requested', {
    passageNumber: chunk.passageNumber,
    sourceLength: chunk.text.length,
    answerKeyDetected: Boolean(answerKeyText),
    expectedQuestionNumbers: chunk.expectedQuestionNumbers ?? [],
  });
  const result = await generator.generateStructuredJson(prompt, {
    systemInstruction: READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION,
    temperature: 0,
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  });

  if (!result.success) {
    logReadingV2AutoImportDiag('gemini_chunk_failed', {
      passageNumber: chunk.passageNumber,
      error: result.error ?? 'Gemini structured generation failed.',
    });
    return {
      success: false,
      error: result.error ?? 'Gemini structured generation failed.',
    };
  }

  const payload = coercePayload(result.data);
  if (!payload) {
    logReadingV2AutoImportDiag('gemini_chunk_malformed_json', {
      passageNumber: chunk.passageNumber,
    });
    return {
      success: false,
      error: 'Gemini returned malformed Reading V2 JSON.',
    };
  }

  logReadingV2AutoImportDiag('gemini_chunk_succeeded', {
    passageNumber: chunk.passageNumber,
    materialCount: payload.materials?.length ?? 0,
    questionCount: questionCountFor(payload),
  });
  return { success: true, data: payload };
};

const repairPayloadAgainstLedger = async (
  generator: ReadingV2AutoStructuredGenerator,
  request: ReadingV2AutoImportRequest,
  extractedAnswerKeyText: string | undefined,
  sourceLedger: ReadingV2AutoSourceLedger,
  chunks: readonly SourceChunk[],
  initialChunkPayloads: readonly ChunkPayload[],
  options: {
    readonly maxRepairAttempts: number;
    readonly waitBetweenChunksMs: number;
  },
): Promise<AutoPayloadState & { readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[] }> => {
  const chunkPayloads = [...initialChunkPayloads];
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [];
  let state = buildAutoPayloadState(request, extractedAnswerKeyText, sourceLedger, chunkPayloads);
  let attemptedRepair = false;

  for (let attempt = 1; attempt <= options.maxRepairAttempts; attempt += 1) {
    const blockingIssues = state.verifierIssues.filter((issue) =>
      issue.severity === 'error' && retryableVerifierIssueCodes.has(issue.code),
    );
    const issueSummary = verifierIssueSummary(blockingIssues);

    if (blockingIssues.length === 0) {
      return { ...state, diagnostics };
    }

    const retryIndexes = retryChunkIndexesForVerifierIssues(blockingIssues, chunks, state.payload);
    if (retryIndexes.length === 0) {
      diagnostics.push({
        code: 'source-repair-failed',
        severity: 'warning',
        message: 'Source ledger requested repair, but no specific source chunk could be selected for retry.',
        attempt,
        sourceRange: issueSummary.sourceRange,
        verifierIssueCodes: issueSummary.verifierIssueCodes,
        repairScopes: issueSummary.repairScopes,
        verifierResult: 'failed',
      });
      return { ...state, diagnostics };
    }

    attemptedRepair = true;
    diagnostics.push({
      code: 'source-repair-attempted',
      severity: 'info',
      message: `Retrying source chunks ${retryIndexes.map((index) => chunks[index]?.passageNumber ?? index + 1).join(', ')} after ledger verification failed.`,
      attempt,
      sourceRange: issueSummary.sourceRange,
      verifierIssueCodes: issueSummary.verifierIssueCodes,
      repairScopes: issueSummary.repairScopes,
    });

    for (const [retryOrder, chunkIndex] of retryIndexes.entries()) {
      const chunk = chunks[chunkIndex];
      if (!chunk) {
        continue;
      }

      if (retryOrder > 0) {
        await wait(options.waitBetweenChunksMs);
      }

      const chunkResult = await callGeminiForChunk(generator, chunk, request, extractedAnswerKeyText, sourceLedger);
      if (!chunkResult.success) {
        diagnostics.push({
          code: 'source-repair-failed',
          severity: 'warning',
          message: chunkResult.error ?? 'Gemini repair retry failed for a source chunk.',
          passageNumber: chunk.passageNumber,
          attempt,
          sourceRange: chunk.passageNumber ? `P${chunk.passageNumber}` : issueSummary.sourceRange,
          verifierIssueCodes: issueSummary.verifierIssueCodes,
          repairScopes: issueSummary.repairScopes,
          providerResult: 'failure',
        });
        continue;
      }

      chunkPayloads[chunkIndex] = { chunk, payload: chunkResult.data };
    }

    state = buildAutoPayloadState(request, extractedAnswerKeyText, sourceLedger, chunkPayloads);
    if (!state.verifierIssues.some((issue) => issue.severity === 'error' && retryableVerifierIssueCodes.has(issue.code))) {
      diagnostics.push({
        code: 'source-repair-succeeded',
        severity: 'info',
        message: 'Source ledger repair retry resolved the missing/trimmed source coverage.',
        attempt,
        sourceRange: issueSummary.sourceRange,
        verifierIssueCodes: issueSummary.verifierIssueCodes,
        repairScopes: issueSummary.repairScopes,
        providerResult: 'success',
        verifierResult: 'passed',
      });
      return { ...state, diagnostics };
    }
  }

  if (attemptedRepair) {
    diagnostics.push({
      code: 'source-repair-failed',
      severity: 'warning',
      message: 'Source ledger repair retry did not resolve the source coverage mismatch.',
      attempt: options.maxRepairAttempts,
      sourceRange: verifierIssueSummary(state.verifierIssues).sourceRange,
      verifierIssueCodes: verifierIssueSummary(state.verifierIssues).verifierIssueCodes,
      repairScopes: verifierIssueSummary(state.verifierIssues).repairScopes,
      verifierResult: 'failed',
    });
  }

  return { ...state, diagnostics };
};

export const generateReadingV2AutoImportCandidate = async (
  request: ReadingV2AutoImportRequest,
  options: ReadingV2AutoImportOptions = {},
): Promise<ReadingV2AutoImportResult> => {
  const rawTestText = request.rawTestText.trim();
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const minInputChars = options.minInputChars ?? DEFAULT_MIN_INPUT_CHARS;
  const waitBetweenChunksMs = options.waitBetweenChunksMs ?? DEFAULT_CHUNK_WAIT_MS;
  const maxRepairAttempts = Number.isFinite(options.maxRepairAttempts)
    ? Math.max(0, Math.floor(options.maxRepairAttempts ?? 0))
    : DEFAULT_MAX_REPAIR_ATTEMPTS;
  const generator = options.generator ?? geminiProvider;

  if (rawTestText.length < minInputChars) {
    return {
      success: false,
      error: 'Paste more Reading test text before using Auto.',
      diagnostics: [{
        code: rawTestText.length === 0 ? 'empty-input' : 'no-passages-detected',
        severity: 'error',
        message: 'Auto requires raw passage and question text.',
      }],
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  if (rawTestText.length > maxInputChars) {
    return {
      success: false,
      error: `Auto input is too large (${rawTestText.length} characters).`,
      diagnostics: [{
        code: 'input-too-large',
        severity: 'error',
        message: `Input exceeds the ${maxInputChars} character limit for one Auto import.`,
      }],
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  const sourceLedger = buildReadingV2AutoSourceLedger({
    rawText: rawTestText,
    sourceName: request.sourceName,
  });
  const sourceLedgerDiagnostics = ledgerIssueDiagnostics(sourceLedger);
  const fatalSourceDiagnostic = sourceLedgerDiagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (fatalSourceDiagnostic) {
    return {
      success: false,
      error: fatalSourceDiagnostic.message,
      diagnostics: sourceLedgerDiagnostics,
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  const extractedAnswerKeyText = extractAnswerKeyTextFromRaw(sourceLedger.normalizedText);
  const chunks = splitSourceIntoChunks(sourceLedger.normalizedText, sourceLedger);
  const chunkPayloads: ChunkPayload[] = [];
  logReadingV2AutoImportDiag('preflight_complete', {
    sourceLength: rawTestText.length,
    chunkCount: chunks.length,
    answerKeyDetected: Boolean(extractedAnswerKeyText),
    sourceLedgerCategory: sourceLedger.category,
    sourceLedgerPassageCount: sourceLedger.passages.length,
    sourceLedgerQuestionCount: sourceLedger.questionNumbers.length,
    sourceLedgerAnswerKeyRowCount: sourceLedger.answerKeyRows.length,
    sourceName: request.sourceName ?? null,
  });

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) {
      await wait(waitBetweenChunksMs);
    }

    const chunkResult = await callGeminiForChunk(generator, chunk, request, extractedAnswerKeyText, sourceLedger);
    if (!chunkResult.success) {
      return {
        success: false,
        error: chunkResult.error ?? 'Gemini failed to process the Reading V2 source.',
        diagnostics: [{
          code: chunkResult.error?.includes('malformed')
            ? 'malformed-json'
            : 'gemini-request-failed',
          severity: 'error',
          message: chunkResult.error ?? 'Gemini failed to process the Reading V2 source.',
          passageNumber: chunk.passageNumber,
        }],
        provider: 'gemini',
        model: GEMINI_MODEL_NAME,
      };
    }

    chunkPayloads.push({ chunk, payload: chunkResult.data });
  }

  const repaired = await repairPayloadAgainstLedger(generator, request, extractedAnswerKeyText, sourceLedger, chunks, chunkPayloads, {
    maxRepairAttempts,
    waitBetweenChunksMs,
  });
  const { answerKeyText, payload } = repaired;
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    ...(extractedAnswerKeyText
      ? [{
          code: 'answer-key-extracted' as const,
          severity: 'info' as const,
          message: 'Auto extracted answer-key rows from the raw source.',
        }]
      : answerKeyText
        ? [{
            code: 'answer-key-returned-by-gemini' as const,
            severity: 'info' as const,
            message: 'Gemini returned copied answer-key rows from the raw source.',
          }]
      : [{
          code: 'answer-key-missing' as const,
          severity: 'warning' as const,
          message: 'No source answer-key section was detected. Answers stay empty for Studio review.',
        }]),
    ...repaired.diagnostics,
    ...validatePayload(payload, chunks, sourceLedger, repaired.verifierIssues),
  ];

  const blocking = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  logReadingV2AutoImportDiag('guardrail_result', {
    blocking,
    diagnosticCount: diagnostics.length,
    diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    passageCount: payload.materials?.length ?? 0,
    questionCount: questionCountFor(payload),
  });
  if (blocking) {
    return {
      success: false,
      error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ?? 'Auto import failed guardrails.',
      diagnostics,
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  const text = structuredPayloadText(payload);
  const candidate = createReadingV2ImportCandidateFromText({
    text,
    answerKeyText,
    sourceKind: 'auto-gemini',
    fileName: request.sourceName ?? 'Auto Gemini import',
  });
  const candidateWithLedger: ReadingV2ImportCandidate = {
    ...candidate,
    autoImportDiagnostics: diagnostics,
    evidence: [
      ...candidate.evidence,
      ...readingV2AutoSourceLedgerEvidence(sourceLedger),
      ...generatedDraftEvidence(payload),
    ],
    uncertaintyMarkers: [
      ...candidate.uncertaintyMarkers,
      ...sourceLedger.issues
        .filter((issue) => issue.severity !== 'info')
        .map((issue) => `Source ledger: ${issue.message}`),
    ],
  };
  let candidateForStudio = candidateWithLedger;
  const canonicalValidationDiagnostics: ReadingV2AutoImportDiagnostic[] = [];

  try {
    const normalized = normalizeReadingV2ImportCandidate(candidateWithLedger);
    const validation = validateReadingV2Draft(normalized.document);
    const canonicalBlockers = validation.blockingIssues.map((issue) =>
      `Draft validation: ${issue.message}`,
    );

    if (canonicalBlockers.length > 0) {
      candidateForStudio = {
        ...candidateWithLedger,
        publishBlockingPlaceholders: [
          ...candidateWithLedger.publishBlockingPlaceholders,
          ...canonicalBlockers,
        ].filter((message, index, messages) => messages.indexOf(message) === index),
      };
      canonicalValidationDiagnostics.push(...validation.blockingIssues.map((issue) => ({
        code: 'canonical-validation-blocked' as const,
        severity: 'warning' as const,
        message: `Draft validation remains publish-blocking in Studio: ${issue.message}`,
      })));
      candidateForStudio = {
        ...candidateForStudio,
        autoImportDiagnostics: [
          ...diagnostics,
          ...canonicalValidationDiagnostics,
        ],
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Auto import could not normalize into Reading V2.',
      diagnostics: [
        ...diagnostics,
        {
          code: 'guardrail-normalization-failed',
          severity: 'error',
          message: 'Gemini output could not normalize into the Reading V2 draft model.',
        },
      ],
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  return {
    success: true,
    structuredPayloadText: text,
    answerKeyText,
    diagnostics: [
      ...diagnostics,
      ...canonicalValidationDiagnostics,
    ],
    provider: 'gemini',
    model: GEMINI_MODEL_NAME,
    candidate: candidateForStudio,
    passageCount: payload.materials?.length ?? 0,
    questionCount: questionCountFor(payload),
  };
};
