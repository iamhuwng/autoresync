// @ts-nocheck
/**
 * useSessionControls Hook
 * 
 * Extracts common session control handlers (kick, unban, end session)
 * that are shared by live session teacher surfaces.
 * 
 * Usage:
 *   const { handleKickPlayer, handleUnbanPlayer, handleEndSession } = useSessionControls(sessionId);
 */

import { useCallback } from 'react';
import { database } from '../services/firebase';
import { ref, update, remove, set, get } from 'firebase/database';
import { useNavigation } from './useNavigation';
import { getSessionEndReleaseState } from '../types/releaseState.types';

export interface SessionPlayer {
  name: string;
  ip?: string;
  score?: number;
  answers?: Record<string, any>;
}

export interface UseSessionControlsOptions {
  /** Session ID / Game Session ID */
  sessionId: string;
  /** Current players in session */
  players?: Record<string, SessionPlayer>;
  /** Callback after session ends */
  onSessionEnd?: () => void;
}

export interface UseSessionControlsReturn {
  /** Kick a player and ban them from rejoining */
  handleKickPlayer: (playerId: string) => void;
  /** Unban a previously banned player */
  handleUnbanPlayer: (playerId: string) => void;
  /** End the session and return all players to waiting room */
  handleEndSession: () => void;
  /** Reset session to waiting state (keeps players) */
  handleResetSession: () => Promise<void>;
}

/**
 * Hook for common session control operations
 */
export const useSessionControls = ({
  sessionId,
  players,
  onSessionEnd,
}: UseSessionControlsOptions): UseSessionControlsReturn => {
  const { navigateTo } = useNavigation('teacher');

  /**
   * Kick a player and add them to banned list
   */
  const handleKickPlayer = useCallback((playerId: string) => {
    if (!window.confirm('Are you sure you want to kick this player?')) {
      return;
    }

    const player = players?.[playerId];
    if (!player) {
      console.warn(`Player ${playerId} not found in session`);
      return;
    }

    // Add to banned list
    const bannedPlayerRef = ref(database, `game_sessions/${sessionId}/bannedPlayers/${playerId}`);
    set(bannedPlayerRef, {
      name: player.name,
      ip: player.ip || 'unknown',
      bannedAt: Date.now(),
    });

    // Show appropriate message
    if (!player.ip || player.ip === 'unknown') {
      alert(`Player "${player.name}" has been kicked and banned by ID. They cannot rejoin with the same browser, but may be able to rejoin from a different device.`);
    }

    // Remove from active players
    const playerRef = ref(database, `game_sessions/${sessionId}/players/${playerId}`);
    remove(playerRef);
  }, [sessionId, players]);

  /**
   * Unban a previously banned player
   */
  const handleUnbanPlayer = useCallback((playerId: string) => {
    const bannedPlayerRef = ref(database, `game_sessions/${sessionId}/bannedPlayers/${playerId}`);
    remove(bannedPlayerRef);
  }, [sessionId]);

  /**
   * End the session and return to lobby
   */
  const handleEndSession = useCallback(async () => {
    if (!window.confirm('Are you sure you want to end this session? This will return all players to the waiting room.')) {
      return;
    }

    const gameSessionRef = ref(database, `game_sessions/${sessionId}`);
    const sessionSnapshot = await get(gameSessionRef);
    const sessionData = sessionSnapshot.exists() ? sessionSnapshot.val() : {};
    const now = Date.now();
    const currentTestId = sessionData.testId || null;
    
    // Keep players but reset their scores and answers
    const resetPlayers: Record<string, SessionPlayer> = {};
    if (players) {
      Object.keys(players).forEach(playerId => {
        const player = players[playerId];
        if (player) {
          resetPlayers[playerId] = {
            ...player,
            name: player.name,
            ip: player.ip || 'unknown',
            score: 0,
            answers: {},
            lastTestId: currentTestId,
            lastTestSessionCode: sessionId,
            lastTestEndedAt: now,
          };
        }
      });
    }

    
    try {
      await update(gameSessionRef, {
        status: 'waiting',
        players: resetPlayers,
        currentQuestionIndex: 0,
        timer: null,
        completedAt: now,
        lastTestCompletedAt: now,
        lastTestId: currentTestId,
        reviewReleaseState: getSessionEndReleaseState(sessionData.reviewReleaseState),
        reviewReleaseStateUpdatedAt: now,
      });
      onSessionEnd?.();
      navigateTo('TEACHER_LOBBY', { sessionCode: sessionId }, { reason: 'teacher_end_session' });
    } catch (error) {
      console.error('Failed to end session:', error);
      alert('Failed to end session. Please try again.');
    }
  }, [sessionId, players, navigateTo, onSessionEnd]);

  /**
   * Reset session to waiting state (without navigation)
   */
  const handleResetSession = useCallback(async () => {
    const gameSessionRef = ref(database, `game_sessions/${sessionId}`);
    
    // Keep players but reset their scores and answers
    const resetPlayers: Record<string, SessionPlayer> = {};
    if (players) {
      Object.keys(players).forEach(playerId => {
        const player = players[playerId];
        if (player) {
          resetPlayers[playerId] = {
            name: player.name,
            ip: player.ip || 'unknown',
            score: 0,
            answers: {}
          };
        }
      });
    }
    
    await update(gameSessionRef, {
      status: 'waiting',
      players: resetPlayers,
      currentQuestionIndex: 0,
      timer: null
    });
  }, [sessionId, players]);

  return {
    handleKickPlayer,
    handleUnbanPlayer,
    handleEndSession,
    handleResetSession,
  };
};

export default useSessionControls;
