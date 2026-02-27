/**
 * Audio Hooks - Unified Audio Architecture
 * 
 * Export all audio-related hooks for listening test synchronization.
 * 
 * @see PRD-0018: Unified Audio Architecture
 */

export { useMasterAudioState } from './useMasterAudioState';
export type { UseMasterAudioStateOptions, UseMasterAudioStateReturn } from './useMasterAudioState';

export { useAudioSync } from './useAudioSync';
export type { UseAudioSyncOptions, UseAudioSyncReturn } from './useAudioSync';

export { useHeadphonePermission } from './useHeadphonePermission';
export type {
    UseHeadphonePermissionOptions,
    UseHeadphonePermissionReturn,
    PendingHeadphoneRequest
} from './useHeadphonePermission';
