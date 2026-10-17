import type {
  ContentCatalogSafeCapabilities,
  ContentCatalogSafeReadiness,
  MaterialBookPublicProjection,
} from '../../types/materialCatalog.types';
import type { MaterialBooksRepository } from './materialBooks.service';
import type {
  ContentCatalogBookRecord,
  ContentCatalogRepository,
} from './contentCatalog.service';

export interface ContentCatalogReadiness {
  readonly publication: ContentCatalogSafeReadiness['publication'];
  readonly source: ContentCatalogSafeReadiness['source'];
  readonly capabilities: ContentCatalogSafeCapabilities;
}

const structuralKinds = new Set(['section', 'chapter', 'unit']);

const toCatalogRecord = (
  projection: MaterialBookPublicProjection,
  readiness: ContentCatalogReadiness,
): ContentCatalogBookRecord => {
  const structuralIds = new Set(projection.nodes
    .filter((node) => structuralKinds.has(node.type))
    .map((node) => node.nodeId));
  const nodes = projection.nodes
    .filter((node) => structuralKinds.has(node.type))
    .map((node) => ({
      nodeId: node.nodeId,
      parentNodeId: node.parentNodeId && structuralIds.has(node.parentNodeId)
        ? node.parentNodeId
        : null,
      kind: node.type as 'section' | 'chapter' | 'unit',
      title: node.title,
      order: node.order,
      activities: node.materialRefs.map((ref) => ({
        placementId: ref.refId,
        activityId: ref.materialId,
        activityVersionId: ref.snapshotVersionId,
        title: ref.title,
        order: ref.order,
      })),
    }));

  return {
    bookId: projection.bookId,
    title: projection.title,
    publicTree: nodes.length > 0,
    publication: readiness.publication,
    source: readiness.source,
    capabilities: { ...readiness.capabilities },
    nodes,
  };
};

export const createMaterialBooksContentCatalogRepository = (input: {
  readonly books: MaterialBooksRepository;
  readonly resolveReadiness: (
    bookId: string,
    actorId: string,
  ) => Promise<ContentCatalogReadiness>;
  readonly resolveEntitlement: (
    bookId: string,
    actorId: string,
  ) => Promise<ContentCatalogSafeReadiness['entitlement']>;
}): ContentCatalogRepository => {
  const read = async (
    bookId: string,
    actorId: string,
  ): Promise<ContentCatalogBookRecord | null> => {
    const projection = await input.books.readPublicBookProjection?.(bookId);
    if (!projection) return null;
    return toCatalogRecord(projection, await input.resolveReadiness(bookId, actorId));
  };

  return {
    async listPublicBooks(actorId) {
      const summaries = await input.books.listBookSummaries({
        teacherId: actorId,
        scope: 'public',
      });
      const records = await Promise.all(summaries
        .filter((summary) => summary.materialKind === 'book')
        .map((summary) => read(summary.materialId, actorId)));
      return records.filter((record): record is ContentCatalogBookRecord => record !== null);
    },
    readPublicBook: read,
    resolveEntitlement: input.resolveEntitlement,
  };
};
