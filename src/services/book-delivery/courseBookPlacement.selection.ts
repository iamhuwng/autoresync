import type { BookContentNodeType, BookSourceStrategy } from '../../types/bookAssembly.types';
import type { CourseBookSelection } from './courseBookPlacement.service';

export interface CourseBookSelectionCatalog {
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly sourceStrategy: BookSourceStrategy;
  readonly sources: readonly {
    readonly sourceKey: string;
    readonly ownerNodeKey?: string;
  }[];
  readonly nodes: readonly {
    readonly nodeKey: string;
    readonly parentNodeKey: string | null;
    readonly nodeType: BookContentNodeType;
    readonly order: number;
  }[];
  readonly placements: readonly {
    readonly placementId: string;
    readonly nodeKey: string;
    readonly activityId: string;
    readonly activityVersionId: string;
    readonly sourceKeys: readonly string[];
  }[];
}

const selectedPlacements = (
  catalog: CourseBookSelectionCatalog,
  selection: CourseBookSelection,
) => {
  if (selection.kind === 'placements') {
    const selected = new Set(selection.placementIds);
    return catalog.placements.filter((placement) => selected.has(placement.placementId));
  }

  const parents = new Map(catalog.nodes.map((node) => [node.nodeKey, node.parentNodeKey]));
  const roots = new Set(selection.nodeKeys);
  const isSelected = (nodeKey: string): boolean => {
    let current: string | null | undefined = nodeKey;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (roots.has(current)) return true;
      visited.add(current);
      current = parents.get(current);
    }
    return false;
  };
  return catalog.placements.filter((placement) => isSelected(placement.nodeKey));
};

export const courseBookExposureWarning = (
  catalog: CourseBookSelectionCatalog,
  selection: CourseBookSelection,
): string | null => {
  const selected = selectedPlacements(catalog, selection);
  if (selected.length === 0) return null;

  if (catalog.sourceStrategy === 'full_pdf') {
    return selected.length < catalog.placements.length
      ? 'Students can view the complete Book PDF. The selected Unit, subtree, or schedule limits Activities only. Use Component PDFs if other pages must remain unavailable.'
      : null;
  }

  const ownerBySource = new Map(catalog.sources.map((source) => [source.sourceKey, source.ownerNodeKey]));
  const selectedRoots = selection.kind === 'subtree' ? new Set(selection.nodeKeys) : null;
  const exposesLargerComponent = selected.some((placement) => placement.sourceKeys.some((sourceKey) => {
    const ownerNodeKey = ownerBySource.get(sourceKey);
    return ownerNodeKey !== undefined && (selectedRoots === null || !selectedRoots.has(ownerNodeKey));
  }));
  return exposesLargerComponent
    ? 'Students will receive the complete Component PDF for this part of the Book. The selected descendant or Activity limits Activities only. Other pages in this PDF may still be viewed. Upload separate Component PDFs if those pages must remain unavailable.'
    : null;
};

export const courseBookSelectionCount = (
  catalog: CourseBookSelectionCatalog,
  selection: CourseBookSelection,
): number => selectedPlacements(catalog, selection).length;
