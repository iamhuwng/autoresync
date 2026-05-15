import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids } from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { generateReadingV2AutoImportCandidate, type ReadingV2AutoStructuredGenerator } from './readingV2AutoImport.service';
import { normalizeReadingV2ImportCandidate } from './readingV2ImportNormalization.service';
import { generateReadingV2StudentSafeProjection } from './readingV2Projection.service';
import { validateReadingV2Draft } from './readingV2Validation.service';

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

const rawSourceWithBookStyleAnswerKey = [
  'READING PASSAGE 3',
  'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
  'It has a second sentence to avoid being too tiny for guardrails.',
  '',
  '31 Jefferson taught at the University of Virginia.',
  '32 By today standards, Monticello appears quite a small house for a famous person.',
  '',
  'Questions 33-39',
  'Complete the table below.',
  'Write NO MORE THAN TWO WORDS OR A DATE for each answer.',
  '1768 The mountaintop 33 ... to prepare for the building of Monticello.',
  '39 ... The death of Jefferson.',
  '',
  'Question 40',
  'Which plan shows the stages in which Monticello was built?',
  '',
  'Reading Test 66',
  'Reading Test 68',
  '',
  'Answer Reading Test 67',
  '',
  'Passage 1',
  '1. D',
  '2. B',
  '',
  'Passage 2',
  '23. YES',
  '24. NOT GIVEN',
  '',
  'Passage 3',
  '31. NOT GIVEN',
  '32. TRUE',
  '33. was level(led)',
  '34. bricks',
  '35. South Pavilion (capitals optional)',
  '36. 1796',
  '37. doors',
  '38. roof',
  '39. 1826',
  '40. A',
].join('\n');

const rawSourceWithUnheadedAnswerKey = [
  'READING PASSAGE 1',
  'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
  'It has a second sentence to avoid being too tiny for guardrails.',
  '',
  'Questions 1-10',
  'Choose the correct letter, A, B, C or D.',
  '1 Which option is correct?',
  '2 Which option is correct?',
  '3 Which option is correct?',
  '4 Which option is correct?',
  '5 Which option is correct?',
  '6 Which option is correct?',
  '7 Which option is correct?',
  '8 Which option is correct?',
  '9 Which option is correct?',
  '10 Which option is correct?',
  '',
  '1 D',
  '2 B',
  '3 TRUE',
  '4 NOT GIVEN',
  '5 was levelled',
  '6 bricks',
  '7 South Pavilion',
  '8 1796',
  '9 roof',
  '10 A',
].join('\n');

const rawSourceWithNumberedQuestionsOnly = [
  'READING PASSAGE 3',
  'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
  'It has a second sentence to avoid being too tiny for guardrails.',
  '',
  'Answers must be written in boxes on your answer sheet.',
  '31 Jefferson taught at the University of Virginia.',
  '32 By today standards, Monticello appears quite a small house for a famous person.',
  '33 The mountaintop .......... to prepare for the building of Monticello.',
  '34 .......... were made by Jefferson slaves.',
  '35 Jefferson began to live in the .......... .',
  '36 .......... -1807',
  '37 automatic .......... , and delivery systems.',
  '38 The .......... was covered with long-lasting material.',
  '39 ..........',
  '40 Which plan shows the stages in which Monticello was built?',
].join('\n');

const rawSourceWithQPrefixAnswerKey = [
  'READING PASSAGE 1',
  'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
  'It has a second sentence to avoid being too tiny for guardrails.',
  '',
  'Questions 1-2',
  'Do the following statements agree with the information given in Reading Passage 1?',
  '1 The first statement is supported by the passage.',
  '2 The second statement is contradicted by the passage.',
  '',
  'Answer key',
  'Q1: TRUE',
  'Q2: FALSE',
].join('\n');

const syntheticPassageText = (passageNumber: number): string => [
  `READING PASSAGE ${passageNumber}`,
  `Synthetic passage ${passageNumber} paragraph A has enough teacher source text for Auto import ledger validation.`,
  `Synthetic passage ${passageNumber} paragraph B preserves a source-only fixture without copyrighted reading content.`,
].join('\n');

const syntheticQuestions = (start: number, end: number): string => [
  `Questions ${start}-${end}`,
  'Complete the synthetic IELTS Reading task.',
  ...Array.from({ length: end - start + 1 }, (_, index) => `${start + index} Synthetic question ${start + index} ___.`),
].join('\n');

const syntheticAnswers = (start: number, end: number): string =>
  Array.from({ length: end - start + 1 }, (_, index) => `${start + index} TRUE`).join('\n');

const rawThreePassageSourceWithAnswerKey = [
  syntheticPassageText(1),
  syntheticQuestions(1, 13),
  syntheticPassageText(2),
  syntheticQuestions(14, 26),
  syntheticPassageText(3),
  syntheticQuestions(27, 40),
  'Answers',
  syntheticAnswers(1, 40),
].join('\n\n');

const lineNumberOfV3Fixture = (predicate: (line: string) => boolean): number => {
  const sourceLines = rawThreePassageSourceWithAnswerKey.split('\n');
  const index = sourceLines.findIndex(predicate);
  if (index < 0) {
    throw new Error('Missing source line for V3 fixture');
  }
  return index + 1;
};

const packageMarkerForV3Fixture = (passageNumber: 1 | 2 | 3, start: number, end: number) => {
  const heading = lineNumberOfV3Fixture((line) => line === `READING PASSAGE ${passageNumber}`);
  const questionHeading = lineNumberOfV3Fixture((line) => line === `Questions ${start}-${end}`);
  const nextHeading = passageNumber < 3
    ? lineNumberOfV3Fixture((line) => line === `READING PASSAGE ${passageNumber + 1}`)
    : lineNumberOfV3Fixture((line) => line === 'Answers');

  return {
    passageNumber,
    passageTitleLines: { startLine: heading, endLine: heading },
    passageBodyLines: { startLine: heading, endLine: questionHeading - 1 },
    questionAreaLines: { startLine: questionHeading, endLine: nextHeading - 2 },
    expectedQuestionRange: { start, end },
    groups: [{
      questionRange: { start, end },
      lines: { startLine: questionHeading, endLine: nextHeading - 2 },
      taskTypeHint: 'sentence-completion',
    }],
    referenceBankLineSpans: [],
    excludedLineSpans: [],
    uncertaintyDiagnostics: [],
  };
};

const mockedV3MarkerData = () => ({
  packages: [
    packageMarkerForV3Fixture(1, 1, 13),
    packageMarkerForV3Fixture(2, 14, 26),
    packageMarkerForV3Fixture(3, 27, 40),
  ],
  answerKeyRows: Array.from({ length: 40 }, (_, index) => ({
    questionNumber: index + 1,
    answer: 'TRUE',
    sourceLine: lineNumberOfV3Fixture((line) => line === `${index + 1} TRUE`),
  })),
  diagnostics: [],
});

const autoMaterial = (
  passageNumber: number,
  start: number,
  end: number,
  includeQuestions = true,
) => ({
  passageNumber,
  title: `Synthetic passage ${passageNumber}`,
  passages: [
    {
      title: `Synthetic passage ${passageNumber}`,
      content: `Synthetic generated passage ${passageNumber} keeps enough text for validation and Studio review.`,
    },
  ],
  sectionInstructions: [
    {
      id: `p${passageNumber}-q${start}-${end}`,
      taskType: 'sentence-completion',
      questionRange: { start, end },
      sourceInstructionEvidence: 'Complete the synthetic IELTS Reading task.',
      wordLimit: 3,
    },
  ],
  questions: includeQuestions
    ? Array.from({ length: end - start + 1 }, (_, index) => ({
      questionNumber: start + index,
      type: 'sentence-completion',
      sectionInstructionId: `p${passageNumber}-q${start}-${end}`,
      questionText: `Synthetic generated question ${start + index} ___.`,
      answer: 'TRUE',
    }))
    : [],
});

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
    expect(result.candidate.evidence).toEqual(expect.arrayContaining([
      'Source ledger passages: 1',
      'Source ledger question ranges: 1-2',
      'Source ledger task groups: 1',
      'Generated draft passages: 1',
      'Generated draft task groups: 1',
      'Generated draft questions: 2',
    ]));
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

  it('extracts book-style answer-key headings with reading test page labels', async () => {
    const material = autoMaterial(3, 31, 40);
    const generator = generatorFor(autoPayload({
      materials: [{
        ...material,
        sectionInstructions: [{
          ...material.sectionInstructions[0],
          taskType: 'table-completion',
          sourceInstructionEvidence: 'Complete the table below. Write NO MORE THAN TWO WORDS OR A DATE for each answer.',
          wordLimit: 2,
        }],
      }],
    }));

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: rawSourceWithBookStyleAnswerKey,
        sourceName: 'Book-style key fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).not.toContain('1 D');
    expect(result.answerKeyText).not.toContain('23 YES');
    expect(result.answerKeyText).toContain('31 NOT GIVEN');
    expect(result.answerKeyText).toContain('40 A');
    expect(result.answerKeyText).not.toContain('Passage 1');
    expect(result.candidate.answerKeyText).toBe(result.answerKeyText);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'answer-key-extracted', severity: 'info' }),
    ]));
  });

  it('extracts dense unheaded answer-key blocks near the end without adding heading exceptions', async () => {
    const material = autoMaterial(1, 1, 10);
    const generator = generatorFor(autoPayload({
      materials: [{
        ...material,
        sectionInstructions: [{
          ...material.sectionInstructions[0],
          taskType: 'multiple-choice',
          sourceInstructionEvidence: 'Choose the correct letter, A, B, C or D.',
        }],
      }],
    }));

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: rawSourceWithUnheadedAnswerKey,
        sourceName: 'Unheaded key fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe([
      '1 D',
      '2 B',
      '3 TRUE',
      '4 NOT GIVEN',
      '5 was levelled',
      '6 bricks',
      '7 South Pavilion',
      '8 1796',
      '9 roof',
      '10 A',
    ].join('\n'));
  });

  it('does not treat trailing numbered question text as an answer key', async () => {
    const generator = generatorFor(autoPayload({
      materials: [autoMaterial(3, 31, 40)],
    }));

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: rawSourceWithNumberedQuestionsOnly,
        sourceName: 'Numbered questions only fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBeUndefined();
    expect(result.candidate.answerKeyText).toBeUndefined();
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'answer-key-missing', severity: 'warning' }),
    ]));
  });

  it('stops extracted answer-key rows before trailing explanation prose', async () => {
    const generator = generatorFor(autoPayload());

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: [
          rawSourceWithAnswerKey,
          '',
          'Explanation: question 1 is supported by paragraph A.',
          'Next material starts here.',
        ].join('\n'),
        sourceName: 'Trailing explanation fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.answerKeyText).not.toContain('Explanation');
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

  it('keeps Gemini-copied answerKeyText when local row extraction misses the source key format', async () => {
    const generator = generatorFor(autoPayload({ answerKeyText: 'Q1: TRUE\nQ2: FALSE' }));

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithQPrefixAnswerKey, sourceName: 'Q-prefix key fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe('Q1: TRUE\nQ2: FALSE');
    expect(result.candidate.answerKeyText).toBe('Q1: TRUE\nQ2: FALSE');
    expect(result.candidate.rawText).toContain('"answerKeyText":"Q1: TRUE\\nQ2: FALSE"');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'answer-key-returned-by-gemini', severity: 'info' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const firstInteraction = Object.values(normalized.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 1,
    );
    expect(firstInteraction?.scoringRule.acceptableAnswers.map((answer) => answer.toLowerCase())).toEqual(['true']);
  });

  it('synthesizes answerKeyText from Gemini question answers only when the raw source has an answer-key heading', async () => {
    const generator = generatorFor(autoPayload({ answerKeyText: '' }));

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithQPrefixAnswerKey, sourceName: 'Heading fallback fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.candidate.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.candidate.rawText).toContain('"answerKeyText":"1 TRUE\\n2 FALSE"');
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

  it('repairs copied Gemini passage numbers while merging multi-passage chunks', async () => {
    const generator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockImplementation((prompt: string) => Promise.resolve({
        success: true,
        data: autoPayload({
          materials: [
            {
              ...autoPayload().materials[0],
              passageNumber: 1,
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
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(normalized.document.sectionIds).toHaveLength(2);
  });

  it('fails closed when Gemini invents an extra material from loose instructional prose', async () => {
    const generator = generatorFor(autoPayload({
      materials: [
        autoMaterial(1, 1, 2),
        autoMaterial(2, 3, 4),
      ],
    }));
    const raw = [
      'READING PASSAGE 1',
      'This source has one strict passage heading and enough text for Auto import.',
      'This loose sentence says Reading Passage 2 has six paragraphs, but it is not a heading.',
      '',
      'Questions 1-2',
      'Complete the sentence below.',
      '1 Synthetic question ___.',
      '2 Synthetic question ___.',
      '',
      'Answers',
      '1 first',
      '2 second',
    ].join('\n');

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Loose prose extra material fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-passage-extra', severity: 'error' }),
      expect.objectContaining({ code: 'source-question-extra', severity: 'error' }),
    ]));
  });

  it('keeps canonical IDs stable from local source name instead of Gemini sourceFile drift', async () => {
    const sourceFiles = ['gemini-random-title-a.md', 'gemini-random-title-b.md'];
    const generator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockImplementation(() => {
        const sourceFile = sourceFiles.shift() ?? 'gemini-random-title-c.md';

        return Promise.resolve({
          success: true,
          data: autoPayload({ sourceFile }),
        });
      }),
    };

    const first = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Stable local source name.md' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );
    const second = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Stable local source name.md' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    const firstDocument = normalizeReadingV2ImportCandidate(first.candidate).document;
    const secondDocument = normalizeReadingV2ImportCandidate(second.candidate).document;

    expect(firstDocument.documentId).toBe(secondDocument.documentId);
    expect(firstDocument.sectionIds).toEqual(secondDocument.sectionIds);
    expect(Object.keys(firstDocument.taskGroups)).toEqual(Object.keys(secondDocument.taskGroups));
    expect(Object.keys(firstDocument.interactions)).toEqual(Object.keys(secondDocument.interactions));
    expect(firstDocument.documentId).toContain('stable-local-source-name');
  });

  it('carries canonical validation blockers into the Auto Studio candidate when answers are not source-visible', async () => {
    const generator = generatorFor(autoPayload());

    const result = await generateReadingV2AutoImportCandidate(
      {
        rawTestText: rawSourceWithAnswerKey.split('\n').slice(0, 8).join('\n'),
        sourceName: 'No visible answer key fixture',
      },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'canonical-validation-blocked', severity: 'warning' }),
    ]));
    expect(result.candidate.publishBlockingPlaceholders).toEqual(expect.arrayContaining([
      expect.stringContaining('Draft validation: Interaction'),
    ]));
    expect(result.candidate.answerKeyText).toBeUndefined();
  });

  it('fails closed when source ledger detects missing later question ranges before Studio handoff', async () => {
    const generator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockImplementation((prompt: string) => {
        const passageNumber = prompt.includes('current passage number: 2')
          ? 2
          : prompt.includes('current passage number: 3')
            ? 3
            : 1;
        const range = passageNumber === 1
          ? [1, 13] as const
          : passageNumber === 2
            ? [14, 26] as const
            : [27, 40] as const;

        return Promise.resolve({
          success: true,
          data: autoPayload({
            answerKeyText: syntheticAnswers(1, 40),
            materials: [autoMaterial(passageNumber, range[0], range[1], passageNumber === 1)],
          }),
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Ledger missing ranges fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(generator.generateStructuredJson).toHaveBeenCalledTimes(5);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'source-repair-attempted',
        severity: 'info',
        attempt: 1,
        sourceRange: expect.stringContaining('Q14'),
        verifierIssueCodes: expect.arrayContaining(['source-question-missing']),
        repairScopes: expect.arrayContaining(['question-range', 'answer-key-region']),
      }),
      expect.objectContaining({
        code: 'source-repair-failed',
        severity: 'warning',
        attempt: 1,
        verifierResult: 'failed',
      }),
      expect.objectContaining({ code: 'source-question-missing', severity: 'error' }),
      expect.objectContaining({ code: 'source-answer-row-unbound', severity: 'error' }),
    ]));
    expect(result.error).toMatch(/questions 14-40/i);
  });

  it('retries only bad ledger chunks and succeeds when repair returns omitted ranges', async () => {
    const attemptsByPassage = new Map<number, number>();
    const generator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockImplementation((prompt: string) => {
        const passageNumber = prompt.includes('current passage number: 2')
          ? 2
          : prompt.includes('current passage number: 3')
            ? 3
            : 1;
        const attempt = (attemptsByPassage.get(passageNumber) ?? 0) + 1;
        attemptsByPassage.set(passageNumber, attempt);
        const range = passageNumber === 1
          ? [1, 13] as const
          : passageNumber === 2
            ? [14, 26] as const
            : [27, 40] as const;
        const includeQuestions = passageNumber === 1 || attempt > 1;

        return Promise.resolve({
          success: true,
          data: autoPayload({
            answerKeyText: syntheticAnswers(1, 40),
            materials: [autoMaterial(passageNumber, range[0], range[1], includeQuestions)],
          }),
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Ledger repair success fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(generator.generateStructuredJson).toHaveBeenCalledTimes(5);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.questionCount).toBe(40);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'source-repair-attempted',
        severity: 'info',
        attempt: 1,
        verifierIssueCodes: expect.arrayContaining(['source-question-missing']),
        repairScopes: expect.arrayContaining(['question-range', 'answer-key-region']),
      }),
      expect.objectContaining({
        code: 'source-repair-succeeded',
        severity: 'info',
        attempt: 1,
        repairScopes: expect.arrayContaining(['question-range', 'answer-key-region']),
        providerResult: 'success',
        verifierResult: 'passed',
      }),
    ]));
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-repair-succeeded', severity: 'info' }),
    ]));
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(normalized.document.sectionIds).toHaveLength(3);
    expect(Object.values(normalized.document.interactions)).toHaveLength(40);
  });

  it('marks V3 Gemini marker quota failures with an explicit provider diagnostic', async () => {
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: false,
        error: 'All Gemini API keys exhausted or rate-limited',
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Mocked V3 quota failure' },
      {
        generator: markerGenerator,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/all gemini api keys exhausted/i);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'provider-quota-exhausted',
        severity: 'error',
        providerResult: 'failure',
      }),
      expect.objectContaining({
        code: 'topology-marker-failed',
        severity: 'error',
      }),
    ]));
  });

  it('marks V3 Groq fan-out quota failures with an explicit provider diagnostic', async () => {
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: mockedV3MarkerData(),
      }),
    };
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Mocked V3 Groq quota failure' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/all groq api keys exhausted/i);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'provider-quota-exhausted',
        severity: 'error',
        providerResult: 'failure',
      }),
      expect.objectContaining({
        code: 'groq-package-failed',
        severity: 'error',
      }),
    ]));
  });

  it('runs the mocked V3 marker-package-Groq-transcript pipeline when Groq returns option-bank aliases', async () => {
    const raw = [
      'READING PASSAGE 1',
      'The passage body stays local for the importer.',
      'A second body line keeps the passage non-trivial.',
      '',
      'Questions 1-1',
      'Choose the correct letter, A, B, C or D.',
      '1 Exact multiple-choice prompt ___.',
      'A Option A',
      'B Option B',
      'C Option C',
      'D Option D',
      '',
      'Answers',
      '1 B',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 1,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('READING PASSAGE 1'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('Questions 1-1') - 1,
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 1-1'),
              endLine: lineNumberOf('Answers') - 1,
            },
            expectedQuestionRange: { start: 1, end: 1 },
            groups: [{
              questionRange: { start: 1, end: 1 },
              lines: {
                startLine: lineNumberOf('Questions 1-1'),
                endLine: lineNumberOf('Answers') - 1,
              },
              taskTypeHint: 'multiple-choice',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [{
            questionNumber: 1,
            answer: 'B',
            sourceLine: lineNumberOf('1 B'),
          }],
          diagnostics: [],
        },
      }),
    };
    const normalizerCalls: number[] = [];
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockImplementation((prompt: string, options?: { preferredKeyIndex?: number }) => {
        normalizerCalls.push(options?.preferredKeyIndex ?? -1);
        expect(prompt).toContain('Exact multiple-choice prompt ___.');
        return Promise.resolve({
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 1 },
              taskType: 'multiple-choice',
              sourceInstructionText: 'Choose the correct letter, A, B, C or D.',
              instructionMeta: { optionLabelRange: 'A-D' },
              labeledOptions: [],
              optionBank: {
                options: [
                  { label: 'A', text: 'Option A' },
                  { label: 'B', text: 'Option B' },
                  { label: 'C', text: 'Option C' },
                  { label: 'D', text: 'Option D' },
                ],
              },
              questions: [{
                number: 1,
                promptText: 'Exact multiple-choice prompt ___.',
              }],
            }],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 option-bank alias fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(true);
    expect(normalizerCalls).toEqual([0]);
    if (!result.success) return;
    expect(result.passageCount).toBe(1);
    expect(result.questionCount).toBe(1);
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(Object.values(normalized.document.interactions)).toHaveLength(1);
  });

  it('backfills missing reference banks from package-level source lines in V3', async () => {
    const raw = [
      'READING PASSAGE 1',
      'A Chapter 1',
      'B Chapter 2',
      'C Chapter 3',
      'D Chapter 4',
      'Local passage body stays local.',
      '',
      'Questions 1-2',
      'Which chapter contains the following information?',
      '1 Exact matching-information prompt ___.',
      '2 Another exact matching-information prompt ___.',
      '',
      'Questions 3-3',
      'Complete the sentence.',
      '3 Synthetic completion prompt ___.',
      '',
      'Answers',
      '1 A',
      '2 B',
      '3 cocoa',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const bankSpan = {
      startLine: lineNumberOf('A Chapter 1'),
      endLine: lineNumberOf('D Chapter 4'),
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 1,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('READING PASSAGE 1'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('Local passage body stays local.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 1-2'),
              endLine: lineNumberOf('3 Synthetic completion prompt ___.'),
            },
            expectedQuestionRange: { start: 1, end: 3 },
            groups: [
              {
                questionRange: { start: 1, end: 2 },
                lines: {
                  startLine: lineNumberOf('Questions 1-2'),
                  endLine: lineNumberOf('2 Another exact matching-information prompt ___.'),
                },
                taskTypeHint: 'matching-information',
              },
              {
                questionRange: { start: 3, end: 3 },
                lines: {
                  startLine: lineNumberOf('Questions 3-3'),
                  endLine: lineNumberOf('3 Synthetic completion prompt ___.'),
                },
                taskTypeHint: 'sentence-completion',
              },
            ],
            referenceBankLineSpans: [bankSpan],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            {
              questionNumber: 1,
              answer: 'A',
              sourceLine: lineNumberOf('1 A'),
            },
            {
              questionNumber: 2,
              answer: 'B',
              sourceLine: lineNumberOf('2 B'),
            },
            {
              questionNumber: 3,
              answer: 'cocoa',
              sourceLine: lineNumberOf('3 cocoa'),
            },
          ],
          diagnostics: [],
        },
      }),
    };
    const normalizerCalls: number[] = [];
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockImplementation((prompt: string, options?: { preferredKeyIndex?: number }) => {
        normalizerCalls.push(options?.preferredKeyIndex ?? -1);
        expect(prompt).toContain('REFERENCE_BANK_LINES_ONLY:');
        expect(prompt).toContain('A Chapter 1');
        expect(prompt).toContain('D Chapter 4');
        return Promise.resolve({
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'matching-information',
              sourceInstructionText: 'Which chapter contains the following information?',
              instructionMeta: {},
              questions: [
                {
                  number: 1,
                  promptText: '1 Exact matching-information prompt ___.',
                },
                {
                  number: 2,
                  promptText: '2 Another exact matching-information prompt ___.',
                },
              ],
            },
            {
              questionRange: { start: 3, end: 3 },
              taskType: 'sentence-completion',
              sourceInstructionText: 'Complete the sentence.',
              instructionMeta: { wordLimit: 1 },
              questions: [{
                number: 3,
                promptText: '3 Synthetic completion prompt ___.',
              }],
            }],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 reference-bank fallback fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(1);
    expect(normalizerCalls).toEqual([0]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.passageCount).toBe(1);
    expect(result.questionCount).toBe(3);

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(Object.values(normalized.document.interactions)).toHaveLength(3);
  });

  it('enriches V3 transcripts from bare body labels when spans are missing', async () => {
    const raw = [
      'READING PASSAGE 1',
      'A',
      'B',
      'C',
      'D',
      'Local body prose stays local.',
      '',
      'Questions 1-2',
      'Which paragraph contains the following information?',
      '1 Exact matching-information prompt ___.',
      '2 Another exact matching-information prompt ___.',
      '',
      'Answers',
      '1 A',
      '2 B',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 1,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('READING PASSAGE 1'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('Local body prose stays local.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 1-2'),
              endLine: lineNumberOf('2 Another exact matching-information prompt ___.'),
            },
            expectedQuestionRange: { start: 1, end: 2 },
            groups: [{
              questionRange: { start: 1, end: 2 },
              lines: {
                startLine: lineNumberOf('Questions 1-2'),
                endLine: lineNumberOf('2 Another exact matching-information prompt ___.'),
              },
              taskTypeHint: 'matching-information',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            {
              questionNumber: 1,
              answer: 'A',
              sourceLine: lineNumberOf('1 A'),
            },
            {
              questionNumber: 2,
              answer: 'B',
              sourceLine: lineNumberOf('2 B'),
            },
          ],
          diagnostics: [],
        },
      }),
    };
    const seenBankSections: string[] = [];
    const normalizerCalls: number[] = [];
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockImplementation((prompt: string, options?: { preferredKeyIndex?: number }) => {
        normalizerCalls.push(options?.preferredKeyIndex ?? -1);
        const bankSection = prompt.split('REFERENCE_BANK_LINES_ONLY:')[1]?.split('QUESTION_AREA_LINES_ONLY:')[0] ?? '';
        seenBankSections.push(bankSection);
        expect(bankSection).toContain('0002');
        expect(bankSection).toContain('0005');
        return Promise.resolve({
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'matching-information',
              sourceInstructionText: 'Which paragraph contains the following information?',
              instructionMeta: {},
              questions: [
                {
                  number: 1,
                  promptText: '1 Exact matching-information prompt ___.',
                },
                {
                  number: 2,
                  promptText: '2 Another exact matching-information prompt ___.',
                },
              ],
            }],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 bare-label bank fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(1);
    expect(normalizerCalls).toEqual([0]);
    expect(seenBankSections).toHaveLength(1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'transcript-reference-bank-missing' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(Object.values(normalized.document.interactions)).toHaveLength(2);
  });

  it('repairs a missing final V3 group from question-area lines', async () => {
    const raw = [
      'READING PASSAGE 1',
      'A Chapter 1',
      'B Chapter 2',
      'C Chapter 3',
      'D Chapter 4',
      'Local body stays local.',
      '',
      'Questions 1-2',
      'Which chapter contains the following information?',
      '1 Exact matching-information prompt ___.',
      '2 Another exact matching-information prompt ___.',
      '',
      'Questions 3-3',
      'Complete the sentence.',
      '3 Synthetic completion prompt ___.',
      '',
      'Questions 4-4',
      'Complete the flowchart below.',
      'Flow step uses 4 ___.',
      '',
      'Answers',
      '1 A',
      '2 B',
      '3 cocoa',
      '4 water',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const bankSpan = {
      startLine: lineNumberOf('A Chapter 1'),
      endLine: lineNumberOf('D Chapter 4'),
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 1,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('READING PASSAGE 1'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('Local body stays local.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 1-2'),
              endLine: lineNumberOf('Flow step uses 4 ___.'),
            },
            expectedQuestionRange: { start: 1, end: 4 },
            groups: [
              {
                questionRange: { start: 1, end: 2 },
                lines: {
                  startLine: lineNumberOf('Questions 1-2'),
                  endLine: lineNumberOf('2 Another exact matching-information prompt ___.'),
                },
                taskTypeHint: 'matching-information',
              },
              {
                questionRange: { start: 3, end: 3 },
                lines: {
                  startLine: lineNumberOf('Questions 3-3'),
                  endLine: lineNumberOf('3 Synthetic completion prompt ___.'),
                },
                taskTypeHint: 'sentence-completion',
              },
              {
                questionRange: { start: 4, end: 4 },
                lines: {
                  startLine: lineNumberOf('Questions 4-4'),
                  endLine: lineNumberOf('Flow step uses 4 ___.'),
                },
                taskTypeHint: 'flow-chart-completion',
              },
            ],
            referenceBankLineSpans: [bankSpan],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            {
              questionNumber: 1,
              answer: 'A',
              sourceLine: lineNumberOf('1 A'),
            },
            {
              questionNumber: 2,
              answer: 'B',
              sourceLine: lineNumberOf('2 B'),
            },
            {
              questionNumber: 3,
              answer: 'cocoa',
              sourceLine: lineNumberOf('3 cocoa'),
            },
            {
              questionNumber: 4,
              answer: 'water',
              sourceLine: lineNumberOf('4 water'),
            },
          ],
          diagnostics: [],
        },
      }),
    };
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockImplementation((prompt: string, options?: { preferredKeyIndex?: number }) => {
        expect(options?.preferredKeyIndex).toBe(0);
        expect(prompt).toContain('REFERENCE_BANK_LINES_ONLY:');
        expect(prompt).toContain('A Chapter 1');
        return Promise.resolve({
          success: true,
          data: {
            passageNumber: 1,
            groups: [
              {
                questionRange: { start: 1, end: 2 },
                taskType: 'matching-information',
                sourceInstructionText: 'Which chapter contains the following information?',
                instructionMeta: {},
                questions: [
                  {
                    number: 1,
                    promptText: '1 Exact matching-information prompt ___.',
                  },
                  {
                    number: 2,
                    promptText: '2 Another exact matching-information prompt ___.',
                  },
                ],
              },
              {
                questionRange: { start: 3, end: 3 },
                taskType: 'sentence-completion',
                sourceInstructionText: 'Complete the sentence.',
                instructionMeta: { wordLimit: 1 },
                questions: [{
                  number: 3,
                  promptText: '3 Synthetic completion prompt ___.',
                }],
              },
            ],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 repaired-group fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'transcript-question-missing' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    expect(Object.values(normalized.document.interactions)).toHaveLength(4);
  });

  it('normalizes live V3 judgement answer-key labels to the source task vocabulary', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Synthetic passage body.',
      '',
      'Questions 1-2',
      'Do the following statements agree with the information given in Reading Passage 1?',
      'TRUE if the statement is true',
      'FALSE if the statement is false',
      'NOT GIVEN if the information is not given',
      '1 Synthetic passage body exists.',
      '2 Synthetic passage body is imaginary.',
      '',
      'Answers',
      '1 YES',
      '2 NO',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 1,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('READING PASSAGE 1'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 1'),
              endLine: lineNumberOf('Synthetic passage body.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 1-2'),
              endLine: lineNumberOf('2 Synthetic passage body is imaginary.'),
            },
            expectedQuestionRange: { start: 1, end: 2 },
            groups: [{
              questionRange: { start: 1, end: 2 },
              lines: {
                startLine: lineNumberOf('Questions 1-2'),
                endLine: lineNumberOf('2 Synthetic passage body is imaginary.'),
              },
              taskTypeHint: 'true-false-not-given',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            {
              questionNumber: 1,
              answer: 'YES',
              sourceLine: lineNumberOf('1 YES'),
            },
            {
              questionNumber: 2,
              answer: 'NO',
              sourceLine: lineNumberOf('2 NO'),
            },
          ],
          diagnostics: [],
        },
      }),
    };
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [{
        index: 0,
        fingerprint: 'groq-slot-0',
        available: true,
      }],
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passageNumber: 1,
          groups: [{
            questionRange: { start: 1, end: 2 },
            taskType: 'true-false-not-given',
            instructionMeta: { vocabulary: 'TFNG' },
            questions: [
              {
                number: 1,
                promptText: '1 Synthetic passage body exists.',
              },
              {
                number: 2,
                promptText: '2 Synthetic passage body is imaginary.',
              },
            ],
            diagnostics: [],
          }],
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 judgement fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toContain('1 TRUE');
    expect(result.answerKeyText).toContain('2 FALSE');
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
  });

  it('runs the mocked V3 marker-package-Groq-transcript pipeline into a guarded Studio candidate', async () => {
    const sourceLines = rawThreePassageSourceWithAnswerKey.split('\n');
    const lineNumberOf = (predicate: (line: string) => boolean): number => {
      const index = sourceLines.findIndex(predicate);
      if (index < 0) {
        throw new Error('Missing source line for V3 fixture');
      }
      return index + 1;
    };
    const packageMarkerFor = (passageNumber: 1 | 2 | 3, start: number, end: number) => {
      const heading = lineNumberOf((line) => line === `READING PASSAGE ${passageNumber}`);
      const questionHeading = lineNumberOf((line) => line === `Questions ${start}-${end}`);
      const nextHeading = passageNumber < 3
        ? lineNumberOf((line) => line === `READING PASSAGE ${passageNumber + 1}`)
        : lineNumberOf((line) => line === 'Answers');

      return {
        passageNumber,
        passageTitleLines: { startLine: heading, endLine: heading },
        passageBodyLines: { startLine: heading, endLine: questionHeading - 1 },
        questionAreaLines: { startLine: questionHeading, endLine: nextHeading - 2 },
        expectedQuestionRange: { start, end },
        groups: [{
          questionRange: { start, end },
          lines: { startLine: questionHeading, endLine: nextHeading - 2 },
          taskTypeHint: 'sentence-completion',
        }],
        referenceBankLineSpans: [],
        excludedLineSpans: [],
        uncertaintyDiagnostics: [],
      };
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [
            packageMarkerFor(1, 1, 13),
            packageMarkerFor(2, 14, 26),
            packageMarkerFor(3, 27, 40),
          ],
          answerKeyRows: Array.from({ length: 40 }, (_, index) => ({
            questionNumber: index + 1,
            answer: 'TRUE',
            sourceLine: lineNumberOf((line) => line === `${index + 1} TRUE`),
          })),
          diagnostics: [],
        },
      }),
    };
    const normalizerCalls: number[] = [];
    const questionAreaNormalizer = {
      getAvailableStructuredJsonKeySlots: async () => [0, 1, 2].map((index) => ({
        index,
        fingerprint: `groq-slot-${index}`,
        available: true,
      })),
      generateStructuredJson: vi.fn().mockImplementation((prompt: string, options?: { preferredKeyIndex?: number }) => {
        normalizerCalls.push(options?.preferredKeyIndex ?? -1);
        const passageNumber = Number(prompt.match(/PASSAGE_PACKAGE\s+(\d+)/)?.[1] ?? 1);
        const [start, end] = passageNumber === 1
          ? [1, 13]
          : passageNumber === 2
            ? [14, 26]
            : [27, 40];

        return Promise.resolve({
          success: true,
          data: {
            passageNumber,
            groups: [{
              questionRange: { start, end },
              taskType: 'sentence-completion',
              instructionMeta: { wordLimit: 3 },
              questions: Array.from({ length: end - start + 1 }, (_, offset) => {
                const questionNumber = start + offset;
                return {
                  number: questionNumber,
                  promptText: `Synthetic question ${questionNumber} ___.`,
                };
              }),
            }],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Mocked V3 full test' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(true);
    expect(normalizerCalls).toEqual([0, 1, 2]);
    if (!result.success) return;
    expect(result.provider).toBe('gemini-groq');
    expect(result.model).toBe('gemini-2.5-flash+groq-structured-json');
    expect(result.passageCount).toBe(3);
    expect(result.questionCount).toBe(40);
    expect(result.candidate.rawText).toContain('CODEX_IELTS_READING_MATERIALS_START');
    expect(result.candidate.rawText).toContain('"materials"');
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(Object.values(normalized.document.interactions)).toHaveLength(40);
    const validation = validateReadingV2Draft(normalized.document);
    expect(validation.blockingIssues.map((issue) => issue.message)).toEqual([]);

    const projection = generateReadingV2StudentSafeProjection({
      snapshotVersionId: readingV2Ids.snapshotVersionId('mocked-v3-snapshot'),
      materialId: readingV2Ids.materialId('mocked-v3-material'),
      ownerId: 'teacher-1',
      document: normalized.document,
      publishedAt: '2026-05-14T00:00:00.000Z',
      publishedBy: 'teacher-1',
    });
    const projected = JSON.stringify(projection);
    expect(projected).not.toContain('answerKeyText');
    expect(projected).not.toContain('autoImportDiagnostics');
    expect(projected).not.toContain('Gemini topology marker');
    expect(projected).not.toContain('Groq');
    expect(projected).not.toContain('CODEX_IELTS_READING_MATERIALS_START');
  });
});
