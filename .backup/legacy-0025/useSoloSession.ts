/**
 * useSoloSession Hook
 * PRD-0016: Solo Study & Homework System
 * 
 * React hook for managing solo test session state.
 * Handles timer, auto-save, answer tracking, and submission.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    createSoloSession,
    getSoloSession,
    updateSoloSession,
    completeSoloSession,
    abandonSoloSession,
    pauseSoloSession,
    resumeSoloSession
} from '../services/soloSessionManager';
import type { SoloSession, ResultContext } from '../types/solo.types';

interface UseSoloSessionOptions {
    /** Student ID */
    studentId: string;

    /** Material ID to practice */
    materialId: string;

    /** Result context */
    context: Omit<ResultContext, 'configApplied'>;

    /** Auto-save interval in seconds (default: 30) */
    autoSaveInterval?: number;

    /** Whether to auto-submit when timer expires */
    autoSubmitOnTimeout?: boolean;
}

interface UseSoloSessionReturn {
    // Session data
    session: SoloSession | null;
    isLoading: boolean;
    error: string | null;

    // Timer
    timeRemaining: number | null;
    isTimerActive: boolean;

    // Answers
    answers: Record<string, any>;
    setAnswer: (questionNumber: number, answer: any) => void;
    clearAnswer: (questionNumber: number) => void;

    // Navigation
    currentQuestion: number;
    setCurrentQuestion: (questionNumber: number) => void;
    nextQuestion: () => void;
    prevQuestion: () => void;

    // Session control
    pauseSession: () => Promise<void>;
    resumeSession: () => Promise<void>;
    submitSession: () => Promise<string>;
    abandonSession: () => Promise<void>;

    // Status
    isSubmitting: boolean;
    isCompleted: boolean;
    resultId: string | null;
}

/**
 * Hook for managing a solo test session
 */
export function useSoloSession({
    studentId,
    materialId,
    context,
    autoSaveInterval = 30,
    autoSubmitOnTimeout = true
}: UseSoloSessionOptions): UseSoloSessionReturn {

    // State
    const [session, setSession] = useState<SoloSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [isTimerActive, setIsTimerActive] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [resultId, setResultId] = useState<string | null>(null);

    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastSaveRef = useRef<number>(Date.now());
    const sessionInitializedRef = useRef(false);

    /**
     * Initialize session on mount
     */
    useEffect(() => {
        // Guard against React strict mode double-mount creating two sessions
        if (sessionInitializedRef.current) return;
        sessionInitializedRef.current = true;

        const initSession = async () => {
            setIsLoading(true);
            setError(null);

            try {
                console.log('🚀 Initializing solo session...');

                const newSession = await createSoloSession(studentId, materialId, context);
                setSession(newSession);
                setAnswers(newSession.answers || {});
                setCurrentQuestion(newSession.currentQuestion || 0);

                // Initialize timer if configured
                if (newSession.config.timerMinutes) {
                    setTimeRemaining(newSession.config.timerMinutes * 60);
                }

                console.log('✅ Solo session initialized:', newSession.id);

            } catch (err) {
                console.error('❌ Error initializing session:', err);
                setError(err instanceof Error ? err.message : 'Failed to initialize session');
            } finally {
                setIsLoading(false);
            }
        };

        initSession();

        // Cleanup on unmount
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
            if (autoSaveIntervalRef.current) {
                clearInterval(autoSaveIntervalRef.current);
            }
        };
    }, [studentId, materialId, context]);

    /**
     * Timer countdown
     */
    useEffect(() => {
        if (!session || timeRemaining === null || !isTimerActive || isCompleted) {
            return;
        }

        timerIntervalRef.current = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev === null || prev <= 0) {
                    // Time's up!
                    if (autoSubmitOnTimeout) {
                        console.log('⏰ Time expired, auto-submitting...');
                        submitSession();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        };
    }, [session, timeRemaining, isTimerActive, isCompleted, autoSubmitOnTimeout]);

    /**
     * Auto-save answers periodically
     */
    useEffect(() => {
        if (!session || isCompleted) {
            return;
        }

        autoSaveIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const timeSinceLastSave = (now - lastSaveRef.current) / 1000;

            if (timeSinceLastSave >= autoSaveInterval) {
                saveProgress();
                lastSaveRef.current = now;
            }
        }, 5000); // Check every 5 seconds

        return () => {
            if (autoSaveIntervalRef.current) {
                clearInterval(autoSaveIntervalRef.current);
            }
        };
    }, [session, answers, currentQuestion, isCompleted, autoSaveInterval]);

    /**
     * Save progress to Firebase
     */
    const saveProgress = useCallback(async () => {
        if (!session) return;

        try {
            const timeSpent = Math.floor((Date.now() - session.startedAt) / 1000);

            await updateSoloSession(session.id, {
                answers,
                currentQuestion,
                timeSpent,
                timeRemaining: timeRemaining ?? null
            });

            console.log('💾 Progress auto-saved');

        } catch (err) {
            console.error('❌ Error saving progress:', err);
        }
    }, [session, answers, currentQuestion, timeRemaining]);

    /**
     * Set answer for a question
     */
    const setAnswer = useCallback((questionNumber: number, answer: any) => {
        setAnswers((prev) => ({
            ...prev,
            [questionNumber]: answer
        }));
    }, []);

    /**
     * Clear answer for a question
     */
    const clearAnswer = useCallback((questionNumber: number) => {
        setAnswers((prev) => {
            const newAnswers = { ...prev };
            delete newAnswers[questionNumber];
            return newAnswers;
        });
    }, []);

    /**
     * Navigate to next question
     */
    const nextQuestion = useCallback(() => {
        if (!session) return;

        setCurrentQuestion((prev) =>
            Math.min(prev + 1, session.totalQuestions - 1)
        );
    }, [session]);

    /**
     * Navigate to previous question
     */
    const prevQuestion = useCallback(() => {
        setCurrentQuestion((prev) => Math.max(prev - 1, 0));
    }, []);

    /**
     * Pause session
     */
    const pauseSession = useCallback(async () => {
        if (!session) return;

        try {
            await saveProgress(); // Save before pausing
            await pauseSoloSession(session.id);
            setIsTimerActive(false);

            setSession((prev) => prev ? { ...prev, status: 'paused' } : null);
            console.log('⏸️ Session paused');

        } catch (err) {
            console.error('❌ Error pausing session:', err);
            throw err;
        }
    }, [session, saveProgress]);

    /**
     * Resume session
     */
    const resumeSession = useCallback(async () => {
        if (!session) return;

        try {
            await resumeSoloSession(session.id);
            setIsTimerActive(true);

            setSession((prev) => prev ? { ...prev, status: 'active' } : null);
            console.log('▶️ Session resumed');

        } catch (err) {
            console.error('❌ Error resuming session:', err);
            throw err;
        }
    }, [session]);

    /**
     * Submit session and get results
     */
    const submitSession = useCallback(async (): Promise<string> => {
        if (!session || isSubmitting) {
            throw new Error('Cannot submit session');
        }

        setIsSubmitting(true);

        try {
            console.log('📤 Submitting session...');

            // Save final progress
            await saveProgress();

            // Complete session and get result ID
            const resultId = await completeSoloSession(session.id, answers);

            setIsCompleted(true);
            setResultId(resultId);
            setIsTimerActive(false);

            console.log('✅ Session submitted, result ID:', resultId);
            return resultId;

        } catch (err) {
            console.error('❌ Error submitting session:', err);
            throw err;
        } finally {
            setIsSubmitting(false);
        }
    }, [session, answers, isSubmitting, saveProgress]);

    /**
     * Abandon session
     */
    const abandonSession = useCallback(async () => {
        if (!session) return;

        try {
            await abandonSoloSession(session.id);
            setIsCompleted(true);
            setIsTimerActive(false);

            console.log('⚠️ Session abandoned');

        } catch (err) {
            console.error('❌ Error abandoning session:', err);
            throw err;
        }
    }, [session]);

    return {
        // Session data
        session,
        isLoading,
        error,

        // Timer
        timeRemaining,
        isTimerActive,

        // Answers
        answers,
        setAnswer,
        clearAnswer,

        // Navigation
        currentQuestion,
        setCurrentQuestion,
        nextQuestion,
        prevQuestion,

        // Session control
        pauseSession,
        resumeSession,
        submitSession,
        abandonSession,

        // Status
        isSubmitting,
        isCompleted,
        resultId
    };
}

/**
 * Hook for resuming an existing session
 */
export function useExistingSoloSession(sessionId: string) {
    const [session, setSession] = useState<SoloSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadSession = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const loadedSession = await getSoloSession(sessionId);

                if (!loadedSession) {
                    throw new Error('Session not found');
                }

                setSession(loadedSession);

            } catch (err) {
                console.error('❌ Error loading session:', err);
                setError(err instanceof Error ? err.message : 'Failed to load session');
            } finally {
                setIsLoading(false);
            }
        };

        if (sessionId) {
            loadSession();
        }
    }, [sessionId]);

    return { session, isLoading, error };
}
