import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('ticket 23 renderer responsive CSS contract', () => {
  it.each([
    ['./choice/ChoiceRenderer.css', '.book-choice'],
    ['./text-entry/TextEntryRenderer.css', '.book-text-entry'],
  ])('%s stays bounded at mobile width and 200% browser zoom', (path, selector) => {
    const value = css(path);

    // Browser zoom reduces the effective CSS viewport. Bounded inline sizing,
    // wrapping, relative units, and the narrow-viewport rule keep the component
    // usable without treating display pixel density as a zoom signal.
    expect(value).toContain(selector);
    expect(value).toMatch(/max-inline-size:\s*100%/u);
    expect(value).toMatch(/min-inline-size:\s*0/u);
    expect(value).toMatch(/overflow-wrap:\s*anywhere/u);
    expect(value).toMatch(/@media\s*\(max-width:\s*48rem\)/u);
    expect(value).not.toMatch(/min-resolution|device-pixel-ratio/iu);
    expect(value).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter|@mantine/iu);
  });

  it('keeps editable controls at the 44px minimum target', () => {
    expect(css('./choice/ChoiceRenderer.css')).toMatch(/min-block-size:\s*2\.75rem/u);
    expect(css('./text-entry/TextEntryRenderer.css')).toMatch(/min-block-size:\s*2\.75rem/u);
  });
});
