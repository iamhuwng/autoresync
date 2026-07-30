import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
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
  return {
    repository: runtimeRepository,
    resolveBinding: async ({ bindingId, recipientId, contextId }) => {
      const resolved = await deliveryRepository.resolveCurrent(recipientId, contextId);
      if (!resolved || resolved.record.binding.bindingId !== bindingId) return null;
      return resolved.record.binding;
    },
    schedulePolicy,
    resolveActivity: undefined,
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
