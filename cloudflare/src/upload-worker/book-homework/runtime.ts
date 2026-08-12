import {
  BookHomeworkAssignmentSaga,
  type BookHomeworkSagaDependencies,
} from './saga.ts';
import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkStudentState,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookHomeworkSagaCanonicalState,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  fingerprint,
} from './authority.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
  BookHomeworkAuthorityRepository,
  type BookHomeworkRepositoryEnv,
} from './repository.ts';
import {
  FirebaseRestBookHomeworkSagaRepository,
  type BookHomeworkSagaRepositoryEnv,
} from './sagaRepository.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepositoryEnv,
} from '../book-assembly/publication-repository.ts';
import {
  createTrustedBookDeliveryPublication,
} from '../book-delivery/worker.ts';
import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type {
  BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  BookDeliveryScope,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import { createBookHomeworkCanonicalResolver } from './canonical-resolver.ts';
import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';

export interface BookHomeworkTrustedRuntimeEnv
  extends BookHomeworkRepositoryEnv,
  BookHomeworkSagaRepositoryEnv,
  BookDeliveryRepositoryEnv,
  BookAssemblyPublicationRepositoryEnv {
  readonly [key: string]: unknown;
}

export type BookHomeworkTrustedSaga = Pick<BookHomeworkAssignmentSaga, 'execute'>
  & Partial<Pick<
    BookHomeworkAssignmentSaga,
    | 'resolveStudentProjection'
    | 'resolveTeacherProjections'
    | 'readCommittedAssignment'
  >>;

export type BookHomeworkTrustedSagaFactory = (
  env: BookHomeworkTrustedRuntimeEnv,
) => BookHomeworkTrustedSaga | Promise<BookHomeworkTrustedSaga>;

/**
 * A production dependency failure is deliberately distinguishable from a
 * caller-supplied test/preview saga. The Worker maps this error to a bounded
 * 503 before the saga has an opportunity to create or update any record.
 */
export class BookHomeworkRuntimeUnavailableError extends Error {
  readonly code = 'book_homework_runtime_dependencies_unavailable';
  readonly status = 503;

  constructor(message = 'Book Homework production runtime is unavailable.') {
    super(message);
    this.name = 'BookHomeworkRuntimeUnavailableError';
  }
}

export interface BookHomeworkProductionRuntimeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly getSagaAccessToken?: () => Promise<string>;
  readonly getAuthorityAccessToken?: () => Promise<string>;
  readonly getDeliveryAccessToken?: () => Promise<string>;
  readonly getPublicationAccessToken?: () => Promise<string>;
  readonly resolveAffectedStudentStates?: (
    record: BookHomeworkAuthorityRecord,
    nodeKey: string,
  ) => Promise<readonly BookHomeworkStudentState[]>;
  readonly resolveCommittedRoot?: (
    record: BookHomeworkAuthorityRecord,
  ) => Promise<boolean>;
  /**
   * Optional seam for a deployment-owned canonical resolver. When omitted,
   * the resolver below reads the pre-saga authority and published assembly
   * scope through the production repositories.
   */
  readonly resolveCanonical?: BookHomeworkSagaDependencies['resolveCanonical'];
}

export interface BookHomeworkProductionRuntimeDependencies {
  readonly sagaRepository: FirebaseRestBookHomeworkSagaRepository;
  readonly authorityRepository: BookHomeworkAuthorityRepository;
  readonly deliveryRepository: FirebaseRestBookDeliveryRepository;
  readonly publicationRepository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;

const requireProductionConfig = (env: BookHomeworkTrustedRuntimeEnv): void => {
  const required = [
    'FIREBASE_DB_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_WEB_API_KEY',
    'BOOK_HOMEWORK_SERVICE_IDENTITY',
    'BOOK_HOMEWORK_GOOGLE_SA_KEY',
    'BOOK_DELIVERY_SERVICE_IDENTITY',
    'BOOK_DELIVERY_GOOGLE_SA_KEY',
    'BOOK_ASSEMBLY_SERVICE_IDENTITY',
    'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  ] as const;
  if (required.some((key) => typeof env[key] !== 'string' || !String(env[key]).trim())) {
    throw new BookHomeworkRuntimeUnavailableError();
  }
};

const scopeForManifest = (
  record: BookHomeworkAuthorityRecord,
): BookDeliveryScope => {
  const target = record.bookManifest.selectedTarget;
  if (target.kind === 'activity') {
    const placementIds = record.bookManifest.bindings
      .filter((binding) => binding.state === 'required')
      .map((binding) => binding.placementId);
    return { kind: 'placements', nodeKeys: [], placementIds };
  }
  if (target.kind === 'book') {
    return {
      kind: 'subtree',
      nodeKeys: record.bookManifest.outline.map((node) => node.nodeKey),
      placementIds: [],
    };
  }
  return { kind: 'subtree', nodeKeys: [target.nodeKey], placementIds: [] };
};

const canonicalFromAuthority = async (input: {
  readonly authority: BookHomeworkAuthorityRecord;
  readonly selectedRecipientIds: readonly string[];
  readonly publicationRepository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
}): Promise<BookHomeworkSagaCanonicalState> => {
  const { authority, selectedRecipientIds, publicationRepository } = input;
  const recipientId = authority.bookManifest.context.recipientId;
  if (authority.assignmentKind !== 'book_activity_bundle'
    || authority.bookManifest.context.contextId !== authority.assignmentId
    || !ID.test(authority.ownerId)
    || selectedRecipientIds.length !== 1
    || selectedRecipientIds[0] !== recipientId
    || !authority.activityPolicies
    || Object.keys(authority.activityPolicies).length === 0) {
    throw new BookHomeworkRuntimeUnavailableError('Book Homework canonical authority is unavailable.');
  }

  const publicationScope = await publicationRepository.readScope(authority.bookManifest.book.bookId);
  const schedulePolicy = (() => {
    const policies = Object.values(authority.activityPolicies!);
    const policy = policies[0];
    if (!policy || !ID.test(policy.policyId) || !Number.isSafeInteger(policy.policyRevision)
      || policy.policyRevision < 1 || policies.some((entry) => (
        entry.policyId !== policy.policyId || entry.policyRevision !== policy.policyRevision
      ))) {
      throw new BookHomeworkRuntimeUnavailableError('Book Homework frozen policy is unavailable.');
    }
    return {
      policyId: policy.policyId,
      policyRevision: policy.policyRevision,
      basis: 'immutable-reference' as const,
    };
  })();

  const intent = {
    bookId: authority.bookManifest.book.bookId,
    publicationId: authority.bookManifest.book.publicationId,
    publicationRevision: authority.bookManifest.book.publicationRevision,
    recipientId,
    contextKind: 'homework' as const,
    contextId: authority.assignmentId,
    scope: scopeForManifest(authority),
  };
  const deliveryPublication = createTrustedBookDeliveryPublication(
    intent,
    publicationScope,
    schedulePolicy,
  );
  const required = authority.bookManifest.bindings.filter((binding) => binding.state === 'required');
  const sourceUnavailable = required.some((binding) => (
    binding.sourceReadiness === 'unavailable'
  ));
  const frozenPolicies = Object.fromEntries(required.map((binding) => {
    const policy = authority.activityPolicies?.[binding.placementId];
    if (!policy) throw new BookHomeworkRuntimeUnavailableError('Book Homework Activity policy is unavailable.');
    return [binding.placementId, {
      lateSubmissionAllowed: policy.lateSubmissionAllowed,
      maxAttempts: policy.maxAttempts,
    }];
  }));
  const frozenPolicy = {
    policyId: schedulePolicy.policyId,
    policyRevision: schedulePolicy.policyRevision,
    fingerprint: fingerprint({ schedulePolicy, frozenPolicies }),
    activityPolicies: frozenPolicies,
  };
  const exposureApproval = {
    approved: !sourceUnavailable && required.length > 0,
    fingerprint: fingerprint({
      assignmentId: authority.assignmentId,
      manifestVersionId: authority.bookManifest.manifestVersionId,
      publicationId: deliveryPublication.publicationId,
      publicationRevision: deliveryPublication.publicationRevision,
      approved: !sourceUnavailable && required.length > 0,
    }),
  };
  return {
    ownerId: authority.ownerId,
    manifest: authority.bookManifest,
    schedule: authority.schedule,
    recipientIds: [recipientId],
    studentExtensions: Object.fromEntries(Object.entries(authority.studentExtensions).map(([studentId, extensions]) => [
      studentId,
      Object.values(extensions).map((extension) => ({ nodeKey: extension.nodeKey, dueAt: extension.dueAt })),
    ])),
    publication: {
      bookId: deliveryPublication.bookId,
      publicationId: deliveryPublication.publicationId,
      publicationRevision: deliveryPublication.publicationRevision,
      manifestVersionId: deliveryPublication.manifestVersionId,
      fingerprint: fingerprint(deliveryPublication),
    },
    deliveryPublication,
    sourceReadiness: 'ready',
    exposureApproval,
    capabilities: { canAssignBookHomework: exposureApproval.approved },
    frozenPolicy,
  };
};

const createProductionDependencies = (
  env: BookHomeworkTrustedRuntimeEnv,
  options: BookHomeworkProductionRuntimeOptions,
): BookHomeworkProductionRuntimeDependencies => {
  requireProductionConfig(env);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sagaRepository = new FirebaseRestBookHomeworkSagaRepository({
    env,
    fetchImpl,
    getAccessToken: options.getSagaAccessToken,
  });
  const authorityStore = new FirebaseRestBookHomeworkDocumentStore({
    env,
    fetchImpl,
    getAccessToken: options.getAuthorityAccessToken,
  });
  const authorityRepository = new BookHomeworkAuthorityRepository(authorityStore, {
    resolveAffectedStudentStates: options.resolveAffectedStudentStates
      // The production Worker does not own student progress reads. Until a
      // dedicated progress port is supplied, report a started state so
      // deadline mutation remains fail-closed.
      ?? (async () => ['in-progress']),
    resolveCommittedRoot: options.resolveCommittedRoot
      ?? (async (record) => {
        const root = await sagaRepository.read(record.saga.sagaId, record.ownerId);
        return root?.state === 'committed'
          && root.visibility === 'committed'
          && root.recipients.some((entry) => (
            entry.authorityId === record.assignmentId
            && entry.recipientId === record.bookManifest.context.recipientId
            && entry.state === 'committed'
          ));
      }),
  });
  const deliveryRepository = new FirebaseRestBookDeliveryRepository({
    env,
    fetchImpl,
    getAccessToken: options.getDeliveryAccessToken,
  });
  const publicationRepository = new FirebaseRestBookAssemblyPublicationRepository({
    env,
    fetchImpl,
    getAccessToken: options.getPublicationAccessToken,
  });
  return { sagaRepository, authorityRepository, deliveryRepository, publicationRepository };
};

/**
 * Construct the sole default production saga. No preview Worker or in-memory
 * repository is reachable from this path; callers that need those providers
 * must inject an explicit saga/sagaFactory into the Worker options.
 */
export const createBookHomeworkProductionRuntime = (
  env: BookHomeworkTrustedRuntimeEnv,
  options: BookHomeworkProductionRuntimeOptions = {},
): BookHomeworkAssignmentSaga => {
  try {
    const dependencies = createProductionDependencies(env, options);
    const resolveCanonical = options.resolveCanonical ?? (async (command) => {
      try {
        const homeworkTokenProvider = createFirebaseClaimTokenProvider({
          serviceAccountJson: String(env.BOOK_HOMEWORK_GOOGLE_SA_KEY),
          serviceIdentity: String(env.BOOK_HOMEWORK_SERVICE_IDENTITY),
          firebaseProjectId: String(env.FIREBASE_PROJECT_ID),
          firebaseWebApiKey: String(env.FIREBASE_WEB_API_KEY),
          fetchImpl: options.fetchImpl ?? globalThis.fetch,
        });
        const authorityReader = new FirebaseRtdbRestClient({
          env,
          fetchImpl: options.fetchImpl ?? globalThis.fetch,
          firebaseAuthToken: true,
          getFirebaseAuthToken: () => homeworkTokenProvider({
            service: 'book_homework', ownerId: command.ownerId,
          }),
        });
        const assemblyTokenProvider = createFirebaseClaimTokenProvider({
          serviceAccountJson: String(env.BOOK_ASSEMBLY_GOOGLE_SA_KEY),
          serviceIdentity: String(env.BOOK_ASSEMBLY_SERVICE_IDENTITY),
          firebaseProjectId: String(env.FIREBASE_PROJECT_ID),
          firebaseWebApiKey: String(env.FIREBASE_WEB_API_KEY),
          fetchImpl: options.fetchImpl ?? globalThis.fetch,
        });
        const publicationReader = new FirebaseRestBookAssemblyPublicationRepository({
          env,
          fetchImpl: options.fetchImpl ?? globalThis.fetch,
          getFirebaseAuthToken: (bookId) => assemblyTokenProvider({
            service: 'book_assembly_publication',
            bookId,
            ownerId: command.ownerId,
          }),
        });
        return await createBookHomeworkCanonicalResolver({
          readPublicationScope: (bookId) => publicationReader.readScope(bookId),
          classReader: async (classId) => {
            const value = await authorityReader.readValue(`classes/${classId}`);
            return value && typeof value === 'object' && !Array.isArray(value)
              ? value as never
              : null;
          },
        }).resolve(command);
      } catch (error) {
        if (error instanceof BookHomeworkRuntimeUnavailableError) throw error;
        throw error;
      }
    });
    return new BookHomeworkAssignmentSaga({
      sagaRepository: dependencies.sagaRepository,
      authorityRepository: dependencies.authorityRepository,
      deliveryRepository: dependencies.deliveryRepository,
      resolveCanonical,
    });
  } catch (error) {
    if (error instanceof BookHomeworkRuntimeUnavailableError) throw error;
    throw new BookHomeworkRuntimeUnavailableError();
  }
};

export const createBookHomeworkTrustedSagaFactory = (options: {
  readonly resolveDependencies: (
    env: BookHomeworkTrustedRuntimeEnv,
  ) => BookHomeworkSagaDependencies
    | Promise<BookHomeworkSagaDependencies>;
}): BookHomeworkTrustedSagaFactory => async (env) => {
  const dependencies = await options.resolveDependencies(env);
  if (!dependencies
    || typeof dependencies !== 'object'
    || !dependencies.sagaRepository
    || !dependencies.authorityRepository
    || !dependencies.deliveryRepository
    || typeof dependencies.resolveCanonical !== 'function') {
    throw new Error('book_homework_runtime_dependencies_unavailable');
  }
  return new BookHomeworkAssignmentSaga(dependencies);
};
