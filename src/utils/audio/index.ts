/**
 * Audio Utilities
 * 
 * Utility functions for audio controls and configuration resolution.
 * 
 * @module utils/audio
 */

// Export all types and functions from resolveAudioControls (PRD-0018 Task 10.3)
export type {
    AudioControlsSource,
    StudentAccommodationAudio,
    ResolvedAudioControls,
} from './resolveAudioControls';

export {
    resolveAudioControls,
    hasAudioAccommodation,
    logBlockedAccommodation,
} from './resolveAudioControls';
