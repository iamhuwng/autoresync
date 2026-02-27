/**
 * useParsingProgress Hook
 * 
 * Manages the state for parsing progress during test creation.
 * Provides stage tracking, progress updates, and error handling.
 * 
 * Features:
 * - Stage management (converting → extracting → classifying → validating)
 * - Progress percentage tracking
 * - Message updates
 * - Error state handling
 * - Time estimation
 * - Checkpoint support
 * 
 * @module useParsingProgress
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.8
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import type { ParsingStage } from '../components/test-creation/ParsingProgressScreen';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ParsingProgressState {
    /** Current parsing stage */
    stage: ParsingStage;
    /** Progress percentage (0-100) */
    progress: number;
    /** Current status message */
    message: string;
    /** Error message if stage is 'error' */
    error?: string;
    /** Whether a checkpoint exists */
    hasCheckpoint: boolean;
    /** Estimated time remaining in seconds */
    estimatedTimeRemaining?: number;
    /** Whether parsing is in progress */
    isParsing: boolean;
}

export interface ParsingProgressActions {
    /** Start parsing */
    startParsing: () => void;
    /** Set current stage */
    setStage: (stage: ParsingStage) => void;
    /** Update progress (0-100) */
    setProgress: (progress: number) => void;
    /** Update message */
    setMessage: (message: string) => void;
    /** Set error state */
    setError: (error: string) => void;
    /** Mark parsing complete */
    complete: () => void;
    /** Reset to initial state */
    reset: () => void;
    /** Save checkpoint */
    saveCheckpoint: () => void;
    /** Clear checkpoint */
    clearCheckpoint: () => void;
    /** Resume from saved checkpoint */
    resumeFromCheckpoint: () => boolean;
    /** Get checkpoint data without resuming */
    getCheckpoint: () => CheckpointData | null;
}

/** Checkpoint data structure */
export interface CheckpointData {
    stage: ParsingStage;
    progress: number;
    message: string;
    timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGE_PROGRESS_RANGES: Record<Exclude<ParsingStage, 'complete' | 'error'>, [number, number]> = {
    converting: [0, 25],
    extracting: [25, 60],
    classifying: [60, 85],
    validating: [85, 100],
};

const STAGE_MESSAGES: Record<Exclude<ParsingStage, 'complete' | 'error'>, string> = {
    converting: 'Extracting text from document...',
    extracting: 'AI analyzing passages and questions...',
    classifying: 'Identifying question types...',
    validating: 'Checking completeness and accuracy...',
};

const CHECKPOINT_KEY = 'test-creation-checkpoint';

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

export function useParsingProgress(): [ParsingProgressState, ParsingProgressActions] {
    // State
    const [stage, setStageState] = useState<ParsingStage>('converting');
    const [progress, setProgressState] = useState(0);
    const [message, setMessageState] = useState('');
    const [error, setErrorState] = useState<string | undefined>();
    const [hasCheckpoint, setHasCheckpoint] = useState(() => {
        try {
            return !!localStorage.getItem(CHECKPOINT_KEY);
        } catch {
            return false;
        }
    });
    const [isParsing, setIsParsing] = useState(false);

    // Refs for time estimation
    const startTimeRef = useRef<number | null>(null);
    const stageStartTimeRef = useRef<number | null>(null);

    // Calculate estimated time remaining
    const estimatedTimeRemaining = useMemo(() => {
        if (!startTimeRef.current || !isParsing || progress === 0) return undefined;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const rate = progress / elapsed;

        if (rate <= 0) return undefined;

        const remaining = (100 - progress) / rate;
        return Math.max(0, remaining);
    }, [progress, isParsing]);

    // ─────────────────────────────────────────────────────────────
    // ACTIONS
    // ─────────────────────────────────────────────────────────────

    const startParsing = useCallback(() => {
        setStageState('converting');
        setProgressState(0);
        setMessageState(STAGE_MESSAGES.converting);
        setErrorState(undefined);
        setIsParsing(true);
        startTimeRef.current = Date.now();
        stageStartTimeRef.current = Date.now();
    }, []);

    const setStage = useCallback((newStage: ParsingStage) => {
        setStageState(newStage);
        stageStartTimeRef.current = Date.now();

        if (newStage !== 'complete' && newStage !== 'error') {
            const [minProgress] = STAGE_PROGRESS_RANGES[newStage];
            setProgressState(minProgress);
            setMessageState(STAGE_MESSAGES[newStage]);
        }
    }, []);

    const setProgress = useCallback((newProgress: number) => {
        const clampedProgress = Math.min(100, Math.max(0, newProgress));
        setProgressState(clampedProgress);
    }, []);

    const setMessage = useCallback((newMessage: string) => {
        setMessageState(newMessage);
    }, []);

    const setError = useCallback((errorMessage: string) => {
        setStageState('error');
        setErrorState(errorMessage);
        setIsParsing(false);
    }, []);

    const complete = useCallback(() => {
        setStageState('complete');
        setProgressState(100);
        setMessageState('Parsing complete!');
        setIsParsing(false);
        startTimeRef.current = null;

        // Clear checkpoint on successful completion
        try {
            localStorage.removeItem(CHECKPOINT_KEY);
            setHasCheckpoint(false);
        } catch {
            // Ignore storage errors
        }
    }, []);

    const reset = useCallback(() => {
        setStageState('converting');
        setProgressState(0);
        setMessageState('');
        setErrorState(undefined);
        setIsParsing(false);
        startTimeRef.current = null;
        stageStartTimeRef.current = null;
    }, []);

    const saveCheckpoint = useCallback(() => {
        try {
            const checkpoint = {
                stage,
                progress,
                message,
                timestamp: Date.now(),
            };
            localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
            setHasCheckpoint(true);
        } catch {
            console.warn('Failed to save checkpoint');
        }
    }, [stage, progress, message]);

    const clearCheckpoint = useCallback(() => {
        try {
            localStorage.removeItem(CHECKPOINT_KEY);
            setHasCheckpoint(false);
        } catch {
            // Ignore storage errors
        }
    }, []);

    const getCheckpoint = useCallback((): CheckpointData | null => {
        try {
            const saved = localStorage.getItem(CHECKPOINT_KEY);
            if (!saved) return null;

            const checkpoint = JSON.parse(saved) as CheckpointData;

            // Check if checkpoint is expired (24 hours)
            const expirationTime = 24 * 60 * 60 * 1000; // 24 hours in ms
            if (Date.now() - checkpoint.timestamp > expirationTime) {
                localStorage.removeItem(CHECKPOINT_KEY);
                setHasCheckpoint(false);
                return null;
            }

            return checkpoint;
        } catch {
            return null;
        }
    }, []);

    const resumeFromCheckpoint = useCallback((): boolean => {
        const checkpoint = getCheckpoint();

        if (!checkpoint) {
            return false;
        }

        // Restore state from checkpoint
        if (checkpoint.stage !== 'complete' && checkpoint.stage !== 'error') {
            setStageState(checkpoint.stage);
            setProgressState(checkpoint.progress);
            setMessageState(checkpoint.message || STAGE_MESSAGES[checkpoint.stage]);
            setIsParsing(true);
            startTimeRef.current = Date.now();
            stageStartTimeRef.current = Date.now();

            console.log(`[useParsingProgress] Resumed from checkpoint: stage=${checkpoint.stage}, progress=${checkpoint.progress}%`);
            return true;
        }

        return false;
    }, [getCheckpoint]);

    // ─────────────────────────────────────────────────────────────
    // RETURN
    // ─────────────────────────────────────────────────────────────

    const state: ParsingProgressState = {
        stage,
        progress,
        message,
        error,
        hasCheckpoint,
        estimatedTimeRemaining,
        isParsing,
    };

    const actions: ParsingProgressActions = {
        startParsing,
        setStage,
        setProgress,
        setMessage,
        setError,
        complete,
        reset,
        saveCheckpoint,
        clearCheckpoint,
        resumeFromCheckpoint,
        getCheckpoint,
    };

    return [state, actions];
}

export default useParsingProgress;
