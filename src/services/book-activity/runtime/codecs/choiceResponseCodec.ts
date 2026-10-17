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

export interface ChoiceSingleResponse {
  interactionId: string;
  selectedOptionId: string | null;
}

export interface ChoiceMultipleResponse {
  interactionId: string;
  selectedOptionIds: readonly string[];
}

export type ChoiceResponse = ChoiceSingleResponse | ChoiceMultipleResponse | null;

export interface ChoiceResponseCodecOptions {
  mode: 'single' | 'multiple';
  allowedOptionIds?: readonly string[];
}

const MAX_SERIALIZED_BYTES = 81_920;

const configuredOptionIds = (options: ChoiceResponseCodecOptions): readonly string[] | undefined => {
  const optionIds = options.allowedOptionIds;
  if (optionIds === undefined) return undefined;
  if (
    !isDenseArray(optionIds, MAX_RESPONSE_ITEMS) ||
    !optionIds.every(boundedItemId) ||
    !uniqueIds(optionIds as string[])
  ) {
    throw new TypeError('Choice codec option identities must be unique and bounded.');
  }
  return Array.from(optionIds as string[]);
};

const unknownOption = (
  optionId: string,
  allowedOptionIds: readonly string[] | undefined,
): boolean => allowedOptionIds !== undefined && !allowedOptionIds.includes(optionId);

const singleValue = (
  input: unknown,
  allowedOptionIds: readonly string[] | undefined,
): ActivityResponseValidationResult<ChoiceSingleResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'selectedOptionId'])) {
    return invalid('$', 'Expected a canonical single-choice response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (input.selectedOptionId !== null && !boundedItemId(input.selectedOptionId)) {
    return invalid('$.selectedOptionId', 'Selected option identity is invalid.');
  }
  if (typeof input.selectedOptionId === 'string' && unknownOption(input.selectedOptionId, allowedOptionIds)) {
    return invalid('$.selectedOptionId', 'Selected option is not part of this interaction.');
  }
  return valid({ interactionId: input.interactionId, selectedOptionId: input.selectedOptionId });
};

const multipleValue = (
  input: unknown,
  allowedOptionIds: readonly string[] | undefined,
): ActivityResponseValidationResult<ChoiceMultipleResponse | null> => {
  if (input === null) return valid(null);
  if (!hasExactKeys(input, ['interactionId', 'selectedOptionIds'])) {
    return invalid('$', 'Expected a canonical multiple-choice response.');
  }
  if (!boundedResponseId(input.interactionId)) {
    return invalid('$.interactionId', 'Interaction identity is invalid.');
  }
  if (!isDenseArray(input.selectedOptionIds, MAX_RESPONSE_ITEMS)) {
    return invalid('$.selectedOptionIds', 'Selected options are outside supported bounds.');
  }
  const selectedOptionIds = input.selectedOptionIds;
  if (!selectedOptionIds.every(boundedItemId)) {
    return invalid('$.selectedOptionIds', 'Selected option identity is invalid.');
  }
  if (!uniqueIds(selectedOptionIds as string[])) {
    return invalid('$.selectedOptionIds', 'Duplicate selected option identities are not allowed.');
  }
  const unknownIndex = selectedOptionIds.findIndex((optionId) =>
    typeof optionId === 'string' && unknownOption(optionId, allowedOptionIds));
  if (unknownIndex >= 0) {
    return invalid(`$.selectedOptionIds[${unknownIndex}]`, 'Selected option is not part of this interaction.');
  }
  return valid({
    interactionId: input.interactionId,
    selectedOptionIds: Array.from(selectedOptionIds as string[]).sort(canonicalIdOrder),
  });
};

export const createChoiceResponseCodec = (
  options: ChoiceResponseCodecOptions,
): ActivityResponseCodec<ChoiceSingleResponse | ChoiceMultipleResponse | null> => {
  const allowedOptionIds = configuredOptionIds(options);
  const parse = (input: unknown) =>
    options.mode === 'single'
      ? singleValue(input, allowedOptionIds)
      : multipleValue(input, allowedOptionIds);

  return {
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
      if (!parsed.valid) throw new TypeError('Cannot serialize malformed choice response.');
      return parsed.value;
    },
    equals: (left, right) => {
      const leftValue = parse(left);
      const rightValue = parse(right);
      if (!leftValue.valid || !rightValue.valid) return false;
      if (leftValue.value === null || rightValue.value === null) return leftValue.value === rightValue.value;
      if (options.mode === 'single') {
        const leftSingle = leftValue.value as ChoiceSingleResponse;
        const rightSingle = rightValue.value as ChoiceSingleResponse;
        return leftSingle.interactionId === rightSingle.interactionId &&
          leftSingle.selectedOptionId === rightSingle.selectedOptionId;
      }
      const leftMultiple = leftValue.value as ChoiceMultipleResponse;
      const rightMultiple = rightValue.value as ChoiceMultipleResponse;
      return leftMultiple.interactionId === rightMultiple.interactionId &&
        leftMultiple.selectedOptionIds.length === rightMultiple.selectedOptionIds.length &&
        leftMultiple.selectedOptionIds.every((id, index) => id === rightMultiple.selectedOptionIds[index]);
    },
    toReviewProjection: (response) => {
      const parsed = parse(response);
      if (!parsed.valid || parsed.value === null) return { text: '' };
      if (options.mode === 'single') {
        const value = parsed.value as ChoiceSingleResponse;
        return value.selectedOptionId === null
          ? { text: '' }
          : { text: value.selectedOptionId, items: [value.selectedOptionId] };
      }
      const value = parsed.value as ChoiceMultipleResponse;
      return { text: value.selectedOptionIds.join(', '), items: Array.from(value.selectedOptionIds) };
    },
  };
};

export const choiceSingleResponseCodec = createChoiceResponseCodec({ mode: 'single' });
export const choiceMultipleResponseCodec = createChoiceResponseCodec({ mode: 'multiple' });

export const CHOICE_SINGLE_RESPONSE_CODEC_ID = 'choice-single-v1';
export const CHOICE_MULTIPLE_RESPONSE_CODEC_ID = 'choice-multiple-v1';
