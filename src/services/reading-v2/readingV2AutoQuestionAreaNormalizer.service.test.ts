import { describe, expect, it } from 'vitest';
import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  READING_V2_AUTO_GROQ_NORMALIZER_MAX_OUTPUT_TOKENS,
  READING_V2_AUTO_GROQ_NORMALIZER_MODEL,
  READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT,
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
    questions: [{
      number: 1,
      sourceTextExact: '1 Exact prompt ___.',
      normalizedPromptText: 'Exact prompt ___.',
      promptText: 'Exact prompt ___.',
    }],
  }],
  coverageSummary: {
    coveredGroups: ['1-1'],
    coveredQuestions: [1],
  },
  diagnostics: [],
};

describe('readingV2AutoQuestionAreaNormalizer.service', () => {
  it('builds a question-area-only prompt without passage body text', () => {
    const prompt = buildReadingV2AutoQuestionAreaNormalizerPrompt(passagePackage);

    expect(prompt).toContain('Exact prompt ___.');
    expect(prompt).not.toContain(passagePackage.passageBodyText);
    expect(prompt).toContain('groupHints are authoritative');
    expect(prompt).toContain('coverageSummary');
    expect(prompt).toContain('sourceTextExact');
    expect(prompt).toContain('normalizedPromptText');
    expect(prompt).toContain('full visible line context around that blank');
    expect(prompt).toContain('Never emit raw invalid JSON escapes');
    expect(prompt).toContain('source text \\_ must be emitted in JSON as "\\\\_"');
  });

  it('adds targeted retry instructions without changing passage package content', () => {
    const prompt = buildReadingV2AutoQuestionAreaNormalizerPrompt(
      passagePackage,
      'Previous output had bad-escape-sequence. Return valid JSON only.',
    );

    expect(prompt).toContain('Retry instruction:');
    expect(prompt).toContain('bad-escape-sequence');
    expect(prompt).toContain('Exact prompt ___.');
    expect(prompt).not.toContain(passagePackage.passageBodyText);
  });

  it('passes preferred Groq key slot and normalizes strict transcript JSON', async () => {
    let receivedPrompt = '';
    let receivedOptions: {
      preferredKeyIndex?: number;
      model?: string;
      maxOutputTokens?: number;
      responseFormat?: unknown;
    } | undefined;
    const provider = {
      generateStructuredJson: async (
        prompt: string,
        options?: { preferredKeyIndex?: number; model?: string; maxOutputTokens?: number; responseFormat?: unknown },
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
    expect(receivedOptions?.responseFormat).toBe(READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT);
    expect(receivedPrompt).not.toContain(passagePackage.passageBodyText);
    if (result.success) {
      expect(result.data.transcript.groups[0]?.taskType).toBe('sentence-completion');
      expect(result.data.promptHash).toMatch(/^[0-9a-f]{8}$/);
      expect(result.data.rawStructuredJson).toEqual(transcript);
      expect(result.data.rawJsonShapeSummary).toContain('groups=1');
      expect(result.data.rawGroupRanges).toEqual(['1-1']);
      expect(result.data.rawCoverageSummary?.coveredQuestions).toEqual([1]);
    }
  });

  it('uses Groq strict schema-compatible model and response format', () => {
    expect(READING_V2_AUTO_GROQ_NORMALIZER_MODEL).toBe('openai/gpt-oss-120b');
    expect(READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'reading_v2_question_area_transcript',
        strict: true,
        schema: {
          additionalProperties: false,
          required: ['passageNumber', 'groups', 'coverageSummary', 'diagnostics'],
        },
      },
    });
  });
});
