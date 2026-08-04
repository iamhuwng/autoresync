import {
  BOOK_SOURCE_MAX_PDF_BYTES,
} from '../../types/bookSource.types';
import type {
  BookSourceChecksum,
  BookSourceVersionMetadata,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';

const IDENTITY_KEYS = [
  'bookId',
  'sourceVersionId',
  'storageLocationId',
  'providerKind',
  'privateBucketId',
  'providerObjectKey',
  'providerFileId',
  'providerFileVersionId',
  'checksum',
  'byteSize',
] as const;

const CHECKSUM_KEYS = ['algorithm', 'value'] as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const SHA256_HEX = /^[a-fA-F0-9]{64}$/;
const MAX_PROVIDER_OBJECT_KEY_LENGTH = 1024;

export class SourceVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceVersionError';
  }
}

/**
 * Validates and returns one immutable provider-neutral storage identity.
 * This function copies every field; callers cannot mutate the returned value.
 */
export function createBookSourceVersionStorageIdentity(
  value: unknown,
): BookSourceVersionStorageIdentity {
  assertBookSourceVersionStorageIdentity(value);

  const identity = value as BookSourceVersionStorageIdentity;
  const checksum = Object.freeze({
    algorithm: identity.checksum.algorithm,
    value: identity.checksum.value.toLowerCase(),
  });

  return Object.freeze({
    bookId: identity.bookId,
    sourceVersionId: identity.sourceVersionId,
    storageLocationId: identity.storageLocationId,
    providerKind: identity.providerKind,
    privateBucketId: identity.privateBucketId,
    providerObjectKey: identity.providerObjectKey,
    providerFileId: identity.providerFileId,
    providerFileVersionId: identity.providerFileVersionId,
    checksum,
    byteSize: identity.byteSize,
  });
}

/** Copies immutable Source Version metadata and normalizes display filename. */
export function createBookSourceVersionMetadata(value: {
  readonly sourceKey: string;
  readonly originalFilename: unknown;
  readonly storage: unknown;
}): BookSourceVersionMetadata {
  assertSafeIdentifier(value.sourceKey, 'sourceKey');

  return Object.freeze({
    sourceKey: value.sourceKey,
    originalFilename: normalizeBookSourceDisplayFilename(value.originalFilename),
    storage: createBookSourceVersionStorageIdentity(value.storage),
  });
}

/** Throws when value is not a complete immutable Source Version storage identity. */
export function assertBookSourceVersionStorageIdentity(
  value: unknown,
): asserts value is BookSourceVersionStorageIdentity {
  assertExactRecord(value, IDENTITY_KEYS, 'Source Version storage identity');

  const identity = value as Record<string, unknown>;
  assertSafeIdentifier(identity.bookId, 'bookId');
  assertSafeIdentifier(identity.sourceVersionId, 'sourceVersionId');
  assertSafeIdentifier(identity.storageLocationId, 'storageLocationId');
  assertSafeIdentifier(identity.providerKind, 'providerKind');
  assertSafeIdentifier(identity.privateBucketId, 'privateBucketId');
  assertSafeProviderObjectKey(identity.providerObjectKey);
  assertSafeIdentifier(identity.providerFileId, 'providerFileId');
  assertSafeIdentifier(identity.providerFileVersionId, 'providerFileVersionId');
  assertBookSourceChecksum(identity.checksum);

  if (
    typeof identity.byteSize !== 'number' ||
    !Number.isSafeInteger(identity.byteSize) ||
    identity.byteSize <= 0
    || identity.byteSize > BOOK_SOURCE_MAX_PDF_BYTES
  ) {
    throw new SourceVersionError(`byteSize must be a positive safe integer no greater than ${BOOK_SOURCE_MAX_PDF_BYTES}.`);
  }
}

function assertBookSourceChecksum(value: unknown): asserts value is BookSourceChecksum {
  assertExactRecord(value, CHECKSUM_KEYS, 'Book Source checksum');

  const checksum = value as Record<string, unknown>;
  if (checksum.algorithm !== 'sha-256') {
    throw new SourceVersionError('checksum.algorithm must be "sha-256".');
  }
  if (typeof checksum.value !== 'string' || !SHA256_HEX.test(checksum.value)) {
    throw new SourceVersionError('checksum.value must be a 64-character SHA-256 hex digest.');
  }
}

function assertExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new SourceVersionError(`${label} must be a plain object.`);
  }

  const keys = Reflect.ownKeys(value).sort((left, right) => String(left).localeCompare(String(right)));
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => typeof key !== 'string' || key !== expected[index])
  ) {
    throw new SourceVersionError(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function assertSafeIdentifier(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) {
    throw new SourceVersionError(`${fieldName} must be a nonempty safe identifier.`);
  }
}

function assertSafeProviderObjectKey(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PROVIDER_OBJECT_KEY_LENGTH ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..') ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw new SourceVersionError('providerObjectKey must be a nonempty safe provider object key.');
  }
}
