import type {
  BookAssemblyActivityVersionReference,
} from '../../types/bookAssembly.types';
import type {
  CanonicalPublishedActivityVersionRecord,
} from './canonicalActivityVersion.service';

export type CanonicalActivityVersionPrepareResult =
  | { readonly status: 'created' }
  | { readonly status: 'replayed' }
  | { readonly status: 'conflict' };

/**
 * Trusted publication-writer port. Implementations may read and create only
 * exact immutable Activity Version keys; they never scan an Activity root.
 */
export interface CanonicalActivityVersionWriter {
  prepare(
    record: CanonicalPublishedActivityVersionRecord,
  ): Promise<CanonicalActivityVersionPrepareResult>;
  readPrepared(
    reference: BookAssemblyActivityVersionReference,
  ): Promise<CanonicalPublishedActivityVersionRecord | null>;
}

export interface ExactPublishedActivityVersionRequest {
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly ownerId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly payloadFingerprint: string;
}

/**
 * Trusted runtime-reader port. A result is visible only when an exact committed
 * Book publication reference and the canonical immutable Activity Version agree.
 */
export interface ExactPublishedActivityVersionReader {
  readExact(
    request: ExactPublishedActivityVersionRequest,
  ): Promise<CanonicalPublishedActivityVersionRecord | null>;
}

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export class InMemoryCanonicalActivityVersionRepository
implements CanonicalActivityVersionWriter {
  private readonly records = new Map<string, CanonicalPublishedActivityVersionRecord>();

  private key(activityId: string, activityVersionId: string): string {
    return `${activityId}\u0000${activityVersionId}`;
  }

  async prepare(
    record: CanonicalPublishedActivityVersionRecord,
  ): Promise<CanonicalActivityVersionPrepareResult> {
    const key = this.key(record.activityId, record.activityVersionId);
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, clone(record));
      return { status: 'created' };
    }
    return stable(existing) === stable(record)
      ? { status: 'replayed' }
      : { status: 'conflict' };
  }

  async readPrepared(
    reference: BookAssemblyActivityVersionReference,
  ): Promise<CanonicalPublishedActivityVersionRecord | null> {
    const value = this.records.get(this.key(reference.activityId, reference.activityVersionId));
    return value ? clone(value) : null;
  }
}
