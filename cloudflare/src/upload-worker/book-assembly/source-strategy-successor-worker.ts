import {
  createBookAssemblyPublicationService,
  fingerprintBookAssemblyOperation,
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type {
  BookAssemblyBookAuthority,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { SourceStrategySuccessorPublicationIds } from '../../../../src/services/book-assembly/sourceStrategySuccessor.service.ts';
import {
  createPublishedSourceStrategySuccessorAdapter,
  type PublishedSourceStrategySuccessorAdapter,
} from '../../../../src/services/book-assembly/unitPublish.service.ts';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPreviewApprovalReference,
  BookSourceStrategy,
  SourceSetCandidate,
} from '../../../../src/types/bookAssembly.types.ts';
import type { SourceStrategyMigrationRemap } from '../../../../src/services/book-assembly/sourceStrategyMigration.service.ts';

const MAX_BODY_BYTES = 256_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STRATEGIES = new Set<BookSourceStrategy>(['full_pdf', 'component_pdfs']);

export class SourceStrategySuccessorWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'SourceStrategySuccessorWorkerError';
  }
}

export interface SourceStrategySuccessorWorkerEnv {
  readonly BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED?: string;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

export interface SourceStrategySuccessorWorkerOptions {
  readonly repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  readonly readAuthority: (bookId: string) => Promise<BookAssemblyBookAuthority | null>;
  readonly successorAdapter?: PublishedSourceStrategySuccessorAdapter;
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
    throw new SourceStrategySuccessorWorkerError(code);
  }
  return record;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new SourceStrategySuccessorWorkerError(code);
  }
  return value;
};

const uuid = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new SourceStrategySuccessorWorkerError(code);
  }
  return value;
};

const revision = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SourceStrategySuccessorWorkerError(code);
  }
  return value as number;
};

const nullableId = (value: unknown, code: string): string | null => (
  value === null ? null : id(value, code)
);

const parseStrategy = (value: unknown): BookSourceStrategy => {
  if (typeof value !== 'string' || !STRATEGIES.has(value as BookSourceStrategy)) {
    throw new SourceStrategySuccessorWorkerError('invalid_source_strategy');
  }
  return value as BookSourceStrategy;
};

const parseSourceSet = (value: unknown): SourceSetCandidate => {
  const record = exact(value, ['sourceStrategy', 'sources']);
  const sourceStrategy = parseStrategy(record.sourceStrategy);
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    throw new SourceStrategySuccessorWorkerError('invalid_target_source_set');
  }
  const sources = record.sources.map((entry, index) => {
    const source = exact(
      entry,
      sourceStrategy === 'full_pdf'
        ? ['sourceKey', 'sourceVersionId', 'sourceOrder']
        : ['sourceKey', 'sourceVersionId', 'sourceOrder', 'ownerNodeKey'],
      'invalid_target_source',
    );
    const parsed = {
      sourceKey: id(source.sourceKey, 'invalid_source_key'),
      sourceVersionId: id(source.sourceVersionId, 'invalid_source_version_id'),
      sourceOrder: revision(source.sourceOrder, 'invalid_source_order'),
      ...(sourceStrategy === 'component_pdfs'
        ? { ownerNodeKey: id(source.ownerNodeKey, 'invalid_component_owner') }
        : {}),
    } as const;
    if (parsed.sourceOrder < 1) throw new SourceStrategySuccessorWorkerError('invalid_source_order');
    return parsed;
  });
  if (sourceStrategy === 'full_pdf' && sources.length !== 1) {
    throw new SourceStrategySuccessorWorkerError('full_pdf_requires_one_source');
  }
  if (new Set(sources.map((source) => source.sourceKey)).size !== sources.length
    || new Set(sources.map((source) => source.sourceOrder)).size !== sources.length) {
    throw new SourceStrategySuccessorWorkerError('duplicate_source');
  }
  return sourceStrategy === 'full_pdf'
    ? { sourceStrategy, sources: [sources[0]!] }
    : { sourceStrategy, sources };
};

const page = (value: unknown): { sourceKey: string; physicalPageNumber: number } => {
  const record = exact(value, ['sourceKey', 'physicalPageNumber'], 'invalid_remap_page');
  const physicalPageNumber = revision(record.physicalPageNumber, 'invalid_physical_page');
  if (physicalPageNumber < 1) throw new SourceStrategySuccessorWorkerError('invalid_physical_page');
  return {
    sourceKey: id(record.sourceKey, 'invalid_source_key'),
    physicalPageNumber,
  };
};

const parseRemaps = (value: unknown): readonly SourceStrategyMigrationRemap[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new SourceStrategySuccessorWorkerError('invalid_remaps');
  const seen = new Set<string>();
  return value.map((entry) => {
    const record = exact(entry, ['pageGroupKey', 'pages'], 'invalid_remap');
    const pageGroupKey = id(record.pageGroupKey, 'invalid_page_group_key');
    if (seen.has(pageGroupKey)) throw new SourceStrategySuccessorWorkerError('duplicate_remap');
    seen.add(pageGroupKey);
    if (!Array.isArray(record.pages) || record.pages.length === 0) {
      throw new SourceStrategySuccessorWorkerError('invalid_remap_pages');
    }
    return {
      pageGroupKey,
      pages: record.pages.map((pair) => {
        const parsed = exact(pair, ['from', 'to'], 'invalid_remap_page');
        return { from: page(parsed.from), to: page(parsed.to) };
      }),
    };
  });
};

const parseApproval = (value: unknown): BookAssemblyPreviewApprovalReference => {
  const record = exact(value, ['approvalId', 'approvalRevision', 'approvedAt', 'expiresAt'], 'invalid_preview_approval');
  const approvedAt = id(record.approvedAt, 'invalid_preview_approval');
  const expiresAt = id(record.expiresAt, 'invalid_preview_approval');
  if (!Number.isFinite(Date.parse(approvedAt)) || !Number.isFinite(Date.parse(expiresAt))) {
    throw new SourceStrategySuccessorWorkerError('invalid_preview_approval');
  }
  const approvalRevision = revision(record.approvalRevision, 'invalid_preview_approval');
  if (approvalRevision < 1) throw new SourceStrategySuccessorWorkerError('invalid_preview_approval');
  return {
    approvalId: id(record.approvalId, 'invalid_preview_approval'),
    approvalRevision,
    approvedAt,
    expiresAt,
  };
};

const readBody = async (request: Request): Promise<RecordValue> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new SourceStrategySuccessorWorkerError('content_type_required');
  }
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new SourceStrategySuccessorWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new SourceStrategySuccessorWorkerError('body_too_large', 413);
  }
  try {
    return exact(JSON.parse(text) as unknown, [
      'bookId',
      'expectedCurrentPublicationId',
      'expectedBookRevision',
      'expectedSourceSetRevision',
      'targetSourceSetRevision',
      'targetSourceSet',
      'remaps',
      'previewApproval',
    ]);
  } catch (error) {
    if (error instanceof SourceStrategySuccessorWorkerError) throw error;
    throw new SourceStrategySuccessorWorkerError('invalid_json');
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
  if (result.status === 'forbidden') return 403;
  return 422;
};

const currentVersion = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
): BookAssemblyImmutableManifestVersion | null => {
  const pointer = scope.current;
  if (!pointer) return null;
  return scope.versions?.[pointer.manifestVersionId] ?? null;
};

const allocateIds = (
  predecessor: BookAssemblyImmutableManifestVersion,
  targetSourceSetRevision: number,
  allocateId: (kind: string, key: string) => string,
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
): SourceStrategySuccessorPublicationIds => {
  const successorKey = `${predecessor.bookId}:${predecessor.publicationId}:${targetSourceSetRevision}`;
  const activitiesByKey: Record<string, SourceStrategySuccessorPublicationIds['activitiesByKey'][string]> = {};
  for (const unit of predecessor.manifest.units) {
    for (const slot of unit.activitySlots) {
      const key = `${unit.unitKey}:${slot.activityKey}`;
      const current = Object.values(scope.activityVersions ?? {})
        .filter((record) => record.manifestVersionId === predecessor.manifestVersionId
          && record.unitKey === unit.unitKey
          && record.activityKey === slot.activityKey)
        .sort((left, right) => right.activityVersion - left.activityVersion)[0];
      activitiesByKey[key] = {
        activityId: current?.activityId ?? allocateId('activity', key),
        activityVersionId: allocateId('activity-version', successorKey + ':' + key),
        activityVersion: (current?.activityVersion ?? 0) + 1,
        projectionId: allocateId('activity-projection', successorKey + ':' + key),
        placementId: allocateId('placement', successorKey + ':' + key),
      };
    }
  }
  return {
    planId: allocateId('plan', successorKey),
    manifestVersionId: allocateId('manifest-version', successorKey),
    publicationId: allocateId('publication', successorKey),
    publicationRevision: predecessor.publicationRevision + 1,
    unitProjectionIds: Object.fromEntries(predecessor.manifest.units.map((unit) => [
      unit.unitKey,
      allocateId('unit-projection', successorKey + ':' + unit.unitKey),
    ])),
    deliveryPlanIds: Object.fromEntries(predecessor.manifest.units.map((unit) => [
      unit.unitKey,
      allocateId('delivery-plan', successorKey + ':' + unit.unitKey),
    ])),
    activitiesByKey,
  };
};

export const createSourceStrategySuccessorWorkerHandlers = (options: SourceStrategySuccessorWorkerOptions) => {
  const now = options.now ?? (() => new Date().toISOString());
  const allocateOperationId = options.allocateOperationId ?? (() => crypto.randomUUID());
  const allocateId = options.allocateId ?? ((kind, key) => `${kind}-${key}-${crypto.randomUUID()}`);
  const service = createBookAssemblyPublicationService(options.repository);
  const successorAdapter = options.successorAdapter ?? createPublishedSourceStrategySuccessorAdapter();

  return {
    async publish(input: {
      readonly request: Request;
      readonly env: SourceStrategySuccessorWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        if (!input.env.readDatabaseValue) {
          throw new SourceStrategySuccessorWorkerError('successor_auth_reader_missing', 503);
        }
        if (!roleAllowed(await input.env.readDatabaseValue(`users/${input.uid}`))) {
          throw new SourceStrategySuccessorWorkerError('source_strategy_successor_forbidden', 403);
        }
        if (input.env.BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED !== 'true') {
          return { body: { code: 'book_source_strategy_successor_disabled' }, init: { status: 503 } };
        }
        const body = await readBody(input.request);
        const bookId = id(body.bookId, 'invalid_book_id');
        const expectedCurrentPublicationId = id(
          body.expectedCurrentPublicationId,
          'invalid_expected_current_publication_id',
        );
        const expectedBookRevision = revision(body.expectedBookRevision, 'invalid_expected_book_revision');
        const expectedSourceSetRevision = revision(body.expectedSourceSetRevision, 'invalid_expected_source_set_revision');
        const targetSourceSetRevision = revision(body.targetSourceSetRevision, 'invalid_target_source_set_revision');
        const targetSourceSet = parseSourceSet(body.targetSourceSet);
        const remaps = parseRemaps(body.remaps);
        const previewApproval = parseApproval(body.previewApproval);
        const nowValue = now();
        const nowMs = Date.parse(nowValue);
        const approvedAtMs = Date.parse(previewApproval.approvedAt);
        const expiresAtMs = Date.parse(previewApproval.expiresAt);
        if (!Number.isFinite(nowMs) || !Number.isFinite(approvedAtMs)
          || !Number.isFinite(expiresAtMs)
          || approvedAtMs > nowMs || expiresAtMs <= nowMs || expiresAtMs <= approvedAtMs) {
          throw new SourceStrategySuccessorWorkerError('preview_approval_expired');
        }
        const operationId = uuid(
          input.request.headers.get('Idempotency-Key') ?? allocateOperationId(),
          'invalid_operation_id',
        );
        const operationFingerprint = fingerprintBookAssemblyOperation({
          action: 'source-strategy-successor',
          ownerId: input.uid,
          bookId,
          expectedCurrentPublicationId,
          expectedBookRevision,
          expectedSourceSetRevision,
          targetSourceSetRevision,
          targetSourceSet,
          remaps: remaps ?? null,
          previewApproval,
        });
        const scope = await options.repository.readScope(bookId);
        const stored = scope.operations?.[operationId];
        if (stored) {
          if (stored.ownerId !== input.uid || stored.fingerprint !== operationFingerprint) {
            return {
              body: { status: 'idempotency-conflict', failureCode: 'idempotency-conflict' },
              init: { status: 409 },
            };
          }
          return {
            body: { ...stored.result, status: 'replayed' },
            init: { status: 200 },
          };
        }
        const authority = await options.readAuthority(bookId);
        const predecessor = currentVersion(scope);
        if (!authority || !predecessor || scope.current?.publicationId !== expectedCurrentPublicationId) {
          return { body: { status: 'conflict', failureCode: 'stale-current-pointer' }, init: { status: 409 } };
        }
        if (predecessor.bookRevision !== expectedBookRevision
          || predecessor.sourceSetRevision !== expectedSourceSetRevision) {
          return { body: { status: 'conflict', failureCode: 'stale-current-pointer' }, init: { status: 409 } };
        }
        const ids = allocateIds(predecessor, targetSourceSetRevision, allocateId, scope);
        const planned = successorAdapter.createPlan({
          operationId,
          now: nowValue,
          ownerId: input.uid,
          authority,
          predecessor,
          predecessorScope: scope,
          target: { sourceSetRevision: targetSourceSetRevision, sourceSet: targetSourceSet },
          remaps,
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
        return {
          body: { ...result, impact: planned.impact },
          init: { status: statusFor(result) },
        };
      } catch (error) {
        if (error instanceof SourceStrategySuccessorWorkerError) {
          return { body: { code: error.code }, init: { status: error.status } };
        }
        return { body: { code: 'book_source_strategy_successor_failed' }, init: { status: 422 } };
      }
    },
  };
};
