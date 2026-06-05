import { useMemo, useState } from 'react';
import {
  createBookEditorNode,
  getBookNodeDepth,
  BOOK_NODE_MAX_DEPTH,
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

const NODE_LABELS: Record<MaterialBookNodeType, string> = {
  'intro-placeholder': 'Intro Placeholder',
  'toc-placeholder': 'TOC Placeholder',
  'note-placeholder': 'Note Placeholder',
  section: 'Section',
  chapter: 'Chapter',
  test: 'Test',
};

const isPlaceholderNode = (type: MaterialBookNodeType): boolean => type.endsWith('-placeholder');

const MoreVertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

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
  onTrackAction,
}: BookNodeTreeProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const rootNodes = useMemo(() => sortedChildren(nodes, null), [nodes]);
  const query = searchTerm.trim().toLowerCase();
  const materialRefCount = useMemo(
    () => nodes.reduce((total, node) => total + node.materialRefs.length, 0),
    [nodes],
  );

  const outlineCountText = `${nodes.length} ${nodes.length === 1 ? 'part' : 'parts'} - ${materialRefCount} ${materialRefCount === 1 ? 'material' : 'materials'}`;

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
            aria-selected={selectedRefId === ref.refId}
            role="treeitem"
            tabIndex={0}
            onClick={() => onSelectMaterialRef?.(ref, node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectMaterialRef?.(ref, node);
              }
            }}
          >
            <div className="book-node-tree__ref-summary">
              <strong title={ref.titleSnapshot}>{ref.titleSnapshot}</strong>
              <span className="book-node-tree__chip">{ref.materialKind}</span>
              <span>{ref.testTypeIdsSnapshot.join(', ') || 'No Test Type'}</span>
              {ref.availability !== 'available' && (
                <span className="book-node-tree__unavailable">Unavailable: {ref.availability}</span>
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
                aria-label={`Select ${ref.titleSnapshot}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectMaterialRef?.(ref, node);
                }}
              >
                <MoreVertIcon />
              </button>
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
        onClick={() => onSelectNode?.(node)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectNode?.(node);
          }
        }}
      >
        <article className="book-node-tree__node-card">
          <div className="book-node-tree__node-header">
            <div className="book-node-tree__node-summary">
              <span className="book-node-tree__chip">{node.type}</span>
              <h3 title={node.title}>{node.title}</h3>
              <p>{refCount} {refCount === 1 ? 'material' : 'materials'} - {nodeStatus}</p>
            </div>
            <div className="book-node-tree__row-actions">
              <button
                type="button"
                className="book-node-tree__row-menu"
                aria-label={`Select ${node.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode?.(node);
                }}
              >
                <MoreVertIcon />
              </button>
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
