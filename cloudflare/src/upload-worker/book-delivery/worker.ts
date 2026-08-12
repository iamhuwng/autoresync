import { BookDeliveryEntitlementLifecycle, BookDeliveryLifecycleError } from '../../../../src/services/book-delivery/bookDelivery.entitlementLifecycle.ts';
import { createBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.entitlementFactory.ts';
import { createBookDeliveryPublicationReference } from '../../../../src/services/book-delivery/bookDelivery.publication.ts';
import type { BookDeliveryPublishedPublicationReference } from '../../../../src/services/book-delivery/bookDelivery.publication.ts';
import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryContext,
  type BookDeliveryContextKind,
  type BookDeliverySchedulePolicyReference,
  type BookDeliveryScope,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  createBookDeliveryProjectionResolver,
  BookDeliveryProjectionError,
} from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepositoryEnv,
} from '../book-assembly/publication-repository.ts';
import { FirebaseRestBookDeliveryRepository, type BookDeliveryRepositoryEnv } from './repository.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
  type BookHomeworkRepositoryEnv,
} from '../book-homework/repository.ts';
import {
  resolveBookHomeworkLaunchWindows,
} from './schedule-authority.ts';
import type {
  BookHomeworkActivitySchedulePolicyResolver,
} from '../book-homework/schedule-enforcement.ts';
import {
  createBookHomeworkActivitySchedulePolicyResolver,
} from '../book-homework/schedule-enforcement.ts';
import {
  readBookHomeworkRecipientAuthority,
} from '../book-homework/identity.ts';
import {
  FirebaseRestBookRuntimeRepository,
  type BookRuntimeRepositoryEnv,
} from '../book-runtime/repository.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';

const MAX_BODY_BYTES = 256 * 1024;

const body = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookDeliveryWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookDeliveryWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookDeliveryWorkerError('body_too_large', 413);
  }
  try { return JSON.parse(text); } catch { throw new BookDeliveryWorkerError('invalid_json'); }
};

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BookDeliveryWorkerError('invalid_request');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new BookDeliveryWorkerError('invalid_request');
  }
  return record;
};

const role = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''));
};

export class BookDeliveryWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookDeliveryWorkerError';
  }
}

type RunnableContextKind = Exclude<BookDeliveryContextKind, 'future_live'>;

interface BookDeliveryIssuanceIntent {
  readonly bookId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly recipientId: string;
  readonly contextKind: RunnableContextKind;
  readonly contextId: string;
  readonly scope: BookDeliveryScope;
}

interface BookDeliveryWorkerEnv
extends BookDeliveryRepositoryEnv, BookAssemblyPublicationRepositoryEnv, BookHomeworkRepositoryEnv,
BookRuntimeRepositoryEnv {}

type TrustedPublicationLoader = (
  env: BookDeliveryWorkerEnv,
  intent: BookDeliveryIssuanceIntent,
  schedulePolicy: BookDeliverySchedulePolicyReference,
) => Promise<BookDeliveryPublishedPublicationReference>;

interface TrustedIssuanceContext {
  readonly schedulePolicy: BookDeliverySchedulePolicyReference;
}

const publicationPathId = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const deliveryScopeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const contextBasis: Readonly<Record<RunnableContextKind, 'solo' | 'preview' | 'assignment' | 'enrollment' | 'membership'>> = {
  solo: 'solo',
  preview: 'preview',
  homework: 'assignment',
  course: 'enrollment',
  class: 'membership',
};

const ids = (value: unknown, minimumLength = 0): value is readonly string[] => (
  Array.isArray(value)
  && value.length >= minimumLength
  && value.every((entry) => typeof entry === 'string' && publicationPathId.test(entry))
  && new Set(value).size === value.length
);

const issuanceIntent = (value: unknown): BookDeliveryIssuanceIntent => {
  const intent = exact(value, [
    'bookId', 'contextId', 'contextKind', 'publicationId', 'publicationRevision',
    'recipientId', 'scope',
  ]);
  const scope = exact(intent.scope, ['kind', 'nodeKeys', 'placementIds']);
  if (typeof intent.bookId !== 'string'
    || !publicationPathId.test(intent.bookId)
    || typeof intent.publicationId !== 'string'
    || !publicationPathId.test(intent.publicationId)
    || !Number.isSafeInteger(intent.publicationRevision)
    || Number(intent.publicationRevision) < 1
    || typeof intent.recipientId !== 'string'
    || !deliveryScopeId.test(intent.recipientId)
    || typeof intent.contextId !== 'string'
    || !deliveryScopeId.test(intent.contextId)
    || !Object.hasOwn(contextBasis, String(intent.contextKind))
    || !ids(scope.nodeKeys)
    || !ids(scope.placementIds)
    || (scope.kind === 'subtree' && (scope.nodeKeys.length === 0 || scope.placementIds.length !== 0))
    || (scope.kind === 'placements' && (scope.placementIds.length === 0 || scope.nodeKeys.length !== 0))
    || !['subtree', 'placements'].includes(String(scope.kind))) {
    throw new BookDeliveryWorkerError('invalid_issuance_intent');
  }
  return {
    bookId: String(intent.bookId),
    publicationId: String(intent.publicationId),
    publicationRevision: Number(intent.publicationRevision),
    recipientId: String(intent.recipientId),
    contextKind: intent.contextKind as RunnableContextKind,
    contextId: String(intent.contextId),
    scope: {
      kind: scope.kind as BookDeliveryScope['kind'],
      nodeKeys: [...scope.nodeKeys as string[]],
      placementIds: [...scope.placementIds as string[]],
    },
  };
};

const same = (left: unknown, right: unknown): boolean => (
  JSON.stringify(left) === JSON.stringify(right)
);

export const createTrustedBookDeliveryPublication = (
  intent: BookDeliveryIssuanceIntent,
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
  schedulePolicy: BookDeliverySchedulePolicyReference,
): BookDeliveryPublishedPublicationReference => {
  const current = scope.current;
  if (!current
    || current.publicationId !== intent.publicationId
    || current.publicationRevision !== intent.publicationRevision) {
    throw new BookDeliveryWorkerError('book_delivery_publication_stale', 409);
  }
  const version = scope.versions?.[current.manifestVersionId];
  if (!version
    || version.lifecycle !== 'published'
    || version.bookId !== intent.bookId
    || version.manifestVersionId !== current.manifestVersionId
    || version.publicationId !== current.publicationId
    || version.publicationRevision !== current.publicationRevision
    || version.bookRevision !== current.bookRevision
    || version.sourceSetRevision !== current.sourceSetRevision) {
    throw new BookDeliveryWorkerError('book_delivery_publication_invalid', 409);
  }
  const preservedByMappingChain = (
    activityVersion: NonNullable<typeof scope.activityVersions>[string],
  ): boolean => {
    let successor = version;
    const seen = new Set([successor.manifestVersionId]);
    while (successor.mappingRevisionLineage) {
      const lineage = successor.mappingRevisionLineage;
      if (!lineage.preservedActivityIds.includes(activityVersion.activityId)
        || !lineage.preservedActivityVersionIds.includes(activityVersion.activityVersionId)) return false;
      const predecessor = scope.versions?.[lineage.predecessorManifestVersionId];
      if (!predecessor
        || predecessor.lifecycle !== 'published'
        || predecessor.manifestVersionId !== lineage.predecessorManifestVersionId
        || predecessor.publicationId !== lineage.predecessorPublicationId
        || predecessor.publicationRevision !== lineage.predecessorPublicationRevision
        || predecessor.sourceSetRevision !== lineage.sourceSetRevision
        || successor.sourceSetRevision !== lineage.sourceSetRevision
        || predecessor.strategy !== successor.strategy
        || !same(predecessor.manifest.sourceSet, successor.manifest.sourceSet)
        || predecessor.ownerId !== successor.ownerId
        || predecessor.bookId !== successor.bookId
        || seen.has(predecessor.manifestVersionId)) return false;
      if (activityVersion.manifestVersionId === predecessor.manifestVersionId
        && activityVersion.publicationId === predecessor.publicationId
        && activityVersion.publicationRevision === predecessor.publicationRevision) return true;
      seen.add(predecessor.manifestVersionId);
      successor = predecessor;
    }
    return false;
  };

  const plans = Object.values(scope.deliveryPlans ?? {}).filter((plan) => (
    plan.bookId === intent.bookId
    && plan.ownerId === version.ownerId
    && plan.manifestVersionId === version.manifestVersionId
    && plan.publicationId === version.publicationId
    && plan.publicationRevision === version.publicationRevision
    && plan.sourceStrategy === version.strategy
    && same(plan.sourceSet, version.manifest.sourceSet)
  ));
  if (plans.length === 0) throw new BookDeliveryWorkerError('book_delivery_plan_missing', 409);

  const planPlacementIds = new Set(plans.flatMap((plan) => plan.placementIds));
  const publicationPlacements = [...planPlacementIds].map((placementId) => {
    const placement = scope.placements?.[placementId];
    if (!placement
      || placement.bookId !== intent.bookId
      || placement.ownerId !== version.ownerId
      || placement.manifestVersionId !== version.manifestVersionId
      || placement.publicationId !== version.publicationId
      || placement.publicationRevision !== version.publicationRevision) {
      throw new BookDeliveryWorkerError('book_delivery_placement_invalid', 409);
    }
    return placement;
  });

  const nodes = version.manifest.nodes;
  const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const parentByKey = new Map(nodes.map((node) => [node.nodeKey, node.parentNodeKey]));
  const lineage = (nodeKey: string): Set<string> => {
    const result = new Set<string>();
    let currentNode: string | null | undefined = nodeKey;
    while (typeof currentNode === 'string' && !result.has(currentNode)) {
      result.add(currentNode);
      currentNode = parentByKey.get(currentNode);
    }
    return result;
  };
  const requested = new Set(
    intent.scope.kind === 'subtree' ? intent.scope.nodeKeys : intent.scope.placementIds,
  );
  if (intent.scope.kind === 'subtree'
    && [...requested].some((nodeKey) => !nodeByKey.has(nodeKey))) {
    throw new BookDeliveryWorkerError('book_delivery_scope_invalid', 409);
  }
  if (intent.scope.kind === 'placements'
    && [...requested].some((placementId) => !planPlacementIds.has(placementId))) {
    throw new BookDeliveryWorkerError('book_delivery_scope_invalid', 409);
  }

  const selectedPlacements = publicationPlacements
    .filter((placement) => (
      intent.scope.kind === 'placements'
        ? requested.has(placement.placementId)
        : [...lineage(placement.nodeKey)].some((nodeKey) => requested.has(nodeKey))
    ))
    .sort((left, right) => {
      const leftNode = nodes.findIndex((node) => node.nodeKey === left.nodeKey);
      const rightNode = nodes.findIndex((node) => node.nodeKey === right.nodeKey);
      return leftNode - rightNode || left.order - right.order || left.placementId.localeCompare(right.placementId);
    });
  if (selectedPlacements.length === 0) {
    throw new BookDeliveryWorkerError('book_delivery_scope_empty', 409);
  }

  const outlineKeys = new Set<string>();
  if (intent.scope.kind === 'subtree') {
    nodes.forEach((node) => {
      if ([...lineage(node.nodeKey)].some((nodeKey) => requested.has(nodeKey))) {
        outlineKeys.add(node.nodeKey);
      }
    });
    requested.forEach((nodeKey) => lineage(nodeKey).forEach((key) => outlineKeys.add(key)));
  } else {
    selectedPlacements.forEach((placement) => (
      lineage(placement.nodeKey).forEach((key) => outlineKeys.add(key))
    ));
  }
  const outline = nodes.filter((node) => outlineKeys.has(node.nodeKey));

  const selectedSourceKeys = new Set(
    selectedPlacements.flatMap((placement) => placement.sourcePages.map((page) => page.sourceKey)),
  );
  const publicationSources = version.manifest.sourceSet.sources
    .filter((source) => (
      version.strategy === 'full_pdf'
      || selectedSourceKeys.has(source.sourceKey)
      || (intent.scope.kind === 'subtree'
        && 'ownerNodeKey' in source
        && typeof source.ownerNodeKey === 'string'
        && outlineKeys.has(source.ownerNodeKey))
    ));
  if (publicationSources.length === 0
    || (version.strategy === 'full_pdf' && publicationSources.length !== 1)) {
    throw new BookDeliveryWorkerError('book_delivery_source_scope_invalid', 409);
  }
  const sourceSet = version.strategy === 'full_pdf'
    ? {
        strategy: 'full_pdf' as const,
        sources: [{
          sourceKey: publicationSources[0]!.sourceKey,
          sourceVersionId: publicationSources[0]!.sourceVersionId,
          lifecycle: 'verified-usable' as const,
          localPageScope: { kind: 'all' as const, pages: [] },
        }],
      }
    : {
        strategy: 'component_pdfs' as const,
        sources: publicationSources.map((source, index) => ({
          sourceKey: source.sourceKey,
          sourceVersionId: source.sourceVersionId,
          sourceOrder: index + 1,
          ownerNodeKey: 'ownerNodeKey' in source ? source.ownerNodeKey : '',
          lifecycle: 'verified-usable' as const,
          localPageScope: { kind: 'all' as const, pages: [] },
        })),
      };
  const sourceVersionByKey = new Map(
    version.manifest.sourceSet.sources.map((source) => [source.sourceKey, source.sourceVersionId]),
  );

  const placements = selectedPlacements.map((placement, index) => {
    const activityVersion = scope.activityVersions?.[placement.activityVersionId];
    const safeProjection = Object.values(scope.activitySafeProjections ?? {}).find((projection) => (
      projection.activityVersionId === placement.activityVersionId
      && projection.activityId === placement.activityId
      && projection.ownerId === version.ownerId
      && projection.bookId === intent.bookId
      && projection.manifestVersionId === version.manifestVersionId
      && projection.publicationId === version.publicationId
      && projection.publicationRevision === version.publicationRevision
      && projection.placementIds.includes(placement.placementId)
    ));
    const unit = version.manifest.units.find((candidate) => candidate.unitKey === placement.unitKey);
    const slot = unit?.activitySlots.find((candidate) => candidate.activityKey === placement.activityKey);
    if (!activityVersion || !safeProjection || !unit || !slot) {
      throw new BookDeliveryWorkerError('book_delivery_activity_version_invalid', 409);
    }
    const canonicalPageMap = new Map<string, {
      sourceKey: string;
      sourceVersionId: string | undefined;
      physicalPageNumber: number;
    }>();
    for (const pageGroupKey of slot.pageGroupKeys) {
      const group = unit.pageGroups.find((candidate) => candidate.pageGroupKey === pageGroupKey);
      if (!group || group.mode !== 'activity' || !group.activityKeys.includes(slot.activityKey)) {
        throw new BookDeliveryWorkerError('book_delivery_activity_version_invalid', 409);
      }
      group.pages.forEach((physicalPageNumber) => {
        canonicalPageMap.set(`${group.sourceKey}:${physicalPageNumber}`, {
          sourceKey: group.sourceKey,
          sourceVersionId: sourceVersionByKey.get(group.sourceKey),
          physicalPageNumber,
        });
      });
    }
    const canonicalPages = [...canonicalPageMap.values()].sort((left, right) => (
      left.sourceKey.localeCompare(right.sourceKey)
      || left.physicalPageNumber - right.physicalPageNumber
    ));
    const storedPages = [...placement.sourcePages].sort((left, right) => (
      left.sourceKey.localeCompare(right.sourceKey)
      || left.physicalPageNumber - right.physicalPageNumber
    ));
    const activityPages = [...activityVersion.sourcePages].sort((left, right) => (
      left.sourceKey.localeCompare(right.sourceKey)
      || left.physicalPageNumber - right.physicalPageNumber
    ));
    const projectionPages = [...safeProjection.sourcePages].sort((left, right) => (
      left.sourceKey.localeCompare(right.sourceKey)
      || left.physicalPageNumber - right.physicalPageNumber
    ));
    const activityVersionIsCurrent = activityVersion.manifestVersionId === version.manifestVersionId
      && activityVersion.publicationId === version.publicationId
      && activityVersion.publicationRevision === version.publicationRevision;
    const activityVersionIsPreserved = !activityVersionIsCurrent
      && preservedByMappingChain(activityVersion);
    if (!same(slot.pageGroupKeys, placement.pageGroupKeys)
      || !same(canonicalPages, storedPages)
      || !same(canonicalPages, projectionPages)
      || (activityVersionIsCurrent && !same(canonicalPages, activityPages))
      || placement.sourcePages.some((page) => (
        sourceVersionByKey.get(page.sourceKey) !== page.sourceVersionId
      ))
      || activityVersion.activityId !== placement.activityId
      || activityVersion.activityKey !== placement.activityKey
      || activityVersion.unitKey !== placement.unitKey
      || activityVersion.ownerId !== version.ownerId
      || activityVersion.bookId !== intent.bookId
      || (!activityVersionIsCurrent && !activityVersionIsPreserved)) {
      throw new BookDeliveryWorkerError('book_delivery_activity_version_invalid', 409);
    }
    const pagesBySource = new Map<string, Set<number>>();
    placement.sourcePages.forEach((page) => {
      const pages = pagesBySource.get(page.sourceKey) ?? new Set<number>();
      pages.add(page.physicalPageNumber);
      pagesBySource.set(page.sourceKey, pages);
    });
    const contextFree = slot.contextRequirement === 'none';
    return {
      placementId: placement.placementId,
      activityId: placement.activityId,
      activityVersionId: placement.activityVersionId,
      activityVersion: activityVersion.activityVersion,
      nodeKey: placement.nodeKey,
      order: index + 1,
      contextMode: slot.contextRequirement,
      pageGroupKeys: contextFree ? [] : [...placement.pageGroupKeys],
      sourcePageScopes: contextFree
        ? []
        : [...pagesBySource.entries()]
          .filter(([sourceKey]) => publicationSources.some((source) => source.sourceKey === sourceKey))
          .map(([sourceKey, pages]) => ({ sourceKey, pages: [...pages].sort((left, right) => left - right) })),
    };
  });

  const publication: Record<string, unknown> = {
    bookId: intent.bookId,
    bookMode: 'pdf',
    bookRevision: version.bookRevision,
    manifestVersionId: version.manifestVersionId,
    publicationId: version.publicationId,
    publicationRevision: version.publicationRevision,
    publicationStatus: 'published',
    ownerId: version.ownerId,
    scope: intent.scope.kind === 'subtree'
      ? { kind: 'subtree', nodeKeys: [...intent.scope.nodeKeys], placementIds: [] }
      : { kind: 'placements', nodeKeys: [], placementIds: placements.map((placement) => placement.placementId) },
    sourceSet,
    placements: placements.map((placement) => {
      if ((BOOK_DELIVERY_SCHEMA_VERSION as number) >= 3) return placement;
      const { activityVersionId: _activityVersionId, pageGroupKeys: _pageGroupKeys, ...legacy } = placement;
      return legacy;
    }),
    schedulePolicy,
  };
  if ((BOOK_DELIVERY_SCHEMA_VERSION as number) >= 3) {
    publication.outline = outline.map((node) => ({ ...node }));
  }
  return createBookDeliveryPublicationReference(publication);
};

const bindingIdFor = async (operationId: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`book-delivery-binding:${operationId}`),
  ));
  return `bd_${[...digest.slice(0, 20)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export const createBookDeliveryWorkerHandlers = (options: {
  repository?: FirebaseRestBookDeliveryRepository;
  publicationRepository?: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  loadPublication?: TrustedPublicationLoader;
  loadContext?: (
    env: BookDeliveryWorkerEnv,
    uid: string,
    intent: BookDeliveryIssuanceIntent,
  ) => Promise<TrustedIssuanceContext | null> | TrustedIssuanceContext | null;
  allocateBindingId?: (operationId: string) => Promise<string> | string;
  now?: () => string;
  homeworkAuthorityStore?: Pick<FirebaseRestBookHomeworkDocumentStore, 'read'>;
  activitySchedulePolicy?: BookHomeworkActivitySchedulePolicyResolver;
} = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const repositoryFor = (env: BookDeliveryWorkerEnv) => (
    options.repository ?? new FirebaseRestBookDeliveryRepository({ env })
  );
  const publicationRepositoryFor = (env: BookDeliveryWorkerEnv) => (
    options.publicationRepository ?? new FirebaseRestBookAssemblyPublicationRepository({ env })
  );
  const loadPublication: TrustedPublicationLoader = options.loadPublication ?? (async (env, intent, schedulePolicy) => (
    createTrustedBookDeliveryPublication(
      intent,
      await publicationRepositoryFor(env).readScope(intent.bookId),
      schedulePolicy,
    )
  ));
  const allocateBindingId = options.allocateBindingId ?? bindingIdFor;
  const loadContext = options.loadContext ?? (
    async (_env, uid, intent): Promise<TrustedIssuanceContext | null> => (
      intent.contextKind === 'preview' && intent.recipientId === uid
        ? {
            schedulePolicy: {
              policyId: `preview:${intent.contextId}`,
              policyRevision: 1,
              basis: 'immutable-reference',
            },
          }
        : null
    )
  );

  const authorize = async (env: BookDeliveryWorkerEnv, uid: string, ownerId: string): Promise<boolean> => {
    if (uid !== ownerId) return false;
    if (!env.readDatabaseValue) return false;
    return role(await env.readDatabaseValue(`users/${uid}`));
  };

  const respond = async (
    action: 'create' | 'activate' | 'supersede' | 'revoke',
    input: { request: Request; env: BookDeliveryWorkerEnv; uid: string },
  ): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      const value = await body(input.request);
      if (action === 'create' || action === 'supersede') {
        await enforceBookPilotScopeIfConfigured({
          env: input.env,
          uid: input.uid,
          request: input.request,
          operation: 'assign-place',
          actorKind: 'teacher',
          requireBook: true,
          requireAssignment: true,
          requireStudents: true,
        });
      }
      const repository = repositoryFor(input.env);
      const lifecycle = new BookDeliveryEntitlementLifecycle({
        repository,
        authorizeIssuer: async (binding) => authorize(input.env, input.uid, binding.issuer.ownerId),
      });
      if (action === 'create') {
        const request = exact(value, ['intent', 'operationId']);
        const intent = issuanceIntent(request.intent);
        const operationId = String(request.operationId);
        if (!operationIdPattern.test(operationId)) {
          throw new BookDeliveryWorkerError('invalid-operation-id');
        }
        const trustedContext = await loadContext(input.env, input.uid, intent);
        if (!trustedContext) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        const publication = await loadPublication(input.env, intent, trustedContext.schedulePolicy);
        if (!(await authorize(input.env, input.uid, publication.ownerId))) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        const timestamp = now();
        const binding = createBookDeliveryBinding({
          bindingId: await allocateBindingId(operationId),
          revision: 1,
          status: 'draft',
          recipient: {
            recipientId: intent.recipientId,
            recipientKind: intent.contextKind === 'preview' ? 'preview-user' : 'student',
          },
          issuer: { ownerId: publication.ownerId, authorityBoundary: 'book-owner' },
          context: {
            kind: intent.contextKind,
            contextId: intent.contextId,
            recipientId: intent.recipientId,
            ownerId: publication.ownerId,
            entitlementBasis: contextBasis[intent.contextKind],
          } as BookDeliveryContext,
          publication,
          createdAt: timestamp,
        });
        const result = await lifecycle.createDraft(binding, operationId, timestamp);
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      if (action === 'activate') {
        const request = exact(value, ['bindingId', 'expectedRecordRevision', 'operationId']);
        const record = await repository.readBinding(String(request.bindingId));
        if (!record || !(await authorize(input.env, input.uid, record.binding.issuer.ownerId))) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        await enforceBookPilotScopeIfConfigured({
          env: input.env,
          uid: input.uid,
          request: input.request,
          operation: 'assign-place',
          actorKind: 'teacher',
          bookId: record.binding.book.bookId,
          assignmentId: record.binding.context.contextId,
          contextKind: record.binding.context.kind,
          selectedStudentIds: [record.binding.recipient.recipientId],
          requireBook: true,
          requireAssignment: true,
          requireStudents: true,
        });
        const result = await lifecycle.activate(String(request.bindingId), Number(request.expectedRecordRevision), String(request.operationId), now());
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      if (action === 'supersede') {
        const request = exact(value, ['expectedCurrentBindingId', 'intent', 'operationId']);
        const intent = issuanceIntent(request.intent);
        const operationId = String(request.operationId);
        if (!operationIdPattern.test(operationId)) {
          throw new BookDeliveryWorkerError('invalid-operation-id');
        }
        const trustedContext = await loadContext(input.env, input.uid, intent);
        if (!trustedContext) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        const publication = await loadPublication(input.env, intent, trustedContext.schedulePolicy);
        if (!(await authorize(input.env, input.uid, publication.ownerId))) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        const timestamp = now();
        const binding = createBookDeliveryBinding({
          bindingId: await allocateBindingId(operationId),
          revision: 1,
          status: 'draft',
          recipient: {
            recipientId: intent.recipientId,
            recipientKind: intent.contextKind === 'preview' ? 'preview-user' : 'student',
          },
          issuer: { ownerId: publication.ownerId, authorityBoundary: 'book-owner' },
          context: {
            kind: intent.contextKind,
            contextId: intent.contextId,
            recipientId: intent.recipientId,
            ownerId: publication.ownerId,
            entitlementBasis: contextBasis[intent.contextKind],
          } as BookDeliveryContext,
          publication,
          createdAt: timestamp,
        });
        const result = await lifecycle.supersede(
          binding,
          String(request.expectedCurrentBindingId),
          operationId,
          timestamp,
        );
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      const request = exact(value, ['bindingId', 'expectedRecordRevision', 'expectedCurrentBindingId', 'operationId']);
      const record = await repository.readBinding(String(request.bindingId));
        if (!record || !(await authorize(input.env, input.uid, record.binding.issuer.ownerId))) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        await enforceBookPilotScopeIfConfigured({
          env: input.env,
          uid: input.uid,
          request: input.request,
          operation: 'assign-place',
          actorKind: 'teacher',
          bookId: record.binding.book.bookId,
          assignmentId: record.binding.context.contextId,
          contextKind: record.binding.context.kind,
          selectedStudentIds: [record.binding.recipient.recipientId],
          requireBook: true,
          requireAssignment: true,
          requireStudents: true,
        });
        const result = await lifecycle.revoke(
        String(request.bindingId),
        Number(request.expectedRecordRevision),
        String(request.expectedCurrentBindingId),
        String(request.operationId),
        now(),
      );
      return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return { body: { code: error.message, decision: error.decision }, init: { status: error.status } };
      }
      if (error instanceof BookDeliveryWorkerError || error instanceof BookDeliveryLifecycleError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'book_delivery_failed' }, init: { status: 500 } };
    }
  };

  return {
    create: (input: { request: Request; env: BookDeliveryWorkerEnv; uid: string }) => respond('create', input),
    activate: (input: { request: Request; env: BookDeliveryWorkerEnv; uid: string }) => respond('activate', input),
    supersede: (input: { request: Request; env: BookDeliveryWorkerEnv; uid: string }) => respond('supersede', input),
    revoke: (input: { request: Request; env: BookDeliveryWorkerEnv; uid: string }) => respond('revoke', input),
    async resolve(input: { env: BookDeliveryWorkerEnv; uid: string; recipientId: string; contextId: string }) {
      try {
        const repository = repositoryFor(input.env);
        const result = await createBookDeliveryProjectionResolver({ repository }).resolve({
          recipientId: input.recipientId,
          contextId: input.contextId,
          actor: { uid: input.uid },
        });
        if (result.context.kind !== 'homework') {
          return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
        }
        const current = await repository.resolveCurrent(input.recipientId, input.contextId);
        if (!current
          || current.record.binding.bindingId !== result.bindingId
          || current.record.binding.revision !== result.bindingRevision) {
          throw new BookDeliveryProjectionError('book-delivery-stale-binding', 409);
        }
        const authorityStore = options.homeworkAuthorityStore
          ?? new FirebaseRestBookHomeworkDocumentStore({ env: input.env });
        const stored = await readBookHomeworkRecipientAuthority(
          authorityStore,
          input.contextId,
          current.record.binding.recipient.recipientId,
        );
        if (!stored) throw new BookDeliveryProjectionError('book-delivery-stale-binding', 409);
        const activitySchedulePolicy = options.activitySchedulePolicy
          ?? createBookHomeworkActivitySchedulePolicyResolver({
            authorityStore,
            runtimeRepository: new FirebaseRestBookRuntimeRepository({ env: input.env }),
          });
        const policies = await Promise.all(current.record.binding.placements.map(
          async (placement) => activitySchedulePolicy.resolve({
            assignmentId: current.record.binding.context.contextId,
            recipientId: current.record.binding.recipient.recipientId,
            bindingId: current.record.binding.bindingId,
            bindingRevision: current.record.binding.revision,
            policyId: current.record.binding.schedulePolicy.policyId,
            policyRevision: current.record.binding.schedulePolicy.policyRevision,
            placementId: placement.placementId,
          }),
        ));
        if (policies.some((policy) => policy === null)) {
          throw new BookDeliveryProjectionError('book-delivery-schedule-policy-unavailable', 503);
        }
        const windows = resolveBookHomeworkLaunchWindows({
          binding: current.record.binding,
          authority: stored.value,
          activityPolicies: Object.fromEntries(policies.map((policy) => [
            policy!.placementId,
            policy!,
          ])),
          evaluatedAt: now(),
        });
        const projection = {
          ...result,
          activities: result.activities.map((activity) => ({
            ...activity,
            scheduleWindow: windows[activity.placementId],
          })),
          actionFlags: {
            canAutosave: result.activities.some((activity) =>
              windows[activity.placementId]?.permissions.canAutosave === true),
            canSubmit: result.activities.some((activity) =>
              windows[activity.placementId]?.permissions.canSubmit === true),
            canReview: result.activities.some((activity) =>
              windows[activity.placementId]?.permissions.canReview === true),
          },
        };
        return { body: projection as unknown as Record<string, unknown>, init: { status: 200 } };
      } catch (error) {
        const status = error instanceof BookDeliveryProjectionError ? error.status : 500;
        return {
          body: { code: error instanceof BookDeliveryProjectionError ? error.code : 'book_delivery_failed' },
          init: { status },
        };
      }
    },
  };
};
