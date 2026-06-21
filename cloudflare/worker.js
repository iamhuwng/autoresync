import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...init.headers },
  });

const textResponse = (body, init = {}) =>
  new Response(body, { ...init, headers: { ...corsHeaders, ...init.headers } });

const authenticate = async (request, env, firebaseVerifier) => {
  const authResult = await firebaseVerifier.verifyAuthorizationHeader(
    request.headers.get('Authorization'),
    env,
  );

  if (!authResult.valid) {
    return {
      response: jsonResponse({ error: 'Unauthorized' }, { status: 401 }),
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
        return new Response(null, { headers: corsHeaders });
      }

      const url = new URL(request.url);

      try {
        const auth = await authenticate(request, env, firebaseVerifier);
        if (auth.response) return auth.response;
        const { uid } = auth;

        if (url.pathname === '/move' && request.method === 'POST') {
          const { sourceKey, destKey } = await request.json();

          if (!sourceKey || !destKey) {
            return jsonResponse({ error: 'sourceKey and destKey required' }, { status: 400 });
          }

          const move = deriveCanonicalMove({ sourceKey, destKey, uid });
          const existingDestination = await env.R2_BUCKET.get(move.destKey);
          if (existingDestination) {
            return jsonResponse({ error: 'Destination already exists' }, { status: 409 });
          }

          const sourceObject = await env.R2_BUCKET.get(move.sourceKey);

          if (!sourceObject) {
            return jsonResponse({ error: 'Source file not found' }, { status: 404 });
          }

          await env.R2_BUCKET.put(move.destKey, sourceObject.body, {
            httpMetadata: sourceObject.httpMetadata,
            customMetadata: sourceObject.customMetadata,
          });

          await env.R2_BUCKET.delete(move.sourceKey);

          return jsonResponse({
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
            return jsonResponse(
              { error: 'operationKind and fileName required' },
              { status: 400 },
            );
          }

          const canonical = createCanonicalUploadPath({
            operationKind,
            uid,
            fileName,
            nonce: operationKind === 'avatar_permanent' ? undefined : nonceGenerator(),
          });
          const key = canonical.key;
          const uploadUrl = `${url.origin}?key=${encodeURIComponent(key)}`;

          return jsonResponse({ key, uploadUrl });
        }

        if (request.method === 'PUT') {
          const key = url.searchParams.get('key');

          if (!key) {
            return textResponse('Key required', { status: 400 });
          }

          const canonical = validateCanonicalUploadKey({ key, uid });
          if (!canonical.valid) {
            const status = canonical.reason === 'owner_mismatch' ? 403 : 400;
            return jsonResponse({ error: canonical.reason }, { status });
          }

          const existingObject = await env.R2_BUCKET.get(canonical.key);
          if (existingObject && !canonical.allowsOverwrite) {
            return jsonResponse({ error: 'Destination already exists' }, { status: 409 });
          }

          const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

          await env.R2_BUCKET.put(canonical.key, request.body, {
            httpMetadata: { contentType },
          });

          const publicUrl = `${env.PUBLIC_URL}/${canonical.key}`;

          return jsonResponse({ success: true, url: publicUrl, key: canonical.key });
        }

        return textResponse('Method not allowed', { status: 405 });
      } catch (error) {
        if (error instanceof PathAuthorityError) {
          return jsonResponse({ error: error.reason }, { status: error.status });
        }
        console.error('Worker request failed');
        return jsonResponse({ error: 'Internal server error' }, { status: 500 });
      }
    },
  };
}

export default createUploadWorker();
