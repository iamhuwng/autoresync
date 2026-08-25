import { describe, expect, it, vi } from 'vitest';
import {
  inspectSourcePdf,
  invalidateSourcePdfInspectionClaim,
  isSourcePdfInspectionClaimForFile,
  SourcePdfInspectionError,
} from './sourcePdfInspection.browser';

const bytes = new TextEncoder().encode('%PDF-1.4');
const digest = Uint8Array.from({ length: 32 }, () => 0xaa).buffer;

const dependencies = (overrides: Partial<{
  readonly readArrayBuffer: (file: File) => Promise<ArrayBuffer>;
  readonly digestSha256: (bytes: ArrayBuffer) => Promise<ArrayBuffer>;
  readonly loadPdfDocument: () => Promise<{
    readonly promise: Promise<{ readonly numPages: number }>;
    readonly destroy: () => Promise<void>;
  }>;
}> = {}) => ({
  readArrayBuffer: async () => bytes.buffer,
  digestSha256: async () => digest,
  loadPdfDocument: async () => ({
    promise: Promise.resolve({ numPages: 2 }),
    destroy: async () => undefined,
  }),
  ...overrides,
});

const file = () => new File([bytes], '  source  book.PDF ', {
  type: 'application/octet-stream',
});

describe('sourcePdfInspection.browser', () => {
  it('returns normalized immutable metadata and binds it to the exact File', async () => {
    const selected = file();
    const destroy = vi.fn(async () => undefined);
    const claim = await inspectSourcePdf(selected, {
      __testDependencies: dependencies({
        loadPdfDocument: async () => ({
          promise: Promise.resolve({ numPages: 2 }),
          destroy,
        }),
      }),
    });

    expect(claim).toMatchObject({
      schemaVersion: 1,
      trust: 'browser-supplied-untrusted',
      state: 'complete',
      displayFilename: 'source book.pdf',
      exactByteSize: bytes.byteLength,
      sha256Hex: 'aa'.repeat(32),
      physicalPageCount: 2,
      pdfType: 'application/pdf',
      readability: 'readable',
    });
    expect(Object.isFrozen(claim)).toBe(true);
    expect(isSourcePdfInspectionClaimForFile(claim, selected)).toBe(true);
    expect(isSourcePdfInspectionClaimForFile(claim, file())).toBe(false);
    expect(isSourcePdfInspectionClaimForFile(claim, new File([bytes], 'unsafe/name.pdf'))).toBe(false);
    expect(isSourcePdfInspectionClaimForFile(null, selected)).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('invalidates an old claim before a replacement inspection can fail', async () => {
    const selected = file();
    const claim = await inspectSourcePdf(selected, { __testDependencies: dependencies() });
    expect(isSourcePdfInspectionClaimForFile(claim, selected)).toBe(true);

    await expect(inspectSourcePdf(selected, {
      __testDependencies: dependencies({
        loadPdfDocument: async () => {
          throw new Error('corrupt');
        },
      }),
    })).rejects.toMatchObject({ code: 'unreadable' });
    expect(isSourcePdfInspectionClaimForFile(claim, selected)).toBe(false);
  });

  it('rejects changed byte length before hashing or PDF inspection and clears the old claim', async () => {
    const selected = file();
    const oldClaim = await inspectSourcePdf(selected, { __testDependencies: dependencies() });
    expect(isSourcePdfInspectionClaimForFile(oldClaim, selected)).toBe(true);
    const digestSha256 = vi.fn(async () => digest);
    const loadPdfDocument = vi.fn(async () => ({
      promise: Promise.resolve({ numPages: 2 }),
      destroy: async () => undefined,
    }));

    await expect(inspectSourcePdf(selected, {
      __testDependencies: dependencies({
        readArrayBuffer: async () => new Uint8Array(bytes.byteLength + 1).buffer,
        digestSha256,
        loadPdfDocument,
      }),
    })).rejects.toMatchObject({ code: 'file_changed' });

    expect(digestSha256).not.toHaveBeenCalled();
    expect(loadPdfDocument).not.toHaveBeenCalled();
    expect(isSourcePdfInspectionClaimForFile(oldClaim, selected)).toBe(false);
  });

  it('invalidates on cancellation and cleans up without masking the result', async () => {
    const selected = file();
    const controller = new AbortController();
    const destroy = vi.fn(async () => { throw new Error('cleanup failed'); });
    let taskRead = false;
    const documentPromise = new Promise<{ readonly numPages: number }>(() => undefined);
    const pending = inspectSourcePdf(selected, {
      signal: controller.signal,
      __testDependencies: dependencies({
        loadPdfDocument: async () => ({
          get promise() {
            taskRead = true;
            return documentPromise;
          },
          destroy,
        }),
      }),
    });
    await vi.waitFor(() => expect(taskRead).toBe(true));
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: 'aborted',
    });
    expect(destroy).toHaveBeenCalledTimes(1);

    const successful = await inspectSourcePdf(selected, {
      __testDependencies: dependencies({
        loadPdfDocument: async () => ({
          promise: Promise.resolve({ numPages: 1 }),
          destroy,
        }),
      }),
    });
    expect(successful.physicalPageCount).toBe(1);
    invalidateSourcePdfInspectionClaim(selected);
    expect(isSourcePdfInspectionClaimForFile(successful, selected)).toBe(false);
  });

  it('does not block a successful claim on a PDF.js cleanup that stays pending', async () => {
    const selected = file();
    const destroy = vi.fn(() => new Promise<void>(() => undefined));

    const claim = await inspectSourcePdf(selected, {
      __testDependencies: dependencies({
        loadPdfDocument: async () => ({
          promise: Promise.resolve({ numPages: 1 }),
          destroy,
        }),
      }),
    });

    expect(claim.physicalPageCount).toBe(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not_pdf', new File(['plain text'], 'source.pdf'), new TextEncoder().encode('plain text').buffer],
    ['invalid_filename', new File([bytes], 'source.txt')],
  ] as const)('rejects %s before retaining a claim', async (code, selected) => {
    const readArrayBuffer = code === 'not_pdf'
      ? async () => new TextEncoder().encode('plain text').buffer
      : undefined;
    await expect(inspectSourcePdf(selected, {
      __testDependencies: dependencies({ ...(readArrayBuffer ? { readArrayBuffer } : {}) }),
    }))
      .rejects.toMatchObject({ code });
  });

  it('rejects a zero-page document', async () => {
    await expect(inspectSourcePdf(file(), {
      __testDependencies: dependencies({
        loadPdfDocument: async () => ({
          promise: Promise.resolve({ numPages: 0 }),
          destroy: async () => undefined,
        }),
      }),
    })).rejects.toMatchObject(new SourcePdfInspectionError('empty_pdf'));
  });
});
