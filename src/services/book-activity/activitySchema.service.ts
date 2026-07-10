import {
  BOOK_ACTIVITY_CONTEXT_REQUIREMENTS,
  BOOK_ACTIVITY_INTERACTION_FAMILIES,
  BOOK_ACTIVITY_PRESENTATION_MODES,
  BOOK_ACTIVITY_SCHEMA_VERSION,
  type BookActivityEditableAnswerRule,
  type BookActivityEditableInteraction,
  type BookActivityEditableJson,
  type BookActivityInteractionFamily,
  type BookActivityInteractionRecord,
  type BookActivityNormalizedContent,
  type BookActivityTaskProfile,
} from '../../types/bookActivity.types';

export class BookActivitySchemaError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join('; '));
    this.name = 'BookActivitySchemaError';
    this.issues = issues;
  }
}

export interface NormalizeActivityRevisionOptions {
  readonly previousContent?: BookActivityNormalizedContent | null;
  readonly idFactory?: () => string;
}

export interface CreateActivityIdentityOptions {
  readonly ownerId: string;
  readonly now: string;
  readonly idFactory?: () => string;
}

const FORBIDDEN_EDITABLE_KEYS = new Set([
  'activityId',
  'materialId',
  'versionId',
  'placementId',
  'bookId',
  'nodeId',
  'ownerId',
  'createdBy',
  'updatedBy',
  'publishedAt',
  'publishedBy',
  'provenance',
  'origin',
  'hiddenInteractionId',
  'interactionId',
  'resource',
  'resources',
  'resourceId',
  'taskGroup',
  'taskGroups',
  'taskSet',
  'taskSets',
]);

const TASK_PROFILE_REGISTRY = new Set([
  'ielts:reading-v1',
  'toefl:reading-v1',
  'toeic:reading-v1',
  'sat:reading-v1',
  'generic:activity-v1',
]);

const DEFAULT_ID_FACTORY = (): string =>
  `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const unsupportedKeysIn = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => unsupportedKeysIn(entry, `${prefix}[${index}]`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const own = FORBIDDEN_EDITABLE_KEYS.has(key) ? [path] : [];
    return [...own, ...unsupportedKeysIn(child, path)];
  });
};

const asStringArray = (value: unknown): readonly string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) && value.every(isNonEmptyString) ? value : undefined;
};

const asIntegerArray = (value: unknown): readonly number[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) && value.every(Number.isInteger) ? value : undefined;
};

const normalizeTaskProfile = (
  value: unknown,
  issues: string[],
): BookActivityTaskProfile | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    !isNonEmptyString(value.taxonomyId) ||
    !isNonEmptyString(value.typeId) ||
    !isNonEmptyString(value.taxonomyVersion)
  ) {
    issues.push('taskProfile must be null or a namespaced taxonomy record.');
    return undefined;
  }

  const key = `${value.taxonomyId}:${value.taxonomyVersion}`;
  if (!TASK_PROFILE_REGISTRY.has(key)) {
    issues.push(`Unsupported taskProfile taxonomy: ${key}.`);
  }

  return {
    taxonomyId: value.taxonomyId.trim(),
    typeId: value.typeId.trim(),
    taxonomyVersion: value.taxonomyVersion.trim(),
  };
};

const answerRuleFamily = (
  answerRule: BookActivityEditableAnswerRule,
): BookActivityInteractionFamily | null => {
  switch (answerRule.type) {
    case 'single-choice':
    case 'multiple-choice':
      return 'choice';
    case 'text-exact':
      return 'text-entry';
    case 'matching':
      return 'matching';
    case 'ordering':
      return 'ordering';
    case 'rubric':
      return 'long-response';
    default:
      return null;
  }
};

const normalizeAnswerRule = (
  value: unknown,
  issues: string[],
): BookActivityEditableAnswerRule | null => {
  if (!isRecord(value) || !isNonEmptyString(value.type)) {
    issues.push('answerRule is required.');
    return null;
  }

  const rule = value as unknown as BookActivityEditableAnswerRule;
  if (!answerRuleFamily(rule)) {
    issues.push(`Unsupported answerRule type: ${String(value.type)}.`);
  }

  return {
    type: rule.type,
    correctChoiceIndexes: asIntegerArray(rule.correctChoiceIndexes),
    acceptableAnswers: asStringArray(rule.acceptableAnswers),
    matchingPairs: Array.isArray(rule.matchingPairs)
      ? rule.matchingPairs.filter((entry) => isRecord(entry) && isNonEmptyString(entry.left) && isNonEmptyString(entry.right)) as BookActivityEditableAnswerRule['matchingPairs']
      : undefined,
    ordering: asStringArray(rule.ordering),
    rubric: isNonEmptyString(rule.rubric) ? rule.rubric : undefined,
  };
};

const validateAnswerRulePayload = (
  answerRule: BookActivityEditableAnswerRule,
  interactions: readonly BookActivityEditableInteraction[],
  issues: string[],
): void => {
  switch (answerRule.type) {
    case 'single-choice': {
      const indexes = answerRule.correctChoiceIndexes;
      if (!indexes || indexes.length !== interactions.length) {
        issues.push('single-choice answerRule requires one correct choice index per interaction.');
        return;
      }

      interactions.forEach((interaction, index) => {
        if (!interaction.choices || indexes[index] < 0 || indexes[index] >= interaction.choices.length) {
          issues.push(`single-choice interaction ${index} requires an in-range choice index.`);
        }
      });
      return;
    }
    case 'multiple-choice': {
      const indexes = answerRule.correctChoiceIndexes;
      if (!indexes || indexes.length === 0 || interactions.length !== 1) {
        issues.push('multiple-choice answerRule requires one interaction and at least one correct choice index.');
        return;
      }

      const choices = interactions[0]?.choices;
      if (!choices || indexes.some((index) => index < 0 || index >= choices.length)) {
        issues.push('multiple-choice answerRule contains an out-of-range choice index.');
      }
      return;
    }
    case 'text-exact':
      if (!answerRule.acceptableAnswers || answerRule.acceptableAnswers.length === 0) {
        issues.push('text-exact answerRule requires at least one acceptable answer.');
      }
      return;
    case 'matching':
      if (!answerRule.matchingPairs || answerRule.matchingPairs.length === 0) {
        issues.push('matching answerRule requires at least one matching pair.');
      }
      return;
    case 'ordering':
      if (!answerRule.ordering || answerRule.ordering.length === 0) {
        issues.push('ordering answerRule requires at least one ordered item.');
      }
      return;
    case 'rubric':
      if (!isNonEmptyString(answerRule.rubric)) {
        issues.push('rubric answerRule requires rubric text.');
      }
      return;
  }
};

const validateSourceMetadata = (
  interaction: BookActivityEditableInteraction,
  issues: string[],
  index: number,
): void => {
  if (!interaction.source) {
    issues.push(`source-assisted interaction ${index} requires source metadata.`);
    return;
  }

  if (
    !isNonEmptyString(interaction.source.questionLabel) ||
    !isNonEmptyString(interaction.source.accessiblePrompt) ||
    !isNonEmptyString(interaction.source.responseShape)
  ) {
    issues.push(`source-assisted interaction ${index} requires questionLabel, accessiblePrompt, and responseShape.`);
  }
};

const normalizeInteractions = (
  value: unknown,
  presentationMode: string | undefined,
  issues: string[],
): readonly BookActivityEditableInteraction[] => {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push('interactions must be a non-empty array.');
    return [];
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`interaction ${index} must be an object.`);
      return { family: 'choice', prompt: '' };
    }

    if (!BOOK_ACTIVITY_INTERACTION_FAMILIES.includes(entry.family as BookActivityInteractionFamily)) {
      issues.push(`Unsupported interaction family at ${index}: ${String(entry.family)}.`);
    }

    if (!isNonEmptyString(entry.prompt)) {
      issues.push(`interaction ${index} requires prompt.`);
    }

    if ('answerRule' in entry || 'answerRules' in entry) {
      issues.push('Interactions cannot declare their own answer rules.');
    }

    const interaction = {
      family: entry.family as BookActivityInteractionFamily,
      prompt: isNonEmptyString(entry.prompt) ? entry.prompt : '',
      choices: asStringArray(entry.choices),
      pairs: Array.isArray(entry.pairs)
        ? entry.pairs.filter((pair) => isRecord(pair) && isNonEmptyString(pair.left) && isNonEmptyString(pair.right)) as BookActivityEditableInteraction['pairs']
        : undefined,
      orderingItems: asStringArray(entry.orderingItems),
      responseShape: isNonEmptyString(entry.responseShape) ? entry.responseShape : undefined,
      source: isRecord(entry.source) ? {
        questionLabel: String(entry.source.questionLabel ?? ''),
        accessiblePrompt: String(entry.source.accessiblePrompt ?? ''),
        responseShape: String(entry.source.responseShape ?? ''),
        sourceExerciseLabel: isNonEmptyString(entry.source.sourceExerciseLabel)
          ? entry.source.sourceExerciseLabel
          : undefined,
        sourcePartLabel: isNonEmptyString(entry.source.sourcePartLabel)
          ? entry.source.sourcePartLabel
          : undefined,
      } : undefined,
    };

    if (presentationMode === 'source-assisted') {
      validateSourceMetadata(interaction, issues, index);
    }

    return interaction;
  });
};

export const interactionStructureSignature = (
  interaction: BookActivityEditableInteraction,
): string => JSON.stringify({
  family: interaction.family,
  prompt: interaction.prompt,
  choices: interaction.choices ?? null,
  pairs: interaction.pairs ?? null,
  orderingItems: interaction.orderingItems ?? null,
  responseShape: interaction.responseShape ?? null,
  source: interaction.source ?? null,
});

export const isExactStructureSafeRevision = (
  previous: BookActivityNormalizedContent,
  next: BookActivityEditableJson,
): boolean => (
  previous.interactions.length === next.interactions.length &&
  previous.interactions.every((interaction, index) =>
    interactionStructureSignature(interaction) ===
      interactionStructureSignature(next.interactions[index]))
);

export const validateEditableActivityJson = (
  input: unknown,
): BookActivityEditableJson => {
  const issues: string[] = [];

  if (!isRecord(input)) {
    throw new BookActivitySchemaError(['Activity JSON must be an object.']);
  }

  const forbidden = unsupportedKeysIn(input);
  if (forbidden.length > 0) {
    issues.push(`Editable Activity JSON contains forbidden fields: ${forbidden.join(', ')}.`);
  }

  if (input.schemaVersion !== BOOK_ACTIVITY_SCHEMA_VERSION) {
    issues.push('schemaVersion must be 1.');
  }

  if (!isNonEmptyString(input.title)) {
    issues.push('title is required.');
  }
  const title = isNonEmptyString(input.title) ? input.title.trim() : '';

  if (!BOOK_ACTIVITY_PRESENTATION_MODES.includes(input.presentationMode as never)) {
    issues.push(`Unsupported presentationMode: ${String(input.presentationMode)}.`);
  }

  if (!BOOK_ACTIVITY_CONTEXT_REQUIREMENTS.includes(input.contextRequirement as never)) {
    issues.push(`Unsupported contextRequirement: ${String(input.contextRequirement)}.`);
  }

  const taskProfile = normalizeTaskProfile(input.taskProfile, issues);
  const answerRule = normalizeAnswerRule(input.answerRule, issues);
  const interactions = normalizeInteractions(input.interactions, input.presentationMode as string | undefined, issues);
  const family = interactions[0]?.family;

  if (family && interactions.some((interaction) => interaction.family !== family)) {
    issues.push('Activity interactions must use one interaction family.');
  }

  if (answerRule && family && answerRuleFamily(answerRule) !== family) {
    issues.push('answerRule must match the Activity interaction family.');
  }

  if (answerRule) {
    validateAnswerRulePayload(answerRule, interactions, issues);
  }

  if (input.presentationMode === 'source-assisted' && input.contextRequirement === 'none') {
    issues.push('source-assisted Activities require optional or required context.');
  }

  if (input.stimulus !== undefined && input.stimulus !== null) {
    if (
      !isRecord(input.stimulus) ||
      !(input.stimulus.kind === 'text' || input.stimulus.kind === 'image-ref' || input.stimulus.kind === 'audio-ref') ||
      !isNonEmptyString(input.stimulus.content)
    ) {
      issues.push('stimulus must be embedded text or existing media ref metadata.');
    }
  }

  if (input.assetRefs !== undefined && !asStringArray(input.assetRefs)) {
    issues.push('assetRefs must be non-empty strings when present.');
  }

  if (issues.length > 0 || !answerRule) {
    throw new BookActivitySchemaError(issues);
  }

  return {
    schemaVersion: BOOK_ACTIVITY_SCHEMA_VERSION,
    title,
    taskProfile,
    presentationMode: input.presentationMode as BookActivityEditableJson['presentationMode'],
    contextRequirement: input.contextRequirement as BookActivityEditableJson['contextRequirement'],
    instructions: isNonEmptyString(input.instructions) ? input.instructions : undefined,
    stimulus: input.stimulus === undefined
      ? undefined
      : input.stimulus as BookActivityEditableJson['stimulus'],
    assetRefs: asStringArray(input.assetRefs),
    interactions,
    answerRule,
    scoring: isRecord(input.scoring) && typeof input.scoring.points === 'number'
      ? {
          points: input.scoring.points,
          rubric: isNonEmptyString(input.scoring.rubric) ? input.scoring.rubric : undefined,
        }
      : undefined,
    teacherNotes: isNonEmptyString(input.teacherNotes) ? input.teacherNotes : undefined,
  };
};

export const normalizeActivityRevision = (
  input: unknown,
  options: NormalizeActivityRevisionOptions = {},
): BookActivityNormalizedContent => {
  const editable = validateEditableActivityJson(input);
  const idFactory = options.idFactory ?? DEFAULT_ID_FACTORY;
  const preserveIds = options.previousContent
    ? isExactStructureSafeRevision(options.previousContent, editable)
    : false;

  const interactions: BookActivityInteractionRecord[] = editable.interactions.map((interaction, index) => ({
    ...interaction,
    hiddenInteractionId: preserveIds
      ? options.previousContent!.interactions[index].hiddenInteractionId
      : idFactory(),
  }));

  return {
    ...editable,
    interactions,
  };
};

export const createActivityMaterialIdentity = (
  options: CreateActivityIdentityOptions,
) => {
  const idFactory = options.idFactory ?? DEFAULT_ID_FACTORY;
  const activityId = idFactory();

  return {
    activityId,
    materialId: activityId,
    materialKind: 'interactive-activity' as const,
    ownerId: options.ownerId,
    createdAt: options.now,
    provenance: {
      createdBy: options.ownerId,
      source: 'manual' as const,
    },
  };
};
