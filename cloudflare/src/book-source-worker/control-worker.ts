import {
  createBookSourceControlHost,
  type BookSourceControlHostOptions,
  type BookSourceUploadControlService,
} from './control-host';
import { enforceBookPilotScopeIfConfigured } from '../book-pilot-scope.ts';

export interface BookSourceControlWorkerEnvironment {
  readonly BOOK_SOURCE_UPLOAD_CONTROL_STATE?: unknown;
  readonly BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN?: string;
  readonly FIREBASE_PROJECT_ID?: string;
}

export interface BookSourceControlWorkerOptions {
  /**
   * Ticket 09D/#59 owns live top-level composition. Until it supplies this
   * trusted factory, the standalone Worker remains unavailable.
   */
  readonly serviceFactory?: (
    env: BookSourceControlWorkerEnvironment,
  ) => BookSourceUploadControlService;
  readonly verifier?: BookSourceControlHostOptions['verifier'];
}

const unavailable = (): Response => Response.json(
  { code: 'book_source_upload_unavailable' },
  {
    status: 503,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  },
);

export const createBookSourceControlWorker = (
  options: BookSourceControlWorkerOptions = {},
) => ({
  async fetch(request: Request, env: BookSourceControlWorkerEnvironment): Promise<Response> {
    if (env.BOOK_SOURCE_UPLOAD_CONTROL_STATE !== 'enabled' || !options.serviceFactory) {
      return unavailable();
    }
    try {
      return await createBookSourceControlHost({
        service: options.serviceFactory(env),
        verifier: options.verifier,
        pilotScope: ({ actorId, bookId, operation, request }) => enforceBookPilotScopeIfConfigured({
          env,
          uid: actorId,
          request,
          operation,
          actorKind: 'teacher',
          bookId,
          requireBook: true,
        }),
      }).fetch(request, env);
    } catch {
      return unavailable();
    }
  },
});

export default createBookSourceControlWorker();
