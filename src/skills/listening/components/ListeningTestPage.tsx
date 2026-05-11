/**
 * Listening Test Page Component
 * IELTS Listening skill-specific test interface
 * 
 * Layout (Single Column - NOT Two Column like Reading):
 * ┌─────────────────────────────────────────────────────┐
 * │ HEADER: Timer | Section X of 4 | Volume | Submit    │
 * ├─────────────────────────────────────────────────────┤
 * │ AUDIO PLAYER (sticky at top)                        │
 * │ ▶ ━━━━●━━━━━ 2:34 / 8:15  Section 1                │
 * ├─────────────────────────────────────────────────────┤
 * │ QUESTIONS (full width, scrollable)                  │
 * │ Questions 1-10 (current section)                    │
 * ├─────────────────────────────────────────────────────┤
 * │ QUESTION NAVIGATOR (bottom, sticky)                 │
 * │ [1][2][3]...[40] | Submit                           │
 * └─────────────────────────────────────────────────────┘
 * 
 * Features:
 * - Section-by-section progression
 * - Auto-advance when audio ends (or after wait time)
 * - WaitTimePopup between sections
 * - No passages (unlike Reading)
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';

// Mobile exam mode gate (PRD-0045 Phase 3)
import { useMobileExamMode } from '../../../core/platform/hooks/useMobileExamMode';
import { storage } from '../../../core/platform/storage';
import { MobileListeningExamScaffold } from '../../../components/test/mobile/MobileListeningExamScaffold';
import type { ListeningPartInfo } from '../../../components/test/mobile/MobileListeningSubmitSheet';
import { MobileListeningImageCanvas } from '../../../components/test/mobile/MobileListeningImageCanvas';
import type { ImageZoomState } from '../../../components/test/mobile/MobileListeningImageCanvas';
import { MobileListeningAnswerSheet } from '../../../components/test/mobile/MobileListeningAnswerSheet';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from '../../../components/test/mobile/mobileListeningLayering';
import {
  getListeningTextSizeStorageKey,
  hydrateListeningMobileState,
  isCompatibleListeningMobileState,
  serializeListeningMobileState,
  type ListeningCompatContext,
} from '../../../components/test/mobile/mobileListeningState';
import { AudioPlayer } from './AudioPlayer';

// Listening-specific components
import { WaitTimePopup } from './WaitTimePopup';
import { ListeningQuestionNav } from './ListeningQuestionNav';
import { ListeningQuestionDisplay } from './ListeningQuestionDisplay';
import { ListeningImageModeDisplay } from './ListeningImageModeDisplay';
import { ListeningHeader } from './ListeningHeader';
import { SectionRubricBlock } from './SectionRubricBlock';
import { ListeningNavArrows } from './ListeningNavArrows';

// Types from storage
import type { ListeningDisplayMode, QuestionImage } from '../../../services/listeningTestStorage';

// Generic test components
import { TestWaitingOverlay } from '../../../components/test/TestWaitingOverlay';
import { ReMarkingModal } from '../../../components/test/ReMarkingModal';
import { TestErrorBoundary } from '../../../components/test/TestErrorBoundary';
import { ConnectionMonitor } from '../../../components/test/ConnectionMonitor';
import { TimeUpOverlay } from '../../../components/test/TimeUpOverlay'; // PRD-0019
import { ExtraTimeBanner } from '../../../components/test/ExtraTimeBanner'; // PRD-0019

// Core test hooks
import { useTestData } from '../../../hooks/test/useTestData';
import { useTestSession, type StudentAnswers } from '../../../hooks/test/useTestSession';
import { useTestTimer } from '../../../hooks/test/useTestTimer';
import { useTestSubmission } from '../../../hooks/test/useTestSubmission';
import { useTestAutoSave } from '../../../hooks/useTestAutoSave';
import { useNavigation } from '../../../hooks/useNavigation';
import { useHeadphonePermission } from '../../../hooks/audio/useHeadphonePermission';
import { useTestCompletionCheck } from '../../../hooks/test/useTestCompletionCheck'; // PRD-0019 Task 6.3
import { useBeforeUnloadWarning } from '../../../hooks/test/useBeforeUnloadWarning'; // PRD-0019 Task 6.7
import { useTeacherEndRedirect } from '../../../hooks/test/useTeacherEndRedirect'; // BUG-FIX: Redirect to results on teacher-end
import { useIntegrityRefreshRequest } from '../../../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../../hooks/test/useFullscreenMode';
import type { SavedMobileState } from '../../../types/practice.types';
import { toast } from '../../../components/modern/ToastNotification';
import { listeningDiagnostics } from '../../../utils/listeningDiagnostics';

// Services
import { sessionService } from '../../../services/sessionService';
// @ts-ignore - Firebase is a .js file
import { database } from '../../../services/firebase';
import { ref, update, get } from 'firebase/database';

// Types for audio sections
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

interface LiveListeningPlayerProgress {
  currentAudioIndex?: number;
  audioIndicesCompleted?: number[];
  currentSection?: number;
  currentQuestionNumber?: number;
  volume?: number;
  playbackSpeed?: number;
}

/**
 * Get IELTS-style task instructions
 */
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

/**
 * ListeningTestPage Content Component
 */
const ListeningTestPageContent: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const { isMobileExamMode } = useMobileExamMode();
  const { checkAndRedirect } = useTeacherEndRedirect({ sessionCode }); // BUG-FIX: Redirect to results on teacher-end
  const submitTestRef = useRef<
    ((submitMode?: boolean) => Promise<void>) | null
  >(null);
  const lockInputsRef = useRef<(() => void) | null>(null);
  const flushIntegrityRef = useRef<(() => Promise<void>) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autosaveErrorToastRef = useRef<string | null>(null);
  const mobileStateDirtyRef = useRef(false);
  const mobileHydrationCompleteRef = useRef(false);
  const livePlayerProgressRef = useRef<LiveListeningPlayerProgress | null>(null);
  const listeningStudentId = sessionService.getPlayerId() || '';

  // ═══════════════════════════════════════════════════════════════
  // CORE TEST STATE
  // ═══════════════════════════════════════════════════════════════

  const {
    testData,
    loading,
    error,
    questionsWithAnswersRef,
  } = useTestData({ sessionCode });

  // PRD-0019 Task 6.3: Re-entry prevention - check if test already completed
  useTestCompletionCheck({
    sessionCode,
    testSkill: testData?.skill,
    enabled: !loading && !!testData,
    surface: 'listening_test',
    onForceSubmit: async () => {
      if (!submitTestRef.current) return;
      if (flushIntegrityRef.current) {
        await flushIntegrityRef.current();
      }
      await submitTestRef.current(true);
    },
  });

  // Answer management
  const [answers, setAnswers] = useState<StudentAnswers>({});
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [autoSaveMobileState, setAutoSaveMobileState] = useState<SavedMobileState | undefined>(undefined);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [livePlayerProgressHydrated, setLivePlayerProgressHydrated] = useState(!sessionCode);

  // ═══════════════════════════════════════════════════════════════
  // LISTENING-SPECIFIC STATE
  // ═══════════════════════════════════════════════════════════════

  // Section management - track by INDEX in audioSections array to support multiple audios per logical section
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [audioIndicesCompleted, setAudioIndicesCompleted] = useState<number[]>([]);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); // Speed control - can be changed by teacher
  const [audioError, setAudioError] = useState<string | null>(null); // Track generic audio errors
  const [teacherPausedAudio, setTeacherPausedAudio] = useState(false); // Track if teacher paused audio
  const [teacherSeekPosition, setTeacherSeekPosition] = useState<number | null>(null); // Seek position from teacher

  // Wait time popup state
  const [showWaitPopup, setShowWaitPopup] = useState(false);
  const [waitPopupData, setWaitPopupData] = useState<{
    currentSection: number;
    nextSection: number;
    waitTime: number;
  } | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  const {
    session,
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    reMarkingData,
    showReMarkModal,
    setShowReMarkModal,
    isConnected,
    audioCommand,
    accommodation,
    // PRD-0018: Unified Audio Architecture
    masterAudioState,
    audioMode,
    headphoneRequest,
    antiCheatConfig,
    integrityRefreshRequestedAt,
    mobileState: savedMobileState,
  } = useTestSession({
    sessionCode,
    testData,
    answers,
    testSubmitted,
    testResults: null,
  });

  // PRD-0018 Task 6.2: Headphone permission for offline mode
  const {
    requestPermission: handleRequestHeadphones,
    // Note: isPending not used here as AudioPlayer gets status from headphoneRequest prop
  } = useHeadphonePermission({
    sessionCode,
    role: 'student',
    studentId: sessionService.getPlayerId() || undefined,
    enabled: audioMode === 'offline',
  });

  // PRD-0018 Task 7.4: Solo mode detection
  // Solo mode is when there's no session code (self-study or homework)
  // Note: sessionStatus doesn't have 'solo' value, detection is based on sessionCode presence
  const isSoloMode = !sessionCode;
  const effectivePlayerMode: 'solo' | 'session' = isSoloMode ? 'solo' : 'session';

  // Timer management
  const handleTimeUp = useCallback(() => {
    if (sessionStatus === 'in-progress' && !testSubmitted && submitTestRef.current) {
      submitTestRef.current(true);
    }
  }, [sessionStatus, testSubmitted]);

  const { timeRemaining: calculatedTime, formatTime, showTimeUpOverlay, gracePeriodRemaining, isInExtraTime } = useTestTimer({
    testData,
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    testSubmitted,
    onTimeUp: handleTimeUp,
    onGracePeriodStart: () => lockInputsRef.current?.(),
    extraTime: accommodation?.extraTime || 0,
  });

  useEffect(() => {
    setTimeRemaining(calculatedTime);
  }, [calculatedTime]);

  const {
    addEvent,
    warningLevel,
    warningMessage,
    shouldAutoSubmit,
    flushEvents,
    getIntegrityReport,
  } = useTestIntegrity({
    config: antiCheatConfig,
    context: 'session',
    surface: 'listening_test',
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    testId: testData?.id || '',
  });

  useAntiCopyPaste({
    enabled: antiCheatConfig?.detectCopyPaste || false,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onEvent: addEvent,
    allowEditorPaste: false,
    detectRightClick: antiCheatConfig?.detectRightClick || false,
    detectKeyboardShortcuts: antiCheatConfig?.detectKeyboardShortcuts || false,
  });

  useFullscreenMode({
    enabled: antiCheatConfig?.requireFullscreen || false,
    onFullscreenExit: addEvent,
  });

  useEffect(() => {
    flushIntegrityRef.current = () => flushEvents('teacher_force_submit');
  }, [flushEvents]);

  useIntegrityRefreshRequest({
    enabled: sessionStatus === 'in-progress' && !testSubmitted,
    requestTimestamp: integrityRefreshRequestedAt,
    onRefreshRequested: () => flushEvents('teacher_refresh'),
  });

  // PRD-0019 Task 6.7: Warn before leaving page during active test
  useBeforeUnloadWarning({
    enabled: !testSubmitted && sessionStatus === 'in-progress',
  });

  // Status stabilization
  const statusStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStableStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (error === 'Authentication required') {
      navigateTo('LOGIN', {}, { reason: 'auth_required', replace: true });
      return;
    }

    // PRD-TEST-END-FLOW: Redirects to waiting room with results modal via checkAndRedirect
    if (!loading && !testData && !error && sessionCode) {
      listeningDiagnostics.log('⚠️ Test data no longer available, checking if auto-submitted...');
      checkAndRedirect().then((redirected) => {
        if (!redirected) {
          listeningDiagnostics.log('→ Not auto-submitted, redirecting to waiting room');
          navigateTo('STUDENT_WAITING',
            { gameSessionId: sessionCode },
            { reason: 'test_data_cleared', replace: true }
          );
        }
      });
      return;
    }

    // IMPORTANT: If we still have testData loaded, stay on the active test page.
    // Listening previously navigated away on a transient 'waiting' status before
    // the teacher-end redirect path could attach showResults state.
    if (testData && sessionCode) {
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
        statusStableTimerRef.current = null;
      }

      if (sessionStatus && sessionStatus !== lastStableStatusRef.current) {
        listeningDiagnostics.log(`📊 [ListeningTestPage] Session status: ${sessionStatus} (testData loaded, staying on test page)`);
        lastStableStatusRef.current = sessionStatus;
      }
      return;
    }

    if (sessionStatus && sessionCode) {
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
      }

      if (sessionStatus === 'in-progress') {
        return;
      }

      if (sessionStatus === 'waiting') {
        statusStableTimerRef.current = setTimeout(() => {
          if (sessionStatus === 'waiting') {
            handleSessionChange(sessionStatus, sessionCode);
          }
        }, 2000);
        return;
      }

      handleSessionChange(sessionStatus, sessionCode);
    }

    return () => {
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
      }
    };
  }, [testData, loading, error, sessionCode, sessionStatus, navigateTo, handleSessionChange]);

  // ═══════════════════════════════════════════════════════════════
  // AUDIO AUTO-PLAY CONTROL
  // ═══════════════════════════════════════════════════════════════

  // Force auto-play when session is in-progress
  // This achieves two goals:
  // 1. Audio starts automatically when test begins
  // 2. Prevents manual pausing (it will immediately unpause) - Simulating exam conditions
  // BUT: Respects teacher audio pause command (teacherPausedAudio)
  useEffect(() => {
    if (sessionStatus === 'in-progress' && !testSubmitted && !isPaused && !audioError && !teacherPausedAudio) {
      // Check if current audio index hasn't been marked complete
      const isAudioComplete = audioIndicesCompleted.includes(currentAudioIndex);

      if (!isAudioComplete && !isPlaying) {
        setIsPlaying(true);
      }
    } else if ((isPaused || sessionStatus !== 'in-progress' || teacherPausedAudio) && isPlaying) {
      // Pause audio if teacher pauses test, session ends, or teacher broadcast audio pause
      setIsPlaying(false);
    }
  }, [sessionStatus, testSubmitted, isPaused, currentAudioIndex, audioIndicesCompleted, isPlaying, audioError, teacherPausedAudio]);

  // ═══════════════════════════════════════════════════════════════
  // TEACHER AUDIO COMMAND LISTENER
  // ═══════════════════════════════════════════════════════════════

  // Track last processed command to avoid re-processing
  const lastProcessedCommandRef = useRef<number>(0);
  // Track when student joined to ignore stale commands
  const studentJoinTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!audioCommand || audioCommand.timestamp <= lastProcessedCommandRef.current) {
      return;
    }

    // CRITICAL: Ignore commands that were sent BEFORE the student joined
    // This prevents stale pause commands from blocking audio on join
    if (audioCommand.timestamp < studentJoinTimeRef.current) {
      listeningDiagnostics.log('🔇 [ListeningTest] Ignoring stale audio command from before join:', audioCommand);
      lastProcessedCommandRef.current = audioCommand.timestamp;
      return;
    }

    // Mark this command as processed
    lastProcessedCommandRef.current = audioCommand.timestamp;

    listeningDiagnostics.log('🎧 [ListeningTest] Processing audio command:', audioCommand);

    if (audioCommand.type === 'pause') {
      // Teacher broadcast: pause all audio
      setTeacherPausedAudio(true); // Set flag to prevent autoplay from re-enabling
      setIsPlaying(false);
      listeningDiagnostics.log('⏸️ [ListeningTest] Audio paused by teacher');
    } else if (audioCommand.type === 'resume') {
      // Teacher broadcast: resume audio
      setTeacherPausedAudio(false); // Clear flag to allow autoplay
      setAudioError(null); // Clear any audio errors to allow retry
      listeningDiagnostics.log('▶️ [ListeningTest] Audio resumed by teacher');
    } else if (audioCommand.type === 'skipToSection' && audioCommand.sectionNumber) {
      // Teacher broadcast: skip to specific section - find FIRST audio with that section number
      const targetSection = audioCommand.sectionNumber;
      const targetIndex = audioSections.findIndex(s => s.number === targetSection);
      if (targetIndex >= 0 && targetIndex !== currentAudioIndex) {
        listeningDiagnostics.log(`⏭️ [ListeningTest] Skipping to section ${targetSection} (index ${targetIndex}) by teacher command`);
        setCurrentAudioIndex(targetIndex);
        setIsPlaying(false); // Pause before section change
        // Audio will auto-start when section changes due to auto-play logic
      }
    } else if (audioCommand.type === 'setSpeed' && audioCommand.speed) {
      // Teacher broadcast: change playback speed for all students
      listeningDiagnostics.log(`⚡ [ListeningTest] Playback speed changed to ${audioCommand.speed}x by teacher`);
      setPlaybackSpeed(audioCommand.speed);
    } else if (audioCommand.type === 'seekToPosition' && audioCommand.sectionNumber !== undefined && audioCommand.position !== undefined) {
      // Teacher broadcast: seek to specific position within a section
      const targetSection = audioCommand.sectionNumber;
      const targetIndex = audioSections.findIndex(s => s.number === targetSection);

      if (targetIndex >= 0) {
        // If different section, switch to it first
        if (targetIndex !== currentAudioIndex) {
          listeningDiagnostics.log(`⏭️ [ListeningTest] Switching to section ${targetSection} for seek`);
          setCurrentAudioIndex(targetIndex);
        }

        // Set the seek position - AudioPlayer will handle the actual seeking
        listeningDiagnostics.log(`⏩ [ListeningTest] Seeking to position ${audioCommand.position}s in section ${targetSection} by teacher command`);
        setTeacherSeekPosition(audioCommand.position);
      }
    }
    // Note: audioSections not in deps to avoid "used before declaration" - it's stable from useMemo
  }, [audioCommand, currentAudioIndex]);

  // Test submission
  const {
    isSubmitting,
    testSubmitted: submissionTestSubmitted,
    testResults,
    loadedAnswers,
    handleSubmit: submitTest,
    isLocked, // PRD-0019: Input locking during grace period
    lockInputs, // PRD-0019: Function to lock inputs
  } = useTestSubmission({
    testData,
    session,
    sessionCode,
    answers,
    timeRemaining,
    integrityReport: antiCheatConfig ? getIntegrityReport() : null,
    questionsWithAnswersRef,
  });

  useEffect(() => {
    submitTestRef.current = submitTest;
  }, [submitTest]);

  useEffect(() => {
    lockInputsRef.current = lockInputs;
  }, [lockInputs]);

  useEffect(() => {
    setTestSubmitted(submissionTestSubmitted);
  }, [submissionTestSubmitted]);

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
    if (shouldAutoSubmit && !testSubmitted && submitTestRef.current) {
      (async () => {
        await flushEvents('auto_submit');
        await submitTestRef.current?.(true);
      })();
    }
  }, [flushEvents, shouldAutoSubmit, testSubmitted]);

  useEffect(() => {
    if (loadedAnswers && Object.keys(loadedAnswers).length > 0) {
      setAnswers(loadedAnswers);
    }
  }, [loadedAnswers]);

  // Merge test results with remark data
  const mergedQuestionResults = useMemo(() => {
    const baseResults = testResults?.questionResults || {};

    if (reMarkingData?.reMarkDetails) {
      const updatedResults = { ...baseResults };
      Object.entries(reMarkingData.reMarkDetails).forEach(([qNum, score]) => {
        updatedResults[parseInt(qNum)] = Number(score) > 0;
      });
      return updatedResults;
    }

    return baseResults;
  }, [testResults?.questionResults, reMarkingData]);

  // Auto-save
  const autoSaveStatus = useTestAutoSave({
    sessionCode: sessionCode || '',
    studentId: listeningStudentId,
    answers,
    mobileState: autoSaveMobileState,
    enabled: !testSubmitted && sessionStatus === 'in-progress',
  });

  useEffect(() => {
    if (autoSaveStatus.status === 'saved') {
      autosaveErrorToastRef.current = null;
      return;
    }

    if (autoSaveStatus.status === 'error' && autoSaveStatus.error && autosaveErrorToastRef.current !== autoSaveStatus.error) {
      autosaveErrorToastRef.current = autoSaveStatus.error;
      toast.error(autoSaveStatus.error);
    }
  }, [autoSaveStatus.error, autoSaveStatus.status]);

  // ═══════════════════════════════════════════════════════════════
  // AUDIO SECTIONS CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  // Get audio sections from test data or use defaults
  const audioSections: AudioSection[] = useMemo(() => {
    // Check if testData has audioSections (Listening tests)
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

  // Get current audio section by INDEX (not by section number) to support multiple audios per section
  const currentAudioSection = audioSections[currentAudioIndex] || audioSections[0];
  // For backward compatibility, derive currentSection from the audio section's number
  const currentSection = currentAudioSection?.number || 1;
  const findSectionNumberForQuestion = useCallback((questionNumber?: number | null) => {
    if (typeof questionNumber !== 'number' || !Number.isFinite(questionNumber)) {
      return undefined;
    }
    return audioSections.find(section => (
      questionNumber >= section.startQuestion && questionNumber <= section.endQuestion
    ))?.number;
  }, [audioSections]);

  // ═══════════════════════════════════════════════════════════════
  // SECTION PERSISTENCE (Firebase)
  // ═══════════════════════════════════════════════════════════════

  // Restore currentAudioIndex and currentQuestionNumber from Firebase on page load
  const sectionRestoredRef = useRef(false);
  useEffect(() => {
    const playerId = sessionService.getPlayerId();

    if (!sessionCode || !playerId) {
      livePlayerProgressRef.current = null;
      sectionRestoredRef.current = true;
      setLivePlayerProgressHydrated(true);
      return;
    }

    if (sectionRestoredRef.current) return;

    const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
    setLivePlayerProgressHydrated(false);

    get(playerRef).then((snapshot) => {
      if (snapshot.exists()) {
        const playerData = snapshot.val();
        const restoredProgress: LiveListeningPlayerProgress = {};

        // Restore audio section
        // Support both new (currentAudioIndex) and old (currentSection) format
        if (typeof playerData.currentAudioIndex === 'number' && playerData.currentAudioIndex > 0) {
          listeningDiagnostics.log(`🔄 [Section] Restoring audio index ${playerData.currentAudioIndex} from Firebase`);
          setCurrentAudioIndex(playerData.currentAudioIndex);
          restoredProgress.currentAudioIndex = playerData.currentAudioIndex;
          if (playerData.audioIndicesCompleted && Array.isArray(playerData.audioIndicesCompleted)) {
            setAudioIndicesCompleted(playerData.audioIndicesCompleted);
            restoredProgress.audioIndicesCompleted = playerData.audioIndicesCompleted;
          }
        } else if (playerData.currentSection && playerData.currentSection > 1) {
          // Legacy: convert section number to index
          const idx = audioSections.findIndex(s => s.number === playerData.currentSection);
          if (idx > 0) {
            listeningDiagnostics.log(`🔄 [Section] Restoring section ${playerData.currentSection} as index ${idx} from Firebase (legacy)`);
            setCurrentAudioIndex(idx);
            restoredProgress.currentAudioIndex = idx;
            restoredProgress.currentSection = playerData.currentSection;
          }
        }

        // Restore current question number
        if (typeof playerData.currentQuestionNumber === 'number' && playerData.currentQuestionNumber > 1) {
          listeningDiagnostics.log(`🔄 [Question] Restoring question ${playerData.currentQuestionNumber} from Firebase`);
          setCurrentQuestionNumber(playerData.currentQuestionNumber);
          restoredProgress.currentQuestionNumber = playerData.currentQuestionNumber;
        }

        // Restore volume and playback speed if saved
        if (typeof playerData.volume === 'number') {
          listeningDiagnostics.log(`🔄 [Audio] Restoring volume ${playerData.volume} from Firebase`);
          setVolume(playerData.volume);
          restoredProgress.volume = playerData.volume;
        }
        if (typeof playerData.playbackSpeed === 'number') {
          listeningDiagnostics.log(`🔄 [Audio] Restoring playback speed ${playerData.playbackSpeed}x from Firebase`);
          setPlaybackSpeed(playerData.playbackSpeed);
          restoredProgress.playbackSpeed = playerData.playbackSpeed;
        }

        livePlayerProgressRef.current = restoredProgress;
      } else {
        livePlayerProgressRef.current = null;
      }
      sectionRestoredRef.current = true;
      setLivePlayerProgressHydrated(true);
    }).catch(err => {
      console.error('Failed to restore section:', err);
      livePlayerProgressRef.current = null;
      sectionRestoredRef.current = true;
      setLivePlayerProgressHydrated(true);
    });
  }, [sessionCode, audioSections]);

  // Save currentAudioIndex, currentQuestionNumber, and audio settings to Firebase when they change
  useEffect(() => {
    if (!sessionCode || !sessionService.getPlayerId() || !sectionRestoredRef.current) return;

    const playerId = sessionService.getPlayerId();
    const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);

    update(playerRef, {
      currentAudioIndex,
      audioIndicesCompleted,
      currentSection, // Keep for backward compatibility
      currentQuestionNumber,
      volume,
      playbackSpeed,
      lastActivity: Date.now(),
    }).then(() => {
      listeningDiagnostics.log(`💾 [State] Saved: audio index ${currentAudioIndex}, question ${currentQuestionNumber}, volume ${volume}, speed ${playbackSpeed}x`);
    }).catch(err => {
      console.error('Failed to save state:', err);
    });
  }, [sessionCode, currentAudioIndex, audioIndicesCompleted, currentSection, currentQuestionNumber, volume, playbackSpeed]);

  // ═══════════════════════════════════════════════════════════════
  // ACCOMMODATION OVERRIDES
  // ═══════════════════════════════════════════════════════════════

  // Compute effective audio controls with accommodation overrides
  const effectiveAudioControls = useMemo(() => {
    const baseControls = (testData?.settings as any)?.audioControls || {};

    // If student has fullAudioControls accommodation, enable everything
    if (accommodation?.fullAudioControls) {
      return {
        ...baseControls,
        showPlayPause: true,
        showSeekControl: true, // Fixed: was showSeekBar, AudioPlayer expects showSeekControl
        showSpeedControl: true,
        showSkipSection: true,
        showVolumeControl: true,
      };
    }

    return baseControls;
  }, [testData, accommodation]);

  // Compute effective replay settings with accommodation overrides
  const effectiveAllowReplay = useMemo(() => {
    if (accommodation?.unlimitedReplays) return true;
    if (accommodation?.maxReplays && accommodation.maxReplays > 0) return true;
    return (testData?.settings as any)?.allowReplay || false;
  }, [testData, accommodation]);

  const effectiveMaxReplays = useMemo(() => {
    if (accommodation?.unlimitedReplays) return 999; // Effectively unlimited
    if (accommodation?.maxReplays) return accommodation.maxReplays;
    return (testData?.settings as any)?.maxReplays || 0;
  }, [testData, accommodation]);

  // Log accommodation status when it changes
  useEffect(() => {
    if (accommodation) {
      listeningDiagnostics.log('♿ [ListeningTest] Accommodation active:', accommodation);
    }
  }, [accommodation]);

  // Section info for navigation
  const sectionsInfo = useMemo(() => {
    return audioSections.map(s => ({
      number: s.number,
      startQ: s.startQuestion,
      endQ: s.endQuestion,
      name: s.name,
    }));
  }, [audioSections]);

  // ═══════════════════════════════════════════════════════════════
  // MOBILE EXAM MODE STATE (PRD-0045 Phase 3)
  // ═══════════════════════════════════════════════════════════════

  // Shell overlay toggles — all host-owned, passed as props to the scaffold
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [textSizeControlOpen, setTextSizeControlOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // Font size for mobile text
  const [fontSize, setFontSize] = useState(16);
  const [mobileStateHydrated, setMobileStateHydrated] = useState(!isMobileExamMode);

  // Viewed part number — separate from currentAudioSection (which drives audio).
  // In Standard mode tabs only change viewedPartNumber; in Practice/Relaxed they change both.
  // Initialized to the current audio section's part number.
  const [viewedPartNumber, setViewedPartNumber] = useState(currentSection);

  // Sync viewedPartNumber to currentSection when audio auto-advances (Standard mode)
  // Only auto-sync when NOT in Practice mode, so viewed-part stays independent during user browsing
  const prevAudioSectionRef = useRef(currentSection);
  useEffect(() => {
    if (prevAudioSectionRef.current !== currentSection) {
      prevAudioSectionRef.current = currentSection;
      // Auto-sync viewed part to audio part when audio advances
      // This keeps the UX intuitive: when audio auto-moves, content follows
      if (!effectiveAudioControls?.showPlayPause) {
        // Standard mode: auto-sync viewed part to audio
        setViewedPartNumber(currentSection);
      }
    }
  }, [currentSection, effectiveAudioControls]);

  // Ref for the mobile main content scroll container (task 3.6: reset scroll on part change)
  const mobileMainContentRef = useRef<HTMLDivElement>(null);
  const prevViewedPartRef = useRef(viewedPartNumber);
  useEffect(() => {
    if (prevViewedPartRef.current !== viewedPartNumber) {
      prevViewedPartRef.current = viewedPartNumber;
      // Reset scroll to top when viewed part changes (task 3.6)
      if (mobileMainContentRef.current) {
        mobileMainContentRef.current.scrollTop = 0;
      }
    }
  }, [viewedPartNumber]);

  // ── Image-mode state (PRD-0045 Phase 4) ─────────────────────────────────
  /** Whether the answer entry sheet is open (image mode only) */
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  /** Per-part zoom state, keyed by part number string */
  const [zoomByPart, setZoomByPart] = useState<Record<string, ImageZoomState>>({});
  /** Per-part answer sheet scroll position */
  const [answerSheetScrollByPart, setAnswerSheetScrollByPart] = useState<Record<string, number>>({});

  const handleZoomChange = useCallback((partNumber: number, zoom: ImageZoomState) => {
    setZoomByPart(prev => ({ ...prev, [String(partNumber)]: zoom }));
  }, []);

  const handleAnswerSheetScrollChange = useCallback((partNumber: number, scrollTop: number) => {
    setAnswerSheetScrollByPart(prev => ({ ...prev, [String(partNumber)]: scrollTop }));
  }, []);

  // Questions for the currently VIEWED part (may differ from audio-playing part in Standard mode)
  const viewedPartSection = useMemo(() => {
    return audioSections.find(s => s.number === viewedPartNumber) || audioSections[0];
  }, [audioSections, viewedPartNumber]);

  const viewedPartQuestions = useMemo(() => {
    if (!testData?.questions || !viewedPartSection) return [];
    return testData.questions.filter((q: Question) =>
      q.number >= viewedPartSection.startQuestion &&
      q.number <= viewedPartSection.endQuestion
    );
  }, [testData?.questions, viewedPartSection]);

  // Group questions by type for the viewed part (mobile direct-question mode)
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

  const isMobileBlockingState = isPaused || sessionStatus === 'waiting' || showWaitPopup || showTimeUpOverlay;

  useEffect(() => {
    if (!isMobileBlockingState) {
      return;
    }

    setSubmitSheetOpen(false);
    setOverflowMenuOpen(false);
    setTextSizeControlOpen(false);
    setInstructionsOpen(false);
    setAnswerSheetOpen(false);
  }, [isMobileBlockingState]);

  // ═══════════════════════════════════════════════════════════════
  // MOBILE PERSISTENCE — Phase 6.0: Serialization → Autosave bridge
  // ═══════════════════════════════════════════════════════════════

  /** Serialize current mobile state for autosave (excludes playback for live mode) */
  const serializedMobileState = useMemo<SavedMobileState | undefined>(() => {
    if (!isMobileExamMode) return undefined;
    const compatQuestionsByPart: Record<number, number[]> = {};
    for (const section of audioSections) {
      compatQuestionsByPart[section.number] = Array.from(
        { length: section.endQuestion - section.startQuestion + 1 },
        (_, i) => section.startQuestion + i,
      );
    }

    return serializeListeningMobileState({
      compatContext: testData?.questions && audioSections.length > 0
        ? {
          materialId: testData.id || '',
          partCount: audioSections.length,
          questionsByPart: compatQuestionsByPart,
          scopeKey: sessionCode || '',
        }
        : undefined,
      viewedPartNumber,
      currentQuestionNumber,
      textSize: fontSize,
      answerSheetScrollByPart: answerSheetScrollByPart as Record<string, number>,
      imageZoomByPart: zoomByPart as Record<string, { scale: number; offsetX: number; offsetY: number }>,
      // playback is intentionally EXCLUDED for live mode — teacher controls timing
    }) as SavedMobileState;
  }, [audioSections, answerSheetScrollByPart, currentQuestionNumber, fontSize, isMobileExamMode, sessionCode, testData, viewedPartNumber, zoomByPart]);

  /** Build compatibility context from live test data */
  const listeningCompatCtx = useMemo<ListeningCompatContext | null>(() => {
    if (!testData?.questions || audioSections.length === 0) return null;
    const questionsByPart: Record<number, number[]> = {};
    for (const section of audioSections) {
      questionsByPart[section.number] = Array.from(
        { length: section.endQuestion - section.startQuestion + 1 },
        (_, i) => section.startQuestion + i,
      );
    }
    return {
      materialId: testData.id || '',
      partCount: audioSections.length,
      questionsByPart,
      scopeKey: sessionCode || '',
    };
  }, [testData, audioSections, sessionCode]);

  /** Hydrate mobile state from RTDB on first load — strict compat guard */
  useEffect(() => {
    let cancelled = false;
    const shouldSkipHydration = mobileStateDirtyRef.current && mobileHydrationCompleteRef.current;

    if (!isMobileExamMode) {
      setMobileStateHydrated(true);
      mobileHydrationCompleteRef.current = false;
      mobileStateDirtyRef.current = false;
      return undefined;
    }

    if (!testData) {
      return undefined;
    }

    if (sessionCode && !livePlayerProgressHydrated) {
      return undefined;
    }

    if (shouldSkipHydration) {
      return undefined;
    }

    const hydrateState = async () => {
      try {
        const persistedTextSize = listeningStudentId
          ? await storage.get<number | string>(getListeningTextSizeStorageKey(listeningStudentId))
          : undefined;
        const parsedPersistedTextSize = typeof persistedTextSize === 'number'
          ? persistedTextSize
          : typeof persistedTextSize === 'string'
            ? Number(persistedTextSize)
            : undefined;
        const fallbackTextSize = typeof parsedPersistedTextSize === 'number' && Number.isFinite(parsedPersistedTextSize)
          ? parsedPersistedTextSize
          : 16;

        if (cancelled || (mobileStateDirtyRef.current && mobileHydrationCompleteRef.current)) {
          return;
        }

        setFontSize(fallbackTextSize);

        if (savedMobileState && listeningCompatCtx) {
          if (!isCompatibleListeningMobileState(savedMobileState, listeningCompatCtx)) {
            listeningDiagnostics.warn('[ListeningTest] Incompatible mobileState payload — discarding', savedMobileState);
          } else {
            const hydrated = hydrateListeningMobileState(
              savedMobileState,
              listeningCompatCtx,
              fallbackTextSize,
              false,
            );
            const authoritativeQuestionNumber = livePlayerProgressRef.current?.currentQuestionNumber;
            const authoritativeViewedPartNumber = findSectionNumberForQuestion(authoritativeQuestionNumber);
            const resolvedViewedPartNumber = authoritativeViewedPartNumber
              ?? hydrated.viewedPartNumber;
            const resolvedQuestionNumber = authoritativeViewedPartNumber
              ? authoritativeQuestionNumber
              : hydrated.currentQuestionNumber;

            listeningDiagnostics.log('[ListeningTest] Hydrating mobile state from RTDB', hydrated);

            if (resolvedViewedPartNumber != null) setViewedPartNumber(resolvedViewedPartNumber);
            if (hydrated.textSize != null) setFontSize(hydrated.textSize);
            if (resolvedQuestionNumber != null) setCurrentQuestionNumber(resolvedQuestionNumber);
            if (hydrated.imageZoomByPart) setZoomByPart(hydrated.imageZoomByPart as Record<string, ImageZoomState>);
            if (hydrated.answerSheetScrollByPart) setAnswerSheetScrollByPart(hydrated.answerSheetScrollByPart as Record<string, number>);

            setSubmitSheetOpen(false);
            setOverflowMenuOpen(false);
            setTextSizeControlOpen(false);
            setInstructionsOpen(false);
            setAnswerSheetOpen(false);
          }
        }

        mobileStateDirtyRef.current = false;
        mobileHydrationCompleteRef.current = true;
      } catch (hydrateError) {
        listeningDiagnostics.warn('[ListeningTest] Failed to hydrate live mobile state:', hydrateError);
        mobileStateDirtyRef.current = false;
        mobileHydrationCompleteRef.current = true;
      } finally {
        if (!cancelled) {
          setMobileStateHydrated(true);
        }
      }
    };

    setMobileStateHydrated(false);
    void hydrateState();

    return () => {
      cancelled = true;
    };
  }, [findSectionNumberForQuestion, isMobileExamMode, listeningStudentId, livePlayerProgressHydrated, savedMobileState, listeningCompatCtx, sessionCode, testData]);

  /** Persist text-size to platform storage as a fallback (Reading parity) */
  useEffect(() => {
    if (!isMobileExamMode || !listeningStudentId) return;
    storage.set(getListeningTextSizeStorageKey(listeningStudentId), String(fontSize)).catch(() => {});
  }, [fontSize, isMobileExamMode, listeningStudentId]);

  /** Bridge: push serialized mobile state to autosave only when dirty */
  useEffect(() => {
    if (!isMobileExamMode || !mobileStateHydrated || !serializedMobileState) {
      setAutoSaveMobileState(undefined);
      return;
    }
    if (!mobileStateDirtyRef.current && mobileHydrationCompleteRef.current) return;
    mobileStateDirtyRef.current = false;
    setAutoSaveMobileState(serializedMobileState);
  }, [isMobileExamMode, mobileStateHydrated, serializedMobileState]);

  /** Mark state dirty when mobile-relevant values change */
  const markMobileStateDirty = useCallback(() => {
    mobileStateDirtyRef.current = true;
  }, []);

  // Attach dirty-marking to handlers where Reading has them
  const handleZoomChangeWithDirty = useCallback((partNumber: number, zoom: ImageZoomState) => {
    handleZoomChange(partNumber, zoom);
    markMobileStateDirty();
  }, [handleZoomChange, markMobileStateDirty]);

  const handleAnswerSheetScrollWithDirty = useCallback((partNumber: number, scrollTop: number) => {
    handleAnswerSheetScrollChange(partNumber, scrollTop);
    markMobileStateDirty();
  }, [handleAnswerSheetScrollChange, markMobileStateDirty]);

  // Mobile tab change handler — behavior depends on mode (task 3.3 / 3.4)
  const handleMobilePartChange = useCallback((partNumber: number) => {
    // Always update the viewed part
    setViewedPartNumber(partNumber);
    markMobileStateDirty();

    // Set currentQuestionNumber to first question of the tapped part
    const section = audioSections.find(s => s.number === partNumber);
    if (section) {
      setCurrentQuestionNumber(section.startQuestion);
    }

    const mobileSectionIndex = audioSections.findIndex(s => s.number === partNumber);
    if (section && mobileSectionIndex >= 0) {
      setCurrentAudioIndex(mobileSectionIndex);
      setAudioError(null);
      setIsPlaying(Boolean(section.audioUrl || section.streamUrl));
      listeningDiagnostics.log(`[Mobile] Switched to section ${partNumber} audio`);
      return;
    }

    // In Practice/Relaxed modes (showPlayPause=true), also change audio (task 3.4)
    if (effectiveAudioControls?.showPlayPause) {
      const sectionIndex = audioSections.findIndex(s => s.number === partNumber);
      if (sectionIndex >= 0 && sectionIndex !== currentAudioIndex) {
        setCurrentAudioIndex(sectionIndex);
        setAudioError(null);
        listeningDiagnostics.log(`🎵 [Mobile] Switched to section ${partNumber} audio (Practice/Relaxed mode)`);
      }
    } else {
      listeningDiagnostics.log(`📋 [Mobile] Viewing section ${partNumber} questions (audio stays on section ${currentSection} - Standard mode)`);
    }
  }, [audioSections, currentAudioIndex, currentSection, effectiveAudioControls, markMobileStateDirty]);

  const handleMobileImageNavigate = useCallback((image: QuestionImage) => {
    const targetSection = audioSections.find(s => s.number === image.sectionNumber);
    const targetAudioIndex = audioSections.findIndex(s => s.number === image.sectionNumber);
    const legacyImageRange = image as QuestionImage & { startQuestion?: number };
    const targetQuestion = image.questionRange?.start ?? legacyImageRange.startQuestion ?? targetSection?.startQuestion ?? currentQuestionNumber;

    setViewedPartNumber(image.sectionNumber);
    setCurrentQuestionNumber(targetQuestion);

    if (targetSection && targetAudioIndex >= 0 && targetAudioIndex !== currentAudioIndex) {
      setCurrentAudioIndex(targetAudioIndex);
      setAudioError(null);
      setIsPlaying(Boolean(targetSection.audioUrl || targetSection.streamUrl));
      listeningDiagnostics.log(`[Mobile] Swiped to section ${image.sectionNumber} image and audio`);
    }

    markMobileStateDirty();
  }, [audioSections, currentAudioIndex, currentQuestionNumber, markMobileStateDirty]);

  // Mobile submit handler — opens confirmation sheet instead of direct submit (task 5.3)
  const handleMobileSubmit = useCallback(async () => {
    await flushEvents('manual_submit');
    await submitTest(false);
  }, [flushEvents, submitTest]);

  // Mobile leave test handler
  const handleMobileLeaveTest = useCallback(() => {
    setOverflowMenuOpen(false);
    navigateTo('STUDENT_DASHBOARD', {}, { reason: 'leave_test' });
  }, [navigateTo]);

  const handleOpenSubmitSheet = useCallback(() => {
    if (isMobileBlockingState) {
      return;
    }

    setOverflowMenuOpen(false);
    setTextSizeControlOpen(false);
    setInstructionsOpen(false);
    setAnswerSheetOpen(false);
    setSubmitSheetOpen(true);
  }, [isMobileBlockingState]);

  const handleCloseSubmitSheet = useCallback(() => {
    setSubmitSheetOpen(false);
  }, []);

  const handleOpenOverflowMenu = useCallback(() => {
    if (isMobileBlockingState) {
      return;
    }

    setSubmitSheetOpen(false);
    setTextSizeControlOpen(false);
    setInstructionsOpen(false);
    setAnswerSheetOpen(false);
    setOverflowMenuOpen(true);
  }, [isMobileBlockingState]);

  const handleCloseOverflowMenu = useCallback(() => {
    setOverflowMenuOpen(false);
  }, []);

  const handleOpenTextSizeControl = useCallback(() => {
    if (isMobileBlockingState) {
      return;
    }

    setSubmitSheetOpen(false);
    setOverflowMenuOpen(false);
    setInstructionsOpen(false);
    setAnswerSheetOpen(false);
    setTextSizeControlOpen(true);
  }, [isMobileBlockingState]);

  const handleCloseTextSizeControl = useCallback(() => {
    setTextSizeControlOpen(false);
  }, []);

  const handleOpenInstructions = useCallback(() => {
    if (isMobileBlockingState) {
      return;
    }

    setSubmitSheetOpen(false);
    setOverflowMenuOpen(false);
    setTextSizeControlOpen(false);
    setAnswerSheetOpen(false);
    setInstructionsOpen(true);
  }, [isMobileBlockingState]);

  const handleCloseInstructions = useCallback(() => {
    setInstructionsOpen(false);
  }, []);

  const handleMobileTextSizeChange = useCallback((size: number) => {
    markMobileStateDirty();
    setFontSize(size);
  }, [markMobileStateDirty]);

  // ═══════════════════════════════════════════════════════════════
  // DISPLAY MODE & QUESTION IMAGES
  // ═══════════════════════════════════════════════════════════════

  // Get display mode from test data (default to 'text' for backward compatibility)
  const displayMode: ListeningDisplayMode = useMemo(() => {
    if (testData && 'displayMode' in testData) {
      return (testData as any).displayMode || 'text';
    }
    return 'text';
  }, [testData]);

  // Get question images for image mode
  const questionImages: QuestionImage[] | undefined = useMemo(() => {
    if (testData && 'questionImages' in testData) {
      return (testData as any).questionImages;
    }
    return undefined;
  }, [testData]);

  // ═══════════════════════════════════════════════════════════════
  // QUESTIONS FOR CURRENT SECTION
  // ═══════════════════════════════════════════════════════════════

  const currentSectionQuestions = useMemo(() => {
    if (!testData?.questions || !currentAudioSection) return [];

    return testData.questions.filter((q: Question) =>
      q.number >= currentAudioSection.startQuestion &&
      q.number <= currentAudioSection.endQuestion
    );
  }, [testData?.questions, currentAudioSection]);

  // Group questions by type for display
  const questionGroups = useMemo(() => {
    if (currentSectionQuestions.length === 0) return [];

    const firstQuestion = currentSectionQuestions[0];
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

    for (let i = 1; i < currentSectionQuestions.length; i++) {
      const q = currentSectionQuestions[i];
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
  }, [currentSectionQuestions]);

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const handleAnswerChange = useCallback((questionNumber: number, answer: string | string[] | Record<string, string>) => {
    setAnswers(prev => ({ ...prev, [questionNumber]: answer }));
  }, []);

  // Handle section change - navigate to view a different Part's questions
  // Mode-dependent behavior:
  // - Standard mode (showPlayPause=false): Only change questions, audio continues
  // - Practice/Relaxed modes (showPlayPause=true): Change both questions AND audio
  const handleSectionChange = useCallback((sectionNumber: number) => {
    const sectionIndex = audioSections.findIndex(s => s.number === sectionNumber);
    const section = audioSections[sectionIndex];
    if (sectionIndex >= 0 && section) {
      // Always change the visible question
      setCurrentQuestionNumber(section.startQuestion);

      // In Practice/Relaxed modes (showPlayPause=true), also change the audio
      // In Standard mode (showPlayPause=false), keep audio on current section
      if (effectiveAudioControls?.showPlayPause) {
        setCurrentAudioIndex(sectionIndex);
        setAudioError(null);
        listeningDiagnostics.log(`🎵 [Navigation] Switched to section ${sectionNumber} audio (Practice/Relaxed mode)`);
      } else {
        listeningDiagnostics.log(`📋 [Navigation] Viewing section ${sectionNumber} questions (audio stays on section ${currentSection} - Standard mode)`);
      }
    }
    markMobileStateDirty();
  }, [audioSections, currentSection, effectiveAudioControls, markMobileStateDirty]);

  const goToQuestion = useCallback((questionNumber: number) => {
    // Always change the visible question
    setCurrentQuestionNumber(questionNumber);

    // In Practice/Relaxed modes (showPlayPause=true), also switch audio if needed
    // In Standard mode (showPlayPause=false), keep audio on current section
    if (effectiveAudioControls?.showPlayPause) {
      // Find which audio section this question belongs to
      const sectionIndex = audioSections.findIndex(s =>
        questionNumber >= s.startQuestion && questionNumber <= s.endQuestion
      );
      if (sectionIndex >= 0 && sectionIndex !== currentAudioIndex) {
        setCurrentAudioIndex(sectionIndex);
        setAudioError(null);
        listeningDiagnostics.log(`🎵 [Navigation] Switched to section ${audioSections[sectionIndex]?.number} audio for Q${questionNumber} (Practice/Relaxed mode)`);
      }
    } else {
      listeningDiagnostics.log(`📋 [Navigation] Viewing question ${questionNumber} (audio stays on section ${currentSection} - Standard mode)`);
    }
    markMobileStateDirty();
  }, [audioSections, currentAudioIndex, currentSection, effectiveAudioControls, markMobileStateDirty]);

  const handleSubmit = useCallback(() => {
    (async () => {
      await flushEvents('manual_submit');
      await submitTest(false);
    })();
  }, [flushEvents, submitTest]);

  // Audio handlers
  const handlePlayPause = useCallback(() => {
    setAudioError(null); // Clear error on manual toggle
    setIsPlaying(prev => {
      const next = !prev;
      listeningDiagnostics.info('[ListeningTestPage] Toggled play state', {
        currentAudioIndex,
        currentQuestionNumber,
        currentSection,
        next,
        previous: prev,
      });
      return next;
    });
  }, [currentAudioIndex, currentQuestionNumber, currentSection]);

  // Audio time is managed internally by AudioPlayer; this callback is for interface compatibility
  const handleTimeUpdate = useCallback((_current: number, _duration: number) => {
    // Time tracking handled by AudioPlayer component
  }, []);

  useEffect(() => {
    listeningDiagnostics.info('[ListeningTestPage] isPlaying state changed', {
      currentAudioIndex,
      currentQuestionNumber,
      currentSection,
      isPlaying,
      sessionStatus,
      teacherPausedAudio,
    });
  }, [currentAudioIndex, currentQuestionNumber, currentSection, isPlaying, sessionStatus, teacherPausedAudio]);

  const handleSectionComplete = useCallback(() => {
    listeningDiagnostics.log(`🎵 [Section] Audio index ${currentAudioIndex} (section ${currentSection}) completed`);
    setIsPlaying(false);

    // Mark this audio index as completed
    setAudioIndicesCompleted(prev => [...prev, currentAudioIndex]);

    // Check if there's a next audio in the array
    const nextAudioIndex = currentAudioIndex + 1;

    if (nextAudioIndex < audioSections.length) {
      const nextAudio = audioSections[nextAudioIndex];

      // Guard against undefined
      if (!nextAudio) return;

      const waitTime = nextAudio.waitTimeBefore || 0;

      if (waitTime > 0) {
        // Show wait popup
        setWaitPopupData({
          currentSection: currentSection,
          nextSection: nextAudio.number,
          waitTime,
        });
        setShowWaitPopup(true);
      } else {
        // Immediately advance to next audio
        listeningDiagnostics.log(`🎵 [Section] Advancing to audio index ${nextAudioIndex} (section ${nextAudio.number})`);
        // Clear any audio errors from previous audio to allow new audio to play
        setAudioError(null);
        setCurrentAudioIndex(nextAudioIndex);
        setCurrentQuestionNumber(nextAudio.startQuestion);
        setViewedPartNumber(nextAudio.number);
        setIsPlaying(Boolean(nextAudio.audioUrl || nextAudio.streamUrl));
      }
    }
    markMobileStateDirty();
    // If last audio, do nothing (user can review and submit)
  }, [audioSections, currentAudioIndex, currentSection, effectiveAudioControls, markMobileStateDirty]);

  const handleWaitPopupComplete = useCallback(() => {
    if (waitPopupData) {
      // Find the next audio index (current + 1)
      const nextAudioIndex = currentAudioIndex + 1;
      listeningDiagnostics.log(`🎵 [Section] Wait complete, advancing to audio index ${nextAudioIndex} (section ${waitPopupData.nextSection})`);
      // Clear any audio errors from previous section to allow new section to play
      setAudioError(null);
      setCurrentAudioIndex(nextAudioIndex);
      const nextAudio = audioSections[nextAudioIndex];
      if (nextAudio) {
        setCurrentQuestionNumber(nextAudio.startQuestion);
        setViewedPartNumber(nextAudio.number);
        setIsPlaying(Boolean(nextAudio.audioUrl || nextAudio.streamUrl));
      }
    }
    setShowWaitPopup(false);
    setWaitPopupData(null);
    markMobileStateDirty();
  }, [audioSections, currentAudioIndex, effectiveAudioControls, markMobileStateDirty, waitPopupData]);

  // Skip to the NEXT SECTION (not just next audio) - finds first audio of next section number
  const handleSkipToNextSection = useCallback(() => {
    // Find the next section number (different from current)
    const nextSectionNumber = currentSection + 1;
    const nextSectionIndex = audioSections.findIndex(s => s.number === nextSectionNumber);

    if (nextSectionIndex >= 0) {
      listeningDiagnostics.log(`⏭️ [Section] Skipping to section ${nextSectionNumber} (index ${nextSectionIndex})`);
      // Mark all audios up to (but not including) the target as completed
      const indicesToMark: number[] = [];
      for (let i = currentAudioIndex; i < nextSectionIndex; i++) {
        indicesToMark.push(i);
      }
      setAudioIndicesCompleted(prev => [...prev, ...indicesToMark]);
      setAudioError(null);
      setCurrentAudioIndex(nextSectionIndex);
      setCurrentQuestionNumber(audioSections[nextSectionIndex]?.startQuestion || 1);
      if (!effectiveAudioControls?.showPlayPause) {
        setViewedPartNumber(audioSections[nextSectionIndex]?.number || nextSectionNumber);
      }
      setIsPlaying(false); // Will auto-start
    } else {
      // No next section, just go to next audio (fallback to handleSectionComplete behavior)
      handleSectionComplete();
    }
    markMobileStateDirty();
  }, [audioSections, currentAudioIndex, currentSection, effectiveAudioControls, handleSectionComplete, markMobileStateDirty]);

  const handleAudioError = useCallback((error: string) => {
    console.error('Audio error:', error);
    setAudioError(error);
    setIsPlaying(false);
    console.warn('Audio failed to load. Check if the audio file is accessible.');
  }, []);

  // Note: handleSectionChange is defined earlier in the file

  // ═══════════════════════════════════════════════════════════════
  // LOADING & ERROR STATES
  // ═══════════════════════════════════════════════════════════════

  if (loading || (isMobileExamMode && (!livePlayerProgressHydrated || !mobileStateHydrated))) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎧</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>
            Loading Listening Test...
          </div>
        </div>
      </div>
    );
  }

  if (error || !testData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Failed to Load Test
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            {error || 'Test not found'}
          </div>
          <button
            onClick={() => navigateTo('LOGIN', {}, { reason: 'error_return' })}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MOBILE EXAM MODE — Phone-optimized scaffold (PRD-0045)
  // ═══════════════════════════════════════════════════════════════

  if (isMobileExamMode) {
    const audioUrl = currentAudioSection?.streamUrl || currentAudioSection?.audioUrl || '';
    return (
      <>
        {/* Connection Monitor (always active) */}
        <ConnectionMonitor
          sessionCode={sessionCode}
          onConnectionChange={(connected) => {
            if (!connected && !testSubmitted) {
              listeningDiagnostics.log('Connection lost during test');
            }
          }}
        />

        {/* Connection Status Indicator */}
        {!isConnected && (
          <div style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 9998,
            background: '#fef2f2',
            border: '2px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: '600', color: '#dc2626', fontSize: '0.875rem' }}>
                Connection Issue
              </div>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                Your answers are being saved locally
              </div>
            </div>
          </div>
        )}

        {/* Waiting/Paused Overlay (renders above scaffold) */}
        <TestWaitingOverlay
          sessionStatus={sessionStatus}
          isPaused={isPaused}
          sessionCode={sessionCode}
        />

        {/* Mobile Listening Exam Scaffold */}
        <MobileListeningExamScaffold
          mode="live"
          activePartNumber={viewedPartNumber}
          onPartChange={handleMobilePartChange}
          playingPartNumber={currentSection}
          timeRemaining={timeRemaining}
          formatTime={formatTime}
          answers={answers}
          partInfos={mobilePartInfos}
          testSubmitted={testSubmitted}
          isSubmitting={isSubmitting}
          onConfirmSubmit={handleMobileSubmit}
          isPaused={isPaused}
          isWaiting={sessionStatus === 'waiting'}
          audioRowContent={
            audioUrl ? (
              <div style={{ padding: '0 0.5rem' }}>
                <AudioPlayer
                  audioUrl={audioUrl}
                  sectionNumber={currentSection}
                  isPlaying={isPlaying}
                  volume={volume}
                  playbackSpeed={playbackSpeed}
                  onPlayPause={handlePlayPause}
                  onTimeUpdate={handleTimeUpdate}
                  onSectionComplete={handleSectionComplete}
                  onError={handleAudioError}
                  audioControls={effectiveAudioControls}
                  allowReplay={effectiveAllowReplay}
                  maxReplays={effectiveMaxReplays}
                  onSkipSection={effectiveAudioControls?.showSkipSection ? handleSkipToNextSection : undefined}
                  seekPosition={teacherSeekPosition}
                  onSeekConsumed={() => setTeacherSeekPosition(null)}
                  playerMode={effectivePlayerMode}
                  audioMode={isSoloMode ? undefined : (audioMode ?? undefined)}
                  masterAudioState={isSoloMode ? undefined : masterAudioState}
                  headphoneRequest={isSoloMode ? undefined : headphoneRequest}
                  onRequestHeadphones={isSoloMode ? undefined : handleRequestHeadphones}
                  minimal
                  mobileLayout
                />
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
              /* ── Image-mode mainContent (PRD-0045 Phase 4) ───────────── */
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                {/* Image Canvas (Task 4.1) */}
                <MobileListeningImageCanvas
                  questionImages={questionImages}
                  audioSections={audioSections}
                  viewedPartNumber={viewedPartNumber}
                  currentQuestionNumber={currentQuestionNumber}
                  zoomByPart={zoomByPart}
                  onZoomChange={handleZoomChangeWithDirty}
                  onImageNavigate={handleMobileImageNavigate}
                />

                {/* Questions FAB — visible only in image mode, hidden when sheet is open (Task 4.3) */}
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

                {/* Answer Sheet — opens within row 4, below tabs (Task 4.4) */}
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
                  onAnswerChange={(testSubmitted || isLocked) ? () => {} : handleAnswerChange}
                  currentQuestionNumber={currentQuestionNumber}
                  testSubmitted={testSubmitted}
                  questionResults={mergedQuestionResults}
                  isLocked={isLocked}
                  scrollByPart={answerSheetScrollByPart}
                  onScrollChange={handleAnswerSheetScrollWithDirty}
                />
              </div>
            ) : (
              /* ── Direct-question mainContent (Phase 3 — standard text mode) ── */
              <div
                ref={mobileMainContentRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: '1rem',
                  fontSize: `${fontSize}px`,
                }}
              >
                {/* Section Rubric (structural cue for current viewed part) */}
                <SectionRubricBlock
                  partNumber={viewedPartNumber}
                  startQuestion={viewedPartSection?.startQuestion || 1}
                  endQuestion={viewedPartSection?.endQuestion || 10}
                  sectionName={viewedPartSection?.name}
                  questionType={viewedPartQuestionGroups[0]?.type || 'completion'}
                />

                {/* Direct-question groups for the viewed part */}
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
                      key={`mobile-group-${groupIndex}`}
                      group={group}
                      answers={answers}
                      onAnswerChange={(testSubmitted || isLocked) ? () => {} : handleAnswerChange}
                      currentQuestionNumber={currentQuestionNumber}
                      testSubmitted={testSubmitted}
                      questionResults={mergedQuestionResults}
                      disabled={Boolean(testSubmitted || isLocked)}
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
          onTextSizeChange={handleMobileTextSizeChange}
          onLeaveTest={handleMobileLeaveTest}
          antiSelectClass={antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
          partCount={audioSections.length}
        />

        {/* Wait Time Popup (between-section gap) */}
        <WaitTimePopup
          waitTime={waitPopupData?.waitTime || 30}
          currentSection={waitPopupData?.currentSection || 1}
          nextSection={waitPopupData?.nextSection || 2}
          onComplete={handleWaitPopupComplete}
          isVisible={showWaitPopup}
        />

        {/* Re-marking Modal */}
        <ReMarkingModal
          show={showReMarkModal}
          reMarkingData={reMarkingData}
          totalQuestions={testData?.questionCount || 40}
          onClose={() => setShowReMarkModal(false)}
        />

        {/* PRD-0019: Time Up Overlay */}
        {showTimeUpOverlay && (
          <TimeUpOverlay
            onComplete={() => {
              listeningDiagnostics.log('⏰ [PRD-0019] Grace period complete, auto-submitting...');
            }}
            countdownSeconds={gracePeriodRemaining}
          />
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN UI RENDER (Desktop)
  // ═══════════════════════════════════════════════════════════════

  return (
    <div
      ref={containerRef}
      className={antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
      style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      position: 'relative'
    }}>
      {/* Connection Monitor */}
      <ConnectionMonitor
        sessionCode={sessionCode}
        onConnectionChange={(connected) => {
          if (!connected && !testSubmitted) {
            listeningDiagnostics.log('Connection lost during test');
          }
        }}
      />

      {/* Connection Status Indicator */}
      {!isConnected && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          zIndex: 9998,
          background: '#fef2f2',
          border: '2px solid #fecaca',
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: '600', color: '#dc2626', fontSize: '0.875rem' }}>
              Connection Issue
            </div>
            <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>
              Your answers are being saved locally
            </div>
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

      {/* Waiting/Paused Overlay */}
      <TestWaitingOverlay
        sessionStatus={sessionStatus}
        isPaused={isPaused}
        sessionCode={sessionCode}
      />

      {/* IELTS-Style Header with Compact Audio */}
      <ListeningHeader
        studentName={session?.studentName || sessionService.getPlayerName() || 'Student'}
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        isPaused={isPaused}
        testSubmitted={testSubmitted}
        audioUrl={currentAudioSection?.streamUrl || currentAudioSection?.audioUrl}
        hasAudio={!!(currentAudioSection?.streamUrl || currentAudioSection?.audioUrl)}
        sectionNumber={currentSection}
        isPlaying={isPlaying}
        volume={volume}
        playbackSpeed={playbackSpeed}
        onPlayPause={handlePlayPause}
        onVolumeChange={setVolume}
        onSectionComplete={handleSectionComplete}
        onError={handleAudioError}
        audioControls={effectiveAudioControls}
        allowReplay={effectiveAllowReplay}
        maxReplays={effectiveMaxReplays}
        onSkipSection={effectiveAudioControls?.showSkipSection ? handleSkipToNextSection : undefined}
        seekPosition={teacherSeekPosition}
        onSeekConsumed={() => setTeacherSeekPosition(null)}
        // PRD-0018: Unified Audio Architecture
        playerMode={effectivePlayerMode}
        audioMode={isSoloMode ? undefined : (audioMode ?? undefined)}
        masterAudioState={isSoloMode ? undefined : masterAudioState}
        headphoneRequest={isSoloMode ? undefined : headphoneRequest}
        onRequestHeadphones={isSoloMode ? undefined : handleRequestHeadphones}
      />

      {/* PRD-0019: Extra Time Banner */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
        <ExtraTimeBanner
          isInExtraTime={isInExtraTime}
          formattedTime={formatTime(timeRemaining)}
        />
      </div>

      {/* Questions Panel - Conditional based on displayMode */}
      {displayMode === 'image' && questionImages && questionImages.length > 0 ? (
        /* IMAGE MODE: Two-column layout (images | answers) */
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ListeningImageModeDisplay
            questionImages={questionImages}
            questions={testData.questions || []}
            audioSections={audioSections}
            currentSection={currentSection}
            answers={answers}
            onAnswerChange={handleAnswerChange}
            currentQuestionNumber={currentQuestionNumber}
            testSubmitted={testSubmitted}
            questionResults={mergedQuestionResults}
            disabled={isLocked} // PRD-0019: Lock inputs during grace period
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
            partNumber={currentSection}
            startQuestion={currentAudioSection?.startQuestion || 1}
            endQuestion={currentAudioSection?.endQuestion || 10}
            sectionName={currentAudioSection?.name}
            questionType={questionGroups[0]?.type || 'completion'}
          />
          {questionGroups.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              color: '#64748b',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
              <div>No questions for this section</div>
            </div>
          ) : (
            questionGroups.map((group, groupIndex) => (
              <ListeningQuestionDisplay
                key={`group-${groupIndex}`}
                group={group}
                answers={answers}
                onAnswerChange={handleAnswerChange}
                currentQuestionNumber={currentQuestionNumber}
                testSubmitted={testSubmitted}
                questionResults={mergedQuestionResults}
                disabled={isLocked} // PRD-0019: Lock inputs during grace period
              />
            ))
          )}
        </div>
      )}

      {/* Floating Navigation Arrows - Right side of content */}
      <ListeningNavArrows
        currentQuestion={currentQuestionNumber}
        totalQuestions={testData.questionCount || 40}
        onPrevious={() => goToQuestion(Math.max(1, currentQuestionNumber - 1))}
        onNext={() => goToQuestion(Math.min(testData.questionCount || 40, currentQuestionNumber + 1))}
        disabled={testSubmitted}
      />

      {/* Question Navigator (Bottom, Sticky) - IELTS CBT Style */}
      <ListeningQuestionNav
        totalQuestions={testData.questionCount || 40}
        currentQuestion={currentQuestionNumber}
        answers={answers}
        sectionsInfo={sectionsInfo}
        onQuestionClick={goToQuestion}
        onSectionClick={handleSectionChange}
        onReview={handleSubmit}
        testSubmitted={testSubmitted}
        questionResults={mergedQuestionResults}
        currentSection={currentSection}
      />

      {/* Wait Time Popup */}
      <WaitTimePopup
        waitTime={waitPopupData?.waitTime || 30}
        currentSection={waitPopupData?.currentSection || 1}
        nextSection={waitPopupData?.nextSection || 2}
        onComplete={handleWaitPopupComplete}
        isVisible={showWaitPopup}
      />

      {/* Re-marking Modal */}
      <ReMarkingModal
        show={showReMarkModal}
        reMarkingData={reMarkingData}
        totalQuestions={testData?.questionCount || 40}
        onClose={() => setShowReMarkModal(false)}
      />

      {/* PRD-0019: Time Up Overlay - Shows 5-second countdown before auto-submission */}
      {showTimeUpOverlay && (
        <TimeUpOverlay
          onComplete={() => {
            // Grace period ended, submission will be triggered by useTestTimer
            listeningDiagnostics.log('⏰ [PRD-0019] Grace period complete, auto-submitting...');
          }}
          countdownSeconds={gracePeriodRemaining}
        />
      )}

    </div>
  );
};

/**
 * ListeningTestPage - Wrapped with Error Boundary
 */
const ListeningTestPage: React.FC = () => {
  return (
    <TestErrorBoundary>
      <ListeningTestPageContent />
    </TestErrorBoundary>
  );
};

export default ListeningTestPage;
