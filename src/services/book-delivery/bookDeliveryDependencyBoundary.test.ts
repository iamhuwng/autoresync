import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ticket39AFiles = [
  'src/services/book-delivery/bookImpactClassification.service.ts',
  'src/services/book-delivery/bookContextAdapter.types.ts',
  'src/services/book-delivery/bookContextAdapterRegistry.service.ts',
] as const;
const forbiddenDependency =
  /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:firebase|r2|provider|worker|axios|undici|https?:|node:(?:http|https|net))[^'"]*['"]|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/iu;
const ticket21Files = [
  'src/services/book-delivery/bookDelivery.service.ts',
  'cloudflare/src/upload-worker/book-delivery/worker.ts',
] as const;
const forbiddenRuntimeDependency =
  /(?:BookPdfViewer|BookRuntimeShell|BookRuntimeFrame|BookPdfViewerHost|bookDelivery\.browser|BookAssemblyWorkspace|react|@playwright|document\.|window\.)/u;

describe('Ticket 39A Book Delivery dependency boundary', () => {
  it('has no provider, network, Worker, discovery, authorization, or activation dependency', () => {
    const offenders = ticket39AFiles.filter((file) =>
      forbiddenDependency.test(readFileSync(resolve(repoRoot, file), 'utf8')),
    );
    expect(offenders.map((file) => relative(repoRoot, resolve(repoRoot, file)))).toEqual([]);
  });
});

describe('Ticket 21 Book Delivery server projection boundary', () => {
  it('has no PDF viewer, browser runtime, or student-shell dependency', () => {
    const offenders = ticket21Files.filter((file) =>
      forbiddenRuntimeDependency.test(readFileSync(resolve(repoRoot, file), 'utf8')),
    );
    expect(offenders.map((file) => relative(repoRoot, resolve(repoRoot, file)))).toEqual([]);
  });
});
