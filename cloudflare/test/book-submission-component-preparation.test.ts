import { describe, expect, it, vi } from 'vitest';
import {
  ComponentPdfPreparationError,
  prepareTrustedComponentPdf,
  readSourceBytesFromProvider,
  type TrustedComponentSource,
} from '../src/upload-worker/book-submission/component-preparation';

const checksum = 'a'.repeat(64);
const sourceSet = {
  sourceStrategy: 'component_pdfs' as const,
  sources: [
    { sourceKey: 'part-a', sourceVersionId: 'version-a', sourceOrder: 1, ownerNodeKey: 'unit-a' },
    { sourceKey: 'part-b', sourceVersionId: 'version-b', sourceOrder: 2, ownerNodeKey: 'unit-b' },
  ] as const,
};

const trusted = (sourceKey: string, sourceVersionId: string, bytes: number): TrustedComponentSource => ({
  sourceKey, sourceVersionId,
  identity: {
    bookId: 'book-1', sourceVersionId, storageLocationId: 'location', providerKind: 'provider',
    privateBucketId: 'bucket', providerObjectKey: `book-source/${sourceVersionId}.pdf`,
    providerFileId: `file-${sourceVersionId}`, providerFileVersionId: `version-${sourceVersionId}`,
    checksum: { algorithm: 'sha-256', value: checksum }, byteSize: bytes,
  },
  checksum: { algorithm: 'sha-256', value: checksum }, byteSize: bytes, physicalPageCount: 1,
});

describe('trusted component PDF preparation', () => {
  it('reads trusted ranges, uploads the rebuilt document, and persists it inactive', async () => {
    const sourceBytes = new Map([
      ['version-a', new Uint8Array([37, 80, 68, 70, 45])],
      ['version-b', new Uint8Array([37, 80, 68, 70, 45, 49])],
    ]);
    const provider = {
      readBounded: vi.fn(async ({ identity, range }: any) => {
        const bytes = sourceBytes.get(identity.sourceVersionId)!;
        return { bytes: bytes.slice(range.offset, range.offset + range.length), offset: range.offset,
          totalByteSize: bytes.byteLength, contentIdentity: identity };
      }),
    };
    const upload = vi.fn(async () => ({ sourceVersionId: 'student-version', sha256Hex: checksum,
      byteSize: 11, physicalPageCount: 2, verifiedUsable: true as const, studentSafeStatus: 'ready' as const }));
    const persist = vi.fn(async () => undefined);
    const result = await prepareTrustedComponentPdf({ operationId: 'operation-1', ownerId: 'owner-1', bookId: 'book-1', fingerprint: checksum,
      descriptorRevision: 1, sourceSet, dependencies: {
        sourceProvider: provider,
        readSource: async ({ sourceKey, sourceVersionId }) => trusted(sourceKey, sourceVersionId, sourceBytes.get(sourceVersionId)!.byteLength),
        compose: async () => ({ bytes: new Uint8Array(11), sha256Hex: checksum,
          mapping: [
            { componentIndex: 0, fileName: 'part-a.pdf', pageCount: 1, startPage: 1, endPage: 1 },
            { componentIndex: 1, fileName: 'part-b.pdf', pageCount: 1, startPage: 2, endPage: 2 },
          ],
          inputManifest: [
            { componentIndex: 0, sha256Hex: checksum, byteSize: 5, pageCount: 1 },
            { componentIndex: 1, sha256Hex: checksum, byteSize: 6, pageCount: 1 },
          ],
        }), uploadStudentDocument: upload, persistPreparedArtifact: persist,
      },
    });

    expect(provider.readBounded).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-1', physicalPageCount: 2 }));
    expect(result.active).toBe(false);
    expect(result.fingerprint).toBe(checksum);
    expect(result.descriptor.sourceVersionId).toBe('student-version');
    expect(result.sourceReceipts[0]).not.toHaveProperty('identity');
    expect(persist).toHaveBeenCalledWith(result);
  });

  it('fails closed when composition identity differs from trusted source bytes', async () => {
    const source = trusted('part-a', 'version-a', 5);
    await expect(prepareTrustedComponentPdf({ operationId: 'operation-1', ownerId: 'owner-1', bookId: 'book-1', fingerprint: checksum,
      descriptorRevision: 1, sourceSet, dependencies: {
        sourceProvider: { readBounded: async ({ identity, range }: any) => ({
          bytes: new Uint8Array(range.length), offset: range.offset, totalByteSize: identity.byteSize, contentIdentity: identity,
        }) },
        readSource: async ({ sourceKey, sourceVersionId }) => sourceKey === 'part-a' ? source : trusted(sourceKey, sourceVersionId, 6),
        compose: async () => ({ bytes: new Uint8Array([1]), sha256Hex: checksum,
          mapping: [{ componentIndex: 0, fileName: 'part-a.pdf', pageCount: 1, startPage: 1, endPage: 1 },
            { componentIndex: 1, fileName: 'part-b.pdf', pageCount: 1, startPage: 2, endPage: 2 }],
          inputManifest: [{ componentIndex: 0, sha256Hex: 'b'.repeat(64), byteSize: 5, pageCount: 1 },
            { componentIndex: 1, sha256Hex: checksum, byteSize: 6, pageCount: 1 }],
        }),
        uploadStudentDocument: async () => { throw new Error('must not upload'); },
        persistPreparedArtifact: async () => { throw new Error('must not persist'); },
      },
    })).rejects.toMatchObject({ code: 'source_checksum_mismatch' });
  });

  it('reads provider bytes in bounded contiguous ranges', async () => {
    const identity = trusted('part-a', 'version-a', 70_000).identity;
    const bytes = new Uint8Array(identity.byteSize);
    const provider = { readBounded: vi.fn(async ({ range }: any) => ({ bytes: bytes.slice(range.offset, range.offset + range.length),
      offset: range.offset, totalByteSize: bytes.byteLength })) };
    const result = await readSourceBytesFromProvider(provider, identity, { rangeBytes: 65_536 });
    expect(result.byteLength).toBe(70_000);
    expect(provider.readBounded).toHaveBeenCalledTimes(2);
    expect(provider.readBounded.mock.calls.map(([value]) => value.range)).toEqual([
      { offset: 0, length: 65_536 }, { offset: 65_536, length: 4_464 },
    ]);
  });

  it('rejects provider range gaps', async () => {
    const identity = trusted('part-a', 'version-a', 5).identity;
    await expect(readSourceBytesFromProvider({ readBounded: async () => ({
      bytes: new Uint8Array(5), offset: 1, totalByteSize: 5,
    }) }, identity)).rejects.toMatchObject(new ComponentPdfPreparationError('source_identity_mismatch'));
  });
});
