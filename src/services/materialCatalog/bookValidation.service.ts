import {
  MATERIAL_BOOK_NODE_TYPES,
  MATERIAL_BOOK_STATUSES,
  MATERIAL_BOOK_VISIBILITIES,
  type MaterialBookMetadata,
  type MaterialBookNode,
  type MaterialBookStatus,
  type MaterialBookVisibility,
  type MaterialTestTypeConfig,
} from '../../types/materialCatalog.types';

export type MaterialBookValidationIssueCode =
  | 'missing-title'
  | 'missing-owner'
  | 'missing-test-type'
  | 'invalid-visibility'
  | 'invalid-status'
  | 'unknown-test-type'
  | 'inactive-test-type'
  | 'invalid-node-book'
  | 'invalid-node-type'
  | 'self-parent'
  | 'cycle'
  | 'duplicate-sibling-order'
  | 'orphan-node'
  | 'depth-exceeded'
  | 'draft-ref-not-allowed'
  | 'broken-ref-archived'
  | 'broken-ref-deleted'
  | 'broken-ref-inaccessible'
  | 'broken-ref-missing-version'
  | 'broken-ref-missing-projection'
  | 'duplicate-ref-id'
  | 'public-book-private-ref'
  | 'super-admin-required';

export interface MaterialBookValidationIssue {
  readonly code: MaterialBookValidationIssueCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly refId?: string;
  readonly testTypeId?: string;
}

export interface MaterialBookValidationResult {
  readonly valid: boolean;
  readonly errors: readonly MaterialBookValidationIssue[];
  readonly warnings: readonly MaterialBookValidationIssue[];
}

export interface MaterialBookValidationContext {
  readonly actorId: string;
  readonly actorRole: 'teacher' | 'admin' | 'super_admin' | string;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly now?: () => string;
}

const STRUCTURAL_NODE_TYPES = new Set(['section', 'chapter', 'test']);
const PUBLIC_BOOK_VISIBILITIES = new Set<MaterialBookVisibility>([
  'public-library-pending-review',
  'public-library-published',
]);

const error = (
  code: MaterialBookValidationIssueCode,
  message: string,
  details: Omit<MaterialBookValidationIssue, 'code' | 'message'> = {},
): MaterialBookValidationIssue => ({
  code,
  message,
  ...details,
});

const result = (
  errors: readonly MaterialBookValidationIssue[],
  warnings: readonly MaterialBookValidationIssue[] = [],
): MaterialBookValidationResult => ({
  valid: errors.length === 0,
  errors,
  warnings,
});

const isBookVisibility = (value: unknown): value is MaterialBookVisibility =>
  typeof value === 'string' && MATERIAL_BOOK_VISIBILITIES.includes(value as MaterialBookVisibility);

const isBookStatus = (value: unknown): value is MaterialBookStatus =>
  typeof value === 'string' && MATERIAL_BOOK_STATUSES.includes(value as MaterialBookStatus);

const isNodeType = (value: unknown): value is MaterialBookNode['type'] =>
  typeof value === 'string' && MATERIAL_BOOK_NODE_TYPES.includes(value as MaterialBookNode['type']);

const brokenRefIssueFor = (
  ref: MaterialBookNode['materialRefs'][number],
): { readonly code: MaterialBookValidationIssueCode; readonly message: string } | null => {
  if (ref.materialKind === 'draft') {
    return {
      code: 'draft-ref-not-allowed',
      message: 'Book refs must point to published material snapshots.',
    };
  }

  if (!ref.snapshotVersionId || ref.availability === 'missing-version') {
    return {
      code: 'broken-ref-missing-version',
      message: 'Book ref is missing its published snapshot version.',
    };
  }

  if (ref.availability === 'archived') {
    return {
      code: 'broken-ref-archived',
      message: 'Book ref points to an archived material.',
    };
  }

  if (ref.availability === 'missing') {
    return {
      code: 'broken-ref-deleted',
      message: 'Book ref points to a deleted or missing material.',
    };
  }

  if (ref.availability === 'inaccessible') {
    return {
      code: 'broken-ref-inaccessible',
      message: 'Book ref points to a material the owner cannot access.',
    };
  }

  if (ref.availability === 'missing-projection') {
    return {
      code: 'broken-ref-missing-projection',
      message: 'Book ref is missing its student-safe projection.',
    };
  }

  return null;
};

const hasBrokenMaterialRef = (nodes: readonly MaterialBookNode[]): boolean =>
  nodes.some((node) => node.materialRefs.some((ref) => brokenRefIssueFor(ref) !== null));

export const deriveMaterialBookStatus = (
  nodes: readonly MaterialBookNode[],
  archived = false,
): MaterialBookStatus => {
  if (archived) {
    return 'archived';
  }

  if (nodes.length === 0) {
    return 'draft-empty';
  }

  if (hasBrokenMaterialRef(nodes)) {
    return 'needs-repair';
  }

  return nodes.some((node) => STRUCTURAL_NODE_TYPES.has(node.type))
    ? 'ready'
    : 'draft-in-progress';
};

const validateTestTypes = (
  metadata: MaterialBookMetadata,
  context: MaterialBookValidationContext,
): { errors: MaterialBookValidationIssue[]; warnings: MaterialBookValidationIssue[] } => {
  const errors: MaterialBookValidationIssue[] = [];
  const warnings: MaterialBookValidationIssue[] = [];
  const configsById = new Map((context.testTypeConfigs ?? []).map((config) => [config.testTypeId, config]));

  if (metadata.testTypeIds.length === 0) {
    errors.push(error('missing-test-type', 'Book requires at least one Test Type id.'));
  }

  metadata.testTypeIds.forEach((testTypeId) => {
    if (configsById.size === 0) {
      return;
    }

    const config = configsById.get(testTypeId);

    if (!config) {
      errors.push(error('unknown-test-type', `Book references unknown Test Type: ${testTypeId}`, { testTypeId }));
      return;
    }

    if (!config.active) {
      warnings.push(error('inactive-test-type', `Book references inactive Test Type: ${testTypeId}`, { testTypeId }));
    }
  });

  return { errors, warnings };
};

const depthForNode = (
  node: MaterialBookNode,
  nodesById: Map<string, MaterialBookNode>,
  visited: Set<string> = new Set(),
): number | 'cycle' | 'orphan' => {
  if (!node.parentNodeId) {
    return 1;
  }

  if (node.parentNodeId === node.nodeId || visited.has(node.nodeId)) {
    return 'cycle';
  }

  const parent = nodesById.get(node.parentNodeId);

  if (!parent) {
    return 'orphan';
  }

  const parentDepth = depthForNode(parent, nodesById, new Set([...visited, node.nodeId]));

  return typeof parentDepth === 'number' ? parentDepth + 1 : parentDepth;
};

export const validateMaterialBookNodes = (
  metadata: MaterialBookMetadata,
  nodes: readonly MaterialBookNode[],
  _context: MaterialBookValidationContext,
): MaterialBookValidationResult => {
  const errors: MaterialBookValidationIssue[] = [];
  const nodesById = new Map(nodes.map((entry) => [entry.nodeId, entry]));
  const siblingOrders = new Map<string, Set<number>>();
  const refIds = new Set<string>();

  nodes.forEach((entry) => {
    if (entry.bookId !== metadata.bookId) {
      errors.push(error('invalid-node-book', 'Book node belongs to a different Book.', { nodeId: entry.nodeId }));
    }

    if (!isNodeType(entry.type)) {
      errors.push(error('invalid-node-type', 'Book node type is not allowed.', { nodeId: entry.nodeId }));
    }

    if (entry.parentNodeId === entry.nodeId) {
      errors.push(error('self-parent', 'Book node cannot be its own parent.', { nodeId: entry.nodeId }));
    }

    const siblingKey = entry.parentNodeId ?? '__root__';
    const orders = siblingOrders.get(siblingKey) ?? new Set<number>();

    if (orders.has(entry.order)) {
      errors.push(error('duplicate-sibling-order', 'Sibling Book nodes cannot share an order.', { nodeId: entry.nodeId }));
    }
    orders.add(entry.order);
    siblingOrders.set(siblingKey, orders);

    entry.materialRefs.forEach((ref) => {
      if (refIds.has(ref.refId)) {
        errors.push(error('duplicate-ref-id', 'Book material refs require unique refId values.', { nodeId: entry.nodeId, refId: ref.refId }));
      }
      refIds.add(ref.refId);

      const brokenRefIssue = brokenRefIssueFor(ref);

      if (brokenRefIssue) {
        errors.push(error(brokenRefIssue.code, brokenRefIssue.message, { nodeId: entry.nodeId, refId: ref.refId }));
      }

      if (
        PUBLIC_BOOK_VISIBILITIES.has(metadata.visibility) &&
        ref.visibilitySnapshot === 'private'
      ) {
        errors.push(error('public-book-private-ref', 'Public-library Books cannot contain private material refs.', { nodeId: entry.nodeId, refId: ref.refId }));
      }
    });
  });

  nodes.forEach((entry) => {
    const depth = depthForNode(entry, nodesById);

    if (depth === 'orphan') {
      errors.push(error('orphan-node', 'Book node parent is missing.', { nodeId: entry.nodeId }));
      return;
    }

    if (depth === 'cycle') {
      errors.push(error('cycle', 'Book node tree contains a cycle or descendant move.', { nodeId: entry.nodeId }));
      return;
    }

    if (depth > 5) {
      errors.push(error('depth-exceeded', 'Book node tree cannot exceed depth 5.', { nodeId: entry.nodeId }));
    }
  });

  return result(errors);
};

export const validateMaterialBook = (input: {
  readonly metadata: MaterialBookMetadata;
  readonly nodes: readonly MaterialBookNode[];
  readonly context: MaterialBookValidationContext;
}): MaterialBookValidationResult => {
  const errors: MaterialBookValidationIssue[] = [];

  if (!input.metadata.title.trim()) {
    errors.push(error('missing-title', 'Book title is required.'));
  }

  if (!input.metadata.ownerId.trim()) {
    errors.push(error('missing-owner', 'Book ownerId is required.'));
  }

  if (!isBookVisibility(input.metadata.visibility)) {
    errors.push(error('invalid-visibility', 'Book visibility is not a PRD-0052 value.'));
  }

  if (!isBookStatus(input.metadata.status)) {
    errors.push(error('invalid-status', 'Book status is not a PRD-0052 value.'));
  }

  const testTypeResult = validateTestTypes(input.metadata, input.context);
  const nodeResult = validateMaterialBookNodes(input.metadata, input.nodes, input.context);

  return result([...errors, ...testTypeResult.errors, ...nodeResult.errors], testTypeResult.warnings);
};

export const validateMaterialBookModerationTransition = (
  _current: MaterialBookMetadata | null,
  next: MaterialBookMetadata,
  context: MaterialBookValidationContext,
): MaterialBookValidationResult => {
  if (next.visibility === 'public-library-published' && context.actorRole !== 'super_admin') {
    return result([
      error(
        'super-admin-required',
        'Only super_admin can set Book visibility to public-library-published in V1.',
      ),
    ]);
  }

  return result([]);
};
