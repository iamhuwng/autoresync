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
    return { labeledOptions: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }] };
  }

  if (
    taskType === 'matching-headings'
    || taskType === 'matching-information'
    || taskType === 'matching-features'
    || taskType === 'matching-sentence-endings'
  ) {
    return { sectionReferences: [{ label: 'i', text: 'Heading i' }, { label: 'ii', text: 'Heading ii' }] };
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
        questions: [{ number: 1, promptText: 'Exact sentence-completion prompt ___.' }],
      }],
    });

    expect(transcript?.groups[0]?.taskType).toBe('sentence-completion');
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
      { label: 'A', text: 'Option A' },
      { label: 'B', text: 'Option B' },
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
      { label: 'i', text: 'Heading i' },
      { label: 'ii', text: 'Heading ii' },
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

  it('rejects paraphrased visible question text', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('sentence-completion', {
        questions: [{ number: 1, promptText: 'Changed sentence prompt ___.' }],
      }),
      passagePackage: packageFor('sentence-completion'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('transcript-source-text-paraphrased');
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

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('transcript-question-missing');
  });

  it('blocks task type conflicts against marker hints', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('multiple-choice'),
      passagePackage: packageFor('sentence-completion'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('transcript-task-type-conflict');
  });

  it('blocks missing option/reference banks', () => {
    const diagnostics = verifyReadingV2AutoQuestionTranscript({
      transcript: transcriptFor('matching-headings', { sectionReferences: undefined }),
      passagePackage: packageFor('matching-headings'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('transcript-reference-bank-missing');
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

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('transcript-blank-mismatch');
  });
});
