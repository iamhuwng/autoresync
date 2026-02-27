import { useState, useEffect, useRef } from 'react';

/**
 * useSynchronizedTimer Hook
 * 
 * Calculates time remaining from server timestamp stored in Firebase.
 * Ensures all clients (teacher and students) show the same time.
 * 
 * @param {Object} timerState - Timer state from Firebase
 * @param {number} timerState.startTime - Unix timestamp when timer started
 * @param {number} timerState.totalTime - Total time in seconds
 * @param {boolean} timerState.isPaused - Whether timer is paused
 * @param {number} timerState.pausedAt - Unix timestamp when paused
 * @param {number} timerState.pausedDuration - Total paused duration in ms
 * @param {Function} onTimeUp - Callback when timer reaches 0
 * @returns {number} Current time remaining in seconds
 */
export const useSynchronizedTimer = (timerState, onTimeUp) => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const hasCalledTimeUpRef = useRef(false);
  const lastTimerStateRef = useRef(null);
  
  useEffect(() => {
    // If no timer state, show total time or 0
    if (!timerState || !timerState.startTime) {
      setTimeRemaining(timerState?.totalTime || 0);
      hasCalledTimeUpRef.current = false;
      return;
    }
    
    // Reset time up flag when timer state changes (new question)
    if (lastTimerStateRef.current?.startTime !== timerState.startTime) {
      hasCalledTimeUpRef.current = false;
      lastTimerStateRef.current = timerState;
    }
    
    /**
     * Calculate time remaining from server timestamp
     * This ensures all clients show the same time
     */
    const calculateTimeRemaining = (now) => {
      // If paused, calculate time at pause moment
      if (timerState.isPaused && timerState.pausedAt) {
        const elapsedBeforePause = timerState.pausedAt - timerState.startTime - (timerState.pausedDuration || 0);
        const remaining = timerState.totalTime - Math.floor(elapsedBeforePause / 1000);
        return Math.max(0, remaining);
      }
      
      // Calculate current time remaining
      const elapsed = now - timerState.startTime - (timerState.pausedDuration || 0);
      const remaining = timerState.totalTime - Math.floor(elapsed / 1000);
      return Math.max(0, remaining);
    };
    
    // Initial calculation
    const initialRemaining = calculateTimeRemaining(Date.now());
    setTimeRemaining(initialRemaining);
    
    // Update every 100ms for smooth countdown
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = calculateTimeRemaining(now);
      setTimeRemaining(remaining);
      
      // Call onTimeUp only once when reaching 0
      if (remaining === 0 && !hasCalledTimeUpRef.current && onTimeUp && !timerState.isPaused) {
        hasCalledTimeUpRef.current = true;
        onTimeUp();
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [timerState, onTimeUp]);
  
  return timeRemaining;
};

/**
 * Helper function to create initial timer state
 * Used when starting a new question
 */
export const createTimerState = (totalTime) => {
  return {
    startTime: Date.now(),
    totalTime: totalTime || 0,
    isPaused: false,
    pausedAt: null,
    pausedDuration: 0
  };
};

/**
 * Helper function to pause timer
 * Returns updated timer state
 */
export const pauseTimer = (currentTimerState) => {
  if (!currentTimerState || currentTimerState.isPaused) {
    return currentTimerState;
  }
  
  return {
    ...currentTimerState,
    isPaused: true,
    pausedAt: Date.now()
  };
};

/**
 * Helper function to resume timer
 * Returns updated timer state
 */
export const resumeTimer = (currentTimerState) => {
  if (!currentTimerState || !currentTimerState.isPaused) {
    return currentTimerState;
  }
  
  const now = Date.now();
  const pauseDuration = now - (currentTimerState.pausedAt || now);
  
  return {
    ...currentTimerState,
    isPaused: false,
    pausedAt: null,
    pausedDuration: (currentTimerState.pausedDuration || 0) + pauseDuration
  };
};

/**
 * Helper function to adjust timer by adding or subtracting seconds
 * Returns updated timer state
 */
export const adjustTimer = (currentTimerState, secondsToAdd) => {
  if (!currentTimerState) {
    return currentTimerState;
  }
  
  const now = Date.now();
  const adjustment = secondsToAdd * 1000; // Convert to milliseconds
  
  // If paused, adjust the pausedAt time
  if (currentTimerState.isPaused && currentTimerState.pausedAt) {
    return {
      ...currentTimerState,
      startTime: currentTimerState.startTime - adjustment
    };
  }
  
  // If running, adjust the startTime to effectively add/subtract time
  return {
    ...currentTimerState,
    startTime: currentTimerState.startTime - adjustment
  };
};
