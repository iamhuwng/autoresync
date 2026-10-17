import type {
  BookRuntimeActivitySubmissionBoundary,
  BookRuntimeCommandKind,
  BookRuntimeScheduleAuthority,
  BookRuntimeScheduleTarget,
} from './activityRuntimeAttempt.types';
import type {
  ActivitySubmission,
  ActivitySubmissionAnswer,
} from '../../types/bookActivity.types';
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

const responseAnswer = (interactionId: string, response: unknown): ActivitySubmissionAnswer => {
  if (response === null) return null;
  if (Array.isArray(response)) {
    const legacy = savedSubmissionAnswer(interactionId, response);
    if (legacy === undefined) throw new TypeError('runtime_activity_response_invalid');
    return legacy;
  }
  if (typeof response !== 'object' || Array.isArray(response)) {
    if (typeof response === 'string') return response;
    throw new TypeError('runtime_activity_response_invalid');
  }
  const value = response as Record<string, unknown>;
  if (value.interactionId !== undefined && value.interactionId !== interactionId) {
    throw new TypeError('runtime_activity_response_invalid');
  }
  if (Object.hasOwn(value, 'selectedOptionId')) {
    return value.selectedOptionId === null ? [] : [value.selectedOptionId as string];
  }
  if (Object.hasOwn(value, 'selectedOptionIds')) {
    return structuredClone(value.selectedOptionIds) as string[];
  }
  if (Object.hasOwn(value, 'text')) return value.text as string;
  if (Object.hasOwn(value, 'pairs')) {
    return structuredClone(value.pairs) as Array<{ leftItemId: string; rightItemId: string }>;
  }
  if (Object.hasOwn(value, 'orderedItemIds')) {
    return structuredClone(value.orderedItemIds) as string[];
  }
  throw new TypeError('runtime_activity_response_invalid');
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isPairArray = (
  value: unknown,
): value is Array<{ leftItemId: string; rightItemId: string }> =>
  Array.isArray(value) && value.every((item) =>
    isPlainRecord(item) &&
    typeof item.leftItemId === 'string' &&
    typeof item.rightItemId === 'string',
  );

const isSubmissionAnswer = (value: unknown): value is ActivitySubmissionAnswer =>
  value === null || typeof value === 'string' || isStringArray(value) || isPairArray(value);

const savedSubmissionAnswer = (
  interactionId: string,
  response: readonly unknown[],
): ActivitySubmissionAnswer | undefined => {
  if (response.length !== 1) return undefined;
  const entry = response[0];
  if (!isPlainRecord(entry) || entry.interactionId !== interactionId || !Object.hasOwn(entry, 'answer')) {
    return undefined;
  }
  if (!isSubmissionAnswer(entry.answer)) return undefined;
  return structuredClone(entry.answer);
};

/**
 * Drafts created by the legacy activity runtime store one submission row per
 * interaction. Keep that stored value untouched, but present the current
 * renderer with the canonical response shape.
 */
export const normalizeSavedActivityResponse = (
  interactionId: string,
  response: unknown,
  responseCodec: string,
): unknown => {
  if (!Array.isArray(response)) return response;
  const answer = savedSubmissionAnswer(interactionId, response);
  if (answer === undefined) return response;
  switch (responseCodec) {
    case 'choice-single-v1':
      return isStringArray(answer) && answer.length <= 1
        ? { interactionId, selectedOptionId: answer[0] ?? null }
        : response;
    case 'choice-multiple-v1':
      return isStringArray(answer)
        ? { interactionId, selectedOptionIds: answer }
        : response;
    case 'text-entry-v1':
    case 'long-response-v1':
      return typeof answer === 'string' ? { interactionId, text: answer } : response;
    case 'matching-pairs-v1':
      return isPairArray(answer) ? { interactionId, pairs: answer } : response;
    case 'ordering-items-v1':
      return isStringArray(answer) ? { interactionId, orderedItemIds: answer } : response;
    default:
      return response;
  }
};

export const activitySubmissionFromRuntimeResponses = (
  requiredInteractionIds: readonly string[],
  responses: Readonly<Record<string, unknown>>,
): ActivitySubmission => {
  if (requiredInteractionIds.length === 0
    || new Set(requiredInteractionIds).size !== requiredInteractionIds.length
    || Object.keys(responses).length !== requiredInteractionIds.length) {
    throw new TypeError('runtime_activity_submission_incomplete');
  }
  return requiredInteractionIds.map((interactionId) => {
    if (!Object.hasOwn(responses, interactionId)) {
      throw new TypeError('runtime_activity_submission_incomplete');
    }
    return {
      interactionId,
      answer: responseAnswer(interactionId, responses[interactionId]),
    };
  });
};

export const createBookRuntimeActivitySubmissionBoundary = (input: {
  readonly requiredInteractionIds: readonly string[];
}): BookRuntimeActivitySubmissionBoundary => {
  const requiredInteractionIds = [...input.requiredInteractionIds];
  if (requiredInteractionIds.length === 0
    || new Set(requiredInteractionIds).size !== requiredInteractionIds.length) {
    throw new TypeError('runtime_activity_submission_boundary_invalid');
  }
  return {
    submissionScope: 'activity',
    requiredInteractionIds,
    submittedInteractionIds: [...requiredInteractionIds],
  };
};
