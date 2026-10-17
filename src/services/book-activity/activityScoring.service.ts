import type {
  ActivityScoreResult,
  ActivitySubmission,
  NormalizedActivity,
} from '../../types/bookActivity.types';

const MAX_ACTIVITY_SCORE = 10_000;
const MAX_TEXT_ANSWER_LENGTH = 4_000;
const MAX_LONG_RESPONSE_LENGTH = 20_000;
const RUNTIME_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/u;

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const normalize = (
  value: string,
  rule: NormalizedActivity['answerRule'],
): string =>
  rule.normalization === 'trim-case-and-spacing'
    ? value.trim().replace(/\s+/gu, ' ').toLowerCase()
    : value;

const invalid = (errors: string[]): ActivityScoreResult => ({
  status: 'invalid',
  errors,
});

const ownEnumerableDataValue = (
  value: object,
  key: PropertyKey,
): unknown | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
};

const denseArray = (value: unknown, maximum: number): value is unknown[] => {
  if (!Array.isArray(value) || value.length > maximum) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (
      typeof key !== 'string' ||
      !/^(0|[1-9]\d*)$/u.test(key) ||
      Number(key) >= value.length ||
      ownEnumerableDataValue(value, key) === undefined
    ) {
      return false;
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (
      !Object.hasOwn(value, index) ||
      ownEnumerableDataValue(value, String(index)) === undefined
    ) {
      return false;
    }
  }
  return true;
};

const exactPair = (
  value: unknown,
): value is { leftItemId: string; rightItemId: string } => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  const leftItemId = ownEnumerableDataValue(value, 'leftItemId');
  const rightItemId = ownEnumerableDataValue(value, 'rightItemId');
  return (
    keys.length === 2 &&
    keys.every(
      (key) =>
        typeof key === 'string' &&
        ['leftItemId', 'rightItemId'].includes(key) &&
        Object.prototype.propertyIsEnumerable.call(value, key),
    ) &&
    typeof leftItemId === 'string' &&
    RUNTIME_ID_PATTERN.test(leftItemId) &&
    typeof rightItemId === 'string' &&
    RUNTIME_ID_PATTERN.test(rightItemId)
  );
};

const exactSubmissionEntry = (
  value: unknown,
): value is ActivitySubmission[number] => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 2 &&
    keys.every(
      (key) =>
        typeof key === 'string' &&
        ['interactionId', 'answer'].includes(key) &&
        Object.prototype.propertyIsEnumerable.call(value, key) &&
        Object.hasOwn(
          Object.getOwnPropertyDescriptor(value, key) ?? {},
          'value',
        ),
    ) &&
    typeof (value as { interactionId?: unknown }).interactionId === 'string' &&
    RUNTIME_ID_PATTERN.test(
      (value as { interactionId: string }).interactionId,
    ) &&
    Object.hasOwn(value, 'answer')
  );
};

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  left.every((entry) => right.includes(entry)) &&
  right.every((entry) => left.includes(entry));

/**
 * Scores bounded identity-based objective answers. Partial answers are valid
 * and earn zero for an incomplete Interaction; malformed/stale identities fail.
 * Long-response payloads are bounded first and then remain review-required.
 */
const scoreValidatedActivity = (
  activity: NormalizedActivity,
  submission: ActivitySubmission,
): ActivityScoreResult => {
  if (
    !denseArray(submission, activity.interactions.length) ||
    submission.length !== activity.interactions.length ||
    !submission.every(exactSubmissionEntry)
  ) {
    return invalid(['Submission cardinality or array shape does not match Activity.']);
  }
  const interactionIds = new Set(
    activity.interactions.map((interaction) => interaction.interactionId),
  );
  const submittedIds = new Set(submission.map((entry) => entry.interactionId));
  if (
    submittedIds.size !== submission.length ||
    submission.some((entry) => !interactionIds.has(entry.interactionId))
  ) {
    return invalid(['Submission has duplicate, missing, or stale Interaction identity.']);
  }
  const answers = new Map(
    submission.map((entry) => [entry.interactionId, entry.answer]),
  );

  const family = activity.interaction.family;
  if (family === 'long-response' && activity.scoring.mode !== 'review-required') {
    return invalid(['Activity scoring mode contradicts its interaction family.']);
  }

  let earned = 0;
  let maximum = 0;
  for (let index = 0; index < activity.interactions.length; index += 1) {
    const interaction = activity.interactions[index]!;
    const answer = answers.get(interaction.interactionId);
    if (answer === undefined) {
      return invalid([`Submission is missing interaction ${interaction.interactionId}.`]);
    }
    if (
      interaction.family !== family ||
      interaction.itemIdentities.family !== family ||
      interaction.answerKey.family !== family
    ) {
      return invalid([`Canonical identity family mismatch at interaction ${index}.`]);
    }

    if (family === 'long-response') {
      if (
        answer !== null &&
        (typeof answer !== 'string' || answer.length > MAX_LONG_RESPONSE_LENGTH)
      ) {
        return invalid([`Invalid long-response answer at interaction ${index}.`]);
      }
      continue;
    }

    const points = interaction.points ?? activity.answerRule.defaultPoints;
    if (!Number.isFinite(points) || points < 0 || points > MAX_ACTIVITY_SCORE) {
      return invalid(['Invalid score bounds.']);
    }
    maximum += points;
    if (!Number.isFinite(maximum) || maximum > MAX_ACTIVITY_SCORE) {
      return invalid(['Activity score exceeds maximum bound.']);
    }

    let correct = false;
    if (
      family === 'choice' &&
      interaction.itemIdentities.family === 'choice' &&
      interaction.answerKey.family === 'choice'
    ) {
      const identities = interaction.itemIdentities;
      const answerKey = interaction.answerKey;
      const selected = answer === null ? [] : answer;
      const requiredCount =
        activity.answerRule.requiredSelectionCount ??
        answerKey.acceptedOptionItemIds.length;
      if (
        !denseArray(selected, requiredCount) ||
        selected.some(
          (entry) =>
            typeof entry !== 'string' || !RUNTIME_ID_PATTERN.test(entry),
        ) ||
        new Set(selected as string[]).size !== selected.length ||
        selected.some(
          (entry) =>
            !identities.optionIds.includes(entry as string),
        )
      ) {
        return invalid([`Invalid choice answer at interaction ${index}.`]);
      }
      correct =
        selected.length === requiredCount &&
        sameSet(
          selected as string[],
          answerKey.acceptedOptionItemIds,
        );
    } else if (
      family === 'text-entry' &&
      interaction.answerKey.family === 'text-entry'
    ) {
      const text = answer === null ? '' : answer;
      if (typeof text !== 'string' || text.length > MAX_TEXT_ANSWER_LENGTH) {
        return invalid([`Invalid text answer at interaction ${index}.`]);
      }
      correct = interaction.answerKey.acceptedAnswers.some(
        (accepted) =>
          normalize(accepted, activity.answerRule) ===
          normalize(text, activity.answerRule),
      );
    } else if (
      family === 'matching' &&
      interaction.itemIdentities.family === 'matching' &&
      interaction.answerKey.family === 'matching'
    ) {
      const pairs = answer === null ? [] : answer;
      if (
        !denseArray(pairs, interaction.itemIdentities.leftItemIds.length) ||
        !pairs.every(exactPair)
      ) {
        return invalid([`Invalid matching answer at interaction ${index}.`]);
      }
      const leftIds = new Set<string>();
      const rightIds = new Set<string>();
      for (const pair of pairs) {
        if (
          !interaction.itemIdentities.leftItemIds.includes(pair.leftItemId) ||
          !interaction.itemIdentities.rightItemIds.includes(pair.rightItemId) ||
          leftIds.has(pair.leftItemId) ||
          (activity.answerRule.allowOptionReuse !== true &&
            rightIds.has(pair.rightItemId))
        ) {
          return invalid([`Invalid matching answer at interaction ${index}.`]);
        }
        leftIds.add(pair.leftItemId);
        rightIds.add(pair.rightItemId);
      }
      const submitted = new Map(
        pairs.map((pair) => [pair.leftItemId, pair.rightItemId]),
      );
      correct =
        pairs.length === interaction.answerKey.acceptedPairs.length &&
        interaction.answerKey.acceptedPairs.every(
          (pair) => submitted.get(pair.leftItemId) === pair.rightItemId,
        );
    } else if (
      family === 'ordering' &&
      interaction.itemIdentities.family === 'ordering' &&
      interaction.answerKey.family === 'ordering'
    ) {
      const identities = interaction.itemIdentities;
      const answerKey = interaction.answerKey;
      const itemIds = answer === null ? [] : answer;
      if (
        !denseArray(itemIds, identities.itemIds.length) ||
        itemIds.some(
          (entry) =>
            typeof entry !== 'string' || !RUNTIME_ID_PATTERN.test(entry),
        ) ||
        new Set(itemIds as string[]).size !== itemIds.length ||
        itemIds.some(
          (entry) =>
            !identities.itemIds.includes(entry as string),
        )
      ) {
        return invalid([`Invalid ordering answer at interaction ${index}.`]);
      }
      correct =
        itemIds.length === answerKey.acceptedOrderItemIds.length &&
        itemIds.every(
          (entry, itemIndex) =>
            entry === answerKey.acceptedOrderItemIds[itemIndex],
        );
    } else {
      return invalid([`Unsupported canonical family at interaction ${index}.`]);
    }

    if (correct) earned += points;
  }

  if (
    family === 'long-response' ||
    activity.scoring.mode === 'review-required'
  ) {
    return { status: 'review_required' };
  }
  const roundedEarned = round(earned);
  const roundedMaximum = round(maximum);
  return {
    status: 'scored',
    earnedScore: roundedEarned,
    maximumScore: roundedMaximum,
    displayScore: `${roundedEarned.toFixed(2)} / ${roundedMaximum.toFixed(2)}`,
  };
};

export const scoreActivity = (
  activity: NormalizedActivity,
  submission: ActivitySubmission,
): ActivityScoreResult => {
  try {
    return scoreValidatedActivity(activity, submission);
  } catch {
    return invalid(['Submission could not be safely inspected.']);
  }
};
