import { describe, expect, it } from 'vitest';
import { effectiveNow, normalizeServerTimeOffset } from './serverClock';

describe('serverClock', () => {
  it('applies a finite server offset for display decisions', () => {
    expect(effectiveNow(1_000, 250)).toBe(1_250);
    expect(normalizeServerTimeOffset(-500)).toBe(-500);
  });

  it('fails to a neutral display offset for malformed values', () => {
    expect(normalizeServerTimeOffset(undefined)).toBe(0);
    expect(normalizeServerTimeOffset(Number.NaN)).toBe(0);
  });
});
