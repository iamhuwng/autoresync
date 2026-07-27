import type { BookDeliveryBinding } from '../book-delivery/bookDelivery.types';

export type BookRuntimeCommandKind = 'state' | 'autosave' | 'submit';
export type BookRuntimeCommandStatus = 'accepted' | 'replayed' | 'conflict' | 'denied';
export type BookRuntimeScheduleOperationKind = BookRuntimeCommandKind | 'document';

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
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly response: unknown;
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface BookRuntimeResultRecord {
  readonly schemaVersion: 1;
  readonly resultId: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly status: 'pending_review' | 'submitted';
  readonly createdByOperationId: string;
  readonly createdAt: string;
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
  readonly receipt: BookRuntimeOperationReceipt;
}
