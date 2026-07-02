/**
 * Listening Test Builder
 * Create IELTS Listening tests with audio files and questions
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  IconCheck,
  IconFileText,
  IconHeadphones,
  IconInfoCircle,
  IconListCheck,
  IconPhoto,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useLocation } from 'react-router-dom';
import { Button, toast } from '../../../components/modern';
import {
  AUDIO_CONTROLS_PRESETS,
} from '../../../services/listeningTestStorage';
import type {
  AudioSection as StorageAudioSection,
  ListeningDisplayMode,
  QuestionImage,
  AudioControlsConfig,
} from '../../../services/listeningTestStorage';
import { googleDriveAudioService } from '../../../services/googleDriveAudio';
import r2StorageService from '../../../services/r2Storage';
import type { ParsedQuestion } from '../../../types/document.types';
import { listeningRouter } from '../../../services/parser/listening.router';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { useNavigation } from '../../../hooks/useNavigation';
import { useAppLifecycle } from '../../../core/platform/hooks/useAppLifecycle';
import { FEATURE_IDS } from '../../../config/featureRegistry';
import {
  validateListeningDraft,
  validateListeningPublish,
} from '../../../features/assessment/listening/authoring/listeningAuthoringValidation';
import { createListeningAuthoringWorkflow } from '../../../features/assessment/listening/authoring/listeningAuthoringWorkflow';
import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringIssue,
} from '../../../features/assessment/listening/types/listeningAuthoring.types';
import { AssessmentAuthoringHeader } from '../../../features/assessment/shared/components/AssessmentAuthoringHeader';
import { AssessmentAuthoringSection } from '../../../features/assessment/shared/components/AssessmentAuthoringSection';
import { AssessmentStatusState } from '../../../features/assessment/shared/components/AssessmentStatusState';
import { ListeningDraftStatus, type ListeningDraftStatusMode } from '../../../features/assessment/listening/authoring/ListeningDraftStatus';
import { ListeningPublishReadinessPanel, type ListeningPublishReadinessMode } from '../../../features/assessment/listening/authoring/ListeningPublishReadinessPanel';
import { ListeningSavePublishBar } from '../../../features/assessment/listening/authoring/ListeningSavePublishBar';
import {
  ListeningLifecycleActions,
  type ListeningLifecyclePendingAction,
} from '../../../features/assessment/listening/authoring/ListeningLifecycleActions';
import { ListeningUploadGuidance } from '../../../features/assessment/listening/authoring/ListeningUploadGuidance';
import { validateListeningPublishReadiness } from '../../../features/assessment/listening/authoring/listeningPublishReadiness';
import {
  announceListeningDraftDiscarded,
  announceListeningDraftConflict,
  announceListeningDraftFailed,
  announceListeningDraftRestored,
  announceListeningDraftSaved,
  announceListeningDuplicateAction,
  announceListeningPublishBlocked,
  announceListeningPublishFailed,
  announceListeningPublishSucceeded,
  announceListeningPublishedArchive,
} from '../../../features/assessment/listening/authoring/listeningAuthoringAnnouncements';
import { listeningMakerStyles, listeningMakerTokens } from './listeningTestMakerTheme';

// Test types
type TestType = 'IELTS' | 'TOEFL' | 'Custom';
type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

interface AudioSection {
  number: number;
  name: string;
  audioUrl: string;
  streamUrl?: string; // Direct stream URL for audio player preview
  assetId?: string;
  uploadSessionId?: string;
  tempKey?: string;
  checksum?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
  startQuestion: number;
  endQuestion: number;
  playLimit?: number; // How many times can replay (undefined = unlimited)
  waitTimeBefore?: number; // Seconds of wait time before section
  uploadProgress?: number; // Upload progress 0-100
  uploadETA?: number; // Estimated time remaining in seconds
}

interface ListeningTestMetadata {
  title: string;
  type: TestType;
  skill: 'Listening';
  duration: number;
  difficulty: Difficulty;
  description: string;
  tags: string[];
  targetBand?: string;
  sections: AudioSection[];
  totalQuestions: number;
  transcript?: string;
}

type ListeningTempCleanupTarget = {
  sectionNumber: number;
  uploadSessionId: string;
  assetId: string;
};

export type ListeningBuilderStep = 'mode-select' | 'audio' | 'questions-text' | 'questions-images' | 'questions' | 'review';

export interface ListeningBuilderHeaderState {
  title: string;
  subtitle: string;
  step: ListeningBuilderStep;
  displayMode: ListeningDisplayMode;
}

interface ListeningBuilderRouteState {
  entryPoint?: string;
  metadata?: Partial<ListeningTestMetadata>;
  initialDisplayMode?: ListeningDisplayMode;
  initialStep?: ListeningBuilderStep;
}

interface ListeningTestBuilderProps {
  presentation?: 'page' | 'embedded';
  initialMetadata?: Partial<ListeningTestMetadata>;
  initialDisplayMode?: ListeningDisplayMode;
  initialStep?: ListeningBuilderStep;
  onExit?: () => void;
  onPublished?: () => void;
  onDirtyChange?: (hasUnsavedChanges: boolean) => void;
  onHeaderChange?: (header: ListeningBuilderHeaderState) => void;
  onHeaderActionsChange?: (actions: React.ReactNode | null) => void;
}

const LISTENING_BUILDER_STEPS: ListeningBuilderStep[] = [
  'mode-select',
  'audio',
  'questions-text',
  'questions-images',
  'questions',
  'review',
];

const resolveInitialDisplayMode = (value: unknown): ListeningDisplayMode =>
  value === 'image' ? 'image' : 'text';

const resolveInitialBuilderStep = (value: unknown): ListeningBuilderStep =>
  LISTENING_BUILDER_STEPS.includes(value as ListeningBuilderStep)
    ? value as ListeningBuilderStep
    : 'mode-select';

const createDefaultSection = (): AudioSection => (
  { number: 1, name: 'Section 1', audioUrl: '', startQuestion: 1, endQuestion: 10, waitTimeBefore: 0 }
);

const createDefaultSections = (): AudioSection[] => [
  { number: 1, name: 'Section 1', audioUrl: '', startQuestion: 1, endQuestion: 10, waitTimeBefore: 0 },
];

const buildInitialListeningMetadata = (passedMetadata?: any): ListeningTestMetadata => {
  const defaultSections = createDefaultSections();

  if (passedMetadata) {
    return {
      title: passedMetadata.title || '',
      type: (passedMetadata.type as TestType) || 'IELTS',
      skill: 'Listening',
      duration: passedMetadata.duration || 30,
      difficulty: (passedMetadata.difficulty as Difficulty) || 'Intermediate',
      description: passedMetadata.description || '',
      tags: passedMetadata.tags || [],
      targetBand: passedMetadata.targetBand || '',
      sections: defaultSections,
      totalQuestions: 10,
      transcript: '',
    };
  }

  return {
    title: '',
    type: 'IELTS',
    skill: 'Listening',
    duration: 30,
    difficulty: 'Intermediate',
    description: '',
    tags: [],
    sections: defaultSections,
    totalQuestions: 10,
    transcript: '',
  };
};

const createListeningActionIdempotencyKey = (
  action: 'saveDraft' | 'publish' | 'discard' | 'restore' | 'archive',
) =>
  `listening-builder-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createListeningUploadAttemptId = (sectionNumber: number) =>
  `listening-builder-upload-${sectionNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isListeningAuthoringIssue = (value: unknown): value is ListeningAuthoringIssue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const issue = value as Record<string, unknown>;
  return typeof issue.field === 'string'
    && (issue.severity === 'warning' || issue.severity === 'blocker')
    && typeof issue.guidance === 'string';
};

const normalizeAuthoringIssues = (
  issues: readonly unknown[],
  severity: ListeningAuthoringIssue['severity'],
  fallbackField: string,
  fallbackGuidance: string,
): ListeningAuthoringIssue[] => issues.map((issue) => {
  if (isListeningAuthoringIssue(issue)) return issue;
  if (typeof issue === 'string' && issue.trim()) {
    return {
      field: fallbackField,
      severity,
      guidance: issue,
    };
  }
  return {
    field: fallbackField,
    severity,
    guidance: fallbackGuidance,
  };
});

type ListeningBuilderNavKind = 'mode' | 'audio' | 'parse' | 'images' | 'questions' | 'review';

const ListeningBuilderNavIcon: React.FC<{ kind: ListeningBuilderNavKind }> = ({ kind }) => {
  const iconProps = { size: 15, stroke: 1.8, 'aria-hidden': true } as const;
  switch (kind) {
    case 'mode':
      return <IconSettings {...iconProps} />;
    case 'audio':
      return <IconHeadphones {...iconProps} />;
    case 'parse':
      return <IconSparkles {...iconProps} />;
    case 'images':
      return <IconPhoto {...iconProps} />;
    case 'questions':
      return <IconListCheck {...iconProps} />;
    case 'review':
      return <IconCheck {...iconProps} />;
    default:
      return null;
  }
};

const ListeningTestBuilder: React.FC<ListeningTestBuilderProps> = ({
  presentation = 'page',
  initialMetadata,
  initialDisplayMode: initialDisplayModeProp,
  initialStep: initialStepProp,
  onExit,
  onPublished,
  onDirtyChange,
  onHeaderChange,
  onHeaderActionsChange,
}) => {
  const { navigateTo } = useNavigation('teacher');
  const location = useLocation();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);

  const routeState = (location.state ?? {}) as ListeningBuilderRouteState;
  const passedMetadata = initialMetadata ?? routeState.metadata;
  const initialDisplayMode = resolveInitialDisplayMode(initialDisplayModeProp ?? routeState.initialDisplayMode);
  const initialStep = resolveInitialBuilderStep(initialStepProp ?? routeState.initialStep);
  const isEmbedded = presentation === 'embedded';

  // Form state - initialize with passed metadata if available
  const [metadata, setMetadata] = useState<ListeningTestMetadata>(() => buildInitialListeningMetadata(passedMetadata));

  // Step flow: mode-select → audio → questions → review (metadata collected in Review step)
  const [currentStep, setCurrentStep] = useState<ListeningBuilderStep>(initialStep);



  // Display mode: 'text' for IELTS-like full-width, 'image' for two-column with question images
  const [displayMode, setDisplayMode] = useState<ListeningDisplayMode>(initialDisplayMode);
  const [questionImages, setQuestionImages] = useState<QuestionImage[]>([]);
  const [activeAnswerSectionNumber, setActiveAnswerSectionNumber] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingSection, setUploadingSection] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // AI Question Parsing state
  const [questionText, setQuestionText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsingStage, setParsingStage] = useState('');
  const [bulkAnswerKey, setBulkAnswerKey] = useState('');
  const [isPublic, setIsPublic] = useState(false); // Default to private

  // Audio Controls Configuration (teacher-configurable)
  const [audioControls, setAudioControls] = useState<AudioControlsConfig>(
    AUDIO_CONTROLS_PRESETS.IELTS_STANDARD
  );
  const [allowReplay, setAllowReplay] = useState(false);
  const [maxReplays, setMaxReplays] = useState(1);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'saveDraft' | 'publish' | 'discard' | null>(null);
  const [draftStatusMode, setDraftStatusMode] = useState<ListeningDraftStatusMode>('idle');
  const [draftWarnings, setDraftWarnings] = useState<readonly ListeningAuthoringIssue[]>([]);
  const [publishBlockers, setPublishBlockers] = useState<readonly ListeningAuthoringIssue[]>([]);
  const [publishReadinessMode, setPublishReadinessMode] = useState<ListeningPublishReadinessMode>('idle');
  const [publishReadinessBlockers, setPublishReadinessBlockers] = useState<readonly ListeningAuthoringIssue[]>([]);
  const [publishReadinessCheckedSections, setPublishReadinessCheckedSections] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftConflictToken, setDraftConflictToken] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastPersistedFingerprint, setLastPersistedFingerprint] = useState<string | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<'saveDraft' | 'publish' | null>(null);
  const [discardContext, setDiscardContext] = useState<'navigation-away' | 'saved-draft' | null>(null);
  const [draftStatusMessage, setDraftStatusMessage] = useState<string | undefined>();
  const [discardedDraft, setDiscardedDraft] = useState<{
    draftId: string;
    conflictToken: number;
  } | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<{
    versionId: string;
    versionNumber: number;
  } | null>(null);
  const [isPublishedVersionArchived, setIsPublishedVersionArchived] = useState(false);
  const [lifecyclePendingAction, setLifecyclePendingAction] =
    useState<ListeningLifecyclePendingAction>(null);
  const pendingActionRef = useRef<'saveDraft' | 'publish' | 'discard' | null>(null);
  const initialFingerprintRef = useRef<string | null>(null);
  const pendingNavigationRef = useRef<null | (() => void)>(null);
  const uploadAttemptIdsRef = useRef<Record<number, string>>({});
  const uploadAbortControllersRef = useRef<Record<number, AbortController>>({});
  const createAuthoringWorkflow = () => createListeningAuthoringWorkflow({
    onObservabilityEvent: (actionName, metadata) => trackAction(actionName, metadata),
  });

  // R2 Storage is always ready (no authentication needed)
  useEffect(() => {
    // R2 doesn't need OAuth - always "authenticated"
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready (no authentication needed)');
  }, []);


  // R2 doesn't need sign-in - this is kept for UI compatibility but does nothing
  const handleGoogleSignIn = async () => {
    // R2 doesn't require authentication
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready - no sign-in needed');
  };

  // Format ETA for display
  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const clearSaveError = () => {
    setErrors((prev) => {
      if (!prev.save) return prev;
      const next = { ...prev };
      delete next.save;
      return next;
    });
  };

  const getStorageSections = (): StorageAudioSection[] => metadata.sections.map((section) => ({
    number: section.number,
    name: section.name,
    audioUrl: section.audioUrl,
    streamUrl: section.streamUrl,
    assetId: section.assetId,
    uploadSessionId: section.uploadSessionId,
    tempKey: section.tempKey,
    checksum: section.checksum,
    contentType: section.contentType,
    sizeBytes: section.sizeBytes,
    fileName: section.fileName,
    startQuestion: section.startQuestion,
    endQuestion: section.endQuestion,
    playLimit: section.playLimit,
    waitTimeBefore: section.waitTimeBefore,
  }));

  const getSectionNumberForQuestion = (questionNumber: number, sections: readonly StorageAudioSection[]) => {
    const matchedSection = sections.find((section) =>
      questionNumber >= section.startQuestion && questionNumber <= section.endQuestion,
    );
    return matchedSection?.number ?? 1;
  };

  const buildAuthoringDocument = (): ListeningAuthoringDocumentV1 => {
    const storageSections = getStorageSections();
    const audioSections: ListeningAuthoringDocumentV1['audioSections'] = storageSections.map(
      (section) => ({
        number: section.number,
        name: section.name,
        audioUrl: section.audioUrl,
        ...(section.streamUrl ? { streamUrl: section.streamUrl } : {}),
        ...(section.assetId ? { assetId: section.assetId } : {}),
        startQuestion: section.startQuestion,
        endQuestion: section.endQuestion,
        ...(section.playLimit !== undefined ? { playLimit: section.playLimit } : {}),
        ...(section.waitTimeBefore !== undefined
          ? { waitTimeBefore: section.waitTimeBefore }
          : {}),
      }),
    );
    const authoringQuestions: ListeningAuthoringDocumentV1['questions'] = questions.map(
      (question, index) => {
        const questionNumber = question.number || question.questionNumber || index + 1;
        return {
          number: questionNumber,
          type: question.type,
          question: question.question || question.questionText || '',
          options: question.options,
          answer: question.answer || '',
          sectionNumber: getSectionNumberForQuestion(questionNumber, storageSections),
          points: question.points || 1,
        };
      },
    );
    const missingAnswerCount = authoringQuestions.filter((question) => {
      if (typeof question.answer === 'string') return question.answer.trim() === '';
      if (Array.isArray(question.answer)) return question.answer.length === 0;
      return Object.keys(question.answer).length === 0;
    }).length;

    return {
      title: metadata.title,
      type: metadata.type,
      skill: 'Listening',
      duration: metadata.duration,
      difficulty: metadata.difficulty,
      questionCount: authoringQuestions.length,
      isPublic,
      isComplete: authoringQuestions.length === metadata.totalQuestions && missingAnswerCount === 0,
      ...(missingAnswerCount > 0 ? { missingAnswerCount } : {}),
      displayMode,
      metadata: {
        description: metadata.description,
        instructions: '',
        tags: metadata.tags,
        targetBand: metadata.targetBand || undefined,
        transcript: metadata.transcript || undefined,
      },
      audioSections,
      questionImages: questionImages.map((image) => ({
        sectionNumber: image.sectionNumber,
        imageUrl: image.imageUrl,
        ...(image.imageCaption ? { imageCaption: image.imageCaption } : {}),
        ...(image.questionRange ? { questionRange: image.questionRange } : {}),
      })),
      questions: authoringQuestions,
      settings: {
        allowPause: true,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'after-submission',
        allowReview: true,
        passingScore: 0,
        allowReplay,
        maxReplays: allowReplay ? maxReplays : undefined,
        audioControls,
      },
    };
  };

  const buildDraftFingerprint = (): string => JSON.stringify({
    document: buildAuthoringDocument(),
    questionImages,
    isPublic,
  });

  const beginAction = (action: 'saveDraft' | 'publish' | 'discard') => {
    pendingActionRef.current = action;
    setPendingAction(action);
  };

  const endAction = () => {
    pendingActionRef.current = null;
    setPendingAction(null);
  };

  const openDiscardConfirmation = (context: 'navigation-away' | 'saved-draft', onConfirm?: () => void) => {
    pendingNavigationRef.current = onConfirm ?? null;
    setDiscardContext(context);
    setDraftStatusMode('discard-pending');
    setDraftStatusMessage(undefined);
    setDuplicateAction(null);
  };

  const cleanupTargetForSection = (section: AudioSection): ListeningTempCleanupTarget | null => {
    if (!section.uploadSessionId || !section.assetId) return null;
    return {
      sectionNumber: section.number,
      uploadSessionId: section.uploadSessionId,
      assetId: section.assetId,
    };
  };

  const collectTempCleanupTargets = (sections: readonly AudioSection[]): ListeningTempCleanupTarget[] =>
    sections
      .map(cleanupTargetForSection)
      .filter((target): target is ListeningTempCleanupTarget => target !== null);

  const abortUploadForSection = (sectionNumber: number) => {
    const controller = uploadAbortControllersRef.current[sectionNumber];
    if (controller) {
      controller.abort();
      delete uploadAbortControllersRef.current[sectionNumber];
    }
    uploadAttemptIdsRef.current[sectionNumber] = createListeningUploadAttemptId(sectionNumber);
    if (uploadingSection === sectionNumber) {
      setUploadingSection(null);
    }
  };

  const abortAllUploads = () => {
    Object.keys(uploadAbortControllersRef.current).forEach((sectionNumber) => {
      abortUploadForSection(Number(sectionNumber));
    });
  };

  const cleanupListeningTempUploads = async (
    targets: readonly ListeningTempCleanupTarget[],
    reason: 'builder-cancel' | 'discard-draft' | 'section-removed' | 'replacement-cancelled',
  ) => {
    const uniqueTargets = Array.from(new Map(
      targets.map((target) => [`${target.uploadSessionId}:${target.assetId}`, target]),
    ).values());
    if (uniqueTargets.length === 0) return;

    const results = await Promise.allSettled(uniqueTargets.map((target) =>
      r2StorageService.cancelListeningAuthoringUpload({
        uploadSessionId: target.uploadSessionId,
        assetId: target.assetId,
        reason,
      })));
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount > 0) {
      console.warn('[listening-builder] Listening temp cleanup failed', { failedCount, reason });
    }
  };

  const handleDuplicateAction = (action: 'saveDraft' | 'publish') => {
    setDuplicateAction(action);
    setDiscardContext(null);
    setDraftStatusMode('duplicate');
    setDraftStatusMessage(undefined);
    announceListeningDuplicateAction(action === 'publish' ? 'Publish' : 'Save draft');
    trackAction('listeningDuplicateActionBlocked', {
      action,
      step: currentStep,
      draftId,
    });
  };

  const currentDraftFingerprint = buildDraftFingerprint();
  if (initialFingerprintRef.current === null) {
    initialFingerprintRef.current = currentDraftFingerprint;
  }

  const hasDraft = Boolean(draftId);
  const hasUnsavedChanges = lastPersistedFingerprint
    ? currentDraftFingerprint !== lastPersistedFingerprint
    : currentDraftFingerprint !== initialFingerprintRef.current;
  const canDiscard = !discardedDraft && (hasDraft || hasUnsavedChanges);

  useEffect(() => {
    onDirtyChange?.(canDiscard);
  }, [canDiscard, onDirtyChange]);

  useEffect(() => {
    if (!onHeaderChange) return;

    const headerByStep: Record<ListeningBuilderStep, { title: string; subtitle: string }> = {
      'mode-select': {
        title: 'Choose build method',
        subtitle: 'Choose how to add questions',
      },
      audio: {
        title: 'Audio',
        subtitle: 'Upload one file per section',
      },
      'questions-text': {
        title: 'Question text',
        subtitle: 'Paste source text, then parse questions',
      },
      'questions-images': {
        title: 'Question images',
        subtitle: 'Upload images and set question ranges',
      },
      questions: {
        title: displayMode === 'image' ? 'Answer key' : 'Questions',
        subtitle: displayMode === 'image'
          ? 'Questions are on images - set answers only'
          : 'Review and edit parsed questions',
      },
      review: {
        title: 'Review',
        subtitle: 'Confirm settings and publish',
      },
    };

    onHeaderChange({
      ...headerByStep[currentStep],
      step: currentStep,
      displayMode,
    });
  }, [currentStep, displayMode, onHeaderChange]);

  useEffect(() => {
    if (!onHeaderActionsChange) return;

    if (!isEmbedded) {
      onHeaderActionsChange(null);
      return;
    }

    const isIeltsStandard = !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay;
    const isPracticeMode = audioControls.showPlayPause && audioControls.showSpeedControl;
    const isRelaxedMode = audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay;

    onHeaderActionsChange(
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Audio playback settings"
          aria-expanded={audioSettingsOpen}
          onClick={() => setAudioSettingsOpen((isOpen) => !isOpen)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.6875rem',
            borderRadius: '999px',
            border: `1px solid ${listeningMakerTokens.line}`,
            background: audioSettingsOpen ? listeningMakerTokens.surface : listeningMakerTokens.inset,
            boxShadow: audioSettingsOpen ? listeningMakerTokens.shadowCard : 'none',
            color: audioSettingsOpen ? listeningMakerTokens.primary : listeningMakerTokens.muted,
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <IconSettings size={14} stroke={1.9} aria-hidden="true" />
          Settings
        </button>

        {audioSettingsOpen && (
          <div
            role="dialog"
            aria-label="Audio playback settings"
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.625rem)',
              right: 0,
              width: 'min(23rem, 86vw)',
              padding: '0.875rem',
              borderRadius: '0.75rem',
              border: `1px solid ${listeningMakerTokens.line2}`,
              background: listeningMakerTokens.surface,
              boxShadow: '0 18px 44px rgba(15, 23, 42, 0.18)',
              zIndex: 40,
              display: 'grid',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'grid', gap: '0.2rem' }}>
              <strong style={{ color: listeningMakerTokens.ink, fontSize: '0.875rem' }}>
                Audio playback settings
              </strong>
              <span style={{ color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                Controls shown during the student test.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setAudioControls(AUDIO_CONTROLS_PRESETS.IELTS_STANDARD);
                  setAllowReplay(false);
                }}
                style={{
                  ...listeningMakerStyles.compactButton,
                  borderColor: isIeltsStandard ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                  background: isIeltsStandard ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                  color: isIeltsStandard ? listeningMakerTokens.primary : listeningMakerTokens.body,
                }}
              >
                IELTS standard
              </button>
              <button
                type="button"
                onClick={() => {
                  setAudioControls(AUDIO_CONTROLS_PRESETS.PRACTICE_MODE);
                  setAllowReplay(true);
                  setMaxReplays(2);
                }}
                style={{
                  ...listeningMakerStyles.compactButton,
                  borderColor: isPracticeMode ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                  background: isPracticeMode ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                  color: isPracticeMode ? listeningMakerTokens.primary : listeningMakerTokens.body,
                }}
              >
                Practice mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setAudioControls(AUDIO_CONTROLS_PRESETS.RELAXED_MODE);
                  setAllowReplay(false);
                }}
                style={{
                  ...listeningMakerStyles.compactButton,
                  borderColor: isRelaxedMode ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                  background: isRelaxedMode ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                  color: isRelaxedMode ? listeningMakerTokens.primary : listeningMakerTokens.body,
                }}
              >
                Relaxed mode
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                <input
                  type="checkbox"
                  checked={audioControls.showPlayPause}
                  onChange={(e) => setAudioControls({ ...audioControls, showPlayPause: e.target.checked })}
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Pause
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                <input
                  type="checkbox"
                  checked={allowReplay}
                  onChange={(e) => setAllowReplay(e.target.checked)}
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Replay
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                <input
                  type="checkbox"
                  checked={audioControls.showSpeedControl}
                  onChange={(e) => setAudioControls({ ...audioControls, showSpeedControl: e.target.checked })}
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Speed
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                <input
                  type="checkbox"
                  checked={audioControls.showSeekControl}
                  onChange={(e) => setAudioControls({ ...audioControls, showSeekControl: e.target.checked })}
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Seeking
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                <input
                  type="checkbox"
                  checked={audioControls.showSkipSection}
                  onChange={(e) => setAudioControls({ ...audioControls, showSkipSection: e.target.checked })}
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Skip section
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: listeningMakerTokens.muted }}>
                <input
                  type="checkbox"
                  checked={audioControls.showVolumeControl}
                  disabled
                  style={{ width: '0.95rem', height: '0.95rem', accentColor: listeningMakerTokens.primary }}
                />
                Volume
              </label>
            </div>

            {allowReplay && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: listeningMakerTokens.body }}>
                Max replays
                <select
                  value={maxReplays}
                  onChange={(e) => setMaxReplays(parseInt(e.target.value))}
                  style={{
                    padding: '0.35rem 0.625rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${listeningMakerTokens.line2}`,
                    fontSize: '0.75rem',
                    background: listeningMakerTokens.surface,
                    color: listeningMakerTokens.ink,
                  }}
                >
                  <option value={1}>1 time</option>
                  <option value={2}>2 times</option>
                  <option value={3}>3 times</option>
                  <option value={5}>5 times</option>
                  <option value={999}>Unlimited</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    );
  }, [
    allowReplay,
    audioControls,
    audioSettingsOpen,
    isEmbedded,
    maxReplays,
    onHeaderActionsChange,
  ]);

  useEffect(() => {
    if (pendingActionRef.current) return;
    if (
      draftStatusMode === 'idle'
      || draftStatusMode === 'conflict'
      || draftStatusMode === 'discard-pending'
      || draftStatusMode === 'publish-blocked'
      || draftStatusMode === 'draft-error'
      || draftStatusMode === 'publish-error'
    ) {
      return;
    }
    if (hasUnsavedChanges) {
      setDraftStatusMode('idle');
      setPublishReadinessMode('idle');
      setPublishReadinessBlockers([]);
      setPublishReadinessCheckedSections(0);
    }
  }, [draftStatusMode, hasUnsavedChanges]);

  useAppLifecycle({
    onBeforeUnload: () => {
      if (!canDiscard) return undefined;
      return 'You have unsaved listening draft changes. Save draft or discard before leaving.';
    },
  });

  // Handle audio file upload (Step 2 - only after authenticated)
  const handleAudioUpload = async (sectionNumber: number, file: File) => {
    if (!isAuthenticated) {
      setErrors({ ...errors, [`section${sectionNumber}`]: 'Please sign in to Google first.' });
      return;
    }

    // PRD-0018 Task 8.2: Audio format validation
    const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
    const ALLOWED_MIMETYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg'];
    const MAX_SIZE_WARNING_MB = 50;

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const mimeType = file.type;

    // Check extension
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      setErrors({
        ...errors,
        [`section${sectionNumber}`]: `Unsupported audio format: ${fileExtension}. Please use MP3, WAV, M4A, AAC, or OGG.`
      });
      return;
    }

    // Check MIME type (more lenient - some browsers report differently)
    if (mimeType && !ALLOWED_MIMETYPES.some((allowed) => {
      const allowedSubtype = allowed.split('/')[1] ?? allowed;
      return mimeType.includes(allowedSubtype);
    })) {
      console.warn(`⚠️ Unexpected MIME type: ${mimeType} for ${fileName}. Proceeding based on extension.`);
    }

    // Warn about large files
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_SIZE_WARNING_MB) {
      const proceed = window.confirm(
        `This file is ${fileSizeMB.toFixed(1)}MB which may take a while to upload. Continue?`
      );
      if (!proceed) return;
    }

    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[`section${sectionNumber}`];
      return nextErrors;
    });
    setUploadingSection(sectionNumber);
    const uploadAttemptId = createListeningUploadAttemptId(sectionNumber);
    abortUploadForSection(sectionNumber);
    uploadAttemptIdsRef.current[sectionNumber] = uploadAttemptId;
    const uploadAbortController = new AbortController();
    uploadAbortControllersRef.current[sectionNumber] = uploadAbortController;
    const previousCleanupTarget = cleanupTargetForSection(
      metadata.sections.find((section) => section.number === sectionNumber) ?? createDefaultSection(),
    );
    const startTime = Date.now();

    updateSectionForUploadAttempt(sectionNumber, uploadAttemptId, {
      uploadProgress: 0,
      uploadETA: 0,
    });

    try {
      console.log(`📤 Uploading audio for Section ${sectionNumber} to R2...`);

      const result = await r2StorageService.uploadListeningAuthoringAudio(
        file,
        {
          sessionIdempotencyKey: `${uploadAttemptId}-session`,
          assetIdempotencyKey: `${uploadAttemptId}-asset`,
          ...(draftId ? { draftId } : {}),
        },
        (percent: number, bytesUploaded: number, totalBytes: number) => {
          updateSectionForUploadAttempt(sectionNumber, uploadAttemptId, {
            uploadProgress: percent,
          });

          const elapsed = (Date.now() - startTime) / 1000; // seconds
          if (elapsed > 0 && bytesUploaded > 0) {
            const bytesPerSecond = bytesUploaded / elapsed;
            const remainingBytes = totalBytes - bytesUploaded;
            const eta = Math.ceil(remainingBytes / bytesPerSecond);
            updateSectionForUploadAttempt(sectionNumber, uploadAttemptId, {
              uploadETA: eta,
            });
          }
        },
        { signal: uploadAbortController.signal },
      );

      updateSectionForUploadAttempt(sectionNumber, uploadAttemptId, {
        audioUrl: result.url,
        streamUrl: result.streamUrl,
        assetId: result.assetId,
        uploadSessionId: result.uploadSessionId,
        tempKey: result.tempKey,
        fileName: result.fileName,
        contentType: result.contentType,
        sizeBytes: result.sizeBytes,
        uploadProgress: 100,
        uploadETA: 0,
      });

      if (previousCleanupTarget && previousCleanupTarget.assetId !== result.assetId) {
        void cleanupListeningTempUploads([previousCleanupTarget], 'replacement-cancelled');
      }

      console.log(`✅ Section ${sectionNumber} audio uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      if (uploadAttemptIdsRef.current[sectionNumber] !== uploadAttemptId) return;
      if (uploadAbortController.signal.aborted) return;
      setErrors((currentErrors) => ({
        ...currentErrors,
        [`section${sectionNumber}`]: 'Failed to upload audio file. Please try again.',
      }));
      updateSectionForUploadAttempt(sectionNumber, uploadAttemptId, {
        uploadProgress: 0,
        uploadETA: 0,
      });
      // If token expired, reset auth state
      if (String(error).includes('token') || String(error).includes('auth')) {
        setIsAuthenticated(false);
      }
    } finally {
      if (uploadAbortControllersRef.current[sectionNumber] === uploadAbortController) {
        delete uploadAbortControllersRef.current[sectionNumber];
      }
      if (uploadAttemptIdsRef.current[sectionNumber] === uploadAttemptId) {
        setUploadingSection(null);
      }
    }
  };

  // Update section data - uses functional update to avoid stale closure issues
  const updateSection = (sectionNumber: number, field: keyof AudioSection, value: any) => {
    setMetadata(prev => {
      return {
        ...prev,
        sections: prev.sections.map(s =>
          s.number === sectionNumber ? { ...s, [field]: value } : s
        ),
      };
    });
  };

  const updateSectionForUploadAttempt = (
    sectionNumber: number,
    uploadAttemptId: string,
    patch: Partial<AudioSection>,
  ) => {
    setMetadata((previous) => {
      if (uploadAttemptIdsRef.current[sectionNumber] !== uploadAttemptId) return previous;
      return {
        ...previous,
        sections: previous.sections.map((section) =>
          section.number === sectionNumber ? { ...section, ...patch } : section),
      };
    });
  };

  // Add a new section
  const addSection = () => {
    trackAction('listeningSectionAdded', {
      source: 'listening_builder',
      step: currentStep,
      sectionCount: metadata.sections.length + 1,
    });
    setMetadata(prev => {
      const lastSection = prev.sections[prev.sections.length - 1];
      const newSectionNumber = lastSection ? lastSection.number + 1 : 1;
      const newStartQuestion = lastSection ? lastSection.endQuestion + 1 : 1;
      const newEndQuestion = newStartQuestion + 9; // 10 questions per section

      const newSection: AudioSection = {
        number: newSectionNumber,
        name: `Section ${newSectionNumber}`,
        audioUrl: '',
        startQuestion: newStartQuestion,
        endQuestion: newEndQuestion,
        waitTimeBefore: 30, // Default wait time for additional sections
      };

      return {
        ...prev,
        sections: [...prev.sections, newSection],
        totalQuestions: newEndQuestion,
      };
    });
  };

  // Remove a section by number
  const removeSection = (sectionNumber: number) => {
    if (metadata.sections.length <= 1) return;
    const cleanupTarget = cleanupTargetForSection(
      metadata.sections.find((section) => section.number === sectionNumber) ?? createDefaultSection(),
    );
    abortUploadForSection(sectionNumber);
    if (cleanupTarget) {
      void cleanupListeningTempUploads([cleanupTarget], 'section-removed');
    }

    trackAction('listeningSectionRemoved', {
      source: 'listening_builder',
      step: currentStep,
      sectionNumber,
      sectionCount: metadata.sections.length - 1,
    });
    setQuestionImages(prev => prev
      .filter(image => image.sectionNumber !== sectionNumber)
      .map(image => image.sectionNumber > sectionNumber
        ? { ...image, sectionNumber: image.sectionNumber - 1 }
        : image));
    setActiveAnswerSectionNumber((current) => {
      if (current === sectionNumber) return Math.max(1, sectionNumber - 1);
      if (current > sectionNumber) return current - 1;
      return current;
    });

    setMetadata(prev => {
      if (prev.sections.length <= 1) {
        // Don't allow removing the last section
        return prev;
      }

      const filteredSections = prev.sections.filter(s => s.number !== sectionNumber);

      // Renumber remaining sections and recalculate question ranges
      let questionCounter = 1;
      const renumberedSections = filteredSections.map((section, index) => {
        const startQuestion = questionCounter;
        const endQuestion = questionCounter + 9; // 10 questions per section
        questionCounter = endQuestion + 1;

        return {
          ...section,
          number: index + 1,
          name: `Section ${index + 1}`,
          startQuestion,
          endQuestion,
        };
      });

      const lastSection = renumberedSections[renumberedSections.length - 1];

      return {
        ...prev,
        sections: renumberedSections,
        totalQuestions: lastSection ? lastSection.endQuestion : 10,
      };
    });
  };

  // Validate audio section URLs
  const validateAudioUrls = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    for (const section of metadata.sections) {
      if (!section.audioUrl.trim()) {
        newErrors[`section${section.number}`] = `Section ${section.number} audio URL is required`;
        continue;
      }
      // Validate URL - R2 URLs are always valid if they're proper URLs
      // Google Drive URLs need special validation
      const isR2Url = section.audioUrl.includes('r2.dev') || section.audioUrl.includes('cloudflare');
      const isDirectUrl = section.audioUrl.startsWith('https://') && !section.audioUrl.includes('drive.google.com');

      if (isR2Url || isDirectUrl) {
        // R2 and other direct URLs are valid as-is
        continue;
      }

      // Validate Google Drive URL
      try {
        const validation = await googleDriveAudioService.validateAudioLink(section.audioUrl);
        if (!validation.valid) {
          newErrors[`section${section.number}`] = validation.error || 'Invalid audio URL';
        }
      } catch (err) {
        newErrors[`section${section.number}`] = 'Failed to validate audio URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const trackStepNavigation = (
    direction: 'next' | 'back',
    fromStep: ListeningBuilderStep,
    toStep: ListeningBuilderStep | 'sessions' | 'listening-mode',
    outcome: 'navigated' | 'blocked' | 'discard-pending' = 'navigated',
    metadataOverride: Record<string, unknown> = {},
  ) => {
    trackAction(direction === 'next' ? 'listeningAuthoringStepNext' : 'listeningAuthoringStepBack', {
      source: 'listening_builder',
      fromStep,
      toStep,
      outcome,
      ...metadataOverride,
    });
  };

  // Handle next step
  const handleNext = async () => {
    if (currentStep === 'mode-select') {
      trackStepNavigation('next', currentStep, 'audio');
      setCurrentStep('audio');
    } else if (currentStep === 'audio') {
      const valid = await validateAudioUrls();
      if (valid) {
        // Route based on display mode
        if (displayMode === 'text') {
          trackStepNavigation('next', currentStep, 'questions-text');
          setCurrentStep('questions-text');
        } else {
          trackStepNavigation('next', currentStep, 'questions-images');
          setCurrentStep('questions-images');
        }
      } else {
        trackStepNavigation('next', currentStep, currentStep, 'blocked', {
          errorCount: metadata.sections.filter((section) => !section.audioUrl.trim()).length || 1,
        });
      }
    } else if (currentStep === 'questions-text') {
      trackStepNavigation('next', currentStep, 'questions');
      setCurrentStep('questions');
    } else if (currentStep === 'questions-images') {
      // Sync questions count for Image Mode
      if (questions.length < metadata.totalQuestions) {
        const currentCount = questions.length;
        const needed = metadata.totalQuestions - currentCount;
        const newQuestions = Array.from({ length: needed }).map((_, i) => ({
          id: `q-${Date.now()}-${currentCount + i + 1}`,
          number: currentCount + i + 1,
          questionNumber: currentCount + i + 1,
          question: '', // Empty for Image Mode
          type: 'short-answer', // Default to fill-in-the-blank
          answer: '',
          answerSource: 'manual' as const,
          confidence: 1,
          passageId: 'listening',
          points: 1,
        }));
        setQuestions([...questions, ...newQuestions] as any);
      }
      trackStepNavigation('next', currentStep, 'questions', 'navigated', {
        questionCount: Math.max(questions.length, metadata.totalQuestions),
      });
      setCurrentStep('questions');
    } else if (currentStep === 'questions') {
      trackStepNavigation('next', currentStep, 'review');
      setCurrentStep('review');
    }
  };

  // Handle back
  const handleBack = () => {
    if (currentStep === 'mode-select') {
      if (isEmbedded && onExit) {
        trackStepNavigation('back', currentStep, 'listening-mode');
        onExit();
        return;
      }
      if (canDiscard) {
        trackStepNavigation('back', currentStep, 'sessions', 'discard-pending');
        openDiscardConfirmation('navigation-away', () => {
          navigateTo('SESSIONS', {}, { reason: 'listening_builder_back' });
        });
        return;
      }
      trackStepNavigation('back', currentStep, 'sessions');
      navigateTo('SESSIONS', {}, { reason: 'listening_builder_back' });
    }
    else if (currentStep === 'audio') {
      if (isEmbedded && initialStep === 'audio' && onExit) {
        trackStepNavigation('back', currentStep, 'listening-mode');
        onExit();
        return;
      }
      trackStepNavigation('back', currentStep, 'mode-select');
      setCurrentStep('mode-select');
    }
    else if (currentStep === 'questions-text') {
      trackStepNavigation('back', currentStep, 'audio');
      setCurrentStep('audio');
    }
    else if (currentStep === 'questions-images') {
      trackStepNavigation('back', currentStep, 'audio');
      setCurrentStep('audio');
    }
    else if (currentStep === 'questions') {
      if (displayMode === 'text') {
        trackStepNavigation('back', currentStep, 'questions-text');
        setCurrentStep('questions-text');
      } else {
        trackStepNavigation('back', currentStep, 'questions-images');
        setCurrentStep('questions-images');
      }
    }
    else if (currentStep === 'review') {
      trackStepNavigation('back', currentStep, 'questions');
      setCurrentStep('questions');
    }
  };

  // Parse question text using Parser Router
  const handleParseQuestions = async () => {
    if (!questionText.trim()) {
      setErrors({ ...errors, parsing: 'Please enter question text first' });
      return;
    }

    setIsParsing(true);
    setParsingProgress(0);
    setParsingStage('Starting question parsing...');

    try {
      // Use Parser Router - automatically selects best parser for Listening
      const result = await listeningRouter.parseListening(
        questionText,
        metadata.type as 'IELTS' | 'TOEFL' | 'Cambridge' | 'Custom' | 'unknown',
        (stage: string, progress: number) => {
          setParsingProgress(progress);
          setParsingStage(stage);
        }
      );

      if (result.success) {
        // Map questions with required fields
        const parsedQuestions: ParsedQuestion[] = result.data.questions.map(q => ({
          id: q.id,
          number: q.number,
          questionNumber: q.questionNumber,
          questionText: q.questionText || q.question || '',
          question: q.question || q.questionText || '',
          type: q.type as ParsedQuestion['type'],
          options: q.options,
          answer: q.answer || '',
          context: q.context,
          answerSource: 'ai-suggestion' as const,
          confidence: result.data.parseConfidence,
        }));

        setQuestions(parsedQuestions);
        setCurrentStep('questions');
        console.log(`✅ Parser Router: ${parsedQuestions.length} questions via ${result.data.parserUsed}`);
        console.log('📊 Parse confidence:', result.data.parseConfidence);
      } else {
        setErrors({ ...errors, parsing: `Parsing failed: ${result.error}` });
      }
    } catch (error) {
      console.error('Parsing error:', error);
      setErrors({ ...errors, parsing: 'Failed to parse questions. Please try again.' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (pendingActionRef.current || isSaving || lifecyclePendingAction) {
      handleDuplicateAction('saveDraft');
      return;
    }

    beginAction('saveDraft');
    clearSaveError();
    setDiscardContext(null);
    setDuplicateAction(null);
    setDraftStatusMode('saving-draft');
    setDraftStatusMessage(undefined);
    setPublishBlockers([]);
    setPublishReadinessMode('idle');
    setPublishReadinessBlockers([]);
    setPublishReadinessCheckedSections(0);

    try {
      const document = buildAuthoringDocument();
      const result = await createAuthoringWorkflow().saveDraft({
        idempotencyKey: createListeningActionIdempotencyKey('saveDraft'),
        document,
        draftId: draftId ?? undefined,
        expectedConflictToken: draftId ? draftConflictToken : undefined,
        trigger: 'explicit',
      });

      if (result.status === 'conflict') {
        setDraftId(result.draftId);
        setDraftStatusMode('conflict');
        setDraftStatusMessage('This draft changed in another session. Reload or merge before saving again.');
        trackAction('saveDraft', {
          source: 'listening_builder',
          step: currentStep,
          draftId: result.draftId,
          conflictToken: draftConflictToken,
          currentConflictToken: result.currentConflictToken,
          outcome: 'conflict',
        });
        announceListeningDraftConflict();
        return;
      }

      if (result.status !== 'saved') {
        const message = result.status === 'idempotency-conflict'
          ? 'Save draft was already submitted with different content. Try again.'
          : 'Draft could not be saved. Try again.';
        setDraftStatusMode('draft-error');
        setDraftStatusMessage(message);
        setErrors((prev) => ({ ...prev, save: message }));
        trackAction('saveDraft', {
          source: 'listening_builder',
          step: currentStep,
          draftId: result.draftId ?? draftId,
          conflictToken: draftConflictToken,
          outcome: result.status,
        });
        announceListeningDraftFailed(message);
        return;
      }

      const warnings = normalizeAuthoringIssues(
        result.warnings,
        'warning',
        'draft',
        'Draft saved with an item that needs attention before publishing.',
      );
      const savedAt = Date.now();

      setDraftId(result.draftId);
      setDraftConflictToken(result.conflictToken);
      setDiscardedDraft(null);
      setDraftWarnings(warnings);
      setLastSavedAt(savedAt);
      setLastPersistedFingerprint(currentDraftFingerprint);
      setDraftStatusMode(warnings.length > 0 ? 'draft-warning' : 'draft-saved');

      announceListeningDraftSaved(warnings.length);
      trackAction('saveDraft', {
        source: 'listening_builder',
        step: currentStep,
        draftId: result.draftId,
        conflictToken: result.conflictToken,
        warningCount: warnings.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Draft could not be saved. Try again.';
      console.error('âŒ Failed to save draft:', error);
      setDraftStatusMode('draft-error');
      setDraftStatusMessage(message);
      setErrors((prev) => ({ ...prev, save: message }));
      trackAction('saveDraft', {
        source: 'listening_builder',
        step: currentStep,
        draftId,
        conflictToken: draftConflictToken,
        outcome: 'error',
      });
      announceListeningDraftFailed(message);
    } finally {
      endAction();
    }
  };

  const handleRecoverConflict = () => {
    setDraftStatusMode('idle');
    setDraftStatusMessage(undefined);
    setDiscardedDraft(null);
    setPublishedVersion(null);
    setIsPublishedVersionArchived(false);
    setPublishBlockers([]);
    setPublishReadinessMode('idle');
    setPublishReadinessBlockers([]);
    setPublishReadinessCheckedSections(0);
    setDiscardContext(null);
    trackAction('recoverListeningConflict', {
      source: 'listening_builder',
      step: currentStep,
      draftId,
      conflictToken: draftConflictToken,
    });
  };

  const resetBuilderState = () => {
    setMetadata(buildInitialListeningMetadata(passedMetadata));
    setCurrentStep(initialStep);
    setDisplayMode(initialDisplayMode);
    setQuestionImages([]);
    setErrors({});
    setQuestions([]);
    setQuestionText('');
    setParsingProgress(0);
    setParsingStage('');
    setBulkAnswerKey('');
    setIsPublic(false);
    setAudioControls(AUDIO_CONTROLS_PRESETS.IELTS_STANDARD);
    setAllowReplay(false);
    setMaxReplays(1);
    setDraftWarnings([]);
    setPublishBlockers([]);
    setPublishReadinessMode('idle');
    setPublishReadinessBlockers([]);
    setPublishReadinessCheckedSections(0);
    setDraftId(null);
    setDraftConflictToken(0);
    setLastSavedAt(null);
    setLastPersistedFingerprint(null);
    setDuplicateAction(null);
    setDraftStatusMessage(undefined);
  };

  const handleDiscardCancelled = () => {
    pendingNavigationRef.current = null;
    setDiscardContext(null);
    setDraftStatusMode('idle');
    setDraftStatusMessage(undefined);
  };

  const handleDiscardConfirmed = async () => {
    if (pendingActionRef.current || isSaving || lifecyclePendingAction) {
      return;
    }

    beginAction('discard');
    try {
      const navigationTarget = pendingNavigationRef.current;
      const discardReason = discardContext;
      const cleanupTargets = collectTempCleanupTargets(metadata.sections);
      abortAllUploads();

      if (draftId) {
        const result = await createAuthoringWorkflow().discardDraft({
          draftId,
          expectedConflictToken: draftConflictToken,
          idempotencyKey: createListeningActionIdempotencyKey('discard'),
          reasonCode: 'teacher-discard',
        });
        if (result.status !== 'discarded') {
          const message = result.status === 'conflict'
            ? 'Draft changed before discard. Reload or merge before trying again.'
            : 'Draft could not be discarded. Try again.';
          setDraftStatusMode(result.status === 'conflict' ? 'conflict' : 'draft-error');
          setDraftStatusMessage(message);
          announceListeningDraftFailed(message);
          return;
        }
        setDiscardedDraft({
          draftId: result.draftId ?? draftId,
          conflictToken: result.conflictToken ?? draftConflictToken,
        });
        setDraftConflictToken(result.conflictToken ?? draftConflictToken);
      } else {
        resetBuilderState();
      }
      await cleanupListeningTempUploads(cleanupTargets, 'discard-draft');
      setDraftStatusMode('discarded');
      announceListeningDraftDiscarded();
      trackAction('discardListeningDraft', {
        source: 'listening_builder',
        step: currentStep,
        context: discardReason ?? 'saved-draft',
        draftId,
        conflictToken: draftConflictToken,
      });

      pendingNavigationRef.current = null;
      if (navigationTarget) {
        navigationTarget();
      }
    } finally {
      endAction();
    }
  };

  const handleRestoreDraft = async () => {
    if (!discardedDraft || lifecyclePendingAction) return;
    setLifecyclePendingAction('restore');
    try {
      const result = await createAuthoringWorkflow().restoreDraft({
        draftId: discardedDraft.draftId,
        expectedConflictToken: discardedDraft.conflictToken,
        idempotencyKey: createListeningActionIdempotencyKey('restore'),
        reasonCode: 'teacher-restore',
      });
      if (result.status !== 'restored') {
        const message = result.status === 'conflict'
          ? 'Draft changed before restore. Reload before trying again.'
          : 'Draft could not be restored. Try again.';
        setDraftStatusMode(result.status === 'conflict' ? 'conflict' : 'draft-error');
        setDraftStatusMessage(message);
        announceListeningDraftFailed(message);
        return;
      }
      const restoredDraftId = result.draftId ?? discardedDraft.draftId;
      const restoredConflictToken = result.conflictToken ?? discardedDraft.conflictToken;
      setDraftId(restoredDraftId);
      setDraftConflictToken(restoredConflictToken);
      setDiscardedDraft(null);
      setDraftStatusMode('draft-saved');
      setDraftStatusMessage(undefined);
      announceListeningDraftRestored();
    } finally {
      setLifecyclePendingAction(null);
    }
  };

  const handleArchivePublishedVersion = async () => {
    if (!publishedVersion || isPublishedVersionArchived || lifecyclePendingAction) return;
    setLifecyclePendingAction('archive');
    try {
      const result = await createAuthoringWorkflow().archivePublishedVersion({
        versionId: publishedVersion.versionId,
        expectedConflictToken: publishedVersion.versionNumber,
        idempotencyKey: createListeningActionIdempotencyKey('archive'),
        reasonCode: 'teacher-archive',
      });
      if (result.status !== 'archived') {
        const message = 'Published version could not be archived. Try again.';
        announceListeningPublishFailed(message);
        return;
      }
      setIsPublishedVersionArchived(true);
      announceListeningPublishedArchive();
    } finally {
      setLifecyclePendingAction(null);
    }
  };

  const handlePublish = async () => {
    if (pendingActionRef.current || isSaving || lifecyclePendingAction) {
      handleDuplicateAction('publish');
      return;
    }

    clearSaveError();
    setDiscardContext(null);
    setDuplicateAction(null);
    setDraftStatusMessage(undefined);

    const document = buildAuthoringDocument();
    const warnings = [...validateListeningDraft(document)];
    const blockers: ListeningAuthoringIssue[] = [
      ...(!draftId
        ? [
            {
              field: 'draft',
              severity: 'blocker' as const,
              guidance: 'Save draft before publishing.',
            },
          ]
        : []),
      ...(currentStep === 'questions' && questions.length < metadata.totalQuestions
        ? [
            {
              field: 'question',
              severity: 'blocker' as const,
              guidance: 'Publish requires every question prompt.',
            },
            {
              field: 'answer',
              severity: 'blocker' as const,
              guidance: 'Publish requires every answer key.',
            },
          ]
        : []),
      ...validateListeningPublish(document),
    ];
    setDraftWarnings(warnings);
    setPublishBlockers(blockers);

    if (blockers.length > 0) {
      setDraftStatusMode('publish-blocked');
      trackAction('publishTest', {
        source: 'listening_builder',
        step: currentStep,
        draftId,
        conflictToken: draftConflictToken,
        outcome: 'blocked',
        blockerCount: blockers.length,
      });
      announceListeningPublishBlocked(blockers.length);
      return;
    }

    const publishDraftId = draftId;
    if (!publishDraftId) {
      return;
    }

    beginAction('publish');
    setIsSaving(true);
    setDraftStatusMode('publishing');
    setPublishReadinessMode('checking');
    setPublishReadinessBlockers([]);
    setPublishReadinessCheckedSections(document.audioSections.length);

    try {
      const readiness = await validateListeningPublishReadiness(document, {
        authoritySections: getStorageSections(),
        probeListeningAuthoringAsset: (input) =>
          r2StorageService.probeListeningAuthoringAudio(input),
      });
      setPublishReadinessCheckedSections(readiness.checkedSections);

      if (readiness.status === 'blocked') {
        setPublishReadinessMode('blocked');
        setPublishReadinessBlockers(readiness.blockers);
        setPublishBlockers([{
          field: 'audioReadiness',
          severity: 'blocker',
          guidance: 'Publish audio readiness blocked. Review section checks below.',
        }]);
        setDraftStatusMode('publish-blocked');
        trackAction('listeningPublishReadinessFailed', {
          source: 'listening_builder',
          step: currentStep,
          draftId: publishDraftId,
          conflictToken: draftConflictToken,
          blockerCount: readiness.blockers.length,
        });
        announceListeningPublishBlocked(readiness.blockers.length);
        return;
      }

      setPublishReadinessMode('ready');
      setPublishReadinessBlockers([]);
      trackAction('listeningPublishReadinessChecked', {
        source: 'listening_builder',
        step: currentStep,
        draftId: publishDraftId,
        conflictToken: draftConflictToken,
        checkedSections: readiness.checkedSections,
      });

      const result = await createAuthoringWorkflow().publishDraft({
        draftId: publishDraftId,
        expectedConflictToken: draftConflictToken,
        idempotencyKey: createListeningActionIdempotencyKey('publish'),
      });

      if (result.status === 'published') {
        const savedAt = Date.now();
        const publishWarnings = normalizeAuthoringIssues(
          result.warnings,
          'warning',
          'publish',
          'Published with an item that needs attention.',
        );

        setDraftId(result.draftId);
        setDraftConflictToken(result.conflictToken);
        setDraftWarnings(publishWarnings);
        setPublishBlockers([]);
        setLastSavedAt(savedAt);
        setLastPersistedFingerprint(currentDraftFingerprint);
        setDraftStatusMode('draft-saved');
        setPublishedVersion({
          versionId: result.versionId,
          versionNumber: result.versionNumber,
        });
        setIsPublishedVersionArchived(false);
        announceListeningPublishSucceeded(metadata.title || 'Untitled Listening Test');
        trackAction('publishTest', {
          source: 'listening_builder',
          step: currentStep,
          draftId: result.draftId,
          conflictToken: result.conflictToken,
          warningCount: publishWarnings.length,
          versionId: result.versionId,
          versionNumber: result.versionNumber,
        });
        if (isEmbedded) {
          onPublished?.();
        } else {
          navigateTo('LOBBY', undefined, {
            reason: 'listening_builder_publish_success',
            replace: true,
          });
        }
        return;
      }

      if (result.status === 'blocked') {
        const serverWarnings = normalizeAuthoringIssues(
          result.warnings,
          'warning',
          'publish',
          'Publish returned a warning.',
        );
        const serverBlockers = normalizeAuthoringIssues(
          result.blockers,
          'blocker',
          'publish',
          'Publish blocked by server validation.',
        );
        const visibleBlockers = serverBlockers.length > 0
          ? serverBlockers
          : [{
              field: 'publish',
              severity: 'blocker' as const,
              guidance: 'Publish blocked by server validation.',
            }];

        if (typeof result.conflictToken === 'number') {
          setDraftConflictToken(result.conflictToken);
        }
        setDraftWarnings(serverWarnings);
        setPublishBlockers(visibleBlockers);
        setDraftStatusMode('publish-blocked');
        trackAction('publishTest', {
          source: 'listening_builder',
          step: currentStep,
          draftId: result.draftId,
          conflictToken: result.conflictToken ?? draftConflictToken,
          outcome: 'blocked',
          blockerCount: visibleBlockers.length,
        });
        announceListeningPublishBlocked(visibleBlockers.length);
        return;
      }

      if (result.status === 'conflict') {
        setDraftStatusMode('conflict');
        setDraftStatusMessage('This draft changed in another session. Reload or merge before publishing.');
        trackAction('publishTest', {
          source: 'listening_builder',
          step: currentStep,
          draftId: result.draftId,
          conflictToken: draftConflictToken,
          currentConflictToken: result.currentConflictToken,
          outcome: 'conflict',
        });
        announceListeningDraftConflict();
        return;
      }

      const message = result.status === 'idempotency-conflict'
        ? 'Publish was already submitted with different content. Try again.'
        : 'Publish could not complete. Try again.';
      setDraftStatusMode('publish-error');
      setDraftStatusMessage(message);
      setErrors((prev) => ({ ...prev, save: message }));
      trackAction('publishTest', {
        source: 'listening_builder',
        step: currentStep,
        draftId: result.draftId ?? draftId,
        conflictToken: draftConflictToken,
        outcome: result.status,
      });
      announceListeningPublishFailed(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publish could not complete. Try again.';
      console.error('âŒ Failed to publish test:', error);
      setDraftStatusMode('publish-error');
      setDraftStatusMessage(message);
      setErrors((prev) => ({ ...prev, save: message }));
      trackAction('publishTest', {
        source: 'listening_builder',
        step: currentStep,
        draftId,
        conflictToken: draftConflictToken,
        outcome: 'error',
      });
      announceListeningPublishFailed(message);
    } finally {
      setIsSaving(false);
      endAction();
    }
  };

  // Add question
  const addQuestion = () => {
    const newQuestion: ParsedQuestion = {
      id: `q-${Date.now()}-${questions.length + 1}`,
      number: questions.length + 1,
      questionNumber: questions.length + 1,
      questionText: '',
      question: '',
      type: 'short-answer',
      answer: '',
      answerSource: 'manual' as any,
      confidence: 1,
      passageId: 'listening',
      points: 1,
    };
    setQuestions([...questions, newQuestion]);
  };

  // Update question
  const updateQuestion = (index: number, field: keyof ParsedQuestion, value: any) => {
    setQuestions(questions.map((q, idx) =>
      idx === index ? { ...q, [field]: value } : q
    ));
  };

  // Delete question
  const deleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  // Bulk parse answers for Image Mode
  // Bulk parse answers for Image Mode (AI-Powered)
  const handleBulkParseAnswers = async () => {
    if (!bulkAnswerKey.trim()) return;

    setIsParsing(true);
    setParsingStage('AI is analyzing your answer key...');

    try {
      // Use the newly added answer key parser
      const parsedAnswers = await listeningRouter.parseAnswerKey(bulkAnswerKey);

      const newQuestions = [...questions];
      let updatedCount = 0;

      // Apply parsed answers to questions
      // We prioritize matching by number (e.g. "1. Answer")
      Object.entries(parsedAnswers).forEach(([key, value]) => {
        const questionNum = parseInt(key);
        const answerText = Array.isArray(value) ? value.join(' / ') : value; // Use / as separator for variations

        const qIndex = newQuestions.findIndex(q => q.number === questionNum);
        if (qIndex !== -1) {
          newQuestions[qIndex] = { ...newQuestions[qIndex], answer: answerText };
          updatedCount++;
        }
      });

      // Fallback: If AI returns very few matches (maybe it didn't detect numbering), 
      // but provided a sequential list, or if the user just pasted a raw list without numbers
      if (updatedCount === 0) {
        // Simple line-split fallback if AI fails to map
        const lines = bulkAnswerKey.split(/\r?\n/).filter(line => line.trim());
        lines.forEach((line, idx) => {
          if (idx < newQuestions.length) {
            const cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();
            newQuestions[idx] = { ...newQuestions[idx], answer: cleanLine };
            updatedCount++;
          }
        });
      }

      setQuestions(newQuestions);
      console.log(`✅ Bulk update complete: ${updatedCount} answers set`);

    } catch (error) {
      console.error("AI Parse failed:", error);
      toast.error('AI parsing failed. Please check your internet connection or try simpler formatting.');
    } finally {
      setIsParsing(false);
      setParsingStage('');
    }
  };

  // Add image to a section
  const handleAddImage = (section: AudioSection, imageUrl: string) => {
    setQuestionImages(prev => {
      // Get existing images for this section to calculate range
      const sectionImages = prev
        .filter(img => img.sectionNumber === section.number)
        .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

      const lastImage = sectionImages[sectionImages.length - 1];

      // Calculate start question (after the last image's end, or start of section)
      const startQuestion = lastImage
        ? (lastImage.questionRange?.end || section.startQuestion) + 1
        : section.startQuestion;

      // If start exceeds end, just set it to end (user can fix it)
      const validStart = Math.min(startQuestion, section.endQuestion);

      return [...prev, {
        sectionNumber: section.number,
        imageUrl,
        questionRange: {
          start: validStart,
          end: section.endQuestion
        }
      }];
    });
  };

  // Global paste handler for image mode
  useEffect(() => {
    if (currentStep !== 'questions-images') return;

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Don't intercept if pasting into an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // We need to know which section to paste into. 
      // Since we can't easily track hover state without more state, 
      // we'll default to the LAST audio section or the one with focus?
      // Better strategy: If there is only one section, paste there. 
      // If multiple, maybe we can't support global paste easily without a "selected" section concept.
      // However, the user asked for "Paste" button to work. 
      // We'll stick to fixing the button mostly, but if we can support global paste:

      // Attempt to find image in clipboard
      const items = e.clipboardData?.items;
      if (!items) return;

      let file: File | null = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          file = items[i].getAsFile();
          break;
        }
      }

      if (file) {
        e.preventDefault();
        // If we have a file, and there's only one section with valid audio, use it
        const validSections = metadata.sections.filter(s => s.audioUrl);
        if (validSections.length === 1) {
          const reader = new FileReader();
          reader.onload = (event) => {
            handleAddImage(validSections[0], event.target?.result as string);
          };
          reader.readAsDataURL(file);
          // Image paste succeeds silently because the section preview updates immediately.
        } else {
          // If multiple sections, we can't guess. 
          // Maybe show a modal? 
          // For now, let's just log or notify.
          console.log('Multiple sections found, use the Paste button on specific section.');
          toast.info('Use the Paste button on the specific section you want to add this image to when multiple sections are present.');
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [currentStep, metadata.sections]);

  const draftStatusAction = draftStatusMode === 'discard-pending'
    ? (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button variant="glass" onClick={handleDiscardCancelled}>
          Keep editing
        </Button>
        <Button variant="outline" onClick={handleDiscardConfirmed} disabled={pendingAction === 'discard'}>
          Discard now
        </Button>
      </div>
    )
    : draftStatusMode === 'conflict'
      ? (
        <Button variant="glass" onClick={handleRecoverConflict}>
          Continue editing
        </Button>
      )
      : null;

  const builderNavSteps: Array<{
    key: string;
    label: string;
    kind: ListeningBuilderNavKind;
    matches: ListeningBuilderStep[];
  }> = [
    ...(!isEmbedded ? [{
      key: 'mode-select',
      label: 'Mode',
      kind: 'mode' as const,
      matches: ['mode-select' as ListeningBuilderStep],
    }] : []),
    {
      key: 'audio',
      label: 'Audio',
      kind: 'audio',
      matches: ['audio'],
    },
    {
      key: displayMode === 'text' ? 'questions-text' : 'questions-images',
      label: displayMode === 'text' ? 'Parse' : 'Images',
      kind: displayMode === 'text' ? 'parse' : 'images',
      matches: displayMode === 'text' ? ['questions-text'] : ['questions-images'],
    },
    {
      key: 'questions',
      label: displayMode === 'image' ? 'Answer key' : 'Questions',
      kind: 'questions',
      matches: ['questions'],
    },
    {
      key: 'review',
      label: 'Review',
      kind: 'review',
      matches: ['review'],
    },
  ];
  const activeBuilderNavIndex = Math.max(0, builderNavSteps.findIndex(step => step.matches.includes(currentStep)));
  const activeAnswerSection: AudioSection =
    metadata.sections.find(section => section.number === activeAnswerSectionNumber)
    ?? metadata.sections[0]
    ?? createDefaultSection();
  const activeAnswerSectionImages = questionImages
    .filter(image => image.sectionNumber === activeAnswerSection.number)
    .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));
  const activeAnswerImage = activeAnswerSectionImages[0] ?? null;
  const activeAnswerQuestions = questions.filter(question =>
      question.number >= activeAnswerSection.startQuestion &&
      question.number <= activeAnswerSection.endQuestion
    );

  return (
    <main
      style={{
        background: isEmbedded ? 'transparent' : '#f8fafc',
        boxSizing: 'border-box',
        height: isEmbedded ? '100%' : undefined,
        minHeight: isEmbedded ? 0 : '100vh',
        overflow: isEmbedded ? 'hidden' : undefined,
        padding: isEmbedded ? 0 : '1rem',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: isEmbedded ? '100%' : 'min(960px, 94vw)',
          margin: isEmbedded ? 0 : '0 auto',
          padding: isEmbedded ? 0 : '2rem',
          height: isEmbedded ? '100%' : undefined,
          minHeight: isEmbedded ? 0 : undefined,
        }}
      >
        {/* Header */}
        {!isEmbedded && (
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>
            Create Listening Test
          </h1>
          <p style={{ color: '#64748b', fontSize: '1.125rem' }}>
            Build IELTS Listening tests with audio files and questions
          </p>
        </div>

        )}

        {/* Progress Steps */}
        {!isEmbedded && (
          <div
            aria-label="Listening builder steps"
            style={{
              display: 'inline-flex',
              gap: '0.1875rem',
              background: listeningMakerTokens.inset,
              border: `1px solid ${listeningMakerTokens.line}`,
              borderRadius: '999px',
              padding: '0.1875rem',
              marginBottom: '1rem',
              maxWidth: '100%',
              overflowX: 'auto',
            }}
          >
            {builderNavSteps.map((step, index) => {
              const isActive = step.matches.includes(currentStep);
              const isDone = index < activeBuilderNavIndex;
              return (
                <div
                  key={step.key}
                  aria-current={isActive ? 'step' : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.6875rem',
                    borderRadius: '999px',
                    color: isDone ? listeningMakerTokens.success : isActive ? listeningMakerTokens.primary : listeningMakerTokens.muted,
                    background: isActive ? listeningMakerTokens.surface : 'transparent',
                    boxShadow: isActive ? listeningMakerTokens.shadowCard : 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isDone ? <IconCheck size={15} stroke={2} aria-hidden="true" /> : <ListeningBuilderNavIcon kind={step.kind} />}
                  {step.label}
                </div>
              );
            })}
          </div>
        )}
        <div aria-hidden="true" style={{ display: 'none', justifyContent: 'center', marginBottom: isEmbedded ? '1.25rem' : '3rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'mode-select', label: 'Mode', icon: '🎛️' },
            { key: 'audio', label: 'Audio', icon: '🎵' },
            { key: displayMode === 'text' ? 'questions-text' : 'questions-images', label: displayMode === 'text' ? 'AI Parse' : 'Images', icon: displayMode === 'text' ? '🤖' : '🖼️' },
            { key: 'questions', label: 'Questions', icon: '📝' },
            { key: 'review', label: 'Review', icon: '✓' },
          ].map((step) => (
            <div
              key={step.key}
              style={{
                padding: '0.5rem 1rem',
                background: currentStep === step.key
                  ? '#2563eb'
                  : '#ffffff',
                color: currentStep === step.key ? 'white' : '#64748b',
                borderRadius: '0.5rem',
                border: currentStep === step.key ? '1px solid #1d4ed8' : '1px solid #dbe4ee',
                fontWeight: 600,
                fontSize: '0.875rem',
                opacity: currentStep === step.key ? 1 : 0.6,
              }}
            >
              {step.icon} {step.label}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <section
          style={{
            ...(isEmbedded ? {} : listeningMakerStyles.panel),
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: isEmbedded ? '100%' : 'min(680px, 82vh)',
            minHeight: 0,
            overflow: 'hidden',
            background: isEmbedded ? 'rgba(255, 255, 255, 0.78)' : listeningMakerTokens.surface,
            border: isEmbedded ? 'none' : undefined,
            borderRadius: isEmbedded ? 0 : undefined,
            boxShadow: isEmbedded ? 'none' : undefined,
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: isEmbedded ? '1rem 1rem 0' : '1rem',
            }}
          >
            {draftStatusMode !== 'idle' && draftStatusMode !== 'discard-pending' && (
              <ListeningDraftStatus
                mode={draftStatusMode}
                warnings={draftWarnings}
                blockers={publishBlockers}
                lastSavedAt={lastSavedAt}
                hasDraft={hasDraft}
                hasUnsavedChanges={hasUnsavedChanges}
                duplicateAction={duplicateAction}
                discardContext={discardContext}
                message={draftStatusMessage}
                action={draftStatusAction}
              />
            )}

            {/* STEP 0: Mode Selection */}
            {currentStep === 'mode-select' && (
              <div>
                <div style={{ marginBottom: '2rem' }}>
                  <AssessmentAuthoringHeader
                    title="Choose Display Mode"
                    description="Select how your listening test questions will be displayed to students"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Display mode options"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
                    gap: '1.5rem',
                  }}
                >
                  {/* Text Mode Option */}
                  <button
                    type="button"
                    aria-pressed={displayMode === 'text'}
                    aria-label="IELTS Text Format"
                    onClick={() => setDisplayMode('text')}
                    style={{
                      appearance: 'none',
                      width: '100%',
                      padding: '2rem',
                      background: displayMode === 'text' ? '#2563eb' : '#ffffff',
                      border: displayMode === 'text' ? '1px solid #1d4ed8' : '1px solid #dbe4ee',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease',
                      textAlign: 'center',
                      boxShadow: displayMode === 'text' ? '0 14px 32px rgba(37, 99, 235, 0.18)' : '0 8px 18px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    <IconFileText
                      aria-hidden="true"
                      stroke={1.8}
                      style={{
                        display: 'block',
                        width: '3rem',
                        height: '3rem',
                        margin: '0 auto 1rem',
                      }}
                    />
                    <span style={{
                      display: 'block',
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      color: displayMode === 'text' ? 'white' : '#1e293b',
                      marginBottom: '0.5rem'
                    }}>
                      IELTS Text Format
                    </span>
                    <span style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      color: displayMode === 'text' ? 'rgba(255,255,255,0.9)' : '#64748b',
                      marginBottom: '1rem'
                    }}>
                      Full-width authentic IELTS display with text questions
                    </span>
                    <span style={{
                      display: 'block',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      color: displayMode === 'text' ? 'rgba(255,255,255,0.85)' : '#64748b',
                      lineHeight: 1.8,
                      paddingLeft: '1.25rem',
                    }}>
                      <span style={{ display: 'block' }}>- Paste question text for AI parsing</span>
                      <span style={{ display: 'block' }}>- Task instructions with word limits</span>
                      <span style={{ display: 'block' }}>- Options boxes for matching questions</span>
                      <span style={{ display: 'block' }}>- Context display for completion types</span>
                    </span>
                    {displayMode === 'text' && (
                      <span style={{ display: 'block', marginTop: '1rem', fontSize: '1.25rem' }}>✓ Selected</span>
                    )}
                  </button>

                  {/* Image Mode Option */}
                  <button
                    type="button"
                    aria-pressed={displayMode === 'image'}
                    aria-label="Image Mode"
                    onClick={() => setDisplayMode('image')}
                    style={{
                      appearance: 'none',
                      width: '100%',
                      padding: '2rem',
                      background: displayMode === 'image' ? '#4f46e5' : '#ffffff',
                      border: displayMode === 'image' ? '1px solid #4338ca' : '1px solid #dbe4ee',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease',
                      textAlign: 'center',
                      boxShadow: displayMode === 'image' ? '0 14px 32px rgba(79, 70, 229, 0.18)' : '0 8px 18px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    <IconPhoto
                      aria-hidden="true"
                      stroke={1.8}
                      style={{
                        display: 'block',
                        width: '3rem',
                        height: '3rem',
                        margin: '0 auto 1rem',
                      }}
                    />
                    <span style={{
                      display: 'block',
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      color: displayMode === 'image' ? 'white' : '#1e293b',
                      marginBottom: '0.5rem'
                    }}>
                      Image Mode
                    </span>
                    <span style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      color: displayMode === 'image' ? 'rgba(255,255,255,0.9)' : '#64748b',
                      marginBottom: '1rem'
                    }}>
                      Two-column layout with question images
                    </span>
                    <span style={{
                      display: 'block',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      color: displayMode === 'image' ? 'rgba(255,255,255,0.85)' : '#64748b',
                      lineHeight: 1.8,
                      paddingLeft: '1.25rem',
                    }}>
                      <span style={{ display: 'block' }}>- Upload question page images/PDFs</span>
                      <span style={{ display: 'block' }}>- Left: Zoomable question images</span>
                      <span style={{ display: 'block' }}>- Right: Numbered answer inputs</span>
                      <span style={{ display: 'block' }}>- Works with any question format</span>
                    </span>
                    {displayMode === 'image' && (
                      <span style={{ display: 'block', marginTop: '1rem', fontSize: '1.25rem' }}>✓ Selected</span>
                    )}
                  </button>
                </div>

              </div>
            )}


            {/* STEP 2: Audio Sections */}
            {currentStep === 'audio' && (
              <div>
                {!isEmbedded && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <span style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '0.625rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: listeningMakerTokens.selected,
                        color: listeningMakerTokens.primary,
                      }}>
                        <IconHeadphones size={18} stroke={1.9} aria-hidden="true" />
                      </span>
                      <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: listeningMakerTokens.ink }}>
                          Audio
                        </h2>
                        <p style={{ margin: '0.125rem 0 0 0', color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                          Upload one file per section
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <ListeningUploadGuidance
                  plannedAudioFiles={metadata.sections.length}
                  uploadedAudioFiles={metadata.sections.filter((section) => section.audioUrl.trim()).length}
                />

                {/* R2 Storage Ready - No authentication needed */}
                <div style={{
                  display: 'none',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 197, 94, 0.1) 100%)',
                  padding: '1rem 1.25rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>✅</span>
                  <div>
                    <p style={{ color: '#10b981', fontWeight: '600', margin: 0, fontSize: '0.9375rem' }}>
                      Ready to Upload
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                      Upload each listening file below. Re-upload any missing section before Publish.
                    </p>
                  </div>
                </div>

                {errors.auth && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    color: '#dc2626',
                    fontSize: '0.875rem'
                  }}>
                    ❌ {errors.auth}
                  </div>
                )}

                {/* Instructions */}
                <div style={{
                  display: 'none',
                  background: 'rgba(59, 130, 246, 0.05)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}>
                  <p style={{ color: '#3b82f6', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
                    💡 Upload flow
                  </p>
                  <ol style={{ paddingLeft: '1.25rem', margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.8 }}>
                    <li>Upload one audio file for each section below.</li>
                    <li>Wait for upload progress to finish before moving on.</li>
                    <li>Use re-upload if a section still shows missing audio before Publish.</li>
                  </ol>
                </div>
                <div style={{ display: 'grid', gap: '0.625rem' }}>
                  {metadata.sections.map((section) => {
                    const isUploadingThisSection = uploadingSection === section.number;
                    const hasAudio = Boolean(section.audioUrl.trim());
                    const uploadDisabled = uploadingSection !== null;

                    return (
                      <div
                        key={`compact-audio-${section.number}`}
                        style={{
                          padding: '0.75rem',
                          border: `1px solid ${hasAudio ? listeningMakerTokens.line : listeningMakerTokens.line2}`,
                          borderRadius: '0.625rem',
                          background: listeningMakerTokens.surface,
                          display: 'grid',
                          gap: '0.625rem',
                        }}
                      >
                        <input
                          type="file"
                          accept="audio/*,.mp3,.wav,.m4a,.ogg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAudioUpload(section.number, file);
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                          id={`audio-upload-${section.number}`}
                          disabled={uploadDisabled}
                        />

                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto',
                          gap: '0.75rem',
                          alignItems: 'center',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                            <span style={{
                              width: '2.125rem',
                              height: '2.125rem',
                              borderRadius: '0.5rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: listeningMakerTokens.inset,
                              color: listeningMakerTokens.primary,
                              border: `1px solid ${listeningMakerTokens.line}`,
                              flexShrink: 0,
                            }}>
                              <IconHeadphones size={17} stroke={1.9} aria-hidden="true" />
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: listeningMakerTokens.ink }}>
                                Section {section.number}
                              </h3>
                              <p style={{ margin: '0.125rem 0 0 0', color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                                Questions {section.startQuestion}-{section.endQuestion}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{
                              ...listeningMakerStyles.pill,
                              background: hasAudio ? listeningMakerTokens.successTint : listeningMakerTokens.warningTint,
                              color: hasAudio ? listeningMakerTokens.success : listeningMakerTokens.warning,
                            }}>
                              {hasAudio ? 'Uploaded' : 'No audio yet'}
                            </span>

                            {hasAudio && (
                              <audio
                                aria-label={`Section ${section.number} audio preview`}
                                controls
                                src={section.streamUrl || section.audioUrl}
                                style={{
                                  width: '10.75rem',
                                  maxWidth: '100%',
                                  height: '2rem',
                                  borderRadius: '999px',
                                }}
                              >
                                Your browser does not support audio playback.
                              </audio>
                            )}

                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                color: listeningMakerTokens.body,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Wait
                              <input
                                aria-label={`Section ${section.number} wait before section seconds`}
                                type="number"
                                value={section.waitTimeBefore || 0}
                                onChange={(e) => updateSection(section.number, 'waitTimeBefore', parseInt(e.target.value) || 0)}
                                min="0"
                                style={{
                                  width: '3.5rem',
                                  padding: '0.35rem 0.45rem',
                                  border: `1px solid ${listeningMakerTokens.line2}`,
                                  borderRadius: '0.5rem',
                                  fontSize: '0.75rem',
                                  color: listeningMakerTokens.ink,
                                }}
                              />
                              s
                            </label>

                            {metadata.sections.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Remove section ${section.number}`}
                                title={`Remove section ${section.number}`}
                                onClick={() => removeSection(section.number)}
                                style={{
                                  width: '2rem',
                                  height: '2rem',
                                  padding: 0,
                                  borderRadius: '999px',
                                  border: `1px solid ${listeningMakerTokens.line2}`,
                                  background: listeningMakerTokens.surface,
                                  color: listeningMakerTokens.danger,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <IconTrash size={14} stroke={1.9} aria-hidden="true" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (!uploadDisabled) {
                                  document.getElementById(`audio-upload-${section.number}`)?.click();
                                }
                              }}
                              disabled={uploadDisabled}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '0.5rem 0.875rem',
                                background: isUploadingThisSection ? listeningMakerTokens.dim : listeningMakerTokens.primary,
                                color: '#fff',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: uploadDisabled ? 'not-allowed' : 'pointer',
                                opacity: uploadDisabled && !isUploadingThisSection ? 0.55 : 1,
                              }}
                            >
                              <IconUpload size={14} stroke={1.9} aria-hidden="true" />
                              {isUploadingThisSection ? 'Uploading...' : hasAudio ? 'Replace' : 'Upload'}
                            </button>
                          </div>
                        </div>

                        {isUploadingThisSection && section.uploadProgress !== undefined && section.uploadProgress > 0 && section.uploadProgress < 100 && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: listeningMakerTokens.primary }}>
                                Uploading {section.uploadProgress}%
                              </span>
                              {section.uploadETA !== undefined && section.uploadETA > 0 && (
                                <span style={{ fontSize: '0.75rem', color: listeningMakerTokens.muted }}>
                                  {formatETA(section.uploadETA)} remaining
                                </span>
                              )}
                            </div>
                            <div style={{
                              width: '100%',
                              height: '0.375rem',
                              background: listeningMakerTokens.inset,
                              borderRadius: '999px',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${section.uploadProgress}%`,
                                height: '100%',
                                background: listeningMakerTokens.primary,
                                borderRadius: '999px',
                                transition: 'width 0.3s ease',
                              }} />
                            </div>
                          </div>
                        )}

                        {errors[`section${section.number}`] && (
                          <span style={{ color: listeningMakerTokens.danger, fontSize: '0.75rem', display: 'block' }}>
                            {errors[`section${section.number}`]}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addSection}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: `1px dashed ${listeningMakerTokens.line}`,
                      borderRadius: '0.625rem',
                      background: 'rgba(248, 250, 252, 0.72)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: listeningMakerTokens.primary,
                      outline: 'none',
                    }}
                  >
                    <IconUpload size={15} stroke={1.9} aria-hidden="true" />
                    Add section {metadata.sections.length + 1}
                  </button>
                </div>

                <div aria-hidden="true" style={{ display: 'none' }}>
                  {metadata.sections.map((section) => (
                    <div
                      key={section.number}
                      style={{
                        padding: '1.5rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                          Section {section.number}: Questions {section.startQuestion}-{section.endQuestion}
                        </h3>
                        {metadata.sections.length > 1 && (
                          <button
                            onClick={() => removeSection(section.number)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              color: '#dc2626',
                              fontSize: '0.875rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            }}
                          >
                            🗑️ Remove
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: '1rem' }}>
                        {/* Audio URL or Upload */}
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                            Audio File *
                          </label>

                          {/* Upload Button - Only enabled after Google Sign In */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <input
                              type="file"
                              accept="audio/*,.mp3,.wav,.m4a,.ogg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAudioUpload(section.number, file);
                                // Reset input to allow re-selecting same file
                                e.target.value = '';
                              }}
                              style={{ display: 'none' }}
                              id={`audio-upload-${section.number}`}
                              disabled={uploadingSection !== null}
                            />
                            <label htmlFor={`audio-upload-${section.number}`}>
                              <Button
                                variant="primary"
                                disabled={uploadingSection !== null}
                                style={{
                                  cursor: uploadingSection !== null ? 'not-allowed' : 'pointer',
                                  opacity: uploadingSection !== null ? 0.6 : 1,
                                  background: uploadingSection === section.number
                                    ? '#94a3b8'
                                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  border: 'none',
                                  pointerEvents: 'none'
                                }}
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  if (uploadingSection === null) {
                                    document.getElementById(`audio-upload-${section.number}`)?.click();
                                  }
                                }}
                              >
                                {uploadingSection === section.number ? (
                                  <>⏳ Uploading...</>
                                ) : (
                                  <>📤 Upload Audio File</>
                                )}
                              </Button>
                            </label>


                            {/* Upload Progress Bar */}
                            {uploadingSection === section.number && section.uploadProgress !== undefined && section.uploadProgress > 0 && section.uploadProgress < 100 && (
                              <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10b981' }}>
                                    📤 Uploading... {section.uploadProgress}%
                                  </span>
                                  {section.uploadETA !== undefined && section.uploadETA > 0 && (
                                    <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                      ⏱️ {formatETA(section.uploadETA)} remaining
                                    </span>
                                  )}
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '10px',
                                  background: '#e2e8f0',
                                  borderRadius: '5px',
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    width: `${section.uploadProgress}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                    borderRadius: '5px',
                                    transition: 'width 0.3s ease',
                                  }} />
                                </div>
                              </div>
                            )}

                            {/* Upload Complete Indicator */}
                            {section.uploadProgress === 100 && section.audioUrl && (
                              <div style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem 0.75rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ color: '#10b981', fontSize: '1rem' }}>✅</span>
                                <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: 500 }}>
                                  Upload complete!
                                </span>
                              </div>
                            )}

                            {/* Audio Player Preview - Supports R2 direct URLs and Google Drive */}
                            {section.audioUrl && (
                              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f1f5f9', borderRadius: '0.5rem' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f766e' }}>
                                  🎧 Audio Preview
                                </div>
                                {(() => {
                                  const isR2Url = section.audioUrl.includes('r2.dev') || section.audioUrl.includes('cloudflare');
                                  const isDirectUrl = section.audioUrl.startsWith('https://') && !section.audioUrl.includes('drive.google.com');

                                  // For R2 and direct URLs, use HTML5 audio player
                                  if (isR2Url || isDirectUrl) {
                                    return (
                                      <audio
                                        controls
                                        src={section.streamUrl || section.audioUrl}
                                        style={{ width: '100%', borderRadius: '8px' }}
                                      >
                                        Your browser does not support audio playback.
                                      </audio>
                                    );
                                  }

                                  // For Google Drive URLs, use iframe embed
                                  const fileIdMatch = section.audioUrl.match(/\/d\/([^/]+)/);
                                  const fileId = fileIdMatch ? fileIdMatch[1] : null;
                                  if (!fileId) return <p style={{ color: '#ef4444' }}>Invalid Google Drive URL</p>;
                                  return (
                                    <iframe
                                      src={`https://drive.google.com/file/d/${fileId}/preview`}
                                      width="100%"
                                      height="80"
                                      allow="autoplay"
                                      style={{ border: 'none', borderRadius: '8px' }}
                                    />
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {errors[`section${section.number}`] && (
                            <span style={{ color: '#ef4444', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                              {errors[`section${section.number}`]}
                            </span>
                          )}
                        </div>

                        {/* Wait Time */}
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                            Wait Time Before Section (seconds)
                          </label>
                          <input
                            type="number"
                            value={section.waitTimeBefore || 0}
                            onChange={(e) => updateSection(section.number, 'waitTimeBefore', parseInt(e.target.value) || 0)}
                            min="0"
                            style={{
                              width: '200px',
                              padding: '0.75rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Section Button */}
                  <button
                    onClick={addSection}
                    style={{
                      width: '100%',
                      padding: '1.5rem',
                      border: '2px dashed #cbd5e1',
                      borderRadius: '0.75rem',
                      background: 'rgba(248, 250, 252, 0.5)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#64748b',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.color = '#8b5cf6';
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.color = '#64748b';
                      e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)';
                    }}
                  >
                    ➕ Add Section {metadata.sections.length + 1}
                  </button>
                </div>

                <div aria-hidden={isEmbedded} style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  border: `1px solid ${listeningMakerTokens.line}`,
                  borderRadius: '0.625rem',
                  background: listeningMakerTokens.inset,
                  display: isEmbedded ? 'none' : 'grid',
                  gap: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <IconSettings size={16} stroke={1.9} aria-hidden="true" style={{ color: listeningMakerTokens.primary }} />
                    <div>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: listeningMakerTokens.ink }}>
                        Audio playback settings
                      </h3>
                      <p style={{ color: listeningMakerTokens.muted, fontSize: '0.75rem', margin: '0.125rem 0 0 0' }}>
                        Configure controls visible during the test.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioControls(AUDIO_CONTROLS_PRESETS.IELTS_STANDARD);
                        setAllowReplay(false);
                      }}
                      style={{
                        ...listeningMakerStyles.compactButton,
                        borderColor: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                        background: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                        color: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.primary : listeningMakerTokens.body,
                      }}
                    >
                      IELTS standard
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioControls(AUDIO_CONTROLS_PRESETS.PRACTICE_MODE);
                        setAllowReplay(true);
                        setMaxReplays(2);
                      }}
                      style={{
                        ...listeningMakerStyles.compactButton,
                        borderColor: audioControls.showPlayPause && audioControls.showSpeedControl ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                        background: audioControls.showPlayPause && audioControls.showSpeedControl ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                        color: audioControls.showPlayPause && audioControls.showSpeedControl ? listeningMakerTokens.primary : listeningMakerTokens.body,
                      }}
                    >
                      Practice mode
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioControls(AUDIO_CONTROLS_PRESETS.RELAXED_MODE);
                        setAllowReplay(false);
                      }}
                      style={{
                        ...listeningMakerStyles.compactButton,
                        borderColor: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                        background: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                        color: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? listeningMakerTokens.primary : listeningMakerTokens.body,
                      }}
                    >
                      Relaxed mode
                    </button>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: listeningMakerTokens.muted, margin: 0 }}>
                    {!audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay
                      ? 'Strict exam conditions: no pause, replay, or speed control.'
                      : audioControls.showPlayPause && audioControls.showSpeedControl
                        ? 'Full controls: pause, replay, and speed control enabled.'
                        : 'Basic controls: pause enabled, no speed control.'}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem 1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showPlayPause}
                        onChange={(e) => setAudioControls({ ...audioControls, showPlayPause: e.target.checked })}
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Allow pause
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      <input
                        type="checkbox"
                        checked={allowReplay}
                        onChange={(e) => setAllowReplay(e.target.checked)}
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Allow replay
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSpeedControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSpeedControl: e.target.checked })}
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Speed control
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSeekControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSeekControl: e.target.checked })}
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Allow seeking
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSkipSection}
                        onChange={(e) => setAudioControls({ ...audioControls, showSkipSection: e.target.checked })}
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Skip to next section
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: listeningMakerTokens.muted }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showVolumeControl}
                        disabled
                        style={{ width: '1rem', height: '1rem', accentColor: listeningMakerTokens.primary }}
                      />
                      Volume always enabled
                    </label>
                  </div>

                  {allowReplay && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: listeningMakerTokens.body }}>
                      Max replays per section
                      <select
                        value={maxReplays}
                        onChange={(e) => setMaxReplays(parseInt(e.target.value))}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.5rem',
                          border: `1px solid ${listeningMakerTokens.line2}`,
                          fontSize: '0.8125rem',
                          background: listeningMakerTokens.surface,
                          color: listeningMakerTokens.ink,
                        }}
                      >
                        <option value={1}>1 time</option>
                        <option value={2}>2 times</option>
                        <option value={3}>3 times</option>
                        <option value={5}>5 times</option>
                        <option value={999}>Unlimited</option>
                      </select>
                    </label>
                  )}
                </div>

                {/* Audio Settings Section */}
                <div aria-hidden="true" style={{
                  display: 'none',
                  marginTop: '2rem',
                  padding: '1.5rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  background: 'rgba(248, 250, 252, 0.5)',
                }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚙️ Audio Playback Settings
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    Configure what audio controls students can see and use during the test.
                  </p>

                  {/* Preset Buttons */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.75rem', fontSize: '0.9375rem' }}>
                      Quick Presets
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.IELTS_STANDARD);
                          setAllowReplay(false);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#3b82f6' : '#e2e8f0',
                          background: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? 'rgba(59, 130, 246, 0.1)' : 'white',
                          color: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#3b82f6' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        📋 IELTS Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.PRACTICE_MODE);
                          setAllowReplay(true);
                          setMaxReplays(2);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: audioControls.showPlayPause && audioControls.showSpeedControl ? '#10b981' : '#e2e8f0',
                          background: audioControls.showPlayPause && audioControls.showSpeedControl ? 'rgba(16, 185, 129, 0.1)' : 'white',
                          color: audioControls.showPlayPause && audioControls.showSpeedControl ? '#10b981' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        🎓 Practice Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.RELAXED_MODE);
                          setAllowReplay(false);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#8b5cf6' : '#e2e8f0',
                          background: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? 'rgba(139, 92, 246, 0.1)' : 'white',
                          color: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#8b5cf6' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        😌 Relaxed Mode
                      </button>
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                      {!audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay
                        ? '🔒 Strict exam conditions: No pause, no replay, no speed control'
                        : audioControls.showPlayPause && audioControls.showSpeedControl
                          ? '✨ Full controls: Pause, replay, speed control enabled'
                          : '⏸️ Basic controls: Pause enabled, no speed control'}
                    </p>
                  </div>

                  {/* Individual Controls */}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showPlayPause}
                        onChange={(e) => setAudioControls({ ...audioControls, showPlayPause: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow students to pause audio</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allowReplay}
                        onChange={(e) => setAllowReplay(e.target.checked)}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow students to replay sections</span>
                    </label>

                    {allowReplay && (
                      <div style={{ marginLeft: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Max replays per section:</span>
                        <select
                          value={maxReplays}
                          onChange={(e) => setMaxReplays(parseInt(e.target.value))}
                          style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.875rem',
                          }}
                        >
                          <option value={1}>1 time</option>
                          <option value={2}>2 times</option>
                          <option value={3}>3 times</option>
                          <option value={5}>5 times</option>
                          <option value={999}>Unlimited</option>
                        </select>
                      </div>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSpeedControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSpeedControl: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Show playback speed control (0.5x - 2x)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSeekControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSeekControl: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow seeking (drag progress bar)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSkipSection}
                        onChange={(e) => setAudioControls({ ...audioControls, showSkipSection: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow skipping to next section</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', opacity: 0.6 }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showVolumeControl}
                        disabled
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Show volume control</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(always enabled for accessibility)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Questions Text & AI Parsing */}
            {currentStep === 'questions-text' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
                  <span style={{
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '0.625rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: listeningMakerTokens.selected,
                    color: listeningMakerTokens.primary,
                  }}>
                    <IconSparkles size={18} stroke={1.9} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: listeningMakerTokens.ink }}>
                      Question text
                    </h2>
                    <p style={{ margin: '0.125rem 0 0 0', color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                      Paste or upload source text, then parse into editable questions.
                    </p>
                  </div>
                </div>

                <div style={{ ...listeningMakerStyles.strip, marginBottom: '0.75rem' }}>
                  <IconInfoCircle size={16} stroke={1.9} aria-hidden="true" style={{ color: listeningMakerTokens.primary, flexShrink: 0 }} />
                  <p style={{ margin: 0, color: listeningMakerTokens.body, fontSize: '0.8125rem' }}>
                    Auto-parse extracts question text, answer limits, choices, and answer fields. Manual creation remains available after skipping.
                  </p>
                </div>
                <h2 aria-hidden="true" style={{ display: 'none' }}>
                  🤖 AI Question Parsing
                </h2>

                <p aria-hidden="true" style={{ display: 'none' }}>
                  Paste your questions below and let AI parse them automatically, or skip to add questions manually.
                </p>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Paste Questions Text
                  </label>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Paste all 40 questions here. Our AI will parse them automatically.

Example:
Questions 1-10
Complete the sentences below.
Write NO MORE THAN TWO WORDS for each answer.

1. The museum is located in the __________ part of the city.
2. Visitors must pay __________ to enter.
..."
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: `1px solid ${listeningMakerTokens.line2}`,
                      fontSize: '0.8125rem',
                      fontFamily: 'monospace',
                      color: listeningMakerTokens.ink,
                      background: listeningMakerTokens.surface,
                    }}
                  />
                </div>

                {errors.parsing && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    color: '#dc2626',
                    fontSize: '0.875rem'
                  }}>
                    ❌ {errors.parsing}
                  </div>
                )}

                {isParsing && (
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '0.5rem' }}>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#3b82f6' }}>
                      {parsingStage}
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: '#dbeafe',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${parsingProgress}%`,
                        height: '100%',
                        background: listeningMakerTokens.primary,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={handleNext}>
                    Add manually
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleParseQuestions}
                    disabled={isParsing || !questionText.trim()}
                    style={{
                      background: isParsing ? listeningMakerTokens.dim : listeningMakerTokens.primary,
                      border: 'none'
                    }}
                  >
                    {isParsing ? 'Parsing...' : 'Parse with AI'}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3b: Question Images Upload (for image mode) */}
            {currentStep === 'questions-images' && (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <h2 aria-hidden="true" style={{ display: 'none' }}>
                  🖼️ Upload Question Images by Section
                </h2>
                <p aria-hidden="true" style={{ display: 'none' }}>
                  Upload images for each section. Set the question range for each image.
                  When students click a question, the matching image will be displayed.
                </p>

                {/* Section rail and active image workspace */}
                {metadata.sections.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    background: 'rgba(239, 68, 68, 0.05)',
                    borderRadius: '0.75rem',
                    color: '#dc2626',
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                    <p style={{ fontWeight: 600 }}>No audio sections configured!</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      Please go back to the Audio step and configure at least one section with audio.
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(12rem, 15rem) minmax(0, 1fr)',
                    gap: 0,
                    alignItems: 'stretch',
                  }}>
                    <aside
                      aria-label="Listening image sections"
                      style={{
                        display: 'grid',
                        alignContent: 'start',
                        gap: '0.75rem',
                        borderRight: `1px solid ${listeningMakerTokens.line}`,
                        padding: '0.25rem 1rem 0.25rem 0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: listeningMakerTokens.ink, fontSize: '0.8125rem', fontWeight: 800 }}>
                          Sections
                        </span>
                        <span style={{
                          ...listeningMakerStyles.pill,
                          background: listeningMakerTokens.inset,
                          color: listeningMakerTokens.muted,
                        }}>
                          {metadata.sections.length} section{metadata.sections.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {metadata.sections.map((section) => {
                          const isActiveSection = section.number === activeAnswerSection.number;
                          const imageCount = questionImages.filter(image => image.sectionNumber === section.number).length;
                          return (
                            <button
                              key={`image-section-nav-${section.number}`}
                              type="button"
                              onClick={() => {
                                trackAction('listeningImageSectionSelected', {
                                  source: 'listening_builder',
                                  step: currentStep,
                                  sectionNumber: section.number,
                                });
                                setActiveAnswerSectionNumber(section.number);
                              }}
                              aria-pressed={isActiveSection}
                              style={{
                                border: `1px solid ${isActiveSection ? listeningMakerTokens.selectedBorder : 'transparent'}`,
                                borderLeft: `4px solid ${isActiveSection ? listeningMakerTokens.primary : 'transparent'}`,
                                borderRadius: '0.75rem',
                                background: isActiveSection ? listeningMakerTokens.surface : 'rgba(255, 255, 255, 0.58)',
                                boxShadow: isActiveSection ? listeningMakerTokens.shadowCard : 'none',
                                color: listeningMakerTokens.ink,
                                cursor: 'pointer',
                                padding: '0.6875rem 0.75rem',
                                textAlign: 'left',
                                display: 'grid',
                                gap: '0.25rem',
                              }}
                            >
                              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                                <strong style={{ fontSize: '0.8125rem' }}>Section {section.number}</strong>
                                <span style={{
                                  ...listeningMakerStyles.pill,
                                  background: imageCount > 0 ? '#dcfce7' : '#fef3c7',
                                  color: imageCount > 0 ? '#047857' : '#b45309',
                                }}>
                                  {imageCount} image{imageCount === 1 ? '' : 's'}
                                </span>
                              </span>
                              <span style={{ color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                                Q{section.startQuestion}-{section.endQuestion}
                              </span>
                              {!section.audioUrl ? (
                                <span style={{ color: '#b45309', fontSize: '0.6875rem', fontWeight: 700 }}>
                                  Audio needed
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>

                    </aside>

                    <div style={{
                      minWidth: 0,
                      paddingLeft: '1rem',
                    }}>
                      {!activeAnswerSection.audioUrl ? (
                        <div style={{
                          minHeight: '13rem',
                          display: 'grid',
                          placeItems: 'center',
                          padding: '1.25rem',
                        }}>
                          <AssessmentStatusState
                            variant="empty"
                            title={`Section ${activeAnswerSection.number} needs audio`}
                            titleLevel={3}
                            align="center"
                            message={<p>Use the Audio step before adding question images for this section.</p>}
                          />
                        </div>
                      ) : (() => {
                      const section = activeAnswerSection;
                      // Get images for this section, sorted by start question
                      const sectionImages = questionImages
                        .filter(img => img.sectionNumber === section.number)
                        .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

                      // Calculate if any image needs its end point set
                      const hasMultipleImages = sectionImages.length > 1;

                      return (
                        <div
                          key={section.number}
                          style={{
                            display: 'grid',
                            gap: '1rem',
                          }}
                        >
                          {/* Section Header */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                            paddingBottom: '0.8125rem',
                            borderBottom: `1px solid ${listeningMakerTokens.line}`,
                          }}>
                            <div style={{ display: 'grid', gap: '0.2rem' }}>
                              <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: 0, color: listeningMakerTokens.ink }}>
                                Section {section.number}: {section.name}
                              </h3>
                              <p style={{ fontSize: '0.8125rem', color: listeningMakerTokens.muted, margin: 0 }}>
                                Questions {section.startQuestion} - {section.endQuestion} ({section.endQuestion - section.startQuestion + 1} questions)
                              </p>
                            </div>

                            {/* Add Image Button */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="file"
                                accept="image/*,.png,.jpg,.jpeg,.gif,.webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    trackAction('listeningQuestionImageUploadRequested', {
                                      source: 'listening_builder',
                                      step: currentStep,
                                      sectionNumber: section.number,
                                      fileType: file.type,
                                      fileSizeBytes: file.size,
                                    });
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      const dataUrl = event.target?.result as string;
                                      handleAddImage(section, dataUrl);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                  e.target.value = '';
                                }}
                                style={{ display: 'none' }}
                                id={`section-${section.number}-upload`}
                              />

                              {/* Paste Button */}
                              <button
                                type="button"
                                onClick={async () => {
                                  trackAction('listeningQuestionImagePasteRequested', {
                                    source: 'listening_builder',
                                    step: currentStep,
                                    sectionNumber: section.number,
                                  });
                                  try {
                                    const items = await navigator.clipboard.read();
                                    let foundImage = false;

                                    for (const item of items) {
                                      const imageType = item.types.find(type => type.startsWith('image/'));
                                      if (imageType) {
                                        foundImage = true;
                                        const blob = await item.getType(imageType);
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          const dataUrl = event.target?.result as string;
                                          handleAddImage(section, dataUrl);
                                        };
                                        reader.readAsDataURL(blob);
                                        break; // Only paste one image at a time
                                      }
                                    }

                                    if (!foundImage) {
                                      toast.warning('No image found in clipboard. Copy an image first.');
                                    }
                                  } catch (err) {
                                    console.error('Clipboard paste failed:', err);
                                    // Fallback for Firefox or if permission denied
                                    const textarea = document.createElement('textarea');
                                    textarea.style.position = 'fixed';
                                    textarea.style.opacity = '0';
                                    document.body.appendChild(textarea);
                                    textarea.focus();

                                    try {
                                      document.execCommand('paste');
                                      // This basic fallback usually handles text, not images well, 
                                      // so we mainly rely on the API or show instruction
                                      toast.warning('Allow clipboard access or use Ctrl+V on the page if a prompt appears.');
                                    } catch (e) {
                                      toast.error('Clipboard access denied. Use the Add Image button instead.');
                                    } finally {
                                      document.body.removeChild(textarea);
                                    }
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.5rem',
                                  color: '#64748b',
                                  fontWeight: 600,
                                  fontSize: '0.875rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f8fafc';
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'white';
                                  e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                              >
                                Paste
                              </button>

                              <button
                                type="button"
                                onClick={() => document.getElementById(`section-${section.number}-upload`)?.click()}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: listeningMakerTokens.primary,
                                  border: 'none',
                                  borderRadius: '0.5rem',
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '0.875rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                }}
                              >
                                Add image
                              </button>
                            </div>
                          </div>

                          {/* Images for this section */}
                          {sectionImages.length === 0 ? (
                            <div style={{
                              textAlign: 'center',
                              padding: '2rem',
                              background: 'rgba(248, 250, 252, 0.8)',
                              borderRadius: '0.5rem',
                              border: '2px dashed #cbd5e1',
                            }}>
                              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
                              <p style={{ color: '#64748b', margin: 0, fontWeight: 500 }}>
                                No images yet
                              </p>
                              <p style={{ color: '#94a3b8', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                                Click "Add Image" to upload. The first image will cover Q{section.startQuestion}-{section.endQuestion} by default.
                              </p>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              {sectionImages.map((img, imgIdx) => {
                                // Find the global index for this image
                                const globalIdx = questionImages.findIndex(
                                  qi => qi.sectionNumber === img.sectionNumber &&
                                    qi.imageUrl === img.imageUrl
                                );

                                const isFirstImage = imgIdx === 0;
                                const isLastImage = imgIdx === sectionImages.length - 1;
                                const prevImage = imgIdx > 0 ? sectionImages[imgIdx - 1] : null;

                                // Calculate the expected start based on previous image
                                const expectedStart = prevImage
                                  ? (prevImage.questionRange?.end || section.startQuestion) + 1
                                  : section.startQuestion;

                                // Check if this image needs attention (start doesn't match expected for non-first images)
                                const needsStartAdjustment = !isFirstImage &&
                                  (img.questionRange?.start !== expectedStart);

                                // For first image when there are multiple, check if end is properly set (not at max when there are more images)
                                const needsEndSet = hasMultipleImages && !isLastImage &&
                                  (img.questionRange?.end === section.endQuestion);

                                return (
                                  <div
                                    key={`sec${section.number}-img${imgIdx}`}
                                    style={{
                                      display: 'flex',
                                      gap: '1rem',
                                      padding: '1rem',
                                      border: needsEndSet ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                      borderRadius: '0.75rem',
                                      background: needsEndSet ? 'rgba(245, 158, 11, 0.05)' : 'white',
                                      alignItems: 'flex-start',
                                    }}
                                  >
                                    {/* Image Preview */}
                                    <div style={{ flexShrink: 0 }}>
                                      <img
                                        src={img.imageUrl}
                                        alt={`Section ${section.number} - Image ${imgIdx + 1}`}
                                        style={{
                                          width: '120px',
                                          height: '90px',
                                          objectFit: 'cover',
                                          borderRadius: '0.5rem',
                                          border: '1px solid #e2e8f0',
                                        }}
                                      />
                                    </div>

                                    {/* Image Info & Controls */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {/* Header row */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <span style={{ fontWeight: 600, color: '#8b5cf6', fontSize: '0.9375rem' }}>
                                          📄 Image {imgIdx + 1} of {sectionImages.length}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setQuestionImages(prev => {
                                              const updated = prev.filter((_, i) => i !== globalIdx);
                                              // If we're removing a non-last image, update the next image's start
                                              // to cascade properly
                                              return updated;
                                            });
                                          }}
                                          style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: 'none',
                                            borderRadius: '0.375rem',
                                            padding: '0.375rem 0.75rem',
                                            color: '#dc2626',
                                            fontSize: '0.8125rem',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      {/* Warning for needing end point */}
                                      {needsEndSet && (
                                        <div style={{
                                          padding: '0.5rem 0.75rem',
                                          background: 'rgba(245, 158, 11, 0.1)',
                                          borderRadius: '0.375rem',
                                          marginBottom: '0.75rem',
                                          fontSize: '0.8125rem',
                                          color: '#b45309',
                                        }}>
                                          <strong>Set the end question</strong> for this image to define where the next image starts.
                                        </div>
                                      )}

                                      {/* Question Range Controls */}
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.75rem',
                                        background: 'rgba(139, 92, 246, 0.05)',
                                        borderRadius: '0.5rem',
                                      }}>
                                        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
                                          Questions:
                                        </span>

                                        {/* Start Question */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          {isFirstImage ? (
                                            // First image: Start is always section start (read-only)
                                            <span style={{
                                              padding: '0.5rem 0.75rem',
                                              background: '#f1f5f9',
                                              borderRadius: '0.375rem',
                                              fontWeight: 600,
                                              color: '#1e293b',
                                              fontSize: '0.9375rem',
                                              minWidth: '45px',
                                              textAlign: 'center',
                                            }}>
                                              {section.startQuestion}
                                            </span>
                                          ) : (
                                            // Subsequent images: Start is auto-calculated (read-only, shows expected)
                                            <span style={{
                                              padding: '0.5rem 0.75rem',
                                              background: needsStartAdjustment ? '#fef3c7' : '#f1f5f9',
                                              borderRadius: '0.375rem',
                                              fontWeight: 600,
                                              color: needsStartAdjustment ? '#b45309' : '#1e293b',
                                              fontSize: '0.9375rem',
                                              minWidth: '45px',
                                              textAlign: 'center',
                                            }}>
                                              {expectedStart}
                                            </span>
                                          )}
                                        </div>

                                        <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '1rem' }}>→</span>

                                        {/* End Question - Editable */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <input
                                            type="number"
                                            min={isFirstImage ? section.startQuestion : expectedStart}
                                            max={section.endQuestion}
                                            value={img.questionRange?.end || section.endQuestion}
                                            onChange={(e) => {
                                              const newEnd = Math.max(
                                                isFirstImage ? section.startQuestion : expectedStart,
                                                Math.min(parseInt(e.target.value) || section.endQuestion, section.endQuestion)
                                              );

                                              setQuestionImages(prev => {
                                                // Update this image's end
                                                let updated = prev.map((item, i) =>
                                                  i === globalIdx
                                                    ? {
                                                      ...item,
                                                      questionRange: {
                                                        start: isFirstImage ? section.startQuestion : expectedStart,
                                                        end: newEnd
                                                      }
                                                    }
                                                    : item
                                                );

                                                // Also update subsequent images' start values in this section
                                                const sectionImgIndices = updated
                                                  .map((img, idx) => ({ img, idx }))
                                                  .filter(item => item.img.sectionNumber === section.number)
                                                  .sort((a, b) => (a.img.questionRange?.start || 0) - (b.img.questionRange?.start || 0));

                                                // Find position of current image in section
                                                const currentPosInSection = sectionImgIndices.findIndex(item => item.idx === globalIdx);

                                                // Update all images after this one
                                                for (let i = currentPosInSection + 1; i < sectionImgIndices.length; i++) {
                                                  const previousEntry = sectionImgIndices[i - 1];
                                                  const currentEntry = sectionImgIndices[i];
                                                  if (!previousEntry || !currentEntry) continue;
                                                  const prevImg = previousEntry.img;
                                                  const currentIdx = currentEntry.idx;
                                                  const newStart = (prevImg.questionRange?.end || section.startQuestion) + 1;

                                                  updated = updated.map((item, idx) =>
                                                    idx === currentIdx
                                                      ? {
                                                        ...item,
                                                        questionRange: {
                                                          start: newStart,
                                                          end: Math.max(newStart, item.questionRange?.end || section.endQuestion)
                                                        }
                                                      }
                                                      : item
                                                  );
                                                }

                                                return updated;
                                              });
                                            }}
                                            style={{
                                              width: '65px',
                                              padding: '0.5rem',
                                              border: needsEndSet ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                              borderRadius: '0.375rem',
                                              fontSize: '0.9375rem',
                                              textAlign: 'center',
                                              fontWeight: 600,
                                              background: needsEndSet ? '#fffbeb' : 'white',
                                            }}
                                          />
                                        </div>

                                        {/* Question count badge */}
                                        <span style={{
                                          marginLeft: 'auto',
                                          padding: '0.25rem 0.5rem',
                                          background: '#8b5cf6',
                                          color: 'white',
                                          borderRadius: '9999px',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                        }}>
                                          {((img.questionRange?.end || section.endQuestion) - (isFirstImage ? section.startQuestion : expectedStart) + 1)} Qs
                                        </span>
                                      </div>

                                      {/* Help text */}
                                      <p style={{
                                        fontSize: '0.75rem',
                                        color: '#94a3b8',
                                        margin: '0.5rem 0 0 0',
                                      }}>
                                        {isLastImage && hasMultipleImages
                                          ? `This is the last image. It will cover Q${expectedStart}-${img.questionRange?.end || section.endQuestion}.`
                                          : !hasMultipleImages
                                            ? `This image covers all questions in this section (${section.startQuestion}-${section.endQuestion}).`
                                            : `Set the end question. The next image will start at Q${(img.questionRange?.end || section.endQuestion) + 1}.`
                                        }
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Coverage Summary for this section */}
                          {sectionImages.length > 0 && (
                            <div style={{
                              marginTop: '1rem',
                              padding: '0.75rem',
                              background: 'rgba(139, 92, 246, 0.05)',
                              borderRadius: '0.5rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}>
                              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                Coverage: {sectionImages.map((img, idx) => {
                                  const prevImg = idx > 0 ? sectionImages[idx - 1] : null;
                                  const start = idx === 0
                                    ? section.startQuestion
                                    : (prevImg?.questionRange?.end || section.startQuestion) + 1;
                                  return `Q${start}-${img.questionRange?.end || '?'}`;
                                }).join(', ')}
                              </span>
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                background: '#10b981',
                                color: 'white',
                                borderRadius: '9999px',
                                fontWeight: 600,
                              }}>
                                {sectionImages.length} image{sectionImages.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                  </div>
                )}

                {/* Summary */}
                {questionImages.length > 0 && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(16, 185, 129, 0.05)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}>
                    <p style={{ color: '#10b981', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>
                      {questionImages.length} image{questionImages.length > 1 ? 's' : ''} configured across {
                        new Set(questionImages.map(img => img.sectionNumber)).size
                      } section{new Set(questionImages.map(img => img.sectionNumber)).size > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            )}


            {/* STEP 4: Questions or Answer Key */}
            {currentStep === 'questions' && (
              <AssessmentAuthoringSection
                title={displayMode === 'image'
                  ? `Answer key (${questions.length} Questions)`
                  : `Questions (${questions.length}/${metadata.totalQuestions})`
                }
                action={displayMode !== 'image' ? (
                    <Button variant="primary" onClick={addQuestion}>
                      + Add Question
                    </Button>
                ) : undefined}
              >

                {displayMode === 'image' && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {metadata.sections.map((section) => {
                        const isActive = activeAnswerSection && section.number === activeAnswerSection.number;
                        return (
                          <button
                            key={`answer-section-${section.number}`}
                            type="button"
                            onClick={() => setActiveAnswerSectionNumber(section.number)}
                            style={{
                              ...listeningMakerStyles.compactButton,
                              background: isActive ? listeningMakerTokens.selected : listeningMakerTokens.surface,
                              borderColor: isActive ? listeningMakerTokens.selectedBorder : listeningMakerTokens.line,
                              color: isActive ? listeningMakerTokens.primary : listeningMakerTokens.body,
                            }}
                          >
                            Section {section.number}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '0.75rem',
                      alignItems: 'stretch',
                    }}>
                      <div style={{
                        border: `1px solid ${listeningMakerTokens.line}`,
                        borderRadius: '0.625rem',
                        background: listeningMakerTokens.surface,
                        overflow: 'hidden',
                        minHeight: '20rem',
                        display: 'flex',
                        flexDirection: 'column',
                      }}>
                        <div style={{
                          padding: '0.75rem',
                          borderBottom: `1px solid ${listeningMakerTokens.line}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                        }}>
                          <div>
                            <h3 style={{ margin: 0, color: listeningMakerTokens.ink, fontSize: '0.875rem', fontWeight: 700 }}>
                              Section {activeAnswerSection.number}: Questions {activeAnswerSection.startQuestion}-{activeAnswerSection.endQuestion}
                            </h3>
                            <p style={{ margin: '0.125rem 0 0 0', color: listeningMakerTokens.muted, fontSize: '0.75rem' }}>
                              {activeAnswerSectionImages.length} image{activeAnswerSectionImages.length === 1 ? '' : 's'} uploaded
                            </p>
                          </div>
                          <span style={{ ...listeningMakerStyles.pill, background: listeningMakerTokens.inset, color: listeningMakerTokens.muted }}>
                            Image
                          </span>
                        </div>

                        <div style={{
                          flex: 1,
                          minHeight: 0,
                          background: listeningMakerTokens.inset,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0.75rem',
                        }}>
                          {activeAnswerImage ? (
                            <img
                              src={activeAnswerImage.imageUrl}
                              alt={`Section ${activeAnswerSection.number} question page`}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '22rem',
                                objectFit: 'contain',
                                borderRadius: '0.5rem',
                                border: `1px solid ${listeningMakerTokens.line}`,
                                background: listeningMakerTokens.surface,
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              minHeight: '14rem',
                              border: `1px dashed ${listeningMakerTokens.line2}`,
                              borderRadius: '0.625rem',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              color: listeningMakerTokens.muted,
                              textAlign: 'center',
                            }}>
                              <IconPhoto size={28} stroke={1.6} aria-hidden="true" />
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>No image for this section</span>
                              <span style={{ fontSize: '0.75rem' }}>Return to Images to upload question pages.</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{
                        border: `1px solid ${listeningMakerTokens.line}`,
                        borderRadius: '0.625rem',
                        background: listeningMakerTokens.surface,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '20rem',
                      }}>
                        <div style={{
                          padding: '0.75rem',
                          borderBottom: `1px solid ${listeningMakerTokens.line}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                        }}>
                          <h3 style={{ margin: 0, color: listeningMakerTokens.ink, fontSize: '0.875rem', fontWeight: 700 }}>
                            Answer key - {activeAnswerQuestions.length}
                          </h3>
                          <details style={{ position: 'relative' }}>
                            <summary style={{
                              listStyle: 'none',
                              cursor: 'pointer',
                              color: listeningMakerTokens.primary,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}>
                              Bulk paste
                            </summary>
                            <div style={{
                              position: 'absolute',
                              right: 0,
                              top: '1.75rem',
                              width: 'min(22rem, 78vw)',
                              padding: '0.75rem',
                              background: listeningMakerTokens.surface,
                              border: `1px solid ${listeningMakerTokens.line}`,
                              borderRadius: '0.625rem',
                              boxShadow: listeningMakerTokens.shadowModal,
                              zIndex: 5,
                              display: 'grid',
                              gap: '0.5rem',
                            }}>
                              <textarea
                                value={bulkAnswerKey}
                                onChange={(e) => setBulkAnswerKey(e.target.value)}
                                placeholder="1. Answer A&#10;2. Answer B&#10;...or just paste list"
                                rows={4}
                                style={{
                                  ...listeningMakerStyles.control,
                                  padding: '0.625rem',
                                  fontFamily: 'monospace',
                                  resize: 'vertical',
                                }}
                              />
                              <button
                                type="button"
                                onClick={handleBulkParseAnswers}
                                disabled={!bulkAnswerKey.trim() || isParsing}
                                style={{
                                  justifySelf: 'end',
                                  border: 'none',
                                  borderRadius: '999px',
                                  padding: '0.5rem 0.875rem',
                                  background: isParsing ? listeningMakerTokens.dim : listeningMakerTokens.primary,
                                  color: '#fff',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: isParsing ? 'wait' : 'pointer',
                                }}
                              >
                                {isParsing ? 'Analyzing...' : 'Auto-fill answers'}
                              </button>
                            </div>
                          </details>
                        </div>

                        {activeAnswerQuestions.length === 0 ? (
                          <div style={{ padding: '1rem' }}>
                            <AssessmentStatusState
                              variant="empty"
                              title="No answer rows yet"
                              titleLevel={3}
                              align="center"
                              message={<p>Continue from Images to create the answer key rows.</p>}
                            />
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.5rem', padding: '0.75rem', overflowY: 'auto', maxHeight: '24rem' }}>
                            {activeAnswerQuestions.map((q) => {
                              const globalQuestionIndex = questions.findIndex(question => question.number === q.number);
                              return (
                                <label
                                  key={`answer-row-${q.number}`}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2rem minmax(0, 1fr)',
                                    gap: '0.5rem',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span style={{
                                    height: '1.625rem',
                                    borderRadius: '0.375rem',
                                    background: listeningMakerTokens.inset,
                                    border: `1px solid ${listeningMakerTokens.line}`,
                                    color: listeningMakerTokens.body,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}>
                                    {q.number}
                                  </span>
                                  <input
                                    type="text"
                                    value={q.answer}
                                    onChange={(e) => {
                                      if (globalQuestionIndex >= 0) {
                                        updateQuestion(globalQuestionIndex, 'answer', e.target.value);
                                      }
                                    }}
                                    placeholder="Type answer..."
                                    style={{
                                      ...listeningMakerStyles.control,
                                      padding: '0.5rem 0.625rem',
                                    }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {false && displayMode === 'image' && (
                  <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                    <p style={{ color: '#64748b', marginBottom: '1rem', marginTop: 0 }}>
                      <strong>Since questions are on the images,</strong> you only need to provide the answer key.
                      <br />
                      You can fill answers manually below, or paste a list to auto-fill.
                    </p>

                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                      <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#475569' }}>
                        ⚡ Bulk Import (Auto-Fill)
                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>(Paste one answer per line)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <textarea
                          value={bulkAnswerKey}
                          onChange={(e) => setBulkAnswerKey(e.target.value)}
                          placeholder="1. Answer A&#10;2. Answer B&#10;...or just paste list"
                          rows={4}
                          style={{
                            flex: 1,
                            padding: '0.75rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '0.5rem',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <Button
                            onClick={handleBulkParseAnswers}
                            variant="secondary"
                            disabled={!bulkAnswerKey.trim() || isParsing}
                            style={{
                              background: isParsing ? '#e2e8f0' : '#e0e7ff',
                              color: isParsing ? '#94a3b8' : '#4338ca',
                              border: '1px solid #c7d2fe',
                              cursor: isParsing ? 'wait' : 'pointer'
                            }}
                          >
                            {isParsing ? '✨ Analyzing...' : '🪄 Auto-Fill Answers'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {displayMode === 'image' ? null : questions.length === 0 ? (
                  <AssessmentStatusState
                    variant="empty"
                    title="No questions added yet"
                    titleLevel={3}
                    align="center"
                    message={<p>Click "Add Question" to start.</p>}
                  />
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {questions.map((q, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          background: displayMode === 'image' ? 'white' : 'white',
                          display: 'flex',
                          alignItems: 'center', // Align center vertically
                          gap: '1rem',
                        }}
                      >
                        {/* Question Number */}
                        <div style={{
                          width: '3rem',
                          height: '3rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f1f5f9',
                          borderRadius: '0.375rem',
                          fontWeight: 700,
                          color: '#475569',
                          flexShrink: 0
                        }}>
                          Q{q.number}
                        </div>

                        {/* Editor Area */}
                        <div style={{ flex: 1 }}>
                          {displayMode === 'image' ? (
                            /* Image Mode: Only Answer */
                            <input
                              type="text"
                              value={q.answer}
                              onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                              placeholder={`Enter answer for Question ${q.number}`}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #cbd5e1', // Slightly darker border for connection
                                borderRadius: '0.375rem',
                                fontWeight: 500,
                                fontSize: '1rem'
                              }}
                            />
                          ) : (
                            /* Text Mode: Full Editor */
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#64748b' }}>Question Text</span>
                                <button
                                  onClick={() => deleteQuestion(idx)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                              <input
                                type="text"
                                value={q.question}
                                onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                                placeholder="Question text..."
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.375rem',
                                  marginBottom: '0.5rem',
                                }}
                              />
                              <input
                                type="text"
                                value={q.answer}
                                onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                                placeholder="Answer..."
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.375rem',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AssessmentAuthoringSection>
            )}

            {/* STEP 4: Review */}
            {currentStep === 'review' && (
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                  Review & Publish
                </h2>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontWeight: '600', marginBottom: '0.75rem' }}>Test Information</h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                          Title *
                        </label>
                        <input
                          type="text"
                          value={metadata.title}
                          onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                          placeholder="e.g., IELTS Listening Practice Test 1"
                          style={{
                            width: '100%',
                            padding: '0.625rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '0.5rem',
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                            Duration (minutes)
                          </label>
                          <input
                            type="number"
                            value={metadata.duration}
                            onChange={(e) => setMetadata({ ...metadata, duration: parseInt(e.target.value) || 0 })}
                            min="1"
                            style={{
                              width: '100%',
                              padding: '0.625rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                            Description (optional)
                          </label>
                          <input
                            type="text"
                            value={metadata.description}
                            onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                            placeholder="Brief description..."
                            style={{
                              width: '100%',
                              padding: '0.625rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <p style={{ marginTop: '0.75rem' }}><strong>Type:</strong> {metadata.type} &bull; <strong>Questions:</strong> {questions.length}</p>

                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => setIsPublic(e.target.checked)}
                          style={{ width: '1.25rem', height: '1.25rem' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>Make Publicly Available</span>
                          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            If checked, this test will appear in the Public Library for other teachers.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Audio Sections</h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {metadata.sections.map(s => (
                        <div
                          key={s.number}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            padding: '0.625rem 0.75rem',
                            border: `1px solid ${listeningMakerTokens.line}`,
                            borderRadius: '0.5rem',
                            background: listeningMakerTokens.surface,
                          }}
                        >
                          <span style={{ color: listeningMakerTokens.body, fontSize: '0.8125rem', fontWeight: 700 }}>
                            Section {s.number}
                          </span>
                          <span style={{
                            ...listeningMakerStyles.pill,
                            background: s.audioUrl ? listeningMakerTokens.successTint : listeningMakerTokens.dangerTint,
                            color: s.audioUrl ? listeningMakerTokens.success : listeningMakerTokens.danger,
                          }}>
                            {s.audioUrl ? 'Configured' : 'Missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ListeningPublishReadinessPanel
                    mode={publishReadinessMode}
                    blockers={publishReadinessBlockers}
                    checkedSections={publishReadinessCheckedSections}
                  />

                  {errors.save && (
                    <div style={{
                      padding: '1rem',
                      background: '#fef2f2',
                      border: '1px solid #ef4444',
                      borderRadius: '0.5rem',
                      color: '#ef4444',
                    }}>
                      {errors.save}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

            {/* Navigation Buttons */}
            <ListeningSavePublishBar
              onBack={handleBack}
              onNext={currentStep === 'questions-text' ? undefined : handleNext}
              onSaveDraft={handleSaveDraft}
              onPublish={handlePublish}
              onDiscard={() => openDiscardConfirmation('saved-draft')}
              nextLabel="Next →"
              pendingAction={pendingAction}
              canDiscard={canDiscard}
              showNext={currentStep !== 'review' && currentStep !== 'questions-text'}
              actionsDisabled={Boolean(discardedDraft) || lifecyclePendingAction !== null}
              trailingContent={(
                <ListeningLifecycleActions
                  canRestore={Boolean(discardedDraft)}
                  canArchive={Boolean(publishedVersion) && !isPublishedVersionArchived}
                  pendingAction={lifecyclePendingAction}
                  onRestore={handleRestoreDraft}
                  onArchive={handleArchivePublishedVersion}
                />
              )}
            />

            {draftStatusMode === 'discard-pending' && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Discard draft changes"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  background: 'rgba(15, 23, 42, 0.32)',
                  backdropFilter: 'blur(3px)',
                }}
              >
                <div
                  style={{
                    width: 'min(30rem, 100%)',
                    borderRadius: '0.875rem',
                    border: `1px solid ${listeningMakerTokens.line2}`,
                    background: listeningMakerTokens.surface,
                    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)',
                    padding: '1.25rem',
                    display: 'grid',
                    gap: '0.875rem',
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: listeningMakerTokens.ink }}>
                      Discard draft changes?
                    </h3>
                    <p style={{ margin: 0, color: listeningMakerTokens.body, fontSize: '0.875rem', lineHeight: 1.55 }}>
                      {discardContext === 'navigation-away'
                        ? 'Going back now will discard unsaved draft changes. Keep editing, or discard and continue.'
                        : 'This removes the current draft changes. Published tests stay separate.'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Button variant="glass" onClick={handleDiscardCancelled}>
                      Keep editing
                    </Button>
                    <Button variant="outline" onClick={handleDiscardConfirmed} disabled={pendingAction === 'discard'}>
                      Discard now
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div style={{
              display: 'none',
              justifyContent: 'space-between',
              marginTop: '2rem',
              paddingTop: '2rem',
              borderTop: '1px solid #e2e8f0',
            }}>
              {/* Show Back button for all steps (handles navigation on first step) */}
              <Button variant="glass" onClick={handleBack}>
                {currentStep === 'mode-select' ? '← Back' : '← Back'}
              </Button>



              {currentStep !== 'review' ? (
                <Button variant="primary" onClick={handleNext} style={{ marginLeft: 'auto' }}>
                  Next →
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handlePublish}
                  disabled={isSaving}
                  style={{ marginLeft: 'auto' }}
                >
                  {isSaving ? 'Publishing...' : 'Publish'}
                </Button>
              )}
            </div>
        </section>
      </div>
    </main>
  );
};

export default ListeningTestBuilder;
