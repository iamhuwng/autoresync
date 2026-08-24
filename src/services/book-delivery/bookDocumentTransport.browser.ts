import { getAuth } from 'firebase/auth';

const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const OPAQUE_DOCUMENT_PATH = /^\/v1\/book-delivery\/document\/[A-Za-z0-9._~-]{1,160}$/u;
const HISTORICAL_DOCUMENT_PATH = /^\/v1\/book-delivery\/historical-document\/[A-Za-z0-9](?:[A-Za-z0-9._-]|%3A|%40){0,255}\/[A-Za-z0-9](?:[A-Za-z0-9._-]|%3A|%40){0,255}\/[A-Za-z0-9](?:[A-Za-z0-9._-]|%3A|%40){0,255}\/[A-Za-z0-9._~-]{1,160}$/iu;
const TEACHER_ASSEMBLY_DOCUMENT_PATH = /^\/v1\/book-delivery\/teacher-assembly\/[A-Za-z0-9._~-]{1,160}\/[A-Za-z0-9._~-]{1,160}\/[A-Za-z0-9._~-]{1,160}\/[1-9]\d*\/[A-Za-z0-9._~-]{1,160}\/[A-Za-z0-9._~-]{1,160}\/\d+\/\d+$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const PDF_CONTENT_TYPE = 'application/pdf';

export type BookDocumentTransportErrorCode =
  | 'aborted'
  | 'forbidden'
  | 'invalid_metadata'
  | 'invalid_route'
  | 'missing_user'
  | 'network_failure'
  | 'not_found'
  | 'range_not_satisfiable'
  | 'rate_limited'
  | 'response_binding_mismatch'
  | 'route_expired'
  | 'server_unavailable'
  | 'stale_request'
  | 'token_unavailable'
  | 'truncated_body'
  | 'unauthorized';

export class BookDocumentTransportError extends Error {
  constructor(
    public readonly code: BookDocumentTransportErrorCode,
    public readonly status = 0,
    options?: ErrorOptions,
  ) {
    super(`book_document_transport_${code}`, options);
    this.name = 'BookDocumentTransportError';
  }
}

export interface BookDocumentRoute {
  readonly url: string;
  readonly sourceVersionId: string;
  readonly expectedByteLength?: number;
  readonly expectedEtag?: string;
  readonly physicalPageNumber?: number;
}

export type BookDocumentByteRange =
  | { readonly kind: 'closed'; readonly start: number; readonly end: number }
  | { readonly kind: 'open'; readonly start: number }
  | { readonly kind: 'suffix'; readonly suffixLength: number };

export interface BookDocumentTransportMetadata {
  readonly acceptRanges: 'bytes';
  readonly contentLength: number;
  readonly contentRange?: {
    readonly start: number;
    readonly end: number;
    readonly total: number;
  };
  readonly contentType: 'application/pdf';
  readonly etag: string;
  readonly sourceVersionId: string;
  readonly status: 200 | 206;
}

export interface BookDocumentTransportResponse extends BookDocumentTransportMetadata {
  readonly body: ReadableStream<Uint8Array>;
  readonly release: () => void;
}

export interface BookDocumentPdfJsSource {
  readonly url: string;
  readonly httpHeaders: Readonly<Record<string, string>>;
}

export interface BookDocumentTransportOptions {
  readonly route: BookDocumentRoute;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  /** Test/host injection. Production also trusts configured Book Delivery origin and same origin. */
  readonly trustedWorkerOrigins?: readonly string[];
  readonly timeoutMs?: number;
  readonly onRouteExpired?: (reason: 'not-found' | 'stale-binding') => void;
}

export interface BookDocumentTransport {
  head(range?: BookDocumentByteRange, options?: { readonly signal?: AbortSignal }): Promise<BookDocumentTransportMetadata>;
  get(range?: BookDocumentByteRange, options?: { readonly signal?: AbortSignal }): Promise<BookDocumentTransportResponse>;
  /**
   * Returns a canonical Worker URL and short-lived browser authorization for
   * PDF.js' native network stream/range loader. Optional for test and legacy
   * transports that still use the explicit range bridge.
   */
  readonly getPdfJsSource?: (options?: {
    readonly signal?: AbortSignal;
    readonly forceRefresh?: boolean;
  }) => Promise<BookDocumentPdfJsSource>;
  switchRoute(route: BookDocumentRoute): void;
  destroy(): void;
  readonly activeRequestCount: number;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const defaultGetIdToken = async (forceRefresh = false): Promise<string | null | undefined> =>
  getAuth().currentUser?.getIdToken(forceRefresh);

const trustedTeacherAssemblyOrigins = (explicit: readonly string[] | undefined): ReadonlySet<string> => {
  const configured = [
    import.meta.env.VITE_BOOK_DELIVERY_WORKER_URL,
    import.meta.env.VITE_R2_UPLOAD_WORKER_URL,
    typeof window === 'undefined' ? undefined : window.location.origin,
    ...(explicit ?? []),
  ];
  const origins = new Set<string>();
  for (const value of configured) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    try {
      const url = new URL(value.trim());
      if (
        (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))
        && url.username === ''
        && url.password === ''
        && /^\/+$/u.test(url.pathname)
        && url.search === ''
        && url.hash === ''
      ) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid configured origins are ignored so the route fails closed below.
    }
  }
  return origins;
};

const normalizeRoute = (
  route: BookDocumentRoute,
  trustedOrigins: ReadonlySet<string>,
): { readonly url: string; readonly route: BookDocumentRoute } => {
  let url: URL;
  try {
    url = new URL(route.url);
  } catch {
    throw new BookDocumentTransportError('invalid_route');
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:')
    || (url.protocol === 'http:' && url.hostname !== 'localhost')
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
    || (!OPAQUE_DOCUMENT_PATH.test(url.pathname)
      && !HISTORICAL_DOCUMENT_PATH.test(url.pathname)
      && !TEACHER_ASSEMBLY_DOCUMENT_PATH.test(url.pathname))
    || ((HISTORICAL_DOCUMENT_PATH.test(url.pathname)
      || TEACHER_ASSEMBLY_DOCUMENT_PATH.test(url.pathname))
      && !trustedOrigins.has(url.origin))
    || !SAFE_ID.test(route.sourceVersionId)
    || (route.expectedByteLength !== undefined && (
      !Number.isSafeInteger(route.expectedByteLength)
      || route.expectedByteLength < 1
      || route.expectedByteLength > MAX_DOCUMENT_BYTES
    ))
    || (route.expectedEtag !== undefined && !/^"[A-Fa-f0-9]{64}"$/u.test(route.expectedEtag))
    || (route.physicalPageNumber !== undefined && (
      !Number.isSafeInteger(route.physicalPageNumber)
      || route.physicalPageNumber < 1
    ))
  ) {
    throw new BookDocumentTransportError('invalid_route');
  }
  return { url: url.href, route: Object.freeze({ ...route, url: url.href }) };
};

const rangeHeader = (range: BookDocumentByteRange | undefined): string | undefined => {
  if (range === undefined) return undefined;
  if (range.kind === 'closed') {
    if (
      !Number.isSafeInteger(range.start)
      || !Number.isSafeInteger(range.end)
      || range.start < 0
      || range.end < range.start
      || range.end >= MAX_DOCUMENT_BYTES
    ) {
      throw new BookDocumentTransportError('range_not_satisfiable', 416);
    }
    return `bytes=${range.start}-${range.end}`;
  }
  if (range.kind === 'open') {
    if (!Number.isSafeInteger(range.start) || range.start < 0 || range.start >= MAX_DOCUMENT_BYTES) {
      throw new BookDocumentTransportError('range_not_satisfiable', 416);
    }
    return `bytes=${range.start}-`;
  }
  if (!Number.isSafeInteger(range.suffixLength) || range.suffixLength < 1 || range.suffixLength > MAX_DOCUMENT_BYTES) {
    throw new BookDocumentTransportError('range_not_satisfiable', 416);
  }
  return `bytes=-${range.suffixLength}`;
};

const parseContentLength = (response: Response, route: BookDocumentRoute): number => {
  const value = response.headers.get('content-length');
  const length = value === null ? NaN : Number(value);
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_DOCUMENT_BYTES) {
    throw new BookDocumentTransportError('invalid_metadata', 502);
  }
  if (route.expectedByteLength !== undefined && response.status === 200 && length !== route.expectedByteLength) {
    throw new BookDocumentTransportError('response_binding_mismatch', 502);
  }
  return length;
};

const parseContentRange = (response: Response, contentLength: number, route: BookDocumentRoute) => {
  const value = response.headers.get('content-range');
  if (response.status !== 206) {
    if (value !== null) throw new BookDocumentTransportError('invalid_metadata', 502);
    return undefined;
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value ?? '');
  if (!match) throw new BookDocumentTransportError('invalid_metadata', 502);
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || !Number.isSafeInteger(total)
    || start < 0
    || end < start
    || end >= total
    || total > MAX_DOCUMENT_BYTES
    || end - start + 1 !== contentLength
    || (route.expectedByteLength !== undefined && total !== route.expectedByteLength)
  ) {
    throw new BookDocumentTransportError('invalid_metadata', 502);
  }
  return Object.freeze({ start, end, total });
};

const metadata = (
  response: Response,
  route: BookDocumentRoute,
  requestedRange: BookDocumentByteRange | undefined,
): BookDocumentTransportMetadata => {
  if (response.redirected || (response.url !== '' && response.url !== route.url)) {
    throw new BookDocumentTransportError('response_binding_mismatch', 502);
  }
  if (
    (response.status !== 200 && response.status !== 206)
    || (requestedRange === undefined && response.status !== 200)
    || (requestedRange !== undefined && response.status !== 206)
  ) {
    throw new BookDocumentTransportError('invalid_metadata', 502);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const acceptRanges = response.headers.get('accept-ranges')?.trim().toLowerCase();
  const etag = response.headers.get('etag')?.trim() ?? '';
  const contentLength = parseContentLength(response, route);
  if (
    contentType !== PDF_CONTENT_TYPE
    || acceptRanges !== 'bytes'
    || !/^"[A-Fa-f0-9]{64}"$/u.test(etag)
    || (route.expectedEtag !== undefined && etag !== route.expectedEtag)
  ) {
    throw new BookDocumentTransportError('invalid_metadata', 502);
  }
  return Object.freeze({
    acceptRanges: 'bytes' as const,
    contentLength,
    contentRange: parseContentRange(response, contentLength, route),
    contentType: PDF_CONTENT_TYPE,
    etag,
    sourceVersionId: route.sourceVersionId,
    status: response.status as 200 | 206,
  });
};

const readServerCode = async (response: Response): Promise<string | undefined> => {
  try {
    const parsed = await response.clone().json();
    return record(parsed) && typeof parsed.code === 'string' ? parsed.code : undefined;
  } catch {
    return undefined;
  }
};

const classifyFailure = async (
  response: Response,
  onRouteExpired: BookDocumentTransportOptions['onRouteExpired'],
): Promise<never> => {
  if (response.status === 404) {
    onRouteExpired?.('not-found');
    throw new BookDocumentTransportError('route_expired', 404);
  }
  if (response.status === 409) {
    onRouteExpired?.('stale-binding');
    throw new BookDocumentTransportError('route_expired', 409);
  }
  if (response.status === 401) throw new BookDocumentTransportError('unauthorized', 401);
  if (response.status === 403) throw new BookDocumentTransportError('forbidden', 403);
  if (response.status === 416) throw new BookDocumentTransportError('range_not_satisfiable', 416);
  if (response.status === 429) throw new BookDocumentTransportError('rate_limited', 429);
  if (response.status === 500 || response.status === 503 || response.status === 504) {
    throw new BookDocumentTransportError('server_unavailable', response.status);
  }
  const code = await readServerCode(response);
  if (code === 'not_found' || code === 'stale-binding') {
    onRouteExpired?.(code === 'not_found' ? 'not-found' : 'stale-binding');
    throw new BookDocumentTransportError('route_expired', response.status);
  }
  throw new BookDocumentTransportError('server_unavailable', response.status);
};

const token = async (
  getIdToken: (forceRefresh?: boolean) => Promise<string | null | undefined>,
  forceRefresh: boolean,
): Promise<string> => {
  try {
    const value = (await getIdToken(forceRefresh))?.trim() ?? '';
    if (!value) {
      throw new BookDocumentTransportError(forceRefresh ? 'token_unavailable' : 'missing_user', 401);
    }
    return value;
  } catch (error) {
    if (error instanceof BookDocumentTransportError) throw error;
    throw new BookDocumentTransportError('token_unavailable', 401, { cause: error });
  }
};

export const createBookDocumentTransport = (
  options: BookDocumentTransportOptions,
): BookDocumentTransport => {
  const trustedOrigins = trustedTeacherAssemblyOrigins(options.trustedWorkerOrigins);
  let current = normalizeRoute(options.route, trustedOrigins).route;
  let generation = 0;
  let destroyed = false;
  const active = new Set<AbortController>();
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const getIdToken = options.getIdToken ?? defaultGetIdToken;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const release = (controller: AbortController, timeout: ReturnType<typeof setTimeout> | undefined): void => {
    if (timeout) clearTimeout(timeout);
    active.delete(controller);
  };

  const controllerFor = (signal: AbortSignal | undefined): {
    readonly controller: AbortController;
    readonly timeout: ReturnType<typeof setTimeout> | undefined;
  } => {
    const controller = new AbortController();
    active.add(controller);
    if (signal?.aborted) controller.abort();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    controller.signal.addEventListener('abort', () => signal?.removeEventListener('abort', abort), { once: true });
    const timeout = timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
    return { controller, timeout };
  };

  const assertCurrent = (capturedGeneration: number): void => {
    if (destroyed || capturedGeneration !== generation) {
      throw new BookDocumentTransportError('stale_request', 0);
    }
  };

  const request = async (
    method: 'GET' | 'HEAD',
    range: BookDocumentByteRange | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Response> => {
    const capturedGeneration = generation;
    const capturedRoute = current;
    const headerRange = rangeHeader(range);
    const { controller, timeout } = controllerFor(signal);
    const run = async (forceRefresh: boolean): Promise<Response> => {
      const idToken = await token(getIdToken, forceRefresh);
      assertCurrent(capturedGeneration);
      const headers: Record<string, string> = { Authorization: `Bearer ${idToken}` };
      if (headerRange !== undefined) headers.Range = headerRange;
      return fetchImpl(capturedRoute.url, {
        method,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers,
        signal: controller.signal,
      });
    };
    try {
      let response = await run(false);
      if (response.status === 401) {
        response.body?.cancel().catch(() => undefined);
        response = await run(true);
      }
      assertCurrent(capturedGeneration);
      if (!response.ok) await classifyFailure(response, options.onRouteExpired);
      return response;
    } catch (error) {
      if (error instanceof BookDocumentTransportError) throw error;
      if (controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
        throw new BookDocumentTransportError('aborted', 0, { cause: error });
      }
      throw new BookDocumentTransportError('network_failure', 0, { cause: error });
    } finally {
      if (method === 'HEAD') {
        release(controller, timeout);
      }
    }
  };

  const wrapBody = (
    response: Response,
    controller: AbortController,
    timeout: ReturnType<typeof setTimeout> | undefined,
    expectedByteLength: number,
  ): ReadableStream<Uint8Array> => {
    const body = response.body;
    if (!body) {
      release(controller, timeout);
      throw new BookDocumentTransportError('invalid_metadata', 502);
    }
    const reader = body.getReader();
    let receivedByteLength = 0;
    return new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            if (receivedByteLength !== expectedByteLength) {
              throw new BookDocumentTransportError('truncated_body', 502);
            }
            release(controller, timeout);
            streamController.close();
            return;
          }
          if (!ArrayBuffer.isView(chunk.value) || chunk.value.byteLength < 1) {
            throw new BookDocumentTransportError('invalid_metadata', 502);
          }
          receivedByteLength += chunk.value.byteLength;
          if (receivedByteLength > expectedByteLength) {
            throw new BookDocumentTransportError('truncated_body', 502);
          }
          streamController.enqueue(chunk.value);
        } catch (error) {
          release(controller, timeout);
          streamController.error(error);
        }
      },
      async cancel(reason) {
        controller.abort();
        await reader.cancel(reason).catch(() => undefined);
        release(controller, timeout);
      },
    });
  };

  const head = async (
    range?: BookDocumentByteRange,
    requestOptions?: { readonly signal?: AbortSignal },
  ) => {
    const response = await request('HEAD', range, requestOptions?.signal);
    return metadata(response, current, range);
  };

  const get = async (
    range?: BookDocumentByteRange,
    requestOptions?: { readonly signal?: AbortSignal },
  ) => {
    const capturedGeneration = generation;
    const capturedRoute = current;
    const headerRange = rangeHeader(range);
    const { controller, timeout } = controllerFor(requestOptions?.signal);
    const run = async (forceRefresh: boolean): Promise<Response> => {
      const idToken = await token(getIdToken, forceRefresh);
      assertCurrent(capturedGeneration);
      const headers: Record<string, string> = { Authorization: `Bearer ${idToken}` };
      if (headerRange !== undefined) headers.Range = headerRange;
      return fetchImpl(capturedRoute.url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers,
        signal: controller.signal,
      });
    };
    try {
      let response = await run(false);
      if (response.status === 401) {
        response.body?.cancel().catch(() => undefined);
        response = await run(true);
      }
      assertCurrent(capturedGeneration);
      if (!response.ok) await classifyFailure(response, options.onRouteExpired);
      const parsed = metadata(response, capturedRoute, range);
      return Object.freeze({
        ...parsed,
        body: wrapBody(response, controller, timeout, parsed.contentLength),
        release: () => {
          controller.abort();
          release(controller, timeout);
        },
      });
    } catch (error) {
      release(controller, timeout);
      if (error instanceof BookDocumentTransportError) throw error;
      if (controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
        throw new BookDocumentTransportError('aborted', 0, { cause: error });
      }
      throw new BookDocumentTransportError('network_failure', 0, { cause: error });
    }
  };

  const getPdfJsSource = async (
    requestOptions?: {
      readonly signal?: AbortSignal;
      readonly forceRefresh?: boolean;
    },
  ): Promise<BookDocumentPdfJsSource> => {
    const capturedGeneration = generation;
    const capturedRoute = current;
    if (requestOptions?.signal?.aborted) {
      throw new BookDocumentTransportError('aborted');
    }
    try {
      const idToken = await token(getIdToken, requestOptions?.forceRefresh === true);
      if (requestOptions?.signal?.aborted) {
        throw new BookDocumentTransportError('aborted');
      }
      assertCurrent(capturedGeneration);
      return Object.freeze({
        url: capturedRoute.url,
        httpHeaders: Object.freeze({ Authorization: `Bearer ${idToken}` }),
      });
    } catch (error) {
      if (error instanceof BookDocumentTransportError) throw error;
      throw new BookDocumentTransportError('token_unavailable', 401, { cause: error });
    }
  };

  return Object.freeze({
    head,
    get,
    getPdfJsSource,
    switchRoute(route) {
      current = normalizeRoute(route, trustedOrigins).route;
      generation += 1;
      for (const controller of active) controller.abort();
      active.clear();
    },
    destroy() {
      destroyed = true;
      generation += 1;
      for (const controller of active) controller.abort();
      active.clear();
    },
    get activeRequestCount() {
      return active.size;
    },
  });
};
