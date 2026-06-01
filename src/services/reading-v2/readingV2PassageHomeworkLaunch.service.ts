import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type {
  HomeworkAssignment,
  ReadingPassageHomeworkSetItem,
  ReadingPassageHomeworkSnapshot,
} from '../../types/homework.types';
import type {
  ReadingV2DerivedProjection,
  ReadingV2ProjectedAnchor,
  ReadingV2ProjectedInteraction,
  ReadingV2ProjectedOptionSet,
  ReadingV2ProjectedStimulus,
  ReadingV2ProjectedTaskGroup,
  ReadingV2ProjectionContent,
} from './readingV2Projection.service';

export type ReadingPassageHomeworkKind = 'single' | 'set';

export interface ReadingPassageHomeworkSummary {
  readonly kind: ReadingPassageHomeworkKind;
  readonly label: 'Reading Passage' | 'Reading Passage Set';
  readonly title: string;
  readonly passageCount: number;
  readonly questionCount: number;
  readonly meta: readonly string[];
  readonly passageTitles: readonly string[];
}

export type ReadingPassageHomeworkLaunchItem = ReadingPassageHomeworkSetItem;

const isReadingPassageHomeworkSetItem = (
  value: ReadingPassageHomeworkSnapshot | ReadingPassageHomeworkSetItem,
): value is ReadingPassageHomeworkSetItem =>
  typeof (value as ReadingPassageHomeworkSetItem).order === 'number';

export const getReadingPassageHomeworkLaunchItems = (
  homework: Pick<HomeworkAssignment, 'materialType' | 'readingPassageSnapshot' | 'readingPassageSet'>,
): ReadingPassageHomeworkLaunchItem[] => {
  if (homework.materialType === 'reading-passage' && homework.readingPassageSnapshot) {
    return [{
      ...homework.readingPassageSnapshot,
      order: 1,
    }];
  }

  if (homework.materialType === 'reading-passage-set' && homework.readingPassageSet) {
    return [...homework.readingPassageSet.items].sort((left, right) => left.order - right.order);
  }

  return [];
};

export const getReadingPassageHomeworkSummary = (
  homework: Pick<
    HomeworkAssignment,
    'materialTitle' | 'materialType' | 'readingPassageSnapshot' | 'readingPassageSet' | 'title'
  >,
): ReadingPassageHomeworkSummary | null => {
  const items = getReadingPassageHomeworkLaunchItems(homework);

  if (items.length === 0) {
    return null;
  }

  const questionCount = items.reduce((sum, item) => sum + item.questionCount, 0);

  if (homework.materialType === 'reading-passage') {
    const item = items[0];
    if (!item) {
      return null;
    }

    const meta = [
      item.sourceOrderDisplay,
      item.sourceFullTestTitle,
      `Snapshot ${item.snapshotVersionId}`,
    ].filter((entry): entry is string => Boolean(entry));

    return {
      kind: 'single',
      label: 'Reading Passage',
      title: homework.title || item.titleSnapshot || homework.materialTitle,
      passageCount: 1,
      questionCount,
      meta,
      passageTitles: [item.titleSnapshot],
    };
  }

  return {
    kind: 'set',
    label: 'Reading Passage Set',
    title: homework.title || homework.readingPassageSet?.titleSnapshot || homework.materialTitle,
    passageCount: items.length,
    questionCount,
    meta: [`${items.length} passages`, `${questionCount} questions`],
    passageTitles: items.map((item) => item.titleSnapshot),
  };
};

const prefixId = (prefix: string, value: string | undefined): string | undefined =>
  value ? `${prefix}:${value}` : undefined;

const prefixIds = (prefix: string, values: readonly string[] | undefined): string[] | undefined =>
  values ? values.map((value) => `${prefix}:${value}`) : undefined;

const prefixAnchorContent = <T,>(prefix: string, content: T): T => {
  if (Array.isArray(content)) {
    return content.map((item) => prefixAnchorContent(prefix, item)) as T;
  }

  if (!content || typeof content !== 'object') {
    return content;
  }

  const next: Record<string, unknown> = {};
  Object.entries(content as Record<string, unknown>).forEach(([key, value]) => {
    if (key === 'anchorId' && typeof value === 'string') {
      next[key] = prefixId(prefix, value);
      return;
    }

    if (key === 'anchorIds' && Array.isArray(value)) {
      next[key] = value.map((item) => (typeof item === 'string' ? prefixId(prefix, item) : item));
      return;
    }

    next[key] = prefixAnchorContent(prefix, value);
  });

  return next as T;
};

const prefixInteraction = (
  prefix: string,
  visibleNumberOffset: number,
  interaction: ReadingV2ProjectedInteraction,
): ReadingV2ProjectedInteraction => ({
  ...interaction,
  interactionId: `${prefix}:${interaction.interactionId}`,
  taskGroupId: `${prefix}:${interaction.taskGroupId}`,
  displayNumber: visibleNumberOffset + interaction.displayNumber,
  ...(interaction.primaryAnchorId ? { primaryAnchorId: `${prefix}:${interaction.primaryAnchorId}` } : {}),
  ...(interaction.contextAnchorIds ? { contextAnchorIds: prefixIds(prefix, interaction.contextAnchorIds) } : {}),
});

const prefixTaskGroup = (
  prefix: string,
  visibleNumberOffset: number,
  taskGroup: ReadingV2ProjectedTaskGroup,
): ReadingV2ProjectedTaskGroup => ({
  ...taskGroup,
  taskGroupId: `${prefix}:${taskGroup.taskGroupId}`,
  instructionBlocks: taskGroup.instructionBlocks.map((block) => ({
    ...block,
    id: `${prefix}:${block.id}`,
  })),
  stimulusRefs: taskGroup.stimulusRefs.map((ref) => ({
    ...ref,
    stimulusId: `${prefix}:${ref.stimulusId}`,
    ...(ref.anchorIds ? { anchorIds: prefixIds(prefix, ref.anchorIds) } : {}),
  })),
  interactions: taskGroup.interactions.map((interaction) =>
    prefixInteraction(prefix, visibleNumberOffset, interaction),
  ),
});

const prefixProjectionContent = (input: {
  readonly item: ReadingPassageHomeworkLaunchItem;
  readonly projection: ReadingV2DerivedProjection;
  readonly visibleNumberOffset: number;
}): ReadingV2ProjectionContent => {
  const prefix = `passage-${input.item.order}`;

  return {
    ...input.projection.content,
    title: input.item.titleSnapshot,
    materialId: input.item.passageMaterialId,
    sections: input.projection.content.sections.map((section) => ({
      ...section,
      sectionId: `${prefix}:${section.sectionId}`,
      title: `Passage ${input.item.order}: ${input.item.titleSnapshot}`,
      stimulusIds: section.stimulusIds.map((stimulusId) => `${prefix}:${stimulusId}`),
      taskGroupIds: section.taskGroupIds.map((taskGroupId) => `${prefix}:${taskGroupId}`),
    })),
    stimuli: input.projection.content.stimuli.map((stimulus): ReadingV2ProjectedStimulus => ({
      ...stimulus,
      stimulusId: `${prefix}:${stimulus.stimulusId}`,
      anchorIds: stimulus.anchorIds.map((anchorId) => `${prefix}:${anchorId}`),
      content: prefixAnchorContent(prefix, stimulus.content),
    })),
    anchors: input.projection.content.anchors.map((anchor): ReadingV2ProjectedAnchor => ({
      ...anchor,
      anchorId: `${prefix}:${anchor.anchorId}`,
      stimulusId: `${prefix}:${anchor.stimulusId}`,
    })),
    taskGroups: input.projection.content.taskGroups.map((taskGroup) =>
      prefixTaskGroup(prefix, input.visibleNumberOffset, taskGroup),
    ),
    optionSets: input.projection.content.optionSets.map((optionSet): ReadingV2ProjectedOptionSet => ({
      ...optionSet,
      optionSetId: `${prefix}:${optionSet.optionSetId}`,
      taskGroupId: `${prefix}:${optionSet.taskGroupId}`,
    })),
  };
};

const countInteractions = (projection: ReadingV2DerivedProjection): number =>
  projection.content.taskGroups.reduce((sum, group) => sum + group.interactions.length, 0);

export const composeReadingPassageSetProjection = (input: {
  readonly homework: Pick<HomeworkAssignment, 'id' | 'materialId' | 'readingPassageSet' | 'materialType'>;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly generatedAt?: string;
}): ReadingV2DerivedProjection => {
  const items = getReadingPassageHomeworkLaunchItems(input.homework);

  if (input.homework.materialType !== 'reading-passage-set' || !input.homework.readingPassageSet) {
    throw new Error('Reading Passage set projection requires reading-passage-set homework.');
  }

  if (items.length === 0 || items.length !== input.projections.length) {
    throw new Error('Reading Passage set projection requires one student-safe projection per assigned passage.');
  }

  let visibleNumberOffset = 0;
  const contents = input.projections.map((projection, index) => {
    const item = items[index];

    if (!item || !isReadingPassageHomeworkSetItem(item)) {
      throw new Error('Reading Passage set item is missing order.');
    }

    if (
      projection.materialId !== item.passageMaterialId ||
      projection.sourceSnapshotVersionId !== item.snapshotVersionId
    ) {
      throw new Error('Reading Passage set projection does not match the assigned snapshot.');
    }

    const content = prefixProjectionContent({
      item,
      projection,
      visibleNumberOffset,
    });
    visibleNumberOffset += countInteractions(projection);
    return content;
  });
  const firstProjection = input.projections[0];
  if (!firstProjection) {
    throw new Error('Reading Passage set projection requires at least one student-safe projection.');
  }

  const interactionCount = contents.reduce(
    (sum, content) => sum + content.taskGroups.reduce((groupSum, group) => groupSum + group.interactions.length, 0),
    0,
  );

  return {
    ...firstProjection,
    deliveryEngine: READING_V2_ENGINE,
    projectionId: `homework-set:${input.homework.id}`,
    sourceDocumentId: `homework:${input.homework.id}`,
    materialId: input.homework.materialId as ReadingV2DerivedProjection['materialId'],
    projectionKind: 'student-safe',
    sourceSnapshotVersionId: `homework-set:${input.homework.id}` as ReadingV2DerivedProjection['sourceSnapshotVersionId'],
    generatedAt: input.generatedAt ?? firstProjection.generatedAt,
    runtimeContract: 'student-runtime',
    content: {
      title: input.homework.readingPassageSet.titleSnapshot,
      materialId: input.homework.materialId,
      sections: contents.flatMap((content) => content.sections),
      stimuli: contents.flatMap((content) => content.stimuli),
      anchors: contents.flatMap((content) => content.anchors),
      taskGroups: contents.flatMap((content) => content.taskGroups),
      optionSets: contents.flatMap((content) => content.optionSets),
    },
    analytics: {
      taskGroupCount: contents.reduce((sum, content) => sum + content.taskGroups.length, 0),
      interactionCount,
      familyCounts: contents
        .flatMap((content) => content.taskGroups)
        .reduce<Record<string, number>>((counts, group) => {
          counts[group.engineeringFamily] = (counts[group.engineeringFamily] ?? 0) + 1;
          return counts;
        }, {}),
    },
  };
};
