import { describe, expect, it, vi } from 'vitest';
import { createComponentStudentDocument } from '../book-assembly/componentStudentDocument.types';
import { createPublicBookCatalogReadiness, listPublicBookCatalogPage, PUBLIC_BOOK_READINESS_ROOT } from './publicBookCatalogReadiness.service';

const input = {
  sourceStrategy: 'component_pdfs' as const,
  book: { bookId: 'book-1', title: 'Public Book', bookRevision: 2, visibility: 'public-library-published', status: 'ready' },
  pointer: { publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1', bookRevision: 2,
    sourceSetRevision: 1, inputFingerprint: 'input-1', updatedAt: '2026-10-03T00:00:00.000Z', updatedByCommandId: 'command-1' },
  document: createComponentStudentDocument({ sourceVersionId: 'combined-1', descriptorRevision: 1, sha256Hex: 'a'.repeat(64),
    byteSize: 1024, physicalPageCount: 2, compositionFingerprint: 'composition-1', components: [
      { sourceKey: 'one', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
      { sourceKey: 'two', sourceVersionId: 'source-2', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
    ] }),
};

describe('derived Public Books catalog', () => {
  it('builds only active public metadata aligned with the trusted complete document publication', () => {
    const row = createPublicBookCatalogReadiness(input)!;
    expect(row).toMatchObject({ publicationId: 'publication-1', sourceVersionId: 'combined-1', physicalPageCount: 2 });
    expect(row).not.toHaveProperty('components');
    for (const book of [{ ...input.book, status: 'archived' }, { ...input.book, visibility: 'private' }, { ...input.book, bookRevision: 3 }]) {
      expect(createPublicBookCatalogReadiness({ ...input, book })).toBeNull();
    }
    const source = { bookId: 'book-1', sourceKey: 'full', sourceVersionId: 'original-1', checksum: { algorithm: 'sha256' as const, value: 'b'.repeat(64) },
      purpose: 'book-source' as const, studentSafeStatus: 'ready' as const, verifiedUsable: true, physicalPageCount: 8,
      studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: input.pointer.updatedAt, sourceVersionId: 'original-1', sha256Hex: 'b'.repeat(64), reasonCode: 'teacher-reviewed' as const } };
    const original = createPublicBookCatalogReadiness({ book: input.book, pointer: input.pointer, sourceStrategy: 'full_pdf', source });
    expect(original).toMatchObject({ sourceStrategy: 'full_pdf', sourceVersionId: 'original-1', physicalPageCount: 8 });
    expect(original).not.toHaveProperty('descriptorRevision');
    expect(original).not.toHaveProperty('byteSize');
    expect(createPublicBookCatalogReadiness({ book: input.book, pointer: input.pointer, sourceStrategy: 'full_pdf', source: { ...source, verifiedUsable: false } })).toBeNull();
  });

  it('reads one bounded page, handles tied timestamps, and rejects leaked fields', async () => {
    const row = createPublicBookCatalogReadiness(input)!;
    const readPage = vi.fn(async () => [['book-1', row], ['book-2', { ...row, bookId: 'book-2' }]] as const);
    const page = await listPublicBookCatalogPage({ limit: 1, readPage });
    expect(readPage).toHaveBeenCalledExactlyOnceWith(PUBLIC_BOOK_READINESS_ROOT, 2, undefined);
    expect(page).toMatchObject({ rows: [{ bookId: 'book-2' }], hasMore: true, cursor: { bookId: 'book-2', updatedAt: row.updatedAt } });
    await expect(listPublicBookCatalogPage({ readPage: async () => [['book-1', { ...row, components: [] }]] })).rejects.toThrow('invalid_public_book_catalog_row');
    await expect(listPublicBookCatalogPage({ limit: 51, readPage })).rejects.toThrow('invalid_public_book_page_limit');
  });
});
