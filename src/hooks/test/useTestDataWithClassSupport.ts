/**
 * useTestDataWithClassSupport Hook
 * Enhanced version of useTestData that supports both:
 * 1. Old session-based tests (single test per session)
 * 2. New class-based tests (multiple tests per class, student assignment)
 */

import { useState, useEffect } from 'react';
import type { TestData } from '../../services/testStorage';
import { getTestFromFirebase } from '../../services/testStorage';
import { sessionService } from '../../services/sessionService';
// @ts-ignore
import { database } from '../../services/firebase';
// @ts-ignore
import { ref, get, onValue } from 'firebase/database';

interface UseTestDataOptions {
  sessionCode: string | undefined;
}

interface UseTestDataReturn {
  testData: TestData | null;
  loading: boolean;
  error: string | null;
  activePassageId: string | null;
  setActivePassageId: (id: string | null) => void;
  /** Whether this is a class (new) vs session (old) */
  isClass: boolean;
  /** Student's assigned test ID in class mode */
  assignedTestId: string | null;
}

/**
 * Smart hook that detects session type and routes accordingly
 */
export const useTestDataWithClassSupport = ({ 
  sessionCode 
}: UseTestDataOptions): UseTestDataReturn => {
  const [testData, setTestData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [isClass, setIsClass] = useState(false);
  const [assignedTestId, setAssignedTestId] = useState<string | null>(null);

  // Real-time monitoring for test changes
  useEffect(() => {
    if (!sessionCode) return;

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    
    const unsubscribe = onValue(sessionRef, (snapshot: any) => {
      if (snapshot.exists()) {
        const sessionData = snapshot.val();
        
        // Detect if this is a class (has activeTests) or old session (has testId)
        const hasActiveTests = sessionData.activeTests && Object.keys(sessionData.activeTests).length > 0;
        const hasDirectTestId = !!sessionData.testId;
        
        if (hasActiveTests) {
          // New class architecture - check student assignment
          const playerId = sessionService.getPlayerId();
          if (playerId && sessionData.students?.[playerId]) {
            const studentTestId = sessionData.students[playerId].assignedTestId;
            setAssignedTestId(studentTestId);
            
            if (!studentTestId) {
              // Student not assigned yet
              setTestData(null);
            }
          }
        } else if (!hasDirectTestId && testData) {
          // Old architecture - test ended
          console.log('⚠️ Test ID cleared - test has ended');
          setTestData(null);
        }
      }
    });

    return () => unsubscribe();
  }, [sessionCode, testData]);

  // Initial load
  useEffect(() => {
    const loadTest = async () => {
      // Authentication check
      const playerId = sessionService.getPlayerId();
      const playerName = sessionService.getPlayerName();
      const storedSessionCode = sessionService.getSessionCode();
      
      if (!playerId || !playerName || storedSessionCode !== sessionCode) {
        console.warn('Student accessing test without proper authentication');
        sessionService.clearSession();
        setError('Authentication required');
        setLoading(false);
        return;
      }
      
      if (!sessionCode) {
        setError('No session code provided');
        setLoading(false);
        return;
      }
      
      try {
        // Fetch session/class data
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const sessionSnapshot = await get(sessionRef);
        
        if (!sessionSnapshot.exists()) {
          setError('Session not found');
          setLoading(false);
          return;
        }
        
        const sessionData = sessionSnapshot.val();
        
        // DETECTION: Is this a class or old session?
        const hasActiveTests = sessionData.activeTests && Object.keys(sessionData.activeTests).length > 0;
        const hasDirectTestId = !!sessionData.testId;
        
        let testIdToLoad: string | null = null;
        
        if (hasActiveTests) {
          // NEW CLASS ARCHITECTURE
          console.log('📚 [TestData] Detected CLASS architecture');
          setIsClass(true);
          
          // Get student's assigned test
          const student = sessionData.students?.[playerId];
          if (!student) {
            setError('Student not in this class');
            setLoading(false);
            return;
          }
          
          testIdToLoad = student.assignedTestId;
          setAssignedTestId(testIdToLoad);
          
          if (!testIdToLoad) {
            console.log('📍 Student not assigned to any test yet');
            setTestData(null);
            setLoading(false);
            return;
          }
        } else if (hasDirectTestId) {
          // OLD SESSION ARCHITECTURE
          console.log('📝 [TestData] Detected OLD SESSION architecture');
          setIsClass(false);
          testIdToLoad = sessionData.testId;
        } else {
          // No test selected yet
          console.log('📍 No test selected yet');
          setTestData(null);
          setLoading(false);
          return;
        }
        
        // Load the test
        if (!testIdToLoad) {
          setError('No test ID available');
          setLoading(false);
          return;
        }
        
        console.log(`📖 [TestData] Loading test: ${testIdToLoad}`);
        const result = await getTestFromFirebase(testIdToLoad);
        
        if (result.success && result.data) {
          setTestData(result.data);
          
          // Set active passage to first one
          if (result.data.passages && result.data.passages.length > 0 && result.data.passages[0]) {
            setActivePassageId(result.data.passages[0].id);
          }
          
          console.log('✅ [TestData] Test loaded successfully');
        } else {
          setError(result.error || 'Failed to load test');
        }
      } catch (err) {
        console.error('❌ [TestData] Error loading test:', err);
        setError('Failed to load test');
      } finally {
        setLoading(false);
      }
    };
    
    loadTest();
  }, [sessionCode]);

  return {
    testData,
    loading,
    error,
    activePassageId,
    setActivePassageId,
    isClass,
    assignedTestId,
  };
};
