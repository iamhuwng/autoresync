import {
  LISTENING_AUTHORING_OPERATION_TYPES,
  LISTENING_AUTHORING_SCHEMA_VERSION,
} from './constants';

export type ListeningAuthoringOperationType =
  typeof LISTENING_AUTHORING_OPERATION_TYPES[number];

export type ListeningLifecycleOperationType =
  Extract<ListeningAuthoringOperationType, 'soft-delete' | 'restore' | 'archive' | 'discard'>;

export type ListeningAuthoringOperationTargetType =
  | 'draft'
  | 'revision-draft'
  | 'version'
  | 'legacy-test';

export type ListeningAuthoringOperationStatus = 'pending' | 'succeeded' | 'failed';

export interface ListeningAuthoringOperationResult {
  draftId?: string;
  versionId?: string;
  versionNumber?: number;
  conflictToken?: number;
}

export interface ListeningAuthoringAuthContext {
  uid: string;
  role: 'teacher' | 'super_admin';
}

export type ListeningAuthoringDocumentType = 'IELTS' | 'TOEFL' | 'Custom';
export type ListeningAuthoringDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type ListeningAuthoringDisplayMode = 'text' | 'image';
export type ListeningAuthoringShowResultsMode = 'immediate' | 'after-submission' | 'never';
export type ListeningAuthoringQuestionAnswer =
  | string
  | readonly string[]
  | Record<string, string>;

export interface ListeningAuthoringMetadataV1 {
  description: string;
  instructions: string;
  tags: readonly string[];
  targetBand?: string;
  estimatedScore?: string;
  transcript?: string;
}

export interface ListeningAuthoringAudioSectionV1 {
  number: number;
  name: string;
  assetId?: string;
  audioUrl: string;
  streamUrl?: string;
  startQuestion: number;
  endQuestion: number;
  playLimit?: number;
  waitTimeBefore?: number;
}

export interface ListeningAuthoringQuestionImageRangeV1 {
  start?: number;
  end?: number;
}

export interface ListeningAuthoringQuestionImageV1 {
  sectionNumber: number;
  imageUrl: string;
  imageCaption?: string;
  questionRange?: ListeningAuthoringQuestionImageRangeV1;
}

export interface ListeningAuthoringQuestionContextV1 {
  sectionHeading?: string;
  subsectionLabel?: string;
  contextLines?: readonly string[];
  currentLineIndex?: number;
}

export interface ListeningAuthoringQuestionV1 {
  number: number;
  type: string;
  question: string;
  options?: readonly string[];
  answer: ListeningAuthoringQuestionAnswer;
  sectionNumber: number;
  points: number;
  explanation?: string;
  acceptableAnswers?: readonly string[];
  imageUrl?: string;
  context?: ListeningAuthoringQuestionContextV1;
}

export interface ListeningAuthoringAudioControlsV1 {
  showPlayPause: boolean;
  showProgressBar: boolean;
  showSeekControl: boolean;
  showSpeedControl: boolean;
  showSkipSection: boolean;
  showVolumeControl: boolean;
}

export interface ListeningAuthoringSettingsV1 {
  allowPause: boolean;
  showTimer: boolean;
  shuffleQuestions: boolean;
  showResults: ListeningAuthoringShowResultsMode;
  allowReview: boolean;
  passingScore: number;
  allowReplay: boolean;
  maxReplays?: number;
  audioControls?: ListeningAuthoringAudioControlsV1;
}

export interface ListeningAuthoringStatisticsV1 {
  attempts: number;
  averageScore: number;
  averageTime: number;
  completionRate: number;
}

export interface ListeningAuthoringDocumentV1 {
  title: string;
  type: ListeningAuthoringDocumentType;
  skill: 'Listening';
  duration: number;
  difficulty: ListeningAuthoringDifficulty;
  questionCount: number;
  isPublic: boolean;
  isComplete: boolean;
  missingAnswerCount?: number;
  displayMode: ListeningAuthoringDisplayMode;
  metadata: ListeningAuthoringMetadataV1;
  audioSections: readonly ListeningAuthoringAudioSectionV1[];
  questionImages?: readonly ListeningAuthoringQuestionImageV1[];
  questions: readonly ListeningAuthoringQuestionV1[];
  settings: ListeningAuthoringSettingsV1;
  statistics?: ListeningAuthoringStatisticsV1;
}

export interface SaveListeningDraftRequest {
  idempotencyKey: string;
  document: ListeningAuthoringDocumentV1;
  draftId?: string;
  expectedConflictToken?: number;
  trigger?: 'explicit' | 'autosave';
}

export interface PublishListeningDraftFromDraftRequest {
  draftId: string;
  expectedConflictToken: number;
  idempotencyKey: string;
  retainedPins?: Record<string, readonly string[]>;
}

export interface PublishListeningLegacyFirstEditRequest {
  legacyTestId: string;
  idempotencyKey: string;
}

export type PublishListeningDraftRequest =
  | PublishListeningDraftFromDraftRequest
  | PublishListeningLegacyFirstEditRequest;

export interface ListeningLifecycleRequest {
  operation: ListeningLifecycleOperationType;
  targetId: string;
  expectedConflictToken?: number;
  idempotencyKey: string;
  reasonCode?: string;
}

export interface ListeningAuthoringOperationRecord<
  T extends ListeningAuthoringOperationResult = ListeningAuthoringOperationResult,
> {
  schemaVersion: typeof LISTENING_AUTHORING_SCHEMA_VERSION;
  operationId: string;
  operationType: ListeningAuthoringOperationType;
  targetType: ListeningAuthoringOperationTargetType;
  targetId: string;
  ownerId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  expectedConflictToken?: number;
  status: ListeningAuthoringOperationStatus;
  result?: T;
  errorCode?: string;
  createdAt: number;
  completedAt?: number;
  expiresAt: number;
}
