import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'src/components/reading-v2/runtime/ReadingV2RuntimeShell.css'),
  'utf8',
);

describe('ReadingV2RuntimeShell phone CSS contract', () => {
  it('allows the shared runtime shell to shrink inside narrow routed or smoke-page containers', () => {
    expect(css).toMatch(/\.reading-v2-runtime\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.reading-v2-runtime\s*{[^}]*width:\s*100%/);
  });

  it('keys phone adaptations from the rendered phone layout instead of a conflicting width breakpoint', () => {
    expect(css).not.toContain('@media (max-width: 720px)');
    expect(css).toContain('.reading-v2-runtime[data-layout="phone"] .reading-v2-runtime__passage p');
  });

  it('keeps floating and scroll surfaces clear of phone safe areas', () => {
    expect(css).toContain('bottom: calc(16px + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('height: calc(48px + env(safe-area-inset-top, 0px));');
  });

  it('gives phone answer fields comfortable touch and text sizing', () => {
    expect(css).toMatch(/data-layout="phone"[^}]*reading-v2-runtime__text-input[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/data-layout="phone"[^}]*reading-v2-runtime__text-input[\s\S]*?font-size:\s*16px/);
  });

  it('keeps structured table answer fields wide enough to target on phone and desktop', () => {
    expect(css).toMatch(/\.reading-v2-runtime__structured-answer table\s*{[^}]*min-width:\s*640px/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-line\s*{[^}]*width:\s*max-content[^}]*max-width:\s*none/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-field\s*{[^}]*min-width:\s*max-content/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-field \.reading-v2-runtime__text-input\s*{[^}]*flex:\s*0 0 14ch[^}]*width:\s*14ch[^}]*min-width:\s*14ch/);
  });
});
