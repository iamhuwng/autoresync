import { describe, expect, it } from 'vitest';
import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  runReadingV2GroqPackageFanout,
  type ReadingV2GroqKeySlot,
  type ReadingV2GroqPackageFanoutProvider,
} from './readingV2GroqPackageFanout.service';

const passagePackage = (passageNumber: number): ReadingV2AutoPassagePackage => ({
  passageNumber,
  passageTitle: `Passage ${passageNumber}`,
  expectedQuestionRange: { start: passageNumber, end: passageNumber },
  passageBodyLines: [],
  questionAreaLines: [],
  referenceBankLines: [],
  passageBodyText: `Local body ${passageNumber}`,
  questionAreaText: [
    `Questions ${passageNumber}-${passageNumber}`,
    'Complete the task.',
    `${passageNumber} Exact prompt ${passageNumber} ___.`,
  ].join('\n'),
  groupHints: [{
    questionRange: { start: passageNumber, end: passageNumber },
    lines: { startLine: 1, endLine: 3 },
    taskTypeHint: 'sentence-completion',
  }],
  referenceBankLineSpans: [],
  excludedLineSpans: [],
  answerKeyRows: [{ questionNumber: passageNumber, answer: `answer${passageNumber}`, sourceLine: 10 }],
  sourceHash: 'src',
  groqInputText: `READING_V2_AUTO_V3_PASSAGE_PACKAGE ${passageNumber}\n${passageNumber} Exact prompt ${passageNumber} ___.`,
  diagnostics: [],
});

const transcriptFor = (passageNumber: number) => ({
  passageNumber,
  groups: [{
    questionRange: { start: passageNumber, end: passageNumber },
    taskType: 'sentence-completion',
    sourceInstructionText: 'Complete the task.',
    instructionMeta: { wordLimit: 1 },
    questions: [{
      number: passageNumber,
      sourceTextExact: `${passageNumber} Exact prompt ${passageNumber} ___.`,
      normalizedPromptText: `Exact prompt ${passageNumber} ___.`,
      promptText: `Exact prompt ${passageNumber} ___.`,
    }],
  }],
  coverageSummary: {
    coveredGroups: [`${passageNumber}-${passageNumber}`],
    coveredQuestions: [passageNumber],
  },
  diagnostics: [],
});

const providerFor = (input: {
  readonly slots: readonly ReadingV2GroqKeySlot[];
  readonly failOnceForPassage?: number;
  readonly failOnceMalformedForPassage?: number;
  readonly failOnceMalformedTranscriptForPassage?: number;
  readonly failOnceSchemaForPassage?: number;
  readonly failAlwaysForPassage?: number;
  readonly rawError?: string;
}) => {
  const mutableCalls: number[] = [];
  const prompts: string[] = [];
  const failures = new Set<number>();
  const provider: ReadingV2GroqPackageFanoutProvider = {
    getAvailableStructuredJsonKeySlots: async () => input.slots,
    generateStructuredJson: async (prompt, options): Promise<Result<unknown>> => {
      mutableCalls.push(options?.preferredKeyIndex ?? -1);
      prompts.push(prompt);
      const passageNumber = Number(prompt.match(/PACKAGE\s+(\d+)/)?.[1] ?? 0);
      if (input.failAlwaysForPassage === passageNumber) {
        return { success: false, error: input.rawError ?? 'package failed' };
      }
      if (input.failOnceMalformedForPassage === passageNumber && !failures.has(passageNumber)) {
        failures.add(passageNumber);
        return { success: false, error: 'Structured generation failed: No valid JSON found in AI response (bad-escape-sequence)' };
      }
      if (input.failOnceMalformedTranscriptForPassage === passageNumber && !failures.has(passageNumber)) {
        failures.add(passageNumber);
        return {
          success: true,
          data: {
            passageNumber,
            groups: [],
          },
        };
      }
      if (input.failOnceSchemaForPassage === passageNumber && !failures.has(passageNumber)) {
        failures.add(passageNumber);
        return {
          success: false,
          error: 'Structured generation failed: 400 {"error":{"message":"Generated JSON does not match the expected schema. Error: jsonschema: \'\' does not validate with /required: missing properties: \'coverageSummary\', \'diagnostics\'","code":"json_validate_failed"}}',
        };
      }
      if (input.failOnceForPassage === passageNumber && !failures.has(passageNumber)) {
        failures.add(passageNumber);
        return { success: false, error: 'rate limit' };
      }
      return { success: true, data: transcriptFor(passageNumber) };
    },
  };

  return {
    provider,
    mutableCalls,
    prompts,
  };
};

const slots = (count: number): readonly ReadingV2GroqKeySlot[] =>
  Array.from({ length: count }, (_, index) => ({
    index,
    fingerprint: `groq-slot-${index}`,
    available: true,
  }));

describe('readingV2GroqPackageFanout.service', () => {
  it('assigns three passage packages to three distinct Groq key slots', async () => {
    const harness = providerFor({ slots: slots(3) });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1), passagePackage(2), passagePackage(3)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    expect(harness.mutableCalls).toEqual([0, 1, 2]);
    if (result.success) {
      expect(result.data.packageResults.map((item) => item.keyFingerprint)).toEqual(['groq-slot-0', 'groq-slot-1', 'groq-slot-2']);
      expect(result.data.packageResults[0]?.prompt).toContain('READING_V2_AUTO_V3_PASSAGE_PACKAGE 1');
      expect(result.data.packageResults[0]?.rawStructuredJson).toEqual(transcriptFor(1));
      expect(result.data.packageResults[0]?.rawGroupRanges).toEqual(['1-1']);
      expect(result.data.packageResults[0]?.promptHash).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('degrades visibly when fewer than three key slots are available', async () => {
    const harness = providerFor({ slots: slots(2) });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1), passagePackage(2), passagePackage(3)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-key-slot-degraded', severity: 'warning' }),
      ]));
    }
  });

  it('retries only the failed package on another key slot and preserves successful transcripts', async () => {
    const harness = providerFor({ slots: slots(3), failOnceForPassage: 2 });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1), passagePackage(2), passagePackage(3)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    expect(harness.mutableCalls).toEqual([0, 1, 2, 0]);
    if (result.success) {
      expect(result.data.packageResults.map((item) => item.passageNumber)).toEqual([1, 2, 3]);
      expect(result.data.packageResults.find((item) => item.passageNumber === 2)?.attempts).toBe(2);
    }
  });

  it('retries malformed JSON on the same package even when only one Groq slot is available', async () => {
    const harness = providerFor({ slots: slots(1), failOnceMalformedForPassage: 1 });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    expect(harness.mutableCalls).toEqual([0, 0]);
    expect(harness.prompts[1]).toContain('Retry instruction:');
    expect(harness.prompts[1]).toContain('escape each backslash');
    if (result.success) {
      expect(result.data.packageResults[0]?.attempts).toBe(2);
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-json-malformed', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-json-retried', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-json-retry-succeeded', severity: 'info' }),
      ]));
    }
  });

  it('keeps malformed JSON retry failures distinct before final package failure', async () => {
    const harness = providerFor({
      slots: slots(1),
      failAlwaysForPassage: 1,
      rawError: 'Structured generation failed: No valid JSON found in AI response (bad-escape-sequence)',
    });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1)],
      provider: harness.provider,
    });

    expect(result.success).toBe(false);
    expect(harness.mutableCalls).toEqual([0, 0]);
    if (!result.success) {
      expect(result.error).toContain('bad-escape-sequence');
    }
  });

  it('retries malformed transcript JSON through Groq instead of local fallback parsing', async () => {
    const harness = providerFor({ slots: slots(1), failOnceMalformedTranscriptForPassage: 1 });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    expect(harness.mutableCalls).toEqual([0, 0]);
    expect(harness.prompts[1]).toContain('Return exactly one group for each groupHints item');
    if (result.success) {
      expect(result.data.packageResults[0]?.attempts).toBe(2);
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-json-malformed', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-json-retry-succeeded', severity: 'info' }),
      ]));
    }
  });

  it('retries schema-rejected structured JSON with explicit required top-level fields', async () => {
    const harness = providerFor({ slots: slots(1), failOnceSchemaForPassage: 1 });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1)],
      provider: harness.provider,
    });

    expect(result.success).toBe(true);
    expect(harness.mutableCalls).toEqual([0, 0]);
    expect(harness.prompts[1]).toContain('passageNumber and groups');
    expect(harness.prompts[1]).toContain('Do not return coverageSummary or diagnostics');
    expect(harness.prompts[1]).toContain('root JSON value must be one object');
    if (result.success) {
      expect(result.data.packageResults[0]?.attempts).toBe(2);
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-json-malformed', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-json-retried', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-json-retry-succeeded', severity: 'info' }),
      ]));
    }
  });

  it('feeds low-completion Groq output back to Groq before local repair', async () => {
    const packageWithTwoQuestions: ReadingV2AutoPassagePackage = {
      ...passagePackage(1),
      expectedQuestionRange: { start: 1, end: 2 },
      questionAreaText: [
        'Questions 1-2',
        'Complete the task.',
        '1 Exact prompt 1 ___.',
        '2 Exact prompt 2 ___.',
      ].join('\n'),
      groupHints: [{
        questionRange: { start: 1, end: 2 },
        lines: { startLine: 1, endLine: 4 },
        taskTypeHint: 'sentence-completion',
      }],
      answerKeyRows: [
        { questionNumber: 1, answer: 'answer1', sourceLine: 10 },
        { questionNumber: 2, answer: 'answer2', sourceLine: 11 },
      ],
      groqInputText: [
        'READING_V2_AUTO_V3_PASSAGE_PACKAGE 1',
        '1 Exact prompt 1 ___.',
        '2 Exact prompt 2 ___.',
      ].join('\n'),
    };
    let callCount = 0;
    const prompts: string[] = [];
    const provider: ReadingV2GroqPackageFanoutProvider = {
      getAvailableStructuredJsonKeySlots: async () => slots(1),
      generateStructuredJson: async (prompt): Promise<Result<unknown>> => {
        prompts.push(prompt);
        callCount += 1;
        return {
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'sentence-completion',
              sourceInstructionText: 'Complete the task.',
              instructionMeta: { wordLimit: 1 },
              questions: callCount === 1
                ? [{
                    number: 1,
                    sourceTextExact: '1 Exact prompt 1 ___.',
                    normalizedPromptText: 'Exact prompt 1 ___.',
                    promptText: 'Exact prompt 1 ___.',
                  }]
                : [
                    {
                      number: 1,
                      sourceTextExact: '1 Exact prompt 1 ___.',
                      normalizedPromptText: 'Exact prompt 1 ___.',
                      promptText: 'Exact prompt 1 ___.',
                    },
                    {
                      number: 2,
                      sourceTextExact: '2 Exact prompt 2 ___.',
                      normalizedPromptText: 'Exact prompt 2 ___.',
                      promptText: 'Exact prompt 2 ___.',
                    },
                  ],
            }],
            diagnostics: [],
          },
        };
      },
    };

    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [packageWithTwoQuestions],
      provider,
    });

    expect(result.success).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('transcript audit found incomplete or unsafe coverage');
    expect(prompts[1]).toContain('1-2: missing question(s) 2');
    if (result.success) {
      expect(result.data.packageResults[0]?.attempts).toBe(2);
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-package-completion-retried', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-completion-retry-succeeded', severity: 'info' }),
      ]));
    }
  });

  it('feeds transcript verifier issues back to Groq before local repair', async () => {
    const matchingPackage: ReadingV2AutoPassagePackage = {
      ...passagePackage(1),
      questionAreaText: [
        'Questions 1-1',
        'Which feature is described?',
        '1 Exact prompt 1',
      ].join('\n'),
      questionAreaLines: [
        { lineNumber: 1, text: 'Questions 1-1', trimmedTextHash: 'q' },
        { lineNumber: 2, text: 'Which feature is described?', trimmedTextHash: 'i' },
        { lineNumber: 3, text: '1 Exact prompt 1', trimmedTextHash: 'p' },
      ],
      referenceBankLines: [
        { lineNumber: 4, text: 'A Example feature', trimmedTextHash: 'a' },
      ],
      groupHints: [{
        questionRange: { start: 1, end: 1 },
        lines: { startLine: 1, endLine: 3 },
        taskTypeHint: 'matching-features',
      }],
      referenceBankLineSpans: [{ startLine: 4, endLine: 4 }],
      groqInputText: [
        'READING_V2_AUTO_V3_PASSAGE_PACKAGE 1',
        'QUESTION_AREA_LINES_ONLY',
        '1 Exact prompt 1',
        'REFERENCE_BANK_LINES_ONLY',
        'A Example feature',
      ].join('\n'),
    };
    let callCount = 0;
    const prompts: string[] = [];
    const provider: ReadingV2GroqPackageFanoutProvider = {
      getAvailableStructuredJsonKeySlots: async () => slots(1),
      generateStructuredJson: async (prompt): Promise<Result<unknown>> => {
        prompts.push(prompt);
        callCount += 1;
        return {
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 1 },
              taskType: 'matching-features',
              sourceInstructionText: 'Which feature is described?',
              instructionMeta: { referenceLabelRange: 'A' },
              ...(callCount === 1
                ? {}
                : {
                    sectionReferences: [{
                      label: 'A',
                      sourceTextExact: 'A Example feature',
                      normalizedText: 'Example feature',
                      text: 'Example feature',
                    }],
                  }),
              questions: [{
                number: 1,
                sourceTextExact: callCount === 1 ? '1 Hallucinated prompt' : '1 Exact prompt 1',
                normalizedPromptText: callCount === 1 ? 'Hallucinated prompt' : 'Exact prompt 1',
                promptText: callCount === 1 ? 'Hallucinated prompt' : 'Exact prompt 1',
              }],
            }],
            diagnostics: [],
          },
        };
      },
    };

    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [matchingPackage],
      provider,
    });

    expect(result.success).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('missing-reference-bank');
    expect(prompts[1]).toContain('source-text-exact-missing');
    expect(prompts[1]).toContain('Repair taskType, banks, blanks, duplicate numbers, and source-proof drift');
    if (result.success) {
      expect(result.data.packageResults[0]?.attempts).toBe(2);
      expect(result.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'groq-package-completion-retried', severity: 'warning' }),
        expect.objectContaining({ code: 'groq-package-completion-retry-succeeded', severity: 'info' }),
      ]));
    }
  });

  it('redacts raw keys from package failure diagnostics', async () => {
    const fakeRawKey = ['gsk', '_thisrawkeymustnotleak1234567890'].join('');
    const harness = providerFor({
      slots: slots(1),
      failAlwaysForPassage: 1,
      rawError: `failed with ${fakeRawKey}`,
    });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1)],
      provider: harness.provider,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain(fakeRawKey);
      expect(result.error).toContain('[redacted-key]');
    }
  });

  it('stops degraded sequential fan-out after a quota failure', async () => {
    const harness = providerFor({
      slots: slots(1),
      failAlwaysForPassage: 1,
      rawError: 'All Groq API keys exhausted or rate-limited',
    });
    const result = await runReadingV2GroqPackageFanout({
      passagePackages: [passagePackage(1), passagePackage(2), passagePackage(3)],
      provider: harness.provider,
    });

    expect(result.success).toBe(false);
    expect(harness.mutableCalls).toEqual([0]);
    if (!result.success) {
      expect(result.error).toContain('All Groq API keys exhausted or rate-limited');
    }
  });
});
