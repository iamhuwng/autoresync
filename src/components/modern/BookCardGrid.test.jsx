import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BookCardGrid, { filterBookRows } from './BookCardGrid';

const makeBook = (overrides = {}) => ({
  id: 'book-1',
  bookId: 'book-1',
  ownerId: 'teacher-1',
  title: 'Very Long IELTS Reading Book Title That Needs Truncation',
  authors: ['A. Nguyen'],
  publisher: 'Practice Press',
  visibility: 'private',
  status: 'draft-empty',
  testTypeIds: ['ielts'],
  testTypes: [
    { testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true },
  ],
  tags: ['reading'],
  updatedAt: '2026-06-01T00:00:00.000Z',
  isOwner: true,
  ...overrides,
});

describe('BookCardGrid', () => {
  it('renders cover images when present and generated fallback covers when missing', () => {
    render(
      <BookCardGrid
        books={[
          makeBook({ bookId: 'book-cover', id: 'book-cover', title: 'Cover Book', coverUrl: 'https://example.com/cover.jpg' }),
          makeBook({ bookId: 'book-fallback', id: 'book-fallback', title: 'Fallback Book', coverUrl: undefined }),
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Cover Book cover' })).toHaveAttribute('src', 'https://example.com/cover.jpg');
    expect(screen.getByLabelText('Generated cover for Fallback Book')).toBeInTheDocument();
  });

  it('shows metadata chips, tooltip title, and only allowed Book actions', async () => {
    const user = userEvent.setup();
    const onOpenBook = vi.fn();
    const onEditMetadata = vi.fn();
    const onArchiveBook = vi.fn();
    const book = makeBook();

    render(
      <BookCardGrid
        books={[book]}
        onOpenBook={onOpenBook}
        onEditMetadata={onEditMetadata}
        onArchiveBook={onArchiveBook}
      />,
    );

    const card = screen.getByTestId('book-card-book-1');
    expect(card.querySelector('.book-card__title')).toHaveAttribute(
      'title',
      'Very Long IELTS Reading Book Title That Needs Truncation',
    );
    expect(within(card).getByText('A. Nguyen')).toBeInTheDocument();
    expect(within(card).getAllByText('IELTS').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText('Private')).toBeInTheDocument();
    expect(within(card).getByText('draft-empty')).toBeInTheDocument();

    expect(within(card).getByRole('button', { name: 'Open Book' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Edit metadata' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Start Test/i })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Assign Homework/i })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Open Book' }));
    await user.click(within(card).getByRole('button', { name: 'Edit metadata' }));
    await user.click(within(card).getByRole('button', { name: 'Archive' }));

    expect(onOpenBook).toHaveBeenCalledWith(book, expect.any(HTMLButtonElement));
    expect(onEditMetadata).toHaveBeenCalledWith(book);
    expect(onArchiveBook).toHaveBeenCalledWith(book);
  });

  it('disables Open Book when Book editor capability is unavailable', async () => {
    const user = userEvent.setup();
    const onOpenBook = vi.fn();

    render(<BookCardGrid books={[makeBook()]} canOpenBookEditor={false} onOpenBook={onOpenBook} />);

    const openButton = screen.getByRole('button', { name: 'Open Book' });
    expect(openButton).toBeDisabled();
    expect(openButton).toHaveAttribute('title', 'Book editor is not available');

    await user.click(openButton);

    expect(onOpenBook).not.toHaveBeenCalled();
  });

  it('hides owner-only Archive for non-owned public Books', () => {
    render(<BookCardGrid books={[makeBook({ isOwner: false, visibility: 'public-library-published' })]} />);

    expect(screen.getByRole('button', { name: 'Open Book' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit metadata' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('filters Book rows by Test Type and summary fields', () => {
    const rows = [
      makeBook({ bookId: 'ielts-alpha', id: 'ielts-alpha', title: 'Alpha IELTS', testTypeIds: ['ielts'] }),
      makeBook({ bookId: 'toeic-beta', id: 'toeic-beta', title: 'Beta TOEIC', authors: ['Beta Author'], testTypeIds: ['toeic'] }),
    ];

    expect(filterBookRows(rows, { activeTestTypeId: 'ielts', searchTerm: 'alpha' }).map((row) => row.bookId)).toEqual([
      'ielts-alpha',
    ]);
    expect(filterBookRows(rows, { activeTestTypeId: 'toeic', searchTerm: 'beta author' }).map((row) => row.bookId)).toEqual([
      'toeic-beta',
    ]);
  });
});
