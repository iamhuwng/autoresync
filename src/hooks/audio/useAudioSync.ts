/**
 * useAudioSync Hook
 * 
 * Calculates drift between student's audio position and teacher's master state.
 * Triggers automatic sync corrections when drift exceeds threshold (1 second).
 * 
 * @see PRD-0018: Unified Audio Architecture - Online Mode Student Sync
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MasterAudioState } from '../../types/audio.types';

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum acceptable drift in seconds before triggering sync */
const DRIFT_THRESHOLD_SECONDS = 1.0;

/** Duration to show "Syncing..." indicator after correction */
const SYNC_INDICATOR_DURATION_MS = 500;

/** Interval for checking drift (in milliseconds) */
const DRIFT_CHECK_INTERVAL_MS = 500;

/** Time without master updates before considering teacher disconnected */
const TEACHER_DISCONNECT_THRESHOLD_MS = 10000;

// ============================================================
// TYPES
// ============================================================

export interface UseAudioSyncOptions {
    /** Reference to the audio element */
    audioRef: React.RefObject<HTMLAudioElement>;

    /** Current master audio state from teacher */
    masterState: MasterAudioState | null;

    /** Whether we're in online mode (sync enabled) */
    isOnlineMode: boolean;

    /** Whether sync is enabled (can be disabled for debugging) */
    enabled?: boolean;

    /** Callback when sync correction happens */
    onSync?: (fromPosition: number, toPosition: number) => void;
}

export interface UseAudioSyncReturn {
    /** Current drift from teacher position in seconds */
    drift: number;

    /** Whether currently performing a sync correction */
    isSyncing: boolean;

    /** Timestamp of last successful sync */
    lastSyncTime: number;

    /** Whether teacher appears disconnected (no updates for 10+ seconds) */
    isTeacherDisconnected: boolean;

    /** Calculate expected position based on master state */
    calculateExpectedPosition: () => number | null;

    /** Manually trigger a sync to master position */
    forceSync: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useAudioSync({
    audioRef,
    masterState,
    isOnlineMode,
    enabled = true,
    onSync,
}: UseAudioSyncOptions): UseAudioSyncReturn {
    const [drift, setDrift] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState(0);
    const [isTeacherDisconnected, setIsTeacherDisconnected] = useState(false);

    // Track last master state update for disconnect detection
    const lastMasterUpdateRef = useRef<number>(0);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Calculate expected position based on master state and elapsed time.
     * Uses the master's position + time elapsed since broadcast * speed.
     */
    const calculateExpectedPosition = useCallback((): number | null => {
        if (!masterState || !masterState.isPlaying) {
            return masterState?.position ?? null;
        }

        const now = Date.now();
        const elapsedMs = now - masterState.timestamp;
        const elapsedSeconds = elapsedMs / 1000;

        // Expected position = master position + (elapsed time * speed)
        const expectedPosition = masterState.position + (elapsedSeconds * masterState.speed);

        return expectedPosition;
    }, [masterState]);

    /**
     * Perform sync correction - seek audio to expected position.
     */
    const performSync = useCallback((expectedPosition: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const currentPosition = audio.currentTime;

        console.log(`🔄 [AudioSync] Syncing from ${currentPosition.toFixed(1)}s to ${expectedPosition.toFixed(1)}s`);

        setIsSyncing(true);

        // Seek to expected position
        audio.currentTime = expectedPosition;
        setLastSyncTime(Date.now());

        // Call callback
        onSync?.(currentPosition, expectedPosition);

        // Clear syncing indicator after delay
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = setTimeout(() => {
            setIsSyncing(false);
        }, SYNC_INDICATOR_DURATION_MS);
    }, [audioRef, onSync]);

    /**
     * Force sync to current master position.
     */
    const forceSync = useCallback(() => {
        const expectedPosition = calculateExpectedPosition();
        if (expectedPosition !== null) {
            performSync(expectedPosition);
        }
    }, [calculateExpectedPosition, performSync]);

    // ============================================================
    // DRIFT DETECTION & AUTO-CORRECTION
    // ============================================================

    useEffect(() => {
        if (!isOnlineMode || !enabled || !masterState) {
            setDrift(0);
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        // Check drift periodically
        const checkDrift = () => {
            const expectedPosition = calculateExpectedPosition();
            if (expectedPosition === null) return;

            const currentPosition = audio.currentTime;
            const currentDrift = Math.abs(currentPosition - expectedPosition);

            setDrift(currentDrift);

            // Trigger sync if drift exceeds threshold
            if (currentDrift > DRIFT_THRESHOLD_SECONDS && masterState.isPlaying && !isSyncing) {
                console.log(`⚠️ [AudioSync] Drift detected: ${currentDrift.toFixed(2)}s > ${DRIFT_THRESHOLD_SECONDS}s threshold`);
                performSync(expectedPosition);
            }
        };

        // Initial check
        checkDrift();

        // Periodic drift checking
        const intervalId = setInterval(checkDrift, DRIFT_CHECK_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
        };
    }, [masterState, isOnlineMode, enabled, audioRef, calculateExpectedPosition, performSync, isSyncing]);

    // ============================================================
    // MASTER STATE CHANGE HANDLING
    // ============================================================

    useEffect(() => {
        if (!masterState || !isOnlineMode || !enabled) return;

        const audio = audioRef.current;
        if (!audio) return;

        // Track update time for disconnect detection
        lastMasterUpdateRef.current = Date.now();
        setIsTeacherDisconnected(false);

        // Handle different actions
        switch (masterState.lastAction) {
            case 'play':
                // Sync to master position and play
                const playExpected = calculateExpectedPosition();
                if (playExpected !== null) {
                    audio.currentTime = playExpected;
                }
                audio.playbackRate = masterState.speed;
                audio.play().catch(console.error);
                break;

            case 'pause':
                audio.pause();
                audio.currentTime = masterState.position;
                break;

            case 'seek':
                audio.currentTime = masterState.position;
                break;

            case 'speed':
                // Speed change: apply new speed and reset sync baseline
                audio.playbackRate = masterState.speed;
                audio.currentTime = masterState.position;
                console.log(`⚡ [AudioSync] Speed changed to ${masterState.speed}x, position reset to ${masterState.position}s`);
                break;

            case 'resume':
                // Resume after long pause or reconnection
                const resumeExpected = calculateExpectedPosition();
                if (resumeExpected !== null) {
                    audio.currentTime = resumeExpected;
                }
                audio.playbackRate = masterState.speed;
                audio.play().catch(console.error);
                console.log('▶️ [AudioSync] Resumed from master');
                break;

            case 'section':
                // Section change - handled by parent component
                // Just ensure we're at the right position
                audio.currentTime = masterState.position;
                break;
        }
    }, [masterState?.lastAction, masterState?.lastActionTimestamp, audioRef, isOnlineMode, enabled, calculateExpectedPosition]);

    // ============================================================
    // TEACHER DISCONNECT DETECTION
    // ============================================================

    useEffect(() => {
        if (!isOnlineMode || !enabled || !masterState?.isPlaying) {
            setIsTeacherDisconnected(false);
            return;
        }

        const checkDisconnect = () => {
            const now = Date.now();
            const timeSinceUpdate = now - lastMasterUpdateRef.current;

            if (timeSinceUpdate > TEACHER_DISCONNECT_THRESHOLD_MS) {
                if (!isTeacherDisconnected) {
                    console.warn(`📡 [AudioSync] Teacher appears disconnected (no updates for ${(timeSinceUpdate / 1000).toFixed(1)}s)`);
                    setIsTeacherDisconnected(true);
                }
            } else {
                setIsTeacherDisconnected(false);
            }
        };

        // Check periodically while playing
        const intervalId = setInterval(checkDisconnect, 2000);

        return () => {
            clearInterval(intervalId);
        };
    }, [masterState?.isPlaying, isOnlineMode, enabled, isTeacherDisconnected]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, []);

    return {
        drift,
        isSyncing,
        lastSyncTime,
        isTeacherDisconnected,
        calculateExpectedPosition,
        forceSync,
    };
}
