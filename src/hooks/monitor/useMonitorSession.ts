/**
 * useMonitorSession Hook
 * 
 * Custom hook for real-time monitoring of test sessions in the teacher interface.
 * Handles Firebase session listening, student data processing, and test metadata loading.
 * 
 * @module hooks/monitor/useMonitorSession
 */

import { useState, useEffect, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file without type declarations
import { database } from '../../services/firebase';
import { transformPlayerToStudentProgress, StudentProgress } from '../../utils/monitor';

export interface TestSession {
  testId?: string;
  createdAt: number;
  status: string;
  startTime?: number;
  isPaused?: boolean;
  pausedAt?: number;
  resumedAt?: number;
  totalPausedDuration?: number;
  players?: Record<string, any>;

  /** PRD-0019: Has base test time expired (students without extra time submitted) */
  baseTimeExpired?: boolean;

  /** PRD-0019: When base test time expired */
  baseTimeExpiredAt?: number | null;

  [key: string]: any;
}

export interface TestData {
  title: string;
  type: string;
  skill: string;
  duration: number;
  questionCount: number;
  audioSections?: Array<{
    number: number;
    name: string;
    audioUrl?: string;
    streamUrl?: string;
    assetId?: string;
    versionId?: string;
    duration?: number;
  }>;
}

export interface MonitorSessionResult {
  session: TestSession | null;
  students: StudentProgress[];
  testData: TestData | null;
  fullTestData: any;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook for monitoring test sessions in real-time.
 * 
 * Features:
 * - Real-time Firebase listener for session updates
 * - Automatic student data processing with status determination
 * - Test metadata loading when testId changes
 * - Error handling and loading states
 * - Automatic cleanup on unmount
 * 
 * @param sessionCode - The unique session code to monitor
 * @returns MonitorSessionResult object with session data and state
 * 
 * @example
 * ```typescript
 * const { session, students, testData, loading, error } = useMonitorSession(sessionCode);
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * 
 * return (
 *   <div>
 *     <h1>{testData?.title}</h1>
 *     {students.map(student => <StudentCard key={student.studentId} student={student} />)}
 *   </div>
 * );
 * ```
 */
export function useMonitorSession(sessionCode: string | undefined): MonitorSessionResult {
  const [session, setSession] = useState<TestSession | null>(null);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [fullTestData, setFullTestData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to store test data for use in student transformation without triggering re-renders
  const testDataRef = useRef<TestData | null>(null);

  // Update ref when testData changes
  useEffect(() => {
    testDataRef.current = testData;
  }, [testData]);

  /**
   * Session Firebase listener
   * Monitors session changes and processes student data in real-time
   */
  useEffect(() => {
    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }

    console.log(`📊 [Monitor] Setting up session listener for: ${sessionCode}`);

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      console.log(`📊 [Monitor] Session data received, players count:`, data.players ? Object.keys(data.players).length : 0);

      setSession(data);

      // Process student data using our utility function
      if (data.players) {
        const studentList = Object.entries(data.players).map(([id, player]: [string, any]) => {
          return transformPlayerToStudentProgress(
            id,
            player,
            testDataRef.current?.questionCount || 40,
            data.createdAt
          );
        });

        // Sort by progress (descending)
        studentList.sort((a, b) => b.progress - a.progress);
        setStudents(studentList);
      } else {
        setStudents([]);
      }

      setLoading(false);
    }, (listenerError) => {
      console.warn('⚠️ [Monitor] Session unavailable:', listenerError);
      setSession(null);
      setStudents([]);
      setTestData(null);
      setFullTestData(null);
      setError('Session not found or no longer available');
      setLoading(false);
    });

    return () => {
      console.log(`📊 [Monitor] Cleaning up session listener`);
      unsubscribe();
    };
  }, [sessionCode]);

  /**
   * Test data loader
   * Loads test metadata when session.testId changes
   */
  useEffect(() => {
    // Only fetch if we have a testId
    const testId = session?.testId;
    if (!testId) {
      if (!loading && session && !testId) {
        // Session loaded but no testId? This implies empty session or cleared test.
        // We don't fetch test data.
        setTestData(null);
      }
      return;
    }

    // Don't refetch if we already have data for this testId
    if (testDataRef.current && session?.testId === fullTestData?.id) {
      return;
    }

    console.log(`📊 [Monitor] Loading test data for testId: ${testId}`);

    // Explicitly set loading if switching tests (optional, handled by page)
    // But we don't set global loading=true to avoid full screen flicker if partial update

    import('../../services/firebaseQueryOptimizer').then(({ default: queryOptimizer }) => {
      queryOptimizer.getTest(testId).then((data) => {
        if (data) {
          // Store full test data for re-marking and detailed operations
          setFullTestData(data);

          // PRD-0028: THCS tests use a different data structure
          const isTHCS = data.testType === 'THCS-THPT';

          // Store summary test data for display
          const summaryData: TestData = isTHCS ? {
            // THCS test: metadata nested under data.metadata
            title: data.metadata?.title || 'Untitled Test',
            type: 'THCS-THPT',
            skill: 'Mixed',
            duration: data.metadata?.duration || 60,
            questionCount: data.questionCount ||
              (data.sections?.reduce((sum: number, s: any) => sum + (s.questions?.length || 0), 0)) || 40,
          } : {
            // IELTS test: flat structure
            title: data.title || 'Untitled Test',
            type: data.type || 'test',
            skill: data.skill || 'reading',
            duration: data.duration || 60,
            questionCount: data.questionCount || data.questions?.length || 40,
            audioSections: data.audioSections || undefined,
          };

          setTestData(summaryData);

          console.log(`✅ [Monitor] Test data loaded (${isTHCS ? 'THCS' : 'IELTS'}):`, summaryData.title);
        } else {
          console.error('❌ [Monitor] Test not found');
          setError('Test not found');
        }
      }).catch((err) => {
        console.error('❌ [Monitor] Error loading test data:', err);
        setError('Failed to load test data');
      });
    });
  }, [session?.testId]); // Only Re-run when testId changes, NOT every session update

  return {
    session,
    students,
    testData,
    fullTestData,
    loading,
    error,
  };
}
