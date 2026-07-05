import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { ref, set, get, onDisconnect, runTransaction } from 'firebase/database';
import { database } from '../services/firebase';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import { Input } from '../components/modern';
import { validateGuestJoin } from '../services/sessionManager';
import { normalizeCode } from '../services/sessionCodeService';

const GuestJoinPage = () => {
  const { navigateTo } = useNavigation('student');
  const [duplicateNameError, setDuplicateNameError] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [validatingSession, setValidatingSession] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [formValues, setFormValues] = useState({
    sessionCode: '',
    name: '',
  });
  const [fieldErrors, setFieldErrors] = useState({
    sessionCode: '',
    name: '',
  });

  useEffect(() => {
    if (!isJoining) {
      // Attempt rejoin if player data exists
      const playerId = sessionStorage.getItem('playerId');
      const playerName = sessionStorage.getItem('playerName');
      if (playerId && playerName) {
        rejoinStudent(playerId, playerName);
      }
    }
  }, [isJoining]);

  const rejoinStudent = async (playerId, playerName) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sessionCode = sessionStorage.getItem('sessionCode');
      if (!sessionCode) {
        sessionStorage.removeItem('playerId');
        sessionStorage.removeItem('playerName');
        return;
      }
      
      let ip = 'unknown';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ip = data.ip;
      } catch (error) {
        console.error('Error getting IP address:', error);
      }
      
      // Check if banned
      const bannedPlayersRef = ref(database, `game_sessions/${sessionCode}/bannedPlayers`);
      const snapshot = await get(bannedPlayersRef);
      if (snapshot.exists()) {
        const bannedPlayers = snapshot.val();
        const isBannedByIp = ip !== 'unknown' && Object.values(bannedPlayers).some(player => player.ip === ip && player.ip !== 'unknown');
        const isBannedById = bannedPlayers[playerId];
        
        if (isBannedByIp || isBannedById) {
          alert('You have been banned from this game session.');
          sessionStorage.removeItem('playerId');
          sessionStorage.removeItem('playerName');
          sessionStorage.removeItem('sessionCode');
          return;
        }
      }
      
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
      const playerSnapshot = await get(playerRef);
      
      if (playerSnapshot.exists()) {
        const existingPlayer = playerSnapshot.val();
        await set(playerRef, { 
          ...existingPlayer, 
          ip: ip,
          isConnected: true,
          lastActivity: Date.now()
        });
        onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });
        
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const sessionSnapshot = await get(sessionRef);
        if (sessionSnapshot.exists()) {
          const sessionData = sessionSnapshot.val();
          if (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending' && sessionData.status !== 'completed' && sessionData.status !== 'expired') {
            navigateTo('STUDENT_TEST', { sessionCode }, { reason: 'rejoin_existing_test' });
          } else {
            navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'rejoin_waiting_room' });
          }
        }
        return;
      }
      
      // Player doesn't exist, clear and show login
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('sessionCode');
    } catch (error) {
      console.error('Error rejoining game:', error);
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('sessionCode');
    }
  };

  const validateForm = (values) => {
    const errors = {
      sessionCode: '',
      name: '',
    };

    const normalized = normalizeCode(values.sessionCode);
    if (!normalized || normalized.length === 0) {
      errors.sessionCode = 'Session code is required';
    } else if (normalized.length !== 6) {
      errors.sessionCode = 'Session code must be 6 characters';
    } else if (!/^[A-Z0-9]+$/.test(normalized)) {
      errors.sessionCode = 'Session code can only contain letters and numbers';
    }

    if (values.name.trim().length === 0) {
      errors.name = 'Name is required';
    }

    setFieldErrors(errors);
    return !errors.sessionCode && !errors.name;
  };

  const handleGuestJoin = async (event) => {
    event.preventDefault();

    if (!validateForm(formValues)) {
      return;
    }

    setDuplicateNameError(false);
    setSessionError('');
    setValidatingSession(true);
    setIsJoining(true);

    const sessionCode = normalizeCode(formValues.sessionCode);
    
    const validation = await validateGuestJoin(sessionCode);
    if (!validation.valid) {
      setSessionError(validation.message);
      setValidatingSession(false);
      setIsJoining(false);
      return;
    }

    const normalizedName = formValues.name.trim().toLowerCase();

    try {
      let ip = 'unknown';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal,
          cache: 'force-cache'
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          ip = data.ip || 'unknown';
        }
      } catch (error) {
        console.log('IP tracking blocked or failed, continuing without IP');
      }

      // Check if banned
      const bannedPlayersRef = ref(database, `game_sessions/${sessionCode}/bannedPlayers`);
      const bannedSnapshot = await get(bannedPlayersRef);
      if (bannedSnapshot.exists()) {
        const bannedPlayers = bannedSnapshot.val();
        const existingPlayerId = sessionStorage.getItem('playerId');
        
        const isBannedByIp = ip !== 'unknown' && Object.values(bannedPlayers).some(player => player.ip === ip && player.ip !== 'unknown');
        const isBannedById = existingPlayerId && bannedPlayers[existingPlayerId];
        
        if (isBannedByIp || isBannedById) {
          alert('You have been banned from this game session.');
          return;
        }
      }

      // Use transaction to check duplicates and add player
      const playersRef = ref(database, `game_sessions/${sessionCode}/players`);
      const result = await runTransaction(playersRef, (currentPlayers) => {
        if (currentPlayers) {
          const existingNames = Object.values(currentPlayers)
            .filter(player => player && player.name)
            .map(player => player.name.trim().toLowerCase());
          
          if (existingNames.includes(normalizedName)) {
            return;
          }
        }

        const existingPlayerId = sessionStorage.getItem('playerId');
        const uniqueId = existingPlayerId || Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const updatedPlayers = currentPlayers || {};
        updatedPlayers[uniqueId] = {
          name: formValues.name.trim(),
          score: 0,
          ip: ip,
          isGuest: true // Mark as guest user
        };

        sessionStorage.setItem('playerId', uniqueId);
        sessionStorage.setItem('playerName', formValues.name.trim());

        return updatedPlayers;
      });

      if (!result.committed) {
        setDuplicateNameError(true);
        return;
      }

      const playerId = sessionStorage.getItem('playerId');
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
      onDisconnect(playerRef).update({ isConnected: false, disconnectedAt: Date.now() });

      sessionStorage.setItem('sessionCode', sessionCode);

      // Route based on session mode
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnapshot = await get(sessionRef);
      
      if (sessionSnapshot.exists()) {
        const sessionData = sessionSnapshot.val();
        if (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending') {
          navigateTo('STUDENT_TEST', { sessionCode }, { reason: 'new_guest_join_test' });
        } else {
          navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'new_guest_join_waiting' });
        }
      } else {
        navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'new_guest_join_fallback' });
      }

      setValidatingSession(false);
    } catch (error) {
      console.error('Error joining game:', error);
      setSessionError('Failed to join game. Please try again.');
      setValidatingSession(false);
      setIsJoining(false);
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

      <Card 
        variant="lavender" 
        style={{ 
          maxWidth: '420px', 
          width: '100%',
          position: 'relative',
          zIndex: 1
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
              Join as Guest
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Enter session code and your name
            </p>
          </div>

          {sessionError && (
            <div style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(254, 242, 242, 0.5)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              {sessionError}
            </div>
          )}

          {duplicateNameError && (
            <div style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(254, 242, 242, 0.5)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              This name is already taken. Please choose another.
            </div>
          )}

          <form onSubmit={handleGuestJoin}>
            <div style={{ marginBottom: '1.5rem' }}>
              <Input
                label="Session Code"
                placeholder="Enter 6-character code"
                variant="lavender"
                size="lg"
                fullWidth
                required
                maxLength={6}
                value={formValues.sessionCode}
                error={fieldErrors.sessionCode || undefined}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setFormValues((current) => ({ ...current, sessionCode: value }));
                  setFieldErrors((current) => ({ ...current, sessionCode: '' }));
                }}
                style={{ 
                  fontFamily: 'monospace',
                  fontSize: '1.25rem',
                  letterSpacing: '0.1em',
                  textAlign: 'center'
                }}
              />
            </div>

            <Input
              label="Your Name"
              placeholder="Enter your name"
              variant="lavender"
              size="lg"
              fullWidth
              required
              value={formValues.name}
              error={fieldErrors.name || undefined}
              onChange={(e) => {
                setFormValues((current) => ({ ...current, name: e.target.value }));
                setFieldErrors((current) => ({ ...current, name: '' }));
              }}
            />
            
            <Button 
              variant="primary" 
              size="lg" 
              fullWidth 
              type="submit"
              disabled={validatingSession}
              style={{ marginTop: '1.5rem' }}
            >
              {validatingSession ? 'Joining...' : 'Join Game'}
            </Button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Button 
              variant="glass" 
              size="sm"
              onClick={() => window.location.href = '/'}
            >
              Back to Login
            </Button>
          </div>
        </CardBody>
      </Card>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
};

export default GuestJoinPage;
