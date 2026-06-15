import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createBookEditorNode,
  deleteBookNodeWithDescendants,
  getBookNodeDepth,
  BOOK_NODE_MAX_DEPTH,
  removeMaterialRefFromNode,
  reorderBookNode,
} from '../../services/materialCatalog/bookEditor.service';
import {
  MATERIAL_BOOK_NODE_TYPES,
  type MaterialBookMaterialRef,
  type MaterialBookNode,
  type MaterialBookNodeType,
} from '../../types/materialCatalog.types';
import './BookNodeTree.css';

interface BookNodeTreeProps {
  readonly bookId: string;
  readonly nodes: readonly MaterialBookNode[];
  readonly onNodesChange: (nodes: readonly MaterialBookNode[]) => void;
  readonly createId?: (type: MaterialBookNodeType) => string;
  readonly now?: () => string;
  readonly selectedNodeId?: string | null;
  readonly onSelectNode?: (node: MaterialBookNode) => void;
  readonly selectedRefId?: string | null;
  readonly onSelectMaterialRef?: (ref: MaterialBookMaterialRef, node: MaterialBookNode) => void;
  readonly onRequestDeleteNode?: (node: MaterialBookNode, confirmDelete: () => void) => void;
  readonly onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

const ROOT_NODE_TYPES: readonly MaterialBookNodeType[] = [
  'section',
  'chapter',
  'test',
];

type OpenActionMenu =
  | { readonly kind: 'node'; readonly id: string; readonly top: number; readonly left: number }
  | { readonly kind: 'ref'; readonly id: string; readonly top: number; readonly left: number }
  | null;

const NODE_LABELS: Record<MaterialBookNodeType, string> = {
  'intro-placeholder': 'Intro Placeholder',
  'toc-placeholder': 'TOC Placeholder',
  'note-placeholder': 'Note Placeholder',
  section: 'Section',
  chapter: 'Chapter',
  test: 'Test',
};

const isPlaceholderNode = (type: MaterialBookNodeType): boolean => type.endsWith('-placeholder');

const brokenRefLabel = (availability: string): string => {
  if (availability === 'archived') {
    return 'Removed';
  }

  if (availability === 'missing') {
    return 'Missing';
  }

  if (availability === 'inaccessible') {
    return 'No access';
  }

  if (availability === 'missing-version') {
    return 'Missing version';
  }

  if (availability === 'missing-projection') {
    return 'Missing projection';
  }

  return availability;
};

const MoreVertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </svg>
);

const NodeTypeIcon = ({ type }: { readonly type: MaterialBookNodeType }) => {
  if (type === 'test') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
        <path d="M8 4h8l3 3v13H5V4h3Z" />
        <path d="M15 4v4h4" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <path d="M3.5 7.5h6l1.8 2h9.2v8.8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.5Z" />
      <path d="M3.5 7.5V5.7A1.7 1.7 0 0 1 5.2 4h4.2l1.8 2h7.6a1.7 1.7 0 0 1 1.7 1.7v1.8" />
    </svg>
  );
};

const MaterialRefIcon = ({ materialKind }: { readonly materialKind: string }) => {
  if (materialKind === 'full-test') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h3" />
        <path d="m14 12 1.4 1.4L18 10.8" />
        <path d="M8 16h8" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <path d="M7 3.5h7l3 3v14H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5v4h4" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h5" />
    </svg>
  );
};

const sortedChildren = (
  nodes: readonly MaterialBookNode[],
  parentNodeId: string | null,
): MaterialBookNode[] =>
  nodes
    .filter((node) => (node.parentNodeId ?? null) === parentNodeId)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.nodeId.localeCompare(right.nodeId));

const BookNodeTree = ({
  bookId,
  nodes,
  onNodesChange,
  createId,
  now,
  selectedNodeId,
  onSelectNode,
  selectedRefId,
  onSelectMaterialRef,
  onRequestDeleteNode,
  onTrackAction,
}: BookNodeTreeProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState<OpenActionMenu>(null);
  const rootNodes = useMemo(() => sortedChildren(nodes, null), [nodes]);
  const query = searchTerm.trim().toLowerCase();
  const materialRefCount = useMemo(
    () => nodes.reduce((total, node) => total + node.materialRefs.length, 0),
    [nodes],
  );

  const outlineCountText = `${nodes.length} ${nodes.length === 1 ? 'part' : 'parts'} - ${materialRefCount} ${materialRefCount === 1 ? 'material' : 'materials'}`;

  const makeNodeId = (type: MaterialBookNodeType): string =>
    createId?.(type) ?? `node-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const closeActionMenu = () => setOpenActionMenu(null);

  useEffect(() => {
    if (!openActionMenu) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        closeActionMenu();
        return;
      }

      if (target.closest('.book-node-tree__action-menu') || target.closest('.book-node-tree__row-menu')) {
        return;
      }

      closeActionMenu();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeActionMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenu]);

  const addNode = (type: MaterialBookNodeType, parentNodeId: string | null) => {
    closeActionMenu();
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

  const selectNode = (node: MaterialBookNode) => {
    closeActionMenu();
    onSelectNode?.(node);
  };

  const selectMaterialRef = (ref: MaterialBookMaterialRef, node: MaterialBookNode) => {
    closeActionMenu();
    onSelectMaterialRef?.(ref, node);
  };

  const nextMenuPosition = (button: HTMLButtonElement): Pick<Exclude<OpenActionMenu, null>, 'top' | 'left'> => {
    const rect = button.getBoundingClientRect();

    return {
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.right - 170, window.innerWidth - 184)),
    };
  };

  const moveNode = (node: MaterialBookNode, direction: 'up' | 'down') => {
    closeActionMenu();
    setMessage(null);

    try {
      onNodesChange(reorderBookNode(nodes, node.nodeId, direction));
      onSelectNode?.(node);
      onTrackAction?.('teacher_materials_book_node_reordered', {
        nodeId: node.nodeId,
        direction,
        mode: 'sibling_order',
        source: 'book_editor_outline_menu',
      });
    } catch (moveError) {
      setMessage(moveError instanceof Error ? moveError.message : 'Unable to move Book node.');
    }
  };

  const requestDeleteNode = (node: MaterialBookNode) => {
    closeActionMenu();

    const confirmDelete = () => {
      onNodesChange(deleteBookNodeWithDescendants(nodes, node.nodeId));
      onTrackAction?.('teacher_materials_book_node_deleted', {
        nodeId: node.nodeId,
        nodeType: node.type,
        hadMaterialRefs: node.materialRefs.length > 0,
        source: 'book_editor_outline_menu',
      });
    };

    if (onRequestDeleteNode) {
      onRequestDeleteNode(node, confirmDelete);
      return;
    }

    confirmDelete();
  };

  const removeMaterialRef = (node: MaterialBookNode, ref: MaterialBookMaterialRef) => {
    closeActionMenu();

    const nextNode = removeMaterialRefFromNode(node, ref.refId);
    onNodesChange(nodes.map((entry) => (entry.nodeId === nextNode.nodeId ? nextNode : entry)));
    onSelectNode?.(nextNode);
    onTrackAction?.('teacher_materials_book_material_removed', {
      nodeId: nextNode.nodeId,
      materialId: ref.materialId,
      materialKind: ref.materialKind,
      source: 'book_editor_outline_menu',
    });
  };

  const renderNodeActionMenu = (node: MaterialBookNode) => {
    if (openActionMenu?.kind !== 'node' || openActionMenu.id !== node.nodeId) {
      return null;
    }

    const canAddChild = getBookNodeDepth(nodes, node.nodeId) < BOOK_NODE_MAX_DEPTH;

    return createPortal(
      <div
        className="book-node-tree__action-menu"
        role="menu"
        aria-label={`Actions for ${node.title}`}
        style={{ top: openActionMenu.top, left: openActionMenu.left }}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={() => selectNode(node)}>
          Select
        </button>
        <button type="button" role="menuitem" onClick={() => moveNode(node, 'up')}>
          Move up
        </button>
        <button type="button" role="menuitem" onClick={() => moveNode(node, 'down')}>
          Move down
        </button>
        <span className="book-node-tree__action-separator" role="separator" />
        {ROOT_NODE_TYPES.map((type) => (
          <button key={type} type="button" role="menuitem" onClick={() => addNode(type, node.nodeId)} disabled={!canAddChild}>
            Add {NODE_LABELS[type]}
          </button>
        ))}
        <span className="book-node-tree__action-separator" role="separator" />
        <button type="button" role="menuitem" className="book-node-tree__action-danger" onClick={() => requestDeleteNode(node)}>
          Delete
        </button>
      </div>,
      document.body,
    );
  };

  const renderRefActionMenu = (node: MaterialBookNode, ref: MaterialBookMaterialRef) => {
    if (openActionMenu?.kind !== 'ref' || openActionMenu.id !== ref.refId) {
      return null;
    }

    return createPortal(
      <div
        className="book-node-tree__action-menu"
        role="menu"
        aria-label={`Actions for ${ref.titleSnapshot}`}
        style={{ top: openActionMenu.top, left: openActionMenu.left }}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={() => selectMaterialRef(ref, node)}>
          Select
        </button>
        <button type="button" role="menuitem" className="book-node-tree__action-danger" onClick={() => removeMaterialRef(node, ref)}>
          Remove
        </button>
      </div>,
      document.body,
    );
  };

  const statusForNode = (node: MaterialBookNode): string => {
    const refs = node.materialRefs.length;

    if (refs === 0) {
      return 'needs content';
    }

    if (node.materialRefs.some((ref) => ref.availability !== 'available')) {
      return 'needs repair';
    }

    if (node.materialRefs.some((ref) => ref.updateState === 'newer-version-available')) {
      return 'newer version';
    }

    return 'ready';
  };

  const searchableNodeText = (node: MaterialBookNode): string =>
    [
      node.title,
      NODE_LABELS[node.type],
      node.type,
      ...node.materialRefs.flatMap((ref) => [
        ref.titleSnapshot,
        ref.materialKind,
        ...ref.testTypeIdsSnapshot,
        ref.availability,
        ref.updateState,
      ]),
    ].join(' ').toLowerCase();

  const visibleNodeIds = useMemo(() => {
    if (!query) {
      return null;
    }

    const visible = new Set<string>();
    const includeWithAncestors = (node: MaterialBookNode) => {
      visible.add(node.nodeId);
      let parentId = node.parentNodeId ?? null;

      while (parentId) {
        const parent = nodes.find((entry) => entry.nodeId === parentId);

        if (!parent) {
          break;
        }

        visible.add(parent.nodeId);
        parentId = parent.parentNodeId ?? null;
      }
    };

    nodes.forEach((node) => {
      if (searchableNodeText(node).includes(query)) {
        includeWithAncestors(node);
      }
    });

    return visible;
  }, [nodes, query]);

  const renderRefList = (node: MaterialBookNode) => {
    const refs = [...node.materialRefs].sort((left, right) => left.order - right.order);

    if (refs.length === 0) {
      return null;
    }

    return (
      <ul className="book-node-tree__refs" role="group">
        {refs.map((ref) => (
          <li
            className={`book-node-tree__ref ${selectedRefId === ref.refId ? 'book-node-tree__ref--selected' : ''}`}
            key={ref.refId}
            data-testid={`book-ref-${ref.refId}`}
            aria-selected={selectedRefId === ref.refId}
            role="treeitem"
            tabIndex={0}
            onClick={() => selectMaterialRef(ref, node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectMaterialRef(ref, node);
              }
            }}
          >
            <span className="book-node-tree__leading-icon">
              <MaterialRefIcon materialKind={ref.materialKind} />
            </span>
            <div className="book-node-tree__ref-summary">
              <strong title={ref.titleSnapshot}>{ref.titleSnapshot}</strong>
              <span className="book-node-tree__chip">{ref.materialKind}</span>
              <span>{ref.testTypeIdsSnapshot.join(', ') || 'No Test Type'}</span>
              {ref.availability !== 'available' && (
                <>
                  <span className="book-node-tree__unavailable">Unavailable: {ref.availability}</span>
                  <span className="book-node-tree__unavailable">{brokenRefLabel(ref.availability)}</span>
                  <span className="book-node-tree__update-state">Needs repair</span>
                </>
              )}
              {ref.availability === 'available' && (
                <span>available</span>
              )}
              {ref.updateState === 'newer-version-available' && (
                <span className="book-node-tree__update-state">Newer version available</span>
              )}
            </div>
            <div className="book-node-tree__row-actions">
              <button
                type="button"
                className="book-node-tree__row-menu"
                aria-label={`Open actions for ${ref.titleSnapshot}`}
                aria-haspopup="menu"
                aria-expanded={openActionMenu?.kind === 'ref' && openActionMenu.id === ref.refId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectMaterialRef?.(ref, node);
                  const position = nextMenuPosition(event.currentTarget);
                  setOpenActionMenu((current) => (
                    current?.kind === 'ref' && current.id === ref.refId
                      ? null
                      : { kind: 'ref', id: ref.refId, ...position }
                  ));
                }}
              >
                <MoreVertIcon />
              </button>
              {renderRefActionMenu(node, ref)}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderNode = (node: MaterialBookNode) => {
    if (visibleNodeIds && !visibleNodeIds.has(node.nodeId)) {
      return null;
    }

    const children = sortedChildren(nodes, node.nodeId);
    const refCount = node.materialRefs.length;
    const nodeStatus = statusForNode(node);
    const hasDescendants = children.length > 0 || refCount > 0;

    return (
      <li
        className={`book-node-tree__node ${isPlaceholderNode(node.type) ? 'book-node-tree__node--placeholder' : ''} ${selectedNodeId === node.nodeId ? 'book-node-tree__node--selected' : ''}`}
        data-testid={`book-node-${node.nodeId}`}
        key={node.nodeId}
        aria-selected={selectedNodeId === node.nodeId}
        aria-expanded={hasDescendants ? true : undefined}
        role="treeitem"
        tabIndex={0}
        onClick={() => selectNode(node)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectNode(node);
          }
        }}
      >
        <article className="book-node-tree__node-card">
          <div className="book-node-tree__node-header">
            <span className="book-node-tree__leading-icon">
              <NodeTypeIcon type={node.type} />
            </span>
            <div className="book-node-tree__node-summary">
              <span className="book-node-tree__chip">{node.type}</span>
              <h3 title={node.title}>{node.title}</h3>
              <p>{refCount} {refCount === 1 ? 'material' : 'materials'} - {nodeStatus}</p>
            </div>
            <div className="book-node-tree__row-actions">
              <button
                type="button"
                className="book-node-tree__row-menu"
                aria-label={`Open actions for ${node.title}`}
                aria-haspopup="menu"
                aria-expanded={openActionMenu?.kind === 'node' && openActionMenu.id === node.nodeId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode?.(node);
                  const position = nextMenuPosition(event.currentTarget);
                  setOpenActionMenu((current) => (
                    current?.kind === 'node' && current.id === node.nodeId
                      ? null
                      : { kind: 'node', id: node.nodeId, ...position }
                  ));
                }}
              >
                <MoreVertIcon />
              </button>
              {renderNodeActionMenu(node)}
            </div>
          </div>

          {renderRefList(node)}
        </article>

        {children.length > 0 && (
          <ol className="book-node-tree__children" role="group">
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
          <p>{outlineCountText}</p>
        </div>
        <div className="book-node-tree__root-actions">
          {ROOT_NODE_TYPES.map((type) => (
            <button key={type} type="button" aria-label={`Add ${NODE_LABELS[type]}`} onClick={() => addNode(type, null)}>
              + {NODE_LABELS[type].replace(' Placeholder', '')}
            </button>
          ))}
        </div>
        <label className="book-node-tree__search">
          <span>Search outline</span>
          <SearchIcon />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search outline"
          />
        </label>
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
        <ol className="book-node-tree__roots" role="tree" aria-labelledby="book-node-tree-heading">
          {rootNodes.map(renderNode)}
        </ol>
      )}
    </section>
  );
};

export default BookNodeTree;
