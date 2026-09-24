import { UploadGrantReplayLedger } from './src/upload-worker/upload-grant-replay-ledger.js';
import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';
import {
  corsResponseHeaders,
  handleCorsPreflight,
  rejectDisallowedActualOrigin,
} from './src/upload-worker/cors-policy.js';
import {
  generateNonce,
  PathAuthorityError,
} from './src/upload-worker/path-authority.js';
import {
  GrantAuthorityError,
  enforceRateLimit,
} from './src/upload-worker/grant-authority.js';
import {
  handleAuthorizeUpload,
  handleGrantMove,
  handleGrantUpload,
} from './src/upload-worker/request-handlers.js';
import { handleListeningUploadSessionGrant } from './src/upload-worker/listening-upload-session-grant.ts';
import { createListeningAuthoringWorkerHandlers } from './src/upload-worker/listening-authoring.ts';
import { createListeningUploadSessionHandlers } from './src/upload-worker/listening-upload-session.ts';
import { createListeningDeliveryWorkerHandlers } from './src/upload-worker/listening-delivery.ts';
import { createBookRouter } from './src/upload-worker/book-router.ts';
import { createProductionBookAssemblyRouteOptions } from './src/upload-worker/book-assembly/production-composition.ts';

/**
 * R2 Upload Worker with Smart Cleanup Support
 *
 * Features:
 * - Upload files to R2 bucket
 * - Move files from temp/ to permanent storage
 * - Proper CORS handling
 */

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

const textResponse = (body, init = {}) =>
  new Response(body, { ...init, headers: { ...init.headers } });

const withHeaders = (init, headers) => ({
  ...init,
  headers: { ...headers, ...init.headers },
});

const authenticate = async (request, env, firebaseVerifier, responseHeaders = {}) => {
  const authResult = await firebaseVerifier.verifyAuthorizationHeader(
    request.headers.get('Authorization'),
    env,
  );

  if (!authResult.valid) {
    return {
      response: jsonResponse(
        { error: 'Unauthorized' },
        { status: 401, headers: responseHeaders },
      ),
    };
  }

  return { uid: authResult.uid };
};

const handleThcsGemma = async (request, env, uid, json) => {
  if (!env.AI || !env.FIREBASE_DB_URL) return json({ error: 'ai_unavailable' }, { status: 503 });
  if (Number(request.headers.get('Content-Length')) > 180_000) {
    return json({ error: 'body_too_large' }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 180_000) {
    return json({ error: 'body_too_large' }, { status: 413 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_request' }, { status: 400 }); }
  if (typeof body?.prompt !== 'string' || !body.prompt.trim()
      || typeof body.systemMessage !== 'string' || !body.systemMessage.trim()
      || (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1))) {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const token = request.headers.get('Authorization')?.slice('Bearer '.length) ?? '';
  const profileUrl = `${env.FIREBASE_DB_URL.replace(/\/$/, '')}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(token)}`;
  const profileResponse = await fetch(profileUrl);
  if (!profileResponse.ok) return json({ error: 'profile_unavailable' }, { status: 503 });
  const profile = await profileResponse.json();
  if ((profile?.role !== 'teacher' && profile?.role !== 'super_admin')
      || profile.forceReauth === true || profile.disabled === true
      || ['blocked', 'inactive', 'suspended'].includes(profile.status)) {
    return json({ error: 'teacher_required' }, { status: 403 });
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
      return json({ error: 'ai_incomplete' }, { status: 502 });
    }
    return json({ text: content });
  } catch {
    return json({ error: 'ai_unavailable' }, { status: 503 });
  }
};

export function createUploadWorker({
  firebaseVerifier = createFirebaseVerifier(),
  nonceGenerator = generateNonce,
  now = () => Date.now(),
  listeningAuthoringHandlers = createListeningAuthoringWorkerHandlers(),
  listeningUploadSessionHandlers = createListeningUploadSessionHandlers(),
  listeningDeliveryHandlers = createListeningDeliveryWorkerHandlers(),
  bookRouter,
  bookRouteHandlers,
} = {}) {
  const canonicalBookRouter = bookRouter ?? createBookRouter({
    firebaseVerifier,
    routeHandlers: bookRouteHandlers ?? createProductionBookAssemblyRouteOptions(),
  });
  return {
    async fetch(request, env) {
      const bookResponse = await canonicalBookRouter.fetch(request, env);
      if (bookResponse) return bookResponse;

      if (request.method === 'OPTIONS') {
        return handleCorsPreflight(request);
      }

      const corsRejection = rejectDisallowedActualOrigin(request);
      if (corsRejection) return corsRejection;

      const url = new URL(request.url);
      const corsHeaders = corsResponseHeaders(request);
      const json = (body, init = {}) => jsonResponse(body, withHeaders(init, corsHeaders));
      const text = (body, init = {}) => textResponse(body, withHeaders(init, corsHeaders));
      const respond = ({ body, init = {} }) => json(body, init);

      try {
        if (
          (request.method === 'GET' || request.method === 'HEAD') &&
          url.pathname === '/listening-delivery/content'
        ) {
          const response = await listeningDeliveryHandlers.content({
            request,
            env,
            now,
          });
          const headers = new Headers(response.headers);
          Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }

        const auth = await authenticate(request, env, firebaseVerifier, corsHeaders);
        if (auth.response) return auth.response;
        const { uid } = auth;
        await enforceRateLimit({ env, uid, request });

        if (url.pathname === '/thcs/gemma' && request.method === 'POST') {
          return handleThcsGemma(request, env, uid, json);
        }

        if (url.pathname === '/move' && request.method === 'POST') {
          return respond(await handleGrantMove({
            request,
            env,
            uid,
            now,
          }));
        }

        if (
          request.method === 'POST' &&
          (url.pathname === '/' || url.pathname === '/upload/authorize')
        ) {
          return respond(await handleAuthorizeUpload({
            request,
            env,
            url,
            uid,
            nonceGenerator,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/createListeningUploadSession') {
          return respond(await listeningUploadSessionHandlers.createSession({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/issueListeningUploadAsset') {
          return respond(await listeningUploadSessionHandlers.issueAsset({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/probeListeningUploadAsset') {
          return respond(await listeningUploadSessionHandlers.probeAsset({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-authoring/save-draft') {
          return respond(await listeningAuthoringHandlers.saveDraft({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-authoring/publish') {
          return respond(await listeningAuthoringHandlers.publish({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-authoring/lifecycle') {
          return respond(await listeningAuthoringHandlers.lifecycle({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-delivery/result-review') {
          return respond(await listeningDeliveryHandlers.resultReview({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-delivery/solo') {
          return respond(await listeningDeliveryHandlers.solo({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'POST' && url.pathname === '/listening-delivery/live') {
          return respond(await listeningDeliveryHandlers.live({
            request,
            env,
            uid,
            now,
          }));
        }

        if (request.method === 'PUT' && url.pathname === '/upload') {
          if (url.searchParams.has('assetGrant')) {
            return respond(await handleListeningUploadSessionGrant({
              request,
              env,
              url,
              uid,
              now,
            }));
          }
          return respond(await handleGrantUpload({
            request,
            env,
            url,
            uid,
            now,
          }));
        }

        return text('Method not allowed', { status: 405 });
      } catch (error) {
        if (error instanceof PathAuthorityError) {
          return json({ error: error.reason }, { status: error.status });
        }
        if (error instanceof GrantAuthorityError) {
          return json({ error: error.reason }, { status: error.status });
        }
        console.error('Worker request failed');
        return json({ error: 'Internal server error' }, { status: 500 });
      }
    },
  };
}

export { UploadGrantReplayLedger };

export default createUploadWorker();
