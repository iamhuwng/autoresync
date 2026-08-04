import type {
  ActivityFeedbackVisibility,
  NormalizedActivity,
  NormalizedActivityInteraction,
  StudentActivityInteraction,
  StudentActivityProjection,
} from '../../types/bookActivity.types';

const projectInteraction = (
  interaction: NormalizedActivityInteraction,
  family: NormalizedActivity['interaction']['family'],
): StudentActivityInteraction => {
  const identities = interaction.itemIdentities;
  const answerKey = interaction.answerKey;
  if (
    interaction.family !== family ||
    identities.family !== family ||
    answerKey.family !== family
  ) {
    throw new Error('Normalized Activity interaction identity family mismatch.');
  }
  const shared = {
    interactionId: interaction.interactionId,
    prompt: interaction.prompt,
    ...(interaction.sourceAssisted
      ? {
          sourceAssisted: {
            questionLabel: interaction.sourceAssisted.questionLabel,
            accessiblePrompt: interaction.sourceAssisted.accessiblePrompt,
            responseShape: interaction.sourceAssisted.responseShape,
            ...(interaction.sourceAssisted.sourceExerciseLabel === undefined
              ? {}
              : { sourceExerciseLabel: interaction.sourceAssisted.sourceExerciseLabel }),
            ...(interaction.sourceAssisted.sourcePartLabel === undefined
              ? {}
              : { sourcePartLabel: interaction.sourceAssisted.sourcePartLabel }),
          },
        }
      : {}),
  };

  if (family === 'choice' && identities.family === 'choice') {
    if (
      identities.optionIds.length !==
      (interaction.options?.length ?? -1)
    ) {
      throw new Error('Normalized choice option identity cardinality mismatch.');
    }
    return {
      ...shared,
      family,
      options: (interaction.options ?? []).map((label, index) => ({
        itemId: identities.optionIds[index]!,
        label,
      })),
    };
  }

  if (family === 'text-entry') {
    return { ...shared, family };
  }

  if (family === 'matching' && identities.family === 'matching') {
    if (
      identities.leftItemIds.length !==
        (interaction.leftItems?.length ?? -1) ||
      identities.rightItemIds.length !==
        (interaction.rightItems?.length ?? -1)
    ) {
      throw new Error('Normalized matching item identity cardinality mismatch.');
    }
    return {
      ...shared,
      family,
      leftItems: (interaction.leftItems ?? []).map((label, index) => ({
        itemId: identities.leftItemIds[index]!,
        label,
      })),
      rightItems: (interaction.rightItems ?? []).map((label, index) => ({
        itemId: identities.rightItemIds[index]!,
        label,
      })),
    };
  }

  if (family === 'ordering' && identities.family === 'ordering') {
    if (
      identities.itemIds.length !==
      (interaction.orderingItems?.length ?? -1)
    ) {
      throw new Error('Normalized ordering item identity cardinality mismatch.');
    }
    return {
      ...shared,
      family,
      items: (interaction.orderingItems ?? []).map((label, index) => ({
        itemId: identities.itemIds[index]!,
        label,
      })),
    };
  }

  if (family === 'long-response') {
    return { ...shared, family };
  }

  throw new Error('Unsupported normalized Activity interaction projection.');
};

/** Rebuilds a narrow runtime allowlist. Unknown future canonical fields never cross it. */
export const projectStudentActivity = (
  activity: NormalizedActivity,
  feedbackVisibility: ActivityFeedbackVisibility = 'none',
): StudentActivityProjection => {
  if (!['none', 'after-submit', 'after-review'].includes(feedbackVisibility)) {
    throw new Error('Unsupported Activity feedback visibility.');
  }
  return {
  schemaVersion: activity.schemaVersion,
  title: activity.title,
  taskProfile: activity.taskProfile
    ? {
        taxonomyId: activity.taskProfile.taxonomyId,
        typeId: activity.taskProfile.typeId,
        taxonomyVersion: activity.taskProfile.taxonomyVersion,
      }
    : null,
  presentationMode: activity.presentationMode,
  contextRequirement: {
    mode: activity.contextRequirement.mode,
    acceptedKinds: [...activity.contextRequirement.acceptedKinds],
  },
  instructions: activity.instructions.map((instruction) => ({
    text: instruction.text,
  })),
  interaction: {
    family: activity.interaction.family,
    variant: activity.interaction.variant,
  },
  answerRule: {
    defaultPoints: activity.answerRule.defaultPoints,
    normalization: activity.answerRule.normalization,
    ...(activity.answerRule.requiredSelectionCount === undefined
      ? {}
      : {
        requiredSelectionCount: activity.answerRule.requiredSelectionCount,
      }),
    ...(activity.answerRule.allowOptionReuse === undefined
      ? {}
      : { allowOptionReuse: activity.answerRule.allowOptionReuse }),
  },
  stimulus: activity.stimulus
    ? {
        kind: activity.stimulus.kind,
        ...(activity.stimulus.text === undefined
          ? {}
          : { text: activity.stimulus.text }),
      }
    : null,
  assetRefs: activity.assetRefs.map((asset) => ({
    kind: asset.kind,
    assetId: asset.assetId,
  })),
  interactions: activity.interactions.map((interaction) =>
    projectInteraction(interaction, activity.interaction.family),
  ),
  scoring: { mode: activity.scoring.mode, feedbackVisibility },
  } as StudentActivityProjection;
};
