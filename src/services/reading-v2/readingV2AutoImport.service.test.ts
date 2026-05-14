import { describe, expect, it, vi } from 'vitest';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { generateReadingV2AutoImportCandidate, type ReadingV2AutoStructuredGenerator } from './readingV2AutoImport.service';
import { normalizeReadingV2ImportCandidate } from './readingV2ImportNormalization.service';

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
  ...Array.from({ length: end - start + 1 }, (_, index) => `${start + index} Synthetic question ${start + index}.`),
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
});
