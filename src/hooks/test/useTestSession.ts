/**
 * useTestSession Hook
 * Manages test session state and real-time Firebase sync
 * 
 * @see PRD-0018: Unified Audio Architecture - adds masterAudioState support
 */

import { useState, useEffect, useRef } from 'react';
import { sessionService } from '../../services/sessionService';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, onValue, update, onDisconnect } from 'firebase/database';
import type { MasterAudioState, AudioMode, HeadphoneRequest } from '../../types/audio.types';
import { shouldAcceptCanonicalAudioState } from '../../features/assessment/listening/live-session/authority/liveAudioRuntimeHydration';
import type { AntiCheatConfig } from '../../types/integrity.types';
import type { SavedMobileState } from '../../types/practice.types';

export interface TestSession {
  testId: string;
  sessionCode: string;
  studentName: string;
  startTime: number;
  answers: StudentAnswers;
  isSubmitted: boolean;
}

export interface StudentAnswers {
  [questionNumber: number]: string | string[] | Record<string, string>;
}

interface ReMarkingData {
  score: number;
  maxScore: number;
  correctCount: number;
  reMarkDetails?: Record<string, number>;
  timestamp: number;
}

/** Audio command broadcast from teacher for listening tests */
export interface AudioCommand {
  schemaVersion?: 2;
  commandId?: string;
  canonicalRevision?: number;
  type: 'pause' | 'resume' | 'skipToSection' | 'setSpeed' | 'seekToPosition';
  sectionNumber?: number;
  speed?: number;
  /** Position in seconds for seekToPosition command */
  position?: number;
  timestamp: number;
}

/** Per-student accommodations for listening tests */
export interface StudentAccommodation {
  /** Extra time in seconds added to test duration */
  extraTime?: number;
  /** Override: allow unlimited replays for this student */
  unlimitedReplays?: boolean;
  /** Override: max replays for this student (overrides test setting) */
  maxReplays?: number;
  /** Override: enable all audio controls (practice mode) */
  fullAudioControls?: boolean;
  /** Timestamp when accommodation was set */
  timestamp: number;
}

interface UseTestSessionOptions {
  sessionCode: string | undefined;
  testData: any | null;
  answers: StudentAnswers;
  testSubmitted: boolean;
  testResults: any | null;
}

interface UseTestSessionReturn {
  session: TestSession | null;
  setSession: (session: TestSession | null) => void;
  sessionStatus: 'waiting' | 'in-progress' | 'completed';
  isPaused: boolean;
  sessionStartTime: number | null;
  pausedDuration: number;
  reMarkingData: ReMarkingData | null;
  showReMarkModal: boolean;
  setShowReMarkModal: (show: boolean) => void;
  setTestResults: (results: any) => void;
  isConnected: boolean;
  /** @deprecated Use masterAudioState instead */
  audioCommand: AudioCommand | null;
  /** Per-student accommodations (for listening tests) */
  accommodation: StudentAccommodation | null;
  /** Unified master audio state (PRD-0018) */
  masterAudioState: MasterAudioState | null;
  /** Audio mode for this session (online/offline) */
  audioMode: AudioMode | null;
  /** Headphone permission status (for offline mode) */
  headphoneRequest: HeadphoneRequest | null;
  /** PRD-0036: Anti-cheat config from session */
  antiCheatConfig: AntiCheatConfig | null;
  /** PRD-0036: Session-level teacher request for clients to flush buffered integrity logs */
  integrityRefreshRequestedAt: number | null;
  /** PRD-0043: Persisted mobile Reading shell state for the current player */
  mobileState: SavedMobileState | null;
}

export const useTestSession = ({
  sessionCode,
  testData,
  answers,
  testSubmitted,
  testResults,
}: UseTestSessionOptions): UseTestSessionReturn => {
  const [session, setSession] = useState<TestSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'in-progress' | 'completed'>('waiting');
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [pausedDuration, setPausedDuration] = useState(0);
  const [reMarkingData, setReMarkingData] = useState<ReMarkingData | null>(null);
  const [showReMarkModal, setShowReMarkModal] = useState(false);
  const [localTestResults, setLocalTestResults] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [audioCommand, setAudioCommand] = useState<AudioCommand | null>(null);
  const [lastAudioCommandTimestamp, setLastAudioCommandTimestamp] = useState<number>(0);
  const [accommodation, setAccommodation] = useState<StudentAccommodation | null>(null);

  // PRD-0018: Unified Audio Architecture state
  const [masterAudioState, setMasterAudioState] = useState<MasterAudioState | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode | null>(null);
  const [headphoneRequest, setHeadphoneRequest] = useState<HeadphoneRequest | null>(null);
  // PRD-0036: Anti-cheat config from RTDB session data
  const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig | null>(null);
  const [integrityRefreshRequestedAt, setIntegrityRefreshRequestedAt] = useState<number | null>(null);
  const [mobileState, setMobileState] = useState<SavedMobileState | null>(null);
  const lastMasterStateTimestampRef = useRef<number>(0);
  const lastMasterStateRef = useRef<MasterAudioState | null>(null);
  const lastSyncedStartTimeRef = useRef<number | null>(null);

  // Initialize session when test data is loaded
  useEffect(() => {
    if (testData && sessionCode && !session) {
      const newSession: TestSession = {
        testId: testData.id,
        sessionCode: sessionCode,
        studentName: sessionService.getPlayerName() || 'Student',
        startTime: Date.now(),
        answers: {},
        isSubmitted: false,
      };
      setSession(newSession);
    }
  }, [testData, sessionCode, session]);

  // Listen to session changes in real-time
  useEffect(() => {
    if (!sessionCode) return;

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setSessionStatus(data.status || 'waiting');
        setIsPaused(data.isPaused || false);

        // Always use startTime from Firebase if session is in-progress
        // This ensures timer is synchronized across all clients
        if (data.status === 'in-progress' && data.startTime) {
          const startTime = data.startTime;
          // Validate that startTime is reasonable (not in future, not too old)
          const now = Date.now();
          const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

          if (startTime > now) {
            console.error('[Timer] Start time is in the future, using current time');
            setSessionStartTime(now);
          } else if (startTime < oneWeekAgo) {
            console.error('[Timer] Start time is too old (>1 week), session might be corrupted');
            // Still use it to maintain synchronization
            setSessionStartTime(startTime);
          } else {
            // Valid start time, use it
            setSessionStartTime(startTime);
            // Only log when the start time actually changes
            if (lastSyncedStartTimeRef.current !== startTime) {
              lastSyncedStartTimeRef.current = startTime;
              console.log('[Timer] Session start time synchronized:', new Date(startTime).toLocaleTimeString());
            }
          }
        } else if (data.status === 'waiting') {
          // Reset start time when session is waiting
          setSessionStartTime(null);
        }

        // Calculate paused duration
        if (data.pausedAt && !data.resumedAt) {
          // Currently paused
          setPausedDuration((data.pausedDuration || 0) + (Date.now() - data.pausedAt));
        } else {
          setPausedDuration(data.pausedDuration || 0);
        }

        // Check if student has been re-marked
        const playerId = sessionService.getPlayerId();
        if (playerId && data.players?.[playerId]?.isReMarked) {
          const playerData = data.players[playerId];
          if (playerData.reMarkTimestamp && (!reMarkingData || playerData.reMarkTimestamp > reMarkingData.timestamp)) {
            setReMarkingData({
              score: playerData.score,
              maxScore: playerData.maxScore,
              correctCount: playerData.correctCount,
              reMarkDetails: playerData.reMarkDetails,
              timestamp: playerData.reMarkTimestamp
            });
            setShowReMarkModal(true);

            // Update test results if already submitted
            if (testSubmitted && (testResults || localTestResults)) {
              const currentResults = testResults || localTestResults;
              setLocalTestResults({
                ...currentResults,
                correctAnswers: playerData.correctCount || 0,
                totalScore: playerData.score || 0,
                percentage: playerData.maxScore ? Math.round((playerData.score / playerData.maxScore) * 100) : 0
              });
            }
          }
        }

        // Check if correct answers should be shown
        const showCorrectAnswers = data.showCorrectAnswers || false;
        if (showCorrectAnswers && testSubmitted && testData) {
          // Update question results to show correct answers
          const questionResults: Record<number, boolean> = {};
          testData.questions.forEach((q: any) => {
            const studentAnswer = answers[q.number];
            if (studentAnswer) {
              // Mark as correct based on actual answer
              questionResults[q.number] = studentAnswer === q.answer;
            }
          });
          // This would be passed to IELTSQuestionsPanel
        }

        // Listen for audio commands from teacher (LEGACY - for backwards compatibility)
        if (data.audioCommand && data.audioCommand.timestamp > lastAudioCommandTimestamp) {
          console.log('🎧 [Session] Audio command received (legacy):', data.audioCommand);
          setAudioCommand(data.audioCommand);
          setLastAudioCommandTimestamp(data.audioCommand.timestamp);
        }

        // PRD-0018: Listen for masterAudioState (preferred over audioCommand)
        if (data.masterAudioState) {
          const masterState = data.masterAudioState as MasterAudioState;
          const acceptDecision = shouldAcceptCanonicalAudioState({
            currentState: lastMasterStateRef.current as any,
            nextState: masterState as any,
          });
          if (acceptDecision.accept) {
            console.log('🎵 [Session] Master audio state received:', {
              section: masterState.section,
              position: masterState.position?.toFixed(1),
              isPlaying: masterState.isPlaying,
              lastAction: masterState.lastAction,
            });
            setMasterAudioState(masterState);
            lastMasterStateTimestampRef.current = masterState.timestamp;
            lastMasterStateRef.current = masterState;
          } else if (acceptDecision.reason === 'equal_revision_conflict') {
            console.warn('[Session] Ignored conflicting master audio state revision:', masterState);
          }
        }

        // PRD-0018: Listen for audioMode setting
        if (data.settings?.audioMode) {
          setAudioMode(data.settings.audioMode as AudioMode);
        }

        // Listen for per-student accommodations (for listening tests)
        const currentPlayerId = sessionService.getPlayerId();
        if (currentPlayerId && data.studentAccommodations?.[currentPlayerId]) {
          const studentAccom = data.studentAccommodations[currentPlayerId];
          if (!accommodation || studentAccom.timestamp > accommodation.timestamp) {
            console.log('♿ [Session] Accommodation received:', studentAccom);
            setAccommodation(studentAccom);
          }
        }

        // PRD-0018: Listen for headphone request status (offline mode)
        if (currentPlayerId && data.players?.[currentPlayerId]?.headphoneRequest) {
          const request = data.players[currentPlayerId].headphoneRequest as HeadphoneRequest;
          setHeadphoneRequest(request);
        }

        setMobileState(
          currentPlayerId && data.players?.[currentPlayerId]?.mobileState
            ? data.players[currentPlayerId].mobileState as SavedMobileState
            : null,
        );

        // PRD-0036: Extract anti-cheat config from session
        if (data.antiCheatConfig) {
          setAntiCheatConfig(data.antiCheatConfig);
        } else {
          setAntiCheatConfig(null);
        }

        setIntegrityRefreshRequestedAt(
          typeof data.integrityRefreshRequestedAt === 'number'
            ? data.integrityRefreshRequestedAt
            : null
        );
      }
    });

    return () => unsubscribe();
  }, [sessionCode, testData, answers, testSubmitted, testResults, localTestResults, reMarkingData, sessionStartTime, lastAudioCommandTimestamp]);

  // Presence tracking - keep lastActivity updated and setup disconnect handler
  useEffect(() => {
    if (!sessionCode) return;

    const playerId = sessionService.getPlayerId();
    if (!playerId) return;

    const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);

    // Update lastActivity immediately
    update(playerRef, {
      lastActivity: Date.now(),
      isConnected: true
    }).catch(err => console.error('Failed to update presence:', err));

    // Set up disconnect handler to mark as disconnected (not remove)
    onDisconnect(playerRef).update({
      isConnected: false,
      disconnectedAt: Date.now()
    });

    // Update lastActivity every 5 seconds to show student is active
    const presenceInterval = setInterval(() => {
      update(playerRef, {
        lastActivity: Date.now(),
        isConnected: true
      }).catch(err => console.error('Failed to update presence:', err));
    }, 5000);

    return () => {
      clearInterval(presenceInterval);
      // Final presence update on unmount
      update(playerRef, { lastActivity: Date.now() }).catch(() => { });
    };
  }, [sessionCode]);

  // Monitor connection status
  useEffect(() => {
    if (!sessionCode) return;

    const connectionRef = ref(database, '.info/connected');
    const unsubscribe = onValue(connectionRef, (snapshot) => {
      const connected = snapshot.val() === true;
      setIsConnected(connected);

      if (!connected) {
        console.warn('Firebase connection lost for session:', sessionCode);
      } else if (!isConnected && connected) {
        console.log('Firebase connection restored for session:', sessionCode);
      }
    });

    return () => unsubscribe();
  }, [sessionCode, isConnected]);

  return {
    session,
    setSession,
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    reMarkingData,
    showReMarkModal,
    setShowReMarkModal,
    setTestResults: setLocalTestResults,
    isConnected,
    audioCommand,
    accommodation,
    // PRD-0018: Unified Audio Architecture
    masterAudioState,
    audioMode,
    headphoneRequest,
    // PRD-0036: Anti-cheat config
    antiCheatConfig,
    integrityRefreshRequestedAt,
    mobileState,
  };
};
