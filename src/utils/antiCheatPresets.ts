/**
 * Anti-Cheat Preset Engine
 *
 * PRD-0036: Anti-Cheating & Test Integrity System
 *
 * Provides preset definitions (None/Standard/Strict), resolution functions,
 * context-aware default overrides, and risk level computation.
 *
 * @module utils/antiCheatPresets
 */

import type { AntiCheatConfig, AntiCheatPreset } from '../types/integrity.types';

// ============================================================================
// PRESET DEFAULTS (FR-24)
// ============================================================================

/**
 * Full AntiCheatConfig values for each preset level.
 *
 * - none: All detection disabled, no warnings, no auto-submit
 * - standard: Balanced detection + warnings + auto-submit at 5 violations
 * - strict: Aggressive detection + fullscreen enforced + auto-submit at 3
 */
export const PRESET_DEFAULTS: Record<AntiCheatPreset, AntiCheatConfig> = {
  none: {
    preset: 'none',
    detectTabSwitch: false,
    detectCopyPaste: false,
    detectRightClick: false,
    detectFullscreenExit: false,
    detectKeyboardShortcuts: false,
    enableStudentWarnings: false,
    enableAutoSubmit: false,
    autoSubmitThreshold: 0,
    requireFullscreen: false,
    shuffleQuestions: false,
    shuffleOptions: false,
    nullifyRemainingAttempts: false,
  },
  standard: {
    preset: 'standard',
    detectTabSwitch: true,
    detectCopyPaste: true,
    detectRightClick: true,
    detectFullscreenExit: false,
    detectKeyboardShortcuts: true,
    enableStudentWarnings: true,
    enableAutoSubmit: true,
    autoSubmitThreshold: 5,
    requireFullscreen: false,
    shuffleQuestions: true,
    shuffleOptions: true,
    nullifyRemainingAttempts: false,
  },
  strict: {
    preset: 'strict',
    detectTabSwitch: true,
    detectCopyPaste: true,
    detectRightClick: true,
    detectFullscreenExit: true,
    detectKeyboardShortcuts: true,
    enableStudentWarnings: true,
    enableAutoSubmit: true,
    autoSubmitThreshold: 3,
    requireFullscreen: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    nullifyRemainingAttempts: false,
  },
};

// ============================================================================
// RESOLUTION FUNCTIONS
// ============================================================================

/**
 * Returns a deep copy of the preset defaults for the given preset level.
 *
 * Always returns a new object so callers can freely mutate without affecting
 * the shared PRESET_DEFAULTS constant.
 */
export function resolvePreset(preset: AntiCheatPreset): AntiCheatConfig {
  return { ...PRESET_DEFAULTS[preset] };
}

/**
 * Returns context-specific overrides to apply on top of a resolved preset.
 *
 * - session: Disable student warnings and auto-submit (teacher monitors live)
 * - homework: No overrides — use preset defaults as-is
 * - solo: Disable everything (self-study, no proctoring)
 *
 * Usage:
 *   const config = { ...resolvePreset('standard'), ...getContextDefaults('session') };
 */
export function getContextDefaults(
  context: 'session' | 'homework' | 'solo',
): Partial<AntiCheatConfig> {
  switch (context) {
    case 'session':
      return {
        enableStudentWarnings: false,
        enableAutoSubmit: false,
      };
    case 'solo':
      return {
        detectTabSwitch: false,
        detectCopyPaste: false,
        detectRightClick: false,
        detectFullscreenExit: false,
        detectKeyboardShortcuts: false,
        enableStudentWarnings: false,
        enableAutoSubmit: false,
        requireFullscreen: false,
        shuffleQuestions: false,
        shuffleOptions: false,
      };
    case 'homework':
      return {};
    default:
      return {};
  }
}

// ============================================================================
// RISK LEVEL COMPUTATION (FR-42)
// ============================================================================

/**
 * Computes the risk level based on violation count and force-submit status.
 *
 * - low: 0 violations AND not force-submitted
 * - medium: 1-2 violations AND not force-submitted
 * - high: 3+ violations OR any force-submit event
 */
export function computeRiskLevel(
  violationCount: number,
  forceSubmitted: boolean,
): 'low' | 'medium' | 'high' {
  if (forceSubmitted || violationCount >= 3) {
    return 'high';
  }
  if (violationCount >= 1) {
    return 'medium';
  }
  return 'low';
}
