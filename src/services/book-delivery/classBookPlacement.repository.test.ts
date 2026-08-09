import { describe, expect, it } from 'vitest';
import {
  classBookDurablePaths,
  FirebaseClassBookPlacementRepository,
} from '../../../cloudflare/src/upload-worker/class-book-placement/repository';

describe('#103 Class Book durable projection storage', () => {
  it('uses exact point paths for copies, immutable versions, bindings, attempts, and locks', () => {
    expect(classBookDurablePaths.copy('class-1', 'copy-1')).toBe('class_book_authority/copies/class-1/copy-1');
    expect(classBookDurablePaths.placementCurrent('class-class-1-copy-copy-1-material-class-material-1'))
      .toBe('class_book_authority/placements/current/class-class-1-copy-copy-1-material-class-material-1');
    expect(classBookDurablePaths.placementVersion('context-1', 2))
      .toBe('class_book_authority/placements/versions/context-1/2');
    expect(classBookDurablePaths.binding('binding-1')).toBe('book_delivery/bindings/class-course/binding-1');
    expect(classBookDurablePaths.lock('class-1', 'class-placement-1'))
      .toBe('class_book_authority/locks/class-1/class-placement-1');
    expect(classBookDurablePaths.progress('class-book-progress/class-1/copy-1')).toContain('class_book_authority/progress/');
    expect(classBookDurablePaths.result('class-book-result/class-1/copy-1')).toContain('class_book_authority/results/');
  });

  it('performs bounded reads and requires the trusted scoped patch seam for immutable writes', async () => {
    const paths: string[] = [];
    const repository = new FirebaseClassBookPlacementRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        readDatabaseValue: async (path) => {
          paths.push(path);
          return null;
        },
      },
      fetchImpl: async (_input, init) => new Response(init?.method === 'GET' ? 'null' : '{}', {
        status: 200,
        headers: { etag: 'etag-1' },
      }),
      getAccessToken: async () => 'test-access-token',
    });
    await repository.readCurrent('context-1');
    await repository.readCopy('class-1', 'copy-1');
    expect(paths).toEqual([
      'class_book_authority/placements/current/context-1',
      'class_book_authority/copies/class-1/copy-1',
    ]);
    await expect(repository.createPlacement({
      schemaVersion: 1,
      classPlacementId: 'class-placement-1',
      classId: 'class-1',
      copyId: 'copy-1',
      classCourseId: 'class-course-1',
      sourceCourseId: 'course-1',
      courseMaterialId: 'class-material-1',
      sourceCourseMaterialId: 'source-material-1',
      ownerId: 'teacher-1',
      sourcePlacementRevision: 1,
      placementRevision: 1,
      status: 'active',
      pins: {
        bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 1, unitStableKey: 'unit-1', unitVersionId: 'unit-version-1',
        manifestVersionId: 'manifest-1', sourceVersionId: 'source-version-1', bindingRevision: 'binding-1',
      },
      selection: { kind: 'placements', nodeKeys: [], placementIds: ['activity-placement-1'] },
      activities: [],
      sourceFingerprint: 'fingerprint-1',
      title: 'Class Book',
      createdAt: '2026-08-05T00:00:00.000Z',
      createdBy: 'teacher-1',
      updatedAt: '2026-08-05T00:00:00.000Z',
      updatedBy: 'teacher-1',
    }, 'op-placement-1')).rejects.toThrowError('class_book_authority_scoped_token_required');
  });
});
