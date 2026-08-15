import {
  BookHomeworkAssignmentSaga,
  type BookHomeworkSagaDependencies,
} from './saga.ts';
import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkStudentState,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
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
  FirebaseRestBookHomeworkCompatibilityRepository,
  type BookHomeworkCompatibilityRepositoryEnv,
  type BookHomeworkCompatibilityFirebaseClaim,
} from './compatibility-repository.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepositoryEnv,
} from '../book-assembly/publication-repository.ts';
import { createBookHomeworkCanonicalResolver } from './canonical-resolver.ts';
import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  BookHomeworkAuthoritativeContextResolver,
  type BookHomeworkContextResolverPort,
} from './context-resolver.ts';
import { FirebaseRestExactPublishedActivityVersionReader } from '../book-assembly/canonical-activity-version-repository.ts';

export type BookHomeworkTrustedRuntimeEnv = BookHomeworkRepositoryEnv
  & BookHomeworkCompatibilityRepositoryEnv
  & BookHomeworkSagaRepositoryEnv
  & BookDeliveryRepositoryEnv
  & BookAssemblyPublicationRepositoryEnv
  & { readonly [key: string]: unknown };

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

export const resolveBookHomeworkProductionFetch = (
  fetchImpl?: typeof fetch,
): typeof fetch => {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (typeof resolved !== 'function') {
    throw new BookHomeworkRuntimeUnavailableError();
  }
  return (input, init) => resolved.call(globalThis, input, init);
};

export interface BookHomeworkProductionRuntimeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly getSagaAccessToken?: () => Promise<string>;
  readonly getAuthorityAccessToken?: () => Promise<string>;
  readonly getCompatibilityFirebaseIdToken?: (
    claims: BookHomeworkCompatibilityFirebaseClaim,
  ) => Promise<string>;
  readonly getDeliveryAccessToken?: () => Promise<string>;
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
  readonly compatibilityRepository: FirebaseRestBookHomeworkCompatibilityRepository;
}

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
    getFirebaseIdToken: options.getAuthorityAccessToken
      ? async () => options.getAuthorityAccessToken!()
      : undefined,
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
  const compatibilityRepository = new FirebaseRestBookHomeworkCompatibilityRepository({
    env,
    fetchImpl,
    getFirebaseIdToken: options.getCompatibilityFirebaseIdToken,
  });
  return { sagaRepository, authorityRepository, deliveryRepository, compatibilityRepository };
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
    const fetchImpl = resolveBookHomeworkProductionFetch(options.fetchImpl);
    const runtimeOptions = { ...options, fetchImpl };
    const dependencies = createProductionDependencies(env, runtimeOptions);
    const resolveCanonical = options.resolveCanonical ?? (async (command) => {
      try {
        const homeworkTokenProvider = createFirebaseClaimTokenProvider({
          serviceAccountJson: String(env.BOOK_HOMEWORK_GOOGLE_SA_KEY),
          serviceIdentity: String(env.BOOK_HOMEWORK_SERVICE_IDENTITY),
          firebaseProjectId: String(env.FIREBASE_PROJECT_ID),
          firebaseWebApiKey: String(env.FIREBASE_WEB_API_KEY),
          fetchImpl,
        });
        const authorityReader = new FirebaseRtdbRestClient({
          env,
          fetchImpl,
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
          fetchImpl,
        });
        const publicationReader = new FirebaseRestBookAssemblyPublicationRepository({
          env,
          fetchImpl,
          ownerId: command.ownerId,
          getFirebaseAuthToken: (bookId, ownerId) => assemblyTokenProvider({
            service: 'book_assembly_publication',
            bookId,
            ownerId,
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
      compatibilityRepository: dependencies.compatibilityRepository,
      resolveCanonical,
    });
  } catch (error) {
    if (error instanceof BookHomeworkRuntimeUnavailableError) throw error;
    throw new BookHomeworkRuntimeUnavailableError();
  }
};

export const createBookHomeworkProductionContextResolver = (
  env: BookHomeworkTrustedRuntimeEnv,
  options: BookHomeworkProductionRuntimeOptions = {},
): BookHomeworkContextResolverPort => {
  try {
    const fetchImpl = resolveBookHomeworkProductionFetch(options.fetchImpl);
    const dependencies = createProductionDependencies(env, { ...options, fetchImpl });
    const assemblyIdentity = String(env.BOOK_ASSEMBLY_SERVICE_IDENTITY ?? '').trim();
    const assemblyKey = String(env.BOOK_ASSEMBLY_GOOGLE_SA_KEY ?? '').trim();
    const assemblyTokenProvider = createFirebaseClaimTokenProvider({
      serviceAccountJson: assemblyKey,
      serviceIdentity: assemblyIdentity,
      firebaseProjectId: String(env.FIREBASE_PROJECT_ID ?? '').trim(),
      firebaseWebApiKey: String(env.FIREBASE_WEB_API_KEY ?? '').trim(),
      fetchImpl,
    });
    const publications = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl,
      getFirebaseAuthToken: (bookId) => assemblyTokenProvider({
        service: 'book_assembly_publication',
        bookId,
        ownerId: assemblyIdentity,
      }),
    });
    const exactActivityVersions = new FirebaseRestExactPublishedActivityVersionReader({
      env: {
        ...env,
        BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY: assemblyIdentity,
        BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY: assemblyKey,
      },
      fetchImpl,
    });
    return new BookHomeworkAuthoritativeContextResolver({
      roots: dependencies.sagaRepository,
      authorities: dependencies.authorityRepository,
      deliveries: dependencies.deliveryRepository,
      publications,
      exactActivityVersions,
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
    || !dependencies.compatibilityRepository
    || typeof dependencies.resolveCanonical !== 'function') {
    throw new Error('book_homework_runtime_dependencies_unavailable');
  }
  return new BookHomeworkAssignmentSaga(dependencies);
};
