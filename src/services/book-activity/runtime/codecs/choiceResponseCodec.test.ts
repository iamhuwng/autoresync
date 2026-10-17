import { describe, expect, it } from 'vitest';
import {
  choiceMultipleResponseCodec,
  choiceSingleResponseCodec,
  createChoiceResponseCodec,
} from './choiceResponseCodec';

describe('choice response codecs', () => {
  it('round-trips empty and canonical single-choice identity', () => {
    const response = { interactionId: 'question-1', selectedOptionId: 'option-b' };
    expect(choiceSingleResponseCodec.createEmpty()).toBeNull();
    expect(choiceSingleResponseCodec.decode(choiceSingleResponseCodec.serialize(response))).toEqual({
      valid: true,
      value: response,
      diagnostics: [],
    });
    expect(choiceSingleResponseCodec.toReviewProjection(response)).toEqual({
      text: 'option-b',
      items: ['option-b'],
    });
  });

  it('rejects unknown option identities when configured and preserves deterministic multiple order', () => {
    const bounded = createChoiceResponseCodec({
      mode: 'single',
      allowedOptionIds: ['option-a', 'option-b'],
    });
    expect(bounded.decode({
      interactionId: 'question-1',
      selectedOptionId: 'option-c',
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.selectedOptionId' }],
    });
    expect(choiceMultipleResponseCodec.serialize({
      interactionId: 'question-1',
      selectedOptionIds: ['option-b', 'option-a'],
    })).toEqual({
      interactionId: 'question-1',
      selectedOptionIds: ['option-a', 'option-b'],
    });
  });

  it('rejects duplicate, sparse, malformed, and oversized responses', () => {
    expect(choiceMultipleResponseCodec.decode({
      interactionId: 'question-1',
      selectedOptionIds: ['option-a', 'option-a'],
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.selectedOptionIds' }],
    });
    const sparse: string[] = [];
    sparse.length = 2;
    sparse[0] = 'option-a';
    expect(choiceMultipleResponseCodec.decode({
      interactionId: 'question-1',
      selectedOptionIds: sparse,
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.selectedOptionIds' }],
    });
    expect(choiceSingleResponseCodec.decode({
      interactionId: 'question 1',
      selectedOptionId: null,
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.interactionId' }],
    });
    expect(choiceMultipleResponseCodec.decode({
      interactionId: 'question-1',
      selectedOptionIds: ['x'.repeat(161)],
    })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$.selectedOptionIds' }],
    });
  });
});
