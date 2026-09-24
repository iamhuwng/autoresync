import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN } from './notificationCommandClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class FeedbackActionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'FeedbackActionError';
  }
}

export const saveFeedbackAction = async (input: {
  readonly resultId: string;
  readonly feedbackKind: 'question' | 'overall';
  readonly questionId?: string;
  readonly feedback: string;
}, options: {
  readonly eventId?: string;
  readonly workerOrigin?: string;
  readonly getIdToken?: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
} = {}): Promise<void> => {
  const eventId = options.eventId ?? crypto.randomUUID();
  if (!ID.test(input.resultId) || !UUID.test(eventId) || input.feedback.length > 5000
    || (input.feedbackKind === 'question' && (!input.questionId || !ID.test(input.questionId)))) {
    throw new FeedbackActionError('feedback_action_invalid', 0);
  }
  const token = (await (options.getIdToken ?? (() => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken() : Promise.resolve('');
  }))()).trim();
  if (!token) throw new FeedbackActionError('feedback_action_unauthenticated', 401);
  const origin = (options.workerOrigin?.trim()
    || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
    || DEFAULT_NOTIFICATION_WORKER_ORIGIN).replace(/\/+$/u, '');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new FeedbackActionError('feedback_action_origin_invalid', 0); }
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new FeedbackActionError('feedback_action_origin_invalid', 0);
  }
  const command = {
    schemaVersion: 1,
    actionType: 'save-feedback',
    eventId,
    resultId: input.resultId,
    feedbackKind: input.feedbackKind,
    ...(input.questionId === undefined ? {} : { questionId: input.questionId }),
    feedback: input.feedback,
  };
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${parsed.origin}/feedback-notifications/actions`, {
    method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
    body: JSON.stringify(command),
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 4096) throw new FeedbackActionError('feedback_action_response_too_large', 502);
  let body: Record<string, unknown>;
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    body = value as Record<string, unknown>;
  } catch {
    throw new FeedbackActionError('feedback_action_response_invalid', 502);
  }
  if (!response.ok) throw new FeedbackActionError(typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status);
  if ((body.status !== 'committed' && body.status !== 'replayed') || body.eventId !== eventId
    || typeof body.notificationStatus !== 'string') throw new FeedbackActionError('feedback_action_response_invalid', 502);
};
