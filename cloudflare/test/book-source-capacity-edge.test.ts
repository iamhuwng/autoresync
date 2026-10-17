import { describe, expect, it } from 'vitest';
import { createBookSourceDirectPdfPageCountAdapter } from '../src/book-source-worker/direct-pdf-page-count';

// A valid uncompressed page-content stream exercises byte ceilings without
// rendering or retaining additional full-size encoded fixture copies.
const edgePdf = (byteSize: number, pages = 500): Uint8Array => {
  const encoder = new TextEncoder();
  const offsets = [0];
  const pieces = ['%PDF-1.4\n'];
  let length = pieces[0].length;
  const append = (piece: string) => { pieces.push(piece); length += piece.length; };
  const object = (id: number, body: string) => {
    offsets[id] = length; append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`);
  for (let i = 0; i < pages; i++) object(i + 3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${i === 0 ? ` /Contents ${pages + 3} 0 R` : ''} >>`);
  const contentId = pages + 3;
  const prefix = encoder.encode(pieces.join(''));
  // Compute exact serialization length after reserving the content stream.
  const tailFor = (padding: number) => {
    const header = `${contentId} 0 obj\n<< /Length ${padding} >>\nstream\n`;
    const trailer = '\nendstream\nendobj\n';
    const xref = prefix.length + header.length + padding + trailer.length;
    const entries = [...offsets, prefix.length].map((offset, i) => `${String(offset).padStart(10, '0')} ${i ? '00000 n' : '65535 f'} \n`).join('');
    return { header, tail: `${trailer}xref\n0 ${contentId + 1}\n${entries}trailer\n<< /Size ${contentId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n` };
  };
  let padding = byteSize - prefix.length;
  for (let i = 0; i < 5; i++) {
    const { header, tail } = tailFor(padding);
    padding = byteSize - prefix.length - header.length - tail.length;
  }
  const { header, tail } = tailFor(padding);
  const bytes = new Uint8Array(byteSize);
  bytes.fill(32); bytes.set(prefix); bytes.set(encoder.encode(header), prefix.length);
  bytes.set(encoder.encode(tail), prefix.length + header.length + padding);
  return bytes;
};

describe('current private-B2 trusted counter byte/page feasibility', () => {
  for (const mib of [50, 100]) it(`counts cold/warm ${mib} MiB / 500-page input with bounded reads`, async () => {
    const bytes = edgePdf(mib * 1024 * 1024);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const identity = { bookId: 'capacity-disposable', sourceVersionId: 'capacity-v1', storageLocationId: 'capacity-local',
      providerKind: 'b2' as const, privateBucketId: 'capacity-local', providerObjectKey: 'capacity-local.pdf',
      providerFileId: 'capacity-local', providerFileVersionId: 'capacity-v1',
      checksum: { algorithm: 'sha-256' as const, value: sha256 }, byteSize: bytes.length };
    for (const phase of ['first-call', 'warm']) {
      let ranges = 0, bytesRead = 0;
      const counter = createBookSourceDirectPdfPageCountAdapter({ async readBounded({ range }) {
        ranges++; bytesRead += range.length!;
        expect(range.length).toBeLessThanOrEqual(1024 * 1024);
        return { bytes: bytes.slice(range.offset, range.offset! + range.length!), totalByteSize: bytes.length,
          offset: range.offset!, contentIdentity: identity };
      } });
      const started = performance.now();
      expect(await counter.countVerifiedPages({ identity, checksum: identity.checksum, byteSize: bytes.length })).toBe(500);
      expect(ranges).toBeLessThanOrEqual(64);
      expect(bytesRead).toBeLessThanOrEqual(64 * 1024 * 1024);
      console.log('capacity_edge_measurement', JSON.stringify({ mib, pages: 500, sha256, phase,
        wallMs: performance.now() - started, ranges, bytesRead,
        cpu: 'NOT_EXPOSED_BY_LOCAL_WORKER_HARNESS', isolateMemory: 'NOT_EXPOSED_BY_LOCAL_WORKER_HARNESS',
        provider: 'IN_MEMORY_IMMUTABLE_RANGE_SUBSTITUTE', fixture: 'uncompressed-blank-content-stream' }));
    }
  }, 60_000);
});
