import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BookNodeTree from './BookNodeTree';
import { materialCatalogIds, type MaterialBookNode } from '../../types/materialCatalog.types';

const NOW = '2026-06-01T00:00:00.000Z';

const makeNode = (overrides: Partial<MaterialBookNode> = {}): MaterialBookNode => ({
  nodeId: materialCatalogIds.nodeId('node-1'),
  bookId: materialCatalogIds.bookId('book-1'),
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 1,
  materialRefs: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('BookNodeTree', () => {
  it('creates V1 node types with stable fields', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const onTrackAction = vi.fn();

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={[]}
        onNodesChange={onNodesChange}
        onTrackAction={onTrackAction}
        createId={() => 'section-1'}
        now={() => NOW}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add Section' }));

    expect(onNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        nodeId: 'section-1',
        bookId: 'book-1',
        parentNodeId: null,
        type: 'section',
        title: 'Section',
        order: 1,
        materialRefs: [],
      }),
    ]);
    expect(onTrackAction).toHaveBeenCalledWith('teacher_materials_book_node_added', {
      nodeId: 'section-1',
      parentNodeId: null,
      nodeType: 'section',
      depth: 1,
    });
  });

  it('renders the modal outline navigator without visible row command dumps', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onSelectMaterialRef = vi.fn();
    const nodes = [
      makeNode({
        nodeId: materialCatalogIds.nodeId('section-1'),
        title: 'Section 1',
        order: 1,
        materialRefs: [
          {
            refId: materialCatalogIds.refId('ref-1'),
            materialId: 'passage-1',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-1',
            titleSnapshot: 'IELTS Reading Passage - Huarango',
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
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={vi.fn()}
        onSelectNode={onSelectNode}
        selectedNodeId="section-1"
        selectedRefId="ref-1"
        onSelectMaterialRef={onSelectMaterialRef}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Book outline' })).toBeInTheDocument();
    expect(screen.getByText('1 part - 1 material')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Section' })).toHaveTextContent('+ Section');
    expect(screen.getByRole('button', { name: 'Add Chapter' })).toHaveTextContent('+ Chapter');
    expect(screen.getByRole('button', { name: 'Add Test' })).toHaveTextContent('+ Test');
    expect(screen.queryByRole('button', { name: 'Add Intro Placeholder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add TOC Placeholder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Note Placeholder' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search outline')).toBeInTheDocument();

    const sectionRow = screen.getByTestId('book-node-section-1');
    expect(sectionRow).toHaveAttribute('aria-selected', 'true');
    expect(sectionRow).toHaveTextContent('section');
    expect(sectionRow).toHaveTextContent('1 material - ready');
    expect(screen.getByText('IELTS Reading Passage - Huarango')).toBeInTheDocument();
    expect(screen.getByText('reading-passage')).toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
    expect(within(sectionRow).getByRole('button', { name: 'Open actions for Section 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open actions for IELTS Reading Passage - Huarango' })).toBeInTheDocument();

    expect(screen.queryByText('Up')).not.toBeInTheDocument();
    expect(screen.queryByText('Down')).not.toBeInTheDocument();
    expect(screen.queryByText('Select')).not.toBeInTheDocument();
    expect(screen.queryByText('Move to')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add child Section to Section 1' })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search outline'), 'Huarango');

    expect(screen.getByText('IELTS Reading Passage - Huarango')).toBeInTheDocument();
    expect(screen.queryByText('Section 2')).not.toBeInTheDocument();
  });

  it('keeps child-add controls out of the outline rows', () => {
    const onNodesChange = vi.fn();
    const nodes = [
      makeNode({ nodeId: materialCatalogIds.nodeId('n1'), title: 'N1', parentNodeId: null }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n2'), title: 'N2', parentNodeId: materialCatalogIds.nodeId('n1') }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n3'), title: 'N3', parentNodeId: materialCatalogIds.nodeId('n2') }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n4'), title: 'N4', parentNodeId: materialCatalogIds.nodeId('n3') }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n5'), title: 'N5', parentNodeId: materialCatalogIds.nodeId('n4') }),
    ];

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={onNodesChange}
        createId={() => 'too-deep'}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add child Section to N5' })).not.toBeInTheDocument();
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('does not expose destructive node delete as visible outline row text', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onNodesChange = vi.fn();
    const nodes = [
      makeNode({ nodeId: materialCatalogIds.nodeId('parent'), title: 'Parent', parentNodeId: null }),
      makeNode({ nodeId: materialCatalogIds.nodeId('child'), title: 'Child', parentNodeId: materialCatalogIds.nodeId('parent') }),
    ];

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={onNodesChange}
      />,
    );

    expect(within(screen.getByTestId('book-node-parent')).queryByText('Delete')).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('tracks node selection actions from the compact outline', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const onTrackAction = vi.fn();
    const onSelectNode = vi.fn();
    const nodes = [
      makeNode({
        nodeId: materialCatalogIds.nodeId('section-1'),
        title: 'Section 1',
        order: 1,
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
      makeNode({
        nodeId: materialCatalogIds.nodeId('section-2'),
        title: 'Section 2',
        order: 2,
      }),
    ];

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={onNodesChange}
        onTrackAction={onTrackAction}
        onSelectNode={onSelectNode}
        selectedNodeId="section-1"
        now={() => NOW}
      />,
    );

    await user.click(screen.getByTestId('book-node-section-1'));

    expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'section-1' }));
    expect(onNodesChange).not.toHaveBeenCalled();
    expect(onTrackAction).not.toHaveBeenCalledWith('teacher_materials_book_node_deleted', expect.anything());
  });

  it('opens a compact actions menu from the node row more button', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const onTrackAction = vi.fn();
    const nodes = [
      makeNode({ nodeId: materialCatalogIds.nodeId('section-1'), title: 'Section 1', order: 1 }),
    ];

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={onNodesChange}
        onTrackAction={onTrackAction}
        createId={() => materialCatalogIds.nodeId('chapter-1')}
        now={() => NOW}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open actions for Section 1' }));

    const menu = screen.getByRole('menu', { name: 'Actions for Section 1' });
    expect(screen.getByRole('button', { name: 'Open actions for Section 1' }).closest('.book-node-tree')).not.toContainElement(menu);
    expect(within(menu).getByRole('menuitem', { name: 'Select' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Add Chapter' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole('menu', { name: 'Actions for Section 1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open actions for Section 1' }));
    const reopenedMenu = screen.getByRole('menu', { name: 'Actions for Section 1' });

    await user.click(within(reopenedMenu).getByRole('menuitem', { name: 'Add Chapter' }));

    expect(onNodesChange).toHaveBeenCalledWith([
      nodes[0],
      expect.objectContaining({
        nodeId: 'chapter-1',
        parentNodeId: 'section-1',
        type: 'chapter',
        title: 'Chapter',
        order: 1,
      }),
    ]);
    expect(onTrackAction).toHaveBeenCalledWith('teacher_materials_book_node_added', {
      nodeId: 'chapter-1',
      parentNodeId: 'section-1',
      nodeType: 'chapter',
      depth: 2,
    });
  });

  it('renders unavailable Book refs from fallback snapshots without leaking hidden metadata', () => {
    const nodes = [
      makeNode({
        materialRefs: [
          {
            refId: materialCatalogIds.refId('missing-ref'),
            materialId: 'missing-material',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-old',
            titleSnapshot: 'Missing Passage Fallback',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
            visibilitySnapshot: 'private',
            availability: 'missing',
            updateState: 'unknown',
            order: 1,
            addedAt: NOW,
            addedBy: 'teacher-1',
          },
          {
            refId: materialCatalogIds.refId('archived-ref'),
            materialId: 'archived-material',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-archived',
            titleSnapshot: 'Archived Passage Fallback',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
            visibilitySnapshot: 'private',
            availability: 'archived',
            updateState: 'unknown',
            order: 2,
            addedAt: NOW,
            addedBy: 'teacher-1',
          } as any,
          {
            refId: materialCatalogIds.refId('inaccessible-ref'),
            materialId: 'inaccessible-material',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-inaccessible',
            titleSnapshot: 'Private Passage Fallback',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
            visibilitySnapshot: 'private',
            availability: 'inaccessible',
            updateState: 'unknown',
            order: 3,
            addedAt: NOW,
            addedBy: 'teacher-1',
          } as any,
          {
            refId: materialCatalogIds.refId('newer-ref'),
            materialId: 'newer-material',
            materialKind: 'reading-passage',
            snapshotVersionId: 'snapshot-kept',
            titleSnapshot: 'Updated Passage Fallback',
            testTypeIdsSnapshot: [materialCatalogIds.testTypeId('toeic')],
            visibilitySnapshot: 'private',
            availability: 'available',
            updateState: 'newer-version-available',
            order: 4,
            addedAt: NOW,
            addedBy: 'teacher-1',
          } as any,
        ],
      } as any),
    ];

    render(
      <BookNodeTree
        bookId="book-1"
        nodes={nodes}
        onNodesChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Missing Passage Fallback')).toBeInTheDocument();
    expect(screen.getAllByText('reading-passage')).toHaveLength(4);
    expect(screen.getAllByText('ielts')).toHaveLength(3);
    expect(screen.getByText('Unavailable: missing')).toBeInTheDocument();
    expect(screen.getByText('Archived Passage Fallback')).toBeInTheDocument();
    expect(screen.getByText('Unavailable: archived')).toBeInTheDocument();
    expect(screen.getByText('Private Passage Fallback')).toBeInTheDocument();
    expect(screen.getByText('Unavailable: inaccessible')).toBeInTheDocument();
    expect(screen.getByText('Updated Passage Fallback')).toBeInTheDocument();
    expect(screen.getByText('Newer version available')).toBeInTheDocument();
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });
});
