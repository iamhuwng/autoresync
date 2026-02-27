import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { database } from '../services/firebase';
import { ref, onValue, update } from 'firebase/database';
import { Table } from '@mantine/core';
import Confetti from 'react-confetti';
import { useThemeContext } from '../context/ThemeContext.jsx';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
// import { useLog } from '../context/LogContext'; // DISABLED FOR TESTING

const TeacherResultsPage = () => {
  const { gameSessionId } = useParams();
  const { navigateTo } = useNavigation('teacher');
  const { isAurora } = useThemeContext();
  // const { addLog } = useLog(); // DISABLED FOR TESTING
  const addLog = () => {}; // No-op function
  const [players, setPlayers] = useState([]);
  const [gameSession, setGameSession] = useState(null);

  useEffect(() => {
    addLog(`[TEACHER RESULTS] Component mounted for session: ${gameSessionId}`);
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const session = snapshot.val();
      addLog(`[TEACHER RESULTS] Game session updated: status=${session?.status}, playerCount=${session?.players ? Object.keys(session.players).length : 0}`);
      setGameSession(session);
      if (session && session.players) {
        const playersArray = Object.values(session.players);
        playersArray.sort((a, b) => b.score - a.score);
        addLog(`[TEACHER RESULTS] Players sorted by score: ${playersArray.map(p => `${p.name}(${p.score})`).join(', ')}`);
        setPlayers(playersArray);
      }
    });

    return () => {
      addLog(`[TEACHER RESULTS] Component unmounting`);
      unsubscribe();
    };
  }, [gameSessionId, addLog]);

  const handleReturnToLobby = () => {
    if (window.confirm('This will end the session and return all players to the waiting room. Are you sure?')) {
      addLog(`[TEACHER RESULTS] Returning to lobby, resetting session`);
      const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
      
      // Keep players but reset their scores and answers
      const resetPlayers = {};
      if (gameSession?.players) {
        Object.keys(gameSession.players).forEach(playerId => {
          resetPlayers[playerId] = {
            name: gameSession.players[playerId].name,
            ip: gameSession.players[playerId].ip || 'unknown',
            score: 0,
            answers: {}
          };
        });
      }
      
      addLog(`[TEACHER RESULTS] Updating session: status=waiting, playerCount=${Object.keys(resetPlayers).length}`);
      update(gameSessionRef, {
        status: 'waiting',
        players: resetPlayers,
        currentQuestionIndex: 0,
        timer: null  // Clear timer state to prevent auto-start
      }).then(() => {
        addLog(`[TEACHER RESULTS] Successfully reset session, navigating to lobby`);
        navigateTo('TEACHER_LOBBY', { sessionCode: gameSessionId }, { reason: 'quiz_return_to_lobby' });
      }).catch((error) => {
        addLog(`[TEACHER RESULTS] ❌ Error updating game session: ${error.message}`);
        console.error('Error updating game session:', error);
        alert('Failed to return to lobby. Please try again.');
      });
    }
  };

  const pageStyle = {
    minHeight: '100vh',
    padding: '3rem 2.5rem',
    background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
    backgroundAttachment: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden'
  };

  const leaderboardTable = (
    <Card variant="lavender" style={{ padding: '2rem', width: '100%', maxWidth: '960px', animation: 'slideUp 0.5s ease-out 0.1s backwards' }}>
      <CardBody>
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
            Total Players
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>
            {players.length}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table horizontalSpacing="md" verticalSpacing="sm">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr key={player.name + index} style={{
                  animation: `scaleIn 0.3s ease-out ${index * 0.05}s backwards`
                }}>
                  <td>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '50%',
                      background: index === 0 ? '#fbbf24' :
                                 index === 1 ? '#d1d5db' :
                                 index === 2 ? '#fb923c' :
                                 'rgba(139, 92, 246, 0.1)',
                      color: index < 3 ? 'white' : '#8b5cf6',
                      fontWeight: '700'
                    }}>
                      {index + 1}
                    </div>
                  </td>
                  <td style={{ fontWeight: index < 3 ? '600' : '400' }}>{player.name}</td>
                  <td style={{ 
                    fontWeight: '700',
                    color: index === 0 ? '#14b8a6' : '#1e293b'
                  }}>
                    {player.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>
  );

  const heading = (
    <Card variant="rose" style={{ marginBottom: '2rem', padding: '1.75rem 2rem', textAlign: 'center', width: '100%', maxWidth: '720px', animation: 'slideDown 0.5s ease-out' }}>
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f43f5e' }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            color: '#1e293b',
            margin: 0
          }}>
            Final Results
          </h1>
        </div>
        <p style={{ fontSize: '1rem', color: '#64748b', margin: '0.5rem 0 0 0' }}>
          Celebrate the champions and return to the lobby when you are ready.
        </p>
      </CardBody>
    </Card>
  );

  return (
    <div style={pageStyle}>
      <Confetti />
      {heading}
      {leaderboardTable}
      <div style={{ marginTop: '2.5rem', animation: 'slideUp 0.5s ease-out 0.2s backwards' }}>
        <Button 
          variant="primary" 
          size="lg"
          onClick={handleReturnToLobby}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
          Return to Lobby
        </Button>
      </div>
    </div>
  );
};

export default TeacherResultsPage;