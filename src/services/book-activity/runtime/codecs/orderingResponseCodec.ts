import type {
  ActivityResponseCodec,
  ActivityResponseValidationResult,
} from '../activityResponseCodec.types';
import {
  boundedItemId,
  boundedResponseId,
  hasExactKeys,
  invalid,
  isDenseArray,
  MAX_RESPONSE_ITEMS,
  responseSizeDiagnostic,
  uniqueIds,
  valid,
} from './codecHelpers';

export interface OrderingResponse {
  interactionId: string;
  orderedItemIds: readonly string[];
}

export interface OrderingResponseCodecOptions {
  allowedItemIds?: readonly string[];
}

const MAX_SERIALIZED_BYTES = 81_920;

const configuredIds = (values: readonly string[] | undefined): readonly string[] | undefined => {
  if (values === undefined) return undefined;
  if (!isDenseArray(values, MAX_RESPONSE_ITEMS) ||
      !values.every(boundedItemId) ||
      !uniqueIds(values as string[])) {
    throw new TypeError('Ordering item identities must be unique and bounded.');
  }
  return Array.from(values as readonly string[]);
};

const parse = (
  input: unknown,
  allowedItemIds: readonly string[] | undefined,
): ActivityResponseValidationResult<OrderingResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'orderedItemIds'])) {
    return invalid('$', 'Expected a canonical ordering response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (!isDenseArray(input.orderedItemIds, MAX_RESPONSE_ITEMS)) {
    return invalid('$.orderedItemIds', 'Ordered item identities are outside supported bounds.');
  }
  const invalidItemIndex = input.orderedItemIds.findIndex((itemId) => !boundedItemId(itemId));
  if (invalidItemIndex >= 0) {
    return invalid(
      `$.orderedItemIds[${invalidItemIndex}]`,
      'Ordered item identity is outside supported bounds.',
    );
  }
  if (!uniqueIds(input.orderedItemIds as string[])) {
    return invalid('$.orderedItemIds', 'Duplicate ordered item identities are not allowed.');
  }
  const unknownIndex = allowedItemIds === undefined
    ? -1
    : input.orderedItemIds.findIndex((itemId) =>
      !allowedItemIds.includes(itemId as string));
  if (unknownIndex >= 0) {
    return invalid(`$.orderedItemIds[${unknownIndex}]`, 'Ordered item is not part of this interaction.');
  }
  return valid({
    interactionId: input.interactionId,
    orderedItemIds: Array.from(input.orderedItemIds as string[]),
  });
};

export const createOrderingResponseCodec = (
  options: OrderingResponseCodecOptions = {},
): ActivityResponseCodec<OrderingResponse | null> => {
  const allowedItemIds = configuredIds(options.allowedItemIds);
  const parseValue = (input: unknown) => parse(input, allowedItemIds);
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
      if (!parsed.valid) throw new TypeError('Cannot serialize malformed ordering response.');
      return parsed.value;
    },
    equals: (left, right) => {
      const leftValue = parseValue(left);
      const rightValue = parseValue(right);
      if (!leftValue.valid || !rightValue.valid) return false;
      if (leftValue.value === null || rightValue.value === null) return leftValue.value === rightValue.value;
      return leftValue.value.interactionId === rightValue.value.interactionId &&
        leftValue.value.orderedItemIds.length === rightValue.value.orderedItemIds.length &&
        leftValue.value.orderedItemIds.every(
          (itemId, index) => itemId === rightValue.value!.orderedItemIds[index],
        );
    },
    toReviewProjection: (response) => {
      const parsed = parseValue(response);
      if (!parsed.valid || parsed.value === null) return { text: '' };
      const items = Array.from(parsed.value.orderedItemIds);
      return { text: items.join(' → '), items };
    },
  };
};

export const orderingResponseCodec = createOrderingResponseCodec();
export const ORDERING_RESPONSE_CODEC_ID = 'ordering-items-v1';
