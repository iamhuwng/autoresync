import { useState, useEffect } from 'react';
import { database } from '../../services/firebase';
import { ref, onValue, update as dbUpdate } from 'firebase/database';
import { createSession } from '../../services/sessionManager';
import { getClasses } from '../../services/classManager';

interface UseSessionManagerParams {
  sessionCode: string | undefined;
  userId: string;
  userRole: string;
  tests: any[];
  navigateTo: Function;
}

export function useSessionManager({ sessionCode, userId, userRole, tests, navigateTo }: UseSessionManagerParams) {
  // Class selection state
  const [classes, setClasses] = useState<any[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [pendingSession, setPendingSession] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Audio mode state
  const [selectedAudioMode, setSelectedAudioMode] = useState<string | null>(null);
  const [lastUsedAudioMode, setLastUsedAudioMode] = useState<string | null>(null);
  const [showAudioModeError, setShowAudioModeError] = useState(false);

  // Exam mode state
  const [examMode, setExamMode] = useState(false);

  // Session data state
  const [sessionData, setSessionData] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Load last used audio mode from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('lastUsedAudioMode');
    if (savedMode === 'online' || savedMode === 'offline') {
      setLastUsedAudioMode(savedMode);
    }
  }, []);

  // Load classes for selection
  useEffect(() => {
    let isSubscribed = true;
    if (userId) {
      const loadClasses = async () => {
        const filterTeacherId = userRole === 'super_admin' ? undefined : userId;
        try {
          const classList = await getClasses(filterTeacherId);
          if (isSubscribed) {
            setClasses(classList.map((c: any) => ({
              value: c.id,
              label: `${c.name || 'Unnamed'} (${c.classCode || 'N/A'})`
            })));
          }
        } catch (error) {
          console.error('📚 [TeacherLobby] ERROR loading classes:', error);
        }
      };
      loadClasses();
    }
    return () => { isSubscribed = false; };
  }, [userId, userRole]);

  // Load session data if sessionCode exists - with real-time updates
  useEffect(() => {
    if (sessionCode) {
      setSessionLoading(true);
      setSessionError(null);
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);

      const unsubscribe = onValue(sessionRef, (snapshot) => {
        const session = snapshot.val();
        setSessionLoading(false);
        if (session) {
          setSessionData(session);
          setSessionError(null);
        } else {
          console.error('Session not found:', sessionCode);
          setSessionError('Session not found or has expired');
          setTimeout(() => {
            navigateTo('SESSIONS', {}, { reason: 'lobby_session_not_found', replace: true });
          }, 2000);
        }
      }, (error) => {
        console.error('Firebase error loading session:', error);
        setSessionLoading(false);
        setSessionError('Failed to load session. Please try again.');
      });

      return () => unsubscribe();
    } else {
      setSessionData(null);
      setSessionLoading(false);
      setSessionError(null);
    }
  }, [sessionCode, navigateTo]);

  const startSession = async (contentId: string, mode: string) => {
    // If already in a session, just update it
    if (sessionCode) {
      try {
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const updateData = { testId: contentId, mode: 'test', quizId: null };
        await dbUpdate(sessionRef, updateData);
        navigateTo('TEACHER_TEST_MONITOR', { sessionCode }, { reason: 'teacher_start_test' });
      } catch (error) {
        console.error('❌ Error starting test:', error);
        alert('Failed to start test. Please try again.');
      }
      return;
    }

    // If starting new session, open modal to select class
    const test = tests.find((t: any) => t.id === contentId);
    const isListeningTest = mode === 'test' && test?.skill === 'Listening';

    setPendingSession({ contentId, mode, isListening: isListeningTest });
    setSelectedClassId(null);
    setSelectedAudioMode(null);
    setShowAudioModeError(false);
    setShowClassModal(true);
  };

  const confirmSession = async () => {
    if (!pendingSession) return;
    const { contentId, mode, isListening } = pendingSession;

    // Validate audio mode for listening tests
    if (isListening && !selectedAudioMode) {
      setShowAudioModeError(true);
      return;
    }

    setShowClassModal(false);

    // Save audio mode preference
    if (isListening && selectedAudioMode) {
      localStorage.setItem('lastUsedAudioMode', selectedAudioMode);
      setLastUsedAudioMode(selectedAudioMode);
    }

    try {
      const newSessionData: any = {
        testId: contentId,
        mode: 'test',
        classId: selectedClassId,
        createdBy: userId,
        ...(isListening && {
          settings: {
            audioMode: selectedAudioMode || 'online',
            examMode: examMode,
          }
        }),
        ...(!isListening && examMode && {
          settings: {
            examMode: examMode,
          }
        })
      };

      const result = await createSession(newSessionData);
      if (result.success) {
        navigateTo('TEACHER_TEST_MONITOR', { sessionCode: result.sessionCode }, { reason: 'teacher_new_test_session' });
      } else {
        alert('Failed to create test session. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error starting test:', error);
      alert('Failed to start test. Please try again.');
    }
  };

  const cancelSession = () => setShowClassModal(false);

  return {
    sessionCode,
    sessionData,
    sessionLoading,
    sessionError,
    classes,
    showClassModal,
    pendingSession,
    selectedClassId,
    selectedAudioMode,
    lastUsedAudioMode,
    showAudioModeError,
    examMode,
    isSessionActive: !!sessionData,
    startSession,
    confirmSession,
    cancelSession,
    setSelectedClassId,
    setSelectedAudioMode,
    setShowAudioModeError,
    setExamMode,
  };
}
