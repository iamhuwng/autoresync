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
  readonly retryInstruction?: string;
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
  'The response must conform to the supplied JSON Schema exactly.',
  'When copying source backslashes into JSON strings, escape each backslash as \\\\. Never emit raw invalid JSON escapes such as \\_, \\., or \\#.',
  'Do not solve answers. Do not infer answers. Do not paraphrase visible question, bank, option, or layout text.',
  'Do not output passage body text. Passage body is not in your input and must stay local.',
  'Do not output final Studio instruction prose. Return taskType plus instructionMeta only.',
].join('\n');

export const READING_V2_AUTO_GROQ_NORMALIZER_MODEL = 'openai/gpt-oss-120b';
export const READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS = 16384;

const stringArraySchema = { type: 'array', items: { type: 'string' } } as const;
const integerArraySchema = { type: 'array', items: { type: 'integer' } } as const;
const questionRangeSchema = {
  type: 'object',
  properties: {
    start: { type: 'integer' },
    end: { type: 'integer' },
  },
  required: ['start', 'end'],
  additionalProperties: false,
} as const;
const transcriptOptionSchema = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    sourceTextExact: { type: 'string' },
    normalizedText: { type: 'string' },
    text: { type: 'string' },
    sourceLines: integerArraySchema,
  },
  required: ['label', 'sourceTextExact', 'normalizedText', 'text', 'sourceLines'],
  additionalProperties: false,
} as const;
const transcriptQuestionSchema = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    sourceTextExact: { type: 'string' },
    normalizedPromptText: { type: 'string' },
    promptText: { type: 'string' },
    sourceLines: integerArraySchema,
    labeledOptions: { type: 'array', items: transcriptOptionSchema },
    sectionReferences: { type: 'array', items: transcriptOptionSchema },
  },
  required: [
    'number',
    'sourceTextExact',
    'normalizedPromptText',
    'promptText',
    'sourceLines',
    'labeledOptions',
    'sectionReferences',
  ],
  additionalProperties: false,
} as const;
const instructionMetaSchema = {
  type: 'object',
  properties: {
    wordLimit: { type: 'integer' },
    wordLimitText: { type: 'string' },
    vocabulary: { type: 'string' },
    selectionLimit: { type: 'integer' },
    answerSource: { type: 'string' },
    optionLabelRange: { type: 'string' },
    referenceLabelRange: { type: 'string' },
    reuseAllowed: { type: 'boolean' },
    summaryAnswerMode: { type: 'string', enum: ['text', 'list', ''] },
  },
  required: [
    'wordLimit',
    'wordLimitText',
    'vocabulary',
    'selectionLimit',
    'answerSource',
    'optionLabelRange',
    'referenceLabelRange',
    'reuseAllowed',
    'summaryAnswerMode',
  ],
  additionalProperties: false,
} as const;
const noteLineSchema = {
  type: 'object',
  properties: {
    sourceTextExact: { type: 'string' },
    normalizedText: { type: 'string' },
    text: { type: 'string' },
    sourceLines: integerArraySchema,
    questionNumber: { type: 'integer' },
    questionNumbers: integerArraySchema,
  },
  required: ['sourceTextExact', 'normalizedText', 'text', 'sourceLines', 'questionNumber', 'questionNumbers'],
  additionalProperties: false,
} as const;
const noteSectionSchema = {
  type: 'object',
  properties: {
    heading: { type: 'string' },
    questionNumbers: integerArraySchema,
    lines: { type: 'array', items: noteLineSchema },
  },
  required: ['heading', 'questionNumbers', 'lines'],
  additionalProperties: false,
} as const;
const noteSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subheading: { type: 'string' },
    sections: { type: 'array', items: noteSectionSchema },
    lines: { type: 'array', items: noteLineSchema },
  },
  required: ['title', 'subheading', 'sections', 'lines'],
  additionalProperties: false,
} as const;
const tableCellSchema = {
  type: 'object',
  properties: {
    sourceTextExact: { type: 'string' },
    normalizedText: { type: 'string' },
    text: { type: 'string' },
    role: { type: 'string' },
    questionNumber: { type: 'integer' },
    questionNumbers: integerArraySchema,
  },
  required: ['sourceTextExact', 'normalizedText', 'text', 'role', 'questionNumber', 'questionNumbers'],
  additionalProperties: false,
} as const;
const tableSchema = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'array',
        items: tableCellSchema,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;
const flowStepSchema = {
  type: 'object',
  properties: {
    stepId: { type: 'string' },
    sourceTextExact: { type: 'string' },
    normalizedText: { type: 'string' },
    text: { type: 'string' },
    questionNumber: { type: 'integer' },
    nextStepIds: stringArraySchema,
  },
  required: ['stepId', 'sourceTextExact', 'normalizedText', 'text', 'questionNumber', 'nextStepIds'],
  additionalProperties: false,
} as const;
const flowchartSchema = {
  type: 'object',
  properties: {
    steps: { type: 'array', items: flowStepSchema },
  },
  required: ['steps'],
  additionalProperties: false,
} as const;
const diagramTargetSchema = {
  type: 'object',
  properties: {
    sourceLabelExact: { type: 'string' },
    normalizedLabel: { type: 'string' },
    label: { type: 'string' },
    questionNumber: { type: 'integer' },
  },
  required: ['sourceLabelExact', 'normalizedLabel', 'label', 'questionNumber'],
  additionalProperties: false,
} as const;
const diagramSchema = {
  type: 'object',
  properties: {
    imageUrl: { type: 'string' },
    imageAlt: { type: 'string' },
    targets: { type: 'array', items: diagramTargetSchema },
  },
  required: ['imageUrl', 'imageAlt', 'targets'],
  additionalProperties: false,
} as const;
const transcriptGroupSchema = {
  type: 'object',
  properties: {
    questionRange: questionRangeSchema,
    taskType: { type: 'string' },
    sourceInstructionText: { type: 'string' },
    instructionMeta: instructionMetaSchema,
    labeledOptions: { type: 'array', items: transcriptOptionSchema },
    sectionReferences: { type: 'array', items: transcriptOptionSchema },
    questions: { type: 'array', items: transcriptQuestionSchema },
    note: noteSchema,
    table: tableSchema,
    flowchart: flowchartSchema,
    diagram: diagramSchema,
    diagnostics: stringArraySchema,
  },
  required: [
    'questionRange',
    'taskType',
    'sourceInstructionText',
    'instructionMeta',
    'labeledOptions',
    'sectionReferences',
    'questions',
    'note',
    'table',
    'flowchart',
    'diagram',
    'diagnostics',
  ],
  additionalProperties: false,
} as const;

export const READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'reading_v2_question_area_transcript',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        passageNumber: { type: 'integer' },
        groups: { type: 'array', items: transcriptGroupSchema },
        coverageSummary: {
          type: 'object',
          properties: {
            coveredGroups: stringArraySchema,
            coveredQuestions: integerArraySchema,
          },
          required: ['coveredGroups', 'coveredQuestions'],
          additionalProperties: false,
        },
        diagnostics: stringArraySchema,
      },
      required: ['passageNumber', 'groups', 'coverageSummary', 'diagnostics'],
      additionalProperties: false,
    },
  },
} as const;

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
  retryInstruction?: string,
): string => [
  'Normalize this one IELTS Reading passage question area into a strict transcript.',
  '',
  ...(retryInstruction
    ? [
        'Retry instruction:',
        retryInstruction,
        '',
      ]
    : []),
  'Output JSON shape:',
  taskTranscriptShape,
  '',
  'Rules:',
  '1. Copy visible question, option, reference, note, table, flowchart, and diagram label text exactly as printed into sourceTextExact/sourceLabelExact fields.',
  '2. Use canonical Reading V2 task type slugs only.',
  '3. For every visible prompt or layout string, also return normalizedPromptText/normalizedText/normalizedLabel with only harmless cleanup: question markers, markdown escape noise, blank placeholders, and whitespace compaction.',
  '3a. When a blank sits inside a longer note, summary, sentence, or table line, sourceTextExact must include the full visible line context around that blank. Do not crop to only the token that starts at the question marker.',
  '3b. Preserve copied source backslashes after JSON parsing by escaping them in the JSON text. Never emit raw invalid JSON escapes. Example: source text \\_ must be emitted in JSON as "\\\\_".',
  '4. Do not write standard Studio instruction prose. Return instructionMeta and sourceInstructionText only.',
  '5. groupHints are authoritative. Return exactly one transcript group for each groupHints item. Do not merge, split, skip, or reorder hinted groups.',
  '6. Keep every expected question number exactly once.',
  '7. Preserve reference banks and option banks. Use REFERENCE_BANK_LINES_ONLY when present; missing banks are diagnostics, not guesses.',
  '7a. Use only labeledOptions for option banks and sectionReferences for reference banks. Do not rename them to optionBank, referenceBank, choiceBank, or bank.',
  '8. Return coverageSummary.coveredGroups and coverageSummary.coveredQuestions for everything you emitted.',
  '9. If source text is ambiguous, still return conservative sourceTextExact evidence plus diagnostics. Never silently drop a hinted group.',
  '10. Passage body text is forbidden in your output.',
  '11. For absent optional structures, use empty objects with empty arrays for note/table/flowchart/diagram and [] for labeledOptions/sectionReferences/diagnostics.',
  '12. Every object field required by the JSON Schema must be present; use "", 0, false, or [] when a field has no source evidence.',
  '',
  passagePackage.groqInputText,
].join('\n');

export const normalizeReadingV2AutoQuestionArea = async (input: {
  readonly passagePackage: ReadingV2AutoPassagePackage;
  readonly provider: ReadingV2AutoQuestionAreaNormalizerProvider;
  readonly preferredKeyIndex?: number;
  readonly retryInstruction?: string;
}): Promise<Result<ReadingV2AutoQuestionAreaNormalizerResult>> => {
  const prompt = buildReadingV2AutoQuestionAreaNormalizerPrompt(input.passagePackage, input.retryInstruction);
  const result = await input.provider.generateStructuredJson(prompt, {
    systemInstruction: READING_V2_AUTO_QUESTION_AREA_NORMALIZER_SYSTEM_INSTRUCTION,
    model: READING_V2_AUTO_GROQ_NORMALIZER_MODEL,
    temperature: 0,
    maxOutputTokens: READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS,
    preferredKeyIndex: input.preferredKeyIndex,
    responseFormat: READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT,
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
