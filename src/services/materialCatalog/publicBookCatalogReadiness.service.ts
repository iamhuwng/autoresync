import type { BookAssemblyPublicationPointer, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { ComponentStudentDocument } from '../book-assembly/componentStudentDocument.types';

export const PUBLIC_BOOK_READINESS_ROOT = 'material_catalog/public_book_readiness';
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
export const publicBookReadinessPath = (bookId: string): string => {
  if (!ID.test(bookId)) throw new Error('invalid_public_book_id');
  return `${PUBLIC_BOOK_READINESS_ROOT}/${bookId}`;
};

/** Derived catalog evidence; canonical publication and moderation remain authoritative. */
export interface PublicBookCatalogReadiness {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly bookRevision: number;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly sourceVersionId: string;
  readonly sourceStrategy: 'full_pdf' | 'component_pdfs';
  readonly descriptorRevision?: number;
  readonly sha256Hex: string;
  readonly byteSize?: number;
  readonly physicalPageCount: number;
}

export const createPublicBookCatalogReadiness = (input: {
  readonly book: { readonly bookId: string; readonly title: string; readonly bookRevision: number; readonly visibility: string; readonly status: string };
  readonly pointer: BookAssemblyPublicationPointer;
} & ({ readonly sourceStrategy: 'component_pdfs'; readonly document: ComponentStudentDocument }
  | { readonly sourceStrategy: 'full_pdf'; readonly source: TrustedBookSourceVersionProjection })): PublicBookCatalogReadiness | null => {
  const { book, pointer } = input;
  publicBookReadinessPath(book.bookId);
  if (book.visibility !== 'public-library-published' || book.status !== 'ready'
    || pointer.bookRevision !== book.bookRevision) return null;
  const document = input.sourceStrategy === 'component_pdfs' ? input.document : null;
  const source = input.sourceStrategy === 'full_pdf' ? input.source : null;
  if (document?.studentSafeStatus !== 'ready' && !source) return null;
  if (source && (source.bookId !== book.bookId || !source.verifiedUsable || source.purpose !== 'book-source'
    || source.studentSafeStatus !== 'ready' || source.studentSafeDecision?.sourceVersionId !== source.sourceVersionId
    || source.studentSafeDecision.sha256Hex.toLowerCase() !== source.checksum.value.toLowerCase())) return null;
  return {
    schemaVersion: 1, bookId: book.bookId, title: book.title, updatedAt: pointer.updatedAt,
    bookRevision: book.bookRevision, publicationId: pointer.publicationId,
    publicationRevision: pointer.publicationRevision, manifestVersionId: pointer.manifestVersionId,
    sourceStrategy: input.sourceStrategy,
    ...(document ? { sourceVersionId: document.sourceVersionId, descriptorRevision: document.descriptorRevision,
      sha256Hex: document.sha256Hex, byteSize: document.byteSize, physicalPageCount: document.physicalPageCount }
      : { sourceVersionId: source!.sourceVersionId, sha256Hex: source!.checksum.value.toLowerCase(), physicalPageCount: source!.physicalPageCount }),
  };
};

export interface PublicBookCatalogCursor { readonly updatedAt: string; readonly bookId: string }

/** One bounded read of producer-maintained safe rows; no private per-card enrichment. */
export const listPublicBookCatalogPage = async (input: {
  readonly limit?: number;
  readonly cursor?: PublicBookCatalogCursor;
  /** Rows in ascending query order, as supplied by Firebase DataSnapshot.forEach. */
  readonly readPage: (path: string, limit: number, cursor?: PublicBookCatalogCursor) => Promise<readonly (readonly [string, unknown])[]>;
}) => {
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('invalid_public_book_page_limit');
  if (input.cursor && (!ID.test(input.cursor.bookId) || !Number.isFinite(Date.parse(input.cursor.updatedAt)))) {
    throw new Error('invalid_public_book_cursor');
  }
  const value = await input.readPage(PUBLIC_BOOK_READINESS_ROOT, limit + 1, input.cursor);
  if (!Array.isArray(value) || value.length > limit + 1) {
    throw new Error('invalid_public_book_catalog_page');
  }
  const rows = value.map(([bookId, row]) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('invalid_public_book_catalog_row');
    const candidate = row as PublicBookCatalogReadiness;
    const keys = ['schemaVersion', 'bookId', 'title', 'updatedAt', 'bookRevision', 'publicationId', 'publicationRevision',
      'manifestVersionId', 'sourceVersionId', 'sourceStrategy', 'sha256Hex', 'physicalPageCount',
      ...(candidate.sourceStrategy === 'component_pdfs' ? ['descriptorRevision', 'byteSize'] : [])];
    if (Object.keys(candidate).length !== keys.length || Object.keys(candidate).some((key) => !keys.includes(key))
      || candidate.schemaVersion !== 1 || candidate.bookId !== bookId || !ID.test(bookId)
      || !['full_pdf', 'component_pdfs'].includes(candidate.sourceStrategy)
      || typeof candidate.title !== 'string' || !candidate.title.trim()
      || !Number.isFinite(Date.parse(candidate.updatedAt)) || !/^[a-f0-9]{64}$/u.test(candidate.sha256Hex)
      || ![candidate.publicationId, candidate.manifestVersionId, candidate.sourceVersionId].every((id) => typeof id === 'string' && ID.test(id))
      || ![candidate.bookRevision, candidate.publicationRevision, candidate.physicalPageCount,
        ...(candidate.sourceStrategy === 'component_pdfs' ? [candidate.descriptorRevision, candidate.byteSize] : [])]
        .every((number) => typeof number === 'number' && Number.isSafeInteger(number) && number > 0)) throw new Error('invalid_public_book_catalog_row');
    return candidate;
  }).reverse();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { rows: page, hasMore: rows.length > limit, cursor: last ? { bookId: last.bookId, updatedAt: last.updatedAt } : null };
};
