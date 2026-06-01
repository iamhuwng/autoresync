import {
  materialCatalogIds,
  type MaterialBookMaterialRef,
  type MaterialBookNode,
  type MaterialBookNodeId,
  type MaterialBookNodeType,
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';

export const BOOK_NODE_MAX_DEPTH = 5;

export interface BookMaterialSummary {
  readonly materialId: string;
  readonly title: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly status?: string;
  readonly state?: string;
  readonly published?: boolean;
  readonly isPublished?: boolean;
  readonly isDraft?: boolean;
  readonly draftKind?: string;
  readonly testTypeIds?: readonly (MaterialTestTypeId | string)[];
  readonly visibility?: string;
  readonly publishedSnapshotVersionId?: string;
  readonly currentPublishedSnapshotVersionId?: string;
  readonly publishedVersionId?: string;
  readonly versionId?: string;
  readonly questionCount?: number;
  readonly sourceOrderDisplay?: string;
  readonly sourceFullTestTitle?: string;
  readonly hasStudentSafeProjection?: boolean;
  readonly accessible?: boolean;
  readonly archived?: boolean;
}

export interface CreateBookEditorNodeInput {
  readonly bookId: string;
  readonly nodeId?: string;
  readonly type: MaterialBookNodeType;
  readonly title: string;
  readonly parentNodeId: string | null;
  readonly order: number;
  readonly now?: () => string;
}

export interface AttachMaterialRefInput {
  readonly actorId: string;
  readonly refId?: string;
  readonly now?: () => string;
}

const nowIso = (now?: () => string): string => now?.() ?? new Date().toISOString();

const cloneNode = (node: MaterialBookNode): MaterialBookNode => ({
  ...node,
  materialRefs: node.materialRefs.map((ref) => ({ ...ref })),
});

const normalizeParentId = (parentNodeId: string | null | undefined): MaterialBookNodeId | null =>
  parentNodeId ? materialCatalogIds.nodeId(parentNodeId) : null;

const siblingKey = (parentNodeId: string | null | undefined): string => parentNodeId ?? '__root__';

const sortedSiblings = (
  nodes: readonly MaterialBookNode[],
  parentNodeId: string | null | undefined,
): MaterialBookNode[] =>
  nodes
    .filter((node) => siblingKey(node.parentNodeId) === siblingKey(parentNodeId))
    .map(cloneNode)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.nodeId.localeCompare(right.nodeId));

const normalizeSiblingOrders = (nodes: readonly MaterialBookNode[]): MaterialBookNode[] => {
  const groups = new Map<string, MaterialBookNode[]>();
  const orderById = new Map<string, number>();

  nodes.forEach((node) => {
    const key = siblingKey(node.parentNodeId);
    groups.set(key, [...(groups.get(key) ?? []), cloneNode(node)]);
  });

  groups.forEach((group) => {
    group
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.nodeId.localeCompare(right.nodeId))
      .forEach((node, index) => {
        orderById.set(node.nodeId, index + 1);
      });
  });

  return nodes.map((node) => ({
    ...cloneNode(node),
    order: orderById.get(node.nodeId) ?? node.order,
  }));
};

export const createBookEditorNode = (input: CreateBookEditorNodeInput): MaterialBookNode => {
  const timestamp = nowIso(input.now);

  return {
    nodeId: materialCatalogIds.nodeId(input.nodeId ?? `node-${Date.now().toString(36)}`),
    bookId: materialCatalogIds.bookId(input.bookId),
    parentNodeId: normalizeParentId(input.parentNodeId),
    type: input.type,
    title: input.title.trim() || 'Untitled node',
    order: input.order,
    materialRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getBookNodeDepth = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
): number => {
  const nodesById = new Map<string, MaterialBookNode>(nodes.map((node) => [node.nodeId, node]));
  const visited = new Set<string>();
  let current = nodesById.get(nodeId);
  let depth = 0;

  while (current) {
    if (visited.has(current.nodeId)) {
      throw new Error(`Book node cycle detected at ${current.nodeId}.`);
    }

    visited.add(current.nodeId);
    depth += 1;

    if (!current.parentNodeId) {
      return depth;
    }

    current = nodesById.get(current.parentNodeId);
  }

  throw new Error(`Book node not found: ${nodeId}.`);
};

const collectDescendantIds = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
): Set<string> => {
  const descendants = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;

    nodes.forEach((node) => {
      if (node.parentNodeId && (node.parentNodeId === nodeId || descendants.has(node.parentNodeId)) && !descendants.has(node.nodeId)) {
        descendants.add(node.nodeId);
        changed = true;
      }
    });
  }

  return descendants;
};

const getSubtreeRelativeDepth = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
): number => {
  const rootDepth = getBookNodeDepth(nodes, nodeId);
  const descendants = collectDescendantIds(nodes, nodeId);
  const allIds = [nodeId, ...descendants];

  return Math.max(...allIds.map((id) => getBookNodeDepth(nodes, id) - rootDepth + 1));
};

export const moveBookNode = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
  nextParentNodeId: string | null,
): MaterialBookNode[] => {
  if (nextParentNodeId === nodeId) {
    throw new Error('Book node cannot move under self.');
  }

  const moving = nodes.find((node) => node.nodeId === nodeId);

  if (!moving) {
    throw new Error(`Book node not found: ${nodeId}.`);
  }

  const nextParentDepth = nextParentNodeId ? getBookNodeDepth(nodes, nextParentNodeId) : 0;

  if (nextParentDepth >= BOOK_NODE_MAX_DEPTH) {
    throw new Error(`Book node move would exceed max depth ${BOOK_NODE_MAX_DEPTH}.`);
  }

  const descendants = collectDescendantIds(nodes, nodeId);

  if (nextParentNodeId && descendants.has(nextParentNodeId)) {
    throw new Error('Book node cannot move under descendant.');
  }

  const subtreeDepth = getSubtreeRelativeDepth(nodes, nodeId);

  if (nextParentDepth + subtreeDepth > BOOK_NODE_MAX_DEPTH) {
    throw new Error(`Book node move would exceed max depth ${BOOK_NODE_MAX_DEPTH}.`);
  }

  const nextSiblingOrder = sortedSiblings(nodes, nextParentNodeId).length + 1;
  const moved = nodes.map((node) =>
    node.nodeId === nodeId
      ? {
          ...cloneNode(node),
          parentNodeId: normalizeParentId(nextParentNodeId),
          order: nextSiblingOrder,
          updatedAt: nowIso(),
        }
      : cloneNode(node),
  );

  return normalizeSiblingOrders(moved);
};

export const reorderBookNode = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
  direction: 'up' | 'down',
): MaterialBookNode[] => {
  const target = nodes.find((node) => node.nodeId === nodeId);

  if (!target) {
    throw new Error(`Book node not found: ${nodeId}.`);
  }

  const siblings = sortedSiblings(nodes, target.parentNodeId);
  const index = siblings.findIndex((node) => node.nodeId === nodeId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) {
    return normalizeSiblingOrders(nodes);
  }

  const swap = siblings[swapIndex];

  if (!swap) {
    return normalizeSiblingOrders(nodes);
  }

  return normalizeSiblingOrders(
    nodes.map((node) => {
      if (node.nodeId === target.nodeId) {
        return { ...cloneNode(node), order: swap.order, updatedAt: nowIso() };
      }

      if (node.nodeId === swap.nodeId) {
        return { ...cloneNode(node), order: target.order, updatedAt: nowIso() };
      }

      return cloneNode(node);
    }),
  );
};

const isDraftSummary = (summary: BookMaterialSummary): boolean => {
  const status = summary.status?.toLowerCase();
  const state = summary.state?.toLowerCase();

  return summary.isDraft === true ||
    Boolean(summary.draftKind) ||
    summary.materialKind === 'draft' ||
    status === 'draft' ||
    status === 'draft-empty' ||
    status === 'draft-in-progress' ||
    state === 'draft';
};

const isPublishedSummary = (summary: BookMaterialSummary): boolean => {
  const status = summary.status?.toLowerCase();
  const state = summary.state?.toLowerCase();

  return summary.published === true ||
    summary.isPublished === true ||
    Boolean(summary.publishedSnapshotVersionId || summary.currentPublishedSnapshotVersionId || summary.publishedVersionId) ||
    status === 'published' ||
    status === 'ready' ||
    state === 'published';
};

export const filterPublishedMaterialSummaries = (
  summaries: readonly BookMaterialSummary[],
): BookMaterialSummary[] =>
  summaries
    .filter((summary) => summary.title.trim())
    .filter((summary) => !isDraftSummary(summary))
    .filter(isPublishedSummary);

const snapshotVersionIdFor = (summary: BookMaterialSummary): string =>
  summary.publishedSnapshotVersionId ??
  summary.currentPublishedSnapshotVersionId ??
  summary.publishedVersionId ??
  summary.versionId ??
  summary.materialId;

const normalizeTestTypeIds = (
  testTypeIds: readonly (MaterialTestTypeId | string)[] | undefined,
): MaterialTestTypeId[] =>
  (testTypeIds ?? []).map((testTypeId) => materialCatalogIds.testTypeId(String(testTypeId)));

export const attachMaterialRefToNode = (
  node: MaterialBookNode,
  summary: BookMaterialSummary,
  input: AttachMaterialRefInput,
): MaterialBookNode => {
  if (!filterPublishedMaterialSummaries([summary]).length) {
    throw new Error('Book material refs can only point to published materials.');
  }

  const timestamp = nowIso(input.now);
  const ref: MaterialBookMaterialRef = {
    refId: materialCatalogIds.refId(input.refId ?? `ref-${Date.now().toString(36)}-${node.materialRefs.length + 1}`),
    materialId: summary.materialId,
    materialKind: summary.materialKind,
    snapshotVersionId: snapshotVersionIdFor(summary),
    titleSnapshot: summary.title,
    testTypeIdsSnapshot: normalizeTestTypeIds(summary.testTypeIds),
    visibilitySnapshot: summary.visibility,
    availability: summary.archived ? 'archived' : summary.accessible === false ? 'inaccessible' : 'available',
    updateState: 'current',
    order: node.materialRefs.length + 1,
    addedAt: timestamp,
    addedBy: input.actorId,
  };

  return {
    ...cloneNode(node),
    materialRefs: [...node.materialRefs.map((entry) => ({ ...entry })), ref],
    updatedAt: timestamp,
  };
};

export const removeMaterialRefFromNode = (
  node: MaterialBookNode,
  refId: string,
): MaterialBookNode => ({
  ...cloneNode(node),
  materialRefs: node.materialRefs
    .filter((ref) => ref.refId !== refId)
    .sort((left, right) => left.order - right.order)
    .map((ref, index) => ({ ...ref, order: index + 1 })),
  updatedAt: nowIso(),
});

export const reorderMaterialRef = (
  node: MaterialBookNode,
  refId: string,
  direction: 'up' | 'down',
): MaterialBookNode => {
  const refs = node.materialRefs
    .map((ref) => ({ ...ref }))
    .sort((left, right) => left.order - right.order);
  const index = refs.findIndex((ref) => ref.refId === refId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || swapIndex < 0 || swapIndex >= refs.length) {
    return node;
  }

  const currentRef = refs[index];
  const swapRef = refs[swapIndex];

  if (!currentRef || !swapRef) {
    return node;
  }

  const reorderedRefs = [...refs];
  reorderedRefs[index] = swapRef;
  reorderedRefs[swapIndex] = currentRef;

  return {
    ...cloneNode(node),
    materialRefs: reorderedRefs.map((ref, nextIndex) => ({ ...ref, order: nextIndex + 1 })),
    updatedAt: nowIso(),
  };
};

export const deleteBookNodeWithDescendants = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
): MaterialBookNode[] => {
  const deletedIds = new Set([nodeId, ...collectDescendantIds(nodes, nodeId)]);

  return normalizeSiblingOrders(nodes.filter((node) => !deletedIds.has(node.nodeId)));
};

export const bookNodeHasContent = (
  nodes: readonly MaterialBookNode[],
  nodeId: string,
): boolean => {
  const node = nodes.find((entry) => entry.nodeId === nodeId);

  return Boolean(node && (node.materialRefs.length > 0 || collectDescendantIds(nodes, nodeId).size > 0));
};
