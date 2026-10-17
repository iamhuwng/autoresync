import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFilesUnder = (relativeRoot: string): string[] => {
  const absoluteRoot = resolve(relativeRoot);
  const visit = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return visit(path);
      return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
    });
  return visit(absoluteRoot);
};

const adapterFiles = sourceFilesUnder('src/services/book-activity/adapters')
  .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

describe('Book Activity native-domain dependency boundary', () => {
  it('imports Reading and Listening only through their explicit public barrels', () => {
    for (const path of adapterFiles) {
      const source = readFileSync(resolve(path), 'utf8');
      const nativeImports = [...source.matchAll(
        /from ['"]([^'"]*(?:reading-v2|assessment\/listening)[^'"]*)['"]/gu,
      )].map((match) => match[1]);
      expect(nativeImports.every((specifier) =>
        specifier.endsWith('/reading-v2/public') ||
        specifier.endsWith('/assessment/listening/public'))).toBe(true);
    }
  });

  it('contains no persistence, scoring, delivery, auth, URL, or native reverse authority', () => {
    for (const path of adapterFiles) {
      const source = readFileSync(resolve(path), 'utf8');
      expect(source).not.toMatch(
        /firebase|cloudflare|autosave|submission|answerKey|acceptedAnswer|signedUrl|fetch\(|database/iu,
      );
    }

    const nativeDomainFiles = [
      ...sourceFilesUnder('src/services/reading-v2'),
      ...sourceFilesUnder('src/features/assessment/listening'),
    ];
    for (const path of nativeDomainFiles) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /from ['"][^'"]*(?:services\/book-activity|bookActivityAdapter)[^'"]*['"]/u,
      );
    }
  });
});
