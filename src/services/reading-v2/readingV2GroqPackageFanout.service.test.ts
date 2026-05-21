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
  readonly failAlwaysForPassage?: number;
  readonly rawError?: string;
}) => {
  const mutableCalls: number[] = [];
  const failures = new Set<number>();
  const provider: ReadingV2GroqPackageFanoutProvider = {
    getAvailableStructuredJsonKeySlots: async () => input.slots,
    generateStructuredJson: async (prompt, options): Promise<Result<unknown>> => {
      mutableCalls.push(options?.preferredKeyIndex ?? -1);
      const passageNumber = Number(prompt.match(/PACKAGE\s+(\d+)/)?.[1] ?? 0);
      if (input.failAlwaysForPassage === passageNumber) {
        return { success: false, error: input.rawError ?? 'package failed' };
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
