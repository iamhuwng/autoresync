import {
  ACTIVITY_SCHEMA_VERSION,
  type ActivityInteractionFamily,
  type StudentActivityProjection,
} from '../../types/bookActivity.types';

export interface StudentActivityProjectionDiagnostic {
  readonly code: 'malformed-projection' | 'mixed-interaction-family' | 'conflicting-answer-rule';
  readonly path: string;
  readonly message: string;
}

export type StudentActivityProjectionValidation =
  | { readonly valid: true; readonly value: StudentActivityProjection }
  | { readonly valid: false; readonly diagnostic: StudentActivityProjectionDiagnostic };

const FAMILY_SET = new Set<ActivityInteractionFamily>([
  'choice',
  'text-entry',
  'matching',
  'ordering',
  'long-response',
]);
const PRESENTATION_MODE_SET = new Set(['structured', 'source-assisted']);
const CONTEXT_MODE_SET = new Set(['none', 'optional', 'required']);
const NORMALIZATION_SET = new Set(['exact', 'trim-case-and-spacing']);
const PROFILE_NAMESPACE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const PROFILE_TYPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_RENDERABLE_BYTES = 81_920;
const MAX_INTERACTIONS = 50;
const MAX_INSTRUCTIONS = 100;
const MAX_ASSETS = 100;
const MAX_ITEMS = 100;
const MAX_STRING_LENGTH = 4_000;
const MAX_TOTAL_POINTS = 10_000;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> => {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        allowed.has(key) &&
        Object.prototype.propertyIsEnumerable.call(value, key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'),
    ) &&
    required.every((key) => Object.hasOwn(value, key))
  );
};

const invalid = (
  code: StudentActivityProjectionDiagnostic['code'],
  path: string,
  message: string,
): StudentActivityProjectionValidation => ({ valid: false, diagnostic: { code, path, message } });

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const boundedString = (value: unknown): value is string =>
  nonEmptyString(value) && value.length <= MAX_STRING_LENGTH;

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const isDenseArray = (value: unknown, maximum: number, allowEmpty = false): value is unknown[] =>
  Array.isArray(value) &&
  (allowEmpty || value.length > 0) &&
  value.length <= maximum &&
  Reflect.ownKeys(value).every((key) =>
    key === 'length' ||
    (typeof key === 'string' &&
      /^(0|[1-9]\d*)$/u.test(key) &&
      Number(key) < value.length &&
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')),
  ) &&
  Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);

const normalizedString = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ').toLowerCase();

const hasUniqueBoundedStrings = (
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string[] =>
  isDenseArray(value, maximum, allowEmpty) &&
  value.every(boundedString) &&
  new Set(value.map(normalizedString)).size === value.length;

const responseShapeIsCompatible = (
  family: ActivityInteractionFamily,
  interaction: Record<string, unknown>,
): boolean => {
  const base = ['interactionId', 'prompt', 'family'];
  if (family === 'choice') return exactKeys(interaction, [...base, 'options'], ['sourceAssisted']);
  if (family === 'text-entry' || family === 'long-response') {
    return exactKeys(interaction, base, ['sourceAssisted']);
  }
  if (family === 'matching') {
    return exactKeys(interaction, [...base, 'leftItems', 'rightItems'], ['sourceAssisted']);
  }
  return exactKeys(interaction, [...base, 'items'], ['sourceAssisted']);
};

const firstDuplicateIdPath = (value: unknown, path: string): string | null => {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isPlainRecord(item) || !nonEmptyString(item.itemId)) return null;
    if (seen.has(item.itemId)) return `${path}[${index}].itemId`;
    seen.add(item.itemId);
  }
  return null;
};

const labelledItemsAreValid = (value: unknown): boolean =>
  isDenseArray(value, MAX_ITEMS) &&
  value.every(
    (item) =>
      exactKeys(item, ['itemId', 'label']) &&
      boundedString(item.itemId) &&
      boundedString(item.label),
  );

const sourceAssistedIsValid = (value: unknown, family: ActivityInteractionFamily): boolean =>
  exactKeys(value, ['questionLabel', 'accessiblePrompt', 'responseShape'], [
    'sourceExerciseLabel',
    'sourcePartLabel',
  ]) &&
  boundedString(value.questionLabel) &&
  boundedString(value.accessiblePrompt) &&
  boundedString(value.responseShape) &&
  (value.sourceExerciseLabel === undefined || boundedString(value.sourceExerciseLabel)) &&
  (value.sourcePartLabel === undefined || boundedString(value.sourcePartLabel)) &&
  (boundedString(value.sourceExerciseLabel) || boundedString(value.sourcePartLabel)) &&
  ({
    choice: ['choice', 'single-choice', 'multiple-choice'],
    'text-entry': ['text', 'short-text'],
    matching: ['matching'],
    ordering: ['ordering'],
    'long-response': ['long-response', 'long-text'],
  }[family] as readonly string[]).includes(value.responseShape);

const projectionSupportFieldsAreValid = (value: Record<string, unknown>): boolean =>
  isDenseArray(value.instructions, MAX_INSTRUCTIONS, true) &&
  value.instructions.every(
    (instruction) => exactKeys(instruction, ['text']) && boundedString(instruction.text),
  ) &&
  (value.stimulus === null ||
    (exactKeys(value.stimulus, ['kind'], ['text']) &&
      boundedString(value.stimulus.kind) &&
      (value.stimulus.text === undefined || boundedString(value.stimulus.text)))) &&
  isDenseArray(value.assetRefs, MAX_ASSETS, true) &&
  value.assetRefs.every(
    (asset) =>
      exactKeys(asset, ['kind', 'assetId']) &&
      (asset.kind === 'image' || asset.kind === 'audio') &&
      boundedString(asset.assetId),
  ) &&
  new Set(value.assetRefs.map((asset) => `${(asset as Record<string, string>).kind}\u0000${(asset as Record<string, string>).assetId}`)).size === value.assetRefs.length &&
  exactKeys(value.scoring, ['mode', 'feedbackVisibility']) &&
  (value.scoring.mode === 'auto-where-possible' || value.scoring.mode === 'review-required') &&
  (value.scoring.feedbackVisibility === 'none' ||
    value.scoring.feedbackVisibility === 'after-submit' ||
    value.scoring.feedbackVisibility === 'after-review');

const hasValidatedCorrelatedInteractionShape = (
  value: unknown,
): value is StudentActivityProjection => {
  if (!isPlainRecord(value) ||
      !isPlainRecord(value.interaction) ||
      !Array.isArray(value.interactions)) {
    return false;
  }
  const family = value.interaction.family;
  if (!FAMILY_SET.has(family as ActivityInteractionFamily)) return false;
  return value.interactions.every(
    (interaction) =>
      isPlainRecord(interaction) &&
      interaction.family === family &&
      responseShapeIsCompatible(family as ActivityInteractionFamily, interaction),
  );
};

/** Exact, runtime-neutral validation shared by every student-safe projection consumer. */
export const validateStudentActivityProjection = (
  value: unknown,
): StudentActivityProjectionValidation => {
  if (!isPlainRecord(value)) {
    return invalid('malformed-projection', '$', 'Expected a plain student-safe Activity projection.');
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return invalid('malformed-projection', '$', 'Activity projection must be serializable.');
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_RENDERABLE_BYTES) {
    return invalid('malformed-projection', '$', 'Activity projection exceeds renderer size limit.');
  }
  if (!exactKeys(value, [
    'schemaVersion', 'title', 'taskProfile', 'presentationMode', 'contextRequirement',
    'instructions', 'interaction', 'answerRule', 'stimulus', 'assetRefs', 'interactions', 'scoring',
  ])) {
    return invalid('malformed-projection', '$', 'Activity projection contains unsupported fields.');
  }
  if (value.schemaVersion !== ACTIVITY_SCHEMA_VERSION || !boundedString(value.title)) {
    return invalid('malformed-projection', '$', 'Activity projection identity fields are invalid.');
  }
  if (!projectionSupportFieldsAreValid(value)) {
    return invalid('malformed-projection', '$', 'Activity projection support fields are invalid.');
  }
  if (!PRESENTATION_MODE_SET.has(value.presentationMode as string)) {
    return invalid('malformed-projection', '$.presentationMode', 'Unsupported presentation mode.');
  }
  if (!exactKeys(value.interaction, ['family', 'variant']) ||
      !FAMILY_SET.has(value.interaction.family as ActivityInteractionFamily) ||
      !boundedString(value.interaction.variant)) {
    return invalid('malformed-projection', '$.interaction', 'Activity family and variant are invalid.');
  }
  const family = value.interaction.family as ActivityInteractionFamily;
  if (!exactKeys(value.contextRequirement, ['mode', 'acceptedKinds']) ||
      !CONTEXT_MODE_SET.has(value.contextRequirement.mode as string) ||
      !hasUniqueBoundedStrings(value.contextRequirement.acceptedKinds, MAX_ITEMS, true) ||
      (value.contextRequirement.mode === 'none' && value.contextRequirement.acceptedKinds.length !== 0) ||
      (value.contextRequirement.mode !== 'none' && value.contextRequirement.acceptedKinds.length === 0)) {
    return invalid('malformed-projection', '$.contextRequirement', 'Activity context requirement is invalid.');
  }
  if (value.presentationMode === 'source-assisted' &&
      (value.contextRequirement.mode !== 'required' ||
        !value.contextRequirement.acceptedKinds.includes('book-pages'))) {
    return invalid(
      'malformed-projection',
      '$.contextRequirement',
      'Source-assisted Activities require book-pages context.',
    );
  }
  if (!exactKeys(value.answerRule, ['defaultPoints', 'normalization'], ['requiredSelectionCount', 'allowOptionReuse'])) {
    return invalid('malformed-projection', '$.answerRule', 'Activity answer rule is invalid.');
  }
  const defaultPoints = value.answerRule.defaultPoints;
  if (typeof defaultPoints !== 'number' ||
      !Number.isFinite(defaultPoints) ||
      defaultPoints < 0 ||
      defaultPoints > MAX_TOTAL_POINTS ||
      !NORMALIZATION_SET.has(value.answerRule.normalization as string)) {
    return invalid('malformed-projection', '$.answerRule', 'Activity answer rule is invalid.');
  }
  const hasSelectionCount = value.answerRule.requiredSelectionCount !== undefined;
  const hasReuse = value.answerRule.allowOptionReuse !== undefined;
  if ((hasSelectionCount && family !== 'choice') || (hasReuse && family !== 'matching')) {
    return invalid('conflicting-answer-rule', '$.answerRule', 'Answer rule conflicts with interaction family.');
  }
  if ((hasSelectionCount && !positiveSafeInteger(value.answerRule.requiredSelectionCount)) ||
      (hasReuse && typeof value.answerRule.allowOptionReuse !== 'boolean')) {
    return invalid('malformed-projection', '$.answerRule', 'Activity answer rule fields are invalid.');
  }
  if (!isDenseArray(value.interactions, MAX_INTERACTIONS)) {
    return invalid('malformed-projection', '$.interactions', 'Activity interactions are outside supported bounds.');
  }
  const interactionIds = new Set<string>();
  for (let index = 0; index < value.interactions.length; index += 1) {
    const interaction = value.interactions[index];
    const basePath = `$.interactions[${index}]`;
    if (!isPlainRecord(interaction) || interaction.family !== family) {
      return invalid('mixed-interaction-family', `${basePath}.family`, 'Interaction family must match Activity family.');
    }
    if (!responseShapeIsCompatible(family, interaction) ||
        !boundedString(interaction.interactionId) || !boundedString(interaction.prompt)) {
      return invalid('malformed-projection', basePath, 'Interaction shape is invalid.');
    }
    if (interactionIds.has(interaction.interactionId)) {
      return invalid('malformed-projection', `${basePath}.interactionId`, 'Duplicate interaction ID.');
    }
    interactionIds.add(interaction.interactionId);
    if (value.presentationMode === 'source-assisted' && !sourceAssistedIsValid(interaction.sourceAssisted, family)) {
      return invalid('malformed-projection', `${basePath}.sourceAssisted`, 'Source-assisted metadata is incomplete.');
    }
    if (value.presentationMode === 'structured' && interaction.sourceAssisted !== undefined) {
      return invalid('malformed-projection', `${basePath}.sourceAssisted`, 'Structured Activities cannot contain source metadata.');
    }
    if ((family === 'choice' && !labelledItemsAreValid(interaction.options)) ||
        (family === 'matching' &&
          (!labelledItemsAreValid(interaction.leftItems) || !labelledItemsAreValid(interaction.rightItems))) ||
        (family === 'ordering' && !labelledItemsAreValid(interaction.items)) ||
        (interaction.sourceAssisted !== undefined && !sourceAssistedIsValid(interaction.sourceAssisted, family))) {
      return invalid('malformed-projection', basePath, 'Interaction response data is invalid.');
    }
    if (family === 'choice' && hasSelectionCount &&
        typeof value.answerRule.requiredSelectionCount === 'number' &&
        Array.isArray(interaction.options) &&
        value.answerRule.requiredSelectionCount > interaction.options.length) {
      return invalid(
        'conflicting-answer-rule',
        '$.answerRule.requiredSelectionCount',
        'Required selection count exceeds choice option cardinality.',
      );
    }
    if (family === 'choice' && hasSelectionCount &&
        typeof value.answerRule.requiredSelectionCount === 'number' &&
        isPlainRecord(interaction.sourceAssisted)) {
      const responseShape = interaction.sourceAssisted.responseShape;
      if ((responseShape === 'single-choice' && value.answerRule.requiredSelectionCount !== 1) ||
          (responseShape === 'multiple-choice' && value.answerRule.requiredSelectionCount < 2)) {
        return invalid(
          'conflicting-answer-rule',
          `${basePath}.sourceAssisted.responseShape`,
          'Source response shape conflicts with required selection count.',
        );
      }
    }
    const duplicatePath = family === 'choice'
      ? firstDuplicateIdPath(interaction.options, `${basePath}.options`)
      : family === 'matching'
        ? firstDuplicateIdPath(interaction.leftItems, `${basePath}.leftItems`) ??
          firstDuplicateIdPath(interaction.rightItems, `${basePath}.rightItems`)
        : family === 'ordering'
          ? firstDuplicateIdPath(interaction.items, `${basePath}.items`)
          : null;
    if (duplicatePath) return invalid('malformed-projection', duplicatePath, 'Duplicate item ID.');
  }
  if (value.taskProfile !== null &&
      (!exactKeys(value.taskProfile, ['taxonomyId', 'typeId', 'taxonomyVersion']) ||
        !boundedString(value.taskProfile.taxonomyId) ||
        !PROFILE_NAMESPACE.test(value.taskProfile.taxonomyId) ||
        !boundedString(value.taskProfile.typeId) ||
        !PROFILE_TYPE.test(value.taskProfile.typeId) ||
        !positiveSafeInteger(value.taskProfile.taxonomyVersion))) {
    return invalid('malformed-projection', '$.taskProfile', 'Task Profile is invalid.');
  }
  if (!isPlainRecord(value.scoring)) {
    return invalid('malformed-projection', '$.scoring', 'Activity scoring is invalid.');
  }
  if (value.scoring.mode === 'auto-where-possible' && family === 'long-response') {
    return invalid('malformed-projection', '$.scoring.mode', 'Long-response Activities require review.');
  }
  if (!hasValidatedCorrelatedInteractionShape(value)) {
    return invalid('malformed-projection', '$.interactions', 'Activity projection family correlation is invalid.');
  }
  return { valid: true, value };
};
