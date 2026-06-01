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
        materialCandidates={[]}
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

  it('blocks adding depth 6 children before save', async () => {
    const user = userEvent.setup();
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
        materialCandidates={[]}
        onNodesChange={onNodesChange}
        createId={() => 'too-deep'}
      />,
    );

    await user.click(within(screen.getByTestId('book-node-n5')).getByRole('button', { name: 'Add child Section to N5' }));

    expect(screen.getByText('Book nodes can be nested up to 5 levels.')).toBeInTheDocument();
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting a node with children or refs', async () => {
    const user = userEvent.setup();
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
        materialCandidates={[]}
        onNodesChange={onNodesChange}
      />,
    );

    await user.click(within(screen.getByTestId('book-node-parent')).getByRole('button', { name: 'Delete Parent' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('tracks node reorder, node deletion, material attach, and material removal actions', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onNodesChange = vi.fn();
    const onTrackAction = vi.fn();
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
        materialCandidates={[
          {
            materialId: 'full-test-1',
            title: 'Published Test',
            materialKind: 'full-test',
            status: 'published',
            testTypeIds: [materialCatalogIds.testTypeId('ielts')],
            visibility: 'private',
            publishedSnapshotVersionId: 'snapshot-test',
          },
        ]}
        onNodesChange={onNodesChange}
        onTrackAction={onTrackAction}
        createRefId={() => 'ref-new'}
        now={() => NOW}
        actorId="teacher-1"
      />,
    );

    await user.click(within(screen.getByTestId('book-node-section-2')).getByRole('button', { name: 'Move Section 2 up' }));
    await user.click(screen.getByText('Add published material to Section 1'));
    const sectionOne = within(screen.getByTestId('book-node-section-1'));
    await user.click(sectionOne.getByRole('button', { name: 'Attach Published Test' }));
    await user.click(sectionOne.getByRole('button', { name: 'Remove Passage One' }));
    await user.click(sectionOne.getByRole('button', { name: 'Delete Section 1' }));

    expect(onTrackAction).toHaveBeenCalledWith(
      'teacher_materials_book_node_reordered',
      expect.objectContaining({ nodeId: 'section-2', direction: 'up' }),
    );
    expect(onTrackAction).toHaveBeenCalledWith(
      'teacher_materials_book_material_attached',
      expect.objectContaining({ nodeId: 'section-1', materialId: 'full-test-1', materialKind: 'full-test' }),
    );
    expect(onTrackAction).toHaveBeenCalledWith(
      'teacher_materials_book_material_removed',
      expect.objectContaining({ nodeId: 'section-1', materialId: 'passage-1', materialKind: 'reading-passage' }),
    );
    expect(onTrackAction).toHaveBeenCalledWith(
      'teacher_materials_book_node_deleted',
      expect.objectContaining({ nodeId: 'section-1', nodeType: 'section', hadMaterialRefs: true }),
    );

    confirmSpy.mockRestore();
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
        materialCandidates={[]}
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
