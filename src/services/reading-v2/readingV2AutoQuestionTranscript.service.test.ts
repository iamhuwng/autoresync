import { describe, expect, it } from 'vitest';
import { READING_V2_CANONICAL_TASK_TYPES, type ReadingV2CanonicalTaskType } from '../../types/readingV2Taxonomy';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  buildReadingV2AutoMaterialFromTranscript,
  normalizeReadingV2AutoQuestionTranscript,
  verifyReadingV2AutoQuestionTranscript,
  type ReadingV2AutoQuestionTranscript,
} from './readingV2AutoQuestionTranscript.service';

const packageFor = (
  taskType: ReadingV2CanonicalTaskType,
  questionAreaExtra = '',
): ReadingV2AutoPassagePackage => ({
  passageNumber: 1,
  passageTitle: 'Synthetic passage',
  expectedQuestionRange: { start: 1, end: 1 },
  passageBodyLines: [{ lineNumber: 1, text: 'READING PASSAGE 1 body text.', trimmedTextHash: 'body' }],
  questionAreaLines: [],
  referenceBankLines: [],
  passageBodyText: 'READING PASSAGE 1\nSynthetic passage body stays local.',
  questionAreaText: [
    'Questions 1-1',
    'Complete the task.',
    'A Option A',
    'B Option B',
    'i Heading i',
    'ii Heading ii',
    `1 Exact ${taskType} prompt ___.`,
    questionAreaExtra,
  ].join('\n'),
  groupHints: [{
    questionRange: { start: 1, end: 1 },
    lines: { startLine: 2, endLine: 8 },
    taskTypeHint: taskType,
  }],
  referenceBankLineSpans: [],
  excludedLineSpans: [],
  answerKeyRows: [{ questionNumber: 1, answer: 'answer1', sourceLine: 10 }],
  sourceHash: 'src_hash',
  groqInputText: 'QUESTION_AREA_LINES_ONLY',
  diagnostics: [],
});

const bankFor = (taskType: ReadingV2CanonicalTaskType) => {
  if (taskType === 'multiple-choice' || taskType === 'multiple-select' || taskType === 'summary-completion-list') {
    return {
      labeledOptions: [
        { label: 'A', sourceTextExact: 'A Option A', normalizedText: 'Option A', text: 'Option A' },
        { label: 'B', sourceTextExact: 'B Option B', normalizedText: 'Option B', text: 'Option B' },
      ],
    };
  }

  if (
    taskType === 'matching-headings'
    || taskType === 'matching-information'
    || taskType === 'matching-features'
    || taskType === 'matching-sentence-endings'
  ) {
    return {
      sectionReferences: [
        { label: 'i', sourceTextExact: 'i Heading i', normalizedText: 'Heading i', text: 'Heading i' },
        { label: 'ii', sourceTextExact: 'ii Heading ii', normalizedText: 'Heading ii', text: 'Heading ii' },
      ],
    };
  }

  return {};
};

const transcriptFor = (
  taskType: ReadingV2CanonicalTaskType,
  overrides: Partial<ReadingV2AutoQuestionTranscript['groups'][number]> = {},
): ReadingV2AutoQuestionTranscript => ({
  passageNumber: 1,
  groups: [{
    questionRange: { start: 1, end: 1 },
    taskType,
    sourceInstructionText: 'Complete the task.',
    instructionMeta: taskType === 'multiple-select'
      ? { selectionLimit: 2 }
      : {},
    ...bankFor(taskType),
    questions: [{
      number: 1,
      sourceTextExact: `1 Exact ${taskType} prompt ___.`,
      normalizedPromptText: `Exact ${taskType} prompt ___.`,
      promptText: `Exact ${taskType} prompt ___.`,
    }],
    ...overrides,
  }],
  diagnostics: [],
});

describe('readingV2AutoQuestionTranscript.service', () => {
  it('normalizes and assembles strict transcripts for every Reading V2 task family', () => {
    READING_V2_CANONICAL_TASK_TYPES.forEach((taskType) => {
      const transcript = transcriptFor(taskType);
      const diagnostics = verifyReadingV2AutoQuestionTranscript({
        transcript,
        passagePackage: packageFor(taskType),
      });
      const material = buildReadingV2AutoMaterialFromTranscript({
        transcript,
        passagePackage: packageFor(taskType),
      });

      expect(diagnostics).toEqual([]);
      expect(material.sectionInstructions[0]?.taskType).toBe(taskType);
      expect(material.questions[0]?.type).toBe(taskType);
      expect(material.passages[0]?.content).toContain('Synthetic passage body stays local.');
    });
  });

  it('parses provider JSON into a strict transcript shape', () => {
    const transcript = normalizeReadingV2AutoQuestionTranscript({
      passageNumber: 1,
      groups: [{
        questionRange: [1, 1],
        taskType: 'sentence-completion',
        instructionMeta: { wordLimit: 1 },
        questions: [{
          number: 1,
          sourceTextExact: '**1** Exact sentence-completion prompt ___.',
          normalizedPromptText: 'Exact sentence-completion prompt ___.',
          promptText: 'Exact sentence-completion prompt ___.',
        }],
      }],
      coverageSummary: {
        coveredGroups: ['1-1'],
        coveredQuestions: [1],
      },
    });

    expect(transcript?.groups[0]?.taskType).toBe('sentence-completion');
    expect(transcript?.groups[0]?.questions[0]?.sourceTextExact).toContain('Exact sentence-completion prompt');
    expect(transcript?.coverageSummary?.coveredGroups).toEqual(['1-1']);
  });

  it('accepts option-bank aliases without dropping empty primary arrays', () => {
    const transcript = normalizeReadingV2AutoQuestionTranscript({
      passageNumber: 1,
      groups: [{
        questionRange: [1, 1],
        taskType: 'multiple-choice',
        sourceInstructionText: 'Complete the task.',
        instructionMeta: {},
        labeledOptions: [],
        optionBank: {
          options: [
            { label: 'A', text: 'Option A' },
            { label: 'B', text: 'Option B' },
          ],
        },
        questions: [{
          number: 1,
          promptText: 'Exact multiple-choice prompt ___.',
        }],
      }],
    });

    expect(transcript).not.toBeNull();
    if (!transcript) return;
    expect(transcript.groups[0]?.labeledOptions).toEqual([
      expect.objectContaining({ label: 'A', text: 'Option A' }),
      expect.objectContaining({ label: 'B', text: 'Option B' }),
    ]);

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage: packageFor('multiple-choice'),
    });

    expect(diagnostics).toEqual([]);
  });

  it('accepts reference-bank aliases without dropping empty primary arrays', () => {
    const transcript = normalizeReadingV2AutoQuestionTranscript({
      passageNumber: 1,
      groups: [{
        questionRange: [1, 1],
        taskType: 'matching-headings',
        sourceInstructionText: 'Complete the task.',
        instructionMeta: {},
        sectionReferences: [],
        referenceBank: {
          references: [
            { label: 'i', text: 'Heading i' },
            { label: 'ii', text: 'Heading ii' },
          ],
        },
        questions: [{
          number: 1,
          promptText: 'Exact matching-headings prompt ___.',
        }],
      }],
    });

    expect(transcript).not.toBeNull();
    if (!transcript) return;
    expect(transcript.groups[0]?.sectionReferences).toEqual([
      expect.objectContaining({ label: 'i', text: 'Heading i' }),
      expect.objectContaining({ label: 'ii', text: 'Heading ii' }),
    ]);

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage: packageFor('matching-headings'),
    });

    expect(diagnostics).toEqual([]);
  });

  it('accepts reference-bank text sourced from passage lines outside the question area', () => {
    const passagePackage = {
      ...packageFor('matching-headings'),
      questionAreaText: [
        'Questions 1-1',
        'Complete the task.',
        '1 Exact matching-headings prompt ___.',
      ].join('\n'),
      referenceBankLines: [
        { lineNumber: 10, text: 'i Heading i', trimmedTextHash: 'i' },
        { lineNumber: 11, text: 'ii Heading ii', trimmedTextHash: 'ii' },
      ],
    };
    const transcript = transcriptFor('matching-headings', {
      sectionReferences: [
        { label: 'i', text: 'Heading i', sourceLines: [10] },
        { label: 'ii', text: 'Heading ii', sourceLines: [11] },
      ],
    });

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage,
    });

    expect(diagnostics).toEqual([]);
  });

  it('accepts referenceBankLines aliases for matching-features groups', () => {
    const transcript = normalizeReadingV2AutoQuestionTranscript({
      passageNumber: 1,
      groups: [{
        questionRange: [1, 1],
        taskType: 'matching-features',
        sourceInstructionText: 'Look at the following statements and the list of people below. Match each statement with the correct person, A-B.',
        instructionMeta: {
          optionLabelRange: 'A-B',
          referenceLabelRange: 'A-B',
        },
        sectionReferences: [],
        referenceBankLines: [
          {
            label: 'A',
            sourceTextExact: '**A** Christopher Peterson',
            normalizedText: 'Christopher Peterson',
            text: 'Christopher Peterson',
            sourceLines: [10],
          },
          {
            label: 'B',
            sourceTextExact: '**B** David Fajgenbaum',
            normalizedText: 'David Fajgenbaum',
            text: 'David Fajgenbaum',
            sourceLines: [11],
          },
        ],
        questions: [{
          number: 1,
          sourceTextExact: '**1** Exact matching-features prompt ___.',
          normalizedPromptText: 'Exact matching-features prompt ___.',
          promptText: 'Exact matching-features prompt ___.',
        }],
      }],
    });

    expect(transcript).not.toBeNull();
    if (!transcript) return;
    expect(transcript.groups[0]?.sectionReferences).toEqual([
      expect.objectContaining({ label: 'A', text: 'Christopher Peterson' }),
      expect.objectContaining({ label: 'B', text: 'David Fajgenbaum' }),
    ]);

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage: {
        ...packageFor('matching-features'),
        questionAreaText: [
          'Questions 1-1',
          'Look at the following statements and the list of people below. Match each statement with the correct person, A-B.',
          '**1** Exact matching-features prompt ___.',
        ].join('\n'),
        referenceBankLines: [
          { lineNumber: 10, text: '**A** Christopher Peterson', trimmedTextHash: 'bank-a' },
          { lineNumber: 11, text: '**B** David Fajgenbaum', trimmedTextHash: 'bank-b' },
        ],
      },
    });

    expect(diagnostics).toEqual([]);
  });

  it('accepts generic paragraph aliases when the source proves the label range', () => {
    const passagePackage = {
      ...packageFor('matching-information'),
      questionAreaText: [
        'Questions 1-1',
        'Reading Passage 2 has six paragraphs, A-F.',
        'Which paragraph contains the following information?',
        'Complete the task.',
        '1 Exact matching-information prompt ___.',
      ].join('\n'),
    };
    const transcript = transcriptFor('matching-information', {
      sectionReferences: [
        { label: 'A', sourceTextExact: 'A', normalizedText: 'Paragraph A', text: 'Paragraph A' },
        { label: 'B', sourceTextExact: 'B', normalizedText: 'Paragraph B', text: 'Paragraph B' },
        { label: 'C', sourceTextExact: 'C', normalizedText: 'Paragraph C', text: 'Paragraph C' },
        { label: 'D', sourceTextExact: 'D', normalizedText: 'Paragraph D', text: 'Paragraph D' },
        { label: 'E', sourceTextExact: 'E', normalizedText: 'Paragraph E', text: 'Paragraph E' },
        { label: 'F', sourceTextExact: 'F', normalizedText: 'Paragraph F', text: 'Paragraph F' },
      ],
    });

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage,
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('normalized-text-source-drift');
  });

  it('accepts matching-information reference ranges without explicit section references', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('matching-information', {
        instructionMeta: { referenceLabelRange: 'A-F' },
        sectionReferences: undefined,
      }),
      passagePackage: {
        ...packageFor('matching-information'),
        questionAreaText: [
          'Questions 1-1',
          'Reading Passage 2 has six paragraphs, A-F.',
          'Complete the task.',
          '1 Exact matching-information prompt ___.',
        ].join('\n'),
      },
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('missing-reference-bank');
  });

  it('normalizes matching-information option label ranges into reference ranges for passage-section groups', () => {
    const transcript = normalizeReadingV2AutoQuestionTranscript({
      passageNumber: 1,
      groups: [{
        questionRange: [1, 1],
        taskType: 'matching-information',
        sourceInstructionText: 'Reading Passage 2 has eight sections, A-H. Which section contains the following information?',
        instructionMeta: {
          optionLabelRange: 'A-H',
        },
        questions: [{
          number: 1,
          sourceTextExact: '**1** Exact matching-information prompt ___.',
          normalizedPromptText: 'Exact matching-information prompt ___.',
          promptText: 'Exact matching-information prompt ___.',
        }],
      }],
      coverageSummary: {
        coveredGroups: ['1-1'],
        coveredQuestions: [1],
      },
    });

    expect(transcript).not.toBeNull();
    if (!transcript) return;
    expect(transcript.groups[0]?.instructionMeta.referenceLabelRange).toBe('A-H');

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage: {
        ...packageFor('matching-information'),
        questionAreaText: [
          'Questions 1-1',
          'Reading Passage 2 has eight sections, A-H.',
          'Which section contains the following information?',
          '1 Exact matching-information prompt ___.',
        ].join('\n'),
      },
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('missing-reference-bank');
  });

  it('accepts mojibake quote drift in sentence-ending reference banks via bounded source proof', () => {
    const passagePackage = {
      ...packageFor('matching-sentence-endings'),
      referenceBankLines: [
        {
          lineNumber: 10,
          text: '**G** Dolloâ€™s findings and the convictions held by Lombroso.',
          trimmedTextHash: 'ref-g',
        },
      ],
    };
    const transcript = transcriptFor('matching-sentence-endings', {
      sectionReferences: [
        {
          label: 'G',
          sourceTextExact: '**G** Dollo’s findings and the convictions held by Lombroso.',
          text: 'Dollo’s findings and the convictions held by Lombroso.',
          sourceLines: [10],
        },
      ],
    });

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage,
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('source-text-exact-missing');
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('source-proof-format-mismatch');
  });

  it.each([
    {
      taskType: 'true-false-not-given' as const,
      sourceInstructionText: [
        'Do the following statements agree with the information given in Reading Passage 1?',
        'TRUE if the statement is true',
        'FALSE if the statement is false',
        'NOT GIVEN if the information is not given',
      ].join(' '),
      sourceQuestionLines: [
        '1 Synthetic statement one.',
        '2 Synthetic statement two.',
      ],
      providerOptions: [
        { label: 'TRUE', sourceTextExact: '**TRUE**', normalizedText: 'TRUE', text: 'TRUE' },
        { label: 'FALSE', sourceTextExact: '**FALSE**', normalizedText: 'FALSE', text: 'FALSE' },
        { label: 'NOT GIVEN', sourceTextExact: '**NOT GIVEN**', normalizedText: 'NOT GIVEN', text: 'NOT GIVEN' },
      ],
    },
    {
      taskType: 'yes-no-not-given' as const,
      sourceInstructionText: [
        'Do the following statements agree with the claims of the writer in Reading Passage 1?',
        'YES if the statement agrees with the claims of the writer',
        'NO if the statement contradicts the claims of the writer',
        'NOT GIVEN if it is impossible to say what the writer thinks about this',
      ].join(' '),
      sourceQuestionLines: [
        '1 Synthetic claim one.',
        '2 Synthetic claim two.',
      ],
      providerOptions: [
        { label: 'YES', sourceTextExact: '**YES**', normalizedText: 'YES', text: 'YES' },
        { label: 'NO', sourceTextExact: '**NO**', normalizedText: 'NO', text: 'NO' },
        { label: 'NOT GIVEN', sourceTextExact: '**NOT GIVEN**', normalizedText: 'NOT GIVEN', text: 'NOT GIVEN' },
      ],
    },
  ])('ignores stray provider option arrays for $taskType source proof', ({ taskType, sourceInstructionText, sourceQuestionLines, providerOptions }) => {
    const transcript: ReadingV2AutoQuestionTranscript = {
      passageNumber: 1,
      groups: [{
        questionRange: { start: 1, end: 2 },
        taskType,
        sourceInstructionText,
        instructionMeta: {},
        labeledOptions: providerOptions,
        questions: sourceQuestionLines.map((line, index) => ({
          number: index + 1,
          sourceTextExact: line,
          normalizedPromptText: line.replace(/^\d+\s+/, ''),
          promptText: line.replace(/^\d+\s+/, ''),
        })),
      }],
      diagnostics: [],
    };

    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript,
      passagePackage: {
        ...packageFor(taskType),
        expectedQuestionRange: { start: 1, end: 2 },
        questionAreaText: [
          'Questions 1-2',
          sourceInstructionText,
          ...sourceQuestionLines,
        ].join('\n'),
        groupHints: [{
          questionRange: { start: 1, end: 2 },
          lines: { startLine: 2, endLine: 7 },
          taskTypeHint: taskType,
        }],
        answerKeyRows: [
          { questionNumber: 1, answer: 'answer1', sourceLine: 10 },
          { questionNumber: 2, answer: 'answer2', sourceLine: 11 },
        ],
      },
    });

    expect(diagnostics).toEqual([]);
  });

  it('rejects paraphrased visible question text', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('sentence-completion', {
        questions: [{
          number: 1,
          sourceTextExact: '1 Exact sentence-completion prompt ___.',
          normalizedPromptText: 'Changed sentence prompt ___.',
          promptText: 'Changed sentence prompt ___.',
        }],
      }),
      passagePackage: packageFor('sentence-completion'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('normalized-text-source-drift');
  });

  it('proves IELTS markdown blanks after stripping printed question numbers and emphasis marks', () => {
    const passagePackage = {
      ...packageFor('note-completion'),
      questionAreaText: [
        '### Questions 1-2',
        '*Complete the notes below.*',
        '*Choose **ONE WORD ONLY** from the passage for each answer.*',
        '### The life and work of Georgia O’Keeffe',
        '- studied art, then worked as a **1** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ in various places in the USA',
        '- created drawings using **2** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ which were exhibited in New York City',
      ].join('\n'),
      expectedQuestionRange: { start: 1, end: 2 },
      groupHints: [{
        questionRange: { start: 1, end: 2 },
        lines: { startLine: 1, endLine: 6 },
        taskTypeHint: 'note-completion',
      }],
    };
    const transcript = transcriptFor('note-completion', {
      questionRange: { start: 1, end: 2 },
      sourceInstructionText: 'Complete the notes below.* Choose **ONE WORD ONLY** from the passage for each answer',
      questions: [
        {
          number: 1,
          sourceTextExact: '- studied art, then worked as a **1** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ in various places in the USA',
          normalizedPromptText: 'studied art, then worked as a ___________ in various places in the USA',
          promptText: 'studied art, then worked as a ___________ in various places in the USA',
        },
        {
          number: 2,
          sourceTextExact: '- created drawings using **2** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ which were exhibited in New York City',
          normalizedPromptText: 'created drawings using ___________ which were exhibited in New York City',
          promptText: 'created drawings using ___________ which were exhibited in New York City',
        },
      ],
      note: {
        sections: [{
          heading: 'The life and work of Georgia O’Keeffe',
          lines: [
            {
              questionNumber: 1,
              sourceTextExact: '- studied art, then worked as a **1** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ in various places in the USA',
              normalizedText: 'studied art, then worked as a ___________ in various places in the USA',
              text: 'studied art, then worked as a ___________ in various places in the USA',
            },
            {
              questionNumber: 2,
              sourceTextExact: '- created drawings using **2** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ which were exhibited in New York City',
              normalizedText: 'created drawings using ___________ which were exhibited in New York City',
              text: 'created drawings using ___________ which were exhibited in New York City',
            },
          ],
        }],
      },
    });

    const diagnostics = verifyReadingV2AutoQuestionTranscript({ transcript, passagePackage });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('source-text-exact-missing');
    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('normalized-text-source-drift');
  });

  it('rejects missing expected questions', () => {
    const passagePackage = {
      ...packageFor('sentence-completion'),
      expectedQuestionRange: { start: 1, end: 2 },
      questionAreaText: `${packageFor('sentence-completion').questionAreaText}\n2 Exact sentence-completion prompt 2 ___.`,
    };
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('sentence-completion'),
      passagePackage,
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('group-coverage-mismatch');
  });

  it('blocks task type conflicts against marker hints', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('multiple-choice'),
      passagePackage: packageFor('sentence-completion'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('task-type-conflict');
  });

  it('blocks missing option/reference banks', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('matching-headings', { sectionReferences: undefined }),
      passagePackage: packageFor('matching-headings'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-reference-bank');
  });

  it('blocks blank-count mismatches', () => {
    const passagePackage = {
      ...packageFor('sentence-completion', '2 Exact sentence-completion second prompt ___.'),
      expectedQuestionRange: { start: 1, end: 2 },
      groupHints: [{
        questionRange: { start: 1, end: 2 },
        lines: { startLine: 2, endLine: 9 },
        taskTypeHint: 'sentence-completion',
      }],
    };
    const transcript = transcriptFor('sentence-completion', {
      questionRange: { start: 1, end: 2 },
      questions: [
        { number: 1, promptText: 'Exact sentence-completion prompt ___.' },
        { number: 2, promptText: 'Exact sentence-completion second prompt ___ ___.' },
      ],
    });
    const diagnostics = verifyReadingV2AutoQuestionTranscript({ transcript, passagePackage });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('blank-mismatch');
  });
});
