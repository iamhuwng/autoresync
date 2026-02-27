import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { ref, set, get, onDisconnect, runTransaction } from 'firebase/database';
import { database } from '../services/firebase';
import { useForm } from '@mantine/form';
import { Card, CardBody, CardFooter } from '../components/modern';
import { Button } from '../components/modern';
import { Input } from '../components/modern';
import { validateSessionForJoin } from '../services/sessionManager';
import { normalizeCode } from '../services/sessionCodeService';

const LoginPage = ({ setShowAdminLogin }) => {
  const { navigateTo } = useNavigation('student');
  const [duplicateNameError, setDuplicateNameError] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [validatingSession, setValidatingSession] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('isAdmin') === 'true') {
      navigateTo('SESSIONS', {}, { reason: 'admin_auto_redirect', replace: true });
    } else if (!isJoining) {
      // Only attempt rejoin if we're not currently joining
      const playerId = sessionStorage.getItem('playerId');
      const playerName = sessionStorage.getItem('playerName');
      if (playerId && playerName) {
        rejoinStudent(playerId, playerName);
      }
    }
  }, [navigateTo, isJoining]);

  const rejoinStudent = async (playerId, playerName) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
      
      // Get session code from storage
      const sessionCode = sessionStorage.getItem('sessionCode');
      if (!sessionCode) {
        // No session code stored, redirect to login
        console.warn('No session code found for rejoin, redirecting to login');
        sessionStorage.removeItem('playerId');
        sessionStorage.removeItem('playerName');
        navigateTo('LOGIN', {}, { reason: 'rejoin_no_session_code', replace: true });
        return;
      }
      
      // Get IP address
      let ip = 'unknown';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ip = data.ip;
      } catch (error) {
        console.error('Error getting IP address, proceeding with "unknown":', error);
      }
      
      // Check if player is banned before rejoining
      const bannedPlayersRef = ref(database, `game_sessions/${sessionCode}/bannedPlayers`);
      const snapshot = await get(bannedPlayersRef);
      if (snapshot.exists()) {
        const bannedPlayers = snapshot.val();
        
        // Check if banned by IP (if IP is known) or by player ID
        const isBannedByIp = ip !== 'unknown' && Object.values(bannedPlayers).some(player => player.ip === ip && player.ip !== 'unknown');
        const isBannedById = bannedPlayers[playerId];
        
        if (isBannedByIp || isBannedById) {
          alert('You have been banned from this game session.');
          sessionStorage.removeItem('playerId');
          sessionStorage.removeItem('playerName');
          sessionStorage.removeItem('sessionCode');
          navigateTo('LOGIN', {}, { reason: 'player_banned', replace: true });
          return;
        }
      }
      
      // Check if this player already exists in the session
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
      const playerSnapshot = await get(playerRef);
      
      if (playerSnapshot.exists()) {
        // Player already exists, just update IP, connection status, and set up disconnect handler
        const existingPlayer = playerSnapshot.val();
        await set(playerRef, { 
          ...existingPlayer, 
          ip: ip,
          isConnected: true,
          lastActivity: Date.now()
        });
        // Mark as disconnected instead of removing (preserves answers and progress)
        onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });
        
        // Check session mode to route appropriately
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const sessionSnapshot = await get(sessionRef);
        if (sessionSnapshot.exists()) {
          const sessionData = sessionSnapshot.val();
          // Route to test/quiz if content selected and NOT completed/expired
          // TestWaitingOverlay will block interaction until status='in-progress'
          if (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending' && sessionData.status !== 'completed' && sessionData.status !== 'expired') {
            navigateTo('STUDENT_TEST', { sessionCode }, { reason: 'rejoin_existing_test' });
          } else if (sessionData.mode === 'quiz' && sessionData.quizId && sessionData.quizId !== 'pending' && sessionData.status !== 'completed' && sessionData.status !== 'expired') {
            navigateTo('STUDENT_QUIZ', { gameSessionId: sessionCode }, { reason: 'rejoin_existing_quiz' });
          } else {
            // No test/quiz selected yet, go to waiting room
            navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'rejoin_waiting_room' });
          }
        } else {
          navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'rejoin_session_not_found' });
        }
        return;
      }
      
      // Player doesn't exist, check for duplicate names before rejoining
      const normalizedName = playerName.trim().toLowerCase();
      const playersRef = ref(database, `game_sessions/${sessionCode}/players`);
      const playersSnapshot = await get(playersRef);
      
      if (playersSnapshot.exists()) {
        const players = playersSnapshot.val();
        const existingNames = Object.entries(players)
          .filter(([id, player]) => id !== playerId && player && player.name) // Exclude current player ID
          .map(([_, player]) => player.name.trim().toLowerCase());
        
        if (existingNames.includes(normalizedName)) {
          // Name is taken by another player, clear session and redirect to login
          console.warn('Name already taken by another player during rejoin');
          sessionStorage.removeItem('playerId');
          sessionStorage.removeItem('playerName');
          sessionStorage.removeItem('sessionCode');
          navigateTo('LOGIN', {}, { reason: 'rejoin_duplicate_name', replace: true });
          return;
        }
      }
      
      // Safe to rejoin - add player
      const playerData = { 
        name: playerName, 
        score: 0, 
        ip: ip,
        isConnected: true,
        connectedAt: Date.now(),
        lastActivity: Date.now()
      };
      await set(playerRef, playerData);
      
      // Mark as disconnected instead of removing (preserves answers and progress)
      onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });
      
      // Check session mode to route appropriately
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnapshot = await get(sessionRef);
      if (sessionSnapshot.exists()) {
        const sessionData = sessionSnapshot.val();
        // Route to test/quiz if content selected and NOT completed/expired
        // TestWaitingOverlay will block interaction until status='in-progress'
        if (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending' && sessionData.status !== 'completed' && sessionData.status !== 'expired') {
          navigateTo('STUDENT_TEST', { sessionCode }, { reason: 'rejoin_new_player_test' });
        } else if (sessionData.mode === 'quiz' && sessionData.quizId && sessionData.quizId !== 'pending' && sessionData.status !== 'completed' && sessionData.status !== 'expired') {
          navigateTo('STUDENT_QUIZ', { gameSessionId: sessionCode }, { reason: 'rejoin_new_player_quiz' });
        } else {
          // No test/quiz selected yet, go to waiting room
          navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'rejoin_new_player_waiting' });
        }
      } else {
        navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'rejoin_fallback' });
      }
    } catch (error) {
      console.error('Error rejoining game:', error);
      // Clear session storage and redirect to login on error
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('sessionCode');
      navigateTo('LOGIN', {}, { reason: 'rejoin_error', replace: true });
    }
  };

  const form = useForm({
    initialValues: {
      sessionCode: '',
      name: '',
    },

    validate: {
      sessionCode: (value) => {
        const normalized = normalizeCode(value);
        if (!normalized || normalized.length === 0) {
          return 'Session code is required';
        }
        if (normalized.length !== 6) {
          return 'Session code must be 6 characters';
        }
        if (!/^[A-Z0-9]+$/.test(normalized)) {
          return 'Session code can only contain letters and numbers';
        }
        return null;
      },
      name: (value) => (value.trim().length > 0 ? null : 'Name is required'),
    },
  });

  const handleStudentJoin = async (values) => {
    // Clear any previous errors
    setDuplicateNameError(false);
    setSessionError('');
    setValidatingSession(true);
    setIsJoining(true); // Prevent rejoinStudent from triggering

    // Normalize session code
    const sessionCode = normalizeCode(values.sessionCode);
    
    // Validate session code
    const validation = await validateSessionForJoin(sessionCode);
    if (!validation.valid) {
      setSessionError(validation.message);
      setValidatingSession(false);
      return;
    }

    // Normalize the entered name for comparison (lowercase and trim)
    const normalizedName = values.name.trim().toLowerCase();

    try {
      // Try to get IP address but don't fail if blocked
      let ip = 'unknown';
      try {
        // Use a timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal,
          // Add cache to reduce requests
          cache: 'force-cache'
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          ip = data.ip || 'unknown';
        }
      } catch (error) {
        // Silently continue - IP tracking might be blocked which is fine
        console.log('IP tracking blocked or failed, continuing without IP');
      }

      // Check if player is banned by IP or player ID
      const bannedPlayersRef = ref(database, `game_sessions/${sessionCode}/bannedPlayers`);
      const bannedSnapshot = await get(bannedPlayersRef);
      if (bannedSnapshot.exists()) {
        const bannedPlayers = bannedSnapshot.val();
        const existingPlayerId = sessionStorage.getItem('playerId');
        
        // Check if banned by IP (if IP is known) or by player ID
        const isBannedByIp = ip !== 'unknown' && Object.values(bannedPlayers).some(player => player.ip === ip && player.ip !== 'unknown');
        const isBannedById = existingPlayerId && bannedPlayers[existingPlayerId];
        
        if (isBannedByIp || isBannedById) {
          alert('You have been banned from this game session.');
          return;
        }
      }

      // Use transaction to atomically check for duplicates and add player
      const playersRef = ref(database, `game_sessions/${sessionCode}/players`);
      const result = await runTransaction(playersRef, (currentPlayers) => {
        // Check for duplicate names in the transaction
        if (currentPlayers) {
          const existingNames = Object.values(currentPlayers)
            .filter(player => player && player.name)
            .map(player => player.name.trim().toLowerCase());
          
          if (existingNames.includes(normalizedName)) {
            // Abort transaction - duplicate found
            return;
          }
        }

        // No duplicate - add the new player
        const existingPlayerId = sessionStorage.getItem('playerId');
        const uniqueId = existingPlayerId || Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const updatedPlayers = currentPlayers || {};
        updatedPlayers[uniqueId] = {
          name: values.name.trim(),
          score: 0,
          ip: ip
        };

        // Store the uniqueId for later use
        sessionStorage.setItem('playerId', uniqueId);
        sessionStorage.setItem('playerName', values.name.trim());

        return updatedPlayers;
      });

      // Check if transaction was aborted (duplicate found)
      if (!result.committed) {
        setDuplicateNameError(true);
        return;
      }

      // Transaction succeeded - set up disconnect handler
      const playerId = sessionStorage.getItem('playerId');
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
      // Mark as disconnected instead of removing (preserves answers and progress)
      onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });

      // Store session code for page navigation
      sessionStorage.setItem('sessionCode', sessionCode);

      // Check session mode to route appropriately
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnapshot = await get(sessionRef);
      let targetRoute = `/student-wait/${sessionCode}`;
      
      if (sessionSnapshot.exists()) {
        const sessionData = sessionSnapshot.val();
        // Only route to test/quiz pages if content is actually selected
        if (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending') {
          targetRoute = `/student-test/${sessionCode}`;
        } else if (sessionData.mode === 'quiz' && sessionData.quizId && sessionData.quizId !== 'pending') {
          targetRoute = `/student-wait/${sessionCode}`;
        }
        // Otherwise, default to waiting room (already set above)
      }

      setValidatingSession(false);
      // Keep isJoining true during navigation to prevent rejoin trigger
      // Route based on targetRoute
      if (targetRoute.includes('/student-test/')) {
        const sessionCode = targetRoute.split('/')[2];
        navigateTo('STUDENT_TEST', { sessionCode }, { reason: 'new_player_join_test' });
      } else if (targetRoute.includes('/student-quiz/')) {
        const sessionId = targetRoute.split('/')[2];
        navigateTo('STUDENT_QUIZ', { gameSessionId: sessionId }, { reason: 'new_player_join_quiz' });
      } else if (targetRoute.includes('/student-wait/')) {
        const sessionId = targetRoute.split('/')[2];
        navigateTo('STUDENT_WAITING', { gameSessionId: sessionId }, { reason: 'new_player_join_waiting' });
      }
    } catch (error) {
      console.error('Error joining game:', error);
      setSessionError('Failed to join game. Please try again.');
      setValidatingSession(false);
      setIsJoining(false); // Reset on error
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Background Elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(167, 139, 250, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 8s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: '250px',
        height: '250px',
        background: 'radial-gradient(circle, rgba(251, 113, 133, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 10s ease-in-out infinite reverse'
      }} />
      <div style={{
        position: 'absolute',
        top: '50%',
        right: '20%',
        width: '200px',
        height: '200px',
        background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        animation: 'float 12s ease-in-out infinite'
      }} />

      <Card 
        variant="lavender" 
        style={{ 
          maxWidth: '420px', 
          width: '100%',
          position: 'relative',
          zIndex: 1,
          animation: 'slideUp 0.5s ease-out'
        }}
      >
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: '700',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #c084fc 50%, #fb7185 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem'
            }}>
              Join Game
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Enter your name to start playing
            </p>
          </div>

          {/* Session Error Message */}
          {sessionError && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(254, 242, 242, 0.5)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              animation: 'scaleIn 0.3s ease-out'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="white" strokeWidth="2"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="white" strokeWidth="2"/>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>
                  Invalid Session Code
                </div>
                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                  {sessionError}
                </div>
              </div>
              <button
                onClick={() => setSessionError('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Duplicate Name Error Message */}
          {duplicateNameError && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(254, 242, 242, 0.5)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              animation: 'scaleIn 0.3s ease-out'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="white" strokeWidth="2"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="white" strokeWidth="2"/>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>
                  Name Already Taken
                </div>
                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                  This name is already taken. Please choose another.
                </div>
              </div>
              <button
                onClick={() => setDuplicateNameError(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          <form onSubmit={form.onSubmit(handleStudentJoin)}>
            <div style={{ marginBottom: '1.5rem' }}>
              <Input
                label="Session Code"
                placeholder="Enter 6-character code"
                variant="lavender"
                size="lg"
                fullWidth
                required
                maxLength={6}
                error={form.errors.sessionCode}
                {...form.getInputProps('sessionCode')}
                onChange={(e) => {
                  // Auto-uppercase as user types
                  const value = e.target.value.toUpperCase();
                  form.setFieldValue('sessionCode', value);
                }}
                style={{ 
                  fontFamily: 'monospace',
                  fontSize: '1.25rem',
                  letterSpacing: '0.1em',
                  textAlign: 'center'
                }}
              />
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#64748b', 
                marginTop: '0.5rem',
                textAlign: 'center'
              }}>
                Ask your teacher for the session code
              </div>
            </div>

            <Input
              label="Your Name"
              placeholder="Enter your name"
              variant="lavender"
              size="lg"
              fullWidth
              required
              error={form.errors.name}
              {...form.getInputProps('name')}
            />
            
            <Button 
              variant="primary" 
              size="lg" 
              fullWidth 
              type="submit"
              disabled={validatingSession}
              style={{ marginTop: '1.5rem' }}
            >
              {validatingSession ? 'Validating...' : 'Join Game'}
            </Button>
          </form>
        </CardBody>
        
        <CardFooter style={{ justifyContent: 'center', borderTop: 'none', paddingTop: '0' }}>
          <Button 
            variant="glass" 
            size="md"
            onClick={() => { 
              console.log('Admin Login button clicked'); 
              setShowAdminLogin(true); 
            }}
          >
            Admin Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;