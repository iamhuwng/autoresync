import {
  ACTIVITY_CONTEXT_MODES,
  ACTIVITY_INTERACTION_FAMILIES,
  ACTIVITY_PRESENTATION_MODES,
  ACTIVITY_SCHEMA_VERSION,
  type ActivityInteraction,
  type ActivityNormalization,
  type ActivityTaskProfileRegistration,
  type ActivityValidationContext,
  type ActivityValidationError,
  type ActivityValidationResult,
  type EditableActivity,
} from '../../types/bookActivity.types';

const TASK_PROFILE_TAXONOMY_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const TASK_PROFILE_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const LIMIT = {
  bytes: 81_920,
  interactions: 50,
  instructions: 100,
  assets: 100,
  mappedPages: 1_000,
  string: 4_000,
  items: 100,
  totalPoints: 10_000,
} as const;

const FORBIDDEN_FIELDS = new Set([
  'activityId',
  'materialId',
  'versionId',
  'snapshotVersionId',
  'placementId',
  'bookId',
  'nodeId',
  'pageGroupIds',
  'ownerId',
  'createdBy',
  'publishedAt',
  'interactionId',
  'itemId',
  'itemIds',
  'itemIdentities',
  'answerKey',
  'provenance',
]);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const ownEnumerable = (value: object, key: PropertyKey): boolean =>
  Object.prototype.propertyIsEnumerable.call(value, key);

const stringValue = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= LIMIT.string;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const error = (
  errors: ActivityValidationError[],
  path: string,
  code: string,
  message: string,
): void => {
  errors.push({ path, code, message });
};

const exact = (
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: ActivityValidationError[],
  optional: readonly string[] = [],
): value is Record<string, unknown> => {
  if (!record(value)) {
    error(errors, path, 'invalid-record', 'Expected plain object.');
    return false;
  }

  for (const key of Reflect.ownKeys(value)) {
    const keyText = String(key);
    const keyPath = `${path}.${keyText}`;
    if (typeof key !== 'string' || !keys.includes(key)) {
      error(
        errors,
        keyPath,
        FORBIDDEN_FIELDS.has(keyText) ? 'forbidden-field' : 'unknown-field',
        'Field is not allowed.',
      );
    } else if (
      !ownEnumerable(value, key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')
    ) {
      error(errors, keyPath, 'invalid-field', 'Field must be own enumerable.');
    }
  }

  for (const key of keys) {
    if (
      !optional.includes(key) &&
      (!Object.hasOwn(value, key) || !ownEnumerable(value, key))
    ) {
      error(errors, `${path}.${key}`, 'missing-field', 'Field is required.');
    }
  }

  return true;
};

const boundedArray = (
  value: unknown,
  path: string,
  errors: ActivityValidationError[],
  options: { allowEmpty?: boolean; maximum?: number } = {},
): value is unknown[] => {
  if (!Array.isArray(value)) {
    error(errors, path, 'invalid-cardinality', 'Expected array.');
    return false;
  }

  let validShape = true;
  const maximum = options.maximum ?? LIMIT.items;
  if ((!options.allowEmpty && value.length === 0) || value.length > maximum) {
    error(errors, path, 'invalid-cardinality', 'Array cardinality is outside supported bounds.');
    validShape = false;
  }

  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const keyText = String(key);
    const numericIndex =
      typeof key === 'string' &&
      /^(0|[1-9]\d*)$/u.test(key) &&
      Number(key) < value.length;
    if (!numericIndex) {
      error(errors, `${path}.${keyText}`, 'unknown-field', 'Array property is not allowed.');
      validShape = false;
    } else if (
      !ownEnumerable(value, key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')
    ) {
      error(errors, `${path}[${keyText}]`, 'invalid-field', 'Array item must be own enumerable.');
      validShape = false;
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !ownEnumerable(value, String(index))) {
      error(errors, `${path}[${index}]`, 'missing-field', 'Sparse array items are not allowed.');
      validShape = false;
    }
  }

  return validShape;
};

const semanticValue = (value: string, normalization: ActivityNormalization): string =>
  normalization === 'trim-case-and-spacing'
    ? value.trim().replace(/\s+/gu, ' ').toLowerCase()
    : value;

const strings = (
  value: unknown,
  path: string,
  errors: ActivityValidationError[],
  options: {
    allowEmpty?: boolean;
    maximum?: number;
    normalization?: ActivityNormalization;
  } = {},
): value is string[] => {
  if (!boundedArray(value, path, errors, options)) return false;

  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!stringValue(entry)) {
      error(errors, `${path}[${index}]`, 'invalid-value', 'Expected bounded non-empty string.');
      return;
    }
    const semantic = semanticValue(entry, options.normalization ?? 'exact');
    if (seen.has(semantic)) {
      error(
        errors,
        `${path}[${index}]`,
        'duplicate-semantic-item',
        'Values must be semantically unique.',
      );
    }
    seen.add(semantic);
  });
  return true;
};

const safeIntegers = (
  value: unknown,
  path: string,
  errors: ActivityValidationError[],
  options: { allowEmpty?: boolean; maximum?: number } = {},
): value is number[] => {
  if (!boundedArray(value, path, errors, options)) return false;
  const seen = new Set<number>();
  value.forEach((entry, index) => {
    if (!Number.isSafeInteger(entry)) {
      error(errors, `${path}[${index}]`, 'invalid-answer', 'Expected safe integer.');
      return;
    }
    if (seen.has(entry as number)) {
      error(
        errors,
        `${path}[${index}]`,
        'duplicate-semantic-item',
        'Answer indexes must be unique.',
      );
    }
    seen.add(entry as number);
  });
  return true;
};

const validateSourceMetadata = (
  value: unknown,
  family: string,
  path: string,
  errors: ActivityValidationError[],
): void => {
  if (
    !exact(
      value,
      [
        'questionLabel',
        'accessiblePrompt',
        'responseShape',
        'sourceExerciseLabel',
        'sourcePartLabel',
      ],
      path,
      errors,
      ['sourceExerciseLabel', 'sourcePartLabel'],
    )
  ) {
    return;
  }
  for (const key of [
    'questionLabel',
    'accessiblePrompt',
    'responseShape',
  ]) {
    if (!stringValue(value[key])) {
      error(
        errors,
        `${path}.${key}`,
        'invalid-accessibility',
        'Accessible source-assisted correspondence metadata is required.',
      );
    }
  }
  for (const key of ['sourceExerciseLabel', 'sourcePartLabel']) {
    if (value[key] !== undefined && !stringValue(value[key])) {
      error(
        errors,
        `${path}.${key}`,
        'invalid-accessibility',
        'Source correspondence label must be a bounded non-empty string.',
      );
    }
  }
  if (
    !stringValue(value.sourceExerciseLabel) &&
    !stringValue(value.sourcePartLabel)
  ) {
    error(
      errors,
      path,
      'missing-source-correspondence',
      'At least one source exercise or part label is required.',
    );
  }
  const responseShapes: Record<string, readonly string[]> = {
    choice: ['choice', 'single-choice', 'multiple-choice'],
    'text-entry': ['text', 'short-text'],
    matching: ['matching'],
    ordering: ['ordering'],
    'long-response': ['long-response', 'long-text'],
  };
  if (
    stringValue(value.responseShape) &&
    !(responseShapes[family] ?? []).includes(value.responseShape)
  ) {
    error(
      errors,
      `${path}.responseShape`,
      'response-shape-contradiction',
      'Response shape does not match the Activity interaction family.',
    );
  }
};

interface ValidatedAnswerRule {
  normalization: ActivityNormalization;
  requiredSelectionCount?: number;
  allowOptionReuse: boolean;
}

const validateInteraction = (
  value: unknown,
  family: string,
  sourceAssisted: boolean,
  answerRule: ValidatedAnswerRule,
  path: string,
  errors: ActivityValidationError[],
): void => {
  const familyKeys: Record<string, string[]> = {
    choice: [
      'prompt',
      'feedback',
      'points',
      'sourceAssisted',
      'options',
      'acceptedOptionIndexes',
    ],
    'text-entry': [
      'prompt',
      'feedback',
      'points',
      'sourceAssisted',
      'acceptedAnswers',
    ],
    matching: [
      'prompt',
      'feedback',
      'points',
      'sourceAssisted',
      'leftItems',
      'rightItems',
      'acceptedPairs',
    ],
    ordering: [
      'prompt',
      'feedback',
      'points',
      'sourceAssisted',
      'orderingItems',
      'acceptedOrder',
    ],
    'long-response': ['prompt', 'feedback', 'points', 'sourceAssisted', 'rubric'],
  };
  if (
    !exact(value, familyKeys[family] ?? [], path, errors, [
      'feedback',
      'points',
      'sourceAssisted',
    ])
  ) {
    return;
  }

  if (!stringValue(value.prompt)) {
    error(errors, `${path}.prompt`, 'invalid-value', 'Prompt is required.');
  }
  if (value.feedback !== undefined && !stringValue(value.feedback)) {
    error(errors, `${path}.feedback`, 'invalid-value', 'Feedback is invalid.');
  }
  if (
    value.points !== undefined &&
    (!finite(value.points) || value.points < 0 || value.points > LIMIT.totalPoints)
  ) {
    error(
      errors,
      `${path}.points`,
      'invalid-score',
      'Points must be finite and within the Activity score bound.',
    );
  }

  if (sourceAssisted) {
    validateSourceMetadata(value.sourceAssisted, family, `${path}.sourceAssisted`, errors);
  } else if (value.sourceAssisted !== undefined) {
    error(
      errors,
      `${path}.sourceAssisted`,
      'unsupported-field',
      'Structured Activity cannot use source-assisted metadata.',
    );
  }

  if (family === 'choice') {
    const optionsValid = strings(value.options, `${path}.options`, errors, {
      normalization: answerRule.normalization,
    });
    const keyValid = safeIntegers(
      value.acceptedOptionIndexes,
      `${path}.acceptedOptionIndexes`,
      errors,
    );
    if (optionsValid && keyValid) {
      const options = value.options as string[];
      const key = value.acceptedOptionIndexes as number[];
      key.forEach((answerIndex, index) => {
        if (answerIndex < 0 || answerIndex >= options.length) {
          error(
            errors,
            `${path}.acceptedOptionIndexes[${index}]`,
            'invalid-answer',
            'Answer index is outside the declared options.',
          );
        }
      });
      if (
        answerRule.requiredSelectionCount !== undefined &&
        key.length !== answerRule.requiredSelectionCount
      ) {
        error(
          errors,
          `${path}.acceptedOptionIndexes`,
          'invalid-cardinality',
          'Answer key must match requiredSelectionCount.',
        );
      }
      if (
        answerRule.requiredSelectionCount !== undefined &&
        answerRule.requiredSelectionCount > options.length
      ) {
        error(
          errors,
          `${path}.options`,
          'invalid-cardinality',
          'requiredSelectionCount exceeds option cardinality.',
        );
      }
      const responseShape =
        record(value.sourceAssisted) &&
        typeof value.sourceAssisted.responseShape === 'string'
          ? value.sourceAssisted.responseShape
          : undefined;
      const effectiveSelectionCount =
        answerRule.requiredSelectionCount ?? key.length;
      if (
        responseShape === 'single-choice' &&
        effectiveSelectionCount !== 1
      ) {
        error(
          errors,
          `${path}.sourceAssisted.responseShape`,
          'response-shape-contradiction',
          'single-choice requires exactly one selected option.',
        );
      }
      if (
        responseShape === 'multiple-choice' &&
        effectiveSelectionCount < 2
      ) {
        error(
          errors,
          `${path}.sourceAssisted.responseShape`,
          'response-shape-contradiction',
          'multiple-choice requires at least two selected options.',
        );
      }
    }
    return;
  }

  if (family === 'text-entry') {
    strings(value.acceptedAnswers, `${path}.acceptedAnswers`, errors, {
      normalization: answerRule.normalization,
    });
    return;
  }

  if (family === 'matching') {
    const leftValid = strings(value.leftItems, `${path}.leftItems`, errors, {
      normalization: answerRule.normalization,
    });
    const rightValid = strings(value.rightItems, `${path}.rightItems`, errors, {
      normalization: answerRule.normalization,
    });
    const pairsValid = boundedArray(value.acceptedPairs, `${path}.acceptedPairs`, errors);
    if (!leftValid || !rightValid || !pairsValid) return;

    const leftItems = value.leftItems as string[];
    const rightItems = value.rightItems as string[];
    const pairs = value.acceptedPairs as unknown[];
    if (pairs.length !== leftItems.length) {
      error(
        errors,
        `${path}.acceptedPairs`,
        'invalid-cardinality',
        'Exactly one accepted pair per left item is required.',
      );
    }

    const normalizedLeft = new Map(
      leftItems.map((entry) => [semanticValue(entry, answerRule.normalization), entry]),
    );
    const normalizedRight = new Map(
      rightItems.map((entry) => [semanticValue(entry, answerRule.normalization), entry]),
    );
    const coveredLeft = new Set<string>();
    const usedRight = new Set<string>();

    pairs.forEach((pair, index) => {
      const pairPath = `${path}.acceptedPairs[${index}]`;
      if (!exact(pair, ['left', 'right'], pairPath, errors)) return;
      if (!stringValue(pair.left) || !stringValue(pair.right)) {
        error(errors, pairPath, 'invalid-answer', 'Pair must contain bounded strings.');
        return;
      }
      const left = semanticValue(pair.left, answerRule.normalization);
      const right = semanticValue(pair.right, answerRule.normalization);
      if (!normalizedLeft.has(left)) {
        error(errors, `${pairPath}.left`, 'invalid-answer', 'Pair left item is undeclared.');
      } else if (coveredLeft.has(left)) {
        error(
          errors,
          `${pairPath}.left`,
          'duplicate-semantic-item',
          'Each left item must appear exactly once.',
        );
      }
      if (!normalizedRight.has(right)) {
        error(errors, `${pairPath}.right`, 'invalid-answer', 'Pair right item is undeclared.');
      } else if (!answerRule.allowOptionReuse && usedRight.has(right)) {
        error(
          errors,
          `${pairPath}.right`,
          'duplicate-semantic-item',
          'Right option reuse is disabled.',
        );
      }
      coveredLeft.add(left);
      usedRight.add(right);
    });

    leftItems.forEach((entry, index) => {
      if (!coveredLeft.has(semanticValue(entry, answerRule.normalization))) {
        error(
          errors,
          `${path}.leftItems[${index}]`,
          'missing-answer',
          'Left item has no accepted pair.',
        );
      }
    });
    return;
  }

  if (family === 'ordering') {
    const itemsValid = strings(value.orderingItems, `${path}.orderingItems`, errors, {
      normalization: answerRule.normalization,
    });
    const keyValid = safeIntegers(value.acceptedOrder, `${path}.acceptedOrder`, errors);
    if (!itemsValid || !keyValid) return;
    const items = value.orderingItems as string[];
    const key = value.acceptedOrder as number[];
    if (key.length !== items.length) {
      error(
        errors,
        `${path}.acceptedOrder`,
        'invalid-cardinality',
        'Ordering key must cover every item.',
      );
    }
    key.forEach((answerIndex, index) => {
      if (answerIndex < 0 || answerIndex >= items.length) {
        error(
          errors,
          `${path}.acceptedOrder[${index}]`,
          'invalid-answer',
          'Ordering index is outside the declared items.',
        );
      }
    });
    return;
  }

  if (family === 'long-response') {
    if (exact(value.rubric, ['criteria'], `${path}.rubric`, errors)) {
      strings(value.rubric.criteria, `${path}.rubric.criteria`, errors, {
        normalization: answerRule.normalization,
      });
    }
  }
};

/** Validates complete editable JSON. It never repairs, filters, or normalizes malformed input. */
export const validateEditableActivity = (
  value: unknown,
  validationContext: ActivityValidationContext = {},
): ActivityValidationResult => {
  const errors: ActivityValidationError[] = [];
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return {
      valid: false,
      errors: [
        {
          code: 'invalid-json',
          path: '$',
          message: 'Activity must be JSON serializable.',
        },
      ],
    };
  }
  if (json === undefined) {
    error(errors, '$', 'invalid-json', 'Activity must serialize to one JSON value.');
  } else if (new TextEncoder().encode(json).byteLength > LIMIT.bytes) {
    error(errors, '$', 'payload-too-large', 'Activity exceeds byte limit.');
  }

  const rootKeys = [
    'schemaVersion',
    'title',
    'taskProfile',
    'presentationMode',
    'contextRequirement',
    'instructions',
    'interaction',
    'answerRule',
    'stimulus',
    'assetRefs',
    'interactions',
    'scoring',
  ];
  if (!exact(value, rootKeys, '$', errors, ['taskProfile'])) {
    return { valid: false, errors };
  }

  if (value.schemaVersion !== ACTIVITY_SCHEMA_VERSION) {
    error(
      errors,
      '$.schemaVersion',
      'unsupported-schema-version',
      'Unsupported Activity schema version.',
    );
  }
  if (!stringValue(value.title)) {
    error(errors, '$.title', 'invalid-value', 'Title is required.');
  }

  let taskProfileRegistration: ActivityTaskProfileRegistration | undefined;
  if (
    value.taskProfile !== undefined &&
    value.taskProfile !== null &&
    exact(
      value.taskProfile,
      ['taxonomyId', 'typeId', 'taxonomyVersion'],
      '$.taskProfile',
      errors,
    )
  ) {
    const taxonomyId = value.taskProfile.taxonomyId;
    const typeId = value.taskProfile.typeId;
    const version = value.taskProfile.taxonomyVersion;
    if (
      !stringValue(taxonomyId) ||
      !TASK_PROFILE_TAXONOMY_PATTERN.test(taxonomyId)
    ) {
      error(
        errors,
        '$.taskProfile.taxonomyId',
        'invalid-task-profile',
        'Task Profile taxonomyId must be a namespaced lowercase slug.',
      );
    }
    if (!stringValue(typeId) || !TASK_PROFILE_TYPE_PATTERN.test(typeId)) {
      error(
        errors,
        '$.taskProfile.typeId',
        'invalid-task-profile',
        'Task Profile typeId must be a lowercase slug.',
      );
    }
    if (!Number.isSafeInteger(version) || (version as number) < 1) {
      error(
        errors,
        '$.taskProfile.taxonomyVersion',
        'invalid-task-profile',
        'Task Profile taxonomyVersion must be a positive integer.',
      );
    }
    if (
      typeof taxonomyId === 'string' &&
      typeof typeId === 'string' &&
      Number.isSafeInteger(version)
    ) {
      taskProfileRegistration = validationContext.taskProfileRegistry?.find(
        (entry) =>
          entry.taxonomyId === taxonomyId &&
          entry.typeId === typeId &&
          entry.taxonomyVersion === version,
      );
      if (!taskProfileRegistration) {
        error(
          errors,
          '$.taskProfile',
          'unregistered-task-profile',
          'Task Profile is not registered for this taxonomy version.',
        );
      }
    }
  }

  if (!ACTIVITY_PRESENTATION_MODES.includes(value.presentationMode as never)) {
    error(
      errors,
      '$.presentationMode',
      'invalid-presentation',
      'Unsupported presentation mode.',
    );
  }

  let contextMode = '';
  let acceptedKinds: string[] = [];
  if (
    exact(
      value.contextRequirement,
      ['mode', 'acceptedKinds'],
      '$.contextRequirement',
      errors,
    )
  ) {
    if (!ACTIVITY_CONTEXT_MODES.includes(value.contextRequirement.mode as never)) {
      error(
        errors,
        '$.contextRequirement.mode',
        'invalid-context',
        'Unsupported context mode.',
      );
    } else {
      contextMode = value.contextRequirement.mode as string;
    }
    if (
      strings(
        value.contextRequirement.acceptedKinds,
        '$.contextRequirement.acceptedKinds',
        errors,
        { allowEmpty: true, normalization: 'trim-case-and-spacing' },
      )
    ) {
      acceptedKinds = value.contextRequirement.acceptedKinds as string[];
    }
    if (contextMode === 'none' && acceptedKinds.length !== 0) {
      error(
        errors,
        '$.contextRequirement.acceptedKinds',
        'context-contradiction',
        'Context mode none cannot declare accepted kinds.',
      );
    }
    if (contextMode !== '' && contextMode !== 'none' && acceptedKinds.length === 0) {
      error(
        errors,
        '$.contextRequirement.acceptedKinds',
        'context-contradiction',
        'Optional or required context must declare an accepted kind.',
      );
    }
  }

  const mappedBookPageRefs = validationContext.mappedBookPageRefs;
  const mappedPagesValid =
    Array.isArray(mappedBookPageRefs) &&
    mappedBookPageRefs.length > 0 &&
    mappedBookPageRefs.length <= LIMIT.mappedPages &&
    Reflect.ownKeys(mappedBookPageRefs).every((key) => {
      if (key === 'length') return true;
      return (
        typeof key === 'string' &&
        /^(0|[1-9]\d*)$/u.test(key) &&
        Number(key) < mappedBookPageRefs.length &&
        ownEnumerable(mappedBookPageRefs, key) &&
        Object.hasOwn(
          Object.getOwnPropertyDescriptor(mappedBookPageRefs, key) ?? {},
          'value',
        )
      );
    }) &&
    Array.from(
      { length: mappedBookPageRefs.length },
      (_, index) =>
        Object.hasOwn(mappedBookPageRefs, index) &&
        stringValue(mappedBookPageRefs[index]),
    ).every(Boolean) &&
    new Set(mappedBookPageRefs).size === mappedBookPageRefs.length;
  if (value.presentationMode === 'source-assisted') {
    if (contextMode !== 'required') {
      error(
        errors,
        '$.contextRequirement.mode',
        'source-context-required',
        'source-assisted requires contextRequirement required.',
      );
    }
    if (!acceptedKinds.includes('book-pages')) {
      error(
        errors,
        '$.contextRequirement.acceptedKinds',
        'source-context-required',
        'source-assisted requires book-pages context.',
      );
    }
    if (!mappedPagesValid) {
      error(
        errors,
        '$.contextRequirement',
        'missing-mapped-pages',
        'source-assisted requires trusted mapped Book page references.',
      );
    }
  }

  if (
    boundedArray(value.instructions, '$.instructions', errors, {
      maximum: LIMIT.instructions,
    })
  ) {
    value.instructions.forEach((instruction, index) => {
      const path = `$.instructions[${index}]`;
      if (exact(instruction, ['text'], path, errors) && !stringValue(instruction.text)) {
        error(errors, `${path}.text`, 'invalid-value', 'Instruction text is required.');
      }
    });
  }

  let family = '';
  let variant = '';
  if (exact(value.interaction, ['family', 'variant'], '$.interaction', errors)) {
    if (!ACTIVITY_INTERACTION_FAMILIES.includes(value.interaction.family as never)) {
      error(
        errors,
        '$.interaction.family',
        'unsupported-family',
        'Unsupported interaction family.',
      );
    } else {
      family = value.interaction.family as string;
    }
    if (!stringValue(value.interaction.variant)) {
      error(errors, '$.interaction.variant', 'invalid-value', 'Variant is required.');
    } else {
      variant = value.interaction.variant;
    }
  }
  if (taskProfileRegistration) {
    if (
      !taskProfileRegistration.interactionFamilies.includes(
        family as never,
      )
    ) {
      error(
        errors,
        '$.interaction.family',
        'task-profile-contradiction',
        'Interaction family contradicts the registered Task Profile.',
      );
    }
    if (
      taskProfileRegistration.variants &&
      !taskProfileRegistration.variants.includes(variant)
    ) {
      error(
        errors,
        '$.interaction.variant',
        'task-profile-contradiction',
        'Interaction variant contradicts the registered Task Profile.',
      );
    }
    if (
      !taskProfileRegistration.presentationModes.includes(
        value.presentationMode as never,
      )
    ) {
      error(
        errors,
        '$.presentationMode',
        'task-profile-contradiction',
        'Presentation mode contradicts the registered Task Profile.',
      );
    }
    if (
      !taskProfileRegistration.contextModes.includes(contextMode as never)
    ) {
      error(
        errors,
        '$.contextRequirement.mode',
        'task-profile-contradiction',
        'Context requirement contradicts the registered Task Profile.',
      );
    }
  }

  let normalization: ActivityNormalization = 'exact';
  let requiredSelectionCount: number | undefined;
  let allowOptionReuse = false;
  let allowOptionReuseDeclared = false;
  let defaultPointsForTotal: unknown;
  if (
    exact(
      value.answerRule,
      ['defaultPoints', 'normalization', 'requiredSelectionCount', 'allowOptionReuse'],
      '$.answerRule',
      errors,
      ['requiredSelectionCount', 'allowOptionReuse'],
    )
  ) {
    defaultPointsForTotal = value.answerRule.defaultPoints;
    allowOptionReuseDeclared = value.answerRule.allowOptionReuse !== undefined;
    if (
      !finite(value.answerRule.defaultPoints) ||
      value.answerRule.defaultPoints < 0 ||
      value.answerRule.defaultPoints > LIMIT.totalPoints
    ) {
      error(
        errors,
        '$.answerRule.defaultPoints',
        'invalid-score',
        'Default points must be finite and within the Activity score bound.',
      );
    }
    if (!['exact', 'trim-case-and-spacing'].includes(value.answerRule.normalization as string)) {
      error(
        errors,
        '$.answerRule.normalization',
        'invalid-normalization',
        'Unsupported normalization.',
      );
    } else {
      normalization = value.answerRule.normalization as ActivityNormalization;
    }
    if (value.answerRule.requiredSelectionCount !== undefined) {
      if (
        !Number.isSafeInteger(value.answerRule.requiredSelectionCount) ||
        (value.answerRule.requiredSelectionCount as number) < 1
      ) {
        error(
          errors,
          '$.answerRule.requiredSelectionCount',
          'invalid-cardinality',
          'Selection count must be a positive integer.',
        );
      } else {
        requiredSelectionCount = value.answerRule.requiredSelectionCount as number;
      }
    }
    if (
      value.answerRule.allowOptionReuse !== undefined &&
      typeof value.answerRule.allowOptionReuse !== 'boolean'
    ) {
      error(
        errors,
        '$.answerRule.allowOptionReuse',
        'invalid-value',
        'Option reuse must be boolean.',
      );
    } else {
      allowOptionReuse = value.answerRule.allowOptionReuse === true;
    }
  }
  if (requiredSelectionCount !== undefined && family !== 'choice') {
    error(
      errors,
      '$.answerRule.requiredSelectionCount',
      'unsupported-field',
      'requiredSelectionCount applies only to choice Activities.',
    );
  }
  if (allowOptionReuseDeclared && family !== 'matching') {
    error(
      errors,
      '$.answerRule.allowOptionReuse',
      'unsupported-field',
      'allowOptionReuse applies only to matching Activities.',
    );
  }

  if (
    value.stimulus !== null &&
    exact(value.stimulus, ['kind', 'text'], '$.stimulus', errors, ['text'])
  ) {
    if (
      !stringValue(value.stimulus.kind) ||
      (value.stimulus.text !== undefined && !stringValue(value.stimulus.text))
    ) {
      error(errors, '$.stimulus', 'invalid-stimulus', 'Embedded stimulus is invalid.');
    }
  } else if (value.stimulus !== null && !record(value.stimulus)) {
    error(errors, '$.stimulus', 'invalid-stimulus', 'Embedded stimulus is invalid.');
  }

  if (
    boundedArray(value.assetRefs, '$.assetRefs', errors, {
      allowEmpty: true,
      maximum: LIMIT.assets,
    })
  ) {
    const seenAssets = new Set<string>();
    value.assetRefs.forEach((asset, index) => {
      const path = `$.assetRefs[${index}]`;
      if (!exact(asset, ['kind', 'assetId'], path, errors)) return;
      if (!['image', 'audio'].includes(asset.kind as string) || !stringValue(asset.assetId)) {
        error(errors, path, 'invalid-asset', 'Asset reference is invalid.');
        return;
      }
      const identity = `${String(asset.kind)}\u0000${String(asset.assetId)}`;
      if (seenAssets.has(identity)) {
        error(errors, path, 'duplicate-semantic-item', 'Asset reference is duplicated.');
      }
      seenAssets.add(identity);
    });
  }

  if (
    boundedArray(value.interactions, '$.interactions', errors, {
      maximum: LIMIT.interactions,
    })
  ) {
    const sourceLabels = new Set<string>();
    let totalPoints = 0;
    value.interactions.forEach((item, index) => {
      validateInteraction(
        item,
        family,
        value.presentationMode === 'source-assisted',
        { normalization, requiredSelectionCount, allowOptionReuse },
        `$.interactions[${index}]`,
        errors,
      );
      if (record(item)) {
        const points = item.points ?? defaultPointsForTotal;
        if (finite(points) && points >= 0) totalPoints += points;
        if (
          value.presentationMode === 'source-assisted' &&
          record(item.sourceAssisted) &&
          stringValue(item.sourceAssisted.questionLabel)
        ) {
          const label = semanticValue(item.sourceAssisted.questionLabel, 'trim-case-and-spacing');
          if (sourceLabels.has(label)) {
            error(
              errors,
              `$.interactions[${index}].sourceAssisted.questionLabel`,
              'duplicate-semantic-item',
              'Source-assisted question labels must be unique.',
            );
          }
          sourceLabels.add(label);
        }
      }
    });
    if (!Number.isFinite(totalPoints) || totalPoints > LIMIT.totalPoints) {
      error(
        errors,
        '$.interactions',
        'invalid-score',
        'Activity maximum score exceeds the supported bound.',
      );
    }
  }

  let scoringMode: unknown;
  if (exact(value.scoring, ['mode'], '$.scoring', errors)) {
    scoringMode = value.scoring.mode;
    if (!['auto-where-possible', 'review-required'].includes(scoringMode as string)) {
      error(errors, '$.scoring.mode', 'invalid-scoring', 'Unsupported scoring mode.');
    }
  }
  if (
    family === 'long-response' &&
    scoringMode !== 'review-required'
  ) {
    error(
      errors,
      '$.scoring.mode',
      'review-required',
      'Long response requires teacher review.',
    );
  }
  return errors.length === 0
    ? { valid: true, errors, value: value as unknown as EditableActivity }
    : { valid: false, errors };
};
