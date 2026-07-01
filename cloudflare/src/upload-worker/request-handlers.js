import {
  PathAuthorityError,
  createCanonicalUploadPath,
  deriveCanonicalMove,
  parseLegacyUploadHint,
  sanitizeFileName,
  validateCanonicalUploadKey,
} from './path-authority.js';
import {
  UPLOAD_GRANT_TTL_MS,
  assertUploadGrantMatchesRequest,
  issueGrant,
  parseSizeBytes,
  requireContentType,
  verifyGrant,
} from './grant-authority.js';
import { consumeGrantNonce } from './replay-authority.js';

const parseJsonBody = async (request) =>
  request.headers.get('Content-Type')?.toLowerCase().includes('application/json')
    ? request.json()
    : {};

const LOCAL_UPLOAD_TRANSPORT_ORIGIN = 'http://localhost:8787';
const LOCAL_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
]);

const resolveUploadTransportOrigin = ({ body, request, url }) => {
  if (body.uploadTransportOrigin === undefined) return url.origin;
  if (
    body.uploadTransportOrigin !== LOCAL_UPLOAD_TRANSPORT_ORIGIN
    || !LOCAL_APP_ORIGINS.has(request.headers.get('Origin'))
  ) {
    throw new PathAuthorityError('invalid_upload_transport_origin');
  }
  return LOCAL_UPLOAD_TRANSPORT_ORIGIN;
};

const resolveUploadRequestSize = ({ grantPayload, request }) => {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) return contentLength;
  if (
    grantPayload.uploadTransportOrigin === LOCAL_UPLOAD_TRANSPORT_ORIGIN
    && LOCAL_APP_ORIGINS.has(request.headers.get('Origin'))
  ) {
    return request.headers.get('X-Upload-Size');
  }
  return null;
};

export const handleAuthorizeUpload = async ({
  request,
  env,
  url,
  uid,
  nonceGenerator,
  now,
}) => {
  const body = await parseJsonBody(request);
  const operationKindHint = url.searchParams.get('operationKind');
  const fileNameHint = url.searchParams.get('fileName');
  const legacyFilenameHint = url.searchParams.get('filename');
  let operationKind = body.operationKind ?? operationKindHint;
  let fileName = body.fileName ?? fileNameHint;

  if (legacyFilenameHint) {
    if (legacyFilenameHint.includes('/')) {
      const legacy = parseLegacyUploadHint({ filename: legacyFilenameHint, uid });
      if (operationKind && operationKind !== legacy.operationKind) {
        throw new PathAuthorityError('legacy_hint_mismatch');
      }
      if (fileName && sanitizeFileName(fileName) !== sanitizeFileName(legacy.fileName)) {
        throw new PathAuthorityError('legacy_hint_mismatch');
      }
      operationKind ??= legacy.operationKind;
      fileName ??= legacy.fileName;
    } else {
      fileName ??= legacyFilenameHint;
    }
  }

  if (!operationKind || !fileName) {
    return {
      body: { error: 'operationKind and fileName required' },
      init: { status: 400 },
    };
  }

  const contentType = requireContentType(
    body.contentType ?? url.searchParams.get('contentType'),
  );
  const sizeBytes = parseSizeBytes(body.sizeBytes ?? url.searchParams.get('sizeBytes'));
  const operationNonce = nonceGenerator();
  const canonical = createCanonicalUploadPath({
    operationKind,
    uid,
    fileName,
    nonce: operationNonce,
  });
  const key = canonical.key;
  const expiresAt = now() + UPLOAD_GRANT_TTL_MS;
  const uploadTransportOrigin = resolveUploadTransportOrigin({ body, request, url });
  const uploadGrant = await issueGrant({
    env,
    payload: {
      kind: 'upload',
      uid,
      operationKind,
      key,
      contentType,
      sizeBytes,
      expiresAt,
      nonce: operationNonce,
      ...(uploadTransportOrigin === LOCAL_UPLOAD_TRANSPORT_ORIGIN
        ? { uploadTransportOrigin }
        : {}),
    },
  });
  const uploadUrl = `${uploadTransportOrigin}/upload?grant=${encodeURIComponent(uploadGrant)}`;
  let moveGrant;
  if (key.startsWith('temp/')) {
    const move = deriveCanonicalMove({
      sourceKey: key,
      destKey: key.slice('temp/'.length),
      uid,
    });
    moveGrant = await issueGrant({
      env,
      payload: {
        kind: 'move',
        uid,
        operationKind,
        sourceKey: move.sourceKey,
        destKey: move.destKey,
        contentType,
        sizeBytes,
        expiresAt,
        nonce: operationNonce,
      },
    });
  }

  return {
    body: {
      key,
      uploadUrl,
      publicUrl: `${env.PUBLIC_URL}/${key}`,
      moveGrant,
      expiresAt,
    },
  };
};

export const handleGrantUpload = async ({ request, env, url, uid, now }) => {
  const grant = url.searchParams.get('grant');
  if (!grant) return { body: { error: 'Grant required' }, init: { status: 400 } };

  const grantPayload = await verifyGrant({ env, grant, uid, kind: 'upload', now });
  assertUploadGrantMatchesRequest({
    payload: grantPayload,
    contentType: request.headers.get('Content-Type'),
    sizeBytes: resolveUploadRequestSize({ grantPayload, request }),
  });

  const canonical = validateCanonicalUploadKey({ key: grantPayload.key, uid });
  if (!canonical.valid) {
    return {
      body: { error: canonical.reason },
      init: { status: canonical.reason === 'owner_mismatch' ? 403 : 400 },
    };
  }

  await consumeGrantNonce({ env, payload: grantPayload });

  const existingObject = await env.R2_BUCKET.get(canonical.key);
  if (existingObject && !canonical.allowsOverwrite) {
    return { body: { error: 'Destination already exists' }, init: { status: 409 } };
  }

  await env.R2_BUCKET.put(canonical.key, request.body, {
    httpMetadata: { contentType: grantPayload.contentType },
  });

  return {
    body: {
      success: true,
      url: `${env.PUBLIC_URL}/${canonical.key}`,
      key: canonical.key,
    },
  };
};

export const handleGrantMove = async ({ request, env, uid, now }) => {
  const { moveGrant, sourceKey, destKey } = await request.json();
  if (!moveGrant) return { body: { error: 'moveGrant required' }, init: { status: 400 } };

  const grantPayload = await verifyGrant({ env, grant: moveGrant, uid, kind: 'move', now });
  if (sourceKey && sourceKey !== grantPayload.sourceKey) {
    return { body: { error: 'sourceKey assertion mismatch' }, init: { status: 400 } };
  }
  if (destKey && destKey !== grantPayload.destKey) {
    return { body: { error: 'destKey assertion mismatch' }, init: { status: 400 } };
  }

  const move = deriveCanonicalMove({
    sourceKey: grantPayload.sourceKey,
    destKey: grantPayload.destKey,
    uid,
  });

  await consumeGrantNonce({ env, payload: grantPayload });

  const existingDestination = await env.R2_BUCKET.get(move.destKey);
  if (existingDestination) {
    return { body: { error: 'Destination already exists' }, init: { status: 409 } };
  }

  const sourceObject = await env.R2_BUCKET.get(move.sourceKey);
  if (!sourceObject) return { body: { error: 'Source file not found' }, init: { status: 404 } };

  await env.R2_BUCKET.put(move.destKey, sourceObject.body, {
    httpMetadata: sourceObject.httpMetadata,
    customMetadata: sourceObject.customMetadata,
  });
  await env.R2_BUCKET.delete(move.sourceKey);

  return {
    body: {
      success: true,
      newKey: move.destKey,
      newUrl: `${env.PUBLIC_URL}/${move.destKey}`,
    },
  };
};
