/**
 * useTestData Hook
 * Handles loading test data from Firebase
 */

import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TestData } from '../../services/testStorage';
import { getTestFromFirebase } from '../../services/testStorage';
import { sessionService } from '../../services/sessionService';
import { stripAnswerKeys, extractAnswerKeys } from '../../utils/answerKeyHelper'; // PRD-0036 Task 9
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
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
  /**
   * PRD-0036 Task 9.2: Ref containing the ORIGINAL questions array
   * (with answer keys). Use this for grading — NOT testData.questions
   * which has answers stripped for DevTools obfuscation.
   */
  questionsWithAnswersRef: MutableRefObject<TestData['questions'] | null>;
  /**
   * PRD-0036 Task 9.3: Pre-extracted answer key map.
   * Keyed by question number (as string). Only populated when testData loads.
   */
  answerKeysRef: MutableRefObject<Record<string, string | string[]> | null>;
  // Callbacks for component to handle navigation
  onTestCleared?: () => void;
  onAuthFailed?: () => void;
  onNoTestSelected?: () => void;
}

export const useTestData = ({ sessionCode }: UseTestDataOptions): UseTestDataReturn => {
  const [testData, setTestData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);

  // Use ref to track testData without causing re-subscriptions
  const testDataRef = useRef<TestData | null>(null);
  testDataRef.current = testData;

  // Track loaded testId to prevent redundant loads
  const loadedTestIdRef = useRef<string | null>(null);

  // PRD-0036 Task 9.2: Store original questions with answer keys in a ref (not state)
  const questionsWithAnswersRef = useRef<TestData['questions'] | null>(null);
  const answerKeysRef = useRef<Record<string, string | string[]> | null>(null);

  // Real-time monitoring: Load test when testId appears or clear when removed
  // CRITICAL FIX: This listener now handles BOTH directions:
  // 1. Teacher starts test (testId appears) → load test data
  // 2. Teacher ends test (testId cleared) → clear test data
  useEffect(() => {
    // 1. Validation Logic
    const playerId = sessionService.getPlayerId();
    const playerName = sessionService.getPlayerName();
    const storedSessionCode = sessionService.getSessionCode();

    // Check authentication
    if (!playerId || !playerName || (storedSessionCode && storedSessionCode !== sessionCode)) {
      console.warn('Student accessing test without proper authentication');
      if (storedSessionCode !== sessionCode) {
        console.warn(`Session mismatch: Stored ${storedSessionCode} vs Param ${sessionCode}`);
      }

      // Allow if strictly just session code is missing in storage but present in URL? 
      // No, strictly follow existing logic: if auth fails, error out.
      // But strictly, we should probably allow re-hydrating from just URL if we are loose, 
      // but existing code was strict. We keep strictness but use error state.
      // sessionService.clearSession(); // Optional: maybe don't clear, just deny access
      setError('Authentication required');
      setLoading(false);
      return;
    }

    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }

    // 2. Setup Realtime Listener
    console.log(`🎧 [TestData] Connecting to session: ${sessionCode}`);
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);

    const unsubscribe = onValue(sessionRef, async (snapshot: any) => {
      // Handle session not found
      if (!snapshot.exists()) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      const sessionData = snapshot.val();
      const testId = sessionData.testId;

      // Case 1: No test assigned or test cleared
      if (!testId) {
        console.log('📍 [TestData] No test currently active in session');

        // If we had a test before, clear it
        if (testDataRef.current) {
          console.log('⚠️ [TestData] Test ended by teacher');
          setTestData(null);
          loadedTestIdRef.current = null;
        }

        setLoading(false);
        return;
      }

      // Case 2: New Test ID detected (or initial load)
      if (testId !== loadedTestIdRef.current) {
        console.log(`📖 [TestData] Test content detected (${testId}) - fetching...`);
        // Keep loading true while fetching test content
        // If this is initial load, loading is already true.
        // If this is a switch, we might want to show loading.

        try {
          const result = await getTestFromFirebase(testId);

          if (result.success && result.data) {
            // PRD-0036 Task 9.2: Save original questions with answers in ref
            questionsWithAnswersRef.current = result.data.questions;
            answerKeysRef.current = extractAnswerKeys(
              result.data.questions.map(q => ({ id: String(q.number), ...q }))
            );

            // Strip answer keys from questions before putting in state
            // This prevents casual inspection via React DevTools
            const strippedQuestions = stripAnswerKeys(result.data.questions);
            const obfuscatedData: TestData = {
              ...result.data,
              questions: strippedQuestions,
            };

            setTestData(obfuscatedData);
            loadedTestIdRef.current = testId;

            // Set active passage
            if (result.data.passages && result.data.passages.length > 0 && result.data.passages[0]) {
              setActivePassageId(result.data.passages[0].id);
            }

            console.log('✅ [TestData] Test content loaded');
          } else {
            console.error('❌ [TestData] Failed to load test content:', result.error);
            setError(result.error || 'Failed to load test');
          }
        } catch (err) {
          console.error('❌ [TestData] Error loading test:', err);
          setError('Failed to load test');
        } finally {
          setLoading(false);
        }
      } else {
        // Test ID hasn't changed, ensure loading is false
        setLoading(false);
      }
    }, (error) => {
      console.error("Firebase read failed", error);
      setError("Connection failed");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sessionCode]);

  return {
    testData,
    loading,
    error,
    activePassageId,
    setActivePassageId,
    questionsWithAnswersRef,
    answerKeysRef,
  };
};
