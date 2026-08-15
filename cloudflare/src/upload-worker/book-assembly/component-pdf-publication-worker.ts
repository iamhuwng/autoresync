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
  createComponentPdfPublicationCommand,
  ComponentPdfPublicationCommandError,
} from '../../../../src/services/book-assembly/componentPdfPublication.command.ts';
import type {
  ComponentPdfActivityLineage,
  ComponentPdfValidatedActivityPayload,
} from '../../../../src/services/book-assembly/componentPdfPublication.adapter.ts';
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ComponentPdfPublicationWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'ComponentPdfPublicationWorkerError';
  }
}

export interface ComponentPdfPublicationWorkerEnv {
  readonly BOOK_COMPONENT_PDF_PUBLICATION_ENABLED?: string;
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
    throw new ComponentPdfPublicationWorkerError('content_type_required');
  }
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new ComponentPdfPublicationWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ComponentPdfPublicationWorkerError('body_too_large', 413);
  }
  try {
    const record = plain(JSON.parse(text) as unknown);
    if (!record) throw new Error('not_record');
    return record;
  } catch {
    throw new ComponentPdfPublicationWorkerError('invalid_json');
  }
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ComponentPdfPublicationWorkerError('invalid_request');
  }
  for (const key of keys) {
    if (!(key in value)) throw new ComponentPdfPublicationWorkerError('invalid_request');
  }
  return value;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ComponentPdfPublicationWorkerError(code);
  }
  return value;
};

const operationId = (request: Request, allocate: () => string): string => {
  const header = request.headers.get('Idempotency-Key');
  if (header === null) return allocate();
  if (!UUID.test(header)) {
    throw new ComponentPdfPublicationWorkerError('invalid_operation_id');
  }
  return header;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const requestFingerprint = async (
  uid: string,
  body: Record<string, unknown>,
): Promise<string> => {
  const bytes = new TextEncoder().encode(stable({ uid, body }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};

const revision = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ComponentPdfPublicationWorkerError(code);
  }
  return value as number;
};

const approval = (value: unknown): BookAssemblyPreviewApprovalReference => {
  const record = plain(value);
  if (!record) throw new ComponentPdfPublicationWorkerError('invalid_preview_approval');
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

export const createComponentPdfPublicationWorkerHandlers = (options: {
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
  ) => Promise<Readonly<Record<string, ComponentPdfActivityLineage>>>;
  readonly readActivities: (
    input: {
      readonly ownerId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly activityKeys: readonly string[];
    },
  ) => Promise<Readonly<Record<string, ComponentPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    input: {
      readonly bookId: string;
      readonly unitKey: string;
      readonly approvalId: string;
    },
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
  const authenticate = async (env: ComponentPdfPublicationWorkerEnv, uid: string): Promise<void> => {
    if (!env.readDatabaseValue) throw new ComponentPdfPublicationWorkerError('publication_auth_reader_missing', 503);
    if (!roleAllowed(await env.readDatabaseValue(`users/${uid}`))) {
      throw new ComponentPdfPublicationWorkerError('component_pdfs_publication_forbidden', 403);
    }
  };
  const enabled = (env: ComponentPdfPublicationWorkerEnv): boolean =>
    env.BOOK_COMPONENT_PDF_PUBLICATION_ENABLED === 'true';

  return {
    async publish(input: {
      readonly request: Request;
      readonly env: ComponentPdfPublicationWorkerEnv;
      readonly uid: string;
    }): Promise<{ body: unknown; init: ResponseInit }> {
      try {
        await authenticate(input.env, input.uid);
        if (!enabled(input.env)) {
          return { body: { code: 'book_component_pdfs_publication_disabled' }, init: { status: 503 } };
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
        const requestOperationId = operationId(input.request, allocateOperationId);
        const bookId = id(body.bookId, 'invalid_book_id');
        const unitKey = id(body.unitKey, 'invalid_unit_key');
        const candidateId = id(body.candidateId, 'invalid_candidate_id');
        const fingerprint = await requestFingerprint(input.uid, body);
        const stored = (await options.repository.readScope(bookId)).operations?.[requestOperationId];
        if (stored) {
          if (stored.ownerId !== input.uid || stored.fingerprint !== fingerprint) {
            return { body: { code: 'idempotency_conflict' }, init: { status: 409 } };
          }
          if (stored.result.pointer && stored.result.version) {
            const replayed: BookAssemblyPublicationResult = {
              ...structuredClone(stored.result),
              status: 'replayed',
            };
            return {
              body: {
                operationId: requestOperationId,
                manifestVersionId: stored.result.pointer.manifestVersionId,
                publicationId: stored.result.pointer.publicationId,
                publicationRevision: stored.result.pointer.publicationRevision,
                result: replayed,
              },
              init: { status: statusFor(replayed) },
            };
          }
        }
        const command = createComponentPdfPublicationCommand({
          readAuthority: options.readAuthority,
          readCandidate: options.readCandidate,
          readLineage: options.readLineage,
          readActivities: options.readActivities,
          readPreviewApproval: options.readPreviewApproval,
          sourceIsPreviewReady: options.sourceIsPreviewReady,
          publish: (request) => service.publish(request),
          allocateOperationId: () => requestOperationId,
          allocateId,
          now,
        });
        const receipt = await command({
          ownerId: input.uid,
          bookId,
          unitKey,
          candidateId,
          expectedCandidateRevision: revision(body.expectedCandidateRevision, 'invalid_expected_candidate_revision'),
          expectedCurrentPublicationId: nullableId(
            body.expectedCurrentPublicationId,
            'invalid_expected_current_publication_id',
          ),
          expectedBookRevision: revision(body.expectedBookRevision, 'invalid_expected_book_revision'),
          expectedSourceSetRevision: revision(body.expectedSourceSetRevision, 'invalid_expected_source_set_revision'),
          previewApproval: approval(body.previewApproval),
          operationFingerprint: fingerprint,
        });
        return {
          body: receipt,
          init: { status: statusFor(receipt.result) },
        };
      } catch (error) {
        if (error instanceof ComponentPdfPublicationWorkerError) {
          return { body: { code: error.code }, init: { status: error.status } };
        }
        if (error instanceof ComponentPdfPublicationCommandError) {
          return { body: { code: error.code }, init: { status: commandStatus(error.status) } };
        }
        console.error('Component-PDF publication failed', error instanceof Error ? error.message : String(error));
        return { body: { code: 'book_component_pdfs_publication_failed' }, init: { status: 500 } };
      }
    },
  };
};
