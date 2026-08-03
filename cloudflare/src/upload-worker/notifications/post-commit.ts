import type {
  BookCommittedNotificationAction,
  BookNotificationEmissionContext,
} from './book-emitter.ts';

export interface BookMutationResponse {
  readonly body: unknown;
  readonly init?: { readonly status?: number };
}

export interface BookPostCommitEmissionEnvironment {
  readonly BOOK_NOTIFICATIONS_EMISSION_ENABLED?: unknown;
  readonly [key: string]: unknown;
}

export interface BookPostCommitEmissionOptions {
  readonly route: string;
  readonly actorUid: string;
  readonly request: Request;
  readonly env: BookPostCommitEmissionEnvironment;
  readonly commit: () => Promise<BookMutationResponse>;
  readonly emitter?: {
    emit(
      action: BookCommittedNotificationAction,
      context: BookNotificationEmissionContext,
    ): Promise<unknown>;
  };
  readonly resolveAction?: (input: {
    readonly route: string;
    readonly result: unknown;
    readonly request: Request;
    readonly env: BookPostCommitEmissionEnvironment;
    readonly uid: string;
  }) => Promise<BookCommittedNotificationAction | null>;
}

/**
 * Shared post-commit seam for the existing Book Worker. Route composition owns
 * calling this helper; it deliberately owns no route, queue, or persistence.
 */
export const runBookMutationWithPostCommitNotification = async (
  options: BookPostCommitEmissionOptions,
): Promise<BookMutationResponse> => {
  const emissionEnabled = options.env.BOOK_NOTIFICATIONS_EMISSION_ENABLED === true
    || options.env.BOOK_NOTIFICATIONS_EMISSION_ENABLED === 'true';
  if (emissionEnabled && (!options.emitter || !options.resolveAction)) {
    throw new Error('book_notification_emission_misconfigured');
  }
  const resolverRequest = emissionEnabled && options.emitter && options.resolveAction
    ? options.request.clone()
    : null;
  const result = await options.commit();
  const status = Number(result.init?.status ?? 200);
  if (emissionEnabled && options.emitter && options.resolveAction && status >= 200 && status < 300) {
    const action = await options.resolveAction({
      route: options.route,
      result: result.body,
      request: resolverRequest ?? options.request,
      env: options.env,
      uid: options.actorUid,
    });
    if (action) await options.emitter.emit(action, { env: options.env });
  }
  return result;
};
