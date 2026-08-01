import {
  assertValidBookHomeworkManifest,
} from './bookHomeworkManifest.service';
import type {
  BookHomeworkActivityBinding,
  BookHomeworkManifest,
} from '../../types/homework.types';
import {
  BOOK_HOMEWORK_PROGRESS_SCHEMA_VERSION,
  type BookHomeworkProgressActivity,
  type BookHomeworkProgressCompletion,
  type BookHomeworkProgressGrading,
  type BookHomeworkProgressGradingState,
  type BookHomeworkProgressHistoricalReason,
  type BookHomeworkProgressHistoricalRow,
  type BookHomeworkProgressInput,
  type BookHomeworkProgressProjection,
  type BookHomeworkProgressScore,
  type BookHomeworkProgressValidationError,
  type BookHomeworkProgressValidationResult,
  type BookHomeworkTerminalFact,
  type BookHomeworkTerminalResultFact,
} from './bookHomeworkProgress.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_FACTS = 512;

type MutableErrors = BookHomeworkProgressValidationError[];

interface NormalizedFact {
  readonly terminalId?: string;
  readonly attemptNumber?: number;
  readonly createdAt?: string;
  readonly recipientId: string;
  readonly contextId: string;
  /** Delivery-level binding identity, not the manifest Activity binding ID. */
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  readonly submissionScope: 'activity';
  readonly requiredInteractionIds: readonly string[];
  readonly submittedInteractionIds: readonly string[];
  readonly resultStatus?: 'pending_review' | 'submitted';
  readonly gradingState: BookHomeworkProgressGradingState;
  readonly score?: BookHomeworkProgressScore;
  readonly fingerprint: string;
}

interface HistoricalWithOrder {
  readonly order: number;
  readonly row: BookHomeworkProgressHistoricalRow;
}

export class BookHomeworkProgressError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'invalid-fact'
      | 'invalid-projection'
      | 'duplicate-conflict',
    message: string,
    readonly errors: readonly BookHomeworkProgressValidationError[] = [],
  ) {
    super(message);
    this.name = 'BookHomeworkProgressError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isPositiveInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);
const isIso = (value: unknown): value is string => (
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const push = (errors: MutableErrors, path: string, message: string): void => {
  errors.push({ path, message });
};

const rawResult = (fact: BookHomeworkTerminalFact): Record<string, unknown> => (
  isRecord(fact.result) ? fact.result : fact as unknown as Record<string, unknown>
);

const gradingStateFor = (
  value: unknown,
): BookHomeworkProgressGradingState | undefined => {
  if (value === 'scored' || value === 'graded') return 'scored';
  if (value === 'review_required' || value === 'pending_review') return 'review_required';
  if (value === 'ungraded' || value === 'submitted') return 'ungraded';
  return undefined;
};

const scoreFor = (
  value: unknown,
): { readonly state?: BookHomeworkProgressGradingState; readonly score?: BookHomeworkProgressScore; readonly invalid: boolean } => {
  if (value === undefined) return { invalid: false };
  if (!isRecord(value)) return { invalid: true };
  if (value.status === 'review_required') return { state: 'review_required', invalid: false };

  const scored = value.status === undefined || value.status === 'scored';
  if (!scored || typeof value.earnedScore !== 'number' || typeof value.maximumScore !== 'number'
    || !Number.isFinite(value.earnedScore) || !Number.isFinite(value.maximumScore)
    || value.maximumScore <= 0 || value.earnedScore < 0 || value.earnedScore > value.maximumScore) {
    return { invalid: true };
  }
  if (value.displayScore !== undefined && typeof value.displayScore !== 'string') return { invalid: true };
  return {
    state: 'scored',
    score: {
      earnedScore: value.earnedScore,
      maximumScore: value.maximumScore,
      displayScore: value.displayScore ?? `${value.earnedScore}/${value.maximumScore}`,
    },
    invalid: false,
  };
};

const factIdentityFields: readonly (keyof BookHomeworkTerminalFact)[] = [
  'recipientId', 'contextId', 'bindingId', 'bindingRevision', 'placementId',
  'activityId', 'activityVersion', 'activityVersionId',
];

/** Validate one terminal fact without consulting a manifest. */
export const validateBookHomeworkTerminalFact = (
  value: unknown,
): BookHomeworkProgressValidationResult => {
  const errors: MutableErrors = [];
  if (!isRecord(value)) {
    push(errors, '$', 'Terminal fact must be a plain object.');
    return deepFreeze({ valid: false, errors: errors.slice() });
  }

  factIdentityFields.forEach((field) => {
    if (!(field in value)) push(errors, `$.${String(field)}`, 'Field is required.');
  });
  ['recipientId', 'contextId', 'bindingId', 'placementId', 'activityId', 'activityVersionId'].forEach((field) => {
    if (!isId(value[field])) push(errors, `$.${field}`, 'Expected a bounded identifier.');
  });
  ['bindingRevision', 'activityVersion'].forEach((field) => {
    if (!isPositiveInt(value[field])) push(errors, `$.${field}`, 'Expected a positive integer.');
  });
  ['terminalId', 'attemptId', 'resultId', 'completionId'].forEach((field) => {
    if (value[field] !== undefined && !isId(value[field])) push(errors, `$.${field}`, 'Identifier is invalid.');
  });
  if (value.attemptNumber !== undefined && !isPositiveInt(value.attemptNumber)) {
    push(errors, '$.attemptNumber', 'Attempt number must be positive.');
  }
  if (value.createdAt !== undefined && !isIso(value.createdAt)) {
    push(errors, '$.createdAt', 'createdAt must be a canonical UTC timestamp.');
  }
  const requiredInteractionIds = value.requiredInteractionIds;
  const submittedInteractionIds = value.submittedInteractionIds;
  if (value.submissionScope !== 'activity') {
    push(errors, '$.submissionScope', 'Terminal fact must use the trusted Activity submission boundary.');
  }
  if (!Array.isArray(requiredInteractionIds)
    || requiredInteractionIds.length === 0
    || requiredInteractionIds.some((id) => !isId(id))
    || new Set(requiredInteractionIds).size !== requiredInteractionIds.length) {
    push(errors, '$.requiredInteractionIds', 'Expected a non-empty unique interaction ID set.');
  }
  if (!Array.isArray(submittedInteractionIds)
    || submittedInteractionIds.length === 0
    || submittedInteractionIds.some((id) => !isId(id))
    || new Set(submittedInteractionIds).size !== submittedInteractionIds.length
    || stable(submittedInteractionIds) !== stable(requiredInteractionIds)) {
    push(errors, '$.submittedInteractionIds', 'Submitted interactions must exactly match the required set.');
  }

  const result = rawResult(value as unknown as BookHomeworkTerminalFact);
  const status = result.status;
  if (status !== undefined && status !== 'pending_review' && status !== 'submitted') {
    push(errors, '$.result.status', 'Result status is invalid.');
  }
  const explicitState = gradingStateFor(result.gradingState ?? result.state);
  if (result.gradingState !== undefined && explicitState === undefined) {
    push(errors, '$.result.gradingState', 'Grading state is invalid.');
  }
  if (result.state !== undefined && gradingStateFor(result.state) === undefined) {
    push(errors, '$.result.state', 'Grading state is invalid.');
  }
  const score = scoreFor(result.score);
  if (score.invalid) push(errors, '$.result.score', 'Score is invalid.');
  if (explicitState === 'scored' && score.state !== 'scored') {
    push(errors, '$.result.gradingState', 'Scored results require a finite score.');
  }
  if (explicitState === 'review_required' && score.state === 'scored') {
    push(errors, '$.result.score', 'Review-required results cannot carry a scored result.');
  }
  if (status === 'pending_review'
    && (explicitState === 'scored' || score.state === 'scored')) {
    push(errors, '$.result', 'Pending-review results cannot be graded as scored.');
  }
  if (status === undefined && explicitState === undefined && score.state === undefined) {
    push(errors, '$.result', 'Terminal fact must carry result status or grading state.');
  }
  return deepFreeze({ valid: errors.length === 0, errors: errors.slice() });
};

const assertValidTerminalFact: (
  value: unknown,
) => asserts value is BookHomeworkTerminalFact = (value) => {
  const validation = validateBookHomeworkTerminalFact(value);
  if (!validation.valid) {
    const first = validation.errors[0]!;
    throw new BookHomeworkProgressError('invalid-fact', `${first.path}: ${first.message}`, validation.errors);
  }
};

export const assertValidBookHomeworkTerminalFact = assertValidTerminalFact;

const normalizeFact = (fact: BookHomeworkTerminalFact): NormalizedFact => {
  const result = rawResult(fact);
  const scored = scoreFor(result.score);
  const explicitState = gradingStateFor(result.gradingState ?? result.state);
  const resultStatus = result.status === 'pending_review' || result.status === 'submitted'
    ? result.status
    : undefined;
  const gradingState = scored.state
    ?? explicitState
    ?? (resultStatus === 'pending_review' ? 'review_required' : 'ungraded');
  const score = scored.score;
  const terminalId = fact.terminalId ?? fact.resultId ?? fact.completionId ?? fact.attemptId;
  const normalized = {
    ...(terminalId === undefined ? {} : { terminalId }),
    ...(fact.attemptNumber === undefined ? {} : { attemptNumber: fact.attemptNumber }),
    ...(fact.createdAt === undefined ? {} : { createdAt: fact.createdAt }),
    recipientId: fact.recipientId,
    contextId: fact.contextId,
    bindingId: fact.bindingId,
    bindingRevision: fact.bindingRevision,
    placementId: fact.placementId,
    activityId: fact.activityId,
    activityVersion: fact.activityVersion,
    activityVersionId: fact.activityVersionId,
    submissionScope: fact.submissionScope,
    requiredInteractionIds: [...fact.requiredInteractionIds],
    submittedInteractionIds: [...fact.submittedInteractionIds],
    ...(resultStatus === undefined ? {} : { resultStatus }),
    gradingState,
    ...(score === undefined ? {} : { score }),
  } satisfies Omit<NormalizedFact, 'fingerprint'>;
  return { ...normalized, fingerprint: stable(normalized) };
};

const factKey = (fact: NormalizedFact): string => (
  fact.terminalId === undefined
    ? `anonymous:${fact.fingerprint}`
    : `terminal:${fact.terminalId}`
);

const compareFacts = (left: NormalizedFact, right: NormalizedFact): number => {
  const attempt = (left.attemptNumber ?? 0) - (right.attemptNumber ?? 0);
  if (attempt !== 0) return attempt;
  const created = (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  if (created !== 0) return created;
  return (left.terminalId ?? left.fingerprint).localeCompare(right.terminalId ?? right.fingerprint);
};

const terminalIdOf = (fact: NormalizedFact): string | undefined => fact.terminalId;

const rowFromFact = (
  fact: NormalizedFact,
  reason: BookHomeworkProgressHistoricalReason,
): BookHomeworkProgressHistoricalRow => deepFreeze({
  reason,
  source: 'terminal-fact' as const,
  deliveryBindingId: fact.bindingId,
  placementId: fact.placementId,
  activityId: fact.activityId,
  activityVersion: fact.activityVersion,
  activityVersionId: fact.activityVersionId,
  bindingRevision: fact.bindingRevision,
  recipientId: fact.recipientId,
  contextId: fact.contextId,
  ...(terminalIdOf(fact) === undefined ? {} : { terminalId: terminalIdOf(fact) }),
  gradingState: fact.gradingState,
  ...(fact.score === undefined ? {} : { score: fact.score }),
});

const rowFromExcludedBinding = (
  binding: Extract<BookHomeworkActivityBinding, { state: 'excluded' }>,
  fact?: NormalizedFact,
): BookHomeworkProgressHistoricalRow => deepFreeze({
  reason: 'excluded-binding' as const,
  source: fact ? 'terminal-fact' as const : 'manifest-binding' as const,
  ...(fact === undefined ? {} : { deliveryBindingId: fact.bindingId }),
  activityBindingId: binding.bindingId,
  placementId: binding.placementId,
  activityId: fact?.activityId ?? binding.activityId,
  ...(fact?.activityVersion === undefined && binding.activityVersion === undefined
    ? {}
    : { activityVersion: fact?.activityVersion ?? binding.activityVersion }),
  ...(fact?.activityVersionId === undefined && binding.activityVersionId === undefined
    ? {}
    : { activityVersionId: fact?.activityVersionId ?? binding.activityVersionId }),
  ...(fact?.bindingRevision === undefined ? {} : { bindingRevision: fact.bindingRevision }),
  ...(fact?.recipientId === undefined ? {} : { recipientId: fact.recipientId }),
  ...(fact?.contextId === undefined ? {} : { contextId: fact.contextId }),
  ...(fact?.terminalId === undefined ? {} : { terminalId: fact.terminalId }),
  ...(fact?.gradingState === undefined ? {} : { gradingState: fact.gradingState }),
  ...(fact?.score === undefined ? {} : { score: fact.score }),
});

const mismatchReason = (
  manifest: BookHomeworkManifest,
  deliveryBindingId: string,
  binding: BookHomeworkActivityBinding,
  fact: NormalizedFact,
): BookHomeworkProgressHistoricalReason | undefined => {
  if (fact.recipientId !== manifest.context.recipientId || fact.contextId !== manifest.context.contextId) return 'context-mismatch';
  if (fact.bindingId !== deliveryBindingId) return 'binding-mismatch';
  if (fact.bindingRevision !== manifest.bindingRevision) return 'binding-revision-mismatch';
  if (fact.activityId !== binding.activityId) return 'activity-mismatch';
  if (binding.activityVersion !== undefined && fact.activityVersion !== binding.activityVersion) return 'activity-version-mismatch';
  if (binding.activityVersionId !== undefined && fact.activityVersionId !== binding.activityVersionId) return 'activity-version-id-mismatch';
  return undefined;
};

const factsFromInput = (input: BookHomeworkProgressInput): readonly BookHomeworkTerminalFact[] => {
  if (input.terminalFacts !== undefined && input.facts !== undefined && input.terminalFacts !== input.facts) {
    throw new BookHomeworkProgressError('invalid-input', 'Provide terminalFacts or facts, not two different arrays.');
  }
  const facts = input.terminalFacts ?? input.facts ?? [];
  if (!Array.isArray(facts) || facts.length > MAX_FACTS) {
    throw new BookHomeworkProgressError('invalid-input', `At most ${MAX_FACTS} terminal facts are supported.`);
  }
  return facts;
};

const inputFromArguments = (
  inputOrManifest: BookHomeworkProgressInput | BookHomeworkManifest,
  deliveryBindingId?: string | readonly BookHomeworkTerminalFact[],
  terminalFacts: readonly BookHomeworkTerminalFact[] = [],
): BookHomeworkProgressInput => {
  if (isRecord(inputOrManifest) && 'manifest' in inputOrManifest) {
    return inputOrManifest as unknown as BookHomeworkProgressInput;
  }
  if (typeof deliveryBindingId !== 'string') {
    throw new BookHomeworkProgressError('invalid-input', 'A delivery binding ID is required.');
  }
  return {
    manifest: inputOrManifest as BookHomeworkManifest,
    deliveryBindingId,
    terminalFacts,
  };
};

export function deriveBookHomeworkProgress(
  input: BookHomeworkProgressInput,
): BookHomeworkProgressProjection;
export function deriveBookHomeworkProgress(
  manifest: BookHomeworkManifest,
  deliveryBindingId: string,
  terminalFacts?: readonly BookHomeworkTerminalFact[],
): BookHomeworkProgressProjection;
export function deriveBookHomeworkProgress(
  inputOrManifest: BookHomeworkProgressInput | BookHomeworkManifest,
  deliveryBindingId?: string | readonly BookHomeworkTerminalFact[],
  terminalFacts: readonly BookHomeworkTerminalFact[] = [],
): BookHomeworkProgressProjection {
  const input = inputFromArguments(inputOrManifest, deliveryBindingId, terminalFacts);
  try {
    assertValidBookHomeworkManifest(input.manifest);
  } catch (error) {
    throw new BookHomeworkProgressError(
      'invalid-input',
      error instanceof Error ? error.message : 'Book Homework manifest is invalid.',
    );
  }
  if (!isId(input.deliveryBindingId)) {
    throw new BookHomeworkProgressError('invalid-input', 'Delivery binding ID is invalid.');
  }

  const facts = factsFromInput(input);
  const normalizedFacts: NormalizedFact[] = [];
  const seen = new Map<string, string>();
  facts.forEach((fact, index) => {
    assertValidTerminalFact(fact);
    const normalized = normalizeFact(fact);
    const key = factKey(normalized);
    const previous = seen.get(key);
    if (previous !== undefined) {
      if (previous !== normalized.fingerprint) {
        throw new BookHomeworkProgressError(
          'duplicate-conflict',
          `terminalFacts[${index}]: duplicate terminal identity has conflicting result data.`,
        );
      }
      return;
    }
    seen.set(key, normalized.fingerprint);
    normalizedFacts.push(normalized);
  });

  const bindingsByPlacement = new Map(input.manifest.bindings.map((binding) => [binding.placementId, binding]));
  const currentFacts = new Map<string, NormalizedFact>();
  const excludedFacts = new Map<string, NormalizedFact>();
  const historical: HistoricalWithOrder[] = [];

  normalizedFacts.forEach((fact, index) => {
    const binding = bindingsByPlacement.get(fact.placementId);
    if (!binding) {
      historical.push({ order: index, row: rowFromFact(fact, 'removed-binding') });
      return;
    }
    if (binding.state === 'excluded') {
      const reason = mismatchReason(input.manifest, input.deliveryBindingId, binding, fact);
      if (reason) {
        historical.push({ order: index, row: rowFromFact(fact, reason) });
        return;
      }
      const previous = excludedFacts.get(binding.placementId);
      if (!previous || compareFacts(previous, fact) < 0) excludedFacts.set(binding.placementId, fact);
      return;
    }

    const reason = mismatchReason(input.manifest, input.deliveryBindingId, binding, fact);
    if (reason) {
      historical.push({ order: index, row: rowFromFact(fact, reason) });
      return;
    }
    const previous = currentFacts.get(binding.placementId);
    if (!previous || compareFacts(previous, fact) < 0) currentFacts.set(binding.placementId, fact);
  });

  const activities: BookHomeworkProgressActivity[] = [];
  let submittedCount = 0;
  let scoredCount = 0;
  let pendingReviewCount = 0;
  let ungradedSubmittedCount = 0;

  input.manifest.bindings
    .filter((binding): binding is Extract<BookHomeworkActivityBinding, { state: 'required' }> => binding.state === 'required')
    .slice()
    .sort((left, right) => left.order - right.order || left.placementId.localeCompare(right.placementId))
    .forEach((binding) => {
      const fact = currentFacts.get(binding.placementId);
      const submitted = fact !== undefined;
      if (submitted) {
        submittedCount += 1;
        if (fact.gradingState === 'scored') scoredCount += 1;
        else if (fact.gradingState === 'review_required') pendingReviewCount += 1;
        else ungradedSubmittedCount += 1;
      }
      activities.push(deepFreeze({
        bindingId: binding.bindingId,
        placementId: binding.placementId,
        activityId: binding.activityId,
        activityVersion: binding.activityVersion,
        activityVersionId: binding.activityVersionId,
        order: binding.order,
        contextMode: binding.contextMode,
        submitted,
        gradingState: fact?.gradingState ?? 'ungraded',
        ...(fact?.score === undefined ? {} : { score: fact.score }),
        ...(fact?.terminalId === undefined ? {} : { terminalId: fact.terminalId }),
      }));
    });

  input.manifest.bindings
    .filter((binding): binding is Extract<BookHomeworkActivityBinding, { state: 'excluded' }> => binding.state === 'excluded')
    .forEach((binding) => {
      historical.push({
        order: input.manifest.bindings.indexOf(binding),
        row: rowFromExcludedBinding(binding, excludedFacts.get(binding.placementId)),
      });
    });

  const requiredCount = activities.length;
  const status: BookHomeworkProgressCompletion['status'] = submittedCount === 0
    ? 'not_started'
    : submittedCount === requiredCount && requiredCount > 0
      ? 'completed'
      : 'in_progress';
  const completion: BookHomeworkProgressCompletion = {
    submittedCount,
    requiredCount,
    status,
    isComplete: status === 'completed',
  };
  const grading: BookHomeworkProgressGrading = {
    scoredCount,
    pendingReviewCount,
    ungradedSubmittedCount,
  };
  const historicalRows = historical
    .slice()
    .sort((left, right) => left.order - right.order || left.row.placementId.localeCompare(right.row.placementId))
    .map((entry) => entry.row);

  return deepFreeze({
    schemaVersion: BOOK_HOMEWORK_PROGRESS_SCHEMA_VERSION,
    manifestVersionId: input.manifest.manifestVersionId,
    recipientId: input.manifest.context.recipientId,
    contextId: input.manifest.context.contextId,
    deliveryBindingId: input.deliveryBindingId,
    bindingRevision: input.manifest.bindingRevision,
    completion,
    grading,
    activities,
    excludedHistoricalRows: historicalRows,
  });
}

const projectionExact = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: MutableErrors,
): void => {
  const allowed = new Set([...required, ...optional]);
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) push(errors, `${path}.${key}`, 'Field is not allowed.');
  });
  required.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) push(errors, `${path}.${key}`, 'Field is required.');
  });
};

const nonNegativeInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const validateProjectionScore = (
  value: unknown,
  path: string,
  errors: MutableErrors,
): void => {
  if (!isRecord(value)) {
    push(errors, path, 'Score must be a plain object.');
    return;
  }
  projectionExact(value, ['earnedScore', 'maximumScore'], ['displayScore'], path, errors);
  if (typeof value.earnedScore !== 'number' || !Number.isFinite(value.earnedScore)
    || typeof value.maximumScore !== 'number' || !Number.isFinite(value.maximumScore)
    || value.maximumScore <= 0 || value.earnedScore < 0 || value.earnedScore > value.maximumScore) {
    push(errors, path, 'Score values are invalid.');
  }
  if (value.displayScore !== undefined && typeof value.displayScore !== 'string') {
    push(errors, `${path}.displayScore`, 'Display score must be text.');
  }
};

/** Validate a student/teacher-safe progress projection before readback. */
export const validateBookHomeworkProgressProjection = (
  value: unknown,
): BookHomeworkProgressValidationResult => {
  const errors: MutableErrors = [];
  if (!isRecord(value)) {
    push(errors, '$', 'Progress projection must be a plain object.');
    return deepFreeze({ valid: false, errors: errors.slice() });
  }
  projectionExact(value, [
    'activities', 'bindingRevision', 'completion', 'contextId', 'deliveryBindingId',
    'excludedHistoricalRows', 'grading', 'manifestVersionId', 'recipientId', 'schemaVersion',
  ], [], '$', errors);
  if (value.schemaVersion !== BOOK_HOMEWORK_PROGRESS_SCHEMA_VERSION) push(errors, '$.schemaVersion', 'Progress schema version is unsupported.');
  ['manifestVersionId', 'recipientId', 'contextId', 'deliveryBindingId'].forEach((field) => {
    if (!isId(value[field])) push(errors, `$.${field}`, 'Expected a bounded identifier.');
  });
  if (!isPositiveInt(value.bindingRevision)) push(errors, '$.bindingRevision', 'Binding revision must be positive.');

  if (!isRecord(value.completion)) push(errors, '$.completion', 'Completion is invalid.');
  else {
    projectionExact(value.completion, ['isComplete', 'requiredCount', 'status', 'submittedCount'], [], '$.completion', errors);
    if (!nonNegativeInt(value.completion.submittedCount) || !nonNegativeInt(value.completion.requiredCount)
      || value.completion.submittedCount > value.completion.requiredCount) push(errors, '$.completion', 'Completion counts are invalid.');
    if (!['not_started', 'in_progress', 'completed'].includes(value.completion.status as string)) push(errors, '$.completion.status', 'Completion status is invalid.');
    if (typeof value.completion.isComplete !== 'boolean') push(errors, '$.completion.isComplete', 'Completion flag is invalid.');
    const submitted = value.completion.submittedCount as number;
    const required = value.completion.requiredCount as number;
    const expectedStatus = submitted === 0 ? 'not_started' : submitted === required && required > 0 ? 'completed' : 'in_progress';
    if (value.completion.status !== expectedStatus || value.completion.isComplete !== (expectedStatus === 'completed')) {
      push(errors, '$.completion', 'Completion status does not reconcile with counts.');
    }
  }

  if (!isRecord(value.grading)) push(errors, '$.grading', 'Grading summary is invalid.');
  else {
    const grading = value.grading;
    projectionExact(grading, ['pendingReviewCount', 'scoredCount', 'ungradedSubmittedCount'], [], '$.grading', errors);
    ['pendingReviewCount', 'scoredCount', 'ungradedSubmittedCount'].forEach((field) => {
      if (!nonNegativeInt(grading[field])) push(errors, `$.grading.${field}`, 'Count must be non-negative.');
    });
  }

  if (!Array.isArray(value.activities)) push(errors, '$.activities', 'Activities must be an array.');
  else {
    const placements = new Set<string>();
    value.activities.forEach((activity, index) => {
      const path = `$.activities[${index}]`;
      if (!isRecord(activity)) {
        push(errors, path, 'Activity row must be a plain object.');
        return;
      }
      projectionExact(activity, [
        'activityId', 'activityVersion', 'activityVersionId', 'bindingId', 'contextMode',
        'gradingState', 'order', 'placementId', 'submitted',
      ], ['score', 'terminalId'], path, errors);
      if (!isId(activity.bindingId) || !isId(activity.placementId) || !isId(activity.activityId)
        || !isPositiveInt(activity.activityVersion) || !isId(activity.activityVersionId)
        || !isPositiveInt(activity.order)) push(errors, path, 'Activity identity is invalid.');
      if (typeof activity.placementId === 'string' && placements.has(activity.placementId)) push(errors, `${path}.placementId`, 'Placement is duplicated.');
      if (typeof activity.placementId === 'string') placements.add(activity.placementId);
      if (!['none', 'optional', 'required'].includes(activity.contextMode as string)) push(errors, `${path}.contextMode`, 'Context mode is invalid.');
      if (!['ungraded', 'scored', 'review_required'].includes(activity.gradingState as string)) push(errors, `${path}.gradingState`, 'Grading state is invalid.');
      if (typeof activity.submitted !== 'boolean') push(errors, `${path}.submitted`, 'Submitted flag is invalid.');
      if (activity.terminalId !== undefined && !isId(activity.terminalId)) push(errors, `${path}.terminalId`, 'Terminal ID is invalid.');
      if (activity.score !== undefined) validateProjectionScore(activity.score, `${path}.score`, errors);
      if (activity.submitted === false && (activity.gradingState !== 'ungraded'
        || activity.score !== undefined || activity.terminalId !== undefined)) {
        push(errors, path, 'An unsubmitted Activity cannot carry grading, score, or terminal identity.');
      }
      if (activity.submitted === true && activity.terminalId === undefined) {
        push(errors, `${path}.terminalId`, 'A submitted Activity requires terminal identity.');
      }
      if (activity.gradingState === 'scored' && activity.score === undefined) {
        push(errors, `${path}.score`, 'A scored Activity requires an Activity score.');
      }
      if (activity.gradingState !== 'scored' && activity.score !== undefined) {
        push(errors, `${path}.score`, 'Only a scored Activity may carry an Activity score.');
      }
    });

    if (isRecord(value.completion) && isRecord(value.grading)) {
      const submittedRows = value.activities.filter((activity) => isRecord(activity) && activity.submitted === true);
      const scoredRows = submittedRows.filter((activity) => activity.gradingState === 'scored');
      const pendingRows = submittedRows.filter((activity) => activity.gradingState === 'review_required');
      const ungradedRows = submittedRows.filter((activity) => activity.gradingState === 'ungraded');
      if (value.completion.requiredCount !== value.activities.length
        || value.completion.submittedCount !== submittedRows.length) {
        push(errors, '$.completion', 'Completion counts do not reconcile with Activity rows.');
      }
      if (value.grading.scoredCount !== scoredRows.length
        || value.grading.pendingReviewCount !== pendingRows.length
        || value.grading.ungradedSubmittedCount !== ungradedRows.length) {
        push(errors, '$.grading', 'Grading counts do not reconcile with submitted Activity rows.');
      }
    }
  }

  if (!Array.isArray(value.excludedHistoricalRows)) push(errors, '$.excludedHistoricalRows', 'Historical rows must be an array.');
  else {
    value.excludedHistoricalRows.forEach((row, index) => {
      const path = `$.excludedHistoricalRows[${index}]`;
      if (!isRecord(row)) {
        push(errors, path, 'Historical row must be a plain object.');
        return;
      }
      projectionExact(row, ['placementId', 'reason', 'source'], [
        'activityBindingId', 'activityId', 'activityVersion', 'activityVersionId',
        'bindingRevision', 'contextId', 'deliveryBindingId', 'gradingState', 'recipientId',
        'score', 'terminalId',
      ], path, errors);
      if (!isId(row.placementId)) push(errors, `${path}.placementId`, 'Placement ID is invalid.');
      if (!['excluded-binding', 'removed-binding', 'context-mismatch', 'binding-mismatch', 'binding-revision-mismatch', 'activity-mismatch', 'activity-version-mismatch', 'activity-version-id-mismatch', 'duplicate'].includes(row.reason as string)) push(errors, `${path}.reason`, 'Historical reason is invalid.');
      if (!['manifest-binding', 'terminal-fact'].includes(row.source as string)) push(errors, `${path}.source`, 'Historical source is invalid.');
      ['activityBindingId', 'activityId', 'activityVersionId', 'recipientId', 'contextId', 'deliveryBindingId', 'terminalId'].forEach((field) => {
        if (row[field] !== undefined && !isId(row[field])) push(errors, `${path}.${field}`, 'Historical identity is invalid.');
      });
      ['activityVersion', 'bindingRevision'].forEach((field) => {
        if (row[field] !== undefined && !isPositiveInt(row[field])) push(errors, `${path}.${field}`, 'Historical revision/version is invalid.');
      });
      if (row.gradingState !== undefined && !['ungraded', 'scored', 'review_required'].includes(row.gradingState as string)) push(errors, `${path}.gradingState`, 'Historical grading state is invalid.');
      if (row.score !== undefined) validateProjectionScore(row.score, `${path}.score`, errors);
    });
  }
  return deepFreeze({ valid: errors.length === 0, errors: errors.slice() });
};

export const assertValidBookHomeworkProgressProjection = (
  value: unknown,
): asserts value is BookHomeworkProgressProjection => {
  const validation = validateBookHomeworkProgressProjection(value);
  if (!validation.valid) {
    const first = validation.errors[0]!;
    throw new BookHomeworkProgressError('invalid-projection', `${first.path}: ${first.message}`, validation.errors);
  }
};

export type {
  BookHomeworkProgressActivity,
  BookHomeworkProgressCompletion,
  BookHomeworkProgressGrading,
  BookHomeworkProgressGradingState,
  BookHomeworkProgressHistoricalReason,
  BookHomeworkProgressHistoricalRow,
  BookHomeworkProgressInput,
  BookHomeworkProgressProjection,
  BookHomeworkProgressScore,
  BookHomeworkProgressValidationError,
  BookHomeworkProgressValidationResult,
  BookHomeworkTerminalFact,
  BookHomeworkTerminalResultFact,
} from './bookHomeworkProgress.types';

/** Descriptive aliases for callers that use projection/aggregation wording. */
export const projectBookHomeworkProgress = deriveBookHomeworkProgress;
export const aggregateBookHomeworkProgress = deriveBookHomeworkProgress;
export const calculateBookHomeworkProgress = deriveBookHomeworkProgress;
