import { describe, expect, it, vi } from 'vitest';
import {
  AIJsonExtractionError,
  extractJSON,
  isAIJsonExtractionError,
} from './ai-json-repair';

describe('ai-json-repair', () => {
  it('classifies raw invalid backslash escapes as a bad escape sequence', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => extractJSON('{"sourceTextExact":"copied markdown \\_ blank"}')).toThrow(AIJsonExtractionError);

    try {
      extractJSON('{"sourceTextExact":"copied markdown \\_ blank"}');
    } catch (error) {
      expect(isAIJsonExtractionError(error)).toBe(true);
      if (isAIJsonExtractionError(error)) {
        expect(error.reason).toBe('bad-escape-sequence');
        expect(error.message).toContain('bad-escape-sequence');
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('classifies responses without an object separately from malformed JSON', () => {
    expect(() => extractJSON('not json at all')).toThrow(/No JSON object found/);

    try {
      extractJSON('not json at all');
    } catch (error) {
      expect(isAIJsonExtractionError(error)).toBe(true);
      if (isAIJsonExtractionError(error)) {
        expect(error.reason).toBe('no-json-object');
      }
    }
  });
});
