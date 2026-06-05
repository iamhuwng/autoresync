import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookEditorModal from './BookEditorModal';
import { materialCatalogIds, type MaterialBookMetadata } from '../../types/materialCatalog.types';

const NOW = '2026-06-01T00:00:00.000Z';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@test.com' },
    profile: { role: 'teacher', displayName: 'Teacher', email: 'teacher@test.com' },
  }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: vi.fn(),
  }),
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async () => ({ val: () => null })),
  ref: vi.fn((_database, path: string) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../homework/HomeworkCreateModal', () => ({
  HomeworkCreateModal: () => null,
}));

const makeBook = (overrides: Partial<MaterialBookMetadata> = {}): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId('book-123'),
  ownerId: 'teacher-1',
  title: 'IELTS Book',
  subtitle: 'Practice',
  authors: ['Teacher One'],
  publisher: 'LT',
  edition: '1',
  series: 'Core',
  isbn: '9780000000000',
  coverUrl: 'https://example.test/cover.jpg',
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: ['reading'],
  description: 'Book description',
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

describe('BookEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders native edit-test-style frame classes and no TeacherHeader', async () => {
    const onClose = vi.fn();

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /IELTS Book/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('book-editor-modal__frame');
    expect(dialog.querySelector('.book-editor-modal__header')).not.toBeNull();
    const tabRail = dialog.querySelector('.book-editor-modal__tabs') as HTMLElement;
    expect(tabRail).not.toBeNull();
    expect(tabRail).toHaveAttribute('role', 'tablist');
    expect(tabRail).toHaveAccessibleName('Book editor tabs');
    expect(within(tabRail).getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
      'Overview',
      'Content',
      'Settings',
    ]);
    expect(within(tabRail).getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabRail).queryByRole('tab', { name: 'Assign' })).not.toBeInTheDocument();
    expect(dialog.querySelector('.book-editor-modal__body')).not.toBeNull();
    expect(dialog.querySelector('.book-editor-modal__status')).toBeNull();
    expect(dialog.querySelector('.book-editor-page__hero')).toBeNull();
    expect(dialog.querySelector('.book-editor-page__hero-actions')).toBeNull();
    expect(dialog.querySelector('.book-editor-page__status-strip')).toBeNull();
    expect(screen.queryByTestId('teacher-header')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Request review' })).toHaveLength(1);
  });

  it('closes on Escape when clean and returns focus to launcher', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const Wrapper = () => {
      const [launcher, setLauncher] = React.useState<HTMLButtonElement | null>(null);

      return (
        <>
          <button ref={setLauncher} type="button" data-testid="launcher">Open Book</button>
          <BookEditorModal
            opened
            bookId="book-123"
            initialBook={makeBook()}
            initialNodes={[]}
            materialCandidates={[]}
            onClose={onClose}
            returnFocusTo={launcher}
          />
        </>
      );
    };

    render(<Wrapper />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('launcher')).toHaveFocus();
    });
  });

  it('shows discard confirmation before closing dirty edits', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.type(screen.getByLabelText('Title'), ' Draft');
    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Discard Book editor changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('wires modal header actions into the workspace', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    let currentBook = makeBook();
    const repository = {
      readBook: vi.fn(async () => currentBook),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(async (payload: Record<string, unknown>) => {
        const nextBook = payload['material_catalog/books/book-123'];

        if (nextBook) {
          currentBook = nextBook as MaterialBookMetadata;
        }
      }),
    };

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        repository={repository}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => {
      expect(repository.update).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith('book-123');
    });

    await user.click(screen.getAllByRole('button', { name: 'Request review' })[0]);

    await waitFor(() => {
      expect(repository.update).toHaveBeenCalledTimes(2);
      expect(currentBook.visibility).toBe('public-library-pending-review');
      expect(onSaved).toHaveBeenCalledTimes(2);
    });
  });

  it('routes modal Save by active three-tab body owner', async () => {
    const user = userEvent.setup();
    let currentBook = makeBook();
    const repository = {
      readBook: vi.fn(async () => currentBook),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(async (payload: Record<string, unknown>) => {
        const nextBook = payload['material_catalog/books/book-123'];

        if (nextBook) {
          currentBook = nextBook as MaterialBookMetadata;
        }
      }),
    };

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={currentBook}
        initialNodes={[]}
        materialCandidates={[]}
        repository={repository}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Overview Saved Title');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(currentBook.title).toBe('Overview Saved Title');
    });

    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(repository.update).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await user.selectOptions(screen.getByLabelText('Visibility'), 'public-library-pending-review');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(currentBook.visibility).toBe('public-library-pending-review');
      expect(repository.update).toHaveBeenCalledTimes(3);
    });
  });

  it('flushes metadata edited on another tab when Save runs from the Content tab', async () => {
    const user = userEvent.setup();
    let currentBook = makeBook();
    const repository = {
      readBook: vi.fn(async () => currentBook),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(async (payload: Record<string, unknown>) => {
        const nextBook = payload['material_catalog/books/book-123'];

        if (nextBook) {
          currentBook = nextBook as MaterialBookMetadata;
        }
      }),
    };

    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={currentBook}
        initialNodes={[]}
        materialCandidates={[]}
        repository={repository}
        onClose={vi.fn()}
      />,
    );

    // Edit metadata on Overview but do not save it there.
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Cross Tab Title');

    // Save from the Content tab; the dirty metadata must not be dropped.
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(currentBook.title).toBe('Cross Tab Title');
      expect(repository.update).toHaveBeenCalledTimes(2);
    });
  });

  it('locks background scroll while open and restores it on close', () => {
    const { rerender } = render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <BookEditorModal
        opened={false}
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('traps keyboard focus inside the dialog', () => {
    render(
      <BookEditorModal
        opened
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        onClose={vi.fn()}
      />,
    );

    const frame = document.querySelector('.book-editor-modal__frame');
    const saveButton = screen.getAllByRole('button', { name: 'Save' })[0];
    saveButton.focus();

    // Shift+Tab from the first focusable control must wrap inside the dialog
    // rather than escaping to the page behind it.
    fireEvent.keyDown(saveButton, { key: 'Tab', shiftKey: true });

    expect(frame?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(saveButton);
  });
});
