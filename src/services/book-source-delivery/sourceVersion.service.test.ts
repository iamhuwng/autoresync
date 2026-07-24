import { describe, expect, it } from 'vitest';

import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import { createBookSourceVersionStorageIdentity } from './sourceVersion.service';

describe('createBookSourceVersionStorageIdentity', () => {
  it('accepts exactly 500 MiB and rejects one byte more', () => {
    expect(() => createBookSourceVersionStorageIdentity(identity(BOOK_SOURCE_MAX_PDF_BYTES))).not.toThrow();
    expect(() => createBookSourceVersionStorageIdentity(identity(BOOK_SOURCE_MAX_PDF_BYTES + 1))).toThrow('no greater than');
  });
});

function identity(byteSize: number) {
  return {
    bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'location-1', providerKind: 'b2', privateBucketId: 'bucket-1',
    providerObjectKey: 'private/book-1/source-1.pdf', providerFileId: 'file-1', providerFileVersionId: 'version-1',
    checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, byteSize,
  };
}
