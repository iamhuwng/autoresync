import type { AIStructuredGenerationOptions } from '../ai/ai.service';
import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  normalizeReadingV2AutoQuestionTranscript,
  readingV2AutoQuestionRangeKey,
  type ReadingV2AutoTranscriptCoverageSummary,
  type ReadingV2AutoQuestionTranscript,
} from './readingV2AutoQuestionTranscript.service';

export interface ReadingV2AutoQuestionAreaNormalizerOptions extends AIStructuredGenerationOptions {
  readonly preferredKeyIndex?: number;
}

export interface ReadingV2AutoQuestionAreaNormalizerProvider {
  generateStructuredJson(
    prompt: string,
    options?: ReadingV2AutoQuestionAreaNormalizerOptions,
  ): Promise<Result<unknown>>;
}

export interface ReadingV2AutoQuestionAreaNormalizerResult {
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly prompt: string;
  readonly promptHash: string;
  readonly rawStructuredJson: unknown;
  readonly rawJsonShapeSummary: string;
  readonly rawGroupRanges: readonly string[];
  readonly rawCoverageSummary?: ReadingV2AutoTranscriptCoverageSummary;
}

export const READING_V2_AUTO_QUESTION_AREA_NORMALIZER_SYSTEM_INSTRUCTION = [
  'You normalize one IELTS Reading question area into a strict transcript.',
  'Return valid JSON only. Do not return Markdown fences, comments, or prose.',
  'Do not solve answers. Do not infer answers. Do not paraphrase visible question, bank, option, or layout text.',
  'Do not output passage body text. Passage body is not in your input and must stay local.',
  'Do not output final Studio instruction prose. Return taskType plus instructionMeta only.',
].join('\n');

export const READING_V2_AUTO_GROQ_NORMALIZER_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
export const READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS = 8192;

const taskTranscriptShape = [
  '{',
  '  "passageNumber": 1,',
  '  "groups": [',
  '    {',
  '      "questionRange": { "start": 1, "end": 5 },',
  '      "taskType": "true-false-not-given",',
  '      "sourceInstructionText": "copied visible source instruction, if printed",',
  '      "instructionMeta": {',
  '        "wordLimit": 1,',
  '        "wordLimitText": "ONE WORD ONLY",',
  '        "vocabulary": "TFNG",',
  '        "selectionLimit": 2,',
  '        "answerSource": "passage",',
  '        "optionLabelRange": "A-D",',
  '        "referenceLabelRange": "i-viii",',
  '        "reuseAllowed": false,',
  '        "summaryAnswerMode": "text"',
  '      },',
  '      "labeledOptions": [{ "label": "A", "sourceTextExact": "A exact option text", "normalizedText": "exact option text", "text": "exact option text", "sourceLines": [12] }],',
  '      "sectionReferences": [{ "label": "i", "sourceTextExact": "i exact reference text", "normalizedText": "exact reference text", "text": "exact reference text", "sourceLines": [14] }],',
  '      "questions": [{ "number": 1, "sourceTextExact": "**1** exact visible prompt text ___", "normalizedPromptText": "exact visible prompt text ___", "promptText": "exact visible prompt text ___", "sourceLines": [20] }],',
  '      "note": { "sections": [{ "heading": "exact heading", "questionNumbers": [1], "lines": [{ "sourceTextExact": "**1** exact note line ___", "normalizedText": "exact note line ___", "text": "exact note line ___", "questionNumber": 1 }] }] },',
  '      "table": { "rows": [[{ "sourceTextExact": "Header", "normalizedText": "Header", "text": "Header", "role": "header" }, { "sourceTextExact": "**1** exact blank ___", "normalizedText": "exact blank ___", "text": "exact blank ___", "questionNumber": 1 }]] },',
  '      "flowchart": { "steps": [{ "stepId": "step-1", "sourceTextExact": "**1** exact step ___", "normalizedText": "exact step ___", "text": "exact step ___", "questionNumber": 1 }] },',
  '      "diagram": { "imageAlt": "exact printed diagram description", "targets": [{ "sourceLabelExact": "1", "normalizedLabel": "1", "label": "1", "questionNumber": 1 }] },',
  '      "diagnostics": []',
  '    }',
  '  ],',
  '  "coverageSummary": {',
  '    "coveredGroups": ["1-5"],',
  '    "coveredQuestions": [1, 2, 3, 4, 5]',
  '  },',
  '  "diagnostics": []',
  '}',
].join('\n');

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberFrom = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stringArrayFrom = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const numberArrayFrom = (value: unknown): readonly number[] | undefined =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const number = numberFrom(item);
        return number ? [number] : [];
      })
    : undefined;

const questionRangeKeyFromRaw = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const start = numberFrom(value[0]);
    const end = numberFrom(value[1]);
    return start && end ? readingV2AutoQuestionRangeKey({ start: Math.min(start, end), end: Math.max(start, end) }) : undefined;
  }

  if (isRecord(value)) {
    const start = numberFrom(value.start);
    const end = numberFrom(value.end);
    return start && end ? readingV2AutoQuestionRangeKey({ start: Math.min(start, end), end: Math.max(start, end) }) : undefined;
  }

  return undefined;
};

const rawCoverageSummaryFrom = (value: unknown): ReadingV2AutoTranscriptCoverageSummary | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const coveredGroups = stringArrayFrom(value.coveredGroups);
  const coveredQuestions = numberArrayFrom(value.coveredQuestions);
  return coveredGroups.length > 0 || coveredQuestions?.length
    ? {
        ...(coveredGroups.length > 0 ? { coveredGroups } : {}),
        ...(coveredQuestions?.length ? { coveredQuestions } : {}),
      }
    : undefined;
};

const rawGroupRangesFrom = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((group) => {
        if (!isRecord(group)) {
          return [];
        }

        const rangeKey = questionRangeKeyFromRaw(group.questionRange ?? group.range);
        return rangeKey ? [rangeKey] : [];
      })
    : [];

const rawJsonShapeSummaryFrom = (value: unknown): string => {
  if (!isRecord(value)) {
    return 'root=non-record';
  }

  const groups = Array.isArray(value.groups) ? value.groups : [];
  const questionCount = groups.reduce((count, group) => (
    isRecord(group) && Array.isArray(group.questions)
      ? count + group.questions.length
      : count
  ), 0);
  const coverageSummary = rawCoverageSummaryFrom(value.coverageSummary);

  return [
    `rootKeys=${Object.keys(value).sort().join(',') || 'none'}`,
    `groups=${groups.length}`,
    `questions=${questionCount}`,
    `coverageGroups=${coverageSummary?.coveredGroups?.length ?? 0}`,
    `coverageQuestions=${coverageSummary?.coveredQuestions?.length ?? 0}`,
  ].join('; ');
};

export const buildReadingV2AutoQuestionAreaNormalizerPrompt = (
  passagePackage: ReadingV2AutoPassagePackage,
): string => [
  'Normalize this one IELTS Reading passage question area into a strict transcript.',
  '',
  'Output JSON shape:',
  taskTranscriptShape,
  '',
  'Rules:',
  '1. Copy visible question, option, reference, note, table, flowchart, and diagram label text exactly as printed into sourceTextExact/sourceLabelExact fields.',
  '2. Use canonical Reading V2 task type slugs only.',
  '3. For every visible prompt or layout string, also return normalizedPromptText/normalizedText/normalizedLabel with only harmless cleanup: question markers, markdown escape noise, blank placeholders, and whitespace compaction.',
  '3a. When a blank sits inside a longer note, summary, sentence, or table line, sourceTextExact must include the full visible line context around that blank. Do not crop to only the token that starts at the question marker.',
  '4. Do not write standard Studio instruction prose. Return instructionMeta and sourceInstructionText only.',
  '5. groupHints are authoritative. Return exactly one transcript group for each groupHints item. Do not merge, split, skip, or reorder hinted groups.',
  '6. Keep every expected question number exactly once.',
  '7. Preserve reference banks and option banks. Use REFERENCE_BANK_LINES_ONLY when present; missing banks are diagnostics, not guesses.',
  '7a. Use only labeledOptions for option banks and sectionReferences for reference banks. Do not rename them to optionBank, referenceBank, choiceBank, or bank.',
  '8. Return coverageSummary.coveredGroups and coverageSummary.coveredQuestions for everything you emitted.',
  '9. If source text is ambiguous, still return conservative sourceTextExact evidence plus diagnostics. Never silently drop a hinted group.',
  '10. Passage body text is forbidden in your output.',
  '',
  passagePackage.groqInputText,
].join('\n');

export const normalizeReadingV2AutoQuestionArea = async (input: {
  readonly passagePackage: ReadingV2AutoPassagePackage;
  readonly provider: ReadingV2AutoQuestionAreaNormalizerProvider;
  readonly preferredKeyIndex?: number;
}): Promise<Result<ReadingV2AutoQuestionAreaNormalizerResult>> => {
  const prompt = buildReadingV2AutoQuestionAreaNormalizerPrompt(input.passagePackage);
  const result = await input.provider.generateStructuredJson(prompt, {
    systemInstruction: READING_V2_AUTO_QUESTION_AREA_NORMALIZER_SYSTEM_INSTRUCTION,
    model: READING_V2_AUTO_GROQ_NORMALIZER_MODEL,
    temperature: 0,
    maxOutputTokens: READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS,
    preferredKeyIndex: input.preferredKeyIndex,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const promptHash = hashString(prompt);
  const rawJsonShapeSummary = rawJsonShapeSummaryFrom(result.data);
  const rawGroupRanges = rawGroupRangesFrom(isRecord(result.data) ? result.data.groups : undefined);
  const rawCoverageSummary = rawCoverageSummaryFrom(isRecord(result.data) ? result.data.coverageSummary : undefined);
  const transcript = normalizeReadingV2AutoQuestionTranscript(result.data);
  if (!transcript) {
    return { success: false, error: 'Groq returned malformed Reading V2 question transcript.' };
  }

  return {
    success: true,
    data: {
      transcript,
      prompt,
      promptHash,
      rawStructuredJson: result.data,
      rawJsonShapeSummary,
      rawGroupRanges,
      ...(rawCoverageSummary ? { rawCoverageSummary } : {}),
    },
  };
};
