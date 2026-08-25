import type {
  BookAssemblyPreviewApprovalReference,
  BookAssemblyManifestCandidate,
} from '../../types/bookAssembly.types';
import type { CandidateUnitPreviewProjection } from './unitPreview.service';

export interface AssemblyPreviewInput {
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
}

export interface AssemblyPublishInput extends AssemblyPreviewInput {
  readonly expectedCurrentPublicationId: string | null;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
}

export interface AssemblyPublicationReceipt {
  readonly operationId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly result: Record<string, unknown>;
}

export interface BookAssemblyPreviewClient {
  preview(input: AssemblyPreviewInput): Promise<{ readonly preview: CandidateUnitPreviewProjection }>;
  approve(input: AssemblyPreviewInput): Promise<{ readonly approval: BookAssemblyPreviewApprovalReference }>;
  publishFull(input: AssemblyPublishInput): Promise<AssemblyPublicationReceipt>;
  publishComponent(input: AssemblyPublishInput): Promise<AssemblyPublicationReceipt>;
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
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
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
  method: 'POST',
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const token = (await options.getIdToken()).trim();
  if (!token) throw new BookAssemblyPreviewClientError('unauthorized', 401);
  const url = `${base}${path}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
    method,
    credentials: 'omit',
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

const candidatePath = (input: AssemblyPreviewInput, action: 'preview' | 'approve'): string =>
  `/book-assembly/books/${encodeURIComponent(input.bookId)}/units/${encodeURIComponent(input.unitKey)}/candidates/${encodeURIComponent(input.candidateId)}/${action}`;

const candidatePayload = (input: AssemblyPreviewInput): Record<string, unknown> => ({
  bookId: input.bookId,
  unitKey: input.unitKey,
  candidateId: input.candidateId,
  expectedCandidateRevision: input.expectedCandidateRevision,
});

export const createBookAssemblyPreviewClient = (
  options: AssemblyPreviewClientOptions,
): BookAssemblyPreviewClient => {
  const base = safeBaseUrl(options.baseUrl);
  return {
    async preview(input) {
      const body = await requestRecord(options, base, candidatePath(input, 'preview'), 'POST', candidatePayload(input));
      if (!body.preview || typeof body.preview !== 'object' || Array.isArray(body.preview)) {
        throw new BookAssemblyPreviewClientError('invalid_preview_response', 502);
      }
      return { preview: body.preview as CandidateUnitPreviewProjection };
    },
    async approve(input) {
      const body = await requestRecord(options, base, candidatePath(input, 'approve'), 'POST', candidatePayload(input));
      if (!body.approval || typeof body.approval !== 'object' || Array.isArray(body.approval)) {
        throw new BookAssemblyPreviewClientError('invalid_approval_response', 502);
      }
      return { approval: body.approval as BookAssemblyPreviewApprovalReference };
    },
    async publishFull(input) {
      const body = await requestRecord(options, base, '/book-assembly/full-pdf-publications', 'POST', { ...input });
      return body as unknown as AssemblyPublicationReceipt;
    },
    async publishComponent(input) {
      const body = await requestRecord(options, base, '/book-assembly/component-pdf-publications', 'POST', { ...input });
      return body as unknown as AssemblyPublicationReceipt;
    },
  };
};

/** Kept as a type-level import guard for callers constructing a candidate before publish. */
export type AssemblyManifestForPublication = BookAssemblyManifestCandidate;
