import type {
  BookAssemblyPublicationAdapterPlan,
} from '../../../../src/types/bookAssembly.types.ts';
import {
  createBookAssemblyPublicationService,
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';

const MAX_BODY_BYTES = 1_200_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class BookAssemblyPublicationWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookAssemblyPublicationWorkerError';
  }
}

export interface BookAssemblyPublicationWorkerEnv {
  readonly BOOK_ASSEMBLY_PUBLICATION_ENABLED?: string;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookAssemblyPublicationWorkerError('content_type_required');
  }
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new BookAssemblyPublicationWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookAssemblyPublicationWorkerError('body_too_large', 413);
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    const record = plain(parsed);
    if (!record) throw new Error('not_record');
    return record;
  } catch {
    throw new BookAssemblyPublicationWorkerError('invalid_json');
  }
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BookAssemblyPublicationWorkerError('invalid_request');
  }
  for (const key of keys) {
    if (!(key in value)) throw new BookAssemblyPublicationWorkerError('invalid_request');
  }
  return value;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookAssemblyPublicationWorkerError(code);
  }
  return value;
};

const operationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) {
    throw new BookAssemblyPublicationWorkerError('invalid_operation_id');
  }
  return value;
};

const integer = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BookAssemblyPublicationWorkerError(code);
  }
  return value as number;
};

const nullableId = (value: unknown, code: string): string | null => {
  if (value === null) return null;
  return id(value, code);
};

const roleAllowed = (value: unknown): boolean => {
  const profile = plain(value);
  return !!profile
    && (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''))
    && profile.forceReauth !== true;
};

const statusFor = (result: BookAssemblyPublicationResult): number => {
  if (result.status === 'published' || result.status === 'rolled-back' || result.status === 'replayed') {
    return 200;
  }
  if (result.status === 'forbidden') return 403;
  if (result.status === 'not-found') return 404;
  if (result.status === 'conflict' || result.status === 'idempotency-conflict') return 409;
  return 422;
};

const assertOwner = (
  uid: string,
  ownerId: string,
): void => {
  if (uid !== ownerId) {
    throw new BookAssemblyPublicationWorkerError('assembly_publication_forbidden', 403);
  }
};

export const createBookAssemblyPublicationWorkerHandlers = (options: {
  readonly repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  readonly now?: () => string;
}) => {
  const service = createBookAssemblyPublicationService(options.repository);
  const now = options.now ?? (() => new Date().toISOString());
  const authenticate = async (env: BookAssemblyPublicationWorkerEnv, uid: string): Promise<void> => {
    if (!env.readDatabaseValue) throw new BookAssemblyPublicationWorkerError('publication_auth_reader_missing', 503);
    if (!roleAllowed(await env.readDatabaseValue(`users/${uid}`))) {
      throw new BookAssemblyPublicationWorkerError('assembly_publication_forbidden', 403);
    }
  };
  const enabled = (env: BookAssemblyPublicationWorkerEnv): boolean =>
    env.BOOK_ASSEMBLY_PUBLICATION_ENABLED === 'true';

  return {
    async publish(input: {
      readonly request: Request;
      readonly env: BookAssemblyPublicationWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        await authenticate(input.env, input.uid);
        if (!enabled(input.env)) {
          return { body: { code: 'book_assembly_publication_disabled' }, init: { status: 503 } };
        }
        const body = exact(await readBody(input.request), [
          'operationId',
          'expectedCurrentPublicationId',
          'manifestVersionId',
          'publicationId',
          'publicationRevision',
          'plan',
        ]);
        const plan = plain(body.plan) as unknown as BookAssemblyPublicationAdapterPlan | null;
        if (!plan) throw new BookAssemblyPublicationWorkerError('invalid_publication_plan');
        assertOwner(input.uid, plan.ownerId);
        const result = await service.publish({
          operationId: operationId(body.operationId),
          expectedCurrentPublicationId: nullableId(
            body.expectedCurrentPublicationId,
            'invalid_expected_current_publication_id',
          ),
          manifestVersionId: id(body.manifestVersionId, 'invalid_manifest_version_id'),
          publicationId: id(body.publicationId, 'invalid_publication_id'),
          publicationRevision: integer(body.publicationRevision, 'invalid_publication_revision'),
          plan,
          now: now(),
        });
        return { body: result, init: { status: statusFor(result) } };
      } catch (error) {
        if (error instanceof BookAssemblyPublicationWorkerError) {
          return { body: { code: error.code }, init: { status: error.status } };
        }
        console.error('Book Assembly publication failed', error instanceof Error ? error.message : String(error));
        return { body: { code: 'book_assembly_publication_failed' }, init: { status: 500 } };
      }
    },

    async rollback(input: {
      readonly request: Request;
      readonly env: BookAssemblyPublicationWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        await authenticate(input.env, input.uid);
        if (!enabled(input.env)) {
          return { body: { code: 'book_assembly_publication_disabled' }, init: { status: 503 } };
        }
        const body = exact(await readBody(input.request), [
          'operationId',
          'ownerId',
          'bookId',
          'expectedCurrentPublicationId',
          'targetPublicationId',
        ]);
        const ownerId = id(body.ownerId, 'invalid_owner_id');
        assertOwner(input.uid, ownerId);
        const result = await service.rollback({
          operationId: operationId(body.operationId),
          ownerId,
          bookId: id(body.bookId, 'invalid_book_id'),
          expectedCurrentPublicationId: id(
            body.expectedCurrentPublicationId,
            'invalid_expected_current_publication_id',
          ),
          targetPublicationId: id(body.targetPublicationId, 'invalid_target_publication_id'),
          now: now(),
        });
        return { body: result, init: { status: statusFor(result) } };
      } catch (error) {
        if (error instanceof BookAssemblyPublicationWorkerError) {
          return { body: { code: error.code }, init: { status: error.status } };
        }
        console.error('Book Assembly publication rollback failed', error instanceof Error ? error.message : String(error));
        return { body: { code: 'book_assembly_publication_failed' }, init: { status: 500 } };
      }
    },
  };
};
