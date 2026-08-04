import { describe, expect, it } from 'vitest';
import {
  createBookTeacherAssemblyDocumentRoute,
  isCurrentBookTeacherAssemblyDocument,
  type BookTeacherAssemblyDocumentProjection,
} from './bookTeacherAssemblyDocument.types';
import { BookDocumentTransportError } from './bookDocumentTransport.browser';

const projection = (): BookTeacherAssemblyDocumentProjection => ({
  kind: 'teacher_assembly',
  bookId: 'book-1',
  bookRevision: 7,
  candidateId: 'candidate-1',
  candidateRevision: 3,
  sourceSetRevision: 4,
  sourceKey: 'full',
  sourceVersionId: 'source-v1',
  route: createBookTeacherAssemblyDocumentRoute({
    workerOrigin: 'https://worker.example/',
    bookId: 'book-1',
    unitKey: 'unit-1',
    candidateId: 'candidate-1',
    candidateRevision: 3,
    sourceKey: 'full',
    sourceVersionId: 'source-v1',
    sourceSetRevision: 4,
    bookRevision: 7,
    physicalPageNumber: 2,
  }),
});

const current = () => ({
  bookId: 'book-1',
  bookRevision: 7,
  candidateId: 'candidate-1',
  candidateRevision: 3,
  candidateLifecycle: 'draft' as const,
  sourceSetRevision: 4,
  sourceVersionIds: ['source-v1'],
});

describe('bookTeacherAssemblyDocument.types', () => {
  it('creates only the canonical non-capability teacher Assembly route', () => {
    expect(projection().route).toEqual({
      url: 'https://worker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/full/source-v1/4/7',
      sourceVersionId: 'source-v1',
      physicalPageNumber: 2,
    });

    for (const bad of ['../secret', 'key?token=secret', 'source:version', 'x'.repeat(161), '']) {
      expect(() => createBookTeacherAssemblyDocumentRoute({
        workerOrigin: 'https://worker.example',
        bookId: 'book-1',
        unitKey: 'unit-1',
        candidateId: 'candidate-1',
        candidateRevision: 3,
        sourceKey: bad,
        sourceVersionId: 'source-v1',
        sourceSetRevision: 4,
        bookRevision: 7,
      })).toThrow(BookDocumentTransportError);
    }
  });

  it('accepts only an exact current non-discarded candidate/source binding', () => {
    expect(isCurrentBookTeacherAssemblyDocument(projection(), current())).toBe(true);

    expect(isCurrentBookTeacherAssemblyDocument(projection(), {
      ...current(),
      candidateRevision: 4,
    })).toBe(false);
    expect(isCurrentBookTeacherAssemblyDocument(projection(), {
      ...current(),
      sourceSetRevision: 5,
    })).toBe(false);
    expect(isCurrentBookTeacherAssemblyDocument(projection(), {
      ...current(),
      candidateLifecycle: 'discarded',
    })).toBe(false);
    expect(isCurrentBookTeacherAssemblyDocument(projection(), {
      ...current(),
      sourceVersionIds: ['source-replaced'],
    })).toBe(false);
    expect(isCurrentBookTeacherAssemblyDocument({
      ...projection(),
      bookId: 'copied-book',
    }, current())).toBe(false);
  });
});
