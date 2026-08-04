import type { BookDeliveryBinding, BookDeliveryContextKind } from './bookDelivery.types';

export const BOOK_DELIVERY_RECORD_ROOT = 'book_delivery/records';
export const BOOK_DELIVERY_CURRENT_ROOT = 'book_delivery/current';
export const BOOK_DELIVERY_INDEX_ROOT = 'book_delivery/indexes';

export type BookDeliveryMutationStatus =
  | 'created'
  | 'activated'
  | 'superseded'
  | 'revoked'
  | 'replayed'
  | 'conflict'
  | 'not-found'
  | 'forbidden'
  | 'unsupported-context'
  | 'idempotency-conflict';

export interface BookDeliveryRecord {
  readonly binding: BookDeliveryBinding;
  readonly recordRevision: number;
  readonly status: 'draft' | 'active' | 'revoked';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BookDeliveryCurrentPointer {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly contextKind: BookDeliveryContextKind;
  readonly status: 'active';
  readonly updatedAt: string;
}

export interface BookDeliveryOperationReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly status: BookDeliveryMutationStatus;
  readonly bindingId?: string;
  readonly bindingRevision?: number;
  readonly createdAt: string;
}

export interface BookDeliveryResolvedEntitlement {
  readonly record: BookDeliveryRecord;
  readonly pointer: BookDeliveryCurrentPointer;
}

export interface BookDeliveryMutationResult {
  readonly status: BookDeliveryMutationStatus;
  readonly record?: BookDeliveryRecord;
  readonly pointer?: BookDeliveryCurrentPointer;
  readonly receipt: BookDeliveryOperationReceipt;
}

export interface BookDeliveryRepository {
  readBinding(bindingId: string): Promise<BookDeliveryRecord | null>;
  readCurrent(recipientId: string, contextId: string): Promise<BookDeliveryCurrentPointer | null>;
  resolveCurrent(recipientId: string, contextId: string): Promise<BookDeliveryResolvedEntitlement | null>;
  createDraft(input: {
    binding: BookDeliveryBinding;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult>;
  activate(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId?: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult>;
  supersede(input: {
    binding: BookDeliveryBinding;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult>;
  revoke(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult>;
}
