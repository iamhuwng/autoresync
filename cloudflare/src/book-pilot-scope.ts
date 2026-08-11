import {
  BOOK_PILOT_SCOPE_ENFORCEMENT_DISABLED_FINGERPRINT,
  buildBookPilotScopeAuditPayload,
  evaluateBookPilotScope,
  type BookPilotActorKind,
  type BookPilotScopeDecision,
  type BookPilotScopeRequest,
} from '../../src/services/book-rollout/bookPilotScope.policy.ts';
import type { BookRouterEnv, BookRouteParams } from './upload-worker/book-router.ts';
import type { CanonicalBookRouteDescriptor } from './upload-worker/book-routes/types.ts';

export interface BookPilotScopeErrorOptions {
  readonly status?: number;
  readonly code?: string;
}

export class BookPilotScopeDeniedError extends Error {
  constructor(
    readonly decision: BookPilotScopeDecision,
    options: BookPilotScopeErrorOptions = {},
  ) {
    super(options.code ?? 'book_pilot_scope_denied');
    this.name = 'BookPilotScopeDeniedError';
    this.status = options.status ?? statusFor(decision.reason);
  }

  readonly status: number;
}

const jsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Preserve the distinction between an absent binding and malformed JSON;
    // the policy will reject this non-conforming object as invalid_config.
    return {};
  }
};

const envString = (env: BookRouterEnv, name: string): string | undefined => (
  typeof env[name] === 'string' ? String(env[name]) : undefined
);

const scopeConfig = (env: BookRouterEnv): unknown => jsonValue(env.BOOK_PILOT_SCOPE_CONFIG_JSON);

const scopeEnvironment = (env: BookRouterEnv): string => (
  envString(env, 'BOOK_PILOT_SCOPE_ENVIRONMENT')
    ?? envString(env, 'BOOK_ROLLOUT_ENVIRONMENT')
    ?? envString(env, 'BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT')
    ?? 'unknown'
);

const enabled = (env: BookRouterEnv): boolean => env.BOOK_PILOT_SCOPE_ENFORCEMENT === 'enabled';

const disabledDecision = (
  operation: BookPilotScopeRequest['operation'],
): BookPilotScopeDecision => ({
  schemaVersion: 1,
  allowed: false,
  operation,
  reason: 'enforcement_disabled',
  environment: 'unknown',
  revision: 'unavailable',
  fingerprint: BOOK_PILOT_SCOPE_ENFORCEMENT_DISABLED_FINGERPRINT,
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const stringValue = (...values: readonly unknown[]): string | undefined => (
  values.find((value): value is string => typeof value === 'string' && value.length > 0)
);

const arrayOfStrings = (...values: readonly unknown[]): readonly string[] | undefined => {
  const value = values.find((candidate): candidate is readonly unknown[] => (
    Array.isArray(candidate)
  ));
  if (!value || value.some((item) => typeof item !== 'string')) return undefined;
  return value as readonly string[];
};

const requestBody = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const value = await request.clone().json() as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
};

const nested = (body: Record<string, unknown>): Record<string, unknown> => (
  isRecord(body.intent) ? body.intent : {}
);

const subjectFor = (
  body: Record<string, unknown>,
  params: BookRouteParams,
): {
  readonly bookId?: string;
  readonly assignmentId?: string;
  readonly contextKind?: string;
  readonly studentId?: string;
  readonly selectedStudentIds?: readonly string[];
  readonly count?: number;
} => {
  const intent = nested(body);
  const selected = arrayOfStrings(
    body.selectedStudentIds,
    body.selectedRecipientIds,
    body.studentIds,
    intent.selectedStudentIds,
    intent.selectedRecipientIds,
    intent.studentIds,
  );
  const countValue = body.studentCount ?? body.recipientCount ?? intent.studentCount ?? intent.recipientCount;
  return {
    bookId: stringValue(
      params.bookId,
      params.copyId,
      params.courseMaterialId,
      body.bookId,
      body.bookKey,
      intent.bookId,
      intent.bookKey,
    ),
    assignmentId: stringValue(
      params.assignmentId,
      params.contextId,
      body.assignmentId,
      body.contextId,
      intent.assignmentId,
      intent.contextId,
    ),
    contextKind: stringValue(body.contextKind, intent.contextKind),
    studentId: stringValue(
      params.studentId,
      params.recipientId,
      body.studentId,
      body.recipientId,
      intent.studentId,
      intent.recipientId,
    ),
    selectedStudentIds: selected,
    count: typeof countValue === 'number' ? countValue : undefined,
  };
};

const isRead = (descriptor: CanonicalBookRouteDescriptor, request: Request): boolean => (
  request.method === 'GET' || request.method === 'HEAD'
);

const operationFor = (
  descriptor: CanonicalBookRouteDescriptor,
): BookPilotScopeRequest['operation'] => {
  if (descriptor.domain === 'source-upload') {
    return descriptor.handler.endsWith('.begin') || descriptor.handler === 'bookSource.begin' ? 'upload' : 'mutation';
  }
  if (descriptor.domain === 'activity-authoring') {
    return descriptor.handler.endsWith('.stage') || descriptor.handler === 'bookActivityAuthoring.stage' ? 'create' : 'mutation';
  }
  if (descriptor.domain === 'assembly'
    && (descriptor.handler.includes('Publish') || descriptor.handler.includes('publish'))) {
    return 'publish';
  }
  if (descriptor.domain === 'delivery' || descriptor.domain === 'homework') return 'assign-place';
  if (descriptor.domain === 'runtime' && descriptor.handler.includes('Launch')) return 'launch-delivery';
  return 'mutation';
};

const requirementsFor = (
  descriptor: CanonicalBookRouteDescriptor,
  operation: BookPilotScopeRequest['operation'],
): Pick<BookPilotScopeRequest, 'requireBook' | 'requireAssignment' | 'requireStudents'> => {
  // Activation and revocation address an existing trusted binding. Their
  // direct worker boundary reads the binding before checking its exact pilot
  // subjects; the router still checks the authenticated teacher here.
  if (descriptor.domain === 'delivery'
    && (descriptor.handler.endsWith('.activate') || descriptor.handler.endsWith('.revoke'))) {
    return { requireBook: false, requireAssignment: false, requireStudents: false };
  }
  // Activity authoring resolves its Book from the authenticated owner's
  // material metadata at the trusted worker boundary. The router still
  // validates enforcement/configuration here, but cannot derive the binding
  // for candidate validate/save/discard requests from their bodies.
  const requireBook = descriptor.domain !== 'activity-authoring' && (
    descriptor.domain === 'runtime'
    || descriptor.domain === 'source-upload'
    || descriptor.domain === 'assembly'
    || descriptor.domain === 'updates'
    || descriptor.domain === 'replacement-cleanup'
    || descriptor.domain === 'integrity'
  );
  const requireAssignment = operation === 'assign-place' || operation === 'launch-delivery'
    || descriptor.domain === 'runtime';
  const requireStudents = operation === 'assign-place' || operation === 'launch-delivery';
  return { requireBook, requireAssignment, requireStudents };
};

const actorKindFor = (descriptor: CanonicalBookRouteDescriptor): BookPilotActorKind => (
  descriptor.firebaseAuth.includes('student') ? 'student' : 'teacher'
);

const statusFor = (reason: BookPilotScopeDecision['reason']): number => {
  if (reason === 'count_exceeded') return 409;
  if (reason.endsWith('_denied')) return 403;
  return 503;
};

const DIRECT_TEACHER_DESCRIPTOR = Object.freeze({
  id: 'book.pilot.direct.teacher-mutation',
  methods: ['POST'],
  pathTemplate: '/book-pilot/direct',
  owner: '#126',
  domain: 'activity-authoring',
  handler: 'bookActivityAuthoring.direct',
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED',
  gateDefault: 'disabled',
  requestBodyBytes: 256 * 1024,
  responseLimitBytes: 256 * 1024,
  source: 'future-seam',
} as const satisfies CanonicalBookRouteDescriptor);

const decisionFor = async (input: {
  readonly env: BookRouterEnv;
  readonly uid: string;
  readonly request: Request;
  readonly descriptor: CanonicalBookRouteDescriptor;
  readonly params: BookRouteParams;
  readonly operation?: BookPilotScopeRequest['operation'];
  readonly actorKind?: BookPilotActorKind;
  /** null is an explicit unresolved trusted Book slot; never fall back to body claims. */
  readonly bookId?: string | null;
  readonly assignmentId?: string;
  readonly contextKind?: string;
  readonly studentId?: string;
  readonly selectedStudentIds?: readonly string[];
  readonly count?: number;
  readonly requireBook?: boolean;
  readonly requireAssignment?: boolean;
  readonly requireStudents?: boolean;
}): Promise<BookPilotScopeDecision> => {
  const body = await requestBody(input.request);
  const subject = subjectFor(body, input.params);
  const operation = input.operation ?? operationFor(input.descriptor);
  const requirements = requirementsFor(input.descriptor, operation);
  const actorKind = input.actorKind ?? actorKindFor(input.descriptor);
  return evaluateBookPilotScope({
    operation,
    expectedEnvironment: scopeEnvironment(input.env),
    actorId: input.uid,
    actorKind,
    bookId: input.bookId === null ? undefined : input.bookId ?? subject.bookId,
    assignmentId: input.assignmentId ?? subject.assignmentId,
    contextKind: input.contextKind ?? subject.contextKind,
    studentId: input.studentId ?? subject.studentId,
    selectedStudentIds: input.selectedStudentIds ?? subject.selectedStudentIds,
    count: input.count ?? subject.count,
    requireBook: input.requireBook ?? requirements.requireBook,
    requireAssignment: input.requireAssignment ?? requirements.requireAssignment,
    requireStudents: input.requireStudents ?? requirements.requireStudents,
    configReader: { read: () => scopeConfig(input.env) },
    now: new Date(),
  });
};

const audit = (env: BookRouterEnv, decision: BookPilotScopeDecision): void => {
  const sink = env.BOOK_PILOT_SCOPE_AUDIT;
  if (typeof sink === 'function') {
    (sink as (payload: unknown) => void)(buildBookPilotScopeAuditPayload(decision));
    return;
  }
  console.info('book_pilot_scope', buildBookPilotScopeAuditPayload(decision));
};

export const enforceBookPilotScopeRoute = async (input: {
  readonly env: BookRouterEnv;
  readonly uid: string;
  readonly request: Request;
  readonly descriptor: CanonicalBookRouteDescriptor;
  readonly params: BookRouteParams;
}): Promise<void> => {
  if (isRead(input.descriptor, input.request)) return;
  if (!enabled(input.env)) {
    const decision = disabledDecision(operationFor(input.descriptor));
    audit(input.env, decision);
    throw new BookPilotScopeDeniedError(decision);
  }
  const decision = await decisionFor({
    ...input,
    // Runtime commands/launch resolve their trusted Book from the delivery
    // binding in the worker; that worker performs the final exact Book check.
    ...(input.descriptor.domain === 'runtime'
      ? { requireBook: false }
      : {}),
  });
  audit(input.env, decision);
  if (!decision.allowed) throw new BookPilotScopeDeniedError(decision);
};

/** Direct worker/adaptor boundary. It remains active when no canonical router is involved. */
export const enforceBookPilotScopeIfConfigured = async (input: {
  readonly env: object;
  readonly uid: string;
  readonly request: Request;
  readonly descriptor?: CanonicalBookRouteDescriptor;
  readonly params?: BookRouteParams;
  readonly operation?: BookPilotScopeRequest['operation'];
  readonly actorKind?: BookPilotActorKind;
  readonly bookId?: string | null;
  readonly assignmentId?: string;
  readonly contextKind?: string;
  readonly studentId?: string;
  readonly selectedStudentIds?: readonly string[];
  readonly count?: number;
  readonly requireBook?: boolean;
  readonly requireAssignment?: boolean;
  readonly requireStudents?: boolean;
}): Promise<void> => {
  const env = input.env as BookRouterEnv;
  const descriptor = input.descriptor ?? DIRECT_TEACHER_DESCRIPTOR;
  if (isRead(descriptor, input.request)) return;
  if (!enabled(env)) {
    const decision = disabledDecision(input.operation ?? operationFor(descriptor));
    audit(env, decision);
    throw new BookPilotScopeDeniedError(decision);
  }
  const decision = await decisionFor({
    ...input,
    env,
    descriptor,
    params: input.params ?? {},
    // Activity authoring has no trusted Book-bound seam. A client-supplied
    // bookId must not authorize an owner-only authoring operation.
    ...(descriptor.domain === 'activity-authoring' && input.bookId === undefined
      ? { bookId: null }
      : {}),
    // Runtime commands/launch resolve the Book from their trusted delivery
    // binding; the worker performs the final exact Book check after resolution.
    ...(descriptor.domain === 'runtime'
      ? { requireBook: false }
      : {}),
  });
  audit(env, decision);
  if (!decision.allowed) throw new BookPilotScopeDeniedError(decision);
};

export const BOOK_PILOT_SCOPE_ENABLED_ENV = 'BOOK_PILOT_SCOPE_ENFORCEMENT';
