import { describe, expect, it } from 'vitest';

import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';
import { createBookSourceVersionMetadata } from './sourceVersion.service';

describe('normalizeBookSourceDisplayFilename', () => {
  it('normalizes Unicode compatibility forms, whitespace, and extension once for all owned writers', () => {
    expect(normalizeBookSourceDisplayFilename('  Ｃａｆｅ\u0301   packet.PDF  ')).toBe('Café packet.pdf');
    expect(normalizeBookSourceDisplayFilename('lesson\tpacket\r\nfinal.PDF')).toBe('lesson packet final.pdf');
    expect(createBookSourceVersionMetadata({
      sourceKey: 'unit-1',
      originalFilename: '  Ｃａｆｅ\u0301   packet.PDF  ',
      storage: {
        bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'location-1', providerKind: 'b2', privateBucketId: 'bucket-1',
        providerObjectKey: 'private/book-1/source-1.pdf', providerFileId: 'file-1', providerFileVersionId: 'version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, byteSize: 1,
      },
    }).originalFilename).toBe('Café packet.pdf');
  });

  it.each([
    'not-a-pdf.txt', 'name.pdf.exe', '../source.pdf', 'nested/source.pdf', 'nested\u2215source.pdf', 'nested／source.pdf', 'unsafe\u202Efdp.pdf', '.pdf', '', 'unsafe\u0000name.pdf', 'unsafe\u001Fname.pdf', 'unsafe\u007Fname.pdf',
  ])('rejects unsafe or non-PDF display metadata: %j', (filename) => {
    expect(() => normalizeBookSourceDisplayFilename(filename)).toThrow();
  });

  it('enforces the normalized display-filename length boundary', () => {
    expect(normalizeBookSourceDisplayFilename(`${'a'.repeat(251)}.pdf`)).toHaveLength(255);
    expect(() => normalizeBookSourceDisplayFilename(`${'a'.repeat(252)}.pdf`)).toThrow();
  });
});
