import type {
  BookRuntimeScheduleAuthority,
  BookRuntimeScheduleOperationKind,
  BookRuntimeScheduleTarget,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  createBookRuntimeScheduleAuthority,
  sameBookRuntimeScheduleAuthority,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import {
  resolveBookScheduleWindow,
  type BookScheduleWindowDecision,
} from '../../../../src/services/book-delivery/bookScheduleWindow.service.ts';
import type {
  BookDeliveryBinding,
  BookDeliveryPlacement,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkAuthorityScope,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  assertValidBookHomeworkAuthorityRecord,
} from './authority.ts';
import type {
  BookHomeworkDocumentStore,
} from './repository.ts';
import type {
  BookRuntimeScheduleDecision,
  BookRuntimeSchedulePolicy,
  BookRuntimeSchedulePolicyInput,
} from '../book-runtime/authorization.ts';
import type {
  BookRuntimeRepository,
} from '../book-runtime/repository.ts';
import {
  bookHomeworkAuthorityMatchesContext,
  bookHomeworkRecipientAuthorityId,
  bookHomeworkRecipientDeliveryBindingId,
  readBookHomeworkRecipientAuthority,
} from './identity.ts';

export interface BookHomeworkActivitySchedulePolicy {
  readonly policyId: string;
  readonly policyRevision: number;
  readonly authorityRevision: number;
  readonly placementId: string;
  readonly maxAttempts: number | null;
  readonly lateSubmissionAllowed: boolean;
  /** Exact matching terminal attempts; review and retry authority stay distinct. */
  readonly attemptsUsed: number;
}

export interface BookHomeworkActivitySchedulePolicyResolver {
  resolve(input: {
    readonly assignmentId: string;
    readonly recipientId: string;
    readonly ownerId: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly policyId: string;
    readonly policyRevision: number;
    readonly placementId: string;
  }): Promise<BookHomeworkActivitySchedulePolicy | null>;
}

export interface BookHomeworkScheduleEnforcementOptions {
  readonly authorityStore: Pick<BookHomeworkDocumentStore, 'read'>;
  readonly activityPolicy: BookHomeworkActivitySchedulePolicyResolver;
}

export const createBookHomeworkActivitySchedulePolicyResolver = (options: {
  readonly authorityStore: Pick<BookHomeworkDocumentStore, 'read'>;
  readonly runtimeRepository: Pick<BookRuntimeRepository, 'listAttempts'>;
}): BookHomeworkActivitySchedulePolicyResolver => ({
  async resolve(input) {
    const stored = await readBookHomeworkRecipientAuthority(
      options.authorityStore,
      {
        authorityId: bookHomeworkRecipientAuthorityId(input.assignmentId, input.recipientId),
        assignmentId: input.assignmentId,
        ownerId: input.ownerId,
      } satisfies BookHomeworkAuthorityScope,
      input.recipientId,
    );
    if (!stored) return null;
    try {
      assertValidBookHomeworkAuthorityRecord(stored.value);
    } catch {
      return null;
    }
    const authority = stored.value;
    const snapshot = authority.activityPolicies?.[input.placementId];
    const placement = authority.bookManifest.bindings.find((candidate) =>
      candidate.state === 'required' && candidate.placementId === input.placementId);
    if (!snapshot
      || !placement
      || !bookHomeworkAuthorityMatchesContext(
        authority.assignmentId,
        authority.saga.sagaId,
        input.assignmentId,
        input.recipientId,
      )
      || authority.bookManifest.context.contextId !== input.assignmentId
      || authority.bookManifest.context.recipientId !== input.recipientId
      || (authority.assignmentId !== input.assignmentId
        && input.bindingId !== bookHomeworkRecipientDeliveryBindingId(
          input.assignmentId,
          input.recipientId,
        ))
      || authority.bookManifest.bindingRevision !== input.bindingRevision
      || authority.visibility.status !== 'committed'
      || authority.saga.state !== 'committed'
      || snapshot.policyId !== input.policyId
      || snapshot.policyRevision !== input.policyRevision
      || snapshot.placementId !== placement.placementId
      || snapshot.activityId !== placement.activityId
      || snapshot.activityVersionId !== placement.activityVersionId
      || snapshot.activityVersion !== placement.activityVersion) {
      return null;
    }
    const attempts = await options.runtimeRepository.listAttempts({
      recipientId: input.recipientId,
      contextId: input.assignmentId,
      placementId: input.placementId,
      bindingId: input.bindingId,
      bindingRevision: input.bindingRevision,
      limit: 50,
    });
    const matchingAttemptIds = new Set(attempts.filter((attempt) =>
      attempt.bindingId === input.bindingId
      && attempt.bindingRevision === input.bindingRevision
      && attempt.recipientId === input.recipientId
      && attempt.contextId === input.assignmentId
      && attempt.placementId === placement.placementId
      && attempt.activityId === placement.activityId
      && attempt.activityVersionId === placement.activityVersionId
      && attempt.activityVersion === placement.activityVersion)
      .map((attempt) => attempt.attemptId));
    return {
      policyId: snapshot.policyId,
      policyRevision: snapshot.policyRevision,
      authorityRevision: authority.revision,
      placementId: snapshot.placementId,
      maxAttempts: snapshot.maxAttempts,
      lateSubmissionAllowed: snapshot.lateSubmissionAllowed,
      attemptsUsed: matchingAttemptIds.size,
    };
  },
});

export interface BookHomeworkScheduleEvaluation {
  readonly decision: BookScheduleWindowDecision;
  readonly authority: BookRuntimeScheduleAuthority;
}

const manifestPlacement = (
  authority: BookHomeworkAuthorityRecord,
  bindingPlacement: BookDeliveryPlacement,
): Extract<BookHomeworkAuthorityRecord['bookManifest']['bindings'][number], { state: 'required' }> | null => {
  const candidate = authority.bookManifest.bindings.find((entry) =>
    entry.state === 'required'
    && entry.placementId === bindingPlacement.placementId
    && entry.activityId === bindingPlacement.activityId
    && entry.activityVersion === bindingPlacement.activityVersion
    && entry.activityVersionId === bindingPlacement.activityVersionId
    && entry.nodeKey === bindingPlacement.nodeKey);
  return candidate?.state === 'required' ? candidate : null;
};

const bindingMatchesAuthority = (
  binding: BookDeliveryBinding,
  authority: BookHomeworkAuthorityRecord,
): boolean => bookHomeworkAuthorityMatchesContext(
  authority.assignmentId,
  authority.saga.sagaId,
  binding.context.contextId,
  binding.recipient.recipientId,
)
  && (authority.assignmentId === binding.context.contextId
    || binding.bindingId === bookHomeworkRecipientDeliveryBindingId(
      binding.context.contextId,
      binding.recipient.recipientId,
    ))
  && authority.ownerId === binding.issuer.ownerId
  && authority.ownerId === binding.context.ownerId
  && authority.assignmentKind === 'book_activity_bundle'
  && authority.visibility.status === 'committed'
  && authority.saga.state === 'committed'
  && authority.bookManifest.bindingRevision === binding.revision
  && authority.bookManifest.book.bookId === binding.book.bookId
  && authority.bookManifest.book.bookRevision === binding.book.bookRevision
  && authority.bookManifest.book.publicationId === binding.book.publicationId
  && authority.bookManifest.book.publicationRevision === binding.book.publicationRevision
  && authority.bookManifest.context.contextId === binding.context.contextId
  && authority.bookManifest.context.recipientId === binding.recipient.recipientId
  && binding.context.kind === 'homework'
  && binding.context.entitlementBasis === 'assignment'
  && binding.context.recipientId === binding.recipient.recipientId;

const runtimeOperation = (
  operation: BookRuntimeScheduleOperationKind,
): Extract<BookScheduleWindowDecision['operation'], 'state' | 'autosave' | 'submit'> => {
  if (operation === 'state' || operation === 'autosave' || operation === 'submit') return operation;
  throw new Error('runtime_schedule_operation_invalid');
};

const failureCode = (decision: BookScheduleWindowDecision): string =>
  decision.code === 'book_activity_late_submission_denied'
    ? 'runtime_late_submission_denied'
    : decision.code === 'book_activity_attempt_limit_reached'
      ? 'runtime_attempt_limit_reached'
      : 'runtime_activity_unreleased';

export const createBookHomeworkScheduleEnforcement = (
  options: BookHomeworkScheduleEnforcementOptions,
) => {
  const evaluate = async (input: BookRuntimeSchedulePolicyInput): Promise<BookHomeworkScheduleEvaluation> => {
    if (input.binding.context.kind !== 'homework'
      || input.binding.recipient.recipientId !== input.actorUid
      || input.binding.context.recipientId !== input.actorUid
      || input.binding.context.ownerId !== input.binding.issuer.ownerId) {
      throw new Error('runtime_schedule_context_invalid');
    }
    const stored = await readBookHomeworkRecipientAuthority(
      options.authorityStore,
      {
        authorityId: bookHomeworkRecipientAuthorityId(
          input.binding.context.contextId,
          input.actorUid,
        ),
        assignmentId: input.binding.context.contextId,
        ownerId: input.binding.issuer.ownerId,
      } satisfies BookHomeworkAuthorityScope,
      input.actorUid,
    );
    if (!stored) throw new Error('runtime_schedule_authority_missing');
    assertValidBookHomeworkAuthorityRecord(stored.value);
    const authority = stored.value;
    if (!bindingMatchesAuthority(input.binding, authority)) {
      throw new Error('runtime_schedule_binding_stale');
    }
    const placement = input.binding.placements.find((candidate) =>
      candidate.placementId === input.target.placementId
      && candidate.activityId === input.target.activityId
      && candidate.activityVersion === input.target.activityVersion);
    if (!placement || !manifestPlacement(authority, placement)) {
      throw new Error('runtime_schedule_target_invalid');
    }
    const policy = await options.activityPolicy.resolve({
      assignmentId: authority.bookManifest.context.contextId,
      recipientId: input.actorUid,
      ownerId: input.binding.issuer.ownerId,
      bindingId: input.binding.bindingId,
      bindingRevision: input.binding.revision,
      policyId: input.binding.schedulePolicy.policyId,
      policyRevision: input.binding.schedulePolicy.policyRevision,
      placementId: placement.placementId,
    });
    if (!policy
      || policy.policyId !== input.binding.schedulePolicy.policyId
      || policy.policyRevision !== input.binding.schedulePolicy.policyRevision
      || policy.authorityRevision !== authority.revision
      || policy.placementId !== placement.placementId
      || (policy.maxAttempts !== null
        && (!Number.isSafeInteger(policy.maxAttempts)
          || policy.maxAttempts <= 0
          || policy.maxAttempts > 50))
      || !Number.isSafeInteger(policy.attemptsUsed)
      || policy.attemptsUsed < 0
      || (policy.maxAttempts !== null && policy.attemptsUsed > policy.maxAttempts)) {
      throw new Error('runtime_schedule_policy_unavailable');
    }
    const decision = resolveBookScheduleWindow({
      assignmentId: authority.bookManifest.context.contextId,
      recipientId: input.actorUid,
      bindingId: input.binding.bindingId,
      bindingRevision: input.binding.revision,
      placementId: placement.placementId,
      activityId: placement.activityId,
      activityVersion: placement.activityVersion,
      nodeKey: placement.nodeKey,
      operation: runtimeOperation(input.operation),
      schedule: authority.schedule,
      outline: authority.bookManifest.outline,
      studentExtensions: authority.studentExtensions[input.actorUid] ?? {},
      lateSubmissionAllowed: policy.lateSubmissionAllowed,
      policyRevision: policy.policyRevision,
      authorityRevision: authority.revision,
      evaluatedAt: input.now,
      maxAttempts: policy.maxAttempts,
      attemptsUsed: policy.attemptsUsed,
    });
    return {
      decision,
      authority: createBookRuntimeScheduleAuthority(decision),
    };
  };

  const authorize = async (
    input: BookRuntimeSchedulePolicyInput,
  ): Promise<BookRuntimeScheduleDecision> => {
    if (input.binding.context.kind === 'solo') return { outcome: 'allowed' };
    if (input.binding.context.kind !== 'homework') {
      return { outcome: 'unavailable', code: 'runtime_schedule_context_unavailable' };
    }
    try {
      const current = await evaluate(input);
      return current.decision.outcome === 'allowed'
        ? { outcome: 'allowed', authority: current.authority }
        : {
            outcome: 'denied',
            code: failureCode(current.decision),
            authority: current.authority,
          };
    } catch {
      return { outcome: 'unavailable', code: 'runtime_schedule_authority_unavailable' };
    }
  };

  const revalidate: NonNullable<BookRuntimeSchedulePolicy['revalidate']> = async (input) => {
    try {
      const current = await evaluate(input);
      if (!sameBookRuntimeScheduleAuthority(input.previousAuthority, current.authority)) {
        return {
          outcome: 'conflict',
          code: 'runtime_schedule_authority_stale',
          authority: current.authority,
        };
      }
      return current.decision.outcome === 'allowed'
        ? { outcome: 'allowed', authority: current.authority }
        : {
            outcome: 'denied',
            code: failureCode(current.decision),
            authority: current.authority,
          };
    } catch {
      return { outcome: 'unavailable', code: 'runtime_schedule_authority_unavailable' };
    }
  };

  const policy: BookRuntimeSchedulePolicy = { authorize, revalidate };
  return { evaluate, policy };
};

export const runtimeScheduleTargetForPlacement = (
  placement: BookDeliveryPlacement,
): BookRuntimeScheduleTarget => ({
  placementId: placement.placementId,
  activityId: placement.activityId,
  activityVersion: placement.activityVersion,
  interactionId: '$launch',
});
