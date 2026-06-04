import { useMemo, useState } from 'react';
import {
  bookNodeHasContent,
  attachMaterialRefToNode,
  createBookEditorNode,
  deleteBookNodeWithDescendants,
  getBookNodeDepth,
  moveBookNode,
  reorderBookNode,
  removeMaterialRefFromNode,
  reorderMaterialRef,
  BOOK_NODE_MAX_DEPTH,
  type BookMaterialSummary,
} from '../../services/materialCatalog/bookEditor.service';
import {
  MATERIAL_BOOK_NODE_TYPES,
  type MaterialBookMaterialRef,
  type MaterialBookNode,
  type MaterialBookNodeType,
} from '../../types/materialCatalog.types';
import BookMaterialPicker from './BookMaterialPicker';
import './BookNodeTree.css';

interface BookNodeTreeProps {
  readonly bookId: string;
  readonly nodes: readonly MaterialBookNode[];
  readonly materialCandidates: readonly BookMaterialSummary[];
  readonly onNodesChange: (nodes: readonly MaterialBookNode[]) => void;
  readonly createId?: (type: MaterialBookNodeType) => string;
  readonly createRefId?: () => string;
  readonly now?: () => string;
  readonly actorId?: string;
  readonly selectedRefId?: string | null;
  readonly onSelectMaterialRef?: (ref: MaterialBookMaterialRef, node: MaterialBookNode) => void;
  readonly onAssignMaterialRef?: (ref: MaterialBookMaterialRef, node: MaterialBookNode) => void;
  readonly onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

const ROOT_NODE_TYPES: readonly MaterialBookNodeType[] = [
  'intro-placeholder',
  'toc-placeholder',
  'note-placeholder',
  'section',
  'chapter',
  'test',
];

const CHILD_NODE_TYPES: readonly MaterialBookNodeType[] = ['section', 'chapter', 'test'];

const NODE_LABELS: Record<MaterialBookNodeType, string> = {
  'intro-placeholder': 'Intro Placeholder',
  'toc-placeholder': 'TOC Placeholder',
  'note-placeholder': 'Note Placeholder',
  section: 'Section',
  chapter: 'Chapter',
  test: 'Test',
};

const isPlaceholderNode = (type: MaterialBookNodeType): boolean => type.endsWith('-placeholder');

const isAssignableRef = (ref: MaterialBookMaterialRef): boolean =>
  ref.availability === 'available' &&
  ['reading-passage', 'full-test', 'thcs-thpt-test'].includes(ref.materialKind);

const sortedChildren = (
  nodes: readonly MaterialBookNode[],
  parentNodeId: string | null,
): MaterialBookNode[] =>
  nodes
    .filter((node) => (node.parentNodeId ?? null) === parentNodeId)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.nodeId.localeCompare(right.nodeId));

const hasDescendant = (
  nodes: readonly MaterialBookNode[],
  parentNodeId: string,
  possibleDescendantId: string,
): boolean => {
  const children = nodes.filter((node) => node.parentNodeId === parentNodeId);

  return children.some((child) => child.nodeId === possibleDescendantId || hasDescendant(nodes, child.nodeId, possibleDescendantId));
};

const canMoveToParent = (
  nodes: readonly MaterialBookNode[],
  node: MaterialBookNode,
  parentNodeId: string | null,
): boolean => {
  if (parentNodeId === node.nodeId) {
    return false;
  }

  if (parentNodeId && hasDescendant(nodes, node.nodeId, parentNodeId)) {
    return false;
  }

  try {
    moveBookNode(nodes, node.nodeId, parentNodeId);
    return true;
  } catch {
    return false;
  }
};

const updateNode = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
  updater: (node: MaterialBookNode) => MaterialBookNode,
): MaterialBookNode[] =>
  nodes.map((node) => (node.nodeId === nodeId ? updater(node) : node));

const BookNodeTree = ({
  bookId,
  nodes,
  materialCandidates,
  onNodesChange,
  createId,
  createRefId,
  now,
  actorId = 'unknown',
  selectedRefId,
  onSelectMaterialRef,
  onAssignMaterialRef,
  onTrackAction,
}: BookNodeTreeProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const rootNodes = useMemo(() => sortedChildren(nodes, null), [nodes]);

  const makeNodeId = (type: MaterialBookNodeType): string =>
    createId?.(type) ?? `node-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const addNode = (type: MaterialBookNodeType, parentNodeId: string | null) => {
    setMessage(null);

    if (parentNodeId && getBookNodeDepth(nodes, parentNodeId) >= BOOK_NODE_MAX_DEPTH) {
      setMessage('Book nodes can be nested up to 5 levels.');
      return;
    }

    const order = sortedChildren(nodes, parentNodeId).length + 1;
    const next = createBookEditorNode({
      bookId,
      nodeId: makeNodeId(type),
      type,
      title: NODE_LABELS[type].replace(' Placeholder', ''),
      parentNodeId,
      order,
      now,
    });

    onNodesChange([...nodes, next]);
    onTrackAction?.('teacher_materials_book_node_added', {
      nodeId: next.nodeId,
      parentNodeId,
      nodeType: type,
      depth: parentNodeId ? getBookNodeDepth(nodes, parentNodeId) + 1 : 1,
    });
  };

  const deleteNode = (node: MaterialBookNode) => {
    setMessage(null);

    if (bookNodeHasContent(nodes, node.nodeId)) {
      const confirmed = window.confirm('Delete this Book node and its child placements? Source materials are not deleted.');

      if (!confirmed) {
        return;
      }
    }

    onNodesChange(deleteBookNodeWithDescendants(nodes, node.nodeId));
    onTrackAction?.('teacher_materials_book_node_deleted', {
      nodeId: node.nodeId,
      nodeType: node.type,
      hadMaterialRefs: node.materialRefs.length > 0,
    });
  };

  const attachMaterial = (node: MaterialBookNode, material: BookMaterialSummary) => {
    setMessage(null);
    const refId = createRefId?.() ?? `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nextNode = attachMaterialRefToNode(node, material, {
      actorId,
      refId,
      now,
    });

    onNodesChange(updateNode(nodes, node.nodeId, () => nextNode));
    onTrackAction?.('teacher_materials_book_material_attached', {
      nodeId: node.nodeId,
      materialId: material.materialId,
      materialKind: material.materialKind,
    });
  };

  const renderRefList = (node: MaterialBookNode) => {
    const refs = [...node.materialRefs].sort((left, right) => left.order - right.order);

    if (refs.length === 0) {
      return <p className="book-node-tree__empty">No material refs.</p>;
    }

    return (
      <ul className="book-node-tree__refs">
        {refs.map((ref) => (
          <li
            className={`book-node-tree__ref ${selectedRefId === ref.refId ? 'book-node-tree__ref--selected' : ''}`}
            key={ref.refId}
            aria-selected={selectedRefId === ref.refId}
            tabIndex={0}
            onClick={() => onSelectMaterialRef?.(ref, node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectMaterialRef?.(ref, node);
              }
            }}
          >
            <div>
              <strong>{ref.titleSnapshot}</strong>
              <span>{ref.materialKind}</span>
              <span>{ref.testTypeIdsSnapshot.join(', ') || 'No Test Type'}</span>
              {ref.availability !== 'available' && (
                <span className="book-node-tree__unavailable">Unavailable: {ref.availability}</span>
              )}
              {ref.updateState === 'newer-version-available' && (
                <span className="book-node-tree__update-state">Newer version available</span>
              )}
            </div>
            <div className="book-node-tree__ref-actions">
              <button
                type="button"
                onClick={() => {
                  onNodesChange(updateNode(nodes, node.nodeId, (entry) => reorderMaterialRef(entry, ref.refId, 'up')));
                }}
              >
                Move {ref.titleSnapshot} ref up
              </button>
              <button
                type="button"
                onClick={() => {
                  onNodesChange(updateNode(nodes, node.nodeId, (entry) => reorderMaterialRef(entry, ref.refId, 'down')));
                }}
              >
                Move {ref.titleSnapshot} ref down
              </button>
              <button
                type="button"
                onClick={() => {
                  onNodesChange(updateNode(nodes, node.nodeId, (entry) => removeMaterialRefFromNode(entry, ref.refId)));
                  onTrackAction?.('teacher_materials_book_material_removed', {
                    nodeId: node.nodeId,
                    materialId: ref.materialId,
                    materialKind: ref.materialKind,
                  });
                }}
              >
                Remove {ref.titleSnapshot}
              </button>
              {isAssignableRef(ref) && (
                <button type="button" onClick={() => onAssignMaterialRef?.(ref, node)}>
                  Assign {ref.titleSnapshot}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderNode = (node: MaterialBookNode) => {
    const children = sortedChildren(nodes, node.nodeId);
    const depth = getBookNodeDepth(nodes, node.nodeId);
    const parentOptions = [
      { nodeId: '', title: 'Root' },
      ...nodes
        .filter((entry) => entry.nodeId !== node.nodeId && canMoveToParent(nodes, node, entry.nodeId))
        .map((entry) => ({ nodeId: entry.nodeId, title: entry.title })),
    ];

    return (
      <li
        className={`book-node-tree__node ${isPlaceholderNode(node.type) ? 'book-node-tree__node--placeholder' : ''}`}
        data-testid={`book-node-${node.nodeId}`}
        key={node.nodeId}
      >
        <article className="book-node-tree__node-card">
          <div className="book-node-tree__node-header">
            <div>
              <span>{NODE_LABELS[node.type]}</span>
              <h3>{node.title}</h3>
              <p>Depth {depth} | Order {node.order}</p>
            </div>
            <div className="book-node-tree__node-actions">
              <button
                type="button"
                onClick={() => {
                  onNodesChange(reorderBookNode(nodes, node.nodeId, 'up'));
                  onTrackAction?.('teacher_materials_book_node_reordered', {
                    nodeId: node.nodeId,
                    direction: 'up',
                    mode: 'sibling_order',
                  });
                }}
              >
                Move {node.title} up
              </button>
              <button
                type="button"
                onClick={() => {
                  onNodesChange(reorderBookNode(nodes, node.nodeId, 'down'));
                  onTrackAction?.('teacher_materials_book_node_reordered', {
                    nodeId: node.nodeId,
                    direction: 'down',
                    mode: 'sibling_order',
                  });
                }}
              >
                Move {node.title} down
              </button>
              <label>
                <span>Move to</span>
                <select
                  aria-label={`Move ${node.title} to parent`}
                  value={node.parentNodeId ?? ''}
                  onChange={(event) => {
                    try {
                      onNodesChange(moveBookNode(nodes, node.nodeId, event.target.value || null));
                      onTrackAction?.('teacher_materials_book_node_reordered', {
                        nodeId: node.nodeId,
                        parentNodeId: event.target.value || null,
                        mode: 'move_parent',
                      });
                      setMessage(null);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : 'Unable to move Book node.');
                    }
                  }}
                >
                  {parentOptions.map((option) => (
                    <option key={option.nodeId || 'root'} value={option.nodeId}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => deleteNode(node)}>
                Delete {node.title}
              </button>
            </div>
          </div>

          <div className="book-node-tree__child-actions">
            {CHILD_NODE_TYPES.map((type) => (
              <button key={type} type="button" onClick={() => addNode(type, node.nodeId)}>
                Add child {NODE_LABELS[type]} to {node.title}
              </button>
            ))}
          </div>

          <details className="book-node-tree__picker">
            <summary>Add published material to {node.title}</summary>
            <BookMaterialPicker materials={materialCandidates} onAttach={(material) => attachMaterial(node, material)} />
          </details>

          {renderRefList(node)}
        </article>

        {children.length > 0 && (
          <ol className="book-node-tree__children">
            {children.map(renderNode)}
          </ol>
        )}
      </li>
    );
  };

  return (
    <section className="book-node-tree" aria-labelledby="book-node-tree-heading">
      <div className="book-node-tree__toolbar">
        <div>
          <h2 id="book-node-tree-heading">Book outline</h2>
          <p>Use explicit controls for V1. Drag/drop and whole-Book assignment are not available.</p>
        </div>
        <div className="book-node-tree__root-actions">
          {ROOT_NODE_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => addNode(type, null)}>
              Add {NODE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {message && <p className="book-node-tree__message">{message}</p>}

      {nodes.some((node) => !MATERIAL_BOOK_NODE_TYPES.includes(node.type)) && (
        <p className="book-node-tree__message">Some Book nodes use unsupported types.</p>
      )}

      {rootNodes.length === 0 ? (
        <div className="book-node-tree__empty book-node-tree__empty-panel">
          <strong>Book needs content</strong>
          <span>Add a section, then attach published materials from the section picker.</span>
        </div>
      ) : (
        <ol className="book-node-tree__roots">
          {rootNodes.map(renderNode)}
        </ol>
      )}
    </section>
  );
};

export default BookNodeTree;
