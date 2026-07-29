import { describe, expect, it, vi } from 'vitest';

import type {
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../src/types/bookSource.types.ts';
import {
  BackblazeB2ExactVersionCleanupAdapter,
  type BackblazeB2ExactVersionCleanupConfig,
} from '../src/book-source-worker/backblaze-b2-exact-version-cleanup-adapter';

const identity = {
  bookId: 'book_1',
  sourceVersionId: 'source_1',
  storageLocationId: 'b2_book_primary',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'book-pdfs-id',
  providerObjectKey: 'book-source/originals/source.pdf',
  providerFileId: '4_file',
  providerFileVersionId: '4_file',
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
  byteSize: 6,
};

const config = (fetcher: typeof fetch): BackblazeB2ExactVersionCleanupConfig => ({
  storageLocationId: identity.storageLocationId,
  privateBucketId: identity.privateBucketId,
  privateBucketName: 'book-pdfs',
  objectKeyPrefix: 'book-source/originals/',
  deleteCredentials: { applicationKeyId: 'delete-key-id', applicationKey: 'delete-key-secret' },
  metadataCredentials: { applicationKeyId: 'metadata-key-id', applicationKey: 'metadata-key-secret' },
  fetch: fetcher,
});

const authorization = (overrides: Record<string, unknown> = {}): Response => Response.json({
  authorizationToken: 'temporary-delete-token',
  apiInfo: { storageApi: {
    apiUrl: 'https://api004.backblazeb2.com',
    allowed: {
      capabilities: ['deleteFiles'],
      buckets: [{ id: identity.privateBucketId, name: 'book-pdfs' }],
      namePrefix: 'book-source/originals/',
      ...overrides,
    },
  } },
});

const deleteResponse = (overrides: Record<string, unknown> = {}): Response => Response.json({
  fileName: identity.providerObjectKey,
  fileId: identity.providerFileId,
  ...overrides,
});

const operation = {
  reservationId: 'reservation-1',
  sourceKey: 'unit-1',
  ownerId: 'teacher-1',
  kind: 'initial' as const,
  originalFilename: 'source.pdf',
  createdAt: '2026-07-29T00:00:00.000Z',
  expiresAt: '2026-07-29T00:15:00.000Z',
  status: 'cleanup_pending' as const,
  ...identity,
  expectedChecksum: identity.checksum,
};

const versionIdentity = (providerFileVersionId: string): BookSourceVersionStorageIdentity => ({
  ...identity,
  providerFileId: providerFileVersionId,
  providerFileVersionId,
});

const versionRow = (providerFileVersionId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  fileId: providerFileVersionId,
  fileName: identity.providerObjectKey,
  action: 'upload',
  contentType: 'application/pdf',
  contentLength: identity.byteSize,
  fileInfo: {
    'book-source-sha256': identity.checksum.value,
    'book-source-byte-size': String(identity.byteSize),
  },
  ...overrides,
});

const listResponse = (files: readonly Record<string, unknown>[], overrides: Record<string, unknown> = {}): Response =>
  Response.json({ files, ...overrides });

const authorizationForRequest = (request: Request): Response => {
  const encoded = request.headers.get('authorization')?.replace('Basic ', '') ?? '';
  const keyId = atob(encoded).split(':', 1)[0];
  return keyId === 'metadata-key-id'
    ? authorization({ capabilities: ['readFiles', 'listFiles'] })
    : authorization();
};

const provider = (deleteResult: Response | (() => Response) = deleteResponse()): {
  adapter: BackblazeB2ExactVersionCleanupAdapter;
  calls: Request[];
} => {
  const calls: Request[] = [];
  const fetcher: typeof fetch = vi.fn(async (input, init) => {
    const request = new Request(input, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
    });
    calls.push(request);
    if (request.url.includes('b2_authorize_account')) return authorization();
    return typeof deleteResult === 'function' ? deleteResult() : deleteResult;
  });
  return { adapter: new BackblazeB2ExactVersionCleanupAdapter(config(fetcher)), calls };
};

describe('Backblaze B2 exact-version cleanup adapter', () => {
  it('authorizes with dedicated deleteFiles capability and deletes exact recorded version', async () => {
    const { adapter, calls } = provider();

    await expect(adapter.deleteExactVersion({ identity })).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://api.backblazeb2.com/b2api/v4/b2_authorize_account');
    expect(atob(calls[0]?.headers.get('authorization')?.replace('Basic ', '') ?? '').split(':', 1)[0])
      .toBe('delete-key-id');
    expect(calls[1]?.url).toBe('https://api004.backblazeb2.com/b2api/v4/b2_delete_file_version');
    expect(calls[1]?.method).toBe('POST');
    await expect(calls[1]?.json()).resolves.toEqual({
      fileName: identity.providerObjectKey,
      fileId: identity.providerFileId,
    });
  });

  it('uses manual redirect handling so credentials are never forwarded', async () => {
    const redirects: (RequestRedirect | undefined)[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      redirects.push(init?.redirect);
      return String(input).includes('b2_authorize_account') ? authorization() : deleteResponse();
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await adapter.deleteExactVersion({ identity });
    expect(redirects).toEqual(['manual', 'manual']);
  });

  it('preserves the runtime fetch receiver instead of invoking it on the adapter', async () => {
    const fetcher = vi.fn(async function (this: unknown, input: RequestInfo | URL): Promise<Response> {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return String(input).includes('b2_authorize_account') ? authorization() : deleteResponse();
    }) as typeof fetch;
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.deleteExactVersion({ identity })).resolves.toBeUndefined();
  });

  it('resolves one exact unfinished object with metadata-only authority and proves absence', async () => {
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) {
        return authorization({ capabilities: ['readFiles', 'listFiles'] });
      }
      await expect(request.json()).resolves.toEqual({
        bucketId: identity.privateBucketId,
        prefix: identity.providerObjectKey,
        startFileName: identity.providerObjectKey,
        maxFileCount: 2,
      });
      return Response.json({
        files: [{
          fileId: identity.providerFileId,
          fileName: identity.providerObjectKey,
          action: 'upload',
          contentType: 'application/pdf',
          contentLength: identity.byteSize,
          fileInfo: {
            'book-source-sha256': identity.checksum.value,
            'book-source-byte-size': String(identity.byteSize),
          },
        }],
      });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));
    await expect(adapter.resolveExactVersion(operation)).resolves.toMatchObject({
      providerFileId: identity.providerFileId,
      providerFileVersionId: identity.providerFileId,
      providerObjectKey: identity.providerObjectKey,
    });

    const absentFetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      return request.url.includes('b2_authorize_account')
        ? authorization({ capabilities: ['readFiles', 'listFiles'] })
        : Response.json({ files: [] });
    });
    await expect(new BackblazeB2ExactVersionCleanupAdapter(config(absentFetcher))
      .resolveExactVersion(operation)).resolves.toBeNull();
  });

  it('treats only B2 file_not_present response as idempotent missing replay', async () => {
    const replay = provider(Response.json({ status: 400, code: 'file_not_present', message: 'missing' }, { status: 400 }));
    await expect(replay.adapter.deleteExactVersion({ identity }))
      .rejects.toMatchObject({ code: 'not_found', retryable: false });

    const genericMissing = provider(Response.json({ status: 404, message: 'missing' }, { status: 404 }));
    await expect(genericMissing.adapter.deleteExactVersion({ identity }))
      .rejects.toMatchObject({ code: 'metadata_mismatch', retryable: false });
  });

  it('rejects mismatched provider version in delete response', async () => {
    const mismatch = provider(Response.json({
      fileName: identity.providerObjectKey,
      fileId: identity.providerFileId,
      providerFileVersionId: '4_other',
    }));
    await expect(mismatch.adapter.deleteExactVersion({ identity }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });
  });

  it('rejects key-only, latest, and broad object-key deletion before provider calls', async () => {
    const { adapter, calls } = provider();
    await expect(adapter.deleteExactVersion({ identity: { providerObjectKey: identity.providerObjectKey } as never }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });
    await expect(adapter.deleteExactVersion({ identity: { ...identity, providerFileVersionId: 'latest' } }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });
    await expect(adapter.deleteExactVersion({ identity: { ...identity, providerFileVersionId: '4_other' } }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });
    await expect(adapter.deleteExactVersion({ identity: {
      ...identity, providerObjectKey: 'book-source/other/source.pdf',
    } })).rejects.toMatchObject({ code: 'metadata_mismatch' });
    expect(calls).toHaveLength(0);
  });

  it('rejects broad capabilities, bucket drift, and prefix drift from B2 authorization', async () => {
    const cases = [
      { capabilities: ['deleteFiles', 'readFiles'] },
      { buckets: [{ id: 'other-bucket', name: 'book-pdfs' }] },
      { namePrefix: 'book-source/' },
    ];
    for (const override of cases) {
      const calls: Request[] = [];
      const fetcher: typeof fetch = vi.fn(async (input, init) => {
        const request = new Request(input, {
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
        });
        calls.push(request);
        return authorization(override);
      });
      const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));
      await expect(adapter.deleteExactVersion({ identity })).rejects.toMatchObject({ code: 'unauthorized' });
      expect(calls).toHaveLength(1);
    }
  });

  it('rejects mismatched returned file/version identity', async () => {
    const wrongVersion = provider(deleteResponse({ fileId: '4_wrong_version' }));
    await expect(wrongVersion.adapter.deleteExactVersion({ identity }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });

    const wrongFile = provider(deleteResponse({ providerFileId: '4_wrong_file' }));
    await expect(wrongFile.adapter.deleteExactVersion({ identity }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });
  });

  it('redacts auth/provider/network failures and bounds aborts', async () => {
    const authFailure = provider(Response.json({ code: 'unauthorized', message: 'delete-key-secret' }, { status: 401 }));
    const authError = await authFailure.adapter.deleteExactVersion({ identity }).catch((error: unknown) => error);
    expect(authError).toMatchObject({ code: 'unauthorized', retryable: false });
    expect(String(authError)).not.toContain('delete-key-secret');

    const providerFailure = provider(Response.json({ code: 'server_error', message: 'provider-secret-body' }, { status: 500 }));
    const providerError = await providerFailure.adapter.deleteExactVersion({ identity }).catch((error: unknown) => error);
    expect(providerError).toMatchObject({ code: 'timeout', retryable: true });
    expect(String(providerError)).not.toContain('provider-secret-body');

    const networkFetcher: typeof fetch = vi.fn(async () => { throw new Error('network-delete-key-secret'); });
    const network = new BackblazeB2ExactVersionCleanupAdapter(config(networkFetcher));
    const networkError = await network.deleteExactVersion({ identity }).catch((error: unknown) => error);
    expect(networkError).toMatchObject({ code: 'timeout', retryable: true });
    expect(String(networkError)).not.toContain('network-delete-key-secret');

    const controller = new AbortController();
    controller.abort();
    const { adapter, calls } = provider();
    await expect(adapter.deleteExactVersion({ identity }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted', retryable: false });
    expect(calls).toHaveLength(0);

    const hangingFetcher: typeof fetch = vi.fn(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), { once: true });
    }));
    const hanging = new BackblazeB2ExactVersionCleanupAdapter(config(hangingFetcher));
    await expect(hanging.deleteExactVersion({ identity }, { timeoutMs: 5 }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });
  });

  it('deletes every uncommitted exact-key version and verifies provider absence', async () => {
    const deleteBodies: Record<string, unknown>[] = [];
    let deleted = false;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse(deleted ? [] : [versionRow('4_upload_1'), versionRow('4_upload_2')]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      if (deleteBodies.length === 2) deleted = true;
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .resolves.toBe('exact_versions_deleted');
    expect(deleteBodies).toEqual([
      { fileName: identity.providerObjectKey, fileId: '4_upload_1' },
      { fileName: identity.providerObjectKey, fileId: '4_upload_2' },
    ]);
  });

  it('accepts the real B2 null continuation terminator', async () => {
    const remaining = new Set(['4_upload_1', '4_upload_2']);
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
      });
      if (request.url.includes('b2_authorize_account')) {
        return authorizationForRequest(request);
      }
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse(
          [...remaining].map((fileId) => versionRow(fileId)),
          { nextFileName: null, nextFileId: null },
        );
      }
      const body = await request.json() as { fileId: string };
      remaining.delete(body.fileId);
      return deleteResponse({ fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .resolves.toBe('exact_versions_deleted');
    expect(remaining.size).toBe(0);
  });

  it('preserves committed identity and deletes every exact-key sibling version', async () => {
    const committed = versionIdentity('4_committed');
    const deleteBodies: Record<string, unknown>[] = [];
    let deleted = false;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse(deleted
          ? [versionRow('4_committed')]
          : [versionRow('4_sibling_1'), versionRow('4_committed'), versionRow('4_sibling_2')]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      if (deleteBodies.length === 2) deleted = true;
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation, preserveIdentity: committed }))
      .resolves.toBe('committed_version_preserved');
    expect(deleteBodies.map((body) => body.fileId)).toEqual(['4_sibling_1', '4_sibling_2']);
    expect(deleteBodies.some((body) => body.fileId === committed.providerFileVersionId)).toBe(false);
  });

  it('follows exact-key continuation pages and preserves a committed version found later', async () => {
    const committed = versionIdentity('4_committed');
    const deleteBodies: Record<string, unknown>[] = [];
    let deleted = false;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        const body = await request.json() as Record<string, unknown>;
        if (deleted) return listResponse([versionRow('4_committed')]);
        return body.startFileId === undefined
          ? listResponse(
            [versionRow('4_sibling_1')],
            { nextFileName: identity.providerObjectKey, nextFileId: 'continuation-1' },
          )
          : listResponse([versionRow('4_committed'), versionRow('4_sibling_2')]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      if (deleteBodies.length === 2) deleted = true;
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation, preserveIdentity: committed }))
      .resolves.toBe('committed_version_preserved');
    expect(deleteBodies.map((body) => body.fileId)).toEqual(['4_sibling_1', '4_sibling_2']);
  });

  it('rejects repeated exact-key continuation pairs before another provider page', async () => {
    let listCalls = 0;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      listCalls += 1;
      return listResponse([], {
        nextFileName: identity.providerObjectKey,
        nextFileId: 'same-continuation',
      });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });
    expect(listCalls).toBe(2);
  });

  it('bounds exact-key continuation pagination', async () => {
    let listCalls = 0;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      listCalls += 1;
      return listResponse([], {
        nextFileName: identity.providerObjectKey,
        nextFileId: `continuation-${listCalls}`,
      });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'reconciliation_bound_exceeded', retryable: true });
    expect(listCalls).toBe(8);
  });

  it('rejects rows outside the exact key before deletion', async () => {
    const deleteBodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse([
          versionRow('4_other_key', { fileName: 'book-source/originals/other.pdf' }),
          versionRow('4_exact'),
        ]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });
    expect(deleteBodies).toEqual([]);
  });

  it('bounds one cleanup attempt and leaves remaining versions retryable', async () => {
    const deleteBodies: Record<string, unknown>[] = [];
    const rows = Array.from({ length: 22 }, (_, index) => versionRow(`4_upload_${index}`));
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) return listResponse(rows);
      deleteBodies.push(await request.json() as Record<string, unknown>);
      return deleteResponse(deleteBodies.at(-1) ?? {});
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'reconciliation_bound_exceeded', retryable: true });
    expect(deleteBodies).toHaveLength(20);
  });

  it('makes deterministic progress across pages for 23 exact-key versions', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => versionRow(`4_upload_${index}`));
    const remaining = new Map(rows.map((row) => [String(row.fileId), row] as const));
    const deleteBodies: Record<string, unknown>[] = [];
    const authorizationKeyIds: string[] = [];
    const deleteCountsByAttempt: number[] = [];
    let listCalls = 0;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) {
        const encoded = request.headers.get('authorization')?.replace('Basic ', '') ?? '';
        const keyId = atob(encoded).split(':', 1)[0]!;
        authorizationKeyIds.push(keyId);
        if (keyId === 'metadata-key-id') deleteCountsByAttempt.push(0);
        return authorizationForRequest(request);
      }
      if (request.url.includes('b2_list_file_versions')) {
        listCalls += 1;
        const body = await request.json() as { startFileId?: unknown; maxFileCount?: unknown };
        expect(body.maxFileCount).toBe(22);
        const remainingIds = [...remaining.keys()];
        const startFileId = typeof body.startFileId === 'string' ? body.startFileId : undefined;
        const startIndex = startFileId === undefined ? 0 : remainingIds.indexOf(startFileId) + 1;
        expect(startIndex).toBeGreaterThanOrEqual(0);
        const pageIds = remainingIds.slice(startIndex, startIndex + 22);
        const nextFileId = pageIds.length > 0 && startIndex + pageIds.length < remainingIds.length
          ? pageIds.at(-1)
          : undefined;
        return listResponse(
          pageIds.map((fileId) => remaining.get(fileId)!),
          nextFileId === undefined
            ? { nextFileName: null, nextFileId: null }
            : { nextFileName: identity.providerObjectKey, nextFileId },
        );
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      deleteCountsByAttempt[deleteCountsByAttempt.length - 1]! += 1;
      remaining.delete(String(body.fileId));
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'reconciliation_bound_exceeded', retryable: true });
    expect(deleteCountsByAttempt).toEqual([20]);
    expect(remaining.size).toBe(3);

    await expect(adapter.reconcileOperationVersions({ operation }))
      .resolves.toBe('exact_versions_deleted');
    expect(deleteCountsByAttempt).toEqual([20, 3]);
    expect(remaining.size).toBe(0);
    expect(listCalls).toBe(4);
    expect(authorizationKeyIds).toEqual([
      'metadata-key-id', 'delete-key-id', 'metadata-key-id', 'delete-key-id',
    ]);
    expect(deleteBodies).toHaveLength(23);
    expect(deleteBodies.every((body) => body.fileName === identity.providerObjectKey)).toBe(true);
  });

  it('preserves a committed immutable version while multi-page cleanup retries progress', async () => {
    const committed = versionIdentity('4_committed');
    const rows = [
      ...Array.from({ length: 22 }, (_, index) => versionRow(`4_sibling_${index}`)),
      versionRow(committed.providerFileVersionId),
    ];
    const remaining = new Map(rows.map((row) => [String(row.fileId), row] as const));
    const deleteBodies: Record<string, unknown>[] = [];
    const deleteCountsByAttempt: number[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) {
        const encoded = request.headers.get('authorization')?.replace('Basic ', '') ?? '';
        const keyId = atob(encoded).split(':', 1)[0]!;
        if (keyId === 'metadata-key-id') deleteCountsByAttempt.push(0);
        return authorizationForRequest(request);
      }
      if (request.url.includes('b2_list_file_versions')) {
        const body = await request.json() as { startFileId?: unknown };
        const remainingIds = [...remaining.keys()];
        const startFileId = typeof body.startFileId === 'string' ? body.startFileId : undefined;
        const startIndex = startFileId === undefined ? 0 : remainingIds.indexOf(startFileId) + 1;
        const pageIds = remainingIds.slice(startIndex, startIndex + 22);
        const nextFileId = pageIds.length > 0 && startIndex + pageIds.length < remainingIds.length
          ? pageIds.at(-1)
          : undefined;
        return listResponse(
          pageIds.map((fileId) => remaining.get(fileId)!),
          nextFileId === undefined
            ? { nextFileName: null, nextFileId: null }
            : { nextFileName: identity.providerObjectKey, nextFileId },
        );
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      deleteCountsByAttempt[deleteCountsByAttempt.length - 1]! += 1;
      remaining.delete(String(body.fileId));
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation, preserveIdentity: committed }))
      .rejects.toMatchObject({ code: 'reconciliation_bound_exceeded', retryable: true });
    expect(deleteCountsByAttempt).toEqual([20]);
    expect(deleteBodies.some((body) => body.fileId === committed.providerFileVersionId)).toBe(false);

    await expect(adapter.reconcileOperationVersions({ operation, preserveIdentity: committed }))
      .resolves.toBe('committed_version_preserved');
    expect(deleteCountsByAttempt).toEqual([20, 2]);
    expect(deleteBodies.some((body) => body.fileId === committed.providerFileVersionId)).toBe(false);
    expect([...remaining.keys()]).toEqual([committed.providerFileVersionId]);
  });

  it('rejects a missing or drifted committed version instead of deleting siblings', async () => {
    const deleteBodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse([versionRow('4_committed', { contentLength: identity.byteSize + 1 })]);
      }
      deleteBodies.push(await request.json() as Record<string, unknown>);
      return deleteResponse();
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({
      operation,
      preserveIdentity: versionIdentity('4_committed'),
    }))
      .rejects.toMatchObject({ code: 'provider_drift', retryable: false });
    expect(deleteBodies).toEqual([]);
  });

  it('propagates partial deletion failure without releasing cleanup', async () => {
    const deleteBodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        return listResponse([versionRow('4_upload_1'), versionRow('4_upload_2')]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      return body.fileId === '4_upload_1'
        ? deleteResponse({ fileName: body.fileName, fileId: body.fileId })
        : Response.json({ code: 'server_error' }, { status: 503 });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });
    expect(deleteBodies.map((body) => body.fileId)).toEqual(['4_upload_1', '4_upload_2']);
  });

  it('makes repeated cleanup replay idempotent after exact-key absence is observed', async () => {
    let deleted = false;
    let listCalls = 0;
    const deleteBodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      if (request.url.includes('b2_authorize_account')) return authorizationForRequest(request);
      if (request.url.includes('b2_list_file_versions')) {
        listCalls += 1;
        return listResponse(deleted ? [] : [versionRow('4_upload_1')]);
      }
      const body = await request.json() as Record<string, unknown>;
      deleteBodies.push(body);
      deleted = true;
      return deleteResponse({ fileName: body.fileName, fileId: body.fileId });
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({ operation }))
      .resolves.toBe('exact_versions_deleted');
    await expect(adapter.reconcileOperationVersions({ operation }))
      .resolves.toBe('provider_absent');

    expect(listCalls).toBe(4);
    expect(deleteBodies).toEqual([{ fileName: identity.providerObjectKey, fileId: '4_upload_1' }]);
  });

  it('rejects a committed identity not present under the exact operation key', async () => {
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, { method: init?.method, headers: init?.headers, body: init?.body });
      return request.url.includes('b2_authorize_account')
        ? authorizationForRequest(request)
        : listResponse([versionRow('4_sibling')]);
    });
    const adapter = new BackblazeB2ExactVersionCleanupAdapter(config(fetcher));

    await expect(adapter.reconcileOperationVersions({
      operation,
      preserveIdentity: versionIdentity('4_committed'),
    })).rejects.toMatchObject({ code: 'provider_drift', retryable: false });
  });
});
