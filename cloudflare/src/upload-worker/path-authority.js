const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const UID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const operationDefinitions = {
  listening_audio_temp: {
    prefix: 'temp/listening-audio',
    durablePrefix: 'listening-audio',
  },
  test_audio_temp: {
    prefix: 'temp/audio',
    durablePrefix: 'audio',
  },
  test_image_temp: {
    prefix: 'temp/images',
    durablePrefix: 'images',
  },
  avatar_permanent: {
    prefix: 'avatars',
    singleton: true,
    allowsOverwrite: true,
  },
  announcement_attachment_permanent: {
    prefix: 'announcements',
  },
  book_cover_permanent: {
    prefix: 'book-covers',
  },
};

const canonicalDefinitions = [
  ...Object.entries(operationDefinitions).map(([operationKind, definition]) => ({
    ...definition,
    operationKind,
    uploadAllowed: true,
    temporary: Boolean(definition.durablePrefix),
  })),
  ...Object.entries(operationDefinitions)
    .filter(([, definition]) => definition.durablePrefix)
    .map(([operationKind, definition]) => ({
      operationKind,
      prefix: definition.durablePrefix,
      temporary: false,
      uploadAllowed: false,
    })),
];

export class PathAuthorityError extends Error {
  constructor(reason, status = 400) {
    super(reason);
    this.name = 'PathAuthorityError';
    this.reason = reason;
    this.status = status;
  }
}

const fail = (reason, status) => {
  throw new PathAuthorityError(reason, status);
};

const decodeForValidation = (value) => {
  let decoded = value;

  for (let index = 0; index < 2; index += 1) {
    if (!decoded.includes('%')) break;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      fail('invalid_encoding');
    }
  }

  return decoded;
};

const assertSafeText = (value, { allowPath = false } = {}) => {
  if (typeof value !== 'string' || value.trim() === '') fail('empty_file_name');
  if (CONTROL_PATTERN.test(value)) fail('control_character');

  const decoded = decodeForValidation(value);
  if (CONTROL_PATTERN.test(decoded)) fail('control_character');
  if (/^[\\/]/.test(decoded) || /^[A-Za-z]:[\\/]/.test(decoded)) {
    fail('absolute_path');
  }
  if (URL_SCHEME_PATTERN.test(decoded) || decoded.includes('://')) fail('absolute_url');
  if (decoded.includes('//') || decoded.includes('\\\\')) fail('duplicate_separator');
  if (decoded.includes('..')) fail('path_traversal');
  if (!allowPath && /[\\/]/.test(decoded)) fail('path_separator');

  return decoded;
};

const assertUid = (uid) => {
  if (!UID_PATTERN.test(uid) || uid.includes('..')) fail('invalid_uid', 403);
};

export const sanitizeFileName = (fileName) => {
  const safeName = assertSafeText(fileName).trim().normalize('NFKD');
  const sanitized = safeName
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!sanitized) fail('empty_file_name');
  return sanitized;
};

export const generateNonce = (crypto = globalThis.crypto) => {
  if (!crypto?.getRandomValues) fail('web_crypto_unavailable', 500);

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const createCanonicalUploadPath = ({
  operationKind,
  uid,
  fileName,
  nonce,
}) => {
  const definition = operationDefinitions[operationKind];
  if (!definition) fail('unsupported_operation_kind');
  assertUid(uid);
  const sanitizedFileName = sanitizeFileName(fileName);

  if (definition.singleton) {
    return {
      key: `${definition.prefix}/${uid}/avatar`,
      operationKind,
      allowsOverwrite: true,
    };
  }

  if (!NONCE_PATTERN.test(nonce)) fail('invalid_nonce', 500);
  return {
    key: `${definition.prefix}/${uid}/${nonce}-${sanitizedFileName}`,
    operationKind,
    allowsOverwrite: false,
  };
};

const canonicalParts = (key) => {
  const safeKey = assertSafeText(key, { allowPath: true });
  if (safeKey.includes('%') || safeKey.includes('\\')) fail('noncanonical_key');

  for (const definition of canonicalDefinitions) {
    const prefixParts = definition.prefix.split('/');
    const parts = safeKey.split('/');
    if (!prefixParts.every((part, index) => parts[index] === part)) continue;

    const remaining = parts.slice(prefixParts.length);
    if (definition.singleton) {
      if (remaining.length !== 2 || remaining[1] !== 'avatar') {
        fail('noncanonical_key');
      }
      return { ...definition, uid: remaining[0], key: safeKey };
    }

    if (remaining.length !== 2) fail('noncanonical_key');
    const [uid, objectName] = remaining;
    const nonce = objectName.slice(0, 32);
    const separator = objectName[32];
    const fileName = objectName.slice(33);
    if (
      !NONCE_PATTERN.test(nonce) ||
      separator !== '-' ||
      !fileName ||
      sanitizeFileName(fileName) !== fileName
    ) {
      fail('noncanonical_key');
    }

    return { ...definition, uid, key: safeKey };
  }

  fail('unsupported_prefix', 403);
};

export const validateCanonicalUploadKey = ({ key, uid }) => {
  try {
    assertUid(uid);
    const parsed = canonicalParts(key);
    if (parsed.uid !== uid) return { valid: false, reason: 'owner_mismatch' };
    if (!parsed.uploadAllowed) {
      return { valid: false, reason: 'direct_durable_upload_forbidden' };
    }
    return {
      valid: true,
      key: parsed.key,
      operationKind: parsed.operationKind,
      allowsOverwrite: Boolean(parsed.allowsOverwrite),
    };
  } catch (error) {
    if (error instanceof PathAuthorityError) {
      return { valid: false, reason: error.reason };
    }
    throw error;
  }
};

export const parseLegacyUploadHint = ({ filename, uid }) => {
  assertUid(uid);
  const safePath = assertSafeText(filename, { allowPath: true });
  if (safePath.includes('\\')) fail('path_separator');

  for (const [operationKind, definition] of Object.entries(operationDefinitions)) {
    const prefixParts = definition.prefix.split('/');
    const parts = safePath.split('/');
    if (!prefixParts.every((part, index) => parts[index] === part)) continue;

    const remaining = parts.slice(prefixParts.length);
    if (remaining.length === 1) {
      return {
        operationKind,
        fileName: remaining[0],
      };
    }
    if (remaining.length !== 2) fail('noncanonical_legacy_hint');
    if (remaining[0] !== uid) fail('owner_mismatch', 403);
    if (definition.singleton && remaining[1] !== 'avatar') {
      fail('noncanonical_legacy_hint');
    }

    return {
      operationKind,
      fileName: definition.singleton ? 'avatar' : remaining[1],
    };
  }

  fail('unsupported_prefix', 403);
};

export const deriveCanonicalMove = ({ sourceKey, destKey, uid }) => {
  assertUid(uid);
  const source = canonicalParts(sourceKey);
  if (source.uid !== uid) fail('owner_mismatch', 403);
  if (!source.temporary) fail('source_not_temporary');

  const expectedDestKey = source.key.slice('temp/'.length);
  if (destKey !== expectedDestKey) fail('destination_mismatch');

  const destination = canonicalParts(destKey);
  if (
    destination.uid !== uid ||
    destination.operationKind !== source.operationKind ||
    destination.temporary
  ) {
    fail('destination_mismatch');
  }

  return { sourceKey: source.key, destKey: destination.key };
};
