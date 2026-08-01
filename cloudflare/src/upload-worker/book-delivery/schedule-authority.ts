import type {
  BookDeliveryBinding,
  BookDeliveryPlacement,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  resolveBookScheduleWindow,
  type BookScheduleWindowDecision,
} from '../../../../src/services/book-delivery/bookScheduleWindow.service.ts';
import type {
  BookHomeworkAuthorityRecord,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  assertValidBookHomeworkAuthorityRecord,
} from '../book-homework/authority.ts';
import type {
  BookHomeworkActivitySchedulePolicy,
} from '../book-homework/schedule-enforcement.ts';

const bindingMatchesAuthority = (
  binding: BookDeliveryBinding,
  authority: BookHomeworkAuthorityRecord,
): boolean => binding.context.kind === 'homework'
  && binding.context.entitlementBasis === 'assignment'
  && authority.assignmentId === binding.context.contextId
  && authority.ownerId === binding.issuer.ownerId
  && authority.visibility.status === 'committed'
  && authority.saga.state === 'committed'
  && authority.bookManifest.bindingRevision === binding.revision
  && authority.bookManifest.book.bookId === binding.book.bookId
  && authority.bookManifest.book.bookRevision === binding.book.bookRevision
  && authority.bookManifest.book.publicationId === binding.book.publicationId
  && authority.bookManifest.book.publicationRevision === binding.book.publicationRevision
  && authority.bookManifest.context.contextId === binding.context.contextId
  && authority.bookManifest.context.recipientId === binding.recipient.recipientId
  && binding.context.recipientId === binding.recipient.recipientId;

const authorityPlacement = (
  authority: BookHomeworkAuthorityRecord,
  placement: BookDeliveryPlacement,
): boolean => authority.bookManifest.bindings.some((candidate) =>
  candidate.state === 'required'
  && candidate.placementId === placement.placementId
  && candidate.activityId === placement.activityId
  && candidate.activityVersionId === placement.activityVersionId
  && candidate.activityVersion === placement.activityVersion
  && candidate.nodeKey === placement.nodeKey);

/**
 * Resolves the server-authoritative document decision. A Placement supplies
 * stable student/activity identity, but document permission intentionally uses
 * assignment start only; nested Activity schedules never narrow PDF access.
 */
export const resolveBookHomeworkDocumentWindow = (input: {
  readonly binding: BookDeliveryBinding;
  readonly authority: BookHomeworkAuthorityRecord;
  readonly placement?: BookDeliveryPlacement;
  readonly evaluatedAt: string;
}): BookScheduleWindowDecision => {
  assertValidBookHomeworkAuthorityRecord(input.authority);
  if (!bindingMatchesAuthority(input.binding, input.authority)) {
    throw new Error('book_document_schedule_binding_stale');
  }
  const placement = input.placement ?? input.binding.placements[0];
  if (!placement || !authorityPlacement(input.authority, placement)) {
    throw new Error('book_document_schedule_target_invalid');
  }
  return resolveBookScheduleWindow({
    assignmentId: input.authority.assignmentId,
    recipientId: input.binding.recipient.recipientId,
    bindingId: input.binding.bindingId,
    bindingRevision: input.binding.revision,
    placementId: placement.placementId,
    activityId: placement.activityId,
    activityVersion: placement.activityVersion,
    nodeKey: placement.nodeKey,
    operation: 'document',
    schedule: input.authority.schedule,
    outline: input.authority.bookManifest.outline,
    studentExtensions: input.authority.studentExtensions[input.binding.recipient.recipientId] ?? {},
    lateSubmissionAllowed: false,
    policyRevision: input.binding.schedulePolicy.policyRevision,
    authorityRevision: input.authority.revision,
    evaluatedAt: input.evaluatedAt,
  });
};

export const resolveBookHomeworkLaunchWindows = (input: {
  readonly binding: BookDeliveryBinding;
  readonly authority: unknown;
  readonly activityPolicies: Readonly<Record<string, BookHomeworkActivitySchedulePolicy>>;
  readonly evaluatedAt: string;
}): Readonly<Record<string, BookScheduleWindowDecision>> => {
  assertValidBookHomeworkAuthorityRecord(input.authority);
  if (!bindingMatchesAuthority(input.binding, input.authority)) {
    throw new Error('book_launch_schedule_binding_stale');
  }
  return Object.fromEntries(input.binding.placements.map((placement) => {
    if (!authorityPlacement(input.authority, placement)) {
      throw new Error('book_launch_schedule_target_invalid');
    }
    const policy = input.activityPolicies[placement.placementId];
    if (!policy
      || policy.policyId !== input.binding.schedulePolicy.policyId
      || policy.policyRevision !== input.binding.schedulePolicy.policyRevision
      || policy.authorityRevision !== input.authority.revision
      || policy.placementId !== placement.placementId
      || (policy.maxAttempts !== null
        && (!Number.isSafeInteger(policy.maxAttempts)
          || policy.maxAttempts <= 0
          || policy.maxAttempts > 50))
      || typeof policy.lateSubmissionAllowed !== 'boolean'
      || typeof policy.completed !== 'boolean') {
      throw new Error('book_launch_schedule_policy_unavailable');
    }
    return [placement.placementId, resolveBookScheduleWindow({
      assignmentId: input.authority.assignmentId,
      recipientId: input.binding.recipient.recipientId,
      bindingId: input.binding.bindingId,
      bindingRevision: input.binding.revision,
      placementId: placement.placementId,
      activityId: placement.activityId,
      activityVersion: placement.activityVersion,
      nodeKey: placement.nodeKey,
      operation: 'launch',
      schedule: input.authority.schedule,
      outline: input.authority.bookManifest.outline,
      studentExtensions: input.authority.studentExtensions[input.binding.recipient.recipientId] ?? {},
      lateSubmissionAllowed: policy.lateSubmissionAllowed,
      completed: policy.completed,
      policyRevision: policy.policyRevision,
      authorityRevision: input.authority.revision,
      evaluatedAt: input.evaluatedAt,
    })];
  }));
};

export const isBookHomeworkDocumentWindowOpen = (input: {
  readonly binding: BookDeliveryBinding;
  readonly authority: BookHomeworkAuthorityRecord;
  readonly evaluatedAt: string;
}): boolean => {
  try {
    return resolveBookHomeworkDocumentWindow(input).permissions.canAccessDocument;
  } catch {
    return false;
  }
};
