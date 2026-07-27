import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type {
  BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  ComponentPdfActivityLineage,
} from '../../../../src/services/book-assembly/componentPdfPublication.adapter.ts';
import type {
  FullPdfActivityLineage,
} from '../../../../src/services/book-assembly/fullPdfPublication.adapter.ts';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
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
  FirebaseRestBookAssemblyRepository,
  type BookAssemblyRepositoryEnv,
} from './repository.ts';
import type { BookAssemblyRepositoryPort } from './worker.ts';
import type { BookRouterEnv } from '../book-router.ts';

export interface BookAssemblyPublicationRouteInput {
  readonly request: Request;
  readonly env: BookRouterEnv;
  readonly uid: string;
}

type PublicationWorkerResult = { body: unknown; init: ResponseInit };

export interface BookAssemblyPublicationReaderContext {
  readonly env: BookRouterEnv;
  readonly bookId: string;
  readonly unitKey?: string;
  readonly candidateId?: string;
}

export interface FullPdfPublicationRoutePorts {
  readonly readAuthority: (
    context: BookAssemblyPublicationReaderContext,
  ) => Promise<BookAssemblyBookAuthority | null>;
  readonly readCandidate?: (
    context: Required<BookAssemblyPublicationReaderContext>,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readLineage?: (
    context: Omit<Required<BookAssemblyPublicationReaderContext>, 'candidateId'>,
  ) => Promise<Readonly<Record<string, FullPdfActivityLineage>>>;
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
}

export interface BookAssemblyPublicationRouteOptions {
  /** #64 durable repository. Never replace this with the in-memory test port. */
  readonly repositoryFactory?: (
    env: BookRouterEnv,
  ) => BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  /** #55 candidate repository/read seam. */
  readonly candidateRepositoryFactory?: (
    env: BookRouterEnv,
  ) => Pick<BookAssemblyRepositoryPort, 'readScope'>;
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
): BookAssemblyPublicationRepository<BookAssemblyPublicationResult> => (
  new FirebaseRestBookAssemblyPublicationRepository({
    env: env as BookAssemblyPublicationRepositoryEnv,
  })
);

const defaultCandidateRepositoryFactory = (
  env: BookRouterEnv,
): Pick<BookAssemblyRepositoryPort, 'readScope'> => (
  new FirebaseRestBookAssemblyRepository({
    env: env as BookAssemblyRepositoryEnv,
  })
);

const readCandidate = async (
  options: BookAssemblyPublicationRouteOptions,
  input: BookAssemblyPublicationRouteInput,
  bookId: string,
  unitKey: string,
  candidateId: string,
  reader: FullPdfPublicationRoutePorts['readCandidate']
    | ComponentPdfPublicationRoutePorts['readCandidate'],
): Promise<BookAssemblyCandidateRecord | null> => {
  if (reader) return reader({ env: input.env, bookId, unitKey, candidateId });
  const repository = (options.candidateRepositoryFactory ?? defaultCandidateRepositoryFactory)(input.env);
  const scope = await repository.readScope(bookId, unitKey);
  return scope.candidates?.[candidateId] ?? null;
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
        repository: (options.repositoryFactory ?? defaultRepositoryFactory)(input.env),
        readCandidate: (bookId, unitKey, candidateId) => readCandidate(
          options,
          input,
          bookId,
          unitKey,
          candidateId,
          ports.readCandidate,
        ),
        readAuthority: (bookId) => ports.readAuthority({ env: input.env, bookId }),
        ...(ports.readLineage ? {
          readLineage: (bookId: string, unitKey: string) => ports.readLineage!({
            env: input.env,
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
    return worker.publish({
      request: input.request,
      env: input.env,
      uid: input.uid,
    });
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
        repository: (options.repositoryFactory ?? defaultRepositoryFactory)(input.env),
        readCandidate: (bookId, unitKey, candidateId) => readCandidate(
          options,
          input,
          bookId,
          unitKey,
          candidateId,
          ports.readCandidate,
        ),
        readAuthority: (bookId) => ports.readAuthority({ env: input.env, bookId }),
        ...(ports.readLineage ? {
          readLineage: (bookId: string, unitKey: string) => ports.readLineage!({
            env: input.env,
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
    return worker.publish({
      request: input.request,
      env: input.env,
      uid: input.uid,
    });
  };
};

export const createBookAssemblyPublicationRouteHandlers = (
  options: BookAssemblyPublicationRouteOptions = {},
): BookAssemblyPublicationRouteHandlers => ({
  fullPdfPublish: createFullPdfHandler(options),
  componentPdfPublish: createComponentPdfHandler(options),
});
