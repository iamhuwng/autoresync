import type {
  ActivityResponseCodec,
  ActivityResponseValidationResult,
} from '../activityResponseCodec.types';
import {
  boundedItemId,
  boundedResponseId,
  canonicalIdOrder,
  hasExactKeys,
  invalid,
  isDenseArray,
  MAX_RESPONSE_ITEMS,
  responseSizeDiagnostic,
  uniqueIds,
  valid,
} from './codecHelpers';

export interface MatchingPairResponse {
  leftItemId: string;
  rightItemId: string;
}

export interface MatchingResponse {
  interactionId: string;
  pairs: readonly MatchingPairResponse[];
}

export interface MatchingResponseCodecOptions {
  allowedLeftItemIds?: readonly string[];
  allowedRightItemIds?: readonly string[];
  allowOptionReuse?: boolean;
}

const MAX_SERIALIZED_BYTES = 81_920;

const configuredIds = (
  values: readonly string[] | undefined,
  label: string,
): readonly string[] | undefined => {
  if (values === undefined) return undefined;
  if (!isDenseArray(values, MAX_RESPONSE_ITEMS) ||
      !values.every(boundedItemId) ||
      !uniqueIds(values as string[])) {
    throw new TypeError(`${label} identities must be unique and bounded.`);
  }
  return Array.from(values as readonly string[]);
};

const parse = (
  input: unknown,
  options: Required<Pick<MatchingResponseCodecOptions, 'allowOptionReuse'>> & {
    allowedLeftItemIds?: readonly string[];
    allowedRightItemIds?: readonly string[];
  },
): ActivityResponseValidationResult<MatchingResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'pairs'])) {
    return invalid('$', 'Expected a canonical matching response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (!isDenseArray(input.pairs, MAX_RESPONSE_ITEMS)) {
    return invalid('$.pairs', 'Matching pairs are outside supported bounds.');
  }
  const pairs: MatchingPairResponse[] = [];
  for (let index = 0; index < input.pairs.length; index += 1) {
    const pair = input.pairs[index];
    if (!hasExactKeys(pair, ['leftItemId', 'rightItemId']) ||
        !boundedItemId(pair.leftItemId) ||
        !boundedItemId(pair.rightItemId)) {
      return invalid(`$.pairs[${index}]`, 'Matching pair identities are invalid.');
    }
    if (options.allowedLeftItemIds && !options.allowedLeftItemIds.includes(pair.leftItemId)) {
      return invalid(`$.pairs[${index}].leftItemId`, 'Left item is not part of this interaction.');
    }
    if (options.allowedRightItemIds && !options.allowedRightItemIds.includes(pair.rightItemId)) {
      return invalid(`$.pairs[${index}].rightItemId`, 'Right item is not part of this interaction.');
    }
    pairs.push({ leftItemId: pair.leftItemId, rightItemId: pair.rightItemId });
  }
  if (!uniqueIds(pairs.map((pair) => pair.leftItemId))) {
    return invalid('$.pairs', 'Each left item may have at most one match.');
  }
  if (!options.allowOptionReuse && !uniqueIds(pairs.map((pair) => pair.rightItemId))) {
    return invalid('$.pairs', 'Right item reuse is not allowed.');
  }
  pairs.sort((left, right) =>
    canonicalIdOrder(left.leftItemId, right.leftItemId) ||
    canonicalIdOrder(left.rightItemId, right.rightItemId));
  return valid({ interactionId: input.interactionId, pairs });
};

export const createMatchingResponseCodec = (
  codecOptions: MatchingResponseCodecOptions = {},
): ActivityResponseCodec<MatchingResponse | null> => {
  const options = {
    allowedLeftItemIds: configuredIds(codecOptions.allowedLeftItemIds, 'Matching left-item'),
    allowedRightItemIds: configuredIds(codecOptions.allowedRightItemIds, 'Matching right-item'),
    allowOptionReuse: codecOptions.allowOptionReuse ?? false,
  };
  const parseValue = (input: unknown) => parse(input, options);
  return {
    maxSerializedBytes: MAX_SERIALIZED_BYTES,
    createEmpty: () => null,
    decode: (input) => {
      const sizeDiagnostic = responseSizeDiagnostic(input);
      return sizeDiagnostic ? { valid: false, diagnostics: [sizeDiagnostic] } : parseValue(input);
    },
    validate: parseValue,
    serialize: (response) => {
      const parsed = parseValue(response);
      if (!parsed.valid) throw new TypeError('Cannot serialize malformed matching response.');
      return parsed.value;
    },
    equals: (left, right) => {
      const leftValue = parseValue(left);
      const rightValue = parseValue(right);
      if (!leftValue.valid || !rightValue.valid) return false;
      if (leftValue.value === null || rightValue.value === null) return leftValue.value === rightValue.value;
      return leftValue.value.interactionId === rightValue.value.interactionId &&
        leftValue.value.pairs.length === rightValue.value.pairs.length &&
        leftValue.value.pairs.every((pair, index) =>
          pair.leftItemId === rightValue.value!.pairs[index]!.leftItemId &&
          pair.rightItemId === rightValue.value!.pairs[index]!.rightItemId);
    },
    toReviewProjection: (response) => {
      const parsed = parseValue(response);
      if (!parsed.valid || parsed.value === null) return { text: '' };
      const items = parsed.value.pairs.map((pair) => `${pair.leftItemId} → ${pair.rightItemId}`);
      return { text: items.join(', '), items };
    },
  };
};

export const matchingResponseCodec = createMatchingResponseCodec();
export const MATCHING_RESPONSE_CODEC_ID = 'matching-pairs-v1';
