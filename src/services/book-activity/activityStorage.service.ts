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
  | 'activated_activity_candidate_immutable'
  | 'authoring_forbidden'
  | 'body_too_large'
  | 'book_activity_authoring_authority_unavailable'
  | 'content_type_required'
  | 'invalid_activity_id'
  | 'invalid_activity_key'
  | 'invalid_candidate_id'
  | 'invalid_evidence_refs'
  | 'invalid_expected_revision'
  | 'invalid_json'
  | 'invalid_operation_id'
  | 'invalid_persisted_activity'
  | 'invalid_persisted_candidate'
  | 'invalid_persisted_operation'
  | 'invalid_request'
  | 'invalid_unit_activity_binding'
  | 'invalid_unit_activity_binding_replacement'
  | 'invalid_unit_key'
  | 'trusted_id_provider_failed'
  | 'unit_activity_binding_conflict'
  | 'unit_activity_binding_context_mismatch'
  | 'unit_activity_binding_context_unavailable'
  | 'unit_activity_binding_draft_changed'
  | 'unit_activity_binding_receipt_invalid'
  | 'unit_activity_binding_scope_invalid'
  | 'unit_activity_binding_unavailable'
  | 'unit_activity_target_identity_mismatch'
  | 'book_activity_authoring_failed';

export type ActivityAuthoringFailureStatus =
  | 'binding-conflict'
  | 'candidate_too_large'
  | 'capacity-exceeded'
  | 'conflict'
  | 'discarded'
  | 'id-collision'
  | 'idempotency-conflict'
  | 'invalid'
  | 'not-found';

export interface ActivityAuthoringFailureBindingReceipt {
  schemaVersion: 1;
  ownerId: string;
  bookId: string;
  unitKey: string;
  activityKey: string;
  activityId: string;
  candidateId: string;
  candidateRevision: number;
  candidateLifecycle: 'saved';
  phase: 'binding-pending' | 'complete' | 'binding-conflict';
}

export interface ActivityAuthoringFailureBody {
  code?: ActivityAuthoringFailureCode;
  status?: ActivityAuthoringFailureStatus;
  currentRevision?: number;
  activityId?: string;
  revision?: number;
  candidateId?: string;
  candidateRevision?: number;
  lifecycle?: 'saved';
  replayed?: true;
  binding?: ActivityAuthoringFailureBindingReceipt;
}

const FAILURE_CODES = new Set<ActivityAuthoringFailureCode>([
  'activated_activity_candidate_immutable',
  'authoring_forbidden',
  'body_too_large',
  'book_activity_authoring_authority_unavailable',
  'content_type_required',
  'invalid_activity_id',
  'invalid_activity_key',
  'invalid_candidate_id',
  'invalid_evidence_refs',
  'invalid_expected_revision',
  'invalid_json',
  'invalid_operation_id',
  'invalid_persisted_activity',
  'invalid_persisted_candidate',
  'invalid_persisted_operation',
  'invalid_request',
  'invalid_unit_activity_binding',
  'invalid_unit_activity_binding_replacement',
  'invalid_unit_key',
  'trusted_id_provider_failed',
  'unit_activity_binding_conflict',
  'unit_activity_binding_context_mismatch',
  'unit_activity_binding_context_unavailable',
  'unit_activity_binding_draft_changed',
  'unit_activity_binding_receipt_invalid',
  'unit_activity_binding_scope_invalid',
  'unit_activity_binding_unavailable',
  'unit_activity_target_identity_mismatch',
  'book_activity_authoring_failed',
]);
const FAILURE_STATUSES = new Set<ActivityAuthoringFailureStatus>([
  'binding-conflict',
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

const SAFE_FAILURE_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const SAFE_BINDING_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,159}$/u;

const failureBindingReceipt = (value: unknown): ActivityAuthoringFailureBindingReceipt | undefined => {
  const binding = plainRecord(value);
  if (!binding
    || binding.schemaVersion !== 1
    || typeof binding.ownerId !== 'string' || !SAFE_FAILURE_ID.test(binding.ownerId)
    || typeof binding.bookId !== 'string' || !SAFE_FAILURE_ID.test(binding.bookId)
    || typeof binding.unitKey !== 'string' || !SAFE_BINDING_KEY_ID.test(binding.unitKey)
    || typeof binding.activityKey !== 'string' || !SAFE_BINDING_KEY_ID.test(binding.activityKey)
    || typeof binding.activityId !== 'string' || !SAFE_FAILURE_ID.test(binding.activityId)
    || typeof binding.candidateId !== 'string' || !SAFE_FAILURE_ID.test(binding.candidateId)
    || typeof binding.candidateRevision !== 'number'
    || !Number.isSafeInteger(binding.candidateRevision)
    || binding.candidateRevision < 0
    || binding.candidateLifecycle !== 'saved'
    || (binding.phase !== 'binding-pending'
      && binding.phase !== 'complete'
      && binding.phase !== 'binding-conflict')) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    ownerId: binding.ownerId,
    bookId: binding.bookId,
    unitKey: binding.unitKey,
    activityKey: binding.activityKey,
    activityId: binding.activityId,
    candidateId: binding.candidateId,
    candidateRevision: binding.candidateRevision,
    candidateLifecycle: 'saved',
    phase: binding.phase,
  };
};

const failureBody = (value: unknown): ActivityAuthoringFailureBody => {
  const body = plainRecord(value);
  if (!body) return {};
  const currentRevision = body.currentRevision;
  const revision = body.revision;
  const candidateRevision = body.candidateRevision;
  const parsedBinding = failureBindingReceipt(body.binding);
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
    ...(typeof body.activityId === 'string' && SAFE_FAILURE_ID.test(body.activityId)
      ? { activityId: body.activityId }
      : {}),
    ...(typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0
      ? { revision }
      : {}),
    ...(typeof body.candidateId === 'string' && SAFE_FAILURE_ID.test(body.candidateId)
      ? { candidateId: body.candidateId }
      : {}),
    ...(typeof candidateRevision === 'number' && Number.isSafeInteger(candidateRevision) && candidateRevision >= 0
      ? { candidateRevision }
      : {}),
    ...(body.lifecycle === 'saved' ? { lifecycle: 'saved' as const } : {}),
    ...(body.replayed === true ? { replayed: true as const } : {}),
    ...(parsedBinding ? { binding: parsedBinding } : {}),
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
