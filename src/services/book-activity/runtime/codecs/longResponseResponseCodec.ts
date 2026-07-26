import type {
  ActivityResponseCodec,
  ActivityResponseValidationResult,
} from '../activityResponseCodec.types';
import {
  boundedResponseId,
  hasExactKeys,
  invalid,
  responseSizeDiagnostic,
  valid,
} from './codecHelpers';

export interface LongResponseResponse {
  interactionId: string;
  text: string;
}

export const MAX_LONG_RESPONSE_TEXT_LENGTH = 20_000;
const MAX_SERIALIZED_BYTES = 81_920;

const parse = (
  input: unknown,
): ActivityResponseValidationResult<LongResponseResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'text'])) {
    return invalid('$', 'Expected a canonical long-response response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (typeof input.text !== 'string' || input.text.length > MAX_LONG_RESPONSE_TEXT_LENGTH) {
    return invalid('$.text', 'Long-response text is outside supported bounds.');
  }
  return valid({ interactionId: input.interactionId, text: input.text });
};

export const longResponseResponseCodec: ActivityResponseCodec<LongResponseResponse | null> = {
  maxSerializedBytes: MAX_SERIALIZED_BYTES,
  createEmpty: () => null,
  decode: (input) => {
    const sizeDiagnostic = responseSizeDiagnostic(input);
    return sizeDiagnostic ? { valid: false, diagnostics: [sizeDiagnostic] } : parse(input);
  },
  validate: parse,
  serialize: (response) => {
    const parsed = parse(response);
    if (!parsed.valid) throw new TypeError('Cannot serialize malformed long-response response.');
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

export const LONG_RESPONSE_RESPONSE_CODEC_ID = 'long-response-v1';
