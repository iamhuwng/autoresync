import { assertBookDeliveryBinding } from './bookDelivery.schema';
import type {
  BookDeliveryBinding,
  BookDeliveryBindingStatus,
  BookDeliveryContext,
  BookDeliveryIssuer,
  BookDeliveryRecipient,
} from './bookDelivery.types';
import type { BookDeliveryPublishedPublicationReference } from './bookDelivery.publication';
import { createBookDeliveryPublicationReference } from './bookDelivery.publication';

export interface CreateBookDeliveryBindingInput {
  readonly bindingId: string;
  readonly revision: number;
  readonly status: BookDeliveryBindingStatus;
  readonly recipient: BookDeliveryRecipient;
  readonly issuer: BookDeliveryIssuer;
  readonly context: BookDeliveryContext;
  readonly publication: BookDeliveryPublishedPublicationReference;
  readonly createdAt: string;
}

/**
 * Pure entitlement construction. It accepts only a trusted published
 * publication reference and emits an immutable, recipient-specific binding.
 * It never grants provider authority, reads storage, or mutates a record.
 */
export const createBookDeliveryBinding = (
  input: CreateBookDeliveryBindingInput,
): BookDeliveryBinding => {
  const publication = createBookDeliveryPublicationReference(input.publication);
  if (input.issuer.ownerId !== publication.ownerId || input.context.ownerId !== publication.ownerId) {
    throw new Error('Book Delivery issuer must match published publication owner.');
  }
  if (input.recipient.recipientId !== input.context.recipientId) {
    throw new Error('Book Delivery recipient must match context recipient.');
  }
  const recipient = structuredClone(input.recipient);
  const issuer = structuredClone(input.issuer);
  const context = structuredClone(input.context);
  const binding: BookDeliveryBinding = {
    schemaVersion: 3,
    bindingId: input.bindingId,
    revision: input.revision,
    status: input.status,
    recipient,
    issuer,
    book: {
      bookId: publication.bookId,
      bookMode: publication.bookMode,
      bookRevision: publication.bookRevision,
      publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision,
      publicationStatus: publication.publicationStatus,
    },
    scope: publication.scope,
    outline: publication.outline,
    context,
    sourceSet: publication.sourceSet,
    placements: publication.placements,
    schedulePolicy: publication.schedulePolicy,
    createdAt: input.createdAt,
  };
  assertBookDeliveryBinding(binding);
  return deepFreeze(binding);
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
