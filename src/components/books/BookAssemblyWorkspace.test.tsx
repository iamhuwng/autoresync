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

const componentMappingCandidate = (): BookAssemblyCandidateRecord => ({
  ...candidate(),
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'source-source-part-a', sourceVersionId: 'source-part-a', sourceOrder: 1, ownerNodeKey: 'section-a' },
        { sourceKey: 'source-source-part-b', sourceVersionId: 'source-part-b', sourceOrder: 2, ownerNodeKey: 'section-b' },
      ],
    },
    nodes: [
      { nodeKey: 'section-a', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-a', parentNodeKey: 'section-a', nodeType: 'unit', order: 1 },
      { nodeKey: 'section-b', parentNodeKey: null, nodeType: 'section', order: 2 },
      { nodeKey: 'unit-b', parentNodeKey: 'section-b', nodeType: 'unit', order: 1 },
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

  it('maps source-qualified pages to Page Groups and Activity slots before saving', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2,3');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-reading-1');
    await user.selectOptions(screen.getByLabelText('Context requirement'), 'required');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('full pages 2, 3');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('1. activity-reading-1 (required)');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({
        units: [expect.objectContaining({
          activitySlots: [expect.objectContaining({
            activityKey: 'activity-reading-1',
            contextRequirement: 'required',
            pageGroupKeys: ['pages-full-2-3-activity'],
          })],
          pageGroups: [expect.objectContaining({
            pageGroupKey: 'pages-full-2-3-activity',
            sourceKey: 'full',
            pages: [2, 3],
            defaultPhysicalPageNumber: 2,
            activityKeys: ['activity-reading-1'],
          })],
        })],
      }),
    }));
  });

  it('supports reference-only/default pages and one Activity mapped to multiple Page Groups', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.selectOptions(screen.getByLabelText('Page Group mode'), 'reference_only');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '1');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('Reference only');
    expect(screen.queryByRole('list', { name: 'Activity slot order' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Activity slot order' })).queryAllByRole('listitem')).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText('Page Group mode'), 'activity');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-shared');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '3');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '3');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('activity-shared');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('pages-full-2-activity, pages-full-3-activity');
  });

  it('merges multiple Activities onto one source page without duplicating Page Group content', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '7');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '7');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-a');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-b');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(within(screen.getByRole('list', { name: 'Page Groups' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('Activities activity-a, activity-b');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('1. activity-a');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('2. activity-b');
  });

  it('rejects malformed and out-of-range physical page input before save', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2, nope');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid physical page "nope"');

    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '41');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '41');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outside full');
  });

  it('preserves mappings as repairable state when source strategy or source binding changes', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');

    await user.click(screen.getByRole('button', { name: 'Remove full' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('full_pdf requires exactly one source');
    expect(repo.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Component PDFs' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');
  });

  it('limits component-PDF mapping choices to the selected Unit owner branch', async () => {
    const user = userEvent.setup();
    renderWorkspace({ initialCandidate: componentMappingCandidate() });

    const firstUnit = screen.getByRole('button', { name: 'unit: unit-a' });
    await user.click(firstUnit);
    expect(screen.getByLabelText('Mapping source key')).toHaveTextContent('source-source-part-a');
    expect(screen.getByLabelText('Mapping source key')).not.toHaveTextContent('source-source-part-b');

    const secondUnit = screen.getByRole('button', { name: 'unit: unit-b' });
    await user.click(secondUnit);
    expect(screen.getByLabelText('Mapping source key')).toHaveTextContent('source-source-part-b');
    expect(screen.getByLabelText('Mapping source key')).not.toHaveTextContent('source-source-part-a');
  });
});
