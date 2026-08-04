import {
  MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES,
  type ActivityResponseDiagnostic,
  type ActivityResponseValidationResult,
} from '../activityResponseCodec.types';

export const MAX_RESPONSE_INTERACTION_ID_LENGTH = 160;
export const MAX_RESPONSE_ITEM_ID_LENGTH = 160;
export const MAX_RESPONSE_TEXT_LENGTH = 4_000;
export const MAX_RESPONSE_ITEMS = 100;

export const RESPONSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/u;

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export const hasExactKeys = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> => {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every(
    (key) =>
      typeof key === 'string' &&
      allowed.has(key) &&
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'),
  ) && keys.every((key) => Object.hasOwn(value, key));
};

export const isDenseArray = (
  value: unknown,
  maximum: number,
): value is unknown[] =>
  Array.isArray(value) &&
  value.length <= maximum &&
  Reflect.ownKeys(value).every(
    (key) =>
      key === 'length' ||
      (typeof key === 'string' &&
        /^(0|[1-9]\d*)$/u.test(key) &&
        Number(key) < value.length &&
        Object.prototype.propertyIsEnumerable.call(value, key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')),
  ) &&
  Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);

export const invalid = <Response>(
  path: string,
  message: string,
): ActivityResponseValidationResult<Response> => ({
  valid: false,
  diagnostics: [{ code: 'malformed-response', path, message }],
});

export const valid = <Response>(value: Response): ActivityResponseValidationResult<Response> => ({
  valid: true,
  value,
  diagnostics: [],
});

export const responseSizeDiagnostic = (value: unknown): ActivityResponseDiagnostic | null => {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {
      code: 'malformed-response',
      path: '$',
      message: 'Activity response must be JSON-serializable.',
    };
  }
  if (serialized === undefined) {
    return {
      code: 'malformed-response',
      path: '$',
      message: 'Activity response must have a JSON representation.',
    };
  }
  return new TextEncoder().encode(serialized).byteLength > MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES
    ? {
        code: 'response-too-large',
        path: '$',
        message: 'Activity response exceeds codec serialization limit.',
      }
    : null;
};

export const boundedResponseId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_RESPONSE_INTERACTION_ID_LENGTH &&
  RESPONSE_ID_PATTERN.test(value);

export const boundedItemId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_RESPONSE_ITEM_ID_LENGTH &&
  RESPONSE_ID_PATTERN.test(value);

export const boundedText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_RESPONSE_TEXT_LENGTH;

export const canonicalIdOrder = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const uniqueIds = (ids: readonly string[]): boolean =>
  new Set(ids).size === ids.length;
