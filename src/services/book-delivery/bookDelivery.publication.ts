import type {
  BookDeliveryPlacement,
  BookDeliverySchedulePolicyReference,
  BookDeliveryScope,
  BookDeliverySourceSet,
  BookDeliveryStructuralNodeProjection,
} from './bookDelivery.types';
import { validateBookDeliveryBinding } from './bookDelivery.schema';

export interface BookDeliveryPublishedPublicationReference {
  readonly bookId: string;
  readonly bookMode: 'pdf';
  readonly bookRevision: number;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly publicationStatus: 'published';
  readonly ownerId: string;
  readonly scope: BookDeliveryScope;
  readonly outline: readonly BookDeliveryStructuralNodeProjection[];
  readonly sourceSet: BookDeliverySourceSet;
  readonly placements: readonly BookDeliveryPlacement[];
  readonly schedulePolicy: BookDeliverySchedulePolicyReference;
}

export class BookDeliveryPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookDeliveryPublicationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    throw new BookDeliveryPublicationError(`${label} contains unsupported or missing publication fields.`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new BookDeliveryPublicationError(`${label}.${key} must be an enumerable data field.`);
    }
  }
};

const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value);

export function assertPublishedBookDeliveryPublication(
  value: unknown,
): asserts value is BookDeliveryPublishedPublicationReference {
  if (!isRecord(value)) throw new BookDeliveryPublicationError('publication must be a plain object.');
  exactKeys(value, [
    'bookId', 'bookMode', 'bookRevision', 'manifestVersionId', 'outline', 'ownerId', 'placements', 'publicationId',
    'publicationRevision', 'publicationStatus', 'schedulePolicy', 'scope', 'sourceSet',
  ], 'publication');
  const publication = value as Record<string, any>;
  if (!id(publication.bookId) || publication.bookMode !== 'pdf' || !Number.isSafeInteger(publication.bookRevision)
    || publication.bookRevision < 0 || !id(publication.manifestVersionId) || !id(publication.publicationId) || !Number.isSafeInteger(publication.publicationRevision)
    || publication.publicationRevision <= 0 || publication.publicationStatus !== 'published' || !id(publication.ownerId)
    || !Array.isArray(publication.placements) || !isRecord(publication.sourceSet) || !Array.isArray(publication.sourceSet.sources)) {
    throw new BookDeliveryPublicationError('publication is not a published Mode 2 PDF reference.');
  }
  const schedulePolicy = publication.schedulePolicy as Record<string, any>;
  if (!isRecord(publication.schedulePolicy) || schedulePolicy.basis !== 'immutable-reference'
    || !id(schedulePolicy.policyId) || !Number.isSafeInteger(schedulePolicy.policyRevision)
    || schedulePolicy.policyRevision <= 0) {
    throw new BookDeliveryPublicationError('publication schedule policy reference is invalid.');
  }
  const validation = validateBookDeliveryBinding({
    schemaVersion: 3,
    bindingId: 'publication-validation',
    revision: 0,
    status: 'draft',
    recipient: { recipientId: 'publication-validation', recipientKind: 'preview-user' },
    issuer: { ownerId: publication.ownerId, authorityBoundary: 'book-owner' },
    book: {
      bookId: publication.bookId,
      bookMode: publication.bookMode,
      bookRevision: publication.bookRevision,
      manifestVersionId: publication.manifestVersionId,
      publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision,
      publicationStatus: publication.publicationStatus,
    },
    scope: publication.scope,
    outline: publication.outline,
    context: {
      kind: 'preview',
      contextId: 'publication-validation',
      recipientId: 'publication-validation',
      ownerId: publication.ownerId,
      entitlementBasis: 'preview',
    },
    sourceSet: publication.sourceSet,
    placements: publication.placements,
    schedulePolicy: publication.schedulePolicy,
    createdAt: '2000-01-01T00:00:00.000Z',
  });
  if (!validation.valid) {
    throw new BookDeliveryPublicationError(`publication binding fields are invalid: ${validation.errors[0]?.message ?? 'unknown error'}`);
  }
}

export const createBookDeliveryPublicationReference = (
  value: unknown,
): BookDeliveryPublishedPublicationReference => {
  assertPublishedBookDeliveryPublication(value);
  return deepFreeze(structuredClone(value));
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    });
  }
  return value;
};
