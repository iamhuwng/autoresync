import { getAuth } from 'firebase/auth';
import { resolveBookDeliveryWorkerOrigin } from '../book-delivery/bookDelivery.browser';
import type {
  BookRuntimeDraftRecord,
  BookRuntimeOperationReceipt,
} from './activityRuntimeAttempt.types';

const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_DRAFT_BYTES = 32 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FORBIDDEN_KEY = /(?:answerkey|pdfbytes|providerauthority|credentials|privateobjectkey|storagekey|token|secret|timer|integrity|result|source|teacher|publication)/iu;

export interface BookRuntimeDraftAddress {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
}

export interface BookRuntimeSaveDraftInput extends BookRuntimeDraftAddress {
  readonly operationId: string;
  readonly clientRevision: number;
  readonly response: unknown;
}

export interface BookRuntimeSaveDraftResult {
  readonly status: 'accepted' | 'replayed' | 'conflict' | 'denied';
  readonly receipt: BookRuntimeOperationReceipt;
}

export interface BookRuntimeSubmitActivityInput extends BookRuntimeDraftAddress {
  readonly operationId: string;
  readonly draftOperationId: string;
  readonly clientRevision: number;
  readonly response: unknown;
}

export interface BookRuntimeSubmitActivityResult {
  readonly status: 'accepted' | 'replayed' | 'conflict' | 'denied';
  readonly resultStatus: 'pending_review' | 'submitted';
  readonly completionStatus: 'completed';
  readonly receipt: BookRuntimeOperationReceipt;
}

export interface BookRuntimeClient {
  saveDraft(input: BookRuntimeSaveDraftInput): Promise<BookRuntimeSaveDraftResult>;
  submitActivity(input: BookRuntimeSubmitActivityInput): Promise<BookRuntimeSubmitActivityResult>;
  readDraft(input: BookRuntimeDraftAddress): Promise<BookRuntimeDraftRecord | null>;
}

export interface BookRuntimeBrowserEnv {
  readonly VITE_BOOK_RUNTIME_WORKER_URL?: string;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface BookRuntimeClientOptions {
  readonly baseUrl?: string;
  readonly env?: BookRuntimeBrowserEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly maxResponseBytes?: number;
}

export type BookRuntimeClientErrorCode =
  | 'missing_user'
  | 'token_unavailable'
  | 'network_failure'
  | 'invalid_response'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'not_found'
  | 'server_unavailable'
  | 'rate_limited'
  | 'route_disabled';

export class BookRuntimeClientError extends Error {
  constructor(
    readonly code: BookRuntimeClientErrorCode,
    readonly status = 0,
    readonly currentRevision?: number,
  ) {
    super(`book_runtime_client_${code}`);
    this.name = 'BookRuntimeClientError';
  }
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void => {
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new BookRuntimeClientError('invalid_response');
  }
};
const safeId = (value: unknown): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new BookRuntimeClientError('invalid_response');
  }
  return value;
};

const nonNegativeInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BookRuntimeClientError('invalid_response');
  }
  return value as number;
};

const positiveInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BookRuntimeClientError('invalid_response');
  }
  return value as number;
};

const assertSafeResponse = (value: unknown, maxBytes = MAX_RESPONSE_BYTES): void => {
  const visit = (candidate: unknown, depth: number): void => {
    if (candidate === undefined || typeof candidate === 'function' || typeof candidate === 'symbol'
      || typeof candidate === 'bigint' || (typeof candidate === 'number' && !Number.isFinite(candidate))) {
      throw new BookRuntimeClientError('invalid_response');
    }
    if (depth > 8) throw new BookRuntimeClientError('invalid_response');
    if (Array.isArray(candidate)) {
      if (candidate.length > 128) throw new BookRuntimeClientError('invalid_response');
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    const object = record(candidate);
    if (!object) return;
    const keys = Object.keys(object);
    if (keys.length > 64 || keys.some((key) => FORBIDDEN_KEY.test(key))) {
      throw new BookRuntimeClientError('invalid_response');
    }
    keys.forEach((key) => visit(object[key], depth + 1));
  };
  visit(value, 0);
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new BookRuntimeClientError('invalid_response');
  }
  if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > maxBytes) {
    throw new BookRuntimeClientError('invalid_response');
  }
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string | null | undefined> => (
  getAuth().currentUser?.getIdToken(forceRefresh)
);

const workerOrigin = (
  options: BookRuntimeClientOptions,
): string => {
  const explicit = options.baseUrl?.trim()
    || options.env?.VITE_BOOK_RUNTIME_WORKER_URL?.trim();
  if (explicit) {
    let url: URL;
    try {
      url = new URL(explicit);
    } catch {
      throw new BookRuntimeClientError('server_unavailable');
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || (url.protocol === 'http:' && url.hostname !== 'localhost')
      || url.username !== '' || url.password !== '' || url.pathname !== '/'
      || url.search !== '' || url.hash !== '') {
      throw new BookRuntimeClientError('server_unavailable');
    }
    return url.origin;
  }
  return resolveBookDeliveryWorkerOrigin(options.env);
};

const bodyFrom = async (response: Response, maxBytes: number): Promise<unknown> => {
  const claimed = response.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > maxBytes)) {
    throw new BookRuntimeClientError('invalid_response', 502);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new BookRuntimeClientError('invalid_response', 502);
  }
  try {
    return text === '' ? {} : JSON.parse(text);
  } catch {
    throw new BookRuntimeClientError('invalid_response', 502);
  }
};

const codeFrom = (value: unknown): string | undefined => {
  const body = record(value);
  return typeof body?.code === 'string' ? body.code : undefined;
};

const classify = (response: Response, body: unknown): BookRuntimeClientError => {
  const code = codeFrom(body);
  if (response.status === 401) return new BookRuntimeClientError('unauthorized', response.status);
  if (response.status === 403) return new BookRuntimeClientError('forbidden', response.status);
  if (response.status === 404) return new BookRuntimeClientError('not_found', response.status);
  if (response.status === 409) {
    const currentRevision = record(body)?.currentRevision;
    return new BookRuntimeClientError(
      'conflict',
      response.status,
      Number.isSafeInteger(currentRevision) && (currentRevision as number) >= 0
        ? currentRevision as number
        : undefined,
    );
  }
  if (response.status === 429) return new BookRuntimeClientError('rate_limited', response.status);
  if (response.status === 503 && code === 'book_route_disabled') {
    return new BookRuntimeClientError('route_disabled', response.status);
  }
  return new BookRuntimeClientError('server_unavailable', response.status);
};

const operationReceipt = (value: unknown): BookRuntimeOperationReceipt => {
  const body = record(value);
  if (!body) throw new BookRuntimeClientError('invalid_response');
  exactKeys(body, ['operationId', 'status', 'bindingId', 'createdAt'], ['draftRevision', 'attemptId']);
  const operationId = body.operationId;
  if (typeof operationId !== 'string' || !UUID.test(operationId)) {
    throw new BookRuntimeClientError('invalid_response');
  }
  if (body.status !== 'accepted' && body.status !== 'replayed'
    && body.status !== 'conflict' && body.status !== 'denied') {
    throw new BookRuntimeClientError('invalid_response');
  }
  if (typeof body.createdAt !== 'string' || !body.createdAt) {
    throw new BookRuntimeClientError('invalid_response');
  }
  const receipt: BookRuntimeOperationReceipt = {
    operationId,
    fingerprint: '',
    status: body.status,
    bindingId: safeId(body.bindingId),
    createdAt: body.createdAt,
    ...(body.draftRevision === undefined ? {} : { draftRevision: nonNegativeInteger(body.draftRevision) }),
    ...(body.attemptId === undefined ? {} : { attemptId: safeId(body.attemptId) }),
  };
  return receipt;
};

const draftFrom = (value: unknown): BookRuntimeDraftRecord | null => {
  if (value === null) return null;
  const body = record(value);
  if (!body) throw new BookRuntimeClientError('invalid_response');
  exactKeys(body, [
    'schemaVersion', 'bindingId', 'recipientId', 'contextId', 'placementId',
    'activityId', 'activityVersion', 'interactionId', 'revision', 'response',
    'updatedByOperationId', 'updatedAt',
  ]);
  if (body.schemaVersion !== 1) throw new BookRuntimeClientError('invalid_response');
  const operationId = body.updatedByOperationId;
  if (typeof operationId !== 'string' || !UUID.test(operationId)) {
    throw new BookRuntimeClientError('invalid_response');
  }
  assertSafeResponse(body.response, MAX_DRAFT_BYTES);
  return {
    schemaVersion: 1,
    bindingId: safeId(body.bindingId),
    recipientId: safeId(body.recipientId),
    contextId: safeId(body.contextId),
    placementId: safeId(body.placementId),
    activityId: safeId(body.activityId),
    activityVersion: positiveInteger(body.activityVersion),
    interactionId: safeId(body.interactionId),
    revision: nonNegativeInteger(body.revision),
    response: structuredClone(body.response),
    updatedByOperationId: operationId,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : (() => {
      throw new BookRuntimeClientError('invalid_response');
    })(),
  };
};

const assertAddress = (input: BookRuntimeDraftAddress): void => {
  safeId(input.bindingId);
  if (!Number.isSafeInteger(input.bindingRevision) || input.bindingRevision <= 0) {
    throw new BookRuntimeClientError('invalid_response');
  }
  safeId(input.contextId);
  safeId(input.placementId);
  safeId(input.activityId);
  if (!Number.isSafeInteger(input.activityVersion) || input.activityVersion <= 0) {
    throw new BookRuntimeClientError('invalid_response');
  }
  safeId(input.interactionId);
};

const draftPath = (input: BookRuntimeDraftAddress): string => [
  '/book-runtime/drafts',
  input.bindingId,
  String(input.bindingRevision),
  input.contextId,
  input.placementId,
  input.activityId,
  String(input.activityVersion),
  input.interactionId,
].map((part, index) => index === 0 ? part : encodeURIComponent(part)).join('/');

export const createBookRuntimeClient = (
  options: BookRuntimeClientOptions = {},
): BookRuntimeClient => {
  const origin = workerOrigin(options);
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const getIdToken = options.getIdToken ?? defaultGetIdToken;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  const request = async (path: string, init: RequestInit): Promise<unknown> => {
    let token: string;
    try {
      token = (await getIdToken(false))?.trim() ?? '';
    } catch (error) {
      throw new BookRuntimeClientError('token_unavailable', 401);
    }
    if (!token) throw new BookRuntimeClientError('missing_user', 401);
    const run = async (forceRefresh: boolean): Promise<Response> => {
      if (forceRefresh) {
        try {
          token = (await getIdToken(true))?.trim() ?? '';
        } catch {
          throw new BookRuntimeClientError('token_unavailable', 401);
        }
        if (!token) throw new BookRuntimeClientError('token_unavailable', 401);
      }
      try {
        return await fetchImpl(`${origin}${path}`, {
          ...init,
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...init.headers,
          },
        });
      } catch (error) {
        throw new BookRuntimeClientError('network_failure', 0);
      }
    };
    let response = await run(false);
    if (response.status === 401) {
      response.body?.cancel().catch(() => undefined);
      response = await run(true);
    }
    const body = await bodyFrom(response, maxResponseBytes);
    if (!response.ok) throw classify(response, body);
    return body;
  };

  return {
    async saveDraft(input) {
      assertAddress(input);
      if (!UUID.test(input.operationId)) throw new BookRuntimeClientError('invalid_response');
      if (!Number.isSafeInteger(input.clientRevision) || input.clientRevision < 0) {
        throw new BookRuntimeClientError('invalid_response');
      }
      assertSafeResponse(input.response);
      const body = await request('/book-runtime/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: input.operationId,
          commandKind: 'autosave',
          bindingId: input.bindingId,
          bindingRevision: input.bindingRevision,
          contextId: input.contextId,
          placementId: input.placementId,
          activityId: input.activityId,
          activityVersion: input.activityVersion,
          interactionId: input.interactionId,
          clientRevision: input.clientRevision,
          response: input.response,
        }),
      });
      const result = record(body);
      if (!result) throw new BookRuntimeClientError('invalid_response');
      exactKeys(result, ['status', 'receipt']);
      const status = result.status;
      if (status !== 'accepted' && status !== 'replayed' && status !== 'conflict' && status !== 'denied') {
        throw new BookRuntimeClientError('invalid_response');
      }
      return { status, receipt: operationReceipt(result.receipt) };
    },

    async submitActivity(input) {
      assertAddress(input);
      if (!UUID.test(input.operationId) || !UUID.test(input.draftOperationId)) {
        throw new BookRuntimeClientError('invalid_response');
      }
      if (!Number.isSafeInteger(input.clientRevision) || input.clientRevision < 0) {
        throw new BookRuntimeClientError('invalid_response');
      }
      assertSafeResponse(input.response);

      const flushed = await this.saveDraft({
        ...input,
        operationId: input.draftOperationId,
      });
      const acknowledgedRevision = flushed.receipt.draftRevision;
      if (!Number.isSafeInteger(acknowledgedRevision) || (acknowledgedRevision as number) < 0) {
        throw new BookRuntimeClientError('invalid_response');
      }

      const body = await request('/book-runtime/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: input.operationId,
          commandKind: 'submit',
          bindingId: input.bindingId,
          bindingRevision: input.bindingRevision,
          contextId: input.contextId,
          placementId: input.placementId,
          activityId: input.activityId,
          activityVersion: input.activityVersion,
          interactionId: input.interactionId,
          clientRevision: acknowledgedRevision,
          response: input.response,
        }),
      });
      const result = record(body);
      if (!result) throw new BookRuntimeClientError('invalid_response');
      exactKeys(result, ['status', 'receipt', 'resultStatus', 'completionStatus']);
      const status = result.status;
      if (status !== 'accepted' && status !== 'replayed'
        && status !== 'conflict' && status !== 'denied') {
        throw new BookRuntimeClientError('invalid_response');
      }
      if (result.resultStatus !== 'pending_review' && result.resultStatus !== 'submitted') {
        throw new BookRuntimeClientError('invalid_response');
      }
      if (result.completionStatus !== 'completed') {
        throw new BookRuntimeClientError('invalid_response');
      }
      const receipt = operationReceipt(result.receipt);
      if (!receipt.attemptId) throw new BookRuntimeClientError('invalid_response');
      return {
        status,
        resultStatus: result.resultStatus,
        completionStatus: result.completionStatus,
        receipt,
      };
    },

    async readDraft(input) {
      assertAddress(input);
      const body = await request(draftPath(input), { method: 'GET' });
      const result = record(body);
      if (!result) throw new BookRuntimeClientError('invalid_response');
      exactKeys(result, ['draft']);
      return draftFrom(result.draft);
    },
  };
};
