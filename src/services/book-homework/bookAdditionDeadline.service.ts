import type {
  BookHomeworkAuthoritySchedule,
  BookHomeworkStudentExtension,
} from './bookHomeworkAuthority.types';
import type { BookHomeworkStructuralOutlineNode } from '../../types/homework.types';
import {
  resolveBookScheduleWindow,
  type BookScheduleWindowDecision,
} from '../book-delivery/bookScheduleWindow.service';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type BookAdditionDeadlineErrorCode =
  | 'invalid-input'
  | 'optional-context-unsupported'
  | 'applicability-policy-unsupported'
  | 'schedule-revision-stale'
  | 'effective-window-unavailable'
  | 'replacement-deadline-required'
  | 'replacement-deadline-invalid'
  | 'replacement-deadline-shortened';

export class BookAdditionDeadlineError extends Error {
  constructor(
    readonly code: BookAdditionDeadlineErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'BookAdditionDeadlineError';
  }
}

/**
 * This is deliberately the complete trusted schedule-window input. V1 does
 * not accept an optional/applicability policy and does not infer one for an
 * added placement. The policy and attempt facts are frozen authority facts
 * supplied by the caller, while schedule precedence stays in the shared
 * schedule-window resolver.
 */
export interface BookAdditionDeadlineInput {
  readonly assignmentId: string;
  readonly contextKey: string;
  readonly recipientId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
  readonly contextMode: 'required';
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly outline: readonly BookHomeworkStructuralOutlineNode[];
  readonly studentExtensions: Readonly<Record<string, BookHomeworkStudentExtension>>;
  readonly lateSubmissionAllowed: boolean;
  readonly policyRevision: number;
  readonly authorityRevision: number;
  readonly scheduleRevision: number;
  readonly expectedScheduleRevision: number;
  readonly evaluatedAt: string;
  readonly maxAttempts: number | null;
  readonly attemptsUsed: number;
  readonly replacementDeadline?: string;
  /** Rejected at runtime even when received from an untyped Worker payload. */
  readonly applicabilityPolicy?: never;
  /** Rejected at runtime even when received from an untyped Worker payload. */
  readonly optional?: never;
}

export interface BookAdditionDeadlineResolution {
  readonly assignmentId: string;
  readonly contextKey: string;
  readonly recipientId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly nodeKey: string;
  readonly scheduleRevision: number;
  readonly effectiveDeadlineAt: string;
  readonly effectiveDeadlineSource: BookScheduleWindowDecision['deadline']['source'];
  readonly replacementDeadlineAt: string | null;
  readonly requiresReplacementDeadline: boolean;
  readonly window: BookScheduleWindowDecision;
}

export type BookAdditionDeadlineResult =
  | { readonly status: 'resolved'; readonly resolution: BookAdditionDeadlineResolution }
  | { readonly status: 'rejected'; readonly code: BookAdditionDeadlineErrorCode };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const canonicalIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

const assertId = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookAdditionDeadlineError('invalid-input', `${label} must be a safe identifier.`);
  }
};

const assertPositive = (value: unknown, label: string): asserts value is number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BookAdditionDeadlineError('invalid-input', `${label} must be positive.`);
  }
};

const assertCanonical = (value: unknown, label: string): asserts value is string => {
  if (!canonicalIso(value)) {
    throw new BookAdditionDeadlineError('invalid-input', `${label} must be canonical UTC.`);
  }
};

const rejectUnsupportedPolicy = (input: Record<string, unknown>): void => {
  if (input.contextMode !== 'required') {
    throw new BookAdditionDeadlineError(
      'optional-context-unsupported',
      'Book additions require an explicit required context; optional applicability is unsupported in V1.',
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'applicabilityPolicy')
    || Object.prototype.hasOwnProperty.call(input, 'optional')
    || Object.prototype.hasOwnProperty.call(input, 'applicability')) {
    throw new BookAdditionDeadlineError(
      'applicability-policy-unsupported',
      'V1 rejects optional/applicability policy inputs instead of inventing policy.',
    );
  }
};

const validateShape = (input: BookAdditionDeadlineInput): void => {
  const value = input as unknown as Record<string, unknown>;
  if (!isRecord(value)) throw new BookAdditionDeadlineError('invalid-input');
  rejectUnsupportedPolicy(value);
  [
    ['assignmentId', input.assignmentId],
    ['contextKey', input.contextKey],
    ['recipientId', input.recipientId],
    ['studentId', input.studentId],
    ['bindingId', input.bindingId],
    ['placementId', input.placementId],
    ['activityId', input.activityId],
    ['nodeKey', input.nodeKey],
  ].forEach(([label, candidate]) => assertId(candidate, String(label)));
  if (input.recipientId !== input.studentId) {
    throw new BookAdditionDeadlineError('invalid-input', 'Recipient and student identities must match.');
  }
  if (input.contextKey !== `homework:${input.assignmentId}`) {
    throw new BookAdditionDeadlineError('invalid-input', 'Addition context must be the exact selected Homework context.');
  }
  assertPositive(input.bindingRevision, 'bindingRevision');
  assertPositive(input.activityVersion, 'activityVersion');
  assertPositive(input.policyRevision, 'policyRevision');
  assertPositive(input.authorityRevision, 'authorityRevision');
  assertPositive(input.scheduleRevision, 'scheduleRevision');
  assertPositive(input.expectedScheduleRevision, 'expectedScheduleRevision');
  if (input.scheduleRevision !== input.expectedScheduleRevision) {
    throw new BookAdditionDeadlineError('schedule-revision-stale', 'Schedule revision is stale.');
  }
  assertCanonical(input.evaluatedAt, 'evaluatedAt');
  if (input.replacementDeadline !== undefined) assertCanonical(input.replacementDeadline, 'replacementDeadline');
  if (!Array.isArray(input.outline) || input.outline.length === 0 || !isRecord(input.studentExtensions)) {
    throw new BookAdditionDeadlineError('invalid-input', 'Schedule outline and student extensions are required.');
  }
  const outlineKeys = new Set(input.outline.map((node) => node.nodeKey));
  for (const [key, extension] of Object.entries(input.studentExtensions)) {
    if (!ID.test(key)
      || !isRecord(extension)
      || extension.nodeKey !== key
      || !outlineKeys.has(key)
      || !canonicalIso(extension.dueAt)) {
      throw new BookAdditionDeadlineError('invalid-input', 'Student extension identity is invalid.');
    }
  }
  if (typeof input.lateSubmissionAllowed !== 'boolean'
    || (input.maxAttempts !== null && !Number.isSafeInteger(input.maxAttempts))
    || !Number.isSafeInteger(input.attemptsUsed)
    || input.attemptsUsed < 0) {
    throw new BookAdditionDeadlineError('invalid-input', 'Frozen Homework attempt policy is invalid.');
  }
}

/**
 * Resolve the effective deadline for exactly one selected Homework context.
 * A replacement can extend the effective deadline, but can never shorten an
 * inherited deadline or an individual extension. Expiry is inclusive at the
 * exact deadline instant, matching action acceptance semantics.
 */
export const resolveBookAdditionDeadline = (
  input: BookAdditionDeadlineInput,
): BookAdditionDeadlineResolution => {
  validateShape(input);
  let window: BookScheduleWindowDecision;
  try {
    window = resolveBookScheduleWindow({
      assignmentId: input.assignmentId,
      recipientId: input.recipientId,
      bindingId: input.bindingId,
      bindingRevision: input.bindingRevision,
      placementId: input.placementId,
      activityId: input.activityId,
      activityVersion: input.activityVersion,
      nodeKey: input.nodeKey,
      operation: 'launch',
      schedule: input.schedule,
      outline: input.outline,
      studentExtensions: input.studentExtensions,
      lateSubmissionAllowed: input.lateSubmissionAllowed,
      policyRevision: input.policyRevision,
      authorityRevision: input.authorityRevision,
      evaluatedAt: input.evaluatedAt,
      maxAttempts: input.maxAttempts,
      attemptsUsed: input.attemptsUsed,
    });
  } catch (error) {
    if (error instanceof BookAdditionDeadlineError) throw error;
    throw new BookAdditionDeadlineError(
      'effective-window-unavailable',
      error instanceof Error ? error.message : 'Effective schedule window is unavailable.',
    );
  }

  const effectiveDeadlineAt = window.deadline.at;
  if (effectiveDeadlineAt === null) {
    throw new BookAdditionDeadlineError('effective-window-unavailable', 'A Homework deadline is required.');
  }
  const now = Date.parse(input.evaluatedAt);
  const effective = Date.parse(effectiveDeadlineAt);
  const expired = effective <= now;
  const replacement = input.replacementDeadline;
  if (expired && replacement === undefined) {
    throw new BookAdditionDeadlineError(
      'replacement-deadline-required',
      'An expired effective Homework deadline requires an explicit future replacement deadline.',
    );
  }
  if (replacement !== undefined) {
    const replacementAt = Date.parse(replacement);
    if (!Number.isFinite(replacementAt) || replacementAt <= now) {
      throw new BookAdditionDeadlineError(
        'replacement-deadline-invalid',
        'Replacement deadline must be strictly in the future.',
      );
    }
    if (replacementAt < effective) {
      throw new BookAdditionDeadlineError(
        'replacement-deadline-shortened',
        'Replacement deadline cannot shorten the inherited deadline or individual extension.',
      );
    }
  }
  return Object.freeze({
    assignmentId: input.assignmentId,
    contextKey: input.contextKey,
    recipientId: input.recipientId,
    studentId: input.studentId,
    bindingId: input.bindingId,
    bindingRevision: input.bindingRevision,
    placementId: input.placementId,
    nodeKey: input.nodeKey,
    scheduleRevision: input.scheduleRevision,
    effectiveDeadlineAt,
    effectiveDeadlineSource: window.deadline.source,
    replacementDeadlineAt: replacement ?? null,
    requiresReplacementDeadline: expired,
    window,
  });
};

export const tryResolveBookAdditionDeadline = (
  input: BookAdditionDeadlineInput,
): BookAdditionDeadlineResult => {
  try {
    return { status: 'resolved', resolution: resolveBookAdditionDeadline(input) };
  } catch (error) {
    return {
      status: 'rejected',
      code: error instanceof BookAdditionDeadlineError ? error.code : 'effective-window-unavailable',
    };
  }
};

export const createBookAdditionDeadlineResolver = () => Object.freeze({
  resolve: resolveBookAdditionDeadline,
  tryResolve: tryResolveBookAdditionDeadline,
});
