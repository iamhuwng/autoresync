import type {
  MaterialBookMetadata,
  MaterialBookNode,
} from '../../types/materialCatalog.types';
import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import {
  buildMaterialCatalogIndexWrites,
  type MaterialCatalogIndexSummary,
} from './materialCatalogIndexes.service';
import { buildMaterialBookIndexWrites } from './materialBooks.service';
import { materialCatalogPaths } from './materialCatalogPaths';
import { readingV2StoragePaths } from '../reading-v2/readingV2StoragePaths.service';

export type MaterialCatalogRepairOperationKind =
  | 'material-index-write'
  | 'material-index-remove'
  | 'book-index-write'
  | 'book-index-remove'
  | 'book-node-remove'
  | 'composition-version-write';

export interface MaterialCatalogRepairOperation {
  readonly kind: MaterialCatalogRepairOperationKind;
  readonly path: string;
  readonly value: unknown | null;
  readonly reason:
    | 'stale-material-index-row'
    | 'stale-material-index-path'
    | 'stale-book-index-row'
    | 'stale-book-index-path'
    | 'orphan-book-node'
    | 'composition-without-version';
}

export interface MaterialCatalogRepairWrite extends MaterialCatalogRepairOperation {
  readonly approvedBy: string;
}

export interface PlanMaterialCatalogRepairOperationsInput {
  readonly materialSummaries?: readonly MaterialCatalogIndexSummary[];
  readonly materialIndexRowsByPath?: Readonly<Record<string, unknown>>;
  readonly books?: readonly MaterialBookMetadata[];
  readonly bookIndexRowsByPath?: Readonly<Record<string, unknown>>;
  readonly bookNodesByBookId?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly readingV2FullTestCompositions?: Readonly<Record<string, unknown>>;
  readonly readingV2FullTestCompositionVersionsByPath?: Readonly<Record<string, unknown>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toComparableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => (entry === undefined ? null : toComparableJsonValue(entry)))
      .filter((entry) => entry !== undefined);
    return entries.length > 0 ? entries : undefined;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, toComparableJsonValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return value;
};

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(toComparableJsonValue(left)) === JSON.stringify(toComparableJsonValue(right));

const omitUndefinedForFirebase = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : omitUndefinedForFirebase(entry)));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefinedForFirebase(entry)]),
    );
  }

  return value;
};

const isBookNode = (value: unknown): value is MaterialBookNode =>
  isRecord(value) &&
  typeof value.nodeId === 'string' &&
  typeof value.bookId === 'string';

const isReadingV2FullTestComposition = (value: unknown): value is ReadingV2FullTestComposition =>
  isRecord(value) &&
  value.deliveryEngine === 'reading-v2' &&
  value.plane === 'packaging' &&
  typeof value.compositionId === 'string' &&
  typeof value.publishedVersionId === 'string';

const planIndexRepairs = (input: {
  readonly expectedWrites: readonly { readonly path: string; readonly value: unknown | null }[];
  readonly actualRowsByPath: Readonly<Record<string, unknown>>;
  readonly writeKind: MaterialCatalogRepairOperationKind;
  readonly removeKind: MaterialCatalogRepairOperationKind;
  readonly rowReason: MaterialCatalogRepairOperation['reason'];
  readonly pathReason: MaterialCatalogRepairOperation['reason'];
}): MaterialCatalogRepairOperation[] => {
  const operations: MaterialCatalogRepairOperation[] = [];
  const expectedByPath = new Map(input.expectedWrites.map((write) => [write.path, write.value]));

  input.expectedWrites.forEach((write) => {
    if (!sameJson(input.actualRowsByPath[write.path], write.value)) {
      operations.push({
        kind: input.writeKind,
        path: write.path,
        value: write.value,
        reason: input.rowReason,
      });
    }
  });

  Object.keys(input.actualRowsByPath).forEach((path) => {
    if (expectedByPath.has(path)) {
      return;
    }

    operations.push({
      kind: input.removeKind,
      path,
      value: null,
      reason: input.pathReason,
    });
  });

  return operations;
};

const planMaterialIndexRepairs = (
  summaries: readonly MaterialCatalogIndexSummary[],
  actualRowsByPath: Readonly<Record<string, unknown>>,
): MaterialCatalogRepairOperation[] =>
  planIndexRepairs({
    expectedWrites: summaries.flatMap(buildMaterialCatalogIndexWrites),
    actualRowsByPath,
    writeKind: 'material-index-write',
    removeKind: 'material-index-remove',
    rowReason: 'stale-material-index-row',
    pathReason: 'stale-material-index-path',
  });

const planBookIndexRepairs = (
  books: readonly MaterialBookMetadata[],
  actualRowsByPath: Readonly<Record<string, unknown>>,
): MaterialCatalogRepairOperation[] =>
  planIndexRepairs({
    expectedWrites: books.flatMap(buildMaterialBookIndexWrites),
    actualRowsByPath,
    writeKind: 'book-index-write',
    removeKind: 'book-index-remove',
    rowReason: 'stale-book-index-row',
    pathReason: 'stale-book-index-path',
  });

type RepairBookNode = MaterialBookNode & {
  readonly pathNodeId: string;
};

const collectOrphanNodeIds = (
  bookId: string,
  nodesById: Readonly<Record<string, RepairBookNode>>,
  bookExists: boolean,
): Set<string> => {
  const orphanIds = new Set<string>();

  if (!bookExists) {
    Object.keys(nodesById).forEach((nodeId) => orphanIds.add(nodeId));
    return orphanIds;
  }

  let changed = true;
  while (changed) {
    changed = false;
    Object.values(nodesById).forEach((node) => {
      const parentId = node.parentNodeId;
      const orphan =
        node.pathNodeId !== node.nodeId ||
        node.bookId !== bookId ||
        Boolean(parentId && (!nodesById[parentId] || orphanIds.has(parentId)));

      if (orphan && !orphanIds.has(node.pathNodeId)) {
        orphanIds.add(node.pathNodeId);
        changed = true;
      }
    });
  }

  return orphanIds;
};

const planBookNodeRepairs = (
  books: readonly MaterialBookMetadata[],
  bookNodesByBookId: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): MaterialCatalogRepairOperation[] => {
  const bookIds = new Set(books.map((book) => String(book.bookId)));

  return Object.entries(bookNodesByBookId).flatMap(([bookId, rawNodes]) => {
    const nodesById = Object.fromEntries(
      Object.entries(rawNodes)
        .filter((entry): entry is [string, MaterialBookNode] => isBookNode(entry[1]))
        .map(([pathNodeId, node]) => [pathNodeId, { ...node, pathNodeId }]),
    );
    const orphanIds = collectOrphanNodeIds(bookId, nodesById, bookIds.has(bookId));

    return [...orphanIds].sort().map((nodeId): MaterialCatalogRepairOperation => ({
      kind: 'book-node-remove',
      path: materialCatalogPaths.bookNodes(bookId, nodeId),
      value: null,
      reason: 'orphan-book-node',
    }));
  });
};

const buildCompositionVersionValue = (
  composition: ReadingV2FullTestComposition,
): Record<string, unknown> => ({
  ...composition,
  publishedAt: composition.updatedAt,
  publishedBy: composition.ownerId,
});

const planCompositionVersionRepairs = (
  compositionsById: Readonly<Record<string, unknown>>,
  versionsByPath: Readonly<Record<string, unknown>>,
): MaterialCatalogRepairOperation[] =>
  Object.values(compositionsById)
    .filter(isReadingV2FullTestComposition)
    .flatMap((composition) => {
      const path = readingV2StoragePaths.fullTestCompositionVersions(
        composition.compositionId,
        composition.publishedVersionId,
      );

      if (versionsByPath[path] !== undefined && versionsByPath[path] !== null) {
        return [];
      }

      return [{
        kind: 'composition-version-write',
        path,
        value: buildCompositionVersionValue(composition),
        reason: 'composition-without-version',
      } satisfies MaterialCatalogRepairOperation];
    });

export const planMaterialCatalogRepairOperations = (
  input: PlanMaterialCatalogRepairOperationsInput,
): MaterialCatalogRepairOperation[] => [
  ...planMaterialIndexRepairs(input.materialSummaries ?? [], input.materialIndexRowsByPath ?? {}),
  ...planBookIndexRepairs(input.books ?? [], input.bookIndexRowsByPath ?? {}),
  ...planBookNodeRepairs(input.books ?? [], input.bookNodesByBookId ?? {}),
  ...planCompositionVersionRepairs(
    input.readingV2FullTestCompositions ?? {},
    input.readingV2FullTestCompositionVersionsByPath ?? {},
  ),
];

export const createMaterialCatalogRepairWritePlan = (input: {
  readonly operations: readonly MaterialCatalogRepairOperation[];
  readonly approvedBy?: string;
}): MaterialCatalogRepairWrite[] => {
  const approvedBy = input.approvedBy?.trim();
  if (!approvedBy) {
    throw new Error('Material Catalog repair mutation requires --write and --approved <approval-id>.');
  }

  return input.operations.map((operation) => ({
    ...operation,
    approvedBy,
  }));
};

export const buildMaterialCatalogRepairUpdatePayload = (
  writes: readonly MaterialCatalogRepairWrite[],
): Record<string, unknown | null> =>
  Object.fromEntries(writes.map((write) => [
    write.path,
    write.value === null ? null : omitUndefinedForFirebase(write.value),
  ]));
