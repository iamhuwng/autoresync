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
import {
  buildReadingV2AutoImportPrompt,
  READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION,
} from './readingV2AutoImportPrompt';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const DEFAULT_MAX_INPUT_CHARS = 120_000;
const DEFAULT_MIN_INPUT_CHARS = 80;
const DEFAULT_CHUNK_WAIT_MS = 6_500;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;
const READING_V2_AUTO_IMPORT_DIAG_PREFIX = '[Diag][ReadingV2AutoImport]';
const ANSWER_KEY_ROW_PATTERN = /^\d{1,2}(?:\\?[\).])?\s+.+/;
const ANSWER_KEY_ROW_PREFIX_PATTERN = /^(\d{1,2})(?:\\?[\).])?\s+/;

const logReadingV2AutoImportDiag = (event: string, payload: Record<string, unknown>): void => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${READING_V2_AUTO_IMPORT_DIAG_PREFIX} ${event}`, payload);
};

export type ReadingV2AutoImportDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ReadingV2AutoImportDiagnosticCode =
  | 'answer-key-missing'
  | 'answer-key-extracted'
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
  | 'guardrail-normalization-failed';

export interface ReadingV2AutoImportDiagnostic {
  readonly code: ReadingV2AutoImportDiagnosticCode;
  readonly severity: ReadingV2AutoImportDiagnosticSeverity;
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
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
}

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const compactWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const normalizeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;

const questionNumberFor = (question: AutoQuestion): number =>
  normalizeNumber(question.questionNumber ?? question.number);

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

const extractAnswerKeyTextFromRaw = (rawText: string): string | undefined => {
  const lines = rawText.split(/\r?\n/);
  let headingIndex = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*(?:answers?|answer\s+key|key)\s*:?\s*$/i.test(lines[index]?.trim() ?? '')) {
      headingIndex = index;
      break;
    }
  }

  if (headingIndex < 0) {
    return undefined;
  }

  const rows: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';

    if (!line) {
      if (rows.length > 0) {
        continue;
      }
      continue;
    }

    if (/^\s*(?:reading\s+passage|passage|section)\s+\d+\s*:?\s*$/i.test(line)) {
      continue;
    }

    if (ANSWER_KEY_ROW_PATTERN.test(line)) {
      rows.push(line.replace(ANSWER_KEY_ROW_PREFIX_PATTERN, '$1 '));
      continue;
    }

    if (rows.length > 0 && !ANSWER_KEY_ROW_PATTERN.test(line)) {
      break;
    }
  }

  const parsed = parseReadingV2TeacherAnswerKey(rows.join('\n'));
  return parsed.rows.length > 0 ? parsed.rawText : undefined;
};

const splitSourceIntoChunks = (rawText: string): readonly SourceChunk[] => {
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

const structuredPayloadText = (payload: AutoPayload): string =>
  [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: payload.sourceFile ?? 'auto-gemini-reading-v2.txt',
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

const validatePayload = (
  payload: AutoPayload,
  chunks: readonly SourceChunk[],
): readonly ReadingV2AutoImportDiagnostic[] => {
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [...payloadDiagnostics(payload)];
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

  return diagnostics;
};

const callGeminiForChunk = async (
  generator: ReadingV2AutoStructuredGenerator,
  chunk: SourceChunk,
  request: ReadingV2AutoImportRequest,
  answerKeyText: string | undefined,
): Promise<Result<AutoPayload>> => {
  const prompt = buildReadingV2AutoImportPrompt({
    rawTestText: chunk.text,
    sourceName: request.sourceName,
    passageNumber: chunk.passageNumber,
    answerKeyText,
  });
  logReadingV2AutoImportDiag('gemini_chunk_requested', {
    passageNumber: chunk.passageNumber,
    sourceLength: chunk.text.length,
    answerKeyDetected: Boolean(answerKeyText),
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

export const generateReadingV2AutoImportCandidate = async (
  request: ReadingV2AutoImportRequest,
  options: ReadingV2AutoImportOptions = {},
): Promise<ReadingV2AutoImportResult> => {
  const rawTestText = request.rawTestText.trim();
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const minInputChars = options.minInputChars ?? DEFAULT_MIN_INPUT_CHARS;
  const waitBetweenChunksMs = options.waitBetweenChunksMs ?? DEFAULT_CHUNK_WAIT_MS;
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

  const extractedAnswerKeyText = extractAnswerKeyTextFromRaw(rawTestText);
  const chunks = splitSourceIntoChunks(rawTestText);
  const chunkPayloads: AutoPayload[] = [];
  logReadingV2AutoImportDiag('preflight_complete', {
    sourceLength: rawTestText.length,
    chunkCount: chunks.length,
    answerKeyDetected: Boolean(extractedAnswerKeyText),
    sourceName: request.sourceName ?? null,
  });

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) {
      await wait(waitBetweenChunksMs);
    }

    const chunkResult = await callGeminiForChunk(generator, chunk, request, extractedAnswerKeyText);
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

    chunkPayloads.push(chunkResult.data);
  }

  const mergedPayload: AutoPayload = {
    sourceFile: request.sourceName ?? 'auto-gemini-reading-v2.txt',
    answerKeyText: extractedAnswerKeyText ?? '',
    materials: chunkPayloads.flatMap((payload) => payload.materials ?? []),
    diagnostics: chunkPayloads.flatMap((payload) => payload.diagnostics ?? []),
  };
  const payload = extractedAnswerKeyText ? mergedPayload : stripAnswersWhenNoSourceKey(mergedPayload);
  const diagnostics: ReadingV2AutoImportDiagnostic[] = [
    ...(extractedAnswerKeyText
      ? [{
          code: 'answer-key-extracted' as const,
          severity: 'info' as const,
          message: 'Auto extracted answer-key rows from the raw source.',
        }]
      : [{
          code: 'answer-key-missing' as const,
          severity: 'warning' as const,
          message: 'No source answer-key section was detected. Answers stay empty for Studio review.',
        }]),
    ...validatePayload(payload, chunks),
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
    answerKeyText: extractedAnswerKeyText,
    sourceKind: 'auto-gemini',
    fileName: request.sourceName ?? 'Auto Gemini import',
  });

  try {
    normalizeReadingV2ImportCandidate(candidate);
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
    answerKeyText: extractedAnswerKeyText,
    diagnostics,
    provider: 'gemini',
    model: GEMINI_MODEL_NAME,
    candidate,
    passageCount: payload.materials?.length ?? 0,
    questionCount: questionCountFor(payload),
  };
};
