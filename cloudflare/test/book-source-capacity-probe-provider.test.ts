import { describe, expect, it, vi } from 'vitest';
import { CapacityProbeProvider, createCapacityProbeProviderFromEnv } from '../src/book-source-worker/capacity-probe-provider';

const env = {
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'book_b2_primary', BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'private-bucket-id',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'private-book-pdfs', BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID: 'capacity-key-id',
  BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY: 'capacity-key-secret',
};
const allowed = (overrides: Record<string, unknown> = {}) => ({
  capabilities: ['listFiles'], buckets: [{ id: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID, name: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME }], namePrefix: null,
  ...overrides,
});
const authorization = (authority = allowed()) => Response.json({ authorizationToken: 'b2-token', apiInfo: { storageApi: {
  apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: env.BOOK_SOURCE_B2_ENDPOINT, allowed: authority,
} } });
const providerFor = (fetcher: typeof fetch) => new CapacityProbeProvider({
  endpoint: env.BOOK_SOURCE_B2_ENDPOINT, region: env.BOOK_SOURCE_B2_REGION, storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID,
  privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID, privateBucketName: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME,
  applicationKeyId: env.BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID, applicationKey: env.BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY, fetch: fetcher,
});

describe('Book Source capacity probe B2 provider', () => {
  it('uses only v4 list-file-versions, one <=1000 page, full bucket, and counts upload versions', async () => {
    let listCount = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('b2_authorize_account')) return authorization();
      listCount += 1;
      return listCount === 1
        ? Response.json({ files: [
          { action: 'upload', fileId: 'current', fileName: 'book.pdf', contentLength: 5 },
          { action: 'hide', fileId: 'hide', fileName: 'book.pdf', contentLength: 0 },
          { action: 'upload', fileId: 'retained-old', fileName: 'book.pdf', contentLength: 3 },
        ], nextFileName: 'next-name', nextFileId: 'next-id' })
        : Response.json({ files: [] });
    });
    const first = await providerFor(fetcher).readAccountTotalsPage({ storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID, privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID });
    expect(first).toMatchObject({ totalBytes: 8, objectCount: 2, continuation: expect.any(String) });
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://api004.backblazeb2.com/b2api/v4/b2_authorize_account');
    expect((fetcher.mock.calls[0]![1] as RequestInit).redirect).toBe('follow');
    expect(fetcher.mock.instances[0]).toBe(globalThis);
    const listCall = fetcher.mock.calls[1]!;
    expect(String(listCall[0])).toContain('/b2api/v4/b2_list_file_versions');
    expect((listCall[1] as RequestInit).method).toBe('POST');
    expect((listCall[1] as RequestInit).redirect).toBe('follow');
    expect(JSON.parse(String((listCall[1] as RequestInit).body))).toEqual({ bucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID, maxFileCount: 1000 });
    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain(expect.stringMatching(/b2_upload|b2_delete|b2_download/));
    await providerFor(fetcher).readAccountTotalsPage({ storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID, privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID, continuation: first.continuation });
    expect(JSON.parse(String((fetcher.mock.calls[3]![1] as RequestInit).body))).toMatchObject({ startFileName: 'next-name', startFileId: 'next-id' });
  });

  it('rejects broader capability, wrong bucket, non-null prefix, malformed env, and invalid input before list call', async () => {
    for (const authority of [
      allowed({ capabilities: ['listFiles', 'readFiles'] }), allowed({ buckets: [{ id: 'other', name: 'other-bucket' }] }), allowed({ namePrefix: 'book-source/' }),
    ]) {
      await expect(providerFor(vi.fn<typeof fetch>(async () => authorization(authority))).readAccountTotalsPage({
        storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID, privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID,
      })).rejects.toMatchObject({ code: 'unauthorized' });
    }
    expect(() => createCapacityProbeProviderFromEnv({ ...env, BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY: '' })).toThrow('source_provider_metadata_mismatch');
    const fetcher = vi.fn<typeof fetch>();
    await expect(providerFor(fetcher).readAccountTotalsPage({
      storageLocationId: 'wrong', privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID,
    })).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed when listFiles cannot account for unfinished or unknown provider actions', async () => {
    for (const action of ['start', 'future-action']) {
      const fetcher = vi.fn<typeof fetch>(async (url) => (
        String(url).includes('b2_authorize_account')
          ? authorization()
          : Response.json({
            files: [{ action, fileId: 'unfinished', fileName: 'unfinished.pdf', contentLength: 0 }],
          })
      ));
      await expect(providerFor(fetcher).readAccountTotalsPage({
        storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID,
        privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID,
      })).rejects.toMatchObject({ code: 'provider_drift' });
    }
  });

  it('aborts a stalled provider request at the bounded deadline', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    }));
    const pending = providerFor(fetcher).readAccountTotalsPage({
      storageLocationId: env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID,
      privateBucketId: env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID,
    });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(10_001);
    await rejection;
    vi.useRealTimers();
  });
});
