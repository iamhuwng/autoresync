import { describe, expect, it, vi } from 'vitest';

import {
  createTrustedFirebaseSourceUploadRtdbTransaction,
} from './sourceUpload.firebaseRtdbTransaction';

const response = (
  body: unknown,
  options: { readonly status?: number; readonly etag?: string } = {},
) => new Response(body === null ? 'null' : JSON.stringify(body), {
  status: options.status ?? 200,
  headers: options.etag ? { etag: options.etag } : undefined,
});

describe('trusted Firebase Source Upload transaction adapter', () => {
  it('uses OAuth plus ETag If-Match and retries remote contention', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ revision: 1 }, { etag: '"one"' }))
      .mockResolvedValueOnce(response(null, { status: 412 }))
      .mockResolvedValueOnce(response({ revision: 1 }, { etag: '"two"' }))
      .mockResolvedValueOnce(response(null));
    const transaction = createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: 'https://db.example.test',
      accessTokenProvider: { async getAccessToken() { return 'trusted-token'; } },
      fetchImpl,
    });

    await expect(transaction({
      path: 'book_source_upload_accounts/account-1',
      expectedRevision: 1,
      update: (current: { revision: number } | null) => ({ revision: current!.revision + 1 }),
    })).resolves.toEqual({ committed: true, value: { revision: 2 } });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({
      headers: {
        Authorization: 'Bearer trusted-token',
        'X-Firebase-ETag': 'true',
      },
    });
    expect(fetchImpl.mock.calls[3]![1]).toMatchObject({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer trusted-token',
        'If-Match': '"two"',
      },
      body: '{"revision":2}',
    });
  });

  it('returns the fresh snapshot without writing when expected revision is stale', async () => {
    const fetchImpl = vi.fn(async () => response({ revision: 2 }, { etag: '"two"' }));
    const transaction = createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: 'https://db.example.test',
      accessTokenProvider: { async getAccessToken() { return 'trusted-token'; } },
      fetchImpl,
    });

    await expect(transaction({
      path: 'book_source_upload_accounts/account-1',
      expectedRevision: 1,
      update: () => ({ revision: 3 }),
    })).resolves.toEqual({ committed: false, value: { revision: 2 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects insecure URLs and noncanonical capacity paths before I/O', async () => {
    const fetchImpl = vi.fn();
    const token = { async getAccessToken() { return 'trusted-token'; } };
    expect(() => createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: 'http://db.example.test',
      accessTokenProvider: token,
      fetchImpl,
    })).toThrow('trusted_source_upload_database_url_invalid');
    const transaction = createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: 'https://db.example.test',
      accessTokenProvider: token,
      fetchImpl,
    });
    await expect(transaction({
      path: 'other_root/account-1',
      expectedRevision: 0,
      update: () => ({ revision: 1 }),
    })).rejects.toThrow('trusted_source_upload_path_invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
