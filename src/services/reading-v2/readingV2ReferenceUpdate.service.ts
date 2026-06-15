import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import type { MaterialBookMaterialRef } from '../../types/materialCatalog.types';

export type ReadingV2ReferenceUpdateTargetKind = 'master' | 'book';

export interface ReadingV2ReferenceUpdateTarget {
  readonly id: string;
  readonly kind: ReadingV2ReferenceUpdateTargetKind;
  readonly title: string;
  readonly ownerId: string;
  readonly refId: string;
  readonly materialId: string;
  readonly currentSnapshotVersionId: string;
  readonly nextSnapshotVersionId: string;
  readonly selectable: boolean;
}

export interface ReadingV2ReferenceUpdateSummary {
  readonly passageMaterialId: string;
  readonly previousSnapshotVersionId: string;
  readonly nextSnapshotVersionId: string;
  readonly targets: readonly ReadingV2ReferenceUpdateTarget[];
  readonly excluded: {
    readonly nonOwnedReferenceCount: number;
    readonly alreadyCurrentCount: number;
    readonly frozenAssignmentCount: number;
    readonly resultSnapshotCount: number;
  };
}

export interface ReadingV2ReferenceUpdateBookNode {
  readonly id?: string;
  readonly nodeId?: string;
  readonly materialRef?: MaterialBookMaterialRef;
  readonly materialRefs?: readonly MaterialBookMaterialRef[];
  readonly children?: readonly ReadingV2ReferenceUpdateBookNode[];
  readonly [key: string]: unknown;
}

export interface ReadingV2ReferenceUpdateBook {
  readonly bookId: string;
  readonly title: string;
  readonly ownerId: string;
  readonly nodes: readonly ReadingV2ReferenceUpdateBookNode[];
}

export interface ReadingV2ReferenceUpdateResult {
  readonly updatedMasters: ReadingV2FullTestComposition[];
  readonly updatedBooks: ReadingV2ReferenceUpdateBook[];
  readonly updatedTargetIds: string[];
  readonly skippedTargetIds: string[];
  readonly immutableFrozenCounts: {
    readonly frozenAssignmentCount: number;
    readonly resultSnapshotCount: number;
  };
}

const isMatchingMaterialRef = (
  materialRef: MaterialBookMaterialRef | undefined,
  passageMaterialId: string,
  previousSnapshotVersionId: string,
): materialRef is MaterialBookMaterialRef =>
  Boolean(materialRef) &&
  materialRef?.materialKind === 'reading-passage' &&
  materialRef.materialId === passageMaterialId &&
  materialRef.snapshotVersionId === previousSnapshotVersionId;

const getBookNodeId = (node: ReadingV2ReferenceUpdateBookNode): string =>
  node.id ?? node.nodeId ?? '';

const getNodeMaterialRefs = (node: ReadingV2ReferenceUpdateBookNode): readonly MaterialBookMaterialRef[] => {
  const refs = Array.isArray(node.materialRefs) ? node.materialRefs : [];
  return node.materialRef ? [node.materialRef, ...refs] : refs;
};

const countBookRefs = (
  nodes: readonly ReadingV2ReferenceUpdateBookNode[],
  predicate: (ref: MaterialBookMaterialRef | undefined) => boolean,
): number =>
  nodes.reduce((count, node) => {
    const own = getNodeMaterialRefs(node).filter((ref) => predicate(ref)).length;
    const childCount = node.children ? countBookRefs(node.children, predicate) : 0;
    return count + own + childCount;
  }, 0);

const collectBookTargets = (input: {
  readonly ownerId: string;
  readonly book: ReadingV2ReferenceUpdateBook;
  readonly passageMaterialId: string;
  readonly previousSnapshotVersionId: string;
  readonly nextSnapshotVersionId: string;
}): ReadingV2ReferenceUpdateTarget[] => {
  const targets: ReadingV2ReferenceUpdateTarget[] = [];
  const visit = (nodes: readonly ReadingV2ReferenceUpdateBookNode[]): void => {
    nodes.forEach((node) => {
      const nodeId = getBookNodeId(node);
      getNodeMaterialRefs(node).forEach((materialRef) => {
        if (!nodeId || !isMatchingMaterialRef(
          materialRef,
          input.passageMaterialId,
          input.previousSnapshotVersionId,
        )) {
          return;
        }

        targets.push({
          id: `book:${input.book.bookId}:${nodeId}:${materialRef.refId}`,
          kind: 'book',
          title: input.book.title,
          ownerId: input.book.ownerId,
          refId: materialRef.refId,
          materialId: materialRef.materialId,
          currentSnapshotVersionId: input.previousSnapshotVersionId,
          nextSnapshotVersionId: input.nextSnapshotVersionId,
          selectable: input.book.ownerId === input.ownerId,
        });
      });

      if (node.children) {
        visit(node.children);
      }
    });
  };

  visit(input.book.nodes);
  return targets.filter((target) => target.selectable);
};

export const findReadingV2ReferenceUpdateTargets = (input: {
  readonly ownerId: string;
  readonly passageMaterialId: string;
  readonly previousSnapshotVersionId: string;
  readonly nextSnapshotVersionId: string;
  readonly masters: readonly ReadingV2FullTestComposition[];
  readonly books: readonly ReadingV2ReferenceUpdateBook[];
  readonly frozenAssignmentCount?: number;
  readonly resultSnapshotCount?: number;
}): ReadingV2ReferenceUpdateSummary => {
  const targets: ReadingV2ReferenceUpdateTarget[] = [];
  let nonOwnedReferenceCount = 0;
  let alreadyCurrentCount = 0;

  input.masters.forEach((master) => {
    master.passageRefs.forEach((ref) => {
      if (ref.passageMaterialId !== input.passageMaterialId) {
        return;
      }

      if (ref.snapshotVersionId === input.nextSnapshotVersionId) {
        alreadyCurrentCount += 1;
        return;
      }

      if (ref.snapshotVersionId !== input.previousSnapshotVersionId) {
        return;
      }

      if (master.ownerId !== input.ownerId) {
        nonOwnedReferenceCount += 1;
        return;
      }

      targets.push({
        id: `master:${master.compositionId}:${ref.refId}`,
        kind: 'master',
        title: master.title,
        ownerId: master.ownerId,
        refId: ref.refId,
        materialId: ref.passageMaterialId,
        currentSnapshotVersionId: ref.snapshotVersionId,
        nextSnapshotVersionId: input.nextSnapshotVersionId,
        selectable: true,
      });
    });
  });

  input.books.forEach((book) => {
    if (book.ownerId !== input.ownerId) {
      nonOwnedReferenceCount += countBookRefs(book.nodes, (ref) =>
        isMatchingMaterialRef(ref, input.passageMaterialId, input.previousSnapshotVersionId),
      );
      return;
    }

    alreadyCurrentCount += countBookRefs(book.nodes, (ref) =>
      Boolean(ref) &&
      ref?.materialKind === 'reading-passage' &&
      ref.materialId === input.passageMaterialId &&
      ref.snapshotVersionId === input.nextSnapshotVersionId,
    );
    targets.push(...collectBookTargets({ ...input, book }));
  });

  return {
    passageMaterialId: input.passageMaterialId,
    previousSnapshotVersionId: input.previousSnapshotVersionId,
    nextSnapshotVersionId: input.nextSnapshotVersionId,
    targets,
    excluded: {
      nonOwnedReferenceCount,
      alreadyCurrentCount,
      frozenAssignmentCount: input.frozenAssignmentCount ?? 0,
      resultSnapshotCount: input.resultSnapshotCount ?? 0,
    },
  };
};

const updateBookNodes = (
  nodes: readonly ReadingV2ReferenceUpdateBookNode[],
  selectedTargetIds: ReadonlySet<string>,
  bookId: string,
  nextSnapshotVersionId: string,
): readonly ReadingV2ReferenceUpdateBookNode[] =>
  nodes.map((node) => {
    const nodeId = getBookNodeId(node);
    const updateRef = (ref: MaterialBookMaterialRef): MaterialBookMaterialRef => {
      const targetId = `book:${bookId}:${nodeId}:${ref.refId}`;
      return selectedTargetIds.has(targetId)
        ? {
            ...ref,
            snapshotVersionId: nextSnapshotVersionId,
            updateState: 'current',
          }
        : ref;
    };
    const nextNode: ReadingV2ReferenceUpdateBookNode = {
      ...node,
      ...(node.materialRef
        ? {
            materialRef: updateRef(node.materialRef),
          }
        : {}),
      ...(node.materialRefs ? { materialRefs: node.materialRefs.map(updateRef) } : {}),
      ...(node.children
        ? { children: updateBookNodes(node.children, selectedTargetIds, bookId, nextSnapshotVersionId) }
        : {}),
    };
    return nextNode;
  });

export const applyReadingV2SelectedReferenceUpdates = (input: {
  readonly summary: ReadingV2ReferenceUpdateSummary;
  readonly selectedTargetIds: readonly string[];
  readonly masters: readonly ReadingV2FullTestComposition[];
  readonly books: readonly ReadingV2ReferenceUpdateBook[];
}): ReadingV2ReferenceUpdateResult => {
  const selectedTargetIds = new Set(input.selectedTargetIds);
  const knownTargetIds = new Set(input.summary.targets.map((target) => target.id));
  const updatedTargetIds = input.selectedTargetIds.filter((targetId) => knownTargetIds.has(targetId));
  const skippedTargetIds = input.summary.targets
    .map((target) => target.id)
    .filter((targetId) => !selectedTargetIds.has(targetId));

  const updatedMasters = input.masters
    .map((master) => {
      const selectedRefs = new Set(
        updatedTargetIds
          .filter((targetId) => targetId.startsWith(`master:${master.compositionId}:`))
          .map((targetId) => targetId.split(':')[2])
          .filter((refId): refId is string => Boolean(refId)),
      );

      if (selectedRefs.size === 0) {
        return null;
      }

      return {
        ...master,
        passageRefs: master.passageRefs.map((ref) =>
          selectedRefs.has(ref.refId)
            ? {
                ...ref,
                snapshotVersionId: input.summary.nextSnapshotVersionId,
                currentVersionId: input.summary.nextSnapshotVersionId,
              }
            : ref,
        ),
      };
    })
    .filter((master): master is Exclude<typeof master, null> => master !== null) as ReadingV2FullTestComposition[];

  const updatedBooks = input.books
    .map((book) => {
      const hasSelectedNode = updatedTargetIds.some((targetId) => targetId.startsWith(`book:${book.bookId}:`));
      if (!hasSelectedNode) {
        return null;
      }

      return {
        ...book,
        nodes: updateBookNodes(
          book.nodes,
          selectedTargetIds,
          book.bookId,
          input.summary.nextSnapshotVersionId,
        ),
      };
    })
    .filter((book): book is Exclude<typeof book, null> => book !== null) as ReadingV2ReferenceUpdateBook[];

  return {
    updatedMasters,
    updatedBooks,
    updatedTargetIds,
    skippedTargetIds,
    immutableFrozenCounts: {
      frozenAssignmentCount: input.summary.excluded.frozenAssignmentCount,
      resultSnapshotCount: input.summary.excluded.resultSnapshotCount,
    },
  };
};
