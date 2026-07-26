import type {
  ActivityIdProvider,
  ActivityInteraction,
  ActivityItemIdentities,
  ActivityNormalizedAnswerKey,
  ActivityValidationContext,
  EditableActivity,
  NormalizedActivity,
  NormalizedActivityInteraction,
} from '../../types/bookActivity.types';
import { validateEditableActivity } from './activitySchema.service';

const SYSTEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/u;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

interface StructuralInteraction {
  prompt: string;
  sourceAssisted?: ActivityInteraction['sourceAssisted'];
  options?: string[];
  leftItems?: string[];
  rightItems?: string[];
  orderingItems?: string[];
}

const interactionShape = (
  interaction: StructuralInteraction,
  family: string,
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

const topologySignature = (
  activity: {
    interaction: EditableActivity['interaction'];
    answerRule: EditableActivity['answerRule'];
    interactions: StructuralInteraction[];
  },
): string =>
  stable({
    family: activity.interaction.family,
    variant: activity.interaction.variant,
    responseRules: {
      requiredSelectionCount:
        activity.answerRule.requiredSelectionCount ?? null,
      allowOptionReuse: activity.answerRule.allowOptionReuse ?? null,
    },
    interactions: activity.interactions.map((interaction) =>
      interactionShape(interaction, activity.interaction.family),
    ),
  });

const semanticValue = (
  value: string,
  normalization: EditableActivity['answerRule']['normalization'],
): string =>
  normalization === 'trim-case-and-spacing'
    ? value.trim().replace(/\s+/gu, ' ').toLowerCase()
    : value;

const identityValues = (identities: ActivityItemIdentities): string[] => {
  if (identities.family === 'choice') return identities.optionIds;
  if (identities.family === 'matching') {
    return [...identities.leftItemIds, ...identities.rightItemIds];
  }
  return identities.itemIds;
};

const assertPreviousIdentityIntegrity = (previous: NormalizedActivity): Set<string> => {
  const ids = new Set<string>();
  const reserve = (id: unknown): void => {
    if (typeof id !== 'string' || !SYSTEM_ID_PATTERN.test(id) || ids.has(id)) {
      throw new Error('Previous normalized Activity has invalid or duplicate hidden identity.');
    }
    ids.add(id);
  };

  previous.interactions.forEach((interaction, index) => {
    const identities = interaction.itemIdentities;
    const answerKey = interaction.answerKey;
    reserve(interaction.interactionId);
    if (
      interaction.family !== previous.interaction.family ||
      identities.family !== previous.interaction.family ||
      answerKey.family !== previous.interaction.family
    ) {
      throw new Error(`Previous normalized Activity identity family mismatch at interaction ${index}.`);
    }
    identityValues(identities).forEach(reserve);

    if (identities.family === 'choice') {
      if (
        identities.optionIds.length !== (interaction.options?.length ?? -1) ||
        answerKey.family !== 'choice' ||
        new Set(answerKey.acceptedOptionItemIds).size !==
          answerKey.acceptedOptionItemIds.length ||
        answerKey.acceptedOptionItemIds.some(
          (id) => !identities.optionIds.includes(id),
        )
      ) {
        throw new Error(`Previous normalized Activity choice identity mismatch at interaction ${index}.`);
      }
    } else if (identities.family === 'matching') {
      if (
        identities.leftItemIds.length !==
          (interaction.leftItems?.length ?? -1) ||
        identities.rightItemIds.length !==
          (interaction.rightItems?.length ?? -1) ||
        answerKey.family !== 'matching' ||
        answerKey.acceptedPairs.length !== identities.leftItemIds.length
      ) {
        throw new Error(`Previous normalized Activity matching identity mismatch at interaction ${index}.`);
      }
      const leftIds = new Set<string>();
      const rightIds = new Set<string>();
      answerKey.acceptedPairs.forEach((pair) => {
        if (
          !identities.leftItemIds.includes(pair.leftItemId) ||
          !identities.rightItemIds.includes(pair.rightItemId) ||
          leftIds.has(pair.leftItemId) ||
          (previous.answerRule.allowOptionReuse !== true && rightIds.has(pair.rightItemId))
        ) {
          throw new Error(
            `Previous normalized Activity matching answer identity mismatch at interaction ${index}.`,
          );
        }
        leftIds.add(pair.leftItemId);
        rightIds.add(pair.rightItemId);
      });
    } else if (identities.family === 'ordering') {
      if (
        identities.itemIds.length !==
          (interaction.orderingItems?.length ?? -1) ||
        answerKey.family !== 'ordering' ||
        answerKey.acceptedOrderItemIds.length !== identities.itemIds.length ||
        new Set(answerKey.acceptedOrderItemIds).size !==
          answerKey.acceptedOrderItemIds.length ||
        answerKey.acceptedOrderItemIds.some(
          (id) => !identities.itemIds.includes(id),
        )
      ) {
        throw new Error(`Previous normalized Activity ordering identity mismatch at interaction ${index}.`);
      }
    } else if (identityValues(identities).length !== 0) {
      throw new Error(`Previous normalized Activity has unexpected item identities at interaction ${index}.`);
    }
  });
  return ids;
};

export const cryptoActivityIdProvider: ActivityIdProvider = {
  createId: () => {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Cryptographically strong Activity ID provider unavailable.');
    }
    return globalThis.crypto.randomUUID();
  },
};

const createItemIdentities = (
  interaction: ActivityInteraction,
  family: EditableActivity['interaction']['family'],
  allocate: () => string,
): ActivityItemIdentities => {
  if (family === 'choice') {
    return {
      family,
      optionIds: (interaction.options ?? []).map(() => allocate()),
    };
  }
  if (family === 'matching') {
    return {
      family,
      leftItemIds: (interaction.leftItems ?? []).map(() => allocate()),
      rightItemIds: (interaction.rightItems ?? []).map(() => allocate()),
    };
  }
  if (family === 'ordering') {
    return {
      family,
      itemIds: (interaction.orderingItems ?? []).map(() => allocate()),
    };
  }
  return { family, itemIds: [] };
};

const createAnswerKey = (
  interaction: ActivityInteraction,
  identities: ActivityItemIdentities,
  answerRule: EditableActivity['answerRule'],
): ActivityNormalizedAnswerKey => {
  if (identities.family === 'choice') {
    return {
      family: 'choice',
      acceptedOptionItemIds: (interaction.acceptedOptionIndexes ?? []).map(
        (index) => identities.optionIds[index]!,
      ),
    };
  }
  if (identities.family === 'text-entry') {
    return {
      family: 'text-entry',
      acceptedAnswers: [...(interaction.acceptedAnswers ?? [])],
    };
  }
  if (identities.family === 'matching') {
    const leftIndex = new Map(
      (interaction.leftItems ?? []).map((entry, index) => [
        semanticValue(entry, answerRule.normalization),
        index,
      ]),
    );
    const rightIndex = new Map(
      (interaction.rightItems ?? []).map((entry, index) => [
        semanticValue(entry, answerRule.normalization),
        index,
      ]),
    );
    return {
      family: 'matching',
      acceptedPairs: (interaction.acceptedPairs ?? []).map((pair) => ({
        leftItemId:
          identities.leftItemIds[
            leftIndex.get(semanticValue(pair.left, answerRule.normalization))!
          ]!,
        rightItemId:
          identities.rightItemIds[
            rightIndex.get(semanticValue(pair.right, answerRule.normalization))!
          ]!,
      })),
    };
  }
  if (identities.family === 'ordering') {
    return {
      family: 'ordering',
      acceptedOrderItemIds: (interaction.acceptedOrder ?? []).map(
        (index) => identities.itemIds[index]!,
      ),
    };
  }
  return {
    family: 'long-response',
    rubric: clone(interaction.rubric ?? { criteria: [] }),
  };
};

const withoutEditableAnswer = (
  interaction: ActivityInteraction,
): Omit<
  ActivityInteraction,
  'acceptedOptionIndexes' | 'acceptedAnswers' | 'acceptedPairs' | 'acceptedOrder' | 'rubric'
> => {
  const {
    acceptedOptionIndexes: _acceptedOptionIndexes,
    acceptedAnswers: _acceptedAnswers,
    acceptedPairs: _acceptedPairs,
    acceptedOrder: _acceptedOrder,
    rubric: _rubric,
    ...runtimeFields
  } = interaction;
  return runtimeFields;
};

/**
 * Creates opaque runtime identities only after complete editable validation.
 * Production defaults to crypto.randomUUID; tests may inject a deterministic provider.
 */
export const normalizeActivity = (
  value: unknown,
  idProvider: ActivityIdProvider = cryptoActivityIdProvider,
  previous?: NormalizedActivity,
  validationContext: ActivityValidationContext = {},
): NormalizedActivity => {
  const result = validateEditableActivity(value, validationContext);
  if (!result.valid) {
    throw new Error(
      result.errors.map((entry) => `${entry.path}: ${entry.message}`).join('\n'),
    );
  }

  const editable = clone(result.value);
  const unavailableIds = previous
    ? assertPreviousIdentityIntegrity(previous)
    : new Set<string>();
  const preserveAll =
    previous !== undefined &&
    topologySignature(previous) === topologySignature(editable);
  const newIds = new Set<string>();
  const allocate = (): string => {
    const id = idProvider.createId();
    if (
      typeof id !== 'string' ||
      !SYSTEM_ID_PATTERN.test(id) ||
      unavailableIds.has(id) ||
      newIds.has(id)
    ) {
      throw new Error('Trusted Activity ID provider returned invalid or duplicate identity.');
    }
    newIds.add(id);
    return id;
  };

  const interactions = editable.interactions.map(
    (interaction, index) => {
      const old = preserveAll ? previous!.interactions[index]! : undefined;
      const itemIdentities = old
        ? clone(old.itemIdentities)
        : createItemIdentities(interaction, editable.interaction.family, allocate);
      return {
        ...withoutEditableAnswer(interaction),
        family: editable.interaction.family,
        interactionId: old?.interactionId ?? allocate(),
        itemIdentities,
        answerKey: createAnswerKey(interaction, itemIdentities, editable.answerRule),
      } as NormalizedActivityInteraction;
    },
  );

  return { ...editable, interactions } as NormalizedActivity;
};
