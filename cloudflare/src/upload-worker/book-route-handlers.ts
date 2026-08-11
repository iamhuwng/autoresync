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
import type {
  BookHomeworkWorkerHandlersOptions,
} from './book-homework/worker.ts';
import {
  createCanonicalBookHomeworkHandlers,
} from './book-routes/homework-composition.ts';
import { createBookSourceUploadWorkerHandlers } from './book-source/worker.ts';
import {
  createBookHistoricalAttemptDocumentDeliveryHandler,
  createBookSourceDocumentDeliveryHandler,
  type BookSourceDocumentDeliveryOptions,
} from './book-source/document.ts';
import { createTeacherAssemblyPreviewWorker } from './book-delivery/teacher-assembly-preview-worker.js';
import { createCourseBookPlacementWorkerHandlers } from './course-book-placement/worker.ts';
import {
  createClassBookPlacementWorkerHandlers,
  type ClassBookPlacementWorkerHandlerOptions,
} from './class-book-placement/worker.ts';
import {
  createBookRuntimeLaunchCanonicalHandlers,
  type BookRuntimeLaunchCanonicalHandlersOptions,
} from './book-runtime-launch/canonical.ts';
import type {
  BookRouteParams,
  BookRouterEnv,
  CanonicalBookRouteDescriptor,
} from './book-router.ts';
import { enforceBookPilotScopeIfConfigured } from '../book-pilot-scope.ts';

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

const routeDomainFor = (namespace: string): CanonicalBookRouteDescriptor['domain'] => {
  if (namespace === 'bookActivityAuthoring') return 'activity-authoring';
  if (namespace === 'bookAssembly' || namespace.startsWith('bookAssembly')) return 'assembly';
  if (namespace === 'bookSource') return 'source-upload';
  if (namespace === 'bookRuntime' || namespace === 'bookRuntimeLaunch') return 'runtime';
  if (namespace === 'futureSeam') return 'homework';
  if (namespace === 'courseBookPlacement' || namespace === 'classBookPlacement') return 'delivery';
  return 'delivery';
};

const directDescriptorFor = (
  namespace: string,
  name: string,
): CanonicalBookRouteDescriptor => ({
  id: `book.pilot.direct.${namespace}.${name}`,
  methods: ['POST'],
  pathTemplate: `/book-pilot/direct/${namespace}/${name}`,
  owner: '#126',
  domain: namespace === 'futureSeam' && name === 'updateCommand'
    ? 'updates'
    : namespace === 'futureSeam' && name === 'replacementCleanupCommand'
      ? 'replacement-cleanup'
      : routeDomainFor(namespace),
  handler: `${namespace}.${name}`,
  firebaseAuth: namespace === 'bookRuntime' || namespace === 'bookRuntimeLaunch'
    ? 'firebase-id-token-student'
    : 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_PILOT_SCOPE_ROUTES_ENABLED',
  gateDefault: 'disabled',
  requestBodyBytes: 256 * 1024,
  responseLimitBytes: 256 * 1024,
  source: 'future-seam',
});

const READ_HANDLER_NAMES = new Set([
  'loadCandidate', 'load', 'readDraft', 'status', 'resolve', 'current', 'catalog',
  'studentProjection', 'teacherStudentProjection', 'teacherProjection',
]);

const adapt = (
  handler: FactoryHandler,
  params: readonly string[] = [],
  descriptor?: CanonicalBookRouteDescriptor,
): BookRouteHandler => async (input) => {
  if (descriptor && !READ_HANDLER_NAMES.has(descriptor.handler.split('.').at(-1) ?? '')) {
    await enforceBookPilotScopeIfConfigured({
      request: input.request,
      env: input.env,
      uid: input.uid,
      params: input.params,
      descriptor,
    });
  }
  return handler({
    request: input.request,
    env: input.env,
    uid: input.uid,
    params: input.params,
    descriptor: input.descriptor,
    ...Object.fromEntries(params.map((name) => [name, input.params[name]])),
  });
};

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
      const adapted = adapt(
        handler as FactoryHandler,
        paramsFor(name),
        directDescriptorFor(namespace, name),
      );
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
  readonly homework?: BookHomeworkWorkerHandlersOptions;
  readonly homeworkHandlers?: Record<string, unknown>;
  readonly sourceUploadHandlers?: Record<string, unknown>;
  readonly sourceDocument?: BookSourceDocumentDeliveryOptions;
  readonly documentHandler?: BookRouteHandler;
  readonly teacherDocumentHandler?: BookRouteHandler;
  readonly historicalDocumentHandler?: BookRouteHandler;
  readonly futureHandlers?: BookRouteHandlerMap;
  /** #102 direct-Course contributor; disabled unless composed by #59. */
  readonly courseBookHandlers?: Record<string, unknown>;
  /** #104 canonical Class delivery contributor; disabled unless composed by #59. */
  readonly classBookPlacement?: ClassBookPlacementWorkerHandlerOptions;
  /** #104 runtime-launch contributor; disabled unless composed by #59. */
  readonly runtimeLaunch?: BookRuntimeLaunchCanonicalHandlersOptions;
}

export const createBookRouteHandlers = (
  options: BookRouteHandlersOptions = {},
): BookRouteHandlerMap => {
  const handlers: Record<string, BookRouteHandler> = {};
  for (const [name, handler] of Object.entries(options.futureHandlers ?? {})) {
    handlers[name] = async (input) => {
      const shortName = name.split('.').at(-1) ?? name;
      if (shortName === 'updateCommand' || shortName === 'replacementCleanupCommand') {
        await enforceBookPilotScopeIfConfigured({
          request: input.request,
          env: input.env,
          uid: input.uid,
          params: input.params,
          descriptor: directDescriptorFor('futureSeam', shortName),
        });
      }
      return handler(input);
    };
  }
  const delivery = options.deliveryHandlers ?? createBookDeliveryWorkerHandlers();
  const activity = options.activityAuthoringHandlers
    ?? createBookActivityAuthoringWorkerHandlers();
  const assembly = options.assemblyHandlers ?? createBookAssemblyWorkerHandlers();
  const assemblyMigration = options.assemblyMigrationHandlers ?? createSourceStrategyMigrationWorkerHandlers();
  const assemblyPublication = createBookAssemblyPublicationRouteHandlers(options.assemblyPublication);
  const assemblySuccessor = options.assemblySuccessorHandlers ?? {};
  const assemblyMappingRevision = options.assemblyMappingRevisionHandlers ?? {};
  const runtime = options.runtimeHandlers ?? createBookRuntimeCanonicalHandlers();
  const homework = options.homeworkHandlers
    ?? createCanonicalBookHomeworkHandlers(options.homework);
  const sourceUpload = options.sourceUploadHandlers ?? createBookSourceUploadWorkerHandlers();
  const courseBook = options.courseBookHandlers ?? createCourseBookPlacementWorkerHandlers();
  const classBookPlacement = createClassBookPlacementWorkerHandlers(options.classBookPlacement);
  const runtimeLaunch = createBookRuntimeLaunchCanonicalHandlers(options.runtimeLaunch);

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
  addFactoryHandlers(handlers, homework, ['homeworkTeacherStudentProjection'], 'futureSeam', () => ['assignmentId', 'studentId']);
  addFactoryHandlers(handlers, homework, ['homeworkTeacherProjection'], 'futureSeam', () => ['assignmentId']);
  addFactoryHandlers(handlers, sourceUpload, ['begin', 'complete', 'status', 'cancel'], 'bookSource');
  addFactoryHandlers(handlers, courseBook, ['place', 'prepare', 'revoke'], 'courseBookPlacement');
  addFactoryHandlers(handlers, courseBook, ['current'], 'courseBookPlacement', () => ['courseMaterialId']);
  addFactoryHandlers(handlers, courseBook, ['catalog'], 'courseBookPlacement', () => ['bookId']);
  addFactoryHandlers(handlers, classBookPlacement, ['prepare'], 'classBookPlacement');
  addFactoryHandlers(handlers, classBookPlacement, ['current'], 'classBookPlacement', () => [
    'classId', 'copyId', 'classPlacementId', 'classCourseMaterialId', 'bindingId',
  ]);
  addFactoryHandlers(handlers, runtimeLaunch, ['launch'], 'bookRuntimeLaunch');

  const documentHandler = options.documentHandler
    ?? createBookSourceDocumentDeliveryHandler(options.sourceDocument);
  const teacherPreviewWorker = createTeacherAssemblyPreviewWorker();
  const historicalDocumentHandler = options.historicalDocumentHandler
    ?? createBookHistoricalAttemptDocumentDeliveryHandler(options.sourceDocument);
  const teacherDocumentHandler = options.teacherDocumentHandler
    ?? ((input) => teacherPreviewWorker.fetch(input.request, input.env));
  handlers.serveAuthorizedDocument = documentHandler;
  handlers.document = documentHandler;
  handlers.serveHistoricalAttemptDocument = historicalDocumentHandler;
  handlers.historicalDocument = historicalDocumentHandler;
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
