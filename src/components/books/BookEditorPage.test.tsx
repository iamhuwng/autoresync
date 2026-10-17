import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookEditorPage from './BookEditorPage';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';

const mocks = vi.hoisted(() => ({
  trackAction: vi.fn(),
  homeworkProps: [] as any[],
  firebaseBook: null as MaterialBookMetadata | null,
}));

const NOW = '2026-06-01T00:00:00.000Z';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@test.com' },
    profile: { role: 'teacher', displayName: 'Teacher', email: 'teacher@test.com' },
  }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mocks.trackAction,
  }),
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async (target: { path?: string }) => ({
    val: () => target?.path?.includes('material_catalog/books/')
      ? mocks.firebaseBook
      : null,
  })),
  ref: vi.fn((_database, path: string) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../navigation', () => ({
  TeacherHeader: () => <header data-testid="teacher-header">Teacher Header</header>,
}));

vi.mock('../homework/HomeworkCreateModal', () => ({
  HomeworkCreateModal: (props: any) => {
    mocks.homeworkProps.push(props);

    return props.isOpen ? (
      <div role="dialog" aria-label="Create Homework Assignment">
        {props.preselectedReadingPassage?.title || props.preselectedMaterialId}
      </div>
    ) : null;
  },
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

const makeNode = (overrides: Partial<MaterialBookNode> = {}): MaterialBookNode => ({
  nodeId: materialCatalogIds.nodeId('node-1'),
  bookId: materialCatalogIds.bookId('book-123'),
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 1,
  materialRefs: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('BookEditorPage', () => {
  beforeEach(() => {
    mocks.trackAction.mockClear();
    mocks.homeworkProps.length = 0;
    mocks.firebaseBook = makeBook();
  });

  it('renders from the route-backed Book editor URL and tracks openBook', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={makeBook()} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('teacher-header')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'IELTS Book' })).toBeInTheDocument();
    expect(screen.getByText('book-123')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.trackAction).toHaveBeenCalledWith('openBook', {
        bookId: 'book-123',
        source: 'book_editor_route',
      });
    });
  });

  it('shows metadata fields and keeps whole-Book assignment unavailable', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={makeBook()} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Whole-Book assignment is not available in V1/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    expect(screen.getByLabelText('Title')).toHaveValue('IELTS Book');
    expect(screen.getByLabelText('Subtitle')).toHaveValue('Practice');
    expect(screen.getByLabelText('Authors')).toHaveValue('Teacher One');
    expect(screen.getByLabelText('Publisher')).toHaveValue('LT');
    expect(screen.getByLabelText('Edition')).toHaveValue('1');
    expect(screen.getByLabelText('Series')).toHaveValue('Core');
    expect(screen.getByLabelText('ISBN')).toHaveValue('9780000000000');
    expect(screen.queryByLabelText('Cover URL')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toHaveValue('reading');
    expect(screen.getByLabelText('Test Type ids')).toHaveValue('ielts');
  });

  it('shows a tabbed Content workspace with selected material inspector', async () => {
    mocks.firebaseBook = makeBook({ status: 'ready' });
    const user = userEvent.setup();
    const nodes = [
      makeNode({
        materialRefs: [
          {
            refId: materialCatalogIds.refId('ref-1'),
            materialId: 'passage-1',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-1',
            titleSnapshot: 'Passage One',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
            visibilitySnapshot: 'private',
            availability: 'available',
            updateState: 'current',
            order: 1,
            addedAt: NOW,
            addedBy: 'teacher-1',
          },
        ],
      }),
    ];

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={makeBook({ status: 'ready' })} initialNodes={nodes} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Selected material' })).toBeInTheDocument();
    expect(screen.getAllByText('Passage One').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Assign selected' })).toBeInTheDocument();
    expect(screen.getByText('1 materials in book')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    expect(screen.queryByRole('tab', { name: 'Assign' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));
    expect(screen.getByRole('dialog', { name: 'Create Homework Assignment' })).toHaveTextContent('Passage One');
  });

  it('uses Request public review instead of direct public approval or rejection controls', async () => {
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
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={currentBook} materialCandidates={[]} repository={repository} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    const visibility = screen.getByLabelText('Visibility');

    expect(screen.queryByRole('option', { name: 'Public library' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Public rejected' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request review' }));

    expect(visibility).toHaveValue('public-library-pending-review');
    await waitFor(() => {
      expect(mocks.trackAction).toHaveBeenCalledWith('teacher_materials_book_public_review_requested', {
        bookId: 'book-123',
        source: 'book_editor_metadata',
      });
    });
  });

  it('assigns a Reading Passage ref through normal Reading Passage homework props, not Book assignment props', async () => {
    mocks.firebaseBook = makeBook({ status: 'ready' });
    const user = userEvent.setup();
    const nodes = [
      makeNode({
        materialRefs: [
          {
            refId: materialCatalogIds.refId('ref-1'),
            materialId: 'passage-1',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-1',
            titleSnapshot: 'Passage One',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
            visibilitySnapshot: 'private',
            availability: 'available',
            updateState: 'current',
            order: 1,
            addedAt: NOW,
            addedBy: 'teacher-1',
          },
        ],
      }),
    ];

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={makeBook({ status: 'ready' })} initialNodes={nodes} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Assign selected' }));

    expect(screen.getByRole('dialog', { name: 'Create Homework Assignment' })).toHaveTextContent('Passage One');
    expect(mocks.homeworkProps.at(-1)).toMatchObject({
      preselectedMaterialId: undefined,
      preselectedMaterialFilter: 'reading-passage',
      preselectedReadingPassage: {
        materialId: 'passage-1',
        title: 'Passage One',
        publishedSnapshotVersionId: 'snapshot-1',
      },
    });
    expect(mocks.trackAction).toHaveBeenCalledWith('teacher_materials_reading_passage_assigned', {
      bookId: 'book-123',
      materialId: 'passage-1',
      source: 'book_editor_material_ref',
    });
  });

  it('shows user-facing permission and stale-write conflict states', async () => {
    const user = userEvent.setup();
    const permissionRepository = {
      readBook: vi.fn(async () => {
        throw new Error('permission_denied');
      }),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage repository={permissionRepository} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');

    const staleRepository = {
      readBook: vi.fn()
        .mockResolvedValueOnce(makeBook({ updatedAt: 'older' }))
        .mockResolvedValue(makeBook({ updatedAt: 'newer' })),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    };

    rerender(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage initialBook={makeBook({ updatedAt: 'older' })} initialNodes={[]} repository={staleRepository} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Book changed in another tab');
    });
  });

  it('loads published public Book detail from the public-safe projection when raw owner data is denied', async () => {
    const repository = {
      readBook: vi.fn(async () => {
        throw new Error('permission_denied');
      }),
      listBookNodes: vi.fn(async () => {
        throw new Error('raw nodes denied');
      }),
      listBooksByIndex: vi.fn(async () => []),
      readPublicBookProjection: vi.fn(async () => ({
        bookId: materialCatalogIds.bookId('book-123'),
        title: 'Public IELTS Book',
        authors: ['Cambridge'],
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        tags: ['reading'],
        visibility: 'public-library-published',
        status: 'ready',
        updatedAt: NOW,
        approvedAt: NOW,
        approvedBy: 'admin-1',
        nodes: [
          {
            nodeId: materialCatalogIds.nodeId('node-public'),
            parentNodeId: null,
            type: 'section',
            title: 'Public Section',
            order: 1,
            materialRefs: [
              {
                refId: materialCatalogIds.refId('ref-public'),
                materialId: 'passage-public',
                materialKind: 'reading-passage',
                snapshotVersionId: 'snapshot-public',
                title: 'Public Passage Summary',
                testTypeIds: [materialCatalogIds.testTypeId('ielts')],
                order: 1,
              },
            ],
          },
        ],
      })),
      write: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Public IELTS Book' })).toBeInTheDocument();
    expect(screen.getByText('Public Section')).toBeInTheDocument();
    expect(screen.getByText('Public Passage Summary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Metadata' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request public review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Book Structure' })).not.toBeInTheDocument();
    expect(repository.readPublicBookProjection).toHaveBeenCalledWith('book-123');
  });

  it('renders public projection nodes when RTDB omits empty materialRefs arrays', async () => {
    const repository = {
      readBook: vi.fn(async () => {
        throw new Error('permission_denied');
      }),
      listBookNodes: vi.fn(async () => {
        throw new Error('raw nodes denied');
      }),
      listBooksByIndex: vi.fn(async () => []),
      readPublicBookProjection: vi.fn(async () => ({
        bookId: materialCatalogIds.bookId('book-123'),
        title: 'Public IELTS Book',
        authors: ['Cambridge'],
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        tags: ['reading'],
        visibility: 'public-library-published',
        status: 'ready',
        updatedAt: NOW,
        approvedAt: NOW,
        approvedBy: 'admin-1',
        nodes: [
          {
            nodeId: materialCatalogIds.nodeId('node-public'),
            parentNodeId: null,
            type: 'section',
            title: 'Public Section Without Refs',
            order: 1,
          },
        ],
      } as any)),
      write: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Public IELTS Book' })).toBeInTheDocument();
    expect(screen.getByText('Public Section Without Refs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Metadata' })).not.toBeInTheDocument();
  });

  it('shows a load error when raw Book data and public projection are both denied', async () => {
    const repository = {
      readBook: vi.fn(async () => {
        throw new Error('permission denied raw book');
      }),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      readPublicBookProjection: vi.fn(async () => {
        throw new Error('permission denied projection');
      }),
      write: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
        <Routes>
          <Route
            path="/teacher/materials/books/:bookId"
            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByText('Loading Book...')).not.toBeInTheDocument();
    expect(repository.readPublicBookProjection).toHaveBeenCalledWith('book-123');
  });
});
