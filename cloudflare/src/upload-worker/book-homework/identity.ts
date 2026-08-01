import type {
  BookHomeworkAuthorityRecord,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  assertValidBookHomeworkAuthorityRecord,
} from './authority.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;

const canonicalId = (
  assignmentId: string,
  recipientId: string,
  suffix: 'authority' | 'delivery',
): string => {
  if (!ID.test(assignmentId) || !ID.test(recipientId)) {
    throw new Error('book_homework_identity_invalid');
  }
  const value = `${assignmentId}--${recipientId}--${suffix}`;
  if (!ID.test(value)) throw new Error('book_homework_identity_invalid');
  return value;
};

/** Deterministic Firestore document identity for one recipient authority. */
export const bookHomeworkRecipientAuthorityId = (
  assignmentId: string,
  recipientId: string,
): string => canonicalId(assignmentId, recipientId, 'authority');

/** Deterministic RTDB Delivery binding identity for one recipient. */
export const bookHomeworkRecipientDeliveryBindingId = (
  assignmentId: string,
  recipientId: string,
): string => canonicalId(assignmentId, recipientId, 'delivery');

/**
 * Read the canonical recipient authority first. The root fallback preserves
 * legacy single-recipient authorities without making them the new write shape.
 */
export const readBookHomeworkRecipientAuthority = async <
  T extends { readonly value: unknown },
>(
  store: { read(assignmentId: string): Promise<T | null> },
  assignmentId: string,
  recipientId: string,
): Promise<T | null> => {
  const authorityId = bookHomeworkRecipientAuthorityId(assignmentId, recipientId);
  const canonical = await store.read(authorityId);
  if (canonical) {
    try {
      assertValidBookHomeworkAuthorityRecord(canonical.value);
    } catch {
      return null;
    }
    const record = canonical.value as BookHomeworkAuthorityRecord;
    return record.assignmentId === authorityId
      && record.saga.sagaId === assignmentId
      && record.bookManifest.context.contextId === assignmentId
      && record.bookManifest.context.recipientId === recipientId
      && record.visibility.status === 'committed'
      && record.saga.state === 'committed'
      ? canonical
      : null;
  }
  const legacy = await store.read(assignmentId);
  if (!legacy) return null;
  try {
    assertValidBookHomeworkAuthorityRecord(legacy.value);
  } catch {
    return null;
  }
  const record = legacy.value as BookHomeworkAuthorityRecord;
  return record.assignmentId === assignmentId
    && record.bookManifest.context.contextId === assignmentId
    && record.bookManifest.context.recipientId === recipientId
    && record.visibility.status === 'committed'
    && record.saga.state === 'committed'
    ? legacy
    : null;
};

/** Accept the canonical child record, plus the pre-saga root record shape. */
export const bookHomeworkAuthorityMatchesContext = (
  authorityAssignmentId: string,
  sagaId: string,
  assignmentId: string,
  recipientId: string,
): boolean => (
  authorityAssignmentId === assignmentId
  || (
    authorityAssignmentId === bookHomeworkRecipientAuthorityId(assignmentId, recipientId)
    && sagaId === assignmentId
  )
);
