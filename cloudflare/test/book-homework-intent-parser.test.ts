import { describe, expect, it } from 'vitest';
import {
  parseBookHomeworkAssignmentIntent,
  BookHomeworkWorkerError,
} from '../src/upload-worker/book-homework/worker.ts';

const baseIntent = () => ({
  bookId: 'book-1',
  target: { kind: 'unit', bookId: 'book-1', classId: 'class-1', nodeKey: 'unit-1' },
  schedule: { finalDueAt: '2026-08-30T00:00:00.000Z', nodeOverrides: [] },
  policy: {
    intent: 'practice',
    integrityCapture: false,
    integrityOverride: false,
    activityPolicies: [{
      placementId: 'placement-1',
      maxAttempts: 2,
      feedbackRelease: 'immediate',
      lateSubmissionAllowed: false,
    }],
  },
  expectedPublication: {
    publicationId: 'publication-1',
    publicationRevision: 1,
    manifestVersionId: 'manifest-1',
  },
  presentation: { title: '  Book Homework  ', description: '  A snapshot.  ' },
});

describe('Book Homework assignment intent parser', () => {
  it('requires and sanitizes the bounded presentation', () => {
    expect(parseBookHomeworkAssignmentIntent(baseIntent()).presentation).toEqual({
      title: 'Book Homework',
      description: 'A snapshot.',
    });
  });

  it('rejects missing, extra, and oversized presentation fields', () => {
    const missing = baseIntent() as Record<string, unknown>;
    delete missing.presentation;
    expect(() => parseBookHomeworkAssignmentIntent(missing)).toThrow(BookHomeworkWorkerError);

    const extra = baseIntent();
    extra.presentation = { title: 'Book Homework', unsupported: true } as never;
    expect(() => parseBookHomeworkAssignmentIntent(extra)).toThrow(BookHomeworkWorkerError);

    const oversized = baseIntent();
    oversized.presentation = { title: 'x'.repeat(513) };
    expect(() => parseBookHomeworkAssignmentIntent(oversized)).toThrow(BookHomeworkWorkerError);
  });

  it('omits an optional blank description after normalization', () => {
    const intent = baseIntent();
    intent.presentation = { title: 'Book Homework', description: '   ' };
    expect(parseBookHomeworkAssignmentIntent(intent).presentation).toEqual({ title: 'Book Homework' });
  });
});
