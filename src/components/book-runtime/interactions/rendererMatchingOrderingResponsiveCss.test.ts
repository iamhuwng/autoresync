import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('ticket 24 matching/ordering responsive CSS contract', () => {
  it.each([
    ['./matching/MatchingRenderer.css', '.book-matching'],
    ['./ordering/OrderingRenderer.css', '.book-ordering'],
  ])('%s stays bounded at mobile width and 200% browser zoom', (path, selector) => {
    const value = css(path);
    expect(value).toContain(selector);
    expect(value).toMatch(/max-inline-size:\s*100%/u);
    expect(value).toMatch(/min-inline-size:\s*0/u);
    expect(value).toMatch(/overflow-wrap:\s*anywhere/u);
    expect(value).toMatch(/@media\s*\(max-width:\s*48rem\)/u);
    expect(value).not.toMatch(/min-resolution|device-pixel-ratio|linear-gradient|radial-gradient|backdrop-filter|@mantine/iu);
    expect(value).toMatch(/min-block-size:\s*2\.75rem/u);
  });
});
