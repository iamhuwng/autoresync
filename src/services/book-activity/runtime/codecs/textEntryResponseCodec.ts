import type {
  ActivityResponseCodec,
  ActivityResponseValidationResult,
} from '../activityResponseCodec.types';
import {
  boundedResponseId,
  boundedText,
  hasExactKeys,
  invalid,
  responseSizeDiagnostic,
  valid,
} from './codecHelpers';

export interface TextEntryResponse {
  interactionId: string;
  text: string;
}

const MAX_SERIALIZED_BYTES = 81_920;

const parse = (input: unknown): ActivityResponseValidationResult<TextEntryResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'text'])) {
    return invalid('$', 'Expected a canonical text-entry response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (!boundedText(input.text)) {
    return invalid('$.text', 'Text response is outside supported bounds.');
  }
  return valid({ interactionId: input.interactionId, text: input.text });
};

export const textEntryResponseCodec: ActivityResponseCodec<TextEntryResponse | null> = {
  maxSerializedBytes: MAX_SERIALIZED_BYTES,
  createEmpty: () => null,
  decode: (input) => {
    const sizeDiagnostic = responseSizeDiagnostic(input);
    if (sizeDiagnostic) return { valid: false, diagnostics: [sizeDiagnostic] };
    return parse(input);
  },
  validate: (response) => parse(response),
  serialize: (response) => {
    const parsed = parse(response);
    if (!parsed.valid) throw new TypeError('Cannot serialize malformed text-entry response.');
    return parsed.value;
  },
  equals: (left, right) => {
    const leftValue = parse(left);
    const rightValue = parse(right);
    return leftValue.valid && rightValue.valid &&
      (leftValue.value === null || rightValue.value === null
        ? leftValue.value === rightValue.value
        : leftValue.value.interactionId === rightValue.value.interactionId &&
          leftValue.value.text === rightValue.value.text);
  },
  toReviewProjection: (response) => {
    const parsed = parse(response);
    return !parsed.valid || parsed.value === null ? { text: '' } : { text: parsed.value.text };
  },
};

export const TEXT_ENTRY_RESPONSE_CODEC_ID = 'text-entry-v1';
