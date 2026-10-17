import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkAuthorityScope,
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

/** Read one committed recipient authority under its complete trusted scope. */
export const readBookHomeworkRecipientAuthority = async <
  T extends { readonly value: unknown },
>(
  store: { read(scope: BookHomeworkAuthorityScope): Promise<T | null> },
  scope: BookHomeworkAuthorityScope,
  recipientId: string,
): Promise<T | null> => {
  if (scope.authorityId !== bookHomeworkRecipientAuthorityId(scope.assignmentId, recipientId)) return null;
  const canonical = await store.read(scope);
  if (!canonical) return null;
  try {
    assertValidBookHomeworkAuthorityRecord(canonical.value);
  } catch {
    return null;
  }
  const record = canonical.value as BookHomeworkAuthorityRecord;
  return record.assignmentId === scope.authorityId
    && record.ownerId === scope.ownerId
    && record.bookManifest.ownerId === scope.ownerId
    && record.saga.sagaId === scope.assignmentId
    && record.bookManifest.context.contextId === scope.assignmentId
    && record.bookManifest.context.recipientId === recipientId
    && record.visibility.status === 'committed'
    && record.saga.state === 'committed'
    ? canonical
    : null;
};

/** Match a canonical child authority to its root assignment and recipient. */
export const bookHomeworkAuthorityMatchesContext = (
  authorityAssignmentId: string,
  sagaId: string,
  assignmentId: string,
  recipientId: string,
): boolean => (
  authorityAssignmentId === bookHomeworkRecipientAuthorityId(assignmentId, recipientId)
  && sagaId === assignmentId
);
