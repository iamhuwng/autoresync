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
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/firebase';
import { ref, onValue, get } from 'firebase/database';
import { AppShell, Group, Text, ThemeIcon, Stack, Center, Loader, Grid } from '@mantine/core';
import { IconTrophy, IconUsers, IconTarget, IconHome, IconHistory, IconBooks } from '@tabler/icons-react';
import { Card, CardBody, Button } from '../components/modern';
import { getCourseAverage } from '../services/resultsService';

const StudentResultsPage = () => {
  const { gameSessionId } = useParams();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const { user, logout } = useAuth();
  const playerId = sessionStorage.getItem('playerId');
  const [results, setResults] = useState(null);
  const [courseInfo, setCourseInfo] = useState({ id: null, name: null, average: null });

  useEffect(() => {
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const gameSession = snapshot.val();
      // Use centralized session change handler
      if (gameSession.status) {
        handleSessionChange(gameSession.status, gameSessionId);
      }
      if (gameSession && gameSession.players) {
        const playersArray = Object.keys(gameSession.players).map(key => ({
          id: key,
          ...gameSession.players[key]
        }));
        playersArray.sort((a, b) => b.score - a.score);
        const playerIndex = playersArray.findIndex(p => p.id === playerId);
        const player = playersArray[playerIndex];

        if (player) {
          setResults({
            score: player.score,
            percentage: player.percentage || 0,
            rank: playerIndex + 1,
            totalPlayers: playersArray.length,
            top5: playersArray.slice(0, 5),
          });

          // Fetch course average if available
          if (gameSession.courseId) {
            getCourseAverage(gameSession.courseId, gameSession.testId || gameSession.quizId).then(avg => {
              setCourseInfo({
                id: gameSession.courseId,
                name: gameSession.courseName,
                average: avg
              });
            });
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [gameSessionId, playerId]);

  const handleLogout = () => {
    logout();
    navigateTo('LOGIN', {}, { reason: 'student_logout', replace: true });
  };

  if (!results) {
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
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Group gap="sm">
              <IconTrophy size={28} color="#8b5cf6" />
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                Results
              </h2>
            </Group>
          </div>
        </AppShell.Header>
        <AppShell.Main>
          <Center style={{ height: '60vh' }}>
            <Stack align="center" gap="md">
              <Loader size="xl" color="white" type="bars" />
              <Text c="white" fw={500}>Loading results...</Text>
            </Stack>
          </Center>
        </AppShell.Main>
      </AppShell>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      padding="md"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
            <IconTrophy size={28} color="#8b5cf6" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Your Results
            </h2>
          </Group>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="glass"
              onClick={() => navigateTo('STUDENT_DASHBOARD')}
              leftSection={<IconHome size={18} />}
            >
              Dashboard
            </Button>
            <Button
              variant="glass"
              onClick={() => navigateTo('STUDENT_RESULTS_HISTORY')}
              leftSection={<IconHistory size={18} />}
            >
              History
            </Button>
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {user?.displayName || user?.email}
            </span>
            <Button variant="glass" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </AppShell.Header>

      <AppShell.Main>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
          <Stack gap="xl">
            {/* Header */}
            <div style={{ textAlign: 'center', animation: 'slideDown 0.5s ease-out' }}>
              <h1 style={{
                fontSize: '2.5rem',
                fontWeight: '800',
                marginBottom: '0.5rem',
                color: 'white',
                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                🎉 Session Complete!
              </h1>
              <p style={{ fontSize: '1.125rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                Here's how you performed
              </p>
            </div>

            {/* Main Results Card */}
            <Card variant="glass" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              animation: 'slideUp 0.5s ease-out 0.1s backwards'
            }}>
              <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem' }}>
                  You finished <span style={{ color: '#8b5cf6' }}>#{results.rank}</span> out of {results.totalPlayers}!
                </h2>
                <div style={{
                  fontSize: '4rem',
                  fontWeight: '800',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  marginBottom: '0.5rem'
                }}>
                  {results.score}
                </div>
                <Text c="#64748b" fw={600}>Total Points</Text>
              </CardBody>
            </Card>

            {/* Stats Grid */}
            <Grid>
              <Grid.Col span={{ base: 6 }}>
                <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                  <CardBody>
                    <Group>
                      <ThemeIcon size="lg" color="violet" variant="light">
                        <IconTarget size={20} />
                      </ThemeIcon>
                      <div>
                        <Text size="xl" fw={700} c="#1e293b">{results.percentage}%</Text>
                        <Text size="xs" c="#64748b">Accuracy</Text>
                      </div>
                    </Group>
                  </CardBody>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 6 }}>
                <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                  <CardBody>
                    <Group>
                      <ThemeIcon size="lg" color="blue" variant="light">
                        <IconUsers size={20} />
                      </ThemeIcon>
                      <div>
                        <Text size="xl" fw={700} c="#1e293b">#{results.rank}</Text>
                        <Text size="xs" c="#64748b">of {results.totalPlayers} players</Text>
                      </div>
                    </Group>
                  </CardBody>
                </Card>
              </Grid.Col>
            </Grid>

            {/* Top 5 Leaderboard */}
            <Card variant="glass" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              animation: 'slideUp 0.5s ease-out 0.2s backwards'
            }}>
              <CardBody>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem' }}>
                  🏆 Top 5 Players
                </h3>
                <Stack gap="sm">
                  {results.top5.map((player, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '0.75rem 1rem',
                        background: player.id === playerId
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)'
                          : 'rgba(241, 245, 249, 0.5)',
                        borderRadius: '0.5rem',
                        border: player.id === playerId ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Group gap="sm">
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: index === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                            : index === 1 ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
                              : index === 2 ? 'linear-gradient(135deg, #d97706, #b45309)'
                                : 'linear-gradient(135deg, #667eea, #764ba2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: '700',
                          fontSize: '0.875rem'
                        }}>
                          {index + 1}
                        </div>
                        <Text fw={player.id === playerId ? 700 : 500} c="#1e293b">
                          {player.name} {player.id === playerId && '(You)'}
                        </Text>
                      </Group>
                      <Text fw={700} c="#8b5cf6">{player.score}</Text>
                    </div>
                  ))}
                </Stack>
              </CardBody>
            </Card>

            {/* Course Average (if available) */}
            {courseInfo.id && courseInfo.average !== null && (
              <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                <CardBody>
                  <Group justify="space-between" align="center">
                    <div>
                      <Text size="sm" c="#64748b" tt="uppercase" fw={600}>
                        {courseInfo.name ? `${courseInfo.name} Average` : 'Course Average'}
                      </Text>
                      <Text size="xl" fw={800} c="#4338ca">
                        {courseInfo.average.toFixed(1)}%
                      </Text>
                    </div>
                    <div style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '9999px',
                      background: (results.percentage || 0) >= courseInfo.average
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(220, 38, 38, 0.1)',
                      color: (results.percentage || 0) >= courseInfo.average ? '#059669' : '#dc2626',
                      fontWeight: 700,
                      fontSize: '0.875rem'
                    }}>
                      {(results.percentage || 0) >= courseInfo.average ? '✓ Above Average' : '⚠ Below Average'}
                    </div>
                  </Group>
                </CardBody>
              </Card>
            )}

            {/* Action Button */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigateTo('STUDENT_WAITING', { gameSessionId }, { reason: 'return_from_results' })}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
              }}
            >
              Return to Waiting Room
            </Button>
          </Stack>
        </div>
      </AppShell.Main>

      {/* Animations */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppShell>
  );
};

export default StudentResultsPage;
