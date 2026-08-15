import { describe, expect, it } from 'vitest';
import {
  bookHomeworkRecipientAuthorityId,
  bookHomeworkRecipientDeliveryBindingId,
} from '../src/upload-worker/book-homework/identity.ts';
import { assertValidBookHomeworkSagaRecord } from '../src/upload-worker/book-homework/sagaRepository.ts';

const baseRecord = () => ({
  schemaVersion: 1 as const,
  assignmentId: 'assignment-1',
  operationId: '00000000-0000-4000-8000-000000000001',
  idempotencyKey: 'idempotency-1',
  ownerId: 'teacher-1',
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  contextId: 'assignment-1',
  presentation: { title: 'Book Homework', description: 'A bounded snapshot.' },
  fingerprint: 'fnv1a64:0000000000000001',
  requestFingerprint: 'request-1',
  state: 'prepared' as const,
  visibility: 'hidden' as const,
  recipients: [{
    recipientId: 'student-1',
    authorityId: bookHomeworkRecipientAuthorityId('assignment-1', 'student-1'),
    bindingId: bookHomeworkRecipientDeliveryBindingId('assignment-1', 'student-1'),
    state: 'pending' as const,
  }],
  recipientCount: 1,
  committedRecipientCount: 0,
  revision: 1,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
});

describe('Book Homework saga presentation schema', () => {
  it('accepts a bounded sanitized root presentation snapshot', () => {
    expect(() => assertValidBookHomeworkSagaRecord(baseRecord())).not.toThrow();
  });

  it('requires an exact presentation shape and trimmed text', () => {
    const missing = baseRecord() as Record<string, unknown>;
    delete missing.presentation;
    expect(() => assertValidBookHomeworkSagaRecord(missing)).toThrow('invalid_book_homework_saga_fields');

    const untrimmed = baseRecord();
    untrimmed.presentation = { title: ' Book Homework ' };
    expect(() => assertValidBookHomeworkSagaRecord(untrimmed)).toThrow('invalid_book_homework_saga_presentation');
  });

  it('rejects empty or oversized presentation text', () => {
    const empty = baseRecord();
    empty.presentation = { title: 'Book Homework', description: '' };
    expect(() => assertValidBookHomeworkSagaRecord(empty)).toThrow('invalid_book_homework_saga_presentation');

    const oversized = baseRecord();
    oversized.presentation = { title: 'x'.repeat(513) };
    expect(() => assertValidBookHomeworkSagaRecord(oversized)).toThrow('invalid_book_homework_saga_presentation');
  });
});
