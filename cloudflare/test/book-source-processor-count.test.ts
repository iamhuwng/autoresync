import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';

import type { BookSourceVersionStorageIdentity } from '../../src/types/bookSource.types.ts';
import { countBookSourcePdfPagesFromProvider } from '../src/book-source-worker/processor-count';

const pdfBytes = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n186\n%%EOF\n',
);

const identity: BookSourceVersionStorageIdentity = {
  bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'location-1', providerKind: 'b2',
  privateBucketId: 'bucket-1', providerObjectKey: 'book-source/source-1.pdf', providerFileId: 'file-1',
  providerFileVersionId: 'version-1', checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, byteSize: pdfBytes.byteLength,
};

const countSource = (
  source: Uint8Array,
  overrides: Partial<Pick<Parameters<typeof countBookSourcePdfPagesFromProvider>[0],
    'maxRangeBytes' | 'maxRangeRequests' | 'maxAggregateBytes'>> = {},
) => {
  const sourceIdentity = { ...identity, byteSize: source.byteLength };
  return countBookSourcePdfPagesFromProvider({
    provider: {
      readBounded: async ({ range }) => {
        const offset = range.offset;
        const length = range.length;
        if (offset === undefined || length === undefined) throw new Error('length_required');
        return {
          bytes: source.slice(offset, offset + length),
          totalByteSize: source.byteLength,
          offset,
          contentIdentity: sourceIdentity,
        };
      },
    },
    identity: sourceIdentity,
    byteSize: source.byteLength,
    deadlineAt: Date.now() + 10_000,
    maxRangeBytes: 65_536,
    maxRangeRequests: 64,
    maxAggregateBytes: 50 * 1024 * 1024,
    assertNotCancelled: async () => undefined,
    ...overrides,
  });
};

const createRangeBudgetPdf = (): Uint8Array => {
  const document = new jsPDF({ compress: false });
  const line = 'range-budget '.repeat(200);
  for (let page = 0; page < 4; page += 1) {
    for (let row = 0; row < 50; row += 1) document.text(line, 10, 10 + row * 5);
    if (page < 3) document.addPage();
  }
  return new Uint8Array(document.output('arraybuffer'));
};

const createBoundedEdgePdf = (): Uint8Array => {
  const document = new jsPDF({ unit: 'pt', format: [612, 792], compress: false });
  document.setFileId('0123456789ABCDEF0123456789ABCDEF');
  document.text('bounded edge page 1', 48, 90);
  document.addPage([612, 792], 'portrait');
  document.text('bounded edge rotated page 2', 48, 90);
  document.addPage([792, 612], 'landscape');
  document.text('bounded edge landscape page 3', 48, 90);

  const pixels = new Uint8ClampedArray(512 * 512 * 4);
  let state = 0x12345678;
  for (let index = 0; index < pixels.length; index += 4) {
    state = (state * 1664525 + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
    pixels[index + 1] = state >>> 16;
    pixels[index + 2] = state >>> 8;
    pixels[index + 3] = 255;
  }
  document.addPage([500, 700], 'portrait');
  document.addImage({ data: pixels, width: 512, height: 512 }, 'RGBA', 0, 0, 500, 700, undefined, 'NONE');

  const source = Buffer.from(document.output('arraybuffer'));
  const text = source.toString('latin1');
  const trailer = /trailer\s*<<[\s\S]*?\/Size\s+(\d+)[\s\S]*?\/Root\s+(\d+)\s+0\s+R[\s\S]*?>>\s*startxref\s*(\d+)\s*%%EOF\s*$/u.exec(text);
  if (!trailer) throw new Error('fixture-trailer-unavailable');
  const pageObjects = [...text.matchAll(/(?:^|\n)(\d+) 0 obj\s*(<<\s*\/Type\s*\/Page\b[\s\S]*?>>)\s*endobj/gu)];
  const rotatedPage = pageObjects[1];
  if (!rotatedPage) throw new Error('fixture-page-unavailable');
  const rotatedPageId = Number(rotatedPage[1]);
  const rotatedPageDictionary = rotatedPage[2].replace(/>>\s*$/u, '/Rotate 90\n>>');
  const pieces: string[] = [];
  let offset = source.byteLength;
  const add = (value: string) => {
    pieces.push(value);
    offset += Buffer.byteLength(value, 'latin1');
  };
  const rotatedPageOffset = offset;
  add(`\n${rotatedPageId} 0 obj\n${rotatedPageDictionary}\nendobj\n`);
  const xrefOffset = offset;
  add(`xref\n${rotatedPageId} 1\n${String(rotatedPageOffset).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${trailer[1]} /Root ${trailer[2]} 0 R /Prev ${trailer[3]} >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat([source, Buffer.from(pieces.join(''), 'latin1')]));
};

describe('bounded Book Source processor page count', () => {
  it('counts PDF pages through bounded provider ranges', async () => {
    const ranges: Array<{ offset: number; length: number }> = [];
    const result = await countBookSourcePdfPagesFromProvider({
      provider: {
        readBounded: async ({ range }) => {
          const offset = range.offset;
          const length = range.length;
          if (offset === undefined || length === undefined) throw new Error('length_required');
          ranges.push({ offset, length });
          return {
            bytes: pdfBytes.slice(offset, offset + length),
            totalByteSize: pdfBytes.byteLength,
            offset,
            contentIdentity: identity,
          };
        },
      },
      identity,
      byteSize: pdfBytes.byteLength,
      deadlineAt: Date.now() + 10_000,
      maxRangeBytes: 65_536,
      maxRangeRequests: 4,
      maxAggregateBytes: 65_536,
      assertNotCancelled: async () => undefined,
    });

    expect(result.pageCount).toBe(1);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every(({ length }) => length <= 65_536)).toBe(true);
    expect(result.rangeRequests).toBe(ranges.length);
    expect(result.bytesRead).toBeLessThanOrEqual(65_536);
  }, 30_000);

  it('counts a deterministic mixed-geometry scanned PDF across bounded ranges', async () => {
    const fixture = createBoundedEdgePdf();
    const maxRangeBytes = 65_536;
    const maxRangeRequests = 64;
    const maxAggregateBytes = 50 * 1024 * 1024;
    const fixtureText = Buffer.from(fixture).toString('latin1');
    expect(fixture).toEqual(createBoundedEdgePdf());
    expect(fixture.byteLength).toBeGreaterThan(maxRangeBytes);
    expect(fixtureText).toContain('/Rotate 90');
    expect(fixtureText).toContain('/MediaBox [0 0 612. 792.]');
    expect(fixtureText).toContain('/MediaBox [0 0 792. 612.]');
    expect(fixtureText).toContain('/MediaBox [0 0 500. 700.]');

    const fixtureIdentity = { ...identity, byteSize: fixture.byteLength };
    const ranges: Array<{ offset: number; length: number }> = [];
    const readBounded = vi.fn(async ({ range }: { range: { offset?: number; length?: number } }) => {
      const offset = range.offset;
      const length = range.length;
      if (offset === undefined || length === undefined) throw new Error('length_required');
      ranges.push({ offset, length });
      return {
        bytes: fixture.slice(offset, offset + length),
        totalByteSize: fixture.byteLength,
        offset,
        contentIdentity: fixtureIdentity,
      };
    });
    const result = await countBookSourcePdfPagesFromProvider({
      provider: { readBounded },
      identity: fixtureIdentity,
      byteSize: fixture.byteLength,
      deadlineAt: Date.now() + 10_000,
      maxRangeBytes,
      maxRangeRequests,
      maxAggregateBytes,
      assertNotCancelled: async () => undefined,
    });

    expect(result.pageCount).toBe(4);
    expect(readBounded).toHaveBeenCalledTimes(result.rangeRequests);
    expect(result.rangeRequests).toBeGreaterThan(1);
    expect(ranges.every(({ length }) => length <= maxRangeBytes)).toBe(true);
    expect(result.rangeRequests).toBe(ranges.length);
    expect(result.rangeRequests).toBeLessThanOrEqual(maxRangeRequests);
    expect(result.bytesRead).toBeLessThanOrEqual(maxAggregateBytes);
  }, 30_000);

  it('fails closed when the request-count budget is exhausted', async () => {
    const source = createRangeBudgetPdf();
    expect(source.byteLength).toBeGreaterThan(65_536);
    await expect(countSource(source, {
      maxRangeRequests: 1,
      maxAggregateBytes: 2 * 65_536,
    })).rejects.toThrow('book_source_processor_range_budget_exceeded');
  }, 30_000);

  it('fails closed when the aggregate-byte budget is exhausted', async () => {
    const source = createRangeBudgetPdf();
    expect(source.byteLength).toBeGreaterThan(65_536);
    await expect(countSource(source, {
      maxRangeRequests: 64,
      maxAggregateBytes: 65_536,
    })).rejects.toThrow('book_source_processor_range_budget_exceeded');
  }, 30_000);

  it('fails closed for an encrypted PDF with the stable password error', async () => {
    const document = new jsPDF({
      encryption: { userPassword: 'user-password', ownerPassword: 'owner-password' },
    });
    document.text('password protected', 10, 10);
    await expect(countSource(new Uint8Array(document.output('arraybuffer'))))
      .rejects.toThrow('book_source_processor_pdf_password_required');
  }, 30_000);

  it('rejects a range that is not bound to the immutable source identity', async () => {
    await expect(countBookSourcePdfPagesFromProvider({
      provider: {
        readBounded: async ({ range }) => ({
          bytes: pdfBytes.slice(range.offset, (range.offset ?? 0) + (range.length ?? 0)),
          totalByteSize: pdfBytes.byteLength,
          offset: range.offset ?? 0,
          contentIdentity: { ...identity, providerFileVersionId: 'other-version' },
        }),
      },
      identity,
      byteSize: pdfBytes.byteLength,
      deadlineAt: Date.now() + 10_000,
      maxRangeBytes: 65_536,
      maxRangeRequests: 4,
      maxAggregateBytes: 65_536,
      assertNotCancelled: async () => undefined,
    })).rejects.toThrow('book_source_original_integrity_invalid');
  }, 30_000);

  it('normalizes corrupt PDF bytes without buffering beyond the bounded ranges', async () => {
    await expect(countBookSourcePdfPagesFromProvider({
      provider: {
        readBounded: async ({ range }) => {
          const bytes = new Uint8Array(range.length ?? 0);
          bytes.set(new TextEncoder().encode('not a PDF'));
          return { bytes, totalByteSize: pdfBytes.byteLength, offset: range.offset ?? 0, contentIdentity: identity };
        },
      },
      identity,
      byteSize: pdfBytes.byteLength,
      deadlineAt: Date.now() + 10_000,
      maxRangeBytes: 65_536,
      maxRangeRequests: 4,
      maxAggregateBytes: 65_536,
      assertNotCancelled: async () => undefined,
    })).rejects.toThrow('book_source_processor_pdf_invalid');
  }, 30_000);

  it('stops before PDF work when the request is already timed out or cancelled', async () => {
    const base = {
      provider: { readBounded: async () => { throw new Error('unexpected_provider_read'); } },
      identity,
      byteSize: pdfBytes.byteLength,
      maxRangeBytes: 65_536,
      maxRangeRequests: 4,
      maxAggregateBytes: 65_536,
      assertNotCancelled: async () => undefined,
    };
    await expect(countBookSourcePdfPagesFromProvider({ ...base, deadlineAt: Date.now() - 1 }))
      .rejects.toThrow('book_source_processor_timed_out');
    const controller = new AbortController();
    controller.abort();
    await expect(countBookSourcePdfPagesFromProvider({ ...base, deadlineAt: Date.now() + 10_000, signal: controller.signal }))
      .rejects.toThrow('book_source_processor_cancelled');
  });

  it('hands unsettled cleanup to the sink exactly once', async () => {
    let releaseRead!: () => void;
    let deferredCleanup: Promise<unknown> | undefined;
    const readPending = new Promise<void>((resolve) => { releaseRead = resolve; });
    const deferCleanup = vi.fn((promise: Promise<unknown>) => {
      deferredCleanup = promise;
    });
    const result = countBookSourcePdfPagesFromProvider({
      provider: {
        readBounded: async () => {
          await readPending;
          return {
            bytes: pdfBytes,
            totalByteSize: pdfBytes.byteLength,
            offset: 0,
            contentIdentity: identity,
          };
        },
      },
      identity,
      byteSize: pdfBytes.byteLength,
      deadlineAt: Date.now() + 25,
      maxRangeBytes: 65_536,
      maxRangeRequests: 4,
      maxAggregateBytes: 65_536,
      assertNotCancelled: async () => undefined,
      deferCleanup,
    });

    await expect(result).rejects.toThrow();
    expect(deferCleanup).toHaveBeenCalledOnce();
    expect(deferredCleanup).toBeDefined();
    releaseRead();
    await deferredCleanup;
  }, 30_000);
});
