import type {
  BookDeliveryContextKind,
} from '../../book-delivery/bookDelivery.types';
import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
  BookRuntimeScore,
  BookRuntimeSourceProvenance,
} from '../activityRuntimeAttempt.types';
import {
  BOOK_RESULT_PROJECTION_SCHEMA_VERSION,
  type BookResultAttemptDetail,
  type BookResultAttemptPolicy,
  type BookResultAttemptSummary,
  type BookResultCompletionSnapshot,
  type BookResultCompletionStatus,
  type BookResultContextPolicy,
  type BookResultContextSummary,
  type BookResultEvaluation,
  type BookResultEvaluationStatus,
  type BookResultFeedback,
  type BookResultFeedbackInput,
  type BookResultGroupSummary,
  type BookResultGroupingOptions,
  type BookResultProjection,
  type BookResultProjectionContext,
  type BookResultProjectionInput,
  type BookResultProjectionInputLike,
  type BookResultProjectionValidationError,
  type BookResultProjectionValidationResult,
  type BookResultScore,
  type BookResultSourceAvailability,
  type BookResultSourceAvailabilityInput,
  type BookResultSourceAvailabilityMap,
  type BookResultSourceProjection,
  type BookResultSurface,
} from './bookResult.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const TEXT = /^.{0,4096}$/su;
const CONTEXT_KINDS: readonly BookResultSurface[] = ['solo', 'homework', 'unknown'];
const SOURCE_AVAILABILITIES: readonly BookResultSourceAvailability[] = [
  'available', 'missing', 'deleted', 'replaced', 'invalidated', 'not-required',
];
const FEEDBACK_RELEASES = ['pending', 'released', 'withheld', 'not-applicable'] as const;
const EVALUATION_STATUSES: readonly BookResultEvaluationStatus[] = ['pending_review', 'submitted', 'graded'];

type MutableErrors = BookResultProjectionValidationError[];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isText = (value: unknown): value is string => typeof value === 'string' && TEXT.test(value);
const isPositiveInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);
const isNonNegativeInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);
const isIso = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const push = (errors: MutableErrors, code: BookResultProjectionValidationError['code'], path: string, message: string): void => {
  errors.push({ code, path, message });
};

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: MutableErrors,
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    push(errors, 'invalid-record', path, 'Expected a plain object.');
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  Reflect.ownKeys(value).forEach((key) => {
    if (typeof key !== 'string' || !allowed.has(key)) {
      push(errors, 'unknown-field', `${path}.${String(key)}`, 'Field is not allowed.');
    }
  });
  required.forEach((key) => {
    if (!own(value, key)) push(errors, 'missing-field', `${path}.${key}`, 'Field is required.');
  });
  return true;
};

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

const cloneFreeze = <T>(value: T): T => {
  try {
    const clone = typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value)) as T;
    return deepFreeze(clone);
  } catch {
    throw new BookResultProjectionError('invalid-record', 'response: Submitted response is not cloneable.');
  }
};

const sourceProvenanceFields = ['pages', 'sourceKey', 'sourceVersionId'] as const;
const commonTerminalFields = [
  'acknowledgedDraftRevision', 'activityId', 'activityVersion', 'activityVersionId',
  'attemptId', 'attemptNumber', 'bindingId', 'bindingRevision', 'contextId',
  'createdAt', 'createdByOperationId', 'interactionId', 'pageGroupKeys', 'placementId',
  'recipientId',
] as const;

const validateSourceProvenance = (value: unknown, path: string, errors: MutableErrors): value is readonly BookRuntimeSourceProvenance[] => {
  if (!Array.isArray(value)) {
    push(errors, 'invalid-value', path, 'Source provenance must be an array.');
    return false;
  }
  const sourceKeys = new Set<string>();
  value.forEach((source, index) => {
    const sourcePath = `${path}[${index}]`;
    if (!exact(source, sourceProvenanceFields, [], sourcePath, errors)) return;
    const sourceRecord = source as Record<string, unknown>;
    if (!isId(sourceRecord.sourceKey) || sourceKeys.has(sourceRecord.sourceKey)) {
      push(errors, sourceKeys.has(sourceRecord.sourceKey) ? 'duplicate-id' : 'invalid-value', `${sourcePath}.sourceKey`, 'Source key must be unique and safe.');
    }
    if (!isId(sourceRecord.sourceVersionId)) push(errors, 'invalid-value', `${sourcePath}.sourceVersionId`, 'Source Version ID is invalid.');
    if (!Array.isArray(sourceRecord.pages) || sourceRecord.pages.length === 0 || sourceRecord.pages.some((page) => !isPositiveInt(page))) {
      push(errors, 'invalid-value', `${sourcePath}.pages`, 'Source pages must be a non-empty list of positive integers.');
    } else if (new Set(sourceRecord.pages).size !== sourceRecord.pages.length) {
      push(errors, 'duplicate-id', `${sourcePath}.pages`, 'Source pages must be unique.');
    }
    if (isId(sourceRecord.sourceKey)) sourceKeys.add(sourceRecord.sourceKey);
  });
  return true;
};

const validatePageGroups = (value: unknown, path: string, errors: MutableErrors): value is readonly string[] => {
  if (!Array.isArray(value) || value.some((entry) => !isId(entry))) {
    push(errors, 'invalid-value', path, 'Page Group keys must be safe identifiers.');
    return false;
  }
  if (new Set(value).size !== value.length) push(errors, 'duplicate-id', path, 'Page Group keys must be unique.');
  return true;
};

const validateCommonTerminal = (value: unknown, path: string, errors: MutableErrors): value is Record<string, unknown> => {
  if (!exact(value, commonTerminalFields, ['schemaVersion', 'resultId', 'completionId', 'sourceProvenance', 'feedbackRelease', 'response', 'status', 'score'], path, errors)) return false;
  const record = value as Record<string, unknown>;
  if (!isId(record.bindingId) || !isId(record.recipientId) || !isId(record.contextId)
    || !isId(record.placementId) || !isId(record.activityId) || !isId(record.activityVersionId)
    || !isId(record.interactionId) || !isId(record.attemptId) || !isId(record.createdByOperationId)) {
    push(errors, 'invalid-value', path, 'Terminal identity contains an unsafe identifier.');
  }
  if (!isNonNegativeInt(record.bindingRevision) || !isPositiveInt(record.activityVersion)
    || !isNonNegativeInt(record.acknowledgedDraftRevision) || !isPositiveInt(record.attemptNumber)) {
    push(errors, 'invalid-value', path, 'Terminal numeric identity is invalid.');
  }
  if (!isIso(record.createdAt)) push(errors, 'invalid-value', `${path}.createdAt`, 'Terminal timestamp is invalid.');
  validatePageGroups(record.pageGroupKeys, `${path}.pageGroupKeys`, errors);
  return true;
};

const validateTerminalRows = (input: unknown, errors: MutableErrors): input is BookResultProjectionInput => {
  if (!exact(input, ['attempt', 'completion', 'index', 'result'], [
    'attemptPolicy', 'context', 'evaluation', 'feedback', 'submittedAt', 'sourceAvailability', 'sources', 'surface',
  ], '$', errors)) return false;
  const value = input as Record<string, unknown>;
  const attempt = value.attempt;
  const result = value.result;
  const completion = value.completion;
  const index = value.index;
  if (exact(attempt, [...commonTerminalFields, 'feedbackRelease', 'response', 'schemaVersion', 'sourceProvenance'], [], '$.attempt', errors)) {
    validateCommonTerminal(attempt, '$.attempt', errors);
    if (attempt.schemaVersion !== 1) push(errors, 'invalid-value', '$.attempt.schemaVersion', 'Unsupported attempt schema version.');
    if (attempt.feedbackRelease !== 'pending') push(errors, 'invalid-value', '$.attempt.feedbackRelease', 'Unsupported attempt feedback release.');
    validateSourceProvenance(attempt.sourceProvenance, '$.attempt.sourceProvenance', errors);
  }
  if (exact(result, [...commonTerminalFields, 'feedbackRelease', 'resultId', 'schemaVersion', 'sourceProvenance'], ['score', 'status'], '$.result', errors)) {
    validateCommonTerminal(result, '$.result', errors);
    if (result.schemaVersion !== 1) push(errors, 'invalid-value', '$.result.schemaVersion', 'Unsupported result schema version.');
    if (result.feedbackRelease !== 'pending') push(errors, 'invalid-value', '$.result.feedbackRelease', 'Unsupported result feedback release.');
    if (!isId(result.resultId)) push(errors, 'invalid-value', '$.result.resultId', 'Result ID is invalid.');
    if (!['pending_review', 'submitted'].includes(result.status as string)) push(errors, 'invalid-value', '$.result.status', 'Result status is invalid.');
    validateSourceProvenance(result.sourceProvenance, '$.result.sourceProvenance', errors);
    if (result.score !== undefined) validateScore(result.score, '$.result.score', errors);
  }
  if (exact(completion, [...commonTerminalFields, 'completionId', 'resultId', 'schemaVersion', 'sourceProvenance', 'status'], [], '$.completion', errors)) {
    validateCommonTerminal(completion, '$.completion', errors);
    if (completion.schemaVersion !== 1) push(errors, 'invalid-value', '$.completion.schemaVersion', 'Unsupported completion schema version.');
    if (!isId(completion.completionId) || !isId(completion.resultId)) push(errors, 'invalid-value', '$.completion', 'Completion identity is invalid.');
    if (completion.status !== 'completed') push(errors, 'invalid-value', '$.completion.status', 'Completion status is invalid.');
    validateSourceProvenance(completion.sourceProvenance, '$.completion.sourceProvenance', errors);
  }
  if (exact(index, [...commonTerminalFields, 'attemptId', 'resultId', 'schemaVersion'], [], '$.index', errors)) {
    validateCommonTerminal(index, '$.index', errors);
    if (index.schemaVersion !== 1) push(errors, 'invalid-value', '$.index.schemaVersion', 'Unsupported index schema version.');
    if (!isId(index.resultId)) push(errors, 'invalid-value', '$.index.resultId', 'Index result ID is invalid.');
  }
  return true;
};

const validateScore = (value: unknown, path: string, errors: MutableErrors): value is BookRuntimeScore => {
  if (!isRecord(value)) {
    push(errors, 'invalid-record', path, 'Score must be an object.');
    return false;
  }
  if (value.status === 'review_required') {
    if (Reflect.ownKeys(value).some((key) => key !== 'status')) push(errors, 'unknown-field', path, 'Review-required score has unsupported fields.');
    return true;
  }
  if (!exact(value, ['displayScore', 'earnedScore', 'maximumScore', 'status'], [], path, errors)) return false;
  if (value.status !== 'scored' || typeof value.displayScore !== 'string'
    || typeof value.earnedScore !== 'number' || !Number.isFinite(value.earnedScore)
    || typeof value.maximumScore !== 'number' || !Number.isFinite(value.maximumScore)
    || value.maximumScore <= 0 || value.earnedScore < 0 || value.earnedScore > value.maximumScore) {
    push(errors, 'invalid-value', path, 'Score is invalid.');
  }
  return true;
};

const terminalRecordMatchesAttempt = (
  record: BookRuntimeResultRecord | BookRuntimeCompletionRecord | BookRuntimeAttemptIndexRecord,
  attempt: BookRuntimeAttemptRecord,
): boolean => (
  record.attemptId === attempt.attemptId
  && record.bindingId === attempt.bindingId
  && record.bindingRevision === attempt.bindingRevision
  && record.recipientId === attempt.recipientId
  && record.contextId === attempt.contextId
  && record.placementId === attempt.placementId
  && record.activityId === attempt.activityId
  && record.activityVersion === attempt.activityVersion
  && record.activityVersionId === attempt.activityVersionId
  && record.interactionId === attempt.interactionId
  && record.acknowledgedDraftRevision === attempt.acknowledgedDraftRevision
  && record.attemptNumber === attempt.attemptNumber
  && stable(record.pageGroupKeys) === stable(attempt.pageGroupKeys)
  && record.createdByOperationId === attempt.createdByOperationId
  && record.createdAt === attempt.createdAt
);

const validateIdentity = (input: BookResultProjectionInput, errors: MutableErrors): void => {
  const { attempt, result, completion, index } = input;
  if (result.resultId !== `${attempt.attemptId}:result`) push(errors, 'identity-mismatch', '$.result.resultId', 'Result ID must be derived from attempt ID.');
  if (completion.completionId !== `${attempt.attemptId}:completion`) push(errors, 'identity-mismatch', '$.completion.completionId', 'Completion ID must be derived from attempt ID.');
  if (completion.resultId !== result.resultId || index.resultId !== result.resultId) push(errors, 'identity-mismatch', '$.completion.resultId', 'Result identity must match every terminal row.');
  if (index.attemptId !== attempt.attemptId || result.attemptId !== attempt.attemptId || completion.attemptId !== attempt.attemptId) push(errors, 'identity-mismatch', '$.attemptId', 'Attempt identity must match every terminal row.');
  if (!terminalRecordMatchesAttempt(result, attempt) || !terminalRecordMatchesAttempt(completion, attempt) || !terminalRecordMatchesAttempt(index, attempt)) {
    push(errors, 'identity-mismatch', '$', 'Terminal row identity does not match the #76 attempt.');
  }
  if (stable(result.sourceProvenance) !== stable(attempt.sourceProvenance)
    || stable(completion.sourceProvenance) !== stable(attempt.sourceProvenance)) {
    push(errors, 'provenance-mismatch', '$.sourceProvenance', 'Result and completion provenance must exactly match the attempt.');
  }
};

const validateProjectionMetadata = (input: BookResultProjectionInput, errors: MutableErrors): void => {
  if (input.attemptPolicy !== undefined) {
    if (!isRecord(input.attemptPolicy) || !exact(input.attemptPolicy, ['maxAttempts'], [], '$.attemptPolicy', errors)) return;
    if (input.attemptPolicy.maxAttempts !== null && !isPositiveInt(input.attemptPolicy.maxAttempts)) push(errors, 'invalid-value', '$.attemptPolicy.maxAttempts', 'Attempt limit must be null or positive.');
  }
  if (input.submittedAt !== undefined && !isIso(input.submittedAt)) push(errors, 'invalid-value', '$.submittedAt', 'Submission timestamp is invalid.');
  if (input.surface !== undefined && !CONTEXT_KINDS.includes(input.surface as BookResultSurface)) push(errors, 'unsupported-context', '$.surface', 'Only Solo or Homework results are supported.');
  if (input.context !== undefined) {
    if (!isRecord(input.context) || !exact(input.context, [], ['contextId', 'deliveryId', 'homeworkId', 'kind', 'ownerId'], '$.context', errors)) return;
    if (input.context.kind !== undefined && !CONTEXT_KINDS.includes(input.context.kind as BookResultSurface)) push(errors, 'unsupported-context', '$.context.kind', 'Only Solo or Homework contexts are supported.');
    if (input.context.contextId !== undefined && input.context.contextId !== input.attempt.contextId) push(errors, 'identity-mismatch', '$.context.contextId', 'Context ID must match the attempt.');
    for (const [field, value] of [['deliveryId', input.context.deliveryId], ['ownerId', input.context.ownerId]] as const) {
      if (value !== undefined && !isId(value)) push(errors, 'invalid-value', `$.context.${field}`, 'Context identity is invalid.');
    }
    if (input.context.homeworkId !== undefined && (!isId(input.context.homeworkId) || input.context.kind !== 'homework')) push(errors, 'invalid-value', '$.context.homeworkId', 'Homework ID requires a Homework context.');
    if (input.context.kind === 'solo' && input.context.homeworkId !== undefined) push(errors, 'invalid-value', '$.context.homeworkId', 'Solo results cannot carry a Homework ID.');
  }
  validateFeedback(input.feedback, '$.feedback', errors);
  validateEvaluation(input.evaluation, '$.evaluation', errors);
  validateSourceAvailability(input.sourceAvailability, input.sources, input.attempt.sourceProvenance, errors);
};

const validateEvaluation = (value: unknown, path: string, errors: MutableErrors): boolean => {
  if (value === undefined || value === null) return true;
  if (!isRecord(value) || !exact(value, ['status'], ['correctionNote', 'displayScore', 'earnedScore', 'evaluatedAt', 'maximumScore', 'revision', 'score'], path, errors)) return false;
  if (!EVALUATION_STATUSES.includes(value.status as BookResultEvaluationStatus)) push(errors, 'invalid-value', `${path}.status`, 'Evaluation status is invalid.');
  if (value.evaluatedAt !== undefined && !isIso(value.evaluatedAt)) push(errors, 'invalid-value', `${path}.evaluatedAt`, 'Evaluation timestamp is invalid.');
  if (value.revision !== undefined && !isNonNegativeInt(value.revision)) push(errors, 'invalid-value', `${path}.revision`, 'Evaluation revision is invalid.');
  if (value.correctionNote !== undefined && !isText(value.correctionNote)) push(errors, 'invalid-value', `${path}.correctionNote`, 'Correction note is invalid.');
  if (value.score !== undefined) validateResultScore(value.score, `${path}.score`, errors);
  return true;
};

const validateResultScore = (value: unknown, path: string, errors: MutableErrors): value is BookResultScore => {
  if (!isRecord(value) || !exact(value, ['displayScore', 'earnedScore', 'maximumScore'], [], path, errors)) return false;
  if (typeof value.displayScore !== 'string' || typeof value.earnedScore !== 'number' || !Number.isFinite(value.earnedScore)
    || typeof value.maximumScore !== 'number' || !Number.isFinite(value.maximumScore)
    || value.maximumScore <= 0 || value.earnedScore < 0 || value.earnedScore > value.maximumScore) push(errors, 'invalid-value', path, 'Safe score is invalid.');
  return true;
};

const validateFeedback = (value: unknown, path: string, errors: MutableErrors): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)
    || !exact(value, [], ['correctionNote', 'release', 'releasedAt', 'text'], path, errors)) return false;
  const feedback = value as Record<string, unknown>;
  if (feedback.release !== undefined && !FEEDBACK_RELEASES.includes(feedback.release as typeof FEEDBACK_RELEASES[number])) push(errors, 'invalid-value', `${path}.release`, 'Feedback release is invalid.');
  if (feedback.text !== undefined && !isText(feedback.text)) push(errors, 'invalid-value', `${path}.text`, 'Feedback text is invalid.');
  if (feedback.correctionNote !== undefined && !isText(feedback.correctionNote)) push(errors, 'invalid-value', `${path}.correctionNote`, 'Feedback correction note is invalid.');
  if (feedback.releasedAt !== undefined && !isIso(feedback.releasedAt)) push(errors, 'invalid-value', `${path}.releasedAt`, 'Feedback release timestamp is invalid.');
  return true;
};

const validateSourceAvailability = (
  value: unknown,
  alias: unknown,
  provenance: readonly BookRuntimeSourceProvenance[],
  errors: MutableErrors,
): void => {
  if (value !== undefined && alias !== undefined && stable(value) !== stable(alias)) {
    push(errors, 'provenance-mismatch', '$.sources', 'Source availability aliases disagree.');
  }
  const candidate = value ?? alias;
  if (candidate === undefined) return;
  if (Array.isArray(candidate)) {
    const keys = new Set<string>();
    candidate.forEach((entry, index) => {
      const path = `$.sources[${index}]`;
      if (!isRecord(entry) || !exact(entry, ['availability', 'sourceKey'], ['componentId', 'pages', 'sourceVersionId'], path, errors)) return;
      const entryRecord = entry as Record<string, unknown>;
      if (!isId(entryRecord.sourceKey) || keys.has(entryRecord.sourceKey)) push(errors, keys.has(entryRecord.sourceKey) ? 'duplicate-id' : 'invalid-value', `${path}.sourceKey`, 'Source key is invalid or duplicated.');
      if (!SOURCE_AVAILABILITIES.includes(entryRecord.availability as BookResultSourceAvailability)) push(errors, 'invalid-value', `${path}.availability`, 'Source availability is invalid.');
      const source = provenance.find((item) => item.sourceKey === entryRecord.sourceKey);
      if (!source) push(errors, 'provenance-mismatch', `${path}.sourceKey`, 'Source is absent from attempt provenance.');
      if (source && entryRecord.sourceVersionId !== undefined && entryRecord.sourceVersionId !== source.sourceVersionId) push(errors, 'provenance-mismatch', `${path}.sourceVersionId`, 'Source Version ID does not match provenance.');
      if (source && entryRecord.pages !== undefined && stable(entryRecord.pages) !== stable(source.pages)) push(errors, 'provenance-mismatch', `${path}.pages`, 'Source pages do not match provenance.');
      if (isId(entryRecord.sourceKey)) keys.add(entryRecord.sourceKey);
    });
    if (keys.size !== provenance.length) push(errors, 'provenance-mismatch', '$.sources', 'Every source provenance entry needs an availability state.');
    return;
  }
  if (!isRecord(candidate)) {
    push(errors, 'invalid-record', '$.sourceAvailability', 'Source availability must be a map or list.');
    return;
  }
  Object.entries(candidate).forEach(([key, state]) => {
    const source = provenance.find((item) => item.sourceKey === key);
    if (!source) {
      push(errors, 'provenance-mismatch', `$.sourceAvailability.${key}`, 'Source availability key is absent from provenance.');
      return;
    }
    if (typeof state === 'string') {
      if (!SOURCE_AVAILABILITIES.includes(state as BookResultSourceAvailability)) push(errors, 'invalid-value', `$.sourceAvailability.${key}`, 'Source availability is invalid.');
    } else if (isRecord(state)) {
      if (!exact(state, ['availability'], ['sourceVersionId'], `$.sourceAvailability.${key}`, errors)) return;
      if (!SOURCE_AVAILABILITIES.includes(state.availability as BookResultSourceAvailability)) push(errors, 'invalid-value', `$.sourceAvailability.${key}.availability`, 'Source availability is invalid.');
      if (state.sourceVersionId !== undefined && state.sourceVersionId !== source.sourceVersionId) push(errors, 'provenance-mismatch', `$.sourceAvailability.${key}.sourceVersionId`, 'Source Version ID does not match provenance.');
    } else push(errors, 'invalid-value', `$.sourceAvailability.${key}`, 'Source availability is invalid.');
  });
  if (Object.keys(candidate).length !== provenance.length) push(errors, 'provenance-mismatch', '$.sourceAvailability', 'Every source provenance entry needs an availability state.');
};

export class BookResultProjectionError extends Error {
  constructor(
    readonly code: BookResultProjectionValidationError['code'],
    message: string,
    readonly errors: readonly BookResultProjectionValidationError[] = [{ code, path: '$', message }],
  ) {
    super(message);
    this.name = 'BookResultProjectionError';
  }
}

export const validateBookResultProjectionInput = (value: unknown): BookResultProjectionValidationResult => {
  const errors: MutableErrors = [];
  if (validateTerminalRows(value, errors)) {
    const input = value as BookResultProjectionInput;
    if (errors.length === 0) validateIdentity(input, errors);
    if (errors.length === 0) validateProjectionMetadata(input, errors);
  }
  return deepFreeze({ valid: errors.length === 0, errors: errors.slice() });
};

export function assertValidBookResultProjectionInput(value: unknown): asserts value is BookResultProjectionInput {
  const validation = validateBookResultProjectionInput(value);
  if (!validation.valid) {
    const first = validation.errors[0] ?? { code: 'invalid-record' as const, path: '$', message: 'Invalid Book result projection input.' };
    throw new BookResultProjectionError(first.code, `${first.path}: ${first.message}`, validation.errors);
  }
}

const contextKind = (input: BookResultProjectionInput): BookResultSurface => {
  const value = input.context?.kind ?? input.surface;
  return value === 'solo' || value === 'homework' ? value : 'unknown';
};

const scoreProjection = (score: BookRuntimeScore | undefined): BookResultScore | undefined => (
  score?.status === 'scored'
    ? { earnedScore: score.earnedScore, maximumScore: score.maximumScore, displayScore: score.displayScore }
    : undefined
);

const evaluationProjection = (input: BookResultProjectionInput): BookResultEvaluation => {
  const explicit = input.evaluation;
  const score = scoreProjection(input.result.score);
  const inferredStatus: BookResultEvaluationStatus = input.result.status === 'pending_review'
    ? 'pending_review'
    : score ? 'graded' : 'submitted';
  const value: BookResultEvaluation = explicit
    ? {
      status: explicit.status,
      ...(explicit.score ? { score: explicit.score } : {}),
      ...(explicit.earnedScore === undefined ? {} : { earnedScore: explicit.earnedScore }),
      ...(explicit.maximumScore === undefined ? {} : { maximumScore: explicit.maximumScore }),
      ...(explicit.displayScore === undefined ? {} : { displayScore: explicit.displayScore }),
      ...(explicit.evaluatedAt === undefined ? {} : { evaluatedAt: explicit.evaluatedAt }),
      ...(explicit.revision === undefined ? {} : { revision: explicit.revision }),
      ...(explicit.correctionNote === undefined ? {} : { correctionNote: explicit.correctionNote }),
    }
    : {
      status: inferredStatus,
      ...(score ? { score } : {}),
    };
  return cloneFreeze(value);
};

const feedbackProjection = (input: BookResultProjectionInput): BookResultFeedback => {
  const supplied = input.feedback;
  const release = supplied?.release ?? 'pending';
  if (release !== 'released') return cloneFreeze({ release, available: false });
  return cloneFreeze({
    release,
    available: true,
    ...(supplied?.text === undefined ? {} : { text: supplied.text }),
    ...(supplied?.correctionNote === undefined ? {} : { correctionNote: supplied.correctionNote }),
    ...(supplied?.releasedAt === undefined ? {} : { releasedAt: supplied.releasedAt }),
  });
};

const sourceStateFor = (
  input: BookResultProjectionInput,
  source: BookRuntimeSourceProvenance,
): BookResultSourceAvailability => {
  const candidate = input.sourceAvailability ?? input.sources;
  if (!candidate) return 'available';
  if (Array.isArray(candidate)) return candidate.find((entry) => entry.sourceKey === source.sourceKey)?.availability ?? 'available';
  const state = candidate[source.sourceKey];
  return typeof state === 'string' ? state as BookResultSourceAvailability : state?.availability ?? 'available';
};

const sourceProjection = (input: BookResultProjectionInput): readonly BookResultSourceProjection[] => {
  const sources = input.attempt.sourceProvenance.map((source) => {
    const availability = sourceStateFor(input, source);
    return {
      sourceKey: source.sourceKey,
      componentId: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      pages: [...source.pages],
      availability,
      available: availability === 'available',
      displayOnly: availability !== 'available',
    } satisfies BookResultSourceProjection;
  });
  return cloneFreeze(sources);
};

const aggregateSourceAvailability = (sources: readonly BookResultSourceProjection[]): BookResultSourceAvailability => {
  if (sources.length === 0) return 'not-required';
  const priority: readonly BookResultSourceAvailability[] = ['deleted', 'replaced', 'missing', 'invalidated', 'available'];
  return priority.find((state) => sources.some((source) => source.availability === state)) ?? 'available';
};

const attemptLimit = (input: BookResultProjectionInput): number | null => input.attemptPolicy?.maxAttempts ?? null;

const summaryFor = (input: BookResultProjectionInput, sources: readonly BookResultSourceProjection[]): BookResultAttemptSummary => {
  const { attempt, result, completion } = input;
  const kind = contextKind(input);
  const evaluation = evaluationProjection(input);
  const feedback = feedbackProjection(input);
  const limit = attemptLimit(input);
  const aggregateAvailability = aggregateSourceAvailability(sources);
  const submittedAt = input.submittedAt ?? attempt.createdAt;
  const completionSnapshot: BookResultCompletionSnapshot = {
    completionId: completion.completionId,
    attemptId: completion.attemptId,
    resultId: completion.resultId,
    status: completion.status,
    contextId: completion.contextId,
    placementId: completion.placementId,
    activityVersionId: completion.activityVersionId,
    activityVersion: completion.activityVersion,
    createdAt: completion.createdAt,
  };
  return cloneFreeze({
    schemaVersion: BOOK_RESULT_PROJECTION_SCHEMA_VERSION,
    attemptId: attempt.attemptId,
    resultId: result.resultId,
    completionId: completion.completionId,
    recipientId: attempt.recipientId,
    studentId: attempt.recipientId,
    activityId: attempt.activityId,
    contextId: attempt.contextId,
    deliveryContextId: attempt.contextId,
    deliveryId: input.context?.deliveryId ?? attempt.bindingId,
    placementId: attempt.placementId,
    bindingId: attempt.bindingId,
    bindingRevision: attempt.bindingRevision,
    activityVersionId: attempt.activityVersionId,
    activityVersion: attempt.activityVersion,
    interactionId: attempt.interactionId,
    attemptNumber: attempt.attemptNumber,
    surface: kind,
    ownerId: input.context?.ownerId ?? null,
    homeworkId: input.context?.homeworkId ?? null,
    pageGroupKeys: [...attempt.pageGroupKeys],
    sourceProvenance: attempt.sourceProvenance.map((source) => ({ ...source, pages: [...source.pages] })),
    sources,
    sourceAvailability: aggregateAvailability,
    sourceAvailable: sources.every((source) => source.available),
    createdAt: attempt.createdAt,
    submittedAt,
    completedAt: completion.createdAt,
    resultStatus: result.status,
    evaluationStatus: evaluation.status,
    completionStatus: 'completed' satisfies BookResultCompletionStatus,
    completion: completionSnapshot,
    evaluation,
    feedback,
    attemptLimit: limit,
    attemptsUsed: 1,
    attemptsRemaining: limit === null ? null : Math.max(0, limit - 1),
  });
};

export const projectBookResultAttempt = (input: BookResultProjectionInput): BookResultProjection => {
  assertValidBookResultProjectionInput(input);
  const sources = sourceProjection(input);
  const summary = summaryFor(input, sources);
  const detail: BookResultAttemptDetail = cloneFreeze({
    ...summary,
    response: cloneFreeze(input.attempt.response),
  });
  return cloneFreeze({
    schemaVersion: BOOK_RESULT_PROJECTION_SCHEMA_VERSION,
    summary,
    detail,
  });
};

const contextKey = (summary: BookResultAttemptSummary): string => `${summary.surface}:${summary.contextId}:${summary.placementId}`;
const compareAttempts = (left: BookResultAttemptSummary, right: BookResultAttemptSummary): number => (
  left.attemptNumber - right.attemptNumber
  || left.submittedAt.localeCompare(right.submittedAt)
  || left.contextId.localeCompare(right.contextId)
  || left.placementId.localeCompare(right.placementId)
  || left.attemptId.localeCompare(right.attemptId)
);

const limitFromOptions = (
  summary: BookResultAttemptSummary,
  options: BookResultGroupingOptions,
): number | null => {
  const key = contextKey(summary);
  const contextPolicy = options.contextPolicies?.find((policy) => (
    policy.contextId === summary.contextId && policy.placementId === summary.placementId
  ));
  if (contextPolicy) return contextPolicy.maxAttempts;
  const map = options.maxAttemptsByContext;
  if (map) {
    for (const candidate of [key, `${summary.contextId}:${summary.placementId}`, summary.contextId, summary.placementId]) {
      if (Object.prototype.hasOwnProperty.call(map, candidate)) return map[candidate] ?? null;
    }
  }
  return summary.attemptLimit ?? options.attemptPolicy?.maxAttempts ?? null;
};

const validateLimit = (value: number | null, path: string, errors: MutableErrors): void => {
  if (value !== null && !isPositiveInt(value)) push(errors, 'invalid-value', path, 'Attempt limit must be null or positive.');
};

const groupContexts = (
  attempts: readonly BookResultAttemptSummary[],
  options: BookResultGroupingOptions,
): readonly BookResultContextSummary[] => {
  const contexts = new Map<string, BookResultAttemptSummary[]>();
  attempts.forEach((attempt) => {
    const key = contextKey(attempt);
    const list = contexts.get(key) ?? [];
    list.push(attempt);
    contexts.set(key, list);
  });
  return cloneFreeze([...contexts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, rows]) => {
    const ordered = rows.slice().sort(compareAttempts);
    const first = ordered[0]!;
    const limit = limitFromOptions(first, options);
    const latest = ordered[ordered.length - 1]!;
    return {
      contextId: first.contextId,
      placementId: first.placementId,
      surface: first.surface,
      attemptLimit: limit,
      attemptsUsed: ordered.length,
      attemptsRemaining: limit === null ? null : Math.max(0, limit - ordered.length),
      completionStatus: ordered.some((row) => row.completionStatus === 'completed') ? 'completed' : 'not-completed',
      latestAttemptId: latest.attemptId,
      attemptIds: ordered.map((row) => row.attemptId),
    } satisfies BookResultContextSummary;
  }));
};

/**
 * Groups viewer summaries by recipient/student + Activity only.  Context and
 * placement remain fields on every attempt and receive separate completion and
 * attempt-limit counters; equal attempt numbers from two contexts are never
 * merged into one attempt.
 */
export const groupBookResultAttempts = (
  inputs: readonly BookResultProjectionInputLike[],
  options: BookResultGroupingOptions = {},
): readonly BookResultGroupSummary[] => {
  if (!Array.isArray(inputs)) throw new BookResultProjectionError('invalid-record', 'inputs: Expected an array.');
  const errors: MutableErrors = [];
  validateLimit(options.attemptPolicy?.maxAttempts ?? null, '$.options.attemptPolicy.maxAttempts', errors);
  options.contextPolicies?.forEach((policy, index) => {
    if (!isId(policy.contextId) || !isId(policy.placementId)) push(errors, 'invalid-value', `$.options.contextPolicies[${index}]`, 'Context policy identity is invalid.');
    validateLimit(policy.maxAttempts, `$.options.contextPolicies[${index}].maxAttempts`, errors);
  });
  if (errors.length > 0) throw new BookResultProjectionError(errors[0].code, `${errors[0].path}: ${errors[0].message}`, errors);
  const projections = inputs.map((input, index) => {
    if (isRecord(input) && own(input, 'summary') && own(input, 'detail')) {
      const detail = input.detail as BookResultAttemptDetail;
      if (!validateBookResultAttemptDetail(detail).valid) {
        throw new BookResultProjectionError('invalid-record', `inputs[${index}]: Malformed projected detail.`);
      }
      return input as BookResultProjection;
    }
    return projectBookResultAttempt(input as BookResultProjectionInput);
  });
  const seen = new Set<string>();
  const groups = new Map<string, BookResultAttemptSummary[]>();
  projections.forEach((projection, index) => {
    const summary = projection.summary;
    if (seen.has(summary.attemptId)) throw new BookResultProjectionError('duplicate-id', `inputs[${index}].attemptId: Attempt ID is duplicated.`);
    seen.add(summary.attemptId);
    const key = `${summary.studentId}:${summary.activityId}`;
    const list = groups.get(key) ?? [];
    list.push(summary);
    groups.set(key, list);
  });
  return cloneFreeze([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([groupKey, rows]) => {
    const attempts = rows.slice().sort(compareAttempts);
    const contexts = groupContexts(attempts, options);
    const latest = attempts[attempts.length - 1]!;
    return {
      groupKey,
      recipientId: latest.recipientId,
      studentId: latest.studentId,
      activityId: latest.activityId,
      attemptCount: attempts.length,
      attempts,
      contexts,
      latestAttemptId: latest.attemptId,
    } satisfies BookResultGroupSummary;
  }));
};

const validateSummaryShape = (value: unknown, path: string, errors: MutableErrors, allowResponse = false): value is BookResultAttemptSummary => {
  if (!isRecord(value)) { push(errors, 'invalid-record', path, 'Summary must be a plain object.'); return false; }
  const required = [
    'activityId', 'activityVersion', 'activityVersionId', 'attemptId', 'attemptLimit', 'attemptNumber',
    'attemptsRemaining', 'attemptsUsed', 'bindingId', 'bindingRevision', 'completedAt', 'completion',
    'completionId', 'completionStatus', 'contextId', 'createdAt', 'deliveryContextId', 'deliveryId',
    'evaluation', 'evaluationStatus', 'feedback', 'homeworkId', 'interactionId', 'ownerId', 'pageGroupKeys',
    'placementId', 'recipientId', 'resultId', 'resultStatus', 'schemaVersion', 'sourceAvailability',
    'sourceAvailable', 'sourceProvenance', 'sources', 'studentId', 'submittedAt', 'surface',
  ];
  if (!exact(value, required, allowResponse ? ['response'] : [], path, errors)) return false;
  if (value.schemaVersion !== BOOK_RESULT_PROJECTION_SCHEMA_VERSION || !isId(value.attemptId)
    || !isId(value.resultId) || !isId(value.completionId) || !isId(value.recipientId)
    || value.studentId !== value.recipientId || !isId(value.activityId) || !isId(value.contextId)
    || !isId(value.deliveryContextId) || !isId(value.deliveryId) || !isId(value.placementId)
    || !isId(value.bindingId) || !isId(value.activityVersionId) || !isId(value.interactionId)
    || !isPositiveInt(value.activityVersion) || !isNonNegativeInt(value.bindingRevision)
    || !isPositiveInt(value.attemptNumber) || !isPositiveInt(value.attemptsUsed)
    || !isIso(value.createdAt) || !isIso(value.submittedAt) || !isIso(value.completedAt)
    || !CONTEXT_KINDS.includes(value.surface as BookResultSurface)
    || !SOURCE_AVAILABILITIES.includes(value.sourceAvailability as BookResultSourceAvailability)
    || typeof value.sourceAvailable !== 'boolean'
    || !['pending_review', 'submitted'].includes(value.resultStatus as string)
    || !EVALUATION_STATUSES.includes(value.evaluationStatus as BookResultEvaluationStatus)
    || value.completionStatus !== 'completed') {
    push(errors, 'invalid-value', path, 'Summary identity or status is invalid.');
  }
  if (value.ownerId !== null && !isId(value.ownerId)) push(errors, 'invalid-value', `${path}.ownerId`, 'Owner snapshot is invalid.');
  if (value.homeworkId !== null && !isId(value.homeworkId)) push(errors, 'invalid-value', `${path}.homeworkId`, 'Homework snapshot is invalid.');
  if (value.attemptLimit !== null && !isPositiveInt(value.attemptLimit)) push(errors, 'invalid-value', `${path}.attemptLimit`, 'Attempt limit is invalid.');
  if (value.attemptsRemaining !== null && !isNonNegativeInt(value.attemptsRemaining)) push(errors, 'invalid-value', `${path}.attemptsRemaining`, 'Remaining attempt count is invalid.');
  validatePageGroups(value.pageGroupKeys, `${path}.pageGroupKeys`, errors);
  validateSourceProvenance(value.sourceProvenance, `${path}.sourceProvenance`, errors);
  if (isRecord(value.completion)) {
    exact(value.completion, ['activityVersion', 'activityVersionId', 'attemptId', 'completionId', 'contextId', 'createdAt', 'placementId', 'resultId', 'status'], [], `${path}.completion`, errors);
    if (value.completion.status !== 'completed' || value.completion.attemptId !== value.attemptId
      || value.completion.completionId !== value.completionId || value.completion.resultId !== value.resultId
      || value.completion.contextId !== value.contextId || value.completion.placementId !== value.placementId
      || value.completion.activityVersionId !== value.activityVersionId || value.completion.activityVersion !== value.activityVersion
      || !isIso(value.completion.createdAt)) push(errors, 'identity-mismatch', `${path}.completion`, 'Completion snapshot does not match summary identity.');
  } else push(errors, 'invalid-record', `${path}.completion`, 'Completion snapshot is invalid.');
  if (isRecord(value.evaluation)) validateEvaluation(value.evaluation, `${path}.evaluation`, errors);
  else push(errors, 'invalid-record', `${path}.evaluation`, 'Evaluation projection is invalid.');
  if (isRecord(value.feedback)) {
    exact(value.feedback, ['available', 'release'], ['correctionNote', 'releasedAt', 'text'], `${path}.feedback`, errors);
    if (!FEEDBACK_RELEASES.includes(value.feedback.release as typeof FEEDBACK_RELEASES[number]) || typeof value.feedback.available !== 'boolean') push(errors, 'invalid-value', `${path}.feedback`, 'Feedback projection is invalid.');
    if (value.feedback.available !== (value.feedback.release === 'released')) push(errors, 'invalid-value', `${path}.feedback.available`, 'Feedback availability must match release state.');
    if (value.feedback.releasedAt !== undefined && !isIso(value.feedback.releasedAt)) push(errors, 'invalid-value', `${path}.feedback.releasedAt`, 'Feedback release timestamp is invalid.');
    if (value.feedback.text !== undefined && !isText(value.feedback.text)) push(errors, 'invalid-value', `${path}.feedback.text`, 'Feedback text is invalid.');
    if (value.feedback.correctionNote !== undefined && !isText(value.feedback.correctionNote)) push(errors, 'invalid-value', `${path}.feedback.correctionNote`, 'Feedback correction note is invalid.');
    if (value.feedback.release !== 'released' && (value.feedback.text !== undefined || value.feedback.correctionNote !== undefined || value.feedback.releasedAt !== undefined)) push(errors, 'invalid-value', `${path}.feedback`, 'Unreleased feedback must not carry visible content.');
  } else push(errors, 'invalid-record', `${path}.feedback`, 'Feedback projection is invalid.');
  if (!Array.isArray(value.sources)) push(errors, 'invalid-value', `${path}.sources`, 'Sources must be an array.');
  else {
    if (value.sources.length !== (value.sourceProvenance as readonly unknown[]).length) push(errors, 'provenance-mismatch', `${path}.sources`, 'Source projections must preserve provenance cardinality.');
    value.sources.forEach((source, index) => {
      const sourcePath = `${path}.sources[${index}]`;
      if (!isRecord(source) || !exact(source, ['availability', 'available', 'componentId', 'displayOnly', 'pages', 'sourceKey', 'sourceVersionId'], [], sourcePath, errors)) return;
      const provenance = (value.sourceProvenance as readonly BookRuntimeSourceProvenance[])[index];
      if (!isId(source.sourceKey) || !isId(source.componentId) || source.componentId !== source.sourceKey || !isId(source.sourceVersionId)
        || !Array.isArray(source.pages) || !source.pages.every(isPositiveInt) || !SOURCE_AVAILABILITIES.includes(source.availability as BookResultSourceAvailability)
        || typeof source.available !== 'boolean' || typeof source.displayOnly !== 'boolean'
        || (provenance !== undefined && (source.sourceKey !== provenance.sourceKey || source.sourceVersionId !== provenance.sourceVersionId || stable(source.pages) !== stable(provenance.pages)))) {
        push(errors, 'provenance-mismatch', sourcePath, 'Source projection does not preserve safe provenance.');
      }
      if (source.available !== (source.availability === 'available') || source.displayOnly !== (source.availability !== 'available')) push(errors, 'invalid-value', sourcePath, 'Source authority flags are invalid.');
    });
  }
  return true;
};

export const validateBookResultAttemptDetail = (value: unknown): BookResultProjectionValidationResult => {
  const errors: MutableErrors = [];
  if (validateSummaryShape(value, '$', errors, true)) {
    const detail = value as unknown as Record<string, unknown>;
    if (!own(detail, 'response')) push(errors, 'missing-field', '$.response', 'Response is required.');
    else {
      try { cloneFreeze(detail.response); } catch { push(errors, 'invalid-record', '$.response', 'Response is not cloneable.'); }
    }
  }
  return deepFreeze({ valid: errors.length === 0, errors: errors.slice() });
};

export const validateBookResultGroupSummary = (value: unknown): BookResultProjectionValidationResult => {
  const errors: MutableErrors = [];
  if (!isRecord(value) || !exact(value, ['activityId', 'attemptCount', 'attempts', 'contexts', 'groupKey', 'latestAttemptId', 'recipientId', 'studentId'], [], '$', errors)) return deepFreeze({ valid: false, errors: errors.slice() });
  if (!isId(value.groupKey) || !isId(value.recipientId) || !isId(value.studentId) || value.studentId !== value.recipientId || !isId(value.activityId) || !isId(value.latestAttemptId) || !isPositiveInt(value.attemptCount)) push(errors, 'invalid-value', '$', 'Group identity is invalid.');
  const attemptIds = new Set<string>();
  if (!Array.isArray(value.attempts) || value.attempts.length !== value.attemptCount) push(errors, 'invalid-value', '$.attempts', 'Group attempts are invalid.');
  else value.attempts.forEach((attempt, index) => {
    if (validateSummaryShape(attempt, `$.attempts[${index}]`, errors)) {
      if (attempt.studentId !== value.studentId || attempt.activityId !== value.activityId) push(errors, 'identity-mismatch', `$.attempts[${index}]`, 'Attempt is outside the group key.');
      if (attemptIds.has(attempt.attemptId)) push(errors, 'duplicate-id', `$.attempts[${index}].attemptId`, 'Attempt ID is duplicated.');
      attemptIds.add(attempt.attemptId);
    }
  });
  if (!Array.isArray(value.contexts)) push(errors, 'invalid-value', '$.contexts', 'Group contexts are invalid.');
  else {
    const contextKeys = new Set<string>();
    value.contexts.forEach((context, index) => {
      const path = `$.contexts[${index}]`;
      if (!isRecord(context) || !exact(context, ['attemptIds', 'attemptLimit', 'attemptsRemaining', 'attemptsUsed', 'completionStatus', 'contextId', 'latestAttemptId', 'placementId', 'surface'], [], path, errors)) return;
      if (!isId(context.contextId) || !isId(context.placementId) || !isId(context.latestAttemptId)
        || !CONTEXT_KINDS.includes(context.surface as BookResultSurface)
        || !['completed', 'not-completed'].includes(context.completionStatus as string)
        || !isPositiveInt(context.attemptsUsed) || (context.attemptLimit !== null && !isPositiveInt(context.attemptLimit))
        || (context.attemptsRemaining !== null && !isNonNegativeInt(context.attemptsRemaining))
        || !Array.isArray(context.attemptIds) || context.attemptIds.some((attemptId) => !isId(attemptId))) {
        push(errors, 'invalid-value', path, 'Context summary is malformed.');
        return;
      }
      const key = `${context.surface}:${context.contextId}:${context.placementId}`;
      if (contextKeys.has(key)) push(errors, 'duplicate-id', path, 'Context summary is duplicated.');
      contextKeys.add(key);
      if (context.attemptIds.length !== context.attemptsUsed || context.attemptIds.some((attemptId) => !attemptIds.has(attemptId)) || !context.attemptIds.includes(context.latestAttemptId)) {
        push(errors, 'identity-mismatch', path, 'Context attempts do not match group attempts.');
      }
      if (context.attemptLimit !== null && context.attemptsRemaining !== Math.max(0, context.attemptLimit - context.attemptsUsed)) {
        push(errors, 'invalid-value', `${path}.attemptsRemaining`, 'Context attempt limit does not reconcile.');
      }
    });
  }
  if (isId(value.latestAttemptId) && !attemptIds.has(value.latestAttemptId)) push(errors, 'identity-mismatch', '$.latestAttemptId', 'Latest attempt is absent from group attempts.');
  return deepFreeze({ valid: errors.length === 0, errors: errors.slice() });
};
