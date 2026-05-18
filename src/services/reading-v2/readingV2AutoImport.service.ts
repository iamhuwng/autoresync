import type { AIStructuredGenerationOptions } from '../ai/ai.service';
import { geminiProvider } from '../ai/gemini.provider';
import { groqProvider } from '../ai/groq.provider';
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
  normalizeReadingV2TaskType,
  type ReadingV2CanonicalTaskType,
} from '../../types/readingV2Taxonomy';
import {
  buildReadingV2AutoLedgerPromptSummary,
  buildReadingV2AutoSourceLedger,
  readingV2AutoSourceLedgerEvidence,
  verifyReadingV2AutoPayloadAgainstLedger,
  type ReadingV2AutoLedgerPayload,
  type ReadingV2AutoSourceLedger,
  type ReadingV2AutoSourceVerifierIssue,
} from './readingV2AutoImportSourceLedger.service';
import {
  markReadingV2AutoTopology,
  type ReadingV2AutoTopologyMarkerDiagnostic,
} from './readingV2AutoTopologyMarker.service';
import {
  buildReadingV2AutoPassagePackages,
  type ReadingV2AutoPassagePackage,
  type ReadingV2AutoPassagePackageDiagnostic,
  type ReadingV2AutoPassagePackageLine,
} from './readingV2AutoPassagePackage.service';
import {
  runReadingV2GroqPackageFanout,
  type ReadingV2GroqPackageFanoutDiagnostic,
  type ReadingV2GroqPackageFanoutProvider,
} from './readingV2GroqPackageFanout.service';
import {
  buildReadingV2AutoMaterialFromTranscript,
  verifyReadingV2AutoQuestionTranscript,
  type ReadingV2AutoQuestionTranscript,
  type ReadingV2AutoQuestionTranscriptDiagnostic,
} from './readingV2AutoQuestionTranscript.service';
import {
  READING_V2_AUTO_COMPLETION_BLANK_PATTERN,
  readingV2AutoLineMatchesQuestionNumber,
  replaceReadingV2AutoCompletionBlanks,
} from './readingV2AutoTextGuards.service';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const AUTO_V3_PROVIDER = 'gemini-groq';
const AUTO_V3_MODEL_LABEL = `${GEMINI_MODEL_NAME}+groq-structured-json`;
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
const ANSWER_KEY_BLANK_PATTERN = READING_V2_AUTO_COMPLETION_BLANK_PATTERN;

const logReadingV2AutoImportDiag = (event: string, payload: Record<string, unknown>): void => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${READING_V2_AUTO_IMPORT_DIAG_PREFIX} ${event}`, payload);
};

const emitReadingV2AutoImportDiag = (
  options: Pick<ReadingV2AutoImportOptions, 'onDiagnosticEvent'>,
  event: string,
  payload: Record<string, unknown>,
): void => {
  options.onDiagnosticEvent?.(event, payload);
  logReadingV2AutoImportDiag(event, payload);
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
  | 'source-repair-succeeded'
  | 'provider-quota-exhausted'
  | 'topology-marker-failed'
  | 'passage-package-failed'
  | 'groq-key-slot-degraded'
  | 'groq-package-retried'
  | 'groq-package-failed'
  | 'groq-quota-exhausted'
  | 'groq-transcript-failed';

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

const isProviderQuotaFailure = (value: string | undefined): boolean => {
  const text = String(value ?? '').toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes('429')
    || text.includes('rate limit')
    || text.includes('rate-limit')
    || text.includes('quota')
    || text.includes('all gemini api keys exhausted')
    || text.includes('all groq api keys exhausted')
    || text.includes('all ai api keys exhausted')
    || text.includes('all keys exhausted')
    || text.includes('requests_per_day')
    || text.includes('per day')
    || text.includes('per_day')
    || text.includes('perday')
    || text.includes('limit: 0')
    || text.includes('retrydelay')
  );
};

const providerQuotaDiagnosticsFor = (
  error: string | undefined,
): readonly ReadingV2AutoImportDiagnostic[] =>
  isProviderQuotaFailure(error)
    ? [{
        code: 'provider-quota-exhausted',
        severity: 'error',
        message: 'AI provider quota, rate limit, or key-slot exhaustion was detected. Stop live probing until keys recover or more capacity is configured.',
        providerResult: 'failure',
      }]
    : [];

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
  readonly questionAreaNormalizer?: ReadingV2GroqPackageFanoutProvider;
  readonly forceV3Pipeline?: boolean;
  readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
}

export type ReadingV2AutoImportResult =
  | {
      readonly success: true;
      readonly structuredPayloadText: string;
      readonly answerKeyText?: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly provider: 'gemini' | 'gemini-groq';
      readonly model: string;
      readonly candidate: ReadingV2ImportCandidate;
      readonly passageCount: number;
      readonly questionCount: number;
    }
  | {
      readonly success: false;
      readonly error: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly provider: 'gemini' | 'gemini-groq';
      readonly model?: string;
    };

interface AutoPayload {
  sourceFile?: string;
  answerKeyText?: string;
  materials?: readonly AutoMaterial[];
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
  passages?: readonly {
    title?: string;
    content?: string;
    contentBlocks?: unknown;
    notes?: unknown;
    media?: unknown;
    images?: unknown;
  }[];
  sectionInstructions?: readonly unknown[];
  questions?: readonly AutoQuestion[];
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

const compactAnswerLabel = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const answerForTaskVocabulary = (
  answer: string,
  taskType: ReadingV2CanonicalTaskType | undefined,
): string => {
  const trimmed = answer.trim();
  const compact = compactAnswerLabel(trimmed);

  if (taskType === 'true-false-not-given') {
    if (compact === 'yes' || compact === 'y') return 'TRUE';
    if (compact === 'no' || compact === 'n') return 'FALSE';
    if (compact === 'notgiven' || compact === 'ng') return 'NOT GIVEN';
  }

  if (taskType === 'yes-no-not-given') {
    if (compact === 'true' || compact === 't') return 'YES';
    if (compact === 'false' || compact === 'f') return 'NO';
    if (compact === 'notgiven' || compact === 'ng') return 'NOT GIVEN';
  }

  return trimmed;
};

const answerKeyTextFromTopologyRows = (
  rows: readonly { readonly questionNumber: number; readonly answer: string; readonly alternativeAnswers?: readonly string[] }[],
  taskTypeByQuestionNumber: ReadonlyMap<number, ReadingV2CanonicalTaskType> = new Map(),
): string | undefined => {
  const lines = rows
    .slice()
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .map((row) => {
      const taskType = taskTypeByQuestionNumber.get(row.questionNumber);
      const answers = [row.answer, ...(row.alternativeAnswers ?? [])]
        .map((answer) => answerForTaskVocabulary(answer, taskType))
        .map((answer) => answer.trim())
        .filter(Boolean);
      return answers.length > 0 ? `${row.questionNumber} ${answers.join(' | ')}` : '';
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
};

const diagnosticsFromPackageDiagnostics = (
  diagnostics: readonly ReadingV2AutoPassagePackageDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: 'passage-package-failed',
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
  }));

const diagnosticsFromGroqFanout = (
  diagnostics: readonly ReadingV2GroqPackageFanoutDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
  }));

const diagnosticsFromTranscript = (
  diagnostics: readonly ReadingV2AutoQuestionTranscriptDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: 'groq-transcript-failed',
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
    questionNumber: diagnostic.questionNumber,
  }));

const diagnosticsFromTopologyMarker = (
  diagnostics: readonly ReadingV2AutoTopologyMarkerDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: 'topology-marker-failed',
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
    questionNumber: diagnostic.questionNumber,
    sourceRange: diagnostic.sourceRange,
  }));

const chunksFromPassagePackages = (
  passagePackages: readonly ReadingV2AutoPassagePackage[],
): readonly SourceChunk[] =>
  passagePackages.map((passagePackage) => {
    const expectedQuestionNumbers: number[] = [];
    for (
      let questionNumber = passagePackage.expectedQuestionRange.start;
      questionNumber <= passagePackage.expectedQuestionRange.end;
      questionNumber += 1
    ) {
      expectedQuestionNumbers.push(questionNumber);
    }

    return {
      passageNumber: passagePackage.passageNumber,
      text: [
        passagePackage.passageBodyText,
        passagePackage.questionAreaText,
      ].filter(Boolean).join('\n\n'),
      expectedQuestionNumbers,
    };
  });

const finalizeAutoImportPayload = (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly chunks: readonly SourceChunk[];
  readonly payload: AutoPayload;
  readonly answerKeyText?: string;
  readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
  readonly verifierIssues?: readonly ReadingV2AutoSourceVerifierIssue[];
  readonly provider?: ReadingV2AutoImportResult['provider'];
  readonly model?: string;
}): ReadingV2AutoImportResult => {
  const provider = input.provider ?? 'gemini';
  const model = input.model ?? GEMINI_MODEL_NAME;
  const verifierIssues = input.verifierIssues
    ?? verifyReadingV2AutoPayloadAgainstLedger(ledgerPayloadFromAutoPayload(input.payload), input.sourceLedger);
  const diagnostics = [
    ...input.diagnostics,
    ...validatePayload(input.payload, input.chunks, input.sourceLedger, verifierIssues),
  ];
  const blocking = diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  logReadingV2AutoImportDiag('guardrail_result', {
    blocking,
    diagnosticCount: diagnostics.length,
    diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    passageCount: input.payload.materials?.length ?? 0,
    questionCount: questionCountFor(input.payload),
  });

  if (blocking) {
    return {
      success: false,
      error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ?? 'Auto import failed guardrails.',
      diagnostics,
      provider,
      model,
    };
  }

  const text = structuredPayloadText(input.payload);
  const candidate = createReadingV2ImportCandidateFromText({
    text,
    answerKeyText: input.answerKeyText,
    sourceKind: 'auto-gemini',
    fileName: input.request.sourceName ?? (provider === AUTO_V3_PROVIDER ? 'Auto V3 import' : 'Auto Gemini import'),
  });
  const candidateWithLedger: ReadingV2ImportCandidate = {
    ...candidate,
    autoImportDiagnostics: diagnostics,
    evidence: [
      ...candidate.evidence,
      ...readingV2AutoSourceLedgerEvidence(input.sourceLedger),
      ...generatedDraftEvidence(input.payload),
    ],
    uncertaintyMarkers: [
      ...candidate.uncertaintyMarkers,
      ...input.sourceLedger.issues
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
          message: 'Auto import output could not normalize into the Reading V2 draft model.',
        },
      ],
      provider,
      model,
    };
  }

  return {
    success: true,
    structuredPayloadText: text,
    answerKeyText: input.answerKeyText,
    diagnostics: [
      ...diagnostics,
      ...canonicalValidationDiagnostics,
    ],
    provider,
    model,
    candidate: candidateForStudio,
    passageCount: input.payload.materials?.length ?? 0,
    questionCount: questionCountFor(input.payload),
  };
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
  options: Pick<ReadingV2AutoImportOptions, 'onDiagnosticEvent'>,
): Promise<Result<AutoPayload>> => {
  const prompt = buildReadingV2AutoImportPrompt({
    rawTestText: chunk.text,
    sourceName: request.sourceName,
    passageNumber: chunk.passageNumber,
    answerKeyText,
    sourceLedgerSummary: buildReadingV2AutoLedgerPromptSummary(sourceLedger, chunk.passageNumber),
  });
  emitReadingV2AutoImportDiag(options, 'gemini_chunk_requested', {
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
    emitReadingV2AutoImportDiag(options, 'gemini_chunk_failed', {
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
    emitReadingV2AutoImportDiag(options, 'gemini_chunk_malformed_json', {
      passageNumber: chunk.passageNumber,
    });
    return {
      success: false,
      error: 'Gemini returned malformed Reading V2 JSON.',
    };
  }

  emitReadingV2AutoImportDiag(options, 'gemini_chunk_succeeded', {
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
    readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
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

      const chunkResult = await callGeminiForChunk(generator, chunk, request, extractedAnswerKeyText, sourceLedger, options);
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

const groupUsesOptionBank = (taskType: string): boolean =>
  taskType === 'multiple-choice'
  || taskType === 'multiple-select'
  || taskType === 'summary-completion-list';

const groupUsesReferenceBank = (taskType: string): boolean =>
  taskType === 'matching-headings'
  || taskType === 'matching-information'
  || taskType === 'matching-features'
  || taskType === 'matching-sentence-endings';

const compactText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const BANK_LINE_PATTERN = /^([A-Z]|\d+|[ivxlcdm]+)(?:[.)])?(?:\s+(.*))?$/i;
const numbersInRange = (range: { readonly start: number; readonly end: number }): readonly number[] => {
  const numbers: number[] = [];
  for (let questionNumber = range.start; questionNumber <= range.end; questionNumber += 1) {
    numbers.push(questionNumber);
  }
  return numbers;
};

const WORD_LIMIT_BY_TEXT = new Map<string, number>([
  ['ONE', 1],
  ['TWO', 2],
  ['THREE', 3],
  ['FOUR', 4],
  ['FIVE', 5],
]);

const wordLimitDetailsFromInstructionText = (
  sourceInstructionText: string | undefined,
): Pick<ReadingV2AutoQuestionTranscript['groups'][number]['instructionMeta'], 'wordLimit' | 'wordLimitText'> => {
  const source = compactText(sourceInstructionText ?? '');
  const upper = source.toUpperCase();
  const wordOnlyMatch = upper.match(/\b(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\s+ONLY\b/);
  const noMoreThanMatch = upper.match(/\bNO\s+MORE\s+THAN\s+(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\b/);
  const match = wordOnlyMatch ?? noMoreThanMatch;
  const raw = match?.[1];

  if (!raw) {
    return {};
  }

  const wordLimit = WORD_LIMIT_BY_TEXT.get(raw) ?? Number(raw);
  if (!Number.isFinite(wordLimit) || wordLimit <= 0) {
    return {};
  }

  const wordLimitText = noMoreThanMatch
    ? noMoreThanMatch[0]
    : wordOnlyMatch?.[0];

  return {
    wordLimit,
    ...(wordLimitText ? { wordLimitText } : {}),
  };
};

const referenceLabelRangeFromInstructionText = (
  sourceInstructionText: string | undefined,
): Pick<ReadingV2AutoQuestionTranscript['groups'][number]['instructionMeta'], 'referenceLabelRange'> => {
  const source = compactText(sourceInstructionText ?? '');
  const match = source.match(/\b([A-Z])\s*[-–—]\s*([A-Z])\b/);
  if (!match?.[1] || !match[2]) {
    return {};
  }

  return {
    referenceLabelRange: `${match[1].toUpperCase()}-${match[2].toUpperCase()}`,
  };
};

const repairedFlowchartFromQuestions = (
  questions: readonly {
    readonly number: number;
    readonly promptText: string;
  }[],
): ReadingV2AutoQuestionTranscript['groups'][number]['flowchart'] => ({
  steps: questions.map((question, index) => ({
    stepId: `step-q${question.number}`,
    text: compactText(replaceReadingV2AutoCompletionBlanks(question.promptText, ' ')).replace(/\s+[.,;:]$/, ''),
    questionNumber: question.number,
    ...(index < questions.length - 1
      ? { nextStepIds: [`step-q${questions[index + 1]?.number}`] }
      : {}),
  })),
});

const uniqueLines = (
  lines: readonly ReadingV2AutoPassagePackageLine[],
): readonly ReadingV2AutoPassagePackageLine[] => {
  const byLineNumber = new Map<number, ReadingV2AutoPassagePackageLine>();
  lines.forEach((line) => {
    byLineNumber.set(line.lineNumber, line);
  });
  return [...byLineNumber.values()].sort((left, right) => left.lineNumber - right.lineNumber);
};

const referenceBankLinesForGroup = (
  passagePackage: ReadingV2AutoPassagePackage,
  questionRange: ReadingV2AutoQuestionTranscript['groups'][number]['questionRange'],
): readonly ReadingV2AutoPassagePackageLine[] => {
  const matchingHint = passagePackage.groupHints.find((groupHint) =>
    groupHint.questionRange.start === questionRange.start
    && groupHint.questionRange.end === questionRange.end,
  );
  const firstBankGroup = passagePackage.groupHints.find((groupHint) =>
    groupUsesOptionBank(groupHint.taskTypeHint ?? '')
    || groupUsesReferenceBank(groupHint.taskTypeHint ?? ''),
  );
  const spans = matchingHint?.referenceBankLines?.length
    ? matchingHint.referenceBankLines
    : firstBankGroup
      && firstBankGroup.questionRange.start === questionRange.start
      && firstBankGroup.questionRange.end === questionRange.end
        ? passagePackage.referenceBankLineSpans
        : [];

  if (spans.length === 0) {
    return firstBankGroup
      && firstBankGroup.questionRange.start === questionRange.start
      && firstBankGroup.questionRange.end === questionRange.end
        ? passagePackage.referenceBankLines
        : [];
  }

  return uniqueLines(passagePackage.referenceBankLines.filter((line) =>
    spans.some((span) => line.lineNumber >= span.startLine && line.lineNumber <= span.endLine),
  ));
};

const sourceBankItemsFromLines = (
  lines: readonly ReadingV2AutoPassagePackageLine[],
): readonly {
  readonly label: string;
  readonly text: string;
  readonly sourceLines: readonly number[];
}[] => lines.flatMap((line) => {
  const match = compactText(line.text).match(BANK_LINE_PATTERN);
  if (!match) {
    return [];
  }

  const label = match[1]?.trim();
  const text = match[2]?.trim() || label;
  return label && text
    ? [{
        label,
        text,
        sourceLines: [line.lineNumber],
      }]
    : [];
});

const enrichTranscriptWithReferenceBanks = (
  transcript: ReadingV2AutoQuestionTranscript,
  passagePackage: ReadingV2AutoPassagePackage,
): ReadingV2AutoQuestionTranscript => ({
  ...transcript,
  groups: transcript.groups.map((group) => {
    const sourceBankItems = sourceBankItemsFromLines(
      referenceBankLinesForGroup(passagePackage, group.questionRange),
    );

    if (sourceBankItems.length === 0) {
      return group;
    }

    if (groupUsesReferenceBank(group.taskType) && !group.sectionReferences?.length) {
      return {
        ...group,
        sectionReferences: sourceBankItems,
      };
    }

    if (groupUsesOptionBank(group.taskType) && !group.labeledOptions?.length) {
      return {
        ...group,
        labeledOptions: sourceBankItems,
      };
    }

    return group;
  }),
});

const repairTranscriptGroupFromQuestionArea = (
  passagePackage: ReadingV2AutoPassagePackage,
  groupHint: ReadingV2AutoPassagePackage['groupHints'][number],
): ReadingV2AutoQuestionTranscript['groups'][number] | null => {
  const taskType = normalizeReadingV2TaskType(groupHint.taskTypeHint ?? '', {
    summaryAnswerMode: undefined,
  });

  if (!taskType) {
    return null;
  }

  const groupLines = passagePackage.questionAreaLines.filter((line) =>
    line.lineNumber >= groupHint.lines.startLine
    && line.lineNumber <= groupHint.lines.endLine,
  );
  const questionNumbers = numbersInRange(groupHint.questionRange);
  const questionLines = questionNumbers.map((questionNumber) => {
    const matchingLine = groupLines.find((line) => readingV2AutoLineMatchesQuestionNumber(line.text, questionNumber));
    return matchingLine
      ? {
          number: questionNumber,
          promptText: matchingLine.text.trim(),
          sourceLines: [matchingLine.lineNumber],
        }
      : null;
  });

  if (questionLines.some((question) => !question)) {
    return null;
  }

  const firstQuestionNumber = questionNumbers[0];
  if (firstQuestionNumber === undefined) {
    return null;
  }

  const firstQuestionIndex = groupLines.findIndex((line) =>
    readingV2AutoLineMatchesQuestionNumber(line.text, firstQuestionNumber),
  );
  const instructionLines = firstQuestionIndex >= 0
    ? groupLines.slice(0, firstQuestionIndex)
    : groupLines;
  const sourceInstructionText = instructionLines
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim() || undefined;
  const instructionMeta = {
    ...wordLimitDetailsFromInstructionText(sourceInstructionText),
    ...referenceLabelRangeFromInstructionText(sourceInstructionText),
  };

  return {
    questionRange: groupHint.questionRange,
    taskType,
    sourceInstructionText,
    instructionMeta,
    questions: questionLines.filter((question): question is NonNullable<typeof question> => Boolean(question)),
    ...(taskType === 'flowchart-completion'
      ? {
          flowchart: repairedFlowchartFromQuestions(
            questionLines.filter((question): question is NonNullable<typeof question> => Boolean(question)),
          ),
        }
      : {}),
    diagnostics: [],
  };
};

const repairMissingTranscriptGroups = (
  transcript: ReadingV2AutoQuestionTranscript,
  passagePackage: ReadingV2AutoPassagePackage,
): ReadingV2AutoQuestionTranscript => {
  const groupsByRange = new Set(
    transcript.groups.map((group) => `${group.questionRange.start}-${group.questionRange.end}`),
  );
  const repairedGroups = [...transcript.groups];

  passagePackage.groupHints.forEach((groupHint) => {
    const key = `${groupHint.questionRange.start}-${groupHint.questionRange.end}`;
    if (groupsByRange.has(key)) {
      return;
    }

    const repairedGroup = repairTranscriptGroupFromQuestionArea(passagePackage, groupHint);
    if (!repairedGroup) {
      return;
    }

    repairedGroups.push(repairedGroup);
    groupsByRange.add(key);
  });

  return {
    ...transcript,
    groups: repairedGroups.sort((left, right) =>
      left.questionRange.start - right.questionRange.start
      || left.questionRange.end - right.questionRange.end,
    ),
  };
};

const generateReadingV2AutoImportCandidateV3 = async (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly generator: ReadingV2AutoStructuredGenerator;
  readonly questionAreaNormalizer: ReadingV2GroqPackageFanoutProvider;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
}): Promise<ReadingV2AutoImportResult> => {
  const topology = await markReadingV2AutoTopology({
    ledger: input.sourceLedger,
    generator: input.generator,
  });

  if (!topology.success) {
    return {
      success: false,
      error: topology.error,
      diagnostics: [
        ...providerQuotaDiagnosticsFor(topology.error),
        {
          code: 'topology-marker-failed',
          severity: 'error',
          message: topology.error,
        },
      ],
      provider: AUTO_V3_PROVIDER,
      model: AUTO_V3_MODEL_LABEL,
    };
  }

  const markerDiagnostics = diagnosticsFromTopologyMarker(topology.data.diagnostics);
  const passagePackages = buildReadingV2AutoPassagePackages({
    marker: topology.data.marker,
    lineIndex: topology.data.lineIndex,
    ledger: input.sourceLedger,
  });
  const packageDiagnostics = diagnosticsFromPackageDiagnostics(
    passagePackages.flatMap((passagePackage) => passagePackage.diagnostics),
  );
  if (packageDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: false,
      error: packageDiagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message
        ?? 'Auto V3 package splitter failed.',
      diagnostics: [
        ...markerDiagnostics,
        ...packageDiagnostics,
      ],
      provider: AUTO_V3_PROVIDER,
      model: AUTO_V3_MODEL_LABEL,
    };
  }

  const fanout = await runReadingV2GroqPackageFanout({
    passagePackages,
    provider: input.questionAreaNormalizer,
  });

  if (!fanout.success) {
    return {
      success: false,
      error: fanout.error,
      diagnostics: [
        ...markerDiagnostics,
        ...packageDiagnostics,
        ...providerQuotaDiagnosticsFor(fanout.error),
        {
          code: 'groq-package-failed',
          severity: 'error',
          message: fanout.error,
        },
      ],
      provider: AUTO_V3_PROVIDER,
      model: AUTO_V3_MODEL_LABEL,
    };
  }

  const packageResults = fanout.data.packageResults.map((packageResult) => {
    const passagePackage = passagePackages.find((candidate) => candidate.passageNumber === packageResult.passageNumber);
    if (!passagePackage) {
      throw new Error(`Missing passage package ${packageResult.passageNumber}`);
    }

    return {
      ...packageResult,
      passagePackage,
      transcript: enrichTranscriptWithReferenceBanks(
        repairMissingTranscriptGroups(packageResult.transcript, passagePackage),
        passagePackage,
      ),
    };
  });

  const transcriptDiagnostics = packageResults.flatMap(({ transcript, passagePackage }) =>
    verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage,
    }),
  );
  const mappedTranscriptDiagnostics = diagnosticsFromTranscript(transcriptDiagnostics);
  if (mappedTranscriptDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: false,
      error: mappedTranscriptDiagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message
        ?? 'Groq transcript failed source-fidelity verification.',
      diagnostics: [
        ...markerDiagnostics,
        ...packageDiagnostics,
        ...diagnosticsFromGroqFanout(fanout.data.diagnostics),
        ...mappedTranscriptDiagnostics,
      ],
      provider: AUTO_V3_PROVIDER,
      model: AUTO_V3_MODEL_LABEL,
    };
  }

  const materials: AutoMaterial[] = packageResults.map(({ transcript, passagePackage }) => {
    const material = buildReadingV2AutoMaterialFromTranscript({
      transcript,
      passagePackage,
    });
    return {
      passageNumber: material.passageNumber,
      title: material.title,
      passages: material.passages.map((passage) => ({
        title: passage.title,
        content: passage.content,
      })),
      sectionInstructions: material.sectionInstructions,
      questions: material.questions.map((question) => ({
        number: question.questionNumber,
        questionNumber: question.questionNumber,
        type: question.type,
        sectionInstructionId: question.sectionInstructionId,
        questionText: question.questionText,
        wordLimit: question.wordLimit,
        labeledOptions: question.labeledOptions,
        sectionReferences: question.sectionReferences,
      })),
    };
  });
  const taskTypeByQuestionNumber = new Map<number, ReadingV2CanonicalTaskType>();
  packageResults.forEach(({ transcript }) => {
    transcript.groups.forEach((group) => {
      numbersInRange(group.questionRange).forEach((questionNumber) => {
        taskTypeByQuestionNumber.set(questionNumber, group.taskType);
      });
    });
  });
  const answerKeyText = answerKeyTextFromTopologyRows(topology.data.marker.answerKeyRows, taskTypeByQuestionNumber);
  const payload: AutoPayload = {
    sourceFile: input.request.sourceName ?? 'auto-v3-reading-v2.txt',
    answerKeyText: answerKeyText ?? '',
    materials,
    diagnostics: [],
  };
  const chunks = chunksFromPassagePackages(passagePackages);
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    ...(answerKeyText
      ? [{
          code: 'answer-key-returned-by-gemini' as const,
          severity: 'info' as const,
          message: 'Gemini topology marker normalized visible answer-key rows from the raw source.',
        }]
      : [{
          code: 'answer-key-missing' as const,
          severity: 'warning' as const,
          message: 'No source answer-key rows were normalized. Answers stay empty for Studio review.',
        }]),
    ...markerDiagnostics,
    ...packageDiagnostics,
    ...diagnosticsFromGroqFanout(fanout.data.diagnostics),
    ...mappedTranscriptDiagnostics,
  ];
  const verifierIssues = verifyReadingV2AutoPayloadAgainstLedger(ledgerPayloadFromAutoPayload(payload), input.sourceLedger);

  return finalizeAutoImportPayload({
    request: input.request,
    sourceLedger: input.sourceLedger,
    chunks,
    payload: answerKeyText ? payload : stripAnswersWhenNoSourceKey(payload),
    answerKeyText,
    diagnostics,
    verifierIssues,
    provider: AUTO_V3_PROVIDER,
    model: AUTO_V3_MODEL_LABEL,
  });
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
  const questionAreaNormalizer = options.questionAreaNormalizer ?? groqProvider;

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

  const useV3Pipeline = options.forceV3Pipeline ?? (!options.generator || Boolean(options.questionAreaNormalizer));
  if (useV3Pipeline) {
    return generateReadingV2AutoImportCandidateV3({
      request,
      generator,
      questionAreaNormalizer,
      sourceLedger,
    });
  }

  const extractedAnswerKeyText = extractAnswerKeyTextFromRaw(sourceLedger.normalizedText);
  const chunks = splitSourceIntoChunks(sourceLedger.normalizedText, sourceLedger);
  const chunkPayloads: ChunkPayload[] = [];
  emitReadingV2AutoImportDiag(options, 'preflight_complete', {
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

    const chunkResult = await callGeminiForChunk(generator, chunk, request, extractedAnswerKeyText, sourceLedger, options);
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
    onDiagnosticEvent: options.onDiagnosticEvent,
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
  emitReadingV2AutoImportDiag(options, 'guardrail_result', {
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
