import { token } from './notification-firestore-auth.ts';
import type { Env } from './notification-firestore-bridge.ts';

const PATH = '/course-enrollment-approval';
const ORIGINS = new Set(['https://kahut1.web.app', 'https://hocthem.net', 'http://localhost:5173', 'http://localhost:5174']);
const reply = (request: Request, status: number, value: string): Response => {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return new Response(JSON.stringify({ status: value }), { status, headers });
};

const row = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

export const handleCourseEnrollmentApproval = async (
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
  parsedInput?: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname !== PATH || url.search || url.hash) return reply(request, 404, 'not_found');
  const origin = request.headers.get('Origin');
  if (origin && !ORIGINS.has(origin)) return reply(request, 403, 'origin_denied');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: reply(request, 200, 'ok').headers });
  if (request.method !== 'POST') return reply(request, 405, 'method_denied');
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7)) return reply(request, 401, 'unauthenticated');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply(request, 400, 'invalid_content_type');

  let input: Record<string, unknown> | null;
  if (parsedInput === undefined) {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 512) {
            await reader.cancel();
            return reply(request, 413, 'body_too_large');
          }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    try { input = row(JSON.parse(raw)); } catch { input = null; }
  } else {
    input = row(parsedInput);
  }
  if (!input) return reply(request, 400, 'invalid_course_request');
  const ray = request.headers.get('CF-Ray');
  try {
    const { approveCourseEnrollmentRequest } = await import('./course-enrollment-approval-route.ts');
    let readToken: Promise<string> | undefined;
    const readSource = async (path: string, boundedFetcher: typeof fetch): Promise<unknown> => {
      readToken ??= token(env, boundedFetcher, ray && /^[a-f0-9]{16,32}(?:-[A-Z0-9]{3,10})?$/iu.test(ray) ? ray : null);
      const accessToken = await readToken;
      const base = env.FIREBASE_DB_URL.replace(/\/$/u, '');
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const response = await boundedFetcher(`${base}/${encodedPath}.json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if ([401, 403].includes(response.status)) throw new Error('course_request_denied');
      if (!response.ok) throw new Error('course_request_unavailable');
      return response.json();
    };
    const status = await approveCourseEnrollmentRequest({ request, env, input, authorization, fetcher, readSource });
    return reply(request, 200, status);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'course_request_unavailable';
    const status = code === 'course_request_invalid' ? 400
      : code === 'course_request_unauthenticated' ? 401
        : code === 'course_request_denied' || code === 'course_request_owner_denied' ? 403
          : code === 'course_request_not_found' ? 404
            : code === 'course_request_conflict' ? 409
              : code === 'course_request_rate_limited' ? 429
                : code === 'course_request_timeout' ? 504 : 503;
    return reply(request, status, status === 503 || status === 504 ? 'course_request_unavailable' : code);
  }
};
