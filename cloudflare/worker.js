import { createFirebaseVerifier } from './src/upload-worker/firebase-verification.js';

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

const ownerIndexForKey = (key) => {
  const parts = key.split('/');

  if (parts[0] === 'temp') return parts.length >= 4 ? 2 : -1;
  if (parts.length >= 3) return 1;

  return -1;
};

const validateOwnerScope = (key, uid) => {
  const ownerIndex = ownerIndexForKey(key);
  if (ownerIndex < 0) {
    return { valid: false };
  }

  return { valid: key.split('/')[ownerIndex] === uid };
};

const deriveUploadKey = (filename, uid) => {
  const parts = filename.split('/');
  const ownerIndex = ownerIndexForKey(filename);

  if (ownerIndex >= 0) {
    return validateOwnerScope(filename, uid).valid
      ? { valid: true, key: filename }
      : { valid: false };
  }

  if (parts[0] === 'temp' && parts.length >= 3) {
    return { valid: true, key: ['temp', parts[1], uid, ...parts.slice(2)].join('/') };
  }

  return { valid: false };
};

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

          const sourceScope = validateOwnerScope(sourceKey, uid);
          const destScope = validateOwnerScope(destKey, uid);
          if (!sourceScope.valid || !destScope.valid) {
            return jsonResponse({ error: 'Forbidden' }, { status: 403 });
          }

          const sourceObject = await env.R2_BUCKET.get(sourceKey);

          if (!sourceObject) {
            return jsonResponse({ error: 'Source file not found' }, { status: 404 });
          }

          await env.R2_BUCKET.put(destKey, sourceObject.body, {
            httpMetadata: sourceObject.httpMetadata,
            customMetadata: sourceObject.customMetadata,
          });

          await env.R2_BUCKET.delete(sourceKey);

          return jsonResponse({
            success: true,
            message: `Moved ${sourceKey} to ${destKey}`,
          });
        }

        if (request.method === 'POST') {
          const filename = url.searchParams.get('filename');

          if (!filename) {
            return jsonResponse({ error: 'Filename required' }, { status: 400 });
          }

          const uploadKey = deriveUploadKey(filename, uid);
          if (!uploadKey.valid) {
            return jsonResponse({ error: 'Forbidden' }, { status: 403 });
          }

          const key = uploadKey.key;
          const uploadUrl = `${url.origin}?key=${encodeURIComponent(key)}`;

          return jsonResponse({ key, uploadUrl });
        }

        if (request.method === 'PUT') {
          const key = url.searchParams.get('key');

          if (!key) {
            return textResponse('Key required', { status: 400 });
          }

          if (!validateOwnerScope(key, uid).valid) {
            return jsonResponse({ error: 'Forbidden' }, { status: 403 });
          }

          const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

          await env.R2_BUCKET.put(key, request.body, {
            httpMetadata: { contentType },
          });

          const publicUrl = `${env.PUBLIC_URL}/${key}`;

          return jsonResponse({ success: true, url: publicUrl, key });
        }

        return textResponse('Method not allowed', { status: 405 });
      } catch (error) {
        console.error('Worker error:', error);
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    },
  };
}

export default createUploadWorker();
