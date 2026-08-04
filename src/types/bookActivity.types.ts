export const ACTIVITY_SCHEMA_VERSION = 1 as const;
export const ACTIVITY_INTERACTION_FAMILIES = [
  'choice',
  'text-entry',
  'matching',
  'ordering',
  'long-response',
] as const;
export const ACTIVITY_PRESENTATION_MODES = ['structured', 'source-assisted'] as const;
export const ACTIVITY_CONTEXT_MODES = ['none', 'optional', 'required'] as const;

export type ActivityInteractionFamily = (typeof ACTIVITY_INTERACTION_FAMILIES)[number];
export type ActivityPresentationMode = (typeof ACTIVITY_PRESENTATION_MODES)[number];
export type ActivityContextMode = (typeof ACTIVITY_CONTEXT_MODES)[number];
export type ActivityNormalization = 'exact' | 'trim-case-and-spacing';

export interface ActivityTaskProfile {
  taxonomyId: string;
  typeId: string;
  taxonomyVersion: number;
}

export interface ActivityTaskProfileRegistration extends ActivityTaskProfile {
  interactionFamilies: readonly ActivityInteractionFamily[];
  variants?: readonly string[];
  presentationModes: readonly ActivityPresentationMode[];
  contextModes: readonly ActivityContextMode[];
}

export interface ActivityContextRequirement {
  mode: ActivityContextMode;
  acceptedKinds: string[];
}

export interface ActivitySourceAssistedMetadata {
  questionLabel: string;
  accessiblePrompt: string;
  responseShape: string;
  sourceExerciseLabel?: string;
  sourcePartLabel?: string;
}

export interface ActivityPair {
  left: string;
  right: string;
}

interface ActivityInteractionFieldSet {
  prompt: string;
  feedback?: string;
  points?: number;
  sourceAssisted?: ActivitySourceAssistedMetadata;
  options?: string[];
  acceptedOptionIndexes?: number[];
  acceptedAnswers?: string[];
  leftItems?: string[];
  rightItems?: string[];
  acceptedPairs?: ActivityPair[];
  orderingItems?: string[];
  acceptedOrder?: number[];
  rubric?: { criteria: string[] };
}

export type ActivityInteractionFor<
  Family extends ActivityInteractionFamily,
> = ActivityInteractionFieldSet & (
  Family extends 'choice'
    ? {
      options: string[];
      acceptedOptionIndexes: number[];
      acceptedAnswers?: never;
      leftItems?: never;
      rightItems?: never;
      acceptedPairs?: never;
      orderingItems?: never;
      acceptedOrder?: never;
      rubric?: never;
    }
    : Family extends 'text-entry'
      ? {
        options?: never;
        acceptedOptionIndexes?: never;
        acceptedAnswers: string[];
        leftItems?: never;
        rightItems?: never;
        acceptedPairs?: never;
        orderingItems?: never;
        acceptedOrder?: never;
        rubric?: never;
      }
      : Family extends 'matching'
        ? {
          options?: never;
          acceptedOptionIndexes?: never;
          acceptedAnswers?: never;
          leftItems: string[];
          rightItems: string[];
          acceptedPairs: ActivityPair[];
          orderingItems?: never;
          acceptedOrder?: never;
          rubric?: never;
        }
        : Family extends 'ordering'
          ? {
            options?: never;
            acceptedOptionIndexes?: never;
            acceptedAnswers?: never;
            leftItems?: never;
            rightItems?: never;
            acceptedPairs?: never;
            orderingItems: string[];
            acceptedOrder: number[];
            rubric?: never;
          }
          : {
            options?: never;
            acceptedOptionIndexes?: never;
            acceptedAnswers?: never;
            leftItems?: never;
            rightItems?: never;
            acceptedPairs?: never;
            orderingItems?: never;
            acceptedOrder?: never;
            rubric: { criteria: string[] };
          }
);

export type ActivityInteraction = {
  [Family in ActivityInteractionFamily]: ActivityInteractionFor<Family>;
}[ActivityInteractionFamily];

interface ActivityAnswerRuleBase {
  defaultPoints: number;
  normalization: ActivityNormalization;
}

export type ActivityAnswerRuleFor<
  Family extends ActivityInteractionFamily,
> = ActivityAnswerRuleBase & (
  Family extends 'choice'
    ? { requiredSelectionCount?: number; allowOptionReuse?: never }
    : Family extends 'matching'
      ? { requiredSelectionCount?: never; allowOptionReuse?: boolean }
      : { requiredSelectionCount?: never; allowOptionReuse?: never }
);

interface EditableActivityBase {
  schemaVersion: typeof ACTIVITY_SCHEMA_VERSION;
  title: string;
  taskProfile?: ActivityTaskProfile | null;
  presentationMode: ActivityPresentationMode;
  contextRequirement: ActivityContextRequirement;
  instructions: { text: string }[];
  stimulus: { kind: string; text?: string } | null;
  assetRefs: { kind: 'image' | 'audio'; assetId: string }[];
}

export type EditableActivityFor<
  Family extends ActivityInteractionFamily,
> = EditableActivityBase & {
  interaction: { family: Family; variant: string };
  answerRule: ActivityAnswerRuleFor<Family>;
  interactions: ActivityInteractionFor<Family>[];
  scoring: {
    mode: Family extends 'long-response'
      ? 'review-required'
      : 'auto-where-possible' | 'review-required';
  };
};

export type EditableActivity = {
  [Family in ActivityInteractionFamily]: EditableActivityFor<Family>;
}[ActivityInteractionFamily];

export type ActivityItemIdentities =
  | { family: 'choice'; optionIds: string[] }
  | { family: 'text-entry'; itemIds: [] }
  | { family: 'matching'; leftItemIds: string[]; rightItemIds: string[] }
  | { family: 'ordering'; itemIds: string[] }
  | { family: 'long-response'; itemIds: [] };

export type ActivityNormalizedAnswerKey =
  | { family: 'choice'; acceptedOptionItemIds: string[] }
  | { family: 'text-entry'; acceptedAnswers: string[] }
  | {
    family: 'matching';
    acceptedPairs: Array<{ leftItemId: string; rightItemId: string }>;
  }
  | { family: 'ordering'; acceptedOrderItemIds: string[] }
  | { family: 'long-response'; rubric: { criteria: string[] } };

export type ActivityItemIdentitiesFor<
  Family extends ActivityInteractionFamily,
> = Extract<ActivityItemIdentities, { family: Family }>;

export type ActivityNormalizedAnswerKeyFor<
  Family extends ActivityInteractionFamily,
> = Extract<ActivityNormalizedAnswerKey, { family: Family }>;

export type NormalizedActivityInteractionFor<
  Family extends ActivityInteractionFamily,
> = Omit<
  ActivityInteractionFor<Family>,
  'acceptedOptionIndexes' | 'acceptedAnswers' | 'acceptedPairs' | 'acceptedOrder' | 'rubric'
> & {
  family: Family;
  interactionId: string;
  itemIdentities: ActivityItemIdentitiesFor<Family>;
  answerKey: ActivityNormalizedAnswerKeyFor<Family>;
};

export type NormalizedActivityInteraction = {
  [Family in ActivityInteractionFamily]: NormalizedActivityInteractionFor<Family>;
}[ActivityInteractionFamily];

export type NormalizedActivityFor<
  Family extends ActivityInteractionFamily,
> = Omit<EditableActivityFor<Family>, 'interactions'> & {
  interactions: NormalizedActivityInteractionFor<Family>[];
};

export type NormalizedActivity = {
  [Family in ActivityInteractionFamily]: NormalizedActivityFor<Family>;
}[ActivityInteractionFamily];

export interface ActivityValidationError {
  code: string;
  path: string;
  message: string;
}

export type ActivityValidationResult =
  | {
      valid: true;
      errors: ActivityValidationError[];
      value: EditableActivity;
    }
  | {
      valid: false;
      errors: ActivityValidationError[];
      value?: never;
    };

export interface ActivityValidationContext {
  /**
   * Trusted opaque references supplied by Book Assembly. They prove that a
   * Placement/Page Group binding exists without copying Book page identity
   * into editable or normalized Activity JSON.
   */
  mappedBookPageRefs?: readonly string[];
  /** Trusted registry supplied by Activity Domain composition, never editable JSON. */
  taskProfileRegistry?: readonly ActivityTaskProfileRegistration[];
}

export interface ActivityIdProvider {
  createId(): string;
}

export type ActivityDiffClass =
  | 'unchanged'
  | 'display-only'
  | 'regrade'
  | 'redo-required'
  | 'added'
  | 'removed'
  | 'reordered'
  | 'presentation-context'
  | 'unsupported';

export type ActivityDiff =
  | {
    classification: 'redo-required' | 'reordered' | 'unsupported';
    reasons: string[];
    requiresRedo: true;
  }
  | {
    classification: Exclude<
      ActivityDiffClass,
      'redo-required' | 'reordered' | 'unsupported'
    >;
    reasons: string[];
    requiresRedo: false;
  };

export type ActivityFeedbackVisibility = 'none' | 'after-submit' | 'after-review';

interface StudentActivityInteractionBase {
  interactionId: string;
  prompt: string;
  sourceAssisted?: ActivitySourceAssistedMetadata;
}

export type StudentActivityInteraction =
  | (StudentActivityInteractionBase & {
    family: 'choice';
    options: Array<{ itemId: string; label: string }>;
  })
  | (StudentActivityInteractionBase & { family: 'text-entry' })
  | (StudentActivityInteractionBase & {
    family: 'matching';
    leftItems: Array<{ itemId: string; label: string }>;
    rightItems: Array<{ itemId: string; label: string }>;
  })
  | (StudentActivityInteractionBase & {
    family: 'ordering';
    items: Array<{ itemId: string; label: string }>;
  })
  | (StudentActivityInteractionBase & { family: 'long-response' });

interface StudentActivityProjectionBase {
  schemaVersion: number;
  title: string;
  taskProfile: ActivityTaskProfile | null;
  presentationMode: ActivityPresentationMode;
  contextRequirement: ActivityContextRequirement;
  instructions: { text: string }[];
  stimulus: EditableActivity['stimulus'];
  assetRefs: EditableActivity['assetRefs'];
}

export type StudentActivityProjectionFor<
  Family extends ActivityInteractionFamily,
> = StudentActivityProjectionBase & {
  interaction: { family: Family; variant: string };
  answerRule: ActivityAnswerRuleFor<Family>;
  interactions: Extract<StudentActivityInteraction, { family: Family }>[];
  scoring: {
    mode: EditableActivityFor<Family>['scoring']['mode'];
    feedbackVisibility: ActivityFeedbackVisibility;
  };
};

export type StudentActivityProjection = {
  [Family in ActivityInteractionFamily]: StudentActivityProjectionFor<Family>;
}[ActivityInteractionFamily];

export type ActivitySubmissionAnswer =
  | null
  | string
  | string[]
  | Array<{ leftItemId: string; rightItemId: string }>;
export interface ActivitySubmissionEntry {
  interactionId: string;
  answer: ActivitySubmissionAnswer;
}
export type ActivitySubmission = ActivitySubmissionEntry[];

export type ActivityScoreResult =
  | {
    status: 'scored';
    earnedScore: number;
    maximumScore: number;
    displayScore: string;
  }
  | { status: 'review_required' }
  | { status: 'invalid'; errors: string[] };
