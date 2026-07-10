import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ownedFiles = [
  'src/types/bookActivity.types.ts',
  'src/services/book-activity/activitySchema.service.ts',
  'src/services/book-activity/activityCandidate.service.ts',
  'src/services/book-activity/activityPublish.service.ts',
  'src/services/book-activity/activityProjection.service.ts',
  'src/services/book-activity/activityDiff.service.ts',
  'src/services/book-activity/activityScoring.service.ts',
  'src/services/materialCatalog/bookActivityBookIntegration.service.ts',
];

describe('Book Activity dependency boundary', () => {
  it('keeps Book Activity independent from legacy PDF parser paths', () => {
    const offenders = ownedFiles.filter((file) => {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      return source.includes('src/services/file-extractor/file.extractor.ts') ||
        source.includes('file.extractor') ||
        source.includes('src/parsers/pdfParser.js') ||
        source.includes('pdfParser');
    });

    expect(offenders.map((file) => relative(repoRoot, resolve(repoRoot, file)))).toEqual([]);
  });
});
