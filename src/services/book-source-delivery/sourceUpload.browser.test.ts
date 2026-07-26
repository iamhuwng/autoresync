import { describe, expect, it, vi } from 'vitest';
import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import {
  inspectSourcePdf,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import {
  SourceUploadBrowserError,
  uploadSourcePdfDirect,
} from './sourceUpload.browser';

const checksum = 'a'.repeat(64);
const bytes = new TextEncoder().encode('%PDF-1.4');
const uploadUrl = 'https://s3.us-west-004.backblazeb2.com/private-book/exact.pdf?X-Amz-Signature=one';
const allowedB2Origins = ['https://s3.us-west-004.backblazeb2.com'];

const inspect = async (
  file: File,
): Promise<SourcePdfInspectionClaim> => inspectSourcePdf(file, {
  __testDependencies: {
    readArrayBuffer: async () => bytes.buffer,
    digestSha256: async () => Uint8Array.from({ length: 32 }, () => 0xaa).buffer,
    loadPdfDocument: async () => ({ promise: Promise.resolve({ numPages: 2 }) }),
  },
});

const authority = (overrides: Record<string, unknown> = {}) => ({
  url: uploadUrl,
  expiresAt: '2099-07-26T00:00:00.000Z',
  requiredHeaders: {
    'content-type': 'application/pdf',
    'x-amz-content-sha256': checksum,
    'x-amz-meta-book-source-byte-size': String(bytes.byteLength),
    'x-amz-meta-book-source-sha256': checksum,
  },
  ...overrides,
});

const streamBytes = (value = bytes): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(value);
      controller.close();
    },
  });

const providerResponse = (
  responseUrl = uploadUrl,
  init: ResponseInit = {},
): Response => {
  const response = new Response(null, {
    status: 200,
    headers: {
      'x-amz-version-id': '4_version',
      'x-bz-file-id': '4_file',
    },
    ...init,
  });
  Object.defineProperties(response, {
    redirected: { configurable: true, value: false },
    url: { configurable: true, value: responseUrl },
  });
  return response;
};

const consumeBody = async (body: BodyInit | null | undefined): Promise<Uint8Array> => {
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
    length += chunk.value.byteLength;
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
};

const createPdf = (name = 'book.pdf') =>
  new File([bytes], name, { type: 'application/octet-stream' });

describe('sourceUpload.browser', () => {
  it('streams exact File bytes to exact B2 URL with redirect refusal and byte progress', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    const progress = vi.fn();
    const fetchImpl = vi.fn(async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(String(url)).toBe(uploadUrl);
      expect(init).toMatchObject({
        method: 'PUT',
        credentials: 'omit',
        redirect: 'error',
        duplex: 'half',
        headers: authority().requiredHeaders,
      });
      expect([...await consumeBody(init?.body)]).toEqual([...bytes]);
      expect(progress).toHaveBeenLastCalledWith({
        confirmed: false,
        loadedBytes: bytes.byteLength,
        totalBytes: bytes.byteLength,
        percent: 100,
      });
      return providerResponse();
    });

    await expect(uploadSourcePdfDirect({
      file,
      claim,
      authority: authority() as never,
      allowedB2Origins,
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      openFileStream: () => streamBytes(),
      onProgress: progress,
    })).resolves.toEqual({
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    });
    expect(progress).toHaveBeenLastCalledWith({
      confirmed: true,
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
    });
  });

  it('waits for request-stream EOF before reporting confirmed transfer', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    const progress = vi.fn();
    let requestBody: BodyInit | null | undefined;
    let settled = false;
    const result = uploadSourcePdfDirect({
      file,
      claim,
      authority: authority() as never,
      allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async (_url, init) => {
        requestBody = init?.body;
        return providerResponse();
      }) as typeof fetch,
      openFileStream: () => streamBytes(),
      onProgress: progress,
    }).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(requestBody).toBeInstanceOf(ReadableStream));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(progress).not.toHaveBeenCalled();

    await consumeBody(requestBody);
    await expect(result).resolves.toEqual({
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    });
    expect(progress).toHaveBeenNthCalledWith(1, {
      confirmed: false,
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
    });
    expect(progress).toHaveBeenLastCalledWith({
      confirmed: true,
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
    });
  });

  it.each([
    ['expired authority', { expiresAt: '2020-01-01T00:00:00.000Z' }, allowedB2Origins, 'expired_authority'],
    ['wrong origin', {}, ['https://other.example'], 'invalid_authority'],
    ['wrong object path', { url: 'https://s3.us-west-004.backblazeb2.com/' }, allowedB2Origins, 'invalid_authority'],
    ['extra header', { requiredHeaders: { ...authority().requiredHeaders, authorization: 'secret' } }, allowedB2Origins, 'invalid_authority'],
  ])('rejects %s before sending bytes', async (_label, override, origins, code) => {
    const file = createPdf();
    const claim = await inspect(file);
    const fetchImpl = vi.fn();
    await expect(uploadSourcePdfDirect({
      file,
      claim,
      authority: authority(override) as never,
      allowedB2Origins: origins,
    }, {
      fetchImpl,
      openFileStream: () => streamBytes(),
      now: () => Date.parse('2026-07-26T00:00:00.000Z'),
    })).rejects.toMatchObject({ code });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a different File even when metadata matches', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    await expect(uploadSourcePdfDirect({
      file: createPdf(),
      claim,
      authority: authority() as never,
      allowedB2Origins,
    })).rejects.toEqual(new SourceUploadBrowserError('stale_file'));
  });

  it('aborts transport and rejects network failure', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    const controller = new AbortController();
    const abortedFetch = vi.fn((_url, init?: RequestInit) => new Promise<Response>(
      (_resolve, reject) => init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      ),
    ));
    const abortedResult = uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: abortedFetch as typeof fetch,
      openFileStream: () => streamBytes(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(abortedResult).rejects.toMatchObject({ code: 'aborted' });

    await expect(uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) as typeof fetch,
      openFileStream: () => streamBytes(),
    })).rejects.toMatchObject({ code: 'network_failure' });
  });

  it.each([
    ['redirect', () => {
      const response = providerResponse('https://evil.example/copied.pdf');
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    }],
    ['object drift', () => providerResponse('https://s3.us-west-004.backblazeb2.com/private-book/other.pdf')],
    ['missing CORS-exposed IDs', () => providerResponse(uploadUrl, { headers: {} })],
    ['missing provider file ID', () => providerResponse(uploadUrl, {
      headers: { 'x-amz-version-id': '4_version' },
    })],
  ])('rejects %s response binding', async (_label, response) => {
    const file = createPdf();
    const claim = await inspect(file);
    await expect(uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async (_url, init) => {
        await consumeBody(init?.body);
        return response();
      }) as typeof fetch,
      openFileStream: () => streamBytes(),
    })).rejects.toMatchObject({ code: 'response_binding_mismatch' });
  });

  it('constructs the 500 MiB streaming path without allocating or arrayBuffering it', async () => {
    const file = {
      name: 'boundary.pdf',
      size: BOOK_SOURCE_MAX_PDF_BYTES,
      type: '',
      arrayBuffer: vi.fn(),
      stream: vi.fn(),
    } as unknown as File;
    const claim = await inspect(file);
    const controller = new AbortController();
    let requestBody: BodyInit | null | undefined;
    const fetchImpl = vi.fn((_url, init?: RequestInit) => {
      requestBody = init?.body;
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      ));
    });
    const result = uploadSourcePdfDirect({
      file,
      claim,
      authority: authority({
        requiredHeaders: {
          ...authority().requiredHeaders,
          'x-amz-meta-book-source-byte-size': String(BOOK_SOURCE_MAX_PDF_BYTES),
        },
      }) as never,
      allowedB2Origins,
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      openFileStream: () => new ReadableStream(),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(requestBody).toBeInstanceOf(ReadableStream);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'aborted' });
  });
});
