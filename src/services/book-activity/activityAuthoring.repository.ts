import type { ActivityAuthoringTransport } from './activityStorage.service';
import type {
  ActivityDiff,
  ActivityValidationError,
} from '../../types/bookActivity.types';
import {
  BOOK_ACTIVITY_EVIDENCE_REF_PATTERN,
  BOOK_ACTIVITY_MAX_EVIDENCE_REFS,
} from './activityCandidate.service';

export interface ActivityAuthoringMutation {
  operationId: string;
  expectedRevision: number;
  /** Transport hint only; the Worker verifies it against owned Book metadata. */
  bookId?: string;
  targetActivityId?: string;
  candidateId?: string;
  content?: unknown;
  evidenceRefs?: string[];
  sourceEvidenceRefs?: string[];
  answerEvidenceRefs?: string[];
  unitActivityBinding?: { readonly unitKey: string; readonly activityKey: string };
}

export type ActivityCandidateLifecycle =
  | 'staged'
  | 'validated'
  | 'rejected'
  | 'saved'
  | 'discarded';

export interface ActivityCandidateValidation {
  valid: boolean;
  errors: ActivityValidationError[];
}

interface MutationResultBase {
  candidateId: string;
  revision: number;
  lifecycle: ActivityCandidateLifecycle;
  replayed?: true;
}

export interface ActivityStageResult extends MutationResultBase {
  status: 'staged';
  targetActivityId: string;
  validation: ActivityCandidateValidation;
  diff: ActivityDiff | null;
  evidenceRefs: string[];
  sourceEvidenceRefs?: string[];
  answerEvidenceRefs?: string[];
}

export interface ActivityValidateResult extends MutationResultBase {
  status: 'validated';
  validation: ActivityCandidateValidation;
  diff: ActivityDiff | null;
  evidenceRefs: string[];
  sourceEvidenceRefs?: string[];
  answerEvidenceRefs?: string[];
}

export interface ActivitySaveDraftResult extends MutationResultBase {
  status: 'saved';
  activityId: string;
  candidateRevision: number;
  validation: ActivityCandidateValidation;
  diff: ActivityDiff | null;
  evidenceRefs: string[];
  sourceEvidenceRefs?: string[];
  answerEvidenceRefs?: string[];
  /** Server-owned Unit-slot binding receipt returned after a Book save. */
  binding?: ActivityAuthoringBindingReceipt;
}

export type ActivityAuthoringBindingPhase = 'binding-pending' | 'complete' | 'binding-conflict';

export interface ActivityAuthoringBindingReceipt {
  schemaVersion: 1;
  ownerId: string;
  bookId: string;
  unitKey: string;
  activityKey: string;
  activityId: string;
  candidateId: string;
  candidateRevision: number;
  candidateLifecycle: 'saved';
  phase: ActivityAuthoringBindingPhase;
  activityVersionId?: string;
  activityVersion?: number;
}

export interface ActivityDiscardResult extends MutationResultBase {
  status: 'discarded';
}

export interface LoadedActivityCandidate {
  candidateId: string;
  targetActivityId: string;
  ownerId: string;
  bookId?: string;
  targetRevision: number;
  revision: number;
  lifecycle: ActivityCandidateLifecycle;
  content: unknown;
  validation: ActivityCandidateValidation;
  diff: ActivityDiff | null;
  evidenceRefs: string[];
  sourceEvidenceRefs?: string[];
  answerEvidenceRefs?: string[];
  updatedAt: number;
}

export interface ActivityLoadCandidateResult {
  status: 'loaded';
  candidate: LoadedActivityCandidate;
}

export interface ActivityAuthoringRepository {
  stage(input: ActivityAuthoringMutation): Promise<ActivityStageResult>;
  validate(input: ActivityAuthoringMutation): Promise<ActivityValidateResult>;
  saveDraft(input: ActivityAuthoringMutation): Promise<ActivitySaveDraftResult>;
  discard(input: ActivityAuthoringMutation): Promise<ActivityDiscardResult>;
  loadCandidate(candidateId: string): Promise<ActivityLoadCandidateResult>;
}

const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const MAX_TEXT = 512;
const MAX_VALIDATION_ERRORS = 128;
const MAX_DIFF_REASONS = 128;
const DIFF_CLASSES = new Set<ActivityDiff['classification']>([
  'unchanged',
  'display-only',
  'regrade',
  'redo-required',
  'added',
  'removed',
  'reordered',
  'presentation-context',
  'unsupported',
]);

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return value as Record<string, unknown>;
};
const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> => {
  const result = record(value);
  if (
    required.some((key) => !(key in result))
    || Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return result;
};
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return value;
};
const revision = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return value;
};
const lifecycle = (value: unknown): ActivityCandidateLifecycle => {
  if (
    value !== 'staged'
    && value !== 'validated'
    && value !== 'rejected'
    && value !== 'saved'
    && value !== 'discarded'
  ) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return value;
};
const boundedText = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return value;
};
const validation = (value: unknown): ActivityCandidateValidation => {
  const result = exact(value, ['valid', 'errors']);
  if (typeof result.valid !== 'boolean' || !Array.isArray(result.errors) ||
      result.errors.length > MAX_VALIDATION_ERRORS) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  const errors = result.errors.map((entry) => {
    const item = exact(entry, ['code', 'path', 'message']);
    return {
      code: boundedText(item.code),
      path: boundedText(item.path),
      message: boundedText(item.message),
    };
  });
  if (result.valid && errors.length !== 0) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return { valid: result.valid, errors };
};
const diff = (value: unknown): ActivityDiff | null => {
  if (value === null) return null;
  const result = exact(value, ['classification', 'reasons', 'requiresRedo']);
  if (
    typeof result.classification !== 'string'
    || !DIFF_CLASSES.has(result.classification as ActivityDiff['classification'])
    || !Array.isArray(result.reasons)
    || result.reasons.length > MAX_DIFF_REASONS
    || typeof result.requiresRedo !== 'boolean'
  ) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  const reasons = result.reasons.map(boundedText);
  const requiresRedo = result.classification === 'redo-required'
    || result.classification === 'reordered'
    || result.classification === 'unsupported';
  if (result.requiresRedo !== requiresRedo) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return {
    classification: result.classification,
    reasons,
    requiresRedo,
  } as ActivityDiff;
};
const evidenceRefs = (value: unknown): string[] => {
  if (
    !Array.isArray(value)
    || value.length > BOOK_ACTIVITY_MAX_EVIDENCE_REFS
    || value.some((entry) =>
      typeof entry !== 'string' || !BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(entry))
    || new Set(value).size !== value.length
  ) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return [...value];
};
const optionalEvidenceRefs = (value: unknown): string[] => (
  value === undefined ? [] : evidenceRefs(value)
);
const binding = (value: unknown): ActivityAuthoringBindingReceipt => {
  const result = exact(value, [
    'schemaVersion', 'ownerId', 'bookId', 'unitKey', 'activityKey',
    'activityId', 'candidateId', 'candidateRevision', 'candidateLifecycle', 'phase',
  ], ['activityVersionId', 'activityVersion']);
  if (result.schemaVersion !== 1
    || result.candidateLifecycle !== 'saved'
    || (result.phase !== 'binding-pending'
      && result.phase !== 'complete'
      && result.phase !== 'binding-conflict')) {
    throw new Error('Activity authoring returned a malformed response.');
  }
  return {
    schemaVersion: 1,
    ownerId: id(result.ownerId),
    bookId: id(result.bookId),
    unitKey: id(result.unitKey),
    activityKey: id(result.activityKey),
    activityId: id(result.activityId),
    candidateId: id(result.candidateId),
    candidateRevision: revision(result.candidateRevision),
    candidateLifecycle: 'saved',
    phase: result.phase,
    ...(result.activityVersionId === undefined ? {} : { activityVersionId: id(result.activityVersionId) }),
    ...(result.activityVersion === undefined ? {} : { activityVersion: revision(result.activityVersion) }),
  };
};
const replayed = (value: unknown): { replayed?: true } => {
  if (value === undefined) return {};
  if (value !== true) throw new Error('Activity authoring returned a malformed response.');
  return { replayed: true };
};
const candidateBase = (
  value: Record<string, unknown>,
): MutationResultBase => ({
  candidateId: id(value.candidateId),
  revision: revision(value.revision),
  lifecycle: lifecycle(value.lifecycle),
  ...replayed(value.replayed),
});

const decodeStage = (value: unknown): ActivityStageResult => {
  const result = exact(value, [
    'status', 'candidateId', 'targetActivityId', 'revision', 'lifecycle',
    'validation', 'diff', 'evidenceRefs',
  ], ['replayed', 'sourceEvidenceRefs', 'answerEvidenceRefs']);
  if (result.status !== 'staged') throw new Error('Activity authoring returned a malformed response.');
  return {
    status: 'staged',
    ...candidateBase(result),
    targetActivityId: id(result.targetActivityId),
    validation: validation(result.validation),
    diff: diff(result.diff),
    evidenceRefs: evidenceRefs(result.evidenceRefs),
    ...(result.sourceEvidenceRefs === undefined ? {} : { sourceEvidenceRefs: optionalEvidenceRefs(result.sourceEvidenceRefs) }),
    ...(result.answerEvidenceRefs === undefined ? {} : { answerEvidenceRefs: optionalEvidenceRefs(result.answerEvidenceRefs) }),
  };
};
const decodeValidate = (value: unknown): ActivityValidateResult => {
  const result = exact(value, [
    'status', 'candidateId', 'revision', 'lifecycle', 'validation', 'diff', 'evidenceRefs',
  ], ['replayed', 'sourceEvidenceRefs', 'answerEvidenceRefs']);
  if (result.status !== 'validated') throw new Error('Activity authoring returned a malformed response.');
  return {
    status: 'validated',
    ...candidateBase(result),
    validation: validation(result.validation),
    diff: diff(result.diff),
    evidenceRefs: evidenceRefs(result.evidenceRefs),
    ...(result.sourceEvidenceRefs === undefined ? {} : { sourceEvidenceRefs: optionalEvidenceRefs(result.sourceEvidenceRefs) }),
    ...(result.answerEvidenceRefs === undefined ? {} : { answerEvidenceRefs: optionalEvidenceRefs(result.answerEvidenceRefs) }),
  };
};
const decodeSaveDraft = (value: unknown): ActivitySaveDraftResult => {
  const result = exact(value, [
    'status', 'activityId', 'revision', 'candidateId', 'candidateRevision',
    'lifecycle', 'validation', 'diff', 'evidenceRefs',
  ], ['replayed', 'sourceEvidenceRefs', 'answerEvidenceRefs', 'binding']);
  if (result.status !== 'saved') throw new Error('Activity authoring returned a malformed response.');
  return {
    status: 'saved',
    ...candidateBase({ ...result, revision: result.revision }),
    activityId: id(result.activityId),
    candidateRevision: revision(result.candidateRevision),
    validation: validation(result.validation),
    diff: diff(result.diff),
    evidenceRefs: evidenceRefs(result.evidenceRefs),
    ...(result.sourceEvidenceRefs === undefined ? {} : { sourceEvidenceRefs: optionalEvidenceRefs(result.sourceEvidenceRefs) }),
    ...(result.answerEvidenceRefs === undefined ? {} : { answerEvidenceRefs: optionalEvidenceRefs(result.answerEvidenceRefs) }),
    ...(result.binding === undefined ? {} : { binding: binding(result.binding) }),
  };
};
const decodeDiscard = (value: unknown): ActivityDiscardResult => {
  const result = exact(
    value,
    ['status', 'candidateId', 'revision', 'lifecycle'],
    ['replayed'],
  );
  if (result.status !== 'discarded') throw new Error('Activity authoring returned a malformed response.');
  return { status: 'discarded', ...candidateBase(result) };
};
const decodeLoad = (value: unknown): ActivityLoadCandidateResult => {
  const result = exact(value, ['status', 'candidate']);
  if (result.status !== 'loaded') throw new Error('Activity authoring returned a malformed response.');
  const candidate = exact(result.candidate, [
    'candidateId', 'targetActivityId', 'ownerId', 'targetRevision', 'revision',
    'lifecycle', 'content', 'validation', 'diff', 'evidenceRefs', 'updatedAt',
  ], ['bookId', 'sourceEvidenceRefs', 'answerEvidenceRefs']);
  return {
    status: 'loaded',
    candidate: {
      candidateId: id(candidate.candidateId),
      targetActivityId: id(candidate.targetActivityId),
      ownerId: id(candidate.ownerId),
      ...(candidate.bookId === undefined ? {} : { bookId: id(candidate.bookId) }),
      targetRevision: revision(candidate.targetRevision),
      revision: revision(candidate.revision),
      lifecycle: lifecycle(candidate.lifecycle),
      content: candidate.content,
      validation: validation(candidate.validation),
      diff: diff(candidate.diff),
      evidenceRefs: evidenceRefs(candidate.evidenceRefs),
      ...(candidate.sourceEvidenceRefs === undefined ? {} : { sourceEvidenceRefs: optionalEvidenceRefs(candidate.sourceEvidenceRefs) }),
      ...(candidate.answerEvidenceRefs === undefined ? {} : { answerEvidenceRefs: optionalEvidenceRefs(candidate.answerEvidenceRefs) }),
      updatedAt: revision(candidate.updatedAt),
    },
  };
};

/** Narrow repository prevents browser code from writing RTDB authoring paths directly. */
export const createActivityAuthoringRepository = (
  transport: ActivityAuthoringTransport,
): ActivityAuthoringRepository => ({
  stage: async (input) => decodeStage(
    await transport.mutate('/book-activity-authoring/stage', input),
  ),
  validate: async (input) => decodeValidate(
    await transport.mutate('/book-activity-authoring/validate', input),
  ),
  saveDraft: async (input) => decodeSaveDraft(
    await transport.mutate('/book-activity-authoring/save-draft', input),
  ),
  discard: async (input) => decodeDiscard(
    await transport.mutate('/book-activity-authoring/discard', input),
  ),
  loadCandidate: async (candidateId) => decodeLoad(
    await transport.read(
      `/book-activity-authoring/candidates/${encodeURIComponent(id(candidateId))}`,
    ),
  ),
});
