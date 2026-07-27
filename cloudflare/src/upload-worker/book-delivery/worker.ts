import { BookDeliveryEntitlementLifecycle, BookDeliveryLifecycleError } from '../../../../src/services/book-delivery/bookDelivery.entitlementLifecycle.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  createBookDeliveryProjectionResolver,
  BookDeliveryProjectionError,
} from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import { FirebaseRestBookDeliveryRepository, type BookDeliveryRepositoryEnv } from './repository.ts';

const MAX_BODY_BYTES = 256 * 1024;

const body = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookDeliveryWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookDeliveryWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookDeliveryWorkerError('body_too_large', 413);
  }
  try { return JSON.parse(text); } catch { throw new BookDeliveryWorkerError('invalid_json'); }
};

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BookDeliveryWorkerError('invalid_request');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new BookDeliveryWorkerError('invalid_request');
  return record;
};

const role = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''));
};

export class BookDeliveryWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookDeliveryWorkerError';
  }
}

export const createBookDeliveryWorkerHandlers = (options: {
  repository?: FirebaseRestBookDeliveryRepository;
  now?: () => string;
} = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const repositoryFor = (env: BookDeliveryRepositoryEnv) => (
    options.repository ?? new FirebaseRestBookDeliveryRepository({ env })
  );

  const authorize = async (env: BookDeliveryRepositoryEnv, uid: string, ownerId: string): Promise<boolean> => {
    if (uid !== ownerId) return false;
    if (!env.readDatabaseValue) return false;
    return role(await env.readDatabaseValue(`users/${uid}`));
  };

  const respond = async (
    action: 'create' | 'activate' | 'supersede' | 'revoke',
    input: { request: Request; env: BookDeliveryRepositoryEnv; uid: string },
  ): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      const value = await body(input.request);
      const repository = repositoryFor(input.env);
      const lifecycle = new BookDeliveryEntitlementLifecycle({
        repository,
        authorizeIssuer: async (binding) => authorize(input.env, input.uid, binding.issuer.ownerId),
      });
      if (action === 'create') {
        const request = exact(value, ['binding', 'operationId']);
        const binding = request.binding as BookDeliveryBinding;
        const result = await lifecycle.createDraft(binding, String(request.operationId), now());
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      if (action === 'activate') {
        const request = exact(value, ['bindingId', 'expectedRecordRevision', 'operationId']);
        const record = await repository.readBinding(String(request.bindingId));
        if (!record || !(await authorize(input.env, input.uid, record.binding.issuer.ownerId))) {
          return { body: { status: 'forbidden' }, init: { status: 403 } };
        }
        const result = await lifecycle.activate(String(request.bindingId), Number(request.expectedRecordRevision), String(request.operationId), now());
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      if (action === 'supersede') {
        const request = exact(value, ['binding', 'expectedCurrentBindingId', 'operationId']);
        const result = await lifecycle.supersede(
          request.binding as BookDeliveryBinding,
          String(request.expectedCurrentBindingId),
          String(request.operationId),
          now(),
        );
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      }
      const request = exact(value, ['bindingId', 'expectedRecordRevision', 'expectedCurrentBindingId', 'operationId']);
      const record = await repository.readBinding(String(request.bindingId));
      if (!record || !(await authorize(input.env, input.uid, record.binding.issuer.ownerId))) {
        return { body: { status: 'forbidden' }, init: { status: 403 } };
      }
      const result = await lifecycle.revoke(
        String(request.bindingId),
        Number(request.expectedRecordRevision),
        String(request.expectedCurrentBindingId),
        String(request.operationId),
        now(),
      );
      return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
    } catch (error) {
      if (error instanceof BookDeliveryWorkerError || error instanceof BookDeliveryLifecycleError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'book_delivery_failed' }, init: { status: 500 } };
    }
  };

  return {
    create: (input: { request: Request; env: BookDeliveryRepositoryEnv; uid: string }) => respond('create', input),
    activate: (input: { request: Request; env: BookDeliveryRepositoryEnv; uid: string }) => respond('activate', input),
    supersede: (input: { request: Request; env: BookDeliveryRepositoryEnv; uid: string }) => respond('supersede', input),
    revoke: (input: { request: Request; env: BookDeliveryRepositoryEnv; uid: string }) => respond('revoke', input),
    async resolve(input: { env: BookDeliveryRepositoryEnv; uid: string; recipientId: string; contextId: string }) {
      try {
        const repository = repositoryFor(input.env);
        const result = await createBookDeliveryProjectionResolver({ repository }).resolve({
          recipientId: input.recipientId,
          contextId: input.contextId,
          actor: { uid: input.uid },
        });
        return { body: result as unknown as Record<string, unknown>, init: { status: 200 } };
      } catch (error) {
        const status = error instanceof BookDeliveryProjectionError ? error.status : 500;
        return {
          body: { code: error instanceof BookDeliveryProjectionError ? error.code : 'book_delivery_failed' },
          init: { status },
        };
      }
    },
  };
};
