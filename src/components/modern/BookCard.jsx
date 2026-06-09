import React from 'react';
import './BookCard.css';

const visibilityLabel = (visibility) => (
  String(visibility || '').startsWith('public-library-') ? 'Public' : 'Private'
);

const getPrimaryTestTypeLabel = (book) => (
  book?.testTypes?.[0]?.shortLabel || book?.testTypes?.[0]?.label || book?.testTypeIds?.[0] || 'Book'
);

const getAuthorLine = (book) => {
  if (Array.isArray(book?.authors) && book.authors.length > 0) {
    return book.authors.join(', ');
  }

  return book?.publisher || book?.series || 'Draft organizer';
};

const BookCover = ({ book }) => {
  if (book.coverUrl) {
    return (
      <img
        className="book-card__cover-image"
        src={book.coverUrl}
        alt={`${book.title} cover`}
        loading="lazy"
      />
    );
  }

  return (
    <div className="book-card__fallback-cover" aria-label={`Generated cover for ${book.title}`}>
      <span className="book-card__fallback-type">{getPrimaryTestTypeLabel(book)}</span>
      <span className="book-card__fallback-title">{book.title}</span>
    </div>
  );
};

const BookCard = ({
  book,
  canOpenBookEditor = true,
  onOpenBook,
  onArchiveBook,
}) => (
  <article className="book-card" data-testid={`book-card-${book.bookId || book.id}`}>
    <div className="book-card__cover">
      <BookCover book={book} />
    </div>

    <div className="book-card__body">
      <div className="book-card__title" title={book.title}>{book.title}</div>
      <div className="book-card__meta" title={getAuthorLine(book)}>{getAuthorLine(book)}</div>
      <div className="book-card__chips" aria-label={`${book.title} metadata`}>
        {(book.testTypes || []).map((testType) => (
          <span key={testType.testTypeId} className="book-card__chip">
            {testType.shortLabel || testType.label}
          </span>
        ))}
        <span className="book-card__chip book-card__chip--neutral">{visibilityLabel(book.visibility)}</span>
        <span className="book-card__chip book-card__chip--status">{book.status}</span>
      </div>
    </div>

    <div className="book-card__actions" aria-label={`${book.title} actions`}>
      <button
        type="button"
        className="book-card__action book-card__action--primary"
        disabled={!canOpenBookEditor}
        title={canOpenBookEditor ? 'Edit Book' : 'Book editor is not available'}
        onClick={(event) => onOpenBook?.(book, event.currentTarget)}
      >
        Edit
      </button>
      {book.isOwner && (
        <button
          type="button"
          className="book-card__action book-card__action--danger"
          onClick={() => onArchiveBook?.(book)}
        >
          Archive
        </button>
      )}
    </div>
  </article>
);

export default BookCard;
