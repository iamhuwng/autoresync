/**
 * Platform Layer — Barrel Export
 *
 * Central export point for all platform abstractions.
 * Import from '@/core/platform' in your code.
 *
 * @example
 * import { storage, sessionStore } from '@/core/platform';
 * import { useScreenSize, useOnlineStatus, useAppLifecycle } from '@/core/platform';
 */

// Storage
export { storage, sessionStore } from './storage';

// Hooks
export { useScreenSize } from './hooks/useScreenSize';
export type { ScreenSize } from './hooks/useScreenSize';
export { useOnlineStatus } from './hooks/useOnlineStatus';
export { useAppLifecycle } from './hooks/useAppLifecycle';
