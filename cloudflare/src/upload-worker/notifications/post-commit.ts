import {
  isBookNotificationEmissionEnabled,
  type BookNotificationActionIdentity,
  type BookNotificationEmissionContext,
  type BookNotificationEmissionEnvironment,
} from './book-emitter.ts';

export interface BookMutationResponse {
  readonly body: unknown;
  readonly init?: { readonly status?: number };
}

export interface BookPostCommitEmissionEnvironment
  extends BookNotificationEmissionEnvironment {
  readonly [key: string]: unknown;
}

export interface BookPostCommitEmissionOptions {
  readonly env: BookPostCommitEmissionEnvironment;
  readonly commit: () => Promise<BookMutationResponse>;
  readonly emitter?: {
    emit(
      identity: BookNotificationActionIdentity,
      context: BookNotificationEmissionContext,
    ): Promise<unknown>;
  };
  readonly resolveActionIdentity?: (input: {
    readonly result: BookMutationResponse;
    readonly env: BookPostCommitEmissionEnvironment;
  }) => BookNotificationActionIdentity | null
    | Promise<BookNotificationActionIdentity | null>;
}

const isCommittedResult = (result: BookMutationResponse): boolean => {
  if (!result.body || typeof result.body !== 'object'
    || Array.isArray(result.body)) {
    return false;
  }
  return (result.body as Record<string, unknown>).state === 'committed';
};

/**
 * Shared post-commit seam for the existing Book Worker. It deliberately owns
 * no route, queue, persistence, or recipient authority.
 */
export const runBookMutationWithPostCommitNotification = async (
  options: BookPostCommitEmissionOptions,
): Promise<BookMutationResponse> => {
  const emissionEnabled = isBookNotificationEmissionEnabled(
    undefined,
    options.env,
  );
  if (emissionEnabled
    && (!options.emitter || !options.resolveActionIdentity)) {
    throw new Error('book_notification_emission_misconfigured');
  }

  const result = await options.commit();
  const status = Number(result.init?.status ?? 200);
  if (!emissionEnabled
    || !options.emitter
    || !options.resolveActionIdentity
    || status < 200
    || status >= 300
    || !isCommittedResult(result)) {
    return result;
  }

  const identity = await options.resolveActionIdentity({
    result,
    env: options.env,
  });
  if (identity) {
    await options.emitter.emit(identity, { env: options.env });
  }
  return result;
};
