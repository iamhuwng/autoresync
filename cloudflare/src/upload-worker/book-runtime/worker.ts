import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryBinding,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  authorizeRuntimeDraftRead,
  authorizeRuntimeCommand,
  BookRuntimeAuthorizationError,
  revalidateRuntimeScheduleAuthorization,
  soloOnlyBookRuntimeSchedulePolicy,
  type BookRuntimeActor,
  type BookRuntimeDraftReadInput,
  type BookRuntimeSchedulePolicy,
  type BookRuntimeSchedulePolicyInput,
} from './authorization.ts';
import {
  readBookRuntimeCommandPayload,
  BookRuntimeCommandSchemaError,
} from './command-schema.ts';
import {
  BookRuntimeRepositoryError,
  type BookRuntimeRepository,
} from './repository.ts';
import { scoreActivity } from '../../../../src/services/book-activity/activityScoring.service.ts';
import {
  createBookRuntimeActivitySubmissionBoundary,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../../../src/types/bookActivity.types.ts';
import type {
  BookRuntimeAttemptPolicy,
  BookRuntimeCommandResult,
  BookRuntimeScore,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import { isBookRuntimeRecoveryHold } from '../../../../src/services/book-activity/bookRuntime.recovery.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';

export interface BookRuntimeWorkerEnv {
  readonly [key: string]: unknown;
}

export class BookRuntimeWorkerError extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super(code);
    this.name = 'BookRuntimeWorkerError';
  }
}

export interface BookRuntimeWorkerHandlersOptions {
  readonly repository?: BookRuntimeRepository;
  readonly resolveBinding?: (input: {
    readonly bindingId: string;
    readonly recipientId: string;
    readonly contextId: string;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<BookDeliveryBinding | null>;
  readonly readActor?: (input: {
    readonly uid: string;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<BookRuntimeActor>;
  readonly schedulePolicy?: BookRuntimeSchedulePolicy;
  readonly allocateAttemptId?: (input: {
    readonly bindingId: string;
    readonly operationId: string;
  }) => string;
  readonly now?: () => string;
  readonly requireCanonicalDraftForSubmit?: boolean;
  readonly resolveActivity?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly placementId: string;
    readonly activityId: string;
    readonly activityVersion: number;
    readonly interactionId: string;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<NormalizedActivity | null>;
  readonly resolveAttemptPolicy?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly placementId: string;
    readonly activityId: string;
    readonly activityVersion: number;
    readonly interactionId: string;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<BookRuntimeAttemptPolicy | null>;
  readonly projectHomeworkCompletion?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly result: BookRuntimeCommandResult;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<void>;
  /**
   * Additive #92 seam.  This callback consumes an already accepted terminal
   * result; failures are isolated so integrity cannot affect submission,
   * grading, feedback release, completion, or attempt accounting.
   */
  readonly linkIntegrityReport?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly result: BookRuntimeCommandResult;
    readonly env: BookRuntimeWorkerEnv;
  }) => Promise<void>;
}

const json = (
  body: Record<string, unknown>,
  status = 200,
): { body: Record<string, unknown>; init: ResponseInit } => ({
  body,
  init: { status },
});

const sanitizeResult = (result: Awaited<ReturnType<BookRuntimeRepository['applyCommand']>>) => ({
  status: result.status,
  receipt: {
    operationId: result.receipt.operationId,
    status: result.receipt.status,
    bindingId: result.receipt.bindingId,
    draftRevision: result.receipt.draftRevision,
    attemptId: result.receipt.attemptId,
    ...(result.receipt.attemptNumber === undefined
      ? {}
      : { attemptNumber: result.receipt.attemptNumber }),
    createdAt: result.receipt.createdAt,
  },
  ...(result.result === undefined ? {} : {
    resultStatus: result.result.status,
    completionStatus: result.completion?.status,
  }),
});

const statusFor = (status: string): number => {
  if (status === 'accepted' || status === 'replayed') return 200;
  if (status === 'conflict') return 409;
  return 403;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const draftMatchesContext = (
  draft: Awaited<ReturnType<BookRuntimeRepository['readDraft']>>,
  context: Awaited<ReturnType<typeof authorizeRuntimeDraftRead>>,
): boolean => Boolean(draft
  && draft.schemaVersion === 1
  && draft.bindingId === context.binding.bindingId
  && draft.bindingRevision === context.binding.revision
  && draft.recipientId === context.actorUid
  && draft.contextId === context.binding.context.contextId
  && draft.placementId === context.placementId
  && draft.activityId === context.activityId
  && draft.activityVersion === context.activityVersion
  && draft.interactionId === context.interactionId);

const assertNoRuntimeRecoveryHold = async (input: {
  readonly repository: BookRuntimeRepository;
  readonly recipientId: string;
  readonly contextId: string;
}): Promise<void> => {
  const hold = await input.repository.readRecoveryHold?.({
    recipientId: input.recipientId,
    contextId: input.contextId,
  });
  if (hold !== null && hold !== undefined) {
    if (!isBookRuntimeRecoveryHold(hold)
      || hold.recipientId !== input.recipientId
      || hold.contextId !== input.contextId) {
      throw new BookRuntimeWorkerError('book_runtime_recovery_hold_invalid', 503);
    }
    throw new BookRuntimeWorkerError('book_runtime_recovery_hold', 409);
  }
};

export const createBookRuntimeWorkerHandlers = (
  options: BookRuntimeWorkerHandlersOptions = {},
) => {
  const now = options.now ?? (() => new Date().toISOString());
  const schedulePolicy = options.schedulePolicy ?? soloOnlyBookRuntimeSchedulePolicy;
  const allocateAttemptId = options.allocateAttemptId
    ?? ((input: { readonly bindingId: string; readonly operationId: string }) =>
      `${input.bindingId}:attempt:${input.operationId}`);
  const readActor = options.readActor ?? (async (input: {
    readonly uid: string;
    readonly env: BookRuntimeWorkerEnv;
  }) => {
    const reader = input.env.readDatabaseValue;
    if (typeof reader !== 'function') return { uid: input.uid };
    const user = await (reader as (path: string) => Promise<unknown>)(`users/${input.uid}`);
    const disabled = Boolean(user && typeof user === 'object'
      && (user as Record<string, unknown>).disabled === true);
    return { uid: input.uid, disabled };
  });
  const projectHomeworkCompletion = async (
    binding: BookDeliveryBinding,
    result: BookRuntimeCommandResult,
    env: BookRuntimeWorkerEnv,
  ): Promise<void> => {
    if (binding.context.kind !== 'homework'
      || !options.projectHomeworkCompletion
      || !result.attempt
      || !result.result
      || !result.completion
      || !result.index) return;
    try {
      await options.projectHomeworkCompletion({ binding, result, env });
    } catch {
      throw new BookRuntimeWorkerError(
        'book_homework_completion_projection_unavailable',
        503,
      );
    }
  };

  const linkIntegrityReport = (
    binding: BookDeliveryBinding,
    result: BookRuntimeCommandResult,
    env: BookRuntimeWorkerEnv,
  ): void => {
    if (binding.context.kind !== 'homework'
      || !options.linkIntegrityReport
      || !result.attempt
      || !result.result
      || !result.completion
      || !result.index) return;
    // Deliberately detach this observational write. Submission latency and
    // availability must not depend on report storage or teacher indexing.
    void options.linkIntegrityReport({ binding, result, env }).catch(() => {
      // Integrity is observational and non-punitive. A linkage outage must
      // never turn an accepted or replayed submission into a failed command.
    });
  };

  const command = async (input: {
    readonly request: Request;
    readonly env: BookRuntimeWorkerEnv;
    readonly uid: string;
  }) => {
    try {
      if (!options.repository || !options.resolveBinding) {
        throw new BookRuntimeWorkerError('book_runtime_repository_unavailable', 503);
      }
      const payload = await readBookRuntimeCommandPayload(input.request);
      const [actor, binding] = await Promise.all([
        readActor({ uid: input.uid, env: input.env }),
        options.resolveBinding({
          bindingId: payload.bindingId,
          recipientId: input.uid,
          contextId: payload.contextId,
          env: input.env,
        }),
      ]);
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: 'mutation',
        actorKind: 'student',
        bookId: binding?.book.bookId,
        assignmentId: payload.contextId,
        contextKind: binding?.context.kind,
        studentId: input.uid,
        selectedStudentIds: [input.uid],
        requireBook: true,
        requireAssignment: true,
        requireStudents: true,
      });
      await assertNoRuntimeRecoveryHold({
        repository: options.repository,
        recipientId: input.uid,
        contextId: payload.contextId,
      });
      if (payload.commandKind === 'submit'
        && options.repository.replayCommand
        && actor.uid
        && !actor.disabled
        && binding?.schemaVersion === BOOK_DELIVERY_SCHEMA_VERSION
        && binding.status === 'active'
        && binding.context.kind === 'homework'
        && binding.bindingId === payload.bindingId
        && binding.revision === payload.bindingRevision
        && binding.context.contextId === payload.contextId
        && binding.context.recipientId === actor.uid
        && binding.recipient.recipientKind === 'student'
        && binding.recipient.recipientId === actor.uid
        && binding.placements.some((placement) =>
          placement.placementId === payload.placementId
          && placement.activityId === payload.activityId
          && placement.activityVersion === payload.activityVersion)
        && (binding.scope.kind !== 'placements'
          || binding.scope.placementIds.includes(payload.placementId))) {
        const replayed = await options.repository.replayCommand({
          command: payload,
          actorUid: actor.uid,
        });
        if (replayed) {
          if (options.projectHomeworkCompletion
            && replayed.status === 'replayed'
            && replayed.attempt
            && replayed.result
            && replayed.completion
            && replayed.index) {
            await projectHomeworkCompletion(binding, replayed, input.env);
          }
          if (replayed.status === 'replayed') {
            await linkIntegrityReport(binding, replayed, input.env);
          }
          return json(sanitizeResult(replayed), statusFor(replayed.status));
        }
      }
      let resolvedActivity: NormalizedActivity | null = null;
      const resolveTarget = options.resolveActivity
        ? async (targetInput: Pick<BookRuntimeSchedulePolicyInput, 'actorUid' | 'binding' | 'target'>) => {
          resolvedActivity = await options.resolveActivity?.({
            binding: targetInput.binding,
            placementId: targetInput.target.placementId,
            activityId: targetInput.target.activityId,
            activityVersion: targetInput.target.activityVersion,
            interactionId: targetInput.target.interactionId,
            env: input.env,
          }) ?? null;
          return resolvedActivity !== null
            && resolvedActivity.interactions.some((interaction) =>
              interaction.interactionId === targetInput.target.interactionId);
        }
        : undefined;
      const context = await authorizeRuntimeCommand(
        actor,
        payload,
        binding,
        schedulePolicy,
        now(),
        resolveTarget,
      );
      if (payload.commandKind === 'submit'
        && resolvedActivity?.interactions[0]?.interactionId !== payload.interactionId) {
        throw new BookRuntimeWorkerError('runtime_submission_anchor_invalid', 409);
      }
      if (payload.commandKind === 'submit' && options.requireCanonicalDraftForSubmit) {
        const draft = await options.repository.readDraft({
          recipientId: context.actorUid,
          contextId: payload.contextId,
          placementId: payload.placementId,
          interactionId: payload.interactionId,
        });
        if (!draftMatchesContext(draft, context)
          || draft?.revision !== payload.clientRevision) {
          throw new BookRuntimeWorkerError('runtime_submit_draft_unavailable', 409);
        }
        if (stable(draft.response) !== stable(payload.response)) {
          throw new BookRuntimeWorkerError('runtime_submit_draft_mismatch', 409);
        }
      }
      let score: BookRuntimeScore | undefined;
      let attemptPolicy: BookRuntimeAttemptPolicy | undefined;
      let activitySubmissionBoundary;
      if (payload.commandKind === 'submit') {
        if (!options.resolveAttemptPolicy) {
          throw new BookRuntimeWorkerError('runtime_attempt_policy_unavailable', 503);
        }
        const resolvedAttemptPolicy = await options.resolveAttemptPolicy({
          binding,
          placementId: payload.placementId,
          activityId: payload.activityId,
          activityVersion: payload.activityVersion,
          interactionId: payload.interactionId,
          env: input.env,
        });
        if (!resolvedAttemptPolicy) {
          throw new BookRuntimeWorkerError('runtime_attempt_policy_unavailable', 503);
        }
        attemptPolicy = resolvedAttemptPolicy;
        if (!resolvedActivity) {
          throw new BookRuntimeWorkerError('runtime_activity_unavailable', 503);
        }
        const requiredInteractionIds = resolvedActivity.interactions
          .map((interaction) => interaction.interactionId);
        let canonicalSubmission: ActivitySubmission;
        try {
          canonicalSubmission = structuredClone(payload.response as ActivitySubmission);
          activitySubmissionBoundary = createBookRuntimeActivitySubmissionBoundary({
            requiredInteractionIds,
          });
        } catch {
          throw new BookRuntimeWorkerError('runtime_submission_invalid', 409);
        }
        if (stable(canonicalSubmission) !== stable(payload.response)) {
          throw new BookRuntimeWorkerError('runtime_submit_draft_mismatch', 409);
        }
        const result = scoreActivity(resolvedActivity, canonicalSubmission);
        if (result.status === 'invalid') {
          throw new BookRuntimeWorkerError('runtime_submission_invalid', 409);
        }
        score = result.status === 'scored'
          ? result
          : { status: 'review_required' };
      }
      const revalidatedContext = await revalidateRuntimeScheduleAuthorization(
        context,
        schedulePolicy,
        now(),
      );
      const result = await options.repository.applyCommand({
        command: payload,
        context: revalidatedContext,
        attemptId: allocateAttemptId({
          bindingId: payload.bindingId,
          operationId: payload.operationId,
        }),
        ...(attemptPolicy ? { attemptPolicy } : {}),
        ...(score ? { score } : {}),
        ...(activitySubmissionBoundary ? { activitySubmissionBoundary } : {}),
      });
      if (options.projectHomeworkCompletion
        && payload.commandKind === 'submit'
        && (result.status === 'accepted' || result.status === 'replayed')
        && result.attempt
        && result.result
        && result.completion
        && result.index) {
        await projectHomeworkCompletion(binding, result, input.env);
      }
      if (payload.commandKind === 'submit'
        && (result.status === 'accepted' || result.status === 'replayed')) {
        await linkIntegrityReport(binding, result, input.env);
      }
      return json(sanitizeResult(result), statusFor(result.status));
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return json({ code: error.message, decision: error.decision }, error.status);
      }
      if (error instanceof BookRuntimeCommandSchemaError
        || error instanceof BookRuntimeAuthorizationError
        || error instanceof BookRuntimeWorkerError) {
        return json({
          code: error.code,
          ...(error instanceof BookRuntimeAuthorizationError
            && error.currentScheduleAuthority
            ? { currentScheduleAuthority: error.currentScheduleAuthority }
            : {}),
        }, error.status);
      }
      if (error instanceof BookRuntimeRepositoryError) {
        return json({ code: error.code }, 409);
      }
      return json({ code: 'book_runtime_command_failed' }, 500);
    }
  };

  const readDraft = async (input: {
    readonly request: Request;
    readonly env: BookRuntimeWorkerEnv;
    readonly uid: string;
    readonly bindingId: string;
    readonly bindingRevision: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly activityId: string;
    readonly activityVersion: string;
    readonly interactionId: string;
  }) => {
    try {
      if (!options.repository || !options.resolveBinding) {
        throw new BookRuntimeWorkerError('book_runtime_repository_unavailable', 503);
      }
      const bindingRevision = Number(input.bindingRevision);
      const activityVersion = Number(input.activityVersion);
      const readInput: BookRuntimeDraftReadInput = {
        bindingId: input.bindingId,
        bindingRevision,
        contextId: input.contextId,
        placementId: input.placementId,
        activityId: input.activityId,
        activityVersion,
        interactionId: input.interactionId,
      };
      if (!Number.isSafeInteger(bindingRevision) || bindingRevision <= 0
        || !Number.isSafeInteger(activityVersion) || activityVersion <= 0) {
        throw new BookRuntimeWorkerError('runtime_draft_address_invalid', 400);
      }
      const [actor, binding] = await Promise.all([
        readActor({ uid: input.uid, env: input.env }),
        options.resolveBinding({
          bindingId: input.bindingId,
          recipientId: input.uid,
          contextId: input.contextId,
          env: input.env,
        }),
      ]);
      await assertNoRuntimeRecoveryHold({
        repository: options.repository,
        recipientId: input.uid,
        contextId: input.contextId,
      });
      const context = await authorizeRuntimeDraftRead(
        actor,
        readInput,
        binding,
        schedulePolicy,
        now(),
        options.resolveActivity
          ? async (targetInput) => {
            const activity = await options.resolveActivity?.({
              binding: targetInput.binding,
              placementId: targetInput.target.placementId,
              activityId: targetInput.target.activityId,
              activityVersion: targetInput.target.activityVersion,
              interactionId: targetInput.target.interactionId,
              env: input.env,
            });
            return activity !== null && activity !== undefined
              && activity.interactions.some((interaction) =>
                interaction.interactionId === targetInput.target.interactionId);
          }
          : undefined,
      );
      const draft = await options.repository.readDraft({
        recipientId: context.actorUid,
        contextId: input.contextId,
        placementId: input.placementId,
        interactionId: input.interactionId,
      });
      if (draft && !draftMatchesContext(draft, context)) {
        throw new BookRuntimeWorkerError('runtime_draft_identity_stale', 409);
      }
      return json({ draft });
    } catch (error) {
      if (error instanceof BookRuntimeAuthorizationError || error instanceof BookRuntimeWorkerError) {
        return json({
          code: error.code,
          ...(error instanceof BookRuntimeAuthorizationError
            && error.currentScheduleAuthority
            ? { currentScheduleAuthority: error.currentScheduleAuthority }
            : {}),
        }, error.status);
      }
      if (error instanceof BookRuntimeRepositoryError) {
        return json({ code: error.code }, 409);
      }
      return json({ code: 'book_runtime_draft_read_failed' }, 500);
    }
  };

  return { command, readDraft };
};

export default createBookRuntimeWorkerHandlers;
