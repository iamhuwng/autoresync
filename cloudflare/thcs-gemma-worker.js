import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';
import { corsResponseHeaders, handleCorsPreflight, rejectDisallowedActualOrigin } from './src/upload-worker/cors-policy.js';
import { handleAiGatewayRequest } from './src/ai-gateway/routes.js';

const MAX_BODY_BYTES = 180_000;
const AI_METHODS = 'GET, POST, PATCH, DELETE';
const AI_HEADERS = new Set(['authorization', 'content-type']);

function aiCorsHeaders(request) {
  const headers = corsResponseHeaders(request);
  if (headers['Access-Control-Allow-Origin']) headers['Access-Control-Allow-Methods'] = AI_METHODS;
  return headers;
}

function aiPreflight(request) {
  const rejected = rejectDisallowedActualOrigin(request);
  if (rejected) return rejected;
  const method = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
    .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
  if (!AI_METHODS.split(', ').includes(method)) return new Response(null, { status: 405 });
  if (requestedHeaders.some((header) => !AI_HEADERS.has(header))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: aiCorsHeaders(request) });
}

export function createThcsGemmaWorker({ firebaseVerifier = createFirebaseVerifier() } = {}) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (request.method === 'OPTIONS') return path.startsWith('/ai/') ? aiPreflight(request) : handleCorsPreflight(request);
      const rejectedOrigin = rejectDisallowedActualOrigin(request);
      if (rejectedOrigin) return rejectedOrigin;

      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsResponseHeaders(request) };
      const json = (body, status = 200) => Response.json(body, { status, headers });
      if ((path !== '/thcs/gemma' || request.method !== 'POST') && !path.startsWith('/ai/')) {
        return json({ error: 'not_found' }, 404);
      }

      const authorization = request.headers.get('Authorization');
      const auth = await firebaseVerifier.verifyAuthorizationHeader(authorization, env);
      if (!auth.valid) return json({ error: 'Unauthorized' }, 401);
      if (!env.FIREBASE_DB_URL || !env.THCS_RATE_LIMITER) {
        return json({ error: 'ai_unavailable' }, 503);
      }

      const token = authorization.slice('Bearer '.length);
      const profileUrl = `${env.FIREBASE_DB_URL.replace(/\/$/, '')}/users/${encodeURIComponent(auth.uid)}.json?auth=${encodeURIComponent(token)}`;
      let profile;
      try {
        const response = await fetch(profileUrl);
        if (!response.ok) return json({ error: 'profile_unavailable' }, 503);
        profile = await response.json();
      } catch { return json({ error: 'profile_unavailable' }, 503); }
      if (!profile || !['student', 'teacher', 'super_admin'].includes(profile.role)
          || profile.forceReauth === true || profile.disabled === true
          || ['blocked', 'inactive', 'suspended'].includes(profile.status)) {
        return json({ error: 'account_disabled' }, 403);
      }
      if (path === '/thcs/gemma' && profile.role === 'student') {
        return json({ error: 'teacher_required' }, 403);
      }

      if (path.startsWith('/ai/')) {
        const result = await handleAiGatewayRequest(request, env, auth, profile);
        const responseHeaders = new Headers(result.headers);
        for (const [key, value] of Object.entries(aiCorsHeaders(request))) responseHeaders.set(key, value);
        return new Response(result.body, { status: result.status, headers: responseHeaders });
      }
      if (!env.AI) return json({ error: 'ai_unavailable' }, 503);
      const limited = await env.THCS_RATE_LIMITER.limit({ key: `thcs-gemma:${auth.uid}` });
      if (!limited?.success) return json({ error: 'rate_limited' }, 429);

      if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
        return json({ error: 'body_too_large' }, 413);
      }
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json({ error: 'body_too_large' }, 413);
      }
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_request' }, 400); }
      if (typeof body?.prompt !== 'string' || !body.prompt.trim()
          || typeof body.systemMessage !== 'string' || !body.systemMessage.trim()
          || (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1))) {
        return json({ error: 'invalid_request' }, 400);
      }

      try {
        const result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
          messages: [
            { role: 'system', content: body.systemMessage },
            { role: 'user', content: body.prompt },
          ],
          temperature: body.temperature ?? 0.1,
          max_completion_tokens: 16_384,
          chat_template_kwargs: { enable_thinking: false },
        });
        const choice = result?.choices?.[0];
        const content = choice?.message?.content;
        if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || content.trim().length <= 10) {
          return json({ error: 'ai_incomplete' }, 502);
        }
        return json({ text: content });
      } catch { return json({ error: 'ai_unavailable' }, 503); }
    },
  };
}

export default createThcsGemmaWorker();
