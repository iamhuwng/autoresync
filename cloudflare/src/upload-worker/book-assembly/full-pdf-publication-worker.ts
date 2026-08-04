import {
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  createCanonicalBookAssemblyPublicationService,
} from '../../../../src/services/book-assembly/canonicalPublication.service.ts';
import type {
  CanonicalActivityVersionWriter,
} from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type {
  BookAssemblyPublicationRepository,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import {
  createFullPdfPublicationCommand,
  FullPdfPublicationCommandError,
} from '../../../../src/services/book-assembly/fullPdfPublication.command.ts';
import type {
  FullPdfActivityLineage,
  FullPdfValidatedActivityPayload,
} from '../../../../src/services/book-assembly/fullPdfPublication.adapter.ts';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type {
  BookAssemblyPreviewApprovalReference,
} from '../../../../src/types/bookAssembly.types.ts';
import type {
  BookAssemblyPreviewApprovalRecord,
} from '../../../../src/services/book-assembly/unitPreview.service.ts';

const MAX_BODY_BYTES = 256_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

export class FullPdfPublicationWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'FullPdfPublicationWorkerError';
  }
}

export interface FullPdfPublicationWorkerEnv {
  readonly BOOK_FULL_PDF_PUBLICATION_ENABLED?: string;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const roleAllowed = (value: unknown): boolean => {
  const profile = plain(value);
  return !!profile
    && (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''))
    && profile.forceReauth !== true;
};

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new FullPdfPublicationWorkerError('content_type_required');
  }
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new FullPdfPublicationWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new FullPdfPublicationWorkerError('body_too_large', 413);
  }
  try {
    const record = plain(JSON.parse(text) as unknown);
    if (!record) throw new Error('not_record');
    return record;
  } catch {
    throw new FullPdfPublicationWorkerError('invalid_json');
  }
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new FullPdfPublicationWorkerError('invalid_request');
  }
  for (const key of keys) {
    if (!(key in value)) throw new FullPdfPublicationWorkerError('invalid_request');
  }
  return value;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new FullPdfPublicationWorkerError(code);
  }
  return value;
};

const revision = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new FullPdfPublicationWorkerError(code);
  }
  return value as number;
};

const approval = (value: unknown): BookAssemblyPreviewApprovalReference => {
  const record = plain(value);
  if (!record) throw new FullPdfPublicationWorkerError('invalid_preview_approval');
  return {
    approvalId: id(record.approvalId, 'invalid_preview_approval'),
    approvalRevision: revision(record.approvalRevision, 'invalid_preview_approval'),
    approvedAt: id(record.approvedAt, 'invalid_preview_approval'),
    expiresAt: id(record.expiresAt, 'invalid_preview_approval'),
  };
};

const nullableId = (value: unknown, code: string): string | null => {
  if (value === null) return null;
  return id(value, code);
};

const statusFor = (result: BookAssemblyPublicationResult): number => {
  if (result.status === 'published' || result.status === 'replayed') return 200;
  if (result.status === 'not-found') return 404;
  if (result.status === 'forbidden') return 403;
  if (result.status === 'conflict' || result.status === 'idempotency-conflict') return 409;
  return 422;
};

const commandStatus = (status: number): number =>
  status === 404 || status === 403 || status === 409 || status === 503 ? status : 422;

export const createFullPdfPublicationWorkerHandlers = (options: {
  readonly repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>;
  readonly readCandidate: (
    bookId: string,
    unitKey: string,
    candidateId: string,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readAuthority: (bookId: string) => Promise<BookAssemblyBookAuthority | null>;
  readonly readLineage?: (
    bookId: string,
    unitKey: string,
  ) => Promise<Readonly<Record<string, FullPdfActivityLineage>>>;
  readonly readActivities: (
    input: {
      readonly ownerId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly activityKeys: readonly string[];
    },
  ) => Promise<Readonly<Record<string, FullPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    approvalId: string,
  ) => Promise<(BookAssemblyPreviewApprovalRecord & { readonly revoked?: boolean }) | null>;
  readonly sourceIsPreviewReady: (
    input: { readonly bookId: string; readonly sourceVersionId: string },
  ) => Promise<boolean>;
  readonly activityVersionWriter: CanonicalActivityVersionWriter;
  readonly allocateOperationId?: () => string;
  readonly allocateId?: (kind: string, key: string) => string;
  readonly now?: () => string;
}) => {
  const service = createCanonicalBookAssemblyPublicationService(
    options.repository,
    options.activityVersionWriter,
  );
  const now = options.now ?? (() => new Date().toISOString());
  const allocateOperationId = options.allocateOperationId ?? (() => crypto.randomUUID());
  const allocateId = options.allocateId ?? ((kind, key) => `${kind}-${key}-${crypto.randomUUID()}`);
  const authenticate = async (env: FullPdfPublicationWorkerEnv, uid: string): Promise<void> => {
    if (!env.readDatabaseValue) throw new FullPdfPublicationWorkerError('publication_auth_reader_missing', 503);
    if (!roleAllowed(await env.readDatabaseValue(`users/${uid}`))) {
      throw new FullPdfPublicationWorkerError('full_pdf_publication_forbidden', 403);
    }
  };
  const enabled = (env: FullPdfPublicationWorkerEnv): boolean =>
    env.BOOK_FULL_PDF_PUBLICATION_ENABLED === 'true';

  return {
    async publish(input: {
      readonly request: Request;
      readonly env: FullPdfPublicationWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        await authenticate(input.env, input.uid);
        if (!enabled(input.env)) {
          return { body: { code: 'book_full_pdf_publication_disabled' }, init: { status: 503 } };
        }
        const body = exact(await readBody(input.request), [
          'bookId',
          'unitKey',
          'candidateId',
          'expectedCandidateRevision',
          'expectedCurrentPublicationId',
          'expectedBookRevision',
          'expectedSourceSetRevision',
          'previewApproval',
        ]);
        const command = createFullPdfPublicationCommand({
          readAuthority: options.readAuthority,
          readCandidate: options.readCandidate,
          readLineage: options.readLineage,
          readActivities: options.readActivities,
          readPreviewApproval: options.readPreviewApproval,
          sourceIsPreviewReady: options.sourceIsPreviewReady,
          publish: (request) => service.publish(request),
          allocateOperationId,
          allocateId,
          now,
        });
        const receipt = await command({
          ownerId: input.uid,
          bookId: id(body.bookId, 'invalid_book_id'),
          unitKey: id(body.unitKey, 'invalid_unit_key'),
          candidateId: id(body.candidateId, 'invalid_candidate_id'),
          expectedCandidateRevision: revision(body.expectedCandidateRevision, 'invalid_expected_candidate_revision'),
          expectedCurrentPublicationId: nullableId(
            body.expectedCurrentPublicationId,
            'invalid_expected_current_publication_id',
          ),
          expectedBookRevision: revision(body.expectedBookRevision, 'invalid_expected_book_revision'),
          expectedSourceSetRevision: revision(body.expectedSourceSetRevision, 'invalid_expected_source_set_revision'),
          previewApproval: approval(body.previewApproval),
        });
        return {
          body: receipt,
          init: { status: statusFor(receipt.result) },
        };
      } catch (error) {
        if (error instanceof FullPdfPublicationWorkerError) {
          return { body: { code: error.code }, init: { status: error.status } };
        }
        if (error instanceof FullPdfPublicationCommandError) {
          return { body: { code: error.code }, init: { status: commandStatus(error.status) } };
        }
        console.error('Full-PDF publication failed', error instanceof Error ? error.message : String(error));
        return { body: { code: 'book_full_pdf_publication_failed' }, init: { status: 500 } };
      }
    },
  };
};
