import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookEditorWorkspace from './BookEditorWorkspace';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';

const mocks = vi.hoisted(() => ({
  trackAction: vi.fn(),
  homeworkProps: [] as any[],
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
  get: vi.fn(async () => ({ val: () => null })),
  ref: vi.fn((_database, path: string) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
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

const makeNodeWithMaterialRef = (): MaterialBookNode =>
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
  });

describe('BookEditorWorkspace', () => {
  beforeEach(() => {
    mocks.trackAction.mockClear();
    mocks.homeworkProps.length = 0;
  });

  it('loads by bookId prop, omits modal chrome, and responds to external active-tab control', async () => {
    const repository = {
      readBook: vi.fn(async () => makeBook()),
      listBookNodes: vi.fn(async () => []),
      listBooksByIndex: vi.fn(async () => []),
      write: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    };
    const onActiveTabChange = vi.fn();

    const { rerender } = render(
      <BookEditorWorkspace
        bookId="book-123"
        repository={repository}
        materialCandidates={[]}
        presentation="modal"
        activeTab={'content' as any}
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Book content' })).toBeInTheDocument();
    expect(screen.queryByTestId('teacher-header')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Book editor tabs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'IELTS Book' })).not.toBeInTheDocument();
    expect(repository.readBook).toHaveBeenCalledWith('book-123');
    expect(repository.listBookNodes).toHaveBeenCalledWith('book-123');

    rerender(
      <BookEditorWorkspace
        bookId="book-123"
        repository={repository}
        materialCandidates={[]}
        presentation="modal"
        activeTab="settings"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Book settings' })).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith('openBook', {
      bookId: 'book-123',
      source: 'book_editor_modal',
    });
  });

  it('keeps the page-compat title area and local tabs outside modal presentation', async () => {
    render(
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        presentation="page-compat"
      />,
    );

    expect(screen.getByRole('heading', { name: 'IELTS Book' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Book editor tabs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Assign' })).not.toBeInTheDocument();
  });

  it('renders Overview as metadata, statistics, and readiness without structure controls', async () => {
    render(
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook({ status: 'ready' })}
        initialNodes={[makeNodeWithMaterialRef()]}
        materialCandidates={[]}
        presentation="modal"
        activeTab="overview"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Book overview' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('IELTS Book');
    expect(screen.getByLabelText('Authors')).toHaveValue('Teacher One');
    expect(screen.getAllByText('Readiness').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book outline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assign/i })).not.toBeInTheDocument();
  });

  it('renders Content as structure tree plus selected item detail and assignment workflow', async () => {
    const user = userEvent.setup();
    const nodes = [makeNodeWithMaterialRef()];

    render(
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook({ status: 'ready' })}
        initialNodes={nodes}
        materialCandidates={[]}
        presentation="modal"
        activeTab={'content' as any}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Book content' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Book structure tree' })).toBeInTheDocument();
    const detailPanel = screen.getByRole('complementary', { name: 'Selected item details' });
    expect(within(detailPanel).getByRole('heading', { name: 'Selected material' })).toBeInTheDocument();
    expect(within(detailPanel).getByText('Root / Section 1 - Depth 1 - Order 1')).toBeInTheDocument();
    expect(within(detailPanel).getAllByText('Passage One').length).toBeGreaterThanOrEqual(1);
    expect(within(detailPanel).getByRole('heading', { name: 'Attach material' })).toBeInTheDocument();
    expect(within(detailPanel).getByPlaceholderText('Search published materials')).toBeInTheDocument();
    expect(within(detailPanel).getByRole('button', { name: 'Assign selected' })).toBeEnabled();
    expect(within(detailPanel).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Assignable materials' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save item' })).not.toBeInTheDocument();

    await user.click(within(detailPanel).getByRole('button', { name: 'Assign selected' }));

    expect(screen.getByRole('dialog', { name: 'Create Homework Assignment' })).toHaveTextContent('Passage One');
  });

  it('keeps node editing and structure actions in the Content right panel', async () => {
    const nodes = [makeNode({ materialRefs: [] })];

    render(
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook({ status: 'ready' })}
        initialNodes={nodes}
        materialCandidates={[
          { materialId: 'passage-1', title: 'Published Passage', materialKind: 'reading-passage', publishedSnapshotVersionId: 'snapshot-1', testTypeIds: ['ielts'] },
        ]}
        presentation="modal"
        activeTab={'content' as any}
      />,
    );

    const tree = screen.getByRole('region', { name: 'Book structure tree' });
    const detailPanel = screen.getByRole('complementary', { name: 'Selected item details' });

    expect(within(detailPanel).getByRole('heading', { name: 'Selected section' })).toBeInTheDocument();
    expect(within(detailPanel).getByText('Root / Section 1 - Depth 1 - Order 1')).toBeInTheDocument();
    expect(within(detailPanel).getByLabelText('Title')).toHaveValue('Section 1');
    expect(within(detailPanel).getByLabelText('Type')).toHaveValue('section');
    expect(within(detailPanel).getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(within(detailPanel).getByRole('button', { name: 'Move down' })).toBeInTheDocument();
    expect(within(detailPanel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(detailPanel).getByRole('heading', { name: 'Attach material' })).toBeInTheDocument();
    expect(within(detailPanel).getByRole('button', { name: 'Attach Published Passage' })).toBeInTheDocument();
    expect(within(detailPanel).queryByText('Whole-Book assignment is not available in V1.')).not.toBeInTheDocument();

    expect(within(tree).queryByLabelText('Title')).not.toBeInTheDocument();
    expect(within(tree).queryByLabelText('Type')).not.toBeInTheDocument();
    expect(within(tree).queryByText('Move to')).not.toBeInTheDocument();
    expect(within(tree).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders Settings as access and review controls without metadata catalog fields', async () => {
    render(
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook()}
        initialNodes={[]}
        materialCandidates={[]}
        presentation="modal"
        activeTab="settings"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Book settings' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Book access' })).toBeInTheDocument();
    expect(screen.getByLabelText('Visibility')).toBeInTheDocument();
    expect(screen.getByText('Public review')).toBeInTheDocument();
    expect(screen.queryByLabelText('Authors')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Publisher')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ISBN')).not.toBeInTheDocument();
  });

  it('calls onSaved after metadata and structure saves and reports dirty changes', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onDirtyChange = vi.fn();
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
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={currentBook}
        initialNodes={[]}
        repository={repository}
        materialCandidates={[]}
        presentation="page-compat"
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.type(screen.getByLabelText('Title'), ' Updated');

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    await user.click(screen.getByRole('button', { name: 'Save Metadata' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('book-123');
    });

    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Request review' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(3);
      expect(currentBook.visibility).toBe('public-library-pending-review');
    });
  });

  it('uses public projection fallback when raw Book reads are denied', async () => {
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
          },
        ],
      } as any)),
      write: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <BookEditorWorkspace
        bookId="book-123"
        repository={repository}
        materialCandidates={[]}
        presentation="modal"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Public Book outline' })).toBeInTheDocument();
    expect(screen.getByText('Public Section')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Metadata' })).not.toBeInTheDocument();
    expect(repository.readPublicBookProjection).toHaveBeenCalledWith('book-123');
  });

  it('shows in-modal delete confirmation instead of calling window.confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
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
      <BookEditorWorkspace
        bookId="book-123"
        initialBook={makeBook({ status: 'ready' })}
        initialNodes={nodes}
        materialCandidates={[]}
        presentation="modal"
      />,
    );

    await user.click(within(screen.getByRole('complementary', { name: 'Selected item details' })).getByRole('button', { name: 'Delete' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Delete Book node' })).toBeInTheDocument();
    expect(screen.getByText('Source materials are not deleted.')).toBeInTheDocument();
  });
});
