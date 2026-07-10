export const BOOK_ACTIVITY_SCHEMA_VERSION = 1 as const;

export const BOOK_ACTIVITY_INTERACTION_FAMILIES = [
  'choice',
  'text-entry',
  'matching',
  'ordering',
  'long-response',
] as const;

export type BookActivityInteractionFamily =
  (typeof BOOK_ACTIVITY_INTERACTION_FAMILIES)[number];

export const BOOK_ACTIVITY_PRESENTATION_MODES = [
  'structured',
  'source-assisted',
] as const;

export type BookActivityPresentationMode =
  (typeof BOOK_ACTIVITY_PRESENTATION_MODES)[number];

export const BOOK_ACTIVITY_CONTEXT_REQUIREMENTS = [
  'none',
  'optional',
  'required',
] as const;

export type BookActivityContextRequirement =
  (typeof BOOK_ACTIVITY_CONTEXT_REQUIREMENTS)[number];

export type BookActivityAnswerRuleType =
  | 'single-choice'
  | 'multiple-choice'
  | 'text-exact'
  | 'matching'
  | 'ordering'
  | 'rubric';

export interface BookActivityTaskProfile {
  readonly taxonomyId: string;
  readonly typeId: string;
  readonly taxonomyVersion: string;
}

export interface BookActivitySourceAssistedMetadata {
  readonly questionLabel: string;
  readonly accessiblePrompt: string;
  readonly responseShape: string;
  readonly sourceExerciseLabel?: string;
  readonly sourcePartLabel?: string;
}

export interface BookActivityEditableInteraction {
  readonly family: BookActivityInteractionFamily;
  readonly prompt: string;
  readonly choices?: readonly string[];
  readonly pairs?: readonly {
    readonly left: string;
    readonly right: string;
  }[];
  readonly orderingItems?: readonly string[];
  readonly responseShape?: string;
  readonly source?: BookActivitySourceAssistedMetadata;
}

export interface BookActivityEditableAnswerRule {
  readonly type: BookActivityAnswerRuleType;
  readonly correctChoiceIndexes?: readonly number[];
  readonly acceptableAnswers?: readonly string[];
  readonly matchingPairs?: readonly {
    readonly left: string;
    readonly right: string;
  }[];
  readonly ordering?: readonly string[];
  readonly rubric?: string;
}

export interface BookActivityScoringConfig {
  readonly points: number;
  readonly rubric?: string;
}

export interface BookActivityEmbeddedStimulus {
  readonly kind: 'text' | 'image-ref' | 'audio-ref';
  readonly content: string;
  readonly altText?: string;
}

export interface BookActivityEditableJson {
  readonly schemaVersion: typeof BOOK_ACTIVITY_SCHEMA_VERSION;
  readonly title: string;
  readonly taskProfile?: BookActivityTaskProfile | null;
  readonly presentationMode: BookActivityPresentationMode;
  readonly contextRequirement: BookActivityContextRequirement;
  readonly instructions?: string;
  readonly stimulus?: BookActivityEmbeddedStimulus | null;
  readonly assetRefs?: readonly string[];
  readonly interactions: readonly BookActivityEditableInteraction[];
  readonly answerRule: BookActivityEditableAnswerRule;
  readonly scoring?: BookActivityScoringConfig;
  readonly teacherNotes?: string;
}

export interface BookActivityInteractionRecord
  extends BookActivityEditableInteraction {
  readonly hiddenInteractionId: string;
}

export interface BookActivityNormalizedContent
  extends Omit<BookActivityEditableJson, 'interactions'> {
  readonly interactions: readonly BookActivityInteractionRecord[];
}

export interface BookActivityMaterialRecord {
  readonly activityId: string;
  readonly materialId: string;
  readonly materialKind: 'interactive-activity';
  readonly ownerId: string;
  readonly title: string;
  readonly lifecycleState: 'draft' | 'published' | 'archived';
  readonly currentDraftId?: string;
  readonly currentVersionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly provenance?: {
    readonly createdBy: string;
    readonly source: 'manual' | 'import';
  };
}

export interface BookActivityCandidateRecord {
  readonly candidateId: string;
  readonly targetActivityId: string;
  readonly ownerId: string;
  readonly replacementContent: unknown;
  readonly status: 'valid' | 'invalid';
  readonly errors: readonly string[];
  readonly normalizedContent?: BookActivityEditableJson;
  readonly createdAt: string;
}

export interface BookActivityDraftRecord {
  readonly activityId: string;
  readonly draftId: string;
  readonly ownerId: string;
  readonly editableContent: BookActivityEditableJson;
  readonly normalizedContent: BookActivityNormalizedContent;
  readonly baseVersionId?: string;
  readonly draftRevision: number;
  readonly validationState: 'valid';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BookActivityVersionRecord {
  readonly activityId: string;
  readonly versionId: string;
  readonly ownerId: string;
  readonly materialKind: 'interactive-activity';
  readonly content: BookActivityNormalizedContent;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

export interface BookActivityStudentSafeInteraction {
  readonly clientInteractionKey: string;
  readonly family: BookActivityInteractionFamily;
  readonly prompt: string;
  readonly choices?: readonly string[];
  readonly pairs?: readonly {
    readonly left: string;
  }[];
  readonly orderingItems?: readonly string[];
  readonly responseShape?: string;
  readonly source?: BookActivitySourceAssistedMetadata;
}

export interface BookActivityStudentSafeProjection {
  readonly projectionKind: 'student-safe';
  readonly activityId: string;
  readonly versionId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly presentationMode: BookActivityPresentationMode;
  readonly contextRequirement: BookActivityContextRequirement;
  readonly instructions?: string;
  readonly stimulus?: BookActivityEmbeddedStimulus | null;
  readonly interactions: readonly BookActivityStudentSafeInteraction[];
  readonly generatedAt: string;
}

export type BookActivityChangeClassification =
  | 'no-redo'
  | 'recalculate-no-redo'
  | 'regrade-no-redo'
  | 'teacher-regrade-no-redo'
  | 'redo-required';
