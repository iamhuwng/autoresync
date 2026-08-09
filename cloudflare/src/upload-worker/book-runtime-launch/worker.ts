import type { StudentActivityProjection } from '../../../../src/types/bookActivity.types.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_ACTIVITIES = 64;
const FORBIDDEN = /(?:answerkey|credentials|privateobjectkey|providerauthority|teacher|sourceprovenance|secret|token)/iu;

export interface BookRuntimeLaunchActivityPin {
  readonly activityId: string;
  readonly activityVersionId: string;
}

export interface BookRuntimeLaunchRequest {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly activityPins: readonly BookRuntimeLaunchActivityPin[];
  readonly recipientId?: string;
}

export interface BookRuntimeLaunchContext extends BookRuntimeLaunchRequest {
  /** Context resolvers may return the authenticated recipient identity explicitly. */
  readonly recipientId: string;
  /**
   * Server-only context retained for exact projection reads. It is never
   * serialized and is only populated by the trusted context resolver.
   */
  readonly authority?: unknown;
}

export interface BookRuntimeLaunchProjection {
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly projection: StudentActivityProjection;
  readonly label?: string;
}

export interface BookRuntimeLaunchProjectionReader {
  readExact(input: {
    readonly uid: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly contextId: string;
    readonly recipientId: string;
    readonly activityId: string;
    readonly activityVersionId: string;
    readonly authority?: unknown;
    readonly env: BookRuntimeLaunchWorkerEnv;
  }): Promise<BookRuntimeLaunchProjection | StudentActivityProjection | null>;
}

export interface BookRuntimeLaunchWorkerEnv {
  readonly [key: string]: unknown;
}

export interface BookRuntimeLaunchWorkerHandlerOptions {
  readonly projectionReader?: BookRuntimeLaunchProjectionReader;
  readonly readExactProjection?: BookRuntimeLaunchProjectionReader['readExact'];
  readonly resolveContext?: (input: {
    readonly uid: string;
    readonly request: BookRuntimeLaunchRequest;
    readonly env: BookRuntimeLaunchWorkerEnv;
  }) => Promise<BookRuntimeLaunchContext | null>;
  /** Descriptive alias for composition callers. */
  readonly resolveCallerContext?: BookRuntimeLaunchWorkerHandlerOptions['resolveContext'];
}

export interface BookRuntimeLaunchWorkerResponse {
  readonly body: Record<string, unknown>;
  readonly init: ResponseInit;
}

export class BookRuntimeLaunchWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookRuntimeLaunchWorkerError';
  }
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
);

const exact = (value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  const candidate = record(value);
  if (!candidate) throw new BookRuntimeLaunchWorkerError('invalid_request');
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(candidate, key))
    || Object.keys(candidate).some((key) => !allowed.has(key))) {
    throw new BookRuntimeLaunchWorkerError('invalid_request');
  }
  return candidate;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new BookRuntimeLaunchWorkerError(code);
  return value;
};

const parseRequest = (value: unknown): BookRuntimeLaunchRequest => {
  const body = exact(value, ['bindingId', 'bindingRevision', 'contextId', 'activityPins'], ['recipientId']);
  if (!Number.isSafeInteger(body.bindingRevision) || (body.bindingRevision as number) < 1
    || !Array.isArray(body.activityPins) || body.activityPins.length < 1
    || body.activityPins.length > MAX_ACTIVITIES) throw new BookRuntimeLaunchWorkerError('invalid_request');
  const seen = new Set<string>();
  const activityPins = body.activityPins.map((candidate) => {
    const pin = exact(candidate, ['activityId', 'activityVersionId']);
    const activityId = id(pin.activityId, 'invalid_activity_id');
    const activityVersionId = id(pin.activityVersionId, 'invalid_activity_version_id');
    if (seen.has(activityId)) throw new BookRuntimeLaunchWorkerError('duplicate_activity_id');
    seen.add(activityId);
    return { activityId, activityVersionId };
  });
  return {
    bindingId: id(body.bindingId, 'invalid_binding_id'),
    bindingRevision: body.bindingRevision as number,
    contextId: id(body.contextId, 'invalid_context_id'),
    activityPins,
    ...(body.recipientId === undefined ? {} : { recipientId: id(body.recipientId, 'invalid_recipient_id') }),
  };
};

const safeProjection = (value: unknown): value is StudentActivityProjection => {
  const projection = record(value);
  if (!projection || !['schemaVersion', 'title', 'taskProfile', 'presentationMode', 'contextRequirement',
    'instructions', 'stimulus', 'assetRefs', 'interaction', 'answerRule', 'interactions', 'scoring']
    .every((key) => Object.hasOwn(projection, key)) || Object.keys(projection).some((key) => FORBIDDEN.test(key))) return false;
  if (!Number.isSafeInteger(projection.schemaVersion) || (projection.schemaVersion as number) < 1
    || typeof projection.title !== 'string' || projection.title.length > 500
    || !record(projection.interaction) || !Array.isArray(projection.interactions)
    || !Array.isArray(projection.instructions) || !Array.isArray(projection.assetRefs)
    || !record(projection.contextRequirement) || !record(projection.answerRule)
    || !record(projection.scoring)) return false;
  const visit = (candidate: unknown, depth: number): boolean => {
    if (depth > 8 || candidate === undefined || typeof candidate === 'function'
      || typeof candidate === 'symbol' || typeof candidate === 'bigint') return false;
    if (Array.isArray(candidate)) return candidate.length <= 128 && candidate.every((entry) => visit(entry, depth + 1));
    const object = record(candidate);
    return !object || (Object.keys(object).length <= 64
      && Object.keys(object).every((key) => !FORBIDDEN.test(key) && visit(object[key], depth + 1)));
  };
  return visit(projection, 0);
};

const pinsMatch = (left: readonly BookRuntimeLaunchActivityPin[], right: readonly BookRuntimeLaunchActivityPin[]): boolean => {
  if (left.length !== right.length) return false;
  const expected = new Map(left.map((pin) => [pin.activityId, pin.activityVersionId]));
  return right.every((pin) => expected.get(pin.activityId) === pin.activityVersionId)
    && expected.size === right.length;
};

const parseBody = async (request: Request): Promise<unknown> => {
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new BookRuntimeLaunchWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new BookRuntimeLaunchWorkerError('body_too_large', 413);
  try { return JSON.parse(text); } catch { throw new BookRuntimeLaunchWorkerError('invalid_json'); }
};

const errorStatus = (error: unknown): number => error instanceof BookRuntimeLaunchWorkerError
  ? error.status
  : 503;

export const createBookRuntimeLaunchWorkerHandlers = (
  options: BookRuntimeLaunchWorkerHandlerOptions = {},
) => {
  const reader = options.projectionReader ?? (options.readExactProjection
    ? { readExact: options.readExactProjection } : undefined);
  const resolveContext = options.resolveContext ?? options.resolveCallerContext;

  const launch = async (input: {
    readonly request: Request;
    readonly env: BookRuntimeLaunchWorkerEnv;
    readonly uid: string;
  }): Promise<BookRuntimeLaunchWorkerResponse> => {
    try {
      if (input.request.method !== 'POST') throw new BookRuntimeLaunchWorkerError('method_not_allowed', 405);
      if (!input.uid || !resolveContext || !reader) throw new BookRuntimeLaunchWorkerError('handler_unavailable', 503);
      const request = parseRequest(await parseBody(input.request));
      const context = await resolveContext({ uid: input.uid, request, env: input.env });
      if (!context || context.bindingId !== request.bindingId
        || context.bindingRevision !== request.bindingRevision
        || context.contextId !== request.contextId
        || context.recipientId !== (request.recipientId ?? context.recipientId)
        || !pinsMatch(request.activityPins, context.activityPins)) {
        throw new BookRuntimeLaunchWorkerError('launch_denied', 403);
      }
      // All reads are exact-key reads and are started as one bounded batch.
      const projections = await Promise.all(request.activityPins.map((pin) => reader.readExact({
        uid: input.uid,
        bindingId: context.bindingId,
        bindingRevision: context.bindingRevision,
        contextId: context.contextId,
        recipientId: context.recipientId,
        activityId: pin.activityId,
        activityVersionId: pin.activityVersionId,
        ...(context.authority === undefined ? {} : { authority: context.authority }),
        env: input.env,
      })));
      const activities = projections.map((value, index) => {
        const pin = request.activityPins[index]!;
        const candidate = record(value);
        const hasEnvelope = Boolean(candidate
          && typeof candidate.activityId === 'string'
          && typeof candidate.activityVersionId === 'string'
          && Object.hasOwn(candidate, 'projection'));
        const activityId = hasEnvelope ? candidate!.activityId as string : pin.activityId;
        const activityVersionId = hasEnvelope ? candidate!.activityVersionId as string : pin.activityVersionId;
        const projection = hasEnvelope ? candidate!.projection : value;
        const label = hasEnvelope ? candidate!.label : undefined;
        if (!value || activityId !== pin.activityId || activityVersionId !== pin.activityVersionId
          || !safeProjection(projection)
          || (label !== undefined && (typeof label !== 'string' || label.length > 240))) {
          throw new BookRuntimeLaunchWorkerError('projection_mismatch', 409);
        }
        return {
          activityId: pin.activityId,
          activityVersionId: pin.activityVersionId,
          projection,
          ...(label === undefined ? {} : { label }),
        };
      });
      return {
        body: { activities },
        init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'launch_failed';
      return {
        body: { code },
        init: { status: errorStatus(error), headers: { 'Cache-Control': 'no-store' } },
      };
    }
  };
  return { launch, handle: launch };
};

export const createBookRuntimeLaunchHandlers = createBookRuntimeLaunchWorkerHandlers;
