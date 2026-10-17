import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type {
  BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  ComponentPdfActivityLineage,
  ComponentPdfValidatedActivityPayload,
} from '../../../../src/services/book-assembly/componentPdfPublication.adapter.ts';
import type {
  FullPdfActivityLineage,
  FullPdfValidatedActivityPayload,
} from '../../../../src/services/book-assembly/fullPdfPublication.adapter.ts';
import type {
  CanonicalActivityVersionWriter,
} from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyCurrentPublication } from '../../../../src/services/book-assembly/assemblyPublication.client.ts';
import type {
  BookAssemblyPreviewApprovalRecord,
  WholeActivationApprovalInput,
} from '../../../../src/services/book-assembly/unitPreview.service.ts';
import type {
  BookAssemblyPreviewApprovalRead,
} from '../../../../src/services/book-assembly/previewApproval.repository.ts';
import {
  createComponentPdfPublicationWorkerHandlers,
} from './component-pdf-publication-worker.ts';
import {
  createFullPdfPublicationWorkerHandlers,
} from './full-pdf-publication-worker.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepositoryEnv,
} from './publication-repository.ts';
import {
  FirebaseRestCanonicalActivityVersionWriter,
  type CanonicalActivityVersionWriterEnv,
} from './canonical-activity-version-repository.ts';
import {
  FirebaseRestBookAssemblyRepository,
  type BookAssemblyRepositoryEnv,
} from './repository.ts';
import type { BookAssemblyRepositoryPort } from './worker.ts';
import { createPublicBookReadinessProducer } from '../book-public/readiness-producer.ts';
import type { UnitActivityBindingRepository } from '../../../../src/services/book-assembly/unitActivityBinding.repository.ts';
import type { BookRouterEnv } from '../book-router.ts';

export interface BookAssemblyPublicationRouteInput {
  readonly request: Request;
  readonly env: BookRouterEnv;
  readonly uid: string;
  readonly bookId?: string;
}

type PublicationWorkerResult = { body: unknown; init: ResponseInit };

type DurablePreviewApproval = BookAssemblyPreviewApprovalRecord & {
  readonly revoked?: boolean;
  readonly revocation?: unknown;
  readonly revokedAt?: unknown;
};

type DurablePreviewApprovalRead = DurablePreviewApproval | BookAssemblyPreviewApprovalRead;

/** Normalize a durable revocation marker into the command's boolean fence. */
const normalizePreviewApproval = (
  value: DurablePreviewApprovalRead | null,
): DurablePreviewApproval | null => {
  if (!value) return null;
  if ('approval' in value && 'revocation' in value) {
    if (!value.approval) return null;
    return value.revocation ? { ...value.approval, revoked: true } : value.approval;
  }
  const revoked = value.revoked === true
    || (value.revocation !== undefined && value.revocation !== null)
    || (value.revokedAt !== undefined && value.revokedAt !== null);
  return revoked ? { ...value, revoked: true } : value;
};

export interface BookAssemblyPublicationReaderContext {
  readonly env: BookRouterEnv;
  readonly actorId: string;
  readonly bookId: string;
  readonly unitKey?: string;
  readonly candidateId?: string;
}

export interface FullPdfPublicationRoutePorts {
  /** Authenticated actor profile; supplied by server composition, never request data. */
  readonly readUser: (context: Pick<BookAssemblyPublicationReaderContext, 'env' | 'actorId'>) => Promise<unknown>;
  readonly readAuthority: (
    context: BookAssemblyPublicationReaderContext,
  ) => Promise<BookAssemblyBookAuthority | null>;
  readonly readCandidate?: (
    context: Required<BookAssemblyPublicationReaderContext>,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readLineage?: (
    context: Omit<Required<BookAssemblyPublicationReaderContext>, 'candidateId'>,
    authority?: BookAssemblyBookAuthority,
    candidate?: BookAssemblyCandidateRecord,
  ) => Promise<Readonly<Record<string, FullPdfActivityLineage>>>;
  readonly readActivities: (
    context: BookAssemblyPublicationReaderContext & {
      readonly ownerId: string;
      readonly activityKeys: readonly string[];
      readonly authority?: BookAssemblyBookAuthority;
      readonly candidate?: BookAssemblyCandidateRecord;
    },
  ) => Promise<Readonly<Record<string, FullPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    context: {
      readonly env: BookRouterEnv;
      readonly actorId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly approvalId: string;
    },
  ) => Promise<DurablePreviewApprovalRead | null>;
  readonly sourceIsPreviewReady: (
    context: BookAssemblyPublicationReaderContext & { readonly sourceVersionId: string; readonly authority?: BookAssemblyBookAuthority },
  ) => Promise<boolean>;
}

export interface ComponentPdfPublicationRoutePorts {
  readonly readUser: (context: Pick<BookAssemblyPublicationReaderContext, 'env' | 'actorId'>) => Promise<unknown>;
  readonly readAuthority: (
    context: BookAssemblyPublicationReaderContext,
  ) => Promise<BookAssemblyBookAuthority | null>;
  readonly readWholeActivationApprovalInput: (
    context: Omit<BookAssemblyPublicationReaderContext, 'unitKey' | 'candidateId'>,
  ) => Promise<WholeActivationApprovalInput | null>;
  readonly readCandidate?: (
    context: Required<BookAssemblyPublicationReaderContext>,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readLineage?: (
    context: Omit<Required<BookAssemblyPublicationReaderContext>, 'candidateId'>,
  ) => Promise<Readonly<Record<string, ComponentPdfActivityLineage>>>;
  readonly readActivities: (
    context: BookAssemblyPublicationReaderContext & {
      readonly ownerId: string;
      readonly activityKeys: readonly string[];
    },
  ) => Promise<Readonly<Record<string, ComponentPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    context: {
      readonly env: BookRouterEnv;
      readonly actorId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly approvalId: string;
    },
  ) => Promise<DurablePreviewApprovalRead | null>;
  readonly sourceIsPreviewReady: (
    context: BookAssemblyPublicationReaderContext & { readonly sourceVersionId: string },
  ) => Promise<boolean>;
}

export interface BookAssemblyPublicationRouteOptions {
  /** #64 durable repository. Never replace this with the in-memory test port. */
  readonly repositoryFactory?: (
    env: BookRouterEnv,
    ownerId: string,
  ) => BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  /** #64 exact immutable Activity Version writer. Uses its dedicated identity. */
  readonly activityVersionWriterFactory?: (
    env: BookRouterEnv,
  ) => CanonicalActivityVersionWriter;
  /** #55 candidate repository/read seam. */
  readonly candidateRepositoryFactory?: (
    env: BookRouterEnv,
    ownerId: string,
  ) => Pick<BookAssemblyRepositoryPort, 'readScope'>;
  /** #59 durable tuple authority. Publication fills only its exact version fields. */
  readonly bindingRepositoryFactory?: (
    env: BookRouterEnv, ownerId: string, bookId: string, unitKey: string,
  ) => UnitActivityBindingRepository;
  /** Trusted server-side allocation hooks. Client requests never supply these. */
  readonly allocateOperationId?: () => string;
  readonly allocateId?: (kind: string, key: string) => string;
  readonly now?: () => string;
  readonly fullPdf?: FullPdfPublicationRoutePorts;
  readonly componentPdf?: ComponentPdfPublicationRoutePorts;
}

export interface BookAssemblyPublicationRouteHandlers {
  readonly fullPdfPublish: (
    input: BookAssemblyPublicationRouteInput,
  ) => Promise<PublicationWorkerResult>;
  readonly componentPdfPublish: (
    input: BookAssemblyPublicationRouteInput,
  ) => Promise<PublicationWorkerResult>;
  readonly currentPublication: (
    input: BookAssemblyPublicationRouteInput,
  ) => Promise<PublicationWorkerResult>;
}

const unavailable = (code: string) => async (): Promise<PublicationWorkerResult> => ({
  body: { code },
  init: { status: 503 },
});

const defaultRepositoryFactory = (
  env: BookRouterEnv,
  ownerId: string,
): BookAssemblyPublicationRepository<BookAssemblyPublicationResult> => {
  const readiness = createPublicBookReadinessProducer(env as BookAssemblyPublicationRepositoryEnv, ownerId);
  return new FirebaseRestBookAssemblyPublicationRepository({
    env: env as BookAssemblyPublicationRepositoryEnv,
    ownerId,
    clearPublicReadiness: readiness.clear,
    refreshPublicReadiness: readiness.refresh,
  });
};

const defaultCandidateRepositoryFactory = (
  env: BookRouterEnv,
  ownerId: string,
): Pick<BookAssemblyRepositoryPort, 'readScope'> => (
  new FirebaseRestBookAssemblyRepository({
    env: env as BookAssemblyRepositoryEnv,
    ownerId,
  })
);

const defaultActivityVersionWriterFactory = (
  env: BookRouterEnv,
): CanonicalActivityVersionWriter => (
  new FirebaseRestCanonicalActivityVersionWriter({
    env: env as CanonicalActivityVersionWriterEnv,
  })
);

const readCandidate = async (
  options: BookAssemblyPublicationRouteOptions,
  input: BookAssemblyPublicationRouteInput,
  bookId: string,
  unitKey: string,
  candidateId: string,
  ownerId: string,
  reader: FullPdfPublicationRoutePorts['readCandidate']
    | ComponentPdfPublicationRoutePorts['readCandidate'],
): Promise<BookAssemblyCandidateRecord | null> => {
  if (reader) return reader({ env: input.env, actorId: ownerId, bookId, unitKey, candidateId });
  const repository = (options.candidateRepositoryFactory ?? defaultCandidateRepositoryFactory)(input.env, ownerId);
  const scope = await repository.readScope(bookId, unitKey);
  return scope.candidates?.[candidateId] ?? null;
};

const recordPublishedBindings = async (
  options: BookAssemblyPublicationRouteOptions,
  input: BookAssemblyPublicationRouteInput,
  result: PublicationWorkerResult,
  requestBody: Record<string, unknown> | null,
): Promise<PublicationWorkerResult> => {
  if (!options.bindingRepositoryFactory) return result;
  const workerReceipt = result.body as {
    operationId?: unknown;
    manifestVersionId?: unknown;
    publicationId?: unknown;
    publicationRevision?: unknown;
    result?: { status?: unknown; failureCode?: unknown };
  };
  const recoversCommittedPublication = result.init.status === 409
    && workerReceipt.result?.status === 'conflict'
    && workerReceipt.result.failureCode === 'stale-current-pointer';
  if (result.init.status !== 200 && !recoversCommittedPublication) return result;
  if (!requestBody || typeof requestBody.bookId !== 'string') {
    throw new Error('book_assembly_activity_binding_committed_version_unavailable');
  }
  const requestUnits = Array.isArray(requestBody.unitApprovals)
    ? requestBody.unitApprovals.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const row = value as Record<string, unknown>;
      return typeof row.unitKey === 'string' && typeof row.candidateId === 'string'
        && Number.isSafeInteger(row.candidateRevision)
        ? { unitKey: row.unitKey, candidateId: row.candidateId, candidateRevision: row.candidateRevision as number }
        : null;
    })
    : typeof requestBody.unitKey === 'string' && typeof requestBody.candidateId === 'string'
      && Number.isSafeInteger(requestBody.expectedCandidateRevision)
      ? [{ unitKey: requestBody.unitKey, candidateId: requestBody.candidateId,
        candidateRevision: requestBody.expectedCandidateRevision as number }]
      : [];
  if (requestUnits.length === 0 || requestUnits.some((unit) => unit === null)
    || new Set(requestUnits.map((unit) => unit!.unitKey)).size !== requestUnits.length) {
    throw new Error('book_assembly_activity_binding_committed_version_unavailable');
  }
  const scope = await (options.repositoryFactory ?? defaultRepositoryFactory)(input.env, input.uid)
    .readScope(requestBody.bookId);
  let receipt = result;
  let manifestVersionId = typeof workerReceipt.manifestVersionId === 'string'
    ? workerReceipt.manifestVersionId
    : undefined;
  if (result.init.status !== 200) {
    const current = scope.current;
    const currentVersion = current ? scope.versions?.[current.manifestVersionId] : undefined;
    const operation = currentVersion ? scope.operations?.[currentVersion.createdByCommandId] : undefined;
    const operationResult = operation?.result;
    const expectedCandidateRevision = requestBody.expectedCandidateRevision;
    const expectedBookRevision = requestBody.expectedBookRevision;
    const expectedSourceSetRevision = requestBody.expectedSourceSetRevision;
    const multiUnit = Array.isArray(requestBody.unitApprovals);
    const operationCommitted = operationResult?.status === 'published' || operationResult?.status === 'replayed';
    if (!current || !currentVersion || !operation || !operationCommitted
      || operation.ownerId !== input.uid
      || currentVersion.ownerId !== input.uid
      || currentVersion.bookId !== requestBody.bookId
      || (!multiUnit && (currentVersion.candidateId !== requestUnits[0]!.candidateId
        || currentVersion.candidateRevision !== expectedCandidateRevision))
      || currentVersion.bookRevision !== expectedBookRevision
      || currentVersion.sourceSetRevision !== expectedSourceSetRevision
      || currentVersion.manifest.units.length !== requestUnits.length
      || requestUnits.some((requestUnit) => currentVersion.manifest.units
        .filter((unit) => unit.unitKey === requestUnit!.unitKey).length !== 1)
      || operationResult.pointer?.manifestVersionId !== currentVersion.manifestVersionId
      || operationResult.pointer?.publicationId !== currentVersion.publicationId
      || operationResult.pointer?.publicationRevision !== currentVersion.publicationRevision
      || operationResult.version?.manifestVersionId !== currentVersion.manifestVersionId
      || operationResult.version?.publicationId !== currentVersion.publicationId
      || operationResult.version?.publicationRevision !== currentVersion.publicationRevision) return result;
    manifestVersionId = currentVersion.manifestVersionId;
    receipt = {
      body: {
        operationId: currentVersion.createdByCommandId,
        manifestVersionId,
        publicationId: currentVersion.publicationId,
        publicationRevision: currentVersion.publicationRevision,
        result: { ...operationResult, status: 'replayed' },
      },
      init: { status: 200 },
    };
  }
  if (!manifestVersionId) {
    throw new Error('book_assembly_activity_binding_committed_version_unavailable');
  }
  const version = scope.versions?.[manifestVersionId];
  if (!version || version.ownerId !== input.uid || version.bookId !== requestBody.bookId
    || version.manifestVersionId !== manifestVersionId) {
    throw new Error('book_assembly_activity_binding_committed_version_unavailable');
  }
  const activityVersions = scope.activityVersions ?? {};
  const activation = Array.isArray(requestBody.unitApprovals)
    ? await options.componentPdf?.readWholeActivationApprovalInput({
      env: input.env, actorId: input.uid, bookId: requestBody.bookId,
    })
    : null;
  if (Array.isArray(requestBody.unitApprovals) && (!activation
    || activation.ownerId !== input.uid || activation.bookId !== version.bookId
    || activation.bookRevision !== version.bookRevision
    || activation.sourceSetRevision !== version.sourceSetRevision)) {
    throw new Error('book_assembly_activity_binding_conflict');
  }
  for (const requestUnit of requestUnits) {
    const unitKey = requestUnit!.unitKey;
    const expectedKeys = version.manifest.units.find((unit) => unit.unitKey === unitKey)
      ?.activitySlots.map((slot) => slot.activityKey);
    if (!expectedKeys || expectedKeys.length === 0 || new Set(expectedKeys).size !== expectedKeys.length) {
      throw new Error('book_assembly_activity_binding_expected_keys_unavailable');
    }
    const committed = new Map<string, typeof activityVersions[string]>();
    for (const candidate of Object.values(activityVersions)) {
      if (candidate.manifestVersionId !== manifestVersionId || candidate.unitKey !== unitKey) continue;
      if (!expectedKeys.includes(candidate.activityKey) || committed.has(candidate.activityKey)) {
        throw new Error('book_assembly_activity_binding_committed_version_invalid');
      }
      committed.set(candidate.activityKey, candidate);
    }
    if (committed.size !== expectedKeys.length) throw new Error('book_assembly_activity_binding_committed_version_missing');
    const repository = options.bindingRepositoryFactory(input.env, input.uid, requestBody.bookId, unitKey);
    for (const activityKey of expectedKeys) {
      const versionRecord = committed.get(activityKey)!;
      const binding = await repository.read({ ownerId: input.uid, bookId: requestBody.bookId, unitKey, activityKey });
      const pinned = activation?.activationReceipt.activities.find((activity) =>
        activity.unitKey === unitKey && activity.activityKey === activityKey);
      if (!binding || binding.activityId !== versionRecord.activityId
        || binding.candidateLifecycle !== 'saved'
        || (activation && (!pinned || binding.activityId !== pinned.activityId
          || binding.candidateId !== pinned.activityCandidateId
          || binding.candidateRevision !== pinned.activityCandidateRevision))) {
        throw new Error('book_assembly_activity_binding_conflict');
      }
      const status = await repository.recordPublication({
        ownerId: input.uid, bookId: requestBody.bookId, unitKey, activityKey,
        activityId: binding.activityId, candidateId: binding.candidateId, candidateRevision: binding.candidateRevision,
        activityVersionId: versionRecord.activityVersionId, activityVersion: versionRecord.activityVersion,
      });
      if (status === 'conflict' || status === 'stale') throw new Error('book_assembly_activity_binding_conflict');
    }
  }
  return receipt;
};

const createFullPdfHandler = (
  options: BookAssemblyPublicationRouteOptions,
): BookAssemblyPublicationRouteHandlers['fullPdfPublish'] => {
  const ports = options.fullPdf;
  if (!ports) return unavailable('book_full_pdf_publication_dependencies_unavailable');
  return async (input) => {
    let worker: ReturnType<typeof createFullPdfPublicationWorkerHandlers>;
    try {
      worker = createFullPdfPublicationWorkerHandlers({
        readUser: (uid) => ports.readUser({ env: input.env, actorId: uid }),
        repository: (options.repositoryFactory ?? defaultRepositoryFactory)(input.env, input.uid),
        activityVersionWriter: (
          options.activityVersionWriterFactory ?? defaultActivityVersionWriterFactory
        )(input.env),
        readCandidate: (bookId, unitKey, candidateId) => readCandidate(
          options,
          input,
          bookId,
          unitKey,
          candidateId,
          input.uid,
          ports.readCandidate,
        ),
        readAuthority: (bookId) => ports.readAuthority({ env: input.env, actorId: input.uid, bookId }),
        readActivities: ({ ownerId, bookId, unitKey, activityKeys, authority, candidate }) => ports.readActivities({
          env: input.env, actorId: input.uid,
          bookId,
          unitKey,
          ownerId,
          activityKeys,
          authority,
          candidate,
        }),
        readPreviewApproval: ({ bookId, unitKey, approvalId }) => ports.readPreviewApproval({
          env: input.env, actorId: input.uid,
          bookId,
          unitKey,
          approvalId,
        }).then(normalizePreviewApproval),
        sourceIsPreviewReady: ({ bookId, sourceVersionId, authority }) => ports.sourceIsPreviewReady({
          env: input.env, actorId: input.uid,
          bookId,
          sourceVersionId,
          authority,
        }),
        ...(ports.readLineage ? {
        readLineage: (bookId: string, unitKey: string, authority, candidate) => ports.readLineage!({
            env: input.env, actorId: input.uid,
            bookId,
            unitKey,
          }, authority, candidate),
        } : {}),
        ...(options.allocateOperationId ? { allocateOperationId: options.allocateOperationId } : {}),
        ...(options.allocateId ? { allocateId: options.allocateId } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
    } catch {
      return { body: { code: 'book_full_pdf_publication_dependencies_unavailable' }, init: { status: 503 } };
    }
    const requestBody = await input.request.clone().json().catch(() => null) as Record<string, unknown> | null;
    const result = await worker.publish({
      request: input.request,
      env: input.env,
      uid: input.uid,
    });
    try { return await recordPublishedBindings(options, input, result, requestBody); } catch (error) {
      console.error('Book assembly Activity binding reconciliation failed',
        error instanceof Error ? error.message : 'unknown_error');
      return { body: { code: 'book_assembly_activity_binding_unavailable' }, init: { status: 503 } };
    }
  };
};

const createComponentPdfHandler = (
  options: BookAssemblyPublicationRouteOptions,
): BookAssemblyPublicationRouteHandlers['componentPdfPublish'] => {
  const ports = options.componentPdf;
  if (!ports) return unavailable('book_component_pdf_publication_dependencies_unavailable');
  return async (input) => {
    let worker: ReturnType<typeof createComponentPdfPublicationWorkerHandlers>;
    try {
      worker = createComponentPdfPublicationWorkerHandlers({
        readUser: (uid) => ports.readUser({ env: input.env, actorId: uid }),
        repository: (options.repositoryFactory ?? defaultRepositoryFactory)(input.env, input.uid),
        activityVersionWriter: (
          options.activityVersionWriterFactory ?? defaultActivityVersionWriterFactory
        )(input.env),
        readCandidate: (bookId, unitKey, candidateId) => readCandidate(
          options,
          input,
          bookId,
          unitKey,
          candidateId,
          input.uid,
          ports.readCandidate,
        ),
        readAuthority: (bookId) => ports.readAuthority({ env: input.env, actorId: input.uid, bookId }),
        readWholeActivationApprovalInput: (bookId) => ports.readWholeActivationApprovalInput({
          env: input.env, actorId: input.uid, bookId,
        }),
        readActivities: ({ ownerId, bookId, unitKey, activityKeys }) => ports.readActivities({
          env: input.env, actorId: input.uid,
          bookId,
          unitKey,
          ownerId,
          activityKeys,
        }),
        readPreviewApproval: ({ bookId, unitKey, approvalId }) => ports.readPreviewApproval({
          env: input.env, actorId: input.uid,
          bookId,
          unitKey,
          approvalId,
        }).then(normalizePreviewApproval),
        sourceIsPreviewReady: ({ bookId, sourceVersionId }) => ports.sourceIsPreviewReady({
          env: input.env, actorId: input.uid,
          bookId,
          sourceVersionId,
        }),
        ...(ports.readLineage ? {
          readLineage: (bookId: string, unitKey: string) => ports.readLineage!({
            env: input.env, actorId: input.uid,
            bookId,
            unitKey,
          }),
        } : {}),
        ...(options.allocateOperationId ? { allocateOperationId: options.allocateOperationId } : {}),
        ...(options.allocateId ? { allocateId: options.allocateId } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
    } catch {
      return { body: { code: 'book_component_pdf_publication_dependencies_unavailable' }, init: { status: 503 } };
    }
    const requestBody = await input.request.clone().json().catch(() => null) as Record<string, unknown> | null;
    const result = await worker.publish({
      request: input.request,
      env: input.env,
      uid: input.uid,
    });
    try { return await recordPublishedBindings(options, input, result, requestBody); } catch {
      return { body: { code: 'book_assembly_activity_binding_unavailable' }, init: { status: 503 } };
    }
  };
};

const createCurrentPublicationHandler = (
  options: BookAssemblyPublicationRouteOptions,
): BookAssemblyPublicationRouteHandlers['currentPublication'] => async (input) => {
  if (!input.bookId) return { body: { code: 'invalid_book_id' }, init: { status: 400 } };
  try {
    const scope = await (options.repositoryFactory ?? defaultRepositoryFactory)(input.env, input.uid)
      .readScope(input.bookId);
    const publication = scope.current ?? null;
    if (publication) {
      const version = scope.versions?.[publication.manifestVersionId];
      const units = version?.studentSafeProjection.units;
      if (!version || version.bookId !== input.bookId || version.ownerId !== input.uid
        || version.publicationId !== publication.publicationId
        || version.publicationRevision !== publication.publicationRevision
        || !Array.isArray(units) || units.length === 0
        || new Set(units.map((unit) => unit.unitKey)).size !== units.length) {
        return { body: { code: 'book_assembly_publication_owner_required' }, init: { status: 403 } };
      }
      const currentPublication: BookAssemblyCurrentPublication = { pointer: publication, units };
      return {
        body: { status: 'published', pointer: currentPublication.pointer, units: currentPublication.units },
        init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
      };
    }
    return {
      body: { status: 'empty' },
      init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'book_assembly_publication_owner_mismatch') {
      return { body: { code: 'book_assembly_publication_owner_required' }, init: { status: 403 } };
    }
    return { body: { code: 'book_assembly_publication_unavailable' }, init: { status: 503 } };
  }
};

export const createBookAssemblyPublicationRouteHandlers = (
  options: BookAssemblyPublicationRouteOptions = {},
): BookAssemblyPublicationRouteHandlers => ({
  fullPdfPublish: createFullPdfHandler(options),
  componentPdfPublish: createComponentPdfHandler(options),
  currentPublication: createCurrentPublicationHandler(options),
});
