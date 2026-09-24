import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN } from './notificationCommandClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ResultReviewActionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'ResultReviewActionError';
  }
}

export interface ResultReviewActionResult {
  readonly status: 'committed' | 'replayed';
  readonly eventId: string;
  readonly notificationStatus: string;
}

export const markResultReviewed = async (
  resultId: string,
  options: {
    readonly eventId?: string;
    readonly workerOrigin?: string;
    readonly getIdToken?: () => Promise<string>;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<ResultReviewActionResult> => {
  const eventId = options.eventId ?? crypto.randomUUID();
  if (!ID.test(resultId) || !UUID.test(eventId)) throw new ResultReviewActionError('result_review_invalid', 0);
  const token = (await (options.getIdToken ?? (() => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken() : Promise.resolve('');
  }))()).trim();
  if (!token) throw new ResultReviewActionError('result_review_unauthenticated', 401);

  const origin = (options.workerOrigin?.trim()
    || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
    || DEFAULT_NOTIFICATION_WORKER_ORIGIN).replace(/\/+$/u, '');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new ResultReviewActionError('result_review_origin_invalid', 0); }
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new ResultReviewActionError('result_review_origin_invalid', 0);
  }

  const response = await (options.fetchImpl ?? globalThis.fetch)(`${parsed.origin}/result-notifications/reviewed`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': eventId,
    },
    body: JSON.stringify({ schemaVersion: 1, actionType: 'result-reviewed', eventId, resultId }),
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 4096) throw new ResultReviewActionError('result_review_response_too_large', 502);
  let body: Record<string, unknown>;
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    body = value as Record<string, unknown>;
  } catch {
    throw new ResultReviewActionError('result_review_response_invalid', 502);
  }
  if (!response.ok) {
    throw new ResultReviewActionError(typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status);
  }
  if ((body.status !== 'committed' && body.status !== 'replayed')
    || body.eventId !== eventId || typeof body.notificationStatus !== 'string') {
    throw new ResultReviewActionError('result_review_response_invalid', 502);
  }
  return body as unknown as ResultReviewActionResult;
};
