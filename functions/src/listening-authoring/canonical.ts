import { createHash, createHmac } from 'crypto';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const canonicalize = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('canonicalJson only supports JSON-compatible values.');
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const normalized = canonicalize(entry);
      return normalized === undefined ? null : normalized;
    });
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .reduce<Array<[string, unknown]>>((entries, key) => {
          const normalized = canonicalize(value[key]);
          if (normalized !== undefined) {
            entries.push([key, normalized]);
          }
          return entries;
        }, []),
    );
  }

  if (value === undefined) {
    return undefined;
  }

  throw new Error('canonicalJson only supports JSON-compatible values.');
};

export const canonicalJson = (value: unknown): string => {
  const normalized = canonicalize(value);
  const json = JSON.stringify(normalized);
  if (json === undefined) {
    throw new Error('canonicalJson cannot serialize undefined at the top level.');
  }

  return json;
};

export const requestHash = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');

export const hmacSha256Hex = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');
