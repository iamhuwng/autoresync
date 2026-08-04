import { describe, expect, it } from 'vitest';
import type { BookAssemblyPublicationScope } from '../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service.ts';
import { readCourseBookSelectionCatalog } from '../src/upload-worker/course-book-placement/production.ts';

const scope = (): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => ({
  current: {
    publicationId: 'publication-002', publicationRevision: 2, manifestVersionId: 'manifest-002',
    bookRevision: 3, sourceSetRevision: 4, inputFingerprint: 'fingerprint',
    updatedAt: '2026-08-05T00:00:00.000Z', updatedByCommandId: 'command-002',
  },
  versions: {
    'manifest-002': {
      schemaVersion: 1, manifestVersionId: 'manifest-002', publicationId: 'publication-002',
      publicationRevision: 2, lifecycle: 'published', ownerId: 'teacher-001', bookId: 'book-001',
      bookRevision: 3, sourceSetRevision: 4, candidateId: 'candidate-002', candidateRevision: 2,
      strategy: 'full_pdf', adapterTicket: '#49', inputFingerprint: 'fingerprint',
      createdByCommandId: 'command-002', createdAt: '2026-08-05T00:00:00.000Z',
      manifest: { bookId: 'book-001', sourceSet: { sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'source-001', sourceVersionId: 'source-version-001', sourceOrder: 1 }] },
        nodes: [{ nodeKey: 'unit-001', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [] },
      studentSafeProjection: { schemaVersion: 1, bookId: 'book-001', publicationId: 'publication-002',
        publicationRevision: 2, sourceStrategy: 'full_pdf',
        sourceSet: { sourceStrategy: 'full_pdf',
          sources: [{ sourceKey: 'source-001', sourceVersionId: 'source-version-001', sourceOrder: 1 }] }, units: [] },
    },
  },
  placements: {
    current: { schemaVersion: 1, placementId: 'placement-002', ownerId: 'teacher-001', bookId: 'book-001',
      manifestVersionId: 'manifest-002', publicationId: 'publication-002', publicationRevision: 2,
      unitKey: 'unit-001', nodeKey: 'unit-001', activityKey: 'activity-002', activityId: 'activity-002',
      activityVersionId: 'activity-version-002', order: 2, pageGroupKeys: [],
      sourcePages: [{ sourceKey: 'source-001', sourceVersionId: 'source-version-001', physicalPageNumber: 2 }] },
    stale: { schemaVersion: 1, placementId: 'placement-001', ownerId: 'teacher-001', bookId: 'book-001',
      manifestVersionId: 'manifest-001', publicationId: 'publication-001', publicationRevision: 1,
      unitKey: 'unit-001', nodeKey: 'unit-001', activityKey: 'activity-001', activityId: 'activity-001',
      activityVersionId: 'activity-version-001', order: 1, pageGroupKeys: [],
      sourcePages: [{ sourceKey: 'source-001', sourceVersionId: 'source-version-001', physicalPageNumber: 1 }] },
  },
});

describe('#102 Course selection catalog', () => {
  it('returns only current accepted-publication identities to the exact owner', async () => {
    const repository = { readScope: async () => scope() };
    await expect(readCourseBookSelectionCatalog({}, 'teacher-001', 'book-001', repository)).resolves.toEqual({
      bookId: 'book-001', publicationId: 'publication-002', publicationRevision: 2,
      manifestVersionId: 'manifest-002',
      sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'source-001' }],
      nodes: [{ nodeKey: 'unit-001', parentNodeKey: null, nodeType: 'unit', order: 1 }],
      placements: [{ placementId: 'placement-002', nodeKey: 'unit-001',
        activityId: 'activity-002', activityVersionId: 'activity-version-002', sourceKeys: ['source-001'] }],
    });
    await expect(readCourseBookSelectionCatalog({}, 'teacher-002', 'book-001', repository))
      .rejects.toMatchObject({ code: 'course_book_catalog_denied', status: 403 });
  });
});
