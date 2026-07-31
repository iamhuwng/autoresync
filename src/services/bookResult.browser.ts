import { getAuth } from 'firebase/auth';
import type {
  BookResultAttemptDetail,
  BookResultGroupSummary,
} from './book-activity/results/bookResult.types';
import {
  validateBookResultAttemptDetail,
  validateBookResultGroupSummary,
} from './book-activity/results/bookResultProjection.service';
import { resolveBookDeliveryWorkerOrigin } from './book-delivery/bookDelivery.browser';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const GROUP_KEY = /^g_[A-Za-z0-9_-]{4,640}$/u;
const ROUTE_HANDLE = /^br_[A-Za-z0-9_-]{8,1400}$/u;
const MAX_GROUP_RESPONSE_BYTES = 256 * 1024;
const MAX_DETAIL_RESPONSE_BYTES = 128 * 1024;

export interface BookResultRouteAddress {
  readonly bookId: string;
  readonly studentId: string;
  readonly groupKey: string;
  /** Optional trusted-locator scope; the Worker re-resolves current Homework ownership. */
  readonly homeworkId?: string;
}

export interface BookResultBrowserEnv {
  readonly VITE_BOOK_RESULT_WORKER_URL?: string;
  readonly VITE_BOOK_RUNTIME_WORKER_URL?: string;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface BookResultBrowserClient {
  readGroup(address: BookResultRouteAddress): Promise<BookResultGroupSummary>;
  readDetail(
    address: BookResultRouteAddress,
    resultId: string,
  ): Promise<BookResultAttemptDetail>;
}

export interface BookResultBrowserClientOptions {
  readonly baseUrl?: string;
  readonly env?: BookResultBrowserEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
}

export type BookResultBrowserErrorCode =
  | 'invalid_route'
  | 'missing_user'
  | 'token_unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_response'
  | 'network_failure'
  | 'server_unavailable'
  | 'route_disabled';

export class BookResultBrowserError extends Error {
  constructor(
    readonly code: BookResultBrowserErrorCode,
    readonly status = 0,
  ) {
    super(`book_result_browser_${code}`);
    this.name = 'BookResultBrowserError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const encodeBase64Url = (value: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const decodeBase64Url = (value: string): unknown => {
  const encoded = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

export const createBookResultRouteHandle = (address: BookResultRouteAddress): string => {
  if (!SAFE_ID.test(address.bookId)
    || !SAFE_ID.test(address.studentId)
    || !GROUP_KEY.test(address.groupKey)
    || (address.homeworkId !== undefined && !SAFE_ID.test(address.homeworkId))) {
    throw new BookResultBrowserError('invalid_route');
  }
  return `br_${encodeBase64Url([
    address.bookId,
    address.studentId,
    address.groupKey,
    ...(address.homeworkId === undefined ? [] : [address.homeworkId]),
  ])}`;
};

export const parseBookResultRouteHandle = (
  value: string | null | undefined,
): BookResultRouteAddress | null => {
  if (!value || !ROUTE_HANDLE.test(value)) return null;
  try {
    const decoded = decodeBase64Url(value.slice(3));
    if (!Array.isArray(decoded)
      || (decoded.length !== 3 && decoded.length !== 4)
      || !decoded.every((item) => typeof item === 'string')) {
      return null;
    }
    const [bookId, studentId, groupKey, homeworkId] = decoded as [string, string, string, string?];
    if (!SAFE_ID.test(bookId)
      || !SAFE_ID.test(studentId)
      || !GROUP_KEY.test(groupKey)
      || (homeworkId !== undefined && !SAFE_ID.test(homeworkId))) {
      return null;
    }
    return Object.freeze({
      bookId,
      studentId,
      groupKey,
      ...(homeworkId === undefined ? {} : { homeworkId }),
    });
  } catch {
    return null;
  }
};

const exactOrigin = (value: string): string => {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || (url.protocol === 'http:' && url.hostname !== 'localhost')
      || url.username !== ''
      || url.password !== ''
      || !/^\/+$/u.test(url.pathname)
      || url.search !== ''
      || url.hash !== '') {
      throw new Error('invalid');
    }
    return url.origin;
  } catch {
    throw new BookResultBrowserError('server_unavailable');
  }
};

const resolveOrigin = (options: BookResultBrowserClientOptions): string => {
  const env = options.env
    ?? ((import.meta.env ?? {}) as BookResultBrowserEnv);
  const explicit = options.baseUrl?.trim()
    || env.VITE_BOOK_RESULT_WORKER_URL?.trim()
    || env.VITE_BOOK_RUNTIME_WORKER_URL?.trim();
  return explicit
    ? exactOrigin(explicit)
    : exactOrigin(resolveBookDeliveryWorkerOrigin(env));
};

const responseBody = async (response: Response, maxBytes: number): Promise<unknown> => {
  const claimedLength = response.headers.get('content-length');
  if (claimedLength !== null && (!/^\d+$/u.test(claimedLength)
    || Number(claimedLength) > maxBytes)) {
    throw new BookResultBrowserError('invalid_response', 502);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new BookResultBrowserError('invalid_response', 502);
  }
  try {
    return text === '' ? {} : JSON.parse(text);
  } catch {
    throw new BookResultBrowserError('invalid_response', 502);
  }
};

const classifiedError = (response: Response, body: unknown): BookResultBrowserError => {
  const code = asRecord(body)?.code;
  if (response.status === 401) return new BookResultBrowserError('unauthorized', response.status);
  if (response.status === 403) return new BookResultBrowserError('forbidden', response.status);
  if (response.status === 404) return new BookResultBrowserError('not_found', response.status);
  if (response.status === 503 && code === 'book_route_disabled') {
    return new BookResultBrowserError('route_disabled', response.status);
  }
  return new BookResultBrowserError('server_unavailable', response.status);
};

const hasSafeGroupShape = (
  value: unknown,
  address: BookResultRouteAddress,
): value is BookResultGroupSummary => {
  if (!validateBookResultGroupSummary(value).valid) return false;
  const group = asRecord(value);
  if (!group || !exactKeys(group, [
    'groupKey',
    'recipientId',
    'studentId',
    'activityId',
    'attemptCount',
    'attempts',
    'contexts',
    'latestAttemptId',
  ])) return false;
  if (group.groupKey !== address.groupKey
    || group.studentId !== address.studentId
    || group.recipientId !== address.studentId
    || typeof group.activityId !== 'string'
    || !SAFE_ID.test(group.activityId)
    || !Number.isSafeInteger(group.attemptCount)
    || (group.attemptCount as number) < 0
    || !Array.isArray(group.attempts)
    || group.attempts.length !== group.attemptCount
    || group.attempts.length > 50
    || !Array.isArray(group.contexts)
    || typeof group.latestAttemptId !== 'string') {
    return false;
  }
  const attemptIds = new Set<string>();
  for (const candidate of group.attempts) {
    const attempt = asRecord(candidate);
    if (!attempt
      || attempt.studentId !== address.studentId
      || attempt.recipientId !== address.studentId
      || attempt.activityId !== group.activityId
      || typeof attempt.attemptId !== 'string'
      || typeof attempt.resultId !== 'string'
      || !SAFE_ID.test(attempt.attemptId)
      || !SAFE_ID.test(attempt.resultId)
      || attemptIds.has(attempt.attemptId)
      || typeof attempt.submittedAt !== 'string'
      || !Number.isSafeInteger(attempt.attemptNumber)
      || !Array.isArray(attempt.sources)
      || !Array.isArray(attempt.pageGroupKeys)
      || !Array.isArray(attempt.sourceProvenance)
      || !asRecord(attempt.evaluation)
      || !asRecord(attempt.feedback)
      || !asRecord(attempt.completion)) {
      return false;
    }
    attemptIds.add(attempt.attemptId);
  }
  return attemptIds.has(group.latestAttemptId as string);
};

const hasSafeDetailShape = (
  value: unknown,
  address: BookResultRouteAddress,
  resultId: string,
): value is BookResultAttemptDetail => {
  if (!validateBookResultAttemptDetail(value).valid) return false;
  const detail = asRecord(value);
  return detail !== null
    && detail.studentId === address.studentId
    && detail.recipientId === address.studentId
    && detail.resultId === resultId
    && typeof detail.activityId === 'string'
    && SAFE_ID.test(detail.activityId)
    && typeof detail.attemptId === 'string'
    && SAFE_ID.test(detail.attemptId)
    && typeof detail.submittedAt === 'string'
    && Array.isArray(detail.sources)
    && Array.isArray(detail.pageGroupKeys)
    && Array.isArray(detail.sourceProvenance)
    && asRecord(detail.evaluation) !== null
    && asRecord(detail.feedback) !== null
    && asRecord(detail.completion) !== null
    && Object.prototype.hasOwnProperty.call(detail, 'response');
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string | null | undefined> => (
  getAuth().currentUser?.getIdToken(forceRefresh)
);

export const createBookResultBrowserClient = (
  options: BookResultBrowserClientOptions = {},
): BookResultBrowserClient => {
  const origin = resolveOrigin(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const getIdToken = options.getIdToken ?? defaultGetIdToken;

  const read = async (
    path: string,
    maxBytes: number,
  ): Promise<unknown> => {
    let token: string | null | undefined;
    try {
      token = await getIdToken(false);
    } catch {
      throw new BookResultBrowserError('token_unavailable');
    }
    if (options.getIdToken === undefined && !getAuth().currentUser) {
      throw new BookResultBrowserError('missing_user');
    }
    if (!token) throw new BookResultBrowserError('token_unavailable');

    let response: Response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new BookResultBrowserError('network_failure');
    }
    const body = await responseBody(response, maxBytes);
    if (!response.ok) throw classifiedError(response, body);
    return body;
  };

  return Object.freeze({
    async readGroup(address) {
      if (!SAFE_ID.test(address.bookId)
        || !SAFE_ID.test(address.studentId)
        || !GROUP_KEY.test(address.groupKey)
        || (address.homeworkId !== undefined && !SAFE_ID.test(address.homeworkId))) {
        throw new BookResultBrowserError('invalid_route');
      }
      const scope = address.homeworkId === undefined
        ? ''
        : `/homework/${encodeURIComponent(address.homeworkId)}`;
      const body = await read(
        `/v1/book-evaluation/results/${encodeURIComponent(address.bookId)}`
          + `/${encodeURIComponent(address.studentId)}${scope}`
          + `/groups/${encodeURIComponent(address.groupKey)}`,
        MAX_GROUP_RESPONSE_BYTES,
      );
      const envelope = asRecord(body);
      if (!envelope || !exactKeys(envelope, ['group'])
        || !hasSafeGroupShape(envelope.group, address)) {
        throw new BookResultBrowserError('invalid_response', 502);
      }
      return envelope.group;
    },

    async readDetail(address, resultId) {
      if (!SAFE_ID.test(address.bookId)
        || !SAFE_ID.test(address.studentId)
        || !GROUP_KEY.test(address.groupKey)
        || (address.homeworkId !== undefined && !SAFE_ID.test(address.homeworkId))
        || !SAFE_ID.test(resultId)) {
        throw new BookResultBrowserError('invalid_route');
      }
      const scope = address.homeworkId === undefined
        ? ''
        : `/homework/${encodeURIComponent(address.homeworkId)}`;
      const body = await read(
        `/v1/book-evaluation/results/${encodeURIComponent(address.bookId)}`
          + `/${encodeURIComponent(address.studentId)}${scope}`
          + `/details/${encodeURIComponent(resultId)}`,
        MAX_DETAIL_RESPONSE_BYTES,
      );
      const envelope = asRecord(body);
      if (!envelope || !exactKeys(envelope, ['detail'])
        || !hasSafeDetailShape(envelope.detail, address, resultId)) {
        throw new BookResultBrowserError('invalid_response', 502);
      }
      return envelope.detail;
    },
  });
};
