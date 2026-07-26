import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const retiredLegacyBookPdfModules = [
  'cloudflare/src/book-source-worker/worker.js',
  'cloudflare/src/book-source-worker/bounded-pdf-page-count.ts',
  'cloudflare/src/book-source-worker/direct-pdf-page-count.ts',
  'cloudflare/src/book-source-worker/durable-pdf-processor.ts',
  'cloudflare/src/book-source-worker/ingress.ts',
  'cloudflare/src/book-source-worker/processor-count.ts',
  'cloudflare/src/book-source-worker/processor-deadline.ts',
  'cloudflare/src/book-source-worker/processor-job.ts',
  'cloudflare/src/book-source-worker/processor-page.ts',
  'cloudflare/src/book-source-worker/processor-quota.ts',
  'cloudflare/src/book-source-worker/processor-range.ts',
  'cloudflare/src/book-source-worker/r2-page-rendition-store.ts',
  'cloudflare/src/book-source-worker/source-page-host.ts',
  'cloudflare/src/book-source-worker/source-ingress-writer.ts',
  'cloudflare/src/book-source-worker/production-gateway.ts',
  'cloudflare/src/book-source-worker/production-worker.ts',
  'cloudflare/wrangler.book-source.jsonc',
  'src/services/book-source-delivery/sourcePageRendition.service.ts',
  'src/services/book-source-delivery/sourceRendition.service.ts',
  'src/services/book-source-delivery/sourceUpload.splitClient.ts',
] as const;

const productionMode2Roots = [
  'cloudflare/src/book-source-worker',
  'src/services/book-source-delivery',
] as const;

// Ticket 48A owns Book-PDF backup/restore migration. These paths intentionally
// remain outside this ticket's reachability scan and are not asserted here.
const ticket48ABookPdfBackupPaths = [
  'cloudflare/r2-lifecycle.book-source-private.json',
  'cloudflare/src/book-source-worker/backup',
  'src/services/book-source-delivery/backup',
] as const;

const isolatedB2Config = 'cloudflare/wrangler.book-source-b2.jsonc';
const mediaR2Configs = [
  'cloudflare/wrangler.jsonc',
  'cloudflare/wrangler.canary.jsonc',
  'cloudflare/wrangler.remote-dev.jsonc',
] as const;

const legacyBookPdfReference = /(?:bounded-pdf-page-count|direct-pdf-page-count|durable-pdf-processor|(?:source-)?ingress(?:-writer)?|production-(?:gateway|worker)|processor-(?:count|deadline|job|page|quota|range)|r2-page-rendition-store|source-page-host|source(?:Page)?Rendition(?:\.service)?|sourceUpload\.splitClient|BOOK_SOURCE_R2|BookSourceProcessor(?:Job|Quota))/iu;
const forbiddenPdfProcessingFallback = /(?:browser\s*run|workers?\s+paid|cloudflare\s+containers|cloud\s+run|server(?:-|\s*)side\s+page(?:-|\s*)count|(?:pdf|document)[-_\s]*(?:render(?:er|ing)?|rendition|split(?:ting)?))/iu;

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function isTicket48ABackupPath(path: string): boolean {
  return ticket48ABookPdfBackupPaths.some((excludedPath) =>
    path === excludedPath || path.startsWith(`${excludedPath}/`));
}

function productionFiles(path: string): string[] {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath) || isTicket48ABackupPath(path)) return [];

  if (statSync(absolutePath).isFile()) return [path];

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${path}/${entry.name}`;
    if (isTicket48ABackupPath(entryPath)) return [];
    if (entry.isDirectory()) return productionFiles(entryPath);
    return /\.(?:[cm]?[jt]s|tsx|jsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name)
      ? [entryPath]
      : [];
  });
}

describe('Ticket 03C Book Source R2 PDF quarantine', () => {
  it('keeps legacy Book-PDF ingress, rendition, split, processor, and Durable Object modules absent', () => {
    const restoredModules = retiredLegacyBookPdfModules.filter((path) => existsSync(resolve(repoRoot, path)));

    expect(restoredModules).toEqual([]);
  });

  it('keeps production Mode 2 code and its isolated entrypoint free of legacy imports, routes, bindings, and paid processing fallbacks', () => {
    const activeProductionFiles = productionMode2Roots.flatMap(productionFiles);
    const productionSources = activeProductionFiles.map((path) => ({ path, source: readRepoFile(path) }));
    const b2Config = readRepoFile(isolatedB2Config);

    expect(activeProductionFiles).not.toEqual([]);
    expect(productionSources.filter(({ source }) => legacyBookPdfReference.test(source)).map(({ path }) => path))
      .toEqual([]);
    expect(productionSources.filter(({ source }) => forbiddenPdfProcessingFallback.test(source)).map(({ path }) => path))
      .toEqual([]);
    expect(b2Config).not.toMatch(legacyBookPdfReference);
    expect(b2Config).not.toMatch(forbiddenPdfProcessingFallback);
    expect(b2Config).not.toMatch(/r2_buckets|durable_objects|migrations|routes|BOOK_SOURCE_R2/iu);
  });

  it('keeps dedicated Book Source config on isolated B2 original-PDF wiring only', () => {
    const config = readRepoFile(isolatedB2Config);

    expect(config).toMatch(/"main"\s*:\s*"src\/book-source-worker\/backblaze-b2-provider-worker\.ts"/u);
    expect(config).toMatch(/"BOOK_SOURCE_B2_PROVIDER_STATE"\s*:\s*"disabled"/u);
    expect(config).toContain('BOOK_SOURCE_B2_PRIVATE_BUCKET_ID');
    expect(config).toContain('BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID');
    expect(config).toContain('BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID');
    expect(config).toContain('BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID');
    expect(config).not.toMatch(/R2_BUCKET|kahoot-media|UPLOAD_GRANT_REPLAY_LEDGER/iu);
  });

  it('preserves unrelated audio/media R2 Worker configuration outside Book Source quarantine', () => {
    for (const path of mediaR2Configs) {
      const config = readRepoFile(path);

      expect(config).toMatch(/"main"\s*:\s*"worker\.js"/u);
      expect(config).toMatch(/"binding"\s*:\s*"R2_BUCKET"/u);
      expect(config).toMatch(/"bucket_name"\s*:\s*"kahoot-media"/u);
      expect(config).not.toMatch(/book[-_\s]?source|book[-_\s]?pdf|BOOK_SOURCE/iu);
    }
  });

  it('excludes 48A-owned Book-PDF backup paths from this reachability check', () => {
    const scannedPaths = productionMode2Roots.flatMap(productionFiles);

    expect(ticket48ABookPdfBackupPaths.every((path) => !scannedPaths.includes(path))).toBe(true);
    expect(scannedPaths.map((path) => relative(repoRoot, resolve(repoRoot, path)).replaceAll('\\', '/')))
      .toEqual(scannedPaths);
  });
});
