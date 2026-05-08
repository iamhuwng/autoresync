import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDENT_PREFS } from './practice.types';

describe('DEFAULT_STUDENT_PREFS', () => {
  it('keeps the passage highlighter disabled by default', () => {
    expect(DEFAULT_STUDENT_PREFS.highlighterEnabled).toBe(false);
  });
});
