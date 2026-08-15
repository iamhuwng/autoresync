import type { BookDeliveryPublishedPublicationReference } from '../book-delivery/bookDelivery.publication';
import type { BookHomeworkAuthoritySchedule } from './bookHomeworkAuthority.types';
import type {
  BookHomeworkManifest,
  BookHomeworkSelectionTarget,
} from '../../types/homework.types';

export const BOOK_HOMEWORK_SAGA_SCHEMA_VERSION = 1 as const;
export const BOOK_HOMEWORK_SAGA_STATES = [
  'prepared',
  'fanout_pending',
  'committed',
  'compensating',
  'compensated',
  'failed_retryable',
  'failed_terminal',
] as const;
export type BookHomeworkSagaState = (typeof BOOK_HOMEWORK_SAGA_STATES)[number];

export const BOOK_HOMEWORK_SAGA_RECIPIENT_STATES = [
  'pending',
  'prepared',
  'active',
  'committed',
  'compensating',
  'compensated',
  'retained',
] as const;
export type BookHomeworkSagaRecipientState = (typeof BOOK_HOMEWORK_SAGA_RECIPIENT_STATES)[number];

export interface BookHomeworkSagaRecipient {
  readonly recipientId: string;
  readonly authorityId: string;
  readonly bindingId: string;
  readonly state: BookHomeworkSagaRecipientState;
  readonly authorityRevision?: number;
  readonly bindingRevision?: number;
  readonly tombstonedAt?: string;
}

export interface BookHomeworkSagaRecord {
  readonly schemaVersion: typeof BOOK_HOMEWORK_SAGA_SCHEMA_VERSION;
  readonly assignmentId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly ownerId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly contextId: string;
  readonly presentation: BookHomeworkSagaPresentation;
  readonly fingerprint: string;
  readonly requestFingerprint: string;
  readonly state: BookHomeworkSagaState;
  readonly visibility: 'hidden' | 'committed';
  readonly recipients: readonly BookHomeworkSagaRecipient[];
  readonly recipientCount: number;
  readonly committedRecipientCount: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
}

export interface BookHomeworkSagaStudentExtension {
  readonly nodeKey: string;
  readonly dueAt: string;
}

export interface BookHomeworkSagaCanonicalState {
  readonly ownerId: string;
  readonly manifest: BookHomeworkManifest;
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly recipientIds: readonly string[];
  readonly studentExtensions: Readonly<Record<string, readonly BookHomeworkSagaStudentExtension[]>>;
  readonly publication: {
    readonly bookId: string;
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly manifestVersionId: string;
    readonly fingerprint: string;
  };
  readonly deliveryPublication: BookDeliveryPublishedPublicationReference;
  readonly sourceReadiness: 'ready';
  readonly exposureApproval: {
    readonly approved: boolean;
    readonly fingerprint: string;
  };
  readonly capabilities: {
    readonly canAssignBookHomework: boolean;
  };
  readonly frozenPolicy: {
    readonly policyId: string;
    readonly policyRevision: number;
    readonly fingerprint: string;
    readonly activityPolicies: Readonly<Record<string, {
      readonly lateSubmissionAllowed: boolean;
      readonly maxAttempts: number | null;
    }>>;
  };
}

/**
 * Untrusted browser assignment choices. The Worker reconstructs canonical
 * manifest, Delivery, policy, and teacher authority data from this intent.
 */
export interface BookHomeworkSagaNodeOverrideIntent {
  readonly nodeKey: string;
  readonly availableFrom?: string;
  readonly dueAt?: string;
}

export interface BookHomeworkSagaStudentExtensionIntent {
  readonly studentId: string;
  readonly nodeKey: string;
  readonly dueAt: string;
}

export interface BookHomeworkSagaActivityPolicyIntent {
  readonly placementId: string;
  readonly maxAttempts: number | null;
  readonly feedbackRelease: 'immediate' | 'after_completion' | 'after_deadline' | 'never' | 'manual';
  readonly lateSubmissionAllowed: boolean;
}

export interface BookHomeworkSagaPresentation {
  readonly title: string;
  readonly description?: string;
}

/**
 * Book scope plus the class provenance used to authorize the selected roster.
 * The canonical Book target remains unchanged; classId is only untrusted
 * assignment context for the Worker to verify.
 */
export type BookHomeworkSagaAssignmentTargetIntent = BookHomeworkSelectionTarget & {
  readonly classId: string;
};

export interface BookHomeworkSagaAssignmentIntent {
  readonly bookId: string;
  readonly target: BookHomeworkSagaAssignmentTargetIntent;
  readonly schedule: {
    readonly finalDueAt: string;
    readonly availableFrom?: string;
    readonly nodeOverrides: readonly BookHomeworkSagaNodeOverrideIntent[];
    readonly studentExtensions?: readonly BookHomeworkSagaStudentExtensionIntent[];
  };
  readonly policy: {
    readonly intent: 'accountable' | 'practice';
    readonly integrityCapture: boolean;
    readonly integrityOverride: boolean;
    readonly activityPolicies: readonly BookHomeworkSagaActivityPolicyIntent[];
  };
  readonly expectedPublication: {
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly manifestVersionId: string;
  };
  readonly presentation: BookHomeworkSagaPresentation;
}

export interface BookHomeworkSagaCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly manifestVersionId: string;
  readonly intent: BookHomeworkSagaAssignmentIntent;
  readonly selectedRecipientIds: readonly string[];
  readonly createdAt: string;
}
