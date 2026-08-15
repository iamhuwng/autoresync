import { getAuth } from 'firebase/auth';
import { resolveBookDeliveryWorkerOrigin } from '../book-delivery/bookDelivery.browser';
import type { BookRuntimeShellActivity } from '../../components/book-runtime/BookRuntimeShell';
import type { StudentActivityProjection } from '../../types/bookActivity.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const MAX_ACTIVITIES = 64;
const MAX_RESPONSE_BYTES = 512 * 1024;
const FORBIDDEN = /(?:answerkey|credentials|privateobjectkey|providerauthority|teacher|sourceprovenance|secret|token)/iu;

export interface BookActivityLaunchPin {
  readonly activityId: string;
  readonly activityVersionId: string;
}

export interface BookActivityLaunchInput {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly activityPins: readonly BookActivityLaunchPin[];
  /** Optional display identity; the server must still derive authorization from the token. */
  readonly recipientId?: string;
}

export interface BookHomeworkActivityLaunchInput {
  readonly assignmentId: string;
  readonly placements: readonly (BookActivityLaunchPin & { readonly placementId: string })[];
}

export interface BookActivityLaunchBrowserEnv {
  readonly VITE_BOOK_RUNTIME_WORKER_URL?: string;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface BookActivityLaunchBrowserClientOptions {
  readonly baseUrl?: string;
  readonly env?: BookActivityLaunchBrowserEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
}

export type BookActivityLaunchBrowserErrorCode =
  | 'invalid_request' | 'missing_user' | 'token_unavailable' | 'network_failure'
  | 'invalid_response' | 'unauthorized' | 'forbidden' | 'not_found' | 'server_unavailable';

export class BookActivityLaunchBrowserError extends Error {
  constructor(readonly code: BookActivityLaunchBrowserErrorCode, readonly status = 0) {
    super(`book_activity_launch_browser_${code}`);
    this.name = 'BookActivityLaunchBrowserError';
  }
}

export interface BookActivityLaunchBrowserClient {
  readActivities(input: BookActivityLaunchInput): Promise<readonly BookRuntimeShellActivity[]>;
  readHomeworkActivities(input: BookHomeworkActivityLaunchInput): Promise<readonly BookRuntimeShellActivity[]>;
  /** Alias retained for callers that describe the operation as a batch read. */
  readBatch(input: BookActivityLaunchInput): Promise<readonly BookRuntimeShellActivity[]>;
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
);

const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => freeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const safeProjection = (value: unknown): value is StudentActivityProjection => {
  const projection = record(value);
  if (!projection || !exactKeys(projection, [
    'schemaVersion', 'title', 'taskProfile', 'presentationMode', 'contextRequirement',
    'instructions', 'stimulus', 'assetRefs', 'interaction', 'answerRule', 'interactions', 'scoring',
  ])) return false;
  if (!Number.isSafeInteger(projection.schemaVersion) || (projection.schemaVersion as number) < 1
    || typeof projection.title !== 'string' || projection.title.length > 500
    || !record(projection.interaction) || !Array.isArray(projection.interactions)
    || !Array.isArray(projection.instructions) || !Array.isArray(projection.assetRefs)
    || !record(projection.contextRequirement) || !record(projection.answerRule)
    || !record(projection.scoring)) return false;
  const visit = (candidate: unknown, depth: number): boolean => {
    if (depth > 8 || candidate === undefined || typeof candidate === 'function'
      || typeof candidate === 'symbol' || typeof candidate === 'bigint') return false;
    if (Array.isArray(candidate)) return candidate.length <= 128 && candidate.every((entry) => visit(entry, depth + 1));
    const object = record(candidate);
    if (!object) return true;
    return Object.keys(object).length <= 64
      && Object.keys(object).every((key) => !FORBIDDEN.test(key) && visit(object[key], depth + 1));
  };
  return visit(projection, 0);
};

const assertInput = (input: BookActivityLaunchInput): void => {
  if (!SAFE_ID.test(input.bindingId) || !SAFE_ID.test(input.contextId)
    || (input.recipientId !== undefined && !SAFE_ID.test(input.recipientId))
    || !Number.isSafeInteger(input.bindingRevision) || input.bindingRevision < 1
    || !Array.isArray(input.activityPins) || input.activityPins.length < 1
    || input.activityPins.length > MAX_ACTIVITIES) throw new BookActivityLaunchBrowserError('invalid_request');
  const ids = new Set<string>();
  for (const pin of input.activityPins) {
    if (!SAFE_ID.test(pin.activityId) || !SAFE_ID.test(pin.activityVersionId) || ids.has(pin.activityId)) {
      throw new BookActivityLaunchBrowserError('invalid_request');
    }
    ids.add(pin.activityId);
  }
}

const assertHomeworkInput = (input: BookHomeworkActivityLaunchInput): void => {
  if (!SAFE_ID.test(input.assignmentId) || !Array.isArray(input.placements)
    || input.placements.length < 1 || input.placements.length > MAX_ACTIVITIES) {
    throw new BookActivityLaunchBrowserError('invalid_request');
  }
  const placements = new Set<string>();
  const activities = new Set<string>();
  for (const placement of input.placements) {
    if (!SAFE_ID.test(placement.placementId) || !SAFE_ID.test(placement.activityId)
      || !SAFE_ID.test(placement.activityVersionId) || placements.has(placement.placementId)
      || activities.has(placement.activityId)) throw new BookActivityLaunchBrowserError('invalid_request');
    placements.add(placement.placementId);
    activities.add(placement.activityId);
  }
};

const originFor = (options: BookActivityLaunchBrowserClientOptions): string => {
  const env = options.env ?? (import.meta.env as BookActivityLaunchBrowserEnv);
  const raw = options.baseUrl?.trim() || env.VITE_BOOK_RUNTIME_WORKER_URL?.trim();
  if (!raw) return resolveBookDeliveryWorkerOrigin(env);
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || (url.protocol === 'http:' && url.hostname !== 'localhost')
      || url.username || url.password || !/^\/+$/u.test(url.pathname) || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new BookActivityLaunchBrowserError('server_unavailable'); }
};

const body = async (response: Response): Promise<unknown> => {
  const claimed = response.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_RESPONSE_BYTES)) {
    throw new BookActivityLaunchBrowserError('invalid_response', 502);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new BookActivityLaunchBrowserError('invalid_response', 502);
  }
  try { return text === '' ? {} : JSON.parse(text); }
  catch { throw new BookActivityLaunchBrowserError('invalid_response', 502); }
};

const readResponse = (value: unknown, input: BookActivityLaunchInput): readonly BookRuntimeShellActivity[] => {
  const envelope = record(value);
  if (!envelope || !exactKeys(envelope, ['activities']) || !Array.isArray(envelope.activities)
    || envelope.activities.length !== input.activityPins.length) {
    throw new BookActivityLaunchBrowserError('invalid_response', 502);
  }
  const expected = new Map(input.activityPins.map((pin) => [pin.activityId, pin]));
  const seen = new Set<string>();
  const result = envelope.activities.map((candidate): BookRuntimeShellActivity => {
    const item = record(candidate);
    if (!item || !exactKeys(item, ['activityId', 'activityVersionId', 'projection'], ['label'])
      || typeof item.activityId !== 'string' || typeof item.activityVersionId !== 'string'
      || !SAFE_ID.test(item.activityId) || !SAFE_ID.test(item.activityVersionId)
      || seen.has(item.activityId)) throw new BookActivityLaunchBrowserError('invalid_response', 502);
    const pin = expected.get(item.activityId);
    if (!pin || pin.activityVersionId !== item.activityVersionId || !safeProjection(item.projection)
      || (item.label !== undefined && (typeof item.label !== 'string' || item.label.length > 240))) {
      throw new BookActivityLaunchBrowserError('invalid_response', 502);
    }
    seen.add(item.activityId);
    return freeze(clone({
      activityId: item.activityId,
      activityVersionId: item.activityVersionId,
      projection: item.projection,
      ...(item.label === undefined ? {} : { label: item.label }),
    }));
  });
  if (seen.size !== expected.size) throw new BookActivityLaunchBrowserError('invalid_response', 502);
  return Object.freeze(result);
};

export const createBookActivityLaunchBrowserClient = (
  options: BookActivityLaunchBrowserClientOptions = {},
): BookActivityLaunchBrowserClient => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getIdToken = options.getIdToken ?? ((forceRefresh = false) => getAuth().currentUser?.getIdToken(forceRefresh));
  const origin = originFor(options);
  const readActivities = async (input: BookActivityLaunchInput): Promise<readonly BookRuntimeShellActivity[]> => {
    assertInput(input);
    let token: string | null | undefined;
    try { token = await getIdToken(false); } catch { throw new BookActivityLaunchBrowserError('token_unavailable'); }
    if (!options.getIdToken && !getAuth().currentUser) throw new BookActivityLaunchBrowserError('missing_user');
    if (!token) throw new BookActivityLaunchBrowserError('token_unavailable');
    let response: Response | undefined;
    let responseBody: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchImpl(`${origin}/v1/book-runtime-launch/activities`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(input), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        });
      } catch { throw new BookActivityLaunchBrowserError('network_failure'); }
      responseBody = await body(response);
      if (response.status !== 401 || attempt === 1) break;
      try { token = await getIdToken(true); } catch { throw new BookActivityLaunchBrowserError('token_unavailable'); }
      if (!token) throw new BookActivityLaunchBrowserError('token_unavailable');
    }
    if (!response) throw new BookActivityLaunchBrowserError('network_failure');
    if (!response.ok) {
      if (response.status === 401) throw new BookActivityLaunchBrowserError('unauthorized', response.status);
      if (response.status === 403) throw new BookActivityLaunchBrowserError('forbidden', response.status);
      if (response.status === 404) throw new BookActivityLaunchBrowserError('not_found', response.status);
      throw new BookActivityLaunchBrowserError('server_unavailable', response.status);
    }
    return readResponse(responseBody, input);
  };
  const readHomeworkActivities = async (
    input: BookHomeworkActivityLaunchInput,
  ): Promise<readonly BookRuntimeShellActivity[]> => {
    assertHomeworkInput(input);
    let token: string | null | undefined;
    try { token = await getIdToken(false); } catch { throw new BookActivityLaunchBrowserError('token_unavailable'); }
    if (!options.getIdToken && !getAuth().currentUser) throw new BookActivityLaunchBrowserError('missing_user');
    if (!token) throw new BookActivityLaunchBrowserError('token_unavailable');
    let response: Response | undefined;
    let responseBody: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchImpl(`${origin}/book-homework/assignments/${encodeURIComponent(input.assignmentId)}/launch`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ placementIds: input.placements.map((placement) => placement.placementId) }),
          cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        });
      } catch { throw new BookActivityLaunchBrowserError('network_failure'); }
      responseBody = await body(response);
      if (response.status !== 401 || attempt === 1) break;
      try { token = await getIdToken(true); } catch { throw new BookActivityLaunchBrowserError('token_unavailable'); }
      if (!token) throw new BookActivityLaunchBrowserError('token_unavailable');
    }
    if (!response) throw new BookActivityLaunchBrowserError('network_failure');
    if (!response.ok) {
      if (response.status === 401) throw new BookActivityLaunchBrowserError('unauthorized', response.status);
      if (response.status === 403) throw new BookActivityLaunchBrowserError('forbidden', response.status);
      if (response.status === 404) throw new BookActivityLaunchBrowserError('not_found', response.status);
      throw new BookActivityLaunchBrowserError('server_unavailable', response.status);
    }
    return readResponse(responseBody, {
      bindingId: input.assignmentId,
      bindingRevision: 1,
      contextId: input.assignmentId,
      activityPins: input.placements.map(({ activityId, activityVersionId }) => ({ activityId, activityVersionId })),
    });
  };
  return { readActivities, readHomeworkActivities, readBatch: readActivities };
};
