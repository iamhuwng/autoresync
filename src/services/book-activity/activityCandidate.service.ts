import type {
  ActivityDiff,
  ActivityValidationContext,
  ActivityValidationResult,
  EditableActivity,
  NormalizedActivity,
} from '../../types/bookActivity.types';
import { normalizeActivity } from './activityCanonical.service';
import { diffActivities } from './activityDiff.service';
import { validateEditableActivity } from './activitySchema.service';

export const BOOK_ACTIVITY_EVIDENCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
export const BOOK_ACTIVITY_MAX_EVIDENCE_REFS = 32;

export interface ActivityCandidateInput {
  targetActivityId?: string;
  content: unknown;
  evidenceRefs?: readonly string[];
  sourceEvidenceRefs?: readonly string[];
  answerEvidenceRefs?: readonly string[];
}

export interface ValidatedActivityCandidate {
  targetActivityId?: string;
  content: EditableActivity;
  normalized: NormalizedActivity;
  validation: ActivityValidationResult;
  diff: ActivityDiff;
  evidenceRefs: string[];
  sourceEvidenceRefs: string[];
  answerEvidenceRefs: string[];
}

export class ActivityCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityCandidateError';
  }
}

export const validateEvidenceRefs = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > BOOK_ACTIVITY_MAX_EVIDENCE_REFS) {
    throw new ActivityCandidateError('Evidence references are invalid.');
  }
  if (value.some((entry) => typeof entry !== 'string' || !BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(entry))) {
    throw new ActivityCandidateError('Evidence references are invalid.');
  }
  if (new Set(value).size !== value.length) {
    throw new ActivityCandidateError('Evidence references must be unique.');
  }
  return [...value];
};

/**
 * Validates untrusted editable JSON before it crosses the authoring boundary.
 * Worker repeats this check on every mutation; client validation is UX only.
 */
export const validateActivityCandidate = (
  input: ActivityCandidateInput,
  previous: NormalizedActivity | undefined,
  validationContext: ActivityValidationContext = {},
): ValidatedActivityCandidate => {
  if (input.targetActivityId !== undefined && (
    typeof input.targetActivityId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}$/u.test(input.targetActivityId)
  )) {
    throw new ActivityCandidateError('Target Activity ID is invalid.');
  }
  const evidenceRefs = validateEvidenceRefs(input.evidenceRefs);
  const sourceEvidenceRefs = validateEvidenceRefs(input.sourceEvidenceRefs);
  const answerEvidenceRefs = validateEvidenceRefs(input.answerEvidenceRefs);
  const validation = validateEditableActivity(input.content, validationContext);
  if (!validation.valid) {
    throw new ActivityCandidateError('Activity candidate failed schema validation.');
  }
  const normalized = normalizeActivity(validation.value, undefined, previous, validationContext);
  return {
    ...(input.targetActivityId === undefined ? {} : { targetActivityId: input.targetActivityId }),
    content: validation.value,
    normalized,
    validation,
    diff: diffActivities(previous ?? null, normalized),
    evidenceRefs,
    sourceEvidenceRefs,
    answerEvidenceRefs,
  };
};
