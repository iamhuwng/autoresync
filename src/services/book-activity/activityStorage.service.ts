export interface ActivityAuthoringTransport {
  mutate(path: string, body: unknown): Promise<unknown>;
  read(path: string): Promise<unknown>;
}

export interface ActivityAuthoringFetchOptions {
  baseUrl: string;
  getIdToken(): Promise<string>;
  fetchImpl?: typeof fetch;
}

const MAX_RESPONSE_BYTES = 256 * 1024;

export type ActivityAuthoringFailureCode =
  | 'authoring_forbidden'
  | 'body_too_large'
  | 'content_type_required'
  | 'invalid_activity_id'
  | 'invalid_candidate_id'
  | 'invalid_evidence_refs'
  | 'invalid_expected_revision'
  | 'invalid_json'
  | 'invalid_operation_id'
  | 'invalid_persisted_activity'
  | 'invalid_persisted_candidate'
  | 'invalid_persisted_operation'
  | 'invalid_request'
  | 'trusted_id_provider_failed'
  | 'book_activity_authoring_failed';

export type ActivityAuthoringFailureStatus =
  | 'candidate_too_large'
  | 'capacity-exceeded'
  | 'conflict'
  | 'discarded'
  | 'id-collision'
  | 'idempotency-conflict'
  | 'invalid'
  | 'not-found';

export interface ActivityAuthoringFailureBody {
  code?: ActivityAuthoringFailureCode;
  status?: ActivityAuthoringFailureStatus;
  currentRevision?: number;
}

const FAILURE_CODES = new Set<ActivityAuthoringFailureCode>([
  'authoring_forbidden',
  'body_too_large',
  'content_type_required',
  'invalid_activity_id',
  'invalid_candidate_id',
  'invalid_evidence_refs',
  'invalid_expected_revision',
  'invalid_json',
  'invalid_operation_id',
  'invalid_persisted_activity',
  'invalid_persisted_candidate',
  'invalid_persisted_operation',
  'invalid_request',
  'trusted_id_provider_failed',
  'book_activity_authoring_failed',
]);
const FAILURE_STATUSES = new Set<ActivityAuthoringFailureStatus>([
  'candidate_too_large',
  'capacity-exceeded',
  'conflict',
  'discarded',
  'id-collision',
  'idempotency-conflict',
  'invalid',
  'not-found',
]);

export class ActivityAuthoringHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: ActivityAuthoringFailureBody,
  ) {
    super(`Activity authoring request failed (${statusCode}).`);
    this.name = 'ActivityAuthoringHttpError';
  }
}

/** Request may have committed while its response was lost. Retry only with same operation ID. */
export class ActivityAuthoringAmbiguousTransportError extends Error {
  constructor(message = 'Activity authoring response could not be confirmed.') {
    super(message);
    this.name = 'ActivityAuthoringAmbiguousTransportError';
  }
}

const plainRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const failureBody = (value: unknown): ActivityAuthoringFailureBody => {
  const body = plainRecord(value);
  if (!body) return {};
  const currentRevision = body.currentRevision;
  return {
    ...(typeof body.code === 'string'
      && FAILURE_CODES.has(body.code as ActivityAuthoringFailureCode)
      ? { code: body.code as ActivityAuthoringFailureCode }
      : {}),
    ...(typeof body.status === 'string'
      && FAILURE_STATUSES.has(body.status as ActivityAuthoringFailureStatus)
      ? { status: body.status as ActivityAuthoringFailureStatus }
      : {}),
    ...(typeof currentRevision === 'number'
      && Number.isSafeInteger(currentRevision)
      && currentRevision >= 0
      ? { currentRevision }
      : {}),
  };
};

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    throw new Error('Activity authoring response is too large.');
  }
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Activity authoring response is too large.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(payload);
  try {
    return text === '' ? {} : JSON.parse(text);
  } catch {
    throw new Error('Activity authoring returned invalid JSON.');
  }
};

/** HTTP transport only. It never stores drafts or tokens in browser storage. */
export const createActivityAuthoringTransport = (
  options: ActivityAuthoringFetchOptions,
): ActivityAuthoringTransport => {
  const request = async (path: string, init: RequestInit): Promise<unknown> => {
    const token = await options.getIdToken();
    if (!token) throw new Error('Activity authoring authentication is required.');
    let response: Response;
    try {
      response = await (options.fetchImpl ?? globalThis.fetch)(
        `${options.baseUrl.replace(/\/$/u, '')}${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...init.headers,
          },
        },
      );
    } catch {
      throw new ActivityAuthoringAmbiguousTransportError();
    }
    let body: unknown;
    try {
      body = await readBoundedJson(response);
    } catch (error) {
      if (error instanceof Error && (
        error.message === 'Activity authoring response is too large.' ||
        error.message === 'Activity authoring returned invalid JSON.'
      )) throw error;
      throw new ActivityAuthoringAmbiguousTransportError();
    }
    if (!response.ok) throw new ActivityAuthoringHttpError(response.status, failureBody(body));
    return body;
  };
  return {
    mutate: (path, body) => request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    read: (path) => request(path, { method: 'GET' }),
  };
};
