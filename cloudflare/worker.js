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

export function createUploadWorker({
  firebaseVerifier = createFirebaseVerifier(),
  nonceGenerator = generateNonce,
  now = () => Date.now(),
} = {}) {
  return {
    async fetch(request, env) {
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
        const auth = await authenticate(request, env, firebaseVerifier, corsHeaders);
        if (auth.response) return auth.response;
        const { uid } = auth;
        await enforceRateLimit({ env, uid, request });

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

        if (request.method === 'PUT' && url.pathname === '/upload') {
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

export default createUploadWorker();
