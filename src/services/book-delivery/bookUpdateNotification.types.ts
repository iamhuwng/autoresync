import type { BookImpactSnapshotChoice } from './bookImpactSnapshot.types';
import type { BookImpactSummary } from './bookImpactDiscovery.types';

export interface BookUpdateNotificationPlan {
  readonly recipientId: string;
  readonly homeworkId: string;
  readonly classification: BookImpactSummary['classification']['primaryEffect'];
  readonly choice: BookImpactSnapshotChoice;
  readonly destinationView: 'updated-homework' | 'previous-version';
  readonly checkpointAvailable: boolean;
  readonly deadlineAt: string | null;
  readonly actionSummary: string;
}

export interface BookUpdateNotificationEmissionPort {
  emit(input: {
    readonly actionId: string;
    readonly committedAt: string;
    readonly plan: BookUpdateNotificationPlan;
  }): Promise<{ readonly status: 'disabled' | 'empty' | 'emitted'; readonly created: number; readonly replayed: number }>;
}

export const bookUpdatePlanRequiresNotification = (plan: BookUpdateNotificationPlan): boolean => {
  if (plan.classification === 'unchanged' || plan.classification === 'reordered') return false;
  if (plan.classification === 'removed') return false;
  return plan.choice !== 'review-only'
    && plan.choice !== 'retain-current'
    && plan.choice !== 'exclude-added'
    && plan.choice !== 'retain-historical';
};
