/**
 * useTestTimer Hook
 * Manages test countdown timer with teacher synchronization
 * 
 * PRD-0019: Now includes grace period overlay integration
 */

import { createElement, useCallback } from 'react';
import { useState, useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { IconClock } from '@tabler/icons-react';
import { useTimerExpiry } from './useTimerExpiry';

interface UseTestTimerOptions {
  testData: any | null;
  sessionStatus: 'waiting' | 'in-progress' | 'completed';
  isPaused: boolean;
  sessionStartTime: number | null;
  pausedDuration: number;
  testSubmitted: boolean;
  onTimeUp: () => void;
  /** Extra time in seconds (from accommodation) */
  extraTime?: number;
  /** Enable grace period overlay (PRD-0019). Default: true */
  enableGracePeriod?: boolean;
  /** Grace period duration in seconds. Default: 5 */
  gracePeriodDuration?: number;
  /** Callback when grace period starts (for locking inputs) */
  onGracePeriodStart?: () => void;
}

interface UseTestTimerReturn {
  timeRemaining: number;
  formatTime: (seconds: number) => string;
  /** PRD-0019: Whether the TimeUpOverlay should be shown */
  showTimeUpOverlay: boolean;
  /** PRD-0019: Remaining seconds in grace period */
  gracePeriodRemaining: number;
  /** PRD-0019: Whether student is in their extra time (after base time expired) */
  isInExtraTime: boolean;
}

export const useTestTimer = ({
  testData,
  sessionStatus,
  isPaused,
  sessionStartTime,
  pausedDuration,
  testSubmitted,
  onTimeUp,
  extraTime = 0,
  enableGracePeriod = true,
  gracePeriodDuration = 5,
  onGracePeriodStart,
}: UseTestTimerOptions): UseTestTimerReturn => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isInExtraTime, setIsInExtraTime] = useState(false);
  const hasAutoSubmittedRef = useRef(false);
  const hasJoinedLateRef = useRef(false);
  const initialLoadRef = useRef(true);
  const hasShownWarningRef = useRef(false); // Track if 5-minute warning shown
  const hasTriggeredGracePeriodRef = useRef(false);

  // PRD-0019: Use the timer expiry hook for grace period management
  const handleGracePeriodEnd = useCallback(() => {
    console.log('⏰ [PRD-0019] Grace period ended, triggering auto-submit');
    hasAutoSubmittedRef.current = true;
    onTimeUp();
  }, [onTimeUp]);

  const handleGracePeriodStart = useCallback(() => {
    console.log('⏰ [PRD-0019] Grace period started, locking inputs');
    onGracePeriodStart?.();
  }, [onGracePeriodStart]);

  const {
    isGracePeriodActive: showTimeUpOverlay,
    gracePeriodRemaining,
    triggerGracePeriod,
  } = useTimerExpiry({
    gracePeriodDuration,
    onGracePeriodStart: handleGracePeriodStart,
    onGracePeriodEnd: handleGracePeriodEnd,
  });

  // Timer countdown - synced with teacher control
  useEffect(() => {
    if (!testData || sessionStatus !== 'in-progress' || isPaused || !sessionStartTime) return;

    // Validate sessionStartTime to prevent incorrect timer calculations
    const now = Date.now();
    if (sessionStartTime > now || sessionStartTime < (now - 24 * 60 * 60 * 1000)) {
      // Start time is in the future or more than 24 hours ago - invalid
      console.error('Invalid session start time:', sessionStartTime);
      return;
    }

    // Calculate base duration (without extra time)
    const baseDuration = testData.duration * 60; // in seconds
    const totalDuration = baseDuration + extraTime; // Include accommodation extra time

    // Check if student is joining late to an already-started test
    if (initialLoadRef.current) {
      const elapsedTime = Math.floor((now - sessionStartTime - pausedDuration) / 1000);

      // If joining after test should have ended, mark as joining late
      // Don't auto-submit immediately - give them a chance to see the test
      if (elapsedTime >= totalDuration) {
        hasJoinedLateRef.current = true;
        console.log('Student joined after test duration has expired. Not auto-submitting.');
        setTimeRemaining(0);
        // Don't trigger auto-submission for late joiners on initial load
        initialLoadRef.current = false;
        return;
      }
      initialLoadRef.current = false;
    }

    let lastUpdate = now;

    const timer = setInterval(() => {
      const currentTime = Date.now();
      const deltaSeconds = Math.floor((currentTime - lastUpdate) / 1000);

      if (deltaSeconds > 0) {
        // Only update state if at least 1 second has passed
        const elapsedTime = Math.floor((currentTime - sessionStartTime - pausedDuration) / 1000);
        const remaining = Math.max(0, totalDuration - elapsedTime);

        setTimeRemaining(remaining);
        lastUpdate = currentTime;

        // PRD-0019: Check if student is in extra time (base time expired but they have accommodation)
        if (extraTime > 0) {
          const baseTimeRemaining = Math.max(0, baseDuration - elapsedTime);
          if (baseTimeRemaining <= 0 && remaining > 0) {
            setIsInExtraTime(true);
          }
        }

        // Show 5-minute warning notification (once)
        if (remaining === 300 && !hasShownWarningRef.current && !testSubmitted) {
          hasShownWarningRef.current = true;
          notifications.show({
            title: 'Time Warning',
            message: '⏰ 5 minutes remaining!',
            color: 'orange',
            icon: createElement(IconClock, { size: 20 }),
            autoClose: 10000,
          });
        }

        // PRD-0019: When time is up, trigger grace period instead of immediate submission
        // Don't trigger if student joined late (they should manually submit)
        if (remaining <= 0 && !hasAutoSubmittedRef.current && !testSubmitted && !hasJoinedLateRef.current) {
          if (enableGracePeriod && !hasTriggeredGracePeriodRef.current) {
            // Trigger grace period overlay instead of immediate auto-submit
            hasTriggeredGracePeriodRef.current = true;
            console.log('⏰ [PRD-0019] Timer reached 0, starting grace period overlay');
            clearInterval(timer); // Stop the timer
            triggerGracePeriod(); // This will show the overlay and call onTimeUp after grace period
          } else if (!enableGracePeriod) {
            // Legacy behavior: immediate auto-submit
            hasAutoSubmittedRef.current = true;
            console.log('⏰ [AUTO-SUBMIT] Timer reached 0, triggering auto-submit (legacy mode)');
            clearInterval(timer);
            onTimeUp();
          }
        } else if (remaining <= 0) {
          // Log why auto-submit didn't trigger
          if (hasAutoSubmittedRef.current || hasTriggeredGracePeriodRef.current) {
            // Already handled
          } else if (testSubmitted) {
            console.log('⏰ [AUTO-SUBMIT] Test already submitted manually');
          } else if (hasJoinedLateRef.current) {
            console.log('⏰ [AUTO-SUBMIT] Student joined late, manual submission required');
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [testData, sessionStatus, isPaused, sessionStartTime, pausedDuration, testSubmitted, onTimeUp, extraTime, enableGracePeriod, triggerGracePeriod]);

  // Reset flags when test is submitted manually
  useEffect(() => {
    if (testSubmitted) {
      hasAutoSubmittedRef.current = false;
      hasTriggeredGracePeriodRef.current = false;
    }
  }, [testSubmitted]);

  /**
   * Format time remaining
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    timeRemaining,
    formatTime,
    showTimeUpOverlay,
    gracePeriodRemaining,
    isInExtraTime,
  };
};
