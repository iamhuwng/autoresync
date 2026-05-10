import { READING_V2_ENGINE } from '../../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2OptionSet,
  type ReadingV2StimulusContent,
  type ReadingV2StimulusNode,
  type ReadingV2TaskGroup,
} from '../../../types/readingV2.types';
import {
  getReadingV2TaskFamily,
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';

const TASK_TYPE_ANCHOR_KIND = {
  'sentence-completion': 'inline-blank',
  'summary-completion-text': 'inline-blank',
  'summary-completion-list': 'inline-blank',
  'note-completion': 'inline-blank',
  'table-completion': 'table-cell',
  'flowchart-completion': 'flow-step',
  'diagram-labeling': 'diagram-hotspot',
  'true-false-not-given': 'paragraph',
  'yes-no-not-given': 'paragraph',
  'matching-headings': 'paragraph',
  'matching-information': 'paragraph',
  'matching-features': 'paragraph',
  'matching-sentence-endings': 'annotation',
  'multiple-choice': 'paragraph',
  'multiple-select': 'paragraph',
  'short-answer': 'paragraph',
} as const;

const createOptionSet = (
  taskType: ReadingV2CanonicalTaskType,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2OptionSet | null => {
  if (!taskGroup.optionSetRefs[0]) {
    return null;
  }

  return {
    optionSetId: taskGroup.optionSetRefs[0],
    taskGroupId: taskGroup.taskGroupId,
    options: [
      { optionId: `${taskType}-option-a`, label: 'A', text: 'Option A' },
      { optionId: `${taskType}-option-b`, label: 'B', text: 'Option B' },
      { optionId: `${taskType}-option-c`, label: 'C', text: 'Option C' },
    ],
  };
};

const createStimulusContent = (
  taskType: ReadingV2CanonicalTaskType,
  anchorOneId: ReadingV2Anchor['anchorId'],
  anchorTwoId: ReadingV2Anchor['anchorId'],
): ReadingV2StimulusContent => {
  if (taskType === 'table-completion') {
    return {
      kind: 'table-content',
      rows: [
        [
          { text: 'Feature', role: 'header' },
          { text: 'Detail', role: 'header' },
        ],
        [
          { anchorId: anchorOneId, text: 'First table context', role: 'body' },
          { anchorId: anchorTwoId, text: '', role: 'body', isBlank: true },
        ],
      ],
    };
  }

  if (taskType === 'flowchart-completion') {
    return {
      kind: 'flowchart-content',
      steps: [
        { anchorId: anchorOneId, stepId: 'step-1', text: 'First process step', nextStepIds: ['step-2'] },
        { anchorId: anchorTwoId, stepId: 'step-2', text: 'Second process step' },
      ],
    };
  }

  if (taskType === 'diagram-labeling') {
    return {
      kind: 'diagram-content',
      imageAlt: 'Fixture diagram with two labeled targets',
      hotspots: [
        { anchorId: anchorOneId, label: 'Target 1', xPercent: 30, yPercent: 40 },
        { anchorId: anchorTwoId, label: 'Target 2', xPercent: 70, yPercent: 60 },
      ],
    };
  }

  return {
    kind: 'passage-content',
    paragraphs: [
      {
        anchorId: anchorOneId,
        label: 'Paragraph A',
        text: `Fixture passage paragraph A for ${taskType}.`,
      },
      {
        anchorId: anchorTwoId,
        label: 'Paragraph B',
        text: `Fixture passage paragraph B for ${taskType}.`,
      },
    ],
  };
};

const fixturePromptText = (
  taskType: ReadingV2CanonicalTaskType,
  questionNumber: 1 | 2,
): string => {
  if (taskType === 'true-false-not-given') {
    return questionNumber === 1
      ? 'The fixture claim agrees with Paragraph A.'
      : 'The fixture claim is contradicted by Paragraph B.';
  }

  if (taskType === 'yes-no-not-given') {
    return questionNumber === 1
      ? 'The writer supports the first fixture opinion.'
      : 'The writer rejects the second fixture opinion.';
  }

  if (taskType === 'summary-completion-text') {
    return questionNumber === 1
      ? 'Fixture summary: the first process depends on _____.'
      : 'Fixture summary: the second result produces _____.';
  }

  if (taskType === 'sentence-completion' || taskType === 'note-completion') {
    return questionNumber === 1
      ? 'Complete the fixture sentence with the first missing word.'
      : 'Complete the fixture sentence with the second missing word.';
  }

  return questionNumber === 1
    ? `Fixture ${taskType} prompt one.`
    : `Fixture ${taskType} prompt two.`;
};

export const createReadingV2CanonicalFixture = (
  taskType: ReadingV2CanonicalTaskType,
): ReadingV2Document => {
  const family = getReadingV2TaskFamily(taskType);
  const documentId = readingV2Ids.documentId(`doc-${taskType}`);
  const sectionId = readingV2Ids.sectionId(`section-${taskType}`);
  const stimulusId = readingV2Ids.stimulusId(`stimulus-${taskType}`);
  const taskGroupId = readingV2Ids.taskGroupId(`task-group-${taskType}`);
  const interactionOneId = readingV2Ids.interactionId(`interaction-${taskType}-1`);
  const interactionTwoId = readingV2Ids.interactionId(`interaction-${taskType}-2`);
  const anchorOneId = readingV2Ids.anchorId(`anchor-${taskType}-1`);
  const anchorTwoId = readingV2Ids.anchorId(`anchor-${taskType}-2`);
  const optionSetId = readingV2Ids.optionSetId(`option-set-${taskType}`);
  const usesOptions = family === 'choice' || family === 'matching';

  const stimulus: ReadingV2StimulusNode = {
    stimulusId,
    kind:
      family === 'structured-layout'
        ? taskType === 'table-completion'
          ? 'table-shell'
          : taskType === 'flowchart-completion'
            ? 'flowchart-shell'
            : 'diagram-shell'
        : 'passage',
    title: `Fixture stimulus for ${taskType}`,
    content: createStimulusContent(taskType, anchorOneId, anchorTwoId),
    anchorIds: [anchorOneId, anchorTwoId],
  };

  const anchors: Record<string, ReadingV2Anchor> = {
    [anchorOneId]: {
      anchorId: anchorOneId,
      stimulusId,
      kind: TASK_TYPE_ANCHOR_KIND[taskType],
      label: 'Anchor 1',
    },
    [anchorTwoId]: {
      anchorId: anchorTwoId,
      stimulusId,
      kind: TASK_TYPE_ANCHOR_KIND[taskType],
      label: 'Anchor 2',
    },
  };

  const responseShape: ReadingV2Interaction['responseShape'] =
    family === 'choice'
      ? taskType === 'multiple-select'
        ? { kind: 'multi-select', optionSetId, selectionLimit: 2 }
        : { kind: 'single-choice', optionSetId }
      : family === 'binary-judgement'
        ? {
            kind: 'binary-judgement',
            vocabulary: taskType === 'true-false-not-given' ? 'TFNG' : 'YNNG',
          }
        : family === 'matching'
          ? { kind: 'matching', optionSetId, optionReuse: 'allowed' }
          : family === 'structured-layout'
            ? {
                kind: 'structured-entry',
                structure:
                  taskType === 'table-completion'
                    ? 'table'
                    : taskType === 'flowchart-completion'
                      ? 'flowchart'
                      : 'diagram',
              }
            : { kind: 'free-text', wordLimit: 2 };

  const taskGroup: ReadingV2TaskGroup = {
    taskGroupId,
    sectionId,
    officialTaskType: taskType,
    engineeringFamily: family,
    instructionBlocks: [
      {
        id: `instruction-${taskType}`,
        text: `Complete the ${taskType} task.`,
      },
    ],
    answerRule: {
      responseShape,
      wordLimit: family === 'completion' ? 2 : undefined,
      optionReuse: family === 'matching' ? 'allowed' : undefined,
      casing: 'ignored',
      punctuation: 'ignored',
    },
    stimulusRefs: [{ stimulusId, anchorIds: [anchorOneId, anchorTwoId] }],
    optionSetRefs: usesOptions ? [optionSetId] : [],
    interactionIds: [interactionOneId, interactionTwoId],
    validationState: { issues: [] },
  };

  const interactions: Record<string, ReadingV2Interaction> = {
    [interactionOneId]: {
      interactionId: interactionOneId,
      taskGroupId,
      responseShape,
      scoringRule: { maxScore: 1, acceptableAnswers: ['answer one'] },
      reviewLabel: {},
      promptText: fixturePromptText(taskType, 1),
      primaryAnchorId: anchorOneId,
    },
    [interactionTwoId]: {
      interactionId: interactionTwoId,
      taskGroupId,
      responseShape,
      scoringRule: { maxScore: 1, acceptableAnswers: ['answer two'] },
      reviewLabel: {},
      promptText: fixturePromptText(taskType, 2),
      primaryAnchorId: anchorTwoId,
    },
  };

  const optionSet = createOptionSet(taskType, taskGroup);

  return {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId,
    title: `Canonical fixture ${taskType}`,
    sectionIds: [sectionId],
    sections: {
      [sectionId]: {
        sectionId,
        title: 'Section 1',
        stimulusIds: [stimulusId],
        taskGroupIds: [taskGroupId],
      },
    },
    stimuli: { [stimulusId]: stimulus },
    anchors,
    taskGroups: { [taskGroupId]: taskGroup },
    interactions,
    optionSets: optionSet ? { [optionSet.optionSetId]: optionSet } : {},
    validationState: { issues: [] },
  };
};

export const READING_V2_CANONICAL_FIXTURES = Object.fromEntries(
  (
    [
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
    ] as const
  ).map((taskType) => [taskType, createReadingV2CanonicalFixture(taskType)]),
) as Readonly<Record<ReadingV2CanonicalTaskType, ReadingV2Document>>;
