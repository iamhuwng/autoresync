import React from 'react';
import { useNavigation } from '../../hooks/useNavigation';
import type { PublicBookCatalogReadiness } from '../../services/materialCatalog/publicBookCatalogReadiness.service';
import { studentTokens } from '../layout/studentLayoutStyles';

interface Props {
  books: readonly PublicBookCatalogReadiness[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onAction: (action: string, metadata?: Record<string, unknown>) => void;
}

const buttonStyle: React.CSSProperties = {
  minHeight: 44, minWidth: 44, padding: '8px 16px', borderRadius: 6,
  border: `1px solid ${studentTokens.borderWhisper}`, background: studentTokens.bgSurface,
  color: studentTokens.textPrimary, font: 'inherit', cursor: 'pointer',
};

export const StudentPublicBooksPanel: React.FC<Props> = ({ books, loading, error, hasMore, onRetry, onLoadMore, onAction }) => {
  const { navigateTo } = useNavigation('student');
  return (
    <section aria-labelledby="student-public-books-title" style={{ paddingTop: 18 }}>
      <h2 id="student-public-books-title">Books</h2>
      {loading && <p role="status">{books.length ? 'Refreshing Books…' : 'Loading public Books…'}</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" style={buttonStyle} disabled={loading} onClick={onRetry}>Retry</button></div>}
      {books.map((book) => (
        <article key={book.bookId} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '16px 0', borderBottom: `1px solid ${studentTokens.borderWhisper}` }}>
          <h3 style={{ flex: '1 1 180px', margin: 0, overflowWrap: 'anywhere' }}>{book.title}</h3>
          <button type="button" style={buttonStyle} onClick={() => {
            onAction('openPublicBook', { bookId: book.bookId });
            navigateTo('STUDENT_PRACTICE', {
              materialId: `${book.bookId}?bookSurface=public&bookId=${encodeURIComponent(book.bookId)}`,
            }, { reason: 'student_library_public_book_open' });
          }}>Open Book</button>
        </article>
      ))}
      {!loading && !error && !books.length && <p>No public Books are ready yet.</p>}
      {hasMore && <button type="button" style={{ ...buttonStyle, marginTop: 16 }} disabled={loading} onClick={onLoadMore}>Load more</button>}
    </section>
  );
};
