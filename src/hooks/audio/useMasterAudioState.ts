/**
 * useMasterAudioState Hook
 *
 * Reads canonical live listening audio authority and provides guarded teacher
 * writer helpers for legacy callers. New monitor UI writes through
 * useMonitorControls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { onValue, ref, serverTimestamp, update } from 'firebase/database';
import type { MasterAudioAction, MasterAudioState } from '../../types/audio.types';
import {
    buildLiveAudioAuthorityTransaction,
    buildLiveAudioHeartbeatState,
    normalizeMasterAudioState,
} from '../../features/assessment/listening/live-session/authority/liveAudioAuthorityTransaction';

const HEARTBEAT_INTERVAL_MS = 2_000;

export interface UseMasterAudioStateOptions {
    /** Session code for Firebase path */
    sessionCode: string | undefined;

    /** Role determines broadcast vs listen behavior */
    role: 'teacher' | 'student';

    /** Whether the hook is enabled (set false to disable all listeners) */
    enabled?: boolean;

    /** Required for teacher writes */
    teacherUid?: string;

    /** Stable writer id for this teacher client */
    writerClientId?: string;
}

export interface UseMasterAudioStateReturn {
    /** Current master audio state */
    masterState: MasterAudioState | null;

    /** Whether we're connected to Firebase */
    isConnected: boolean;

    /** Last update timestamp (for staleness detection) */
    lastUpdateTime: number;

    /** Update state with a new action (teacher only) */
    updateState: (update: Partial<MasterAudioState> & { lastAction: MasterAudioAction }) => Promise<void>;

    /** Broadcast play action */
    play: (section: number, position: number) => Promise<void>;

    /** Broadcast pause action */
    pause: (section: number, position: number) => Promise<void>;

    /** Broadcast seek action */
    seek: (section: number, position: number) => Promise<void>;

    /** Broadcast section change */
    changeSection: (newSection: number) => Promise<void>;

    /** Broadcast speed change */
    changeSpeed: (speed: number, section: number, position: number) => Promise<void>;

    /** Broadcast resume action (after reconnect or long pause) */
    resume: (section: number, position: number) => Promise<void>;

    /** Start heartbeat broadcasting (teacher only) */
    startHeartbeat: () => void;

    /** Stop heartbeat broadcasting */
    stopHeartbeat: () => void;
}

export function useMasterAudioState({
    sessionCode,
    role,
    enabled = true,
    teacherUid,
    writerClientId = 'teacher-audio-state',
}: UseMasterAudioStateOptions): UseMasterAudioStateReturn {
    const [masterState, setMasterState] = useState<MasterAudioState | null>(null);
    const [isConnected, setIsConnected] = useState(true);
    const [lastUpdateTime, setLastUpdateTime] = useState(0);

    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const currentPositionRef = useRef<number>(0);
    const currentSectionRef = useRef<number>(1);
    const isPlayingRef = useRef<boolean>(false);
    const speedRef = useRef<number>(1);
    const masterStateRef = useRef<MasterAudioState | null>(null);

    const getStatePath = useCallback(() => {
        if (!sessionCode) return null;
        return `game_sessions/${sessionCode}/masterAudioState`;
    }, [sessionCode]);

    const updateState = useCallback(async (
        stateUpdate: Partial<MasterAudioState> & { lastAction: MasterAudioAction },
    ): Promise<void> => {
        if (role !== 'teacher' || !sessionCode) {
            console.warn('[MasterAudioState] updateState called but not teacher or no session');
            return;
        }

        if (!teacherUid) {
            throw new Error('teacherUid is required for live audio authority writes');
        }

        const previousState = normalizeMasterAudioState(masterStateRef.current as any, {
            teacherUid,
            writerClientId,
        });
        const transaction = buildLiveAudioAuthorityTransaction({
            sessionCode,
            previousState,
            intent: {
                action: stateUpdate.lastAction,
                section: stateUpdate.section,
                position: stateUpdate.position,
                speed: stateUpdate.speed,
                isPlaying: stateUpdate.isPlaying,
            },
            teacherUid,
            writerClientId,
            now: Date.now(),
            serverTimestampValue: serverTimestamp(),
        });

        await update(ref(database), transaction.updates);

        currentPositionRef.current = transaction.state.position;
        currentSectionRef.current = transaction.state.section;
        isPlayingRef.current = transaction.state.isPlaying;
        speedRef.current = transaction.state.speed;

        console.log(`[MasterAudioState] Broadcast ${stateUpdate.lastAction}:`, transaction.state);
    }, [role, sessionCode, teacherUid, writerClientId]);

    const play = useCallback(async (section: number, position: number): Promise<void> => {
        await updateState({
            section,
            position,
            isPlaying: true,
            speed: speedRef.current,
            lastAction: 'play',
        });
    }, [updateState]);

    const pause = useCallback(async (section: number, position: number): Promise<void> => {
        await updateState({
            section,
            position,
            isPlaying: false,
            speed: speedRef.current,
            lastAction: 'pause',
        });
    }, [updateState]);

    const seek = useCallback(async (section: number, position: number): Promise<void> => {
        await updateState({
            section,
            position,
            isPlaying: isPlayingRef.current,
            speed: speedRef.current,
            lastAction: 'seek',
        });
    }, [updateState]);

    const changeSection = useCallback(async (newSection: number): Promise<void> => {
        await updateState({
            section: newSection,
            position: 0,
            isPlaying: isPlayingRef.current,
            speed: speedRef.current,
            lastAction: 'section',
        });
    }, [updateState]);

    const changeSpeed = useCallback(async (speed: number, section: number, position: number): Promise<void> => {
        await updateState({
            section,
            position,
            isPlaying: isPlayingRef.current,
            speed,
            lastAction: 'speed',
        });
    }, [updateState]);

    const resume = useCallback(async (section: number, position: number): Promise<void> => {
        await updateState({
            section,
            position,
            isPlaying: true,
            speed: speedRef.current,
            lastAction: 'resume',
        });
    }, [updateState]);

    const startHeartbeat = useCallback(() => {
        if (role !== 'teacher') return;

        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }

        heartbeatIntervalRef.current = setInterval(async () => {
            if (!isPlayingRef.current) return;

            const path = getStatePath();
            if (!path || !teacherUid) return;

            try {
                currentPositionRef.current += (HEARTBEAT_INTERVAL_MS / 1000) * speedRef.current;
                const heartbeatState = buildLiveAudioHeartbeatState({
                    previousState: masterStateRef.current as any,
                    position: currentPositionRef.current,
                    now: Date.now(),
                    teacherUid,
                    writerClientId,
                });

                await update(ref(database, path), {
                    ...heartbeatState,
                    timestamp: serverTimestamp(),
                });
            } catch (error) {
                console.error('[MasterAudioState] Heartbeat failed:', error);
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [role, getStatePath, teacherUid, writerClientId]);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            stopHeartbeat();
        };
    }, [stopHeartbeat]);

    useEffect(() => {
        if (!sessionCode || !enabled) {
            setMasterState(null);
            masterStateRef.current = null;
            return;
        }

        const path = getStatePath();
        if (!path) return;

        const unsubscribe = onValue(ref(database, path), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val() as MasterAudioState;
                setMasterState(data);
                masterStateRef.current = data;
                setLastUpdateTime(Date.now());

                currentPositionRef.current = data.position;
                currentSectionRef.current = data.section;
                isPlayingRef.current = data.isPlaying;
                speedRef.current = data.speed;
            } else {
                setMasterState(null);
                masterStateRef.current = null;
            }
        }, (error) => {
            console.error('[MasterAudioState] Firebase listener error:', error);
        });

        return () => unsubscribe();
    }, [sessionCode, enabled, getStatePath]);

    useEffect(() => {
        if (!sessionCode || !enabled) return;

        const unsubscribe = onValue(ref(database, '.info/connected'), (snapshot) => {
            setIsConnected(snapshot.val() === true);
        });

        return () => unsubscribe();
    }, [sessionCode, enabled]);

    return {
        masterState,
        isConnected,
        lastUpdateTime,
        updateState,
        play,
        pause,
        seek,
        changeSection,
        changeSpeed,
        resume,
        startHeartbeat,
        stopHeartbeat,
    };
}
