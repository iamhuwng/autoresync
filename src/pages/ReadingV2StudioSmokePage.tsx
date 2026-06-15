import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReadingV2StudioShell } from '../components/reading-v2/studio/ReadingV2StudioShell';
import { createReadingV2CanonicalFixture } from '../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import {
  READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE,
  READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES,
  READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE,
  READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES,
} from '../services/reading-v2/fixtures/readingV2PasteImportFixtures';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
} from '../services/reading-v2/readingV2ImportNormalization.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from '../services/reading-v2/readingV2ExternalAiPrompt.service';
import {
  generateReadingV2PreviewOnly,
  type ReadingV2AutoSplitDuplicateWarning,
} from '../services/reading-v2/readingV2PublishPipeline.service';
import { readingV2Ids, type ReadingV2Document, type ReadingV2TaskGroupId } from '../types/readingV2.types';
import type { ReadingV2CanonicalTaskType } from '../types/readingV2Taxonomy';

const DIAG_PREFIX = '[Diag][ReadingV2PasteImportGate]';

const STEPWELLS_TFNG_SMOKE_FIXTURE = {
  name: 'cam10-test1-stepwells',
  rawText: [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: 'cam10-test1-stepwells.txt',
      materials: [
        {
          passageNumber: 1,
          title: 'Stepwells',
          passages: [
            {
              title: 'Stepwells',
              content: [
                'A millennium ago, stepwells were fundamental to life in the driest parts of India. Although many have been neglected, recent restoration has returned them to their former glory. Richard Cox travelled to north-western India to document these spectacular monuments from a bygone era.',
                '',
                'During the sixth and seventh centuries, the inhabitants of the modern-day states of Gujarat and Rajasthan in North-western India developed a method of gaining access to clean, fresh groundwater during the dry season for drinking, bathing, watering animals and irrigation.',
                '',
                'Unique to the region, stepwells are often architecturally complex and vary widely in size and shape.',
              ].join('\n'),
            },
          ],
          sectionInstructions: [
            {
              id: 'p1-q1-5',
              text: 'Do the following statements agree with the information given in Reading Passage 1? In boxes 1-5 on your answer sheet, write TRUE if the statement agrees with the information FALSE if the statement contradicts the information NOT GIVEN if there is no information on this.',
              questionRange: { start: 1, end: 5 },
            },
          ],
          questions: [
            { questionNumber: 1, type: 'true-false-not-given', sectionInstructionId: 'p1-q1-5', questionText: 'Examples of ancient stepwells can be found all over the world.' },
            { questionNumber: 2, type: 'true-false-not-given', sectionInstructionId: 'p1-q1-5', questionText: 'Stepwells had a range of functions, in addition to those related to water collection.' },
            { questionNumber: 3, type: 'true-false-not-given', sectionInstructionId: 'p1-q1-5', questionText: 'The few existing stepwells in Delhi are more attractive than those found elsewhere.' },
            { questionNumber: 4, type: 'true-false-not-given', sectionInstructionId: 'p1-q1-5', questionText: 'It took workers many years to build the stone steps.' },
            { questionNumber: 5, type: 'true-false-not-given', sectionInstructionId: 'p1-q1-5', questionText: 'The article says that stepwells were found only in Gujarat.' },
          ],
        },
      ],
    }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n'),
  answerKeyText: ['1 False', '2 True', '3 Not Given', '4 Not Given', '5 False'].join('\n'),
  expectedTaskTypes: ['true-false-not-given'],
  expectedQuestionCount: 5,
} as const;

const MARKDOWN_FORMATTING_SMOKE_FIXTURE = {
  name: 'markdown-formatting',
  rawText: [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: 'markdown-formatting.txt',
      materials: [
        {
          passageNumber: 1,
          title: 'Markdown formatting',
          passages: [
            {
              title: 'Markdown formatting',
              contentBlocks: [
                {
                  kind: 'paragraph',
                  text: 'A **bold** passage with *italic* source and <img src=x onerror=alert(1) /> as literal text.',
                },
                {
                  kind: 'list-item',
                  listKind: 'bullet',
                  text: 'A __kept__ source mark with `code`.',
                },
              ],
            },
          ],
          sectionInstructions: [
            {
              id: 'p1-q1-1',
              taskType: 'multiple-choice',
              sourceInstructionEvidence: 'Choose the correct letter, A, B, C or D.',
              questionRange: { start: 1, end: 1 },
              labeledOptions: [
                { label: 'A', text: '**Formatted** option' },
                { label: 'B', text: '*Plain* alternative' },
              ],
            },
          ],
          questions: [
            {
              questionNumber: 1,
              type: 'multiple-choice',
              sectionInstructionId: 'p1-q1-1',
              questionText: 'Which option is **important**?',
              answer: 'A',
            },
          ],
        },
      ],
    }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n'),
  answerKeyText: '1 A',
  expectedTaskTypes: ['multiple-choice'],
  expectedQuestionCount: 1,
} as const;

const AUTO_V4_FULL_TEST_SMOKE_FIXTURE = {
  ...READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE,
  name: 'auto-v4-valid-full-test',
} as const;

const AUTO_V4_MALFORMED_KEY_SMOKE_FIXTURE = {
  ...READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.duplicate,
  name: 'auto-v4-malformed-key',
} as const;

const CAM16_TEST4_DIAGNOSTIC_SMOKE_FIXTURE = {
  name: 'cam16-test4-diagnostics',
  rawText: [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: 'IELTS Reading-v2 Test - June 2026',
      materials: [
        {
          passageNumber: 2,
          title: 'Changes in reading habits',
          passages: [
            {
              title: 'Changes in reading habits',
              content: [
                'The possibility that critical analysis, empathy and other deep reading processes could become the unintended collateral damage of our digital culture is not a straightforward binary issue about print versus digital reading.',
                '',
                'It is about how we all have begun to read on various mediums and how that changes not only what we read, but also the purposes for which we read.',
                '',
                'There is an old rule in neuroscience that does not alter with age: use it or lose it. We possess both the science and the technology to identify and redress the changes in how we read before they become entrenched.',
              ].join('\n'),
            },
          ],
          sectionInstructions: [
            {
              id: 'p2-q23-26-true-false-not-given',
              taskType: 'true-false-not-given',
              questionRange: { start: 23, end: 26 },
              sourceInstructionEvidence: [
                'Do the following statements agree with the views of the writer in Reading Passage 2?',
                'In boxes 23-26 on your answer sheet, write TRUE if the statement agrees with the views of the writer, FALSE if the statement contradicts the views of the writer, NOT GIVEN if it is impossible to say what the writer thinks about this',
              ].join(' '),
              vocabulary: 'TFNG',
            },
          ],
          questions: [
            {
              questionNumber: 23,
              type: 'true-false-not-given',
              sectionInstructionId: 'p2-q23-26-true-false-not-given',
              questionText: 'The medium we use to read can affect our choice of reading content.',
            },
            {
              questionNumber: 24,
              type: 'true-false-not-given',
              sectionInstructionId: 'p2-q23-26-true-false-not-given',
              questionText: 'Some age groups are more likely to lose their complex reading skills than others.',
            },
            {
              questionNumber: 25,
              type: 'true-false-not-given',
              sectionInstructionId: 'p2-q23-26-true-false-not-given',
              questionText: 'False information has become more widespread in today\'s digital era.',
            },
            {
              questionNumber: 26,
              type: 'true-false-not-given',
              sectionInstructionId: 'p2-q23-26-true-false-not-given',
              questionText: 'We still have opportunities to rectify the problems that technology is presenting.',
            },
          ],
        },
      ],
    }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n'),
  answerKeyText: ['23 YES', '24 NO', '25 NOT GIVEN', '26 YES'].join('\n'),
  expectedTaskTypes: ['true-false-not-given'],
  expectedQuestionCount: 4,
} as const;

const smokeFixtureFor = (fixtureName: string | null) => {
  switch (fixtureName) {
    case 'auto-v4-malformed-key':
      return AUTO_V4_MALFORMED_KEY_SMOKE_FIXTURE;
    case 'auto-v4-valid-full-test':
      return AUTO_V4_FULL_TEST_SMOKE_FIXTURE;
    case 'valid-full-test':
      return READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE;
    case 'malformed-key':
      return READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.duplicate;
    case 'valid-import':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['table-completion'];
    case 'cam10-test1':
      return STEPWELLS_TFNG_SMOKE_FIXTURE;
    case 'cam16-test4-diagnostics':
      return CAM16_TEST4_DIAGNOSTIC_SMOKE_FIXTURE;
    case 'task-true-false-not-given':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['true-false-not-given'];
    case 'task-short-answer':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['short-answer'];
    case 'task-table-completion':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['table-completion'];
    case 'task-matching-headings':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['matching-headings'];
    case 'task-matching-sentence-endings':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['matching-sentence-endings'];
    case 'task-multiple-choice':
      return READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE['multiple-choice'];
    case 'task-markdown-formatting':
      return MARKDOWN_FORMATTING_SMOKE_FIXTURE;
    case 'invalid-table-unbound-blank':
      return READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES.tableUnboundBlank;
    case 'invalid-flowchart-unbound-step':
      return READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES.flowchartUnboundStep;
    case 'invalid-diagram-missing-image':
      return READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES.diagramMissingImage;
    default:
      return null;
  }
};

const logSmokeDiagnostic = (event: string, payload: Record<string, unknown>) => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${DIAG_PREFIX} ${event}`, payload);
};

const removeFirstStructuredInteraction = (
  document: ReadingV2Document,
  taskType: Extract<ReadingV2CanonicalTaskType, 'table-completion' | 'flowchart-completion' | 'diagram-labeling'>,
): ReadingV2Document => {
  const taskGroup = Object.values(document.taskGroups).find((candidate) => candidate.officialTaskType === taskType);
  const firstInteractionId = taskGroup?.interactionIds[0];

  if (!taskGroup || !firstInteractionId) {
    return document;
  }

  const interactions = { ...document.interactions };
  delete interactions[firstInteractionId];
  taskGroup.interactionIds
    .filter((interactionId) => interactionId !== firstInteractionId)
    .forEach((interactionId) => {
      const interaction = interactions[interactionId];

      if (!interaction) {
        return;
      }

      interactions[interactionId] = {
        ...interaction,
        scoringRule: {
          ...interaction.scoringRule,
          acceptableAnswers: [],
        },
      };
    });

  return {
    ...document,
    interactions,
    taskGroups: {
      ...document.taskGroups,
      [taskGroup.taskGroupId]: {
        ...taskGroup,
        interactionIds: taskGroup.interactionIds.filter((interactionId) => interactionId !== firstInteractionId),
      },
    },
  };
};

const createStructuredRepairSmokeDocument = (): ReadingV2Document => {
  const passage = createReadingV2CanonicalFixture('sentence-completion');
  const table = removeFirstStructuredInteraction(createReadingV2CanonicalFixture('table-completion'), 'table-completion');
  const flowchart = removeFirstStructuredInteraction(createReadingV2CanonicalFixture('flowchart-completion'), 'flowchart-completion');
  const diagram = removeFirstStructuredInteraction(createReadingV2CanonicalFixture('diagram-labeling'), 'diagram-labeling');
  const passageSectionId = passage.sectionIds[0]!;
  const passageSection = passage.sections[passageSectionId]!;
  const passageStimulusId = passageSection.stimulusIds[0]!;
  const structuredTaskGroups = {
    ...table.taskGroups,
    ...flowchart.taskGroups,
    ...diagram.taskGroups,
  };
  const rehomedTaskGroups = Object.fromEntries(
    Object.entries(structuredTaskGroups).map(([taskGroupId, taskGroup]) => [
      taskGroupId,
      {
        ...taskGroup,
        sectionId: passageSectionId,
      },
    ]),
  ) as ReadingV2Document['taskGroups'];

  return {
    ...passage,
    documentId: 'smoke-structured-repair-document' as ReadingV2Document['documentId'],
    title: 'Imported structured repair smoke',
    sectionIds: [passageSectionId],
    sections: {
      [passageSectionId]: {
        ...passageSection,
        title: 'Structured repair passage',
        stimulusIds: [
          passageStimulusId,
          ...table.sectionIds.flatMap((sectionId) => table.sections[sectionId]?.stimulusIds ?? []),
          ...flowchart.sectionIds.flatMap((sectionId) => flowchart.sections[sectionId]?.stimulusIds ?? []),
          ...diagram.sectionIds.flatMap((sectionId) => diagram.sections[sectionId]?.stimulusIds ?? []),
        ],
        taskGroupIds: Object.keys(rehomedTaskGroups).map((taskGroupId) => taskGroupId as ReadingV2TaskGroupId),
      },
    },
    stimuli: {
      [passageStimulusId]: {
        ...passage.stimuli[passageStimulusId]!,
        title: 'Structured repair passage',
      },
      ...table.stimuli,
      ...flowchart.stimuli,
      ...diagram.stimuli,
    },
    anchors: {
      ...passage.anchors,
      ...table.anchors,
      ...flowchart.anchors,
      ...diagram.anchors,
    },
    taskGroups: rehomedTaskGroups,
    interactions: {
      ...table.interactions,
      ...flowchart.interactions,
      ...diagram.interactions,
    },
    optionSets: {
      ...table.optionSets,
      ...flowchart.optionSets,
      ...diagram.optionSets,
    },
    validationState: { issues: [] },
  };
};

const createCam16Test4DiagnosticSmokeDocument = (): ReadingV2Document => {
  const base = structuredClone(createReadingV2CanonicalFixture('true-false-not-given')) as ReadingV2Document;
  const sectionId = base.sectionIds[0]!;
  const section = base.sections[sectionId]!;
  const stimulusId = section.stimulusIds[0]!;
  const fillerTaskGroupId = readingV2Ids.taskGroupId('ielts-reading-v2-test-june-2026-task-group-1-22');
  const targetTaskGroupId = readingV2Ids.taskGroupId('ielts-reading-v2-test-june-2026-task-group-23-26');
  const fillerInteractionIds = Array.from({ length: 22 }, (_, index) =>
    readingV2Ids.interactionId(`ielts-reading-v2-test-june-2026-q${index + 1}`));
  const targetInteractionIds = [23, 24, 25, 26].map((questionNumber) =>
    readingV2Ids.interactionId(`ielts-reading-v2-test-june-2026-q${questionNumber}`));
  const fillerAnchorIds = Array.from({ length: 22 }, (_, index) =>
    readingV2Ids.anchorId(`ielts-reading-v2-test-june-2026-anchor-q${index + 1}`));
  const targetAnchorIds = [23, 24, 25, 26].map((questionNumber) =>
    readingV2Ids.anchorId(`ielts-reading-v2-test-june-2026-anchor-q${questionNumber}`));
  const anchorIds = [...fillerAnchorIds, ...targetAnchorIds];
  const promptTextByQuestion = new Map<number, string>([
    [23, 'The medium we use to read can affect our choice of reading content.'],
    [24, 'Some age groups are more likely to lose their complex reading skills than others.'],
    [25, 'False information has become more widespread in today\'s digital era.'],
    [26, 'We still have opportunities to rectify the problems that technology is presenting.'],
  ]);
  const answerByQuestion = new Map<number, string>([
    [23, 'YES'],
    [24, 'NO'],
    [25, 'NOT GIVEN'],
    [26, 'YES'],
  ]);

  const fillerInteractions = Object.fromEntries(
    fillerInteractionIds.map((interactionId, index) => [
      interactionId,
      {
        interactionId,
        taskGroupId: fillerTaskGroupId,
        responseShape: { kind: 'free-text', wordLimit: 3 },
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: [`answer ${index + 1}`],
        },
        reviewLabel: { displayNumber: index + 1 },
        promptText: `Smoke filler question ${index + 1}.`,
        primaryAnchorId: fillerAnchorIds[index],
      },
    ]),
  ) as ReadingV2Document['interactions'];

  const targetInteractions = Object.fromEntries(
    [23, 24, 25, 26].map((questionNumber, index) => {
      const interactionId = targetInteractionIds[index]!;
      const anchorId = targetAnchorIds[index]!;

      return [
        interactionId,
        {
          interactionId,
          taskGroupId: targetTaskGroupId,
          responseShape: { kind: 'binary-judgement', vocabulary: 'TFNG' },
          scoringRule: {
            maxScore: 1,
            acceptableAnswers: [answerByQuestion.get(questionNumber)!],
          },
          reviewLabel: { displayNumber: questionNumber },
          promptText: promptTextByQuestion.get(questionNumber),
          primaryAnchorId: anchorId,
        },
      ];
    }),
  ) as ReadingV2Document['interactions'];

  const fillerAnchors = Object.fromEntries(
    fillerAnchorIds.map((anchorId, index) => [
      anchorId,
      {
        anchorId,
        stimulusId,
        kind: 'annotation',
        label: `Question ${index + 1}`,
      },
    ]),
  ) as ReadingV2Document['anchors'];

  const targetAnchors = Object.fromEntries(
    [23, 24, 25, 26].map((questionNumber, index) => {
      const anchorId = targetAnchorIds[index]!;

      return [
        anchorId,
        {
          anchorId,
          stimulusId,
          kind: 'annotation',
          label: `Question ${questionNumber}`,
        },
      ];
    }),
  ) as ReadingV2Document['anchors'];

  return {
    ...base,
    documentId: 'ielts-reading-v2-test-june-2026-document' as ReadingV2Document['documentId'],
    title: 'IELTS Reading-v2 Test - June 2026',
    sections: {
      [sectionId]: {
        ...section,
        title: 'Changes in reading habits',
        taskGroupIds: [fillerTaskGroupId, targetTaskGroupId],
      },
    },
    stimuli: {
      [stimulusId]: {
        ...base.stimuli[stimulusId]!,
        title: 'Changes in reading habits',
        content: {
          kind: 'passage-content',
          paragraphs: [
            {
              text: 'The possibility that critical analysis, empathy and other deep reading processes could become the unintended collateral damage of our digital culture is not a straightforward binary issue about print versus digital reading.',
            },
            {
              text: 'There is an old rule in neuroscience that does not alter with age: use it or lose it. We possess both the science and the technology to identify and redress the changes in how we read before they become entrenched.',
            },
          ],
        },
        anchorIds,
      },
    },
    anchors: {
      ...fillerAnchors,
      ...targetAnchors,
    },
    taskGroups: {
      [fillerTaskGroupId]: {
        taskGroupId: fillerTaskGroupId,
        sectionId,
        officialTaskType: 'short-answer',
        engineeringFamily: 'completion',
        groupTitle: 'Questions 1-22',
        instructionBlocks: [
          {
            id: 'p1-p2-q1-22-smoke-filler',
            text: 'Smoke filler questions keep imported numbering aligned with the pasted diagnostic log.',
          },
        ],
        answerRule: {
          responseShape: { kind: 'free-text', wordLimit: 3 },
          wordLimit: 3,
          casing: 'ignored',
          punctuation: 'ignored',
        },
        stimulusRefs: [{ stimulusId, anchorIds: fillerAnchorIds }],
        optionSetRefs: [],
        interactionIds: fillerInteractionIds,
        validationState: { issues: [] },
      },
      [targetTaskGroupId]: {
        taskGroupId: targetTaskGroupId,
        sectionId,
        officialTaskType: 'true-false-not-given',
        engineeringFamily: 'binary-judgement',
        groupTitle: 'Questions 23-26',
        instructionBlocks: [
          {
            id: 'p2-q23-26-true-false-not-given',
            text: 'Do the following statements agree with the views of the writer in Reading Passage 2? Write TRUE, FALSE or NOT GIVEN.',
          },
        ],
        answerRule: {
          responseShape: { kind: 'binary-judgement', vocabulary: 'TFNG' },
          casing: 'ignored',
          punctuation: 'ignored',
        },
        stimulusRefs: [{ stimulusId, anchorIds: targetAnchorIds }],
        optionSetRefs: [],
        interactionIds: targetInteractionIds,
        validationState: { issues: [] },
      },
    },
    interactions: {
      ...fillerInteractions,
      ...targetInteractions,
    },
    optionSets: {},
    validationState: { issues: [] },
  };
};

const createSmokeDuplicateWarnings = (mode: string | null): readonly ReadingV2AutoSplitDuplicateWarning[] => {
  if (!mode) {
    return [];
  }

  const activeMatch = {
    materialId: 'smoke-duplicate-active',
    title: 'Existing active passage',
    source: { sourceFullTestId: 'smoke-full-test', sourceOrderDisplay: 'Passage 1' },
    ownerId: 'smoke-teacher',
    visibility: 'private' as const,
    state: 'published' as const,
    currentVersionId: 'smoke-active-v1',
    bodySimilarityPercent: 96,
    questionSimilarityPercent: 92,
    combinedSimilarityPercent: 94,
    shouldWarn: true,
    actions: ['use-existing', 'create-new-anyway'] as const,
  };

  const archivedMatch = {
    materialId: 'smoke-duplicate-archived',
    title: 'Archived matching passage',
    source: { sourceFullTestId: 'smoke-full-test', sourceOrderDisplay: 'Passage 2' },
    ownerId: 'smoke-teacher',
    visibility: 'private' as const,
    state: 'archived' as const,
    currentVersionId: 'smoke-archived-v1',
    bodySimilarityPercent: 93,
    questionSimilarityPercent: 89,
    combinedSimilarityPercent: 91,
    shouldWarn: true,
    actions: ['restore-and-use', 'create-new-anyway'] as const,
  };

  const matches = mode === 'archived'
    ? [archivedMatch]
    : mode === 'both'
      ? [activeMatch, archivedMatch]
      : [activeMatch];

  return [{
    passageMaterialId: 'smoke-new-passage-1',
    result: {
      shouldWarn: true,
      blockPublish: false,
      matches,
    },
  }];
};

export default function ReadingV2StudioSmokePage() {
  const [searchParams] = useSearchParams();
  const fixtureName = searchParams.get('fixture');
  const duplicateWarningMode = searchParams.get('duplicateWarning');
  const isAutoV4Fixture = fixtureName === 'auto-v4-valid-full-test'
    || fixtureName === 'auto-v4-malformed-key'
    || fixtureName === 'cam16-test4-diagnostics';
  const smokeFixture = smokeFixtureFor(fixtureName);
  const structuredRepairDocument = useMemo(
    () => {
      if (fixtureName === 'structured-repair') {
        return createStructuredRepairSmokeDocument();
      }

      if (fixtureName === 'cam16-test4-diagnostics') {
        return createCam16Test4DiagnosticSmokeDocument();
      }

      return undefined;
    },
    [fixtureName],
  );
  const importContext = useMemo(
    () => {
      if (structuredRepairDocument) {
        return {
          candidate: undefined,
          document: structuredRepairDocument,
        };
      }

      if (!smokeFixture) {
        return undefined;
      }

      const candidate = createReadingV2ImportCandidateFromText({
        text: smokeFixture.rawText,
        answerKeyText: smokeFixture.answerKeyText,
        fileName: isAutoV4Fixture ? 'Auto V4 import' : `${smokeFixture.name}.txt`,
        sourceKind: isAutoV4Fixture ? 'auto-gemini' : 'pasted-text',
      });

      return {
        candidate,
        document: normalizeReadingV2ImportCandidate(candidate).document,
      };
    },
    [isAutoV4Fixture, smokeFixture, structuredRepairDocument],
  );
  const fixtureLabel = smokeFixture?.name ?? (structuredRepairDocument ? 'structured-repair' : 'blank');
  const duplicateWarnings = useMemo(
    () => createSmokeDuplicateWarnings(duplicateWarningMode),
    [duplicateWarningMode],
  );

  return (
    <ReadingV2StudioShell
      mode={importContext ? (isAutoV4Fixture ? 'create-from-auto' : 'create-from-import') : 'create-blank'}
      document={importContext?.document}
      draftId={importContext ? `smoke-reading-v2-${fixtureLabel}` : 'smoke-reading-v2-draft'}
      importCandidate={importContext?.candidate}
      metadata={{
        title: importContext ? `Reading V2 Smoke ${fixtureLabel}` : 'Reading V2 Smoke Material',
        ownerId: 'smoke-teacher',
      }}
      returnContext={{ surface: 'direct-studio-route', label: 'Browser smoke' }}
      onAction={(actionName, metadata) =>
        logSmokeDiagnostic('studio_action', {
          actionName,
          outcome: metadata?.outcome,
          step: metadata?.step,
          fixture: fixtureLabel,
          publishBlocked: metadata?.publishBlocked,
        })}
      onSaveDraft={async () => ({ revisionToken: 'smoke-rev-2' })}
      onPreview={async (snapshot) =>
        generateReadingV2PreviewOnly({
          draftId: snapshot.draftId,
          ownerId: snapshot.metadata.ownerId,
          document: snapshot.document,
        }).projection}
      onPublish={async () => ({
        snapshotVersionId: 'smoke-snapshot-1',
        firebaseCommitStatus: 'committed',
        firebaseCommitPath: '/readingV2/publishCommits/smoke/smoke-snapshot-1',
        firebaseOperationCount: 12,
        duplicateWarnings,
      })}
    />
  );
}
