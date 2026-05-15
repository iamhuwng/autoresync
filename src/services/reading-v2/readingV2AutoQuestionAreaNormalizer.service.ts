import type { AIStructuredGenerationOptions } from '../ai/ai.service';
import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  normalizeReadingV2AutoQuestionTranscript,
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
  '      "labeledOptions": [{ "label": "A", "text": "exact option text", "sourceLines": [12] }],',
  '      "sectionReferences": [{ "label": "i", "text": "exact reference text", "sourceLines": [14] }],',
  '      "questions": [{ "number": 1, "promptText": "exact visible prompt text", "sourceLines": [20] }],',
  '      "note": { "sections": [{ "heading": "exact heading", "questionNumbers": [1], "lines": [{ "text": "exact note line ___", "questionNumber": 1 }] }] },',
  '      "table": { "rows": [[{ "text": "Header", "role": "header" }, { "text": "exact blank ___", "questionNumber": 1 }]] },',
  '      "flowchart": { "steps": [{ "stepId": "step-1", "text": "exact step ___", "questionNumber": 1 }] },',
  '      "diagram": { "imageAlt": "exact printed diagram description", "targets": [{ "label": "1", "questionNumber": 1 }] },',
  '      "diagnostics": []',
  '    }',
  '  ],',
  '  "diagnostics": []',
  '}',
].join('\n');

export const buildReadingV2AutoQuestionAreaNormalizerPrompt = (
  passagePackage: ReadingV2AutoPassagePackage,
): string => [
  'Normalize this one IELTS Reading passage question area into a strict transcript.',
  '',
  'Output JSON shape:',
  taskTranscriptShape,
  '',
  'Rules:',
  '1. Copy visible question, option, reference, note, table, flowchart, and diagram label text exactly as printed.',
  '2. Use canonical Reading V2 task type slugs only.',
  '3. Do not write standard Studio instruction prose. Return instructionMeta and sourceInstructionText only.',
  '4. Keep every expected question number exactly once.',
  '5. Preserve reference banks and option banks. Use REFERENCE_BANK_LINES_ONLY when present; missing banks are diagnostics, not guesses.',
  '5a. Use only labeledOptions for option banks and sectionReferences for reference banks. Do not rename them to optionBank, referenceBank, choiceBank, or bank.',
  '6. If source text is ambiguous, return diagnostics and keep copied text conservative.',
  '7. Passage body text is forbidden in your output.',
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

  const transcript = normalizeReadingV2AutoQuestionTranscript(result.data);
  if (!transcript) {
    return { success: false, error: 'Groq returned malformed Reading V2 question transcript.' };
  }

  return {
    success: true,
    data: {
      transcript,
      prompt,
    },
  };
};
