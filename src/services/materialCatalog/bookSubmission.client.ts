import type {
  BookSubmissionBeginRequest,
  BookSubmissionBeginResult,
  BookSubmissionCancelResult,
  BookSubmissionCommitRequest,
  BookSubmissionComponentPreparationRequest,
  BookSubmissionCommitResult,
  BookSubmissionOperation,
  BookSubmissionStatusResult,
} from './bookSubmission.contract.ts';

export const BOOK_SUBMISSION_ROUTE = '/v1/book-submissions';

export interface BookSubmissionClientOptions {
  /** Empty baseUrl deliberately keeps the final-create action unavailable. */
  readonly baseUrl?: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export class BookSubmissionClientError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(`book_submission_${code}`);
    this.name = 'BookSubmissionClientError';
  }
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const baseUrl = (value: string | undefined): string => {
  if (!value?.trim()) throw new BookSubmissionClientError('unavailable', 503);
  let parsed: URL;
  try { parsed = new URL(value.trim().replace(/\/+$/u, '')); } catch {
    throw new BookSubmissionClientError('unavailable', 503);
  }
  const localHttp = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_LOCAL_ONLY === 'true'
    && parsed.protocol === 'http:' && parsed.hostname === 'localhost' && parsed.port === '8787';
  if ((!localHttp && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new BookSubmissionClientError('unavailable', 503);
  }
  return parsed.href.replace(/\/$/u, '');
};

const parse = async (response: Response): Promise<Record<string, unknown>> => {
  let value: unknown;
  try { value = await response.json(); } catch { value = null; }
  return record(value) ?? {};
};

const operation = (value: unknown): value is BookSubmissionOperation => {
  const body = record(value);
  return !!body
    && body.schemaVersion === 1
    && typeof body.operationId === 'string'
    && typeof body.ownerId === 'string'
    && typeof body.finalBookId === 'string'
    && typeof body.idempotencyKey === 'string'
    && typeof body.fingerprint === 'string'
    && typeof body.state === 'string'
    && Array.isArray(body.completedSteps)
    && body.completedSteps.every((step) => typeof step === 'string')
    && typeof body.createdAt === 'string'
    && typeof body.updatedAt === 'string';
};

const failure = (body: Record<string, unknown>, status: number): BookSubmissionClientError => (
  new BookSubmissionClientError(
    typeof body.code === 'string' ? body.code : `http_${status}`,
    status,
  )
);

const request = async (
  options: BookSubmissionClientOptions,
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> => {
  const root = baseUrl(options.baseUrl);
  const token = (await options.getIdToken()).trim();
  if (!token) throw new BookSubmissionClientError('unauthorized', 401);
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${root}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await parse(response);
  if (import.meta.env.DEV) console.info('[BookSubmission] control response', JSON.stringify({
    origin: root, path, method: init.method, status: response.status,
    code: typeof body.code === 'string' ? body.code : undefined,
    operationId: record(body.operation)?.operationId,
    state: record(body.operation)?.state,
  }));
  if (!response.ok) throw failure(body, response.status);
  return body;
};

const readOperation = (body: Record<string, unknown>): BookSubmissionOperation => {
  if (!operation(body.operation)) throw new BookSubmissionClientError('invalid_response', 502);
  return body.operation;
};

const readReceipt = (value: unknown): BookSubmissionStatusResult['receipt'] => {
  const receipt = record(value);
  if (!receipt || receipt.status !== 'committed' || typeof receipt.operationId !== 'string'
    || typeof receipt.ownerId !== 'string' || typeof receipt.finalBookId !== 'string'
    || typeof receipt.fingerprint !== 'string' || typeof receipt.committedAt !== 'string') {
    throw new BookSubmissionClientError('invalid_response', 502);
  }
  return receipt as unknown as BookSubmissionStatusResult['receipt'];
};

export const createBookSubmissionClient = (options: BookSubmissionClientOptions) => ({
  async begin(command: BookSubmissionBeginRequest): Promise<BookSubmissionBeginResult> {
    const body = await request(options, BOOK_SUBMISSION_ROUTE, {
      method: 'POST',
      body: JSON.stringify(command),
    });
    if (body.status !== 'created' && body.status !== 'replayed') {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    return { status: body.status, operation: readOperation(body) };
  },

  async status(operationId: string): Promise<BookSubmissionStatusResult> {
    const body = await request(options, `${BOOK_SUBMISSION_ROUTE}/${encodeURIComponent(operationId)}/status`, {
      method: 'GET',
    });
    if (!['preparing', 'committing', 'committed', 'canceled', 'replayed'].includes(String(body.status))) {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    const operation = readOperation(body);
    return {
      status: body.status as BookSubmissionStatusResult['status'],
      operation,
      ...(operation.state === 'committed' ? { receipt: readReceipt(body.receipt) } : {}),
    };
  },

  async cancel(operationId: string): Promise<BookSubmissionCancelResult> {
    const body = await request(options, `${BOOK_SUBMISSION_ROUTE}/${encodeURIComponent(operationId)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
    if (body.status !== 'canceled' && body.status !== 'replayed') {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    return { status: body.status, operation: readOperation(body) };
  },

  async commit(
    operationId: string,
    command: BookSubmissionCommitRequest,
  ): Promise<BookSubmissionCommitResult> {
    const body = await request(options, `${BOOK_SUBMISSION_ROUTE}/${encodeURIComponent(operationId)}/commit`, {
      method: 'POST',
      body: JSON.stringify(command),
    });
    if (body.status !== 'committed' && body.status !== 'replayed') {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    const receipt = record(body.receipt);
    if (!receipt || receipt.status !== 'committed' || typeof receipt.operationId !== 'string'
      || typeof receipt.finalBookId !== 'string' || typeof receipt.fingerprint !== 'string') {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    return {
      status: body.status,
      operation: readOperation(body),
      receipt: receipt as unknown as BookSubmissionCommitResult['receipt'],
    };
  },

  async prepareComponent(
    operationId: string,
    command: BookSubmissionComponentPreparationRequest,
  ): Promise<{ status: 'prepared' | 'replayed'; operation: BookSubmissionOperation }> {
    const body = await request(options, `${BOOK_SUBMISSION_ROUTE}/${encodeURIComponent(operationId)}/prepare-component`, {
      method: 'POST',
      body: JSON.stringify(command),
    });
    if (body.status !== 'prepared' && body.status !== 'replayed') {
      throw new BookSubmissionClientError('invalid_response', 502);
    }
    return { status: body.status, operation: readOperation(body) };
  },
});
