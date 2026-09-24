import {
  resolveCourseTypeDecisionNotice,
  type CourseTypeDecisionRecord,
} from './course-type-decision.ts';
import type { NotificationCommandRepository } from './repository.ts';
import {
  COURSE_TYPE_DECISION_DONE_DUE_AT,
  type CourseTypeDecisionIntent,
  type CourseTypeDecisionStorage,
} from './course-type-decision-store.ts';

const RETRY_DELAY_MS = 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const MAX_DUE_PER_PASS = 2;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export const readCourseTypeDecisionDispatchRequest = async (
  request: Request,
): Promise<{ requestId: string }> => {
  if (request.method !== 'POST'
    || !request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('course_type_notification_request_invalid');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) {
    throw new Error('course_type_notification_request_too_large');
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('course_type_notification_request_invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('course_type_notification_request_invalid');
  }
  const command = value as Record<string, unknown>;
  if (Object.keys(command).sort().join(',') !== 'actionType,requestId,schemaVersion'
    || command.schemaVersion !== 1 || command.actionType !== 'dispatch-course-type-decision'
    || typeof command.requestId !== 'string' || !REQUEST_ID.test(command.requestId)) {
    throw new Error('course_type_notification_request_invalid');
  }
  return { requestId: command.requestId };
};

export interface CourseTypeDecisionHandlerOptions {
  readonly storage: CourseTypeDecisionStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}

const eventActor = (request: CourseTypeDecisionRecord): unknown =>
  request.status === 'approved' ? request.approvedBy : request.handledBy;

const withIntent = (
  request: CourseTypeDecisionRecord,
  intent: CourseTypeDecisionIntent,
): CourseTypeDecisionRecord => ({ ...request, notificationIntent: intent });

const claim = async (
  storage: CourseTypeDecisionStorage,
  requestId: string,
  now: number,
  allowed: (intent: CourseTypeDecisionIntent) => boolean,
  next: (intent: CourseTypeDecisionIntent) => CourseTypeDecisionIntent,
): Promise<CourseTypeDecisionIntent | null> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storage.readIntent(requestId);
    if (!current.intent || !allowed(current.intent)) return null;
    const updated = next(current.intent);
    if (await storage.writeIntent(requestId, updated, current.etag)) return updated;
  }
  return null;
};

const terminal = (intent: CourseTypeDecisionIntent): CourseTypeDecisionIntent => ({
  ...intent,
  dueAt: COURSE_TYPE_DECISION_DONE_DUE_AT,
});

export const createCourseTypeDecisionHandlers = (options: CourseTypeDecisionHandlerOptions) => {
  const now = options.now ?? Date.now;

  const markDone = async (requestId: string): Promise<void> => {
    await claim(options.storage, requestId, now(), (intent) => (
      intent.state === 'sending' || intent.state === 'retrying'
    ), (intent) => ({ ...terminal(intent), state: 'done' }));
  };

  const markFailure = async (
    request: CourseTypeDecisionRecord,
    requestId: string,
    intent: CourseTypeDecisionIntent,
  ): Promise<void> => {
    const finalAttempt = intent.attempts === 2;
    const state: CourseTypeDecisionIntent['state'] = finalAttempt ? 'failed' : 'retry_due';
    if (finalAttempt) await options.storage.reportFailure(request, terminal(intent));
    const updated = await claim(options.storage, requestId, now(), (current) => (
      (current.state === 'sending' || current.state === 'retrying')
        && current.attempts === intent.attempts
    ), (current) => ({
      ...current,
      state,
      dueAt: finalAttempt ? COURSE_TYPE_DECISION_DONE_DUE_AT : now() + RETRY_DELAY_MS,
    }));
    if (!updated) throw new Error('course_type_notification_state_update_failed');
  };

  const attemptDelivery = async (
    requestId: string,
    request: CourseTypeDecisionRecord,
    intent: CourseTypeDecisionIntent,
  ): Promise<{ delivered: boolean; backendFailure: boolean }> => {
    const saved = withIntent(request, intent);
    const notice = resolveCourseTypeDecisionNotice(requestId, saved);
    if (!notice) return { delivered: false, backendFailure: false };
    try {
      const result = await options.repository.create({
        operationId: notice.operationId,
        recipientId: notice.recipientId,
        notification: notice.notification,
        now: notice.occurredAt,
      });
      if (result.status === 'idempotency-conflict') throw new Error('notification_idempotency_conflict');
    } catch {
      await markFailure(request, requestId, intent);
      return { delivered: false, backendFailure: true };
    }
    await markDone(requestId);
    return { delivered: true, backendFailure: false };
  };

  const recoverLease = async (
    requestId: string,
    request: CourseTypeDecisionRecord,
    intent: CourseTypeDecisionIntent,
  ): Promise<void> => {
    const notice = resolveCourseTypeDecisionNotice(requestId, withIntent(request, intent));
    if (!notice || !options.repository.exists) return;
    if (await options.repository.exists(notice.recipientId, notice.operationId)) {
      await markDone(requestId);
      return;
    }
    if (intent.attempts === 1) {
      await claim(options.storage, requestId, now(), (current) => (
        current.state === 'sending' && current.attempts === 1
      ), (current) => ({ ...current, state: 'retry_due', dueAt: now() + RETRY_DELAY_MS }));
      return;
    }
    await options.storage.reportFailure(request, terminal(intent));
    const failed = await claim(options.storage, requestId, now(), (current) => (
      current.state === 'retrying' && current.attempts === 2
    ), (current) => ({ ...terminal(current), state: 'failed' }));
    if (!failed) return;
  };

  const dispatch = async (input: { requestId: string; actorUid: string }): Promise<{
    status: 'delivered' | 'retry_due' | 'failed' | 'forbidden' | 'not_found' | 'stale';
  }> => {
    const request = await options.storage.readRequest(input.requestId);
    if (!request) return { status: 'not_found' };
    if (eventActor(request) !== input.actorUid) return { status: 'forbidden' };
    const intent = await claim(options.storage, input.requestId, now(), (current) => (
      current.state === 'due' && current.attempts === 0 && current.dueAt <= now()
    ), (current) => ({ ...current, state: 'sending', attempts: 1, dueAt: now() + LEASE_MS }));
    if (!intent) return { status: 'stale' };
    const result = await attemptDelivery(input.requestId, request, intent);
    if (result.delivered) return { status: 'delivered' };
    const current = await options.storage.readIntent(input.requestId);
    return { status: current.intent?.state === 'failed' ? 'failed' : 'retry_due' };
  };

  const runRetryBatch = async (): Promise<{ processed: number }> => {
    const due = await options.storage.dueRequests(MAX_DUE_PER_PASS);
    let processed = 0;
    for (const request of due) {
      const requestId = typeof request.id === 'string' ? request.id : '';
      if (!requestId) continue;
      const before = await options.storage.readIntent(requestId);
      const intent = before.intent;
      if (!intent || intent.dueAt > now() || intent.state === 'done' || intent.state === 'failed') continue;
      if (intent.state === 'sending' || intent.state === 'retrying') {
        await recoverLease(requestId, request, intent);
        processed += 1;
        continue;
      }
      const first = intent.state === 'due' && intent.attempts === 0;
      const retry = intent.state === 'retry_due' && intent.attempts === 1;
      if (!first && !retry) continue;
      const claimed = await claim(options.storage, requestId, now(), (current) => (
        current.dueAt <= now() && (first
          ? current.state === 'due' && current.attempts === 0
          : current.state === 'retry_due' && current.attempts === 1)
      ), (current) => ({
        ...current,
        state: first ? 'sending' : 'retrying',
        attempts: first ? 1 : 2,
        dueAt: now() + LEASE_MS,
      }));
      if (!claimed) continue;
      const result = await attemptDelivery(requestId, request, claimed);
      processed += 1;
      if (result.backendFailure) break;
    }
    return { processed };
  };

  return { dispatch, runRetryBatch };
};
