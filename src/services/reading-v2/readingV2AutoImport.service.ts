import type {
  AIQuestion,
  AIPassage,
  AIPassagesOnlyResult,
  AIQuestionsAndAnswersResult,
  AIStructuredGenerationOptions,
} from '../ai/ai.service';
import { aiService } from '../ai/router.service';
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
  READING_V2_CANONICAL_TASK_TYPES,
  normalizeReadingV2TaskType,
  type ReadingV2CanonicalTaskType,
} from '../../types/readingV2Taxonomy';
import {
  buildReadingV2ImportSourceArtifact,
  buildReadingV2AutoLedgerPromptSummary,
  buildReadingV2AutoSourceLedger,
  readingV2AutoSourceLedgerEvidence,
  verifyReadingV2AutoPayloadAgainstLedger,
  type ReadingV2AutoLedgerPayload,
  type ReadingV2AutoSourceLedger,
  type ReadingV2AutoSourceVerifierIssue,
  type ReadingV2ImportSourceArtifact,
} from './readingV2AutoImportSourceLedger.service';
import {
  READING_V2_AUTO_COMPLETION_BLANK_PATTERN,
  normalizeReadingV2AutoSourceProofText,
  readingV2AutoLineMatchesQuestionNumber,
  replaceReadingV2AutoCompletionBlanks,
} from './readingV2AutoTextGuards.service';
import {
  readingV2TaskUsesBlankMarkers,
  readingV2TaskUsesImportedLabeledOptions,
  readingV2TaskUsesPerQuestionLabeledOptions,
  readingV2TaskUsesPrimarySectionReferenceBank,
  readingV2TaskUsesSharedLabeledOptionBank,
} from './readingV2TaskComponentContracts.service';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const AUTO_V4_MODEL_LABEL = `${GEMINI_MODEL_NAME}+auto-v4-staged-adapter`;
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
export type ReadingV2AutoImportReviewStatus = 'ready' | 'needs_review' | 'blocked';
export type ReadingV2AutoPipelineLane = 'v4-full-doc' | 'legacy-gemini-chunk';

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
  | 'auto-pipeline-lane-selected'
  | 'auto-v4-provider-stage'
  | 'auto-v4-staged-parser-used'
  | 'auto-v4-source-authoritative-passage'
  | 'auto-v4-source-passage-drift'
  | 'group-quality-ready'
  | 'group-source-underrepresented'
  | 'note-heading-missing'
  | 'note-row-missing'
  | 'table-cell-missing'
  | 'table-column-missing'
  | 'instruction-shortened'
  | 'question-text-changed'
  | 'high-risk-token-changed'
  | 'source-encoding-artifact-preserved'
  | 'option-bank-duplicated'
  | 'duplicate-question-number'
  | 'task-type-conflict'
  | 'blank-mismatch'
  | 'source-proof-format-mismatch'
  | 'source-text-exact-missing'
  | 'normalized-text-source-drift';

export interface ReadingV2AutoImportDiagnostic {
  readonly code: ReadingV2AutoImportDiagnosticCode;
  readonly severity: ReadingV2AutoImportDiagnosticSeverity;
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly stage?: 'auto-v4-passages' | 'auto-v4-questions';
  readonly groupRange?: string;
  readonly attempt?: number;
  readonly sourceRange?: string;
  readonly verifierIssueCodes?: readonly ReadingV2AutoSourceVerifierIssue['code'][];
  readonly repairScopes?: readonly ReadingV2AutoRepairScope[];
  readonly providerResult?: 'success' | 'failure';
  readonly verifierResult?: 'passed' | 'failed';
}

export type ReadingV2GroupQualityStatus = 'ready' | 'weak' | 'blocked' | 'teacher-review';
export type ReadingV2GroupSourceSpanConfidence = 'high' | 'medium' | 'low';
export type ReadingV2GroupQualityRecommendedAction =
  | 'none'
  | 'deterministic-rehydrate'
  | 'teacher-review'
  | 'teacher-groq-repair'
  | 'blocked';

export interface ReadingV2GroupSourceSpan {
  readonly groupId: string;
  readonly questionRange: { readonly start: number; readonly end: number };
  readonly taskType: string;
  readonly confidence: ReadingV2GroupSourceSpanConfidence;
  readonly startLineId: string;
  readonly endLineId: string;
  readonly evidenceLineIds: readonly string[];
  readonly answerKeyLineIds: readonly string[];
  readonly optionBankLineIds: readonly string[];
  readonly warnings: readonly string[];
}

export interface ReadingV2GroupQualityRecord {
  readonly groupId: string;
  readonly questionRange: { readonly start: number; readonly end: number };
  readonly taskType: string;
  readonly status: ReadingV2GroupQualityStatus;
  readonly sourceSpanConfidence: ReadingV2GroupSourceSpanConfidence;
  readonly reasonCodes: readonly string[];
  readonly coverage: {
    readonly rawLineCount: number;
    readonly representedLineCount: number;
    readonly missingLineIds: readonly string[];
    readonly missingFields: readonly {
      readonly fieldId: string;
      readonly fieldKind: 'instruction' | 'question' | 'option-bank' | 'answer-key' | 'layout';
      readonly lineId: string;
      readonly sourceText: string;
      readonly normalizedText: string;
    }[];
    readonly rawStructuralUnitCount: number;
    readonly representedStructuralUnitCount: number;
    readonly missingStructuralUnits: readonly string[];
    readonly highRiskTokenChanges: readonly {
      readonly tokenKind: 'number' | 'date' | 'name' | 'question-id' | 'answer-label' | 'option-label' | 'blank-id';
      readonly rawValue: string;
      readonly studioValue: string;
      readonly lineId?: string;
    }[];
  };
  readonly recommendedAction: ReadingV2GroupQualityRecommendedAction;
  readonly sourceSpan?: ReadingV2GroupSourceSpan;
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

const autoPipelineLaneMessage = (lane: ReadingV2AutoPipelineLane): string => {
  switch (lane) {
    case 'v4-full-doc':
      return 'Auto pipeline lane selected: V4 full-document staged parser.';
    case 'legacy-gemini-chunk':
      return 'Auto pipeline lane selected: legacy Gemini chunk importer.';
    default:
      return 'Auto pipeline lane selected.';
  }
};

const autoPipelineLaneDiagnostic = (lane: ReadingV2AutoPipelineLane): ReadingV2AutoImportDiagnostic => ({
  code: 'auto-pipeline-lane-selected',
  severity: 'info',
  message: autoPipelineLaneMessage(lane),
});

const resolveAutoPipelineLane = (
  options: Pick<ReadingV2AutoImportOptions, 'pipelineLane' | 'forceV4Pipeline' | 'generator' | 'v4Extractor'>,
): ReadingV2AutoPipelineLane => {
  if (options.pipelineLane) {
    return options.pipelineLane;
  }

  if (options.forceV4Pipeline === true || options.v4Extractor) {
    return 'v4-full-doc';
  }

  if (!options.generator) {
    return 'v4-full-doc';
  }

  return 'legacy-gemini-chunk';
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
  readonly pipelineLane?: ReadingV2AutoPipelineLane;
  readonly waitBetweenChunksMs?: number;
  readonly maxInputChars?: number;
  readonly minInputChars?: number;
  readonly maxRepairAttempts?: number;
  readonly forceV4Pipeline?: boolean;
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
      readonly reviewStatus?: ReadingV2AutoImportReviewStatus;
      readonly structuredPayloadText: string;
      readonly answerKeyText?: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly sourceArtifact?: ReadingV2ImportSourceArtifact;
      readonly groupQualityRecords?: readonly ReadingV2GroupQualityRecord[];
      readonly provider: 'gemini';
      readonly model: string;
      readonly candidate: ReadingV2ImportCandidate;
      readonly passageCount: number;
      readonly questionCount: number;
    }
  | {
      readonly success: false;
      readonly reviewStatus?: ReadingV2AutoImportReviewStatus;
      readonly error: string;
      readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
      readonly sourceArtifact?: ReadingV2ImportSourceArtifact;
      readonly groupQualityRecords?: readonly ReadingV2GroupQualityRecord[];
      readonly provider: 'gemini';
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

const lineIdForSourceLine = (
  sourceLedger: ReadingV2AutoSourceLedger,
  lineNumber: number,
): string => sourceLedger.lineIndex.find((line) => line.lineNumber === lineNumber)?.lineId
  ?? `line-${String(lineNumber).padStart(4, '0')}`;

const sourceLinesBetween = (
  sourceLedger: ReadingV2AutoSourceLedger,
  startLine: number,
  endLine: number,
): readonly { readonly lineId: string; readonly lineNumber: number; readonly text: string; readonly normalizedText: string }[] =>
  sourceLedger.lineIndex
    .filter((line) => line.lineNumber >= startLine && line.lineNumber <= endLine)
    .map((line) => ({
      lineId: line.lineId,
      lineNumber: line.lineNumber,
      text: line.rawText,
      normalizedText: line.normalizedText,
    }));

const sourcePollutionLineNumbers = (
  sourceLedger: ReadingV2AutoSourceLedger,
): ReadonlySet<number> => new Set(sourceLedger.pollutionMarkers.map((marker) => marker.lineNumber));

const firstRepeatedTitlePollutionLineAfter = (
  sourceLedger: ReadingV2AutoSourceLedger,
  lineNumber: number,
): number | undefined =>
  sourceLedger.pollutionMarkers
    .filter((marker) => marker.code === 'repeated-title' && marker.lineNumber > lineNumber)
    .map((marker) => marker.lineNumber)
    .sort((left, right) => left - right)[0];

const rangesOverlap = (
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number },
): boolean => left.start <= right.end && right.start <= left.end;

const sourceSpanForGroup = (input: {
  readonly groupId: string;
  readonly questionRange: { readonly start: number; readonly end: number };
  readonly taskType: string;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
}): ReadingV2GroupSourceSpan | undefined => {
  const normalizedRange = {
    start: Math.min(input.questionRange.start, input.questionRange.end),
    end: Math.max(input.questionRange.start, input.questionRange.end),
  };
  const exactRange = input.sourceLedger.questionRanges.find((range) =>
    range.start === normalizedRange.start && range.end === normalizedRange.end,
  );
  const overlappingRange = exactRange ?? input.sourceLedger.questionRanges.find((range) =>
    rangesOverlap(normalizedRange, { start: range.start, end: range.end }),
  );

  if (!overlappingRange) {
    return undefined;
  }

  const nextQuestionRangeLine = input.sourceLedger.questionRanges
    .filter((range) => range.lineNumber > overlappingRange.lineNumber)
    .map((range) => range.lineNumber)
    .sort((left, right) => left - right)[0];
  const nextPassageLine = input.sourceLedger.passages
    .filter((passage) => passage.lineNumber > overlappingRange.lineNumber)
    .map((passage) => passage.lineNumber)
    .sort((left, right) => left - right)[0];
  const nextAnswerLine = input.sourceLedger.answerKeyRows
    .filter((row) => row.sourceLine > overlappingRange.lineNumber)
    .map((row) => row.sourceLine)
    .sort((left, right) => left - right)[0];
  const nextRepeatedTitleLine = firstRepeatedTitlePollutionLineAfter(input.sourceLedger, overlappingRange.lineNumber);
  const endLine = [
    nextQuestionRangeLine,
    nextPassageLine,
    nextAnswerLine,
    nextRepeatedTitleLine,
    input.sourceLedger.lineCount + 1,
  ]
    .filter((lineNumber): lineNumber is number => Number.isFinite(lineNumber))
    .sort((left, right) => left - right)[0]! - 1;
  const pollutionLineNumbers = sourcePollutionLineNumbers(input.sourceLedger);
  const evidenceLines = sourceLinesBetween(input.sourceLedger, overlappingRange.lineNumber, Math.max(overlappingRange.lineNumber, endLine))
    .filter((line) => line.normalizedText.length > 0)
    .filter((line) => !pollutionLineNumbers.has(line.lineNumber));
  const answerKeyLineIds = input.sourceLedger.answerKeyRows
    .filter((row) => row.questionNumber >= normalizedRange.start && row.questionNumber <= normalizedRange.end)
    .map((row) => lineIdForSourceLine(input.sourceLedger, row.sourceLine));
  const optionBankLineIds = input.sourceLedger.referenceBanks
    .filter((bank) => bank.questionRange && rangesOverlap(normalizedRange, bank.questionRange))
    .map((bank) => lineIdForSourceLine(input.sourceLedger, bank.lineNumber));
  const confidence: ReadingV2GroupSourceSpanConfidence = exactRange
    ? 'high'
    : overlappingRange
      ? 'medium'
      : 'low';

  return {
    groupId: input.groupId,
    questionRange: normalizedRange,
    taskType: input.taskType,
    confidence,
    startLineId: lineIdForSourceLine(input.sourceLedger, overlappingRange.lineNumber),
    endLineId: lineIdForSourceLine(input.sourceLedger, Math.max(overlappingRange.lineNumber, endLine)),
    evidenceLineIds: evidenceLines.map((line) => line.lineId),
    answerKeyLineIds,
    optionBankLineIds,
    warnings: confidence === 'high'
      ? []
      : [`Mapped source range is ${confidence}-confidence; teacher review required before repair.`],
  };
};

const stringsFromUnknown = (value: unknown, depth = 0): readonly string[] => {
  if (depth > 4 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => stringsFromUnknown(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      stringsFromUnknown(item, depth + 1),
    );
  }

  return [];
};

const normalizedCoverageText = (value: string): string =>
  normalizeReadingV2AutoSourceProofText(value.replace(/\\([()./|:_-])/g, '$1'));

const textContainsSourceLine = (representedText: string, sourceLine: string): boolean => {
  const normalizedSource = normalizedCoverageText(sourceLine);
  if (!normalizedSource || normalizedSource.length <= 2) {
    return true;
  }

  if (representedText.includes(normalizedSource)) {
    return true;
  }

  const withoutQuestionNumber = normalizedCoverageText(
    sourceLine.replace(/^\s*(?:[-*]\s*)?(?:\*\*)?\d{1,3}(?:\*\*)?(?:[).:\-])?\s+/, ''),
  );
  return Boolean(withoutQuestionNumber && representedText.includes(withoutQuestionNumber));
};

const simpleInstructionFlexibleTaskTypes = new Set<string>([
  'multiple-choice',
  'multiple-select',
  'true-false-not-given',
  'yes-no-not-given',
]);

const structuralCompletionTaskTypes = new Set<string>([
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
  'table-completion',
  'flowchart-completion',
  'diagram-labeling',
]);

const sourceEncodingArtifactPattern =
  /Ã|Â|\u00e2\u20ac|\u00e2\u20ac\u2122|\u00e2\u20ac\u0153|\u00e2\u20ac\u009d|â€|â€™|â€œ|â€|â€¦/;

const looksLikeInlineOptionBank = (lineText: string): boolean => {
  const text = compactWhitespace(cleanAutoV4TitleText(lineText));
  if (text.length > 260 || /[?]$/.test(text)) {
    return false;
  }

  const alphaItems = [...text.matchAll(/(?:^|\s)([A-Z])(?:[).:]|\s+)(?=\S)/g)];
  const romanItems = [...text.matchAll(/(?:^|\s)([ivxlcdm]{1,8})(?:[).:]|\s+)(?=\S)/gi)];
  return alphaItems.length >= 3 || romanItems.length >= 3;
};

const isInstructionLikeSourceLine = (lineText: string): boolean => {
  const text = normalizedCoverageText(lineText);
  return /\bchoose\b|\bcomplete\b|\bwrite\b|\bdo the following\b|\bin boxes?\b|\banswer sheet\b/.test(text);
};

const isQuestionRangeSourceLine = (lineText: string): boolean =>
  /^questions?\s+\d+/i.test(normalizedCoverageText(lineText));

const isAnswerKeySourceLine = (lineText: string): boolean =>
  /^answers?\b/i.test(normalizedCoverageText(lineText));

const sourceLineFieldKind = (
  line: { readonly lineId: string; readonly text: string },
  sourceSpan: ReadingV2GroupSourceSpan | undefined,
): 'instruction' | 'question' | 'option-bank' | 'answer-key' | 'layout' => {
  if (sourceSpan?.answerKeyLineIds.includes(line.lineId) || isAnswerKeySourceLine(line.text)) {
    return 'answer-key';
  }
  if (sourceSpan?.optionBankLineIds.includes(line.lineId) || looksLikeInlineOptionBank(line.text)) {
    return 'option-bank';
  }
  if (isInstructionLikeSourceLine(line.text) || isQuestionRangeSourceLine(line.text)) {
    return 'instruction';
  }
  if (
    sourceSpan
    && Array.from(
      { length: sourceSpan.questionRange.end - sourceSpan.questionRange.start + 1 },
      (_, index) => sourceSpan.questionRange.start + index,
    ).some((questionNumber) => readingV2AutoLineMatchesQuestionNumber(line.text, questionNumber))
  ) {
    return structuralCompletionTaskTypes.has(sourceSpan.taskType) ? 'layout' : 'question';
  }
  if (READING_V2_AUTO_COMPLETION_BLANK_PATTERN.test(line.text)) {
    return 'layout';
  }
  return 'question';
};

const sourceMissingFieldFor = (
  line: { readonly lineId: string; readonly text: string },
  sourceSpan: ReadingV2GroupSourceSpan | undefined,
): ReadingV2GroupQualityRecord['coverage']['missingFields'][number] => ({
  fieldId: `${sourceLineFieldKind(line, sourceSpan)}:${line.lineId}`,
  fieldKind: sourceLineFieldKind(line, sourceSpan),
  lineId: line.lineId,
  sourceText: line.text,
  normalizedText: normalizedCoverageText(line.text),
});

const highRiskTokensFromLine = (line: { readonly lineId: string; readonly text: string }): readonly {
  readonly tokenKind: ReadingV2GroupQualityRecord['coverage']['highRiskTokenChanges'][number]['tokenKind'];
  readonly rawValue: string;
  readonly lineId: string;
}[] => {
  const tokens: {
    tokenKind: ReadingV2GroupQualityRecord['coverage']['highRiskTokenChanges'][number]['tokenKind'];
    rawValue: string;
    lineId: string;
  }[] = [];
  const text = line.text;
  const questionMatch = text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(\d{1,3})(?:\*\*)?(?:[).:\-])?\s+\S+/);
  if (questionMatch?.[1]) {
    tokens.push({ tokenKind: 'question-id', rawValue: questionMatch[1], lineId: line.lineId });
  }

  for (const match of text.matchAll(/\b\d{3,4}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g)) {
    tokens.push({ tokenKind: 'date', rawValue: match[0], lineId: line.lineId });
  }

  const optionMatch = text.match(/^\s*(?:[-*]\s*)?([A-Z]|[ivxlcdm]{1,8})(?:[).:]|\s+[-\u2013\u2014])?\s+\S+/i);
  if (optionMatch?.[1]) {
    tokens.push({ tokenKind: 'option-label', rawValue: optionMatch[1].toUpperCase(), lineId: line.lineId });
  }

  for (const match of text.matchAll(/(?:_{3,}|\.{3,}|\[\s*(?:blank|\d+)\s*\])/gi)) {
    tokens.push({ tokenKind: 'blank-id', rawValue: match[0], lineId: line.lineId });
  }

  return tokens;
};

const representedTextForGroup = (
  material: AutoMaterial,
  instruction: unknown,
): string => {
  const range = isObjectRecord(instruction) && isObjectRecord(instruction.questionRange)
    ? {
        start: optionalNumberFrom(instruction.questionRange.start),
        end: optionalNumberFrom(instruction.questionRange.end),
      }
    : undefined;
  const questions = (material.questions ?? []).filter((question) => {
    const questionNumber = questionNumberFor(question);
    return Boolean(
      range?.start
      && range.end
      && questionNumber >= range.start
      && questionNumber <= range.end,
    );
  });

  return [
    ...stringsFromUnknown(instruction),
    ...questions.flatMap((question) => stringsFromUnknown(question)),
  ].join(' ');
};

const visibleFieldTextForGroup = (
  material: AutoMaterial,
  instruction: unknown,
): string => {
  const range = isObjectRecord(instruction) && isObjectRecord(instruction.questionRange)
    ? {
        start: optionalNumberFrom(instruction.questionRange.start),
        end: optionalNumberFrom(instruction.questionRange.end),
      }
    : undefined;
  const questions = (material.questions ?? []).filter((question) => {
    const questionNumber = questionNumberFor(question);
    return Boolean(
      range?.start
      && range.end
      && questionNumber >= range.start
      && questionNumber <= range.end,
    );
  });
  const instructionRecord = isObjectRecord(instruction) ? instruction : {};

  return [
    instructionRecord.layoutHint,
    instructionRecord.note,
    instructionRecord.table,
    instructionRecord.flowchart,
    instructionRecord.diagram,
    ...questions.map((question) => question.questionText),
  ].flatMap((value) => stringsFromUnknown(value)).join(' ');
};

const hasStructuredOptionBankForGroup = (
  taskType: string,
  instruction: unknown,
  material: AutoMaterial,
): boolean => {
  const canonicalTaskType = normalizeReadingV2TaskType(taskType);
  if (
    !canonicalTaskType
    || (
      !readingV2TaskUsesImportedLabeledOptions(canonicalTaskType)
      && !readingV2TaskUsesPrimarySectionReferenceBank(canonicalTaskType)
    )
  ) {
    return false;
  }

  const instructionRecord = isObjectRecord(instruction) ? instruction : {};
  if (
    (Array.isArray(instructionRecord.labeledOptions) && instructionRecord.labeledOptions.length > 0)
    || (Array.isArray(instructionRecord.sectionReferences) && instructionRecord.sectionReferences.length > 0)
  ) {
    return true;
  }

  return (material.questions ?? []).some((question) =>
    (Array.isArray(question.labeledOptions) && question.labeledOptions.length > 0)
    || (Array.isArray(question.sectionReferences) && question.sectionReferences.length > 0),
  );
};

const reasonCodesForMissingSource = (input: {
  readonly taskType: string;
  readonly missingLines: readonly { readonly text: string }[];
  readonly highRiskCount: number;
  readonly optionBankDuplicated: boolean;
  readonly encodingArtifactPreserved: boolean;
}): readonly ReadingV2AutoImportDiagnosticCode[] => {
  const codes = new Set<ReadingV2AutoImportDiagnosticCode>();
  if (input.missingLines.length > 0) {
    codes.add('group-source-underrepresented');
  }
  if (input.highRiskCount > 0) {
    codes.add('high-risk-token-changed');
    codes.add('question-text-changed');
  }
  if (input.missingLines.some((line) => /^questions?\s+\d+/i.test(line.text.trim()) || /\bchoose\b|\bcomplete\b|\bwrite\b/i.test(line.text))) {
    codes.add('instruction-shortened');
  }
  if (input.taskType === 'note-completion') {
    if (input.missingLines.some((line) => !/^\s*(?:[-*]\s*)?\d{1,3}\b/.test(line.text) && line.text.trim().length > 0)) {
      codes.add('note-heading-missing');
    }
    if (input.missingLines.some((line) => /^\s*(?:[-*]\s*)?\d{1,3}\b/.test(line.text) || /_{3,}|\.{3,}/.test(line.text))) {
      codes.add('note-row-missing');
    }
  }
  if (input.taskType === 'table-completion') {
    codes.add('table-cell-missing');
    if (input.missingLines.some((line) => line.text.includes('|') || /\t/.test(line.text))) {
      codes.add('table-column-missing');
    }
  }
  if (input.optionBankDuplicated) {
    codes.add('option-bank-duplicated');
  }
  if (input.encodingArtifactPreserved) {
    codes.add('source-encoding-artifact-preserved');
  }

  return [...codes];
};

const buildReadingV2GroupQualityRecords = (
  payload: AutoPayload,
  sourceLedger: ReadingV2AutoSourceLedger,
): readonly ReadingV2GroupQualityRecord[] =>
  (payload.materials ?? []).flatMap((material) =>
    (material.sectionInstructions ?? []).flatMap((instruction) => {
      if (!isObjectRecord(instruction) || !isObjectRecord(instruction.questionRange)) {
        return [];
      }

      const start = optionalNumberFrom(instruction.questionRange.start);
      const end = optionalNumberFrom(instruction.questionRange.end);
      const taskType = typeof instruction.taskType === 'string'
        ? instruction.taskType
        : 'unknown';
      if (!start || !end) {
        return [];
      }

      const groupId = typeof instruction.id === 'string' && instruction.id.trim()
        ? instruction.id.trim()
        : `p${material.passageNumber ?? 'x'}-q${Math.min(start, end)}-${Math.max(start, end)}`;
      const sourceSpan = sourceSpanForGroup({
        groupId,
        questionRange: { start, end },
        taskType,
        sourceLedger,
      });
      const sourceLines = sourceSpan
        ? sourceSpan.evidenceLineIds.flatMap((lineId) => {
            const line = sourceLedger.lineIndex.find((candidate) => candidate.lineId === lineId);
            return line ? [{ lineId, text: line.rawText, normalizedText: line.normalizedText }] : [];
          })
        : [];
      const answerKeyLines = sourceSpan
        ? sourceSpan.answerKeyLineIds.flatMap((lineId) => {
            const line = sourceLedger.lineIndex.find((candidate) => candidate.lineId === lineId);
            return line ? [{ lineId, text: line.rawText, normalizedText: line.normalizedText }] : [];
          })
        : [];
      const optionBankLines = sourceSpan
        ? sourceSpan.optionBankLineIds.flatMap((lineId) => {
            const line = sourceLedger.lineIndex.find((candidate) => candidate.lineId === lineId);
            return line ? [{ lineId, text: line.rawText, normalizedText: line.normalizedText }] : [];
          })
        : [];
      const representedText = normalizedCoverageText(representedTextForGroup(material, instruction));
      const comparableLines = [...sourceLines, ...answerKeyLines, ...optionBankLines]
        .filter((line, index, lines) => lines.findIndex((candidate) => candidate.lineId === line.lineId) === index)
        .filter((line) =>
          line.normalizedText.length > 0
          && !/^questions?\s+\d+/i.test(line.normalizedText)
          && !/^answers?\b/i.test(line.normalizedText)
          && !/^reading passage\s+\d+\b/i.test(line.normalizedText)
        );
      const missingLines = comparableLines.filter((line) => !textContainsSourceLine(representedText, line.text));
      const toleratedInstructionLineIds = new Set(
        simpleInstructionFlexibleTaskTypes.has(taskType)
          ? missingLines
              .filter((line) => isInstructionLikeSourceLine(line.text) || isQuestionRangeSourceLine(line.text))
              .map((line) => line.lineId)
          : [],
      );
      const statusMissingLines = missingLines.filter((line) => !toleratedInstructionLineIds.has(line.lineId));
      const highRiskTokenChanges = comparableLines
        .flatMap(highRiskTokensFromLine)
        .filter((token) => !representedText.includes(normalizedCoverageText(token.rawValue)))
        .filter((token) => !toleratedInstructionLineIds.has(token.lineId))
        .map((token) => ({
          tokenKind: token.tokenKind,
          rawValue: token.rawValue,
          studioValue: '',
          lineId: token.lineId,
        }));
      const missingStructuralUnits = statusMissingLines.map((line) => line.lineId);
      const duplicatedOptionBank = hasStructuredOptionBankForGroup(taskType, instruction, material)
        && comparableLines
          .filter((line) => sourceLineFieldKind(line, sourceSpan) === 'option-bank')
          .some((line) => textContainsSourceLine(normalizedCoverageText(visibleFieldTextForGroup(material, instruction)), line.text));
      const encodingArtifactPreserved = comparableLines.some((line) => sourceEncodingArtifactPattern.test(line.text))
        && statusMissingLines.length === 0
        && highRiskTokenChanges.length === 0
        && !duplicatedOptionBank;
      const reasonCodes = [
        ...(sourceSpan ? [] : ['source-question-range-missing' as const]),
        ...reasonCodesForMissingSource({
          taskType,
          missingLines: statusMissingLines,
          highRiskCount: highRiskTokenChanges.length,
          optionBankDuplicated: duplicatedOptionBank,
          encodingArtifactPreserved,
        }),
      ];
      const sourceSpanConfidence = sourceSpan?.confidence ?? 'low';
      const status: ReadingV2GroupQualityStatus = sourceSpanConfidence === 'low'
        ? 'teacher-review'
        : statusMissingLines.length > 0 || highRiskTokenChanges.length > 0 || duplicatedOptionBank
          ? 'weak'
          : 'ready';
      const recommendedAction: ReadingV2GroupQualityRecommendedAction = status === 'ready'
        ? 'none'
        : status === 'blocked'
          ? 'blocked'
          : duplicatedOptionBank
            ? 'deterministic-rehydrate'
            : status === 'teacher-review' || sourceSpanConfidence !== 'high' || highRiskTokenChanges.length > 0
            ? 'teacher-review'
            : structuralCompletionTaskTypes.has(taskType)
              ? 'teacher-groq-repair'
              : 'deterministic-rehydrate';

      return [{
        groupId,
        questionRange: { start: Math.min(start, end), end: Math.max(start, end) },
        taskType,
        status,
        sourceSpanConfidence,
        reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['group-quality-ready'],
        coverage: {
          rawLineCount: comparableLines.length,
          representedLineCount: comparableLines.length - statusMissingLines.length,
          missingLineIds: statusMissingLines.map((line) => line.lineId),
          missingFields: statusMissingLines.map((line) => sourceMissingFieldFor(line, sourceSpan)),
          rawStructuralUnitCount: comparableLines.length,
          representedStructuralUnitCount: comparableLines.length - missingStructuralUnits.length,
          missingStructuralUnits,
          highRiskTokenChanges,
        },
        recommendedAction,
        ...(sourceSpan ? { sourceSpan } : {}),
      }];
    }),
  );

const diagnosticsFromGroupQualityRecords = (
  records: readonly ReadingV2GroupQualityRecord[],
): readonly ReadingV2AutoImportDiagnostic[] =>
  records.flatMap((record) =>
    record.reasonCodes.map((reasonCode) => ({
      code: reasonCode as ReadingV2AutoImportDiagnosticCode,
      severity: record.status === 'blocked'
        ? 'error' as const
        : record.status === 'ready'
          ? 'info' as const
          : 'warning' as const,
      message: record.status === 'ready'
        ? `Group ${record.questionRange.start}-${record.questionRange.end} is source-verified and ready.`
        : `Group ${record.questionRange.start}-${record.questionRange.end} is ${record.status}: ${reasonCode}.`,
      passageNumber: undefined,
      questionNumber: record.questionRange.start,
      groupRange: `${record.questionRange.start}-${record.questionRange.end}`,
      sourceRange: record.sourceSpan
        ? `${record.sourceSpan.startLineId}-${record.sourceSpan.endLineId}`
        : undefined,
      verifierResult: record.status === 'ready' ? 'passed' as const : 'failed' as const,
      repairScopes: record.recommendedAction === 'deterministic-rehydrate'
        || record.recommendedAction === 'teacher-groq-repair'
        ? ['task-group' as const]
        : undefined,
    })),
  );

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

interface AutoV4SummaryLayout {
  readonly layoutHint: string;
  readonly questionTextByQuestionNumber: ReadonlyMap<number, string>;
}

const normalizedQuestionText = (value: string): string =>
  value
    .replace(/^\s*(?:\*\*)?\d{1,3}(?:\*\*)?\s*(?:[.)\-:]\s*)?/, '')
    .trim();

const cleanAutoV4TitleText = (value: string | undefined): string =>
  compactWhitespace(value ?? '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();

const isInstructionLikeAutoV4Title = (value: string | undefined): boolean => {
  const normalized = cleanAutoV4TitleText(value).toLowerCase();
  return !normalized
    || /^questions?\s+\d+\b/.test(normalized)
    || /^reading passage\s+\d+\b/.test(normalized)
    || /\byou should spend about\b/.test(normalized)
    || /\bbased on reading passage\b/.test(normalized)
    || /\bwrite your answers? in boxes?\b/.test(normalized)
    || /\bchoose\b.*\bfrom the passage\b/.test(normalized);
};

const autoV4PassageTitle = (
  passage: AIPassage,
  passageNumber: number,
  sourceLedger: ReadingV2AutoSourceLedger,
): string => {
  const ledgerTitle = sourceLedger.passages.find((sourcePassage) =>
    sourcePassage.passageNumber === passageNumber,
  )?.title;
  if (ledgerTitle && !isInstructionLikeAutoV4Title(ledgerTitle)) {
    return ledgerTitle;
  }

  if (passage.title && !isInstructionLikeAutoV4Title(passage.title)) {
    return passage.title;
  }

  return `Reading Passage ${passageNumber}`;
};

const autoV4PassageSourceContent = (
  passageNumber: number,
  sourceLedger: ReadingV2AutoSourceLedger,
): string | undefined => {
  const passage = sourceLedger.passages.find((candidate) => candidate.passageNumber === passageNumber);
  if (!passage) {
    return undefined;
  }

  const firstQuestionLine = sourceLedger.questionRanges
    .filter((range) => range.passageNumber === passageNumber && range.lineNumber > passage.lineNumber)
    .map((range) => range.lineNumber)
    .sort((left, right) => left - right)[0];
  const nextPassageLine = sourceLedger.passages
    .filter((candidate) => candidate.lineNumber > passage.lineNumber)
    .map((candidate) => candidate.lineNumber)
    .sort((left, right) => left - right)[0];
  const firstAnswerLine = sourceLedger.answerKeyRows
    .map((row) => row.sourceLine)
    .sort((left, right) => left - right)[0];
  const firstRepeatedTitleLine = firstRepeatedTitlePollutionLineAfter(sourceLedger, passage.lineNumber);
  const endLine = [
    firstQuestionLine,
    nextPassageLine,
    firstAnswerLine,
    firstRepeatedTitleLine,
    sourceLedger.lineCount + 1,
  ]
    .filter((lineNumber): lineNumber is number => Number.isFinite(lineNumber) && lineNumber > passage.lineNumber)
    .sort((left, right) => left - right)[0]! - 1;
  const pollutionLineNumbers = sourcePollutionLineNumbers(sourceLedger);
  const body = sourceLinesBetween(sourceLedger, passage.lineNumber + 1, Math.max(passage.lineNumber + 1, endLine))
    .filter((line) => !pollutionLineNumbers.has(line.lineNumber))
    .map((line) => line.text)
    .join('\n')
    .trim();

  return body.length > 0 ? body : undefined;
};

const autoV4PassageHighRiskTokens = (value: string): readonly string[] =>
  [...new Set(
    [
      ...value.matchAll(/\b\d{3,4}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g),
      ...value.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g),
    ].map((match) => match[0]),
  )];

const autoV4PassageSourceDiagnostics = (
  passagesResult: AIPassagesOnlyResult,
  sourceLedger: ReadingV2AutoSourceLedger,
): readonly ReadingV2AutoImportDiagnostic[] =>
  passagesResult.passages.flatMap((passage, index) => {
    const passageNumber = passageNumberFromAutoV4Passage(passage, index, sourceLedger);
    const sourceContent = autoV4PassageSourceContent(passageNumber, sourceLedger);
    if (!sourceContent) {
      return [];
    }

    const aiText = normalizedCoverageText(passage.content ?? '');
    const missingHighRiskTokens = autoV4PassageHighRiskTokens(sourceContent)
      .filter((token) => !aiText.includes(normalizedCoverageText(token)));
    const diagnostics: ReadingV2AutoImportDiagnostic[] = [{
      code: 'auto-v4-source-authoritative-passage',
      severity: 'info',
      message: `Passage ${passageNumber} Studio text was copied from raw source ledger lines instead of provider passage prose.`,
      passageNumber,
      verifierResult: 'passed',
    }];

    if (missingHighRiskTokens.length > 0) {
      diagnostics.push({
        code: 'auto-v4-source-passage-drift',
        severity: 'warning',
        message: `Auto V4 provider passage text differed from raw source high-risk token(s): ${missingHighRiskTokens.slice(0, 6).join(', ')}.`,
        passageNumber,
        verifierResult: 'failed',
      });
    }

    return diagnostics;
  });

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

const providerNameFromStageResult = (data: unknown): string =>
  typeof data === 'object'
    && data !== null
    && 'provider' in data
    && typeof (data as { readonly provider?: unknown }).provider === 'string'
    ? (data as { readonly provider: string }).provider
    : 'custom-extractor';

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
  if (taskType === 'multiple-choice' || taskType === 'multiple-select') {
    return '';
  }

  if (
    !readingV2TaskUsesPrimarySectionReferenceBank(taskType)
    && !readingV2TaskUsesImportedLabeledOptions(taskType)
  ) {
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
  if (!readingV2TaskUsesPrimarySectionReferenceBank(group.taskType)) {
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
  if (!readingV2TaskUsesSharedLabeledOptionBank(group.taskType)) {
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
  if (!readingV2TaskUsesPerQuestionLabeledOptions(taskType)) {
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

const sourceLineTextForSummary = (value: string): string =>
  cleanAutoV4TitleText(value)
    .replace(/\\_/g, '_')
    .replace(/\*\*(\d{1,3})\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const sourceQuestionRangeLineMatches = (line: string, start: number, end: number): boolean => {
  const normalized = cleanAutoV4TitleText(line)
    .replace(/â€“|â€”|\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ');
  return new RegExp(`^Questions?\\s+${start}\\s*(?:-|to|and)\\s*${end}\\b`, 'i').test(normalized);
};

const isSummarySourceBoundary = (line: string): boolean => {
  const normalized = cleanAutoV4TitleText(line).toLowerCase();
  return /^questions?\s+\d+\b/.test(normalized)
    || /^reading passage\s+\d+\b/.test(normalized)
    || /^answers?\b/.test(normalized)
    || /^advertisements?$/.test(normalized)
    || /^cam\s+\d+\s+reading\s+test\b/.test(normalized);
};

const summaryMarkerPatternFor = (questionNumber: number): RegExp =>
  new RegExp(`(?:\\[\\s*)?${questionNumber}(?:\\s*\\])?\\s*(?:_+|\\.{3,}|…+|â€¦+|\\[\\s*blank\\s*\\])`, 'i');

const autoV4SummaryLayoutFromSource = (
  group: AutoV4QuestionGroup,
  sourceLedger: ReadingV2AutoSourceLedger,
): AutoV4SummaryLayout | undefined => {
  if (!['summary-completion-text', 'summary-completion-list'].includes(group.taskType) || group.questions.length === 0) {
    return undefined;
  }

  const start = group.questions[0]?.questionNumber ?? 0;
  const end = group.questions[group.questions.length - 1]?.questionNumber ?? start;
  const lines = sourceLedger.normalizedText.split('\n');
  const rangeIndex = lines.findIndex((line) => sourceQuestionRangeLineMatches(line, start, end));
  if (rangeIndex < 0) {
    return undefined;
  }

  const sourceWindow: string[] = [];
  for (let index = rangeIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (sourceWindow.length > 0 && isSummarySourceBoundary(line)) {
      break;
    }
    sourceWindow.push(line);
  }

  const questionNumbers = group.questions.map((question) => question.questionNumber);
  const firstBlankIndex = sourceWindow.findIndex((line) =>
    questionNumbers.some((questionNumber) => summaryMarkerPatternFor(questionNumber).test(sourceLineTextForSummary(line))),
  );
  if (firstBlankIndex < 0) {
    return undefined;
  }

  const titleLine = [...sourceWindow.slice(0, firstBlankIndex)]
    .reverse()
    .map(sourceLineTextForSummary)
    .find((line) => line && !isInstructionLikeAutoV4Title(line));
  const sourceBodyLines = sourceWindow
    .slice(firstBlankIndex)
    .filter((line) => group.taskType !== 'summary-completion-list' || !looksLikeInlineOptionBank(line));
  const bodyText = [
    titleLine,
    ...sourceBodyLines.map(sourceLineTextForSummary),
  ].filter(Boolean).join(' ');

  const matches = questionNumbers.map((questionNumber) => {
    const match = bodyText.match(summaryMarkerPatternFor(questionNumber));
    return match?.index === undefined
      ? null
      : { questionNumber, index: match.index, length: match[0].length };
  });

  if (matches.some((match) => match === null)) {
    return undefined;
  }

  const orderedMatches = matches as readonly { readonly questionNumber: number; readonly index: number; readonly length: number }[];
  if (orderedMatches.some((match, index) => index > 0 && match.index <= orderedMatches[index - 1]!.index)) {
    return undefined;
  }

  const segments = Array.from({ length: orderedMatches.length + 1 }, (_, index) => {
    const previous = orderedMatches[index - 1];
    const next = orderedMatches[index];
    const segmentStart = previous ? previous.index + previous.length : 0;
    const segmentEnd = next ? next.index : bodyText.length;
    return compactWhitespace(bodyText.slice(segmentStart, segmentEnd));
  });
  const questionTextByQuestionNumber = new Map<number, string>();
  orderedMatches.forEach((match, index) => {
    questionTextByQuestionNumber.set(
      match.questionNumber,
      compactWhitespace([segments[index], '___', segments[index + 1]].filter(Boolean).join(' ')),
    );
  });

  return {
    layoutHint: JSON.stringify({
      kind: group.taskType === 'summary-completion-list' ? 'summary-list' : 'summary-text',
      segments,
    }),
    questionTextByQuestionNumber,
  };
};

const autoV4PromptTextForTask = (
  taskType: ReadingV2CanonicalTaskType,
  value: string,
): string => {
  const text = normalizedQuestionText(value);
  return readingV2TaskUsesBlankMarkers(taskType)
    ? compactWhitespace(replaceReadingV2AutoCompletionBlanks(text, ' ___ '))
    : text;
};

const autoV4TableFromGroup = (
  group: AutoV4QuestionGroup,
): { readonly rows: readonly (readonly ({ readonly text: string; readonly questionNumber?: number; readonly isBlank?: boolean } | string)[])[] } | undefined => {
  if (group.taskType !== 'table-completion') {
    return undefined;
  }

  const rows = group.questions.map((question) => {
    const promptText = autoV4PromptTextForTask(group.taskType, question.source.questionText);
    const cells = promptText.includes('|')
      ? promptText.split('|').map((cell) => compactWhitespace(cell))
      : [promptText];

    return cells.map((cell, cellIndex) => {
      const hasBlank = cell.includes('___');
      if (!hasBlank && cellIndex !== cells.length - 1) {
        return cell;
      }

      return {
        text: hasBlank ? cell : `${cell} ___`,
        questionNumber: question.questionNumber,
        isBlank: true,
      };
    });
  });

  return rows.length > 0 ? { rows } : undefined;
};

const autoV4FlowchartFromGroup = (
  group: AutoV4QuestionGroup,
): { readonly steps: readonly { readonly stepId: string; readonly text: string; readonly questionNumber: number; readonly isBlank: true; readonly nextStepIds?: readonly string[] }[] } | undefined => {
  if (group.taskType !== 'flowchart-completion') {
    return undefined;
  }

  const steps = group.questions.map((question, index) => ({
    stepId: `step-q${question.questionNumber}`,
    text: autoV4PromptTextForTask(group.taskType, question.source.questionText),
    questionNumber: question.questionNumber,
    isBlank: true as const,
    ...(index < group.questions.length - 1
      ? { nextStepIds: [`step-q${group.questions[index + 1]?.questionNumber}`] }
      : {}),
  }));

  return steps.length > 0 ? { steps } : undefined;
};

const autoV4SourceWindowForGroup = (
  group: AutoV4QuestionGroup,
  sourceLedger: ReadingV2AutoSourceLedger,
): readonly string[] => {
  const start = group.questions[0]?.questionNumber ?? 0;
  const end = group.questions[group.questions.length - 1]?.questionNumber ?? start;
  const lines = sourceLedger.normalizedText.split('\n');
  const rangeIndex = lines.findIndex((line) => sourceQuestionRangeLineMatches(line, start, end));
  if (rangeIndex < 0) {
    return [];
  }

  const sourceWindow: string[] = [];
  for (let index = rangeIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (sourceWindow.length > 0 && isSummarySourceBoundary(line)) {
      break;
    }
    sourceWindow.push(line);
  }

  return sourceWindow;
};

const autoV4ImageUrlsFromSourceLines = (lines: readonly string[]): readonly string[] => {
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

  lines.forEach((line) => {
    for (const pattern of [markdownImagePattern, htmlImagePattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const imageUrl = match[1]?.trim();
        if (imageUrl && !seen.has(imageUrl)) {
          seen.add(imageUrl);
          imageUrls.push(imageUrl);
        }
      }
    }
  });

  return imageUrls;
};

const autoV4DiagramFromGroup = (
  group: AutoV4QuestionGroup,
  sourceLedger: ReadingV2AutoSourceLedger,
): { readonly imageAlt: string; readonly imageUrl?: string; readonly imageUrls?: readonly string[]; readonly targets: readonly { readonly label: string; readonly questionNumber: number }[] } | undefined => {
  if (group.taskType !== 'diagram-labeling') {
    return undefined;
  }

  const imageUrls = autoV4ImageUrlsFromSourceLines(autoV4SourceWindowForGroup(group, sourceLedger));
  const targets = group.questions.map((question) => ({
    label: `Question ${question.questionNumber}`,
    questionNumber: question.questionNumber,
  }));

  return targets.length > 0
    ? {
        imageAlt: imageUrls.length > 1
          ? `Imported diagram from source (${imageUrls.length} source images found; review original diagram set)`
          : 'Imported diagram from source',
        imageUrl: imageUrls[0],
        imageUrls,
        targets,
      }
    : undefined;
};

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
      const passageTitle = autoV4PassageTitle(passage, passageNumber, input.sourceLedger);
      const sourcePassageContent = autoV4PassageSourceContent(passageNumber, input.sourceLedger);

      return {
        passageNumber,
        title: passageTitle,
        passages: [{
          title: passageTitle,
          content: sourcePassageContent ?? passage.content,
        }],
        sectionInstructions: groups.map((group) => {
          const start = group.questions[0]?.questionNumber ?? 0;
          const end = group.questions[group.questions.length - 1]?.questionNumber ?? start;
          const summaryLayout = autoV4SummaryLayoutFromSource(group, input.sourceLedger);
          const table = autoV4TableFromGroup(group);
          const flowchart = autoV4FlowchartFromGroup(group);
          const diagram = autoV4DiagramFromGroup(group, input.sourceLedger);
          return {
            id: group.id,
            taskType: group.taskType,
            questionRange: { start, end },
            sourceInstructionEvidence: group.instructionText,
            vocabulary: autoV4VocabularyForTaskType(group.taskType),
            selectionLimit: autoV4SelectionLimitForGroup(group, answerValues),
            sectionReferences: autoV4GroupSectionReferences(group),
            labeledOptions: autoV4GroupLabeledOptions(group),
            layoutHint: summaryLayout?.layoutHint,
            table,
            flowchart,
            diagram,
          };
        }),
        questions: groups.flatMap((group) =>
          group.questions.map((question) => {
            const summaryLayout = autoV4SummaryLayoutFromSource(group, input.sourceLedger);
            const answers = answerValues.get(question.questionNumber) ?? [];
            return {
              questionNumber: question.questionNumber,
              number: question.questionNumber,
              type: group.taskType,
              sectionInstructionId: group.id,
              questionText: summaryLayout?.questionTextByQuestionNumber.get(question.questionNumber)
                ?? autoV4PromptTextForTask(group.taskType, question.source.questionText),
              answer: answers.join(' | '),
              labeledOptions: autoV4QuestionLabeledOptions(question.source, group.taskType),
              sectionReferences: readingV2TaskUsesPrimarySectionReferenceBank(group.taskType)
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

const reviewableGuardrailDiagnosticCodes = new Set<ReadingV2AutoImportDiagnosticCode>([
  'answer-key-missing',
  'question-count-mismatch',
  'passage-count-mismatch',
  'possible-trimmed-passage',
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
  'auto-v4-source-passage-drift',
  'source-encoding-artifact-preserved',
  'group-source-underrepresented',
  'note-heading-missing',
  'note-row-missing',
  'table-cell-missing',
  'table-column-missing',
  'instruction-shortened',
  'question-text-changed',
  'option-bank-duplicated',
  'group-coverage-mismatch',
  'task-type-conflict',
  'missing-reference-bank',
  'blank-mismatch',
  'groq-output-missing-group',
  'app-normalizer-dropped-group',
  'repair-failed',
  'canonical-validation-blocked',
]);

const publishBlockingReviewDiagnosticCodes = new Set<ReadingV2AutoImportDiagnosticCode>([
  'answer-key-missing',
  'question-count-mismatch',
  'passage-count-mismatch',
  'possible-trimmed-passage',
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
  'group-coverage-mismatch',
  'task-type-conflict',
  'missing-reference-bank',
  'blank-mismatch',
  'groq-output-missing-group',
  'app-normalizer-dropped-group',
  'canonical-validation-blocked',
]);

const diagnosticLogDetailsFor = (
  diagnostics: readonly ReadingV2AutoImportDiagnostic[],
): readonly Record<string, unknown>[] =>
  diagnostics.slice(0, 12).map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    passageNumber: diagnostic.passageNumber,
    questionNumber: diagnostic.questionNumber,
    stage: diagnostic.stage,
    groupRange: diagnostic.groupRange,
    sourceRange: diagnostic.sourceRange,
    verifierIssueCodes: diagnostic.verifierIssueCodes,
    repairScopes: diagnostic.repairScopes,
    providerResult: diagnostic.providerResult,
    verifierResult: diagnostic.verifierResult,
  }));

const normalizeGuardrailDiagnosticsForStudio = (
  diagnostics: readonly ReadingV2AutoImportDiagnostic[],
): {
  readonly diagnostics: readonly ReadingV2AutoImportDiagnostic[];
  readonly blockingDiagnostics: readonly ReadingV2AutoImportDiagnostic[];
  readonly reviewDiagnostics: readonly ReadingV2AutoImportDiagnostic[];
  readonly reviewStatus: ReadingV2AutoImportReviewStatus;
  readonly publishBlockingPlaceholders: readonly string[];
  readonly uncertaintyMarkers: readonly string[];
} => {
  const normalizedDiagnostics = diagnostics.map(normalizeGuardrailDiagnostic);
  const blockingDiagnostics = normalizedDiagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const reviewDiagnostics = normalizedDiagnostics.filter((diagnostic) => diagnostic.severity === 'warning');
  const publishBlockingPlaceholders = reviewDiagnostics
    .filter((diagnostic) => publishBlockingReviewDiagnosticCodes.has(diagnostic.code))
    .map((diagnostic) => `Auto import needs teacher review before publish: ${diagnostic.message}`)
    .filter((message, index, messages) => messages.indexOf(message) === index);
  const uncertaintyMarkers = reviewDiagnostics
    .map((diagnostic) => `Auto import review: ${diagnostic.message}`)
    .filter((message, index, messages) => messages.indexOf(message) === index);

  return {
    diagnostics: normalizedDiagnostics,
    blockingDiagnostics,
    reviewDiagnostics,
    reviewStatus: blockingDiagnostics.length > 0
      ? 'blocked'
      : reviewDiagnostics.length > 0
        ? 'needs_review'
        : 'ready',
    publishBlockingPlaceholders,
    uncertaintyMarkers,
  };
};

const normalizeGuardrailDiagnostic = (
  diagnostic: ReadingV2AutoImportDiagnostic,
): ReadingV2AutoImportDiagnostic =>
  diagnostic.severity === 'error' && reviewableGuardrailDiagnosticCodes.has(diagnostic.code)
    ? { ...diagnostic, severity: 'warning' as const }
    : diagnostic;

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

const finalizeAutoImportPayload = (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly sourceArtifact?: ReadingV2ImportSourceArtifact;
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
  const groupQualityRecords = buildReadingV2GroupQualityRecords(input.payload, input.sourceLedger);
  const verifierIssues = input.verifierIssues
    ?? verifyReadingV2AutoPayloadAgainstLedger(ledgerPayloadFromAutoPayload(input.payload), input.sourceLedger);
  const rawDiagnostics = [
    ...input.diagnostics,
    ...diagnosticsFromGroupQualityRecords(groupQualityRecords),
    ...validatePayload(input.payload, input.chunks, input.sourceLedger, verifierIssues),
  ];
  const guardrail = normalizeGuardrailDiagnosticsForStudio(rawDiagnostics);
  const diagnostics = guardrail.diagnostics;
  const blocking = guardrail.reviewStatus === 'blocked';

  logReadingV2AutoImportDiag('guardrail_result', {
    blocking,
    reviewStatus: guardrail.reviewStatus,
    diagnosticCount: diagnostics.length,
    diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    blockingDiagnosticCount: guardrail.blockingDiagnostics.length,
    reviewDiagnosticCount: guardrail.reviewDiagnostics.length,
    diagnosticDetails: diagnosticLogDetailsFor(diagnostics),
    passageCount: input.payload.materials?.length ?? 0,
    questionCount: questionCountFor(input.payload),
  });

  if (blocking) {
    return {
      success: false,
      reviewStatus: 'blocked',
      error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ?? 'Auto import failed guardrails.',
      diagnostics,
      sourceArtifact: input.sourceArtifact,
      groupQualityRecords,
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
        : 'Auto Gemini import'),
  });
  const candidateWithLedger: ReadingV2ImportCandidate = {
    ...candidate,
    sourceRawText: input.sourceLedger.normalizedText,
    importSourceArtifact: input.sourceArtifact,
    autoImportDiagnostics: diagnostics,
    autoImportGroupQuality: groupQualityRecords,
    evidence: [
      ...candidate.evidence,
      ...(input.sourceArtifact
        ? [
            `Import source artifact: ${input.sourceArtifact.artifactId}`,
            `Import source raw sha256: ${input.sourceArtifact.rawTextSha256}`,
            `Import source normalized sha256: ${input.sourceArtifact.normalizedTextSha256}`,
          ]
        : []),
      ...readingV2AutoSourceLedgerEvidence(input.sourceLedger),
      `Source ledger line index: ${input.sourceLedger.lineIndex.length}`,
      `Group quality records: ${groupQualityRecords.length}`,
      ...generatedDraftEvidence(input.payload),
      ...(input.extraEvidence ?? []),
    ],
    uncertaintyMarkers: [
      ...candidate.uncertaintyMarkers,
      ...input.sourceLedger.issues
        .filter((issue) => issue.severity !== 'info')
        .map((issue) => `Source ledger: ${issue.message}`),
      ...guardrail.uncertaintyMarkers,
    ],
    publishBlockingPlaceholders: [
      ...candidate.publishBlockingPlaceholders,
      ...guardrail.publishBlockingPlaceholders,
    ].filter((message, index, messages) => messages.indexOf(message) === index),
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
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.error('[ReadingV2AutoImport] Guardrail normalization failed:', error);
    }

    return {
      success: false,
      reviewStatus: 'blocked',
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
  const reviewStatus: ReadingV2AutoImportReviewStatus =
    guardrail.reviewStatus === 'ready' && canonicalValidationDiagnostics.length > 0
      ? 'needs_review'
      : guardrail.reviewStatus;

  return {
    success: true,
    reviewStatus,
      structuredPayloadText: text,
      answerKeyText: input.answerKeyText,
      diagnostics: [
        ...diagnostics,
        ...canonicalValidationDiagnostics,
      ],
      sourceArtifact: input.sourceArtifact,
      groupQualityRecords,
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

const generateReadingV2AutoImportCandidateV4 = async (input: {
  readonly request: ReadingV2AutoImportRequest;
  readonly extractor: ReadingV2AutoV4Extractor;
  readonly sourceLedger: ReadingV2AutoSourceLedger;
  readonly sourceArtifact: ReadingV2ImportSourceArtifact;
  readonly options: Pick<ReadingV2AutoImportOptions, 'captureRawProviderDebug' | 'onDiagnosticEvent'>;
}): Promise<ReadingV2AutoImportResult> => {
  const extractedAnswerKeyText = extractAnswerKeyTextFromRaw(input.sourceLedger.normalizedText);
  const chunks = splitSourceIntoChunks(input.sourceLedger.normalizedText, input.sourceLedger);
  const hasVisibleAnswerKeyHeading = rawTextHasAnswerKeyHeading(input.sourceLedger.normalizedText);

  emitReadingV2AutoImportDiag(input.options, 'auto_v4_preflight_complete', {
    pipelineLane: 'v4-full-doc',
    stageShape: 'full-document',
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
      sourceArtifact: input.sourceArtifact,
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
      sourceArtifact: input.sourceArtifact,
      provider: 'gemini',
      model: AUTO_V4_MODEL_LABEL,
    };
  }

  const copiedV4AnswerKeyText = hasVisibleAnswerKeyHeading
    ? autoV4AnswerKeyText(questionsResult.data.answerKey)
    : undefined;
  const answerKeyText = copiedV4AnswerKeyText ?? extractedAnswerKeyText;
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
  const sourcePassageDiagnostics = autoV4PassageSourceDiagnostics(passagesResult.data, input.sourceLedger);
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    autoPipelineLaneDiagnostic('v4-full-doc'),
    {
      code: 'auto-v4-staged-parser-used',
      severity: 'info',
      message: 'Auto V4 used staged Reading parser outputs, then adapted them locally into Reading V2 structured payload.',
    },
    {
      code: 'auto-v4-provider-stage',
      severity: 'info',
      message: `Auto V4 passage stage completed with ${providerNameFromStageResult(passagesResult.data)}.`,
      stage: 'auto-v4-passages',
      providerResult: 'success',
    },
    {
      code: 'auto-v4-provider-stage',
      severity: 'info',
      message: `Auto V4 question/answer stage completed with ${providerNameFromStageResult(questionsResult.data)}.`,
      stage: 'auto-v4-questions',
      providerResult: 'success',
    },
    ...sourcePassageDiagnostics,
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
    sourceArtifact: input.sourceArtifact,
    chunks,
    payload: payloadState.payload,
    answerKeyText: payloadState.answerKeyText,
    diagnostics,
    verifierIssues: payloadState.verifierIssues,
    provider: 'gemini',
    model: AUTO_V4_MODEL_LABEL,
  });
};

export const generateReadingV2AutoImportCandidate = async (
  request: ReadingV2AutoImportRequest,
  options: ReadingV2AutoImportOptions = {},
): Promise<ReadingV2AutoImportResult> => {
  const sourceArtifact = await buildReadingV2ImportSourceArtifact({
    rawTextOriginal: request.rawTestText,
    sourceName: request.sourceName,
  });
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
      sourceArtifact,
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
      sourceArtifact,
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
      sourceArtifact,
      provider: 'gemini',
      model: GEMINI_MODEL_NAME,
    };
  }

  const pipelineLane = resolveAutoPipelineLane(options);
  emitReadingV2AutoImportDiag(options, 'auto_pipeline_lane_selected', {
    pipelineLane,
    forceV4Pipeline: options.forceV4Pipeline === true,
    hasStructuredGenerator: Boolean(options.generator),
    hasV4Extractor: Boolean(options.v4Extractor),
    sourceLength: sourceLedger.normalizedText.length,
    sourceLedgerPassageCount: sourceLedger.passages.length,
    sourceLedgerQuestionCount: sourceLedger.questionNumbers.length,
  });

  if (pipelineLane === 'v4-full-doc') {
    return generateReadingV2AutoImportCandidateV4({
      request,
      extractor: options.v4Extractor ?? aiService,
      sourceLedger,
      sourceArtifact,
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
        diagnostics: [
          autoPipelineLaneDiagnostic('legacy-gemini-chunk'),
          {
            code: chunkResult.error?.includes('malformed')
              ? 'malformed-json'
              : 'gemini-request-failed',
            severity: 'error',
            message: chunkResult.error ?? 'Gemini failed to process the Reading V2 source.',
            passageNumber: chunk.passageNumber,
          },
        ],
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
  const rawDiagnostics: ReadingV2AutoImportDiagnostic[] = [
    autoPipelineLaneDiagnostic('legacy-gemini-chunk'),
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
  const guardrail = normalizeGuardrailDiagnosticsForStudio(rawDiagnostics);
  const diagnostics = guardrail.diagnostics;

  const blocking = guardrail.reviewStatus === 'blocked';
  emitReadingV2AutoImportDiag(options, 'guardrail_result', {
    blocking,
    reviewStatus: guardrail.reviewStatus,
    diagnosticCount: diagnostics.length,
    diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    blockingDiagnosticCount: guardrail.blockingDiagnostics.length,
    reviewDiagnosticCount: guardrail.reviewDiagnostics.length,
    diagnosticDetails: diagnosticLogDetailsFor(diagnostics),
    passageCount: payload.materials?.length ?? 0,
    questionCount: questionCountFor(payload),
  });
  if (blocking) {
    return {
      success: false,
      reviewStatus: 'blocked',
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
      ...guardrail.uncertaintyMarkers,
    ],
    publishBlockingPlaceholders: [
      ...candidate.publishBlockingPlaceholders,
      ...guardrail.publishBlockingPlaceholders,
    ].filter((message, index, messages) => messages.indexOf(message) === index),
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
  const reviewStatus: ReadingV2AutoImportReviewStatus =
    guardrail.reviewStatus === 'ready' && canonicalValidationDiagnostics.length > 0
      ? 'needs_review'
      : guardrail.reviewStatus;

  return {
    success: true,
    reviewStatus,
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
