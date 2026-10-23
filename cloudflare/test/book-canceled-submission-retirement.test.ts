import { describe, expect, it } from 'vitest';
import { fenceCanceledSubmissionBook, authorizesCanceledSubmissionRetirement, findCanceledSubmissionSource } from '../src/upload-worker/book-source/canceled-submission-retirement';
import type { BookSourceUploadOperation, BookSourceUploadAccountState } from '../../src/types/bookSource.types';

const source = { bookId: 'book-1', ownerId: 'teacher-1', sourceVersionId: 'source-1',
  reservationId: 'reservation-1', submissionOperationId: 'submission-1' } as BookSourceUploadOperation;
const parentPath = 'book_submission_operations/teacher-1/operations/submission-1';
const markerPath = 'material_catalog/book_creation_fences/book-1';
const bookPath = 'material_catalog/books/book-1';
const setup = (parent = { operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1', fingerprint: 'a'.repeat(64), state: 'canceled' }) => {
  const rows: Record<string, unknown> = { [parentPath]: parent };
  const events: string[] = [];
  const readValue = async (path: string) => { events.push(path); return rows[path] ?? null; };
  return { rows, events, readValue,
    readWithEtag: async <T>(path: string) => ({ data: (rows[path] ?? null) as T, etag: 'etag' }),
    writeIfMatch: async (path: string, value: unknown) => { events.push('fence'); rows[path] = value; return true; },
  };
};

describe('canceled unpublished Book retirement authority', () => {
  it('bounds discovery and resumes past committed owners to find a late composed source', async () => {
    const operations = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`reservation-${n}`, {
      ...source, ownerId: `teacher-${n}`, reservationId: `reservation-${n}`,
      status: 'verified_completed', purpose: 'student-document', expiresAt: '2026-10-19T00:00:00.000Z',
    }]));
    const state = { revision: 1, capacity: { trackedAccountBytes: 0, temporaryBytes: 0 }, operations } as BookSourceUploadAccountState;
    const reads: string[] = [];
    const read = async (path: string) => {
      reads.push(path); const ownerId = path.split('/')[1];
      return { operationId: 'submission-1', ownerId, finalBookId: 'book-1',
        fingerprint: 'a'.repeat(64), state: ownerId === 'teacher-5' ? 'canceled' : 'committed' };
    };
    const first = await findCanceledSubmissionSource(state, new Date(), read);
    expect(first).toEqual({ afterReservationId: 'reservation-4' }); expect(reads).toHaveLength(4);
    const next = await findCanceledSubmissionSource({ ...state, canceledSubmissionScanAfterReservationId: first.afterReservationId }, new Date(), read);
    expect(next.operation?.ownerId).toBe('teacher-5'); expect(reads).toHaveLength(5);
    expect(next.afterReservationId).toBe('reservation-5');
    const terminal = { ...operations['reservation-5'], status: 'retired',
      cleanup: { nextRetryAt: '2026-10-19T00:00:00.000Z' } } as BookSourceUploadOperation;
    const sweep = await findCanceledSubmissionSource({ ...state, operations: { terminal } }, new Date(), read);
    expect(sweep.operation?.status).toBe('retired');
  });
  it('creates the permanent Book fence before checking references and authorizes an exact replay', async () => {
    const db = setup();
    const guard = await fenceCanceledSubmissionBook(db, source);
    expect(db.events.indexOf('fence')).toBeLessThan(db.events.indexOf(bookPath));
    expect(guard).toMatchObject({ kind: 'canceled-submission', submissionOperationId: 'submission-1' });
    expect(guard).not.toHaveProperty('sourceVersionIds');
    expect(await fenceCanceledSubmissionBook(db, source)).toEqual(guard);
    expect(await authorizesCanceledSubmissionRetirement(db.readValue, { ...source, retirementGuard: guard })).toBe(true);
    db.rows[bookPath] = { bookId: 'book-1', ownerId: 'teacher-1' };
    expect(await authorizesCanceledSubmissionRetirement(db.readValue, { ...source, retirementGuard: guard })).toBe(false);
  });

  it.each(['preparing', 'committing', 'committed'])('rejects a %s parent before writing a fence', async (state) => {
    const db = setup();
    (db.rows[parentPath] as Record<string, unknown>).state = state;
    await expect(fenceCanceledSubmissionBook(db, source)).rejects.toThrow('authority_denied');
    expect(db.rows[markerPath]).toBeUndefined();
  });

  it.each([bookPath, 'book_assembly_publications/books/book-1', 'book_delivery/current/book-1'])('rejects a retained reference at %s', async (path) => {
    const db = setup(); db.rows[path] = { exists: true };
    await expect(fenceCanceledSubmissionBook(db, source)).rejects.toThrow('authority_denied');
  });

  it('rejects mismatched parent and immutable fence identities', async () => {
    const db = setup();
    db.rows[markerPath] = { bookId: 'book-1', ownerId: 'teacher-2', submissionOperationId: 'submission-1', inputFingerprint: 'a'.repeat(64) };
    await expect(fenceCanceledSubmissionBook(db, source)).rejects.toThrow('authority_denied');
    delete db.rows[markerPath];
    (db.rows[parentPath] as Record<string, unknown>).finalBookId = 'book-2';
    await expect(fenceCanceledSubmissionBook(db, source)).rejects.toThrow('authority_denied');
    expect(db.rows[markerPath]).toBeUndefined();
  });
});
