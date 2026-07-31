import { describe, expect, it } from 'vitest';

import {
  BackblazeB2SourceProvider,
  createBackblazeB2SourceProviderFromEnv,
  hasBackblazeB2SourceProviderConfiguration,
} from '../src/book-source-worker/backblaze-b2-source-provider';

const checksum = 'a'.repeat(64);
const identity = {
  bookId: 'book_1', sourceVersionId: 'source_1', storageLocationId: 'b2_book_primary', providerKind: 'backblaze-b2-s3',
  privateBucketId: 'book-pdfs', providerObjectKey: 'book-source/originals/source.pdf', providerFileId: '4_zabc',
  providerFileVersionId: '4_zabc', checksum: { algorithm: 'sha-256' as const, value: checksum }, byteSize: 6,
};

const createProvider = (fetcher: typeof fetch) => new BackblazeB2SourceProvider({
  endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004',
  storageLocationId: identity.storageLocationId, privateBucketId: identity.privateBucketId, privateBucketName: 'book-pdfs',
  objectKeyPrefix: 'book-source/',
  uploadCredentials: { applicationKeyId: 'upload-key-id', applicationKey: 'upload-key-secret' },
  metadataCredentials: { applicationKeyId: 'metadata-key-id', applicationKey: 'metadata-key-secret' },
  readCredentials: { applicationKeyId: 'read-key-id', applicationKey: 'read-key-secret' },
  fetch: fetcher,
  now: () => new Date('2026-07-22T00:00:00.000Z'), maxReadBytes: 8,
});

const authorityResponse = (keyId: string): Response => {
  const capabilities = keyId === 'upload-key-id' ? ['writeFiles']
    : keyId === 'metadata-key-id' ? ['readFiles', 'listFiles'] : ['readFiles'];
  return Response.json({
    authorizationToken: `temporary-${keyId}`,
    apiInfo: { storageApi: {
      apiUrl: 'https://api004.backblazeb2.com',
      s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com',
      allowed: {
        buckets: [{ id: identity.privateBucketId, name: 'book-pdfs' }],
        capabilities,
        namePrefix: 'book-source/',
      },
    } },
  });
};

const withValidatedAuthority = (
  next: (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response,
): typeof fetch => async (input, init) => {
  if (String(input).includes('b2_authorize_account')) {
    const encoded = new Headers(init?.headers).get('authorization')?.replace(/^Basic /u, '');
    const keyId = encoded ? atob(encoded).split(':', 1)[0] : '';
    return authorityResponse(keyId ?? '');
  }
  return next(input, init);
};

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
};

const fileInfoResponse = (overrides: Record<string, unknown> = {}): Response => Response.json({
  action: 'upload',
  bucketId: identity.privateBucketId,
  contentLength: identity.byteSize,
  contentType: 'application/pdf',
  fileId: identity.providerFileVersionId,
  fileName: identity.providerObjectKey,
  fileInfo: {
    'book-source-byte-size': String(identity.byteSize),
    'book-source-sha256': identity.checksum.value,
  },
  ...overrides,
});

describe('Backblaze B2 private Source provider adapter', () => {
  it('issues one short-lived exact-object S3 upload authorization with required signed headers', async () => {
    const provider = createProvider(withValidatedAuthority(() => new Response(null, { status: 500 })));
    const authorization = await provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind, privateBucketId: identity.privateBucketId,
      providerObjectKey: identity.providerObjectKey, expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:05:00.000Z', issuedAt: '2026-07-22T00:00:00.000Z',
    });
    const target = new URL(authorization.authorizationId);
    const replayAuthorization = await provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind, privateBucketId: identity.privateBucketId,
      providerObjectKey: identity.providerObjectKey, expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:05:00.000Z', issuedAt: '2026-07-22T00:00:00.000Z',
    });
    expect(replayAuthorization.authorizationId).toBe(authorization.authorizationId);
    expect(target.pathname).toBe(`/book-pdfs/${identity.providerObjectKey}`);
    expect(target.searchParams.get('X-Amz-Credential')).toContain('upload-key-id/');
    expect(target.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(target.searchParams.get('X-Amz-SignedHeaders'))
      .toBe('content-type;host;x-amz-content-sha256;x-amz-meta-book-source-byte-size;x-amz-meta-book-source-sha256');
    expect(target.searchParams.get('X-Amz-Signature'))
      .toBe('cdd456be381370aec6f5b750f25f2fe43bfa98f0910284dd9ba574fcbcfcbbfa');
    expect(authorization.requiredHeaders).toEqual({
      'content-type': 'application/pdf',
      'x-amz-content-sha256': checksum,
      'x-amz-meta-book-source-byte-size': '6',
      'x-amz-meta-book-source-sha256': checksum,
    });
    expect(authorization.requiredHeaders).not.toHaveProperty('if-none-match');
    expect(authorization.requiredHeaders).not.toHaveProperty('x-amz-checksum-sha256');
    expect(authorization.authorizationId).not.toContain('upload-key-secret');
    const differentPayload = await provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind,
      privateBucketId: identity.privateBucketId, providerObjectKey: identity.providerObjectKey,
      expectedChecksum: { algorithm: 'sha-256', value: 'b'.repeat(64) }, expectedByteSize: 7,
      expiresAt: '2026-07-22T00:05:00.000Z',
    });
    expect(new URL(differentPayload.authorizationId).searchParams.get('X-Amz-Signature'))
      .not.toBe(target.searchParams.get('X-Amz-Signature'));
    expect(differentPayload.requiredHeaders).toMatchObject({
      'x-amz-content-sha256': 'b'.repeat(64),
      'x-amz-meta-book-source-byte-size': '7',
    });
    const strictKey = "book-source/originals/source!'()*.pdf";
    const strictAuthorization = await provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind,
      privateBucketId: identity.privateBucketId, providerObjectKey: strictKey,
      expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:05:00.000Z',
    });
    expect(new URL(strictAuthorization.authorizationId).pathname)
      .toContain('source%21%27%28%29%2A.pdf');
    await expect(provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind, privateBucketId: identity.privateBucketId,
      providerObjectKey: '../escape.pdf', expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:05:00.000Z',
    })).rejects.toMatchObject({ code: 'metadata_mismatch' });
  });

  it('verifies exact immutable metadata, reads only bounded ranges, and rejects provider drift', async () => {
    const calls: CapturedRequest[] = [];
    const provider = createProvider(withValidatedAuthority(async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers) });
      if (String(input).includes('b2_get_file_info')) return fileInfoResponse();
      return new Response(new Uint8Array([2, 3]), { status: 206, headers: { 'content-range': 'bytes 2-3/6' } });
    }));
    await expect(provider.verifyCompletedObject({ expected: identity })).resolves.toMatchObject({ identity });
    await expect(provider.readBounded({ identity, range: { offset: 2, length: 2 } })).resolves.toEqual({ bytes: new Uint8Array([2, 3]), totalByteSize: 6, offset: 2 });
    expect(calls[1]?.headers.get('range')).toBe('bytes=2-3');
    expect(new URL(calls[0]!.url).searchParams.get('fileId')).toBe(identity.providerFileVersionId);
    expect(calls[0]?.headers.get('authorization')).toBe('temporary-metadata-key-id');
    expect(new URL(calls[1]!.url).searchParams.get('versionId')).toBe(identity.providerFileVersionId);
    await expect(provider.readBounded({ identity, range: { offset: 0 } })).rejects.toMatchObject({ code: 'metadata_mismatch' });
    await expect(provider.readBounded({ identity, range: { offset: 0, length: 2 } }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });
    await expect(provider.readObjectMetadata({ identity: {
      ...identity, providerFileId: '4_wrong', providerFileVersionId: '4_wrong',
    } })).rejects.toMatchObject({ code: 'provider_drift' });

    const oversizedRange = createProvider(withValidatedAuthority(() => new Response(
      new Uint8Array(20),
      { status: 206, headers: { 'content-range': 'bytes 0-1/6' } },
    )));
    await expect(oversizedRange.readBounded({ identity, range: { offset: 0, length: 2 } }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });

    const oversizedMetadata = createProvider(withValidatedAuthority(() => new Response(
      JSON.stringify({ padding: 'x'.repeat(65 * 1024) }),
      { status: 200 },
    )));
    await expect(oversizedMetadata.readObjectMetadata({ identity }))
      .rejects.toMatchObject({ code: 'metadata_mismatch' });
  });

  it('rejects distinct provider identifiers that exact B2 metadata cannot prove', async () => {
    const distinct = {
      ...identity,
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    };
    const provider = createProvider(withValidatedAuthority(() => fileInfoResponse({
      fileId: distinct.providerFileVersionId,
    })));

    await expect(provider.verifyCompletedObject({ expected: distinct }))
      .rejects.toMatchObject({ code: 'provider_drift' });
  });

  it('reads one bounded B2 total page and leaves accumulation to caller', async () => {
    const calls: Array<{ url: string; body: string | undefined }> = [];
    const provider = createProvider(withValidatedAuthority(async (input, init) => {
      const url = String(input); const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, body });
      if (url.includes('list_file_versions')) {
        const request = JSON.parse(body ?? '{}') as Record<string, unknown>;
        return request.startFileName === undefined ? Response.json({ files: [
          { action: 'upload', fileId: '4_zabc', fileName: identity.providerObjectKey, contentLength: 6 },
          { action: 'hide', fileId: '4_hide', fileName: identity.providerObjectKey, contentLength: 0 },
        ], nextFileName: 'book-source/next.pdf', nextFileId: '4_next' }) : Response.json({ files: [
          { action: 'upload', fileId: '4_next', fileName: 'book-source/next.pdf', contentLength: 4 },
        ] });
      }
      return Response.json({ fileId: '4_zabc', fileName: identity.providerObjectKey });
    }));
    const first = await provider.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId, privateBucketId: identity.privateBucketId, maxPageSize: 3,
    });
    expect(first).toMatchObject({ storageLocationId: identity.storageLocationId, privateBucketId: identity.privateBucketId, totalBytes: 6, objectCount: 1 });
    expect(first.continuation).toEqual(expect.any(String));
    expect(calls.filter((call) => call.url.includes('list_file_versions'))).toHaveLength(1);
    expect(JSON.parse(calls.find((call) => call.url.includes('list_file_versions'))!.body ?? '{}')).toMatchObject({
      prefix: 'book-source/',
      maxFileCount: 3,
    });

    await expect(provider.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId, privateBucketId: identity.privateBucketId, maxPageSize: 3,
      continuation: first.continuation,
    })).resolves.toEqual({ storageLocationId: identity.storageLocationId, privateBucketId: identity.privateBucketId, totalBytes: 4, objectCount: 1 });
    expect(calls.filter((call) => call.url.includes('list_file_versions'))).toHaveLength(2);
  });

  it('fails closed for B2 account-total continuation self-loops or invalid page sizes', async () => {
    const provider = createProvider(withValidatedAuthority(async (input) => {
      if (String(input).includes('list_file_versions')) return Response.json({
        files: [], nextFileName: 'book-source/same.pdf', nextFileId: '4_same',
      });
      return new Response(null, { status: 500 });
    }));
    const first = await provider.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId,
      privateBucketId: identity.privateBucketId,
    });
    await expect(provider.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId,
      privateBucketId: identity.privateBucketId,
      continuation: first.continuation,
    })).rejects.toMatchObject({ code: 'metadata_mismatch', retryable: false });
    await expect(provider.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId,
      privateBucketId: identity.privateBucketId,
      maxPageSize: 1_001,
    })).rejects.toMatchObject({ code: 'metadata_mismatch', retryable: false });
    const oversizedPage = createProvider(withValidatedAuthority(async (input) => {
      if (String(input).includes('list_file_versions')) return Response.json({ files: [
        { action: 'upload', fileId: '4_a', fileName: 'a.pdf', contentLength: 1 },
        { action: 'upload', fileId: '4_b', fileName: 'b.pdf', contentLength: 1 },
      ] });
      return new Response(null, { status: 500 });
    }));
    await expect(oversizedPage.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId,
      privateBucketId: identity.privateBucketId,
      maxPageSize: 1,
    })).rejects.toMatchObject({ code: 'metadata_mismatch', retryable: false });

    const outOfPrefixPage = createProvider(withValidatedAuthority(async (input) => {
      if (String(input).includes('list_file_versions')) return Response.json({ files: [
        { action: 'upload', fileId: '4_other', fileName: 'other-prefix/book.pdf', contentLength: 1 },
      ] });
      return new Response(null, { status: 500 });
    }));
    await expect(outOfPrefixPage.readAccountTotalsPage({
      storageLocationId: identity.storageLocationId,
      privateBucketId: identity.privateBucketId,
    })).rejects.toMatchObject({ code: 'metadata_mismatch', retryable: false });
  });

  it('fails closed for expired authorization, aborted calls, unauthorized provider responses, and unexpected full-object reads', async () => {
    const provider = createProvider(async () => new Response(null, { status: 403 }));
    await expect(provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind, privateBucketId: identity.privateBucketId,
      providerObjectKey: identity.providerObjectKey, expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'unauthorized', retryable: false });
    await expect(provider.authorizeUpload({
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind, privateBucketId: identity.privateBucketId,
      providerObjectKey: identity.providerObjectKey, expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      issuedAt: '2026-07-21T23:59:00.000Z', expiresAt: '2026-07-21T23:59:30.000Z',
    })).rejects.toMatchObject({ code: 'unauthorized', retryable: false });
    const aborted = new AbortController(); aborted.abort();
    await expect(provider.readObjectMetadata({ identity }, { signal: aborted.signal })).rejects.toMatchObject({ code: 'aborted' });
    await expect(provider.readObjectMetadata({ identity })).rejects.toMatchObject({ code: 'unauthorized', retryable: false });

    const failed = createProvider(async () => { throw new Error('provider-secret-response-body'); });
    const failure = await failed.readObjectMetadata({ identity }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'timeout', retryable: true });
    expect(String(failure)).not.toContain('provider-secret-response-body');
    expect(String(failure)).not.toContain('metadata-key-secret');

    const timedOut = createProvider(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), { once: true });
    }));
    await expect(timedOut.readObjectMetadata({ identity }, { timeoutMs: 5 }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });

    const controller = new AbortController();
    const inFlightAbort = createProvider(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      queueMicrotask(() => controller.abort());
    }));
    await expect(inFlightAbort.readObjectMetadata({ identity }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted', retryable: false });

    const conflicted = createProvider(withValidatedAuthority(() => new Response(null, { status: 409 })));
    await expect(conflicted.readObjectMetadata({ identity }))
      .rejects.toMatchObject({ code: 'conflict', retryable: true });
  });

  it('parses distinct named Worker bindings and rejects missing, master-shaped, or shared authority', () => {
    const env = {
      BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
      BOOK_SOURCE_B2_REGION: 'us-west-004',
      BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'b2_book_primary',
      BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'book-pdfs-id',
       BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'book-pdfs',
       BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/',
      BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: 'upload-key-id',
      BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: 'upload-key-secret',
      BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-key-id',
      BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-key-secret',
      BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'read-key-id',
      BOOK_SOURCE_B2_READ_APPLICATION_KEY: 'read-key-secret',
    };
    expect(hasBackblazeB2SourceProviderConfiguration(env)).toBe(true);
    expect(createBackblazeB2SourceProviderFromEnv(env)).toBeInstanceOf(BackblazeB2SourceProvider);
    expect(hasBackblazeB2SourceProviderConfiguration({ ...env, BOOK_SOURCE_B2_READ_APPLICATION_KEY: '' })).toBe(false);
    expect(hasBackblazeB2SourceProviderConfiguration({ ...env, BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'master-key-id' })).toBe(false);
    expect(hasBackblazeB2SourceProviderConfiguration({ ...env, BOOK_SOURCE_B2_REGION: 'us-east-005' })).toBe(false);
    expect(hasBackblazeB2SourceProviderConfiguration({
      ...env,
      BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: env.BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID,
      BOOK_SOURCE_B2_READ_APPLICATION_KEY: env.BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY,
    })).toBe(false);
    expect(hasBackblazeB2SourceProviderConfiguration({
      ...env,
      BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: env.BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID,
    })).toBe(false);
    expect(hasBackblazeB2SourceProviderConfiguration({
      ...env,
      BOOK_SOURCE_B2_READ_APPLICATION_KEY: env.BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY,
    })).toBe(false);
  });

  it('rejects broad, wrong-bucket, prefix-inconsistent, or endpoint-drifted operation authority', async () => {
    const providerFor = (
      allowed: Record<string, unknown>,
      s3ApiUrl = 'https://s3.us-west-004.backblazeb2.com',
      apiUrl = 'https://api004.backblazeb2.com',
    ) =>
      createProvider(async (input) => String(input).includes('b2_authorize_account')
        ? Response.json({
          authorizationToken: 'temporary-token',
          apiInfo: { storageApi: { apiUrl, s3ApiUrl, allowed } },
        })
        : new Response(null, { status: 500 }));
    const upload = {
      storageLocationId: identity.storageLocationId, providerKind: identity.providerKind,
      privateBucketId: identity.privateBucketId, providerObjectKey: identity.providerObjectKey,
      expectedChecksum: identity.checksum, expectedByteSize: identity.byteSize,
      expiresAt: '2026-07-22T00:05:00.000Z',
    };
    const bucket = [{ id: identity.privateBucketId, name: 'book-pdfs' }];
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles', 'deleteFiles'], namePrefix: null })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles', 'shareFiles'], namePrefix: null })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['readFiles', 'listFiles', 'shareFiles'], namePrefix: null })
      .readObjectMetadata({ identity })).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['readFiles', 'listFiles'], namePrefix: null })
      .readBounded({ identity, range: { offset: 0, length: 1 } })).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: [{ id: 'other-bucket', name: 'other-book-pdfs' }], capabilities: ['writeFiles'], namePrefix: null })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles'], namePrefix: 'other-prefix/' })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles'], namePrefix: null })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles'], namePrefix: 'book-source/originals/' })
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(providerFor({ buckets: bucket, capabilities: ['writeFiles'], namePrefix: 'book-source/' }, 'https://s3.us-east-005.backblazeb2.com')
      .authorizeUpload(upload)).rejects.toMatchObject({ code: 'provider_drift' });
    await expect(providerFor(
      { buckets: bucket, capabilities: ['writeFiles'], namePrefix: 'book-source/' },
      'https://s3.us-west-004.backblazeb2.com',
      'https://provider-drift.example.com',
    ).authorizeUpload(upload)).rejects.toMatchObject({ code: 'provider_drift' });
  });
});
