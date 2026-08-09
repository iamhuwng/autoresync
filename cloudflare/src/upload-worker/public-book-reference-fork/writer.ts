import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalPublicBookForkPlacementSetFingerprint,
} from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import {
  planMaterialBookTreeUpdate,
  type MaterialBookTreeUpdatePlan,
} from '../../../../src/services/materialCatalog/materialBooks.service.ts';
import { projectStudentActivity } from '../../../../src/services/book-activity/activityProjection.service.ts';
import type {
  MaterialBookMetadata,
  MaterialBookMaterialRef,
  MaterialBookNode,
  MaterialTestTypeConfig,
} from '../../../../src/types/materialCatalog.types.ts';
import type {
  NormalizedActivity,
  StudentActivityProjection,
} from '../../../../src/types/bookActivity.types.ts';
import {
  createPublicBookCanonicalForkFingerprint,
  createPublicBookCanonicalForkIds,
} from '../../../../src/services/materialCatalog/publicBookCanonicalFork.identity.ts';
import {
  buildPublicBookCanonicalFork,
} from '../../../../src/services/materialCatalog/publicBookCanonicalFork.builder.ts';
import {
  appendPublicBookCanonicalForkRef,
} from '../../../../src/services/materialCatalog/publicBookCanonicalFork.planner.ts';
import type { SourceQualifiedPageIdentity } from '../../../../src/types/bookAssembly.types.ts';
import {
  PublicBookReferenceForkError,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.service.ts';
import type {
  PublicBookCanonicalForkCommand,
  PublicBookCanonicalForkPlacementResult,
  PublicBookCanonicalForkResult,
  PublicBookCanonicalForkWriter,
  PublicBookSelectionSnapshot,
  PublicBookSourceContextChoice,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.types.ts';

export const CANONICAL_FORK_ACTIVITY_ROOT = 'book_activity/versions';
export const CANONICAL_FORK_SAFE_PROJECTION_ROOT = 'book_activity/student_safe_projections';
export const CANONICAL_FORK_RECEIPT_ROOT = 'book_activity/canonical_fork_operations';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const FORK_PATH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_SELECTION_ITEMS = 200;
const MAX_PATH_ITEMS = 32;

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const exactKeys = (value: RecordValue, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const error = (code: string, message = code, statusCode = 422): never => {
  throw new PublicBookReferenceForkError(code, message, statusCode);
};

const assertId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    return error('request-invalid', `${field} is invalid.`, 400);
  }
  return value;
};

const assertForkPathId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !FORK_PATH_ID.test(value)) {
    return error('request-invalid', `${field} is invalid.`, 400);
  }
  return value;
};

const assertPath = (value: unknown, field: string): readonly string[] => {
  if (!Array.isArray(value) || value.length > MAX_PATH_ITEMS
    || value.some((part) => typeof part !== 'string' || !FORK_PATH_ID.test(part))) {
    return error('invalid-selection', `${field} is invalid.`, 400);
  }
  return value as string[];
};

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

const pathWithin = (child: readonly string[], parent: readonly string[]): boolean =>
  child.length >= parent.length && parent.every((value, index) => child[index] === value);

const contextFor = (context: PublicBookSourceContextChoice | undefined): PublicBookSourceContextChoice =>
  context ?? { mode: 'none' };

const sourceReady = (source: PublicBookSelectionSnapshot): boolean =>
  source.source.lifecycleState === 'ready'
  && source.source.studentSafeStatus === 'ready'
  && source.source.documentDeliveryStatus === 'ready';

const selectedActivityFor = (
  source: PublicBookSelectionSnapshot,
  command: PublicBookCanonicalForkCommand,
) => {
  if (source.bookId !== command.selection.sourceBookId
    || source.publication.publicationId !== command.selection.publicationId
    || source.publication.revision !== command.selection.publicationRevision) {
    return error('selection-version-mismatch', 'The selected Book publication is stale.', 409);
  }
  if (!source.publicTree || source.publication.status !== 'trusted' || !sourceReady(source)) {
    return error('source-unavailable', 'The selected public Book is not trusted and ready.', 403);
  }
  if (command.selection.kind !== 'activity' || command.selection.activities.length !== 1) {
    return error('invalid-selection', 'Canonical forks require exactly one Activity selection.', 400);
  }
  const requested = command.selection.activities[0]!;
  const activity = source.activities.find((candidate) => candidate.activityId === requested.activityId);
  if (!activity || activity.versionId !== requested.activityVersionId
    || activity.order !== requested.order
    || !same(activity.selectionPath, command.selection.selectionPath)) {
    return error('selection-version-mismatch', 'The selected Activity publication is stale.', 409);
  }
  return activity;
};

const validateContext = (
  source: PublicBookSelectionSnapshot,
  activity: PublicBookSelectionSnapshot['activities'][number],
  context: PublicBookSourceContextChoice,
): void => {
  if (context.mode === 'none') {
    if (activity.projection.contextRequirement.mode === 'required') {
      error('source-context-required', 'The selected Activity requires accepted Book source context.', 422);
    }
    return;
  }
  assertForkPathId(context.sourceBookId, 'context.sourceBookId');
  assertForkPathId(context.sourceVersionId, 'context.sourceVersionId');
  assertPath(context.selectionPath, 'context.selectionPath');
  if (!Array.isArray(context.pageGroupIds) || context.pageGroupIds.length === 0
    || context.pageGroupIds.some((id) => typeof id !== 'string' || !FORK_PATH_ID.test(id))) {
    error('invalid-source-context', 'Source context page groups are invalid.', 400);
  }
  const requirement = activity.projection.contextRequirement;
  if (context.sourceBookId !== source.bookId
    || context.sourceVersionId !== source.source.sourceVersionId
    || !pathWithin(context.selectionPath, activity.selectionPath)
    || requirement.mode === 'none'
    || !requirement.acceptedKinds.includes('book-pages')
    || !sourceReady(source)) {
    error('source-context-invalid', 'The selected source context is not authorized.', 403);
  }
};

export interface PublicBookCanonicalForkSource {
  readonly canonical: RecordValue;
  readonly safeProjection: RecordValue;
  readonly sourceBookId: string;
  readonly sourceOwnerId: string;
  readonly sourceVersionId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly sourcePlacementIds: readonly string[];
  readonly sourcePlacement?: {
    readonly placementId: string;
    readonly nodeId?: string;
    readonly unitKey?: string;
    readonly activityKey?: string;
    readonly order?: number;
    readonly pageGroupIds?: readonly string[];
    readonly sourcePages?: readonly RecordValue[];
  };
  readonly sourcePages?: readonly RecordValue[];
  readonly pageGroupIds?: readonly string[];
  readonly sourceContextFingerprint?: string | null;
}

export interface PublicBookCanonicalForkReceipt {
  readonly schemaVersion: 1;
  readonly recordKind: 'public-book-canonical-fork-operation';
  readonly actorId: string;
  readonly operationId: string;
  readonly status: 'committed';
  readonly intentFingerprint: string;
  readonly planFingerprint: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly canonicalFingerprint: string;
  readonly safeProjectionFingerprint: string;
  readonly target: {
    readonly bookId: string;
    readonly originalNodeId: string;
    readonly placementId: string;
    readonly appendOrder: number;
    readonly expectedUpdatedAt: string;
  };
  readonly source: {
    readonly bookId: string;
    readonly ownerId: string;
    readonly manifestVersionId: string;
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly sourceVersionId: string;
    readonly activityId: string;
    readonly activityVersionId: string;
    readonly activityVersion: number;
    readonly payloadFingerprint: string;
    readonly placementIds: readonly string[];
    readonly placementSetFingerprint: string;
    readonly nodeKey: string;
    readonly placementId: string;
    readonly unitKey: string;
    readonly activityKey: string;
    readonly selectionPath: readonly string[];
    readonly selectionOrder: number;
    readonly sourcePages: readonly RecordValue[];
    readonly pageGroupKeys: readonly string[];
    readonly contextFingerprint: string | null;
  };
  readonly createdAt: string;
}

export interface PublicBookCanonicalForkArtifacts {
  readonly canonical?: unknown;
  readonly safeProjection?: unknown;
}

export interface PublicBookCanonicalForkRepository {
  readonly readPublicBook: (bookId: string) => Promise<PublicBookSelectionSnapshot | null>;
  readonly readCanonicalForkTargetBook: (bookId: string) => Promise<MaterialBookMetadata | null>;
  readonly listCanonicalForkTargetBookNodes: (bookId: string) => Promise<readonly MaterialBookNode[]>;
  readonly readCanonicalForkSource: (input: {
    readonly source: PublicBookSelectionSnapshot;
    readonly activityId: string;
    readonly activityVersionId: string;
  }) => Promise<PublicBookCanonicalForkSource | null>;
  readonly readCanonicalForkReceipt: (actorId: string, operationId: string) => Promise<unknown | null>;
  readonly readCanonicalForkArtifacts: (input: {
    readonly activityId: string;
    readonly activityVersionId: string;
  }) => Promise<PublicBookCanonicalForkArtifacts>;
  readonly patchCanonicalFork: (input: {
    readonly updates: readonly { readonly path: string; readonly value: unknown }[];
    readonly claims: RecordValue;
  }) => Promise<void>;
}

export interface PublicBookCanonicalForkWriterOptions {
  readonly repository: PublicBookCanonicalForkRepository;
  readonly now?: () => string;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly maxConflictRetries?: number;
}

const canonicalPath = (activityId: string, activityVersionId: string): string =>
  `${CANONICAL_FORK_ACTIVITY_ROOT}/${activityId}/${activityVersionId}`;

const safeProjectionPath = (activityId: string, activityVersionId: string): string =>
  `${CANONICAL_FORK_SAFE_PROJECTION_ROOT}/${activityId}/${activityVersionId}`;

const receiptPath = (actorId: string, operationId: string): string =>
  `${CANONICAL_FORK_RECEIPT_ROOT}/${actorId}/${operationId}`;

const assertTarget = (
  target: PublicBookCanonicalForkCommand['target'],
  actorId: string,
  metadata: MaterialBookMetadata,
  nodes: readonly MaterialBookNode[],
): MaterialBookNode => {
  if (metadata.bookId !== target.bookId || metadata.ownerId !== actorId) {
    return error('target-owner-denied', 'Only the target Book owner may change this placement.', 403);
  }
  if (metadata.visibility !== 'private') {
    return error('target-visibility-denied', 'Canonical forks require a private target Book.', 403);
  }
  if (!['draft-empty', 'draft-in-progress', 'ready'].includes(metadata.status)) {
    return error('target-state-denied', 'The target Book is not writable in its current state.', 409);
  }
  const node = nodes.find((candidate) => candidate.nodeId === target.nodeId);
  if (!node || node.bookId !== target.bookId) {
    return error('target-node-not-found', 'The target Book node was not found.', 404);
  }
  const conflictingRef = nodes.flatMap((candidate) => candidate.materialRefs
    .filter((ref) => ref.refId === target.placementId)
    .map((ref) => ({ node: candidate, ref })))[0];
  if (conflictingRef) {
    return error('placement-conflict', 'The target placement ID is already present in the Book.', 409);
  }
  return node;
};

const sourceRecordFor = (
  source: PublicBookCanonicalForkSource,
  command: PublicBookCanonicalForkCommand,
  selected: PublicBookSelectionSnapshot['activities'][number],
): {
  readonly canonical: ReturnType<typeof assertCanonicalPublishedActivityVersion>;
  readonly activity: NormalizedActivity;
  readonly projection: StudentActivityProjection;
  readonly activityVersion: number;
  readonly payloadFingerprint: string;
  readonly placementIds: readonly string[];
} => {
  const canonical = source.canonical;
  if (canonical.schemaVersion !== 1 || canonical.lifecycle !== 'published'
    || canonical.activityId !== selected.activityId
    || canonical.activityVersionId !== selected.versionId
    || !isRecord(canonical.activity)
    || !isRecord(canonical.projection)
    || typeof canonical.payloadFingerprint !== 'string'
    || typeof canonical.activityVersion !== 'number'
    || !Number.isSafeInteger(canonical.activityVersion)
    || canonical.activityVersion < 1
    || !Array.isArray(canonical.placementIds)
    || canonical.placementIds.some((id) => typeof id !== 'string' || !SAFE_ID.test(id))) {
    return error('source-state-inconsistent', 'The private canonical source is incomplete or invalid.', 409);
  }
  if (source.sourceBookId !== command.selection.sourceBookId
    || source.publicationId !== command.selection.publicationId
    || source.publicationRevision !== command.selection.publicationRevision
    || source.canonical.activityId !== selected.activityId
    || source.canonical.activityVersionId !== selected.versionId
    || source.safeProjection.activityId !== selected.activityId
    || source.safeProjection.activityVersionId !== selected.versionId
    || source.safeProjection.projectionKind !== 'student-safe'
    || !same(source.safeProjection, {
      schemaVersion: 1,
      projectionKind: 'student-safe',
      activityId: selected.activityId,
      activityVersionId: selected.versionId,
      ownerId: source.sourceOwnerId,
      content: source.safeProjection.content,
      payloadFingerprint: canonical.payloadFingerprint,
      createdByOperationId: canonical.createdByOperationId,
      publishedAt: canonical.publishedAt,
    })
    || !isRecord(source.safeProjection.content)) {
    return error('source-state-inconsistent', 'The private source binding does not match the publication.', 409);
  }
  const activity = clone(canonical.activity) as unknown as NormalizedActivity;
  let projection: StudentActivityProjection;
  try {
    projection = projectStudentActivity(activity);
  } catch {
    return error('source-state-inconsistent', 'The private canonical Activity cannot produce a safe projection.', 409);
  }
  if (!same(projection, canonical.projection)
    || !same(projection, source.safeProjection.content)
    || !same(projection, selected.projection)) {
    return error('source-state-inconsistent', 'The source canonical and safe siblings disagree.', 409);
  }
  const parsedCanonical = (() => {
    try {
      return assertCanonicalPublishedActivityVersion(canonical);
    } catch {
      return null;
    }
  })();
  if (!parsedCanonical) {
    return error('source-state-inconsistent', 'The private canonical Activity failed canonical validation.', 409);
  }
  if (parsedCanonical.ownerId !== source.sourceOwnerId
    || (source.sourcePlacement && source.sourcePlacement.placementId
      && !parsedCanonical.placementIds.includes(source.sourcePlacement.placementId))) {
    return error('source-state-inconsistent', 'The source placement is not bound to the canonical Activity.', 409);
  }
  const canonicalPlacementIds = [...parsedCanonical.placementIds].sort();
  const resolvedPlacementIds = [...source.sourcePlacementIds].sort();
  if (canonicalPlacementIds.length !== resolvedPlacementIds.length
    || canonicalPlacementIds.some((id, index) => id !== resolvedPlacementIds[index])) {
    return error('source-state-inconsistent', 'The complete source placement set does not match the canonical Activity.', 409);
  }
  return {
    canonical: parsedCanonical,
    activity: parsedCanonical.activity,
    projection: parsedCanonical.projection,
    activityVersion: parsedCanonical.activityVersion,
    payloadFingerprint: parsedCanonical.payloadFingerprint,
    placementIds: canonicalPlacementIds,
  };
};

const placementState = (
  nodes: readonly MaterialBookNode[],
  target: PublicBookCanonicalForkReceipt['target'],
  activityId: string,
  activityVersionId: string,
): PublicBookCanonicalForkPlacementResult => {
  const matching = nodes.flatMap((node) => node.materialRefs
    .filter((ref) => ref.refId === target.placementId)
    .map((ref) => ({ node, ref })));
  if (matching.length > 1) {
    error('fork-state-inconsistent', 'The receipt placement exists more than once.', 409);
  }
  const item = matching[0];
  if (!item) {
    return {
      state: 'removed',
      bookId: target.bookId,
      originalNodeId: target.originalNodeId,
      refId: target.placementId,
    };
  }
  if (item.ref.materialId !== activityId || item.ref.snapshotVersionId !== activityVersionId) {
    error('fork-state-inconsistent', 'The receipt placement ID was retargeted.', 409);
  }
  return {
    state: item.node.nodeId === target.originalNodeId ? 'present' : 'moved',
    bookId: target.bookId,
    originalNodeId: target.originalNodeId,
    ...(item.node.nodeId === target.originalNodeId ? {} : { currentNodeId: item.node.nodeId }),
    refId: target.placementId,
  };
};

const resultFor = (
  status: 'created' | 'replayed',
  operationId: string,
  activityId: string,
  activityVersionId: string,
  placement: PublicBookCanonicalForkPlacementResult,
): PublicBookCanonicalForkResult => ({
  status,
  operationId,
  activityId,
  activityVersionId,
  activityVersion: 1,
  placement,
});

const receiptFor = (value: unknown): PublicBookCanonicalForkReceipt | null => {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  const receiptValue = value;
  if (!exactKeys(receiptValue, [
      'schemaVersion', 'recordKind', 'actorId', 'operationId', 'status',
      'intentFingerprint', 'planFingerprint', 'activityId', 'activityVersionId',
      'canonicalFingerprint', 'safeProjectionFingerprint', 'target', 'source', 'createdAt',
    ])
    || receiptValue.schemaVersion !== 1
    || receiptValue.recordKind !== 'public-book-canonical-fork-operation'
    || receiptValue.status !== 'committed'
    || typeof receiptValue.actorId !== 'string'
    || typeof receiptValue.operationId !== 'string'
    || typeof receiptValue.activityId !== 'string'
    || typeof receiptValue.activityVersionId !== 'string'
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(String(receiptValue.intentFingerprint))
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(String(receiptValue.planFingerprint))
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(String(receiptValue.canonicalFingerprint))
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(String(receiptValue.safeProjectionFingerprint))
    || typeof receiptValue.createdAt !== 'string'
    || Number.isNaN(Date.parse(receiptValue.createdAt))) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  const target = isRecord(receiptValue.target) ? receiptValue.target : null;
  const persistedSource = isRecord(receiptValue.source) ? receiptValue.source : null;
  const source = persistedSource
    && !Object.prototype.hasOwnProperty.call(persistedSource, 'contextFingerprint')
    ? { ...persistedSource, contextFingerprint: null }
    : persistedSource;
  const validSafeId = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && FORK_PATH_ID.test(candidate);
  const validNonNegativeInteger = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0;
  const validSha256 = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^sha256:[A-Za-z0-9_-]{43}$/u.test(candidate);
  const validPayloadFingerprint = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^fnv1a64:[0-9a-f]{16}$/u.test(candidate);
  const validDate = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate));
  if (!target || !exactKeys(target, ['bookId', 'originalNodeId', 'placementId', 'appendOrder', 'expectedUpdatedAt'])
    || !validSafeId(target.bookId)
    || !validSafeId(target.originalNodeId)
    || !validSafeId(target.placementId)
    || !validNonNegativeInteger(target.appendOrder)
    || !validDate(target.expectedUpdatedAt)
    || !source || !exactKeys(source, [
      'bookId', 'ownerId', 'manifestVersionId', 'publicationId', 'publicationRevision',
      'sourceVersionId', 'activityId', 'activityVersionId', 'activityVersion',
      'payloadFingerprint', 'placementIds', 'placementSetFingerprint', 'nodeKey', 'placementId',
      'unitKey', 'activityKey', 'selectionPath', 'selectionOrder', 'sourcePages', 'pageGroupKeys',
      'contextFingerprint',
    ])
    || !validSafeId(source.bookId)
    || !validSafeId(source.ownerId)
    || !validSafeId(source.manifestVersionId)
    || !validSafeId(source.publicationId)
    || !validNonNegativeInteger(source.publicationRevision) || source.publicationRevision < 1
    || !validSafeId(source.sourceVersionId)
    || !validSafeId(source.activityId)
    || !validSafeId(source.activityVersionId)
    || !validNonNegativeInteger(source.activityVersion) || source.activityVersion < 1
    || !validPayloadFingerprint(source.payloadFingerprint)
    || !Array.isArray(source.placementIds) || source.placementIds.length === 0
    || !validPayloadFingerprint(source.placementSetFingerprint)
    || !validSafeId(source.nodeKey)
    || !validSafeId(source.placementId)
    || !validSafeId(source.unitKey)
    || !validSafeId(source.activityKey)
    || !Array.isArray(source.selectionPath) || source.selectionPath.length > MAX_PATH_ITEMS
    || !validNonNegativeInteger(source.selectionOrder)
    || !Array.isArray(source.sourcePages)
    || source.sourcePages.some((page: unknown) => !isRecord(page))
    || !Array.isArray(source.pageGroupKeys)
    || source.pageGroupKeys.some((id: unknown) => !validSafeId(id))
    || (source.contextFingerprint !== null && !validSha256(source.contextFingerprint))) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  const placementIds = source.placementIds.filter(validSafeId);
  if (placementIds.length !== source.placementIds.length
    || placementIds.some((id, index) => index > 0 && placementIds[index - 1]! >= id)) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  if (!placementIds.includes(source.placementId as string)
    || source.placementSetFingerprint !== createCanonicalPublicBookForkPlacementSetFingerprint(placementIds)) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  if (source.selectionPath.filter(validSafeId).length !== source.selectionPath.length) {
    return error('fork-state-inconsistent', 'The canonical fork receipt is incomplete or invalid.', 409);
  }
  return { ...receiptValue, source } as unknown as PublicBookCanonicalForkReceipt;
};

const artifactFingerprint = async (domain: string, value: unknown): Promise<string> =>
  createPublicBookCanonicalForkFingerprint(domain, value);

const nextOrderFor = (node: MaterialBookNode): number => {
  const orders = node.materialRefs.map((ref) => ref.order).filter(Number.isSafeInteger);
  return orders.length === 0 ? 1 : Math.max(...orders) + 1;
};

const testTypeIdsFor = (activity: NormalizedActivity): readonly string[] => {
  const typeId = isRecord(activity.taskProfile) && typeof activity.taskProfile.typeId === 'string'
    ? activity.taskProfile.typeId
    : null;
  return typeId ? [typeId] : [];
};

const materialRefFor = (
  command: PublicBookCanonicalForkCommand,
  activity: NormalizedActivity,
  activityId: string,
  activityVersionId: string,
  appendOrder: number,
  timestamp: string,
): MaterialBookMaterialRef => ({
  refId: command.target.placementId as MaterialBookMaterialRef['refId'],
  materialId: activityId,
  materialKind: 'interactive-activity',
  snapshotVersionId: activityVersionId,
  titleSnapshot: activity.title,
  testTypeIdsSnapshot: testTypeIdsFor(activity) as MaterialBookMaterialRef['testTypeIdsSnapshot'],
  visibilitySnapshot: 'private',
  availability: 'available',
  updateState: 'current',
  ownerIdSnapshot: command.actorId,
  order: appendOrder,
  addedAt: timestamp,
  addedBy: command.actorId,
});

const forkSafeProjection = (
  command: PublicBookCanonicalForkCommand,
  canonical: RecordValue,
  timestamp: string,
): RecordValue => ({
  schemaVersion: 1,
  projectionKind: 'student-safe',
  activityId: canonical.activityId,
  activityVersionId: canonical.activityVersionId,
  ownerId: command.actorId,
  content: clone(canonical.projection),
  payloadFingerprint: canonical.payloadFingerprint,
  createdByOperationId: command.operationId,
  publishedAt: timestamp,
});

const inputIntent = (command: PublicBookCanonicalForkCommand): RecordValue => ({
  schemaVersion: 1,
  actorId: command.actorId,
  operationId: command.operationId,
  target: clone(command.target),
  selection: clone(command.selection),
  context: clone(command.context),
});

const verifyReceipt = (
  receipt: PublicBookCanonicalForkReceipt,
  command: PublicBookCanonicalForkCommand,
  ids: { readonly activityId: string; readonly activityVersionId: string },
): void => {
  if (receipt.actorId !== command.actorId || receipt.operationId !== command.operationId
    || receipt.activityId !== ids.activityId || receipt.activityVersionId !== ids.activityVersionId
    || receipt.target.bookId !== command.target.bookId
    || receipt.target.originalNodeId !== command.target.nodeId
    || receipt.target.placementId !== command.target.placementId
    || receipt.source.bookId !== command.selection.sourceBookId
    || receipt.source.publicationId !== command.selection.publicationId
    || receipt.source.publicationRevision !== command.selection.publicationRevision
    || receipt.source.activityId !== command.selection.activities[0]!.activityId
    || receipt.source.activityVersionId !== command.selection.activities[0]!.activityVersionId
    || receipt.source.selectionOrder !== command.selection.activities[0]!.order
    || !same(receipt.source.selectionPath, command.selection.selectionPath)
    || !same(receipt.target, {
      bookId: command.target.bookId,
      originalNodeId: command.target.nodeId,
      placementId: command.target.placementId,
      appendOrder: receipt.target.appendOrder,
      expectedUpdatedAt: receipt.target.expectedUpdatedAt,
    })) {
    error('fork-state-inconsistent', 'The canonical fork receipt is inconsistent.', 409);
  }
};

const ensurePatchIsCanonical = (
  updates: readonly { readonly path: string; readonly value: unknown }[],
): void => {
  const paths = updates.map((update) => update.path);
  if (paths.some((path) => /public_reference|fork_history/iu.test(path))) {
    error('fork-state-inconsistent', 'Canonical forks cannot write legacy persistence paths.', 409);
  }
  const canonicalLeaves = paths.filter((path) => path.startsWith(`${CANONICAL_FORK_ACTIVITY_ROOT}/`));
  const safeLeaves = paths.filter((path) => path.startsWith(`${CANONICAL_FORK_SAFE_PROJECTION_ROOT}/`));
  const receiptLeaves = paths.filter((path) => path.startsWith(`${CANONICAL_FORK_RECEIPT_ROOT}/`));
  if (canonicalLeaves.length !== 1 || safeLeaves.length !== 1 || receiptLeaves.length !== 1) {
    error('fork-state-inconsistent', 'Canonical fork patch is missing an immutable product or receipt.', 409);
  }
  if (new Set(paths).size !== paths.length) {
    error('fork-state-inconsistent', 'Canonical fork patch contains duplicate paths.', 409);
  }
  for (const path of paths) {
    if (paths.some((other) => path !== other
      && (path.startsWith(`${other}/`) || other.startsWith(`${path}/`)))) {
      error('fork-state-inconsistent', 'Canonical fork patch contains overlapping paths.', 409);
    }
  }
};

const targetPlan = (
  metadata: MaterialBookMetadata,
  previousNodes: readonly MaterialBookNode[],
  targetNode: MaterialBookNode,
  ref: MaterialBookMaterialRef,
  command: PublicBookCanonicalForkCommand,
  timestamp: string,
  testTypeConfigs: readonly MaterialTestTypeConfig[] | undefined,
): MaterialBookTreeUpdatePlan => {
  try {
    const nextNodes = appendPublicBookCanonicalForkRef({
      book: metadata,
      nodes: previousNodes,
      targetNodeId: targetNode.nodeId,
      ref,
    });
    return planMaterialBookTreeUpdate({
      current: metadata,
      previousNodes,
      nextNodes,
      touchedNodeIds: [targetNode.nodeId],
      expectedUpdatedAt: metadata.updatedAt,
      now: timestamp,
      context: {
        actorId: command.actorId,
        actorRole: 'teacher',
        testTypeConfigs,
        now: () => timestamp,
      },
    });
  } catch (cause) {
    return error('target-book-invalid', cause instanceof Error ? cause.message : 'The target Book is invalid.', 409);
  }
};

const replay = async (
  repository: PublicBookCanonicalForkRepository,
  command: PublicBookCanonicalForkCommand,
  receipt: PublicBookCanonicalForkReceipt,
  ids: { readonly activityId: string; readonly activityVersionId: string },
): Promise<PublicBookCanonicalForkResult> => {
  verifyReceipt(receipt, command, ids);
  const metadata = await repository.readCanonicalForkTargetBook(command.target.bookId);
  if (!metadata || metadata.ownerId !== command.actorId || metadata.visibility !== 'private') {
    return error('target-owner-denied', 'Only the target Book owner may replay this fork.', 403);
  }
  const artifacts = await repository.readCanonicalForkArtifacts(ids);
  const canonical = artifacts.canonical;
  const safeProjection = artifacts.safeProjection;
  if (!isRecord(canonical) || !isRecord(safeProjection)
    || canonical.activityId !== ids.activityId
    || canonical.activityVersionId !== ids.activityVersionId
    || safeProjection.activityId !== ids.activityId
    || safeProjection.activityVersionId !== ids.activityVersionId
    || await artifactFingerprint('public-book-fork/canonical/v1', canonical) !== receipt.canonicalFingerprint
    || await artifactFingerprint('public-book-fork/safe-projection/v1', safeProjection) !== receipt.safeProjectionFingerprint) {
    return error('fork-state-inconsistent', 'The canonical fork receipt products are incomplete or changed.', 409);
  }
  let parsedCanonical: ReturnType<typeof assertCanonicalPublishedActivityVersion>;
  try {
    parsedCanonical = assertCanonicalPublishedActivityVersion(canonical);
  } catch {
    return error('fork-state-inconsistent', 'The canonical fork receipt product is not a valid canonical version.', 409);
  }
  const provenance = parsedCanonical.provenance;
  if (provenance.kind !== 'public-book-fork'
    || provenance.targetBookId !== receipt.target.bookId
    || provenance.targetOriginalNodeId !== receipt.target.originalNodeId
    || provenance.targetPlacementId !== receipt.target.placementId
    || provenance.targetAppendOrder !== receipt.target.appendOrder
    || provenance.targetBookUpdatedAt !== receipt.target.expectedUpdatedAt
    || provenance.sourceBookId !== receipt.source.bookId
    || provenance.sourceOwnerId !== receipt.source.ownerId
    || provenance.sourceManifestVersionId !== receipt.source.manifestVersionId
    || provenance.sourcePublicationId !== receipt.source.publicationId
    || provenance.sourcePublicationRevision !== receipt.source.publicationRevision
    || provenance.sourceVersionId !== receipt.source.sourceVersionId
    || provenance.sourceActivityId !== receipt.source.activityId
    || provenance.sourceActivityVersionId !== receipt.source.activityVersionId
    || provenance.sourceActivityVersion !== receipt.source.activityVersion
    || provenance.sourcePayloadFingerprint !== receipt.source.payloadFingerprint
    || provenance.sourcePlacementSetFingerprint !== receipt.source.placementSetFingerprint
    || provenance.sourceNodeKey !== receipt.source.nodeKey
    || provenance.sourcePlacementId !== receipt.source.placementId
    || provenance.sourceUnitKey !== receipt.source.unitKey
    || provenance.sourceActivityKey !== receipt.source.activityKey
    || !same(provenance.sourcePlacementIds, receipt.source.placementIds)
    || !same(provenance.selectionPath, receipt.source.selectionPath)
    || provenance.selectionOrder !== receipt.source.selectionOrder
    || !same(provenance.sourcePages, receipt.source.sourcePages)
    || !same(provenance.sourcePageGroupKeys, receipt.source.pageGroupKeys)
    || provenance.sourceContextFingerprint !== receipt.source.contextFingerprint
    || !same(safeProjection, forkSafeProjection(command, canonical, receipt.createdAt))) {
    return error('fork-state-inconsistent', 'The canonical fork receipt pins do not match the immutable products.', 409);
  }
  const nodes = await repository.listCanonicalForkTargetBookNodes(command.target.bookId);
  const placement = placementState(nodes, receipt.target, ids.activityId, ids.activityVersionId);
  return resultFor('replayed', command.operationId, ids.activityId, ids.activityVersionId, placement);
};

const validateCommand = (command: PublicBookCanonicalForkCommand): void => {
  assertForkPathId(command.actorId, 'actorId');
  if (typeof command.operationId !== 'string' || !UUID.test(command.operationId)) {
    error('invalid-operation-id', 'Canonical forks require a UUID operationId.', 400);
  }
  assertForkPathId(command.target.bookId, 'target.bookId');
  assertForkPathId(command.target.nodeId, 'target.nodeId');
  assertForkPathId(command.target.placementId, 'target.placementId');
  if (command.selection.kind !== 'activity' || command.selection.activities.length !== 1) {
    error('invalid-selection', 'Canonical forks require exactly one Activity selection.', 400);
  }
  assertForkPathId(command.selection.sourceBookId, 'selection.sourceBookId');
  assertForkPathId(command.selection.publicationId, 'selection.publicationId');
  if (!Number.isSafeInteger(command.selection.publicationRevision)
    || command.selection.publicationRevision < 1) {
    error('invalid-selection', 'selection.publicationRevision is invalid.', 400);
  }
  assertPath(command.selection.selectionPath, 'selection.selectionPath');
  const selected = command.selection.activities[0]!;
  assertForkPathId(selected.activityId, 'selection.activityId');
  assertForkPathId(selected.activityVersionId, 'selection.activityVersionId');
  if (!Number.isSafeInteger(selected.order) || selected.order < 0) {
    error('invalid-selection', 'selection.order is invalid.', 400);
  }
  const context = contextFor(command.context);
  if (context.mode === 'book-source-reference') {
    assertForkPathId(context.sourceBookId, 'context.sourceBookId');
    assertForkPathId(context.sourceVersionId, 'context.sourceVersionId');
    assertPath(context.selectionPath, 'context.selectionPath');
    if (context.pageGroupIds.length === 0
      || context.pageGroupIds.some((id) => !FORK_PATH_ID.test(id))) {
      error('invalid-source-context', 'Source context page groups are invalid.', 400);
    }
  }
};

export const createPublicBookCanonicalForkWriter = (
  options: PublicBookCanonicalForkWriterOptions,
): PublicBookCanonicalForkWriter => {
  const now = options.now ?? (() => new Date().toISOString());
  const maxConflictRetries = options.maxConflictRetries ?? 1;

  const fork = async (command: PublicBookCanonicalForkCommand): Promise<PublicBookCanonicalForkResult> => {
    validateCommand(command);
    const ids = await createPublicBookCanonicalForkIds(command);
    const intentFingerprint = await createPublicBookCanonicalForkFingerprint(
      'public-book-fork/intent/v1',
      inputIntent(command),
    );
    const existing = receiptFor(await options.repository.readCanonicalForkReceipt(
      command.actorId,
      command.operationId,
    ));
    if (existing) {
      if (existing.intentFingerprint !== intentFingerprint) {
        error('operation-conflict', 'The operationId is already bound to a different fork intent.', 409);
      }
      return replay(options.repository, command, existing, ids);
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxConflictRetries; attempt += 1) {
      try {
        const metadata = await options.repository.readCanonicalForkTargetBook(command.target.bookId);
        if (!metadata) return error('target-not-found', 'The target Book was not found.', 404);
        const nodes = await options.repository.listCanonicalForkTargetBookNodes(command.target.bookId);
        const targetNode = assertTarget(command.target, command.actorId, metadata, nodes);
        const source = await options.repository.readPublicBook(command.selection.sourceBookId);
        if (!source) return error('source-not-found', 'The public source Book was not found.', 404);
        const selected = selectedActivityFor(source, command);
        const context = contextFor(command.context);
        validateContext(source, selected, context);
        const privateSource = await options.repository.readCanonicalForkSource({
          source,
          activityId: selected.activityId,
          activityVersionId: selected.versionId,
        });
        if (!privateSource) return error('source-state-inconsistent', 'The private canonical source was not found.', 409);
        const sourceRecord = sourceRecordFor(privateSource, command, selected);
        const artifacts = await options.repository.readCanonicalForkArtifacts(ids);
        if (artifacts.canonical !== undefined || artifacts.safeProjection !== undefined) {
          error('fork-state-inconsistent', 'Canonical fork products exist without a receipt.', 409);
        }
        const timestamp = now();
        const appendOrder = nextOrderFor(targetNode);
        const targetRefIndex = targetNode.materialRefs.length;
        const contextFingerprint = context.mode === 'none'
          ? null
          : await createPublicBookCanonicalForkFingerprint('public-book-fork/context/v1', context);
        const sourcePlacement = privateSource.sourcePlacement;
        if (!sourcePlacement?.placementId || !sourcePlacement.nodeId
          || !sourcePlacement.unitKey || !sourcePlacement.activityKey) {
          return error('source-state-inconsistent', 'The source placement pins are incomplete.', 409);
        }
        const sourcePages = privateSource.sourcePages ?? sourcePlacement.sourcePages;
        const sourcePageGroupKeys = privateSource.pageGroupIds ?? sourcePlacement.pageGroupIds;
        if (!sourcePages || !sourcePageGroupKeys) {
          return error('source-state-inconsistent', 'The source page and page-group pins are incomplete.', 409);
        }
        if (context.mode === 'book-source-reference'
          && !same(context.pageGroupIds, sourcePageGroupKeys)) {
          return error('source-context-invalid', 'The selected source context is not authorized.', 403);
        }
        const built = await buildPublicBookCanonicalFork({
          actorId: command.actorId,
          operationId: command.operationId,
          now: timestamp,
          source: sourceRecord.canonical,
          sourcePins: {
            sourceBookId: privateSource.sourceBookId,
            sourceOwnerId: privateSource.sourceOwnerId,
            sourceManifestVersionId: privateSource.manifestVersionId,
            sourcePublicationId: privateSource.publicationId,
            sourcePublicationRevision: privateSource.publicationRevision,
            sourceVersionId: privateSource.sourceVersionId,
            sourceActivityId: selected.activityId,
            sourceActivityVersionId: selected.versionId,
            sourceActivityVersion: sourceRecord.activityVersion,
            sourcePayloadFingerprint: sourceRecord.payloadFingerprint,
            sourcePlacementIds: sourceRecord.placementIds,
            sourcePlacementSetFingerprint: createCanonicalPublicBookForkPlacementSetFingerprint(
              sourceRecord.placementIds,
            ),
            sourceNodeKey: sourcePlacement.nodeId,
            sourcePlacementId: sourcePlacement.placementId,
            sourceUnitKey: sourcePlacement.unitKey,
            sourceActivityKey: sourcePlacement.activityKey,
            selectionPath: command.selection.selectionPath,
            selectionOrder: command.selection.activities[0]!.order,
            sourcePages: sourcePages as unknown as SourceQualifiedPageIdentity[],
            sourcePageGroupKeys,
            sourceContextFingerprint: contextFingerprint,
          },
          targetPins: {
            targetBookId: command.target.bookId,
            targetOwnerId: command.actorId,
            targetOriginalNodeId: command.target.nodeId,
            targetPlacementId: command.target.placementId,
            targetAppendOrder: appendOrder,
            targetBookUpdatedAt: metadata.updatedAt,
          },
          selection: command.selection,
        });
        const canonical = built.record as unknown as RecordValue;
        const safeProjection = forkSafeProjection(command, canonical, timestamp);
        if (built.record.provenance.kind !== 'public-book-fork') {
          return error('fork-state-inconsistent', 'The destination canonical provenance is not a public fork.', 409);
        }
        const forkProvenance = built.record.provenance;
        const ref = materialRefFor(
          command,
          sourceRecord.activity,
          ids.activityId,
          ids.activityVersionId,
          appendOrder,
          timestamp,
        );
        const plan = targetPlan(
          metadata,
          nodes,
          targetNode,
          ref,
          command,
          timestamp,
          options.testTypeConfigs,
        );
        const canonicalFingerprint = await artifactFingerprint('public-book-fork/canonical/v1', canonical);
        const safeProjectionFingerprint = await artifactFingerprint('public-book-fork/safe-projection/v1', safeProjection);
        const planFingerprint = await createPublicBookCanonicalForkFingerprint(
          'public-book-fork/plan/v1',
          {
            actorId: command.actorId,
            operationId: command.operationId,
            target: {
              bookId: command.target.bookId,
              nodeId: command.target.nodeId,
              placementId: command.target.placementId,
              expectedUpdatedAt: metadata.updatedAt,
              appendOrder,
            },
            intentFingerprint,
            canonicalFingerprint,
            safeProjectionFingerprint,
            bookUpdatePlan: plan.updates,
          },
        );
        const receipt: PublicBookCanonicalForkReceipt = {
          schemaVersion: 1,
          recordKind: 'public-book-canonical-fork-operation',
          actorId: command.actorId,
          operationId: command.operationId,
          status: 'committed',
          intentFingerprint,
          planFingerprint,
          activityId: ids.activityId,
          activityVersionId: ids.activityVersionId,
          canonicalFingerprint,
          safeProjectionFingerprint,
          target: {
            bookId: command.target.bookId,
            originalNodeId: command.target.nodeId,
            placementId: command.target.placementId,
            appendOrder,
            expectedUpdatedAt: metadata.updatedAt,
          },
          source: {
            bookId: forkProvenance.sourceBookId,
            ownerId: forkProvenance.sourceOwnerId,
            manifestVersionId: forkProvenance.sourceManifestVersionId,
            publicationId: forkProvenance.sourcePublicationId,
            publicationRevision: forkProvenance.sourcePublicationRevision,
            sourceVersionId: forkProvenance.sourceVersionId,
            activityId: forkProvenance.sourceActivityId,
            activityVersionId: forkProvenance.sourceActivityVersionId,
            activityVersion: forkProvenance.sourceActivityVersion,
            payloadFingerprint: forkProvenance.sourcePayloadFingerprint,
            placementIds: [...forkProvenance.sourcePlacementIds],
            placementSetFingerprint: forkProvenance.sourcePlacementSetFingerprint,
            nodeKey: forkProvenance.sourceNodeKey,
            placementId: forkProvenance.sourcePlacementId,
            unitKey: forkProvenance.sourceUnitKey,
            activityKey: forkProvenance.sourceActivityKey,
            selectionPath: [...forkProvenance.selectionPath],
            selectionOrder: forkProvenance.selectionOrder,
            sourcePages: clone(forkProvenance.sourcePages) as unknown as readonly RecordValue[],
            pageGroupKeys: [...forkProvenance.sourcePageGroupKeys],
            contextFingerprint: forkProvenance.sourceContextFingerprint,
          },
          createdAt: timestamp,
        };
        const plannedUpdates = Object.entries(plan.updates).map(([path, value]) => ({ path, value }));
        const updates = [
          ...plannedUpdates,
          { path: canonicalPath(ids.activityId, ids.activityVersionId), value: canonical },
          { path: safeProjectionPath(ids.activityId, ids.activityVersionId), value: safeProjection },
          { path: receiptPath(command.actorId, command.operationId), value: receipt },
        ];
        ensurePatchIsCanonical(updates);
        await options.repository.patchCanonicalFork({
          updates,
          claims: {
            operation: 'public-book-canonical-fork-v1',
            actorId: command.actorId,
            operationId: command.operationId,
            activityId: ids.activityId,
            activityVersionId: ids.activityVersionId,
            destinationPayloadFingerprint: built.record.payloadFingerprint,
            sourceVersionId: privateSource.sourceVersionId,
            sourceActivityId: selected.activityId,
            sourceActivityVersionId: selected.versionId,
            sourcePlacementId: sourcePlacement.placementId,
            sourcePlacementSetFingerprint: createCanonicalPublicBookForkPlacementSetFingerprint(
              sourceRecord.placementIds,
            ),
            sourceNodeKey: sourcePlacement.nodeId,
            selectionOrder: command.selection.activities[0]!.order,
            targetBookId: command.target.bookId,
            targetNodeId: command.target.nodeId,
            placementId: command.target.placementId,
            expectedUpdatedAt: metadata.updatedAt,
            planFingerprint,
            commitTimestamp: timestamp,
            targetAppendOrder: appendOrder,
            targetRefIndex,
            targetBookStatus: plan.metadata.status,
            sourceContextFingerprint: contextFingerprint,
            intentFingerprint,
            canonicalFingerprint,
            safeProjectionFingerprint,
          },
        });
        return resultFor('created', command.operationId, ids.activityId, ids.activityVersionId, {
          state: 'present',
          bookId: command.target.bookId,
          originalNodeId: command.target.nodeId,
          refId: command.target.placementId,
        });
      } catch (cause) {
        lastError = cause;
        const after = receiptFor(await options.repository.readCanonicalForkReceipt(
          command.actorId,
          command.operationId,
        ));
        if (after && after.intentFingerprint === intentFingerprint) {
          return replay(options.repository, command, after, ids);
        }
        if (attempt >= maxConflictRetries) break;
        const current = await options.repository.readCanonicalForkTargetBook(command.target.bookId);
        const currentNodes = await options.repository.listCanonicalForkTargetBookNodes(command.target.bookId);
        if (!current) break;
        const currentRef = currentNodes.flatMap((node) => node.materialRefs)
          .find((ref) => ref.refId === command.target.placementId);
        if (currentRef) error('placement-conflict', 'The target placement changed during the fork.', 409);
        if (current.updatedAt === (lastError as { expectedUpdatedAt?: string })?.expectedUpdatedAt) break;
      }
    }
    if (lastError instanceof PublicBookReferenceForkError) throw lastError;
    throw new PublicBookReferenceForkError(
      'fork-commit-failed',
      lastError instanceof Error ? lastError.message : 'The canonical fork could not be committed.',
      503,
    );
  };

  return Object.freeze({ fork });
};
