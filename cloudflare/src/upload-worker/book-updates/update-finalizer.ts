import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import {
  bookUpdatePlanRequiresNotification,
  type BookUpdateNotificationEmissionPort,
  type BookUpdateNotificationPlan,
} from '../../../../src/services/book-delivery/bookUpdateNotification.types.ts';
import { advanceBookUpdateAction, type BookUpdateActionRepository } from './update-action.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RECIPIENTS = 30;

export interface BookUpdateNotificationPlanResolver {
  resolve(action: BookUpdateActionRecord): Promise<readonly BookUpdateNotificationPlan[]>;
}

export type BookUpdateFinalizationResult =
  | { readonly status: 'completed'; readonly action: BookUpdateActionRecord; readonly emitted: number; readonly replayed: number }
  | { readonly status: 'notification-pending'; readonly action: BookUpdateActionRecord; readonly code: string }
  | { readonly status: 'blocked'; readonly code: string };

const validatePlans = (
  action: BookUpdateActionRecord,
  plans: readonly BookUpdateNotificationPlan[],
): readonly BookUpdateNotificationPlan[] | null => {
  if (!Array.isArray(plans) || plans.length > MAX_RECIPIENTS) return null;
  const seen = new Set<string>();
  const valid: BookUpdateNotificationPlan[] = [];
  for (const plan of plans) {
    const contextKey = `homework:${plan.homeworkId}`;
    const selection = action.selections.find((candidate) => (
      candidate.contextKey === contextKey && candidate.choice === plan.choice
    ));
    if (!plan || typeof plan !== 'object'
      || !SAFE_ID.test(plan.recipientId)
      || !SAFE_ID.test(plan.homeworkId)
      || seen.has(plan.recipientId)
      || typeof plan.actionSummary !== 'string'
      || plan.actionSummary.trim() !== plan.actionSummary
      || plan.actionSummary.length === 0
      || plan.actionSummary.length > 600
      || (plan.deadlineAt !== null && !Number.isFinite(Date.parse(plan.deadlineAt)))
      || !action.audit.selectedContextKeys.includes(contextKey)
      || !action.audit.classifications.includes(plan.classification)
      || !selection
      || (selection.replacementDeadline !== undefined && selection.replacementDeadline !== plan.deadlineAt)
      || (plan.checkpointAvailable && action.audit.checkpointCount === 0)) return null;
    seen.add(plan.recipientId);
    if (bookUpdatePlanRequiresNotification(plan)) valid.push(Object.freeze({ ...plan }));
  }
  return Object.freeze(valid.sort((left, right) => left.recipientId.localeCompare(right.recipientId)));
};

export const createBookUpdateFinalizer = (options: {
  readonly actions: BookUpdateActionRepository;
  readonly plans: BookUpdateNotificationPlanResolver;
  readonly emitter: BookUpdateNotificationEmissionPort;
  readonly now?: () => Date;
}) => Object.freeze({
  async finalize(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookUpdateFinalizationResult> {
    let action = await options.actions.read(input.ownerId, input.actionId);
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state === 'completed') return { status: 'completed', action, emitted: 0, replayed: 0 };
    if (action.state !== 'committed' && action.state !== 'notification-pending') {
      return { status: 'blocked', code: 'action-not-committed' };
    }
    if (!action.committedAt || !Number.isFinite(Date.parse(action.committedAt))) {
      return { status: 'blocked', code: 'commit-time-missing' };
    }
    const committedAt = action.committedAt;
    if (action.state === 'committed') {
      const pending = await advanceBookUpdateAction({
        repository: options.actions,
        ownerId: action.ownerId,
        actionId: action.actionId,
        expectedState: 'committed',
        expectedRevision: action.stateRevision,
        nextState: 'notification-pending',
        at: (options.now?.() ?? new Date()).toISOString(),
      });
      if (pending.status !== 'advanced' || !pending.action) {
        return { status: 'blocked', code: 'action-transition-conflict' };
      }
      action = pending.action;
    }
    let plans: readonly BookUpdateNotificationPlan[];
    try {
      const resolved = await options.plans.resolve(action);
      const validated = validatePlans(action, resolved);
      if (!validated) return { status: 'notification-pending', action, code: 'notification-plan-invalid' };
      plans = validated;
    } catch {
      return { status: 'notification-pending', action, code: 'notification-plan-unavailable' };
    }
    let emitted = 0;
    let replayed = 0;
    try {
      for (const plan of plans) {
        const result = await options.emitter.emit({
          actionId: action.actionId,
          committedAt,
          plan,
        });
        if (result.status === 'disabled') {
          return { status: 'notification-pending', action, code: 'notification-emission-disabled' };
        }
        emitted += result.created;
        replayed += result.replayed;
      }
    } catch {
      return { status: 'notification-pending', action, code: 'notification-emission-failed' };
    }
    const completedAt = (options.now?.() ?? new Date()).toISOString();
    const completed = await advanceBookUpdateAction({
      repository: options.actions,
      ownerId: action.ownerId,
      actionId: action.actionId,
      expectedState: 'notification-pending',
      expectedRevision: action.stateRevision,
      nextState: 'completed',
      at: completedAt,
    });
    return completed.status === 'advanced' && completed.action
      ? { status: 'completed', action: completed.action, emitted, replayed }
      : { status: 'notification-pending', action, code: 'completion-transition-conflict' };
  },
});
