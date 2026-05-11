import { describe, expect, it, vi } from 'vitest';
import { generateReadingV2AutoImportCandidate, type ReadingV2AutoStructuredGenerator } from './readingV2AutoImport.service';

const autoPayload = (overrides: Record<string, unknown> = {}) => ({
  sourceFile: 'auto-fixture.txt',
  materials: [
    {
      passageNumber: 1,
      title: 'Auto passage',
      passages: [
        {
          title: 'Auto passage',
          content: [
            'This generated passage preserves the teacher source text with enough length for the Reading V2 importer.',
            '',
            'The second paragraph keeps context for Studio review and teacher repair after Gemini processing.',
          ].join('\n'),
        },
      ],
      sectionInstructions: [
        {
          id: 'p1-q1-2',
          taskType: 'true-false-not-given',
          questionRange: { start: 1, end: 2 },
          sourceInstructionEvidence: 'Do the following statements agree with the information given in Reading Passage 1?',
          vocabulary: 'TFNG',
          answerSource: 'passage',
        },
      ],
      questions: [
        {
          questionNumber: 1,
          type: 'true-false-not-given',
          sectionInstructionId: 'p1-q1-2',
          questionText: 'The first statement is supported by the passage.',
          answer: 'TRUE',
        },
        {
          questionNumber: 2,
          type: 'true-false-not-given',
          sectionInstructionId: 'p1-q1-2',
          questionText: 'The second statement is contradicted by the passage.',
          answer: 'FALSE',
        },
      ],
    },
  ],
  diagnostics: [],
  ...overrides,
});

const rawSourceWithAnswerKey = [
  'READING PASSAGE 1',
  'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
  'It has a second sentence to avoid being too tiny for guardrails.',
  '',
  'Questions 1-2',
  'Do the following statements agree with the information given in Reading Passage 1?',
  '1 The first statement is supported by the passage.',
  '2 The second statement is contradicted by the passage.',
  '',
  'Answers',
  '1 TRUE',
  '2 FALSE',
].join('\n');

const generatorFor = (data: unknown): ReadingV2AutoStructuredGenerator => ({
  generateStructuredJson: vi.fn().mockResolvedValue({ success: true, data }),
});

describe('readingV2AutoImport.service', () => {
  it('creates an Auto Gemini import candidate from structured Gemini JSON', async () => {
    const generator = generatorFor(autoPayload());

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Auto fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.candidate.sourceKind).toBe('auto-gemini');
    expect(result.candidate.rawText).toContain('CODEX_IELTS_READING_MATERIALS_START');
    expect(result.candidate.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.passageCount).toBe(1);
    expect(result.questionCount).toBe(2);
  });

  it('extracts escaped markdown answer-key rows from pasted source', async () => {
    const generator = generatorFor(autoPayload());

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: rawSourceWithAnswerKey.replace('1 TRUE\n2 FALSE', '1\\. TRUE\n2\\. FALSE'),
        sourceName: 'Escaped key fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.candidate.answerKeyText).toBe('1 TRUE\n2 FALSE');
  });

  it('strips Gemini answers when the raw source has no visible answer key', async () => {
    const generator = generatorFor(autoPayload());
    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey.replace(/\nAnswers[\s\S]+$/, ''), sourceName: 'No key fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBeUndefined();
    expect(result.candidate.answerKeyText).toBeUndefined();
    expect(result.candidate.rawText).toContain('"answer":""');
    expect(result.candidate.rawText).not.toContain('"answer":"TRUE"');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'answer-key-missing', severity: 'warning' }),
    ]));
  });

  it('fails closed when Gemini returns malformed JSON', async () => {
    const generator = generatorFor({ notMaterials: [] });

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Malformed fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/malformed/i);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'malformed-json', severity: 'error' }),
    ]));
  });

  it('processes multi-passage sources sequentially and merges payloads', async () => {
    const generator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockImplementation((prompt: string) => Promise.resolve({
        success: true,
        data: autoPayload({
          materials: [
            {
              ...autoPayload().materials[0],
              passageNumber: prompt.includes('Reading Passage 2') ? 2 : 1,
              title: prompt.includes('Reading Passage 2') ? 'Second auto passage' : 'First auto passage',
              questions: [
                {
                  questionNumber: prompt.includes('Reading Passage 2') ? 2 : 1,
                  type: 'true-false-not-given',
                  sectionInstructionId: 'p1-q1-2',
                  questionText: 'A merged Auto question.',
                  answer: prompt.includes('Reading Passage 2') ? 'FALSE' : 'TRUE',
                },
              ],
            },
          ],
        }),
      })),
    };
    const raw = [
      'READING PASSAGE 1',
      'First passage source text with enough words for the Auto Gemini import service.',
      'Questions 1-1',
      '1 First statement.',
      '',
      'READING PASSAGE 2',
      'Second passage source text with enough words for the Auto Gemini import service.',
      'Questions 2-2',
      '2 Second statement.',
      '',
      'Answers',
      '1 TRUE',
      '2 FALSE',
    ].join('\n');

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Two passage fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(generator.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.passageCount).toBe(2);
    expect(result.questionCount).toBe(2);
    expect(result.candidate.rawText).toContain('"passageNumber":2');
  });
});
