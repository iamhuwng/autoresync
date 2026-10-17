import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { File } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Explicit opt-in: preparation never runs the workload or contacts a provider.
const mode = process.env.PRD0062_CAPACITY_MODE ?? 'prepare';
if (!['prepare', 'measure'].includes(mode)) throw new Error('mode must be prepare or measure');
const directory = path.resolve('artifacts/prd0062-capacity');
const fixtures = path.join(directory, 'fixtures');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
await mkdir(fixtures, { recursive: true });
const pageCounts = [20, 100, 500];
if (mode === 'prepare') {
  const manifest = [];
  for (const pages of pageCounts) {
    const pdf = await PDFDocument.create();
    const date = new Date('2026-01-01T00:00:00.000Z');
    pdf.setCreationDate(date); pdf.setModificationDate(date);
    pdf.setProducer('PRD0062 deterministic capacity fixture');
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let page = 1; page <= pages; page += 1) {
      pdf.addPage([595, 842]).drawText(`PRD0062 fixture ${pages} pages - page ${page}`, { x: 40, y: 790, font, size: 12 });
    }
    const bytes = await pdf.save({ useObjectStreams: true });
    const name = `text-${pages}.pdf`;
    await writeFile(path.join(fixtures, name), bytes);
    manifest.push({ name, pages, byteSize: bytes.length, sha256: hash(bytes), fixtureClass: 'generated-text-only' });
  }
  await writeFile(path.join(fixtures, 'manifest.json'), JSON.stringify({ schemaVersion: 1, fixtures: manifest,
    limits: { sourceBytes: 50 * 1024 * 1024, studentDocumentBytes: 100 * 1024 * 1024, compositionPages: 500 },
    qualification: 'Inputs only; no measurements, remote/provider, scanned/image-heavy, encrypted or malformed PDF proof.' }, null, 2));
  console.log(`Prepared deterministic inputs: ${fixtures}`);
} else {
  // The module auto-registers its Worker listener when document is absent.
  // This Node runner invokes the exported function, not that browser host.
  const existingDocument = Reflect.get(globalThis, 'document');
  Reflect.set(globalThis, 'document', {});
  const { composeComponentPdfBytes } = await import('../../src/services/book-source-delivery/componentPdfComposition.worker');
  if (existingDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
  else Reflect.set(globalThis, 'document', existingDocument);
  const concurrency = Number(process.env.PRD0062_CAPACITY_CONCURRENCY ?? 1);
  const samples = Number(process.env.PRD0062_CAPACITY_SAMPLES ?? 3);
  const pages = Number(process.env.PRD0062_CAPACITY_PAGES ?? 20);
  if (![1, 2, 5].includes(concurrency) || !pageCounts.includes(pages) || !Number.isSafeInteger(samples) || samples < 1 || samples > 20) throw new Error('invalid bounded measurement parameters');
  const input = await readFile(path.join(fixtures, `text-${pages}.pdf`));
  const fixtureHash = hash(input);
  const { createBookSourceDirectPdfPageCountAdapter } = await import('../../cloudflare/src/book-source-worker/direct-pdf-page-count');
  const rows: Array<Record<string, unknown>> = [];
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  let peakRssBytes = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 10);
  try {
    for (let batch = 0; batch < samples; batch += 1) {
      await Promise.all(Array.from({ length: concurrency }, async (_, slot) => {
        const start = performance.now();
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 60_000);
        let stage = 'composition';
        try {
          const output = await composeComponentPdfBytes([new File([input], `text-${pages}.pdf`, { type: 'application/pdf' }) as unknown as globalThis.File], { signal: abort.signal });
          const compositionMs = performance.now() - start;
          stage = 'trusted-count';
          let rangeRequests = 0, bytesRead = 0;
          const identity = { bookId: 'capacity-disposable', sourceVersionId: 'capacity-v1', storageLocationId: 'capacity-local',
            providerKind: 'b2' as const, privateBucketId: 'capacity-local', providerObjectKey: 'capacity-local.pdf',
            providerFileId: 'capacity-local', providerFileVersionId: 'capacity-v1',
            checksum: { algorithm: 'sha-256' as const, value: output.sha256Hex }, byteSize: output.bytes.length };
          const counter = createBookSourceDirectPdfPageCountAdapter({ async readBounded(request) {
            rangeRequests += 1; bytesRead += request.range.length;
            return { contentIdentity: identity, totalByteSize: output.bytes.length, offset: request.range.offset,
              bytes: output.bytes.slice(request.range.offset, request.range.offset + request.range.length) };
          } });
          const countStarted = performance.now();
          const counted = await counter.countVerifiedPages({ identity, checksum: identity.checksum, byteSize: identity.byteSize, signal: abort.signal });
          if (counted !== pages) throw new Error(`page count mismatch: ${counted}`);
          rows.push({ batch, slot, pages: counted, inputBytes: input.length, outputBytes: output.bytes.length, outputSha256: output.sha256Hex,
            compositionMs, trustedCountMs: performance.now() - countStarted, totalMs: performance.now() - start, rangeRequests, bytesRead });
        } catch (error) { rows.push({ batch, slot, stage, error: error instanceof Error ? error.message : String(error), totalMs: performance.now() - start }); }
        finally { clearTimeout(timeout); peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }
      }));
    }
  } finally { clearInterval(sampler); }
  const cpu = process.cpuUsage(cpuStart);
  const successful = rows.filter((row) => !row.error).map((row) => Number(row.totalMs)).sort((a, b) => a - b);
  const percentile = (p: number) => successful.length ? successful[Math.ceil(successful.length * p) - 1] : null;
  const sidecar = { schemaVersion: 1, status: rows.some((row) => row.error) ? 'MEASURED_WITH_ERRORS' : 'MEASURED_LOCAL_ONLY',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirtyStatus: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }),
    command: `PRD0062_CAPACITY_MODE=measure PRD0062_CAPACITY_PAGES=${pages} PRD0062_CAPACITY_CONCURRENCY=${concurrency} PRD0062_CAPACITY_SAMPLES=${samples} node scripts/tooling-where.mjs --exec vite-node --mode test scripts/qa/prd0062-capacity.ts`,
    runtime: { executable: process.execPath, node: process.version, arch: process.arch, platform: process.platform },
    environmentClass: 'local-node-direct-functions-with-in-memory-range-provider', fixture: { pages, sha256: fixtureHash, bytes: input.length },
    sampleCount: rows.length, concurrency, elapsedMs: performance.now() - started, p50Ms: percentile(.5), p95Ms: percentile(.95),
    memory: { peakRssBytes, method: 'process RSS sampled every 10ms plus settlements; process aggregate, not isolate peak' },
    cpu: { userMicroseconds: cpu.user, systemMicroseconds: cpu.system, scope: 'whole measurement process' }, rows,
    qualification: { browserWorker: 'NOT_MEASURED', upload: 'NOT_MEASURED', delivery: 'NOT_MEASURED',
      daily100To200Uploads: 'NOT_MEASURED', providerQuota: 'NOT_MEASURED', billing: 'NOT_MEASURED', remote: 'NOT_MEASURED' } };
  const name = `local-${pages}-c${concurrency}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path.join(directory, name), JSON.stringify(sidecar, null, 2));
  console.log(path.join(directory, name));
  if (rows.some((row) => row.error)) process.exitCode = 1;
}
