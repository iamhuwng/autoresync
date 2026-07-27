import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import BookAssemblyWorkspace from './BookAssemblyWorkspace';

const mocks = vi.hoisted(() => ({
  trackAction: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: mocks.trackAction }),
}));

vi.mock('../modern', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
    warning: mocks.warning,
  },
}));

const sourceVersions = [
  { sourceVersionId: 'source-full', bookId: 'book-1', physicalPageCount: 40, verifiedUsable: true },
  { sourceVersionId: 'source-part-a', bookId: 'book-1', physicalPageCount: 20, verifiedUsable: true },
  { sourceVersionId: 'source-part-b', bookId: 'book-1', physicalPageCount: 22, verifiedUsable: true },
  { sourceVersionId: 'source-invalid', bookId: 'book-1', physicalPageCount: 10, verifiedUsable: false },
] as const;

const candidate = (revision = 1): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 2,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision,
  lifecycle: 'draft',
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }],
    },
    nodes: [
      { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
    ],
    units: [],
  },
  validation: { valid: true, errors: [] },
  updatedAt: '2026-07-26T00:00:00.000Z',
});

const invalidSourceCandidate = (): BookAssemblyCandidateRecord => ({
  ...candidate(),
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-invalid', sourceOrder: 1 }],
    },
    nodes: [
      { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
    ],
    units: [],
  },
});

const repository = (createResult: 'created' | 'conflict' | 'forbidden' = 'created'): UnitAssemblyRepository => ({
  create: vi.fn(async (input) => ({
    status: createResult === 'created' ? 'created' : createResult,
    candidate: createResult === 'created' ? candidate() : undefined,
    receipt: {
      operationId: input.operationId,
      fingerprint: 'fingerprint',
      status: createResult === 'created' ? 'created' : createResult,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  })),
  replace: vi.fn(async (input) => ({
    status: createResult === 'created' ? 'replaced' : createResult,
    candidate: createResult === 'created' ? candidate(2) : undefined,
    receipt: {
      operationId: input.operationId,
      fingerprint: 'fingerprint',
      status: createResult === 'created' ? 'replaced' : createResult,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  })),
  validate: vi.fn(),
  discard: vi.fn(),
  load: vi.fn(async () => ({ status: 'loaded', candidate: candidate(3), conflict: null })),
});

const renderWorkspace = (overrides: Partial<React.ComponentProps<typeof BookAssemblyWorkspace>> = {}) => {
  const props: React.ComponentProps<typeof BookAssemblyWorkspace> = {
    access: 'owner',
    bookId: 'book-1',
    bookTitle: 'Assembly Book',
    bookRevision: 2,
    sourceSetRevision: 3,
    sourceVersions,
    presentation: 'modal',
    repository: repository(),
    ...overrides,
  };
  return { ...render(<BookAssemblyWorkspace {...props} />), props };
};

beforeEach(() => vi.clearAllMocks());

describe('BookAssemblyWorkspace', () => {
  it('builds full-PDF hierarchy with native tree semantics and saves through 13A CAS', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    expect(screen.getByRole('radio', { name: 'Full PDF' })).toBeChecked();
    expect(screen.getByRole('tree', { name: 'Assembly hierarchy tree' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Bind' })[0]).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Bind' })[3]).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      expectedBookRevision: 2,
      expectedSourceSetRevision: 3,
      manifest: expect.objectContaining({
        sourceSet: expect.objectContaining({ sourceStrategy: 'full_pdf' }),
      }),
    }));
    expect(mocks.success).toHaveBeenCalledWith('Assembly draft saved.');
  });

  it('starts an existing candidate clean and returns clean after conflict reload', async () => {
    const user = userEvent.setup();
    const repo = repository('conflict');
    const onDirtyChange = vi.fn();
    renderWorkspace({ repository: repo, initialCandidate: candidate(), onDirtyChange });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current candidate changed');

    await user.click(screen.getByRole('button', { name: 'Reload current' }));
    await waitFor(() => expect(repo.load).toHaveBeenCalledWith('book-1', 'unit-1', 'candidate-1'));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(mocks.info).toHaveBeenCalledWith('Assembly draft reloaded.');
  });

  it('supports nested tree keyboard operation and focus after add, reorder, and delete', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Add section' }));
    const sectionButton = screen.getByRole('button', { name: /^section:/u });
    expect(sectionButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));
    const chapterButton = screen.getByRole('button', { name: /^chapter:/u });
    expect(chapterButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const unitButton = screen.getByRole('button', { name: /^unit:/u });
    expect(unitButton).toHaveFocus();

    const treeItems = screen.getAllByRole('treeitem');
    expect(treeItems.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '3']);

    await user.keyboard('{Home}');
    expect(sectionButton).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(chapterButton).toHaveFocus();
    await user.keyboard('{End}');
    expect(unitButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(chapterButton).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^unit:/u })).not.toBeInTheDocument();
  });

  it('supports component ownership, deterministic order, and order normalization after removal', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('radio', { name: 'Component PDFs' }));
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(screen.getAllByRole('button', { name: 'Bind' })[1]);
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));
    await user.click(screen.getAllByRole('button', { name: 'Bind' })[1]);

    const orderList = screen.getByRole('list', { name: 'Component source order' });
    expect(orderList).toHaveTextContent('1. source-source-part-a');
    expect(orderList).toHaveTextContent('2. source-source-part-b');
    expect(screen.getByLabelText('Owner for source-source-part-a')).not.toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Move source-source-part-b up' }));
    expect(within(orderList).getAllByRole('listitem')[0]).toHaveTextContent('1. source-source-part-b');
    await user.click(screen.getByRole('button', { name: 'Remove source-source-part-b' }));
    expect(within(orderList).getAllByRole('listitem')[0]).toHaveTextContent('1. source-source-part-a');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_source_removed',
      expect.objectContaining({ sourceVersionId: 'source-part-b' }),
    );
  });

  it('rejects invalid persisted Source Versions before 13A mutation', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo, initialCandidate: invalidSourceCandidate() });

    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('sourceSet.sources[0].sourceVersionId');
    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Assembly changes need correction before saving.');
  });

  it('shows readable permission loss when the trusted route rejects save', async () => {
    const user = userEvent.setup();
    const repo = repository('forbidden');
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer have permission');
    expect(mocks.error).toHaveBeenCalledWith('You no longer have permission to save this Assembly draft.');
  });
});
