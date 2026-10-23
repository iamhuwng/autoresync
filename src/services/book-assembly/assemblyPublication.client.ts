import type {
  BookAssemblyPreviewApprovalReference,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationPointer,
  BookUnitCandidate,
} from '../../types/bookAssembly.types';
import type { CandidateUnitPreviewProjection } from './unitPreview.service';
import type { WholeActivationApprovalQualification } from './unitPreview.service';

export interface AssemblyPreviewInput {
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
}

export interface AssemblyApproveInput extends AssemblyPreviewInput {
  readonly expectedUnitInputFingerprint?: string;
  readonly expectedWholeActivationFingerprint?: string;
}

export interface AssemblyPublishInput extends AssemblyPreviewInput {
  /** Reuse this key when a publication request may be retried after a lost response. */
  readonly operationId?: string;
  readonly expectedCurrentPublicationId: string | null;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
}

export interface AssemblyComponentPublishInput {
  readonly bookId: string;
  readonly operationId?: string;
  readonly expectedCurrentPublicationId: string | null;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly unitApprovals: readonly (BookAssemblyPreviewApprovalReference & {
    readonly unitKey: string;
    readonly candidateId: string;
    readonly candidateRevision: number;
  })[];
}

export interface AssemblyPublicationReceipt {
  readonly operationId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly result: Record<string, unknown>;
}

export interface BookAssemblyCurrentPublication {
  readonly pointer: BookAssemblyPublicationPointer;
  /** Immutable Unit candidates copied from the committed student-safe publication. */
  readonly units: readonly BookUnitCandidate[];
}

export interface BookAssemblyPreviewClient {
  readCurrentPublication?(bookId: string): Promise<BookAssemblyCurrentPublication | null>;
  preview(input: AssemblyPreviewInput): Promise<{
    readonly preview: CandidateUnitPreviewProjection;
    readonly qualification?: WholeActivationApprovalQualification;
  }>;
  approve(input: AssemblyApproveInput): Promise<{ readonly approval: BookAssemblyPreviewApprovalReference }>;
  publishFull(input: AssemblyPublishInput): Promise<AssemblyPublicationReceipt>;
  publishComponent(input: AssemblyComponentPublishInput): Promise<AssemblyPublicationReceipt>;
}

export interface AssemblyPreviewClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export class BookAssemblyPreviewClientError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'BookAssemblyPreviewClientError';
  }
}

const safeBaseUrl = (value: string): string => {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new BookAssemblyPreviewClientError('unavailable', 0); }
  const localHttp = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_LOCAL_ONLY === 'true'
    && url.origin === 'http://localhost:8787';
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash) {
    throw new BookAssemblyPreviewClientError('unavailable', 0);
  }
  return url.href.replace(/\/$/u, '');
};

const json = async (response: Response): Promise<Record<string, unknown>> => {
  let parsed: unknown;
  try { parsed = await response.json(); } catch { throw new BookAssemblyPreviewClientError('invalid_response', 502); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BookAssemblyPreviewClientError('invalid_response', 502);
  }
  return parsed as Record<string, unknown>;
};

const requestRecord = async (
  options: AssemblyPreviewClientOptions,
  base: string,
  path: string,
  method: 'GET' | 'POST',
  payload?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> => {
  const token = (await options.getIdToken()).trim();
  if (!token) throw new BookAssemblyPreviewClientError('unauthorized', 401);
  const url = `${base}${path}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
    method,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (response.redirected || (response.url && response.url !== url)) {
    throw new BookAssemblyPreviewClientError('response_binding_mismatch', 502);
  }
  const body = await json(response);
  if (!response.ok) {
    throw new BookAssemblyPreviewClientError(typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status);
  }
  return body;
};

const publishPayload = ({ operationId: _operationId, ...input }: AssemblyPublishInput | AssemblyComponentPublishInput): Record<string, unknown> => input;

const candidatePath = (input: AssemblyPreviewInput, action: 'preview' | 'approve'): string =>
  `/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates/${encodeURIComponent(input.candidateId)}/${action}`;

const candidatePayload = (input: AssemblyApproveInput): Record<string, unknown> => ({
  bookId: input.bookId,
  unitKey: input.unitKey,
  candidateId: input.candidateId,
  expectedCandidateRevision: input.expectedCandidateRevision,
  ...(input.expectedUnitInputFingerprint
    ? { expectedUnitInputFingerprint: input.expectedUnitInputFingerprint }
    : {}),
  ...(input.expectedWholeActivationFingerprint
    ? { expectedWholeActivationFingerprint: input.expectedWholeActivationFingerprint }
    : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isPublicationPointer = (value: unknown): value is BookAssemblyPublicationPointer => (
  isRecord(value)
  && typeof value.publicationId === 'string'
  && typeof value.manifestVersionId === 'string'
  && Number.isSafeInteger(value.publicationRevision)
  && Number.isSafeInteger(value.bookRevision)
  && Number.isSafeInteger(value.sourceSetRevision)
  && typeof value.inputFingerprint === 'string'
  && typeof value.updatedAt === 'string'
  && typeof value.updatedByCommandId === 'string'
);

const isPublishedUnit = (value: unknown): value is BookUnitCandidate => (
  isRecord(value)
  && typeof value.unitKey === 'string'
  && Array.isArray(value.activitySlots)
  && Array.isArray(value.pageGroups)
);

export const createBookAssemblyPreviewClient = (
  options: AssemblyPreviewClientOptions,
): BookAssemblyPreviewClient => {
  const base = safeBaseUrl(options.baseUrl);
  return {
    async readCurrentPublication(bookId) {
      const body = await requestRecord(
        options,
        base,
        `/book-assembly/books/${encodeURIComponent(bookId)}/current-publication`,
        'GET',
      );
      if (body.status === 'empty') return null;
      if (body.status !== 'published' || !isPublicationPointer(body.pointer)
        || !Array.isArray(body.units) || !body.units.every(isPublishedUnit)) {
        throw new BookAssemblyPreviewClientError('invalid_publication_response', 502);
      }
      return { pointer: body.pointer, units: body.units };
    },
    async preview(input) {
      const body = await requestRecord(options, base, candidatePath(input, 'preview'), 'POST', candidatePayload(input));
      if (!body.preview || typeof body.preview !== 'object' || Array.isArray(body.preview)) {
        throw new BookAssemblyPreviewClientError('invalid_preview_response', 502);
      }
      return {
        preview: body.preview as CandidateUnitPreviewProjection,
        ...(body.qualification && typeof body.qualification === 'object' && !Array.isArray(body.qualification)
          ? { qualification: body.qualification as unknown as WholeActivationApprovalQualification }
          : {}),
      };
    },
    async approve(input) {
      const body = await requestRecord(options, base, candidatePath(input, 'approve'), 'POST', candidatePayload(input));
      if (!body.approval || typeof body.approval !== 'object' || Array.isArray(body.approval)) {
        throw new BookAssemblyPreviewClientError('invalid_approval_response', 502);
      }
      return { approval: body.approval as BookAssemblyPreviewApprovalReference };
    },
    async publishFull(input) {
      const body = await requestRecord(options, base, '/book-assembly/full-pdf-publications', 'POST', publishPayload(input), input.operationId);
      return body as unknown as AssemblyPublicationReceipt;
    },
    async publishComponent(input) {
      const body = await requestRecord(options, base, '/book-assembly/component-pdf-publications', 'POST', publishPayload(input), input.operationId);
      return body as unknown as AssemblyPublicationReceipt;
    },
  };
};

/** Kept as a type-level import guard for callers constructing a candidate before publish. */
export type AssemblyManifestForPublication = BookAssemblyManifestCandidate;
