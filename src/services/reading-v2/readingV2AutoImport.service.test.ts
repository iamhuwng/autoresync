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
  readonly passageTitle?: string;
} = {}): ReadingV2AutoV4Extractor => ({
  parsePassagesOnly: vi.fn().mockResolvedValue({
    success: true,
    data: {
      passages: [{
        id: 'passage-1',
        title: overrides.passageTitle ?? 'Auto passage',
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
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: rawSourceWithAnswerKey, sourceName: 'Auto V4 fixture' },
      {
        v4Extractor,
        waitBetweenChunksMs: 0,
        minInputChars: 10,
        onDiagnosticEvent: (event, payload) => events.push({ event, payload }),
      },
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
      expect.objectContaining({ code: 'auto-pipeline-lane-selected', severity: 'info' }),
      expect.objectContaining({ code: 'auto-v4-staged-parser-used', severity: 'info' }),
      expect.objectContaining({ code: 'answer-key-extracted', severity: 'info' }),
    ]));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'auto_pipeline_lane_selected',
        payload: expect.objectContaining({ pipelineLane: 'v4-full-doc' }),
      }),
      expect.objectContaining({
        event: 'auto_v4_preflight_complete',
        payload: expect.objectContaining({
          pipelineLane: 'v4-full-doc',
          stageShape: 'full-document',
        }),
      }),
    ]));
    expect(result.candidate.rawText).toContain('"type":"true-false-not-given"');
    expect(result.candidate.rawText).toContain('"answer":"TRUE"');
    expect(result.answerKeyText).toBe('1 TRUE\n2 FALSE');
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    assertValidReadingV2CanonicalDocument(normalized.document);
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('keeps Auto V4 ranged multiple-choice groups and paired multiple-select semantics', async () => {
    const raw = [
      'READING PASSAGE 1',
      'This passage has enough source text for grouped choice import verification.',
      'It keeps a second sentence so guardrails treat it as a real passage.',
      '',
      'Questions 1-4',
      'Choose the correct letter, A, B, C or D.',
      '1 First choice question?',
      'A One',
      'B Two',
      'C Three',
      'D Four',
      '2 Second choice question?',
      'A One',
      'B Two',
      'C Three',
      'D Four',
      '3 Third choice question?',
      'A One',
      'B Two',
      'C Three',
      'D Four',
      '4 Fourth choice question?',
      'A One',
      'B Two',
      'C Three',
      'D Four',
      '',
      'Questions 5 and 6',
      'Choose TWO letters, A-E.',
      'Which TWO options are correct?',
      'A First option',
      'B Second option',
      'C Third option',
      'D Fourth option',
      'E Fifth option',
      '',
      'Answers',
      '1 A',
      '2 B',
      '3 C',
      '4 D',
      '5 B',
      '6 D',
    ].join('\n');
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Grouped choice source',
            content: 'This passage has enough source text for grouped choice import verification.',
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 6,
            wordCount: 12,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [
            ...[1, 2, 3, 4].map((questionNumber) => ({
              questionNumber,
              questionText: `${questionNumber} Choice question ${questionNumber}?`,
              type: 'multiple-choice',
              answer: ['A', 'B', 'C', 'D'][questionNumber - 1],
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Choose the correct letter, A, B, C or D. Write the correct letter in boxes 1-4.',
              labeledOptions: [
                { label: 'A', text: 'One' },
                { label: 'B', text: 'Two' },
                { label: 'C', text: 'Three' },
                { label: 'D', text: 'Four' },
              ],
            })),
            {
              questionNumber: 5,
              questionText: 'Which TWO options are correct?',
              type: 'multiple-select',
              answer: 'B',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Choose TWO letters, A-E. Write the correct letters in boxes 5 and 6.',
              labeledOptions: [
                { label: 'A', text: 'First option' },
                { label: 'B', text: 'Second option' },
                { label: 'C', text: 'Third option' },
                { label: 'D', text: 'Fourth option' },
                { label: 'E', text: 'Fifth option' },
              ],
            },
            {
              questionNumber: 6,
              questionText: '',
              type: 'multiple-select',
              answer: 'D',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Choose TWO letters, A-E. Write the correct letters in boxes 5 and 6.',
            },
          ],
          answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'B', 6: 'D' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 grouped choice fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const groups = Object.values(normalized.document.taskGroups);
    const choiceGroup = groups.find((group) => group.groupTitle === 'Questions 1-4');
    const multiGroup = groups.find((group) => group.groupTitle === 'Questions 5-6');
    const multiInteractions = (multiGroup?.interactionIds ?? []).map((interactionId) => normalized.document.interactions[interactionId]!);

    expect(choiceGroup?.officialTaskType).toBe('multiple-choice');
    expect(choiceGroup?.interactionIds).toHaveLength(4);
    expect(multiGroup?.answerRule.responseShape).toMatchObject({ kind: 'multi-select', selectionLimit: 2 });
    expect(multiInteractions.map((interaction) => interaction.scoringRule.acceptableAnswers)).toEqual([
      ['B', 'D'],
      ['B', 'D'],
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'auto-v4-provider-stage', stage: 'auto-v4-passages' }),
      expect.objectContaining({ code: 'auto-v4-provider-stage', stage: 'auto-v4-questions' }),
    ]));
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('preserves Auto V4 diagram source images from the raw question block', async () => {
    const raw = [
      'READING PASSAGE 1',
      'This passage has enough source text for imported diagram verification.',
      'It keeps a second sentence so guardrails treat it as a real passage.',
      '',
      'Questions 1-2',
      'Label the diagram below.',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '![](https://example.test/source-diagram.png)',
      '![](https://example.test/source-diagram-2.png)',
      '1 first label',
      '2 second label',
      '',
      'Answers',
      '1 wall',
      '2 roof',
    ].join('\n');
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Diagram source',
            content: 'This passage has enough source text for imported diagram verification.',
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 2,
            wordCount: 12,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [
            {
              questionNumber: 1,
              questionText: 'first label',
              type: 'diagram-labeling',
              answer: 'wall',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Label the diagram below. Choose ONE WORD ONLY from the passage for each answer.',
            },
            {
              questionNumber: 2,
              questionText: 'second label',
              type: 'diagram-labeling',
              answer: 'roof',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Label the diagram below. Choose ONE WORD ONLY from the passage for each answer.',
            },
          ],
          answerKey: { 1: 'wall', 2: 'roof' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 diagram image fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const diagramStimuli = Object.values(normalized.document.stimuli).filter((stimulus) =>
      stimulus.content.kind === 'diagram-content',
    );
    const mediaStimuli = Object.values(normalized.document.stimuli).filter((stimulus) =>
      stimulus.content.kind === 'media-content',
    );
    const diagramStimulus = diagramStimuli[0];

    expect(diagramStimulus?.content.kind).toBe('diagram-content');
    if (!diagramStimulus || diagramStimulus.content.kind !== 'diagram-content') return;
    expect(diagramStimuli).toHaveLength(1);
    expect(mediaStimuli).toHaveLength(1);
    expect(diagramStimulus.content.imageUrl).toBe('https://example.test/source-diagram.png');
    expect(mediaStimuli[0]?.content.kind === 'media-content' ? mediaStimuli[0].content.mediaUrl : undefined)
      .toBe('https://example.test/source-diagram-2.png');
    expect(diagramStimulus.content.hotspots.map((hotspot) => hotspot.label)).toEqual(['Question 1', 'Question 2']);
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('uses source-ledger passage titles instead of Auto V4 timing instruction titles', async () => {
    const raw = [
      'READING PASSAGE 1',
      '',
      'You should spend about 20 minutes on Questions 1-2, which are based on Reading Passage 1 below.',
      '',
      '## Real source passage title',
      '',
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
    const v4Extractor = v4ExtractorFor({
      passageTitle: 'You should spend about 20 minutes on Questions 1-2, which are based on Reading Passage 1 below.',
    });

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 title fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const section = normalized.document.sections[normalized.document.sectionIds[0]!]!;
    const stimulus = normalized.document.stimuli[section.stimulusIds[0]!]!;

    expect(stimulus.title).toBe('Real source passage title');
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('copies Auto V4 passage body from raw source when provider passage prose drifts', async () => {
    const raw = [
      'READING PASSAGE 1',
      'The archive opened in 1998 under Alice Morgan.',
      'A second source sentence keeps the passage substantial for Studio import.',
      '',
      'Questions 1-1',
      'Do the following statements agree with the information given in Reading Passage 1?',
      '1 The archive opened in 1998.',
      '',
      'Answers',
      '1 TRUE',
    ].join('\n');
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Archive passage',
            content: 'The archive opened in 1988 under Alice Morgan.',
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 1,
            wordCount: 9,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [{
            questionNumber: 1,
            questionText: 'The archive opened in 1998.',
            type: 'true-false-not-given',
            answer: 'TRUE',
            passageId: 'passage-1',
            confidence: 0.95,
            sectionInstruction: 'Do the following statements agree with the information given in Reading Passage 1?',
          }],
          answerKey: { 1: 'TRUE' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 source drift fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.reviewStatus).toBe('needs_review');
    expect(result.candidate.rawText).toContain('The archive opened in 1998 under Alice Morgan.');
    expect(result.candidate.rawText).not.toContain('The archive opened in 1988 under Alice Morgan.');
    expect(result.sourceArtifact?.rawTextOriginal).toBe(raw);
    expect(result.candidate.importSourceArtifact?.rawTextSha256).toBe(result.sourceArtifact?.rawTextSha256);
    expect(result.groupQualityRecords?.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'auto-v4-source-authoritative-passage', severity: 'info' }),
      expect.objectContaining({ code: 'auto-v4-source-passage-drift', severity: 'warning' }),
    ]));
  });

  it('marks under-represented Auto V4 question groups for teacher review without failing import', async () => {
    const raw = [
      'READING PASSAGE 1',
      'This passage has enough source text for note completion verification.',
      'The second sentence keeps the fixture stable for guardrails.',
      '',
      'Questions 1-2',
      'Complete the notes below.',
      'Safety notes',
      '1 Use ___ in the workshop.',
      '2 Keep ___ away from heat.',
      '',
      'Answers',
      '1 gloves',
      '2 solvent',
    ].join('\n');
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Safety passage',
            content: 'This passage has enough source text for note completion verification.',
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 2,
            wordCount: 10,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [
            {
              questionNumber: 1,
              questionText: 'Use ___ in the workshop.',
              type: 'note-completion',
              answer: 'gloves',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Complete the notes below.',
            },
            {
              questionNumber: 2,
              questionText: 'Keep ___ away from heat.',
              type: 'note-completion',
              answer: 'solvent',
              passageId: 'passage-1',
              confidence: 0.95,
              sectionInstruction: 'Complete the notes below.',
            },
          ],
          answerKey: { 1: 'gloves', 2: 'solvent' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 group verifier fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.reviewStatus).toBe('needs_review');
    expect(result.groupQualityRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        questionRange: { start: 1, end: 2 },
        status: 'weak',
        reasonCodes: expect.arrayContaining(['group-source-underrepresented', 'note-heading-missing']),
        recommendedAction: 'teacher-groq-repair',
      }),
    ]));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'group-source-underrepresented', severity: 'warning' }),
      expect.objectContaining({ code: 'note-heading-missing', severity: 'warning' }),
    ]));
  });

  it('does not mark source-equivalent mojibake punctuation as group under-representation', async () => {
    const mojibakeApostrophe = '\u00e2\u20ac\u2122';
    const raw = [
      'READING PASSAGE 1',
      `Scientists${mojibakeApostrophe} theories about microbes changed after the archive study.`,
      '',
      'Questions 1-1',
      'Choose the correct letter, A, B, C or D.',
      '1 What did the archive study compare?',
      `A comparing scientists${mojibakeApostrophe} theories about microbes`,
      'B comparing rainfall totals',
      'C mapping old buildings',
      'D checking classroom results',
      '',
      'Answers',
      '1 A',
    ].join('\n');
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Archive passage',
            content: "Scientists' theories about microbes changed after the archive study.",
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 1,
            wordCount: 9,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [{
            questionNumber: 1,
            questionText: 'What did the archive study compare?',
            type: 'multiple-choice',
            answer: 'A',
            passageId: 'passage-1',
            confidence: 0.95,
            sectionInstruction: 'Choose the correct letter, A, B, C or D.',
            options: [
              "A comparing scientists' theories about microbes",
              'B comparing rainfall totals',
              'C mapping old buildings',
              'D checking classroom results',
            ],
          }],
          answerKey: { 1: 'A' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 mojibake equivalent fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.groupQualityRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        questionRange: { start: 1, end: 1 },
        status: 'ready',
        reasonCodes: ['group-quality-ready'],
      }),
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'group-source-underrepresented' }),
      expect.objectContaining({ code: 'question-text-changed' }),
    ]));
  });

  it('keeps the raw source artifact when Auto V4 blocks before provider calls', async () => {
    const raw = [
      'READING PASSAGE 1',
      'Short source still needs draft-scoped artifact retention.',
      'Questions 1-1',
      '1 Short question.',
      'Answers',
      '1 TRUE',
    ].join('\n');
    const v4Extractor = v4ExtractorFor();

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 failed source artifact fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 500 },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(v4Extractor.parsePassagesOnly).not.toHaveBeenCalled();
    expect(result.sourceArtifact?.rawTextOriginal).toBe(raw);
    expect(result.sourceArtifact?.lineIndex.map((line) => line.lineId)).toContain('line-0001');
    expect(result.sourceArtifact?.retention).toMatchObject({
      scope: 'draft-author-only',
      includeInStudentProjection: false,
      includeInSessionProjection: false,
      includeInPublicPayload: false,
    });
  });

  it('reconstructs Auto V4 summary-completion-text as one source summary layout', async () => {
    const fixture = buildSharedInlineSummaryFixture();
    const summaryQuestions = Array.from({ length: 5 }, (_, index) => {
      const questionNumber = 14 + index;
      return {
        questionNumber,
        questionText: fixture.sharedSummaryLine,
        type: 'summary-completion-text',
        answer: '',
        passageId: 'passage-2',
        confidence: 0.95,
        sectionInstruction: 'Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.',
      };
    });
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-2',
            title: 'Summary source passage',
            content: 'Synthetic passage body has enough source text for the Auto V4 summary layout test.',
            type: 'text',
            imageUrl: null,
            questionStart: 14,
            questionEnd: 18,
            wordCount: 14,
          }],
          confidence: 0.95,
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: summaryQuestions,
          answerKey: {
            14: 'type',
            15: 'change',
            16: 'openness',
            17: 'situations',
            18: 'empathy',
          },
          confidence: 0.95,
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: fixture.raw, sourceName: 'Auto V4 summary fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const taskGroup = Object.values(normalized.document.taskGroups).find(
      (candidate) => candidate.officialTaskType === 'summary-completion-text',
    )!;
    const layout = JSON.parse(taskGroup.layoutHint ?? '{}') as { kind?: string; segments?: readonly string[] };

    expect(layout.kind).toBe('summary-text');
    expect(layout.segments).toHaveLength(6);
    expect(layout.segments?.join(' ')).toContain('Psychologists have traditionally believed');
    expect(validateReadingV2Draft(normalized.document).blockingIssues).toEqual([]);
  });

  it('reconstructs Auto V4 summary-completion-list blanks from mojibake source ellipses', async () => {
    const mojibakeEllipsis = '\u00e2\u20ac\u00a6';
    const blank = mojibakeEllipsis.repeat(6);
    const sharedSummaryLine = [
      `There were ${blank} trends in the data.`,
      `Students found the order ${blank} to recall.`,
      `They read ${blank} words to save time.`,
    ].join(' ');
    const raw = [
      'READING PASSAGE 1',
      'This passage has enough source text for summary list import verification.',
      'It keeps a second sentence so guardrails treat it as a real passage.',
      '',
      'Questions 1-3',
      'Complete the summary using the list of words, A-D, below.',
      sharedSummaryLine
        .replace(blank, `**1** ${blank}`)
        .replace(blank, `**2** ${blank}`)
        .replace(blank, `**3** ${blank}`),
      'A fast B hard C worrying D isolated',
      '',
      'Answers',
      '1 C',
      '2 B',
      '3 A',
    ].join('\n');
    const labeledOptions = [
      { label: 'A', text: 'fast' },
      { label: 'B', text: 'hard' },
      { label: 'C', text: 'worrying' },
      { label: 'D', text: 'isolated' },
    ];
    const v4Extractor: ReadingV2AutoV4Extractor = {
      parsePassagesOnly: vi.fn().mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'passage-1',
            title: 'Summary list source',
            content: 'This passage has enough source text for summary list import verification.',
            type: 'text',
            imageUrl: null,
            questionStart: 1,
            questionEnd: 3,
            wordCount: 12,
          }],
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
      parseQuestionsAndAnswers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          questions: [1, 2, 3].map((questionNumber) => ({
            questionNumber,
            questionText: sharedSummaryLine,
            type: 'summary-completion-list',
            answer: ['C', 'B', 'A'][questionNumber - 1],
            passageId: 'passage-1',
            confidence: 0.95,
            sectionInstruction: 'Complete the summary using the list of words, A-D, below.',
            labeledOptions,
          })),
          answerKey: { 1: 'C', 2: 'B', 3: 'A' },
          confidence: 0.95,
          provider: 'gemini',
        },
      }),
    };

    const result = await generateReadingV2AutoImportCandidate(
      { rawTestText: raw, sourceName: 'Auto V4 summary list fixture' },
      { v4Extractor, waitBetweenChunksMs: 0, minInputChars: 10 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    const taskGroup = Object.values(normalized.document.taskGroups).find(
      (candidate) => candidate.officialTaskType === 'summary-completion-list',
    )!;
    const prompts = taskGroup.interactionIds.map((interactionId) =>
      normalized.document.interactions[interactionId]?.promptText,
    );

    expect(JSON.parse(taskGroup.layoutHint ?? '{}')).toMatchObject({ kind: 'summary-list' });
    expect(prompts).toEqual([
      expect.stringContaining('___'),
      expect.stringContaining('___'),
      expect.stringContaining('___'),
    ]);
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


});
