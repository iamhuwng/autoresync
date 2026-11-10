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

  it('keeps shared free-text answers inline without an outer box', () => {
    expect(css).toMatch(/\.reading-v2-runtime__text-input\s*{[^}]*border:\s*0[^}]*border-bottom:\s*2px solid #b7c3cf[^}]*background:\s*transparent[^}]*overflow:\s*hidden[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.reading-v2-runtime__text-input:focus\s*{[^}]*border-bottom-color:\s*#1f5f99[^}]*border-bottom-width:\s*3px[^}]*outline:\s*0/);
  });

  it('keeps structured table answer fields compact and content-expandable', () => {
    expect(css).toMatch(/\.reading-v2-runtime__structured-answer table\s*{[^}]*min-width:\s*800px/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-line\s*{[^}]*display:\s*inline[^}]*white-space:\s*normal/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-prefix\s*{[^}]*display:\s*inline[^}]*vertical-align:\s*middle[^}]*white-space:\s*normal/);
    expect(css).toMatch(/\.reading-v2-runtime__structured-answer \.reading-v2-runtime__table-scroll td\[data-blank="true"\]\s*{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-field\s*{[^}]*flex:\s*0 0 auto[^}]*align-items:\s*baseline[^}]*width:\s*fit-content[^}]*max-width:\s*100%[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-field \.reading-v2-runtime__text-input\s*{[^}]*flex:\s*0 1 auto[^}]*field-sizing:\s*content[^}]*width:\s*auto[^}]*min-width:\s*3ch[^}]*max-width:\s*14ch[^}]*border-bottom:\s*2px solid[^}]*overflow:\s*hidden[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-field \.reading-v2-runtime__text-input:focus\s*{[^}]*border-bottom-width:\s*3px[^}]*outline:\s*0/);
    expect(css).not.toContain('.reading-v2-runtime__cell-answer-field:focus-within');
    expect(css).toMatch(/\.reading-v2-runtime__cell-answer-line\.reading-v2-runtime__question-anchor--focused\s*{[^}]*outline:\s*0[^}]*animation:\s*none/);
    expect(css).toContain('.reading-v2-runtime__cell-answer-line.reading-v2-runtime__question-anchor--focused .reading-v2-runtime__text-input,');
  });
});
