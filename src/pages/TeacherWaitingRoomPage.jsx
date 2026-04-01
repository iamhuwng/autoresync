import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { ref, onValue, get, update } from 'firebase/database';
import { database } from '../services/firebase';
import CustomAvatar from '../components/CustomAvatar.jsx';
import { AppShell, SimpleGrid, Center, Loader } from '@mantine/core';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import { createTimerState, pauseTimer } from '../hooks/useSynchronizedTimer';

const TeacherWaitingRoomPage = () => {
  const [gameSession, setGameSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const { gameSessionId } = useParams();
  const { navigateTo } = useNavigation('teacher');
  const quizId = gameSession?.quizId;
  

  // Effect 1: Listen to the game session
  useEffect(() => {
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      setGameSession(snapshot.val());
    });

    return () => unsubscribe();
  }, [gameSessionId, navigateTo]);

  // Effect 2: Update players when session changes
  useEffect(() => {
    if (gameSession?.players) {
      const playerList = Object.keys(gameSession.players).map(key => ({ id: key, ...gameSession.players[key] }));
      setPlayers(playerList);
    } else {
      setPlayers([]);
    }
  }, [gameSession]);

  // Effect 3: Fetch quiz ONLY when quizId changes
  useEffect(() => {
    if (quizId) {
      const quizRef = ref(database, `quizzes/${quizId}`);
      get(quizRef).then((quizSnapshot) => {
        if (quizSnapshot.exists()) {
          setQuiz({ id: quizSnapshot.key, ...quizSnapshot.val() });
        } else {
          setQuiz(null);
        }
      });
    } else {
      setQuiz(null);
    }
  }, [quizId]);


  const handleStartQuiz = () => {
    // Find the first non-hidden question
    let firstVisibleIndex = 0;
    if (quiz && Array.isArray(quiz.questions)) {
      while (firstVisibleIndex < quiz.questions.length && quiz.questions[firstVisibleIndex]?.hidden) {
        firstVisibleIndex++;
      }
      
      // If all questions are hidden, show error
      if (firstVisibleIndex >= quiz.questions.length) {
        alert('Cannot start quiz: All questions are hidden!');
        return;
      }
    }
    
    // Create timer state for the first question
    const firstQuestion = quiz.questions[firstVisibleIndex];
    const timerState = createTimerState(firstQuestion.timer || 0);
    
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    update(gameSessionRef, { 
      status: 'in-progress', 
      currentQuestionIndex: firstVisibleIndex,
      timer: timerState  // Initialize timer state
    });
    navigateTo('TEACHER_QUIZ', { gameSessionId }, { reason: 'teacher_start_quiz' });
  };

  if (!quiz) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="xl" />
      </Center>
    );
  }

  return (
    <div style={{
      height: '100vh',
      background: '#f8fafc',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>

      <AppShell header={{ height: 70 }} padding="md" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppShell.Header style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
        }}>
          <div style={{ 
            height: '100%', 
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <h2 style={{ 
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#1e293b',
              margin: 0
            }}>
              Waiting Room
            </h2>
          </div>
        </AppShell.Header>
        
        <AppShell.Main style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ 
            maxWidth: '1200px', 
            margin: '0 auto', 
            padding: '2rem 1rem',
            position: 'relative',
            zIndex: 1,
            height: '100%'
          }}>
            <Card 
              variant="default"
              style={{ 
                animation: 'slideUp 0.5s ease-out',
                marginBottom: '2rem',
                background: '#ffffff',
                border: '1px solid #e2e8f0'
              }}
            >
              <CardBody>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                  <h1 style={{ 
                    fontSize: '2rem', 
                    fontWeight: '700',
                    marginBottom: '0.75rem',
                    color: '#1e293b'
                  }}>
                    {quiz.title}
                  </h1>
                  <p style={{ fontSize: '1.125rem', color: '#64748b', fontWeight: 500 }}>
                    Waiting for players to join...
                  </p>
                </div>


                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '2rem',
                  background: '#f8fafc',
                  borderRadius: '0.5rem',
                  marginBottom: '2.5rem',
                  flexWrap: 'wrap',
                  gap: '1.5rem',
                  border: '2px solid #e2e8f0'
                }}>
                  <div>
                    <p style={{ 
                      fontSize: '0.875rem', 
                      color: '#64748b',
                      marginBottom: '0.5rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Players Joined
                    </p>
                    <h3 style={{ 
                      fontSize: '3rem', 
                      fontWeight: '800',
                      color: '#8b5cf6',
                      margin: 0,
                      lineHeight: 1
                    }}>
                      {players.length}
                    </h3>
                  </div>
                  <Button 
                    variant="primary" 
                    size="lg" 
                    onClick={handleStartQuiz}
                    style={{ minWidth: '200px' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Start Quiz
                  </Button>
                </div>

                <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="lg">
                  {players.map((player, index) => (
                    <Card
                      key={player.id}
                      variant="glass"
                      hover={false}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '1rem',
                        animation: `scaleIn 0.3s ease-out ${index * 0.05}s backwards`
                      }}
                    >
                      <CustomAvatar name={player.name} />
                      <p style={{ 
                        marginTop: '0.75rem', 
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        textAlign: 'center',
                        color: '#1e293b',
                        margin: '0.75rem 0 0 0'
                      }}>
                        {player.name}
                      </p>
                    </Card>
                  ))}
                </SimpleGrid>

                {players.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem 1rem',
                    animation: 'pulse 2s ease-in-out infinite'
                  }}>
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 1.5rem' }}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
                      Waiting for players to join...
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </AppShell.Main>
      </AppShell>
    </div>
  );
};

export default TeacherWaitingRoomPage;
