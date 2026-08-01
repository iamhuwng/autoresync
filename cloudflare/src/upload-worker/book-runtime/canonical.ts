import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type {
  BookRuntimeAttemptPolicy,
  BookRuntimeCommandResult,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  assertCanonicalPublishedActivityVersion,
} from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import {
  CANONICAL_ACTIVITY_VERSION_ROOT,
} from '../book-assembly/canonical-activity-version-repository.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestBookRuntimeRepository,
  type BookRuntimeRepository,
  type BookRuntimeRepositoryEnv,
} from './repository.ts';
import {
  createBookRuntimeWorkerHandlers,
  type BookRuntimeWorkerEnv,
} from './worker.ts';
import {
  type BookRuntimeSchedulePolicy,
} from './authorization.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
} from '../book-homework/repository.ts';
import {
  createBookHomeworkActivitySchedulePolicyResolver,
  createBookHomeworkScheduleEnforcement,
  type BookHomeworkActivitySchedulePolicyResolver,
} from '../book-homework/schedule-enforcement.ts';
import {
  FirebaseRestBookHomeworkCompletionRepository,
  BookHomeworkCompletionRepositoryError,
} from '../book-homework/completion-repository.ts';
import {
  readBookHomeworkRecipientAuthority,
} from '../book-homework/identity.ts';

export type BookRuntimeCanonicalEnv =
  & BookRuntimeWorkerEnv
  & BookRuntimeRepositoryEnv
  & BookDeliveryRepositoryEnv;

export interface BookRuntimeCanonicalDependencies {
  readonly repository: BookRuntimeRepository;
  readonly resolveBinding: (input: {
    readonly bindingId: string;
    readonly recipientId: string;
    readonly contextId: string;
    readonly env: BookRuntimeCanonicalEnv;
  }) => Promise<BookDeliveryBinding | null>;
  readonly schedulePolicy: BookRuntimeSchedulePolicy;
  readonly resolveActivity?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly placementId: string;
    readonly activityId: string;
    readonly activityVersion: number;
    readonly interactionId: string;
    readonly env: BookRuntimeCanonicalEnv;
  }) => Promise<NormalizedActivity | null>;
  readonly resolveAttemptPolicy?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly placementId: string;
    readonly activityId: string;
    readonly activityVersion: number;
    readonly interactionId: string;
    readonly env: BookRuntimeCanonicalEnv;
  }) => Promise<BookRuntimeAttemptPolicy | null>;
  readonly projectHomeworkCompletion?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly result: BookRuntimeCommandResult;
    readonly env: BookRuntimeCanonicalEnv;
  }) => Promise<void>;
}

export interface BookRuntimeCanonicalHandlersOptions {
  readonly createDependencies?: (
    env: BookRuntimeCanonicalEnv,
  ) => BookRuntimeCanonicalDependencies;
  readonly schedulePolicy?: BookRuntimeSchedulePolicy;
  readonly activitySchedulePolicy?: BookHomeworkActivitySchedulePolicyResolver;
}

export const createBookRuntimeProductionDependencies = (
  env: BookRuntimeCanonicalEnv,
  schedulePolicy: BookRuntimeSchedulePolicy | undefined,
  activitySchedulePolicy: BookHomeworkActivitySchedulePolicyResolver | undefined,
): BookRuntimeCanonicalDependencies => {
  const runtimeRepository = new FirebaseRestBookRuntimeRepository({ env });
  const deliveryRepository = new FirebaseRestBookDeliveryRepository({ env });
  const activityReader = new FirebaseRtdbRestClient({
    env: {
      ...env,
      GOOGLE_SA_KEY: env.BOOK_RUNTIME_GOOGLE_SA_KEY,
    },
    fetchImpl: globalThis.fetch,
  });
  const authorityStore = {
    read: (assignmentId: string) =>
      new FirebaseRestBookHomeworkDocumentStore({ env }).read(assignmentId),
  };
  const effectiveActivitySchedulePolicy = activitySchedulePolicy
    ?? createBookHomeworkActivitySchedulePolicyResolver({
      authorityStore,
      runtimeRepository,
    });
  const effectiveSchedulePolicy = schedulePolicy ?? (
    createBookHomeworkScheduleEnforcement({
      authorityStore,
      activityPolicy: effectiveActivitySchedulePolicy,
    }).policy
  );
  return {
    repository: runtimeRepository,
    resolveBinding: async ({ bindingId, recipientId, contextId }) => {
      const resolved = await deliveryRepository.resolveCurrent(recipientId, contextId);
      if (!resolved || resolved.record.binding.bindingId !== bindingId) return null;
      return resolved.record.binding;
    },
    schedulePolicy: effectiveSchedulePolicy,
    resolveActivity: async ({
      binding,
      placementId,
      activityId,
      activityVersion,
    }) => {
      const placement = binding.placements.find((candidate) => (
        candidate.placementId === placementId
        && candidate.activityId === activityId
        && candidate.activityVersion === activityVersion
      ));
      if (!placement) return null;
      const value = await activityReader.readValue(
        `${CANONICAL_ACTIVITY_VERSION_ROOT}/${activityId}/${placement.activityVersionId}`,
      );
      try {
        const record = assertCanonicalPublishedActivityVersion(value);
        if (record.activityId !== activityId
          || record.activityVersionId !== placement.activityVersionId
          || record.activityVersion !== activityVersion
          || record.ownerId !== binding.issuer.ownerId
          || !record.placementIds.includes(placementId)) return null;
        return record.activity;
      } catch {
        return null;
      }
    },
    resolveAttemptPolicy: async ({ binding, placementId }) => {
      if (binding.context.kind === 'solo') return { maxAttempts: null };
      if (binding.context.kind !== 'homework') return null;
      const policy = await effectiveActivitySchedulePolicy.resolve({
        assignmentId: binding.context.contextId,
        recipientId: binding.recipient.recipientId,
        bindingId: binding.bindingId,
        bindingRevision: binding.revision,
        policyId: binding.schedulePolicy.policyId,
        policyRevision: binding.schedulePolicy.policyRevision,
        placementId,
      });
      return policy ? { maxAttempts: policy.maxAttempts } : null;
    },
    projectHomeworkCompletion: async ({ binding, result }) => {
      if (binding.context.kind !== 'homework'
        || env.BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED !== 'enabled') return;
      const completionRepository = new FirebaseRestBookHomeworkCompletionRepository({ env });
      if (!result.attempt || !result.result || !result.completion || !result.index) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_missing');
      }
      const stored = await readBookHomeworkRecipientAuthority(
        authorityStore,
        binding.context.contextId,
        binding.context.recipientId,
      );
      if (!stored || stored.value.visibility.status !== 'committed') {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_authority_unavailable');
      }
      await completionRepository.project({
        authority: stored.value,
        binding,
        terminal: {
          attempt: result.attempt,
          result: result.result,
          completion: result.completion,
          index: result.index,
        },
      });
    },
  };
};

const unavailable = () => ({
  body: { code: 'book_runtime_dependencies_unavailable' },
  init: { status: 503 },
});

export const createBookRuntimeCanonicalHandlers = (
  options: BookRuntimeCanonicalHandlersOptions = {},
) => {
  const schedulePolicy = options.schedulePolicy;
  const createDependencies = options.createDependencies
    ?? ((env: BookRuntimeCanonicalEnv) => createBookRuntimeProductionDependencies(
      env,
      schedulePolicy,
      options.activitySchedulePolicy,
    ));

  const withDependencies = async <T>(
    env: BookRuntimeCanonicalEnv,
    run: (dependencies: BookRuntimeCanonicalDependencies) => Promise<T>,
  ): Promise<T | ReturnType<typeof unavailable>> => {
    try {
      return await run(createDependencies(env));
    } catch {
      return unavailable();
    }
  };

  return {
    command: (input: {
      readonly request: Request;
      readonly env: BookRuntimeCanonicalEnv;
      readonly uid: string;
    }) => withDependencies(input.env, async (dependencies) =>
      createBookRuntimeWorkerHandlers({
        ...dependencies,
        ...(dependencies.resolveActivity ? { resolveActivity: dependencies.resolveActivity } : {}),
        ...(dependencies.resolveAttemptPolicy
          ? { resolveAttemptPolicy: dependencies.resolveAttemptPolicy }
          : {}),
        requireCanonicalDraftForSubmit: true,
      }).command(input)),
    readDraft: (input: {
      readonly request: Request;
      readonly env: BookRuntimeCanonicalEnv;
      readonly uid: string;
      readonly bindingId: string;
      readonly bindingRevision: string;
      readonly contextId: string;
      readonly placementId: string;
      readonly activityId: string;
      readonly activityVersion: string;
      readonly interactionId: string;
    }) => withDependencies(input.env, async (dependencies) =>
      createBookRuntimeWorkerHandlers(dependencies).readDraft(input)),
  };
};

export default createBookRuntimeCanonicalHandlers;
