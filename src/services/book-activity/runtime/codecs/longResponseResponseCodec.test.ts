import { describe, expect, it } from 'vitest';
import {
  LONG_RESPONSE_RESPONSE_CODEC_ID,
  MAX_LONG_RESPONSE_TEXT_LENGTH,
  longResponseResponseCodec,
} from './longResponseResponseCodec';

describe('Ticket #40 long-response codec', () => {
  it('round-trips exact Unicode and newline text without scoring fields', () => {
    const response = { interactionId: 'long-1', text: '  Cảm ơn\n\n🌿  ' };
    expect(LONG_RESPONSE_RESPONSE_CODEC_ID).toBe('long-response-v1');
    expect(longResponseResponseCodec.decode(response)).toMatchObject({ valid: true, value: response });
    expect(longResponseResponseCodec.serialize(response)).toEqual(response);
    expect(longResponseResponseCodec.toReviewProjection(response)).toEqual({ text: response.text });
  });

  it('creates empty state, compares stable values, and rejects malformed/oversize payloads', () => {
    expect(longResponseResponseCodec.createEmpty()).toBeNull();
    expect(longResponseResponseCodec.equals(
      { interactionId: 'long-1', text: 'same' },
      { interactionId: 'long-1', text: 'same' },
    )).toBe(true);
    expect(longResponseResponseCodec.equals(
      { interactionId: 'long-1', text: 'same' },
      { interactionId: 'long-1', text: 'different' },
    )).toBe(false);
    expect(longResponseResponseCodec.decode({ interactionId: 'bad id', text: 'x' })).toMatchObject({
      valid: false,
    });
    expect(longResponseResponseCodec.decode({ interactionId: 'long-1', text: 'x'.repeat(MAX_LONG_RESPONSE_TEXT_LENGTH + 1) }))
      .toMatchObject({ valid: false });
    expect(longResponseResponseCodec.decode({ interactionId: 'long-1', text: 'x', score: 1 })).toMatchObject({
      valid: false,
    });
  });
});
