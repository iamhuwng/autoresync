export type ListeningAuthoringPath =
  | 'listening_authoring/drafts'
  | 'listening_authoring/revision_drafts'
  | 'listening_authoring/versions'
  | 'listening_authoring/operations';

export type ListeningAuthoringTestType = 'IELTS' | 'TOEFL' | 'Custom';
export type ListeningAuthoringDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type ListeningAuthoringDisplayMode = 'text' | 'image';

export interface ListeningAuthoringAudioControls {
  readonly showPlayPause: boolean;
  readonly showProgressBar: boolean;
  readonly showSeekControl: boolean;
  readonly showSpeedControl: boolean;
  readonly showSkipSection: boolean;
  readonly showVolumeControl: boolean;
}

export interface ListeningAuthoringAudioSection {
  readonly number: number;
  readonly name: string;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
  readonly startQuestion: number;
  readonly endQuestion: number;
  readonly playLimit?: number;
  readonly waitTimeBefore?: number;
}

export interface ListeningAuthoringQuestion {
  readonly number: number;
  readonly type: string;
  readonly question: string;
  readonly options?: readonly string[];
  readonly answer: string | string[] | Record<string, string>;
  readonly sectionNumber: number;
  readonly points: number;
  readonly imageUrl?: string;
}

export interface ListeningAuthoringQuestionImageRange {
  readonly start?: number;
  readonly end?: number;
}

export interface ListeningAuthoringQuestionImage {
  readonly sectionNumber: number;
  readonly imageUrl: string;
  readonly imageCaption?: string;
  readonly questionRange?: ListeningAuthoringQuestionImageRange;
}

export interface ListeningAuthoringDocumentV1 {
  readonly title: string;
  readonly type: ListeningAuthoringTestType;
  readonly skill: 'Listening';
  readonly duration: number;
  readonly difficulty: ListeningAuthoringDifficulty;
  readonly questionCount: number;
  readonly isPublic: boolean;
  readonly isComplete: boolean;
  readonly missingAnswerCount?: number;
  readonly displayMode: ListeningAuthoringDisplayMode;
  readonly metadata: {
    readonly description: string;
    readonly instructions: string;
    readonly tags: readonly string[];
    readonly targetBand?: string;
    readonly estimatedScore?: string;
    readonly transcript?: string;
  };
  readonly audioSections: readonly ListeningAuthoringAudioSection[];
  readonly questionImages?: readonly ListeningAuthoringQuestionImage[];
  readonly questions: readonly ListeningAuthoringQuestion[];
  readonly settings: {
    readonly allowPause: boolean;
    readonly showTimer: boolean;
    readonly shuffleQuestions: boolean;
    readonly showResults: 'immediate' | 'after-submission' | 'never';
    readonly allowReview: boolean;
    readonly passingScore: number;
    readonly allowReplay: boolean;
    readonly maxReplays?: number;
    readonly audioControls?: ListeningAuthoringAudioControls;
  };
}

export interface ListeningAuthoringIssue {
  readonly sectionNumber?: number;
  readonly questionNumber?: number;
  readonly field: string;
  readonly severity: 'warning' | 'blocker';
  readonly guidance: string;
}

export interface ListeningRetainedPins {
  readonly assignments?: readonly string[];
  readonly sessions?: readonly string[];
  readonly attempts?: readonly string[];
  readonly results?: readonly string[];
}

export interface ListeningDraftSoftDeleteMetadata {
  readonly deletedAt: number;
  readonly deletedBy: string;
  readonly reasonCode?: string;
  readonly priorConflictToken: number;
  readonly retentionDecisionRef?: string;
  readonly restoredAt?: number;
  readonly restoredBy?: string;
  readonly restoreCount: number;
}

export interface ListeningAuthoringDraftRecord {
  readonly path: 'listening_authoring/drafts' | 'listening_authoring/revision_drafts';
  readonly draftId: string;
  readonly testId: string;
  readonly ownerId: string;
  readonly recordType: 'draft' | 'revision-draft';
  readonly state: 'draft' | 'published' | 'archived' | 'soft-deleted';
  readonly conflictToken: number;
  readonly document: ListeningAuthoringDocumentV1;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly latestPublishedVersionId?: string;
  readonly createdFromVersionId?: string;
  readonly createdFromVersionNumber?: number;
  readonly softDelete?: ListeningDraftSoftDeleteMetadata;
}

export interface ListeningPublishedVersionRecord {
  readonly path: 'listening_authoring/versions';
  readonly versionId: string;
  readonly draftId: string;
  readonly ownerId: string;
  readonly testId: string;
  readonly state: 'published' | 'archived';
  readonly versionNumber: number;
  readonly sourceDraftPath: 'drafts' | 'revision_drafts' | 'legacy_tests';
  readonly sourceDraftId?: string;
  readonly sourceLegacyTestId?: string;
  readonly document: ListeningAuthoringDocumentV1;
  readonly documentHash: string;
  readonly retainedPins: ListeningRetainedPins;
  readonly publishedAt: number;
  readonly compatibility?: {
    readonly legacyTestPath?: string;
    readonly frozenLegacyVersion1?: boolean;
  };
  readonly archiveMetadata?: {
    readonly archivedAt: number;
    readonly archivedBy: string;
    readonly reason?: string;
  };
}

export type ListeningOperationType =
  | 'save-draft'
  | 'publish-draft'
  | 'create-revision-draft'
  | 'archive-version'
  | 'soft-delete-draft'
  | 'restore-draft'
  | 'legacy-first-edit';

export interface ListeningAuthoringOperationRecord<T = unknown> {
  readonly path: 'listening_authoring/operations';
  readonly operationId: string;
  readonly ownerId: string;
  readonly operationType: ListeningOperationType;
  readonly targetId: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
  readonly status: 'succeeded';
  readonly result: T;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface SaveListeningDraftInput {
  readonly ownerId: string;
  readonly idempotencyKey: string;
  readonly document: ListeningAuthoringDocumentV1;
  readonly draftId?: string;
  readonly expectedConflictToken?: number;
  readonly trigger?: 'explicit' | 'autosave';
}

export interface PublishListeningDraftInput {
  readonly ownerId: string;
  readonly draftId: string;
  readonly expectedConflictToken: number;
  readonly idempotencyKey: string;
  readonly retainedPins?: ListeningRetainedPins;
}

export interface CreateListeningRevisionDraftInput {
  readonly ownerId: string;
  readonly sourceVersionId: string;
  readonly idempotencyKey: string;
}

export interface CreateListeningLegacyRevisionDraftInput {
  readonly ownerId: string;
  readonly legacyTestId: string;
  readonly idempotencyKey: string;
  readonly document: ListeningAuthoringDocumentV1;
  readonly retainedPins?: ListeningRetainedPins;
}

export type SaveListeningDraftResult =
  | {
      readonly status: 'saved';
      readonly draftId: string;
      readonly conflictToken: number;
      readonly warnings: readonly ListeningAuthoringIssue[];
      readonly blockers: readonly ListeningAuthoringIssue[];
    }
  | {
      readonly status: 'conflict';
      readonly recoverable: true;
      readonly draftId: string;
      readonly expectedConflictToken?: number;
      readonly currentConflictToken: number;
    }
  | {
      readonly status: 'idempotency-conflict';
      readonly recoverable: false;
    };

export type PublishListeningDraftResult =
  | {
      readonly status: 'published';
      readonly draftId: string;
      readonly versionId: string;
      readonly versionNumber: number;
      readonly conflictToken: number;
      readonly warnings: readonly ListeningAuthoringIssue[];
    }
  | {
      readonly status: 'blocked';
      readonly draftId: string;
      readonly blockers: readonly ListeningAuthoringIssue[];
      readonly warnings: readonly ListeningAuthoringIssue[];
    }
  | {
      readonly status: 'conflict';
      readonly recoverable: true;
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly currentConflictToken: number;
    }
  | {
      readonly status: 'idempotency-conflict';
      readonly recoverable: false;
    };

export interface CreateListeningRevisionDraftResult {
  readonly status: 'saved';
  readonly draftId: string;
  readonly conflictToken: number;
  readonly createdFromVersionId: string;
  readonly createdFromVersionNumber: number;
}

export interface ListeningLegacyFreezeMetadata {
  readonly frozen: true;
  readonly versionId: string;
  readonly versionNumber: 1;
  readonly frozenAt: number;
  readonly frozenBy: string;
  readonly decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20';
}

export interface CreateListeningLegacyRevisionDraftResult {
  readonly status: 'saved';
  readonly versionId: string;
  readonly draftId: string;
  readonly versionNumber: 1;
  readonly conflictToken: number;
  readonly freezeMetadata: ListeningLegacyFreezeMetadata;
}
