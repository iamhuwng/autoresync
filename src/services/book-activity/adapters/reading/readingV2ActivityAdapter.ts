import type {
  ReadingV2DerivedProjection,
  ReadingV2ProjectedInteraction,
  ReadingV2ProjectedStimulus,
  ReadingV2ProjectedTaskGroup,
} from '../../../reading-v2/public';
import { normalizeReadingV2TaskType } from '../../../../types/readingV2Taxonomy';
import type { StudentActivityProjection } from '../../../../types/bookActivity.types';
import type {
  BookActivityAdapterContext,
  BookActivityAdapterResult,
} from '../bookActivityAdapter.types';
import {
  createBookActivityAdapterProjection,
  type AdapterInteraction,
} from '../bookActivityAdapterProjection.service';

export interface ReadingV2BookActivityAdapterInput {
  readonly projection: ReadingV2DerivedProjection;
  readonly contextForTaskGroup?: (
    taskGroupId: string,
  ) => BookActivityAdapterContext | undefined;
}

const failure = (
  code: Exclude<BookActivityAdapterResult, { ok: true }>['code'],
  path: string,
  message: string,
): BookActivityAdapterResult => ({ ok: false, code, path, message });

const optionSetFor = (
  projection: ReadingV2DerivedProjection,
  optionSetId: string,
) => projection.content.optionSets.find((optionSet) => optionSet.optionSetId === optionSetId);

const promptFor = (interaction: ReadingV2ProjectedInteraction): string =>
  (typeof interaction.promptText === 'string' && interaction.promptText.trim()) ||
  `Question ${interaction.displayNumber}`;

const adaptInteraction = (
  projection: ReadingV2DerivedProjection,
  interaction: ReadingV2ProjectedInteraction,
): AdapterInteraction | null => {
  if (!interaction || typeof interaction !== 'object') return null;
  const prompt = promptFor(interaction);
  const questionLabel = String(interaction.displayNumber);
  const shape = interaction.responseShape;
  if (!shape || typeof shape !== 'object' || typeof shape.kind !== 'string') {
    return null;
  }
  if (shape.kind === 'free-text' || shape.kind === 'structured-entry') {
    return {
      family: 'text-entry',
      interactionId: interaction.interactionId,
      prompt,
      questionLabel,
    };
  }
  if (shape.kind === 'binary-judgement') {
    if (shape.vocabulary !== 'TFNG' && shape.vocabulary !== 'YNNG') return null;
    const labels = shape.vocabulary === 'TFNG'
      ? ['True', 'False', 'Not Given']
      : ['Yes', 'No', 'Not Given'];
    return {
      family: 'choice',
      interactionId: interaction.interactionId,
      prompt,
      questionLabel,
      options: labels.map((label) => ({
        itemId: label.toLowerCase().replaceAll(' ', '-'),
        label,
      })),
    };
  }
  const optionSet = optionSetFor(projection, shape.optionSetId);
  if (
    !optionSet ||
    !Array.isArray(optionSet.options) ||
    optionSet.options.length === 0 ||
    !optionSet.options.every((option) =>
      option &&
      typeof option.optionId === 'string' &&
      (typeof option.text === 'string' || typeof option.label === 'string'))
  ) return null;
  const options = optionSet.options.map((option) => ({
    itemId: option.optionId,
    label: option.text || option.label,
  }));
  if (shape.kind === 'single-choice' || shape.kind === 'multi-select') {
    return {
      family: 'choice',
      interactionId: interaction.interactionId,
      prompt,
      questionLabel,
      options,
      ...(shape.kind === 'multi-select'
        ? { requiredSelectionCount: shape.selectionLimit }
        : {}),
    };
  }
  return {
    family: 'matching',
    interactionId: interaction.interactionId,
    prompt,
    questionLabel,
    leftItems: [{ itemId: interaction.interactionId, label: prompt }],
    rightItems: options,
    allowOptionReuse: shape.optionReuse === 'allowed',
  };
};

const stimulusText = (stimulus: ReadingV2ProjectedStimulus): string => {
  const content = stimulus.content;
  if (content.kind === 'passage-content') {
    return content.paragraphs.map((paragraph) => paragraph.text).join('\n');
  }
  if (content.kind === 'table-content') {
    return content.rows
      .map((row) => row.map((cell) => cell.text).join(' | '))
      .join('\n');
  }
  if (content.kind === 'flowchart-content') {
    return content.steps.map((step) => step.text).join('\n');
  }
  if (content.kind === 'diagram-content') return content.imageAlt;
  return [content.alt, content.caption].filter(Boolean).join('\n');
};

const groupStimulusText = (
  projection: ReadingV2DerivedProjection,
  group: ReadingV2ProjectedTaskGroup,
): string | null => {
  try {
    const refs = group.stimulusRefs;
    if (
      !Array.isArray(refs) ||
      refs.length === 0 ||
      !refs.every((ref) => ref && typeof ref.stimulusId === 'string')
    ) return null;
    const stimuli = refs.map((ref) => projection.content.stimuli.find(
      (stimulus) => stimulus.stimulusId === ref.stimulusId,
    ));
    if (stimuli.some((stimulus) => stimulus === undefined)) return null;
    return stimuli
      .filter((stimulus): stimulus is ReadingV2ProjectedStimulus => stimulus !== undefined)
      .map(stimulusText)
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return null;
  }
};

const responseShapeMatchesType = (
  typeId: string,
  shape: ReadingV2ProjectedInteraction['responseShape'],
): boolean => {
  if (!shape || typeof shape !== 'object' || typeof shape.kind !== 'string') return false;
  if (typeId === 'multiple-select') return shape.kind === 'multi-select';
  if (typeId === 'multiple-choice') return shape.kind === 'single-choice';
  if (typeId.startsWith('matching-')) return shape.kind === 'matching';
  if (typeId === 'summary-completion-list') return shape.kind === 'single-choice';
  if (typeId === 'summary-completion-text') return shape.kind === 'free-text';
  if (typeId === 'true-false-not-given' || typeId === 'yes-no-not-given') {
    return shape.kind === 'binary-judgement';
  }
  return true;
};

export const adaptReadingV2ProjectionToBookActivities = (
  input: ReadingV2BookActivityAdapterInput,
): BookActivityAdapterResult => {
  const { projection } = input;
  if (
    projection.runtimeContract !== 'student-runtime' &&
    projection.runtimeContract !== 'teacher-preview'
  ) {
    return failure(
      'unsupported-shape',
      '$.projection.runtimeContract',
      'Reading export is not a student-safe or teacher-preview projection.',
    );
  }
  if (
    !projection.content ||
    !Array.isArray(projection.content.taskGroups) ||
    !Array.isArray(projection.content.stimuli) ||
    !Array.isArray(projection.content.optionSets)
  ) {
    return failure('malformed-export', '$.projection.content', 'Reading projection is malformed.');
  }

  const projections: StudentActivityProjection[] = [];
  for (let index = 0; index < projection.content.taskGroups.length; index += 1) {
    const group = projection.content.taskGroups[index]!;
    if (
      !group ||
      !Array.isArray(group.interactions) ||
      !Array.isArray(group.instructionBlocks) ||
      !Array.isArray(group.stimulusRefs) ||
      typeof group.officialTaskType !== 'string'
    ) {
      return failure(
        'malformed-export',
        `$.projection.content.taskGroups[${index}]`,
        'Reading task group arrays are malformed.',
      );
    }
    const typeId = normalizeReadingV2TaskType(group.officialTaskType);
    if (!typeId) {
      return failure(
        'unsupported-profile',
        `$.projection.content.taskGroups[${index}].officialTaskType`,
        'Reading task type is not in canonical supported coverage.',
      );
    }
    if (
      !group.interactions.every((interaction) =>
        interaction &&
        typeof interaction === 'object' &&
        responseShapeMatchesType(typeId, interaction.responseShape))
    ) {
      return failure(
        'unsupported-shape',
        `$.projection.content.taskGroups[${index}].interactions`,
        'Reading interaction shape contradicts its canonical task type.',
      );
    }
    const interactions = group.interactions.map((interaction) =>
      adaptInteraction(projection, interaction));
    if (interactions.some((interaction) => interaction === null)) {
      return failure(
        'malformed-export',
        `$.projection.content.taskGroups[${index}].interactions`,
        'Reading interaction references a missing or empty option set.',
      );
    }
    const stimulusTextValue = groupStimulusText(projection, group);
    if (stimulusTextValue === null) {
      return failure(
        'malformed-export',
        `$.projection.content.taskGroups[${index}].stimulusRefs`,
        'Every Reading task group must resolve Book-owned stimulus context.',
      );
    }
    const context = input.contextForTaskGroup?.(group.taskGroupId) ?? {};
    if (context.sourceContext?.available !== true) {
      return failure(
        'missing-source-context',
        `$.projection.content.taskGroups[${index}].context`,
        'Reading adapter requires Book-owned source context.',
      );
    }
    const adapted = createBookActivityAdapterProjection({
      taxonomyId: 'ielts-reading',
      typeId,
      title: group.groupTitle?.trim() || projection.content.title,
      instructions: group.instructionBlocks.map((block) => block.text),
      stimulusText: stimulusTextValue,
      interactions: interactions as AdapterInteraction[],
      context,
    });
    if (!adapted.ok) {
      return {
        ...adapted,
        path: `$.projection.content.taskGroups[${index}]${adapted.path === '$' ? '' : adapted.path.slice(1)}`,
      };
    }
    projections.push(...adapted.projections);
  }
  return { ok: true, projections };
};
