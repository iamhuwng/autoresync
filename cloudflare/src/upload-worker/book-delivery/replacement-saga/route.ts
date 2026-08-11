import type { ReplacementSagaDependencies, ReplacementSagaExecutionInput } from './contract.ts';
import { REPLACEMENT_PLAN_MAX_BODY_BYTES } from '../replacement-plans/contract.ts';
import { createReplacementSagaService } from './service.ts';

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const exactBody = (value: unknown): value is Omit<ReplacementSagaExecutionInput, 'ownerId' | 'bookId'> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value as Record<string, unknown>).length === 4
  && ['planId', 'reviewId', 'confirmationToken', 'idempotencyKey'].every((key) => Object.hasOwn(value, key))
  && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string')
);

export interface ReplacementSagaRouteInput {
  readonly request: Request;
  readonly uid?: string;
  readonly dependencies: ReplacementSagaDependencies;
}

export const handleReplacementSagaRoute = async (input: ReplacementSagaRouteInput): Promise<Response> => {
  if (!input.uid) return json({ code: 'unauthorized' }, 401);
  if (input.dependencies.enabled !== true) return json({ code: 'replacement_saga_route_disabled' }, 503);
  if (input.request.method !== 'POST') return json({ code: 'replacement_saga_route_not_found' }, 404);
  const url = new URL(input.request.url);
  if (url.search || url.hash) return json({ code: 'replacement_saga_route_not_found' }, 404);
  const match = url.pathname.match(/^\/v1\/book-replacement-sagas\/books\/([^/]+)\/commands$/u);
  if (!match) return json({ code: 'replacement_saga_route_not_found' }, 404);
  if (/%2f|%5c/iu.test(match[1]!) || match[1]!.includes('\\')) return json({ code: 'replacement_saga_route_not_found' }, 404);
  let bookId: string;
  try { bookId = decodeURIComponent(match[1]!); } catch { return json({ code: 'replacement_saga_route_not_found' }, 404); }
  if (bookId.includes('/') || bookId.includes('\\')) return json({ code: 'replacement_saga_route_not_found' }, 404);
  const contentLength = input.request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > REPLACEMENT_PLAN_MAX_BODY_BYTES)) {
    return json({ code: 'replacement_saga_request_too_large' }, 413);
  }
  let body: unknown;
  try {
    const text = await input.request.text();
    if (new TextEncoder().encode(text).byteLength > REPLACEMENT_PLAN_MAX_BODY_BYTES) return json({ code: 'replacement_saga_request_too_large' }, 413);
    body = JSON.parse(text);
  } catch { return json({ code: 'replacement_saga_request_invalid' }, 400); }
  if (!exactBody(body)) return json({ code: 'replacement_saga_request_invalid' }, 400);
  const result = await createReplacementSagaService(input.dependencies).execute({
    ownerId: input.uid,
    bookId,
    ...body,
  });
  if (result.status === 'blocked') return json({ code: result.code }, result.code.includes('expired') ? 410 : result.code.includes('stale') || result.code.includes('conflict') ? 409 : 400);
  if (result.status === 'pending') return json(result, 202);
  return json(result, result.status === 'awaiting-retired-byte-deletion' || result.status === 'replayed' ? 200 : 409);
};

export const createReplacementSagaRoute = (dependencies: ReplacementSagaDependencies) => ({
  handle: (request: Request, uid?: string) => handleReplacementSagaRoute({ request, uid, dependencies }),
});
