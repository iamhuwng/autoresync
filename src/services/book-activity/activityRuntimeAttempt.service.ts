import type {
  BookRuntimeCommandKind,
  BookRuntimeScheduleAuthority,
  BookRuntimeScheduleTarget,
} from './activityRuntimeAttempt.types';
import {
  requireBookScheduleWindowDecision,
  type BookScheduleWindowDecision,
} from '../book-delivery/bookScheduleWindow.service';

export type BookRuntimeWindowErrorCode =
  | 'runtime_schedule_window_invalid'
  | 'runtime_schedule_window_stale'
  | 'runtime_activity_unreleased'
  | 'runtime_late_submission_denied';

export class BookRuntimeWindowError extends Error {
  constructor(
    readonly code: BookRuntimeWindowErrorCode,
    readonly currentWindow?: BookScheduleWindowDecision,
  ) {
    super(code);
    this.name = 'BookRuntimeWindowError';
  }
}

const operationFor = (
  kind: BookRuntimeCommandKind | 'state',
): BookScheduleWindowDecision['operation'] => kind;

export const createBookRuntimeScheduleAuthority = (
  value: unknown,
): BookRuntimeScheduleAuthority => {
  const window = requireBookScheduleWindowDecision(value);
  return {
    scheduleSchemaVersion: window.scheduleSchemaVersion,
    resolverVersion: window.scheduleResolverVersion,
    policyRevision: window.policyRevision,
    authorityRevision: window.authorityRevision,
    evaluatedAt: window.evaluatedAt,
    window,
  };
};

export const assertBookRuntimeWindowForTarget = (input: {
  readonly authority: BookRuntimeScheduleAuthority;
  readonly actorUid: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly target: BookRuntimeScheduleTarget;
  readonly operation: BookRuntimeCommandKind | 'state';
}): BookScheduleWindowDecision => {
  let window: BookScheduleWindowDecision;
  try {
    window = requireBookScheduleWindowDecision(input.authority.window);
  } catch {
    throw new BookRuntimeWindowError('runtime_schedule_window_invalid');
  }
  const identity = window.identity;
  if (identity.recipientId !== input.actorUid
    || identity.assignmentId !== input.contextId
    || identity.bindingId !== input.bindingId
    || identity.bindingRevision !== input.bindingRevision
    || identity.placementId !== input.target.placementId
    || identity.activityId !== input.target.activityId
    || identity.activityVersion !== input.target.activityVersion
    || window.operation !== operationFor(input.operation)
    || window.scheduleSchemaVersion !== input.authority.scheduleSchemaVersion
    || window.scheduleResolverVersion !== input.authority.resolverVersion
    || window.policyRevision !== input.authority.policyRevision
    || window.authorityRevision !== input.authority.authorityRevision
    || window.evaluatedAt !== input.authority.evaluatedAt) {
    throw new BookRuntimeWindowError('runtime_schedule_window_stale', window);
  }
  if (window.outcome === 'denied') {
    throw new BookRuntimeWindowError(
      window.code === 'book_activity_late_submission_denied'
        ? 'runtime_late_submission_denied'
        : 'runtime_activity_unreleased',
      window,
    );
  }
  return window;
};

export const sameBookRuntimeScheduleAuthority = (
  left: BookRuntimeScheduleAuthority,
  right: BookRuntimeScheduleAuthority,
): boolean => left.scheduleSchemaVersion === right.scheduleSchemaVersion
  && left.resolverVersion === right.resolverVersion
  && left.policyRevision === right.policyRevision
  && left.authorityRevision === right.authorityRevision
  && left.window.identity.assignmentId === right.window.identity.assignmentId
  && left.window.identity.recipientId === right.window.identity.recipientId
  && left.window.identity.bindingId === right.window.identity.bindingId
  && left.window.identity.bindingRevision === right.window.identity.bindingRevision
  && left.window.identity.placementId === right.window.identity.placementId
  && left.window.identity.activityId === right.window.identity.activityId
  && left.window.identity.activityVersion === right.window.identity.activityVersion
  && left.window.operation === right.window.operation;
