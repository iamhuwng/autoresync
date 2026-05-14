import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport, parseArgs, sanitizeLiveError } from '../../../scripts/reading-v2-clippings-harness';

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

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-v2-harness-'));
  await writeFile(path.join(root, 'synthetic-full-test.md'), fullSource, 'utf8');
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
    expect(args.liveLimit).toBe(2);
    expect(args.liveTags).toEqual(['clean-full-test', 'known-difficult']);
  });

  it('caps live probe count and redacts sensitive live errors', () => {
    const args = parseArgs(['--mode', 'live-gemini', '--live-limit', '99']);

    expect(args.liveLimit).toBe(5);
    expect(sanitizeLiveError(
      'Failed with key=AIzaSecretToken123 at C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings\\source.md',
    )).toBe('Failed with key=[redacted] at [redacted-windows-path]');
  });

  it('builds a redacted mocked-intermediate report with representative picks', async () => {
    const root = await makeRoot();
    const report = await buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'mocked-intermediate',
      allowLiveGemini: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    });

    expect(report.summary).toMatchObject({
      totalFilesScanned: 1,
      supportedFullTests: 1,
      accepted: 1,
      generatedInteractionCount: 40,
      boundAnswerCount: 40,
    });
    expect(report.representatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'clean-full-test', questionCount: 40, answerKeyRowCount: 40 }),
    ]));
    expect(JSON.stringify(report)).not.toContain('READING PASSAGE');
    expect(JSON.stringify(report)).not.toContain('"answerKeyText"');
  });

  it('requires an explicit allow flag before live Gemini probes can run', async () => {
    const root = await makeRoot();

    await expect(buildReport({
      root,
      out: path.join(root, 'report.json'),
      mode: 'live-gemini',
      allowLiveGemini: false,
      liveLimit: 1,
      liveTags: ['clean-full-test'],
    })).rejects.toThrow(/--allow-live-gemini/);
  });
});
