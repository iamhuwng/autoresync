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
  autoSaveInterval = 30000, // 30 seconds
  debounceDelay = 2000, // 2 seconds
  enabled = true,
}: UseTestAutoSaveOptions): AutoSaveStatus => {
  
  const [status, setStatus] = useState<AutoSaveStatus['status']>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs to track state without causing re-renders
  const lastSavedAnswersRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  
  /**
   * Save answers to Firebase
   */
  const saveAnswers = useCallback(async () => {
    if (!enabled || !sessionCode || !studentId) {
      return;
    }
    
    // Serialize current answers for comparison
    const currentAnswersStr = JSON.stringify(answers);
    
    // Skip if no changes since last save
    if (currentAnswersStr === lastSavedAnswersRef.current) {
      console.log('📝 [AutoSave] No changes detected, skipping save');
      return;
    }
    
    // Skip if already saving
    if (isSavingRef.current) {
      console.log('📝 [AutoSave] Save already in progress, skipping');
      return;
    }
    
    try {
      isSavingRef.current = true;
      setStatus('saving');
      setError(null);
      
      console.log(`📝 [AutoSave] Saving ${Object.keys(answers).length} answers to Firebase...`);
      
      // Transform answers to include metadata for teacher view
      const transformedAnswers: Record<string, any> = {};
      Object.entries(answers).forEach(([questionNum, answer]) => {
        transformedAnswers[questionNum] = {
          answer: answer,
          timestamp: Date.now(),
          // timeSpent will be calculated by test submission
        };
      });
      
      // Update Firebase
      const studentRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(studentRef, {
        answers: transformedAnswers,
        lastAnswerUpdate: serverTimestamp(),
        lastActivity: Date.now(),
      });
      
      // Update refs and state
      lastSavedAnswersRef.current = currentAnswersStr;
      const now = Date.now();
      setLastSaved(now);
      setStatus('saved');
      
      console.log(`✅ [AutoSave] Successfully saved at ${new Date(now).toLocaleTimeString()}`);
      
      // Reset status to idle after 2 seconds
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
      
    } catch (err) {
      console.error('❌ [AutoSave] Failed to save answers:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      setStatus('error');
      
      // Reset error status after 5 seconds
      setTimeout(() => {
        setStatus('idle');
        setError(null);
      }, 5000);
      
    } finally {
      isSavingRef.current = false;
    }
  }, [enabled, sessionCode, studentId, answers]);
  
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
  }, [answers, enabled, debounceDelay, saveAnswers]);
  
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
