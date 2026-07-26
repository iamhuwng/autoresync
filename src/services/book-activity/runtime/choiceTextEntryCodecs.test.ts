import { describe, expect, it } from 'vitest';
import {
  choiceMultipleResponseCodec,
  choiceSingleResponseCodec,
  createChoiceResponseCodec,
} from './codecs/choiceResponseCodec';
import { textEntryResponseCodec } from './codecs/textEntryResponseCodec';

describe('choice and text-entry response codecs', () => {
  it('preserves single-choice Interaction identity and canonical scalar', () => {
    const decoded = choiceSingleResponseCodec.decode({
      interactionId: 'interaction-1',
      selectedOptionId: 'option-a',
    });

    expect(decoded).toMatchObject({
      valid: true,
      value: { interactionId: 'interaction-1', selectedOptionId: 'option-a' },
    });
    expect(choiceSingleResponseCodec.serialize(decoded.valid ? decoded.value : null)).toEqual({
      interactionId: 'interaction-1',
      selectedOptionId: 'option-a',
    });
  });

  it('canonicalizes multiple-choice sets and rejects duplicates or unknown shape', () => {
    const codec = createChoiceResponseCodec({
      mode: 'multiple',
      allowedOptionIds: ['option-a', 'option-b'],
    });
    const decoded = codec.decode({
      interactionId: 'interaction-1',
      selectedOptionIds: ['option-b', 'option-a'],
    });

    expect(decoded).toMatchObject({
      valid: true,
      value: { interactionId: 'interaction-1', selectedOptionIds: ['option-a', 'option-b'] },
    });
    expect(codec.equals(
      { interactionId: 'interaction-1', selectedOptionIds: ['option-b', 'option-a'] },
      { interactionId: 'interaction-1', selectedOptionIds: ['option-a', 'option-b'] },
    )).toBe(true);
    expect(codec.decode({
      interactionId: 'interaction-1',
      selectedOptionIds: ['option-a', 'option-a'],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.selectedOptionIds' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      selectedOptionIds: ['option-c'],
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$.selectedOptionIds[0]' }] });
    expect(codec.decode({
      interactionId: 'interaction-1',
      selectedOptionIds: [],
      ignored: true,
    })).toMatchObject({ valid: false, diagnostics: [{ path: '$' }] });
  });

  it('preserves text exactly while enforcing identity, shape, and text bounds', () => {
    const response = { interactionId: 'interaction-1', text: '  Mixed  Case\ntext  ' };
    expect(textEntryResponseCodec.decode(response)).toMatchObject({ valid: true, value: response });
    expect(textEntryResponseCodec.equals(response, { ...response })).toBe(true);
    expect(textEntryResponseCodec.decode({ ...response, extra: true })).toMatchObject({
      valid: false,
      diagnostics: [{ path: '$' }],
    });
    expect(textEntryResponseCodec.decode({ interactionId: 'interaction-1', text: 'x'.repeat(4_001) }))
      .toMatchObject({ valid: false, diagnostics: [{ path: '$.text' }] });
    expect(textEntryResponseCodec.decode({ interactionId: 'bad identity!', text: '' }))
      .toMatchObject({ valid: false, diagnostics: [{ path: '$.interactionId' }] });
  });

  it('uses null as valid empty response for host-created initial state', () => {
    expect(choiceSingleResponseCodec.createEmpty()).toBeNull();
    expect(choiceMultipleResponseCodec.createEmpty()).toBeNull();
    expect(textEntryResponseCodec.createEmpty()).toBeNull();
  });
});
