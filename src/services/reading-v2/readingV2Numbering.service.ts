import type {
  ReadingV2Interaction,
  ReadingV2InteractionId,
  ReadingV2TaskGroup,
} from '../../types/readingV2.types';

export interface ReadingV2DerivedNumber {
  readonly interactionId: ReadingV2InteractionId;
  readonly displayNumber: number;
  readonly label: string;
}

export const deriveReadingV2VisibleNumbers = (
  taskGroups: readonly ReadingV2TaskGroup[],
  interactions: Readonly<Record<string, ReadingV2Interaction>>,
  startAt = 1,
): ReadingV2DerivedNumber[] => {
  let nextNumber = startAt;
  const derived: ReadingV2DerivedNumber[] = [];

  taskGroups.forEach((taskGroup) => {
    taskGroup.interactionIds.forEach((interactionId) => {
      const interaction = interactions[interactionId];

      if (!interaction || interaction.placeholder === true) {
        return;
      }

      derived.push({
        interactionId,
        displayNumber: nextNumber,
        label: `Q${nextNumber}`,
      });
      nextNumber += 1;
    });
  });

  return derived;
};

export const rebaseReadingV2InteractionOrder = (
  interactionIds: readonly ReadingV2InteractionId[],
  fromIndex: number,
  toIndex: number,
): readonly ReadingV2InteractionId[] => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= interactionIds.length ||
    toIndex >= interactionIds.length
  ) {
    throw new Error('Reading V2 reorder indexes must point at existing interactions.');
  }

  const reordered = [...interactionIds];
  const [moved] = reordered.splice(fromIndex, 1);

  if (!moved) {
    throw new Error('Reading V2 reorder source interaction is missing.');
  }

  reordered.splice(toIndex, 0, moved);
  return reordered;
};
