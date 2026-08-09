import type {
  MaterialBookMetadata,
  MaterialBookMaterialRef,
  MaterialBookNode,
} from '../../types/materialCatalog.types';

export interface AppendPublicBookCanonicalForkRefInput {
  readonly book: MaterialBookMetadata;
  readonly nodes: readonly MaterialBookNode[];
  readonly targetNodeId: string;
  readonly ref: MaterialBookMaterialRef;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Pure Book-editor transformation for the canonical fork. The complete node
 * set is required so ref uniqueness is checked across the whole Book before
 * the shared metadata/index/summary planner is invoked.
 */
export const appendPublicBookCanonicalForkRef = (
  input: AppendPublicBookCanonicalForkRefInput,
): readonly MaterialBookNode[] => {
  if (input.book.visibility !== 'private') throw new Error('public_book_fork_target_visibility_denied');
  if (!['draft-empty', 'draft-in-progress', 'ready'].includes(input.book.status)) {
    throw new Error('public_book_fork_target_status_denied');
  }
  if (input.ref.materialKind !== 'interactive-activity'
    || input.ref.visibilitySnapshot !== 'private'
    || input.ref.ownerIdSnapshot !== input.book.ownerId
    || input.ref.availability !== 'available'
    || input.ref.updateState !== 'current') {
    throw new Error('public_book_fork_ref_snapshot_invalid');
  }

  let targetFound = false;
  const refIds = new Set<string>();
  input.nodes.forEach((node) => {
    node.materialRefs.forEach((ref) => {
      if (refIds.has(ref.refId)) throw new Error('public_book_fork_placement_conflict');
      refIds.add(ref.refId);
    });
  });
  if (refIds.has(input.ref.refId)) throw new Error('public_book_fork_placement_conflict');

  const next = input.nodes.map((node) => {
    if (node.nodeId !== input.targetNodeId) return clone(node);
    targetFound = true;
    return {
      ...clone(node),
      materialRefs: [...node.materialRefs.map(clone), clone(input.ref)],
    };
  });
  if (!targetFound) throw new Error('public_book_fork_target_node_not_found');
  return next;
};
