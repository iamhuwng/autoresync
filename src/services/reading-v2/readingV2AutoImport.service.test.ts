import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids } from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import {
  generateReadingV2AutoImportCandidate,
  type ReadingV2AutoStructuredGenerator,
  type ReadingV2AutoV4Extractor,
} from './readingV2AutoImport.service';
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

const v4ExtractorFor = (overrides: {
  readonly answerKey?: Record<number, string | string[]>;
  readonly passageContent?: string;
} = {}): ReadingV2AutoV4Extractor => ({
  parsePassagesOnly: vi.fn().mockResolvedValue({
    success: true,
    data: {
      passages: [{
        id: 'passage-1',
        title: 'Auto passage',
        content: overrides.passageContent ?? [
          'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
          'It has a second sentence to avoid being too tiny for guardrails.',
        ].join('\n'),
        type: 'text',
        imageUrl: null,
        questionStart: 1,
        questionEnd: 2,
        wordCount: 23,
      }],
      confidence: 0.95,
    },
  }),
  parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
    success: true,
    data: {
      questions: [
        {
          questionNumber: 1,
          questionText: '1 The first statement is supported by the passage.',
          type: 'true-false-not-given',
          answer: 'TRUE',
          passageId: 'passage-1',
          confidence: 0.95,
          sectionInstruction: 'Do the following statements agree with the information given in Reading Passage 1?',
        },
        {
          questionNumber: 2,
          questionText: '2 The second statement is contradicted by the passage.',
          type: 'true-false-not-given',
          answer: 'FALSE',
          passageId: 'passage-1',
          confidence: 0.95,
          sectionInstruction: 'Do the following statements agree with the information given in Reading Passage 1?',
        },
      ],
      answerKey: overrides.answerKey ?? { 1: 'TRUE', 2: 'FALSE' },
      confidence: 0.95,
    },
  }),
});

const singleSlotQuestionAreaNormalizerFor = (
  responses: readonly Result<unknown>[],
) => {
  let responseIndex = 0;
  return {
    getAvailableStructuredJsonKeySlots: async () => [{
      index: 0,
      fingerprint: 'groq-slot-0',
      available: true,
    }],
    generateStructuredJson: vi.fn().mockImplementation(() =>
      Promise.resolve(responses[Math.min(responseIndex++, responses.length - 1)] ?? responses[responses.length - 1]!),
    ),
  };
};

const buildSharedInlineSummaryFixture = () => {
  const sharedSummaryLine = [
    'Psychologists have traditionally believed that a personality **14** .......... was impossible',
    'and that by a **15** .......... the easiest qualities to acquire is **16** .......... around',
    'different **17** .......... and feel some **18** .......... .',
  ].join(' ');
  const raw = [
    'READING PASSAGE 2',
    'Synthetic passage body.',
    '',
    'Questions 14-18',
    'Complete the summary below.',
    'Choose ONE WORD ONLY from the passage for each answer.',
    sharedSummaryLine,
    '',
    'Answers',
    '14 type',
    '15 change',
    '16 openness',
    '17 situations',
    '18 empathy',
  ].join('\n');
  const sourceLines = raw.split('\n');
  const lineNumberOf = (lineText: string): number => {
    const index = sourceLines.findIndex((line) => line === lineText);
    if (index < 0) {
      throw new Error(`Missing source line: ${lineText}`);
    }
    return index + 1;
  };

  return {
    raw,
    sharedSummaryLine,
    lineNumberOf,
    markerData: {
      packages: [{
        passageNumber: 2,
        passageTitleLines: {
          startLine: lineNumberOf('READING PASSAGE 2'),
          endLine: lineNumberOf('READING PASSAGE 2'),
        },
        passageBodyLines: {
          startLine: lineNumberOf('READING PASSAGE 2'),
          endLine: lineNumberOf('Synthetic passage body.'),
        },
        questionAreaLines: {
          startLine: lineNumberOf('Questions 14-18'),
          endLine: lineNumberOf(sharedSummaryLine),
        },
        expectedQuestionRange: { start: 14, end: 18 },
        groups: [{
          questionRange: { start: 14, end: 18 },
          lines: {
            startLine: lineNumberOf('Questions 14-18'),
            endLine: lineNumberOf(sharedSummaryLine),
          },
          taskTypeHint: 'summary-completion',
        }],
        referenceBankLineSpans: [],
        excludedLineSpans: [],
        uncertaintyDiagnostics: [],
      }],
      answerKeyRows: [
        { questionNumber: 14, answer: 'type', sourceLine: lineNumberOf('14 type') },
        { questionNumber: 15, answer: 'change', sourceLine: lineNumberOf('15 change') },
        { questionNumber: 16, answer: 'openness', sourceLine: lineNumberOf('16 openness') },
        { questionNumber: 17, answer: 'situations', sourceLine: lineNumberOf('17 situations') },
        { questionNumber: 18, answer: 'empathy', sourceLine: lineNumberOf('18 empathy') },
      ],
      diagnostics: [],
    },
  };
};

describe('readingV2AutoImport.service', () => {
  it('creates an Auto Gemini import candidate from structured Gemini JSON', async () => {
    const generator = generatorFor(autoPayload());

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Auto fixture' },
      { generator, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    if (!result.success) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    if (!result.success) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.success).toBe(true);
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

  it('uses Auto V4 staged parser output as the default V2 Auto path when no structured generator is injected', async () => {
    const v4Extractor = v4ExtractorFor();

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Auto V4 fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    if (!result.success) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.success).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash+auto-v4-staged-adapter');
    expect(v4Extractor.parsePassagesOnly).toHaveBeenCalledTimes(1);
    expect(v4Extractor.parseQuestionsAndAnswers).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'auto-v4-staged-parser-used', severity: 'info' }),
      expect.objectContaining({ code: 'answer-key-extracted', severity: 'info' }),
    ]));
    expect(result.candidate.rawText).toContain('"type":"true-false-not-given"');
    expect(result.candidate.rawText).toContain('"answer":"TRUE"');
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('does not bind Auto V4 parser answers when the raw source has no visible answer key', async () => {
    const v4Extractor = v4ExtractorFor({ answerKey: { 1: 'TRUE', 2: 'FALSE' } });

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey.replace(/\nAnswers[\s\S]+$/, ''), sourceName: 'Auto V4 no key fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBeUndefined();
    expect(result.candidate.answerKeyText).toBeUndefined();
    expect(result.candidate.rawText).toContain('"answer":""');
    expect(result.candidate.rawText).not.toContain('"answer":"TRUE"');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'auto-v4-staged-parser-used', severity: 'info' }),
      expect.objectContaining({ code: 'answer-key-missing', severity: 'warning' }),
    ]));
  });

  it('prefers Auto V4 copied answer-key rows over partial local source extraction', async () => {
    const raw = [
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
      'This explanatory line is not a key row, but the AI-copied answer key still includes the rest.',
      '2 FALSE',
    ].join('\n');
    const v4Extractor = v4ExtractorFor({ answerKey: { 1: 'TRUE', 2: 'FALSE' } });

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 partial local key fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    expect(result.candidate.answerKeyText).toBe('1 TRUE\n2 FALSE');
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('opens an Auto V4 Studio candidate for review when source answer-key rows cannot bind cleanly', async () => {
    const raw = [
      'READING PASSAGE 1',
      'This raw teacher source contains enough passage text for Auto Gemini import and Studio review.',
      'It has a second sentence to avoid being too tiny for guardrails.',
      '',
      'Questions 1-4',
      'Do the following statements agree with the information given in Reading Passage 1?',
      'TRUE if the statement agrees with the information',
      'FALSE if the statement contradicts the information',
      'NOT GIVEN if there is no information on this',
      '1 The first statement is supported by the passage.',
      '2 The second statement is contradicted by the passage.',
      '3 The third statement needs teacher repair.',
      '4 The fourth statement needs teacher repair.',
      '',
      'Answers',
      '1 TRUE',
      '2 FALSE',
      '3 TRUE',
      '4 FALSE',
    ].join('\n');
    const v4Extractor = v4ExtractorFor();

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 binding drift fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.reviewStatus).toBe('needs_review');
    expect(result.questionCount).toBe(2);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-question-missing', severity: 'warning' }),
      expect.objectContaining({ code: 'source-answer-row-unbound', severity: 'warning' }),
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(result.candidate.publishBlockingPlaceholders).toEqual(expect.arrayContaining([
      expect.stringContaining('Source ledger detected questions 3-4'),
      expect.stringContaining('Source answer-key rows cannot bind to generated questions: 3-4'),
    ]));
    expect(result.candidate.uncertaintyMarkers).toEqual(expect.arrayContaining([
      expect.stringContaining('Source answer-key rows cannot bind to generated questions: 3-4'),
    ]));
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
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

    if (!result.success) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.success).toBe(true);
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
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.reviewStatus).toBe('needs_review');
    expect(result.questionCount).toBe(13);
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
      expect.objectContaining({ code: 'source-question-missing', severity: 'warning' }),
      expect.objectContaining({ code: 'source-answer-row-unbound', severity: 'warning' }),
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(result.candidate.publishBlockingPlaceholders).toEqual(expect.arrayContaining([
      expect.stringContaining('questions 14-40'),
      expect.stringContaining('answer-key rows cannot bind'),
    ]));
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

  it('preserves exact topology marker answer-key diagnostics through auto import', async () => {
    const markerData = mockedV3MarkerData();
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...markerData,
          answerKeyRows: [
            { ...markerData.answerKeyRows[0], answer: 'not-on-source-line' },
            ...markerData.answerKeyRows.slice(1),
          ],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawThreePassageSourceWithAnswerKey, sourceName: 'Mocked V3 exact topology diagnostic' },
      {
        generator: markerGenerator,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'topology-marker-answer-row-source-mismatch',
        severity: 'error',
        questionNumber: 1,
      }),
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'topology-marker-failed' }),
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

  it.each([
    {
      name: 'missing reference bank',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-1',
        'Choose the correct letter, A, B, C or D.',
        '1 which option is correct?',
        '',
        'Answers',
        '1 B',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 which option is correct?') },
          expectedQuestionRange: { start: 1, end: 1 },
          groups: [{
            questionRange: { start: 1, end: 1 },
            lines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 which option is correct?') },
            taskTypeHint: 'multiple-choice',
          }],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'B', sourceLine: lineNumberOf('1 B') },
        ],
        diagnostics: [],
      }),
      responses: [{
        success: true,
        data: {
          passageNumber: 1,
          groups: [{
            questionRange: { start: 1, end: 1 },
            taskType: 'multiple-choice',
            sourceInstructionText: 'Choose the correct letter, A, B, C or D.',
            instructionMeta: { optionLabelRange: 'A-D' },
            questions: [
              { number: 1, promptText: '1 which option is correct?' },
            ],
          }],
          coverageSummary: {
            coveredGroups: ['1-1'],
            coveredQuestions: [1],
          },
          diagnostics: [],
        },
      }] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['missing-reference-bank'],
      expectReviewableSuccess: true,
    },
    {
      name: 'omitted expected range',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-4',
        'Complete the sentences below.',
        '1 first ___.',
        '2 second ___.',
        '3 third ___.',
        '4 fourth ___.',
        '',
        'Answers',
        '1 alpha',
        '2 beta',
        '3 gamma',
        '4 delta',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-4'), endLine: lineNumberOf('4 fourth ___.') },
          expectedQuestionRange: { start: 1, end: 4 },
          groups: [
            {
              questionRange: { start: 1, end: 2 },
              lines: { startLine: lineNumberOf('Questions 1-4'), endLine: lineNumberOf('2 second ___.') },
              taskTypeHint: 'sentence-completion',
            },
            {
              questionRange: { start: 3, end: 4 },
              lines: { startLine: lineNumberOf('3 third ___.'), endLine: lineNumberOf('4 fourth ___.') },
              taskTypeHint: 'mystery-task',
            },
          ],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
          { questionNumber: 2, answer: 'beta', sourceLine: lineNumberOf('2 beta') },
          { questionNumber: 3, answer: 'gamma', sourceLine: lineNumberOf('3 gamma') },
          { questionNumber: 4, answer: 'delta', sourceLine: lineNumberOf('4 delta') },
        ],
        diagnostics: [],
      }),
      responses: [
        {
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'sentence-completion',
              sourceInstructionText: 'Complete the sentences below.',
              instructionMeta: {},
              questions: [
                { number: 1, promptText: '1 first ___.' },
                { number: 2, promptText: '2 second ___.' },
              ],
            }],
            coverageSummary: {
              coveredGroups: ['1-2'],
              coveredQuestions: [1, 2],
            },
            diagnostics: [],
          },
        },
        {
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'sentence-completion',
              sourceInstructionText: 'Complete the sentences below.',
              instructionMeta: {},
              questions: [
                { number: 1, promptText: '1 first ___.' },
                { number: 2, promptText: '2 second ___.' },
              ],
            }],
            coverageSummary: {
              coveredGroups: ['1-2'],
              coveredQuestions: [1, 2],
            },
            diagnostics: [],
          },
        },
      ] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['groq-output-missing-group', 'group-coverage-mismatch', 'repair-failed'],
      expectReviewableSuccess: true,
    },
    {
      name: 'duplicate numbering',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-2',
        'Complete the sentences below.',
        '1 first ___.',
        '2 second ___.',
        '',
        'Answers',
        '1 alpha',
        '2 beta',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-2'), endLine: lineNumberOf('2 second ___.') },
          expectedQuestionRange: { start: 1, end: 2 },
          groups: [{
            questionRange: { start: 1, end: 2 },
            lines: { startLine: lineNumberOf('Questions 1-2'), endLine: lineNumberOf('2 second ___.') },
            taskTypeHint: 'sentence-completion',
          }],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
          { questionNumber: 2, answer: 'beta', sourceLine: lineNumberOf('2 beta') },
        ],
        diagnostics: [],
      }),
      responses: [{
        success: true,
        data: {
          passageNumber: 1,
          groups: [{
            questionRange: { start: 1, end: 2 },
            taskType: 'sentence-completion',
            sourceInstructionText: 'Complete the sentences below.',
            instructionMeta: {},
            questions: [
              { number: 1, promptText: '1 first ___.' },
              { number: 1, promptText: '2 second ___.' },
            ],
          }],
          coverageSummary: {
            coveredGroups: ['1-2'],
            coveredQuestions: [1, 1],
          },
          diagnostics: [],
        },
      }] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['duplicate-question-number', 'group-coverage-mismatch'],
    },
    {
      name: 'malformed transcript',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-1',
        'Complete the sentence below.',
        '1 first ___.',
        '',
        'Answers',
        '1 alpha',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 first ___.') },
          expectedQuestionRange: { start: 1, end: 1 },
          groups: [{
            questionRange: { start: 1, end: 1 },
            lines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 first ___.') },
            taskTypeHint: 'sentence-completion',
          }],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
        ],
        diagnostics: [],
      }),
      responses: [{
        success: true,
        data: {
          passageNumber: 1,
          diagnostics: [],
        },
      }] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['groq-package-failed'],
    },
    {
      name: 'provider quota stop',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-1',
        'Complete the sentence below.',
        '1 first ___.',
        '',
        'Answers',
        '1 alpha',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 first ___.') },
          expectedQuestionRange: { start: 1, end: 1 },
          groups: [{
            questionRange: { start: 1, end: 1 },
            lines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('1 first ___.') },
            taskTypeHint: 'sentence-completion',
          }],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
        ],
        diagnostics: [],
      }),
      responses: [{
        success: false,
        error: 'All Groq API keys exhausted or rate-limited',
      }] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['provider-quota-exhausted', 'groq-package-failed'],
    },
    {
      name: 'source text hallucination',
      raw: [
        'READING PASSAGE 1',
        'Synthetic passage text.',
        '',
        'Questions 1-1',
        'Complete the sentence below.',
        'Source sentence without printed question marker ___.',
        '',
        'Answers',
        '1 alpha',
      ].join('\n'),
      buildMarkerData: (lineNumberOf: (lineText: string) => number) => ({
        packages: [{
          passageNumber: 1,
          passageTitleLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('READING PASSAGE 1') },
          passageBodyLines: { startLine: lineNumberOf('READING PASSAGE 1'), endLine: lineNumberOf('Synthetic passage text.') },
          questionAreaLines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('Source sentence without printed question marker ___.') },
          expectedQuestionRange: { start: 1, end: 1 },
          groups: [{
            questionRange: { start: 1, end: 1 },
            lines: { startLine: lineNumberOf('Questions 1-1'), endLine: lineNumberOf('Source sentence without printed question marker ___.') },
            taskTypeHint: 'sentence-completion',
          }],
          referenceBankLineSpans: [],
          excludedLineSpans: [],
          uncertaintyDiagnostics: [],
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
        ],
        diagnostics: [],
      }),
      responses: [{
        success: true,
        data: {
          passageNumber: 1,
          groups: [{
            questionRange: { start: 1, end: 1 },
            taskType: 'sentence-completion',
            sourceInstructionText: 'Complete the sentence below.',
            instructionMeta: {},
            questions: [{
              number: 1,
              sourceTextExact: '1 source sentence ___.',
              normalizedPromptText: 'source sentence with invented meaning ___.',
              promptText: 'source sentence with invented meaning ___.',
            }],
          }],
          coverageSummary: {
            coveredGroups: ['1-1'],
            coveredQuestions: [1],
          },
          diagnostics: [],
        },
      }] as const satisfies readonly Result<unknown>[],
      expectedCodes: ['source-text-exact-missing'],
    },
  ])('covers V3 negative matrix: $name', async ({ raw, buildMarkerData, responses, expectedCodes, expectReviewableSuccess }) => {
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const markerGenerator = generatorFor(buildMarkerData(lineNumberOf));
    const questionAreaNormalizer = singleSlotQuestionAreaNormalizerFor(responses);

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: `Mocked V3 negative ${expectedCodes.join('-')}` },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    if (expectReviewableSuccess) {
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.reviewStatus).toBe('needs_review');
      expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining(
        expectedCodes.map((code) => expect.objectContaining({ code, severity: 'warning' })),
      ));
      return;
    }

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining(
      expectedCodes.map((code) => expect.objectContaining({ code })),
    ));
  });

  it('repairs unique-line completion prompts from local source when provider crops visible context', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Synthetic passage body.',
      '',
      'Questions 1-3',
      'Complete the sentences below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '– movement: **1** ___________ more unpredictably',
      '– size of fires: **2** ___________ greater on average than two decades ago',
      '– rainfall: **3** ___________ average',
      '',
      'Answers',
      '1 spread',
      '2 tenfold',
      '3 below',
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
              startLine: lineNumberOf('Questions 1-3'),
              endLine: lineNumberOf('– rainfall: **3** ___________ average'),
            },
            expectedQuestionRange: { start: 1, end: 3 },
            groups: [{
              questionRange: { start: 1, end: 3 },
              lines: {
                startLine: lineNumberOf('Questions 1-3'),
                endLine: lineNumberOf('– rainfall: **3** ___________ average'),
              },
              taskTypeHint: 'sentence-completion',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 1, answer: 'spread', sourceLine: lineNumberOf('1 spread') },
            { questionNumber: 2, answer: 'tenfold', sourceLine: lineNumberOf('2 tenfold') },
            { questionNumber: 3, answer: 'below', sourceLine: lineNumberOf('3 below') },
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
            questionRange: { start: 1, end: 3 },
            taskType: 'sentence-completion',
            sourceInstructionText: 'Complete the sentences below.',
            instructionMeta: { wordLimit: 1, wordLimitText: 'ONE WORD ONLY' },
            questions: [
              {
                number: 1,
                sourceTextExact: '**1** ___________ more unpredictably',
                normalizedPromptText: '1 more unpredictably',
                promptText: '1 more unpredictably',
                sourceLines: [lineNumberOf('– movement: **1** ___________ more unpredictably')],
              },
              {
                number: 2,
                sourceTextExact: '**2** ___________ greater on average than two decades ago',
                normalizedPromptText: '2 greater on average than two decades ago',
                promptText: '2 greater on average than two decades ago',
                sourceLines: [lineNumberOf('– size of fires: **2** ___________ greater on average than two decades ago')],
              },
              {
                number: 3,
                sourceTextExact: '**3** ___________ average',
                normalizedPromptText: '3 average',
                promptText: '3 average',
                sourceLines: [lineNumberOf('– rainfall: **3** ___________ average')],
              },
            ],
          }],
          coverageSummary: {
            coveredGroups: ['1-3'],
            coveredQuestions: [1, 2, 3],
          },
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 source-line context repair fixture' },
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
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repair-applied', questionNumber: 1 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 2 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 3 }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'normalized-text-source-drift' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const interactions = Object.values(normalized.document.interactions)
      .sort((left, right) => (left.reviewLabel.displayNumber ?? 0) - (right.reviewLabel.displayNumber ?? 0));
    const validation = validateReadingV2Draft(normalized.document);

    expect(interactions[0]?.promptText).toContain('movement: ___ more unpredictably');
    expect(interactions[1]?.promptText).toContain('size of fires: ___ greater on average than two decades ago');
    expect(interactions[2]?.promptText).toContain('rainfall: ___ average');
    expect(validation.blockingIssues).toEqual([]);
  });

  it('realigns drifted TFNG source-line anchors before final source proof', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Synthetic passage body.',
      '',
      'Questions 7-10',
      'Do the following statements agree with the information given in Reading Passage?',
      '',
      '*In boxes **7-10** on your answer sheet, write*',
      '',
      '**TRUE** if the statement agrees with the information',
      '',
      '**FALSE** if the statement contradicts the information',
      '',
      '**NOT** **GIVEN** if there is no information on this',
      '',
      '**7** First exact judgement statement.',
      '',
      '**8** Second exact judgement statement.',
      '',
      '**9** Third exact judgement statement.',
      '',
      '**10** Fourth exact judgement statement.',
      '',
      'Answers',
      '7 TRUE',
      '8 FALSE',
      '9 TRUE',
      '10 NOT GIVEN',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string, occurrence = 1): number => {
      let seen = 0;
      for (let index = 0; index < sourceLines.length; index += 1) {
        if (sourceLines[index] === lineText) {
          seen += 1;
          if (seen === occurrence) {
            return index + 1;
          }
        }
      }
      throw new Error(`Missing source line: ${lineText}#${occurrence}`);
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
              startLine: lineNumberOf('Questions 7-10'),
              endLine: lineNumberOf('**10** Fourth exact judgement statement.'),
            },
            expectedQuestionRange: { start: 7, end: 10 },
            groups: [{
              questionRange: { start: 7, end: 10 },
              lines: {
                startLine: lineNumberOf('Questions 7-10'),
                endLine: lineNumberOf('**10** Fourth exact judgement statement.'),
              },
              taskTypeHint: 'true-false-not-given',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 7, answer: 'TRUE', sourceLine: lineNumberOf('7 TRUE') },
            { questionNumber: 8, answer: 'FALSE', sourceLine: lineNumberOf('8 FALSE') },
            { questionNumber: 9, answer: 'TRUE', sourceLine: lineNumberOf('9 TRUE') },
            { questionNumber: 10, answer: 'NOT GIVEN', sourceLine: lineNumberOf('10 NOT GIVEN') },
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
            questionRange: { start: 7, end: 10 },
            taskType: 'true-false-not-given',
            sourceInstructionText: '*In boxes **7-10** on your answer sheet, write*',
            instructionMeta: { vocabulary: 'TFNG' },
            questions: [
              {
                number: 7,
                sourceTextExact: '**7** First exact judgement statement.',
                normalizedPromptText: '7 First exact judgement statement.',
                promptText: '7 First exact judgement statement.',
                sourceLines: [lineNumberOf('**7** First exact judgement statement.')],
              },
              {
                number: 8,
                sourceTextExact: '**8** Second exact judgement statement.',
                normalizedPromptText: '8 Second exact judgement statement.',
                promptText: '8 Second exact judgement statement.',
                sourceLines: [lineNumberOf('**8** Second exact judgement statement.')],
              },
              {
                number: 9,
                sourceTextExact: '**9** Third exact judgement statement.',
                normalizedPromptText: '9 Third exact judgement statement.',
                promptText: '9 Third exact judgement statement.',
                sourceLines: [lineNumberOf('', 9)],
              },
              {
                number: 10,
                sourceTextExact: '**10** Fourth exact judgement statement.',
                normalizedPromptText: '10 Fourth exact judgement statement.',
                promptText: '10 Fourth exact judgement statement.',
                sourceLines: [lineNumberOf('', 10)],
              },
            ],
          }],
          coverageSummary: {
            coveredGroups: ['7-10'],
            coveredQuestions: [7, 8, 9, 10],
          },
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 TFNG source-line drift fixture' },
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
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repair-applied', questionNumber: 9 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 10 }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-text-exact-missing' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
  });

  it('collapses mojibake ellipsis runs into one blank marker during source-line canonicalization', async () => {
    const blankRun = 'â€¦â€¦â€¦â€¦â€¦.';
    const raw = [
      'READING PASSAGE 1',
      'Synthetic passage body.',
      '',
      'Questions 1-3',
      'Complete the notes below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      `â€“ movement: **1** ${blankRun} more unpredictably`,
      `â€“ size of fires: **2** ${blankRun} greater on average than two decades ago`,
      `â€“ rainfall: **3** ${blankRun} average`,
      '',
      'Answers',
      '1 spread',
      '2 tenfold',
      '3 below',
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
              startLine: lineNumberOf('Questions 1-3'),
              endLine: lineNumberOf(`â€“ rainfall: **3** ${blankRun} average`),
            },
            expectedQuestionRange: { start: 1, end: 3 },
            groups: [{
              questionRange: { start: 1, end: 3 },
              lines: {
                startLine: lineNumberOf('Questions 1-3'),
                endLine: lineNumberOf(`â€“ rainfall: **3** ${blankRun} average`),
              },
              taskTypeHint: 'note-completion',
            }],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 1, answer: 'spread', sourceLine: lineNumberOf('1 spread') },
            { questionNumber: 2, answer: 'tenfold', sourceLine: lineNumberOf('2 tenfold') },
            { questionNumber: 3, answer: 'below', sourceLine: lineNumberOf('3 below') },
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
            questionRange: { start: 1, end: 3 },
            taskType: 'note-completion',
            sourceInstructionText: 'Complete the notes below.',
            instructionMeta: { wordLimit: 1, wordLimitText: 'ONE WORD ONLY' },
            questions: [
              {
                number: 1,
                sourceTextExact: `Ã¢â‚¬â€œ movement: **1** ${blankRun} more unpredictably`,
                normalizedPromptText: '1 more unpredictably',
                promptText: '1 more unpredictably',
                sourceLines: [lineNumberOf(`â€“ movement: **1** ${blankRun} more unpredictably`)],
              },
              {
                number: 2,
                sourceTextExact: `Ã¢â‚¬â€œ size of fires: **2** ${blankRun} greater on average than two decades ago`,
                normalizedPromptText: '2 greater on average than two decades ago',
                promptText: '2 greater on average than two decades ago',
                sourceLines: [lineNumberOf(`â€“ size of fires: **2** ${blankRun} greater on average than two decades ago`)],
              },
              {
                number: 3,
                sourceTextExact: `Ã¢â‚¬â€œ rainfall: **3** ${blankRun} average`,
                normalizedPromptText: '3 average',
                promptText: '3 average',
                sourceLines: [lineNumberOf(`â€“ rainfall: **3** ${blankRun} average`)],
              },
            ],
            note: {
              sections: [{
                questionNumbers: [1, 2, 3],
                lines: [
                  {
                    sourceTextExact: `â€“ movement: **1** ${blankRun} more unpredictably`,
                    normalizedText: 'â€“ movement: 1 more unpredictably',
                    text: 'â€“ movement: 1 more unpredictably',
                    questionNumber: 1,
                  },
                  {
                    sourceTextExact: `â€“ size of fires: **2** ${blankRun} greater on average than two decades ago`,
                    normalizedText: 'â€“ size of fires: 2 greater on average than two decades ago',
                    text: 'â€“ size of fires: 2 greater on average than two decades ago',
                    questionNumber: 2,
                  },
                  {
                    sourceTextExact: `â€“ rainfall: **3** ${blankRun} average`,
                    normalizedText: 'â€“ rainfall: 3 average',
                    text: 'â€“ rainfall: 3 average',
                    questionNumber: 3,
                  },
                ],
              }],
            },
          }],
          coverageSummary: {
            coveredGroups: ['1-3'],
            coveredQuestions: [1, 2, 3],
          },
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 mojibake blank canonicalization fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(result.success).toBe(true);
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repair-applied', questionNumber: 1 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 2 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 3 }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'blank-mismatch' }),
      expect.objectContaining({ code: 'normalized-text-source-drift' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const interactions = Object.values(normalized.document.interactions)
      .sort((left, right) => (left.reviewLabel.displayNumber ?? 0) - (right.reviewLabel.displayNumber ?? 0));
    const validation = validateReadingV2Draft(normalized.document);

    expect(interactions[0]?.promptText).toContain('movement: ___ more unpredictably');
    expect(interactions[1]?.promptText).toContain('size of fires: ___ greater on average than two decades ago');
    expect(interactions[2]?.promptText).toContain('rainfall: ___ average');
    expect(validation.blockingIssues).toEqual([]);
  });

  it('scopes shared inline summary lines to one blank per question during source-line canonicalization', async () => {
    const fixture = buildSharedInlineSummaryFixture();
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: fixture.markerData,
      }),
    };
    const sharedLineNumber = fixture.lineNumberOf(fixture.sharedSummaryLine);
    const questionAreaNormalizer = singleSlotQuestionAreaNormalizerFor([{
      success: true,
      data: {
        passageNumber: 2,
        groups: [{
          questionRange: { start: 14, end: 18 },
          taskType: 'summary-completion-text',
          sourceInstructionText: 'Complete the summary below.',
          instructionMeta: { wordLimit: 1, wordLimitText: 'ONE WORD ONLY', summaryAnswerMode: 'text' },
          questions: [14, 15, 16, 17, 18].map((questionNumber) => ({
            number: questionNumber,
            sourceTextExact: fixture.sharedSummaryLine,
            normalizedPromptText: fixture.sharedSummaryLine,
            promptText: fixture.sharedSummaryLine,
            sourceLines: [sharedLineNumber],
          })),
        }],
        coverageSummary: {
          coveredGroups: ['14-18'],
          coveredQuestions: [14, 15, 16, 17, 18],
        },
        diagnostics: [],
      },
    }]);

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: fixture.raw, sourceName: 'Mocked V3 shared-line summary canonicalization fixture' },
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
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repair-applied', questionNumber: 14 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 15 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 16 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 17 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 18 }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'blank-mismatch' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const interactions = Object.values(normalized.document.interactions)
      .sort((left, right) => (left.reviewLabel.displayNumber ?? 0) - (right.reviewLabel.displayNumber ?? 0));
    const validation = validateReadingV2Draft(normalized.document);

    expect(interactions).toHaveLength(5);
    expect(interactions.map((interaction) => (interaction.promptText.match(/___/g) ?? []).length)).toEqual([1, 1, 1, 1, 1]);
    expect(interactions[0]?.promptText).toContain('personality ___ was impossible and that by a');
    expect(interactions[1]?.promptText).toContain('by a ___ the easiest qualities to acquire');
    expect(interactions[2]?.promptText).toContain('acquire is ___ around different');
    expect(interactions[3]?.promptText).toContain('different ___ and feel some');
    expect(interactions[4]?.promptText).toContain('feel some ___');
    expect(validation.blockingIssues).toEqual([]);
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

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(normalizerCalls).toEqual([0, 0]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-package-completion-retried' }),
      expect.objectContaining({ code: 'groq-package-completion-retry-failed' }),
    ]));
    expect(result.passageCount).toBe(1);
    expect(result.questionCount).toBe(3);

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(Object.values(normalized.document.interactions)).toHaveLength(3);
  });

  it('backfills markdown-emphasized reference banks from package source lines in V3', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Local passage body stays local.',
      '',
      'Questions 1-2',
      'Look at the following statements and the list of people below.',
      'Match each statement with the correct person, A-B.',
      '**1** Exact matching-features prompt ___.',
      '**2** Another exact matching-features prompt ___.',
      '**A** Christopher Peterson',
      '**B** David Fajgenbaum',
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
    const bankSpan = {
      startLine: lineNumberOf('**A** Christopher Peterson'),
      endLine: lineNumberOf('**B** David Fajgenbaum'),
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
              endLine: lineNumberOf('**2** Another exact matching-features prompt ___.'),
            },
            expectedQuestionRange: { start: 1, end: 2 },
            groups: [{
              questionRange: { start: 1, end: 2 },
              lines: {
                startLine: lineNumberOf('Questions 1-2'),
                endLine: lineNumberOf('**2** Another exact matching-features prompt ___.'),
              },
              taskTypeHint: 'matching-features',
              referenceBankLines: [bankSpan],
            }],
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
        expect(prompt).toContain('**A** Christopher Peterson');
        expect(prompt).toContain('**B** David Fajgenbaum');
        return Promise.resolve({
          success: true,
          data: {
            passageNumber: 1,
            groups: [{
              questionRange: { start: 1, end: 2 },
              taskType: 'matching-features',
              sourceInstructionText: 'Look at the following statements and the list of people below. Match each statement with the correct person, A-B.',
              instructionMeta: {
                optionLabelRange: 'A-B',
                referenceLabelRange: 'A-B',
              },
              questions: [
                {
                  number: 1,
                  promptText: '1 Exact matching-features prompt ___.',
                },
                {
                  number: 2,
                  promptText: '2 Another exact matching-features prompt ___.',
                },
              ],
            }],
            diagnostics: [],
          },
        });
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 markdown reference-bank fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(normalizerCalls).toEqual([0, 0]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-package-completion-retried' }),
      expect.objectContaining({ code: 'groq-package-completion-retry-failed' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-reference-bank' }),
      expect.objectContaining({ code: 'source-text-exact-missing' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    const matchingFeaturesGroup = Object.values(normalized.document.taskGroups)
      .find((group) => group.officialTaskType === 'matching-features');
    const matchingFeaturesOptionSetId = matchingFeaturesGroup?.optionSetRefs[0];
    const matchingFeaturesOptionSet = matchingFeaturesOptionSetId
      ? normalized.document.optionSets[matchingFeaturesOptionSetId]
      : undefined;
    expect(matchingFeaturesOptionSet?.options.map((option) => option.label)).toEqual(['A', 'B']);
    expect(matchingFeaturesOptionSet?.options.map((option) => option.text)).toEqual([
      'Christopher Peterson',
      'David Fajgenbaum',
    ]);
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

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(normalizerCalls).toEqual([0, 0]);
    expect(seenBankSections).toHaveLength(2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-package-completion-retried' }),
      expect.objectContaining({ code: 'groq-package-completion-retry-failed' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-reference-bank' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'bank-ownership-heuristic-used', stage: 'repaired-transcript' }),
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
      '**4** Flow step uses ___.',
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
              endLine: lineNumberOf('**4** Flow step uses ___.'),
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
                  endLine: lineNumberOf('**4** Flow step uses ___.'),
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

    const events: { event: string; payload: Record<string, unknown> }[] = [];
    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 repaired-group fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
        onDiagnosticEvent: (event, payload) => {
          events.push({ event, payload });
        },
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'group-coverage-mismatch' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-output-missing-group', stage: 'raw-groq' }),
      expect.objectContaining({ code: 'repair-applied', stage: 'repaired-transcript' }),
    ]));
    expect(result.candidate.evidence.join('\n')).toContain('Auto V3 replay P1');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'v3_package_replay',
        payload: expect.objectContaining({
          schemaVersion: 'reading-v2-auto-v3-groq-source-proof-v1',
          passageNumber: 1,
        }),
      }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    expect(Object.values(normalized.document.interactions)).toHaveLength(4);
  });

  it('repairs a missing shared-line summary group from question-area lines with one blank per question', async () => {
    const sharedSummaryLine = [
      'Psychologists have traditionally believed that a personality **14** .......... was impossible',
      'and that by a **15** .......... the easiest qualities to acquire is **16** .......... around',
      'different **17** .......... and feel some **18** .......... .',
    ].join(' ');
    const raw = [
      'READING PASSAGE 2',
      'Synthetic passage body.',
      '',
      'Questions 12-13',
      'Complete the sentences below.',
      '12 first sentence ___.',
      '13 second sentence ___.',
      '',
      'Questions 14-18',
      'Complete the summary below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      sharedSummaryLine,
      '',
      'Answers',
      '12 alpha',
      '13 beta',
      '14 type',
      '15 change',
      '16 openness',
      '17 situations',
      '18 empathy',
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
            passageNumber: 2,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('READING PASSAGE 2'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('Synthetic passage body.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 12-13'),
              endLine: lineNumberOf(sharedSummaryLine),
            },
            expectedQuestionRange: { start: 12, end: 18 },
            groups: [
              {
                questionRange: { start: 12, end: 13 },
                lines: {
                  startLine: lineNumberOf('Questions 12-13'),
                  endLine: lineNumberOf('13 second sentence ___.'),
                },
                taskTypeHint: 'sentence-completion',
              },
              {
                questionRange: { start: 14, end: 18 },
                lines: {
                  startLine: lineNumberOf('Questions 14-18'),
                  endLine: lineNumberOf(sharedSummaryLine),
                },
                taskTypeHint: 'summary-completion',
              },
            ],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 12, answer: 'alpha', sourceLine: lineNumberOf('12 alpha') },
            { questionNumber: 13, answer: 'beta', sourceLine: lineNumberOf('13 beta') },
            { questionNumber: 14, answer: 'type', sourceLine: lineNumberOf('14 type') },
            { questionNumber: 15, answer: 'change', sourceLine: lineNumberOf('15 change') },
            { questionNumber: 16, answer: 'openness', sourceLine: lineNumberOf('16 openness') },
            { questionNumber: 17, answer: 'situations', sourceLine: lineNumberOf('17 situations') },
            { questionNumber: 18, answer: 'empathy', sourceLine: lineNumberOf('18 empathy') },
          ],
          diagnostics: [],
        },
      }),
    };
    const questionAreaNormalizer = singleSlotQuestionAreaNormalizerFor([{
      success: true,
      data: {
        passageNumber: 2,
        groups: [{
          questionRange: { start: 12, end: 13 },
          taskType: 'sentence-completion',
          sourceInstructionText: 'Complete the sentences below.',
          instructionMeta: {},
          questions: [
            { number: 12, promptText: '12 first sentence ___.' },
            { number: 13, promptText: '13 second sentence ___.' },
          ],
        }],
        coverageSummary: {
          coveredGroups: ['12-13'],
          coveredQuestions: [12, 13],
        },
        diagnostics: [],
      },
    }]);

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 shared-line summary repair fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-package-completion-retried' }),
      expect.objectContaining({ code: 'groq-package-completion-retry-failed' }),
      expect.objectContaining({ code: 'groq-output-missing-group', questionNumber: 14 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 14, stage: 'repaired-transcript' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repair-skipped' }),
      expect.objectContaining({ code: 'blank-mismatch' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const interactions = Object.values(normalized.document.interactions)
      .sort((left, right) => (left.reviewLabel.displayNumber ?? 0) - (right.reviewLabel.displayNumber ?? 0));
    const validation = validateReadingV2Draft(normalized.document);

    expect(interactions).toHaveLength(7);
    expect(interactions.slice(2).map((interaction) => (interaction.promptText.match(/___/g) ?? []).length)).toEqual([1, 1, 1, 1, 1]);
    expect(validation.blockingIssues).toEqual([]);
  });

  it('repairs an incomplete existing matching group from question-area lines', async () => {
    const raw = [
      'READING PASSAGE 2',
      'Synthetic passage body.',
      '',
      'A Alice Example',
      'B Boris Example',
      'C Cara Example',
      'D Dinesh Example',
      '',
      'Questions 19-22',
      'Look at the following statements and the list of people below.',
      'Match each statement with the correct person, A-D.',
      '19 First matching-features prompt.',
      '20 Second matching-features prompt.',
      '21 Third matching-features prompt.',
      '22 Fourth matching-features prompt.',
      '',
      'Answers',
      '19 A',
      '20 B',
      '21 C',
      '22 D',
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
      startLine: lineNumberOf('A Alice Example'),
      endLine: lineNumberOf('D Dinesh Example'),
    };
    const markerGenerator: ReadingV2AutoStructuredGenerator = {
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          packages: [{
            passageNumber: 2,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('READING PASSAGE 2'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('Synthetic passage body.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 19-22'),
              endLine: lineNumberOf('22 Fourth matching-features prompt.'),
            },
            expectedQuestionRange: { start: 19, end: 22 },
            groups: [{
              questionRange: { start: 19, end: 22 },
              lines: {
                startLine: lineNumberOf('Questions 19-22'),
                endLine: lineNumberOf('22 Fourth matching-features prompt.'),
              },
              taskTypeHint: 'matching-features',
              referenceBankLines: [bankSpan],
            }],
            referenceBankLineSpans: [bankSpan],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 19, answer: 'A', sourceLine: lineNumberOf('19 A') },
            { questionNumber: 20, answer: 'B', sourceLine: lineNumberOf('20 B') },
            { questionNumber: 21, answer: 'C', sourceLine: lineNumberOf('21 C') },
            { questionNumber: 22, answer: 'D', sourceLine: lineNumberOf('22 D') },
          ],
          diagnostics: [],
        },
      }),
    };
    const questionAreaNormalizer = singleSlotQuestionAreaNormalizerFor([{
      success: true,
      data: {
        passageNumber: 2,
        groups: [{
          questionRange: { start: 19, end: 22 },
          taskType: 'matching-features',
          sourceInstructionText: 'Look at the following statements and the list of people below.',
          instructionMeta: {},
          sectionReferences: [
            { label: 'A', sourceTextExact: 'A Alice Example', normalizedText: 'Alice Example', text: 'Alice Example' },
            { label: 'B', sourceTextExact: 'B Boris Example', normalizedText: 'Boris Example', text: 'Boris Example' },
            { label: 'C', sourceTextExact: 'C Cara Example', normalizedText: 'Cara Example', text: 'Cara Example' },
            { label: 'D', sourceTextExact: 'D Dinesh Example', normalizedText: 'Dinesh Example', text: 'Dinesh Example' },
          ],
          questions: [{
            number: 19,
            promptText: '19 First matching-features prompt.',
          }],
        }],
        diagnostics: [],
      },
    }]);

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 incomplete matching repair fixture' },
      {
        generator: markerGenerator,
        questionAreaNormalizer,
        forceV3Pipeline: true,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
      },
    );

    expect(questionAreaNormalizer.generateStructuredJson).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-package-completion-retried' }),
      expect.objectContaining({ code: 'groq-package-completion-retry-failed' }),
      expect.objectContaining({
        code: 'group-coverage-mismatch',
        severity: 'warning',
        questionNumber: 20,
        stage: 'normalized-transcript',
      }),
      expect.objectContaining({
        code: 'repair-applied',
        questionNumber: 19,
        stage: 'repaired-transcript',
      }),
    ]));
    expect(result.candidate.autoImportDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'group-coverage-mismatch', severity: 'error' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    expect(Object.values(normalized.document.interactions)).toHaveLength(4);
  });

  it('captures raw prompt/provider payload only when local debug opt-in is enabled', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Synthetic passage body.',
      '',
      'Questions 1-1',
      'Complete the sentence below.',
      '1 Exact prompt ___.',
      '',
      'Answers',
      '1 alpha',
    ].join('\n');
    const sourceLines = raw.split('\n');
    const lineNumberOf = (lineText: string): number => {
      const index = sourceLines.findIndex((line) => line === lineText);
      if (index < 0) {
        throw new Error(`Missing source line: ${lineText}`);
      }
      return index + 1;
    };
    const markerData = {
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
          startLine: lineNumberOf('Questions 1-1'),
          endLine: lineNumberOf('1 Exact prompt ___.'),
        },
        expectedQuestionRange: { start: 1, end: 1 },
        groups: [{
          questionRange: { start: 1, end: 1 },
          lines: {
            startLine: lineNumberOf('Questions 1-1'),
            endLine: lineNumberOf('1 Exact prompt ___.'),
          },
          taskTypeHint: 'sentence-completion',
        }],
        referenceBankLineSpans: [],
        excludedLineSpans: [],
        uncertaintyDiagnostics: [],
      }],
      answerKeyRows: [
        { questionNumber: 1, answer: 'alpha', sourceLine: lineNumberOf('1 alpha') },
      ],
      diagnostics: [],
    };
    const transcriptPayload = {
      passageNumber: 1,
      groups: [{
        questionRange: { start: 1, end: 1 },
        taskType: 'sentence-completion',
        sourceInstructionText: 'Complete the sentence below.',
        instructionMeta: {},
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
    const runCapture = async (captureRawProviderDebug: boolean) => {
      const events: { event: string; payload: Record<string, unknown> }[] = [];
      const result = await generateReadingV2AutoImportCandidate(
        { rawTestText: raw, sourceName: 'Mocked V3 local debug capture fixture' },
        {
          generator: generatorFor(markerData),
          questionAreaNormalizer: singleSlotQuestionAreaNormalizerFor([{
            success: true,
            data: transcriptPayload,
          }]),
          forceV3Pipeline: true,
          waitBetweenChunksMs: 0,
          minInputChars: 10,
          captureRawProviderDebug,
          onDiagnosticEvent: (event, payload) => {
            events.push({ event, payload });
          },
        },
      );

      expect(result.success).toBe(true);
      return events;
    };

    const defaultEvents = await runCapture(false);
    expect(defaultEvents.some((entry) => entry.event === 'v3_package_debug_capture')).toBe(false);

    const debugEvents = await runCapture(true);
    expect(debugEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'v3_package_debug_capture',
        payload: expect.objectContaining({
          stage: 'raw-groq',
          passageNumber: 1,
          prompt: expect.stringContaining('READING_V2_AUTO_V3_PASSAGE_PACKAGE 1'),
          providerPayload: expect.objectContaining({
            passageNumber: 1,
            coverageSummary: expect.objectContaining({
              coveredGroups: ['1-1'],
            }),
          }),
        }),
      }),
    ]));
  });

  it('uses Gemini line hints to restore omitted Groq groups and prove escaped completion blanks', async () => {
    const raw = [
      'READING PASSAGE 2',
      'A Coastal paragraph text.',
      'B Housing paragraph text.',
      'C Mangrove paragraph text.',
      'D Floating homes paragraph text.',
      'E Farming paragraph text.',
      'F Cooling paragraph text.',
      '',
      'Questions 14-17',
      'Reading Passage 2 has six paragraphs, A-F.',
      'Which paragraph contains the following information?',
      '**14** how a type of plant functions as a natural protection for coastlines',
      '**15** a prediction about how long it could take to stop noticing the effects of climate change',
      '**16** a reference to the fact that a solution is particularly cost-effective',
      '**17** a mention of a technology used to locate areas most in need of intervention',
      '',
      'Questions 18-22',
      'Complete the summary below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      'The stormwater-management programme has involved the installation of efficient **18** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_.',
      'The construction of **19** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ was the first stage of a project.',
      'A not-for-profit organisation has been building houses that can **20** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_.',
      'Rising sea levels have made it necessary to introduce various **21** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_.',
      'A project has increased the number of **22** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ on the city streets.',
      '',
      'Answers',
      '14 C',
      '15 A',
      '16 D',
      '17 F',
      '18 pumps',
      '19 dams',
      '20 float',
      '21 crops',
      '22 trees',
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
            passageNumber: 2,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('READING PASSAGE 2'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 2'),
              endLine: lineNumberOf('F Cooling paragraph text.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 14-17'),
              endLine: lineNumberOf('A project has increased the number of **22** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ on the city streets.'),
            },
            expectedQuestionRange: { start: 14, end: 22 },
            groups: [
              {
                questionRange: { start: 14, end: 17 },
                lines: {
                  startLine: lineNumberOf('Questions 14-17'),
                  endLine: lineNumberOf('**17** a mention of a technology used to locate areas most in need of intervention'),
                },
                taskTypeHint: 'paragraph-matching',
              },
              {
                questionRange: { start: 18, end: 22 },
                lines: {
                  startLine: lineNumberOf('Questions 18-22'),
                  endLine: lineNumberOf('A project has increased the number of **22** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ on the city streets.'),
                },
                taskTypeHint: 'summary-completion',
              },
            ],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 14, answer: 'C', sourceLine: lineNumberOf('14 C') },
            { questionNumber: 15, answer: 'A', sourceLine: lineNumberOf('15 A') },
            { questionNumber: 16, answer: 'D', sourceLine: lineNumberOf('16 D') },
            { questionNumber: 17, answer: 'F', sourceLine: lineNumberOf('17 F') },
            { questionNumber: 18, answer: 'pumps', sourceLine: lineNumberOf('18 pumps') },
            { questionNumber: 19, answer: 'dams', sourceLine: lineNumberOf('19 dams') },
            { questionNumber: 20, answer: 'float', sourceLine: lineNumberOf('20 float') },
            { questionNumber: 21, answer: 'crops', sourceLine: lineNumberOf('21 crops') },
            { questionNumber: 22, answer: 'trees', sourceLine: lineNumberOf('22 trees') },
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
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passageNumber: 2,
          groups: [{
            questionRange: { start: 18, end: 22 },
            taskType: 'summary-completion-text',
            sourceInstructionText: [
              'Complete the summary below.',
              'Choose ONE WORD ONLY from the passage for each answer.',
            ].join('\n'),
            instructionMeta: { wordLimit: 1, wordLimitText: 'ONE WORD ONLY' },
            questions: [
              {
                number: 18,
                promptText: 'The stormwater-management programme has involved the installation of efficient **18** ___________.',
              },
              {
                number: 19,
                promptText: 'The construction of **19** ___________ was the first stage of a project.',
              },
              {
                number: 20,
                promptText: 'A not-for-profit organisation has been building houses that can **20** ___________.',
              },
              {
                number: 21,
                promptText: 'Rising sea levels have made it necessary to introduce various **21** ___________.',
              },
              {
                number: 22,
                promptText: 'A project has increased the number of **22** ___________ on the city streets.',
              },
            ],
          }],
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 Cam 20 mixed-format fixture' },
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
      expect.objectContaining({ code: 'group-coverage-mismatch' }),
      expect.objectContaining({ code: 'repair-failed' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-output-missing-group', stage: 'raw-groq' }),
      expect.objectContaining({ code: 'repair-applied' }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    expect(Object.values(normalized.document.interactions)).toHaveLength(9);
    const matchingInfoGroup = Object.values(normalized.document.taskGroups)
      .find((group) => group.officialTaskType === 'matching-information');
    const matchingInfoOptionSetId = matchingInfoGroup?.optionSetRefs[0];
    const matchingInfoOptionSet = matchingInfoOptionSetId
      ? normalized.document.optionSets[matchingInfoOptionSetId]
      : undefined;
    expect(matchingInfoGroup?.instructionBlocks.map((block) => block.text).join('\n'))
      .toContain('A-F');
    expect(matchingInfoOptionSet?.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('does not silently lose Q27-31 or Q37-40 when Groq omits those hinted groups', async () => {
    const raw = [
      'READING PASSAGE 3',
      'A Forest paragraph text.',
      'B River paragraph text.',
      'C Housing paragraph text.',
      'D Cooling paragraph text.',
      'E Mapping paragraph text.',
      '',
      'Questions 27-31',
      'Reading Passage 3 has five paragraphs, A-E.',
      'Which paragraph contains the following information?',
      '**27** a reference to a forest-based solution',
      '**28** a detail about river planning',
      '**29** a mention of new housing',
      '**30** a description of urban cooling',
      '**31** a note about mapping technology',
      '',
      'Questions 32-36',
      'Complete the sentences below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '**32** City planners installed ___ near the canal.',
      '**33** Engineers studied ___ before construction.',
      '**34** Residents planted ___ beside the road.',
      '**35** Officials monitored ___ after the storm.',
      '**36** Students recorded ___ in field notebooks.',
      '',
      'Questions 37-40',
      'Complete the summary below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '**37** The final report highlighted ___ as the main risk.',
      '**38** Volunteers collected ___ from the flooded area.',
      '**39** Designers proposed ___ for future shelters.',
      '**40** Teachers discussed ___ during the workshop.',
      '',
      'Answers',
      '27 A',
      '28 B',
      '29 C',
      '30 D',
      '31 E',
      '32 pumps',
      '33 clay',
      '34 trees',
      '35 levels',
      '36 notes',
      '37 heat',
      '38 samples',
      '39 roofs',
      '40 safety',
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
            passageNumber: 3,
            passageTitleLines: {
              startLine: lineNumberOf('READING PASSAGE 3'),
              endLine: lineNumberOf('READING PASSAGE 3'),
            },
            passageBodyLines: {
              startLine: lineNumberOf('READING PASSAGE 3'),
              endLine: lineNumberOf('E Mapping paragraph text.'),
            },
            questionAreaLines: {
              startLine: lineNumberOf('Questions 27-31'),
              endLine: lineNumberOf('**40** Teachers discussed ___ during the workshop.'),
            },
            expectedQuestionRange: { start: 27, end: 40 },
            groups: [
              {
                questionRange: { start: 27, end: 31 },
                lines: {
                  startLine: lineNumberOf('Questions 27-31'),
                  endLine: lineNumberOf('**31** a note about mapping technology'),
                },
                taskTypeHint: 'paragraph-matching',
              },
              {
                questionRange: { start: 32, end: 36 },
                lines: {
                  startLine: lineNumberOf('Questions 32-36'),
                  endLine: lineNumberOf('**36** Students recorded ___ in field notebooks.'),
                },
                taskTypeHint: 'sentence-completion',
              },
              {
                questionRange: { start: 37, end: 40 },
                lines: {
                  startLine: lineNumberOf('Questions 37-40'),
                  endLine: lineNumberOf('**40** Teachers discussed ___ during the workshop.'),
                },
                taskTypeHint: 'summary-completion',
              },
            ],
            referenceBankLineSpans: [],
            excludedLineSpans: [],
            uncertaintyDiagnostics: [],
          }],
          answerKeyRows: [
            { questionNumber: 27, answer: 'A', sourceLine: lineNumberOf('27 A') },
            { questionNumber: 28, answer: 'B', sourceLine: lineNumberOf('28 B') },
            { questionNumber: 29, answer: 'C', sourceLine: lineNumberOf('29 C') },
            { questionNumber: 30, answer: 'D', sourceLine: lineNumberOf('30 D') },
            { questionNumber: 31, answer: 'E', sourceLine: lineNumberOf('31 E') },
            { questionNumber: 32, answer: 'pumps', sourceLine: lineNumberOf('32 pumps') },
            { questionNumber: 33, answer: 'clay', sourceLine: lineNumberOf('33 clay') },
            { questionNumber: 34, answer: 'trees', sourceLine: lineNumberOf('34 trees') },
            { questionNumber: 35, answer: 'levels', sourceLine: lineNumberOf('35 levels') },
            { questionNumber: 36, answer: 'notes', sourceLine: lineNumberOf('36 notes') },
            { questionNumber: 37, answer: 'heat', sourceLine: lineNumberOf('37 heat') },
            { questionNumber: 38, answer: 'samples', sourceLine: lineNumberOf('38 samples') },
            { questionNumber: 39, answer: 'roofs', sourceLine: lineNumberOf('39 roofs') },
            { questionNumber: 40, answer: 'safety', sourceLine: lineNumberOf('40 safety') },
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
      generateStructuredJson: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passageNumber: 3,
          groups: [{
            questionRange: { start: 32, end: 36 },
            taskType: 'sentence-completion',
            sourceInstructionText: [
              'Complete the sentences below.',
              'Choose ONE WORD ONLY from the passage for each answer.',
            ].join('\n'),
            instructionMeta: { wordLimit: 1, wordLimitText: 'ONE WORD ONLY' },
            questions: [
              { number: 32, promptText: '32 City planners installed ___ near the canal.' },
              { number: 33, promptText: '33 Engineers studied ___ before construction.' },
              { number: 34, promptText: '34 Residents planted ___ beside the road.' },
              { number: 35, promptText: '35 Officials monitored ___ after the storm.' },
              { number: 36, promptText: '36 Students recorded ___ in field notebooks.' },
            ],
          }],
          diagnostics: [],
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Mocked V3 distant-range coverage fixture' },
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
      expect.objectContaining({ code: 'group-coverage-mismatch' }),
      expect.objectContaining({ code: 'repair-failed' }),
    ]));
    expect(result.candidate.autoImportDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'groq-output-missing-group', questionNumber: 27 }),
      expect.objectContaining({ code: 'groq-output-missing-group', questionNumber: 37 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 27 }),
      expect.objectContaining({ code: 'repair-applied', questionNumber: 37 }),
    ]));

    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues.map((issue) => issue.message)).toEqual([]);
    expect(Object.values(normalized.document.interactions)).toHaveLength(14);
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
