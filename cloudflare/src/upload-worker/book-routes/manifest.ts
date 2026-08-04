import {
  bookActivityAuthoringRouteDescriptors,
} from '../book-activity-authoring/route.ts';
import {
  bookAssemblyRouteDescriptors,
  bookAssemblyMigrationRouteDescriptors,
  bookAssemblyPublicationRouteDescriptors,
  bookAssemblySuccessorRouteDescriptors,
  bookAssemblyMappingRevisionRouteDescriptors,
} from '../book-assembly/route.ts';
import {
  bookRuntimeRouteDescriptors,
} from '../book-runtime/route.ts';
import {
  bookDeliveryRouteDescriptors,
  bookDocumentAuthorizationRouteDescriptor,
  bookHistoricalAttemptDocumentRouteDescriptor,
  bookTeacherAssemblyDocumentRouteDescriptor,
} from '../book-delivery/route.ts';
import { bookSourceRouteDescriptors } from '../book-source/route.ts';
import { courseBookPlacementRouteDescriptors } from '../course-book-placement/route.ts';
import { bookIntegrityReportRouteDescriptor } from '../book-activity-integrity/route.ts';
import type {
  BookRouteDomain,
  BookRouteManifest,
  BookRouteMethod,
  CanonicalBookRouteDescriptor,
} from './types.ts';
import {
  BOOK_ROUTE_DOMAINS,
  BOOK_ROUTE_FIREBASE_AUTH,
  BOOK_ROUTE_METHODS,
  BOOK_ROUTE_RATE_CLASSES,
} from './types.ts';

const MAX_CONTROL_REQUEST_BYTES = 256 * 1024;
const MAX_ASSEMBLY_REQUEST_BYTES = 1_200_000;
const MAX_CONTROL_RESPONSE_BYTES = 256 * 1024;
const MAX_DOCUMENT_RESPONSE_BYTES = 500 * 1024 * 1024;

const contributor = (input: {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly owner: string;
  readonly domain: BookRouteDomain;
  readonly handler: string;
  readonly firebaseAuth: CanonicalBookRouteDescriptor['firebaseAuth'];
  readonly rateClass: CanonicalBookRouteDescriptor['rateClass'];
  readonly gateEnv: string;
  readonly requestBodyBytes: number;
  readonly responseLimitBytes: number;
  readonly identityEnv?: string;
  readonly credentialEnv?: string;
  readonly contributorTicket: string;
}): CanonicalBookRouteDescriptor => ({
  id: input.id,
  methods: input.method.split('|') as BookRouteMethod[],
  pathTemplate: input.path,
  owner: input.owner,
  domain: input.domain,
  handler: input.handler,
  firebaseAuth: input.firebaseAuth,
  rateClass: input.rateClass,
  gateEnv: input.gateEnv,
  gateDefault: 'disabled',
  requestBodyBytes: input.requestBodyBytes,
  responseLimitBytes: input.responseLimitBytes,
  ...(input.identityEnv ? { identityEnv: input.identityEnv } : {}),
  ...(input.credentialEnv ? { credentialEnv: input.credentialEnv } : {}),
  source: 'contributor',
  contributorTicket: input.contributorTicket,
});

const future = (input: {
  readonly id: string;
  readonly methods: readonly BookRouteMethod[];
  readonly pathTemplate: string;
  readonly owner: string;
  readonly domain: Exclude<BookRouteDomain, 'delivery' | 'activity-authoring' | 'assembly' | 'document-delivery'>;
  readonly handler: string;
  readonly firebaseAuth: CanonicalBookRouteDescriptor['firebaseAuth'];
  readonly rateClass: CanonicalBookRouteDescriptor['rateClass'];
  readonly gateEnv: string;
  readonly requestBodyBytes: number;
  readonly responseLimitBytes: number;
  readonly identityEnv?: string;
  readonly credentialEnv?: string;
}): CanonicalBookRouteDescriptor => ({
  ...input,
  gateDefault: 'disabled',
  source: 'future-seam',
});

const deliveryRoutes = bookDeliveryRouteDescriptors.map((route) => contributor({
  id: `book.delivery.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#31',
  domain: 'delivery',
  handler: `bookDelivery.${route.handler}`,
  firebaseAuth: 'firebase-id-token-owner',
  rateClass: route.handler === 'resolve' ? 'book-read' : 'book-control',
  gateEnv: 'BOOK_DELIVERY_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY',
  contributorTicket: '#31',
}));

const activityAuthoringRoutes = bookActivityAuthoringRouteDescriptors.map((route) => contributor({
  id: `book.activity-authoring.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#35',
  domain: 'activity-authoring',
  handler: `bookActivityAuthoring.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: route.handler === 'loadCandidate' ? 'book-read' : 'book-control',
  gateEnv: 'BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY',
  contributorTicket: '#35',
}));

const assemblyRoutes = bookAssemblyRouteDescriptors.map((route) => contributor({
  id: `book.assembly.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#55',
  domain: 'assembly',
  handler: `bookAssembly.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: route.method === 'GET' ? 'book-read' : 'book-control',
  gateEnv: 'BOOK_ASSEMBLY_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_ASSEMBLY_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#55',
}));

const assemblyMigrationRoutes = bookAssemblyMigrationRouteDescriptors.map((route) => contributor({
  id: `book.assembly-migration.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#70',
  domain: 'assembly',
  handler: `bookAssemblyMigration.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_ASSEMBLY_MIGRATIONS_ROUTES_ENABLED',
  requestBodyBytes: MAX_ASSEMBLY_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#70',
}));

const assemblyPublicationRoutes = bookAssemblyPublicationRouteDescriptors.map((route) => contributor({
  id: `book.assembly.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#59',
  domain: 'assembly',
  handler: `bookAssembly.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: route.handler === 'fullPdfPublish'
    ? 'BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED'
    : 'BOOK_COMPONENT_PDF_PUBLICATION_ROUTES_ENABLED',
  requestBodyBytes: MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#59',
}));

const assemblySuccessorRoutes = bookAssemblySuccessorRouteDescriptors.map((route) => contributor({
  id: `book.assembly-successor.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#71',
  domain: 'assembly',
  handler: `bookAssemblySuccessor.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_SOURCE_STRATEGY_SUCCESSOR_ROUTES_ENABLED',
  requestBodyBytes: MAX_ASSEMBLY_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#71',
}));

const assemblyMappingRevisionRoutes = bookAssemblyMappingRevisionRouteDescriptors.map((route) => contributor({
  id: `book.assembly-mapping-revision.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#67',
  domain: 'assembly',
  handler: `bookAssemblyMappingRevision.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_MAPPING_REVISION_ROUTES_ENABLED',
  requestBodyBytes: MAX_ASSEMBLY_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#67',
}));

const runtimeRoutes = bookRuntimeRouteDescriptors.map((route) => contributor({
  id: `book.runtime.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#74',
  domain: 'runtime',
  handler: `bookRuntime.${route.handler}`,
  firebaseAuth: 'firebase-id-token-student',
  rateClass: route.method === 'GET' ? 'book-read' : 'book-control',
  gateEnv: 'BOOK_RUNTIME_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_RUNTIME_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_RUNTIME_GOOGLE_SA_KEY',
  contributorTicket: '#74',
}));

const sourceUploadRoutes = bookSourceRouteDescriptors.map((route) => contributor({
  id: `book.source-upload.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#49',
  domain: 'source-upload',
  handler: `bookSource.${route.handler}`,
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: route.handler === 'status' ? 'book-read' : 'book-control',
  gateEnv: 'BOOK_SOURCE_UPLOAD_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY',
  contributorTicket: '#49',
}));

const courseBookRoutes = courseBookPlacementRouteDescriptors.map((route) => contributor({
  id: `book.course-placement.${route.handler}`,
  method: route.method,
  path: route.path,
  owner: '#102',
  domain: 'delivery',
  handler: `courseBookPlacement.${route.handler}`,
  firebaseAuth: route.handler === 'resolve' ? 'firebase-id-token-student' : 'firebase-id-token-owner',
  rateClass: route.handler === 'resolve' ? 'book-read' : 'book-control',
  gateEnv: 'COURSE_BOOK_PLACEMENT_ROUTES_ENABLED',
  requestBodyBytes: route.method === 'GET' ? 0 : MAX_CONTROL_REQUEST_BYTES,
  responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY',
  contributorTicket: '#102',
}));

const documentRoute = contributor({
  id: 'book.document-delivery.serve-authorized-document',
  method: bookDocumentAuthorizationRouteDescriptor.method,
  path: bookDocumentAuthorizationRouteDescriptor.path,
  owner: '#51/#52',
  domain: 'document-delivery',
  handler: bookDocumentAuthorizationRouteDescriptor.handler,
  firebaseAuth: 'firebase-id-token-before-lookup',
  rateClass: 'book-document',
  gateEnv: 'BOOK_DOCUMENT_DELIVERY_ROUTES_ENABLED',
  requestBodyBytes: bookDocumentAuthorizationRouteDescriptor.requestBodyBytes,
  responseLimitBytes: bookDocumentAuthorizationRouteDescriptor.responseLimitBytes,
  identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY',
  contributorTicket: '#51/#52',
});

const historicalAttemptDocumentRoute = contributor({
  id: 'book.document-delivery.serve-historical-attempt-document',
  method: bookHistoricalAttemptDocumentRouteDescriptor.method,
  path: bookHistoricalAttemptDocumentRouteDescriptor.path,
  owner: '#80',
  domain: 'document-delivery',
  handler: bookHistoricalAttemptDocumentRouteDescriptor.handler,
  firebaseAuth: 'firebase-id-token-before-lookup',
  rateClass: 'book-document',
  gateEnv: 'BOOK_HISTORICAL_DOCUMENT_ROUTES_ENABLED',
  requestBodyBytes: bookHistoricalAttemptDocumentRouteDescriptor.requestBodyBytes,
  responseLimitBytes: bookHistoricalAttemptDocumentRouteDescriptor.responseLimitBytes,
  identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY',
  contributorTicket: '#80',
});

const teacherAssemblyDocumentRoute = contributor({
  id: 'book.document-delivery.serve-teacher-assembly-document',
  method: bookTeacherAssemblyDocumentRouteDescriptor.method,
  path: bookTeacherAssemblyDocumentRouteDescriptor.path,
  owner: '#58',
  domain: 'document-delivery',
  handler: bookTeacherAssemblyDocumentRouteDescriptor.handler,
  firebaseAuth: 'firebase-id-token-before-lookup',
  rateClass: 'book-document',
  gateEnv: 'BOOK_TEACHER_ASSEMBLY_DOCUMENT_ROUTES_ENABLED',
  requestBodyBytes: bookTeacherAssemblyDocumentRouteDescriptor.requestBodyBytes,
  responseLimitBytes: bookTeacherAssemblyDocumentRouteDescriptor.responseLimitBytes,
  identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
  contributorTicket: '#58',
});

const futureRoutes: BookRouteManifest = [
  future({
    id: 'book.homework.assignment-command',
    methods: ['POST'],
    pathTemplate: '/book-homework/assignments/:assignmentId/commands',
    owner: '#86',
    domain: 'homework',
    handler: 'futureSeam.homeworkAssignmentCommand',
    firebaseAuth: 'firebase-id-token-teacher',
    rateClass: 'book-future',
    gateEnv: 'BOOK_HOMEWORK_ROUTES_ENABLED',
    requestBodyBytes: MAX_CONTROL_REQUEST_BYTES,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
    identityEnv: 'BOOK_HOMEWORK_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_HOMEWORK_GOOGLE_SA_KEY',
  }),
  future({
    id: 'book.homework.student-projection',
    methods: ['GET'],
    pathTemplate: '/book-homework/assignments/:assignmentId/student-projection',
    owner: '#86',
    domain: 'homework',
    handler: 'futureSeam.homeworkStudentProjection',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-future',
    gateEnv: 'BOOK_HOMEWORK_READ_ROUTES_ENABLED',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
    identityEnv: 'BOOK_HOMEWORK_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_HOMEWORK_GOOGLE_SA_KEY',
  }),
  future({
    id: 'book.homework.teacher-student-projection',
    methods: ['GET'],
    pathTemplate: '/book-homework/assignments/:assignmentId/students/:studentId/projection',
    owner: '#88',
    domain: 'homework',
    handler: 'futureSeam.homeworkTeacherStudentProjection',
    firebaseAuth: 'firebase-id-token-teacher',
    rateClass: 'book-future',
    gateEnv: 'BOOK_HOMEWORK_READ_ROUTES_ENABLED',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
    identityEnv: 'BOOK_HOMEWORK_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_HOMEWORK_GOOGLE_SA_KEY',
  }),
  future({
    id: 'book.homework.teacher-projection',
    methods: ['GET'],
    pathTemplate: '/book-homework/assignments/:assignmentId/teacher-projection',
    owner: '#88',
    domain: 'homework',
    handler: 'futureSeam.homeworkTeacherProjection',
    firebaseAuth: 'firebase-id-token-teacher',
    rateClass: 'book-future',
    gateEnv: 'BOOK_HOMEWORK_READ_ROUTES_ENABLED',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
    identityEnv: 'BOOK_HOMEWORK_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_HOMEWORK_GOOGLE_SA_KEY',
  }),
  future({
    id: 'book.evaluation-history.read',
    methods: ['GET'],
    pathTemplate: '/book-evaluation/history/:bookId/:studentId',
    owner: '#89',
    domain: 'evaluation-history',
    handler: 'futureSeam.evaluationHistoryRead',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-future',
    gateEnv: 'BOOK_EVALUATION_HISTORY_ROUTES_ENABLED',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  }),
  future({
    id: 'book.integrity.signal',
    methods: ['POST'],
    pathTemplate: '/book-integrity/books/:bookId/signals',
    owner: '#91',
    domain: 'integrity',
    handler: 'futureSeam.integritySignal',
    firebaseAuth: 'firebase-id-token-student',
    rateClass: 'book-future',
    gateEnv: 'BOOK_INTEGRITY_ROUTES_ENABLED',
    requestBodyBytes: 4 * 1024,
    responseLimitBytes: 8 * 1024,
    identityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
    credentialEnv: 'BOOK_INTEGRITY_GOOGLE_SA_KEY',
  }),
  future({
    id: bookIntegrityReportRouteDescriptor.id,
    methods: bookIntegrityReportRouteDescriptor.methods,
    pathTemplate: bookIntegrityReportRouteDescriptor.pathTemplate,
    owner: '#92',
    domain: 'integrity',
    handler: bookIntegrityReportRouteDescriptor.handler,
    firebaseAuth: bookIntegrityReportRouteDescriptor.firebaseAuth,
    rateClass: bookIntegrityReportRouteDescriptor.rateClass,
    gateEnv: bookIntegrityReportRouteDescriptor.gateEnv,
    requestBodyBytes: bookIntegrityReportRouteDescriptor.requestBodyBytes,
    responseLimitBytes: bookIntegrityReportRouteDescriptor.responseLimitBytes,
    identityEnv: bookIntegrityReportRouteDescriptor.identityEnv,
    credentialEnv: bookIntegrityReportRouteDescriptor.credentialEnv,
  }),
  future({
    id: 'book.notifications.command',
    methods: ['POST'],
    pathTemplate: '/book-notifications/commands',
    owner: '#100',
    domain: 'notifications',
    handler: 'futureSeam.notificationCommand',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-future',
    gateEnv: 'BOOK_NOTIFICATIONS_ROUTES_ENABLED',
    requestBodyBytes: MAX_CONTROL_REQUEST_BYTES,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  }),
  future({
    id: 'book.impact-snapshot.read',
    methods: ['GET'],
    pathTemplate: '/book-impact/snapshots/:bookId',
    owner: '#108',
    domain: 'impact-snapshot',
    handler: 'futureSeam.impactSnapshotRead',
    firebaseAuth: 'firebase-id-token',
    rateClass: 'book-future',
    gateEnv: 'BOOK_IMPACT_SNAPSHOT_ROUTES_ENABLED',
    requestBodyBytes: 0,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  }),
  future({
    id: 'book.updates.command',
    methods: ['POST'],
    pathTemplate: '/book-updates/books/:bookId/commands',
    owner: '#109',
    domain: 'updates',
    handler: 'futureSeam.updateCommand',
    firebaseAuth: 'firebase-id-token-teacher',
    rateClass: 'book-future',
    gateEnv: 'BOOK_UPDATES_ROUTES_ENABLED',
    requestBodyBytes: MAX_CONTROL_REQUEST_BYTES,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  }),
  future({
    id: 'book.replacement-cleanup.command',
    methods: ['POST'],
    pathTemplate: '/book-replacement-cleanup/books/:bookId/commands',
    owner: '#116',
    domain: 'replacement-cleanup',
    handler: 'futureSeam.replacementCleanupCommand',
    firebaseAuth: 'firebase-id-token-teacher',
    rateClass: 'book-future',
    gateEnv: 'BOOK_REPLACEMENT_CLEANUP_ROUTES_ENABLED',
    requestBodyBytes: MAX_CONTROL_REQUEST_BYTES,
    responseLimitBytes: MAX_CONTROL_RESPONSE_BYTES,
  }),
];

export const canonicalBookRouteManifest: BookRouteManifest = Object.freeze([
  ...deliveryRoutes,
  ...activityAuthoringRoutes,
  ...assemblyRoutes,
  ...assemblyMigrationRoutes,
  ...assemblyPublicationRoutes,
  ...assemblySuccessorRoutes,
  ...assemblyMappingRevisionRoutes,
  ...sourceUploadRoutes,
  ...courseBookRoutes,
  ...runtimeRoutes,
  documentRoute,
  historicalAttemptDocumentRoute,
  teacherAssemblyDocumentRoute,
  ...futureRoutes,
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const enumIncludes = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => (
  typeof value === 'string' && (values as readonly string[]).includes(value)
);

const envName = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(value)
);

const pathTemplate = (value: unknown): value is string => (
  typeof value === 'string'
  && value.startsWith('/')
  && !value.includes('?')
  && !value.includes('#')
  && !value.includes('//')
  && value.split('/').slice(1).every((segment) => (
    segment.length > 0
    && (segment.startsWith(':')
      ? /^:[A-Za-z][A-Za-z0-9_]*$/u.test(segment)
      : /^[A-Za-z0-9._~-]+$/u.test(segment))
  ))
);

export const normalizeBookRouteTemplate = (path: string): string => path
  .split('/')
  .map((segment) => segment.startsWith(':') ? ':param' : segment)
  .join('/');

const forbiddenTarget = (value: string): boolean => /backup|public[-_ ]?b2|bearer|paid[-_ ]?pdf|vite_backup_worker_url/iu.test(value);

const routeTemplatesCanOverlap = (left: string, right: string): boolean => {
  const leftSegments = left.split('/').slice(1);
  const rightSegments = right.split('/').slice(1);
  return leftSegments.length === rightSegments.length
    && leftSegments.every((leftSegment, index) => {
      const rightSegment = rightSegments[index]!;
      return leftSegment.startsWith(':')
        || rightSegment.startsWith(':')
        || leftSegment === rightSegment;
    });
};

export const validateBookRouteManifest = (manifest: unknown): BookRouteManifest => {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('book_route_manifest_must_be_nonempty');
  }

  const ids = new Set<string>();
  const domains = new Set<BookRouteDomain>();
  const exactRoutes = new Set<string>();
  const normalizedRoutes = new Map<string, Set<BookRouteMethod>>();
  const templatesByMethod = new Map<BookRouteMethod, string[]>();

  for (const [index, value] of manifest.entries()) {
    if (!isRecord(value)) throw new Error(`book_route_descriptor_invalid:${index}`);
    const descriptor = value as Partial<CanonicalBookRouteDescriptor>;
    if (typeof descriptor.id !== 'string' || descriptor.id.length === 0 || ids.has(descriptor.id)) {
      throw new Error(`book_route_duplicate_or_missing_id:${index}`);
    }
    ids.add(descriptor.id);
    domains.add(descriptor.domain as BookRouteDomain);
    if (!Array.isArray(descriptor.methods) || descriptor.methods.length === 0
      || descriptor.methods.some((method) => !enumIncludes(BOOK_ROUTE_METHODS, method))
      || new Set(descriptor.methods).size !== descriptor.methods.length) {
      throw new Error(`book_route_methods_invalid:${descriptor.id}`);
    }
    if (!pathTemplate(descriptor.pathTemplate)) throw new Error(`book_route_path_invalid:${descriptor.id}`);
    if (typeof descriptor.owner !== 'string' || descriptor.owner.length === 0
      || !enumIncludes(BOOK_ROUTE_DOMAINS, descriptor.domain)
      || typeof descriptor.handler !== 'string' || descriptor.handler.length === 0) {
      throw new Error(`book_route_ownership_invalid:${descriptor.id}`);
    }
    if (!enumIncludes(BOOK_ROUTE_FIREBASE_AUTH, descriptor.firebaseAuth)) {
      throw new Error(`book_route_firebase_auth_invalid:${descriptor.id}`);
    }
    if (!enumIncludes(BOOK_ROUTE_RATE_CLASSES, descriptor.rateClass)) {
      throw new Error(`book_route_rate_class_invalid:${descriptor.id}`);
    }
    if (!envName(descriptor.gateEnv) || !/^BOOK_[A-Z0-9]+(?:_[A-Z0-9]+)*_ROUTES_ENABLED$/u.test(descriptor.gateEnv)
      || descriptor.gateDefault !== 'disabled') {
      throw new Error(`book_route_gate_invalid:${descriptor.id}`);
    }
    const requestBodyBytes = descriptor.requestBodyBytes;
    const responseLimitBytes = descriptor.responseLimitBytes;
    if (typeof requestBodyBytes !== 'number' || !Number.isSafeInteger(requestBodyBytes) || requestBodyBytes < 0
      || requestBodyBytes > MAX_ASSEMBLY_REQUEST_BYTES
      || typeof responseLimitBytes !== 'number' || !Number.isSafeInteger(responseLimitBytes) || responseLimitBytes <= 0
      || responseLimitBytes > MAX_DOCUMENT_RESPONSE_BYTES
      || (descriptor.methods.includes('GET') && requestBodyBytes !== 0)
      || (descriptor.methods.includes('HEAD') && requestBodyBytes !== 0)) {
      throw new Error(`book_route_limits_invalid:${descriptor.id}`);
    }
    if (descriptor.identityEnv !== undefined && !envName(descriptor.identityEnv)) {
      throw new Error(`book_route_identity_env_invalid:${descriptor.id}`);
    }
    if (descriptor.credentialEnv !== undefined && !envName(descriptor.credentialEnv)) {
      throw new Error(`book_route_credential_env_invalid:${descriptor.id}`);
    }
    if (descriptor.identityEnv === 'GOOGLE_SA_KEY' || descriptor.credentialEnv === 'GOOGLE_SA_KEY') {
      throw new Error(`book_route_shared_credential_invalid:${descriptor.id}`);
    }
    if (descriptor.source !== 'contributor' && descriptor.source !== 'future-seam') {
      throw new Error(`book_route_source_invalid:${descriptor.id}`);
    }
    if (descriptor.source === 'contributor'
      && (typeof descriptor.contributorTicket !== 'string' || descriptor.contributorTicket.length === 0)) {
      throw new Error(`book_route_contributor_missing:${descriptor.id}`);
    }
    if (descriptor.source === 'contributor'
      && ['#31', '#35', '#49', '#55', '#59', '#70', '#74'].includes(descriptor.contributorTicket ?? '')
      && (!descriptor.identityEnv || !descriptor.credentialEnv)) {
      throw new Error(`book_route_dedicated_credentials_missing:${descriptor.id}`);
    }
    if ([descriptor.id, descriptor.pathTemplate, descriptor.handler].some((part) => forbiddenTarget(part!))) {
      throw new Error(`book_route_forbidden_target:${descriptor.id}`);
    }

    for (const method of descriptor.methods) {
      const exactKey = `${method} ${descriptor.pathTemplate}`;
      if (exactRoutes.has(exactKey)) throw new Error(`book_route_duplicate_method_path:${exactKey}`);
      exactRoutes.add(exactKey);
      const normalizedKey = normalizeBookRouteTemplate(descriptor.pathTemplate);
      const methods = normalizedRoutes.get(normalizedKey) ?? new Set<BookRouteMethod>();
      if ([...methods].some((existing) => existing === method)) {
        throw new Error(`book_route_ambiguous_template:${method} ${normalizedKey}`);
      }
      if ((templatesByMethod.get(method) ?? []).some((template) =>
        routeTemplatesCanOverlap(template, descriptor.pathTemplate))) {
        throw new Error(`book_route_ambiguous_template:${method} ${descriptor.pathTemplate}`);
      }
      methods.add(method);
      normalizedRoutes.set(normalizedKey, methods);
      templatesByMethod.set(method, [
        ...(templatesByMethod.get(method) ?? []),
        descriptor.pathTemplate,
      ]);
    }
  }

  for (const domain of BOOK_ROUTE_DOMAINS) {
    if (!domains.has(domain)) throw new Error(`book_route_domain_missing:${domain}`);
  }

  return manifest as BookRouteManifest;
};

export const validateCanonicalBookRouteManifest = validateBookRouteManifest;

validateBookRouteManifest(canonicalBookRouteManifest);
