import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  authorizeRuntimeDraftRead,
  authorizeRuntimeCommand,
  BookRuntimeAuthorizationError,
  soloOnlyBookRuntimeSchedulePolicy,
  type BookRuntimeActor,
  type BookRuntimeDraftReadInput,
  type BookRuntimeSchedulePolicy,
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
import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../../../src/types/bookActivity.types.ts';
import type { BookRuntimeScore } from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';

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
      if (payload.commandKind === 'submit' && options.requireCanonicalDraftForSubmit) {
        const draft = await options.repository?.readDraft({
          recipientId: input.uid,
          contextId: payload.contextId,
          placementId: payload.placementId,
          interactionId: payload.interactionId,
        });
        if (!draft || draft.revision !== payload.clientRevision) {
          throw new BookRuntimeWorkerError('runtime_submit_draft_unavailable', 409);
        }
        if (stable(draft.response) !== stable(payload.response)) {
          throw new BookRuntimeWorkerError('runtime_submit_draft_mismatch', 409);
        }
      }
      const [actor, binding] = await Promise.all([
        readActor({ uid: input.uid, env: input.env }),
        options.resolveBinding({
          bindingId: payload.bindingId,
          recipientId: input.uid,
          contextId: payload.contextId,
          env: input.env,
        }),
      ]);
      const context = await authorizeRuntimeCommand(
        actor,
        payload,
        binding,
        schedulePolicy,
        now(),
      );
      let score: BookRuntimeScore | undefined;
      if (payload.commandKind === 'submit') {
        if (!options.resolveActivity) {
          throw new BookRuntimeWorkerError('runtime_activity_unavailable', 503);
        }
        const activity = await options.resolveActivity({
          binding,
          placementId: payload.placementId,
          activityId: payload.activityId,
          activityVersion: payload.activityVersion,
          interactionId: payload.interactionId,
          env: input.env,
        });
        if (!activity
          || !activity.interactions.some((interaction) =>
            interaction.interactionId === payload.interactionId)) {
          throw new BookRuntimeWorkerError('runtime_activity_unavailable', 409);
        }
        const result = scoreActivity(activity, payload.response as ActivitySubmission);
        if (result.status === 'invalid') {
          throw new BookRuntimeWorkerError('runtime_submission_invalid', 409);
        }
        score = result.status === 'scored'
          ? result
          : { status: 'review_required' };
      }
      const result = await options.repository.applyCommand({
        command: payload,
        context,
        attemptId: allocateAttemptId({
          bindingId: payload.bindingId,
          operationId: payload.operationId,
        }),
        ...(score ? { score } : {}),
      });
      return json(sanitizeResult(result), statusFor(result.status));
    } catch (error) {
      if (error instanceof BookRuntimeCommandSchemaError
        || error instanceof BookRuntimeAuthorizationError
        || error instanceof BookRuntimeWorkerError) {
        return json({ code: error.code }, error.status);
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
      const context = await authorizeRuntimeDraftRead(actor, readInput, binding, now());
      const draft = await options.repository.readDraft({
        recipientId: context.actorUid,
        contextId: input.contextId,
        placementId: input.placementId,
        interactionId: input.interactionId,
      });
      return json({ draft });
    } catch (error) {
      if (error instanceof BookRuntimeAuthorizationError || error instanceof BookRuntimeWorkerError) {
        return json({ code: error.code }, error.status);
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
