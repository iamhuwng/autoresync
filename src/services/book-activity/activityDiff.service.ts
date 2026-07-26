import type {
  ActivityDiff,
  NormalizedActivity,
  NormalizedActivityInteraction,
} from '../../types/bookActivity.types';

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const structuralInteraction = (
  interaction: NormalizedActivityInteraction,
  family: NormalizedActivity['interaction']['family'],
): Record<string, unknown> => {
  const base = {
    prompt: interaction.prompt,
    responseShape: interaction.sourceAssisted?.responseShape ?? null,
  };
  if (family === 'choice') return { ...base, options: interaction.options };
  if (family === 'matching') {
    return {
      ...base,
      leftItems: interaction.leftItems,
      rightItems: interaction.rightItems,
    };
  }
  if (family === 'ordering') {
    return { ...base, orderingItems: interaction.orderingItems };
  }
  return base;
};

const structuralSignatures = (activity: NormalizedActivity): string[] =>
  activity.interactions.map((interaction) =>
    stable(structuralInteraction(interaction, activity.interaction.family)),
  );

const identitySignature = (activity: NormalizedActivity): string =>
  stable(
    activity.interactions.map((interaction) => ({
      interactionId: interaction.interactionId,
      itemIdentities: interaction.itemIdentities,
    })),
  );

const semanticAnswerKey = (
  interaction: NormalizedActivityInteraction,
): unknown => {
  const identities = interaction.itemIdentities;
  const answerKey = interaction.answerKey;
  if (identities.family === 'choice' && answerKey.family === 'choice') {
    return {
      family: 'choice',
      acceptedOptionIndexes: answerKey.acceptedOptionItemIds
        .map((id) => identities.optionIds.indexOf(id))
        .sort((left, right) => left - right),
    };
  }
  if (identities.family === 'text-entry' && answerKey.family === 'text-entry') {
    return {
      family: 'text-entry',
      acceptedAnswers: [...answerKey.acceptedAnswers].sort(),
    };
  }
  if (identities.family === 'matching' && answerKey.family === 'matching') {
    return {
      family: 'matching',
      acceptedPairs: answerKey.acceptedPairs
        .map((pair) => ({
          leftIndex: identities.leftItemIds.indexOf(pair.leftItemId),
          rightIndex: identities.rightItemIds.indexOf(pair.rightItemId),
        }))
        .sort((left, right) => left.leftIndex - right.leftIndex),
    };
  }
  if (identities.family === 'ordering' && answerKey.family === 'ordering') {
    return {
      family: 'ordering',
      acceptedOrder: answerKey.acceptedOrderItemIds.map((id) =>
        identities.itemIds.indexOf(id)),
    };
  }
  if (
    identities.family === 'long-response' &&
    answerKey.family === 'long-response'
  ) {
    return { family: 'long-response', rubric: answerKey.rubric };
  }
  return { family: 'unsupported' };
};

const orderIndependentWhenReordered = (
  values: unknown[],
  pureInteractionReorder: boolean,
): unknown[] =>
  pureInteractionReorder
    ? values.map(stable).sort()
    : values;

const diff = (
  classification: ActivityDiff['classification'],
  reasons: string[],
  requiresRedo = false,
): ActivityDiff => ({ classification, reasons, requiresRedo } as ActivityDiff);

/**
 * Pure deterministic impact classifier. Structural severity wins over display
 * and grading changes; a pure Interaction reorder remains explicit but carries
 * requiresRedo=true per the canonical Activity redo boundary.
 */
export const diffActivities = (
  before: NormalizedActivity | null,
  after: NormalizedActivity | null,
): ActivityDiff => {
  if (!before && after) return diff('added', ['activity-added']);
  if (before && !after) return diff('removed', ['activity-removed']);
  if (!before || !after) return diff('unsupported', ['missing-activity'], true);
  if (
    before.schemaVersion !== after.schemaVersion ||
    before.interaction.family !== after.interaction.family ||
    before.interactions.some(
      (interaction) => interaction.family !== before.interaction.family,
    ) ||
    after.interactions.some(
      (interaction) => interaction.family !== after.interaction.family,
    )
  ) {
    return diff(
      'unsupported',
      ['unsupported-schema-or-family-change'],
      true,
    );
  }

  const reasons: string[] = [];
  const beforeStructure = structuralSignatures(before);
  const afterStructure = structuralSignatures(after);
  const sameCount = beforeStructure.length === afterStructure.length;
  const sameOrderedStructure =
    sameCount && stable(beforeStructure) === stable(afterStructure);
  const pureInteractionReorder =
    sameCount &&
    !sameOrderedStructure &&
    stable([...beforeStructure].sort()) === stable([...afterStructure].sort());

  if (!sameCount) reasons.push('interaction-count');
  if (pureInteractionReorder) reasons.push('interaction-reordered');
  else if (!sameOrderedStructure) reasons.push('response-structure');
  if (before.interaction.variant !== after.interaction.variant) {
    reasons.push('interaction-variant');
  }

  const responseRulesBefore = {
    requiredSelectionCount: before.answerRule.requiredSelectionCount ?? null,
    allowOptionReuse: before.answerRule.allowOptionReuse ?? null,
  };
  const responseRulesAfter = {
    requiredSelectionCount: after.answerRule.requiredSelectionCount ?? null,
    allowOptionReuse: after.answerRule.allowOptionReuse ?? null,
  };
  if (stable(responseRulesBefore) !== stable(responseRulesAfter)) {
    reasons.push('response-rule');
  }

  if (before.presentationMode !== after.presentationMode) reasons.push('presentation');
  if (stable(before.contextRequirement) !== stable(after.contextRequirement)) {
    reasons.push('context');
  }
  if (stable(before.assetRefs) !== stable(after.assetRefs)) {
    reasons.push('context');
  }
  const sourceCorrespondenceBefore = orderIndependentWhenReordered(
    before.interactions.map((interaction) => ({
      structure: structuralInteraction(
        interaction,
        before.interaction.family,
      ),
      questionLabel: interaction.sourceAssisted?.questionLabel ?? null,
      sourceExerciseLabel:
        interaction.sourceAssisted?.sourceExerciseLabel ?? null,
      sourcePartLabel: interaction.sourceAssisted?.sourcePartLabel ?? null,
    })),
    pureInteractionReorder,
  );
  const sourceCorrespondenceAfter = orderIndependentWhenReordered(
    after.interactions.map((interaction) => ({
      structure: structuralInteraction(interaction, after.interaction.family),
      questionLabel: interaction.sourceAssisted?.questionLabel ?? null,
      sourceExerciseLabel:
        interaction.sourceAssisted?.sourceExerciseLabel ?? null,
      sourcePartLabel: interaction.sourceAssisted?.sourcePartLabel ?? null,
    })),
    pureInteractionReorder,
  );
  if (stable(sourceCorrespondenceBefore) !== stable(sourceCorrespondenceAfter)) {
    reasons.push('context');
  }

  const gradingBefore = {
    defaultPoints: before.answerRule.defaultPoints,
    normalization: before.answerRule.normalization,
    scoring: before.scoring,
    interactions: orderIndependentWhenReordered(
      before.interactions.map((interaction) => ({
        structure: structuralInteraction(
          interaction,
          before.interaction.family,
        ),
        points: interaction.points ?? null,
        answerKey: semanticAnswerKey(interaction),
      })),
      pureInteractionReorder,
    ),
  };
  const gradingAfter = {
    defaultPoints: after.answerRule.defaultPoints,
    normalization: after.answerRule.normalization,
    scoring: after.scoring,
    interactions: orderIndependentWhenReordered(
      after.interactions.map((interaction) => ({
        structure: structuralInteraction(
          interaction,
          after.interaction.family,
        ),
        points: interaction.points ?? null,
        answerKey: semanticAnswerKey(interaction),
      })),
      pureInteractionReorder,
    ),
  };
  if (stable(gradingBefore) !== stable(gradingAfter)) {
    reasons.push('answer-or-scoring');
  }

  const displayBefore = {
    title: before.title,
    taskProfile: before.taskProfile,
    instructions: before.instructions,
    stimulus: before.stimulus,
    feedback: orderIndependentWhenReordered(
      before.interactions.map((interaction) => ({
        structure: structuralInteraction(
          interaction,
          before.interaction.family,
        ),
        feedback: interaction.feedback ?? null,
      })),
      pureInteractionReorder,
    ),
    accessiblePrompts: orderIndependentWhenReordered(
      before.interactions.map((interaction) => ({
        structure: structuralInteraction(
          interaction,
          before.interaction.family,
        ),
        accessiblePrompt:
          interaction.sourceAssisted?.accessiblePrompt ?? null,
      })),
      pureInteractionReorder,
    ),
  };
  const displayAfter = {
    title: after.title,
    taskProfile: after.taskProfile,
    instructions: after.instructions,
    stimulus: after.stimulus,
    feedback: orderIndependentWhenReordered(
      after.interactions.map((interaction) => ({
        structure: structuralInteraction(
          interaction,
          after.interaction.family,
        ),
        feedback: interaction.feedback ?? null,
      })),
      pureInteractionReorder,
    ),
    accessiblePrompts: orderIndependentWhenReordered(
      after.interactions.map((interaction) => ({
        structure: structuralInteraction(interaction, after.interaction.family),
        accessiblePrompt:
          interaction.sourceAssisted?.accessiblePrompt ?? null,
      })),
      pureInteractionReorder,
    ),
  };
  if (stable(displayBefore) !== stable(displayAfter)) reasons.push('display');

  if (
    sameOrderedStructure &&
    before.interaction.variant === after.interaction.variant &&
    identitySignature(before) !== identitySignature(after)
  ) {
    reasons.push('unexpected-identity-churn');
  }

  if (reasons.length === 0) return diff('unchanged', []);
  if (reasons.includes('unexpected-identity-churn')) {
    return diff('unsupported', reasons, true);
  }
  if (
    reasons.some((reason) =>
      [
        'interaction-count',
        'response-structure',
        'interaction-variant',
        'response-rule',
      ].includes(reason),
    )
  ) {
    return diff('redo-required', reasons, true);
  }
  if (reasons.includes('interaction-reordered')) {
    return diff('reordered', reasons, true);
  }
  if (reasons.includes('answer-or-scoring')) return diff('regrade', reasons);
  if (reasons.includes('presentation') || reasons.includes('context')) {
    return diff('presentation-context', reasons);
  }
  return diff('display-only', reasons);
};
