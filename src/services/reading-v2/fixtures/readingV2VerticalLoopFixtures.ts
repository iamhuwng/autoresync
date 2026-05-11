import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2TaskGroupId,
} from '../../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './readingV2CanonicalFixtures';

export const readingV2VerticalLoopFixtureDocument = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES[taskType]) as ReadingV2Document;

export const createReadingV2MixedStructuredVerticalLoopDocument = (): ReadingV2Document => {
  const documents = [
    readingV2VerticalLoopFixtureDocument('sentence-completion'),
    readingV2VerticalLoopFixtureDocument('table-completion'),
    readingV2VerticalLoopFixtureDocument('flowchart-completion'),
    readingV2VerticalLoopFixtureDocument('diagram-labeling'),
  ];
  const [base, table] = documents;

  if (!base || !table) {
    throw new Error('Mixed Reading V2 vertical loop fixture is missing source documents.');
  }

  const mediaStimulusId = readingV2Ids.stimulusId('stimulus-mixed-media');
  const firstSectionId = base.sectionIds[0];
  const tableTaskGroupId = readingV2Ids.taskGroupId('task-group-table-completion');
  const tableTaskGroup = table.taskGroups[tableTaskGroupId];

  if (!firstSectionId) {
    throw new Error('Mixed Reading V2 vertical loop fixture is missing a base section id.');
  }

  const firstSection = base.sections[firstSectionId];

  if (!firstSection || !tableTaskGroup) {
    throw new Error('Mixed Reading V2 vertical loop fixture is missing base section or table group.');
  }

  const sections = Object.fromEntries(
    documents.flatMap((document) => Object.entries(document.sections)),
  );
  const taskGroups = Object.fromEntries(
    documents.flatMap((document) => Object.entries(document.taskGroups)),
  );

  return {
    ...base,
    title: 'Mixed structured Reading V2 vertical loop',
    sectionIds: documents.flatMap((document) => document.sectionIds),
    sections: {
      ...sections,
      [firstSectionId]: {
        ...firstSection,
        stimulusIds: [...firstSection.stimulusIds, mediaStimulusId],
      },
    },
    stimuli: {
      ...Object.fromEntries(documents.flatMap((document) => Object.entries(document.stimuli))),
      [mediaStimulusId]: {
        stimulusId: mediaStimulusId,
        kind: 'media',
        title: 'Imported lifecycle diagram',
        content: {
          kind: 'media-content',
          mediaUrl: 'https://example.test/reading-v2/lifecycle.png',
          alt: 'Lifecycle diagram used by the mixed Reading V2 vertical loop test.',
          caption: 'Lifecycle diagram',
          source: 'Teacher import fixture',
        },
        anchorIds: [],
      },
    },
    anchors: Object.fromEntries(documents.flatMap((document) => Object.entries(document.anchors))),
    taskGroups: {
      ...taskGroups,
      [tableTaskGroupId]: {
        ...tableTaskGroup,
        importEvidenceRefs: [readingV2Ids.importEvidenceId('import-evidence-table-completion')],
      },
    },
    interactions: Object.fromEntries(
      documents.flatMap((document) => Object.entries(document.interactions)),
    ),
    optionSets: Object.fromEntries(
      documents.flatMap((document) => Object.entries(document.optionSets)),
    ),
    validationState: { issues: [] },
  };
};

export const clearReadingV2VerticalLoopImportEvidence = (
  document: ReadingV2Document,
): ReadingV2Document => ({
  ...document,
  taskGroups: Object.fromEntries(
    Object.entries(document.taskGroups).map(([taskGroupId, taskGroup]) => {
      const cleanTaskGroup = { ...taskGroup };
      delete (cleanTaskGroup as { importEvidenceRefs?: unknown }).importEvidenceRefs;
      return [taskGroupId as ReadingV2TaskGroupId, cleanTaskGroup];
    }),
  ),
});
