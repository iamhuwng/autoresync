import React from 'react';
import BookCard from './BookCard';
import './BookCardGrid.css';

const normalize = (value) => String(value || '').trim().toLowerCase();

const matchesSearch = (book, searchTerm) => {
  const query = normalize(searchTerm);
  if (!query) {
    return true;
  }

  return [
    book.title,
    book.subtitle,
    ...(book.authors || []),
    book.publisher,
    book.series,
    ...(book.tags || []),
    ...(book.testTypes || []).flatMap((testType) => [testType.label, testType.shortLabel]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
};

const matchesTestType = (book, activeTestTypeId) => {
  const activeId = normalize(activeTestTypeId);
  if (!activeId) {
    return true;
  }

  return (book.testTypeIds || []).map(normalize).includes(activeId);
};

export const filterBookRows = (books, { activeTestTypeId, searchTerm } = {}) => (
  (books || []).filter((book) => matchesTestType(book, activeTestTypeId) && matchesSearch(book, searchTerm))
);

const BookCardGrid = ({
  books = [],
  emptyTitle = 'No Books yet',
  emptyDescription = 'Books will appear here.',
  canOpenBookEditor = true,
  onOpenBook,
  onArchiveBook,
}) => {
  if (books.length === 0) {
    return (
      <section className="book-card-grid-empty" aria-label="Book empty state">
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </section>
    );
  }

  return (
    <section className="book-card-grid" aria-label="Book grid">
      {books.map((book) => (
        <BookCard
          key={book.bookId || book.id}
          book={book}
          canOpenBookEditor={canOpenBookEditor}
          onOpenBook={onOpenBook}
          onArchiveBook={onArchiveBook}
        />
      ))}
    </section>
  );
};

export default BookCardGrid;
