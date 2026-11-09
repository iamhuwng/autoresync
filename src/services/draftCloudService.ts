import { Timestamp } from 'firebase/firestore';

/** Remove undefined values before writing Firestore documents. */
export function deepRemoveUndefined(value: any): any {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(deepRemoveUndefined);
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, deepRemoveUndefined(nested)]));
  }
  return value;
}

/** Convert Firestore timestamps to plain Date values when reading documents. */
export function convertTimestamps<T>(data: any): T {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) return data.toDate() as unknown as T;
  if (Array.isArray(data)) return data.map((item) => convertTimestamps(item)) as unknown as T;
  if (typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, convertTimestamps(value)])) as T;
  }
  return data;
}