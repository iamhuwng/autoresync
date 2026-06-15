import type { MaterialBookMetadata, MaterialBookNode } from '../../types/materialCatalog.types';
import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import {
  applyReadingV2SelectedReferenceUpdates,
  findReadingV2ReferenceUpdateTargets,
  type ReadingV2ReferenceUpdateBook,
  type ReadingV2ReferenceUpdateBookNode,
  type ReadingV2ReferenceUpdateResult,
  type ReadingV2ReferenceUpdateSummary,
} from './readingV2ReferenceUpdate.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2ReferenceUpdateRepositoryAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly update: (payload: Record<string, unknown | null>) => Promise<void>;
}

export interface ReadingV2ReferenceUpdateRepository {
  readonly discoverTargets: (input: {
    readonly ownerId: string;
    readonly passageMaterialId: string;
    readonly previousSnapshotVersionId: string;
    readonly nextSnapshotVersionId: string;
    readonly frozenAssignmentCount?: number;
    readonly resultSnapshotCount?: number;
  }) => Promise<ReadingV2ReferenceUpdateSummary>;
  readonly applySelected: (input: {
    readonly summary: ReadingV2ReferenceUpdateSummary;
    readonly selectedTargetIds: readonly string[];
  }) => Promise<ReadingV2ReferenceUpdateResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const values = (value: unknown): unknown[] => (isRecord(value) ? Object.values(value) : []);

const isComposition = (value: unknown): value is ReadingV2FullTestComposition =>
  isRecord(value) &&
  typeof value.compositionId === 'string' &&
  typeof value.ownerId === 'string' &&
  Array.isArray(value.passageRefs);

const isBookMetadata = (value: unknown): value is MaterialBookMetadata =>
  isRecord(value) &&
  typeof value.bookId === 'string' &&
  typeof value.ownerId === 'string' &&
  typeof value.title === 'string';

const isBookNode = (value: unknown): value is MaterialBookNode =>
  isRecord(value) &&
  typeof value.nodeId === 'string' &&
  typeof value.bookId === 'string' &&
  Array.isArray(value.materialRefs);

const listOwnedCompositions = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
): Promise<ReadingV2FullTestComposition[]> => {
  const raw = await adapter.read('reading_v2/full_test_compositions');
  return values(raw).filter(isComposition).filter((composition) => composition.ownerId === ownerId);
};

const listOwnedBooks = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
): Promise<ReadingV2ReferenceUpdateBook[]> => {
  const rawBooks = await adapter.read(`material_catalog/book_indexes/by_owner/${ownerId}`);
  const indexedBooks = values(rawBooks).filter(isBookMetadata);

  return Promise.all(
    indexedBooks.map(async (book) => ({
      bookId: book.bookId,
      title: book.title,
      ownerId: book.ownerId,
      nodes: values(await adapter.read(`material_catalog/book_nodes/${book.bookId}`))
        .filter(isBookNode) as unknown as ReadingV2ReferenceUpdateBookNode[],
    })),
  );
};

const loadScope = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
) => {
  const [masters, books] = await Promise.all([
    listOwnedCompositions(adapter, ownerId),
    listOwnedBooks(adapter, ownerId),
  ]);

  return { masters, books };
};

export const createReadingV2ReferenceUpdateRepository = (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
): ReadingV2ReferenceUpdateRepository => ({
  async discoverTargets(input) {
    const { masters, books } = await loadScope(adapter, input.ownerId);
    return findReadingV2ReferenceUpdateTargets({
      ...input,
      masters,
      books,
    });
  },

  async applySelected(input) {
    const { masters, books } = await loadScope(adapter, input.summary.targets[0]?.ownerId ?? '');
    const result = applyReadingV2SelectedReferenceUpdates({
      ...input,
      masters,
      books,
    });
    const updates: Record<string, unknown | null> = {};

    result.updatedMasters.forEach((master) => {
      updates[readingV2StoragePaths.fullTestCompositions(master.compositionId)] = master;
    });
    result.updatedBooks.forEach((book) => {
      book.nodes.forEach((node) => {
        const nodeId = node.nodeId ?? node.id;
        if (nodeId) {
          updates[`material_catalog/book_nodes/${book.bookId}/${nodeId}`] = node;
        }
      });
    });

    if (Object.keys(updates).length > 0) {
      await adapter.update(updates);
    }

    return result;
  },
});
