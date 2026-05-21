import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildProviderPreflight,
  buildReport,
  isProviderQuotaStopSignal,
  parseArgs,
  runLiveGeminiProbes,
  sanitizeLiveError,
} from '../../../scripts/reading-v2-clippings-harness';

const passageText = (passageNumber: number): string => [
  `READING PASSAGE ${passageNumber}`,
  `Synthetic harness passage ${passageNumber} paragraph A keeps the fixture local and non-copyrighted.`,
  `Synthetic harness passage ${passageNumber} paragraph B gives the ledger enough stable source text.`,
].join('\n');

const questionLines = (start: number, end: number): string => [
  `Questions ${start}-${end}`,
  'Complete the synthetic harness task.',
  ...Array.from({ length: end - start + 1 }, (_, index) => `${start + index} Synthetic question ${start + index}.`),
].join('\n');

const answerLines = (start: number, end: number): string =>
  Array.from({ length: end - start + 1 }, (_, index) => `${start + index} TRUE`).join('\n');

const fullSource = [
  '# Synthetic Harness Test',
  passageText(1),
  questionLines(1, 13),
  passageText(2),
  questionLines(14, 26),
  passageText(3),
  questionLines(27, 40),
  'Answers',
  answerLines(1, 40),
].join('\n\n');

const missingBankSource = [
  '# Synthetic Missing Bank',
  'READING PASSAGE 1',
  'Paragraph A text.',
  'Paragraph B text.',
  'Paragraph C text.',
  '',
  'Questions 1-2',
  'Reading Passage 1 has three paragraphs, A-C.',
  'Which paragraph contains the following information?',
  '1 a reference to forests',
  '2 a reference to rivers',
  '',
  'Answers',
  '1 A',
  '2 B',
].join('\n');

const blankMismatchSource = [
  '# Synthetic Blank Mismatch',
  'READING PASSAGE 1',
  'Paragraph A text.',
  '',
  'Questions 3-3',
  'Complete the sentence below.',
  '3 one ___ two ___.',
  '',
  'Answers',
  '3 rope',
].join('\n');

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-v2-harness-'));
  await writeFile(path.join(root, 'synthetic-full-test.md'), fullSource, 'utf8');
  return root;
};

const makeRootWithNegativeFixtures = async (): Promise<string> => {
  const root = await makeRoot();
  await writeFile(path.join(root, 'synthetic-missing-bank.md'), missingBankSource, 'utf8');
  await writeFile(path.join(root, 'synthetic-blank-mismatch.md'), blankMismatchSource, 'utf8');
  return root;
};

describe('reading-v2-clippings-harness', () => {
  it('parses explicit live Gemini flags without making them default', () => {
    const args = parseArgs([
      '--root',
      'C:/tmp/source',
      '--out',
      'output/report.json',
      '--mode',
      'live-gemini',
      '--allow-live-gemini',
      '--live-limit',
      '2',
      '--live-tags',
      'clean-full-test,known-difficult',
    ]);

    expect(args.mode).toBe('live-gemini');
    expect(args.allowLiveGemini).toBe(true);
    expect(args.allowLiveV3Providers).toBe(false);
    expect(args.liveLimit).toBe(2);
    expect(args.liveTags).toEqual(['clean-full-test', 'known-difficult']);
  });

  it('parses V3 mocked and live provider harness modes', () => {
    expect(parseArgs(['--mode', 'ledger-only']).mode).toBe('ledger-only');
    expect(parseArgs(['--mode', 'gemini-marker-mocked']).mode).toBe('gemini-marker-mocked');
    expect(parseArgs(['--mode', 'groq-transcript-mocked']).mode).toBe('groq-transcript-mocked');
    expect(parseArgs(['--mode', 'full-mocked-v3']).mode).toBe('full-mocked-v3');
    expect(parseArgs(['--mode', 'provider-preflight']).mode).toBe('provider-preflight');

    const liveArgs = parseArgs(['--mode', 'live-v3-gemini-groq', '--allow-live-v3-providers']);

    expect(liveArgs.mode).toBe('live-v3-gemini-groq');
    expect(liveArgs.allowLiveGemini).toBe(false);
    expect(liveArgs.allowLiveV3Providers).toBe(true);
  });

  it('caps live probe count and redacts sensitive live errors', () => {
    const args = parseArgs(['--mode', 'live-gemini', '--live-limit', '99']);
    const fakeGroqKey = ['gsk_', 'fakeSecretToken1234567890'].join('');
    const fakeOpenAiKey = ['sk-', 'fakeSecretToken_1234567890'].join('');

    expect(args.liveLimit).toBe(5);
    expect(sanitizeLiveError(
      `Failed with key=AIzaSecretToken123, ${fakeGroqKey}, ${fakeOpenAiKey}, org_01abcdef at C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings\\source.md`,
    )).toBe('Failed with key=[redacted], [redacted-api-key], [redacted-api-key], [redacted-org] at [redacted-windows-path]');
  });

  it('classifies quota and rate-limit stop signals', () => {
    expect(isProviderQuotaStopSignal('All Gemini API keys exhausted or rate-limited')).toBe(true);
    expect(isProviderQuotaStopSignal('All Groq API keys exhausted or rate-limited')).toBe(true);
    expect(isProviderQuotaStopSignal('429 requests_per_day quota exceeded')).toBe(true);
    expect(isProviderQuotaStopSignal('Malformed transcript')).toBe(false);
  });

  it('builds a redacted mocked-intermediate report with representative picks', async () => {
    const root = await makeRoot();
    const report = await buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'mocked-intermediate',
      allowLiveGemini: false,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    });

    expect(report.summary).toMatchObject({
      totalFilesScanned: 1,
      supportedFullTests: 1,
      accepted: 1,
      generatedInteractionCount: 40,
      boundAnswerCount: 40,
      sourceProofMismatchCount: 0,
      groupCoverageMismatchCount: 0,
      repairOutcomeCount: 0,
      bankHeuristicUsageCount: 0,
    });
    expect(report.representatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'clean-full-test', questionCount: 40, answerKeyRowCount: 40 }),
    ]));
    expect(JSON.stringify(report)).not.toContain('READING PASSAGE');
    expect(JSON.stringify(report)).not.toContain('"answerKeyText"');
  });

  it('builds a redacted full mocked V3 report with marker/package/transcript stage evidence', async () => {
    const root = await makeRoot();
    const report = await buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'full-mocked-v3',
      allowLiveGemini: false,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    });

    expect(report.summary).toMatchObject({
      totalFilesScanned: 1,
      supportedFullTests: 1,
      accepted: 1,
      generatedInteractionCount: 40,
      boundAnswerCount: 40,
      markerDiagnosticCount: 0,
      packageDiagnosticCount: 0,
      transcriptDiagnosticCount: 0,
      sourceProofMismatchCount: 0,
      groupCoverageMismatchCount: 0,
      repairOutcomeCount: 0,
      bankHeuristicUsageCount: 0,
    });
    expect(report.items[0]).toEqual(expect.objectContaining({
      v3Stage: 'assembled',
      markerDiagnosticCodes: [],
      packageDiagnosticCodes: [],
      transcriptDiagnosticCodes: [],
    }));
    expect(JSON.stringify(report)).not.toContain('Synthetic harness passage');
    expect(JSON.stringify(report)).not.toContain('"answerKeyText"');
  });

  it('promotes harness coverage from positive-only to positive-plus-negative transcript variants', async () => {
    const root = await makeRootWithNegativeFixtures();
    const report = await buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'groq-transcript-mocked',
      allowLiveGemini: false,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test', 'known-difficult'],
    });

    expect(report.summary).toMatchObject({
      totalFilesScanned: 3,
      supportedFullTests: 1,
      accepted: 1,
      rejected: 2,
    });
    expect(report.summary.transcriptDiagnosticCount).toBeGreaterThan(0);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'synthetic-missing-bank.md',
        transcriptDiagnosticCodes: expect.arrayContaining(['missing-reference-bank']),
        status: 'rejected',
      }),
      expect.objectContaining({
        path: 'synthetic-blank-mismatch.md',
        transcriptDiagnosticCodes: expect.arrayContaining(['blank-mismatch']),
        status: 'rejected',
      }),
    ]));
    expect(report.representatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'known-difficult' }),
    ]));
  });

  it('builds a no-content provider preflight with safe Groq fan-out evidence', async () => {
    const preflight = await buildProviderPreflight({
      getAIAvailability: async () => ({
        available: true,
        geminiAvailable: true,
        groqAvailable: true,
        totalKeys: 7,
        benchedKeys: 1,
      }),
      getGroqSlots: async () => [
        { index: 0, fingerprint: 'groq-safe-a', available: true },
        { index: 1, fingerprint: 'groq-safe-b', available: true },
        { index: 2, fingerprint: 'groq-safe-c', available: true },
      ],
      getAPIKeys: async () => ({ gemini: {}, groq: {}, updatedAt: 1, updatedBy: 'test' }),
    });

    expect(preflight.providerCallsMade).toBe(false);
    expect(preflight.clippingsContentSent).toBe(false);
    expect(preflight.keyRegistryReadable).toBe(true);
    expect(preflight.groqStructuredJsonSlotCount).toBe(3);
    expect(preflight.groqDistinctPackageFanoutReady).toBe(true);
    expect(preflight.groqSlotFingerprints).toEqual(['groq-safe-a', 'groq-safe-b', 'groq-safe-c']);
    expect(JSON.stringify(preflight)).not.toContain('sk-secret');
  });

  it('reports degraded Groq distinct-slot fan-out in provider preflight', async () => {
    const preflight = await buildProviderPreflight({
      getAIAvailability: async () => ({
        available: true,
        geminiAvailable: true,
        groqAvailable: true,
        totalKeys: 5,
        benchedKeys: 0,
      }),
      getGroqSlots: async () => [
        { index: 0, fingerprint: 'groq-safe-a', available: true },
      ],
      getAPIKeys: async () => ({ gemini: {}, groq: {}, updatedAt: 1, updatedBy: 'test' }),
    });

    expect(preflight.groqDistinctPackageFanoutReady).toBe(false);
    expect(preflight.warnings).toContain('groq-distinct-package-fanout-degraded');
  });

  it('records key registry read failures in provider preflight', async () => {
    const preflight = await buildProviderPreflight({
      getAIAvailability: async () => ({
        available: true,
        geminiAvailable: true,
        groqAvailable: true,
        totalKeys: 5,
        benchedKeys: 0,
      }),
      getGroqSlots: async () => [
        { index: 0, fingerprint: 'groq-safe-a', available: true },
      ],
      getAPIKeys: async () => {
        throw new Error('Missing or insufficient permissions.');
      },
    });

    expect(preflight.keyRegistryReadable).toBe(false);
    expect(preflight.keyRegistryErrorCode).toBe('Missing or insufficient permissions.');
    expect(preflight.warnings).toContain('firestore-key-registry-unreadable');
  });

  it('requires an explicit allow flag before live Gemini probes can run', async () => {
    const root = await makeRoot();

    await expect(buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'live-gemini',
      allowLiveGemini: false,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    })).rejects.toThrow(/--allow-live-gemini/);
  });

  it('stops live probes after a quota or rate-limit failure', async () => {
    const fakeGroqKey = ['gsk_', 'fakeSecretToken1234567890'].join('');
    const representatives = [
      {
        tag: 'clean-full-test',
        path: 'first.md',
        hash: 'hash-first',
        category: 'full-test-with-answer-key',
        status: 'accepted',
        passageCount: 3,
        questionCount: 40,
        answerKeyRowCount: 40,
      },
      {
        tag: 'known-difficult',
        path: 'second.md',
        hash: 'hash-second',
        category: 'full-test-with-answer-key',
        status: 'accepted',
        passageCount: 3,
        questionCount: 40,
        answerKeyRowCount: 40,
      },
    ] as const;
    const calls: string[] = [];

    const probes = await runLiveGeminiProbes({
      root: 'C:/tmp/source',
      out: 'C:/tmp/report.json',
      mode: 'live-v3-gemini-groq',
      allowLiveGemini: false,
      allowLiveV3Providers: true,
      liveLimit: 2,
      liveTags: ['clean-full-test', 'known-difficult'],
    }, representatives, {
      readSourceText: async (filePath) => {
        calls.push(filePath);
        return 'synthetic source';
      },
      generateCandidate: async () => ({
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
        diagnostics: [{
          code: 'provider-quota-exhausted',
          severity: 'error',
          message: `All Groq API keys exhausted or rate-limited for ${fakeGroqKey} at C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings\\source.md`,
          passageNumber: 1,
          questionNumber: 2,
          providerResult: 'failure',
        }],
        provider: 'gemini',
        model: 'test',
      }),
    });

    expect(probes).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(probes[0]).toEqual(expect.objectContaining({
      tag: 'clean-full-test',
      quotaStopSignal: true,
      stopReason: 'quota-or-rate-limit',
      diagnostics: [expect.objectContaining({
        code: 'provider-quota-exhausted',
        severity: 'error',
        message: 'All Groq API keys exhausted or rate-limited for [redacted-api-key] at [redacted-windows-path]',
        passageNumber: 1,
        questionNumber: 2,
        providerResult: 'failure',
      })],
    }));
    expect(JSON.stringify(probes)).not.toContain(fakeGroqKey);
    expect(JSON.stringify(probes)).not.toContain('C:\\Users\\The Lord');
  });

  it('requires an explicit allow flag before live V3 Gemini plus Groq probes can run', async () => {
    const root = await makeRoot();

    await expect(buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'live-v3-gemini-groq',
      allowLiveGemini: false,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    })).rejects.toThrow(/--allow-live-v3-providers/);
  });

  it('does not let legacy Gemini-only approval authorize live V3 Groq probes', async () => {
    const root = await makeRoot();

    await expect(buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'live-v3-gemini-groq',
      allowLiveGemini: true,
      allowLiveV3Providers: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    })).rejects.toThrow(/--allow-live-v3-providers/);
  });
});
