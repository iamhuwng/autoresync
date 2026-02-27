/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE               ║
 * ║                                                                 ║
 * ║  This file uses LEGACY styling (glassmorphism, #667eea, etc.)  ║
 * ║  that is DEPRECATED and scheduled for migration.                ║
 * ║                                                                 ║
 * ║  🚫 DO NOT copy styles from this file for new student pages.   ║
 * ║  ✅ Reference: src/pages/StudentDashboardPage.jsx               ║
 * ║  📖 Spec: documentation/design/student-view-design-standard.md ║
 * ║                                                                 ║
 * ║  BANNED patterns in this file (to be removed during migration): ║
 * ║  - #667eea / #764ba2 (purple gradients)                        ║
 * ║  - linear-gradient backgrounds                                  ║
 * ║  - .glass / .glass-card classes                                 ║
 * ║  - AppShell from @mantine/core                                  ║
 * ║  - Emoji navigation icons                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ref, onValue, get, set, onDisconnect, update } from 'firebase/database';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/firebase';
import { sessionService } from '../services/sessionService';
import CustomAvatar from '../components/CustomAvatar.jsx';
import { AppShell, Title, Text, Paper, SimpleGrid, Center, Loader, Group, Divider, Button } from '@mantine/core';
import { TestResultsModal } from '../components/test/TestResultsModal';


const StudentWaitingRoomPage = () => {
  const [gameSession, setGameSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [test, setTest] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const { gameSessionId } = useParams();
  const { navigateTo } = useNavigation('student');
  const { user } = useAuth(); // Get Firebase Auth user
  const location = useLocation();

  // PRD-TEST-END-FLOW: Results modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [hasRecentResults, setHasRecentResults] = useState(false);

  // PRD-0019 FIX: Track which test the student has already completed.
  // This prevents the waiting room from navigating back to the test page
  // when the session is still 'in-progress' but the student already submitted.
  // Without this, there's a navigation loop:
  //   WaitingRoom → (in-progress) → TestPage → (already completed) → WaitingRoom → ...
  // We store the testId so that if the teacher starts a NEW test, the student can join it.
  const completedTestIdRef = React.useRef(null);

  // PRD-TEST-END-FLOW: Auto-open results modal when arriving from teacher-end redirect
  useEffect(() => {
    if (location.state?.showResults && gameSessionId) {
      console.log('📊 [WaitingRoom] Arrived with showResults flag, opening results modal');
      setShowResultsModal(true);
      setHasRecentResults(true);
      // Store the testId we know the student completed (we'll check it from session data)
      // If the location state includes a testId, use it; otherwise mark as 'unknown' to block all
      completedTestIdRef.current = location.state?.testId || 'completed';
      // Clear the state so refresh doesn't re-trigger
      window.history.replaceState({}, document.title);
    }
  }, [location.state, gameSessionId]);

  useEffect(() => {
    // Check for existing session data OR authenticated user
    let playerId = sessionService.getPlayerId();
    let playerName = sessionService.getPlayerName();

    // If missing session data but user is authenticated via Firebase Auth,
    // set session data from Auth profile
    if ((!playerId || !playerName) && user) {
      console.log('📝 Setting session data from Firebase Auth user:', user.displayName || user.email);
      playerId = user.uid;
      playerName = user.displayName || user.email?.split('@')[0] || 'Student';

      // Persist to sessionStorage for test page authentication
      sessionService.setPlayerId(playerId);
      sessionService.setPlayerName(playerName);
      sessionService.setSessionCode(gameSessionId);

      // Also register this player in the session if not already present
      const registerPlayer = async () => {
        setIsJoining(true);
        try {
          const playerRef = ref(database, `game_sessions/${gameSessionId}/players/${playerId}`);
          const existingPlayer = await get(playerRef);

          if (!existingPlayer.exists()) {
            await set(playerRef, {
              name: playerName,
              id: playerId,
              joinedAt: Date.now(),
              isConnected: true,
              score: 0
            });
            console.log('✅ Registered authenticated user in session');
          } else {
            // Update connection status
            await update(playerRef, { isConnected: true });
            console.log('✅ Reconnected authenticated user to session');
          }
        } catch (error) {
          console.error('Failed to register player:', error);
        } finally {
          setIsJoining(false);
        }
      };
      registerPlayer();
    } else if (!playerId || !playerName) {
      // No session data AND no Firebase Auth - redirect to login
      console.warn('⚠️ Student not authenticated (no session data and not logged in), redirecting to login');
      navigateTo('LOGIN', {}, { reason: 'not_authenticated', replace: true });
      return;
    }

    // Ensure sessionCode is synced with URL parameter
    sessionService.setSessionCode(gameSessionId);

    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const sessionData = snapshot.val();
      setGameSession(sessionData);

      if (!sessionData) {
        navigateTo('LOGIN', {}, { reason: 'session_not_found', replace: true });
        return;
      }

      // Navigate to test/quiz page when content is selected AND status is 'in-progress'
      // CRITICAL: Only navigate when status === 'in-progress' to prevent A→B→A loops
      // StudentTestPage navigates here when status === 'waiting'
      // These conditions are mutually exclusive, preventing loops
      if (sessionData.mode === 'test' &&
        sessionData.testId &&
        sessionData.testId !== 'pending' &&
        sessionData.status === 'in-progress') {

        // PRD-0019 FIX: Don't navigate to test page if student already submitted THIS test
        // If it's a different testId (teacher started a new test), allow navigation
        if (completedTestIdRef.current &&
          (completedTestIdRef.current === sessionData.testId || completedTestIdRef.current === 'completed')) {
          console.log('⏸️ [WaitingRoom] Session in-progress but student already completed this test, staying in waiting room');
          return;
        }

        console.log('➡️ Test started (status: in-progress), navigating to test page');

        // PRD-TEST-END-FLOW: Clear results state when new test starts
        setHasRecentResults(false);
        setShowResultsModal(false);

        navigateTo('STUDENT_TEST',
          { sessionCode: gameSessionId },
          { reason: 'test_started' }
        );
      } else if (sessionData.mode === 'quiz' &&
        sessionData.quizId &&
        sessionData.quizId !== 'pending' &&
        sessionData.status === 'in-progress') {
        console.log('➡️ Quiz started (status: in-progress), navigating to quiz page');

        navigateTo('STUDENT_QUIZ',
          { gameSessionId: gameSessionId },
          { reason: 'quiz_started' }
        );
      } else if (sessionData.status === 'waiting') {
        console.log('⏸️ Staying in waiting room (status: waiting)');
        // PRD-0019 FIX: Reset completion flag when session goes to 'waiting'
        // This allows the student to join if the teacher starts a new test
        if (completedTestIdRef.current) {
          console.log('🔄 [WaitingRoom] Session back to waiting, resetting completion flag for next test');
          completedTestIdRef.current = null;
        }
      }
    });

    // Set up presence detection for current player
    const currentPlayerId = playerId; // Use the auth-checked playerId from above
    if (currentPlayerId) {
      const playerRef = ref(database, `game_sessions/${gameSessionId}/players/${currentPlayerId}`);
      // Mark as disconnected instead of removing (preserves player data)
      onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });
    }

    return () => unsubscribe();
  }, [gameSessionId, navigateTo, user]);

  useEffect(() => {
    if (gameSession) {
      // Clear test/quiz state when testId/quizId is removed (test/quiz ended)
      if (!gameSession.testId && test) {
        setTest(null);
      }
      if (!gameSession.quizId && quiz) {
        setQuiz(null);
      }

      // Load quiz if in quiz mode
      if (gameSession.quizId && !quiz) {
        const quizRef = ref(database, `quizzes/${gameSession.quizId}`);
        get(quizRef).then((quizSnapshot) => {
          if (quizSnapshot.exists()) {
            setQuiz({ id: quizSnapshot.key, ...quizSnapshot.val() });
          }
        });
      }

      // Load test if in test mode
      if (gameSession.testId && !test) {
        const testRef = ref(database, `tests/${gameSession.testId}`);
        get(testRef).then((testSnapshot) => {
          if (testSnapshot.exists()) {
            setTest({ id: testSnapshot.key, ...testSnapshot.val() });
          }
        });
      }

      if (gameSession.players) {
        const playerList = Object.keys(gameSession.players).map(key => ({ id: key, ...gameSession.players[key] }));
        setPlayers(playerList);
      } else {
        setPlayers([]);
      }
    }
  }, [gameSession, quiz, test]);

  // Handle leaving the session to return to dashboard
  const handleLeaveSession = () => {
    // Clear session data
    sessionService.clearSession();
    // Navigate to student dashboard
    navigateTo('STUDENT_DASHBOARD', {}, { reason: 'leave_session', replace: true });
  };

  // Show waiting screen if no test or quiz is selected yet
  if (!gameSession?.testId && !gameSession?.quizId) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', position: 'relative' }}>
        {/* Leave Session Button - Top Right */}
        <Button
          variant="subtle"
          color="white"
          size="sm"
          onClick={handleLeaveSession}
          leftSection={<span style={{ fontSize: '1rem' }}>←</span>}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.9)',
          }}
        >
          Leave Session
        </Button>
        <Loader size="xl" color="white" />
        <Text mt="md" c="white" fw={600} size="lg">
          Waiting for teacher to select a {gameSession?.mode === 'test' ? 'test' : 'quiz'}...
        </Text>

        {/* PRD-TEST-END-FLOW: View Last Results button */}
        {hasRecentResults && (
          <Button
            variant="white"
            color="dark"
            size="md"
            mt="xl"
            onClick={() => setShowResultsModal(true)}
            leftSection={<span style={{ fontSize: '1.1rem' }}>📊</span>}
            style={{
              fontWeight: 600,
              borderRadius: '0.75rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            View Last Results
          </Button>
        )}

        {/* PRD-TEST-END-FLOW: Results Modal */}
        <TestResultsModal
          opened={showResultsModal}
          onClose={() => setShowResultsModal(false)}
          sessionCode={gameSessionId}
        />
      </Center>
    );
  }

  // Show loading screen while content is being loaded
  if ((gameSession?.testId && !test) || (gameSession?.quizId && !quiz)) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', position: 'relative' }}>
        {/* Leave Session Button - Top Right */}
        <Button
          variant="subtle"
          color="white"
          size="sm"
          onClick={handleLeaveSession}
          leftSection={<span style={{ fontSize: '1rem' }}>←</span>}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.9)',
          }}
        >
          Leave Session
        </Button>
        <Loader size="xl" color="white" />
        <Text mt="md" c="white" fw={600} size="lg">
          Loading {gameSession?.mode === 'test' ? 'test' : 'quiz'}...
        </Text>
      </Center>
    );
  }

  // Get the content (test or quiz)
  const content = test || quiz;
  const contentType = gameSession?.mode === 'test' ? 'test' : 'quiz';

  return (
    <AppShell
      header={{ height: 60 }}
      padding="md"
      style={{
        background: 'linear-gradient(135deg, #fafbfc 0%, #f0f4f8 50%, #fafbfc 100%)',
        backgroundAttachment: 'fixed',
        minHeight: '100vh'
      }}
    >
      <AppShell.Header style={{
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
        color: '#1e293b'
      }}>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>Waiting Room</Title>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleLeaveSession}
            leftSection={<span style={{ fontSize: '1rem' }}>←</span>}
            style={{
              fontWeight: 500,
              color: '#64748b',
            }}
          >
            Leave Session
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Paper
          withBorder
          shadow="md"
          p={30}
          mt={30}
          radius="xl"
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)'
          }}
        >
          <Title order={2} ta="center" style={{ color: '#1e293b', fontWeight: 700 }}>{content.title}</Title>
          <Text ta="center" mt="sm" style={{ color: '#475569', fontWeight: 600, fontSize: '1.1rem' }}>
            {gameSession?.status === 'completed'
              ? `The session has been completed. Thank you for participating!`
              : gameSession?.lastTestCompletedAt
                ? `The ${contentType} has finished. Waiting for the teacher to select a new ${contentType}...`
                : `Waiting for the teacher to start the ${contentType}...`
            }
          </Text>

          <Divider my="xl" label={`Players Joined (${players.length})`} labelPosition="center" />

          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="lg">
            {players.map((player) => (
              <Paper
                key={player.id}
                withBorder
                p="xs"
                radius="lg"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
              >
                <CustomAvatar name={player.name || 'Player'} />
                <Text mt="sm" size="sm" ta="center" style={{ color: '#1e293b', fontWeight: 600 }}>{player.name || 'Player'}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>
      </AppShell.Main>

      {/* PRD-TEST-END-FLOW: Results Modal (also available in full layout) */}
      <TestResultsModal
        opened={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        sessionCode={gameSessionId}
      />
    </AppShell>
  );
};

export default StudentWaitingRoomPage;