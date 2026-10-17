import type { BookDeliveryLegacyV1Read } from './bookDelivery.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value);
const iso = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

/**
 * Explicit read-only adapter for the legacy V1 record shape. It never
 * upgrades, rewrites, infers provider authority, or treats Mode 1 as Mode 2.
 */
export const readLegacyBookDeliveryV1 = (value: unknown): BookDeliveryLegacyV1Read | null => {
  if (!isRecord(value)) return null;
  const keys = ['bindingId', 'bookId', 'createdAt', 'recipientId', 'schemaVersion', 'sourceVersionId'];
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) return null;
  const fields = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) return null;
    fields[key] = descriptor.value;
  }
  if (fields.schemaVersion !== 1 || !id(fields.bindingId) || !id(fields.bookId)
    || !id(fields.recipientId) || !id(fields.sourceVersionId) || !iso(fields.createdAt)) return null;
  return Object.freeze({
    version: 1 as const,
    bindingId: fields.bindingId,
    bookId: fields.bookId,
    recipientId: fields.recipientId,
    sourceVersionId: fields.sourceVersionId,
    createdAt: fields.createdAt,
    readOnly: true as const,
  });
};
