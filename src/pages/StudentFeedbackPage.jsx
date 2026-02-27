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
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/firebase';
import { ref, onValue, get } from 'firebase/database';
import { AppShell, Group, Text, Progress, Stack, Center, Loader, ThemeIcon } from '@mantine/core';
import { IconCheck, IconX, IconHome, IconHistory } from '@tabler/icons-react';
import { Card, CardBody, Button } from '../components/modern';

const StudentFeedbackPage = () => {
  const { gameSessionId } = useParams();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const { user, logout } = useAuth();
  const playerId = sessionStorage.getItem('playerId');
  const [gameSession, setGameSession] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const intervalRef = useRef(null);

  useEffect(() => {
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const session = snapshot.val();
      if (!session) {
        navigateTo('LOGIN', {}, { reason: 'feedback_session_deleted', replace: true });
        return;
      }
      setGameSession(session);

      // Use centralized session change handler
      if (session.status) {
        handleSessionChange(session.status, gameSessionId);
      }
    });

    return () => unsubscribe();
  }, [gameSessionId, navigateTo, handleSessionChange]);

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

  useEffect(() => {
    if (gameSession && quiz) {
      const player = gameSession.players[playerId];
      if (!player) return;

      const questionIndex = gameSession.currentQuestionIndex || 0;
      const lastAnswer = player.answers && player.answers[questionIndex] ? player.answers[questionIndex] : null;

      const question = quiz.questions[questionIndex];
      let newFeedback;

      if (lastAnswer) {
        newFeedback = {
          isCorrect: lastAnswer.isCorrect,
          correctAnswer: question.answer,
          newScore: player.score,
          score: lastAnswer.score || 0,
        };
      } else {
        // Handle case where student did not answer
        newFeedback = {
          isCorrect: false,
          correctAnswer: question.answer,
          newScore: player.score,
          score: 0,
        };
      }
      setFeedback(newFeedback);
    }
  }, [gameSession, quiz, playerId]);

  useEffect(() => {
    if (feedback) {
      setCountdown(5);
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [feedback]);

  const handleLogout = () => {
    logout();
    navigateTo('LOGIN', {}, { reason: 'student_logout', replace: true });
  };

  if (!feedback) {
    return (
      <AppShell
        header={{ height: 70 }}
        padding="md"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          minHeight: '100vh'
        }}
      >
        <AppShell.Header style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
        }}>
          <div style={{
            height: '100%',
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Question Feedback
            </h2>
          </div>
        </AppShell.Header>
        <AppShell.Main>
          <Center style={{ height: '60vh' }}>
            <Stack align="center" gap="md">
              <Loader size="xl" color="white" type="bars" />
              <Text c="white" fw={500}>Loading feedback...</Text>
            </Stack>
          </Center>
        </AppShell.Main>
      </AppShell>
    );
  }

  const currentQuestionIndex = gameSession.currentQuestionIndex || 0;
  const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;

  return (
    <AppShell
      header={{ height: 70 }}
      padding="md"
      style={{
        background: feedback.isCorrect
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        minHeight: '100vh'
      }}
    >
      {/* Header */}
      <AppShell.Header style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
      }}>
        <div style={{
          height: '100%',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Group gap="sm">
            <ThemeIcon
              size="lg"
              color={feedback.isCorrect ? 'green' : 'red'}
              variant="light"
            >
              {feedback.isCorrect ? <IconCheck size={20} /> : <IconX size={20} />}
            </ThemeIcon>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Question Feedback
            </h2>
          </Group>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {user?.displayName || user?.email}
            </span>
          </div>
        </div>
      </AppShell.Header>

      <AppShell.Main>
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
          <Stack gap="xl">
            {/* Result Header */}
            <Card
              variant="glass"
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                animation: 'scaleIn 0.5s ease-out'
              }}
            >
              <CardBody style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{
                  fontSize: '4rem',
                  marginBottom: '1rem'
                }}>
                  {feedback.isCorrect ? '✅' : '❌'}
                </div>
                <h1 style={{
                  color: feedback.isCorrect ? '#059669' : '#dc2626',
                  fontSize: '2.5rem',
                  marginBottom: '0.5rem',
                  fontWeight: '800'
                }}>
                  {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
                </h1>
                <Text size="xl" fw={600} c="#1e293b">
                  Points earned: <span style={{
                    color: feedback.isCorrect ? '#059669' : '#dc2626',
                    fontSize: '1.5rem',
                    fontWeight: 800
                  }}>+{feedback.score}</span>
                </Text>
              </CardBody>
            </Card>

            {/* Correct Answer */}
            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody>
                <Group gap="sm" mb="md">
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem'
                  }}>💡</div>
                  <Text size="lg" fw={700} c="#1e293b">
                    Correct Answer
                  </Text>
                </Group>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '1px solid rgba(99, 102, 241, 0.2)'
                }}>
                  <Text size="xl" fw={700} c="#4f46e5" ta="center">
                    {Array.isArray(feedback.correctAnswer)
                      ? feedback.correctAnswer.join(', ')
                      : feedback.correctAnswer}
                  </Text>
                </div>
              </CardBody>
            </Card>

            {/* Total Score */}
            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody style={{ textAlign: 'center', padding: '1.5rem' }}>
                <Text size="lg" c="#64748b" mb="xs">Your Total Score</Text>
                <div style={{
                  fontSize: '3rem',
                  fontWeight: '800',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  {feedback.newScore}
                </div>
              </CardBody>
            </Card>

            {/* Countdown */}
            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody style={{ padding: '1.5rem' }}>
                <Text size="md" ta="center" c="#64748b" mb="md">
                  {isLastQuestion
                    ? 'Moving to final results...'
                    : `Next question in ${countdown} second${countdown !== 1 ? 's' : ''}...`}
                </Text>
                <Progress
                  value={(countdown / 5) * 100}
                  size="lg"
                  color={countdown <= 2 ? 'red' : countdown <= 3 ? 'yellow' : 'blue'}
                  animated
                  striped
                  radius="md"
                />
              </CardBody>
            </Card>
          </Stack>
        </div>
      </AppShell.Main>

      {/* Animations */}
      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </AppShell>
  );
};

export default StudentFeedbackPage;