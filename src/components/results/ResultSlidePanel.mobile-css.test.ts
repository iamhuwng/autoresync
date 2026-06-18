import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panelCss = readFileSync(resolve('src/components/results/ResultSlidePanel.css'), 'utf8');
const overviewCss = readFileSync(resolve('src/components/results/OverviewTab.css'), 'utf8');

describe('saved result mobile CSS contracts', () => {
  it('fits all result tabs within the phone viewport', () => {
    expect(panelCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.rsp-tab-bar\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    expect(panelCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.rsp-tab\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?min-width:\s*0;/);
  });

  it('uses touch-safe responsive answer-map columns on phones', () => {
    expect(overviewCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.ov-pill-grid\s*\{[\s\S]*?repeat\(auto-fit, minmax\(44px, 1fr\)\)/);
    expect(overviewCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.ov-pill\s*\{[\s\S]*?min-height:\s*44px;/);
  });

  it('stacks and wraps Reading V2 snapshot metadata on phones', () => {
    expect(panelCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.rsp-panel--mobile \.reading-v2-review-summary\s*\{[\s\S]*?flex-direction:\s*column;/);
    expect(panelCss).toMatch(/\.rsp-panel--mobile \.reading-v2-review-summary-snapshot\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/);
  });
});
