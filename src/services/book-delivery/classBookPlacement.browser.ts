import type {
  ClassBookDeliveryBinding,
  ClassBookDeliveryProjection,
  ClassBookPlacement,
} from './classBookPlacement.types';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';

export interface ClassBookPlacementBrowserClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
  readonly maxResponseBytes?: number;
}

export interface ClassBookPlacementBrowserClient {
  readonly createCopy: (body: Record<string, unknown>) => Promise<unknown>;
  readonly place: (body: Record<string, unknown>) => Promise<ClassBookPlacement>;
  readonly sync: (body: Record<string, unknown>) => Promise<ClassBookPlacement>;
  readonly setLock: (body: Record<string, unknown>) => Promise<unknown>;
  readonly issueDelivery: (body: Record<string, unknown>) => Promise<ClassBookDeliveryBinding>;
  readonly resolveDelivery: (body: Record<string, unknown>) => Promise<ClassBookDeliveryProjection>;
  readonly prepareDelivery: (body: {
    readonly operationId: string;
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
  }) => Promise<BookRuntimeDeliveryProjection>;
  readonly resolveCurrent: (input: {
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly bindingId: string;
  }) => Promise<BookRuntimeDeliveryProjection>;
  readonly getCurrent: (query: Record<string, string>) => Promise<ClassBookPlacement>;
}

const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;

const readResponse = async (response: Response, maxResponseBytes: number): Promise<unknown> => {
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) throw new Error('class_book_response_too_large');
  try { return JSON.parse(raw); } catch { throw new Error('class_book_response_json_invalid'); }
};

const dataOrThrow = (body: unknown, response: Response): unknown => {
  if (!response.ok) {
    const candidate = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).code
      : null;
    const code = typeof candidate === 'string' ? candidate : 'class_book_request_failed';
    throw new Error(code);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Object.prototype.hasOwnProperty.call(body, 'data')) throw new Error('class_book_response_invalid');
  return (body as { data: unknown }).data;
};

const canonicalOrThrow = (body: unknown, response: Response): unknown => {
  if (!response.ok) {
    const candidate = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).code
      : null;
    throw new Error(typeof candidate === 'string' ? candidate : 'class_book_request_failed');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('class_book_response_invalid');
  }
  return body;
};

export const createClassBookPlacementBrowserClient = (
  options: ClassBookPlacementBrowserClientOptions,
): ClassBookPlacementBrowserClient => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const request = async (
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    responseShape: 'legacy-envelope' | 'canonical' = 'legacy-envelope',
  ): Promise<unknown> => {
    const token = await options.getIdToken();
    if (!token) throw new Error('class_book_authentication_required');
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: 'omit',
      redirect: 'error',
    });
    const responseBody = await readResponse(response, maxResponseBytes);
    return responseShape === 'canonical'
      ? canonicalOrThrow(responseBody, response)
      : dataOrThrow(responseBody, response);
  };

  return {
    createCopy: (body) => request('/v1/class-book-placement/copy', 'POST', body),
    place: (body) => request('/v1/class-book-placement/place', 'POST', body) as Promise<ClassBookPlacement>,
    sync: (body) => request('/v1/class-book-placement/sync', 'POST', body) as Promise<ClassBookPlacement>,
    setLock: (body) => request('/v1/class-book-placement/lock', 'POST', body),
    issueDelivery: (body) => request('/v1/class-book-placement/issue', 'POST', body) as Promise<ClassBookDeliveryBinding>,
    resolveDelivery: (body) => request('/v1/class-book-placement/resolve', 'POST', body) as Promise<ClassBookDeliveryProjection>,
    prepareDelivery: (body) => request(
      '/v1/book-class-placement/prepare', 'POST', body, 'canonical',
    ) as Promise<BookRuntimeDeliveryProjection>,
    resolveCurrent: (input) => {
      const path = [
        input.classId,
        input.copyId,
        input.classPlacementId,
        input.classCourseMaterialId,
        input.bindingId,
      ].map(encodeURIComponent).join('/');
      return request(
        `/v1/book-class-placement/current/${path}`, 'GET', undefined, 'canonical',
      ) as Promise<BookRuntimeDeliveryProjection>;
    },
    getCurrent: (query) => {
      const parameters = new URLSearchParams(query);
      return request(`/v1/class-book-placement/current?${parameters.toString()}`, 'GET') as Promise<ClassBookPlacement>;
    },
  };
};
