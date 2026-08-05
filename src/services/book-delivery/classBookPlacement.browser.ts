import type {
  ClassBookDeliveryBinding,
  ClassBookDeliveryProjection,
  ClassBookPlacement,
} from './classBookPlacement.types';

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

export const createClassBookPlacementBrowserClient = (
  options: ClassBookPlacementBrowserClientOptions,
): ClassBookPlacementBrowserClient => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const request = async (path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<unknown> => {
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
    return dataOrThrow(await readResponse(response, maxResponseBytes), response);
  };

  return {
    createCopy: (body) => request('/v1/class-book-placement/copy', 'POST', body),
    place: (body) => request('/v1/class-book-placement/place', 'POST', body) as Promise<ClassBookPlacement>,
    sync: (body) => request('/v1/class-book-placement/sync', 'POST', body) as Promise<ClassBookPlacement>,
    setLock: (body) => request('/v1/class-book-placement/lock', 'POST', body),
    issueDelivery: (body) => request('/v1/class-book-placement/issue', 'POST', body) as Promise<ClassBookDeliveryBinding>,
    resolveDelivery: (body) => request('/v1/class-book-placement/resolve', 'POST', body) as Promise<ClassBookDeliveryProjection>,
    getCurrent: (query) => {
      const parameters = new URLSearchParams(query);
      return request(`/v1/class-book-placement/current?${parameters.toString()}`, 'GET') as Promise<ClassBookPlacement>;
    },
  };
};
