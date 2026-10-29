// Firebase omits empty containers; restore the canonical shape without changing persisted content.
import type { ReadingV2Document } from '../../types/readingV2.types';

const restoreArray = <T>(value: readonly T[] | null | undefined): readonly T[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error('Reading V2 Firebase document requires array-valued collections.');
  }
  return value;
};

export const normalizeReadingV2FirebaseDocument = (document: ReadingV2Document): ReadingV2Document => ({
  ...document,
  sectionIds: restoreArray(document.sectionIds),
  sections: Object.fromEntries(
    Object.entries(document.sections ?? {}).map(([sectionId, section]) => [
      sectionId,
      {
        ...section,
        stimulusIds: restoreArray(section.stimulusIds),
        taskGroupIds: restoreArray(section.taskGroupIds),
      },
    ]),
  ),
  stimuli: Object.fromEntries(
    Object.entries(document.stimuli ?? {}).map(([stimulusId, stimulus]) => [
      stimulusId,
      {
        ...stimulus,
        anchorIds: restoreArray(stimulus.anchorIds),
      },
    ]),
  ),
  anchors: document.anchors ?? {},
  taskGroups: Object.fromEntries(
    Object.entries(document.taskGroups ?? {}).map(([taskGroupId, taskGroup]) => [
      taskGroupId,
      {
        ...taskGroup,
        instructionBlocks: restoreArray(taskGroup.instructionBlocks),
        stimulusRefs: restoreArray(taskGroup.stimulusRefs),
        optionSetRefs: restoreArray(taskGroup.optionSetRefs),
        interactionIds: restoreArray(taskGroup.interactionIds),
        validationState: {
          ...taskGroup.validationState,
          issues: restoreArray(taskGroup.validationState?.issues),
        },
      },
    ]),
  ),
  interactions: Object.fromEntries(
    Object.entries(document.interactions ?? {}).map(([interactionId, interaction]) => [
      interactionId,
      {
        ...interaction,
        reviewLabel: interaction.reviewLabel ?? {},
      },
    ]),
  ),
  optionSets: document.optionSets ?? {},
  validationState: {
    ...document.validationState,
    issues: restoreArray(document.validationState?.issues),
  },
});
