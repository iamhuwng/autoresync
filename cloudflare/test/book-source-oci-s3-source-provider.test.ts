import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OCI_S3_PROVIDER_KIND,
  OciS3SourceProvider,
  clearOciS3MetadataCacheForTests,
  createOciS3SourceProviderFromEnv,
} from '../src/book-source-worker/oci-s3-source-provider';
import { resolveBookSourceProviderWiring } from '../src/book-source-worker/source-provider-wiring';

const ENDPOINT = 'https://axgsodluzsdz.compat.objectstorage.ap-singapore-1.oraclecloud.com';
const REGION = 'ap-singapore-1';
const STORAGE_LOCATION_ID = 'oci_book_primary';
const BUCKET = 'luyentap-bookpdf-qa';
const PREFIX = 'book-source/qualification-qa/';
const CHECKSUM = 'a'.repeat(64);
const NOW = new Date('2026-11-25T07:00:00.000Z');

const ociEnv = {
  BOOK_SOURCE_OCI_PROVIDER_STATE: 'enabled',
  BOOK_SOURCE_OCI_ENDPOINT: ENDPOINT,
  BOOK_SOURCE_OCI_REGION: REGION,
  BOOK_SOURCE_OCI_STORAGE_LOCATION_ID: STORAGE_LOCATION_ID,
  BOOK_SOURCE_OCI_PRIVATE_BUCKET_NAME: BUCKET,
  BOOK_SOURCE_OCI_OBJECT_KEY_PREFIX: PREFIX,
  BOOK_SOURCE_OCI_ACCESS_KEY_ID: 'oci-access-key-id',
  BOOK_SOURCE_OCI_SECRET_ACCESS_KEY: 'oci-secret-access-key',
};

const baseIdentity = Object.freeze({
  bookId: 'book-1',
  sourceVersionId: 'source-v1',
  storageLocationId: STORAGE_LOCATION_ID,
  providerKind: OCI_S3_PROVIDER_KIND,
  privateBucketId: BUCKET,
  providerObjectKey: `${PREFIX}book-1/source-v1.pdf`,
  providerFileId: '3f7ac417-da02-4214-8ea9-d5a3fb55d7b4',
  providerFileVersionId: '3f7ac417-da02-4214-8ea9-d5a3fb55d7b4',
  checksum: Object.freeze({ algorithm: 'sha-256' as const, value: CHECKSUM }),
  byteSize: 30,
});

afterEach(() => {
  clearOciS3MetadataCacheForTests();
});

describe('OciS3SourceProvider', () => {
  it('signs direct presigned PUT URLs with required headers and UNSIGNED-PAYLOAD', async () => {
    const provider = createOciS3SourceProviderFromEnv(ociEnv, { now: () => NOW });
    const authorization = await provider.authorizeUpload({
      storageLocationId: STORAGE_LOCATION_ID,
      providerKind: OCI_S3_PROVIDER_KIND,
      privateBucketId: BUCKET,
      providerObjectKey: `${PREFIX}book-1/source-v1.pdf`,
      expectedChecksum: { algorithm: 'sha-256', value: CHECKSUM },
      expectedByteSize: 30,
      expiresAt: '2026-11-25T07:05:00.000Z',
    });

    const url = new URL(authorization.authorizationId);
    expect(url.origin).toBe(ENDPOINT);
    expect(url.pathname).toBe(`/${BUCKET}/${PREFIX}book-1/source-v1.pdf`);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(`oci-access-key-id/20261125/${REGION}/s3/aws4_request`);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-type;host;x-amz-content-sha256;x-amz-meta-book-source-byte-size;x-amz-meta-book-source-sha256',
    );
    expect(authorization.requiredHeaders).toEqual({
      'content-type': 'application/pdf',
      'x-amz-content-sha256': CHECKSUM,
      'x-amz-meta-book-source-byte-size': '30',
      'x-amz-meta-book-source-sha256': CHECKSUM,
    });
  });

  it('resolves a completed upload via ListObjectVersions + uncached exact-version HEAD', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === 'GET' && url.searchParams.has('versions')) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>${baseIdentity.providerObjectKey}</Key><VersionId>${baseIdentity.providerFileVersionId}</VersionId><Size>30</Size></Version></ListVersionsResult>`,
          { status: 200, headers: { 'content-type': 'application/xml' } },
        );
      }
      if (init?.method === 'GET' && url.searchParams.get('versionId') === baseIdentity.providerFileVersionId) {
        return new Response(new Uint8Array([0x25]), {
          status: 206,
          headers: {
            'content-type': 'application/pdf',
            'content-range': 'bytes 0-0/30',
            'content-length': '1',
            'x-amz-version-id': baseIdentity.providerFileVersionId,
            'x-amz-meta-book-source-byte-size': '30',
            'x-amz-meta-book-source-sha256': CHECKSUM,
          },
        });
      }
      return new Response(null, { status: 404 });
    });

    const provider = createOciS3SourceProviderFromEnv(ociEnv, { fetch: fetchMock as typeof fetch, now: () => NOW });
    const resolved = await provider.resolveCompletedObject({
      expected: {
        bookId: baseIdentity.bookId,
        sourceVersionId: baseIdentity.sourceVersionId,
        storageLocationId: baseIdentity.storageLocationId,
        providerKind: baseIdentity.providerKind,
        privateBucketId: baseIdentity.privateBucketId,
        providerObjectKey: baseIdentity.providerObjectKey,
        checksum: baseIdentity.checksum,
        byteSize: baseIdentity.byteSize,
      },
    });

    expect(resolved).toEqual({
      identity: baseIdentity,
      contentType: 'application/pdf',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches verified readObjectMetadata within TTL while preserving caller identity reference', async () => {
    let nowMs = NOW.getTime();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([0x25]), {
      status: 206,
      headers: {
        'content-type': 'application/pdf',
        'content-range': 'bytes 0-0/30',
        'content-length': '1',
        'x-amz-version-id': baseIdentity.providerFileVersionId,
        'x-amz-meta-book-source-byte-size': '30',
        'x-amz-meta-book-source-sha256': CHECKSUM,
      },
    }));

    const provider = createOciS3SourceProviderFromEnv(ociEnv, {
      fetch: fetchMock as typeof fetch,
      now: () => new Date(nowMs),
      metadataCacheTtlMs: 60_000,
    });

    const firstIdentity = { ...baseIdentity };
    const first = await provider.readObjectMetadata({ identity: firstIdentity });
    expect(first.identity).toBe(firstIdentity);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondIdentity = { ...baseIdentity };
    const second = await provider.readObjectMetadata({ identity: secondIdentity });
    expect(second.identity).toBe(secondIdentity);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowMs += 60_001;
    const third = await provider.readObjectMetadata({ identity: secondIdentity });
    expect(third.identity).toBe(secondIdentity);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads bounded byte ranges and suffix ranges with exact versionId', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('versionId')).toBe(baseIdentity.providerFileVersionId);
      const rangeHeader = new Headers(init?.headers).get('range');
      if (rangeHeader === 'bytes=0-8') {
        return new Response(new TextEncoder().encode('%PDF-1.4\n'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-8/30', 'content-length': '9' },
        });
      }
      if (rangeHeader === 'bytes=-6') {
        return new Response(new TextEncoder().encode('%%EOF\n'), {
          status: 206,
          headers: { 'content-range': 'bytes 24-29/30', 'content-length': '6' },
        });
      }
      return new Response(null, { status: 416 });
    });

    const provider = createOciS3SourceProviderFromEnv(ociEnv, { fetch: fetchMock as typeof fetch, now: () => NOW });
    const headChunk = await provider.readBounded({
      identity: baseIdentity,
      range: { offset: 0, length: 9 },
    });
    expect(new TextDecoder().decode(headChunk.bytes)).toBe('%PDF-1.4\n');
    expect(headChunk.offset).toBe(0);
    expect(headChunk.totalByteSize).toBe(30);

    const tailChunk = await provider.readBounded({
      identity: baseIdentity,
      range: { suffixLength: 6 },
    });
    expect(new TextDecoder().decode(tailChunk.bytes)).toBe('%%EOF\n');
    expect(tailChunk.offset).toBe(24);
  });

  it('paginates ListObjectVersions for readAccountTotalsPage and ignores delete markers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (!url.searchParams.has('key-marker')) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult><IsTruncated>true</IsTruncated><NextKeyMarker>${PREFIX}book-2/v1.pdf</NextKeyMarker><NextVersionIdMarker>v-next</NextVersionIdMarker><Version><Key>${PREFIX}book-1/v1.pdf</Key><VersionId>v-1</VersionId><Size>1200</Size></Version><DeleteMarker><Key>${PREFIX}book-1/old.pdf</Key><VersionId>dm-1</VersionId></DeleteMarker></ListVersionsResult>`,
          { status: 200 },
        );
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult><IsTruncated>false</IsTruncated><Version><Key>${PREFIX}book-2/v1.pdf</Key><VersionId>v-2</VersionId><Size>800</Size></Version></ListVersionsResult>`,
        { status: 200 },
      );
    });

    const provider = createOciS3SourceProviderFromEnv(ociEnv, { fetch: fetchMock as typeof fetch, now: () => NOW });
    const page1 = await provider.readAccountTotalsPage({
      storageLocationId: STORAGE_LOCATION_ID,
      privateBucketId: BUCKET,
    });
    expect(page1.totalBytes).toBe(1200);
    expect(page1.objectCount).toBe(1);
    expect(page1.continuation).toBeTruthy();

    const page2 = await provider.readAccountTotalsPage({
      storageLocationId: STORAGE_LOCATION_ID,
      privateBucketId: BUCKET,
      continuation: page1.continuation,
    });
    expect(page2.totalBytes).toBe(800);
    expect(page2.objectCount).toBe(1);
    expect(page2.continuation).toBeUndefined();
  });

  it('rejects endpoint/region mismatch and ambiguous dual-enabled provider wiring', () => {
    expect(() => new OciS3SourceProvider({
      endpoint: ENDPOINT,
      region: 'us-ashburn-1',
      storageLocationId: STORAGE_LOCATION_ID,
      privateBucketName: BUCKET,
      objectKeyPrefix: PREFIX,
      credentials: { accessKeyId: 'k', secretAccessKey: 's' },
    })).toThrow();

    expect(() => resolveBookSourceProviderWiring({
      ...ociEnv,
      BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
    })).toThrow();

    const wired = resolveBookSourceProviderWiring(ociEnv);
    expect(wired.state).toBe('enabled');
    if (wired.state === 'enabled') {
      expect(wired.providerKind).toBe(OCI_S3_PROVIDER_KIND);
      expect(wired.providerTag).toBe('oci');
      expect(wired.privateBucketId).toBe(BUCKET);
    }
  });
});
