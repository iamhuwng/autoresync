/**
 * useAudioSync Hook
 *
 * Keeps student audio aligned to the canonical teacher masterAudioState.
 * The 500 ms soft correction and 2 second hard seek values are test baselines,
 * not final product thresholds.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MasterAudioState } from '../../types/audio.types';
import {
    LIVE_AUDIO_DRIFT_CHECK_INTERVAL_MS,
    LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS,
    LIVE_AUDIO_SOFT_CORRECTION_MAX_DURATION_MS,
    calculateExpectedLiveAudioPosition,
    calculateSoftCorrectionPlaybackRate,
    classifyLiveAudioDrift,
    shouldFreezeForTeacherDisconnect,
} from '../../features/assessment/listening/live-session/authority/liveAudioSyncPolicy';

const SYNC_INDICATOR_DURATION_MS = 500;

export interface UseAudioSyncOptions {
    /** Reference to the audio element */
    audioRef: RefObject<HTMLAudioElement>;

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

    /** Whether teacher appears disconnected after bounded grace */
    isTeacherDisconnected: boolean;

    /** Calculate expected position based on master state */
    calculateExpectedPosition: () => number | null;

    /** Manually trigger a sync to master position */
    forceSync: () => void;
}

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

    const lastMasterUpdateRef = useRef<number>(0);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const softCorrectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const calculateExpectedPosition = useCallback((): number | null => {
        if (!masterState) {
            return null;
        }

        return calculateExpectedLiveAudioPosition({
            position: masterState.position,
            speed: masterState.speed,
            isPlaying: masterState.isPlaying,
            timestamp: masterState.timestamp,
            now: Date.now(),
        });
    }, [masterState]);

    const handlePlayRejection = useCallback((error: unknown) => {
        const errorName = typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name?: unknown }).name)
            : null;
        if (errorName === 'AbortError') {
            console.info('[AudioSync] Ignored interrupted play request during canonical handoff', {
                actionId: masterState?.actionId ?? null,
                lastAction: masterState?.lastAction ?? null,
                revision: masterState?.revision ?? null,
                section: masterState?.section ?? null,
            });
            return;
        }

        console.error('[AudioSync] Playback request failed:', error);
    }, [
        masterState?.actionId,
        masterState?.lastAction,
        masterState?.revision,
        masterState?.section,
    ]);

    const clearSoftCorrection = useCallback(() => {
        if (softCorrectionTimeoutRef.current) {
            clearTimeout(softCorrectionTimeoutRef.current);
            softCorrectionTimeoutRef.current = null;
        }
    }, []);

    const performSync = useCallback((expectedPosition: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const currentPosition = audio.currentTime;
        console.log(`[AudioSync] Hard sync from ${currentPosition.toFixed(1)}s to ${expectedPosition.toFixed(1)}s`);

        clearSoftCorrection();
        setIsSyncing(true);
        audio.currentTime = expectedPosition;
        if (masterState?.speed) {
            audio.playbackRate = masterState.speed;
        }
        setLastSyncTime(Date.now());
        onSync?.(currentPosition, expectedPosition);

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = setTimeout(() => {
            setIsSyncing(false);
        }, SYNC_INDICATOR_DURATION_MS);
    }, [audioRef, clearSoftCorrection, masterState?.speed, onSync]);

    const applySoftCorrection = useCallback((expectedPosition: number) => {
        const audio = audioRef.current;
        if (!audio || !masterState?.isPlaying) return;

        const currentPosition = audio.currentTime;
        audio.playbackRate = calculateSoftCorrectionPlaybackRate({
            currentPosition,
            expectedPosition,
            canonicalSpeed: masterState.speed,
        });
        setLastSyncTime(Date.now());
        onSync?.(currentPosition, expectedPosition);

        clearSoftCorrection();
        softCorrectionTimeoutRef.current = setTimeout(() => {
            const currentAudio = audioRef.current;
            if (currentAudio) {
                currentAudio.playbackRate = masterState.speed;
            }
        }, LIVE_AUDIO_SOFT_CORRECTION_MAX_DURATION_MS);
    }, [audioRef, clearSoftCorrection, masterState?.isPlaying, masterState?.speed, onSync]);

    const forceSync = useCallback(() => {
        const expectedPosition = calculateExpectedPosition();
        if (expectedPosition !== null) {
            performSync(expectedPosition);
        }
    }, [calculateExpectedPosition, performSync]);

    useEffect(() => {
        if (!isOnlineMode || !enabled || !masterState) {
            setDrift(0);
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        const checkDrift = () => {
            const expectedPosition = calculateExpectedPosition();
            if (expectedPosition === null) return;

            const currentPosition = audio.currentTime;
            const currentDrift = Math.abs(currentPosition - expectedPosition);
            setDrift(currentDrift);

            if (!masterState.isPlaying || isSyncing) {
                return;
            }

            const action = classifyLiveAudioDrift(currentPosition, expectedPosition);
            if (action === 'hard-seek') {
                console.log(`[AudioSync] Hard drift ${currentDrift.toFixed(2)}s >= ${LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS}s baseline`);
                performSync(expectedPosition);
            } else if (action === 'soft-correction') {
                applySoftCorrection(expectedPosition);
            }
        };

        checkDrift();
        const intervalId = setInterval(checkDrift, LIVE_AUDIO_DRIFT_CHECK_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
        };
    }, [masterState, isOnlineMode, enabled, audioRef, calculateExpectedPosition, performSync, applySoftCorrection, isSyncing]);

    useEffect(() => {
        if (!masterState || !isOnlineMode || !enabled) return;

        const audio = audioRef.current;
        if (!audio) return;

        lastMasterUpdateRef.current = Date.now();
        setIsTeacherDisconnected(false);
        clearSoftCorrection();

        switch (masterState.lastAction) {
            case 'play':
            case 'resume': {
                const expected = calculateExpectedPosition();
                if (expected !== null) {
                    audio.currentTime = expected;
                }
                audio.playbackRate = masterState.speed;
                void audio.play().catch(handlePlayRejection);
                break;
            }

            case 'pause':
                audio.pause();
                audio.currentTime = masterState.position;
                audio.playbackRate = masterState.speed;
                break;

            case 'seek':
            case 'speed':
            case 'section':
                audio.currentTime = masterState.position;
                audio.playbackRate = masterState.speed;
                if (masterState.isPlaying) {
                    void audio.play().catch(handlePlayRejection);
                } else {
                    audio.pause();
                }
                break;

            case 'initialize':
                audio.currentTime = masterState.position;
                audio.playbackRate = masterState.speed;
                break;
        }
    }, [
        masterState?.revision,
        masterState?.lastAction,
        masterState?.lastActionTimestamp,
        masterState?.timestamp,
        audioRef,
        isOnlineMode,
        enabled,
        calculateExpectedPosition,
        clearSoftCorrection,
        handlePlayRejection,
    ]);

    useEffect(() => {
        if (!isOnlineMode || !enabled || !masterState?.isPlaying) {
            setIsTeacherDisconnected(false);
            return;
        }

        const checkDisconnect = () => {
            const now = Date.now();
            const timeSinceUpdate = now - lastMasterUpdateRef.current;

            if (shouldFreezeForTeacherDisconnect({
                lastCanonicalUpdateAt: lastMasterUpdateRef.current,
                now,
            })) {
                if (!isTeacherDisconnected) {
                    console.warn(`[AudioSync] Teacher disconnected after ${(timeSinceUpdate / 1000).toFixed(1)}s without canonical updates`);
                    setIsTeacherDisconnected(true);
                }
                const audio = audioRef.current;
                if (audio && !audio.paused) {
                    audio.pause();
                }
            } else {
                setIsTeacherDisconnected(false);
            }
        };

        const intervalId = setInterval(checkDisconnect, 2_000);

        return () => {
            clearInterval(intervalId);
        };
    }, [masterState?.isPlaying, isOnlineMode, enabled, isTeacherDisconnected, audioRef]);

    useEffect(() => {
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
            if (softCorrectionTimeoutRef.current) {
                clearTimeout(softCorrectionTimeoutRef.current);
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
