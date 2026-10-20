export interface ReadingV2CompositionNumberingInteractionInput {
  readonly interactionId: string;
  readonly questionCount?: number;
}

export interface ReadingV2CompositionNumberingPassageInput {
  readonly order: number;
  readonly passageMaterialId: string;
  readonly snapshotVersionId: string;
  readonly interactions: readonly ReadingV2CompositionNumberingInteractionInput[];
}

export interface ReadingV2CompositionNumberingPassageRange {
  readonly order: number;
  readonly passageMaterialId: string;
  readonly snapshotVersionId: string;
  readonly firstDisplayNumber: number | null;
  readonly lastDisplayNumber: number | null;
  readonly questionCount: number;
}

export interface ReadingV2CompositionNumbering {
  readonly interactionDisplayNumbers: Readonly<Record<string, number>>;
  readonly passageRanges: readonly ReadingV2CompositionNumberingPassageRange[];
  readonly totalQuestionCount: number;
}

export const composeReadingV2CompositionNumbering = (input: {
  readonly passages: readonly ReadingV2CompositionNumberingPassageInput[];
  readonly previousInteractionDisplayNumbers?: Readonly<Record<string, number>>;
  readonly preserveBeforeOrder?: number;
}): ReadingV2CompositionNumbering => {
  const orderedPassages = [...input.passages].sort((left, right) => left.order - right.order);
  const interactionDisplayNumbers: Record<string, number> = {};
  const passageRanges: ReadingV2CompositionNumberingPassageRange[] = [];
  let nextDisplayNumber = 1;

  orderedPassages.forEach((passage) => {
    const preserve = input.preserveBeforeOrder !== undefined && passage.order < input.preserveBeforeOrder;
    const displayNumbers: number[] = [];

    passage.interactions.forEach((interaction) => {
      const questionCount = Math.max(1, interaction.questionCount ?? 1);
      const preservedNumber = preserve
        ? input.previousInteractionDisplayNumbers?.[interaction.interactionId]
        : undefined;
      const displayNumber = preservedNumber ?? nextDisplayNumber;
      interactionDisplayNumbers[interaction.interactionId] = displayNumber;
      displayNumbers.push(displayNumber, displayNumber + questionCount - 1);
      nextDisplayNumber = Math.max(nextDisplayNumber, displayNumber + questionCount);
    });

    passageRanges.push({
      order: passage.order,
      passageMaterialId: passage.passageMaterialId,
      snapshotVersionId: passage.snapshotVersionId,
      firstDisplayNumber: displayNumbers[0] ?? null,
      lastDisplayNumber: displayNumbers.at(-1) ?? null,
      questionCount: passage.interactions.reduce(
        (total, interaction) => total + Math.max(1, interaction.questionCount ?? 1),
        0,
      ),
    });
  });

  return {
    interactionDisplayNumbers,
    passageRanges,
    totalQuestionCount: passageRanges.reduce((total, passage) => total + passage.questionCount, 0),
  };
};
