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

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { database } from '../services/firebase';
import { ref, onValue, update, get, onDisconnect } from 'firebase/database';
import { calculateScore } from '../utils/scoring';
import StudentAnswerInputSimple from '../components/StudentAnswerInputSimple';
import SemicircleTimer from '../components/SemicircleTimer';

const StudentQuizPage = () => {
  const { gameSessionId } = useParams();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const [gameSession, setGameSession] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [currentAnswer, setCurrentAnswer] = useState(null);
  const [timeSpent, setTimeSpent] = useState(0);
  const hasSubmittedRef = useRef(false);
  const currentQuestionIndexRef = useRef(null);
  const questionStartTimeRef = useRef(null);

  useEffect(() => {
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // Session has been deleted, navigate to home
        navigateTo('LOGIN', {}, { reason: 'quiz_session_deleted', replace: true });
        return;
      }
      setGameSession(data);
    });

    // Set up presence detection for current player
    const playerId = sessionStorage.getItem('playerId');
    if (playerId) {
      const playerRef = ref(database, `game_sessions/${gameSessionId}/players/${playerId}`);
      onDisconnect(playerRef).remove();
    }

    return () => {
      unsubscribe();
    };
  }, [gameSessionId, navigateTo]);

  useEffect(() => {
    if (!gameSession) return;

    // Use centralized session change handler
    if (gameSession.status) {
      handleSessionChange(gameSession.status, gameSessionId);
    }
  }, [gameSession, handleSessionChange, gameSessionId]);

  // Load quiz data once when gameSession.quizId is available
  useEffect(() => {
    if (gameSession && gameSession.quizId && !quiz) {
      const quizRef = ref(database, `quizzes/${gameSession.quizId}`);
      get(quizRef).then((quizSnapshot) => {
        if (quizSnapshot.exists()) {
          setQuiz(quizSnapshot.val());
        }
      });
    }
  }, [gameSession, quiz]);

  // Reset answer when question changes
  useEffect(() => {
    if (gameSession) {
      const newQuestionIndex = gameSession.currentQuestionIndex || 0;
      if (currentQuestionIndexRef.current !== newQuestionIndex) {
        setCurrentAnswer(null);
        setTimeSpent(0);
        hasSubmittedRef.current = false;
        currentQuestionIndexRef.current = newQuestionIndex;
        questionStartTimeRef.current = Date.now();
      }
    }
  }, [gameSession]);

  // Track time spent on question
  useEffect(() => {
    if (!gameSession || gameSession.isPaused || hasSubmittedRef.current) return;

    const interval = setInterval(() => {
      if (questionStartTimeRef.current) {
        const elapsed = (Date.now() - questionStartTimeRef.current) / 1000;
        setTimeSpent(elapsed);
      }
    }, 100); // Update every 100ms for accuracy

    return () => clearInterval(interval);
  }, [gameSession, hasSubmittedRef.current]);

  const submitAnswer = (answer) => {
    if (hasSubmittedRef.current || !gameSession || !quiz) return;

    const playerId = sessionStorage.getItem('playerId');
    
    // Check if players object exists and player is still in the session
    if (!gameSession.players || !gameSession.players[playerId]) {
      console.warn('Player not found in session, skipping answer submission');
      hasSubmittedRef.current = true;
      return;
    }

    const currentQuestionIndex = gameSession.currentQuestionIndex || 0;
    const question = quiz.questions[currentQuestionIndex];
    console.log('submitAnswer called:', { 
      answer, 
      correctAnswer: question.answer, 
      questionType: question.type 
    });
    const score = calculateScore(question, answer);
    const isCorrect = score === 10; // Only mark as correct if full points earned
    console.log('Score calculated:', { score, isCorrect });

    const playerRef = ref(database, `game_sessions/${gameSessionId}/players/${playerId}`);
    const currentPlayer = gameSession.players[playerId];
    
    // Calculate time spent
    const finalTimeSpent = questionStartTimeRef.current 
      ? (Date.now() - questionStartTimeRef.current) / 1000 
      : 0;
    
    update(playerRef, {
      score: (currentPlayer?.score || 0) + score,
      answers: {
        ...(currentPlayer?.answers || {}),
        [currentQuestionIndex]: { 
          answer, 
          isCorrect, 
          score,
          timeSpent: finalTimeSpent
        },
      },
    });

    hasSubmittedRef.current = true;
  };

  const handleAnswerChange = (answer) => {
    console.log('handleAnswerChange called:', { answer });
    setCurrentAnswer(answer);
    // Don't submit yet, just store the answer
  };

  const handleTimeUp = () => {
    // Auto-submit the current answer when timer runs out
    if (currentAnswer !== null && !hasSubmittedRef.current) {
      submitAnswer(currentAnswer);
    }
  };

  if (!gameSession || !quiz) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '2rem',
        fontWeight: '600'
      }}>
        Loading...
      </div>
    );
  }

  const currentQuestion = quiz.questions[gameSession.currentQuestionIndex || 0];

  return (
    <div style={{
      height: '100dvh', // Use dynamic viewport height for mobile
      width: '100vw',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'hidden',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'none' // Prevent pull-to-refresh and other touch gestures
    }}>
      {/* Timer at the top */}
      {currentQuestion.timer && gameSession.timer && (
        <SemicircleTimer
          key={gameSession.currentQuestionIndex}
          timerState={gameSession.timer}
          onTimeUp={handleTimeUp}
        />
      )}

      {/* Answer input area - takes all remaining space */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vh, 2rem) clamp(1rem, 4vw, 2rem)',
        paddingTop: currentQuestion.timer ? 'clamp(4rem, 12vh, 6rem)' : 'clamp(1rem, 3vh, 2rem)',
        paddingBottom: hasSubmittedRef.current ? 'clamp(5rem, 12vh, 7rem)' : 'clamp(1rem, 3vh, 2rem)',
        position: 'relative',
        zIndex: 1,
        overflow: 'hidden'
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          maxWidth: '1200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <StudentAnswerInputSimple
            question={currentQuestion}
            onAnswerSubmit={handleAnswerChange}
            currentAnswer={currentAnswer}
          />
        </div>
      </div>

      {/* Status indicator */}
      {hasSubmittedRef.current && (
        <div style={{
          position: 'fixed',
          bottom: 'clamp(1rem, 3vh, 2rem)',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(39, 174, 96, 0.95)',
          color: 'white',
          padding: 'clamp(0.75rem, 2vh, 1rem) clamp(1.5rem, 4vw, 2rem)',
          borderRadius: '2rem',
          fontSize: 'clamp(1rem, 3vw, 1.2rem)',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 20,
          whiteSpace: 'nowrap'
        }}>
          ✓ Answer Submitted
        </div>
      )}
    </div>
  );
};

export default StudentQuizPage;
