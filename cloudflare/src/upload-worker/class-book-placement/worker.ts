import {
  ClassBookRolloutGate,
  isClassBookPlacementPath,
} from '../../../../src/services/book-delivery/classBookRolloutGate.ts';
import {
  ClassBookDeliveryProductionError,
  prepareClassBookDelivery,
  resolveCurrentClassBookDelivery,
} from './production.ts';

export interface ClassBookPlacementWorkerService {
  readonly createCopy: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly place: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly sync: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly setLock: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly issueDelivery: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly resolveDelivery: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly resolveDeliveryByIds: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly getPlacement: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface ClassBookPlacementWorkerHandlerOptions {
  readonly service?: ClassBookPlacementWorkerService;
  /** Injectable canonical production boundary for focused Worker tests. */
  readonly prepare?: typeof prepareClassBookDelivery;
  /** Injectable canonical production boundary for focused Worker tests. */
  readonly resolveCurrent?: typeof resolveCurrentClassBookDelivery;
  readonly maxBodyBytes?: number;
}

export interface ClassBookPlacementWorkerResponse {
  readonly body: unknown;
  readonly init?: ResponseInit;
}

const MAX_BODY_BYTES = 1_500_000;
const ACTIONS: Record<string, keyof ClassBookPlacementWorkerService> = {
  '/copy': 'createCopy',
  '/place': 'place',
  '/sync': 'sync',
  '/lock': 'setLock',
  '/issue': 'issueDelivery',
  '/resolve': 'resolveDelivery',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const errorCode = (error: unknown): string => error instanceof Error ? error.message : 'class_book_request_failed';

const statusFor = (code: string): number => {
  if (code === 'class_book_rollout_disabled' || code === 'class_book_rollout_rollback') return 503;
  if (code.includes('conflict') || code.includes('stale')) return 409;
  if (code.includes('denied') || code.includes('unavailable') || code.includes('locked')) return 403;
  if (code.includes('required')) return 503;
  if (code.includes('invalid') || code.includes('forbidden') || code.includes('mismatch')) return 400;
  return 500;
};

const parseBody = async (request: Request, maxBodyBytes: number): Promise<Record<string, unknown>> => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) throw new Error('class_book_request_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('class_book_request_json_invalid'); }
  if (!isRecord(parsed)) throw new Error('class_book_request_body_invalid');
  return parsed;
};

const exact = (body: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(body).length !== keys.length || Object.keys(body).some((key) => !keys.includes(key))) {
    throw new ClassBookDeliveryProductionError('class_book_request_invalid', 400);
  }
};

const productionGate = (env: Record<string, unknown> | undefined): void => {
  if (env?.BOOK_CLASS_BOOK_PLACEMENT_ROUTES_ENABLED !== 'enabled') {
    throw new ClassBookDeliveryProductionError('class_book_rollout_disabled', 503);
  }
};

const productionResponse = async (run: () => Promise<unknown>): Promise<ClassBookPlacementWorkerResponse> => {
  try {
    const body = await run();
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || (body as Record<string, unknown>).projectionKind !== 'book-runtime-delivery') {
      throw new ClassBookDeliveryProductionError('class_book_legacy_delivery_output_rejected', 500);
    }
    return {
      body,
      init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
    };
  } catch (error) {
    if (error instanceof ClassBookDeliveryProductionError) {
      return { body: { code: error.code }, init: { status: error.status, headers: { 'Cache-Control': 'no-store' } } };
    }
    return { body: { code: 'class_book_delivery_unavailable' }, init: { status: 503, headers: { 'Cache-Control': 'no-store' } } };
  }
};

const operation = (body: Record<string, unknown>, uid: string): Record<string, unknown> => ({
  ...body,
  actorId: uid,
});

const currentDeliveryInput = (pathname: string): Record<string, unknown> | null => {
  const prefix = '/v1/book-class-placement/current/';
  if (!pathname.startsWith(prefix)) return null;
  const values = pathname.slice(prefix.length).split('/');
  if (values.length !== 5) return null;
  try {
    const [classId, copyId, classPlacementId, classCourseMaterialId, bindingId] = values.map(decodeURIComponent);
    return { classId, copyId, classPlacementId, classCourseMaterialId, bindingId };
  } catch {
    throw new Error('class_book_route_invalid');
  }
};

/** Default-disabled Worker fragment; #104 launch dispatch remains separate. */
export const createClassBookPlacementWorkerHandlers = (
  options: ClassBookPlacementWorkerHandlerOptions = {},
) => {
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const prepare = options.prepare ?? prepareClassBookDelivery;
  const resolveCurrent = options.resolveCurrent ?? resolveCurrentClassBookDelivery;
  return {
    prepare: (input: {
      readonly request: Request;
      readonly env: Record<string, unknown>;
      readonly uid: string;
    }) => productionResponse(async () => {
      productionGate(input.env);
      const body = await parseBody(input.request, maxBodyBytes);
      exact(body, ['operationId', 'classId', 'copyId', 'classPlacementId', 'classCourseMaterialId']);
      return prepare(input.env, {
        operationId: String(body.operationId),
        classId: String(body.classId),
        copyId: String(body.copyId),
        classPlacementId: String(body.classPlacementId),
        classCourseMaterialId: String(body.classCourseMaterialId),
        studentId: input.uid,
      });
    }),
    current: (input: {
      readonly env: Record<string, unknown>;
      readonly uid: string;
      readonly classId?: string;
      readonly copyId?: string;
      readonly classPlacementId?: string;
      readonly classCourseMaterialId?: string;
      readonly bindingId?: string;
    }) => productionResponse(async () => {
      productionGate(input.env);
      return resolveCurrent(input.env, {
        classId: String(input.classId),
        copyId: String(input.copyId),
        classPlacementId: String(input.classPlacementId),
        classCourseMaterialId: String(input.classCourseMaterialId),
        bindingId: String(input.bindingId),
        studentId: input.uid,
      });
    }),
    async handle(input: {
      readonly request: Request;
      readonly env: Record<string, unknown> | undefined;
      readonly uid: string;
    }): Promise<ClassBookPlacementWorkerResponse> {
      const url = new URL(input.request.url);
      const gate = ClassBookRolloutGate.fromEnvironment(input.env as {
        CLASS_BOOK_PLACEMENT_ENABLED?: string | boolean;
        CLASS_BOOK_PLACEMENT_ROLLBACK?: string | boolean;
      } | undefined);
      try {
        gate.assertReadAllowed();
        if (!options.service) throw new Error('class_book_handler_unavailable');
        if (input.request.method === 'GET') {
          gate.assertExistingBindingResolutionAllowed();
          const deliveryInput = currentDeliveryInput(url.pathname);
          if (deliveryInput) {
            const result = await options.service.resolveDeliveryByIds({ ...deliveryInput, actorId: input.uid });
            return { body: { data: result }, init: { status: 200, headers: { 'Cache-Control': 'no-store' } } };
          }
        }
        if (input.request.method === 'GET' && url.pathname === '/v1/class-book-placement/current') {
          gate.assertExistingBindingResolutionAllowed();
          const body = Object.fromEntries(url.searchParams.entries());
          return { body: await options.service.getPlacement({ ...body, actorId: input.uid }), init: { status: 200 } };
        }
        if (input.request.method !== 'POST') return { body: { code: 'method_not_allowed' }, init: { status: 405 } };
        const suffix = url.pathname.slice('/v1/class-book-placement'.length);
        const action = ACTIONS[suffix];
        if (!action) return { body: { code: 'class_book_route_not_found' }, init: { status: 404 } };
        if (action === 'resolveDelivery') gate.assertExistingBindingResolutionAllowed();
        else gate.assertMutationAllowed();
        const body = await parseBody(input.request, maxBodyBytes);
        const result = await options.service[action](operation(body, input.uid));
        return { body: { data: result }, init: { status: 200, headers: { 'Cache-Control': 'no-store' } } };
      } catch (error) {
        const code = errorCode(error);
        return {
          body: { code },
          init: { status: statusFor(code), headers: { 'Cache-Control': 'no-store' } },
        };
      }
    },
  };
};

export { isClassBookPlacementPath };
