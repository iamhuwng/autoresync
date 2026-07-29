import type {
  ContentCatalogPublicState,
  ContentCatalogResolvedSelection,
  ContentCatalogSafeCapabilities,
  ContentCatalogSafeReadiness,
  ContentCatalogSelection,
} from '../../types/materialCatalog.types';
import type { BookContextAdapterRegistry } from '../book-delivery/bookContextAdapter.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

export interface ContentCatalogActivityRecord {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly title: string;
  readonly order: number;
}

export interface ContentCatalogNodeRecord {
  readonly nodeId: string;
  readonly parentNodeId: string | null;
  readonly kind: 'section' | 'chapter' | 'unit';
  readonly title: string;
  readonly order: number;
  readonly activities: readonly ContentCatalogActivityRecord[];
}

export interface ContentCatalogBookRecord {
  readonly bookId: string;
  readonly title: string;
  readonly publicTree: boolean;
  readonly publication: ContentCatalogSafeReadiness['publication'];
  readonly source: ContentCatalogSafeReadiness['source'];
  readonly capabilities: ContentCatalogSafeCapabilities;
  readonly nodes: readonly ContentCatalogNodeRecord[];
}

export interface ContentCatalogRepository {
  readonly listPublicBooks: (actorId: string) => Promise<readonly ContentCatalogBookRecord[]>;
  readonly readPublicBook: (
    bookId: string,
    actorId: string,
  ) => Promise<ContentCatalogBookRecord | null>;
  readonly resolveEntitlement: (
    bookId: string,
    actorId: string,
  ) => Promise<ContentCatalogSafeReadiness['entitlement']>;
}

export interface ContentCatalog {
  readonly browseChildren: (
    container: ContentCatalogSelection,
    context: ContentCatalogRequestContext,
  ) => Promise<readonly ContentCatalogResolvedSelection[]>;
  readonly resolveSelection: (
    selection: ContentCatalogSelection,
    context: ContentCatalogRequestContext,
  ) => Promise<ContentCatalogResolvedSelection>;
}

export interface ContentCatalogRequestContext {
  readonly actorId: string;
  readonly intent?: 'browse' | 'preview' | 'launch';
}

export class ContentCatalogError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ContentCatalogError';
  }
}

const requireId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ContentCatalogError(`invalid_${label}`);
  }
  return value;
};

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentCatalogError('invalid_selection');
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new ContentCatalogError('invalid_selection');
  }
  return record;
};

const parseSelection = (value: ContentCatalogSelection): ContentCatalogSelection => {
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'catalog') {
    exact(value, ['kind']);
    return { kind };
  }
  if (kind === 'book') {
    const input = exact(value, ['kind', 'bookId']);
    return { kind, bookId: requireId(input.bookId, 'book_id') };
  }
  if (kind === 'section' || kind === 'chapter' || kind === 'unit') {
    const input = exact(value, ['kind', 'bookId', 'nodeId']);
    return {
      kind,
      bookId: requireId(input.bookId, 'book_id'),
      nodeId: requireId(input.nodeId, 'node_id'),
    };
  }
  if (kind === 'activity') {
    const input = exact(value, [
      'kind', 'bookId', 'nodeId', 'placementId', 'activityId', 'activityVersionId',
    ]);
    return {
      kind,
      bookId: requireId(input.bookId, 'book_id'),
      nodeId: requireId(input.nodeId, 'node_id'),
      placementId: requireId(input.placementId, 'placement_id'),
      activityId: requireId(input.activityId, 'activity_id'),
      activityVersionId: requireId(input.activityVersionId, 'activity_version_id'),
    };
  }
  throw new ContentCatalogError('invalid_selection');
};

const publicState = (
  record: ContentCatalogBookRecord,
  entitlement: ContentCatalogSafeReadiness['entitlement'],
): ContentCatalogPublicState => {
  if (!record.publicTree) return 'metadata-only';
  if (record.publication === 'trusted'
    && record.source === 'ready'
    && entitlement === 'active'
    && record.capabilities.preview
    && record.capabilities.launch) {
    return 'playable';
  }
  return 'tree-public-runtime-blocked';
};

const sorted = <T extends { readonly order: number }>(values: readonly T[]): T[] =>
  [...values].sort((left, right) => left.order - right.order);

const requireTitle = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new ContentCatalogError('invalid_catalog_record');
  }
  return value;
};

const requireOrder = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ContentCatalogError('invalid_catalog_record');
  }
  return value as number;
};

const validateBookRecord = (record: ContentCatalogBookRecord): ContentCatalogBookRecord => {
  requireId(record.bookId, 'book_id');
  requireTitle(record.title);
  if (typeof record.publicTree !== 'boolean'
    || !['trusted', 'untrusted', 'revoked', 'replaced'].includes(record.publication)
    || !['ready', 'blocked', 'revoked', 'replaced'].includes(record.source)
    || typeof record.capabilities?.preview !== 'boolean'
    || typeof record.capabilities?.launch !== 'boolean'
    || typeof record.capabilities?.sourceAssisted !== 'boolean'
    || !Array.isArray(record.nodes)) {
    throw new ContentCatalogError('invalid_catalog_record');
  }

  const byId = new Map<string, ContentCatalogNodeRecord>();
  for (const node of record.nodes) {
    requireId(node.nodeId, 'node_id');
    if (byId.has(node.nodeId)
      || (node.parentNodeId !== null && !ID.test(node.parentNodeId))
      || !['section', 'chapter', 'unit'].includes(node.kind)
      || !Array.isArray(node.activities)) {
      throw new ContentCatalogError('invalid_catalog_record');
    }
    requireTitle(node.title);
    requireOrder(node.order);
    byId.set(node.nodeId, node);
  }

  for (const node of record.nodes) {
    if (node.parentNodeId !== null && !byId.has(node.parentNodeId)) {
      throw new ContentCatalogError('invalid_catalog_record');
    }
    const placementIds = new Set<string>();
    for (const activity of node.activities) {
      requireId(activity.placementId, 'placement_id');
      requireId(activity.activityId, 'activity_id');
      requireId(activity.activityVersionId, 'activity_version_id');
      requireTitle(activity.title);
      requireOrder(activity.order);
      if (placementIds.has(activity.placementId)) {
        throw new ContentCatalogError('invalid_catalog_record');
      }
      placementIds.add(activity.placementId);
    }
  }
  return record;
};

const freezeSelection = <T extends ContentCatalogSelection>(value: T): T =>
  Object.freeze({ ...value });

export const createContentCatalog = (input: {
  readonly repository: ContentCatalogRepository;
  readonly adapterRegistry: BookContextAdapterRegistry;
  readonly adapterId: string;
}): ContentCatalog => {
  const declaration = input.adapterRegistry.get(requireId(input.adapterId, 'adapter_id'));
  if (!declaration
    || declaration.contextKind !== 'public-reference'
    || declaration.conformance.status !== 'verified'
    || declaration.sourceReplacement.mode !== 'invalidation-only'
    || declaration.sourceReplacement.automaticUpdate !== false
    || !declaration.classification.supportedEffects.includes('invalidation')
    || !declaration.classification.supportedEffects.includes('successor')) {
    throw new ContentCatalogError('public_reference_adapter_unavailable');
  }

  const resolveBook = async (
    bookId: string,
    actorId: string,
  ): Promise<{
    record: ContentCatalogBookRecord;
    entitlement: ContentCatalogSafeReadiness['entitlement'];
  }> => {
    const [record, entitlement] = await Promise.all([
      input.repository.readPublicBook(bookId, actorId),
      input.repository.resolveEntitlement(bookId, actorId),
    ]);
    if (!record || record.bookId !== bookId) throw new ContentCatalogError('selection_not_found');
    return { record: validateBookRecord(record), entitlement };
  };

  const project = (
    selection: Exclude<ContentCatalogSelection, { readonly kind: 'catalog' }>,
    title: string,
    parent: ContentCatalogSelection,
    record: ContentCatalogBookRecord,
    entitlement: ContentCatalogSafeReadiness['entitlement'],
  ): ContentCatalogResolvedSelection => Object.freeze({
    selection: freezeSelection(selection),
    title,
    parent: freezeSelection(parent),
    state: publicState(record, entitlement),
    capabilities: Object.freeze({ ...record.capabilities }),
    readiness: Object.freeze({
      publication: record.publication,
      source: record.source,
      entitlement,
    }),
    provenance: Object.freeze({
      adapterId: declaration.adapterId,
      adapterVersion: declaration.adapterVersion,
    }),
  });

  const assertIntent = (
    resolved: ContentCatalogResolvedSelection,
    intent: ContentCatalogRequestContext['intent'],
  ): void => {
    if (intent === 'launch' && resolved.state !== 'playable') {
      throw new ContentCatalogError('launch_not_authorized');
    }
    if (intent === 'preview' && (!resolved.capabilities.preview
      || (resolved.capabilities.sourceAssisted
        && resolved.state !== 'playable'))) {
      throw new ContentCatalogError('preview_not_authorized');
    }
  };

  const resolveSelection = async (
    rawSelection: ContentCatalogSelection,
    context: ContentCatalogRequestContext,
  ): Promise<ContentCatalogResolvedSelection> => {
    const actorId = requireId(context.actorId, 'actor_id');
    const selection = parseSelection(rawSelection);
    if (selection.kind === 'catalog') throw new ContentCatalogError('catalog_is_not_selection');
    const { record, entitlement } = await resolveBook(selection.bookId, actorId);

    let resolved: ContentCatalogResolvedSelection;
    if (selection.kind === 'book') {
      resolved = project(selection, record.title, { kind: 'catalog' }, record, entitlement);
    } else {
      const node = record.nodes.find((entry) => entry.nodeId === selection.nodeId);
      if (!node) throw new ContentCatalogError('selection_not_found');
      if (selection.kind !== 'activity') {
        if (node.kind !== selection.kind) throw new ContentCatalogError('selection_kind_mismatch');
        resolved = project(
          selection,
          node.title,
          node.parentNodeId
            ? { kind: record.nodes.find((entry) => entry.nodeId === node.parentNodeId)?.kind ?? 'section',
              bookId: record.bookId,
              nodeId: node.parentNodeId }
            : { kind: 'book', bookId: record.bookId },
          record,
          entitlement,
        );
      } else {
        const activity = node.activities.find((entry) =>
          entry.placementId === selection.placementId
          && entry.activityId === selection.activityId
          && entry.activityVersionId === selection.activityVersionId);
        if (!activity) throw new ContentCatalogError('selection_not_found');
        resolved = project(
          selection,
          activity.title,
          { kind: node.kind, bookId: record.bookId, nodeId: node.nodeId },
          record,
          entitlement,
        );
      }
    }
    assertIntent(resolved, context.intent ?? 'browse');
    return resolved;
  };

  const browseChildren = async (
    rawContainer: ContentCatalogSelection,
    context: ContentCatalogRequestContext,
  ): Promise<readonly ContentCatalogResolvedSelection[]> => {
    const actorId = requireId(context.actorId, 'actor_id');
    const container = parseSelection(rawContainer);
    if (container.kind === 'activity') return [];
    if (container.kind === 'catalog') {
      const books = await input.repository.listPublicBooks(actorId);
      return Promise.all(books.map(async (candidate) => {
        const record = validateBookRecord(candidate);
        const entitlement = await input.repository.resolveEntitlement(record.bookId, actorId);
        return project(
          { kind: 'book', bookId: record.bookId },
          record.title,
          container,
          record,
          entitlement,
        );
      }));
    }

    const { record, entitlement } = await resolveBook(container.bookId, actorId);
    const parentNodeId = container.kind === 'book' ? null : container.nodeId;
    const nodes = sorted(record.nodes.filter((node) => node.parentNodeId === parentNodeId));
    const children: ContentCatalogResolvedSelection[] = nodes.map((node) => project(
      { kind: node.kind, bookId: record.bookId, nodeId: node.nodeId },
      node.title,
      container,
      record,
      entitlement,
    ));
    if (container.kind !== 'book') {
      const node = record.nodes.find((entry) => entry.nodeId === container.nodeId);
      if (!node || node.kind !== container.kind) throw new ContentCatalogError('selection_not_found');
      children.push(...sorted(node.activities).map((activity) => project(
        {
          kind: 'activity',
          bookId: record.bookId,
          nodeId: node.nodeId,
          placementId: activity.placementId,
          activityId: activity.activityId,
          activityVersionId: activity.activityVersionId,
        },
        activity.title,
        container,
        record,
        entitlement,
      )));
    }
    return children;
  };

  return Object.freeze({ browseChildren, resolveSelection });
};
