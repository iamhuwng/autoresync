import {
  LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME,
  LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH,
  LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH,
} from '../../../../functions/src/listening-authoring/constants.ts';
import {
  mutateListeningAuthoringLifecycleCore,
  publishListeningDraftCore,
  saveListeningDraftCore,
} from '../../../../functions/src/listening-authoring/service.ts';
import {
  type ListeningAuthoringRepository,
} from '../../../../../functions/src/listening-authoring/repository.shared.ts';
import {
  FirebaseRestListeningAuthoringRepository,
  type RepositoryEnv,
} from './repository.ts';

type AuthoringMutationName = 'save-draft' | 'publish' | 'lifecycle';

const LOCAL_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
]);

class ListeningAuthoringError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly body: Record<string, unknown> = { message: code },
  ) {
    super(code);
    this.name = 'ListeningAuthoringError';
  }
}

const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    throw new ListeningAuthoringError('invalid_request', 400, { message: 'Invalid JSON body.' });
  }
};

const normalizeBody = (body: unknown, request: Request): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  if (Object.prototype.hasOwnProperty.call(body, 'ownerId')) {
    throw new ListeningAuthoringError(
      'browser_owner_authority',
      400,
      { message: 'ownerId is server-derived' },
    );
  }
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (
    typeof idempotencyKey === 'string' &&
    idempotencyKey.trim().length > 0 &&
    !Object.prototype.hasOwnProperty.call(body, 'idempotencyKey')
  ) {
    return { ...body, idempotencyKey };
  }
  return body;
};

const profileRecord = (profile: unknown): Record<string, unknown> | null =>
  profile !== null && typeof profile === 'object' && !Array.isArray(profile)
    ? profile as Record<string, unknown>
    : null;

const roleFromProfile = (profile: unknown): 'teacher' | 'super_admin' | null => {
  const record = profileRecord(profile);
  if (!record) return null;
  if (record.role === 'teacher' || record.role === 'super_admin') return record.role;
  return null;
};

const assertProfileCanMutate = (profile: unknown): void => {
  const record = profileRecord(profile);
  if (!record) {
    throw new ListeningAuthoringError(
      'profile_required',
      403,
      { message: 'Listening authoring requires a current user profile.' },
    );
  }
  if (record.forceReauth === true) {
    throw new ListeningAuthoringError(
      'force_reauth',
      403,
      { message: 'Listening authoring account must re-authenticate.' },
    );
  }
  if (
    record.status === 'blocked' ||
    record.status === 'inactive' ||
    record.status === 'suspended'
  ) {
    throw new ListeningAuthoringError(
      'inactive_profile',
      403,
      { message: 'Listening authoring account is not active.' },
    );
  }
};

const resolveAuthContext = async (
  uid: string,
  readValue: (path: string) => Promise<unknown>,
) => {
  const profile = await readValue(`users/${uid}`);
  assertProfileCanMutate(profile);
  const role = roleFromProfile(profile);
  if (!role) {
    throw new ListeningAuthoringError(
      'role_required',
      403,
      { message: 'Listening authoring requires a teacher or super-admin account.' },
    );
  }
  return { uid, role };
};

const assertWritesAllowed = async (
  readValue: (path: string) => Promise<unknown>,
  request: Request,
  env: RepositoryEnv,
): Promise<void> => {
  const writesEnabled = await readValue(LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH);
  const localDevOverride = env.LISTENING_AUTHORING_DEV_WRITES_ENABLED === 'true'
    && LOCAL_APP_ORIGINS.has(request.headers.get('Origin'));
  if (writesEnabled !== true && !localDevOverride) {
    throw new ListeningAuthoringError(
      'writes_disabled',
      503,
      {
        message: 'Listening authoring writes are disabled.',
        status: 'writes-disabled',
      },
    );
  }
  const restoreInProgress = await readValue(LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH);
  const restoreIsActive = restoreInProgress === true || (
    typeof restoreInProgress === 'object' &&
    restoreInProgress !== null &&
    'active' in restoreInProgress &&
    restoreInProgress.active === true
  );
  if (restoreIsActive) {
    throw new ListeningAuthoringError(
      'restore_in_progress',
      503,
      {
        message: 'Listening authoring writes are blocked during restore.',
        status: 'restore-in-progress',
      },
    );
  }
};

const statusForResult = (result: Record<string, unknown>): number => {
  switch (result.status) {
    case 'conflict':
    case 'idempotency-conflict':
      return 409;
    case 'not-found':
      return 404;
    case 'blocked':
    case 'invalid-state':
      return 422;
    default:
      return 200;
  }
};

const statusForThrown = (error: unknown): number => {
  if (error instanceof ListeningAuthoringError) return error.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('required') ||
    message.includes('unsupported') ||
    message.includes('unknown') ||
    message.includes('server-derived') ||
    message.includes('must be')
  ) {
    return 400;
  }
  return 500;
};

const bodyForThrown = (error: unknown, status: number): Record<string, unknown> => {
  if (error instanceof ListeningAuthoringError) return error.body;
  if (status >= 500) return { message: 'Listening authoring mutation failed.' };
  return {
    message: error instanceof Error ? error.message : 'Listening authoring mutation failed.',
  };
};

const runMutation = async (
  mutation: AuthoringMutationName,
  auth: { uid: string; role: 'teacher' | 'super_admin' },
  body: unknown,
  repo: ListeningAuthoringRepository,
  idempotencySecret: string,
): Promise<Record<string, unknown>> => {
  switch (mutation) {
    case 'save-draft':
      return saveListeningDraftCore({ auth, body, repo, idempotencySecret });
    case 'publish':
      return publishListeningDraftCore({ auth, body, repo, idempotencySecret });
    case 'lifecycle':
      return mutateListeningAuthoringLifecycleCore({ auth, body, repo, idempotencySecret });
  }
};

export const createListeningAuthoringWorkerHandlers = (options: {
  repository?: ListeningAuthoringRepository;
  idempotencySecret?: string;
  now?: () => number;
} = {}) => {
  const handle = (mutation: AuthoringMutationName) => async (input: {
    request: Request;
    env: RepositoryEnv;
    uid: string;
  }) => {
    const repository = options.repository ?? new FirebaseRestListeningAuthoringRepository({
      env: input.env,
      now: options.now,
    });
    const readValue = 'readValue' in repository && typeof repository.readValue === 'function'
      ? (path: string) => (repository as FirebaseRestListeningAuthoringRepository).readValue(path)
      : async (path: string) => {
          if (typeof input.env.readDatabaseValue === 'function') {
            return input.env.readDatabaseValue(path);
          }
          throw new Error(`readValue unavailable for ${path}`);
        };
    const secret = options.idempotencySecret ?? input.env[LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME];
    if (typeof secret !== 'string' || secret.length < 16) {
      throw new ListeningAuthoringError(
        'idempotency_secret_unavailable',
        500,
        { message: 'Listening authoring idempotency secret is not configured.' },
      );
    }

    const auth = await resolveAuthContext(input.uid, readValue);
    await assertWritesAllowed(readValue, input.request, input.env);
    const body = normalizeBody(await readJsonBody(input.request), input.request);
    const result = await runMutation(mutation, auth, body, repository, secret);
    return { body: result, init: { status: statusForResult(result) } };
  };

  const wrap = (mutation: AuthoringMutationName) => async (input: {
    request: Request;
    env: RepositoryEnv;
    uid: string;
  }) => {
    try {
      return await handle(mutation)(input);
    } catch (error) {
      const status = statusForThrown(error);
      const body = bodyForThrown(error, status);
      const expectedGateBlock = error instanceof ListeningAuthoringError && (
        error.code === 'writes_disabled' ||
        error.code === 'restore_in_progress'
      );
      if (status >= 500 && !expectedGateBlock) {
        console.error(
          'Listening authoring mutation failed',
          error instanceof Error ? error.message : String(error),
        );
      }
      return { body, init: { status } };
    }
  };

  return {
    saveDraft: wrap('save-draft'),
    publish: wrap('publish'),
    lifecycle: wrap('lifecycle'),
  };
};
