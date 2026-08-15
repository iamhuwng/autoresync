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
import type {
  BookAssemblyPreviewApprovalRecord,
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
import type { UnitActivityBindingRepository } from '../../../../src/services/book-assembly/unitActivityBinding.repository.ts';
import type { BookRouterEnv } from '../book-router.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';

export interface BookAssemblyPublicationRouteInput {
  readonly request: Request;
  readonly env: BookRouterEnv;
  readonly uid: string;
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
  ) => Promise<Readonly<Record<string, FullPdfActivityLineage>>>;
  readonly readActivities: (
    context: BookAssemblyPublicationReaderContext & {
      readonly ownerId: string;
      readonly activityKeys: readonly string[];
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
    context: BookAssemblyPublicationReaderContext & { readonly sourceVersionId: string },
  ) => Promise<boolean>;
}

export interface ComponentPdfPublicationRoutePorts {
  readonly readAuthority: (
    context: BookAssemblyPublicationReaderContext,
  ) => Promise<BookAssemblyBookAuthority | null>;
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
}

const unavailable = (code: string) => async (): Promise<PublicationWorkerResult> => ({
  body: { code },
  init: { status: 503 },
});

const defaultRepositoryFactory = (
  env: BookRouterEnv,
  ownerId: string,
): BookAssemblyPublicationRepository<BookAssemblyPublicationResult> => (
  new FirebaseRestBookAssemblyPublicationRepository({
    env: env as BookAssemblyPublicationRepositoryEnv,
    ownerId,
  })
);

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

/** Read only the Book subject needed by the pilot guard without consuming the request body. */
const requestedBookId = async (request: Request): Promise<string | undefined> => {
  try {
    const value = await request.clone().json() as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const bookId = (value as Record<string, unknown>).bookId;
    return typeof bookId === 'string' ? bookId : undefined;
  } catch {
    return undefined;
  }
};

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
  if (reader) return reader({ env: input.env, bookId, unitKey, candidateId });
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
  if (!requestBody || typeof requestBody.bookId !== 'string' || typeof requestBody.unitKey !== 'string') {
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
    const candidateId = requestBody.candidateId;
    const unitKey = requestBody.unitKey;
    const operationCommitted = operationResult?.status === 'published' || operationResult?.status === 'replayed';
    if (!current || !currentVersion || !operation || !operationCommitted
      || operation.ownerId !== input.uid
      || currentVersion.ownerId !== input.uid
      || currentVersion.bookId !== requestBody.bookId
      || currentVersion.candidateId !== candidateId
      || currentVersion.candidateRevision !== expectedCandidateRevision
      || currentVersion.bookRevision !== expectedBookRevision
      || currentVersion.sourceSetRevision !== expectedSourceSetRevision
      || currentVersion.manifest.units.filter((unit) => unit.unitKey === unitKey).length !== 1
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
  const expectedKeys = version.manifest.units.find((unit) => unit.unitKey === requestBody.unitKey)
    ?.activitySlots.map((slot) => slot.activityKey);
  if (!expectedKeys || expectedKeys.length === 0 || new Set(expectedKeys).size !== expectedKeys.length) {
    throw new Error('book_assembly_activity_binding_expected_keys_unavailable');
  }
  const activityVersions = scope.activityVersions ?? {};
  const committed = new Map<string, typeof activityVersions[string]>();
  for (const candidate of Object.values(activityVersions)) {
    if (candidate.manifestVersionId !== manifestVersionId || candidate.unitKey !== requestBody.unitKey) continue;
    if (!expectedKeys.includes(candidate.activityKey) || committed.has(candidate.activityKey)) {
      throw new Error('book_assembly_activity_binding_committed_version_invalid');
    }
    committed.set(candidate.activityKey, candidate);
  }
  if (committed.size !== expectedKeys.length) {
    throw new Error('book_assembly_activity_binding_committed_version_missing');
  }
  const repository = options.bindingRepositoryFactory(input.env, input.uid, requestBody.bookId, requestBody.unitKey);
  for (const activityKey of expectedKeys) {
    const versionRecord = committed.get(activityKey)!;
    const binding = await repository.read({ ownerId: input.uid, bookId: requestBody.bookId, unitKey: requestBody.unitKey, activityKey });
    if (!binding || binding.activityId !== versionRecord.activityId) {
      throw new Error('book_assembly_activity_binding_conflict');
    }
    const status = await repository.recordPublication({
      ownerId: input.uid, bookId: requestBody.bookId, unitKey: requestBody.unitKey, activityKey,
      activityId: binding.activityId, candidateId: binding.candidateId, candidateRevision: binding.candidateRevision,
      activityVersionId: versionRecord.activityVersionId, activityVersion: versionRecord.activityVersion,
    });
    if (status === 'conflict' || status === 'stale') throw new Error('book_assembly_activity_binding_conflict');
  }
  return receipt;
};

const createFullPdfHandler = (
  options: BookAssemblyPublicationRouteOptions,
): BookAssemblyPublicationRouteHandlers['fullPdfPublish'] => {
  const ports = options.fullPdf;
  if (!ports) return unavailable('book_full_pdf_publication_dependencies_unavailable');
  return async (input) => {
    try {
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: 'publish',
        actorKind: 'teacher',
        bookId: await requestedBookId(input.request),
        requireBook: true,
      });
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return { body: { code: error.message, decision: error.decision }, init: { status: error.status } };
      }
      return { body: { code: 'book_pilot_scope_unavailable' }, init: { status: 503 } };
    }
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
    try {
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: 'publish',
        actorKind: 'teacher',
        bookId: await requestedBookId(input.request),
        requireBook: true,
      });
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return { body: { code: error.message, decision: error.decision }, init: { status: error.status } };
      }
      return { body: { code: 'book_pilot_scope_unavailable' }, init: { status: 503 } };
    }
    let worker: ReturnType<typeof createComponentPdfPublicationWorkerHandlers>;
    try {
      worker = createComponentPdfPublicationWorkerHandlers({
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

export const createBookAssemblyPublicationRouteHandlers = (
  options: BookAssemblyPublicationRouteOptions = {},
): BookAssemblyPublicationRouteHandlers => ({
  fullPdfPublish: createFullPdfHandler(options),
  componentPdfPublish: createComponentPdfHandler(options),
});
