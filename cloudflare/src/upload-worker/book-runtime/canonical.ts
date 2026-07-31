import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type {
  BookRuntimeAttemptPolicy,
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
  soloOnlyBookRuntimeSchedulePolicy,
  type BookRuntimeSchedulePolicy,
} from './authorization.ts';

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
}

export interface BookRuntimeCanonicalHandlersOptions {
  readonly createDependencies?: (
    env: BookRuntimeCanonicalEnv,
  ) => BookRuntimeCanonicalDependencies;
  readonly schedulePolicy?: BookRuntimeSchedulePolicy;
}

const productionDependencies = (
  env: BookRuntimeCanonicalEnv,
  schedulePolicy: BookRuntimeSchedulePolicy,
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
  return {
    repository: runtimeRepository,
    resolveBinding: async ({ bindingId, recipientId, contextId }) => {
      const resolved = await deliveryRepository.resolveCurrent(recipientId, contextId);
      if (!resolved || resolved.record.binding.bindingId !== bindingId) return null;
      return resolved.record.binding;
    },
    schedulePolicy,
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
    resolveAttemptPolicy: async ({ binding }) => (
      binding.context.kind === 'solo' ? { maxAttempts: null } : null
    ),
  };
};

const unavailable = () => ({
  body: { code: 'book_runtime_dependencies_unavailable' },
  init: { status: 503 },
});

export const createBookRuntimeCanonicalHandlers = (
  options: BookRuntimeCanonicalHandlersOptions = {},
) => {
  const schedulePolicy = options.schedulePolicy ?? soloOnlyBookRuntimeSchedulePolicy;
  const createDependencies = options.createDependencies
    ?? ((env: BookRuntimeCanonicalEnv) => productionDependencies(env, schedulePolicy));

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
