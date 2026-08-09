import {
  PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
  PUBLIC_BOOK_SELECTION_KINDS,
  type PublicBookActivitySelectionSnapshot,
  type PublicBookCanonicalForkResult,
  type PublicBookCatalogView,
  type PublicBookDocumentIssuer,
  type PublicBookEntitlementSnapshot,
  type PublicBookLegacyReferenceMigrationInput,
  type PublicBookReferenceForkMutationInput,
  type PublicBookReferenceForkResolveInput,
  type PublicBookReferenceForkService,
  type PublicBookReferenceForkServiceOptions,
  type PublicBookReferenceForkStore,
  type PublicBookReferencePlacementRecord,
  type PublicBookReferenceRecord,
  type PublicBookReferenceSource,
  type PublicBookReferenceStatus,
  type PublicBookReferenceMigrationReceipt,
  type PublicBookRuntimePreparation,
  type PublicBookRuntimeState,
  type PublicBookSelectionRequest,
  type PublicBookSelectionSnapshot,
  type PublicBookSourceContextChoice,
} from './publicBookReferenceFork.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const FORK_PATH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_SELECTION_ITEMS = 200;
const MAX_PATH_ITEMS = 32;

export class PublicBookReferenceForkError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly statusCode = 422,
  ) {
    super(message);
    this.name = 'PublicBookReferenceForkError';
  }
}

const defaultNow = (): string => new Date().toISOString();
const defaultCreateId = (kind: string): string => {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '');
  return kind + '-' + (random ?? String(Date.now()) + '-' + Math.random().toString(16).slice(2));
};

const samePath = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const pathWithin = (child: readonly string[], parent: readonly string[]): boolean =>
  child.length >= parent.length && parent.every((value, index) => child[index] === value);

const assertId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new PublicBookReferenceForkError('invalid-id', field + ' is invalid.', 400);
  }
  return value;
};

const assertPath = (value: unknown, field: string): readonly string[] => {
  if (!Array.isArray(value) || value.length > MAX_PATH_ITEMS
    || value.some((part) => typeof part !== 'string' || !SAFE_ID.test(part))) {
    throw new PublicBookReferenceForkError('invalid-selection', field + ' is invalid.', 400);
  }
  return value as string[];
};

const assertSelectionRequest = (selection: PublicBookSelectionRequest): void => {
  assertId(selection.sourceBookId, 'sourceBookId');
  assertId(selection.publicationId, 'publicationId');
  if (!Number.isSafeInteger(selection.publicationRevision) || selection.publicationRevision < 1) {
    throw new PublicBookReferenceForkError('invalid-selection', 'publicationRevision is invalid.', 400);
  }
  if (!PUBLIC_BOOK_SELECTION_KINDS.includes(selection.kind)) {
    throw new PublicBookReferenceForkError('invalid-selection', 'selection kind is invalid.', 400);
  }
  assertPath(selection.selectionPath, 'selectionPath');
  if (!Array.isArray(selection.activities) || selection.activities.length === 0
    || selection.activities.length > MAX_SELECTION_ITEMS) {
    throw new PublicBookReferenceForkError('invalid-selection', 'activities are required.', 400);
  }
  const activityIds = new Set<string>();
  for (const activity of selection.activities) {
    assertId(activity.activityId, 'activityId');
    assertId(activity.activityVersionId, 'activityVersionId');
    if (activityIds.has(activity.activityId)
      || !Number.isSafeInteger(activity.order) || activity.order < 0) {
      throw new PublicBookReferenceForkError('invalid-selection', 'activities are not unique.', 400);
    }
    activityIds.add(activity.activityId);
  }
  if (selection.kind === 'activity' && selection.activities.length !== 1) {
    throw new PublicBookReferenceForkError('invalid-selection', 'activity selection must contain one Activity.', 400);
  }
};

const assertContext = (context: PublicBookSourceContextChoice): void => {
  if (context.mode === 'none') return;
  assertId(context.sourceBookId, 'context.sourceBookId');
  assertId(context.sourceVersionId, 'context.sourceVersionId');
  assertPath(context.selectionPath, 'context.selectionPath');
  if (!Array.isArray(context.pageGroupIds) || context.pageGroupIds.length === 0
    || context.pageGroupIds.some((id) => typeof id !== 'string' || !SAFE_ID.test(id))) {
    throw new PublicBookReferenceForkError('invalid-source-context', 'source context page groups are invalid.', 400);
  }
};

const contextFor = (context: PublicBookSourceContextChoice | undefined): PublicBookSourceContextChoice =>
  context ?? { mode: 'none' };

const assertForkPathId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !FORK_PATH_ID.test(value)) {
    throw new PublicBookReferenceForkError('request-invalid', field + ' is invalid.', 400);
  }
  return value;
};

const assertForkPath = (value: unknown, field: string): readonly string[] => {
  if (!Array.isArray(value) || value.length > MAX_PATH_ITEMS
    || value.some((part) => typeof part !== 'string' || !FORK_PATH_ID.test(part))) {
    throw new PublicBookReferenceForkError('request-invalid', field + ' is invalid.', 400);
  }
  return value as string[];
};

/**
 * Validates only the canonical fork request grammar. This must stay pure: the
 * canonical Worker writer owns receipt-first replay and all source/target
 * authorization reads after this boundary.
 */
export function validatePublicBookCanonicalForkRequest(
  input: PublicBookReferenceForkMutationInput,
): asserts input is PublicBookReferenceForkMutationInput & { readonly operationId: string } {
  assertForkPathId(input.actorId, 'actorId');
  if (typeof input.operationId !== 'string' || !UUID.test(input.operationId)) {
    throw new PublicBookReferenceForkError(
      'invalid-operation-id',
      'Canonical Book Activity forks require a UUID operationId.',
      400,
    );
  }
  if (!input.target || typeof input.target !== 'object') {
    throw new PublicBookReferenceForkError('request-invalid', 'target is invalid.', 400);
  }
  assertForkPathId(input.target.bookId, 'target.bookId');
  assertForkPathId(input.target.nodeId, 'target.nodeId');
  assertForkPathId(input.target.placementId, 'target.placementId');

  const selection = input.selection;
  if (!selection || typeof selection !== 'object' || selection.kind !== 'activity'
    || !Array.isArray(selection.activities) || selection.activities.length !== 1) {
    throw new PublicBookReferenceForkError(
      'invalid-selection',
      'Canonical Book Activity forks require exactly one Activity selection.',
      400,
    );
  }
  assertForkPathId(selection.sourceBookId, 'selection.sourceBookId');
  assertForkPathId(selection.publicationId, 'selection.publicationId');
  if (!Number.isSafeInteger(selection.publicationRevision) || selection.publicationRevision < 1) {
    throw new PublicBookReferenceForkError('invalid-selection', 'selection.publicationRevision is invalid.', 400);
  }
  assertForkPath(selection.selectionPath, 'selection.selectionPath');
  const activity = selection.activities[0];
  if (!activity || typeof activity !== 'object') {
    throw new PublicBookReferenceForkError('invalid-selection', 'selection Activity is invalid.', 400);
  }
  assertForkPathId(activity.activityId, 'selection.activityId');
  assertForkPathId(activity.activityVersionId, 'selection.activityVersionId');
  if (!Number.isSafeInteger(activity.order) || activity.order < 0) {
    throw new PublicBookReferenceForkError('invalid-selection', 'selection.order is invalid.', 400);
  }

  if (input.context !== undefined && (input.context === null || typeof input.context !== 'object')) {
    throw new PublicBookReferenceForkError('request-invalid', 'context is invalid.', 400);
  }
  const context = contextFor(input.context);
  if (context.mode === 'none') return;
  if (context.mode !== 'book-source-reference') {
    throw new PublicBookReferenceForkError('request-invalid', 'context.mode is invalid.', 400);
  }
  assertForkPathId(context.sourceBookId, 'context.sourceBookId');
  assertForkPathId(context.sourceVersionId, 'context.sourceVersionId');
  assertForkPath(context.selectionPath, 'context.selectionPath');
  if (!Array.isArray(context.pageGroupIds) || context.pageGroupIds.length === 0
    || context.pageGroupIds.some((id) => typeof id !== 'string' || !FORK_PATH_ID.test(id))) {
    throw new PublicBookReferenceForkError('request-invalid', 'context.pageGroupIds is invalid.', 400);
  }
};

const sourceIsReady = (source: PublicBookSelectionSnapshot): boolean =>
  source.source.lifecycleState === 'ready'
  && source.source.studentSafeStatus === 'ready'
  && source.source.documentDeliveryStatus === 'ready';

const publicationIsTrusted = (source: PublicBookSelectionSnapshot): boolean =>
  source.publication.status === 'trusted';

const selectedActivities = (
  source: PublicBookSelectionSnapshot,
  selection: PublicBookSelectionRequest,
): readonly PublicBookActivitySelectionSnapshot[] => {
  const byId = new Map(source.activities.map((activity) => [activity.activityId, activity]));
  return selection.activities.map((requested) => {
    const activity = byId.get(requested.activityId);
    if (!activity
      || activity.versionId !== requested.activityVersionId
      || activity.order !== requested.order
      || !pathWithin(activity.selectionPath, selection.selectionPath)) {
      throw new PublicBookReferenceForkError(
        'selection-version-mismatch',
        'The selected Book version is no longer available.',
        409,
      );
    }
    return activity;
  });
};

const validateSourceContext = (
  source: PublicBookSelectionSnapshot,
  activities: readonly PublicBookActivitySelectionSnapshot[],
  context: PublicBookSourceContextChoice,
): void => {
  assertContext(context);
  const requiresBookContext = activities.some(
    (activity) => activity.projection.contextRequirement.mode === 'required',
  );
  if (requiresBookContext && context.mode === 'none') {
    throw new PublicBookReferenceForkError(
      'source-context-required',
      'The selected Activity requires accepted Book source context.',
      422,
    );
  }
  if (context.mode === 'book-source-reference') {
    const allAcceptBookPages = activities.every((activity) => {
      const requirement = activity.projection.contextRequirement;
      return requirement.mode !== 'none' && requirement.acceptedKinds.includes('book-pages');
    });
    if (context.sourceBookId !== source.bookId
      || context.sourceVersionId !== source.source.sourceVersionId
      || !pathWithin(context.selectionPath, activities[0]?.selectionPath ?? [])
      || !allAcceptBookPages
      || !sourceIsReady(source)) {
      throw new PublicBookReferenceForkError(
        'source-context-invalid',
        'The selected source context is not an authorized student-safe source.',
        403,
      );
    }
  }
};

const entitlementMatches = (
  entitlement: PublicBookEntitlementSnapshot | null,
  input: {
    readonly actorId: string;
    readonly source: PublicBookSelectionSnapshot;
    readonly selection: PublicBookSelectionRequest;
  },
): entitlement is PublicBookEntitlementSnapshot =>
  entitlement !== null
  && entitlement.status === 'active'
  && entitlement.studentId === input.actorId
  && entitlement.bookId === input.source.bookId
  && entitlement.sourceVersionId === input.source.source.sourceVersionId
  && entitlement.publicationId === input.source.publication.publicationId
  && entitlement.publicationRevision === input.source.publication.revision
  && (entitlement.authorizedSelectionPaths === undefined
    || entitlement.authorizedSelectionPaths.some((path) => samePath(path, input.selection.selectionPath)));

const publicStateFor = (input: {
  readonly source: PublicBookSelectionSnapshot;
  readonly activities: readonly PublicBookActivitySelectionSnapshot[];
  readonly entitlement: PublicBookEntitlementSnapshot | null;
  readonly actorId: string;
  readonly selection: PublicBookSelectionRequest;
  readonly context: PublicBookSourceContextChoice;
}): PublicBookRuntimeState => {
  if (!input.source.publicTree) return 'metadata-only';
  if (!publicationIsTrusted(input.source)) return 'tree-public-runtime-blocked';
  if (!sourceIsReady(input.source)) return 'tree-public-runtime-blocked';
  if (!entitlementMatches(input.entitlement, input)) return 'tree-public-runtime-blocked';
  try {
    validateSourceContext(input.source, input.activities, input.context);
  } catch {
    return 'tree-public-runtime-blocked';
  }
  return 'playable';
};

const sourceFor = async (
  store: PublicBookReferenceForkStore,
  selection: PublicBookSelectionRequest,
): Promise<PublicBookSelectionSnapshot> => {
  const source = await store.readPublicBook(selection.sourceBookId);
  if (!source) {
    throw new PublicBookReferenceForkError('source-not-found', 'Public Book was not found.', 404);
  }
  if (source.bookId !== selection.sourceBookId
    || source.publication.publicationId !== selection.publicationId
    || source.publication.revision !== selection.publicationRevision) {
    throw new PublicBookReferenceForkError(
      'selection-version-mismatch',
      'The selected Book publication is stale.',
      409,
    );
  }
  return source;
};

const requirePublicSource = (source: PublicBookSelectionSnapshot): void => {
  if (!source.publicTree) {
    throw new PublicBookReferenceForkError('source-tree-unavailable', 'The Book tree is not public.', 403);
  }
  if (!publicationIsTrusted(source)) {
    throw new PublicBookReferenceForkError('publication-untrusted', 'The Book publication is not trusted.', 403);
  }
};

const requireTargetOwner = async (
  store: PublicBookReferenceForkStore,
  actorId: string,
  targetBookId: string,
): Promise<void> => {
  const target = await store.readTargetBook(targetBookId);
  if (!target || target.bookId !== targetBookId || target.ownerId !== actorId || target.status === 'archived') {
    throw new PublicBookReferenceForkError('target-owner-denied', 'Only the target Book owner may change this placement.', 403);
  }
};

const sourceIdentityFor = (
  source: PublicBookSelectionSnapshot,
  selection: PublicBookSelectionRequest,
): PublicBookReferenceSource => ({
  bookId: source.bookId,
  publicationId: source.publication.publicationId,
  publicationRevision: source.publication.revision,
  selectionKind: selection.kind,
  selectionPath: [...selection.selectionPath],
  activities: selection.activities.map((activity) => ({
    activityId: activity.activityId,
    activityVersionId: activity.activityVersionId,
    order: activity.order,
  })),
  sourceVersionId: source.source.sourceVersionId,
});

const assertIssuedDocument = (
  issuer: PublicBookDocumentIssuer,
  document: Awaited<ReturnType<PublicBookDocumentIssuer['issue']>>,
): void => {
  if (!document || typeof document.resourcePath !== 'string'
    || !document.resourcePath.startsWith('/v1/book-delivery/documents/')
    || /(?:objectKey|private|r2|gs:\/\/|https?:\/\/|\.pdf)/iu.test(document.resourcePath)
    || typeof document.expiresAt !== 'string'
    || document.contentType !== 'application/pdf'
    || !Number.isSafeInteger(document.byteSize)
    || document.byteSize <= 0
    || !issuer) {
    throw new PublicBookReferenceForkError('document-authority-invalid', 'Document authority was not opaque.', 503);
  }
};

const referenceStatusFor = (
  reference: PublicBookReferenceRecord,
  current: PublicBookSelectionSnapshot | null,
): PublicBookReferenceStatus => {
  if (!current) return 'revoked';
  if (current.publication.status === 'revoked') return 'revoked';
  if (current.publication.status === 'replaced' || current.source.lifecycleState === 'replaced') return 'replaced';
  if (current.publication.publicationId !== reference.source.publicationId) return 'adoption-required';
  if (current.publication.revision > reference.source.publicationRevision) return 'newer-version-available';
  const currentVersions = new Map(current.activities.map((activity) => [activity.activityId, activity.versionId]));
  if (reference.source.activities.some((activity) => currentVersions.get(activity.activityId) !== activity.activityVersionId)) {
    return 'newer-version-available';
  }
  return 'current';
};

const publicCatalogView = (
  source: PublicBookSelectionSnapshot,
  publicState: PublicBookRuntimeState,
): PublicBookCatalogView => ({
  bookId: source.bookId,
  title: source.title,
  publicState,
  publicationStatus: source.publication.status,
  sourceReadiness: source.source.lifecycleState,
  nodes: source.nodes.map((node) => ({ ...node, selectionPath: [...node.selectionPath] })),
  activities: source.activities.map((activity) => ({
    activityId: activity.activityId,
    versionId: activity.versionId,
    title: activity.title,
    order: activity.order,
    selectionPath: [...activity.selectionPath],
  })),
  newerVersionAvailable: false,
});

export const evaluatePublicBookReferenceStatus = referenceStatusFor;

export const createPublicBookReferenceForkService = (
  options: PublicBookReferenceForkServiceOptions,
): PublicBookReferenceForkService => {
  const now = options.now ?? defaultNow;
  const createId = options.createId ?? defaultCreateId;
  const mutationsEnabled = options.mutationsEnabled === true;
  const rollbackEnabled = options.rollbackEnabled === true;
  const canonicalForkEnabled = options.canonicalForkEnabled === true;
  const canonicalForkMutationsEnabled = options.canonicalForkMutationsEnabled === true;
  const canonicalForkWriter = options.canonicalForkWriter;

  const loadSelection = async (selection: PublicBookSelectionRequest) => {
    assertSelectionRequest(selection);
    const source = await sourceFor(options.store, selection);
    const activities = source.publicTree ? selectedActivities(source, selection) : [];
    return { source, activities };
  };

  const entitlementFor = async (
    actorId: string,
    entitlementId: string | undefined,
  ): Promise<PublicBookEntitlementSnapshot | null> => {
    assertId(actorId, 'actorId');
    if (entitlementId === undefined) return null;
    assertId(entitlementId, 'entitlementId');
    return options.store.readEntitlement({ studentId: actorId, entitlementId });
  };

  const resolveProjection = async (
    input: PublicBookReferenceForkResolveInput,
  ): Promise<{
    readonly source: PublicBookSelectionSnapshot;
    readonly activities: readonly PublicBookActivitySelectionSnapshot[];
    readonly entitlement: PublicBookEntitlementSnapshot | null;
    readonly context: PublicBookSourceContextChoice;
    readonly publicState: PublicBookRuntimeState;
  }> => {
    assertId(input.actorId, 'actorId');
    const { source, activities } = await loadSelection(input.selection);
    const context = contextFor(input.context);
    const entitlement = await entitlementFor(input.actorId, input.entitlementId);
    const publicState = publicStateFor({
      source,
      activities,
      entitlement,
      actorId: input.actorId,
      selection: input.selection,
      context,
    });
    return { source, activities, entitlement, context, publicState };
  };

  const requireMutationGate = (enabled: boolean, message: string): void => {
    if (!enabled) {
      throw new PublicBookReferenceForkError(
        'feature-disabled',
        message,
        503,
      );
    }
    if (rollbackEnabled) {
      throw new PublicBookReferenceForkError(
        'feature-rollback',
        'Public Book reference/fork writes are blocked by deny-only rollback.',
        503,
      );
    }
  };

  const requireMutationEnabled = (): void => {
    requireMutationGate(mutationsEnabled, 'Public Book reference/fork mutations are disabled.');
  };

  const requireCanonicalForkMutationEnabled = (): void => {
    requireMutationGate(canonicalForkMutationsEnabled, 'Public Book canonical forks are disabled.');
  };

  const requireMutationInputs = async (
    input: PublicBookReferenceForkMutationInput,
    requireEnabled: () => void = requireMutationEnabled,
  ) => {
    requireEnabled();
    assertId(input.actorId, 'actorId');
    assertId(input.target.bookId, 'target.bookId');
    assertId(input.target.nodeId, 'target.nodeId');
    assertId(input.target.placementId, 'target.placementId');
    await requireTargetOwner(options.store, input.actorId, input.target.bookId);
    const { source, activities } = await loadSelection(input.selection);
    requirePublicSource(source);
    if (activities.length === 0) {
      throw new PublicBookReferenceForkError('selection-unavailable', 'The selected public Book content is unavailable.', 403);
    }
    const context = contextFor(input.context);
    validateSourceContext(source, activities, context);
    return { source, activities, context };
  };

  const reference = async (
    input: PublicBookReferenceForkMutationInput,
  ): Promise<PublicBookReferenceRecord> => {
    const { source } = await requireMutationInputs(input);
    const context = contextFor(input.context);
    const timestamp = now();
    const referenceId = createId('public-reference');
    const reference: PublicBookReferenceRecord = {
      schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
      recordKind: 'public-book-reference',
      referenceId,
      revision: 1,
      operation: 'create',
      origin: 'direct',
      target: { ...input.target },
      source: sourceIdentityFor(source, input.selection),
      context,
      status: 'current',
      createdAt: timestamp,
      createdBy: input.actorId,
    };
    const placement: PublicBookReferencePlacementRecord = {
      schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
      placementKind: 'public-book-reference',
      target: { ...input.target },
      materialId: referenceId,
      materialKind: 'book-reference',
      snapshotVersionId: source.publication.publicationId + ':' + source.publication.revision,
      order: input.selection.activities[0]?.order ?? 0,
      referenceId,
      createdAt: timestamp,
      createdBy: input.actorId,
    };
    await options.store.writeReferenceMutation({
      operationId: input.operationId ?? createId('reference-operation'),
      reference,
      placement,
    });
    return reference;
  };

  const migrateLegacyReference = async (
    input: PublicBookLegacyReferenceMigrationInput,
  ): Promise<{
    readonly reference: PublicBookReferenceRecord;
    readonly receipt: PublicBookReferenceMigrationReceipt;
  }> => {
    requireMutationEnabled();
    if (Object.prototype.hasOwnProperty.call(input as unknown as Record<string, unknown>, 'materialId')) {
      throw new PublicBookReferenceForkError(
        'legacy-material-id-forbidden',
        'Legacy migration requires a reference identity, not a bare material ID.',
        400,
      );
    }
    assertId(input.actorId, 'actorId');
    assertId(input.operationId, 'operationId');
    assertId(input.legacyReferenceId, 'legacyReferenceId');
    if (Number.isNaN(Date.parse(input.migratedAt)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(input.migratedAt)) {
      throw new PublicBookReferenceForkError('migration-timestamp-invalid', 'Migration timestamp is invalid.', 400);
    }
    const { source } = await requireMutationInputs({
      actorId: input.actorId,
      target: input.target,
      selection: input.selection,
      context: input.context,
      operationId: input.operationId,
    });
    const context = contextFor(input.context);
    const referenceId = createId('public-reference');
    const reference: PublicBookReferenceRecord = {
      schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
      recordKind: 'public-book-reference',
      referenceId,
      revision: 1,
      operation: 'create',
      origin: 'legacy-migration',
      target: { ...input.target },
      source: sourceIdentityFor(source, input.selection),
      context,
      status: 'current',
      createdAt: input.migratedAt,
      createdBy: input.actorId,
      legacyReferenceId: input.legacyReferenceId,
    };
    await options.store.writeReferenceMutation({
      operationId: input.operationId,
      reference,
      placement: {
        schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
        placementKind: 'public-book-reference',
        target: { ...input.target },
        materialId: referenceId,
        materialKind: 'book-reference',
        snapshotVersionId: source.publication.publicationId + ':' + source.publication.revision,
        order: input.selection.activities[0]?.order ?? 0,
        referenceId,
        createdAt: input.migratedAt,
        createdBy: input.actorId,
      },
    });
    return {
      reference,
      receipt: {
        schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
        operationId: input.operationId,
        legacyReferenceId: input.legacyReferenceId,
        referenceId,
        revision: 1,
        migratedAt: input.migratedAt,
        mode: 'explicit-public-book-reference',
      },
    };
  };

  const fork = async (
    input: PublicBookReferenceForkMutationInput,
  ): Promise<PublicBookCanonicalForkResult> => {
    if (!canonicalForkEnabled || !canonicalForkWriter) {
      // This must precede all input/source/target/store work. The canonical
      // writer gate is deliberately independent from compatibility mutations.
      throw new PublicBookReferenceForkError(
        'fork-disabled',
        'Public Book Activity forks are disabled pending the canonical writer gate.',
        503,
      );
    }
    requireCanonicalForkMutationEnabled();
    validatePublicBookCanonicalForkRequest(input);
    const context = contextFor(input.context);
    return canonicalForkWriter.fork({
      actorId: input.actorId,
      operationId: input.operationId,
      target: { ...input.target },
      selection: {
        ...input.selection,
        selectionPath: [...input.selection.selectionPath],
        activities: input.selection.activities.map((activity) => ({ ...activity })),
      },
      context,
    });
  };

  const readReferenceForOwner = async (
    actorId: string,
    referenceId: string,
  ): Promise<PublicBookReferenceRecord> => {
    assertId(actorId, 'actorId');
    assertId(referenceId, 'referenceId');
    const current = await options.store.readCurrentReference(referenceId);
    if (!current) throw new PublicBookReferenceForkError('reference-not-found', 'Reference was not found.', 404);
    await requireTargetOwner(options.store, actorId, current.target.bookId);
    return current;
  };

  const adopt = async (input: {
    readonly actorId: string;
    readonly referenceId: string;
    readonly expectedRevision: number;
  }): Promise<PublicBookReferenceRecord> => {
    requireMutationEnabled();
    const current = await readReferenceForOwner(input.actorId, input.referenceId);
    if (current.revision !== input.expectedRevision) {
      throw new PublicBookReferenceForkError('reference-conflict', 'Reference revision is stale.', 409);
    }
    const source = await options.store.readPublicBook(current.source.bookId);
    if (!source) throw new PublicBookReferenceForkError('source-not-found', 'Public Book was not found.', 404);
    requirePublicSource(source);
    const activities = selectedActivities(source, {
      sourceBookId: source.bookId,
      publicationId: source.publication.publicationId,
      publicationRevision: source.publication.revision,
      kind: current.source.selectionKind,
      selectionPath: current.source.selectionPath,
      activities: current.source.activities.map((activity) => ({
        activityId: activity.activityId,
        activityVersionId: source.activities.find((candidate) => candidate.activityId === activity.activityId)?.versionId ?? activity.activityVersionId,
        order: activity.order,
      })),
    });
    const nextContext = current.context.mode === 'book-source-reference'
      ? { ...current.context, sourceVersionId: source.source.sourceVersionId }
      : current.context;
    validateSourceContext(source, activities, nextContext);
    const timestamp = now();
    const next: PublicBookReferenceRecord = {
      ...current,
      revision: current.revision + 1,
      operation: 'adopt',
      source: sourceIdentityFor(source, {
        sourceBookId: source.bookId,
        publicationId: source.publication.publicationId,
        publicationRevision: source.publication.revision,
        kind: current.source.selectionKind,
        selectionPath: current.source.selectionPath,
        activities: activities.map((activity) => ({
          activityId: activity.activityId,
          activityVersionId: activity.versionId,
          order: activity.order,
        })),
      }),
      context: nextContext,
      status: 'current',
      createdAt: timestamp,
      createdBy: input.actorId,
      previousRevision: current.revision,
    };
    await options.store.writeReferenceMutation({
      operationId: createId('adoption-operation'),
      reference: next,
      placement: {
        schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
        placementKind: 'public-book-reference',
        target: { ...next.target },
        materialId: next.referenceId,
        materialKind: 'book-reference',
        snapshotVersionId: source.publication.publicationId + ':' + source.publication.revision,
        order: next.source.activities[0]?.order ?? 0,
        referenceId: next.referenceId,
        createdAt: timestamp,
        createdBy: input.actorId,
      },
    });
    return next;
  };

  const rollback = async (input: {
    readonly actorId: string;
    readonly referenceId: string;
    readonly expectedRevision: number;
  }): Promise<PublicBookReferenceRecord> => {
    requireMutationEnabled();
    const current = await readReferenceForOwner(input.actorId, input.referenceId);
    if (current.revision !== input.expectedRevision) {
      throw new PublicBookReferenceForkError('reference-conflict', 'Reference revision is stale.', 409);
    }
    if (current.revision < 2) {
      throw new PublicBookReferenceForkError('rollback-unavailable', 'Reference has no immutable prior revision.', 422);
    }
    const previous = await options.store.readReferenceRevision(current.referenceId, current.revision - 1);
    if (!previous) {
      throw new PublicBookReferenceForkError('rollback-unavailable', 'Reference history is incomplete.', 422);
    }
    const timestamp = now();
    const next: PublicBookReferenceRecord = {
      ...previous,
      revision: current.revision + 1,
      operation: 'rollback',
      status: 'current',
      createdAt: timestamp,
      createdBy: input.actorId,
      previousRevision: current.revision,
    };
    await options.store.writeReferenceMutation({
      operationId: createId('rollback-operation'),
      reference: next,
      placement: {
        schemaVersion: PUBLIC_BOOK_REFERENCE_FORK_SCHEMA_VERSION,
        placementKind: 'public-book-reference',
        target: { ...next.target },
        materialId: next.referenceId,
        materialKind: 'book-reference',
        snapshotVersionId: next.source.publicationId + ':' + next.source.publicationRevision,
        order: next.source.activities[0]?.order ?? 0,
        referenceId: next.referenceId,
        createdAt: timestamp,
        createdBy: input.actorId,
      },
    });
    return next;
  };

  return {
    async browse(input): Promise<PublicBookCatalogView> {
      assertId(input.actorId, 'actorId');
      assertId(input.bookId, 'bookId');
      if (input.role !== 'teacher' && input.role !== 'super_admin') {
        throw new PublicBookReferenceForkError(
          'teacher-catalog-only',
          'Reference/fork catalog browsing is teacher-only.',
          403,
        );
      }
      const source = await options.store.readPublicBook(input.bookId);
      if (!source) throw new PublicBookReferenceForkError('source-not-found', 'Public Book was not found.', 404);
      const entitlement = await entitlementFor(input.actorId, input.entitlementId);
      const allActivities = source.publicTree ? source.activities : [];
      const browseSelection: PublicBookSelectionRequest = {
        sourceBookId: source.bookId,
        publicationId: source.publication.publicationId,
        publicationRevision: source.publication.revision,
        kind: 'book',
        selectionPath: [],
        activities: allActivities.map((activity) => ({
          activityId: activity.activityId,
          activityVersionId: activity.versionId,
          order: activity.order,
        })),
      };
      const publicState = publicStateFor({
        source,
        activities: allActivities,
        entitlement,
        actorId: input.actorId,
        selection: browseSelection,
        context: { mode: 'none' },
      });
      return publicCatalogView(source, publicState);
    },

    async resolve(input): Promise<import('./publicBookReferenceFork.types').PublicBookStudentProjection> {
      const resolved = await resolveProjection(input);
      return {
        projectionKind: 'public-book-student-safe',
        bookId: resolved.source.bookId,
        title: resolved.source.title,
        publicState: resolved.publicState,
        selectionKind: input.selection.kind,
        selectionPath: [...input.selection.selectionPath],
        newerVersionAvailable: false,
      };
    },

    async prepareRuntime(input): Promise<PublicBookRuntimePreparation> {
      if (input.role !== 'student') {
        throw new PublicBookReferenceForkError('student-runtime-only', 'Public runtime preparation requires a student identity.', 403);
      }
      const resolved = await resolveProjection(input);
      if (resolved.publicState !== 'playable'
        || !entitlementMatches(resolved.entitlement, {
          actorId: input.actorId,
          source: resolved.source,
          selection: input.selection,
        })) {
        throw new PublicBookReferenceForkError('entitlement-invalid', 'Student entitlement does not authorize this public Book selection.', 403);
      }
      if (!options.documentIssuer) {
        throw new PublicBookReferenceForkError('runtime-not-configured', 'Book Delivery document preparation is not configured.', 503);
      }
      const document = await options.documentIssuer.issue({
        studentId: input.actorId,
        bookId: resolved.source.bookId,
        sourceVersionId: resolved.source.source.sourceVersionId,
        entitlementId: resolved.entitlement.entitlementId,
        contextId: resolved.entitlement.contextId,
      });
      assertIssuedDocument(options.documentIssuer, document);
      return {
        bookId: resolved.source.bookId,
        title: resolved.source.title,
        sourceVersionId: resolved.source.source.sourceVersionId,
        activityIds: resolved.activities.map((activity) => activity.activityId),
        selectionPath: [...input.selection.selectionPath],
        sourceContext: resolved.context,
        document,
      };
    },

    reference,
    fork,
    migrateLegacyReference,

    async status(input): Promise<PublicBookReferenceStatus> {
      const current = await readReferenceForOwner(input.actorId, input.referenceId);
      const source = await options.store.readPublicBook(current.source.bookId);
      return referenceStatusFor(current, source);
    },

    adopt,
    rollback,
  };
};
