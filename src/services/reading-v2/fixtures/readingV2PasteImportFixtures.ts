import type { ReadingV2CanonicalTaskType } from '../../../types/readingV2Taxonomy';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from '../readingV2ExternalAiPrompt.service';
import { getReadingV2InstructionText } from '../readingV2InstructionTemplates.service';

export interface ReadingV2PasteImportFixture {
  readonly name: string;
  readonly rawText: string;
  readonly answerKeyText: string;
  readonly expectedTaskTypes: readonly ReadingV2CanonicalTaskType[];
  readonly expectedQuestionCount: number;
}

export interface ReadingV2InvalidPasteImportFixture extends ReadingV2PasteImportFixture {
  readonly expectedBlockingMessage: string;
}

type StructuredMaterial = {
  readonly passageNumber: number;
  readonly title: string;
  readonly passages: readonly {
    readonly title: string;
    readonly content: string;
  }[];
  readonly sectionInstructions: readonly Record<string, unknown>[];
  readonly questions: readonly Record<string, unknown>[];
};

const optionLabelsFor = (taskType: ReadingV2CanonicalTaskType): readonly string[] => {
  if (taskType === 'matching-headings') {
    return ['i', 'ii', 'iii', 'iv'];
  }

  if (taskType === 'matching-sentence-endings') {
    return ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  }

  if (
    taskType === 'summary-completion-list'
    || taskType === 'matching-information'
    || taskType === 'matching-features'
    || taskType === 'multiple-choice'
    || taskType === 'multiple-select'
  ) {
    return ['A', 'B', 'C', 'D'];
  }

  return [];
};

const optionTextFor = (taskType: ReadingV2CanonicalTaskType, label: string): string => {
  if (taskType === 'matching-headings') {
    return `Heading ${label}`;
  }

  if (taskType === 'matching-information') {
    return `Paragraph ${label}`;
  }

  if (taskType === 'matching-features') {
    return `Feature ${label}`;
  }

  if (taskType === 'matching-sentence-endings') {
    return `Ending ${label}`;
  }

  return `Option ${label}`;
};

const sectionReferencesFor = (taskType: ReadingV2CanonicalTaskType): readonly Record<string, string>[] =>
  optionLabelsFor(taskType).map((label) => ({
    label,
    text: optionTextFor(taskType, label),
  }));

const labelRangeFromItems = (items: readonly { readonly label?: string }[]): string | undefined => {
  if (items.length === 0) {
    return undefined;
  }

  return items.length === 1 ? items[0]?.label : `${items[0]?.label}-${items[items.length - 1]?.label}`;
};

const cycleValue = (values: readonly string[], index: number): string =>
  values[index % values.length] ?? values[0] ?? '';

const answerRowForQuestion = (
  taskType: ReadingV2CanonicalTaskType,
  questionNumber: number,
  offset: number,
): string => {
  if (taskType === 'true-false-not-given') {
    return `${questionNumber} ${cycleValue(['TRUE', 'FALSE', 'NOT GIVEN'], offset)}`;
  }

  if (taskType === 'yes-no-not-given') {
    return `${questionNumber} ${cycleValue(['YES', 'NO', 'NOT GIVEN'], offset)}`;
  }

  if (taskType === 'matching-headings') {
    return `${questionNumber} ${cycleValue(['i', 'ii', 'iii', 'iv'], offset)}`;
  }

  if (
    taskType === 'summary-completion-list'
    || taskType === 'matching-information'
    || taskType === 'matching-features'
    || taskType === 'matching-sentence-endings'
    || taskType === 'multiple-choice'
  ) {
    return `${questionNumber} ${cycleValue(['A', 'B', 'C', 'D'], offset)}`;
  }

  if (taskType === 'multiple-select') {
    return `${questionNumber} ${offset % 2 === 0 ? 'A | B' : 'B | C'}`;
  }

  return `${questionNumber} answer${questionNumber}`;
};

const answerRowsFor = (taskType: ReadingV2CanonicalTaskType, start = 1, end = start + 1): readonly string[] =>
  Array.from({ length: end - start + 1 }, (_, offset) => answerRowForQuestion(taskType, start + offset, offset));

const promptFor = (taskType: ReadingV2CanonicalTaskType, questionNumber: number): string => {
  if (taskType === 'summary-completion-text') {
    return `Imported summary text blank ${questionNumber} _____.`;
  }

  if (taskType === 'summary-completion-list') {
    return `Imported summary list blank ${questionNumber} _____.`;
  }

  if (taskType === 'note-completion') {
    return `Imported note bullet ${questionNumber} _____.`;
  }

  if (taskType === 'short-answer') {
    return `Imported short-answer question ${questionNumber}?`;
  }

  if (taskType === 'matching-headings') {
    return questionNumber % 2 === 1 ? 'Paragraph A' : 'Paragraph B';
  }

  if (taskType === 'matching-information') {
    return `Imported information statement ${questionNumber}.`;
  }

  if (taskType === 'matching-features') {
    return `Imported feature statement ${questionNumber}.`;
  }

  if (taskType === 'matching-sentence-endings') {
    return `Imported sentence start ${questionNumber} ___`;
  }

  if (taskType === 'multiple-choice' || taskType === 'multiple-select') {
    return `Imported ${taskType} question ${questionNumber}.`;
  }

  if (taskType === 'true-false-not-given' || taskType === 'yes-no-not-given') {
    return `Imported judgement statement ${questionNumber}.`;
  }

  if (taskType === 'table-completion') {
    return `Imported table blank ${questionNumber}.`;
  }

  if (taskType === 'flowchart-completion') {
    return `Imported flowchart blank ${questionNumber}.`;
  }

  if (taskType === 'diagram-labeling') {
    return `Imported diagram label ${questionNumber}.`;
  }

  return `Imported completion sentence ${questionNumber} _____.`;
};

const instructionFor = (
  taskType: ReadingV2CanonicalTaskType,
  start: number,
  end: number,
  passageNumber = 1,
): Record<string, unknown> => {
  const references = sectionReferencesFor(taskType);
  const base = {
    id: `p${passageNumber}-q${start}-${end}`,
    taskType,
    questionRange: { start, end },
    sourceInstructionEvidence: getReadingV2InstructionText(taskType, {
      questionRange: { start, end },
      passageNumber,
      wordLimit: 1,
      selectionLimit: taskType === 'multiple-select' ? 2 : undefined,
      optionLabelRange: labelRangeFromItems(references),
      referenceLabelRange: labelRangeFromItems(references),
    }),
    wordLimit: taskType === 'sentence-completion'
      || taskType === 'summary-completion-text'
      || taskType === 'note-completion'
      || taskType === 'short-answer'
      || taskType === 'table-completion'
      || taskType === 'flowchart-completion'
      || taskType === 'diagram-labeling'
      ? 1
      : undefined,
    selectionLimit: taskType === 'multiple-select' ? 2 : undefined,
    optionLabelRange: taskType === 'multiple-choice'
      || taskType === 'multiple-select'
      || taskType === 'summary-completion-list'
      ? labelRangeFromItems(references)
      : undefined,
    referenceLabelRange: taskType === 'matching-headings'
      || taskType === 'matching-information'
      || taskType === 'matching-features'
      || taskType === 'matching-sentence-endings'
      ? labelRangeFromItems(references)
      : undefined,
  };

  if (taskType === 'table-completion') {
    return {
      ...base,
      table: {
        rows: [
          [
            { text: 'Feature', role: 'header' },
            { text: 'Detail', role: 'header' },
          ],
          ...Array.from({ length: end - start + 1 }, (_, offset) => {
            const questionNumber = start + offset;

            return [
              { text: `Imported table row ${questionNumber}` },
              { text: `Imported table blank ${questionNumber} _____.`, questionNumber },
            ];
          }),
        ],
      },
    };
  }

  if (taskType === 'flowchart-completion') {
    return {
      ...base,
      flowchart: {
        steps: Array.from({ length: end - start + 1 }, (_, offset) => {
          const questionNumber = start + offset;
          const nextQuestionNumber = questionNumber + 1;

          return {
            stepId: `step-${questionNumber}`,
            text: `Imported flow step ${questionNumber} _____.`,
            questionNumber,
            ...(questionNumber < end ? { nextStepIds: [`step-${nextQuestionNumber}`] } : {}),
          };
        }),
      },
    };
  }

  if (taskType === 'diagram-labeling') {
    return {
      ...base,
      diagram: {
        imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160"><rect width="300" height="160" fill="white"/><text x="40" y="70">1</text><text x="180" y="100">2</text></svg>',
        imageAlt: `Imported diagram with printed labels ${start} to ${end}`,
        targets: Array.from({ length: end - start + 1 }, (_, offset) => {
          const questionNumber = start + offset;

          return { label: String(questionNumber), questionNumber };
        }),
      },
    };
  }

  if (references.length > 0) {
    return taskType === 'multiple-choice' || taskType === 'multiple-select' || taskType === 'summary-completion-list'
      ? { ...base, labeledOptions: references }
      : { ...base, sectionReferences: references };
  }

  return base;
};

const questionFor = (
  taskType: ReadingV2CanonicalTaskType,
  questionNumber: number,
  instructionId: string,
): Record<string, unknown> => {
  const options = sectionReferencesFor(taskType);
  const question: Record<string, unknown> = {
    questionNumber,
    type: taskType,
    sectionInstructionId: instructionId,
    questionText: promptFor(taskType, questionNumber),
  };

  if (
    taskType === 'sentence-completion'
    || taskType === 'summary-completion-text'
    || taskType === 'note-completion'
    || taskType === 'short-answer'
    || taskType === 'table-completion'
    || taskType === 'flowchart-completion'
    || taskType === 'diagram-labeling'
  ) {
    question.wordLimit = 1;
  }

  if (taskType === 'multiple-choice' || taskType === 'multiple-select' || taskType === 'summary-completion-list') {
    question.labeledOptions = options;
  }

  if (
    taskType === 'matching-headings'
    || taskType === 'matching-information'
    || taskType === 'matching-features'
    || taskType === 'matching-sentence-endings'
  ) {
    question.sectionReferences = options;
  }

  if (taskType === 'multiple-select') {
    question.answer = questionNumber % 2 === 1 ? ['A', 'B'] : ['B', 'C'];
  }

  return question;
};

const materialFor = (
  taskType: ReadingV2CanonicalTaskType,
  passageNumber = 1,
  start = 1,
): StructuredMaterial => {
  const end = start + 1;
  const instruction = instructionFor(taskType, start, end, passageNumber);

  return {
    passageNumber,
    title: `Paste fixture ${taskType}`,
    passages: [
      {
        title: `Passage for ${taskType}`,
        content: [
          `Imported paste fixture passage for ${taskType} has enough text to normalize into Reading V2 source.`,
          '',
          'Paragraph B preserves passage context for runtime and Studio repair review.',
        ].join('\n'),
      },
    ],
    sectionInstructions: [instruction],
    questions: [
      questionFor(taskType, start, String(instruction.id)),
      questionFor(taskType, end, String(instruction.id)),
    ],
  };
};

const structuredText = (materials: readonly StructuredMaterial[], sourceFile: string): string =>
  [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({ sourceFile, materials }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n');

const createTaskTypeFixture = (taskType: ReadingV2CanonicalTaskType): ReadingV2PasteImportFixture => ({
  name: `valid-${taskType}`,
  rawText: structuredText([materialFor(taskType)], `valid-${taskType}.txt`),
  answerKeyText: answerRowsFor(taskType).join('\n'),
  expectedTaskTypes: [taskType],
  expectedQuestionCount: 2,
});

const taskTypes = [
  'sentence-completion',
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
  'table-completion',
  'flowchart-completion',
  'diagram-labeling',
  'true-false-not-given',
  'yes-no-not-given',
  'matching-headings',
  'matching-information',
  'matching-features',
  'matching-sentence-endings',
  'multiple-choice',
  'multiple-select',
  'short-answer',
] as const satisfies readonly ReadingV2CanonicalTaskType[];

export const READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE = Object.fromEntries(
  taskTypes.map((taskType) => [taskType, createTaskTypeFixture(taskType)]),
) as Readonly<Record<ReadingV2CanonicalTaskType, ReadingV2PasteImportFixture>>;

const fullTestQuestionCounts = [13, 13, 14] as const;

export const READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE: ReadingV2PasteImportFixture = (() => {
  const fullTestGroups = [
    { passageNumber: 1, taskType: 'true-false-not-given', start: 1, end: 5 },
    { passageNumber: 1, taskType: 'matching-information', start: 6, end: 9 },
    { passageNumber: 1, taskType: 'sentence-completion', start: 10, end: 13 },
    { passageNumber: 2, taskType: 'table-completion', start: 14, end: 18 },
    { passageNumber: 2, taskType: 'flowchart-completion', start: 19, end: 22 },
    { passageNumber: 2, taskType: 'multiple-choice', start: 23, end: 26 },
    { passageNumber: 3, taskType: 'diagram-labeling', start: 27, end: 31 },
    { passageNumber: 3, taskType: 'yes-no-not-given', start: 32, end: 35 },
    { passageNumber: 3, taskType: 'multiple-select', start: 36, end: 40 },
  ] as const satisfies readonly {
    readonly passageNumber: 1 | 2 | 3;
    readonly taskType: ReadingV2CanonicalTaskType;
    readonly start: number;
    readonly end: number;
  }[];

  const materials = fullTestQuestionCounts.map((_, index) => {
    const passageNumber = (index + 1) as 1 | 2 | 3;
    const groups = fullTestGroups.filter((group) => group.passageNumber === passageNumber);

    return {
      passageNumber,
      title: `Full-test passage ${passageNumber}`,
      passages: [
        {
          title: `Full-test passage ${passageNumber}`,
          content: [
            `Full-test passage ${passageNumber} contains enough imported text for a realistic Reading V2 passage.`,
            '',
            'Second paragraph preserves paragraph boundaries for full-test import.',
            '',
            'The source includes structured IELTS blocks, matching lists, judgement statements, and choice banks.',
          ].join('\n'),
        },
      ],
      sectionInstructions: groups.map((group) =>
        instructionFor(group.taskType, group.start, group.end, passageNumber)),
      questions: groups.flatMap((group) =>
        Array.from({ length: group.end - group.start + 1 }, (_, offset) => {
          const questionNumber = group.start + offset;

          return questionFor(group.taskType, questionNumber, `p${passageNumber}-q${group.start}-${group.end}`);
        })),
    };
  });

  return {
    name: 'valid-full-test-40',
    rawText: structuredText(materials, 'valid-full-test-40.txt'),
    answerKeyText: fullTestGroups.flatMap((group) => answerRowsFor(group.taskType, group.start, group.end)).join('\n'),
    expectedTaskTypes: fullTestGroups.map((group) => group.taskType),
    expectedQuestionCount: 40,
  };
})();

const malformedBase = createTaskTypeFixture('sentence-completion');

export const READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES = {
  missing: {
    ...malformedBase,
    name: 'malformed-key-missing',
    answerKeyText: '1 alpha',
  },
  extra: {
    ...malformedBase,
    name: 'malformed-key-extra',
    answerKeyText: ['1 alpha', '2 beta', '3 gamma'].join('\n'),
  },
  duplicate: {
    ...malformedBase,
    name: 'malformed-key-duplicate',
    answerKeyText: ['1 alpha', '1 beta', '2 gamma'].join('\n'),
  },
  malformed: {
    ...malformedBase,
    name: 'malformed-key-unparsed-line',
    answerKeyText: ['1 alpha', 'not a numbered key row'].join('\n'),
  },
  conflicting: {
    ...malformedBase,
    name: 'malformed-key-conflicting-duplicate',
    answerKeyText: ['1 alpha', '1 conflicting', '2 beta'].join('\n'),
  },
} as const satisfies Readonly<Record<string, ReadingV2PasteImportFixture>>;

const structuredLayoutInvalidMaterial = (
  taskType: 'table-completion' | 'flowchart-completion' | 'diagram-labeling',
  instruction: Record<string, unknown>,
): StructuredMaterial => ({
  ...materialFor(taskType),
  sectionInstructions: [instruction],
  questions: [
    questionFor(taskType, 1, String(instruction.id)),
    questionFor(taskType, 2, String(instruction.id)),
  ],
});

const invalidStructuredLayoutFixture = (
  name: string,
  taskType: 'table-completion' | 'flowchart-completion' | 'diagram-labeling',
  instruction: Record<string, unknown>,
  expectedBlockingMessage: string,
): ReadingV2InvalidPasteImportFixture => ({
  name,
  rawText: structuredText([structuredLayoutInvalidMaterial(taskType, instruction)], `${name}.txt`),
  answerKeyText: answerRowsFor(taskType).join('\n'),
  expectedTaskTypes: [taskType],
  expectedQuestionCount: 2,
  expectedBlockingMessage,
});

export const READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES = {
  tableUnboundBlank: invalidStructuredLayoutFixture(
    'invalid-table-unbound-blank',
    'table-completion',
    {
      id: 'p1-q1-2',
      text: 'Complete the table below.',
      questionRange: { start: 1, end: 2 },
      table: {
        rows: [
          [
            { text: 'Feature', role: 'header' },
            { text: 'Detail', role: 'header' },
          ],
          [
            { text: 'Unbound row' },
            { text: 'This table cell shows a blank _____ but has no question binding.' },
          ],
        ],
      },
    },
    'not linked to a blank table cell',
  ),
  flowchartUnboundStep: invalidStructuredLayoutFixture(
    'invalid-flowchart-unbound-step',
    'flowchart-completion',
    {
      id: 'p1-q1-2',
      text: 'Complete the flowchart below.',
      questionRange: { start: 1, end: 2 },
      flowchart: {
        steps: [
          { stepId: 'step-1', text: 'Read the source notes.', nextStepIds: ['step-2'] },
          { stepId: 'step-2', text: 'Choose the answer.' },
        ],
      },
    },
    'not linked to a flowchart blank step',
  ),
  diagramMissingImage: invalidStructuredLayoutFixture(
    'invalid-diagram-missing-image',
    'diagram-labeling',
    {
      id: 'p1-q1-2',
      text: 'Label the diagram below.',
      questionRange: { start: 1, end: 2 },
      diagram: {
        imageUrl: ' ',
        imageAlt: 'Imported diagram without usable image source',
        targets: [
          { label: '1', questionNumber: 1 },
          { label: '2', questionNumber: 2 },
        ],
      },
    },
    'Diagram Labelling needs an image before publishing.',
  ),
} as const satisfies Readonly<Record<string, ReadingV2InvalidPasteImportFixture>>;
