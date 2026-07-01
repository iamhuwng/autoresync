import {
  LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH,
  LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH,
} from './constants';
import type { ListeningAuthoringAuthContext } from './contracts';
import type { ListeningAuthoringRepository } from './repository';
import {
  mutateListeningAuthoringLifecycleCore,
  publishListeningDraftCore,
  saveListeningDraftCore,
} from './service';

type ListeningAuthoringMutationName = 'save-draft' | 'publish' | 'lifecycle';

type VerifiedToken = Record<string, unknown>;

interface HttpError extends Error {
  statusCode: number;
  responseBody?: Record<string, unknown>;
}

export interface ListeningAuthoringHttpRequest {
  method: string;
  body?: unknown;
  get(name: string): string | undefined;
}

export interface ListeningAuthoringHttpResponse {
  set(name: string, value: string): ListeningAuthoringHttpResponse;
  status(code: number): ListeningAuthoringHttpResponse;
  json(body: unknown): void;
  send(body: unknown): void;
}

export interface ListeningAuthoringHttpDependencies {
  verifyIdToken(token: string): Promise<VerifiedToken>;
  readDatabaseValue(path: string): Promise<unknown>;
  createRepository(): ListeningAuthoringRepository;
  getIdempotencySecret(): string | undefined;
  logError(message: string, data?: Record<string, unknown>): void;
}

export type ListeningAuthoringHttpHandler = (
  request: ListeningAuthoringHttpRequest,
  response: ListeningAuthoringHttpResponse,
) => Promise<void>;

const createHttpError = (
  statusCode: number,
  message: string,
  extraBody: Record<string, unknown> = {},
): HttpError => Object.assign(new Error(message), {
  statusCode,
  responseBody: {
    message,
    ...extraBody,
  },
});

const setCorsHeaders = (
  response: ListeningAuthoringHttpResponse,
  origin?: string,
): void => {
  response.set('Access-Control-Allow-Origin', origin || '*');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Vary', 'Origin');
};

const sendJson = (
  response: ListeningAuthoringHttpResponse,
  status: number,
  body: Record<string, unknown>,
): void => {
  response.status(status).json(body);
};

const readBearerToken = (header: string | undefined): string => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match?.[1]) {
    throw createHttpError(401, 'Firebase ID token is required.');
  }

  return match[1];
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const tokenUid = (token: VerifiedToken): string => {
  const uid = readString(token.sub);
  if (!uid) {
    throw createHttpError(401, 'Firebase ID token subject is required.');
  }

  return uid;
};

const readAllowedRole = (value: unknown): ListeningAuthoringAuthContext['role'] | null => {
  if (value === 'super_admin') {
    return 'super_admin';
  }
  if (value === 'teacher') {
    return 'teacher';
  }

  return null;
};

const profileRecord = (profile: unknown): Record<string, unknown> | null =>
  profile !== null && typeof profile === 'object' && !Array.isArray(profile)
    ? profile as Record<string, unknown>
    : null;

const assertProfileCanMutate = (profile: unknown): void => {
  const record = profileRecord(profile);
  if (record === null) {
    return;
  }

  if (record.forceReauth === true) {
    throw createHttpError(403, 'Listening authoring account must re-authenticate.');
  }

  if (
    record.status === 'blocked' ||
    record.status === 'inactive' ||
    record.status === 'suspended'
  ) {
    throw createHttpError(403, 'Listening authoring account is not active.');
  }
};

const roleFromProfile = (profile: unknown): ListeningAuthoringAuthContext['role'] | null => {
  const record = profileRecord(profile);
  if (record === null) {
    return null;
  }

  const primary = readAllowedRole(record.role);
  if (primary !== null) {
    return primary;
  }

  return null;
};

const resolveAuthContext = async (
  verifiedToken: VerifiedToken,
  dependencies: ListeningAuthoringHttpDependencies,
): Promise<ListeningAuthoringAuthContext> => {
  const uid = tokenUid(verifiedToken);
  const profile = await dependencies.readDatabaseValue(`users/${uid}`);
  if (profileRecord(profile) === null) {
    throw createHttpError(403, 'Listening authoring requires a current user profile.');
  }

  assertProfileCanMutate(profile);

  const profileRole = roleFromProfile(profile);
  if (profileRole !== null) {
    return { uid, role: profileRole };
  }

  throw createHttpError(403, 'Listening authoring requires a teacher or super-admin account.');
};

const assertWritesAllowed = async (
  dependencies: ListeningAuthoringHttpDependencies,
): Promise<void> => {
  const writesEnabled = await dependencies.readDatabaseValue(
    LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH,
  );
  if (writesEnabled !== true) {
    throw createHttpError(503, 'Listening authoring writes are disabled.', {
      status: 'writes-disabled',
    });
  }

  const restoreInProgress = await dependencies.readDatabaseValue(
    LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH,
  );
  const restoreIsActive = restoreInProgress === true || (
    typeof restoreInProgress === 'object'
    && restoreInProgress !== null
    && 'active' in restoreInProgress
    && restoreInProgress.active === true
  );
  if (restoreIsActive) {
    throw createHttpError(503, 'Listening authoring writes are blocked during restore.', {
      status: 'restore-in-progress',
    });
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
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  if (typeof statusCode === 'number') {
    return statusCode;
  }

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
  const responseBody = (error as { responseBody?: unknown })?.responseBody;
  if (
    responseBody !== null &&
    typeof responseBody === 'object' &&
    !Array.isArray(responseBody)
  ) {
    return responseBody as Record<string, unknown>;
  }

  if (status >= 500) {
    return { message: 'Listening authoring mutation failed.' };
  }

  return {
    message: error instanceof Error
      ? error.message
      : 'Listening authoring mutation failed.',
  };
};

const runMutation = async (
  mutation: ListeningAuthoringMutationName,
  auth: ListeningAuthoringAuthContext,
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

export const createListeningAuthoringHttpHandler = (
  mutation: ListeningAuthoringMutationName,
  dependencies: ListeningAuthoringHttpDependencies,
): ListeningAuthoringHttpHandler => async (request, response) => {
  setCorsHeaders(response, request.get('origin'));

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const verifiedToken = await dependencies.verifyIdToken(
      readBearerToken(request.get('authorization')),
    );
    const auth = await resolveAuthContext(verifiedToken, dependencies);
    await assertWritesAllowed(dependencies);

    const idempotencySecret = dependencies.getIdempotencySecret();
    if (!idempotencySecret) {
      throw createHttpError(500, 'Listening authoring idempotency secret is not configured.');
    }

    const result = await runMutation(
      mutation,
      auth,
      request.body,
      dependencies.createRepository(),
      idempotencySecret,
    );
    sendJson(response, statusForResult(result), result);
  } catch (error) {
    const status = statusForThrown(error);
    const responseBody = bodyForThrown(error, status);
    dependencies.logError('Listening authoring mutation failed', {
      status,
      message: readString(responseBody.message) ?? 'Listening authoring mutation failed.',
      mutation,
    });
    sendJson(response, status, responseBody);
  }
};

export const createListeningAuthoringHttpHandlers = (
  dependencies: ListeningAuthoringHttpDependencies,
): {
  saveListeningDraft: ListeningAuthoringHttpHandler;
  publishListeningDraft: ListeningAuthoringHttpHandler;
  mutateListeningAuthoringLifecycle: ListeningAuthoringHttpHandler;
} => ({
  saveListeningDraft: createListeningAuthoringHttpHandler('save-draft', dependencies),
  publishListeningDraft: createListeningAuthoringHttpHandler('publish', dependencies),
  mutateListeningAuthoringLifecycle: createListeningAuthoringHttpHandler('lifecycle', dependencies),
});
