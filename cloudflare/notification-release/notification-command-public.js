import activeWorker from './notification-command-entry.js';
export { NotificationBridgeObject } from './notification-command-entry.js';

const bridgePaths = new Set(['/events', '/homework-result-authority', '/course-enrollment-approval']);
const origins = new Set(['https://kahut1.web.app', 'https://hocthem.net', 'http://localhost:5173', 'http://localhost:5174']);
const reply = (status, value) => Response.json({ status: value }, { status });

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (!bridgePaths.has(url.pathname)) return activeWorker.fetch(request, env);
    if (url.search) return reply(404, 'not_found');
    const origin = request.headers.get('Origin');
    if (origin && !origins.has(origin)) return reply(403, 'origin_denied');
    if (request.method === 'OPTIONS') {
      const headers = new Headers({ 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return reply(405, 'method_denied');
    if (!/^Bearer \S+$/u.test(request.headers.get('Authorization') ?? '')) return reply(401, 'unauthenticated');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply(400, 'invalid_content_type');
    if (Number(request.headers.get('Content-Length') ?? 0) > 512) return reply(413, 'body_too_large');
    return env.NOTIFICATION_BRIDGE_OBJECT.get(env.NOTIFICATION_BRIDGE_OBJECT.idFromName('firestore-bridge')).fetch(request);
  },
};
