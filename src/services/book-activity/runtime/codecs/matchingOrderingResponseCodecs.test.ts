import { describe, expect, it } from 'vitest';
import { createMatchingResponseCodec } from './matchingResponseCodec';
import { createOrderingResponseCodec } from './orderingResponseCodec';

describe('matching response codec', () => {
  const codec = createMatchingResponseCodec({
    allowedLeftItemIds: ['left-a', 'left-b'],
    allowedRightItemIds: ['right-1', 'right-2'],
    allowOptionReuse: false,
  });

  it('round-trips partial pairs in deterministic left-item order', () => {
    const value = codec.decode({
      interactionId: 'interaction-1',
      pairs: [{ leftItemId: 'left-b', rightItemId: 'right-2' }],
    });
    expect(value).toMatchObject({
      valid: true,
      value: {
        interactionId: 'interaction-1',
        pairs: [{ leftItemId: 'left-b', rightItemId: 'right-2' }],
      },
    });
    expect(codec.toReviewProjection(value.valid ? value.value : null)).toEqual({
      text: 'left-b → right-2',
      items: ['left-b → right-2'],
    });
  });

  it('rejects duplicate left/right identities, unknown IDs, malformed shape, and bounds', () => {
    expect(codec.decode({
      interactionId: 'interaction-1',
      pairs: [
        { leftItemId: 'left-a', rightItemId: 'right-1' },
        { leftItemId: 'left-a', rightItemId: 'right-2' },
      ],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.pairs' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      pairs: [
        { leftItemId: 'left-a', rightItemId: 'right-1' },
        { leftItemId: 'left-b', rightItemId: 'right-1' },
      ],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.pairs' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      pairs: [{ leftItemId: 'unknown', rightItemId: 'right-1' }],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.pairs[0].leftItemId' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      pairs: [],
      extra: true,
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$' }] });
  });

  it('defaults to rejecting duplicate right identities', () => {
    const defaultCodec = createMatchingResponseCodec();
    expect(defaultCodec.validate({
      interactionId: 'interaction-1',
      pairs: [
        { leftItemId: 'left-a', rightItemId: 'right-1' },
        { leftItemId: 'left-b', rightItemId: 'right-1' },
      ],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.pairs' }] });
  });
});

describe('ordering response codec', () => {
  const codec = createOrderingResponseCodec({
    allowedItemIds: ['item-a', 'item-b', 'item-c'],
  });

  it('preserves partial order, exact sequence, and stable equality', () => {
    const first = { interactionId: 'interaction-1', orderedItemIds: ['item-b', 'item-a'] };
    const second = { interactionId: 'interaction-1', orderedItemIds: ['item-b', 'item-a'] };
    expect(codec.decode(first)).toMatchObject({ valid: true, value: first });
    expect(codec.equals(first, second)).toBe(true);
    expect(codec.equals(first, { ...first, orderedItemIds: ['item-a', 'item-b'] })).toBe(false);
  });

  it('rejects duplicate, unknown, malformed, and oversized order values', () => {
    expect(codec.decode({
      interactionId: 'interaction-1',
      orderedItemIds: ['item-a', 'item-a'],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.orderedItemIds' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      orderedItemIds: ['unknown'],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.orderedItemIds[0]' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      orderedItemIds: 'item-a',
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.orderedItemIds' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      orderedItemIds: ['x'.repeat(200)],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.orderedItemIds[0]' }] });
  });
});
