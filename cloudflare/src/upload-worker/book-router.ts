// @ts-ignore Existing Worker verifier is JavaScript without declarations.
import { createFirebaseVerifier } from './firebase-verification.js';
import { canonicalBookRouteManifest } from './book-routes/manifest.ts';
import type { CanonicalBookRouteDescriptor } from './book-routes/types.ts';
import {
  createBookRouteHandlerResolver,
  type BookRouteHandlersOptions,
  type BookRouteHandler,
  type BookRouteHandlerMap,
} from './book-route-handlers.ts';

export type BookRouteParams = Readonly<Record<string, string>>;

export type { CanonicalBookRouteDescriptor } from './book-routes/types.ts';

export interface BookRouterEnv {
  readonly [key: string]: unknown;
}

export interface FirebaseVerificationResult {
  readonly valid: boolean;
  readonly uid?: string;
}

export interface FirebaseVerifier {
  verifyAuthorizationHeader: (
    header: string | null,
    env: BookRouterEnv,
  ) => Promise<FirebaseVerificationResult> | FirebaseVerificationResult;
}

export interface RateLimiter {
  limit: (input: { key: string }) => Promise<{ success: boolean }> | { success: boolean };
}

export interface BookRouterOptions {
  readonly manifest?: readonly CanonicalBookRouteDescriptor[];
  readonly handlers?: BookRouteHandlerMap;
  readonly handlerResolver?: (
    descriptor: CanonicalBookRouteDescriptor,
  ) => BookRouteHandler | undefined;
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly routeHandlers?: BookRouteHandlersOptions;
}

export interface MatchedBookRoute {
  readonly descriptor: CanonicalBookRouteDescriptor;
  readonly params: BookRouteParams;
}

const APPROVED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
]);
const ALLOWED_HEADERS = new Set([
  'authorization',
  'content-type',
  'content-length',
  'idempotency-key',
  'range',
]);
const DEFAULT_GATE_ENV = 'BOOK_ROUTES_ENABLED';
const SAFE_PARAM = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const BOOK_PATH = /^\/(?:v1\/)?book(?:-|\/)/u;

const methodList = (descriptor: CanonicalBookRouteDescriptor): string[] => {
  return descriptor.methods.map((method) => method.toUpperCase());
};

const headerValue = (request: Request, name: string): string | null => request.headers.get(name);

const corsHeaders = (
  request: Request,
  methods: readonly string[] = [],
): Headers => {
  const headers = new Headers({
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'Cache-Control': 'no-store',
  });
  const origin = headerValue(request, 'Origin');
  if (origin && APPROVED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', [...methods].join(', '));
    headers.set('Access-Control-Allow-Headers', [
      'Authorization',
      'Content-Type',
      'Content-Length',
      'Idempotency-Key',
      'Range',
    ].join(', '));
  }
  return headers;
};

const jsonResponse = (
  request: Request,
  body: Record<string, unknown>,
  status: number,
  methods: readonly string[] = [],
): Response => {
  const headers = corsHeaders(request, methods);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
};

const isBookPath = (pathname: string): boolean => BOOK_PATH.test(pathname);

const hasQueryOrFragment = (request: Request): boolean => {
  const target = request.url;
  const query = target.indexOf('?');
  const fragment = target.indexOf('#');
  return query >= 0 || fragment >= 0;
};

const decodeParam = (value: string): string | null => {
  try {
    const decoded = decodeURIComponent(value);
    if (!SAFE_PARAM.test(decoded) || decoded === '.' || decoded === '..') return null;
    return decoded;
  } catch {
    return null;
  }
};

export const matchCanonicalBookRoute = (
  request: Request,
  manifest: readonly CanonicalBookRouteDescriptor[],
): MatchedBookRoute | null => {
  const url = new URL(request.url);
  if (!isBookPath(url.pathname) || hasQueryOrFragment(request)) return null;
  if (url.pathname.length < 2 || url.pathname.endsWith('/') || url.pathname.includes('//')) return null;

  const actual = url.pathname.slice(1).split('/');
  for (const descriptor of manifest) {
    const template = descriptor.pathTemplate;
    if (!template.startsWith('/') || template.endsWith('/') || template.includes('//')) continue;
    const expected = template.slice(1).split('/');
    if (expected.length !== actual.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < expected.length; index += 1) {
      const templateSegment = expected[index]!;
      const actualSegment = actual[index]!;
      if (templateSegment.startsWith(':')) {
        const name = templateSegment.slice(1);
        const decoded = decodeParam(actualSegment);
        if (!name || !decoded) {
          matched = false;
          break;
        }
        params[name] = decoded;
      } else if (templateSegment !== actualSegment) {
        matched = false;
        break;
      }
    }
    if (matched) return { descriptor, params };
  }
  return null;
};

const routeForPath = (
  request: Request,
  manifest: readonly CanonicalBookRouteDescriptor[],
): readonly CanonicalBookRouteDescriptor[] => {
  const url = new URL(request.url);
  if (!isBookPath(url.pathname) || hasQueryOrFragment(request)) return [];
  return manifest.filter((descriptor) => {
    const matched = matchCanonicalBookRoute(
      new Request(request.url, { method: 'GET' }),
      [descriptor],
    );
    return matched !== null;
  });
};

const preflight = (
  request: Request,
  manifest: readonly CanonicalBookRouteDescriptor[],
): Response | null => {
  const candidates = routeForPath(request, manifest);
  if (candidates.length === 0) return jsonResponse(request, { code: 'book_route_not_found' }, 404);
  const origin = headerValue(request, 'Origin');
  if (!origin || !APPROVED_ORIGINS.has(origin)) {
    return jsonResponse(request, { code: 'cors_origin_denied' }, 403);
  }
  const requestedMethod = headerValue(request, 'Access-Control-Request-Method')?.toUpperCase();
  if (!requestedMethod) return jsonResponse(request, { code: 'cors_method_required' }, 405);
  const descriptor = candidates.find((candidate) => methodList(candidate).includes(requestedMethod));
  if (!descriptor) return jsonResponse(request, { code: 'cors_method_denied' }, 405);
  const requestedHeaders = (headerValue(request, 'Access-Control-Request-Headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => !ALLOWED_HEADERS.has(header))) {
    return jsonResponse(request, { code: 'cors_header_denied' }, 403, methodList(descriptor));
  }
  return new Response(null, { status: 204, headers: corsHeaders(request, methodList(descriptor)) });
};

const failCors = (request: Request): Response | null => {
  const origin = headerValue(request, 'Origin');
  if (origin && !APPROVED_ORIGINS.has(origin)) {
    return jsonResponse(request, { code: 'cors_origin_denied' }, 403);
  }
  return null;
};

const rateClass = (descriptor: CanonicalBookRouteDescriptor): string => (
  descriptor.rateClass
);

const clientClass = (request: Request): string => {
  const address = headerValue(request, 'CF-Connecting-IP') ?? 'unknown';
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/u.exec(address);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  return address.includes(':') ? 'ipv6' : 'unknown';
};

const enforceRateLimit = async (
  request: Request,
  env: BookRouterEnv,
  uid: string,
  descriptor: CanonicalBookRouteDescriptor,
): Promise<void> => {
  const limiter = (env.BOOK_ROUTE_RATE_LIMITER ?? env.UPLOAD_RATE_LIMITER) as RateLimiter | undefined;
  if (!limiter || typeof limiter.limit !== 'function') throw new Error('book_rate_limit_unavailable');
  const outcome = await limiter.limit({
    key: `book-route:${rateClass(descriptor)}:${uid}:${clientClass(request)}`,
  });
  if (!outcome?.success) throw new Error('book_rate_limited');
};

const gateEnvFor = (descriptor: CanonicalBookRouteDescriptor): string => {
  return descriptor.gateEnv || DEFAULT_GATE_ENV;
};

const enforceGate = (env: BookRouterEnv, descriptor: CanonicalBookRouteDescriptor): void => {
  if (env[gateEnvFor(descriptor)] !== 'enabled') {
    throw new Error('book_route_disabled');
  }
};

interface IdentityDeclaration {
  readonly identityEnv?: string;
  readonly keyEnv?: string;
  readonly expectedIdentity?: string;
}

const identityDeclaration = (descriptor: CanonicalBookRouteDescriptor): IdentityDeclaration | null => {
  if (!descriptor.identityEnv && !descriptor.credentialEnv) return null;
  return {
    identityEnv: descriptor.identityEnv,
    keyEnv: descriptor.credentialEnv,
  };
};

const enforceServiceIdentity = (
  env: BookRouterEnv,
  descriptor: CanonicalBookRouteDescriptor,
): void => {
  const declaration = identityDeclaration(descriptor);
  if (!declaration) return;
  const expected = declaration.expectedIdentity
    ?? (declaration.identityEnv ? env[declaration.identityEnv] : undefined);
  const keyEnv = declaration.keyEnv;
  if (typeof expected !== 'string' || expected.length === 0
    || typeof keyEnv !== 'string' || keyEnv === 'GOOGLE_SA_KEY') {
    throw new Error('book_service_identity_unavailable');
  }
  const keyValue = env[keyEnv];
  const genericKey = env.GOOGLE_SA_KEY;
  if (typeof keyValue !== 'string' || keyValue.trim() === ''
    || (typeof genericKey === 'string' && keyValue === genericKey)) {
    throw new Error('book_service_identity_unavailable');
  }
  try {
    const key = JSON.parse(keyValue) as Record<string, unknown>;
    if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string'
      || key.client_email !== expected) {
      throw new Error('book_service_identity_mismatch');
    }
  } catch {
    throw new Error('book_service_identity_invalid');
  }
};

const bodyLimitFor = (descriptor: CanonicalBookRouteDescriptor): number | undefined => {
  const value = descriptor.requestBodyBytes;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const enforceBodyLimit = async (
  request: Request,
  descriptor: CanonicalBookRouteDescriptor,
): Promise<void> => {
  const limit = bodyLimitFor(descriptor);
  if (limit === undefined) return;
  const value = headerValue(request, 'Content-Length');
  if (value !== null && (!/^\d+$/u.test(value) || Number(value) > limit)) {
    throw new Error('book_request_body_too_large');
  }
  if (value !== null || request.body === null) return;
  const reader = request.clone().body?.getReader();
  if (!reader) return;
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
    total += chunk.value.byteLength;
    if (total > limit) {
      void reader.cancel().catch(() => undefined);
      throw new Error('book_request_body_too_large');
    }
  }
};

const authorized = async (
  request: Request,
  env: BookRouterEnv,
  verifier: FirebaseVerifier,
): Promise<string | null> => {
  try {
    const result = await verifier.verifyAuthorizationHeader(headerValue(request, 'Authorization'), env);
    return result.valid && typeof result.uid === 'string' && result.uid.length > 0 ? result.uid : null;
  } catch {
    return null;
  }
};

const withResponseHeaders = (
  response: Response,
  request: Request,
  descriptor: CanonicalBookRouteDescriptor,
): Response => {
  const headers = new Headers(response.headers);
  const contentLength = headers.get('content-length');
  if (contentLength !== null
    && (!/^\d+$/u.test(contentLength)
      || Number(contentLength) > descriptor.responseLimitBytes)) {
    return jsonResponse(request, { code: 'book_response_too_large' }, 502, methodList(descriptor));
  }
  const cors = corsHeaders(request, methodList(descriptor));
  cors.forEach((value, key) => headers.set(key, value));
  headers.set('Cache-Control', 'no-store');
  const body = response.body
    ? limitResponseStream(response.body, descriptor.responseLimitBytes)
    : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const limitResponseStream = (
  body: ReadableStream<Uint8Array>,
  limitBytes: number,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        controller.close();
        return;
      }
      total += chunk.value.byteLength;
      if (total > limitBytes) {
        void reader.cancel().catch(() => undefined);
        controller.error(new Error('book_response_too_large'));
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
};

const handleResult = async (
  value: unknown,
  request: Request,
  descriptor: CanonicalBookRouteDescriptor,
): Promise<Response> => {
  if (value instanceof Response) return withResponseHeaders(value, request, descriptor);
  const result = value && typeof value === 'object' && 'body' in value
    ? value as { body: unknown; init?: ResponseInit }
    : { body: value, init: undefined };
  const init = result.init ?? {};
  const serialized = JSON.stringify(result.body);
  if (new TextEncoder().encode(serialized).byteLength > descriptor.responseLimitBytes) {
    return jsonResponse(request, { code: 'book_response_too_large' }, 502, methodList(descriptor));
  }
  const headers = new Headers(init.headers);
  const cors = corsHeaders(request, methodList(descriptor));
  cors.forEach((headerValue, key) => headers.set(key, headerValue));
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(serialized, { ...init, headers });
};

export type BookRouter = ((request: Request, env: BookRouterEnv) => Promise<Response | null>) & {
  fetch: (request: Request, env: BookRouterEnv) => Promise<Response | null>;
  route: (request: Request, env: BookRouterEnv) => Promise<Response | null>;
};

export const createBookRouter = (options: BookRouterOptions = {}): BookRouter => {
  const manifest = options.manifest ?? canonicalBookRouteManifest;
  const defaultHandlerResolver = createBookRouteHandlerResolver(options.routeHandlers);
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier() as FirebaseVerifier;
  const resolveHandler = options.handlerResolver
    ?? (options.handlers !== undefined
      ? (descriptor: CanonicalBookRouteDescriptor) => options.handlers?.[descriptor.handler]
      : defaultHandlerResolver);

  const route = async (request: Request, env: BookRouterEnv): Promise<Response | null> => {
    const url = new URL(request.url);
    if (!isBookPath(url.pathname)) return null;
    const corsFailure = failCors(request);
    if (corsFailure) return corsFailure;
    if (request.method === 'OPTIONS') return preflight(request, manifest);

    const candidates = routeForPath(request, manifest);
    if (candidates.length === 0) {
      return jsonResponse(request, { code: 'book_route_not_found' }, 404);
    }
    const descriptor = candidates.find((candidate) =>
      methodList(candidate).includes(request.method.toUpperCase()));
    if (!descriptor) {
      const allowed = [...new Set(candidates.flatMap(methodList))];
      return jsonResponse(request, { code: 'method_not_allowed' }, 405, allowed);
    }
    const matched = matchCanonicalBookRoute(request, [descriptor]);
    if (!matched) return jsonResponse(request, { code: 'book_route_not_found' }, 404);
    const { params } = matched;
    const methods = methodList(descriptor);

    const uid = await authorized(request, env, verifier);
    if (!uid) return jsonResponse(request, { code: 'unauthorized' }, 401, methods);
    try {
      await enforceRateLimit(request, env, uid, descriptor);
      enforceGate(env, descriptor);
      enforceServiceIdentity(env, descriptor);
      await enforceBodyLimit(request, descriptor);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'book_limited' || message === 'book_rate_limited') {
        return jsonResponse(request, { code: 'rate_limited' }, 429, methods);
      }
      if (message === 'book_route_disabled') {
        return jsonResponse(request, { code: 'book_route_disabled' }, 503, methods);
      }
      if (message === 'book_request_body_too_large') {
        return jsonResponse(request, { code: 'body_too_large' }, 413, methods);
      }
      return jsonResponse(request, { code: 'book_route_unavailable' }, 503, methods);
    }

    const handler = resolveHandler(descriptor);
    if (!handler) return jsonResponse(request, { code: 'book_route_unavailable' }, 501, methods);
    try {
      return await handleResult(await handler({ request, env, uid, params, descriptor }), request, descriptor);
    } catch {
      return jsonResponse(request, { code: 'book_route_failed' }, 500, methods);
    }
  };

  const callable = route as BookRouter;
  callable.fetch = route;
  callable.route = route;
  return callable;
};

export const routeBookRequest = async (
  request: Request,
  env: BookRouterEnv,
  options: BookRouterOptions = {},
): Promise<Response | null> => createBookRouter(options)(request, env);

export default createBookRouter;
