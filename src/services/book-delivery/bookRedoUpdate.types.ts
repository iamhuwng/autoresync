import type { BookRedoCheckpointActivityInput, BookRedoStudentLifecycle, BookRedoVisiblePriorResult } from '../book-activity/bookRedoCheckpointProjection.service';
import type { BookDeliveryBinding } from './bookDelivery.types';

export const BOOK_REDO_UPDATE_SCHEMA_VERSION = 1 as const;

export interface BookRedoActivityPlan extends BookRedoCheckpointActivityInput {
  readonly contextId: string;
  readonly contextKind: 'solo' | 'homework' | 'course' | 'class';
  readonly newActivityVersion: number;
  readonly required: boolean;
}

export interface BookRedoStudentPlan {
  readonly schemaVersion: typeof BOOK_REDO_UPDATE_SCHEMA_VERSION;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly contextKind: 'solo' | 'homework' | 'course' | 'class';
  readonly studentId: string;
  readonly currentBinding: BookDeliveryBinding;
  readonly nextBinding: BookDeliveryBinding;
  readonly activities: readonly BookRedoActivityPlan[];
  readonly reason: string;
  readonly createdAt: string;
}

export type BookRedoPlanResolution =
  | { readonly status: 'ready'; readonly students: readonly BookRedoStudentPlan[] }
  | { readonly status: 'stale' | 'denied' | 'unavailable' };

export interface BookRedoUpdateResolver {
  resolve(action: import('./bookUpdateAction.types').BookUpdateActionRecord): Promise<BookRedoPlanResolution>;
}

export interface BookRedoCurrentProjectionPort {
  apply(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly contextId: string;
    readonly studentId: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly previousBindingId: string;
    readonly previousBindingRevision: number;
    readonly selectedPlacementIds: readonly string[];
    readonly nextActivityVersionIds: Readonly<Record<string, string>>;
  }): Promise<{
    readonly status: 'applied' | 'replayed' | 'conflict';
    readonly visibility?: 'new';
    readonly completionStatus?: 'in-progress' | 'completed';
  }>;
}

export interface BookRedoAuditPort {
  record(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly contextId: string;
    readonly studentId: string;
    readonly checkpointId: string | null;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly reopenedPlacementIds: readonly string[];
    readonly reason: string;
  }): Promise<{ readonly status: 'recorded' | 'replayed' | 'conflict' }>;
}

export type BookRedoUpdateResult =
  | { readonly status: 'committed' | 'replayed'; readonly action: import('./bookUpdateAction.types').BookUpdateActionRecord }
  | {
      readonly status: 'pending';
      readonly action: import('./bookUpdateAction.types').BookUpdateActionRecord;
      readonly code: string;
      readonly completedStudentCount: number;
    }
  | { readonly status: 'blocked'; readonly code: string };

export type { BookRedoCheckpointActivityInput, BookRedoStudentLifecycle, BookRedoVisiblePriorResult };
