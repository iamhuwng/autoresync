/**
 * useMasterAudioState Hook
 * 
 * Manages the unified audio state for listening tests.
 * - Teacher role: Broadcasts state to Firebase with event-driven + heartbeat pattern
 * - Student role: Listens to state changes and provides sync data
 * 
 * @see PRD-0018: Unified Audio Architecture
 */

import { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, onValue, update, serverTimestamp, get } from 'firebase/database';
import type { MasterAudioState, MasterAudioAction } from '../../types/audio.types';

// ============================================================
// CONSTANTS
// ============================================================

/** Heartbeat interval in milliseconds (2 seconds as per PRD) */
const HEARTBEAT_INTERVAL_MS = 2000;

/** Default initial state */
const DEFAULT_MASTER_STATE: MasterAudioState = {
    section: 1,
    position: 0,
    isPlaying: false,
    speed: 1.0,
    timestamp: 0,
    lastAction: 'pause',
    lastActionTimestamp: 0,
};

// ============================================================
// TYPES
// ============================================================

export interface UseMasterAudioStateOptions {
    /** Session code for Firebase path */
    sessionCode: string | undefined;

    /** Role determines broadcast vs listen behavior */
    role: 'teacher' | 'student';

    /** Whether the hook is enabled (set false to disable all listeners) */
    enabled?: boolean;
}

export interface UseMasterAudioStateReturn {
    /** Current master audio state */
    masterState: MasterAudioState | null;

    /** Whether we're connected to Firebase */
    isConnected: boolean;

    /** Last update timestamp (for staleness detection) */
    lastUpdateTime: number;

    // Teacher-only functions (no-op for students)
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

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useMasterAudioState({
    sessionCode,
    role,
    enabled = true,
}: UseMasterAudioStateOptions): UseMasterAudioStateReturn {
    const [masterState, setMasterState] = useState<MasterAudioState | null>(null);
    const [isConnected, setIsConnected] = useState(true);
    const [lastUpdateTime, setLastUpdateTime] = useState(0);

    // Refs for heartbeat management
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const currentPositionRef = useRef<number>(0);
    const currentSectionRef = useRef<number>(1);
    const isPlayingRef = useRef<boolean>(false);
    const speedRef = useRef<number>(1.0);

    // Firebase path for master audio state
    const getStatePath = useCallback(() => {
        if (!sessionCode) return null;
        return `game_sessions/${sessionCode}/masterAudioState`;
    }, [sessionCode]);

    // ============================================================
    // TEACHER: Broadcast state updates
    // ============================================================

    const updateState = useCallback(async (
        stateUpdate: Partial<MasterAudioState> & { lastAction: MasterAudioAction }
    ): Promise<void> => {
        if (role !== 'teacher' || !sessionCode) {
            console.warn('[MasterAudioState] updateState called but not teacher or no session');
            return;
        }

        const path = getStatePath();
        if (!path) return;

        const stateRef = ref(database, path);
        const now = Date.now();

        const fullUpdate: Partial<MasterAudioState> = {
            ...stateUpdate,
            timestamp: now, // Will be replaced by serverTimestamp() in actual write
            lastActionTimestamp: now,
        };

        try {
            // Use serverTimestamp for the timestamp field
            await update(stateRef, {
                ...fullUpdate,
                timestamp: serverTimestamp(),
            });

            console.log(`🎵 [MasterAudioState] Broadcast ${stateUpdate.lastAction}:`, fullUpdate);

            // Update refs for heartbeat
            if (stateUpdate.position !== undefined) {
                currentPositionRef.current = stateUpdate.position;
            }
            if (stateUpdate.section !== undefined) {
                currentSectionRef.current = stateUpdate.section;
            }
            if (stateUpdate.isPlaying !== undefined) {
                isPlayingRef.current = stateUpdate.isPlaying;
            }
            if (stateUpdate.speed !== undefined) {
                speedRef.current = stateUpdate.speed;
            }
        } catch (error) {
            console.error('[MasterAudioState] Failed to broadcast state:', error);
            throw error;
        }
    }, [role, sessionCode, getStatePath]);

    // Convenience methods for common actions
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
        speedRef.current = speed;
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

    // ============================================================
    // TEACHER: Heartbeat management
    // ============================================================

    const startHeartbeat = useCallback(() => {
        if (role !== 'teacher') return;

        // Clear any existing heartbeat
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }

        console.log('💓 [MasterAudioState] Starting heartbeat');

        heartbeatIntervalRef.current = setInterval(async () => {
            // Only send heartbeat if playing
            if (!isPlayingRef.current) return;

            const path = getStatePath();
            if (!path) return;

            const stateRef = ref(database, path);

            try {
                // Increment position based on elapsed time and speed
                const elapsedSeconds = HEARTBEAT_INTERVAL_MS / 1000;
                currentPositionRef.current += elapsedSeconds * speedRef.current;

                await update(stateRef, {
                    position: currentPositionRef.current,
                    timestamp: serverTimestamp(),
                });

                console.log(`💓 [MasterAudioState] Heartbeat: position=${currentPositionRef.current.toFixed(1)}s`);
            } catch (error) {
                console.error('[MasterAudioState] Heartbeat failed:', error);
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [role, getStatePath]);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
            console.log('💔 [MasterAudioState] Stopped heartbeat');
        }
    }, []);

    // Cleanup heartbeat on unmount
    useEffect(() => {
        return () => {
            stopHeartbeat();
        };
    }, [stopHeartbeat]);

    // ============================================================
    // STUDENT & TEACHER: Listen to state changes
    // ============================================================

    useEffect(() => {
        if (!sessionCode || !enabled) {
            setMasterState(null);
            return;
        }

        const path = getStatePath();
        if (!path) return;

        const stateRef = ref(database, path);

        console.log(`👂 [MasterAudioState] Listening to ${path} as ${role}`);

        const unsubscribe = onValue(stateRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val() as MasterAudioState;
                setMasterState(data);
                setLastUpdateTime(Date.now());

                // Update refs for teacher (in case of external changes)
                if (role === 'teacher') {
                    currentPositionRef.current = data.position;
                    currentSectionRef.current = data.section;
                    isPlayingRef.current = data.isPlaying;
                    speedRef.current = data.speed;
                }

                console.log(`📡 [MasterAudioState] Received state:`, {
                    section: data.section,
                    position: data.position?.toFixed(1),
                    isPlaying: data.isPlaying,
                    speed: data.speed,
                    lastAction: data.lastAction,
                });
            } else {
                // Initialize with default state if teacher
                if (role === 'teacher') {
                    console.log('[MasterAudioState] No state exists, initializing...');
                    update(stateRef, {
                        ...DEFAULT_MASTER_STATE,
                        timestamp: serverTimestamp(),
                        lastActionTimestamp: Date.now(),
                    }).catch(console.error);
                }
                setMasterState(null);
            }
        }, (error) => {
            console.error('[MasterAudioState] Firebase listener error:', error);
        });

        return () => {
            console.log(`🔇 [MasterAudioState] Stopped listening to ${path}`);
            unsubscribe();
        };
    }, [sessionCode, role, enabled, getStatePath]);

    // ============================================================
    // CONNECTION MONITORING
    // ============================================================

    useEffect(() => {
        if (!sessionCode || !enabled) return;

        const connectionRef = ref(database, '.info/connected');
        const unsubscribe = onValue(connectionRef, (snapshot) => {
            const connected = snapshot.val() === true;
            setIsConnected(connected);

            if (!connected) {
                console.warn('[MasterAudioState] Firebase connection lost');
            } else {
                console.log('[MasterAudioState] Firebase connected');
            }
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
