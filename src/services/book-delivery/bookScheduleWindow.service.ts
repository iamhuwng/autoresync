import type {
  BookHomeworkAuthoritySchedule,
  BookHomeworkStudentExtension,
} from '../book-homework/bookHomeworkAuthority.types';
import {
  resolveEffectiveBookHomeworkWindow,
} from '../book-homework/bookHomeworkSchedule.service';
import type {
  BookHomeworkStructuralOutlineNode,
} from '../../types/homework.types';

export const BOOK_SCHEDULE_WINDOW_SCHEMA_VERSION = 2 as const;
export const BOOK_SCHEDULE_WINDOW_RESOLVER_VERSION = 2 as const;

export type BookScheduleWindowOperation =
  | 'document'
  | 'launch'
  | 'state'
  | 'autosave'
  | 'submit'
  | 'review';

export type BookScheduleWindowPhase = 'unreleased' | 'available' | 'overdue';

export type BookScheduleWindowDecisionCode =
  | 'book_window_allowed'
  | 'book_assignment_unreleased'
  | 'book_activity_unreleased'
  | 'book_activity_late_submission_denied'
  | 'book_activity_attempt_limit_reached'
  | 'book_review_unavailable';

export interface BookScheduleWindowWinner {
  readonly source: 'open-access' | 'assignment' | 'ancestor' | 'student-extension';
  readonly nodeKey?: string;
  readonly at: string | null;
}

export interface BookScheduleWindowIdentity {
  readonly assignmentId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
}

export interface BookScheduleWindowPermissions {
  readonly canAccessDocument: boolean;
  readonly canLaunch: boolean;
  readonly canReadState: boolean;
  readonly canAutosave: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
}

/**
 * The only student/runtime schedule decision. Callers consume its explicit
 * permissions and never resolve tree precedence, extensions, late policy, or
 * time locally.
 */
export interface BookScheduleWindowDecision {
  readonly kind: 'book-homework-effective-window';
  readonly schemaVersion: typeof BOOK_SCHEDULE_WINDOW_SCHEMA_VERSION;
  readonly resolverVersion: typeof BOOK_SCHEDULE_WINDOW_RESOLVER_VERSION;
  readonly scheduleSchemaVersion: number;
  readonly scheduleResolverVersion: number;
  readonly policyRevision: number;
  readonly authorityRevision: number;
  readonly evaluatedAt: string;
  readonly identity: BookScheduleWindowIdentity;
  readonly operation: BookScheduleWindowOperation;
  readonly phase: BookScheduleWindowPhase;
  readonly completed: boolean;
  readonly attemptLimit: number | null;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number | null;
  readonly attemptsExhausted: boolean;
  readonly release: BookScheduleWindowWinner;
  readonly deadline: BookScheduleWindowWinner;
  readonly lateSubmissionAllowed: boolean;
  readonly permissions: BookScheduleWindowPermissions;
  readonly outcome: 'allowed' | 'denied';
  readonly code: BookScheduleWindowDecisionCode;
}

export interface ResolveBookScheduleWindowInput {
  readonly assignmentId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
  readonly operation: BookScheduleWindowOperation;
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly outline: readonly BookHomeworkStructuralOutlineNode[];
  readonly studentExtensions: Readonly<Record<string, BookHomeworkStudentExtension>>;
  readonly lateSubmissionAllowed: boolean;
  readonly policyRevision: number;
  readonly authorityRevision: number;
  readonly evaluatedAt: string;
  readonly maxAttempts: number | null;
  readonly attemptsUsed: number;
}

const iso = (value: string, label: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
};

const positive = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
};

const ancestors = (
  nodeKey: string,
  outline: readonly BookHomeworkStructuralOutlineNode[],
): readonly string[] => {
  const nodes = new Map(outline.map((node) => [node.nodeKey, node]));
  if (nodes.size !== outline.length) throw new Error('Book schedule outline contains duplicate nodes.');
  const result: string[] = [];
  const seen = new Set<string>();
  let current = nodes.get(nodeKey);
  if (!current) throw new Error(`Unknown Book schedule node ${nodeKey}.`);
  while (current) {
    if (seen.has(current.nodeKey)) throw new Error('Book schedule outline contains a cycle.');
    seen.add(current.nodeKey);
    result.push(current.nodeKey);
    if (current.parentNodeKey === null) break;
    const parent = nodes.get(current.parentNodeKey);
    if (!parent) throw new Error('Book schedule outline contains a missing parent.');
    current = parent;
  }
  return result;
};

const extensionFor = (
  nodeKey: string,
  outline: readonly BookHomeworkStructuralOutlineNode[],
  extensions: Readonly<Record<string, BookHomeworkStudentExtension>>,
): BookHomeworkStudentExtension | undefined => ancestors(nodeKey, outline)
  .map((ancestorKey) => extensions[ancestorKey])
  .find((extension): extension is BookHomeworkStudentExtension => extension !== undefined);

const operationAllowed = (
  operation: BookScheduleWindowOperation,
  permissions: BookScheduleWindowPermissions,
): boolean => {
  switch (operation) {
    case 'document': return permissions.canAccessDocument;
    case 'launch': return permissions.canLaunch;
    case 'state': return permissions.canReadState;
    case 'autosave': return permissions.canAutosave;
    case 'submit': return permissions.canSubmit;
    case 'review': return permissions.canReview;
  }
};

const decisionCode = (
  operation: BookScheduleWindowOperation,
  phase: BookScheduleWindowPhase,
  completed: boolean,
  attemptsExhausted: boolean,
  lateSubmissionAllowed: boolean,
  allowed: boolean,
): BookScheduleWindowDecisionCode => {
  if (allowed) return 'book_window_allowed';
  if (operation === 'document') return 'book_assignment_unreleased';
  if (operation === 'review' && !completed) return 'book_review_unavailable';
  if (phase === 'unreleased') return 'book_activity_unreleased';
  if ((operation === 'autosave' || operation === 'submit') && attemptsExhausted) {
    return 'book_activity_attempt_limit_reached';
  }
  if (operation === 'submit' && phase === 'overdue' && !lateSubmissionAllowed) {
    return 'book_activity_late_submission_denied';
  }
  return 'book_activity_unreleased';
};

export const resolveBookScheduleWindow = (
  input: ResolveBookScheduleWindowInput,
): BookScheduleWindowDecision => {
  iso(input.evaluatedAt, 'evaluatedAt');
  positive(input.bindingRevision, 'bindingRevision');
  positive(input.activityVersion, 'activityVersion');
  positive(input.schedule.schemaVersion, 'scheduleSchemaVersion');
  positive(input.schedule.resolverVersion, 'scheduleResolverVersion');
  positive(input.policyRevision, 'policyRevision');
  positive(input.authorityRevision, 'authorityRevision');
  if (!Number.isSafeInteger(input.attemptsUsed) || input.attemptsUsed < 0) {
    throw new Error('attemptsUsed must be a non-negative integer.');
  }
  if (input.maxAttempts !== null
    && (!Number.isSafeInteger(input.maxAttempts)
      || input.maxAttempts <= 0
      || input.attemptsUsed > input.maxAttempts)) {
    throw new Error('maxAttempts must be null or a positive limit not below attemptsUsed.');
  }

  const extension = extensionFor(input.nodeKey, input.outline, input.studentExtensions);
  const activityWindow = resolveEffectiveBookHomeworkWindow({
    schedule: input.schedule,
    outline: input.outline,
    nodeKey: input.nodeKey,
    ...(extension ? { studentOverride: { dueDate: Date.parse(extension.dueAt) } } : {}),
    now: input.evaluatedAt,
  });
  const assignmentReleaseAt = input.schedule.availableFrom ?? null;
  const assignmentReleased = assignmentReleaseAt === null
    || Date.parse(input.evaluatedAt) >= Date.parse(assignmentReleaseAt);
  const phase: BookScheduleWindowPhase = !activityWindow.isReleased
    ? 'unreleased'
    : activityWindow.isOverdue
      ? 'overdue'
      : 'available';
  const completed = input.attemptsUsed > 0;
  const attemptsRemaining = input.maxAttempts === null
    ? null
    : Math.max(0, input.maxAttempts - input.attemptsUsed);
  const attemptsExhausted = attemptsRemaining === 0;
  const permissions: BookScheduleWindowPermissions = {
    // Assignment start and entitlement gate document delivery. Nested Activity
    // releases never narrow an already-authorized PDF.
    canAccessDocument: assignmentReleased,
    canLaunch: phase !== 'unreleased',
    canReadState: phase !== 'unreleased' || completed,
    canAutosave: phase !== 'unreleased' && !attemptsExhausted,
    canSubmit: phase !== 'unreleased'
      && !attemptsExhausted
      && (phase !== 'overdue' || input.lateSubmissionAllowed),
    // A later schedule edit must never hide an existing result.
    canReview: completed || phase === 'overdue',
  };
  const allowed = operationAllowed(input.operation, permissions);

  return {
    kind: 'book-homework-effective-window',
    schemaVersion: BOOK_SCHEDULE_WINDOW_SCHEMA_VERSION,
    resolverVersion: BOOK_SCHEDULE_WINDOW_RESOLVER_VERSION,
    scheduleSchemaVersion: input.schedule.schemaVersion,
    scheduleResolverVersion: input.schedule.resolverVersion,
    policyRevision: input.policyRevision,
    authorityRevision: input.authorityRevision,
    evaluatedAt: input.evaluatedAt,
    identity: {
      assignmentId: input.assignmentId,
      recipientId: input.recipientId,
      bindingId: input.bindingId,
      bindingRevision: input.bindingRevision,
      placementId: input.placementId,
      activityId: input.activityId,
      activityVersion: input.activityVersion,
      nodeKey: input.nodeKey,
    },
    operation: input.operation,
    phase,
    completed,
    attemptLimit: input.maxAttempts,
    attemptsUsed: input.attemptsUsed,
    attemptsRemaining,
    attemptsExhausted,
    release: {
      source: activityWindow.release.source,
      ...(activityWindow.release.nodeKey ? { nodeKey: activityWindow.release.nodeKey } : {}),
      at: activityWindow.release.value ?? null,
    },
    deadline: extension
      ? {
          source: 'student-extension',
          nodeKey: extension.nodeKey,
          at: extension.dueAt,
        }
      : {
          source: activityWindow.deadline.source,
          ...(activityWindow.deadline.nodeKey ? { nodeKey: activityWindow.deadline.nodeKey } : {}),
          at: activityWindow.deadline.value ?? null,
        },
    lateSubmissionAllowed: input.lateSubmissionAllowed,
    permissions,
    outcome: allowed ? 'allowed' : 'denied',
    code: decisionCode(
      input.operation,
      phase,
      completed,
      attemptsExhausted,
      input.lateSubmissionAllowed,
      allowed,
    ),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const canonicalIso = (value: unknown): value is string => typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value;

const validWinner = (value: unknown): value is BookScheduleWindowWinner => {
  if (!isRecord(value)
    || !['open-access', 'assignment', 'ancestor', 'student-extension'].includes(String(value.source))
    || !(value.at === null || canonicalIso(value.at))) return false;
  return value.nodeKey === undefined || typeof value.nodeKey === 'string';
};

export const isBookScheduleWindowDecision = (
  value: unknown,
): value is BookScheduleWindowDecision => {
  if (!isRecord(value)
    || value.kind !== 'book-homework-effective-window'
    || value.schemaVersion !== BOOK_SCHEDULE_WINDOW_SCHEMA_VERSION
    || value.resolverVersion !== BOOK_SCHEDULE_WINDOW_RESOLVER_VERSION
    || !canonicalIso(value.evaluatedAt)
    || !isRecord(value.identity)
    || !isRecord(value.permissions)
    || !validWinner(value.release)
    || !validWinner(value.deadline)) return false;
  const positiveFields = [
    value.scheduleSchemaVersion,
    value.scheduleResolverVersion,
    value.policyRevision,
    value.authorityRevision,
    value.identity.bindingRevision,
    value.identity.activityVersion,
  ];
  if (positiveFields.some((candidate) => !Number.isSafeInteger(candidate) || Number(candidate) <= 0)) {
    return false;
  }
  if (!['document', 'launch', 'state', 'autosave', 'submit', 'review'].includes(String(value.operation))
    || !['unreleased', 'available', 'overdue'].includes(String(value.phase))
    || !['allowed', 'denied'].includes(String(value.outcome))
    || ![
      'book_window_allowed',
      'book_assignment_unreleased',
      'book_activity_unreleased',
      'book_activity_late_submission_denied',
      'book_activity_attempt_limit_reached',
      'book_review_unavailable',
    ].includes(String(value.code))) return false;
  const ids = [
    value.identity.assignmentId,
    value.identity.recipientId,
    value.identity.bindingId,
    value.identity.placementId,
    value.identity.activityId,
    value.identity.nodeKey,
  ];
  return ids.every((candidate) => typeof candidate === 'string' && candidate.length > 0)
    && typeof value.completed === 'boolean'
    && (value.attemptLimit === null
      || (Number.isSafeInteger(value.attemptLimit) && Number(value.attemptLimit) > 0))
    && Number.isSafeInteger(value.attemptsUsed)
    && Number(value.attemptsUsed) >= 0
    && (value.attemptsRemaining === null
      || (Number.isSafeInteger(value.attemptsRemaining) && Number(value.attemptsRemaining) >= 0))
    && typeof value.attemptsExhausted === 'boolean'
    && value.completed === (Number(value.attemptsUsed) > 0)
    && (value.attemptLimit === null
      ? value.attemptsRemaining === null && value.attemptsExhausted === false
      : value.attemptsRemaining === Math.max(
          0,
          Number(value.attemptLimit) - Number(value.attemptsUsed),
        )
        && Number(value.attemptsUsed) <= Number(value.attemptLimit)
        && value.attemptsExhausted === (value.attemptsRemaining === 0))
    && typeof value.lateSubmissionAllowed === 'boolean'
    && [
      value.permissions.canAccessDocument,
      value.permissions.canLaunch,
      value.permissions.canReadState,
      value.permissions.canAutosave,
      value.permissions.canSubmit,
      value.permissions.canReview,
    ].every((candidate) => typeof candidate === 'boolean')
    && (value.outcome === 'allowed') === operationAllowed(
      value.operation as BookScheduleWindowOperation,
      value.permissions as unknown as BookScheduleWindowPermissions,
    )
    && (value.code === 'book_window_allowed') === (value.outcome === 'allowed');
};

export const requireBookScheduleWindowDecision = (
  value: unknown,
): BookScheduleWindowDecision => {
  if (!isBookScheduleWindowDecision(value)) {
    throw new Error('book_schedule_window_decision_invalid');
  }
  return structuredClone(value);
};
