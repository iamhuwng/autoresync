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
import { generateReadingV2PreviewOnly } from '../services/reading-v2/readingV2PublishPipeline.service';
import type { ReadingV2Document, ReadingV2TaskGroupId } from '../types/readingV2.types';
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

export default function ReadingV2StudioSmokePage() {
  const [searchParams] = useSearchParams();
  const fixtureName = searchParams.get('fixture');
  const isAutoV4Fixture = fixtureName === 'auto-v4-valid-full-test'
    || fixtureName === 'auto-v4-malformed-key';
  const smokeFixture = smokeFixtureFor(fixtureName);
  const structuredRepairDocument = useMemo(
    () => fixtureName === 'structured-repair' ? createStructuredRepairSmokeDocument() : undefined,
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
      })}
    />
  );
}
