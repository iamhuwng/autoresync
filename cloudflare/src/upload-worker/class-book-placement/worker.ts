import {
  ClassBookRolloutGate,
  isClassBookPlacementPath,
} from '../../../../src/services/book-delivery/classBookRolloutGate.ts';

export interface ClassBookPlacementWorkerService {
  readonly createCopy: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly place: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly sync: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly setLock: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly issueDelivery: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly resolveDelivery: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  readonly getPlacement: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface ClassBookPlacementWorkerHandlerOptions {
  readonly service?: ClassBookPlacementWorkerService;
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

const operation = (body: Record<string, unknown>, uid: string): Record<string, unknown> => ({
  ...body,
  actorId: uid,
});

/** Default-disabled Worker fragment; #104 launch dispatch remains separate. */
export const createClassBookPlacementWorkerHandlers = (
  options: ClassBookPlacementWorkerHandlerOptions = {},
) => {
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  return {
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
