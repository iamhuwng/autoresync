import { describe, expect, it } from 'vitest';
import canonicalBookSourceConfigText from '../wrangler.book-source.jsonc?raw';
import isolatedB2ConfigText from '../wrangler.book-source-b2.jsonc?raw';
import mediaCanaryConfigText from '../wrangler.canary.jsonc?raw';
import mediaConfigText from '../wrangler.jsonc?raw';
import mediaRemoteDevConfigText from '../wrangler.remote-dev.jsonc?raw';

const productionSourceModules = import.meta.glob(
  [
    '../src/book-source-worker/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}',
    '../src/upload-worker/book-source/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}',
    '../../src/services/book-source-delivery/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Readonly<Record<string, string>>;

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
  'src/services/book-source-delivery/sourcePageRendition.service.ts',
  'src/services/book-source-delivery/sourceRendition.service.ts',
  'src/services/book-source-delivery/sourceUpload.splitClient.ts',
] as const;

const productionMode2Roots = [
  'cloudflare/src/book-source-worker',
  'cloudflare/src/upload-worker/book-source',
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
const canonicalBookSourceConfig = 'cloudflare/wrangler.book-source.jsonc';
const mediaR2Configs = [
  'cloudflare/wrangler.jsonc',
  'cloudflare/wrangler.canary.jsonc',
  'cloudflare/wrangler.remote-dev.jsonc',
] as const;
const embeddedConfigs = new Map<string, string>([
  [canonicalBookSourceConfig, canonicalBookSourceConfigText],
  [isolatedB2Config, isolatedB2ConfigText],
  [mediaR2Configs[0], mediaConfigText],
  [mediaR2Configs[1], mediaCanaryConfigText],
  [mediaR2Configs[2], mediaRemoteDevConfigText],
]);

const legacyBookPdfReference = /(?:bounded-pdf-page-count|direct-pdf-page-count|durable-pdf-processor|(?:source-)?ingress(?:-writer)?|production-(?:gateway|worker)|processor-(?:count|deadline|job|page|quota|range)|r2-page-rendition-store|source-page-host|source(?:Page)?Rendition(?:\.service)?|sourceUpload\.splitClient|BOOK_SOURCE_R2|BookSourceProcessor(?:Job|Quota))/iu;
const forbiddenPdfProcessingFallback = /(?:browser\s*run|workers?\s+paid|cloudflare\s+containers|cloud\s+run|server(?:-|\s*)side\s+page(?:-|\s*)count|(?:pdf|document)[-_\s]*(?:render(?:er|ing)?|rendition|split(?:ting)?))/iu;

function readRepoFile(path: string): string {
  const embedded = embeddedConfigs.get(path);
  if (embedded !== undefined) return embedded;
  const source = productionSourceTextByRepoPath.get(path);
  if (source !== undefined) return source;
  throw new Error(`Static source fixture unavailable: ${path}`);
}

function isTicket48ABackupPath(path: string): boolean {
  return ticket48ABookPdfBackupPaths.some((excludedPath) =>
    path === excludedPath || path.startsWith(`${excludedPath}/`));
}

function repoPath(modulePath: string): string {
  if (modulePath.startsWith('../src/')) return `cloudflare/${modulePath.slice(3)}`;
  if (modulePath.startsWith('../../src/')) return modulePath.slice(6);
  throw new Error(`Unexpected production module path: ${modulePath}`);
}

const productionSourceTextByRepoPath = new Map(
  Object.entries(productionSourceModules).map(([path, source]) => [repoPath(path), source]),
);

function productionFiles(path: string): string[] {
  return [...productionSourceTextByRepoPath.keys()]
    .filter((candidate) =>
      (candidate === path || candidate.startsWith(`${path}/`))
      && !isTicket48ABackupPath(candidate)
      && !/\.test\./u.test(candidate));
}

describe('Ticket 03C Book Source R2 PDF quarantine', () => {
  it('keeps legacy Book-PDF ingress, rendition, split, processor, and Durable Object modules absent', () => {
    const activeProductionFiles = new Set(productionMode2Roots.flatMap(productionFiles));
    const restoredModules = retiredLegacyBookPdfModules.filter((path) => activeProductionFiles.has(path));

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

  it('keeps the canonical Book Source Worker free of quarantined R2 PDF processing', () => {
    const config = readRepoFile(canonicalBookSourceConfig);

    expect(config).toMatch(/"main"\s*:\s*"worker\.js"/u);
    expect(config).toContain('BOOK_SOURCE_B2_PRIVATE_BUCKET_ID');
    expect(config).not.toMatch(legacyBookPdfReference);
    expect(config).not.toMatch(forbiddenPdfProcessingFallback);
    expect(config).not.toMatch(/r2_buckets|durable_objects|migrations|R2_BUCKET|BOOK_SOURCE_R2/iu);
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
      expect(config).not.toMatch(/book[-_\s]?pdf|BOOK_SOURCE_(?:R2|B2)/iu);
    }
  });

  it('excludes 48A-owned Book-PDF backup paths from this reachability check', () => {
    const scannedPaths = productionMode2Roots.flatMap(productionFiles);

    expect(ticket48ABookPdfBackupPaths.every((path) => !scannedPaths.includes(path))).toBe(true);
    expect(scannedPaths.every((path) => !path.includes('\\'))).toBe(true);
  });
});
