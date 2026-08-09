import {
  createPublicBookReferenceForkService,
  PublicBookReferenceForkError,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.service.ts';
import { PublicBookReferenceForkRolloutGate } from '../../../../src/services/materialCatalog/publicBookReferenceFork.rolloutGate.ts';
import type {
  PublicBookDocumentIssuer,
  PublicBookReferenceForkService,
  PublicBookReferenceForkStore,
  PublicBookSourceContextChoice,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.types.ts';
import { FirebaseRestPublicBookReferenceForkRepository } from './repository.ts';
import type { RepositoryEnv } from '../listening-authoring/rtdb.ts';

const MAX_REQUEST_BYTES = 32 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const ROLES = ['student', 'teacher', 'super_admin'] as const;
type PublicBookRole = (typeof ROLES)[number];
const MUTATION_ACTIONS = new Set(['reference', 'migrate', 'adopt', 'rollback']);
export const isPublicBookReferenceForkPath = (pathname: string): boolean =>
  pathname === '/v1/public-book-reference-fork'
  || pathname.startsWith('/v1/public-book-reference-fork/');

export interface PublicBookReferenceForkWorkerEnv extends RepositoryEnv {
  readonly PUBLIC_BOOK_REFERENCE_FORK_ENABLED?: string;
  readonly PUBLIC_BOOK_REFERENCE_FORK_ROLLBACK?: string;
}

type HandlerContext = {
  readonly request: Request;
  readonly env: PublicBookReferenceForkWorkerEnv;
  readonly uid: string;
  readonly role: PublicBookRole;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const keysWithOptional = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => allowed.has(key));
};

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new PublicBookReferenceForkError('request-too-large', 'Request is too large.', 413);
  }
  let value: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      throw new PublicBookReferenceForkError('request-too-large', 'Request is too large.', 413);
    }
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof PublicBookReferenceForkError) throw error;
    throw new PublicBookReferenceForkError('request-invalid', 'Request JSON is invalid.', 400);
  }
  if (!isRecord(value)) throw new PublicBookReferenceForkError('request-invalid', 'Request body is invalid.', 400);
  return value;
};

const safeId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new PublicBookReferenceForkError('request-invalid', field + ' is invalid.', 400);
  }
  return value;
};

const selectionFromBody = (value: unknown) => {
  if (!isRecord(value)
    || !exactKeys(value, ['sourceBookId', 'publicationId', 'publicationRevision', 'kind', 'selectionPath', 'activities'])
    || typeof value.sourceBookId !== 'string'
    || typeof value.publicationId !== 'string'
    || typeof value.publicationRevision !== 'number'
    || typeof value.kind !== 'string'
    || !Array.isArray(value.selectionPath)
    || !Array.isArray(value.activities)) {
    throw new PublicBookReferenceForkError('request-invalid', 'Selection is invalid.', 400);
  }
  return {
    sourceBookId: safeId(value.sourceBookId, 'selection.sourceBookId'),
    publicationId: safeId(value.publicationId, 'selection.publicationId'),
    publicationRevision: value.publicationRevision,
    kind: value.kind as 'book' | 'section' | 'chapter' | 'unit' | 'activity',
    selectionPath: value.selectionPath as string[],
    activities: value.activities.map((activity) => {
      if (!isRecord(activity) || !exactKeys(activity, ['activityId', 'activityVersionId', 'order'])) {
        throw new PublicBookReferenceForkError('request-invalid', 'Selection Activity is invalid.', 400);
      }
      return {
        activityId: safeId(activity.activityId, 'selection.activityId'),
        activityVersionId: safeId(activity.activityVersionId, 'selection.activityVersionId'),
        order: activity.order as number,
      };
    }),
  };
};

const contextFromBody = (value: unknown): PublicBookSourceContextChoice | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new PublicBookReferenceForkError('request-invalid', 'Source context is invalid.', 400);
  if (value.mode === 'none' && exactKeys(value, ['mode'])) return { mode: 'none' };
  if (value.mode === 'book-source-reference'
    && exactKeys(value, ['mode', 'sourceBookId', 'sourceVersionId', 'selectionPath', 'pageGroupIds'])
    && Array.isArray(value.selectionPath)
    && Array.isArray(value.pageGroupIds)) {
    return {
      mode: 'book-source-reference',
      sourceBookId: safeId(value.sourceBookId, 'context.sourceBookId'),
      sourceVersionId: safeId(value.sourceVersionId, 'context.sourceVersionId'),
      selectionPath: value.selectionPath as string[],
      pageGroupIds: value.pageGroupIds as string[],
    };
  }
  throw new PublicBookReferenceForkError('request-invalid', 'Source context is invalid.', 400);
};

const targetFromBody = (value: unknown) => {
  if (!isRecord(value) || !exactKeys(value, ['bookId', 'nodeId', 'placementId'])) {
    throw new PublicBookReferenceForkError('request-invalid', 'Target is invalid.', 400);
  }
  return {
    bookId: safeId(value.bookId, 'target.bookId'),
    nodeId: safeId(value.nodeId, 'target.nodeId'),
    placementId: safeId(value.placementId, 'target.placementId'),
  };
};

const statusForError = (error: unknown): number => {
  if (error instanceof PublicBookReferenceForkError) return error.statusCode;
  return 500;
};

const codeForError = (error: unknown, status: number): string => {
  if (error instanceof PublicBookReferenceForkError) return error.code;
  return status >= 500 ? 'public-book-reference-fork-unavailable' : 'public-book-reference-fork-request-invalid';
};

const responseFor = (body: unknown, status = 200): {
  readonly body: unknown;
  readonly init: ResponseInit;
} => ({
  body,
  init: {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json',
    },
  },
});

export interface PublicBookReferenceForkWorkerOptions {
  readonly store?: PublicBookReferenceForkStore;
  readonly service?: PublicBookReferenceForkService;
  readonly enabled?: boolean;
  readonly mutationsEnabled?: boolean;
  readonly now?: () => string;
  readonly createId?: (kind: string) => string;
  readonly documentIssuer?: PublicBookDocumentIssuer;
}

export const createPublicBookReferenceForkWorkerHandlers = (
  options: PublicBookReferenceForkWorkerOptions = {},
) => {
  const storeFor = (env: PublicBookReferenceForkWorkerEnv): PublicBookReferenceForkStore =>
    options.store ?? new FirebaseRestPublicBookReferenceForkRepository({ env });
  const serviceFor = (env: PublicBookReferenceForkWorkerEnv): PublicBookReferenceForkService =>
    options.service ?? (() => {
      const rollout = PublicBookReferenceForkRolloutGate.fromEnvironment(env);
      return createPublicBookReferenceForkService({
        store: storeFor(env),
        now: options.now,
        createId: options.createId,
        mutationsEnabled: options.mutationsEnabled === true && rollout.enabled,
        rollbackEnabled: rollout.rollback,
        documentIssuer: options.documentIssuer,
      });
    })();

  const handle = async ({ request, env, uid, role }: HandlerContext) => {
    try {
      const rollout = PublicBookReferenceForkRolloutGate.fromEnvironment(env);
      const compositionEnabled = options.enabled === undefined ? rollout.enabled : options.enabled;
      if (!isPublicBookReferenceForkPath(new URL(request.url).pathname)) {
        throw new PublicBookReferenceForkError('route-not-found', 'Public Book reference/fork route was not found.', 404);
      }
      if (request.method !== 'POST') {
        throw new PublicBookReferenceForkError('method-not-allowed', 'POST is required.', 405);
      }
      safeId(uid, 'uid');
      if (!ROLES.includes(role)) {
        throw new PublicBookReferenceForkError('role-denied', 'Role is not authorized.', 403);
      }
      const body = await readJson(request);
      if (typeof body.action !== 'string') {
        throw new PublicBookReferenceForkError('request-invalid', 'Action is required.', 400);
      }
      // Forks have no authorized canonical version-1 writer. Reject before
      // rollout checks, service construction, or any store access.
      if (body.action === 'fork') {
        throw new PublicBookReferenceForkError(
          'fork-disabled',
          'Public Book Activity forks are disabled pending a canonical writer.',
          503,
        );
      }
      if (!compositionEnabled) {
        throw new PublicBookReferenceForkError(
          'feature-disabled',
          'Public Book reference/fork is disabled.',
          503,
        );
      }
      if (MUTATION_ACTIONS.has(body.action)
        && PublicBookReferenceForkRolloutGate.fromEnvironment(env).rollback) {
        throw new PublicBookReferenceForkError(
          'feature-rollback',
          'Public Book reference/fork writes are blocked by deny-only rollback.',
          503,
        );
      }
      const service = serviceFor(env);
      switch (body.action) {
        case 'browse': {
          if (!keysWithOptional(body, ['action', 'bookId'], ['entitlementId'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Browse request is invalid.', 400);
          }
          return responseFor(await service.browse({
            actorId: uid,
            role,
            bookId: safeId(body.bookId, 'bookId'),
            entitlementId: body.entitlementId === undefined ? undefined : safeId(body.entitlementId, 'entitlementId'),
          }));
        }
        case 'resolve':
        case 'prepare-runtime': {
          if (!keysWithOptional(body, ['action', 'selection'], ['entitlementId', 'context'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Resolve request is invalid.', 400);
          }
          const input = {
            actorId: uid,
            role,
            selection: selectionFromBody(body.selection),
            entitlementId: body.entitlementId === undefined ? undefined : safeId(body.entitlementId, 'entitlementId'),
            context: contextFromBody(body.context),
          };
          return responseFor(body.action === 'resolve'
            ? await service.resolve(input)
            : await service.prepareRuntime(input));
        }
        case 'reference': {
          if (role !== 'teacher' && role !== 'super_admin') {
            throw new PublicBookReferenceForkError('role-denied', 'Teacher ownership is required.', 403);
          }
          if (!keysWithOptional(body, ['action', 'target', 'selection'], ['context', 'operationId'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Reference request is invalid.', 400);
          }
          const input = {
            actorId: uid,
            target: targetFromBody(body.target),
            selection: selectionFromBody(body.selection),
            context: contextFromBody(body.context),
            operationId: body.operationId === undefined ? undefined : safeId(body.operationId, 'operationId'),
          };
          return responseFor(await service.reference(input));
        }
        case 'migrate': {
          if (role !== 'teacher' && role !== 'super_admin'
            || !keysWithOptional(body, ['action', 'legacyReferenceId', 'target', 'selection', 'operationId', 'migratedAt'], ['context'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Migration request is invalid.', 400);
          }
          return responseFor(await service.migrateLegacyReference({
            actorId: uid,
            legacyReferenceId: safeId(body.legacyReferenceId, 'legacyReferenceId'),
            target: targetFromBody(body.target),
            selection: selectionFromBody(body.selection),
            context: contextFromBody(body.context),
            operationId: safeId(body.operationId, 'operationId'),
            migratedAt: typeof body.migratedAt === 'string' ? body.migratedAt : '',
          }));
        }
        case 'status': {
          if (role !== 'teacher' && role !== 'super_admin'
            || !exactKeys(body, ['action', 'referenceId'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Status request is invalid.', 400);
          }
          return responseFor(await service.status({ actorId: uid, referenceId: safeId(body.referenceId, 'referenceId') }));
        }
        case 'adopt':
        case 'rollback': {
          if (role !== 'teacher' && role !== 'super_admin'
            || !exactKeys(body, ['action', 'referenceId', 'expectedRevision'])) {
            throw new PublicBookReferenceForkError('request-invalid', 'Reference history request is invalid.', 400);
          }
          if (typeof body.expectedRevision !== 'number'
            || !Number.isSafeInteger(body.expectedRevision)
            || body.expectedRevision < 1) {
            throw new PublicBookReferenceForkError('request-invalid', 'Reference revision is invalid.', 400);
          }
          const input = {
            actorId: uid,
            referenceId: safeId(body.referenceId, 'referenceId'),
            expectedRevision: body.expectedRevision as number,
          };
          return responseFor(body.action === 'adopt'
            ? await service.adopt(input)
            : await service.rollback(input));
        }
        default:
          throw new PublicBookReferenceForkError('request-invalid', 'Action is not supported.', 400);
      }
    } catch (error) {
      const status = statusForError(error);
      return responseFor({ code: codeForError(error, status) }, status);
    }
  };

  return Object.freeze({ handle });
};

/** Explicit composition used by the main Worker until #118 activates rules/routes. */
export const createDisabledPublicBookReferenceForkWorkerHandlers = () =>
  createPublicBookReferenceForkWorkerHandlers({ enabled: false });
