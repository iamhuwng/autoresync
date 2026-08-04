import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
} from '../../types/materialCatalog.types';
import BookEditorModal from './BookEditorModal';
import BookEditorPage from './BookEditorPage';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@test.com' },
    profile: { role: 'teacher', displayName: 'Teacher' },
  }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../navigation', () => ({
  TeacherHeader: () => <header data-testid="teacher-header">Teacher Header</header>,
}));

vi.mock('../homework/HomeworkCreateModal', () => ({
  HomeworkCreateModal: () => null,
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async () => ({ val: () => null })),
  ref: vi.fn((_database, path: string) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({ database: {} }));

const NOW = '2026-07-23T00:00:00.000Z';

const makeBook = (
  overrides: Partial<MaterialBookMetadata> = {},
): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId('book-123'),
  bookMode: 'materials',
  ownerId: 'teacher-1',
  title: 'Canonical Book',
  authors: [],
  testTypeIds: [],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

const makeRepository = (
  book: MaterialBookMetadata | null,
): MaterialBooksRepository => ({
  readBook: vi.fn(async () => book),
  readPublicBookProjection: vi.fn(async () => null),
  listBookNodes: vi.fn(async () => []),
  listBookSummaries: vi.fn(async () => []),
  listBooksByIndex: vi.fn(async () => []),
  write: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
});

const renderPage = (
  repository: MaterialBooksRepository,
  {
    initialBook,
    entry = '/teacher/materials/books/book-123',
  }: {
    readonly initialBook?: MaterialBookMetadata;
    readonly entry?: string | {
      readonly pathname: string;
      readonly search?: string;
      readonly state?: unknown;
    };
  } = {},
) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route
        path="/teacher/materials/books/:bookId"
        element={(
          <BookEditorPage
            initialBook={initialBook}
            materialCandidates={[]}
            repository={repository}
          />
        )}
      />
    </Routes>
  </MemoryRouter>,
);

describe('Book editor persisted-mode dispatch', () => {
  it('ignores forged initial contents, query, and route state when stored mode is materials', async () => {
    const repository = makeRepository(makeBook({ bookMode: 'materials' }));

    renderPage(repository, {
      initialBook: makeBook({ bookMode: 'pdf', title: 'Forged PDF Book' }),
      entry: {
        pathname: '/teacher/materials/books/book-123',
        search: '?bookMode=pdf',
        state: { bookMode: 'pdf', teacherMaterialsOpenBookMode: 'pdf' },
      },
    });

    expect(await screen.findByRole('tab', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Canonical Book' })).toBeInTheDocument();
    expect(screen.queryByText('PDF Assembly')).not.toBeInTheDocument();
    expect(repository.readBook).toHaveBeenCalledWith('book-123');
  });

  it('routes stored pdf mode to separate read-only Assembly shell and never material controls', async () => {
    const repository = makeRepository(makeBook({
      bookMode: 'pdf',
      title: 'Stored PDF Book',
    }));

    renderPage(repository, {
      initialBook: makeBook({ bookMode: 'materials', title: 'Forged Materials Book' }),
    });

    expect(await screen.findByRole('heading', { name: 'Stored PDF Book' })).toBeInTheDocument();
    expect(screen.getByText('PDF Assembly')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assembly is read-only' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Content' })).not.toBeInTheDocument();
    expect(screen.queryByText('Book content')).not.toBeInTheDocument();
    expect(screen.queryByText(/material picker/i)).not.toBeInTheDocument();
  });

  it('defaults a legacy missing mode to the unchanged materials editor', async () => {
    const repository = makeRepository(makeBook({ bookMode: undefined }));

    renderPage(repository);

    expect(await screen.findByRole('tab', { name: 'Content' })).toBeInTheDocument();
    expect(screen.queryByText('PDF Assembly')).not.toBeInTheDocument();
  });

  it('rejects malformed and cross-owner identifiers with safe errors', async () => {
    const malformedRepository = makeRepository(makeBook());
    const malformed = renderPage(malformedRepository, {
      entry: '/teacher/materials/books/bad%2Fbook',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This Book link is invalid.');
    expect(malformedRepository.readBook).not.toHaveBeenCalled();
    malformed.unmount();

    const crossOwnerRepository = makeRepository(makeBook({ ownerId: 'teacher-2' }));
    renderPage(crossOwnerRepository);

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByRole('alert')).not.toHaveTextContent('teacher-2');
  });

  it('rejects an unsupported stored mode without falling back to materials', async () => {
    const repository = makeRepository({
      ...makeBook(),
      bookMode: 'forged-mode',
    } as unknown as MaterialBookMetadata);

    renderPage(repository);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Book has an unsupported mode and cannot be opened safely.',
    );
    expect(screen.queryByRole('tab', { name: 'Content' })).not.toBeInTheDocument();
    expect(screen.queryByText('PDF Assembly')).not.toBeInTheDocument();
  });

  it('clears the prior dispatch immediately while history navigation loads another Book', async () => {
    const user = userEvent.setup();
    let resolveSecondBook: ((book: MaterialBookMetadata) => void) | undefined;
    const repository = makeRepository(null);
    vi.mocked(repository.readBook).mockImplementation(async (bookId) => {
      if (bookId === 'book-1') {
        return makeBook({
          bookId: materialCatalogIds.bookId('book-1'),
          title: 'First Materials Book',
        });
      }

      return new Promise<MaterialBookMetadata>((resolve) => {
        resolveSecondBook = resolve;
      });
    });
    const HistoryControl = () => {
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() => navigate('/teacher/materials/books/book-2')}
        >
          Next Book
        </button>
      );
    };

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-1']}>
        <HistoryControl />
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage materialCandidates={[]} repository={repository} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'First Materials Book' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Book' }));

    expect(screen.queryByRole('heading', { name: 'First Materials Book' })).not.toBeInTheDocument();
    expect(screen.getByText('Loading Book...')).toBeInTheDocument();

    await act(async () => {
      resolveSecondBook?.(makeBook({
        bookId: materialCatalogIds.bookId('book-2'),
        bookMode: 'pdf',
        title: 'Second PDF Book',
      }));
    });

    expect(await screen.findByRole('heading', { name: 'Second PDF Book' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Content' })).not.toBeInTheDocument();
  });

  it('uses the same stored pdf dispatch in modal compatibility presentation', async () => {
    const repository = makeRepository(makeBook({
      bookMode: 'pdf',
      title: 'Modal PDF Book',
    }));

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook({ bookMode: 'materials' })}
        repository={repository}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Modal PDF Book' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assembly is read-only' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument();
  });
});
