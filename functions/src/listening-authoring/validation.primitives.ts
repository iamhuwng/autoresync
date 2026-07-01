export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const requireString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
};

export const requireText = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }

  return value;
};

export const requireBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
};

export const optionalString = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
};

export const requireNonNegativeInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
};

export const requirePositiveInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return value;
};

export const optionalNonNegativeInteger = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return requireNonNegativeInteger(value, fieldName);
};

export const optionalPositiveInteger = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return requirePositiveInteger(value, fieldName);
};

export const optionalBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
};

export const optionalText = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }

  return value;
};

export const rejectBrowserOwnerId = (body: Record<string, unknown>): void => {
  if (Object.prototype.hasOwnProperty.call(body, 'ownerId')) {
    throw new Error('ownerId is server-derived');
  }
};

export const cloneJsonCompatibleValue = <T>(value: T): T => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('document must contain JSON-compatible values.');
    }

    return value;
  }

  if (value === undefined) {
    throw new Error('document must contain JSON-compatible values.');
  }

  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error('document must contain JSON-compatible values.');
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonCompatibleValue(entry)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonCompatibleValue(entry)]),
    ) as T;
  }

  throw new Error('document must contain JSON-compatible values.');
};

export const assertAllowedFields = (
  value: Record<string, unknown>,
  fieldName: string,
  allowedFields: readonly string[],
): void => {
  const allowed = new Set(allowedFields);
  const unknownField = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownField !== undefined) {
    throw new Error(`${fieldName}.${unknownField} is not an approved field.`);
  }
};

export const parseStringArray = (value: unknown, fieldName: string): readonly string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${fieldName} must be a string array.`);
  }

  return [...value];
};

export const requireStringArray = (value: unknown, fieldName: string): readonly string[] => {
  const parsed = parseStringArray(value, fieldName);
  if (parsed === undefined) {
    throw new Error(`${fieldName} must be a string array.`);
  }

  return parsed;
};
