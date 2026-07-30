import type { BookDeliveryBinding } from '../book-delivery/bookDelivery.types';
import type { ActivityScoreResult } from '../../types/bookActivity.types';

export type BookRuntimeCommandKind = 'state' | 'autosave' | 'submit';
export type BookRuntimeCommandStatus = 'accepted' | 'replayed' | 'conflict' | 'denied';
export type BookRuntimeScheduleOperationKind = BookRuntimeCommandKind | 'document';
export type BookRuntimeScore =
  | Extract<ActivityScoreResult, { status: 'scored' }>
  | { status: 'review_required' };

export interface BookRuntimeCommandPayload {
  readonly operationId: string;
  readonly commandKind: BookRuntimeCommandKind;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly clientRevision: number;
  readonly response: unknown;
}

export interface BookRuntimeTrustedCommandContext {
  readonly actorUid: string;
  readonly operationKind: BookRuntimeScheduleOperationKind;
  readonly binding: BookDeliveryBinding;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly now: string;
}

export interface BookRuntimeDraftRecord {
  readonly schemaVersion: 1;
  readonly bindingId: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly revision: number;
  readonly response: unknown;
  readonly updatedByOperationId: string;
  readonly updatedAt: string;
}

export interface BookRuntimeAttemptRecord {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly bindingRevision?: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly attemptNumber?: number;
  readonly sourceProvenance?: readonly BookRuntimeSourceProvenance[];
  readonly feedbackRelease?: 'pending';
  readonly response: unknown;
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface BookRuntimeResultRecord {
  readonly schemaVersion: 1;
  readonly resultId: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly bindingRevision?: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly attemptNumber?: number;
  readonly sourceProvenance?: readonly BookRuntimeSourceProvenance[];
  readonly feedbackRelease?: 'pending';
  readonly score?: BookRuntimeScore;
  readonly status: 'pending_review' | 'submitted';
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface BookRuntimeCompletionRecord {
  readonly schemaVersion: 1;
  readonly completionId: string;
  readonly attemptId: string;
  readonly resultId: string;
  readonly bindingId: string;
  readonly bindingRevision?: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly attemptNumber?: number;
  readonly sourceProvenance?: readonly BookRuntimeSourceProvenance[];
  readonly status: 'completed';
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface BookRuntimeAttemptIndexRecord {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly resultId: string;
  readonly bindingId: string;
  readonly bindingRevision?: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly attemptNumber?: number;
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface BookRuntimeSourceProvenance {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly pages: readonly number[];
}

export interface BookRuntimeOperationReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly status: BookRuntimeCommandStatus;
  readonly bindingId?: string;
  readonly draftRevision?: number;
  readonly attemptId?: string;
  readonly createdAt: string;
}

export interface BookRuntimeCommandResult {
  readonly status: BookRuntimeCommandStatus;
  readonly draft?: BookRuntimeDraftRecord;
  readonly attempt?: BookRuntimeAttemptRecord;
  readonly result?: BookRuntimeResultRecord;
  readonly completion?: BookRuntimeCompletionRecord;
  readonly index?: BookRuntimeAttemptIndexRecord;
  readonly receipt: BookRuntimeOperationReceipt;
}
