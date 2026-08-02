import { getAuth } from 'firebase/auth';
import { resolveBookDeliveryWorkerOrigin } from '../book-delivery/bookDelivery.browser';
import { isBookIntegrityReport } from './bookIntegrityReport.service';
import type { BookIntegrityReport } from './bookIntegrityReport.types';

export interface BookIntegrityReportBrowserLocator {
  readonly bookId: string;
  readonly terminalId: string;
  readonly attemptId?: string;
}

export interface BookIntegrityReportBrowserClient {
  readTeacherReport(locator: BookIntegrityReportBrowserLocator): Promise<BookIntegrityReport>;
}

export class BookIntegrityReportBrowserError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found'
      | 'route_disabled' | 'invalid_response' | 'server_unavailable',
    readonly status = 400,
  ) {
    super(code);
    this.name = 'BookIntegrityReportBrowserError';
  }
}

interface BookIntegrityReportBrowserEnv {
  readonly VITE_BOOK_INTEGRITY_REPORT_WORKER_URL?: string;
  readonly VITE_BOOK_RUNTIME_WORKER_URL?: string;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};

const browserId = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,219}$/u;
const BOOK_INTEGRITY_REPORT_MAX_RESPONSE_BYTES = 32 * 1024;

const browserOrigin = (
  options: { readonly baseUrl?: string; readonly env?: BookIntegrityReportBrowserEnv },
): string => {
  const env = options.env ?? ((import.meta.env ?? {}) as BookIntegrityReportBrowserEnv);
  const explicit = options.baseUrl?.trim()
    || env.VITE_BOOK_INTEGRITY_REPORT_WORKER_URL?.trim()
    || env.VITE_BOOK_RUNTIME_WORKER_URL?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:')
        || (url.protocol === 'http:' && url.hostname !== 'localhost')
        || url.username || url.password || !/^\/+$/u.test(url.pathname)
        || url.search || url.hash) throw new Error('invalid');
      return url.origin;
    } catch {
      throw new BookIntegrityReportBrowserError('server_unavailable', 503);
    }
  }
  try {
    return resolveBookDeliveryWorkerOrigin(env);
  } catch {
    throw new BookIntegrityReportBrowserError('server_unavailable', 503);
  }
};

export const createBookIntegrityReportBrowserClient = (options: {
  readonly baseUrl?: string;
  readonly env?: BookIntegrityReportBrowserEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
} = {}): BookIntegrityReportBrowserClient => {
  const origin = browserOrigin(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const getIdToken = options.getIdToken ?? (async (forceRefresh = false) => (
    getAuth().currentUser?.getIdToken(forceRefresh)
  ));
  const readTeacherReport = async (locator: BookIntegrityReportBrowserLocator): Promise<BookIntegrityReport> => {
    if (!browserId.test(locator.bookId) || !browserId.test(locator.terminalId)
      || (locator.attemptId !== undefined && !browserId.test(locator.attemptId))) {
      throw new BookIntegrityReportBrowserError('invalid_request', 400);
    }
    const token = await getIdToken(false);
    if (!token) throw new BookIntegrityReportBrowserError('unauthorized', 401);
    let response: Response;
    try {
      response = await fetchImpl(`${origin}/book-integrity/books/${encodeURIComponent(locator.bookId)}`
        + `/terminals/${encodeURIComponent(locator.terminalId)}/report`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      throw new BookIntegrityReportBrowserError('server_unavailable', 503);
    }
    const declaredLengthText = response.headers.get('content-length');
    if (declaredLengthText !== null
      && (!/^\d+$/u.test(declaredLengthText)
        || Number(declaredLengthText) > BOOK_INTEGRITY_REPORT_MAX_RESPONSE_BYTES)) {
      throw new BookIntegrityReportBrowserError('invalid_response', 502);
    }
    const bodyText = await response.text();
    if (new TextEncoder().encode(bodyText).byteLength > BOOK_INTEGRITY_REPORT_MAX_RESPONSE_BYTES) {
      throw new BookIntegrityReportBrowserError('invalid_response', 502);
    }
    let body: unknown;
    try { body = bodyText === '' ? {} : JSON.parse(bodyText); }
    catch { throw new BookIntegrityReportBrowserError('invalid_response', 502); }
    if (!response.ok) {
      if (response.status === 401) throw new BookIntegrityReportBrowserError('unauthorized', 401);
      if (response.status === 403) throw new BookIntegrityReportBrowserError('forbidden', 403);
      if (response.status === 404) throw new BookIntegrityReportBrowserError('not_found', 404);
      if (response.status === 503) throw new BookIntegrityReportBrowserError('route_disabled', 503);
      throw new BookIntegrityReportBrowserError('server_unavailable', 503);
    }
    const report = record(body)?.report;
    if (!isBookIntegrityReport(report)
      || report.terminal.bookId !== locator.bookId
      || report.terminal.terminalId !== locator.terminalId
      || (locator.attemptId !== undefined && report.terminal.attemptId !== locator.attemptId)) {
      throw new BookIntegrityReportBrowserError('invalid_response', 502);
    }
    return freeze(clone(report));
  };
  return { readTeacherReport };
};
