import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';
import {
  corsResponseHeaders,
  handleCorsPreflight,
  rejectDisallowedActualOrigin,
} from './src/upload-worker/cors-policy.js';
import {
  PathAuthorityError,
  createCanonicalUploadPath,
  deriveCanonicalMove,
  generateNonce,
  parseLegacyUploadHint,
  sanitizeFileName,
  validateCanonicalUploadKey,
} from './src/upload-worker/path-authority.js';

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

      try {
        const auth = await authenticate(request, env, firebaseVerifier, corsHeaders);
        if (auth.response) return auth.response;
        const { uid } = auth;

        if (url.pathname === '/move' && request.method === 'POST') {
          const { sourceKey, destKey } = await request.json();

          if (!sourceKey || !destKey) {
            return json({ error: 'sourceKey and destKey required' }, { status: 400 });
          }

          const move = deriveCanonicalMove({ sourceKey, destKey, uid });
          const existingDestination = await env.R2_BUCKET.get(move.destKey);
          if (existingDestination) {
            return json({ error: 'Destination already exists' }, { status: 409 });
          }

          const sourceObject = await env.R2_BUCKET.get(move.sourceKey);

          if (!sourceObject) {
            return json({ error: 'Source file not found' }, { status: 404 });
          }

          await env.R2_BUCKET.put(move.destKey, sourceObject.body, {
            httpMetadata: sourceObject.httpMetadata,
            customMetadata: sourceObject.customMetadata,
          });

          await env.R2_BUCKET.delete(move.sourceKey);

          return json({
            success: true,
            message: `Moved ${move.sourceKey} to ${move.destKey}`,
          });
        }

        if (request.method === 'POST') {
          const operationKindHint = url.searchParams.get('operationKind');
          const fileNameHint = url.searchParams.get('fileName');
          const legacyFilenameHint = url.searchParams.get('filename');
          let operationKind = operationKindHint;
          let fileName = fileNameHint;

          if (legacyFilenameHint) {
            if (legacyFilenameHint.includes('/')) {
              const legacy = parseLegacyUploadHint({
                filename: legacyFilenameHint,
                uid,
              });
              if (operationKind && operationKind !== legacy.operationKind) {
                throw new PathAuthorityError('legacy_hint_mismatch');
              }
              if (
                fileName &&
                sanitizeFileName(fileName) !== sanitizeFileName(legacy.fileName)
              ) {
                throw new PathAuthorityError('legacy_hint_mismatch');
              }
              operationKind ??= legacy.operationKind;
              fileName ??= legacy.fileName;
            } else {
              fileName ??= legacyFilenameHint;
            }
          }

          if (!operationKind || !fileName) {
            return json({ error: 'operationKind and fileName required' }, { status: 400 });
          }

          const canonical = createCanonicalUploadPath({
            operationKind,
            uid,
            fileName,
            nonce: operationKind === 'avatar_permanent' ? undefined : nonceGenerator(),
          });
          const key = canonical.key;
          const uploadUrl = `${url.origin}?key=${encodeURIComponent(key)}`;

          return json({ key, uploadUrl });
        }

        if (request.method === 'PUT') {
          const key = url.searchParams.get('key');

          if (!key) {
            return text('Key required', { status: 400 });
          }

          const canonical = validateCanonicalUploadKey({ key, uid });
          if (!canonical.valid) {
            const status = canonical.reason === 'owner_mismatch' ? 403 : 400;
            return json({ error: canonical.reason }, { status });
          }

          const existingObject = await env.R2_BUCKET.get(canonical.key);
          if (existingObject && !canonical.allowsOverwrite) {
            return json({ error: 'Destination already exists' }, { status: 409 });
          }

          const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

          await env.R2_BUCKET.put(canonical.key, request.body, {
            httpMetadata: { contentType },
          });

          const publicUrl = `${env.PUBLIC_URL}/${canonical.key}`;

          return json({ success: true, url: publicUrl, key: canonical.key });
        }

        return text('Method not allowed', { status: 405 });
      } catch (error) {
        if (error instanceof PathAuthorityError) {
          return json({ error: error.reason }, { status: error.status });
        }
        console.error('Worker request failed');
        return json({ error: 'Internal server error' }, { status: 500 });
      }
    },
  };
}

export default createUploadWorker();
