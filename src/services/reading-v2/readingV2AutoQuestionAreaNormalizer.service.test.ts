import { describe, expect, it } from 'vitest';
import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS,
  READING_V2_AUTO_GROQ_NORMALIZER_MODEL,
  buildReadingV2AutoQuestionAreaNormalizerPrompt,
  normalizeReadingV2AutoQuestionArea,
} from './readingV2AutoQuestionAreaNormalizer.service';

const passagePackage: ReadingV2AutoPassagePackage = {
  passageNumber: 1,
  passageTitle: 'Reading Passage 1',
  expectedQuestionRange: { start: 1, end: 1 },
  passageBodyLines: [],
  questionAreaLines: [],
  referenceBankLines: [],
  passageBodyText: 'This passage body must stay local and must not go to Groq.',
  questionAreaText: 'Questions 1-1\nComplete the sentence.\n1 Exact prompt ___.',
  groupHints: [{
    questionRange: { start: 1, end: 1 },
    lines: { startLine: 10, endLine: 12 },
    taskTypeHint: 'sentence-completion',
  }],
  referenceBankLineSpans: [],
  excludedLineSpans: [],
  answerKeyRows: [{ questionNumber: 1, answer: 'answer1', sourceLine: 50 }],
  sourceHash: 'src',
  groqInputText: [
    'READING_V2_AUTO_V3_PASSAGE_PACKAGE 1',
    'Questions 1-1',
    'Complete the sentence.',
    '1 Exact prompt ___.',
  ].join('\n'),
  diagnostics: [],
};

const transcript = {
  passageNumber: 1,
  groups: [{
    questionRange: { start: 1, end: 1 },
    taskType: 'sentence-completion',
    sourceInstructionText: 'Complete the sentence.',
    instructionMeta: { wordLimit: 1 },
    questions: [{ number: 1, promptText: 'Exact prompt ___.' }],
  }],
  diagnostics: [],
};

describe('readingV2AutoQuestionAreaNormalizer.service', () => {
  it('builds a question-area-only prompt without passage body text', () => {
    const prompt = buildReadingV2AutoQuestionAreaNormalizerPrompt(passagePackage);

    expect(prompt).toContain('Exact prompt ___.');
    expect(prompt).not.toContain(passagePackage.passageBodyText);
  });

  it('passes preferred Groq key slot and normalizes strict transcript JSON', async () => {
    let receivedPrompt = '';
    let receivedOptions: {
      preferredKeyIndex?: number;
      model?: string;
      maxOutputTokens?: number;
    } | undefined;
    const provider = {
      generateStructuredJson: async (
        prompt: string,
        options?: { preferredKeyIndex?: number; model?: string; maxOutputTokens?: number },
      ): Promise<Result<unknown>> => {
        receivedPrompt = prompt;
        receivedOptions = options;
        return { success: true, data: transcript };
      },
    };

    const result = await normalizeReadingV2AutoQuestionArea({
      passagePackage,
      provider,
      preferredKeyIndex: 2,
    });

    expect(result.success).toBe(true);
    expect(receivedOptions?.preferredKeyIndex).toBe(2);
    expect(receivedOptions?.model).toBe(READING_V2_AUTO_GROQ_NORMALIZER_MODEL);
    expect(receivedOptions?.maxOutputTokens).toBe(READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS);
    expect(receivedPrompt).not.toContain(passagePackage.passageBodyText);
    if (result.success) {
      expect(result.data.transcript.groups[0]?.taskType).toBe('sentence-completion');
    }
  });
});
