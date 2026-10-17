import { describe, expect, it } from 'vitest';
import { textEntryResponseCodec } from './textEntryResponseCodec';

describe('text-entry response codec', () => {
  it('round-trips canonical interaction identity and text', () => {
    const response = { interactionId: 'question-1', text: '  answer  ' };
    expect(textEntryResponseCodec.createEmpty()).toBeNull();
    expect(textEntryResponseCodec.serialize(response)).toEqual(response);
    expect(textEntryResponseCodec.equals(response, { ...response })).toBe(true);
    expect(textEntryResponseCodec.toReviewProjection(response)).toEqual({ text: '  answer  ' });
  });

  it('rejects malformed identity, unexpected fields, and bounded overflow', () => {
    expect(textEntryResponseCodec.decode({
      interactionId: 'question 1',
      text: 'answer',
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.interactionId' }],
    });
    expect(textEntryResponseCodec.decode({
      interactionId: 'question-1',
      text: 'answer',
      extra: true,
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$' }],
    });
    expect(textEntryResponseCodec.decode({
      interactionId: 'question-1',
      text: 'x'.repeat(4_001),
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.text' }],
    });
  });
});
