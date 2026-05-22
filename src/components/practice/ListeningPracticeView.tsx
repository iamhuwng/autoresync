/**
 * ListeningPracticeView — PRD-0045 Phase 5.0
 *
 * Solo/homework host for the mobile-first IELTS Listening interface.
 * Mirrors IELTSPracticeView's hook orchestration pattern but delegates
 * rendering to MobileListeningExamScaffold (phone-optimised layout).
 *
 * Responsibilities:
 *   1. Load test data via useSoloTestData
 *   2. Manage timer via useSoloTimer
 *   3. Persist progress via useSoloAutoSave
 *   4. Detect previous progress via useSoloResume
 *   5. Submit & grade via useSoloSubmission
 *   6. Enforce overlay precedence (close transient surfaces on blocking states)
 *   7. Mobile-specific submission confirmation (MobileListeningSubmitSheet)
 *   8. Anti-cheat / integrity for homework mode
 *
 * No @mantine/* imports.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigation } from '../../hooks/useNavigation';
import { storage } from '../../core/platform/storage';
import { useMobileExamMode } from '../../core/platform/hooks/useMobileExamMode';

// Mobile Listening scaffold & components (PRD-0045)
import { MobileListeningExamScaffold } from '../test/mobile/MobileListeningExamScaffold';
import type { ListeningPartInfo } from '../test/mobile/MobileListeningSubmitSheet';
import { MobileListeningImageCanvas } from '../test/mobile/MobileListeningImageCanvas';
import type { ImageZoomState } from '../test/mobile/MobileListeningImageCanvas';
import { MobileListeningAnswerSheet } from '../test/mobile/MobileListeningAnswerSheet';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from '../test/mobile/mobileListeningLayering';
import {
  getListeningTextSizeStorageKey,
  hydrateListeningMobileState,
  isCompatibleListeningMobileState,
  serializeListeningMobileState,
  type ListeningCompatContext,
} from '../test/mobile/mobileListeningState';
import { MobileStartScreen } from '../test/mobile/MobileStartScreen';

// Listening-specific components
import { AudioPlayer } from '../../skills/listening/components/AudioPlayer';
import { ListeningQuestionDisplay } from '../../skills/listening/components/ListeningQuestionDisplay';
import { SectionRubricBlock } from '../../skills/listening/components/SectionRubricBlock';

// Desktop listening layout components (used when !isMobileExamMode)
import { ListeningHeader } from '../../skills/listening/components/ListeningHeader';
import { ListeningNavArrows } from '../../skills/listening/components/ListeningNavArrows';
import { ListeningQuestionNav } from '../../skills/listening/components/ListeningQuestionNav';
import { ListeningImageModeDisplay } from '../../skills/listening/components/ListeningImageModeDisplay';

// Types from listening storage
import type { ListeningDisplayMode, QuestionImage } from '../../services/listeningTestStorage';

// Solo hooks
import { useAuth } from '../../hooks/useAuth';
import { useSoloTestData } from '../../hooks/solo/useSoloTestData';
import { useSoloTimer } from '../../hooks/solo/useSoloTimer';
import { useSoloAutoSave } from '../../hooks/solo/useSoloAutoSave';
import { useSoloResume } from '../../hooks/solo/useSoloResume';
import { useSoloSubmission } from '../../hooks/solo/useSoloSubmission';

// Integrity hooks
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';
import { useTestCompletionCheck } from '../../hooks/test/useTestCompletionCheck';
import { useBeforeUnloadWarning } from '../../hooks/test/useBeforeUnloadWarning';

// Feature tracking
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';

// Shared components
import { SoloSettingsModal } from '../test/SoloSettingsModal';
import { SoloResumeModal } from '../test/SoloResumeModal';
import { TimeUpOverlay } from '../test/TimeUpOverlay';
import { listeningDiagnostics } from '../../utils/listeningDiagnostics';

// Types
import type {
    ResolvedPracticeSettings,
    SavedMobileState,
    SoloProgressScopeContext,
    StudentSoloPreferences,
} from '../../types/practice.types';
import { DEFAULT_STUDENT_PREFS } from '../../types/practice.types';
import type { AntiCheatConfig } from '../../types/integrity.types';
import type { PracticeContext } from './IELTSPracticeView';

// Services & utils
import { getHomeworkById } from '../../services/homeworkManager';
import { toast } from '../modern/ToastNotification';
import { toHomeworkIntegrity } from '../../utils/integrityUtils';
import { studentResumeService } from '../../services/studentResume.service';

// ── Local types ────────────────────────────────────────────────────────────────

interface AudioSection {
    number: number;
    name: string;
    audioUrl: string;
    streamUrl?: string;
    startQuestion: number;
    endQuestion: number;
    waitTimeBefore?: number;
}

interface Question {
    number: number;
    type: string;
    question: string;
    options?: string[];
    answer: string | string[] | Record<string, string>;
    passageId?: string;
    sectionId?: string;
    points: number;
    imageUrl?: string;
    context?: any;
    items?: Array<{ id: string; text: string }>;
}

const getSoloProgressScopeContext = (practiceContext: PracticeContext): SoloProgressScopeContext => (
    practiceContext.type === 'homework'
        ? {
            mode: 'homework',
            homeworkId: practiceContext.homeworkId,
            submissionId: practiceContext.submissionId,
        }
        : practiceContext.type === 'course_material'
            ? {
                mode: 'course_material',
                courseId: practiceContext.courseId,
                moduleId: practiceContext.moduleId,
            }
            : {
                mode: 'self_study',
            }
);

// ── Helpers ────────────────────────────────────────────────────────────────────

const getTaskInstructions = (type: string, startNum: number, endNum: number): string => {
    const range = startNum === endNum ? `Question ${startNum}` : `Questions ${startNum}-${endNum}`;

    const instructionMap: Record<string, string> = {
        'completion': `${range}\n\nComplete the notes/form/table/summary below.\n\nWrite NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.`,
        'multiple-choice': `${range}\n\nChoose the correct letter, A, B, or C.`,
        'matching': `${range}\n\nWhich option goes with each item?`,
        'short-answer': `${range}\n\nAnswer the questions below.\n\nWrite NO MORE THAN THREE WORDS for each answer.`,
        'sentence-completion': `${range}\n\nComplete the sentences below.\n\nWrite NO MORE THAN TWO WORDS for each answer.`,
        'diagram-labeling': `${range}\n\nLabel the diagram/map/plan below.\n\nWrite the correct letter, A-H, next to each item.`,
    };

    return instructionMap[type] || `${range}\n\nAnswer the following questions.`;
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ListeningPracticeViewProps {
    materialId: string;
    resolvedSettings: ResolvedPracticeSettings;
    practiceContext: PracticeContext;
    autoResume?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

const ListeningPracticeView: React.FC<ListeningPracticeViewProps> = ({
  materialId,
  resolvedSettings,
  practiceContext,
  autoResume = false,
}) => {
  const { navigateTo } = useNavigation('student');
  const { isMobileExamMode } = useMobileExamMode();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
  const { user, profile } = useAuth();
  const mobileStateDirtyRef = useRef(false);
  const playbackCheckpointRef = useRef(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // ═══════════════════════════════════════════════════════════════
  // STUDENT PREFERENCES
  // ═══════════════════════════════════════════════════════════════

  const [studentPrefs, setStudentPrefs] = useState<StudentSoloPreferences>(DEFAULT_STUDENT_PREFS);

  useEffect(() => {
    if (!user?.uid) return;
    const loadPrefs = async () => {
      try {
        const stored = await storage.get<StudentSoloPreferences>(`solo_student_prefs_${user.uid}`);
        if (stored) {
          setStudentPrefs({ ...DEFAULT_STUDENT_PREFS, ...stored });
        }
      } catch {
        // Silently fall back to defaults
      }
    };
    loadPrefs();
  }, [user?.uid]);

    const [settingsModalOpen, setSettingsModalOpen] = useState(false);

    const handlePrefsChange = useCallback((newPrefs: StudentSoloPreferences) => {
        setStudentPrefs(newPrefs);
        if (user?.uid) {
            storage.set(`solo_student_prefs_${user.uid}`, newPrefs).catch((err: unknown) => {
                console.warn('Failed to persist student preferences:', err);
            });
        }
    }, [user?.uid]);

    // ═══════════════════════════════════════════════════════════════
    // TEST DATA
    // ═══════════════════════════════════════════════════════════════

    const {
        testData,
        loading: testLoading,
        error,
        questionsWithAnswersRef,
    } = useSoloTestData({
        materialId,
    });

    // ═══════════════════════════════════════════════════════════════
    // AUDIO SECTIONS (derived from testData)
    // ═══════════════════════════════════════════════════════════════

    const audioSections: AudioSection[] = useMemo(() => {
        if (testData && 'audioSections' in testData && Array.isArray((testData as any).audioSections)) {
            return (testData as any).audioSections;
        }
        // Default IELTS Listening sections
        return [
            { number: 1, name: 'Section 1', audioUrl: '', startQuestion: 1, endQuestion: 10, waitTimeBefore: 0 },
            { number: 2, name: 'Section 2', audioUrl: '', startQuestion: 11, endQuestion: 20, waitTimeBefore: 30 },
            { number: 3, name: 'Section 3', audioUrl: '', startQuestion: 21, endQuestion: 30, waitTimeBefore: 30 },
            { number: 4, name: 'Section 4', audioUrl: '', startQuestion: 31, endQuestion: 40, waitTimeBefore: 30 },
        ];
    }, [testData]);

    // ═══════════════════════════════════════════════════════════════
    // DISPLAY MODE & QUESTION IMAGES
    // ═══════════════════════════════════════════════════════════════

    const displayMode: ListeningDisplayMode = useMemo(() => {
        if (testData && 'displayMode' in testData) {
            return (testData as any).displayMode || 'text';
        }
        return 'text';
    }, [testData]);

    const questionImages: QuestionImage[] | undefined = useMemo(() => {
        if (testData && 'questionImages' in testData) {
            return (testData as any).questionImages;
        }
        return undefined;
    }, [testData]);
    const progressScopeContext = useMemo(
        () => getSoloProgressScopeContext(practiceContext),
        [
            practiceContext.courseId,
            practiceContext.homeworkId,
            practiceContext.moduleId,
            practiceContext.submissionId,
            practiceContext.type,
        ],
    );

    // ═══════════════════════════════════════════════════════════════
    // RESUME CHECK
    // ═══════════════════════════════════════════════════════════════

    const { savedProgress, checking, discardProgress } = useSoloResume({
        materialId,
        studentId: user?.uid,
        scopeContext: progressScopeContext,
    });

    const [resumeDecision, setResumeDecision] = useState<'pending' | 'resume' | 'fresh'>('pending');
    const showResumeModal = !checking && savedProgress !== null && resumeDecision === 'pending';

    // Homework resumes are restart-restricted: skip the generic solo resume modal
    useEffect(() => {
        if (
            !checking
            && savedProgress !== null
            && (practiceContext.type === 'homework' || autoResume)
            && resumeDecision === 'pending'
        ) {
            setResumeDecision('resume');
        }
    }, [autoResume, checking, practiceContext.type, resumeDecision, savedProgress]);

    // Auto-resolve: when no saved progress exists, skip the modal
    useEffect(() => {
        if (!checking && savedProgress === null && resumeDecision === 'pending') {
            setResumeDecision('fresh');
        }
    }, [checking, savedProgress, resumeDecision]);

    // ═══════════════════════════════════════════════════════════════
    // ANSWER STATE
    // ═══════════════════════════════════════════════════════════════

    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);
    const [autoSaveMobileState, setAutoSaveMobileState] = useState<SavedMobileState | undefined>(undefined);
    const mobileHydrationCompleteRef = useRef(false);

    // Apply resumed answers if user chose to resume
    useEffect(() => {
        if (resumeDecision === 'resume' && savedProgress?.answers) {
            setAnswers(savedProgress.answers);
            setCurrentQuestionNumber(savedProgress.currentQuestion || 1);
        }
    }, [resumeDecision, savedProgress]);

    // ═══════════════════════════════════════════════════════════════
    // PART NAVIGATION
    // ═══════════════════════════════════════════════════════════════

    const [viewedPartNumber, setViewedPartNumber] = useState(1);
    const [currentAudioIndex, setCurrentAudioIndex] = useState(0);

    // ═══════════════════════════════════════════════════════════════
    // AUDIO PLAYBACK STATE — PRD-0045 Fix: was hardcoded false / no-op
    // ═══════════════════════════════════════════════════════════════
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [audioPositionSeconds, setAudioPositionSeconds] = useState(0);
    const [volume, setVolume] = useState(1);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [audioIndicesCompleted, setAudioIndicesCompleted] = useState<number[]>([]);
    const [pendingSeekPosition, setPendingSeekPosition] = useState<number | null>(null);

    const currentAudioSection = audioSections[currentAudioIndex] || audioSections[0];
    const playingPartNumber = currentAudioSection?.number || 1;

    const handlePartChange = useCallback((partNumber: number) => {
        trackAction('switchListeningPart', {
            mode: practiceContext.type === 'homework' ? 'homework' : 'solo',
            surface: 'mobile_part_tabs',
            fromPart: viewedPartNumber,
            toPart: partNumber,
        });
        setViewedPartNumber(partNumber);
        const targetSection = audioSections.find(s => s.number === partNumber);
        if (targetSection) {
            setCurrentQuestionNumber(targetSection.startQuestion);
            const targetAudioIndex = audioSections.findIndex(s => s.number === partNumber);
            if (targetAudioIndex >= 0) {
                setCurrentAudioIndex(targetAudioIndex);
                setAudioPositionSeconds(0);
                setPendingSeekPosition(0);
                setAudioError(null);
                setIsPlaying(Boolean(targetSection.audioUrl || targetSection.streamUrl));
            }
        }
        mobileStateDirtyRef.current = true;
    }, [audioSections, practiceContext.type, trackAction, viewedPartNumber]);

    const handleImageNavigate = useCallback((image: QuestionImage) => {
        const targetSection = audioSections.find(s => s.number === image.sectionNumber);
        const targetAudioIndex = audioSections.findIndex(s => s.number === image.sectionNumber);
        const legacyImageRange = image as QuestionImage & { startQuestion?: number };
        const targetQuestion = image.questionRange?.start ?? legacyImageRange.startQuestion ?? targetSection?.startQuestion ?? currentQuestionNumber;

        trackAction('switchListeningImage', {
            mode: practiceContext.type === 'homework' ? 'homework' : 'solo',
            surface: 'mobile_image_canvas',
            fromPart: viewedPartNumber,
            toPart: image.sectionNumber,
            targetQuestion,
        });

        setViewedPartNumber(image.sectionNumber);
        setCurrentQuestionNumber(targetQuestion);

        if (targetSection && targetAudioIndex >= 0 && targetAudioIndex !== currentAudioIndex) {
            setCurrentAudioIndex(targetAudioIndex);
            setAudioPositionSeconds(0);
            setPendingSeekPosition(0);
            setAudioError(null);
            setIsPlaying(Boolean(targetSection.audioUrl || targetSection.streamUrl));
        }

        mobileStateDirtyRef.current = true;
    }, [audioSections, currentAudioIndex, currentQuestionNumber, practiceContext.type, trackAction, viewedPartNumber]);

    // ═══════════════════════════════════════════════════════════════
    // AUDIO HANDLERS — PRD-0045 Fix: solo/homework audio playback
    // ═══════════════════════════════════════════════════════════════

    const handlePlayPause = useCallback(() => {
        setAudioError(null);
        mobileStateDirtyRef.current = true;
        setIsPlaying(prev => {
            const next = !prev;
            listeningDiagnostics.info('[ListeningPractice] Toggled play state', {
                audioPositionSeconds,
                currentAudioIndex,
                next,
                previous: prev,
                viewedPartNumber,
            });
            return next;
        });
    }, [audioPositionSeconds, currentAudioIndex, viewedPartNumber]);

    const handleTimeUpdate = useCallback((current: number, _duration: number) => {
        setAudioPositionSeconds(current);
        const nextCheckpoint = Math.floor(current / 5);
        if (nextCheckpoint !== playbackCheckpointRef.current) {
            playbackCheckpointRef.current = nextCheckpoint;
            mobileStateDirtyRef.current = true;
        }
    }, []);

    const handleSectionComplete = useCallback(() => {
        listeningDiagnostics.log(`🎵 [ListeningPractice] Audio index ${currentAudioIndex} completed`);
        setIsPlaying(false);
        setAudioIndicesCompleted(prev => (
            prev.includes(currentAudioIndex) ? prev : [...prev, currentAudioIndex]
        ));
        setAudioPositionSeconds(0);
        setPendingSeekPosition(null);
        mobileStateDirtyRef.current = true;

        const nextIndex = currentAudioIndex + 1;
        if (nextIndex < audioSections.length) {
            const nextSection = audioSections[nextIndex];
            if (nextSection) {
                listeningDiagnostics.log(`🎵 [ListeningPractice] Advancing to section ${nextSection.number}`);
                setAudioError(null);
                setCurrentAudioIndex(nextIndex);
                setViewedPartNumber(nextSection.number);
                setCurrentQuestionNumber(nextSection.startQuestion);
                // Auto-play next section after a short delay
                setTimeout(() => setIsPlaying(true), 500);
            }
        }
        // If last section, stay paused — user reviews and submits
    }, [audioSections, currentAudioIndex]);

    const handleAudioError = useCallback((error: string) => {
        listeningDiagnostics.warn('[ListeningPractice] Audio error:', error);
        setAudioError(error);
        setIsPlaying(false);
    }, []);

    const handleVolumeChange = useCallback((nextVolume: number) => {
        setVolume(nextVolume);
        mobileStateDirtyRef.current = true;
    }, []);

    const handlePlaybackSpeedChange = useCallback((nextSpeed: number) => {
        setPlaybackSpeed(nextSpeed);
        mobileStateDirtyRef.current = true;
    }, []);

    const handleSeekConsumed = useCallback(() => {
        setPendingSeekPosition(null);
    }, []);

    useEffect(() => {
        listeningDiagnostics.info('[ListeningPractice] isPlaying state changed', {
            audioPositionSeconds,
            currentAudioIndex,
            isPlaying,
            viewedPartNumber,
        });
    }, [currentAudioIndex, isPlaying, viewedPartNumber]);

    // ═══════════════════════════════════════════════════════════════
    // TIMER
    // ═══════════════════════════════════════════════════════════════

    const submitTestRef = useRef<((auto: boolean) => Promise<void>) | null>(null);

    const handleTimeUp = useCallback(() => {
        trackAction('timeOut', {
            mode: practiceContext.type === 'homework' ? 'homework' : 'solo',
            surface: 'mobile',
        });
        void submitTestRef.current?.(true);
    }, [practiceContext.type, trackAction]);

    const handleGracePeriodStart = useCallback(() => {
        setIsLocked(true);
    }, []);

    const [isLocked, setIsLocked] = useState(false);

    const { timeRemaining, formatTime, isPaused, togglePause: _togglePause, showTimeUpOverlay, gracePeriodRemaining, hasTimer } = useSoloTimer({
        durationMinutes: resolvedSettings?.timerMinutes ?? null,
        allowPause: resolvedSettings?.allowPause === true,
        testSubmitted: false,
        onTimeUp: handleTimeUp,
        onGracePeriodStart: handleGracePeriodStart,
        initialElapsed: resumeDecision === 'resume' ? (savedProgress?.timeElapsed ?? 0) : 0,
    });

    // ═══════════════════════════════════════════════════════════════
    // SUBMISSION
    // ═══════════════════════════════════════════════════════════════

    const studentName = profile?.displayName || user?.displayName || user?.email || 'Student';
    const isHomework = practiceContext.type === 'homework';
    const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig | null>(null);

    useTestCompletionCheck({
        sessionCode: undefined,
        enabled: isHomework && Boolean(user?.uid) && Boolean(practiceContext.homeworkId),
        mode: 'homework',
        surface: 'listening_homework',
        homeworkId: practiceContext.homeworkId,
        studentId: user?.uid,
        submissionId: practiceContext.submissionId,
    });

    useEffect(() => {
        if (!isHomework || !practiceContext.homeworkId) {
            setAntiCheatConfig(null);
            return;
        }

        let cancelled = false;
        getHomeworkById(practiceContext.homeworkId)
            .then((homework) => {
                if (!cancelled) {
                    setAntiCheatConfig((homework?.antiCheatConfig as AntiCheatConfig) || null);
                }
            })
            .catch((err) => {
                console.warn('[ListeningPractice] Failed to load anti-cheat config:', err);
            });

        return () => {
            cancelled = true;
        };
    }, [isHomework, practiceContext.homeworkId]);

    const {
        addEvent,
        violationCount,
        warningLevel,
        warningMessage,
        shouldAutoSubmit,
        flushEvents,
        getIntegrityReport,
    } = useTestIntegrity({
        config: isHomework ? antiCheatConfig : null,
        context: isHomework ? 'homework' : 'solo',
        surface: isHomework ? 'listening_homework' : 'listening_solo',
        studentId: user?.uid || '',
        testId: materialId,
        homeworkId: practiceContext.homeworkId,
        submissionId: practiceContext.submissionId,
    });

    useAntiCopyPaste({
        enabled: isHomework && (antiCheatConfig?.detectCopyPaste || false),
        containerRef: containerRef as React.RefObject<HTMLElement>,
        onEvent: addEvent,
        allowEditorPaste: false,
        detectRightClick: antiCheatConfig?.detectRightClick || false,
        detectKeyboardShortcuts: antiCheatConfig?.detectKeyboardShortcuts || false,
    });

    useFullscreenMode({
        enabled: isHomework && !isMobileExamMode && (antiCheatConfig?.requireFullscreen || false),
        onFullscreenExit: addEvent,
    });

    const { isSubmitting, testSubmitted, testResults, handleSubmit, isLocked: submissionLocked } = useSoloSubmission({
        testData: testData as any,
        answers,
        materialId,
        studentId: user?.uid,
        studentName,
        timeRemaining,
        resolvedSettings,
        context: {
            type: isHomework ? 'homework' : (practiceContext.courseId ? 'course_material' : 'self_study'),
            source: isHomework
                ? { type: 'homework', id: practiceContext.homeworkId || '', name: '' }
                : practiceContext.courseId
                    ? { type: 'course', id: practiceContext.courseId, name: practiceContext.courseName || '' }
                    : { type: 'library', id: '', name: 'Self Study' },
        },
        courseContext: practiceContext.courseId && practiceContext.moduleId ? {
            courseId: practiceContext.courseId,
            moduleId: practiceContext.moduleId,
        } : undefined,
        progressScopeContext,
        homeworkId: practiceContext.homeworkId,
        submissionId: practiceContext.submissionId,
        questionsWithAnswersRef,
        questionPresentation: {
            studentId: user?.uid || 'anon',
            shuffleQuestions: isHomework && (antiCheatConfig?.shuffleQuestions || false),
            shuffleOptions: isHomework && (antiCheatConfig?.shuffleOptions || false),
        },
        integrity: isHomework && antiCheatConfig
            ? toHomeworkIntegrity(getIntegrityReport())
            : undefined,
        skipConfirm: isMobileExamMode,
        attemptsNullified:
            isHomework &&
            Boolean(antiCheatConfig?.nullifyRemainingAttempts) &&
            violationCount > 0 &&
            (antiCheatConfig?.enableAutoSubmit ? violationCount >= antiCheatConfig.autoSubmitThreshold : false),
        telemetrySurface: isHomework ? 'listening_homework' : 'listening_solo',
    });

    // Keep submitTestRef updated
    useEffect(() => {
        submitTestRef.current = async (isAutoSubmit = false) => {
            if (isHomework && antiCheatConfig) {
                await flushEvents(isAutoSubmit ? 'auto_submit' : 'homework_submit');
            }
            await handleSubmit(isAutoSubmit);
        };
    }, [antiCheatConfig, flushEvents, handleSubmit, isHomework]);

    // ═══════════════════════════════════════════════════════════════
    // AUTO-SAVE
    // ═══════════════════════════════════════════════════════════════

    const timeElapsedRef = useRef(0);
    useEffect(() => {
        if (hasTimer && isFinite(timeRemaining) && resolvedSettings?.timerMinutes) {
            timeElapsedRef.current = (resolvedSettings.timerMinutes * 60) - timeRemaining;
        }
    }, [timeRemaining, hasTimer, resolvedSettings?.timerMinutes]);

    useSoloAutoSave({
        materialId,
        studentId: user?.uid,
        scopeContext: progressScopeContext,
        answers,
        currentQuestion: currentQuestionNumber,
        timeElapsed: timeElapsedRef.current,
        mobileState: autoSaveMobileState,
        enabled: !testSubmitted && resumeDecision !== 'pending',
    });

    // ═══════════════════════════════════════════════════════════════
    // ANSWER HANDLER
    // ═══════════════════════════════════════════════════════════════

    const handleAnswerChange = useCallback((questionNumber: number, answer: any) => {
        if (isLocked || submissionLocked || testSubmitted) return;
        setAnswers(prev => ({ ...prev, [questionNumber]: answer }));
        mobileStateDirtyRef.current = true;
    }, [isLocked, submissionLocked, testSubmitted]);

    // ═══════════════════════════════════════════════════════════════
    // DESKTOP HELPERS — goToQuestion, sectionsInfo, handleDesktopSubmit
    // ═══════════════════════════════════════════════════════════════

    const goToQuestion = useCallback((qNum: number) => {
        setCurrentQuestionNumber(qNum);
        // Find which part this question belongs to and switch to it
        for (const section of audioSections) {
            if (qNum >= section.startQuestion && qNum <= section.endQuestion) {
                if (section.number !== viewedPartNumber) {
                    setViewedPartNumber(section.number);
                }
                break;
            }
        }
        mobileStateDirtyRef.current = true;
    }, [audioSections, viewedPartNumber]);

    /** Section info for desktop ListeningQuestionNav */
    const sectionsInfo = useMemo(() => {
        return audioSections.map(s => ({
            number: s.number,
            startQ: s.startQuestion,
            endQ: s.endQuestion,
            name: s.name,
        }));
    }, [audioSections]);

    /** Desktop section change handler */
    const handleDesktopSectionChange = useCallback((sectionNumber: number) => {
        setViewedPartNumber(sectionNumber);
        const section = audioSections.find(s => s.number === sectionNumber);
        if (section) {
            setCurrentQuestionNumber(section.startQuestion);
        }
        mobileStateDirtyRef.current = true;
    }, [audioSections]);

    /** Desktop submit (triggers the same submitTestRef) */
    const handleDesktopSubmit = useCallback(async () => {
        if (submitTestRef.current) {
            await submitTestRef.current(false);
        }
    }, []);

    // ═══════════════════════════════════════════════════════════════
    // BACK NAVIGATION (context-aware)
    // ═══════════════════════════════════════════════════════════════

    const handleBack = useCallback(() => {
        void studentResumeService.clearResume();
        if (practiceContext.type === 'homework') {
            navigateTo('STUDENT_HOMEWORK');
        } else if (practiceContext.courseId) {
            navigateTo('STUDENT_COURSE_DETAIL', { courseId: practiceContext.courseId });
        } else {
            navigateTo('STUDENT_LIBRARY');
        }
    }, [navigateTo, practiceContext]);

    useEffect(() => {
        if (error) {
            void studentResumeService.clearResume();
        }
    }, [error]);

    // Warn on page leave
    useBeforeUnloadWarning({
        enabled: !testSubmitted && resumeDecision !== 'pending',
    });

    // ═══════════════════════════════════════════════════════════════
    // INTEGRITY WARNING ESCALATION
    // ═══════════════════════════════════════════════════════════════

    const prevWarningRef = useRef(warningLevel);
    useEffect(() => {
        if (warningLevel !== prevWarningRef.current) {
            prevWarningRef.current = warningLevel;
            if (warningLevel === 'toast' || warningLevel === 'escalated') {
                toast.warning(warningMessage);
            }
        }
    }, [warningLevel, warningMessage]);

    useEffect(() => {
        if (!shouldAutoSubmit || !submitTestRef.current) return;
        submitTestRef.current(true).catch((err) => {
            console.error('[ListeningPractice] Auto-submit failed:', err);
        });
    }, [shouldAutoSubmit]);

    // ═══════════════════════════════════════════════════════════════
    // FONT SIZE
    // ═══════════════════════════════════════════════════════════════

    const [fontSize, setFontSize] = useState(DEFAULT_STUDENT_PREFS.fontSize);

    useEffect(() => {
        setFontSize(studentPrefs.fontSize);
    }, [studentPrefs.fontSize]);

    // ═══════════════════════════════════════════════════════════════
    // VIEWED PART: DERIVED STATE
    // ═══════════════════════════════════════════════════════════════

    const viewedPartSection = useMemo(() => {
        return audioSections.find(s => s.number === viewedPartNumber) || audioSections[0];
    }, [audioSections, viewedPartNumber]);

    const viewedPartQuestions: Question[] = useMemo(() => {
        if (!testData?.questions || !viewedPartSection) return [];
        return (testData.questions as Question[]).filter(
            (q) => q.number >= viewedPartSection.startQuestion && q.number <= viewedPartSection.endQuestion
        );
    }, [testData?.questions, viewedPartSection]);

    // Group questions by type for direct-question rendering
    const viewedPartQuestionGroups = useMemo(() => {
        if (viewedPartQuestions.length === 0) return [];

        const firstQuestion = viewedPartQuestions[0];
        if (!firstQuestion) return [];

        const groups: Array<{
            type: string;
            startNumber: number;
            endNumber: number;
            questions: Question[];
            instructions: string;
        }> = [];

        let currentGroup: Question[] = [firstQuestion];
        let currentType = firstQuestion.type;

        for (let i = 1; i < viewedPartQuestions.length; i++) {
            const q = viewedPartQuestions[i];
            if (!q) continue;

            if (q.type === currentType) {
                currentGroup.push(q);
            } else {
                const first = currentGroup[0];
                const last = currentGroup[currentGroup.length - 1];
                if (first && last) {
                    groups.push({
                        type: currentType,
                        startNumber: first.number,
                        endNumber: last.number,
                        questions: currentGroup,
                        instructions: getTaskInstructions(currentType, first.number, last.number),
                    });
                }
                currentGroup = [q];
                currentType = q.type;
            }
        }

        // Add last group
        if (currentGroup.length > 0) {
            const first = currentGroup[0];
            const last = currentGroup[currentGroup.length - 1];
            if (first && last) {
                groups.push({
                    type: currentType,
                    startNumber: first.number,
                    endNumber: last.number,
                    questions: currentGroup,
                    instructions: getTaskInstructions(currentType, first.number, last.number),
                });
            }
        }

        return groups;
    }, [viewedPartQuestions]);

    // Part infos for submit sheet counts
    const mobilePartInfos: ListeningPartInfo[] = useMemo(() => {
        return audioSections.map(s => ({
            partNumber: s.number,
            questionNumbers: Array.from(
                { length: s.endQuestion - s.startQuestion + 1 },
                (_, i) => s.startQuestion + i,
            ),
        }));
    }, [audioSections]);

    // ═══════════════════════════════════════════════════════════════
    // IMAGE MODE STATE (Phase 4)
    // ═══════════════════════════════════════════════════════════════

    const [zoomByPart, setZoomByPart] = useState<Record<number, ImageZoomState>>({});
    const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
    const [answerSheetScrollByPart, setAnswerSheetScrollByPart] = useState<Record<number, number>>({});

    const handleZoomChange = useCallback((partNumber: number, zoom: ImageZoomState) => {
        setZoomByPart(prev => ({ ...prev, [partNumber]: zoom }));
        mobileStateDirtyRef.current = true;
    }, []);

    const handleAnswerSheetScrollChange = useCallback((partNumber: number, scrollTop: number) => {
        setAnswerSheetScrollByPart(prev => ({ ...prev, [partNumber]: scrollTop }));
        mobileStateDirtyRef.current = true;
    }, []);

    // ═══════════════════════════════════════════════════════════════
    // MOBILE SHELL STATE — declared before conditional returns
    // ═══════════════════════════════════════════════════════════════

    const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
    const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
    const [textSizeControlOpen, setTextSizeControlOpen] = useState(false);
    const [instructionsOpen, setInstructionsOpen] = useState(false);

    const markMobileStateDirty = useCallback(() => {
        mobileStateDirtyRef.current = true;
    }, []);

    // ═══════════════════════════════════════════════════════════════
    // OVERLAY PRECEDENCE — close transient surfaces on blocking states
    // ═══════════════════════════════════════════════════════════════

    useEffect(() => {
        if (isPaused || showTimeUpOverlay) {
            setSubmitSheetOpen(false);
            setOverflowMenuOpen(false);
            setTextSizeControlOpen(false);
            setInstructionsOpen(false);
            setAnswerSheetOpen(false);
        }
    }, [isPaused, showTimeUpOverlay]);

    // ═══════════════════════════════════════════════════════════════
    // MOBILE SHELL CALLBACKS
    // ═══════════════════════════════════════════════════════════════

    const handleOpenSubmitSheet = useCallback(() => {
        markMobileStateDirty();
        trackAction('openSubmitSheet', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_header_submit',
        });
        setOverflowMenuOpen(false);
        setTextSizeControlOpen(false);
        setInstructionsOpen(false);
        setAnswerSheetOpen(false);
        setSubmitSheetOpen(true);
    }, [isHomework, markMobileStateDirty, trackAction]);

    const handleCloseSubmitSheet = useCallback(() => {
        markMobileStateDirty();
        setSubmitSheetOpen(false);
    }, [markMobileStateDirty]);

    const handleConfirmSubmit = useCallback(async () => {
        trackAction('confirmSubmit', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_submit_sheet',
        });
        setSubmitSheetOpen(false);
        if (submitTestRef.current) {
            await submitTestRef.current(false);
        }
    }, [isHomework, trackAction]);

    const handleOpenOverflowMenu = useCallback(() => {
        markMobileStateDirty();
        trackAction('openOverflowMenu', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_header',
        });
        setOverflowMenuOpen(true);
    }, [isHomework, markMobileStateDirty, trackAction]);

    const handleCloseOverflowMenu = useCallback(() => {
        markMobileStateDirty();
        setOverflowMenuOpen(false);
    }, [markMobileStateDirty]);

    const handleOpenTextSizeControl = useCallback(() => {
        markMobileStateDirty();
        trackAction('openTextSizeControl', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_overflow_menu',
        });
        setOverflowMenuOpen(false);
        setInstructionsOpen(false);
        setTextSizeControlOpen(true);
    }, [isHomework, markMobileStateDirty, trackAction]);

    const handleCloseTextSizeControl = useCallback(() => {
        markMobileStateDirty();
        setTextSizeControlOpen(false);
    }, [markMobileStateDirty]);

    const handleOpenInstructions = useCallback(() => {
        markMobileStateDirty();
        trackAction('openInstructions', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_overflow_menu',
        });
        setOverflowMenuOpen(false);
        setTextSizeControlOpen(false);
        setInstructionsOpen(true);
    }, [isHomework, markMobileStateDirty, trackAction]);

    const handleCloseInstructions = useCallback(() => {
        markMobileStateDirty();
        setInstructionsOpen(false);
    }, [markMobileStateDirty]);

    const handleTextSizeChange = useCallback((size: number) => {
        markMobileStateDirty();
        trackAction('adjustTextSize', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_text_size_control',
            size,
        });
        setFontSize(size);
    }, [isHomework, markMobileStateDirty, trackAction]);

    const handleLeaveTest = useCallback(() => {
        markMobileStateDirty();
        trackAction('leaveTest', {
            mode: isHomework ? 'homework' : 'solo',
            surface: 'mobile_overflow_menu',
        });
        setOverflowMenuOpen(false);
        handleBack();
    }, [handleBack, isHomework, markMobileStateDirty, trackAction]);

    // ═══════════════════════════════════════════════════════════════
    // MOBILE PERSISTENCE — Phase 6.0: Serialization → Autosave bridge
    // ═══════════════════════════════════════════════════════════════

    /** Build compatibility context from practice test data */
    const listeningCompatCtx = useMemo<ListeningCompatContext | null>(() => {
        if (!testData?.questions || audioSections.length === 0) return null;
        const progressScopeContext = getSoloProgressScopeContext(practiceContext);
        const questionsByPart: Record<number, number[]> = {};
        for (const section of audioSections) {
            questionsByPart[section.number] = Array.from(
                { length: section.endQuestion - section.startQuestion + 1 },
                (_, i) => section.startQuestion + i,
            );
        }
        return {
            materialId,
            partCount: audioSections.length,
            questionsByPart,
            scopeKey: progressScopeContext.mode === 'homework'
                ? `hw_${progressScopeContext.homeworkId || ''}_${progressScopeContext.submissionId || ''}`
                : progressScopeContext.mode === 'course_material'
                    ? `course_${progressScopeContext.courseId || ''}_${progressScopeContext.moduleId || ''}_${materialId}`
                    : `solo_${materialId}`,
        };
    }, [testData, audioSections, materialId, practiceContext]);

    /** Serialize current mobile state for autosave (includes playback for solo/homework) */
    const serializedMobileState = useMemo<SavedMobileState | undefined>(() => {
        if (!isMobileExamMode) return undefined;
        return serializeListeningMobileState({
            compatContext: listeningCompatCtx ?? undefined,
            viewedPartNumber,
            currentQuestionNumber,
            textSize: fontSize,
            answerSheetScrollByPart: answerSheetScrollByPart as Record<string, number>,
            imageZoomByPart: zoomByPart as Record<string, { scale: number; offsetX: number; offsetY: number }>,
            playback: {
                currentAudioIndex,
                audioPositionSeconds,
                volume,
                playbackSpeed,
                audioIndicesCompleted,
            },
        }) as SavedMobileState;
    }, [answerSheetScrollByPart, audioIndicesCompleted, audioPositionSeconds, currentAudioIndex, currentQuestionNumber, fontSize, isMobileExamMode, listeningCompatCtx, playbackSpeed, viewedPartNumber, volume, zoomByPart]);

    /** Hydrate mobile state from savedProgress on resume */
    useEffect(() => {
        if (mobileHydrationCompleteRef.current) return;
        if (!isMobileExamMode || resumeDecision !== 'resume') return;
        if (!savedProgress?.mobileState || !listeningCompatCtx) return;

        if (!isCompatibleListeningMobileState(savedProgress.mobileState, listeningCompatCtx)) {
            listeningDiagnostics.warn('[ListeningPractice] Incompatible mobileState payload — discarding');
            mobileHydrationCompleteRef.current = true;
            return;
        }

        const hydrated = hydrateListeningMobileState(
            savedProgress.mobileState,
            listeningCompatCtx,
            fontSize, // fallback text size
            true,     // include playback for solo/homework
        );

        listeningDiagnostics.log('[ListeningPractice] Hydrating mobile state from saved progress', hydrated);

        if (hydrated.viewedPartNumber != null) setViewedPartNumber(hydrated.viewedPartNumber);
        if (hydrated.textSize != null) setFontSize(hydrated.textSize);
        if (hydrated.currentQuestionNumber != null) setCurrentQuestionNumber(hydrated.currentQuestionNumber);
        if (hydrated.imageZoomByPart) setZoomByPart(hydrated.imageZoomByPart as Record<number, ImageZoomState>);
        if (hydrated.answerSheetScrollByPart) setAnswerSheetScrollByPart(hydrated.answerSheetScrollByPart as Record<number, number>);
        if (hydrated.playback) {
            const restoredAudioIndex = Math.max(0, Math.min(hydrated.playback.currentAudioIndex, audioSections.length - 1));
            setCurrentAudioIndex(restoredAudioIndex);
            setAudioPositionSeconds(hydrated.playback.audioPositionSeconds);
            setPendingSeekPosition(hydrated.playback.audioPositionSeconds);
            setVolume(hydrated.playback.volume);
            setPlaybackSpeed(hydrated.playback.playbackSpeed);
            setAudioIndicesCompleted(hydrated.playback.audioIndicesCompleted);
            playbackCheckpointRef.current = Math.floor(hydrated.playback.audioPositionSeconds / 5);
        }

        // Clear transient overlays
        setSubmitSheetOpen(false);
        setOverflowMenuOpen(false);
        setTextSizeControlOpen(false);
        setInstructionsOpen(false);
        setAnswerSheetOpen(false);

        mobileHydrationCompleteRef.current = true;
    }, [audioSections.length, fontSize, isMobileExamMode, listeningCompatCtx, resumeDecision, savedProgress]);

    /** Persist text-size to platform storage as a fallback */
    useEffect(() => {
        if (!isMobileExamMode || !user?.uid) return;
        storage.set(getListeningTextSizeStorageKey(user.uid), String(fontSize)).catch(() => {});
    }, [fontSize, isMobileExamMode, user?.uid]);

    /** Bridge: push serialized mobile state to autosave only when dirty */
    useEffect(() => {
        if (!isMobileExamMode || !serializedMobileState) return;
        if (!mobileStateDirtyRef.current && mobileHydrationCompleteRef.current) return;
        mobileStateDirtyRef.current = false;
        setAutoSaveMobileState(serializedMobileState);
    }, [isMobileExamMode, serializedMobileState]);

    // ═══════════════════════════════════════════════════════════════
    // EARLY RETURNS (after all hooks)
    // ═══════════════════════════════════════════════════════════════

    // Loading state
    if (testLoading || checking) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: '#0f172a',
                color: '#94a3b8',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                gap: '1rem',
            }}>
                <div style={{ fontSize: '2.5rem' }}>🎧</div>
                <div style={{ fontSize: '0.875rem' }}>Loading listening test…</div>
            </div>
        );
    }

    // Error state
    if (error || !testData) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: '#0f172a',
                color: '#f87171',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                gap: '1rem',
                padding: '2rem',
                textAlign: 'center',
            }}>
                <div style={{ fontSize: '2.5rem' }}>⚠️</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24' }}>Failed to load test</div>
                <div style={{ fontSize: '0.8125rem', color: '#94a3b8', maxWidth: 320 }}>
                    {error || 'Test data not found.'}
                </div>
                <button
                    onClick={handleBack}
                    type="button"
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1.5rem',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    Go Back
                </button>
            </div>
        );
    }

    // Resume modal (solo only — homework auto-resumes)
    if (showResumeModal) {
        return (
            <SoloResumeModal
                opened={showResumeModal}
                onResume={() => setResumeDecision('resume')}
                onStartNew={() => {
                    discardProgress();
                    setResumeDecision('fresh');
                }}
                onClose={() => setResumeDecision('fresh')}
                savedProgress={savedProgress!}
                totalQuestions={testData?.questionCount || 0}
            />
        );
    }

    // Test submitted — results
    if (testSubmitted && testResults) {
        return (
            <MobileStartScreen
                mode={isHomework ? 'homework' : 'solo'}
                testTitle={`Test Completed — ${testResults.correctAnswers}/${testResults.totalQuestions}`}
                testSkill="Listening"
                passageCount={audioSections.length}
                questionCount={testResults.totalQuestions}
                timeLimit={null}
                onStart={handleBack}
                showStartButton={true}
                practiceContext={practiceContext}
                resolvedSettings={resolvedSettings}
            />
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDER: Mobile Listening Scaffold (PRD-0045)
    // ═══════════════════════════════════════════════════════════════

    if (isMobileExamMode) {
        return (
            <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
                <MobileListeningExamScaffold
                    mode={isHomework ? 'homework' : 'solo'}
                    activePartNumber={viewedPartNumber}
                    onPartChange={handlePartChange}
                    playingPartNumber={playingPartNumber}
                    timeRemaining={timeRemaining}
                    formatTime={formatTime}
                    answers={answers}
                    partInfos={mobilePartInfos}
                    testSubmitted={testSubmitted}
                    isSubmitting={isSubmitting}
                    onConfirmSubmit={handleConfirmSubmit}
                    isPaused={isPaused}
                    isWaiting={false}
                    audioRowContent={
                        currentAudioSection?.audioUrl ? (
                            <div style={{ padding: '0 0.5rem' }}>
                                <AudioPlayer
                                    key={`solo-audio-${currentAudioIndex}`}
                                    audioUrl={currentAudioSection.audioUrl}
                                    sectionNumber={currentAudioSection.number}
                                    isPlaying={isPlaying}
                                    volume={volume}
                                    playbackSpeed={playbackSpeed}
                                    onPlayPause={handlePlayPause}
                                    onTimeUpdate={handleTimeUpdate}
                                    onSectionComplete={handleSectionComplete}
                                    onError={handleAudioError}
                                    onVolumeChange={handleVolumeChange}
                                    onSpeedChange={handlePlaybackSpeedChange}
                                    seekPosition={pendingSeekPosition}
                                    onSeekConsumed={handleSeekConsumed}
                                    allowReplay={resolvedSettings?.listening?.allowReplay !== false}
                                    maxReplays={resolvedSettings?.listening?.maxReplays ?? 2}
                                    playerMode="solo"
                                    minimal
                                    mobileLayout
                                />
                                {audioError && (
                                    <div style={{
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.75rem',
                                        color: '#ef4444',
                                        textAlign: 'center',
                                    }}>
                                        Audio error: {audioError}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                padding: '0.375rem 0.5rem',
                                fontSize: '0.8125rem',
                                color: '#94a3b8',
                                textAlign: 'center',
                            }}>
                                No audio for this section
                            </div>
                        )
                    }
                    mainContent={
                        displayMode === 'image' && questionImages && questionImages.length > 0 ? (
                            /* ── Image-mode mainContent ── */
                            <div
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: '100%',
                                    overflow: 'hidden',
                                }}
                            >
                                {/* Image Canvas */}
                                <MobileListeningImageCanvas
                                    questionImages={questionImages}
                                    audioSections={audioSections}
                                    viewedPartNumber={viewedPartNumber}
                                    currentQuestionNumber={currentQuestionNumber}
                                    zoomByPart={zoomByPart}
                                    onZoomChange={handleZoomChange}
                                    onImageNavigate={handleImageNavigate}
                                />

                                {/* Questions FAB — visible only when sheet is closed */}
                                {!answerSheetOpen && (
                                    <button
                                        data-testid="mobile-listening-questions-fab"
                                        onClick={() => setAnswerSheetOpen(true)}
                                        aria-label={`Questions. ${Object.values(answers).filter(a => a !== undefined && a !== '').length} answered of ${testData?.questionCount || 40}. Open answer sheet.`}
                                        type="button"
                                        style={{
                                            position: 'absolute',
                                            bottom: 16,
                                            right: 16,
                                            zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.FAB,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            height: 48,
                                            padding: '0 16px',
                                            border: 'none',
                                            borderRadius: 24,
                                            background: '#1e293b',
                                            color: '#ffffff',
                                            fontSize: '0.8125rem',
                                            fontWeight: 600,
                                            fontFamily: 'system-ui, -apple-system, sans-serif',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)',
                                            WebkitTapHighlightColor: 'transparent',
                                        }}
                                    >
                                        {/* Clipboard icon */}
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                            <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                                            <path d="M6 2V1.5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 10 1.5V2" stroke="currentColor" strokeWidth="1.2" />
                                            <path d="M5.5 6.5h5M5.5 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                        </svg>
                                        <span>Questions</span>
                                        {/* Unanswered badge */}
                                        {(() => {
                                            const total = testData?.questionCount || 40;
                                            const answered = Object.values(answers).filter(a => a !== undefined && a !== '').length;
                                            const unanswered = total - answered;
                                            if (unanswered <= 0) return null;
                                            return (
                                                <span
                                                    data-testid="fab-unanswered-badge"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.6875rem',
                                                        fontWeight: 700,
                                                        minWidth: 18,
                                                        height: 18,
                                                        borderRadius: 9,
                                                        padding: '0 5px',
                                                        lineHeight: 1,
                                                        background: '#fbbf24',
                                                        color: '#78350f',
                                                    }}
                                                >
                                                    {unanswered}
                                                </span>
                                            );
                                        })()}
                                    </button>
                                )}

                                {/* Answer Sheet */}
                                <MobileListeningAnswerSheet
                                    isOpen={answerSheetOpen}
                                    onClose={() => setAnswerSheetOpen(false)}
                                    viewedPartNumber={viewedPartNumber}
                                    startQuestion={viewedPartSection?.startQuestion || 1}
                                    endQuestion={viewedPartSection?.endQuestion || 10}
                                    questions={(viewedPartQuestions || []).map(q => ({
                                        number: q.number,
                                        type: q.type,
                                    }))}
                                    answers={answers}
                                    onAnswerChange={(testSubmitted || isLocked || submissionLocked) ? () => {} : handleAnswerChange}
                                    currentQuestionNumber={currentQuestionNumber}
                                    testSubmitted={testSubmitted}
                                    isLocked={Boolean(isLocked || submissionLocked)}
                                    scrollByPart={answerSheetScrollByPart}
                                    onScrollChange={handleAnswerSheetScrollChange}
                                />
                            </div>
                        ) : (
                            /* ── Direct-question mainContent (standard text mode) ── */
                            <div
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    WebkitOverflowScrolling: 'touch',
                                    padding: '1rem',
                                    fontSize: `${fontSize}px`,
                                }}
                            >
                                {/* Section Rubric */}
                                <SectionRubricBlock
                                    partNumber={viewedPartNumber}
                                    startQuestion={viewedPartSection?.startQuestion || 1}
                                    endQuestion={viewedPartSection?.endQuestion || 10}
                                    sectionName={viewedPartSection?.name}
                                    questionType={viewedPartQuestionGroups[0]?.type || 'completion'}
                                />

                                {/* Question groups */}
                                {viewedPartQuestionGroups.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '3rem',
                                        color: '#64748b',
                                    }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
                                        <div>No questions for this section</div>
                                    </div>
                                ) : (
                                    viewedPartQuestionGroups.map((group, groupIndex) => (
                                        <ListeningQuestionDisplay
                                            key={`practice-group-${groupIndex}`}
                                            group={group}
                                            answers={answers}
                                            onAnswerChange={(testSubmitted || isLocked || submissionLocked) ? () => {} : handleAnswerChange}
                                            currentQuestionNumber={currentQuestionNumber}
                                            testSubmitted={testSubmitted}
                                            disabled={Boolean(testSubmitted || isLocked || submissionLocked)}
                                        />
                                    ))
                                )}
                            </div>
                        )
                    }
                    submitSheetOpen={submitSheetOpen}
                    onOpenSubmitSheet={handleOpenSubmitSheet}
                    onCloseSubmitSheet={handleCloseSubmitSheet}
                    overflowMenuOpen={overflowMenuOpen}
                    onOpenOverflowMenu={handleOpenOverflowMenu}
                    onCloseOverflowMenu={handleCloseOverflowMenu}
                    textSizeControlOpen={textSizeControlOpen}
                    onOpenTextSizeControl={handleOpenTextSizeControl}
                    onCloseTextSizeControl={handleCloseTextSizeControl}
                    instructionsOpen={instructionsOpen}
                    onOpenInstructions={handleOpenInstructions}
                    onCloseInstructions={handleCloseInstructions}
                    fontSize={fontSize}
                    onTextSizeChange={handleTextSizeChange}
                    onLeaveTest={handleLeaveTest}
                    antiSelectClass={isHomework && antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
                    partCount={audioSections.length}
                    practiceContext={practiceContext}
                    resolvedSettings={resolvedSettings}
                />

                {/* Time-Up Overlay */}
                {showTimeUpOverlay && (
                    <TimeUpOverlay
                        onComplete={() => {
                            void submitTestRef.current?.(true);
                        }}
                        countdownSeconds={gracePeriodRemaining}
                    />
                )}

                {/* Settings Modal */}
                {settingsModalOpen && (
                    <SoloSettingsModal
                        opened={settingsModalOpen}
                        onClose={() => setSettingsModalOpen(false)}
                        testSkill="Listening"
                        resolvedSettings={resolvedSettings}
                        studentPrefs={studentPrefs}
                        onPrefsChange={handlePrefsChange}
                        onExit={handleBack}
                    />
                )}
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDER: Desktop/Tablet Listening Layout
    // Mirrors ListeningTestPage desktop path with solo-mode adaptations
    // ═══════════════════════════════════════════════════════════════

    const inputsDisabled = isLocked || submissionLocked || testSubmitted;

    return (
        <div
            ref={containerRef}
            className={isHomework && antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
            style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'relative' }}
        >
            {/* Resume Modal */}
            {showResumeModal && savedProgress && (
                <SoloResumeModal
                    opened={showResumeModal}
                    onResume={() => setResumeDecision('resume')}
                    onStartNew={() => { discardProgress(); setResumeDecision('fresh'); }}
                    onClose={() => setResumeDecision('fresh')}
                    savedProgress={savedProgress}
                    totalQuestions={testData?.questionCount || 0}
                />
            )}

            {/* Pause Overlay */}
            {isPaused && !testSubmitted && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <div style={{ background: 'white', borderRadius: 16, padding: '2rem 3rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>⏸️</div>
                        <h2 style={{ fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Test Paused</h2>
                        <p style={{ color: '#6b7280', margin: '0 0 24px' }}>Your progress is saved. Click Resume to continue.</p>
                        <button
                            onClick={() => { /* togglePause is not available in solo — pause overlay is informational */ }}
                            style={{ padding: '10px 28px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                        >
                            Resume
                        </button>
                    </div>
                </div>
            )}

            {/* Audio Error Notification */}
            {audioError && (
                <div style={{
                    position: 'fixed',
                    top: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                    background: '#fef2f2',
                    border: '2px solid #fecaca',
                    borderRadius: '0.75rem',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    boxShadow: '0 4px 20px rgba(220, 38, 38, 0.2)',
                    maxWidth: '500px',
                }}>
                    <span style={{ fontSize: '1.5rem' }}>🔇</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#dc2626', fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                            Audio Error
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#991b1b' }}>
                            {audioError}
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setAudioError(null);
                            setIsPlaying(true);
                        }}
                        style={{
                            padding: '0.5rem 1rem',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* IELTS-Style Header with Compact Audio */}
            <ListeningHeader
                studentName={studentName}
                timeRemaining={timeRemaining}
                formatTime={formatTime}
                isPaused={isPaused}
                testSubmitted={testSubmitted}
                audioUrl={currentAudioSection?.audioUrl}
                hasAudio={!!currentAudioSection?.audioUrl}
                sectionNumber={currentAudioSection?.number || 1}
                isPlaying={isPlaying}
                volume={volume}
                playbackSpeed={playbackSpeed}
                onPlayPause={handlePlayPause}
                onVolumeChange={handleVolumeChange}
                onSectionComplete={handleSectionComplete}
                onError={handleAudioError}
                allowReplay={resolvedSettings?.listening?.allowReplay !== false}
                maxReplays={resolvedSettings?.listening?.maxReplays ?? 2}
                playerMode="solo"
                onMenuClick={() => setSettingsModalOpen(true)}
            />

            {/* Questions Panel - Conditional based on displayMode */}
            {displayMode === 'image' && questionImages && questionImages.length > 0 ? (
                /* IMAGE MODE: Two-column layout (images | answers) */
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <ListeningImageModeDisplay
                        questionImages={questionImages}
                        questions={testData.questions || []}
                        audioSections={audioSections}
                        currentSection={viewedPartNumber}
                        answers={answers}
                        onAnswerChange={inputsDisabled ? () => {} : handleAnswerChange}
                        currentQuestionNumber={currentQuestionNumber}
                        testSubmitted={testSubmitted}
                    />
                </div>
            ) : (
                /* TEXT MODE: Full-width IELTS-like format */
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '1.5rem',
                    backgroundColor: '#ffffff',
                }}>
                    {/* IELTS-Style Section Rubric */}
                    <SectionRubricBlock
                        partNumber={viewedPartNumber}
                        startQuestion={viewedPartSection?.startQuestion || 1}
                        endQuestion={viewedPartSection?.endQuestion || 10}
                        sectionName={viewedPartSection?.name}
                        questionType={viewedPartQuestionGroups[0]?.type || 'completion'}
                    />
                    {viewedPartQuestionGroups.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem',
                            color: '#64748b',
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
                            <div>No questions for this section</div>
                        </div>
                    ) : (
                        viewedPartQuestionGroups.map((group, groupIndex) => (
                            <ListeningQuestionDisplay
                                key={`desktop-group-${groupIndex}`}
                                group={group}
                                answers={answers}
                                onAnswerChange={inputsDisabled ? () => {} : handleAnswerChange}
                                currentQuestionNumber={currentQuestionNumber}
                                testSubmitted={testSubmitted}
                                disabled={inputsDisabled}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Floating Navigation Arrows */}
            <ListeningNavArrows
                currentQuestion={currentQuestionNumber}
                totalQuestions={testData.questionCount || 40}
                onPrevious={() => goToQuestion(Math.max(1, currentQuestionNumber - 1))}
                onNext={() => goToQuestion(Math.min(testData.questionCount || 40, currentQuestionNumber + 1))}
                disabled={testSubmitted}
            />

            {/* Question Navigator (Bottom, Sticky) */}
            <ListeningQuestionNav
                totalQuestions={testData.questionCount || 40}
                currentQuestion={currentQuestionNumber}
                answers={answers}
                sectionsInfo={sectionsInfo}
                onQuestionClick={goToQuestion}
                onSectionClick={handleDesktopSectionChange}
                onReview={handleDesktopSubmit}
                testSubmitted={testSubmitted}
                currentSection={viewedPartNumber}
            />

            {/* Time Up Overlay */}
            {showTimeUpOverlay && (
                <TimeUpOverlay
                    onComplete={() => {
                        void submitTestRef.current?.(true);
                    }}
                    countdownSeconds={gracePeriodRemaining}
                />
            )}

            {/* Solo Settings Modal */}
            {resolvedSettings && (
                <SoloSettingsModal
                    opened={settingsModalOpen}
                    onClose={() => setSettingsModalOpen(false)}
                    testSkill="Listening"
                    resolvedSettings={resolvedSettings}
                    studentPrefs={studentPrefs}
                    onPrefsChange={handlePrefsChange}
                    onExit={handleBack}
                />
            )}
        </div>
    );
};

export default ListeningPracticeView;
