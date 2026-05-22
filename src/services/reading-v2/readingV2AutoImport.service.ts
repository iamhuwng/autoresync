import type {
  AIQuestion,
  AIPassage,
  AIPassagesOnlyResult,
  AIQuestionsAndAnswersResult,
  AIStructuredGenerationOptions,
} from '../ai/ai.service';
import { aiService } from '../ai/router.service';
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
  type ReadingV2GroqPackageFanoutPackageResult,
  type ReadingV2GroqPackageFanoutProvider,
} from './readingV2GroqPackageFanout.service';
import {
  normalizeReadingV2AutoQuestionArea,
} from './readingV2AutoQuestionAreaNormalizer.service';
import {
  buildReadingV2AutoMaterialFromTranscript,
  readingV2AutoQuestionRangeKey,
  readingV2AutoTranscriptGroupRangeKeys,
  verifyReadingV2AutoQuestionTranscript,
  type ReadingV2AutoTranscriptCoverageSummary,
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
const AUTO_V4_MODEL_LABEL = `${GEMINI_MODEL_NAME}+auto-v4-staged-adapter`;
const DEFAULT_MAX_INPUT_CHARS = 120_000;
const DEFAULT_MIN_INPUT_CHARS = 80;
const DEFAULT_CHUNK_WAIT_MS = 6_500;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;
const READING_V2_AUTO_IMPORT_DIAG_PREFIX = '[Diag][ReadingV2AutoImport]';
const AUTO_V3_REPLAY_SCHEMA_VERSION = 'reading-v2-auto-v3-groq-source-proof-v1';
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
  | 'auto-v4-staged-parser-used'
  | ReadingV2AutoTopologyMarkerDiagnostic['code']
  | 'passage-package-failed'
  | 'groq-key-slot-degraded'
  | 'groq-json-malformed'
  | 'groq-package-json-retried'
  | 'groq-package-json-retry-succeeded'
  | 'groq-package-json-retry-failed'
  | 'groq-package-retried'
  | 'groq-package-failed'
  | 'groq-quota-exhausted'
  | 'groq-transcript-failed'
  | 'group-coverage-mismatch'
  | 'duplicate-question-number'
  | 'task-type-conflict'
  | 'missing-reference-bank'
  | 'blank-mismatch'
  | 'source-proof-format-mismatch'
  | 'source-text-exact-missing'
  | 'normalized-text-source-drift'
  | 'groq-output-missing-group'
  | 'app-normalizer-dropped-group'
  | 'repair-applied'
  | 'repair-skipped'
  | 'repair-failed'
  | 'bank-ownership-heuristic-used';

export interface ReadingV2AutoImportDiagnostic {
  readonly code: ReadingV2AutoImportDiagnosticCode;
  readonly severity: ReadingV2AutoImportDiagnosticSeverity;
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly stage?: 'raw-groq' | 'normalized-transcript' | 'repaired-transcript' | 'targeted-retry' | 'final-verifier';
  readonly groupRange?: string;
  readonly attempt?: number;
  readonly sourceRange?: string;
  readonly verifierIssueCodes?: readonly ReadingV2AutoSourceVerifierIssue['code'][];
  readonly repairScopes?: readonly ReadingV2AutoRepairScope[];
  readonly providerResult?: 'success' | 'failure';
  readonly verifierResult?: 'passed' | 'failed';
  readonly preferredKeyIndex?: number;
  readonly keyFingerprint?: string;
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

export interface ReadingV2AutoV4Extractor {
  parsePassagesOnly(text: string): Promise<Result<AIPassagesOnlyResult>>;
  parseQuestionsAndAnswers(text: string): Promise<Result<AIQuestionsAndAnswersResult>>;
}

export interface ReadingV2AutoImportOptions {
  readonly generator?: ReadingV2AutoStructuredGenerator;
  readonly v4Extractor?: ReadingV2AutoV4Extractor;
  readonly waitBetweenChunksMs?: number;
  readonly maxInputChars?: number;
  readonly minInputChars?: number;
  readonly maxRepairAttempts?: number;
  readonly questionAreaNormalizer?: ReadingV2GroqPackageFanoutProvider;
  readonly forceV3Pipeline?: boolean;
  readonly captureRawProviderDebug?: boolean;
  readonly onDiagnosticEvent?: (event: string, payload: Record<string, unknown>) => void;
}

const shouldCaptureRawProviderDebug = (
  options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug'>,
): boolean =>
  Boolean(options.captureRawProviderDebug)
  && (import.meta.env.DEV || import.meta.env.MODE === 'test');

const emitReadingV2AutoRawDebug = (
  options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>,
  event: string,
  payload: Record<string, unknown>,
): void => {
  if (!shouldCaptureRawProviderDebug(options)) {
    return;
  }

  emitReadingV2AutoImportDiag({ onDiagnosticEvent: options.onDiagnosticEvent }, event, payload);
};

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

interface ReadingV2AutoV3PackageReplayBundle {
  readonly schemaVersion: string;
  readonly passageNumber: number;
  readonly sourceHash: string;
  readonly packageHash: string;
  readonly expectedQuestionRange: string;
  readonly groupHints: readonly string[];
  readonly referenceBankLineSpans: readonly string[];
  readonly questionAreaLineCount: number;
  readonly promptHash: string;
  readonly preferredKeyIndex?: number;
  readonly keyFingerprint?: string;
  readonly attempts: number;
  readonly rawJsonShapeSummary: string;
  readonly rawGroupRanges: readonly string[];
  readonly rawCoverageGroups: readonly string[];
  readonly rawCoverageQuestions: readonly number[];
  readonly normalizedTranscriptGroupRanges: readonly string[];
  readonly repairedTranscriptGroupRanges: readonly string[];
  readonly finalVerifierIssueCodes: readonly string[];
  readonly stageTransitions: readonly string[];
}

interface AnswerKeyCandidate {
  readonly rows: readonly string[];
  readonly score: number;
  readonly headingScore: number;
  readonly startIndex: number;
}

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

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
  const headedCandidate = headingScore > 0;
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

  return headedCandidate
    ? validRows.length > 0 && monotonicRatio >= 0.75
      ? { rows, score, headingScore, startIndex }
      : null
    : answerLikeRatio >= 0.45 && score >= threshold
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

const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface AutoV4Question {
  readonly source: AIQuestion;
  readonly questionNumber: number;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly instructionText?: string;
  readonly optionSignature: string;
}

interface AutoV4QuestionGroup {
  readonly id: string;
  readonly passageNumber: number;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly instructionText?: string;
  readonly questions: readonly AutoV4Question[];
}

const normalizedQuestionText = (value: string): string =>
  value
    .replace(/^\s*(?:\*\*)?\d{1,3}(?:\*\*)?\s*(?:[.)\-:]\s*)?/, '')
    .trim();

const normalizedTextKey = (value: string | undefined): string =>
  compactWhitespace(value ?? '').toLowerCase();

const autoV4AnswerKeyText = (
  answerKey: AIQuestionsAndAnswersResult['answerKey'],
): string | undefined => {
  const rows = Object.entries(answerKey ?? {})
    .map(([questionNumber, answer]) => ({
      questionNumber: Number(questionNumber),
      values: Array.isArray(answer) ? answer : [answer],
    }))
    .filter((row) => Number.isInteger(row.questionNumber) && row.questionNumber > 0)
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .flatMap((row) => {
      const values = row.values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);
      return values.length > 0 ? [`${row.questionNumber} ${values.join(' | ')}`] : [];
    });

  return rows.length > 0 ? rows.join('\n') : undefined;
};

const answerValuesByQuestionNumber = (
  answerKeyText: string | undefined,
): ReadonlyMap<number, readonly string[]> =>
  new Map(
    parseReadingV2TeacherAnswerKey(answerKeyText).rows
      .filter((row) =>
        row.parsedAnswerValues.length > 0
        && !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
        && row.bindingStatus !== 'duplicate',
      )
      .map((row) => [row.questionNumber, row.parsedAnswerValues]),
  );

const questionNumberFromAutoV4Question = (question: AIQuestion): number =>
  normalizeNumber(question.questionNumber);

const autoV4QuestionChoiceItems = (
  question: AIQuestion,
): readonly { readonly label: string; readonly text: string }[] => {
  const labeled = question.labeledOptions ?? [];
  const labeledItems = labeled
    .map((option) => ({
      label: option.label?.trim() ?? '',
      text: option.text?.trim() ?? '',
    }))
    .filter((option) => option.label && option.text);

  if (labeledItems.length > 0) {
    return labeledItems;
  }

  return (question.options ?? [])
    .map((option, index) => {
      if (typeof option !== 'string') {
        return {
          label: option.label?.trim() ?? OPTION_LABELS[index] ?? String(index + 1),
          text: option.text?.trim() ?? '',
        };
      }

      const trimmed = option.trim();
      const match = trimmed.match(/^([A-Z]|[ivxlcdm]+|\d+)(?:[.)])?\s+(.+)$/i);
      return {
        label: (match?.[1] ?? OPTION_LABELS[index] ?? String(index + 1)).trim(),
        text: (match?.[2] ?? trimmed).trim(),
      };
    })
    .filter((option) => option.label && option.text);
};

const autoV4QuestionReferenceItems = (
  question: AIQuestion,
): readonly { readonly label: string; readonly text: string }[] => {
  const references = (question.sectionReferences ?? [])
    .map((reference) => ({
      label: reference.label?.trim() ?? '',
      text: (reference.title ?? reference.paragraph ?? reference.label)?.trim() ?? '',
    }))
    .filter((reference) => reference.label && reference.text);

  return references.length > 0 ? references : autoV4QuestionChoiceItems(question);
};

const uniqueOptionItems = (
  items: readonly { readonly label: string; readonly text: string }[],
): readonly { readonly label: string; readonly text: string }[] => {
  const seen = new Set<string>();
  const uniqueItems: { label: string; text: string }[] = [];

  items.forEach((item) => {
    const label = item.label.trim();
    const text = item.text.trim();
    const key = `${label.toLowerCase()}:${text.toLowerCase()}`;
    if (!label || !text || seen.has(key)) {
      return;
    }
    seen.add(key);
    uniqueItems.push({ label, text });
  });

  return uniqueItems;
};

const autoV4QuestionOptionSignature = (question: AIQuestion, taskType: ReadingV2CanonicalTaskType): string => {
  if (taskType !== 'matching-headings'
    && taskType !== 'matching-information'
    && taskType !== 'matching-features'
    && taskType !== 'matching-sentence-endings'
    && taskType !== 'summary-completion-list') {
    return '';
  }

  return JSON.stringify(uniqueOptionItems([
    ...autoV4QuestionReferenceItems(question),
    ...autoV4QuestionChoiceItems(question),
  ]));
};

const autoV4TaskTypeFromQuestion = (question: AIQuestion): ReadingV2CanonicalTaskType => {
  const rawType = question.type?.trim() ?? '';
  const combined = [
    rawType,
    question.sectionInstruction,
    question.questionText,
  ].filter(Boolean).join(' ');
  const lower = combined.toLowerCase();
  const hasChoices = autoV4QuestionChoiceItems(question).length > 0;
  const normalized = normalizeReadingV2TaskType(rawType, {
    summaryAnswerMode: lower.includes('summary') ? (hasChoices ? 'list' : 'text') : undefined,
  });

  if (normalized) {
    return normalized;
  }

  if (/\btrue\b.*\bfalse\b.*\bnot\s+given\b|\btfng\b/.test(lower)) {
    return 'true-false-not-given';
  }
  if (/\byes\b.*\bno\b.*\bnot\s+given\b|\bynng\b/.test(lower)) {
    return 'yes-no-not-given';
  }
  if (lower.includes('matching headings') || lower.includes('list of headings')) {
    return 'matching-headings';
  }
  if (lower.includes('sentence ending')) {
    return 'matching-sentence-endings';
  }
  if (lower.includes('matching features') || lower.includes('which person') || lower.includes('which researcher')) {
    return 'matching-features';
  }
  if (lower.includes('which paragraph contains') || lower.includes('paragraph contains') || lower.includes('matching information')) {
    return 'matching-information';
  }
  if (lower.includes('choose two') || lower.includes('choose three') || /\btwo letters\b|\bthree letters\b/.test(lower)) {
    return 'multiple-select';
  }
  if (hasChoices || lower.includes('choose the correct letter') || /\b[a-d],\s*b,\s*c/.test(lower)) {
    return 'multiple-choice';
  }
  if (lower.includes('summary')) {
    return hasChoices ? 'summary-completion-list' : 'summary-completion-text';
  }
  if (lower.includes('table')) {
    return 'table-completion';
  }
  if (lower.includes('note')) {
    return 'note-completion';
  }
  if (lower.includes('flow')) {
    return 'flowchart-completion';
  }
  if (lower.includes('diagram') || lower.includes('label')) {
    return 'diagram-labeling';
  }
  if (lower.includes('short answer')) {
    return 'short-answer';
  }

  return 'sentence-completion';
};

const passageNumberFromAutoV4Passage = (
  passage: AIPassage,
  passageIndex: number,
  sourceLedger: ReadingV2AutoSourceLedger,
): number => {
  const label = `${passage.id ?? ''} ${passage.title ?? ''}`;
  const explicit = label.match(/\b(?:reading\s+)?(?:passage|section|p)\s*([1-9]\d?)\b/i)?.[1];
  if (explicit) {
    return Number(explicit);
  }

  const start = optionalNumberFrom(passage.questionStart);
  const end = optionalNumberFrom(passage.questionEnd) ?? start;
  const ledgerRange = start && end
    ? sourceLedger.questionRanges.find((range) => range.start <= start && range.end >= end)
    : undefined;
  if (ledgerRange?.passageNumber) {
    return ledgerRange.passageNumber;
  }

  return sourceLedger.passages[passageIndex]?.passageNumber ?? passageIndex + 1;
};

const autoV4QuestionInstructionText = (
  question: AIQuestion,
  sourceLedger: ReadingV2AutoSourceLedger,
): string | undefined => {
  const explicit = question.sectionInstruction?.trim();
  if (explicit) {
    return explicit;
  }

  const questionNumber = questionNumberFromAutoV4Question(question);
  return sourceLedger.questionRanges.find((range) =>
    questionNumber >= range.start && questionNumber <= range.end,
  )?.instructionPreview;
};

const materialIndexForAutoV4Question = (
  question: AIQuestion,
  materials: readonly { readonly passage: AIPassage; readonly passageNumber: number }[],
  sourceLedger: ReadingV2AutoSourceLedger,
): number => {
  const questionNumber = questionNumberFromAutoV4Question(question);
  const passageId = question.passageId?.trim();
  const directPassageIndex = passageId
    ? materials.findIndex(({ passage }) => passage.id === passageId)
    : -1;

  if (directPassageIndex >= 0) {
    return directPassageIndex;
  }

  const rangedPassageIndex = materials.findIndex(({ passage }) => {
    const start = optionalNumberFrom(passage.questionStart);
    const end = optionalNumberFrom(passage.questionEnd) ?? start;
    return Boolean(start && end && questionNumber >= start && questionNumber <= end);
  });

  if (rangedPassageIndex >= 0) {
    return rangedPassageIndex;
  }

  const ledgerRange = sourceLedger.questionRanges.find((range) =>
    questionNumber >= range.start && questionNumber <= range.end,
  );
  const ledgerPassageIndex = ledgerRange?.passageNumber
    ? materials.findIndex((material) => material.passageNumber === ledgerRange.passageNumber)
    : -1;

  if (ledgerPassageIndex >= 0) {
    return ledgerPassageIndex;
  }

  return materials.length === 1 ? 0 : Math.max(0, materials.length - 1);
};

const autoV4QuestionGroupsForMaterial = (
  passageNumber: number,
  questions: readonly AIQuestion[],
  sourceLedger: ReadingV2AutoSourceLedger,
): readonly AutoV4QuestionGroup[] => {
  const groups: {
    id: string;
    passageNumber: number;
    taskType: ReadingV2CanonicalTaskType;
    instructionText?: string;
    optionSignature: string;
    questions: AutoV4Question[];
  }[] = [];

  questions
    .map((question) => ({
      source: question,
      questionNumber: questionNumberFromAutoV4Question(question),
      taskType: autoV4TaskTypeFromQuestion(question),
      instructionText: autoV4QuestionInstructionText(question, sourceLedger),
    }))
    .filter((question) => question.questionNumber > 0)
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .forEach((question) => {
      const optionSignature = autoV4QuestionOptionSignature(question.source, question.taskType);
      const activeGroup = groups[groups.length - 1];
      const activeLast = activeGroup?.questions[activeGroup.questions.length - 1];
      const sameInstruction =
        normalizedTextKey(activeGroup?.instructionText) === normalizedTextKey(question.instructionText);
      const belongsToActiveGroup =
        activeGroup
        && activeGroup.taskType === question.taskType
        && activeGroup.optionSignature === optionSignature
        && sameInstruction
        && activeLast?.questionNumber === question.questionNumber - 1;

      if (belongsToActiveGroup) {
        activeGroup.questions.push({ ...question, optionSignature });
        return;
      }

      const id = `p${passageNumber}-q${question.questionNumber}-${question.questionNumber}-${question.taskType}`;
      groups.push({
        id,
        passageNumber,
        taskType: question.taskType,
        instructionText: question.instructionText,
        optionSignature,
        questions: [{ ...question, optionSignature }],
      });
    });

  return groups.map((group) => {
    const start = group.questions[0]?.questionNumber ?? 0;
    const end = group.questions[group.questions.length - 1]?.questionNumber ?? start;
    return {
      id: `p${group.passageNumber}-q${start}-${end}-${group.taskType}`,
      passageNumber: group.passageNumber,
      taskType: group.taskType,
      instructionText: group.instructionText,
      questions: group.questions,
    };
  });
};

const autoV4GroupSectionReferences = (
  group: AutoV4QuestionGroup,
): readonly { readonly label: string; readonly text: string }[] | undefined => {
  if (
    group.taskType !== 'matching-headings'
    && group.taskType !== 'matching-information'
    && group.taskType !== 'matching-features'
    && group.taskType !== 'matching-sentence-endings'
  ) {
    return undefined;
  }

  const items = uniqueOptionItems(group.questions.flatMap((question) =>
    autoV4QuestionReferenceItems(question.source),
  ));
  return items.length > 0 ? items : undefined;
};

const autoV4GroupLabeledOptions = (
  group: AutoV4QuestionGroup,
): readonly { readonly label: string; readonly text: string }[] | undefined => {
  if (
    group.taskType !== 'summary-completion-list'
    && group.taskType !== 'multiple-select'
  ) {
    return undefined;
  }

  const items = uniqueOptionItems(group.questions.flatMap((question) =>
    autoV4QuestionChoiceItems(question.source),
  ));
  return items.length > 0 ? items : undefined;
};

const autoV4QuestionLabeledOptions = (
  question: AIQuestion,
  taskType: ReadingV2CanonicalTaskType,
): readonly { readonly label: string; readonly text: string }[] | undefined => {
  if (taskType !== 'multiple-choice') {
    return undefined;
  }

  const items = uniqueOptionItems(autoV4QuestionChoiceItems(question));
  return items.length > 0 ? items : undefined;
};

const autoV4VocabularyForTaskType = (
  taskType: ReadingV2CanonicalTaskType,
): 'TFNG' | 'YNNG' | undefined => {
  if (taskType === 'true-false-not-given') {
    return 'TFNG';
  }
  if (taskType === 'yes-no-not-given') {
    return 'YNNG';
  }
  return undefined;
};

const autoV4SelectionLimitForGroup = (
  group: AutoV4QuestionGroup,
  answerValues: ReadonlyMap<number, readonly string[]>,
): number | undefined =>
  group.taskType === 'multiple-select'
    ? Math.max(2, ...group.questions.map((question) => answerValues.get(question.questionNumber)?.length ?? 0))
    : undefined;

const buildAutoPayloadFromAutoV4Results = (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly passagesResult: AIPassagesOnlyResult;
  readonly questionsResult: AIQuestionsAndAnswersResult;
  readonly answerKeyText?: string;
}): AutoPayload => {
  const answerValues = answerValuesByQuestionNumber(input.answerKeyText);
  const materials = input.passagesResult.passages
    .map((passage, passageIndex) => ({
      passage,
      passageNumber: passageNumberFromAutoV4Passage(passage, passageIndex, input.sourceLedger),
    }))
    .sort((left, right) => left.passageNumber - right.passageNumber);
  const questionsByMaterialIndex = new Map<number, AIQuestion[]>();

  input.questionsResult.questions.forEach((question) => {
    const materialIndex = materialIndexForAutoV4Question(question, materials, input.sourceLedger);
    questionsByMaterialIndex.set(materialIndex, [
      ...(questionsByMaterialIndex.get(materialIndex) ?? []),
      question,
    ]);
  });

  return {
    sourceFile: input.request.sourceName ?? 'auto-v4-reading-v2.txt',
    answerKeyText: input.answerKeyText ?? '',
    materials: materials.map(({ passage, passageNumber }, materialIndex) => {
      const materialQuestions = questionsByMaterialIndex.get(materialIndex) ?? [];
      const groups = autoV4QuestionGroupsForMaterial(passageNumber, materialQuestions, input.sourceLedger);

      return {
        passageNumber,
        title: passage.title || `Reading Passage ${passageNumber}`,
        passages: [{
          title: passage.title || `Reading Passage ${passageNumber}`,
          content: passage.content,
        }],
        sectionInstructions: groups.map((group) => {
          const start = group.questions[0]?.questionNumber ?? 0;
          const end = group.questions[group.questions.length - 1]?.questionNumber ?? start;
          return {
            id: group.id,
            taskType: group.taskType,
            questionRange: { start, end },
            sourceInstructionEvidence: group.instructionText,
            vocabulary: autoV4VocabularyForTaskType(group.taskType),
            selectionLimit: autoV4SelectionLimitForGroup(group, answerValues),
            sectionReferences: autoV4GroupSectionReferences(group),
            labeledOptions: autoV4GroupLabeledOptions(group),
          };
        }),
        questions: groups.flatMap((group) =>
          group.questions.map((question) => {
            const answers = answerValues.get(question.questionNumber) ?? [];
            return {
              questionNumber: question.questionNumber,
              number: question.questionNumber,
              type: group.taskType,
              sectionInstructionId: group.id,
              questionText: normalizedQuestionText(question.source.questionText),
              answer: answers.join(' | '),
              labeledOptions: autoV4QuestionLabeledOptions(question.source, group.taskType),
              sectionReferences: group.taskType === 'matching-information'
                ? autoV4QuestionReferenceItems(question.source)
                : undefined,
              optionLabelFormat: question.source.optionLabelFormat,
            };
          }),
        ),
      };
    }),
    diagnostics: [],
  };
};

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
  rows: readonly {
    readonly questionNumber: number;
    readonly answer: string;
    readonly alternativeAnswers?: readonly string[];
    readonly sourceTextExact?: string;
  }[],
  taskTypeByQuestionNumber: ReadonlyMap<number, ReadingV2CanonicalTaskType> = new Map(),
): string | undefined => {
  const lines = rows
    .slice()
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .map((row) => {
      const taskType = taskTypeByQuestionNumber.get(row.questionNumber);
      const sourceRowAnswers = row.sourceTextExact
        ? parseReadingV2TeacherAnswerKey(row.sourceTextExact).rows.find(
            (candidate) => candidate.questionNumber === row.questionNumber,
          )?.parsedAnswerValues ?? []
        : [];
      const answers = (sourceRowAnswers.length > 0
        ? sourceRowAnswers
        : [row.answer, ...(row.alternativeAnswers ?? [])])
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
    preferredKeyIndex: diagnostic.preferredKeyIndex,
    keyFingerprint: diagnostic.keyFingerprint,
  }));

const diagnosticsFromTranscript = (
  diagnostics: readonly ReadingV2AutoQuestionTranscriptDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code as ReadingV2AutoImportDiagnosticCode,
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
    questionNumber: diagnostic.questionNumber,
    stage: 'final-verifier',
  }));

const diagnosticsFromTopologyMarker = (
  diagnostics: readonly ReadingV2AutoTopologyMarkerDiagnostic[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
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
  readonly extraEvidence?: readonly string[];
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
    fileName: input.request.sourceName
      ?? (model === AUTO_V4_MODEL_LABEL
        ? 'Auto V4 import'
        : provider === AUTO_V3_PROVIDER
          ? 'Auto V3 import'
          : 'Auto Gemini import'),
  });
  const candidateWithLedger: ReadingV2ImportCandidate = {
    ...candidate,
    autoImportDiagnostics: diagnostics,
    evidence: [
      ...candidate.evidence,
      ...readingV2AutoSourceLedgerEvidence(input.sourceLedger),
      ...generatedDraftEvidence(input.payload),
      ...(input.extraEvidence ?? []),
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
  options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>,
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
    emitReadingV2AutoRawDebug(options, 'gemini_chunk_debug_capture', {
      stage: 'gemini-chunk',
      passageNumber: chunk.passageNumber,
      prompt,
      providerResult: 'failure',
      error: result.error ?? 'Gemini structured generation failed.',
    });
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
    emitReadingV2AutoRawDebug(options, 'gemini_chunk_debug_capture', {
      stage: 'gemini-chunk',
      passageNumber: chunk.passageNumber,
      prompt,
      providerResult: 'success',
      providerPayload: result.data,
      payloadResult: 'malformed-json',
    });
    emitReadingV2AutoImportDiag(options, 'gemini_chunk_malformed_json', {
      passageNumber: chunk.passageNumber,
    });
    return {
      success: false,
      error: 'Gemini returned malformed Reading V2 JSON.',
    };
  }

  emitReadingV2AutoRawDebug(options, 'gemini_chunk_debug_capture', {
    stage: 'gemini-chunk',
    passageNumber: chunk.passageNumber,
    prompt,
    providerResult: 'success',
    providerPayload: result.data,
  });
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
    readonly captureRawProviderDebug?: boolean;
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

const normalizeAutoV3TaskTypeHint = (
  taskTypeHint: string | undefined,
  options: { readonly summaryAnswerMode?: 'text' | 'list' } = {},
): ReadingV2CanonicalTaskType | null => {
  const normalized = compactText(taskTypeHint ?? '').toLowerCase();
  const summaryAnswerMode = options.summaryAnswerMode
    ?? (normalized.includes('summary')
      ? normalized.includes('list') || normalized.includes('box') || normalized.includes('option')
        ? 'list'
        : 'text'
      : undefined);

  return normalizeReadingV2TaskType(taskTypeHint ?? '', { summaryAnswerMode })
    ?? (normalized === 'summary-completion' ? 'summary-completion-text' : null);
};

const MULTI_MARKER_SOURCE_FRAGMENT_TASK_TYPES = new Set<ReadingV2CanonicalTaskType>([
  'sentence-completion',
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
  'table-completion',
  'flowchart-completion',
  'diagram-labeling',
]);

interface ReadingV2AutoInlineCompletionOccurrence {
  readonly questionNumber: number;
  readonly markerStart: number;
  readonly blankEnd: number;
}

const INLINE_COMPLETION_QUESTION_PATTERN = new RegExp(
  String.raw`(?:\*\*|__)?\s*(\d{1,3})\s*(?:\*\*|__)?(?:[.)])?\s*(?:${READING_V2_AUTO_COMPLETION_BLANK_PATTERN.source})`,
  'gi',
);

const inlineCompletionOccurrencesFromLine = (
  lineText: string,
  groupQuestionNumbers: readonly number[],
): readonly ReadingV2AutoInlineCompletionOccurrence[] => {
  const groupQuestionNumberSet = new Set(groupQuestionNumbers);
  const occurrences: ReadingV2AutoInlineCompletionOccurrence[] = [];

  for (const match of lineText.matchAll(INLINE_COMPLETION_QUESTION_PATTERN)) {
    const questionNumber = Number(match[1]);
    const markerStart = match.index ?? -1;
    if (!Number.isFinite(questionNumber) || markerStart < 0 || !groupQuestionNumberSet.has(questionNumber)) {
      continue;
    }
    occurrences.push({
      questionNumber,
      markerStart,
      blankEnd: markerStart + match[0].length,
    });
  }

  return occurrences;
};

const scopedCompletionQuestionSourceTextFromLine = (
  lineText: string,
  questionNumber: number,
  groupQuestionNumbers: readonly number[],
): string | null => {
  const occurrences = inlineCompletionOccurrencesFromLine(lineText, groupQuestionNumbers);
  if (occurrences.length <= 1) {
    return null;
  }

  const currentIndex = occurrences.findIndex((occurrence) => occurrence.questionNumber === questionNumber);
  if (currentIndex < 0) {
    return null;
  }

  const start = occurrences[currentIndex - 1]?.blankEnd ?? 0;
  const end = occurrences[currentIndex + 1]?.markerStart ?? lineText.length;
  const scopedText = lineText.slice(start, end).trim();

  return scopedText || null;
};

const canonicalQuestionSourceTextFromLine = (input: {
  readonly lineText: string;
  readonly questionNumber: number;
  readonly groupQuestionNumbers: readonly number[];
  readonly taskType: ReadingV2CanonicalTaskType;
}): string | null => {
  const matchedQuestionNumbers = input.groupQuestionNumbers.filter((candidate) =>
    readingV2AutoLineMatchesQuestionNumber(input.lineText, candidate),
  );

  if (!matchedQuestionNumbers.includes(input.questionNumber)) {
    return null;
  }

  if (matchedQuestionNumbers.length <= 1) {
    return input.lineText.trim();
  }

  if (!MULTI_MARKER_SOURCE_FRAGMENT_TASK_TYPES.has(input.taskType)) {
    return null;
  }

  return scopedCompletionQuestionSourceTextFromLine(
    input.lineText,
    input.questionNumber,
    input.groupQuestionNumbers,
  );
};

const normalizedPromptTextFromSourceText = (
  sourceTextExact: string,
  questionNumber: number,
): string => {
  const blankSentinel = '[[BLANK]]';
  return compactText(
    replaceReadingV2AutoCompletionBlanks(sourceTextExact, ` ${blankSentinel} `)
      .replace(
        new RegExp(
          String.raw`^\s*(?:(?:[-*]|\u2022|\u25cf)\s*)?(?:\*\*|__)?${questionNumber}(?:\*\*|__)?(?:[.)])?\s*`,
          'i',
        ),
        '',
      )
      .replace(
        new RegExp(
          String.raw`(?:\*\*|__)?\s*${questionNumber}\s*(?:\*\*|__)?(?:[.)])?\s*(?=\[\[BLANK\]\])`,
          'gi',
        ),
        '',
      )
      .replace(/[`*_~]+/g, '')
      .replace(/\\(?=[_.])/g, '')
      .split(blankSentinel)
      .join('___'),
  );
};

const BANK_LINE_PATTERN = /^(?:\*\*|__)?([A-Z]|\d+|[ivxlcdm]+)(?:\*\*|__)?(?:[.)])?(?:\s+(.*))?$/i;
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
    readonly sourceTextExact?: string;
    readonly normalizedPromptText?: string;
  }[],
): ReadingV2AutoQuestionTranscript['groups'][number]['flowchart'] => ({
  steps: questions.map((question, index) => ({
    stepId: `step-q${question.number}`,
    text: compactText(replaceReadingV2AutoCompletionBlanks(question.promptText, ' ')).replace(/\s+[.,;:]$/, ''),
    ...(question.sourceTextExact ? { sourceTextExact: question.sourceTextExact } : {}),
    ...(question.normalizedPromptText ? { normalizedText: question.normalizedPromptText } : {}),
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

type ReadingV2AutoBankRecoveryAuthority =
  | 'group-span'
  | 'package-span'
  | 'heuristic-fallback'
  | 'none';

const referenceBankRecoveryForGroup = (
  passagePackage: ReadingV2AutoPassagePackage,
  questionRange: ReadingV2AutoQuestionTranscript['groups'][number]['questionRange'],
): {
  readonly lines: readonly ReadingV2AutoPassagePackageLine[];
  readonly authority: ReadingV2AutoBankRecoveryAuthority;
} => {
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
        ? {
            lines: passagePackage.referenceBankLines,
            authority: passagePackage.referenceBankLines.length > 0 ? 'heuristic-fallback' : 'none',
          }
        : {
            lines: [],
            authority: 'none',
          };
  }

  return {
    lines: uniqueLines(passagePackage.referenceBankLines.filter((line) =>
      spans.some((span) => line.lineNumber >= span.startLine && line.lineNumber <= span.endLine),
    )),
    authority: matchingHint?.referenceBankLines?.length ? 'group-span' : 'package-span',
  };
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
): {
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
} => {
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [];

  return {
    transcript: {
      ...transcript,
      groups: transcript.groups.map((group) => {
        const bankRecovery = referenceBankRecoveryForGroup(passagePackage, group.questionRange);
        const sourceBankItems = sourceBankItemsFromLines(bankRecovery.lines);

        if (sourceBankItems.length === 0) {
          return group;
        }

        const needsReferenceBank = groupUsesReferenceBank(group.taskType) && !group.sectionReferences?.length;
        const needsOptionBank = groupUsesOptionBank(group.taskType) && !group.labeledOptions?.length;
        if (!needsReferenceBank && !needsOptionBank) {
          return group;
        }

        if (bankRecovery.authority === 'heuristic-fallback') {
          diagnostics.push({
            code: 'bank-ownership-heuristic-used',
            severity: 'warning',
            message: `Question range ${readingV2AutoQuestionRangeKey(group.questionRange)} recovered its bank from fallback passage/package bank lines because explicit bank ownership spans were missing.`,
            passageNumber: passagePackage.passageNumber,
            questionNumber: group.questionRange.start,
            sourceRange: `Q${group.questionRange.start}-${group.questionRange.end}`,
            groupRange: readingV2AutoQuestionRangeKey(group.questionRange),
            stage: 'repaired-transcript',
            repairScopes: ['task-group'],
          });
        }

        if (needsReferenceBank) {
          return {
            ...group,
            sectionReferences: sourceBankItems,
          };
        }

        if (needsOptionBank) {
          return {
            ...group,
            labeledOptions: sourceBankItems,
          };
        }

        return group;
      }),
    },
    diagnostics,
  };
};

const canonicalizeTranscriptQuestionsFromSourceLines = (
  transcript: ReadingV2AutoQuestionTranscript,
  passagePackage: ReadingV2AutoPassagePackage,
): {
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
} => {
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [];

  return {
    transcript: {
      ...transcript,
      groups: transcript.groups.map((group) => {
        const matchingHint = passagePackage.groupHints.find((groupHint) =>
          groupHint.questionRange.start === group.questionRange.start
          && groupHint.questionRange.end === group.questionRange.end,
        );
        const groupLines = passagePackage.questionAreaLines.filter((line) =>
          line.lineNumber >= (matchingHint?.lines.startLine ?? group.questionRange.start)
          && line.lineNumber <= (matchingHint?.lines.endLine ?? group.questionRange.end),
        );
        const groupQuestionNumbers = numbersInRange(group.questionRange);
        const questionProofByNumber = new Map<number, {
          readonly sourceLine: ReadingV2AutoPassagePackageLine;
          readonly canonicalSourceTextExact: string;
          readonly canonicalPromptText: string;
        }>();
        let groupChanged = false;

        const questions = group.questions.map((question) => {
          const onlySourceLine = question.sourceLines?.length === 1 ? question.sourceLines[0] : undefined;
          const explicitSourceLine = typeof onlySourceLine === 'number'
            ? groupLines.find((line) => line.lineNumber === onlySourceLine)
            : undefined;
          const explicitCanonicalSourceTextExact = explicitSourceLine
            ? canonicalQuestionSourceTextFromLine({
                lineText: explicitSourceLine.text,
                questionNumber: question.number,
                groupQuestionNumbers,
                taskType: group.taskType,
              })
            : null;
          const inferredSourceLine = explicitCanonicalSourceTextExact
            ? explicitSourceLine
            : groupLines.find((line) => readingV2AutoLineMatchesQuestionNumber(line.text, question.number));

          if (!inferredSourceLine) {
            return question;
          }

          const canonicalSourceTextExact = explicitCanonicalSourceTextExact
            ?? canonicalQuestionSourceTextFromLine({
            lineText: inferredSourceLine.text,
            questionNumber: question.number,
            groupQuestionNumbers,
            taskType: group.taskType,
          });
          if (!canonicalSourceTextExact) {
            return question;
          }

          const canonicalPromptText = normalizedPromptTextFromSourceText(
            canonicalSourceTextExact,
            question.number,
          );
          questionProofByNumber.set(question.number, {
            sourceLine: inferredSourceLine,
            canonicalSourceTextExact,
            canonicalPromptText,
          });
          const currentSourceTextExact = question.sourceTextExact?.trim();
          const needsCanonicalization = currentSourceTextExact !== canonicalSourceTextExact
            || question.sourceLines?.length !== 1
            || question.sourceLines[0] !== inferredSourceLine.lineNumber;

          if (!needsCanonicalization) {
            return question;
          }

          const sourceLineDriftOnly = currentSourceTextExact === canonicalSourceTextExact
            && question.sourceLines?.length === 1
            && question.sourceLines[0] !== inferredSourceLine.lineNumber;
          groupChanged = true;
          diagnostics.push({
            code: 'repair-applied',
            severity: 'info',
            message: sourceLineDriftOnly
              ? `Local source-line canonicalization realigned question ${question.number} to source line ${inferredSourceLine.lineNumber} because provider source-line anchors drifted away from the local question line.`
              : `Local source-line canonicalization restored question ${question.number} from source line ${inferredSourceLine.lineNumber} because provider prompt text dropped visible source context.`,
            passageNumber: passagePackage.passageNumber,
            questionNumber: question.number,
            sourceRange: `Q${question.number}`,
            groupRange: readingV2AutoQuestionRangeKey(group.questionRange),
            stage: 'repaired-transcript',
            repairScopes: ['structured-layout-block'],
          });

          return {
            ...question,
            sourceTextExact: canonicalSourceTextExact,
            normalizedPromptText: canonicalPromptText,
            promptText: canonicalPromptText,
            sourceLines: [inferredSourceLine.lineNumber],
          };
        });

        const canonicalizeNoteLine = (
          line: NonNullable<NonNullable<typeof group.note>['lines']>[number],
        ) => {
          const questionNumber = line.questionNumber
            ?? (line.questionNumbers?.length === 1 ? line.questionNumbers[0] : undefined);
          if (!questionNumber) {
            return line;
          }

          const proof = questionProofByNumber.get(questionNumber);
          if (!proof) {
            return line;
          }

          const canonicalSourceTextExact = proof.sourceLine.text.trim();
          const canonicalNormalizedText = normalizedPromptTextFromSourceText(
            canonicalSourceTextExact,
            questionNumber,
          );
          const currentSourceLines = line.sourceLines?.join(',') ?? '';
          const canonicalSourceLines = String(proof.sourceLine.lineNumber);
          const needsCanonicalization = line.sourceTextExact?.trim() !== canonicalSourceTextExact
            || (line.normalizedText?.trim() ?? line.text.trim()) !== canonicalNormalizedText
            || currentSourceLines !== canonicalSourceLines;

          if (!needsCanonicalization) {
            return line;
          }

          groupChanged = true;
          return {
            ...line,
            sourceTextExact: canonicalSourceTextExact,
            normalizedText: canonicalNormalizedText,
            text: canonicalNormalizedText,
            sourceLines: [proof.sourceLine.lineNumber],
            questionNumber,
          };
        };

        const note = group.note
          ? {
              ...group.note,
              ...(group.note.lines
                ? { lines: group.note.lines.map(canonicalizeNoteLine) }
                : {}),
              ...(group.note.sections
                ? {
                    sections: group.note.sections.map((section) => ({
                      ...section,
                      ...(section.lines
                        ? { lines: section.lines.map(canonicalizeNoteLine) }
                        : {}),
                    })),
                  }
                : {}),
            }
          : undefined;

        return groupChanged
          ? {
              ...group,
              questions,
              ...(note ? { note } : {}),
            }
          : group;
      }),
    },
    diagnostics,
  };
};

const repairTranscriptGroupFromQuestionArea = (
  passagePackage: ReadingV2AutoPassagePackage,
  groupHint: ReadingV2AutoPassagePackage['groupHints'][number],
): ReadingV2AutoQuestionTranscript['groups'][number] | null => {
  const taskType = normalizeAutoV3TaskTypeHint(groupHint.taskTypeHint);

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
    const sourceTextExact = matchingLine
      ? canonicalQuestionSourceTextFromLine({
          lineText: matchingLine.text,
          questionNumber,
          groupQuestionNumbers: questionNumbers,
          taskType,
        })
      : null;
    const normalizedPromptText = sourceTextExact
      ? normalizedPromptTextFromSourceText(sourceTextExact, questionNumber)
      : undefined;
    return matchingLine && sourceTextExact
      ? {
          number: questionNumber,
          promptText: normalizedPromptText ?? sourceTextExact,
          ...(sourceTextExact ? { sourceTextExact } : {}),
          ...(normalizedPromptText ? { normalizedPromptText } : {}),
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

const lineBlockForGroq = (lines: readonly ReadingV2AutoPassagePackageLine[]): string =>
  lines
    .map((line) => `${String(line.lineNumber).padStart(4, '0')} [${line.trimmedTextHash}] ${line.text}`)
    .join('\n');

const redactAnswerRow = (
  row: ReadingV2AutoPassagePackage['answerKeyRows'][number],
): string => `Q${row.questionNumber} answerLength=${row.answer.length} sourceLine=${row.sourceLine}`;

const buildTargetedGroqInputText = (input: {
  readonly passagePackage: ReadingV2AutoPassagePackage;
  readonly groupHint: ReadingV2AutoPassagePackage['groupHints'][number];
  readonly questionAreaLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly referenceBankLines: readonly ReadingV2AutoPassagePackageLine[];
  readonly answerKeyRows: ReadingV2AutoPassagePackage['answerKeyRows'];
}): string => [
  `READING_V2_AUTO_V3_PASSAGE_PACKAGE ${input.passagePackage.passageNumber}`,
  `sourceHash: ${input.passagePackage.sourceHash}`,
  `expectedQuestionRange: ${input.groupHint.questionRange.start}-${input.groupHint.questionRange.end}`,
  `groupHints: ${JSON.stringify([input.groupHint])}`,
  `referenceBankLineSpans: ${JSON.stringify(input.groupHint.referenceBankLines ?? input.passagePackage.referenceBankLineSpans)}`,
  `answerRows: ${input.answerKeyRows.map(redactAnswerRow).join('; ') || 'none'}`,
  '',
  'REFERENCE_BANK_LINES_ONLY:',
  input.referenceBankLines.length > 0 ? lineBlockForGroq(input.referenceBankLines) : 'none',
  '',
  'QUESTION_AREA_LINES_ONLY:',
  lineBlockForGroq(input.questionAreaLines),
].join('\n');

const buildTargetedRetryPassagePackage = (
  passagePackage: ReadingV2AutoPassagePackage,
  groupHint: ReadingV2AutoPassagePackage['groupHints'][number],
): ReadingV2AutoPassagePackage => {
  const questionAreaLines = passagePackage.questionAreaLines.filter((line) =>
    line.lineNumber >= groupHint.lines.startLine
    && line.lineNumber <= groupHint.lines.endLine,
  );
  const bankRecovery = referenceBankRecoveryForGroup(passagePackage, groupHint.questionRange);
  const referenceBankLines = bankRecovery.lines.length > 0
    ? bankRecovery.lines
    : passagePackage.referenceBankLines;
  const answerKeyRows = passagePackage.answerKeyRows.filter((row) =>
    row.questionNumber >= groupHint.questionRange.start
    && row.questionNumber <= groupHint.questionRange.end,
  );
  const targetedPackage: ReadingV2AutoPassagePackage = {
    ...passagePackage,
    expectedQuestionRange: groupHint.questionRange,
    questionAreaLines,
    questionAreaText: questionAreaLines.map((line) => line.text).join('\n'),
    groupHints: [groupHint],
    referenceBankLines,
    referenceBankLineSpans: groupHint.referenceBankLines ?? passagePackage.referenceBankLineSpans,
    answerKeyRows,
    groqInputText: '',
  };

  return {
    ...targetedPackage,
    groqInputText: buildTargetedGroqInputText({
      passagePackage: targetedPackage,
      groupHint,
      questionAreaLines,
      referenceBankLines,
      answerKeyRows,
    }),
  };
};

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const coverageSummaryGroupSet = (
  coverageSummary: ReadingV2AutoTranscriptCoverageSummary | undefined,
): ReadonlySet<string> => new Set(coverageSummary?.coveredGroups ?? []);

const coverageSummaryQuestionSet = (
  coverageSummary: ReadingV2AutoTranscriptCoverageSummary | undefined,
): ReadonlySet<number> => new Set(coverageSummary?.coveredQuestions ?? []);

const replayBundleEvidenceLines = (
  bundle: ReadingV2AutoV3PackageReplayBundle,
): readonly string[] => [
  [
    `Auto V3 replay P${bundle.passageNumber}`,
    `schema=${bundle.schemaVersion}`,
    `sourceHash=${bundle.sourceHash}`,
    `packageHash=${bundle.packageHash}`,
    `promptHash=${bundle.promptHash}`,
    `expected=${bundle.expectedQuestionRange}`,
    `rawGroups=${bundle.rawGroupRanges.join(',') || 'none'}`,
    `normalized=${bundle.normalizedTranscriptGroupRanges.join(',') || 'none'}`,
    `repaired=${bundle.repairedTranscriptGroupRanges.join(',') || 'none'}`,
    `issues=${bundle.finalVerifierIssueCodes.join(',') || 'none'}`,
  ].join(' | '),
  [
    `Auto V3 replay detail P${bundle.passageNumber}`,
    `lineCount=${bundle.questionAreaLineCount}`,
    `slot=${bundle.keyFingerprint ?? 'none'}`,
    `keyIndex=${bundle.preferredKeyIndex ?? -1}`,
    `attempts=${bundle.attempts}`,
    `stages=${bundle.stageTransitions.join(' -> ')}`,
    `rawShape=${bundle.rawJsonShapeSummary}`,
  ].join(' | '),
];

const recoverTranscriptCoverageForPassage = async (input: {
  readonly passagePackage: ReadingV2AutoPassagePackage;
  readonly packageResult: ReadingV2GroqPackageFanoutPackageResult;
  readonly provider: ReadingV2GroqPackageFanoutProvider;
  readonly options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>;
}): Promise<{
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
  readonly verifierDiagnostics: readonly ReadingV2AutoQuestionTranscriptDiagnostic[];
  readonly replayBundle: ReadingV2AutoV3PackageReplayBundle;
}> => {
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [];
  const stageTransitions = ['raw-groq', 'normalized-transcript'];
  let transcript = input.packageResult.transcript;
  emitReadingV2AutoRawDebug(input.options, 'v3_package_debug_capture', {
    stage: 'raw-groq',
    passageNumber: input.passagePackage.passageNumber,
    preferredKeyIndex: input.packageResult.preferredKeyIndex,
    keyFingerprint: input.packageResult.keyFingerprint,
    prompt: input.packageResult.prompt,
    promptHash: input.packageResult.promptHash,
    providerPayload: input.packageResult.rawStructuredJson,
  });
  const normalizedGroupRanges = readingV2AutoTranscriptGroupRangeKeys(transcript);
  const rawCoverageGroups = coverageSummaryGroupSet(input.packageResult.rawCoverageSummary);
  const rawCoverageQuestions = coverageSummaryQuestionSet(input.packageResult.rawCoverageSummary);
  const rawGroupRanges = new Set(input.packageResult.rawGroupRanges);
  const normalizedGroupSet = new Set(normalizedGroupRanges);
  const missingHints = input.passagePackage.groupHints.filter((groupHint) =>
    !normalizedGroupSet.has(readingV2AutoQuestionRangeKey(groupHint.questionRange)),
  );

  missingHints.forEach((groupHint) => {
    const groupRange = readingV2AutoQuestionRangeKey(groupHint.questionRange);
    const rawGroupCovered = rawGroupRanges.has(groupRange) || rawCoverageGroups.has(groupRange);
        diagnostics.push({
          code: rawGroupCovered ? 'app-normalizer-dropped-group' : 'groq-output-missing-group',
          severity: 'warning',
      message: rawGroupCovered
        ? `Groq raw output referenced hinted group ${groupRange}, but local transcript normalization lost it before verification.`
        : `Groq output omitted hinted group ${groupRange}.`,
      passageNumber: input.passagePackage.passageNumber,
      questionNumber: groupHint.questionRange.start,
      sourceRange: `Q${groupRange}`,
      groupRange,
          stage: rawGroupCovered ? 'normalized-transcript' : 'raw-groq',
          preferredKeyIndex: input.packageResult.preferredKeyIndex,
          keyFingerprint: input.packageResult.keyFingerprint,
          repairScopes: ['question-range'],
        });
      });

  if (missingHints.length > 0) {
    const repairedTranscript = repairMissingTranscriptGroups(transcript, input.passagePackage);
    const repairedGroupSet = new Set(readingV2AutoTranscriptGroupRangeKeys(repairedTranscript));

    missingHints.forEach((groupHint) => {
      const groupRange = readingV2AutoQuestionRangeKey(groupHint.questionRange);
      if (repairedGroupSet.has(groupRange)) {
        diagnostics.push({
          code: 'repair-applied',
          severity: 'info',
          message: `Local deterministic repair rebuilt missing group ${groupRange} from source lines ${groupHint.lines.startLine}-${groupHint.lines.endLine} with source-proven question coverage.`,
          passageNumber: input.passagePackage.passageNumber,
          questionNumber: groupHint.questionRange.start,
          sourceRange: `Q${groupRange}`,
          groupRange,
          stage: 'repaired-transcript',
          preferredKeyIndex: input.packageResult.preferredKeyIndex,
          keyFingerprint: input.packageResult.keyFingerprint,
          repairScopes: ['question-range'],
        });
      } else {
        diagnostics.push({
          code: 'repair-skipped',
          severity: 'warning',
          message: `Local deterministic repair could not prove every expected line for missing group ${groupRange} from source lines ${groupHint.lines.startLine}-${groupHint.lines.endLine}; targeted Groq retry required.`,
          passageNumber: input.passagePackage.passageNumber,
          questionNumber: groupHint.questionRange.start,
          sourceRange: `Q${groupRange}`,
          groupRange,
          stage: 'repaired-transcript',
          preferredKeyIndex: input.packageResult.preferredKeyIndex,
          keyFingerprint: input.packageResult.keyFingerprint,
          repairScopes: ['question-range'],
        });
      }
    });

    transcript = repairedTranscript;
    stageTransitions.push('repaired-transcript');
  }

  const remainingHints = input.passagePackage.groupHints.filter((groupHint) =>
    !new Set(readingV2AutoTranscriptGroupRangeKeys(transcript)).has(readingV2AutoQuestionRangeKey(groupHint.questionRange)),
  );
  if (remainingHints.length > 0) {
    stageTransitions.push('targeted-retry');
  }

  for (const groupHint of remainingHints) {
    const groupRange = readingV2AutoQuestionRangeKey(groupHint.questionRange);
    const targetedPackage = buildTargetedRetryPassagePackage(input.passagePackage, groupHint);
    const targetedRetry = await normalizeReadingV2AutoQuestionArea({
      passagePackage: targetedPackage,
      provider: input.provider,
      preferredKeyIndex: input.packageResult.preferredKeyIndex,
    });

    if (!targetedRetry.success) {
      emitReadingV2AutoRawDebug(input.options, 'v3_package_debug_capture', {
        stage: 'targeted-retry',
        passageNumber: input.passagePackage.passageNumber,
        groupRange,
        preferredKeyIndex: input.packageResult.preferredKeyIndex,
        keyFingerprint: input.packageResult.keyFingerprint,
        providerResult: 'failure',
        error: targetedRetry.error,
      });
      diagnostics.push({
        code: 'repair-failed',
        severity: 'error',
        message: `Targeted Groq retry failed for missing group ${groupRange} after deterministic repair skipped source lines ${groupHint.lines.startLine}-${groupHint.lines.endLine}: ${targetedRetry.error}`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: groupHint.questionRange.start,
        sourceRange: `Q${groupRange}`,
        groupRange,
        stage: 'targeted-retry',
        preferredKeyIndex: input.packageResult.preferredKeyIndex,
        keyFingerprint: input.packageResult.keyFingerprint,
        providerResult: 'failure',
        repairScopes: ['question-range'],
      });
      continue;
    }

    emitReadingV2AutoRawDebug(input.options, 'v3_package_debug_capture', {
      stage: 'targeted-retry',
      passageNumber: input.passagePackage.passageNumber,
      groupRange,
      preferredKeyIndex: input.packageResult.preferredKeyIndex,
      keyFingerprint: input.packageResult.keyFingerprint,
      providerResult: 'success',
      prompt: targetedRetry.data.prompt,
      promptHash: targetedRetry.data.promptHash,
      providerPayload: targetedRetry.data.rawStructuredJson,
    });
    const targetedGroup = targetedRetry.data.transcript.groups.find((group) =>
      group.questionRange.start === groupHint.questionRange.start
      && group.questionRange.end === groupHint.questionRange.end,
    );
    if (!targetedGroup) {
      diagnostics.push({
        code: 'repair-failed',
        severity: 'error',
        message: `Targeted Groq retry returned no transcript group for ${groupRange}.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: groupHint.questionRange.start,
        sourceRange: `Q${groupRange}`,
        groupRange,
        stage: 'targeted-retry',
        preferredKeyIndex: input.packageResult.preferredKeyIndex,
        keyFingerprint: input.packageResult.keyFingerprint,
        providerResult: 'failure',
        repairScopes: ['question-range'],
      });
      continue;
    }

    transcript = {
      ...transcript,
      groups: [...transcript.groups, targetedGroup].sort((left, right) =>
        left.questionRange.start - right.questionRange.start
        || left.questionRange.end - right.questionRange.end,
      ),
    };
    diagnostics.push({
      code: 'repair-applied',
      severity: 'info',
      message: `Targeted Groq retry restored missing group ${groupRange} after deterministic repair could not prove source lines ${groupHint.lines.startLine}-${groupHint.lines.endLine}.`,
      passageNumber: input.passagePackage.passageNumber,
      questionNumber: groupHint.questionRange.start,
      sourceRange: `Q${groupRange}`,
      groupRange,
      stage: 'targeted-retry',
      preferredKeyIndex: input.packageResult.preferredKeyIndex,
      keyFingerprint: input.packageResult.keyFingerprint,
      providerResult: 'success',
      repairScopes: ['question-range'],
    });
  }

  const bankEnrichment = enrichTranscriptWithReferenceBanks(transcript, input.passagePackage);
  transcript = bankEnrichment.transcript;
  diagnostics.push(...bankEnrichment.diagnostics);
  if (bankEnrichment.diagnostics.length > 0 && !stageTransitions.includes('repaired-transcript')) {
    stageTransitions.push('repaired-transcript');
  }

  const sourceCanonicalization = canonicalizeTranscriptQuestionsFromSourceLines(transcript, input.passagePackage);
  transcript = sourceCanonicalization.transcript;
  diagnostics.push(...sourceCanonicalization.diagnostics);
  if (sourceCanonicalization.diagnostics.length > 0 && !stageTransitions.includes('repaired-transcript')) {
    stageTransitions.push('repaired-transcript');
  }

  const stillMissingHints = input.passagePackage.groupHints.filter((groupHint) =>
    !new Set(readingV2AutoTranscriptGroupRangeKeys(transcript)).has(readingV2AutoQuestionRangeKey(groupHint.questionRange)),
  );
  stillMissingHints.forEach((groupHint) => {
    const groupRange = readingV2AutoQuestionRangeKey(groupHint.questionRange);
    diagnostics.push({
      code: 'group-coverage-mismatch',
      severity: 'error',
      message: `Expected group ${groupRange} is still missing after Groq output, local repair, and targeted retry.`,
      passageNumber: input.passagePackage.passageNumber,
      questionNumber: groupHint.questionRange.start,
      sourceRange: `Q${groupRange}`,
      groupRange,
      stage: 'final-verifier',
      preferredKeyIndex: input.packageResult.preferredKeyIndex,
      keyFingerprint: input.packageResult.keyFingerprint,
      repairScopes: ['question-range'],
    });
  });

  stageTransitions.push('final-verifier');
  const verifierDiagnostics = verifyReadingV2AutoQuestionTranscript({
    transcript,
    passagePackage: input.passagePackage,
  });
  const replayBundle: ReadingV2AutoV3PackageReplayBundle = {
    schemaVersion: AUTO_V3_REPLAY_SCHEMA_VERSION,
    passageNumber: input.passagePackage.passageNumber,
    sourceHash: input.passagePackage.sourceHash,
    packageHash: hashString(input.passagePackage.groqInputText),
    expectedQuestionRange: readingV2AutoQuestionRangeKey(input.passagePackage.expectedQuestionRange),
    groupHints: input.passagePackage.groupHints.map((groupHint) =>
      `${readingV2AutoQuestionRangeKey(groupHint.questionRange)}:${groupHint.taskTypeHint ?? 'unknown'}`,
    ),
    referenceBankLineSpans: input.passagePackage.referenceBankLineSpans.map((span) =>
      `${span.startLine}-${span.endLine}`,
    ),
    questionAreaLineCount: input.passagePackage.questionAreaLines.length,
    promptHash: input.packageResult.promptHash,
    preferredKeyIndex: input.packageResult.preferredKeyIndex,
    keyFingerprint: input.packageResult.keyFingerprint,
    attempts: input.packageResult.attempts,
    rawJsonShapeSummary: input.packageResult.rawJsonShapeSummary,
    rawGroupRanges: input.packageResult.rawGroupRanges,
    rawCoverageGroups: [...rawCoverageGroups],
    rawCoverageQuestions: [...rawCoverageQuestions],
    normalizedTranscriptGroupRanges: normalizedGroupRanges,
    repairedTranscriptGroupRanges: readingV2AutoTranscriptGroupRangeKeys(transcript),
    finalVerifierIssueCodes: unique(verifierDiagnostics.map((diagnostic) => diagnostic.code)),
    stageTransitions: unique(stageTransitions),
  };

  emitReadingV2AutoImportDiag(input.options, 'v3_package_replay', replayBundle as unknown as Record<string, unknown>);

  return {
    transcript,
    diagnostics,
    verifierDiagnostics,
    replayBundle,
  };
};

const generateReadingV2AutoImportCandidateV4 = async (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly extractor: ReadingV2AutoV4Extractor;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>;
}): Promise<ReadingV2AutoImportResult> => {
  const extractedAnswerKeyText = extractAnswerKeyTextFromRaw(input.sourceLedger.normalizedText);
  const chunks = splitSourceIntoChunks(input.sourceLedger.normalizedText, input.sourceLedger);
  const hasVisibleAnswerKeyHeading = rawTextHasAnswerKeyHeading(input.sourceLedger.normalizedText);

  emitReadingV2AutoImportDiag(input.options, 'auto_v4_preflight_complete', {
    sourceLength: input.sourceLedger.normalizedText.length,
    chunkCount: chunks.length,
    answerKeyDetected: Boolean(extractedAnswerKeyText),
    answerKeyHeadingDetected: hasVisibleAnswerKeyHeading,
    sourceLedgerCategory: input.sourceLedger.category,
    sourceLedgerPassageCount: input.sourceLedger.passages.length,
    sourceLedgerQuestionCount: input.sourceLedger.questionNumbers.length,
    sourceLedgerAnswerKeyRowCount: input.sourceLedger.answerKeyRows.length,
    sourceName: input.request.sourceName ?? null,
  });

  const passagesResult = await input.extractor.parsePassagesOnly(input.sourceLedger.normalizedText);
  if (!passagesResult.success) {
    const error = passagesResult.error ?? 'Auto V4 passage parser failed.';
    emitReadingV2AutoRawDebug(input.options, 'auto_v4_passages_debug_capture', {
      stage: 'auto-v4-passages',
      providerResult: 'failure',
      error,
    });
    return {
      success: false,
      error,
      diagnostics: [
        ...providerQuotaDiagnosticsFor(error),
        {
          code: 'gemini-request-failed',
          severity: 'error',
          message: error,
          providerResult: 'failure',
        },
      ],
      provider: 'gemini',
      model: AUTO_V4_MODEL_LABEL,
    };
  }

  const questionsResult = await input.extractor.parseQuestionsAndAnswers(input.sourceLedger.normalizedText);
  if (!questionsResult.success) {
    const error = questionsResult.error ?? 'Auto V4 question parser failed.';
    emitReadingV2AutoRawDebug(input.options, 'auto_v4_questions_debug_capture', {
      stage: 'auto-v4-questions',
      providerResult: 'failure',
      error,
    });
    return {
      success: false,
      error,
      diagnostics: [
        ...providerQuotaDiagnosticsFor(error),
        {
          code: 'gemini-request-failed',
          severity: 'error',
          message: error,
          providerResult: 'failure',
        },
      ],
      provider: 'gemini',
      model: AUTO_V4_MODEL_LABEL,
    };
  }

  const copiedV4AnswerKeyText = hasVisibleAnswerKeyHeading
    ? autoV4AnswerKeyText(questionsResult.data.answerKey)
    : undefined;
  const answerKeyText = extractedAnswerKeyText ?? copiedV4AnswerKeyText;
  const payload = buildAutoPayloadFromAutoV4Results({
    request: input.request,
    sourceLedger: input.sourceLedger,
    passagesResult: passagesResult.data,
    questionsResult: questionsResult.data,
    answerKeyText,
  });
  const payloadState = buildAutoPayloadState(
    input.request,
    extractedAnswerKeyText,
    input.sourceLedger,
    [{
      chunk: {
        text: input.sourceLedger.normalizedText,
        expectedQuestionNumbers: input.sourceLedger.questionNumbers,
      },
      payload,
    }],
  );
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    {
      code: 'auto-v4-staged-parser-used',
      severity: 'info',
      message: 'Auto V4 used staged Reading parser outputs, then adapted them locally into Reading V2 structured payload.',
    },
    ...(payloadState.answerKeyText
      ? [{
          code: extractedAnswerKeyText ? 'answer-key-extracted' as const : 'answer-key-returned-by-gemini' as const,
          severity: 'info' as const,
          message: extractedAnswerKeyText
            ? 'Auto extracted answer-key rows from the raw source.'
            : 'Auto V4 parser returned copied answer-key rows from a visible source heading.',
        }]
      : [{
          code: 'answer-key-missing' as const,
          severity: 'warning' as const,
          message: 'No source answer-key section was detected. Answers stay empty for Studio review.',
        }]),
  ];

  return finalizeAutoImportPayload({
    request: input.request,
    sourceLedger: input.sourceLedger,
    chunks,
    payload: payloadState.payload,
    answerKeyText: payloadState.answerKeyText,
    diagnostics,
    verifierIssues: payloadState.verifierIssues,
    provider: 'gemini',
    model: AUTO_V4_MODEL_LABEL,
  });
};

const generateReadingV2AutoImportCandidateV3 = async (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly generator: ReadingV2AutoStructuredGenerator;
  readonly questionAreaNormalizer: ReadingV2GroqPackageFanoutProvider;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>;
}): Promise<ReadingV2AutoImportResult> => {
  const topology = await markReadingV2AutoTopology({
    ledger: input.sourceLedger,
    generator: input.generator,
  });

  if (!topology.success) {
    const topologyDiagnostics = diagnosticsFromTopologyMarker(topology.diagnostics ?? []);
    return {
      success: false,
      error: topology.error,
      diagnostics: [
        ...providerQuotaDiagnosticsFor(topology.error),
        ...(topologyDiagnostics.length > 0
          ? topologyDiagnostics
          : [{
              code: 'topology-marker-failed' as const,
              severity: 'error' as const,
              message: topology.error,
            }]),
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
    };
  });
  const recoveredPackages = await Promise.all(packageResults.map(async (packageResult) => {
    const recovered = await recoverTranscriptCoverageForPassage({
      passagePackage: packageResult.passagePackage,
      packageResult,
      provider: input.questionAreaNormalizer,
      options: input.options,
    });

    return {
      ...packageResult,
      transcript: recovered.transcript,
      packageDiagnostics: recovered.diagnostics,
      verifierDiagnostics: recovered.verifierDiagnostics,
      replayBundle: recovered.replayBundle,
    };
  }));

  const transcriptDiagnostics = recoveredPackages.flatMap(({ verifierDiagnostics }) => verifierDiagnostics);
  const mappedTranscriptDiagnostics = diagnosticsFromTranscript(transcriptDiagnostics);
  const replayDiagnostics = recoveredPackages.flatMap(({ packageDiagnostics }) => packageDiagnostics);
  if ([...replayDiagnostics, ...mappedTranscriptDiagnostics].some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: false,
      error: [...replayDiagnostics, ...mappedTranscriptDiagnostics].find((diagnostic) => diagnostic.severity === 'error')?.message
        ?? 'Groq transcript failed source-fidelity verification.',
      diagnostics: [
        ...markerDiagnostics,
        ...packageDiagnostics,
        ...diagnosticsFromGroqFanout(fanout.data.diagnostics),
        ...replayDiagnostics,
        ...mappedTranscriptDiagnostics,
      ],
      provider: AUTO_V3_PROVIDER,
      model: AUTO_V3_MODEL_LABEL,
    };
  }

  const materials: AutoMaterial[] = recoveredPackages.map(({ transcript, passagePackage }) => {
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
  recoveredPackages.forEach(({ transcript }) => {
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
    ...replayDiagnostics,
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
    extraEvidence: recoveredPackages.flatMap(({ replayBundle }) => replayBundleEvidenceLines(replayBundle)),
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

  const useV3Pipeline = options.forceV3Pipeline === true;
  if (useV3Pipeline) {
    return generateReadingV2AutoImportCandidateV3({
      request,
      generator,
      questionAreaNormalizer: options.questionAreaNormalizer ?? groqProvider,
      sourceLedger,
      options,
    });
  }

  if (!options.generator || options.v4Extractor) {
    return generateReadingV2AutoImportCandidateV4({
      request,
      extractor: options.v4Extractor ?? aiService,
      sourceLedger,
      options,
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
    captureRawProviderDebug: options.captureRawProviderDebug,
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
