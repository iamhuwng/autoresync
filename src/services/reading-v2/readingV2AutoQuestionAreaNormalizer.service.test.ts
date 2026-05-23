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
    expect(prompt).toContain('derives coverage diagnostics from emitted groups');
    expect(prompt).toContain('sourceTextExact');
    expect(prompt).toContain('normalizedPromptText');
    expect(prompt).toContain('full visible line context around that blank');
    expect(prompt).toContain('Never emit raw invalid JSON escapes');
    expect(prompt).toContain('Never wrap it in an array');
    expect(prompt).toContain('source text \\_ must be emitted in JSON as "\\\\_"');
    expect(prompt).toContain('Preserve visible layout in note/table/flowchart/diagram');
    expect(prompt).not.toContain('Do not return note/table/flowchart/diagram');
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

  it('uses Groq schema-guided JSON response format without strict all-fields rejection', () => {
    expect(READING_V2_AUTO_GROQ_NORMALIZER_MODEL).toBe('openai/gpt-oss-120b');
    expect(READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'reading_v2_question_area_transcript',
        strict: false,
        schema: {
          additionalProperties: false,
          required: ['passageNumber', 'groups'],
          properties: {
            passageNumber: { type: 'integer' },
            groups: {
              items: {
                properties: {
                  taskType: {
                    enum: expect.arrayContaining([
                      'summary-completion-text',
                      'matching-features',
                      'multiple-choice',
                    ]),
                  },
                  note: expect.any(Object),
                  table: expect.any(Object),
                  flowchart: expect.any(Object),
                  diagram: expect.any(Object),
                  questions: {
                    items: {
                      properties: expect.objectContaining({
                        sourceLines: expect.any(Object),
                      }),
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT)).not.toContain('coverageSummary');
    expect(
      READING_V2_AUTO_GROQ_NORMALIZER_RESPONSE_FORMAT.json_schema.schema.properties.groups.items.required,
    ).not.toContain('questions');
  });

  it('accepts layout transcript fields for Studio preservation', async () => {
    const provider = {
      generateStructuredJson: async (): Promise<Result<unknown>> => ({
        success: true,
        data: {
          passageNumber: 1,
          groups: [{
            questionRange: { start: 1, end: 1 },
            taskType: 'note-completion',
            sourceInstructionText: 'Complete the notes.',
            instructionMeta: { wordLimit: 1 },
            questions: [{
              number: 1,
              sourceTextExact: '1 Exact prompt ___.',
              normalizedPromptText: 'Exact prompt ___.',
              promptText: 'Exact prompt ___.',
            }],
            note: {
              lines: [{
                text: 'Exact prompt ___.',
                sourceTextExact: '1 Exact prompt ___.',
                normalizedText: 'Exact prompt ___.',
                questionNumber: 1,
              }],
            },
          }],
        },
      }),
    };

    const result = await normalizeReadingV2AutoQuestionArea({
      passagePackage,
      provider,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcript.groups[0]?.note?.lines?.[0]?.text).toBe('Exact prompt ___.');
    }
  });

  it('accepts usable Groq groups when optional root coverage metadata is omitted', async () => {
    const withoutRootCoverage = {
      passageNumber: transcript.passageNumber,
      groups: transcript.groups,
    };
    const provider = {
      generateStructuredJson: async (): Promise<Result<unknown>> => ({ success: true, data: withoutRootCoverage }),
    };

    const result = await normalizeReadingV2AutoQuestionArea({
      passagePackage,
      provider,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcript.groups[0]?.questionRange).toEqual({ start: 1, end: 1 });
      expect(result.data.rawCoverageSummary).toBeUndefined();
      expect(result.data.rawJsonShapeSummary).toContain('coverageQuestions=0');
    }
  });
});
