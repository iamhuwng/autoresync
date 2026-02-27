/**
 * useClassSession Hook
 * Real-time listener for class sessions with multi-test support
 */

import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
import type { ClassSession } from '../../types/session.types';

export interface UseClassSessionReturn {
  classData: ClassSession | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to subscribe to class session changes
 */
export function useClassSession(classId: string | undefined): UseClassSessionReturn {
  const [classData, setClassData] = useState<ClassSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!classId) {
      setError('No class ID provided');
      setLoading(false);
      return;
    }
    
    console.log(`📚 [ClassSession] Setting up listener for: ${classId}`);
    
    const classRef = ref(database, `game_sessions/${classId}`);
    const unsubscribe = onValue(classRef, (snapshot) => {
      if (!snapshot.exists()) {
        setError('Class not found');
        setLoading(false);
        return;
      }
      
      const data = snapshot.val() as ClassSession;
      console.log(`📚 [ClassSession] Data received, students:`, Object.keys(data.students || {}).length);
      
      setClassData(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('❌ [ClassSession] Firebase error:', err);
      setError(err.message);
      setLoading(false);
    });
    
    return () => {
      console.log(`📚 [ClassSession] Cleaning up listener`);
      unsubscribe();
    };
  }, [classId]);
  
  return { classData, loading, error };
}
