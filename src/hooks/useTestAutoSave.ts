// @ts-nocheck
/**
 * useTestAutoSave Hook
 * Automatically saves student test answers to Firebase
 * 
 * Features:
 * - Auto-saves every 30 seconds
 * - Debounced saves on answer changes
 * - Handles offline scenarios
 * - Provides save status feedback
 * - Prevents unnecessary writes (dirty checking)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ref, update, serverTimestamp } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations (TODO: convert to TypeScript)
import { database } from '../services/firebase';
import { resolveSessionMutationFailure } from '../services/sessionActionError';
import type { SavedMobileState } from '../types/practice.types';

export interface StudentAnswers {
  [questionNumber: number]: string | string[] | Record<string, string>;
}

export interface AutoSaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved: number | null;
  error: string | null;
}

interface UseTestAutoSaveOptions {
  /**
   * Session code for the test
   */
  sessionCode: string;
  
  /**
   * Student ID or name
   */
  studentId: string;
  
  /**
   * Current student answers
   */
  answers: StudentAnswers;

  /**
   * Optional mobile Reading shell state to persist alongside answers.
   */
  mobileState?: SavedMobileState;
  
  /**
   * Auto-save interval in milliseconds (default: 30000 = 30 seconds)
   */
  autoSaveInterval?: number;
  
  /**
   * Debounce delay for answer changes in milliseconds (default: 2000 = 2 seconds)
   */
  debounceDelay?: number;
  
  /**
   * Whether auto-save is enabled (default: true)
   */
  enabled?: boolean;
}

export const useTestAutoSave = ({
  sessionCode,
  studentId,
  answers,
  mobileState,
  autoSaveInterval = 30000, // 30 seconds
  debounceDelay = 2000, // 2 seconds
  enabled = true,
}: UseTestAutoSaveOptions): AutoSaveStatus => {
  
  const [status, setStatus] = useState<AutoSaveStatus['status']>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs to track state without causing re-renders
  const lastSavedAnswersRef = useRef<string>('');
  const lastSavedMobileStateRef = useRef<string>('');
  const lastSavedScrollStateRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const mobileStateRef = useRef<SavedMobileState | undefined>(mobileState);

  const scrollStateString = JSON.stringify({
    passageScrollByPassage: mobileState?.passageScrollByPassage ?? {},
    questionSheetScrollByPassage: mobileState?.questionSheetScrollByPassage ?? {},
  });

  const mobileStateWithoutScrollString = JSON.stringify(
    mobileState
      ? {
        ...mobileState,
        passageScrollByPassage: {},
        questionSheetScrollByPassage: {},
      }
      : null,
  );

  useEffect(() => {
    mobileStateRef.current = mobileState;
  }, [mobileState, mobileStateWithoutScrollString, scrollStateString]);

  const clearStatusResetTimer = useCallback(() => {
    if (statusResetTimeoutRef.current) {
      clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }
  }, []);

  const scheduleStatusReset = useCallback((delayMs: number, clearError = false) => {
    clearStatusResetTimer();
    statusResetTimeoutRef.current = setTimeout(() => {
      setStatus('idle');
      if (clearError) {
        setError(null);
      }
      statusResetTimeoutRef.current = null;
    }, delayMs);
  }, [clearStatusResetTimer]);

  const buildTransformedAnswers = useCallback(() => {
    const transformedAnswers: Record<string, any> = {};
    Object.entries(answers).forEach(([questionNum, answer]) => {
      transformedAnswers[questionNum] = {
        answer,
        timestamp: Date.now(),
      };
    });
    return transformedAnswers;
  }, [answers]);

  const persistUpdate = useCallback(async (payload: Record<string, unknown>) => {
    if (!enabled || !sessionCode || !studentId) {
      return false;
    }

    if (isSavingRef.current) {
      console.log('📝 [AutoSave] Save already in progress, skipping');
      return false;
    }

    try {
      isSavingRef.current = true;
      clearStatusResetTimer();
      setStatus('saving');
      setError(null);

      const studentRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(studentRef, payload);

      const now = Date.now();
      setLastSaved(now);
      setStatus('saved');
      scheduleStatusReset(2000);
      return true;
    } catch (err) {
      console.error('❌ [AutoSave] Failed to save answers:', err);
      const resolved = await resolveSessionMutationFailure(err, sessionCode);
      const errorMsg = resolved?.message ?? (err instanceof Error ? err.message : 'Unknown error');
      setError(errorMsg);
      setStatus('error');
      scheduleStatusReset(5000, true);
      throw err;
    } finally {
      isSavingRef.current = false;
    }
  }, [clearStatusResetTimer, enabled, scheduleStatusReset, sessionCode, studentId]);
  
  /**
   * Save answers to Firebase
   */
  const saveAnswers = useCallback(async () => {
    if (!enabled || !sessionCode || !studentId) {
      return;
    }
    const currentMobileState = mobileStateRef.current;
    
    // Serialize current answers for comparison
    const currentAnswersStr = JSON.stringify(answers);
    const currentMobileStateStr = mobileStateWithoutScrollString;
    
    // Skip if no changes since last save
    if (
      currentAnswersStr === lastSavedAnswersRef.current
      && currentMobileStateStr === lastSavedMobileStateRef.current
    ) {
      console.log('📝 [AutoSave] No changes detected, skipping save');
      return;
    }

    console.log(`📝 [AutoSave] Saving ${Object.keys(answers).length} answers to Firebase...`);

    const persisted = await persistUpdate({
      answers: buildTransformedAnswers(),
      ...(currentMobileState ? { mobileState: currentMobileState } : {}),
      lastAnswerUpdate: serverTimestamp(),
      lastActivity: Date.now(),
    });

    if (!persisted) {
      return;
    }

    // Update refs after the save succeeds
    lastSavedAnswersRef.current = currentAnswersStr;
    lastSavedMobileStateRef.current = currentMobileStateStr;
    if (currentMobileState) {
      lastSavedScrollStateRef.current = scrollStateString;
    }
  }, [
    answers,
    buildTransformedAnswers,
    enabled,
    mobileStateWithoutScrollString,
    persistUpdate,
    scrollStateString,
    sessionCode,
    studentId,
  ]);

  const saveMobileScrollState = useCallback(async () => {
    const currentMobileState = mobileStateRef.current;

    if (!enabled || !sessionCode || !studentId || !currentMobileState) {
      return;
    }

    const currentScrollState = scrollStateString;
    if (currentScrollState === lastSavedScrollStateRef.current) {
      return;
    }

    console.log('📝 [AutoSave] Saving debounced mobile scroll state...');

    const persisted = await persistUpdate({
      mobileState: currentMobileState,
      lastMobileStateUpdate: serverTimestamp(),
      lastActivity: Date.now(),
    });

    if (!persisted) {
      return;
    }

    lastSavedMobileStateRef.current = mobileStateWithoutScrollString;
    lastSavedScrollStateRef.current = currentScrollState;
  }, [
    enabled,
    mobileStateWithoutScrollString,
    persistUpdate,
    scrollStateString,
    sessionCode,
    studentId,
  ]);
  
  /**
   * Debounced save on answer changes
   */
  useEffect(() => {
    if (!enabled) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveAnswers();
    }, debounceDelay);
    
    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [answers, mobileStateWithoutScrollString, enabled, debounceDelay, saveAnswers]);

  /**
   * Debounced mobile scroll persistence.
   * Scroll maps change frequently, so persist them on their own cadence.
   */
  useEffect(() => {
    if (!enabled || !mobileState) return;

    if (scrollSaveTimeoutRef.current) {
      clearTimeout(scrollSaveTimeoutRef.current);
    }

    scrollSaveTimeoutRef.current = setTimeout(() => {
      void saveMobileScrollState();
    }, 500);

    return () => {
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }
    };
  }, [enabled, mobileStateWithoutScrollString, saveMobileScrollState, scrollStateString]);
  
  /**
   * Periodic auto-save interval
   */
  useEffect(() => {
    if (!enabled) return;
    
    console.log(`📝 [AutoSave] Starting auto-save with ${autoSaveInterval / 1000}s interval`);
    
    // Set up interval
    intervalRef.current = setInterval(() => {
      console.log('⏰ [AutoSave] Periodic auto-save triggered');
      saveAnswers();
    }, autoSaveInterval);
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('📝 [AutoSave] Auto-save interval cleared');
      }
    };
  }, [enabled, autoSaveInterval, saveAnswers]);
  
  /**
   * Save before page unload
   */
  useEffect(() => {
    if (!enabled) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there are unsaved changes
      const currentAnswersStr = JSON.stringify(answers);
      if (currentAnswersStr !== lastSavedAnswersRef.current) {
        e.preventDefault();
        e.returnValue = 'You have unsaved answers. Are you sure you want to leave?';
        
        // Try to save synchronously (best effort)
        saveAnswers();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, answers, saveAnswers]);
  
  /**
   * Save on visibility change (tab switch)
   */
  useEffect(() => {
    if (!enabled) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👁️ [AutoSave] Tab hidden, saving answers...');
        saveAnswers();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, saveAnswers]);

  useEffect(() => {
    return () => {
      clearStatusResetTimer();
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }
    };
  }, [clearStatusResetTimer]);
  
  return {
    status,
    lastSaved,
    error,
  };
};

/**
 * Format last saved time for display
 */
export const formatLastSaved = (lastSaved: number | null): string => {
  if (!lastSaved) return 'Not saved yet';
  
  const now = Date.now();
  const diff = now - lastSaved;
  
  if (diff < 5000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  
  return new Date(lastSaved).toLocaleTimeString();
};
