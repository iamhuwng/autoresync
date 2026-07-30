import {
  createBookDeliveryWorkerHandlers,
} from './book-delivery/worker.ts';
import { createBookActivityAuthoringWorkerHandlers } from './book-activity-authoring/worker.ts';
import { createBookAssemblyWorkerHandlers } from './book-assembly/worker.ts';
import { createSourceStrategyMigrationWorkerHandlers } from './book-assembly/source-strategy-migration-worker.ts';
import {
  createBookAssemblyPublicationRouteHandlers,
  type BookAssemblyPublicationRouteOptions,
} from './book-assembly/publication-route-handlers.ts';
import { createBookRuntimeCanonicalHandlers } from './book-runtime/canonical.ts';
import { createBookHomeworkWorkerHandlers } from './book-homework/worker.ts';
import { createTeacherAssemblyPreviewWorker } from './book-delivery/teacher-assembly-preview-worker.js';
import type {
  BookRouteParams,
  BookRouterEnv,
  CanonicalBookRouteDescriptor,
} from './book-router.ts';

export interface BookRouteHandlerInput {
  readonly request: Request;
  readonly env: BookRouterEnv;
  readonly uid: string;
  readonly params: BookRouteParams;
  readonly descriptor: CanonicalBookRouteDescriptor;
}

export type BookRouteHandler = (input: BookRouteHandlerInput) => unknown | Promise<unknown>;
export type BookRouteHandlerMap = Readonly<Record<string, BookRouteHandler>>;

type WorkerResult = unknown;
type FactoryHandler = (input: {
  request: Request;
  env: BookRouterEnv;
  uid: string;
  [key: string]: unknown;
}) => WorkerResult | Promise<WorkerResult>;

const adapt = (
  handler: FactoryHandler,
  params: readonly string[] = [],
): BookRouteHandler => (input) => handler({
  request: input.request,
  env: input.env,
  uid: input.uid,
  ...Object.fromEntries(params.map((name) => [name, input.params[name]])),
});

const addFactoryHandlers = (
  target: Record<string, BookRouteHandler>,
  factory: Record<string, unknown>,
  names: readonly string[],
  namespace: string,
  paramsFor: (name: string) => readonly string[] = () => [],
): void => {
  for (const name of names) {
    const handler = factory[name];
    if (typeof handler === 'function') {
      const adapted = adapt(handler as FactoryHandler, paramsFor(name));
      target[`${namespace}.${name}`] = adapted;
    }
  }
};

export interface BookRouteHandlersOptions {
  readonly deliveryHandlers?: Record<string, unknown>;
  readonly activityAuthoringHandlers?: Record<string, unknown>;
  readonly assemblyHandlers?: Record<string, unknown>;
  readonly assemblyMigrationHandlers?: Record<string, unknown>;
  readonly assemblyPublication?: BookAssemblyPublicationRouteOptions;
  readonly assemblySuccessorHandlers?: Record<string, unknown>;
  readonly assemblyMappingRevisionHandlers?: Record<string, unknown>;
  readonly runtimeHandlers?: Record<string, unknown>;
  readonly homeworkHandlers?: Record<string, unknown>;
  readonly documentHandler?: BookRouteHandler;
  readonly teacherDocumentHandler?: BookRouteHandler;
  readonly futureHandlers?: BookRouteHandlerMap;
}

const unavailableDocumentHandler: BookRouteHandler = () => new Response(
  JSON.stringify({ code: 'book_document_route_unavailable' }),
  {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  },
);

export const createBookRouteHandlers = (
  options: BookRouteHandlersOptions = {},
): BookRouteHandlerMap => {
  const handlers: Record<string, BookRouteHandler> = { ...(options.futureHandlers ?? {}) };
  const delivery = options.deliveryHandlers ?? createBookDeliveryWorkerHandlers();
  const activity = options.activityAuthoringHandlers
    ?? createBookActivityAuthoringWorkerHandlers();
  const assembly = options.assemblyHandlers ?? createBookAssemblyWorkerHandlers();
  const assemblyMigration = options.assemblyMigrationHandlers ?? createSourceStrategyMigrationWorkerHandlers();
  const assemblyPublication = createBookAssemblyPublicationRouteHandlers(options.assemblyPublication);
  const assemblySuccessor = options.assemblySuccessorHandlers ?? {};
  const assemblyMappingRevision = options.assemblyMappingRevisionHandlers ?? {};
  const runtime = options.runtimeHandlers ?? createBookRuntimeCanonicalHandlers();
  const homework = options.homeworkHandlers ?? createBookHomeworkWorkerHandlers();

  addFactoryHandlers(handlers, delivery as Record<string, unknown>,
    ['create', 'activate', 'supersede', 'revoke'], 'bookDelivery', () => []);
  addFactoryHandlers(handlers, delivery as Record<string, unknown>, ['resolve'], 'bookDelivery', () => ['recipientId', 'contextId']);
  addFactoryHandlers(handlers, activity,
    ['stage', 'validate', 'saveDraft', 'discard'], 'bookActivityAuthoring', () => []);
  addFactoryHandlers(handlers, activity, ['loadCandidate'], 'bookActivityAuthoring', () => ['candidateId']);
  addFactoryHandlers(handlers, assembly,
    ['create', 'replace', 'validate', 'discard'], 'bookAssembly', () => []);
  addFactoryHandlers(handlers, assembly, ['load'], 'bookAssembly', () => ['bookId', 'unitKey', 'candidateId']);
  addFactoryHandlers(handlers, assemblyMigration,
    ['migrate'], 'bookAssemblyMigration', () => []);
  addFactoryHandlers(handlers, assemblyMigration,
    ['confirm', 'discard', 'cancel'], 'bookAssemblyMigration', () => ['bookId', 'unitKey', 'migrationCandidateId']);
  addFactoryHandlers(handlers, assemblyPublication as unknown as Record<string, unknown>,
    ['fullPdfPublish', 'componentPdfPublish'], 'bookAssembly', () => []);
  addFactoryHandlers(handlers, assemblySuccessor,
    ['publish'], 'bookAssemblySuccessor', () => []);
  addFactoryHandlers(handlers, assemblyMappingRevision,
    ['publish'], 'bookAssemblyMappingRevision', () => []);
  addFactoryHandlers(handlers, runtime, ['command'], 'bookRuntime', () => []);
  addFactoryHandlers(handlers, runtime, ['readDraft'], 'bookRuntime', () => [
    'bindingId',
    'bindingRevision',
    'contextId',
    'placementId',
    'activityId',
    'activityVersion',
    'interactionId',
  ]);
  addFactoryHandlers(handlers, homework, ['homeworkAssignmentCommand'], 'futureSeam', () => ['assignmentId']);
  addFactoryHandlers(handlers, homework, ['homeworkStudentProjection'], 'futureSeam', () => ['assignmentId']);

  const documentHandler = options.documentHandler ?? unavailableDocumentHandler;
  const teacherPreviewWorker = createTeacherAssemblyPreviewWorker();
  const teacherDocumentHandler = options.teacherDocumentHandler
    ?? ((input) => teacherPreviewWorker.fetch(input.request, input.env));
  handlers.serveAuthorizedDocument = documentHandler;
  handlers.document = documentHandler;
  handlers.serveTeacherAssemblyDocument = teacherDocumentHandler;
  handlers.teacherDocument = teacherDocumentHandler;
  return handlers;
};

export const createBookRouteHandlerResolver = (
  options: BookRouteHandlersOptions = {},
) => {
  const handlers = createBookRouteHandlers(options);
  return (descriptor: CanonicalBookRouteDescriptor): BookRouteHandler | undefined => {
    return handlers[descriptor.handler];
  };
};

export default createBookRouteHandlers;
