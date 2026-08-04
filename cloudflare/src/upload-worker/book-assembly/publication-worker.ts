import type {
  BookAssemblyPreviewApprovalReference,
  BookAssemblyPublicationAdapterPlan,
} from '../../../../src/types/bookAssembly.types.ts';
import {
  fingerprintBookAssemblyPublishOperation,
  fingerprintBookAssemblyRollbackOperation,
  fingerprintBookAssemblyOperation,
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  createCanonicalBookAssemblyPublicationService,
} from '../../../../src/services/book-assembly/canonicalPublication.service.ts';
import type {
  CanonicalPublishedActivityVersionRecord,
} from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import type {
  CanonicalActivityVersionWriter,
} from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';

const MAX_BODY_BYTES = 1_200_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
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

export interface BookAssemblyPublicationAuthoritySnapshot {
  readonly ownerId: string;
  readonly bookId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly planFingerprint: string;
  readonly previewApproval: (BookAssemblyPreviewApprovalReference & { readonly revoked: boolean }) | null;
}

export type BookAssemblyPublicationAuthorityGateResult =
  | {
    readonly status: 'current';
    readonly snapshot: BookAssemblyPublicationAuthoritySnapshot;
  }
  | {
    readonly status: 'denied';
    readonly reason: 'stale' | 'preview-approval';
  }
  | {
    readonly status: 'unavailable';
  };

export type BookAssemblyPublicationAuthorityGate = (input: {
  readonly ownerId: string;
  readonly bookId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly planFingerprint: string;
  readonly previewApproval: BookAssemblyPreviewApprovalReference | null;
  readonly now: string;
}) => Promise<BookAssemblyPublicationAuthorityGateResult>;

export const fingerprintBookAssemblyPublicationAuthorityPlan = (
  plan: BookAssemblyPublicationAdapterPlan,
): string => fingerprintBookAssemblyOperation({
  ...plan,
  ...(plan.previewApproval
    ? {
      previewApproval: {
        ...plan.previewApproval,
        approvedInputFingerprint: undefined,
      },
    }
    : {}),
});

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

const recoverExistingOperation = (
  repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>,
  input: {
    readonly bookId: string;
    readonly ownerId: string;
    readonly operationId: string;
    readonly fingerprint: string;
  },
): Promise<BookAssemblyPublicationResult | null> => repository.transaction(
  input.bookId,
  (scope) => {
    const stored = scope.operations?.[input.operationId];
    if (!stored) return { outcome: null, write: false };
    if (stored.ownerId !== input.ownerId || stored.fingerprint !== input.fingerprint) {
      return {
        outcome: {
          status: 'idempotency-conflict',
          failureCode: 'idempotency-conflict',
        },
        write: false,
      };
    }
    return {
      outcome: { ...structuredClone(stored.result), status: 'replayed' },
      write: false,
    };
  },
  input.operationId,
  input.fingerprint,
);

const assertOwner = (
  uid: string,
  ownerId: string,
): void => {
  if (uid !== ownerId) {
    throw new BookAssemblyPublicationWorkerError('assembly_publication_forbidden', 403);
  }
};

const samePreviewApproval = (
  left: BookAssemblyPreviewApprovalReference,
  right: BookAssemblyPreviewApprovalReference,
): boolean => left.approvalId === right.approvalId
  && left.approvalRevision === right.approvalRevision
  && left.approvedAt === right.approvedAt
  && left.expiresAt === right.expiresAt
  && left.approvedInputFingerprint === right.approvedInputFingerprint;

const assertCurrentPublicationAuthority = async (
  plan: BookAssemblyPublicationAdapterPlan,
  now: string,
  authorityGate: BookAssemblyPublicationAuthorityGate,
): Promise<void> => {
  const planFingerprint = fingerprintBookAssemblyPublicationAuthorityPlan(plan);
  let result: BookAssemblyPublicationAuthorityGateResult;
  try {
    result = await authorityGate({
      ownerId: plan.ownerId,
      bookId: plan.bookId,
      candidateId: plan.candidateId,
      candidateRevision: plan.candidateRevision,
      bookRevision: plan.bookRevision,
      sourceSetRevision: plan.sourceSetRevision,
      planFingerprint,
      previewApproval: plan.previewApproval ?? null,
      now,
    });
  } catch {
    throw new BookAssemblyPublicationWorkerError('book_assembly_publication_authority_unavailable', 503);
  }
  if (result.status === 'unavailable') {
    throw new BookAssemblyPublicationWorkerError('book_assembly_publication_authority_unavailable', 503);
  }
  if (result.status === 'denied') {
    throw new BookAssemblyPublicationWorkerError(
      result.reason === 'preview-approval'
        ? 'book_assembly_publication_preview_approval_invalid'
        : 'book_assembly_publication_authority_stale',
      result.reason === 'preview-approval' ? 422 : 409,
    );
  }

  const authority = result.snapshot;
  if (authority.planFingerprint !== planFingerprint
    || authority.ownerId !== plan.ownerId
    || authority.bookId !== plan.bookId
    || authority.candidateId !== plan.candidateId
    || authority.candidateRevision !== plan.candidateRevision
    || authority.bookRevision !== plan.bookRevision
    || authority.sourceSetRevision !== plan.sourceSetRevision) {
    throw new BookAssemblyPublicationWorkerError('book_assembly_publication_authority_stale', 409);
  }

  const approval = plan.previewApproval;
  const currentApproval = authority.previewApproval;
  if (!approval
    || !currentApproval
    || currentApproval.revoked
    || approval.approvedInputFingerprint !== planFingerprint
    || !samePreviewApproval(approval, currentApproval)) {
    throw new BookAssemblyPublicationWorkerError('book_assembly_publication_preview_approval_invalid', 422);
  }
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(approvedAt)
    || !Number.isFinite(expiresAt)
    || !Number.isFinite(current)
    || approvedAt > current
    || expiresAt <= current) {
    throw new BookAssemblyPublicationWorkerError('book_assembly_publication_preview_approval_invalid', 422);
  }
};

export const createBookAssemblyPublicationWorkerHandlers = (options: {
  readonly repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  readonly activityVersionWriter: CanonicalActivityVersionWriter;
  readonly authorityGate: BookAssemblyPublicationAuthorityGate;
  readonly now?: () => string;
}) => {
  const service = createCanonicalBookAssemblyPublicationService(
    options.repository,
    options.activityVersionWriter,
  );
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
        const body = exact(await readBody(input.request), [
          'operationId',
          'expectedCurrentPublicationId',
          'manifestVersionId',
          'publicationId',
          'publicationRevision',
          'plan',
          'canonicalActivityVersions',
        ]);
        const plan = plain(body.plan) as unknown as BookAssemblyPublicationAdapterPlan | null;
        if (!plan) throw new BookAssemblyPublicationWorkerError('invalid_publication_plan');
        if (!Array.isArray(body.canonicalActivityVersions)) {
          throw new BookAssemblyPublicationWorkerError('invalid_canonical_activity_versions');
        }
        const ownerId = id(plan.ownerId, 'invalid_owner_id');
        const bookId = id(plan.bookId, 'invalid_book_id');
        assertOwner(input.uid, ownerId);
        const parsedOperationId = operationId(body.operationId);
        const expectedCurrentPublicationId = nullableId(
          body.expectedCurrentPublicationId,
          'invalid_expected_current_publication_id',
        );
        const manifestVersionId = id(body.manifestVersionId, 'invalid_manifest_version_id');
        const publicationId = id(body.publicationId, 'invalid_publication_id');
        const publicationRevision = integer(body.publicationRevision, 'invalid_publication_revision');
        const operationFingerprint = fingerprintBookAssemblyPublishOperation({
          expectedCurrentPublicationId,
          manifestVersionId,
          publicationId,
          publicationRevision,
          plan,
        });
        const recovered = await recoverExistingOperation(options.repository, {
          bookId,
          ownerId,
          operationId: parsedOperationId,
          fingerprint: operationFingerprint,
        });
        if (recovered) {
          return { body: recovered, init: { status: statusFor(recovered) } };
        }
        if (!enabled(input.env)) {
          return { body: { code: 'book_assembly_publication_disabled' }, init: { status: 503 } };
        }
        const publicationNow = now();
        await assertCurrentPublicationAuthority(plan, publicationNow, options.authorityGate);
        const result = await service.publish({
          operationId: parsedOperationId,
          expectedCurrentPublicationId,
          manifestVersionId,
          publicationId,
          publicationRevision,
          plan,
          canonicalActivityVersions: (
            body.canonicalActivityVersions as unknown as readonly CanonicalPublishedActivityVersionRecord[]
          ),
          now: publicationNow,
          operationFingerprint,
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
        const body = exact(await readBody(input.request), [
          'operationId',
          'ownerId',
          'bookId',
          'expectedCurrentPublicationId',
          'targetPublicationId',
        ]);
        const ownerId = id(body.ownerId, 'invalid_owner_id');
        assertOwner(input.uid, ownerId);
        const parsedOperationId = operationId(body.operationId);
        const bookId = id(body.bookId, 'invalid_book_id');
        const expectedCurrentPublicationId = id(
          body.expectedCurrentPublicationId,
          'invalid_expected_current_publication_id',
        );
        const targetPublicationId = id(body.targetPublicationId, 'invalid_target_publication_id');
        const operationFingerprint = fingerprintBookAssemblyRollbackOperation({
          operationId: parsedOperationId,
          ownerId,
          bookId,
          expectedCurrentPublicationId,
          targetPublicationId,
        });
        const recovered = await recoverExistingOperation(options.repository, {
          bookId,
          ownerId,
          operationId: parsedOperationId,
          fingerprint: operationFingerprint,
        });
        if (recovered) {
          return { body: recovered, init: { status: statusFor(recovered) } };
        }
        if (!enabled(input.env)) {
          return { body: { code: 'book_assembly_publication_disabled' }, init: { status: 503 } };
        }
        const result = await service.rollback({
          operationId: parsedOperationId,
          ownerId,
          bookId,
          expectedCurrentPublicationId,
          targetPublicationId,
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
