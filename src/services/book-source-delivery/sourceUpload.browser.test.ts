import { describe, expect, it, vi } from 'vitest';
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

const createPdf = (name = 'book.pdf') =>
  new File([bytes], name, { type: 'application/octet-stream' });

describe('sourceUpload.browser', () => {
  it('sends the exact File body to the exact B2 URL with redirect refusal', async () => {
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
        headers: authority().requiredHeaders,
      });
      expect(init).not.toHaveProperty('duplex');
      expect(init?.body).toBe(file);
      expect(progress).toHaveBeenLastCalledWith({
        confirmed: false,
        loadedBytes: 0,
        totalBytes: bytes.byteLength,
        percent: 0,
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
      onProgress: progress,
    })).resolves.toEqual({
      providerFileId: '4_version',
      providerFileVersionId: '4_version',
    });
    expect(progress).toHaveBeenLastCalledWith({
      confirmed: true,
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
    });
  });

  it('waits for the provider response before reporting confirmed transfer', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    const progress = vi.fn();
    let resolveResponse!: (response: Response) => void;
    let settled = false;
    const result = uploadSourcePdfDirect({
      file,
      claim,
      authority: authority() as never,
      allowedB2Origins,
    }, {
      fetchImpl: vi.fn((_url, init) => {
        expect(init?.body).toBe(file);
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        });
      }) as typeof fetch,
      onProgress: progress,
    }).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(resolveResponse).toBeTypeOf('function'));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(progress).toHaveBeenLastCalledWith({
      confirmed: false,
      loadedBytes: 0,
      totalBytes: bytes.byteLength,
      percent: 0,
    });

    resolveResponse(providerResponse());
    await expect(result).resolves.toEqual({
      providerFileId: '4_version',
      providerFileVersionId: '4_version',
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
      signal: controller.signal,
    });
    controller.abort();
    await expect(abortedResult).rejects.toMatchObject({ code: 'aborted' });

    await expect(uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) as typeof fetch,
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
  ])('rejects %s response binding', async (_label, response) => {
    const file = createPdf();
    const claim = await inspect(file);
    await expect(uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async () => response()) as typeof fetch,
    })).rejects.toMatchObject({ code: 'response_binding_mismatch' });
  });

  it('uses documented x-amz-version-id for both identity fields', async () => {
    const file = createPdf();
    const claim = await inspect(file);
    await expect(uploadSourcePdfDirect({
      file, claim, authority: authority() as never, allowedB2Origins,
    }, {
      fetchImpl: vi.fn(async () => providerResponse(uploadUrl, {
        headers: { 'x-amz-version-id': '4_version' },
      })) as typeof fetch,
    })).resolves.toEqual({
      providerFileId: '4_version',
      providerFileVersionId: '4_version',
    });
  });

  it('passes an already inspected File through without allocating or reading it in JavaScript', async () => {
    const file = {
      name: 'boundary.pdf',
      size: bytes.byteLength,
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
          'x-amz-meta-book-source-byte-size': String(file.size),
        },
      }) as never,
      allowedB2Origins,
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(requestBody).toBe(file);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.stream).not.toHaveBeenCalled();
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'aborted' });
  });
});
