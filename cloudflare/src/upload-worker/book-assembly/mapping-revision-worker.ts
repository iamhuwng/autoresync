import {
  createBookAssemblyPublicationService,
  fingerprintBookAssemblyOperation,
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyBookAuthority } from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import {
  createMappingRevisionPublicationPlan,
  type MappingRevisionPublicationIds,
} from '../../../../src/services/book-assembly/mappingRevision.service.ts';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookPageGroupCandidate,
  BookSourceStrategy,
  BookUnitCandidate,
  SourceSetCandidate,
} from '../../../../src/types/bookAssembly.types.ts';

const MAX_BODY_BYTES = 1_200_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class MappingRevisionWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'MappingRevisionWorkerError';
  }
}

export interface MappingRevisionWorkerEnv {
  readonly BOOK_MAPPING_REVISION_ENABLED?: string;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

export interface MappingRevisionWorkerOptions {
  readonly repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  readonly readAuthority: (bookId: string) => Promise<BookAssemblyBookAuthority | null>;
  readonly allocateOperationId?: () => string;
  readonly allocateId?: (kind: string, key: string) => string;
  readonly now?: () => string;
}

type RecordValue = Record<string, unknown>;

const plain = (value: unknown): RecordValue | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
);

const exact = (value: unknown, keys: readonly string[], code = 'invalid_request'): RecordValue => {
  const record = plain(value);
  if (!record || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new MappingRevisionWorkerError(code);
  }
  return record;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new MappingRevisionWorkerError(code);
  return value;
};

const uuid = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new MappingRevisionWorkerError(code);
  return value;
};

const revision = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new MappingRevisionWorkerError(code);
  return value as number;
};

const mode = (value: unknown): 'activity' | 'reference_only' => {
  if (value !== 'activity' && value !== 'reference_only') throw new MappingRevisionWorkerError('invalid_page_group_mode');
  return value;
};

const strategy = (value: unknown): BookSourceStrategy => {
  if (value !== 'full_pdf' && value !== 'component_pdfs') throw new MappingRevisionWorkerError('invalid_source_strategy');
  return value;
};

const parseSourceSet = (value: unknown): SourceSetCandidate => {
  const record = exact(value, ['sourceStrategy', 'sources'], 'invalid_source_set');
  const sourceStrategy = strategy(record.sourceStrategy);
  if (!Array.isArray(record.sources) || record.sources.length === 0) throw new MappingRevisionWorkerError('invalid_source_set');
  const sources = record.sources.map((entry) => {
    const source = exact(entry, sourceStrategy === 'full_pdf'
      ? ['sourceKey', 'sourceVersionId', 'sourceOrder']
      : ['sourceKey', 'sourceVersionId', 'sourceOrder', 'ownerNodeKey'], 'invalid_source');
    const sourceOrder = revision(source.sourceOrder, 'invalid_source_order');
    if (sourceOrder < 1) throw new MappingRevisionWorkerError('invalid_source_order');
    return {
      sourceKey: id(source.sourceKey, 'invalid_source_key'),
      sourceVersionId: id(source.sourceVersionId, 'invalid_source_version_id'),
      sourceOrder,
      ...(sourceStrategy === 'component_pdfs'
        ? { ownerNodeKey: id(source.ownerNodeKey, 'invalid_component_owner') }
        : {}),
    } as const;
  });
  if (sourceStrategy === 'full_pdf' && sources.length !== 1) throw new MappingRevisionWorkerError('full_pdf_requires_one_source');
  if (new Set(sources.map((source) => source.sourceKey)).size !== sources.length
    || new Set(sources.map((source) => source.sourceOrder)).size !== sources.length) {
    throw new MappingRevisionWorkerError('duplicate_source');
  }
  return sourceStrategy === 'full_pdf'
    ? { sourceStrategy, sources: [sources[0]!] }
    : { sourceStrategy, sources };
};

const parseManifest = (value: unknown): BookAssemblyManifestCandidate => {
  const record = exact(value, ['bookId', 'sourceSet', 'nodes', 'units'], 'invalid_manifest');
  if (!Array.isArray(record.nodes) || !Array.isArray(record.units)) throw new MappingRevisionWorkerError('invalid_manifest');
  const nodes = record.nodes.map((entry) => {
    const node = exact(entry, ['nodeKey', 'parentNodeKey', 'nodeType', 'order'], 'invalid_node');
    if (node.parentNodeKey !== null && node.parentNodeKey !== undefined) id(node.parentNodeKey, 'invalid_parent_node');
    return {
      nodeKey: id(node.nodeKey, 'invalid_node_key'),
      parentNodeKey: node.parentNodeKey as string | null,
      nodeType: node.nodeType,
      order: revision(node.order, 'invalid_node_order'),
    } as BookAssemblyManifestCandidate['nodes'][number];
  });
  const units = record.units.map((entry): BookUnitCandidate => {
    const unit = exact(entry, ['unitKey', 'activitySlots', 'pageGroups'], 'invalid_unit');
    if (!Array.isArray(unit.activitySlots) || !Array.isArray(unit.pageGroups)) throw new MappingRevisionWorkerError('invalid_unit');
    const activitySlots = unit.activitySlots.map((slotValue) => {
      const slot = exact(slotValue, ['activityKey', 'order', 'contextRequirement', 'pageGroupKeys'], 'invalid_activity_slot');
      if (!Array.isArray(slot.pageGroupKeys)) throw new MappingRevisionWorkerError('invalid_activity_slot');
      if (slot.contextRequirement !== 'required' && slot.contextRequirement !== 'optional' && slot.contextRequirement !== 'none') {
        throw new MappingRevisionWorkerError('invalid_context_requirement');
      }
      return {
        activityKey: id(slot.activityKey, 'invalid_activity_key'),
        order: revision(slot.order, 'invalid_activity_order'),
        contextRequirement: slot.contextRequirement,
        pageGroupKeys: slot.pageGroupKeys.map((pageGroupKey) => id(pageGroupKey, 'invalid_page_group_key')),
      };
    });
    const pageGroups = unit.pageGroups.map((groupValue): BookPageGroupCandidate => {
      const group = exact(groupValue, [
        'pageGroupKey', 'sourceKey', 'pages', 'activityKeys', 'mode', 'defaultPhysicalPageNumber',
      ], 'invalid_page_group');
      if (!Array.isArray(group.pages) || !Array.isArray(group.activityKeys)) throw new MappingRevisionWorkerError('invalid_page_group');
      const pages = group.pages.map((pageValue) => {
        const pageNumber = revision(pageValue, 'invalid_physical_page');
        if (pageNumber < 1) throw new MappingRevisionWorkerError('invalid_physical_page');
        return pageNumber;
      });
      const parsed: BookPageGroupCandidate = {
        pageGroupKey: id(group.pageGroupKey, 'invalid_page_group_key'),
        sourceKey: id(group.sourceKey, 'invalid_source_key'),
        pages,
        activityKeys: group.activityKeys.map((activityKey) => id(activityKey, 'invalid_activity_key')),
        mode: mode(group.mode),
        ...(group.defaultPhysicalPageNumber === undefined
          ? {}
          : { defaultPhysicalPageNumber: revision(group.defaultPhysicalPageNumber, 'invalid_default_page') }),
      };
      return parsed;
    });
    return {
      unitKey: id(unit.unitKey, 'invalid_unit_key'),
      activitySlots,
      pageGroups,
    };
  });
  return {
    bookId: id(record.bookId, 'invalid_book_id'),
    sourceSet: parseSourceSet(record.sourceSet),
    nodes,
    units,
  };
};

const parseApproval = (value: unknown): BookAssemblyPreviewApprovalReference => {
  const record = exact(value, ['approvalId', 'approvalRevision', 'approvedAt', 'expiresAt', 'approvedInputFingerprint'], 'invalid_preview_approval');
  const approvedAt = id(record.approvedAt, 'invalid_preview_approval');
  const expiresAt = id(record.expiresAt, 'invalid_preview_approval');
  if (!Number.isFinite(Date.parse(approvedAt)) || !Number.isFinite(Date.parse(expiresAt))) throw new MappingRevisionWorkerError('invalid_preview_approval');
  return {
    approvalId: id(record.approvalId, 'invalid_preview_approval'),
    approvalRevision: revision(record.approvalRevision, 'invalid_preview_approval'),
    approvedAt,
    expiresAt,
    approvedInputFingerprint: id(record.approvedInputFingerprint, 'invalid_preview_approval'),
  };
};

const readBody = async (request: Request): Promise<RecordValue> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new MappingRevisionWorkerError('content_type_required');
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) throw new MappingRevisionWorkerError('body_too_large', 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new MappingRevisionWorkerError('body_too_large', 413);
  try {
    return exact(JSON.parse(body) as unknown, [
      'bookId', 'expectedCurrentPublicationId', 'expectedBookRevision', 'expectedSourceSetRevision', 'targetManifest', 'previewApproval',
    ]);
  } catch (error) {
    if (error instanceof MappingRevisionWorkerError) throw error;
    throw new MappingRevisionWorkerError('invalid_json');
  }
};

const roleAllowed = (value: unknown): boolean => {
  const profile = plain(value);
  return !!profile
    && (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''))
    && profile.forceReauth !== true;
};

const statusFor = (result: BookAssemblyPublicationResult): number => {
  if (result.status === 'published' || result.status === 'replayed') return 200;
  if (result.status === 'conflict' || result.status === 'idempotency-conflict') return 409;
  if (result.status === 'not-found') return 404;
  return 422;
};

const currentVersion = (scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>): BookAssemblyImmutableManifestVersion | null => {
  const pointer = scope.current;
  return pointer ? scope.versions?.[pointer.manifestVersionId] ?? null : null;
};

const allocateIds = (
  predecessor: BookAssemblyImmutableManifestVersion,
  allocateId: (kind: string, key: string) => string,
): MappingRevisionPublicationIds => {
  const key = `${predecessor.bookId}:${predecessor.publicationId}:${predecessor.publicationRevision + 1}`;
  const activitiesByKey: Record<string, MappingRevisionPublicationIds['activitiesByKey'][string]> = {};
  predecessor.manifest.units.forEach((unit) => unit.activitySlots.forEach((slot) => {
    const activityKey = `${unit.unitKey}:${slot.activityKey}`;
    activitiesByKey[activityKey] = {
      projectionId: allocateId('mapping-activity-projection', `${key}:${activityKey}`),
      placementId: allocateId('mapping-placement', `${key}:${activityKey}`),
    };
  }));
  return {
    planId: allocateId('mapping-plan', key),
    manifestVersionId: allocateId('mapping-manifest-version', key),
    publicationId: allocateId('mapping-publication', key),
    publicationRevision: predecessor.publicationRevision + 1,
    unitProjectionIds: Object.fromEntries(predecessor.manifest.units.map((unit) => [
      unit.unitKey, allocateId('mapping-unit-projection', `${key}:${unit.unitKey}`),
    ])),
    deliveryPlanIds: Object.fromEntries(predecessor.manifest.units.map((unit) => [
      unit.unitKey, allocateId('mapping-delivery-plan', `${key}:${unit.unitKey}`),
    ])),
    activitiesByKey,
  };
};

export const createMappingRevisionWorkerHandlers = (options: MappingRevisionWorkerOptions) => {
  const now = options.now ?? (() => new Date().toISOString());
  const allocateOperationId = options.allocateOperationId ?? (() => crypto.randomUUID());
  const allocateId = options.allocateId ?? ((kind, key) => `${kind}-${key}-${crypto.randomUUID()}`);
  const service = createBookAssemblyPublicationService(options.repository);

  return {
    async publish(input: {
      readonly request: Request;
      readonly env: MappingRevisionWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        if (!input.env.readDatabaseValue) throw new MappingRevisionWorkerError('mapping_auth_reader_missing', 503);
        if (!roleAllowed(await input.env.readDatabaseValue(`users/${input.uid}`))) throw new MappingRevisionWorkerError('mapping_forbidden', 403);
        if (input.env.BOOK_MAPPING_REVISION_ENABLED !== 'true') throw new MappingRevisionWorkerError('mapping_revision_disabled', 503);
        const body = await readBody(input.request);
        const bookId = id(body.bookId, 'invalid_book_id');
        const operationId = uuid(input.request.headers.get('Idempotency-Key') ?? allocateOperationId(), 'invalid_operation_id');
        const expectedCurrentPublicationId = body.expectedCurrentPublicationId === null
          ? null
          : id(body.expectedCurrentPublicationId, 'invalid_current_publication_id');
        const expectedBookRevision = revision(body.expectedBookRevision, 'invalid_book_revision');
        const expectedSourceSetRevision = revision(body.expectedSourceSetRevision, 'invalid_source_set_revision');
        const targetManifest = parseManifest(body.targetManifest);
        const previewApproval = body.previewApproval === undefined ? undefined : parseApproval(body.previewApproval);
        const operationFingerprint = fingerprintBookAssemblyOperation({
          action: 'mapping-revision',
          ownerId: input.uid,
          bookId,
          expectedCurrentPublicationId,
          expectedBookRevision,
          expectedSourceSetRevision,
          targetManifest,
          previewApproval,
        });
        const scope = await options.repository.readScope(bookId);
        const stored = scope.operations?.[operationId];
        if (stored) {
          if (stored.ownerId !== input.uid || stored.fingerprint !== operationFingerprint) {
            return { body: { status: 'idempotency-conflict', failureCode: 'idempotency-conflict' }, init: { status: 409 } };
          }
          return { body: { ...stored.result, status: 'replayed' }, init: { status: 200 } };
        }
        const authority = await options.readAuthority(bookId);
        const predecessor = currentVersion(scope);
        if (!authority || !predecessor || scope.current?.publicationId !== expectedCurrentPublicationId
          || predecessor.bookRevision !== expectedBookRevision
          || predecessor.sourceSetRevision !== expectedSourceSetRevision) {
          return { body: { status: 'conflict', failureCode: 'stale-current-pointer' }, init: { status: 409 } };
        }
        const ids = allocateIds(predecessor, allocateId);
        const nowValue = now();
        const planned = createMappingRevisionPublicationPlan({
          operationId,
          now: nowValue,
          ownerId: input.uid,
          authority,
          predecessor,
          predecessorScope: scope,
          targetManifest,
          ids,
          previewApproval,
        });
        const result = await service.publish({
          operationId,
          expectedCurrentPublicationId,
          manifestVersionId: ids.manifestVersionId,
          publicationId: ids.publicationId,
          publicationRevision: ids.publicationRevision,
          plan: planned.plan,
          now: nowValue,
          operationFingerprint,
        });
        return { body: { ...result, impact: planned.impact }, init: { status: statusFor(result) } };
      } catch (error) {
        if (error instanceof MappingRevisionWorkerError) return { body: { code: error.code }, init: { status: error.status } };
        return { body: { code: 'mapping_revision_failed' }, init: { status: 422 } };
      }
    },
  };
};
