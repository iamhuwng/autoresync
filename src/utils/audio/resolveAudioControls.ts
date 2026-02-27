/**
 * Audio Controls Resolution Utility
 * 
 * Resolves the effective audio controls configuration based on priority order:
 * 1. If examMode = true → use session/material settings (ignore accommodations)
 * 2. Student Accommodation (if exists) → override everything
 * 3. Session Setting → override material
 * 4. Material Default → fallback
 * 
 * @see PRD-0018: Unified Audio Architecture - Task 10.3
 */

import type { AudioControlsConfig } from '../../services/listeningTestStorage';

// ============================================================
// TYPES
// ============================================================

export interface AudioControlsSource {
    /** Default controls from the material/test */
    materialDefault?: AudioControlsConfig;
    /** Controls set for the session by teacher */
    sessionSetting?: AudioControlsConfig;
    /** Student-specific accommodation overrides */
    studentAccommodation?: StudentAccommodationAudio;
    /** Whether exam mode is enabled (disables accommodations) */
    examMode?: boolean;
}

export interface StudentAccommodationAudio {
    /** Whether student has unlimited replays */
    unlimitedReplays?: boolean;
    /** Maximum number of replays allowed */
    maxReplays?: number;
    /** Whether student has full audio controls */
    fullAudioControls?: boolean;
    /** Extra time for the student (in minutes) */
    extraTime?: number;
}

export interface ResolvedAudioControls {
    /** The resolved audio controls configuration */
    config: AudioControlsConfig;
    /** Which source the controls came from */
    source: 'material' | 'session' | 'accommodation' | 'default';
    /** Whether accommodations were blocked by exam mode */
    accommodationBlocked?: boolean;
    /** Message for logging/UI if accommodation was blocked */
    blockMessage?: string;
}

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

const DEFAULT_AUDIO_CONTROLS: AudioControlsConfig = {
    showPlayPause: true,
    showProgressBar: true,
    showSeekControl: false,
    showSpeedControl: false,
    showSkipSection: false,
    showVolumeControl: true,
};

// Full controls for accommodated students
const FULL_AUDIO_CONTROLS: AudioControlsConfig = {
    showPlayPause: true,
    showProgressBar: true,
    showSeekControl: true,
    showSpeedControl: true,
    showSkipSection: true,
    showVolumeControl: true,
};

// ============================================================
// RESOLUTION FUNCTION
// ============================================================

/**
 * Resolves the effective audio controls configuration based on priority order.
 * 
 * Priority (highest to lowest):
 * 1. If examMode = true → use session/material settings (ignore accommodations)
 * 2. Student Accommodation (if exists and examMode is false) → override everything  
 * 3. Session Setting → override material
 * 4. Material Default → fallback
 * 5. Default configuration → ultimate fallback
 * 
 * @param sources - Object containing all potential audio control sources
 * @returns ResolvedAudioControls with config and metadata
 */
export function resolveAudioControls(sources: AudioControlsSource): ResolvedAudioControls {
    const { materialDefault, sessionSetting, studentAccommodation, examMode } = sources;

    // Handle accommodations (unless blocked by exam mode)
    if (studentAccommodation && !examMode) {
        // Student has accommodations and exam mode is off
        if (studentAccommodation.fullAudioControls) {
            console.log('🎛️ [AudioControls] Using student accommodation: full controls');
            return {
                config: FULL_AUDIO_CONTROLS,
                source: 'accommodation',
            };
        }

        // Merge accommodation settings with session/material settings
        const baseConfig = sessionSetting || materialDefault || DEFAULT_AUDIO_CONTROLS;
        const mergedConfig: AudioControlsConfig = { ...baseConfig };

        // Apply accommodation overrides
        if (studentAccommodation.unlimitedReplays) {
            // Unlimited replays doesn't directly affect audio controls config
            // but we might want to note it
            console.log('🎛️ [AudioControls] Student has unlimited replays accommodation');
        }

        return {
            config: mergedConfig,
            source: 'accommodation',
        };
    }

    // Check if accommodation was blocked by exam mode
    if (studentAccommodation && examMode) {
        console.log('⚠️ [AudioControls] Accommodation blocked by Exam Mode');

        // Use session or material settings instead
        const blockedResult = getBaseControls(sessionSetting, materialDefault);
        return {
            ...blockedResult,
            accommodationBlocked: true,
            blockMessage: 'Student accommodation not applied (Exam Mode enabled)',
        };
    }

    // No accommodation - use session or material settings
    return getBaseControls(sessionSetting, materialDefault);
}

/**
 * Helper function to get base controls from session or material.
 */
function getBaseControls(
    sessionSetting?: AudioControlsConfig,
    materialDefault?: AudioControlsConfig
): ResolvedAudioControls {
    // Priority: session > material > default
    if (sessionSetting) {
        console.log('🎛️ [AudioControls] Using session settings');
        return {
            config: sessionSetting,
            source: 'session',
        };
    }

    if (materialDefault) {
        console.log('🎛️ [AudioControls] Using material default');
        return {
            config: materialDefault,
            source: 'material',
        };
    }

    console.log('🎛️ [AudioControls] Using default controls');
    return {
        config: DEFAULT_AUDIO_CONTROLS,
        source: 'default',
    };
}

/**
 * Checks if a student has any audio-related accommodations.
 */
export function hasAudioAccommodation(accommodation?: StudentAccommodationAudio): boolean {
    if (!accommodation) return false;
    return !!(
        accommodation.fullAudioControls ||
        accommodation.unlimitedReplays ||
        accommodation.maxReplays
    );
}

/**
 * Logs when an accommodation is blocked in exam mode.
 * Can be extended to save to Firebase for audit.
 */
export function logBlockedAccommodation(
    studentId: string,
    studentName: string,
    sessionCode: string,
    accommodation: StudentAccommodationAudio
): void {
    const timestamp = new Date().toISOString();
    console.log(
        `⚠️ [ExamMode] Accommodation for "${studentName}" (${studentId}) not applied - Exam Mode active`,
        {
            timestamp,
            sessionCode,
            blockedAccommodations: accommodation,
        }
    );

    // Future: Could save to Firebase for audit
    // await saveAuditLog(sessionCode, studentId, 'accommodation_blocked', accommodation);
}
