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

const brokenRefReasonLabel = (reason) => {
  if (reason === 'archived') return 'Removed';
  if (reason === 'missing-version') return 'Missing version';
  if (reason === 'missing-projection') return 'Missing projection';
  if (reason === 'missing' || reason === 'deleted') return 'Missing';
  if (reason === 'inaccessible') return 'No access';
  return String(reason || 'Needs repair');
};

const hasBrokenRefs = (book) => Boolean(book?.hasBrokenRefs || Number(book?.brokenRefCount || 0) > 0 || book?.status === 'needs-repair');

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
  onCreateSuccessor,
  onArchiveBook,
  selection,
}) => {
  const broken = hasBrokenRefs(book);
  const brokenRefCount = Number(book.brokenRefCount || 0);
  const brokenRefReasons = Array.isArray(book.brokenRefReasons) ? book.brokenRefReasons : [];

  return (
    <article
      className={`book-card${selection?.checked ? ' book-card--selected' : ''}`}
      data-testid={`book-card-${book.bookId || book.id}`}
    >
      {selection && (
        <label className="book-card__selection">
          <input
            type="checkbox"
            checked={selection.checked}
            disabled={selection.disabled}
            aria-label={selection.label}
            onChange={selection.onChange}
          />
        </label>
      )}
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
        {broken && (
          <div className="book-card__repair" role="status" aria-label={`${book.title} Book needs repair`}>
            <strong>{brokenRefCount === 1 ? '1 ref needs repair' : `${brokenRefCount || 1} refs need repair`}</strong>
            {brokenRefReasons.length > 0 && (
              <div className="book-card__repair-reasons" aria-label={`${book.title} broken ref reasons`}>
                {brokenRefReasons.map((reason) => (
                  <span key={reason} className="book-card__chip book-card__chip--warning">
                    {brokenRefReasonLabel(reason)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
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
        {broken && (
          <button
            type="button"
            className="book-card__action book-card__action--warning"
            disabled={!canOpenBookEditor}
            onClick={(event) => onOpenBook?.(book, event.currentTarget, { focus: 'broken-refs' })}
          >
            Fix broken refs
          </button>
        )}
        {book.isOwner && (
          <button
            type="button"
            className="book-card__action"
            onClick={() => onCreateSuccessor?.(book)}
          >
            Change mode
          </button>
        )}
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
};

export default BookCard;
