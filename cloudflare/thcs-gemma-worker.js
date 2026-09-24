import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';
import { corsResponseHeaders, handleCorsPreflight, rejectDisallowedActualOrigin } from './src/upload-worker/cors-policy.js';

const MAX_BODY_BYTES = 180_000;

export function createThcsGemmaWorker({ firebaseVerifier = createFirebaseVerifier() } = {}) {
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') return handleCorsPreflight(request);
      const rejectedOrigin = rejectDisallowedActualOrigin(request);
      if (rejectedOrigin) return rejectedOrigin;

      const headers = { 'Content-Type': 'application/json', ...corsResponseHeaders(request) };
      const json = (body, status = 200) => Response.json(body, { status, headers });
      if (new URL(request.url).pathname !== '/thcs/gemma' || request.method !== 'POST') {
        return json({ error: 'not_found' }, 404);
      }

      const authorization = request.headers.get('Authorization');
      const auth = await firebaseVerifier.verifyAuthorizationHeader(authorization, env);
      if (!auth.valid) return json({ error: 'Unauthorized' }, 401);
      if (!env.AI || !env.FIREBASE_DB_URL || !env.THCS_RATE_LIMITER) {
        return json({ error: 'ai_unavailable' }, 503);
      }
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

      const token = authorization.slice('Bearer '.length);
      const profileUrl = `${env.FIREBASE_DB_URL.replace(/\/$/, '')}/users/${encodeURIComponent(auth.uid)}.json?auth=${encodeURIComponent(token)}`;
      let profile;
      try {
        const response = await fetch(profileUrl);
        if (!response.ok) return json({ error: 'profile_unavailable' }, 503);
        profile = await response.json();
      } catch { return json({ error: 'profile_unavailable' }, 503); }
      if ((profile?.role !== 'teacher' && profile?.role !== 'super_admin')
          || profile.forceReauth === true || profile.disabled === true
          || ['blocked', 'inactive', 'suspended'].includes(profile.status)) {
        return json({ error: 'teacher_required' }, 403);
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
