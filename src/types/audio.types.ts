/**
 * Unified Audio Architecture Types
 * 
 * Core type definitions for the synchronized audio system used in listening tests.
 * Replaces the legacy audioCommand system with a unified masterAudioState approach.
 * 
 * @see PRD-0018: Unified Audio Architecture for Listening Tests
 */

// ============================================================
// MASTER AUDIO STATE
// ============================================================

/**
 * Master Audio State - the single source of truth for audio playback.
 * 
 * Teacher broadcasts this state; students listen and sync to it.
 * Uses Firebase serverTimestamp() for clock-skew prevention.
 * 
 * Path: game_sessions/{code}/masterAudioState
 */
export interface MasterAudioState {
    /** Current section number (1-indexed) */
    section: number;

    /** Position in seconds within the current section */
    position: number;

    /** Whether audio is currently playing */
    isPlaying: boolean;

    /** Playback speed multiplier (0.75, 1.0, 1.25, 1.5, 2.0) */
    speed: number;

    /** Server timestamp for sync calculation (use Firebase serverTimestamp()) */
    timestamp: number;

    /** Last action type that caused this state update */
    lastAction: MasterAudioAction;

    /** Timestamp when lastAction occurred */
    lastActionTimestamp: number;
}

/**
 * Actions that can modify the master audio state.
 */
export type MasterAudioAction =
    | 'play'      // Audio started playing
    | 'pause'     // Audio paused
    | 'seek'      // Position changed within section
    | 'section'   // Changed to different section
    | 'speed'     // Playback speed changed
    | 'resume';   // Resumed after long pause or reconnection

// ============================================================
// AUDIO MODE
// ============================================================

/**
 * Audio mode for listening test sessions.
 * 
 * - 'online': Remote learning - each device plays audio, synced to teacher
 * - 'offline': Physical classroom - only teacher's device plays audio
 */
export type AudioMode = 'online' | 'offline';

// ============================================================
// HEADPHONE PERMISSIONS (Offline Mode)
// ============================================================

/**
 * Headphone request status.
 */
export type HeadphoneRequestStatus = 'pending' | 'approved' | 'denied';

/**
 * Headphone permission request from student in offline mode.
 * 
 * Students can request to hear audio on their device (with headphones)
 * even when the session is in offline mode.
 * 
 * Path: game_sessions/{code}/players/{studentId}/headphoneRequest
 */
export interface HeadphoneRequest {
    /** Whether a request has been made */
    requested: boolean;

    /** When the request was made (serverTimestamp) */
    requestedAt?: number;

    /** Current status of the request */
    status: HeadphoneRequestStatus;

    /** When the request was approved (if approved) */
    approvedAt?: number;

    /** When the request was denied (if denied) */
    deniedAt?: number;
}

// ============================================================
// SESSION SETTINGS EXTENSION
// ============================================================

/**
 * Extended listening session settings with audio mode configuration.
 */
export interface ListeningSessionSettings {
    /** Audio mode for this session (required) */
    audioMode: AudioMode;

    /** 
     * Exam mode - when true, student accommodations are disabled.
     * Accommodations are logged but not applied.
     */
    examMode?: boolean;
}

// ============================================================
// SYNC STATUS (For teacher monitoring)
// ============================================================

/**
 * Student sync status reported to teacher.
 */
export interface StudentSyncStatus {
    /** Student/player ID */
    studentId: string;

    /** Current drift from teacher position in seconds */
    drift: number;

    /** Whether currently syncing (correcting drift) */
    isSyncing: boolean;

    /** Last sync update timestamp */
    lastUpdate: number;

    /** Headphone permission status (offline mode only) */
    headphoneStatus?: HeadphoneRequestStatus;
}

/**
 * Aggregate sync metrics for teacher display.
 */
export interface SyncMetrics {
    /** Total number of students */
    totalStudents: number;

    /** Number of students currently synced (drift < 1s) */
    syncedCount: number;

    /** Number of students currently syncing */
    syncingCount: number;

    /** Average drift across all students */
    averageDrift: number;

    /** Maximum drift among students */
    maxDrift: number;
}

// ============================================================
// AUDIO LOADING STATUS
// ============================================================

/**
 * Status of audio loading for a section.
 */
export type AudioLoadingStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Audio section loading state.
 */
export interface AudioSectionLoadState {
    /** Section number */
    section: number;

    /** Loading status */
    status: AudioLoadingStatus;

    /** Buffered duration in seconds (for ready status) */
    bufferedDuration?: number;

    /** Error message (for error status) */
    errorMessage?: string;
}

// ============================================================
// AUDIO PLAYER MODES
// ============================================================

/**
 * Audio player context mode.
 * 
 * - 'session': Playing in a teacher-led session (online or offline)
 * - 'solo': Solo practice or homework - full local control
 */
export type AudioPlayerMode = 'session' | 'solo';

// ============================================================
// OVERRIDE PRIORITY RESOLUTION
// ============================================================

/**
 * Audio controls configuration source for override priority.
 * 
 * Priority order (highest to lowest):
 * 1. Student Accommodation (if examMode is false)
 * 2. Session Setting
 * 3. Material Default
 */
export interface AudioControlsSource {
    /** Source type */
    source: 'accommodation' | 'session' | 'material' | 'default';

    /** The resolved audio controls config */
    config: AudioControlsConfig;
}

/**
 * Audio controls configuration.
 * Defines what audio controls are visible/enabled for students.
 */
export interface AudioControlsConfig {
    showPlayPause: boolean;
    showProgressBar: boolean;
    showSeekControl: boolean;
    showSpeedControl: boolean;
    showSkipSection: boolean;
    showVolumeControl: boolean;
}

// ============================================================
// PRESETS (Re-export from listeningTestStorage for convenience)
// ============================================================

/**
 * Audio controls presets for quick configuration.
 */
export const AUDIO_CONTROLS_PRESETS = {
    /** IELTS Standard: No controls except volume - simulates real exam conditions */
    IELTS_STANDARD: {
        showPlayPause: false,
        showProgressBar: true,
        showSeekControl: false,
        showSpeedControl: false,
        showSkipSection: false,
        showVolumeControl: true,
    } as AudioControlsConfig,

    /** Practice Mode: Full controls for self-study */
    PRACTICE_MODE: {
        showPlayPause: true,
        showProgressBar: true,
        showSeekControl: true,
        showSpeedControl: true,
        showSkipSection: true,
        showVolumeControl: true,
    } as AudioControlsConfig,

    /** Relaxed Mode: Play/pause and volume only - moderate exam simulation */
    RELAXED_MODE: {
        showPlayPause: true,
        showProgressBar: true,
        showSeekControl: false,
        showSpeedControl: false,
        showSkipSection: false,
        showVolumeControl: true,
    } as AudioControlsConfig,
} as const;

// ============================================================
// LEGACY COMPATIBILITY
// ============================================================

/**
 * Legacy audio command (for backwards compatibility during migration).
 * @deprecated Use MasterAudioState instead
 */
export interface LegacyAudioCommand {
    type: 'pause' | 'resume' | 'skipToSection' | 'setSpeed' | 'seekToPosition';
    sectionNumber?: number;
    speed?: number;
    position?: number;
    timestamp: number;
}
