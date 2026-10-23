import { describe, expect, it } from 'vitest';
import { BackblazeB2SourceProvider } from '../src/book-source-worker/backblaze-b2-source-provider';

const roles = { upload: ['writeFiles'], metadata: ['listFiles', 'readFiles'], read: ['readFiles'] };
const identity = { bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'b2_book_primary', providerKind: 'backblaze-b2-s3', privateBucketId: 'bucket-1', providerObjectKey: 'book-source/test.pdf', providerFileId: 'file-1', providerFileVersionId: 'file-1', checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, byteSize: 2 };
function provider(capabilities: string[], prefix = 'book-source/', bucketId = 'bucket-1') {
  return new BackblazeB2SourceProvider({ endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004', storageLocationId: identity.storageLocationId, privateBucketId: 'bucket-1', privateBucketName: 'book-pdfs', objectKeyPrefix: 'book-source/',
    uploadCredentials: { applicationKeyId: 'upload-key', applicationKey: 'upload-secret' }, metadataCredentials: { applicationKeyId: 'metadata-key', applicationKey: 'metadata-secret' }, readCredentials: { applicationKeyId: 'read-key', applicationKey: 'read-secret' },
    now: () => new Date('2026-10-19T00:00:00.000Z'),
    fetch: async (url) => String(url).includes('b2_authorize_account') ? Response.json({ authorizationToken: 'temporary', apiInfo: { storageApi: { apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com', allowed: { capabilities, buckets: [{ id: bucketId, name: 'book-pdfs' }], namePrefix: prefix } } } }) : String(url).includes('b2_list_file_versions') ? Response.json({ files: [] }) : new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'content-range': 'bytes 0-1/2' } }),
  });
}
function request(p: BackblazeB2SourceProvider, role: keyof typeof roles) {
  if (role === 'metadata') return p.readAccountTotalsPage({ storageLocationId: identity.storageLocationId, privateBucketId: 'bucket-1' });
  if (role === 'read') return p.readBounded({ identity, range: { offset: 0, length: 2 } });
  return p.authorizeUpload({ ...identity, expectedChecksum: identity.checksum, expectedByteSize: 2, issuedAt: '2026-10-19T00:00:00.000Z', expiresAt: '2026-10-19T00:05:00.000Z' });
}
describe('restricted B2 role credentials', () => {
  it.each(['upload', 'metadata', 'read'] as const)('accepts exact %s capabilities and rejects added authority', async (role) => {
    await expect(request(provider(roles[role]), role)).resolves.toBeDefined();
    await expect(request(provider([...roles[role], 'deleteFiles']), role)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(request(provider(roles[role], 'book-source/other/'), role)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(request(provider(roles[role], 'book-source/', 'foreign-bucket'), role)).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('rejects a read key used for metadata listing and a write key used for reading', async () => {
    await expect(request(provider(roles.read), 'metadata')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(request(provider(roles.upload), 'read')).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
