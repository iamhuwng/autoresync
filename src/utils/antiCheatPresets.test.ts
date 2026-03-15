/**
 * Unit tests for antiCheatPresets
 *
 * PRD-0036: Anti-Cheating & Test Integrity System — Task 1.4
 */

import { describe, it, expect } from 'vitest';
import {
  PRESET_DEFAULTS,
  resolvePreset,
  getContextDefaults,
  computeRiskLevel,
} from './antiCheatPresets';

// ============================================================================
// resolvePreset
// ============================================================================

describe('resolvePreset', () => {
  it('returns expected config for "standard" preset', () => {
    const config = resolvePreset('standard');
    expect(config.preset).toBe('standard');
    expect(config.detectTabSwitch).toBe(true);
    expect(config.detectCopyPaste).toBe(true);
    expect(config.detectRightClick).toBe(true);
    expect(config.detectFullscreenExit).toBe(false);
    expect(config.detectKeyboardShortcuts).toBe(true);
    expect(config.enableStudentWarnings).toBe(true);
    expect(config.enableAutoSubmit).toBe(true);
    expect(config.autoSubmitThreshold).toBe(5);
    expect(config.requireFullscreen).toBe(false);
    expect(config.shuffleQuestions).toBe(true);
    expect(config.shuffleOptions).toBe(true);
    expect(config.nullifyRemainingAttempts).toBe(false);
  });

  it('returns all detection flags as false for "none" preset', () => {
    const config = resolvePreset('none');
    expect(config.preset).toBe('none');
    expect(config.detectTabSwitch).toBe(false);
    expect(config.detectCopyPaste).toBe(false);
    expect(config.detectRightClick).toBe(false);
    expect(config.detectFullscreenExit).toBe(false);
    expect(config.detectKeyboardShortcuts).toBe(false);
    expect(config.enableStudentWarnings).toBe(false);
    expect(config.enableAutoSubmit).toBe(false);
    expect(config.autoSubmitThreshold).toBe(0);
    expect(config.requireFullscreen).toBe(false);
    expect(config.shuffleQuestions).toBe(false);
    expect(config.shuffleOptions).toBe(false);
    expect(config.nullifyRemainingAttempts).toBe(false);
  });

  it('returns strict preset with fullscreen and lower threshold', () => {
    const config = resolvePreset('strict');
    expect(config.preset).toBe('strict');
    expect(config.detectFullscreenExit).toBe(true);
    expect(config.requireFullscreen).toBe(true);
    expect(config.autoSubmitThreshold).toBe(3);
  });

  it('returns a new object (not a reference to PRESET_DEFAULTS)', () => {
    const config = resolvePreset('standard');
    config.detectTabSwitch = false;
    // Original should be unaffected
    expect(PRESET_DEFAULTS.standard.detectTabSwitch).toBe(true);
  });
});

// ============================================================================
// getContextDefaults
// ============================================================================

describe('getContextDefaults', () => {
  it('disables warnings and auto-submit for "session" context', () => {
    const overrides = getContextDefaults('session');
    expect(overrides.enableStudentWarnings).toBe(false);
    expect(overrides.enableAutoSubmit).toBe(false);
  });

  it('disables everything for "solo" context', () => {
    const overrides = getContextDefaults('solo');
    expect(overrides.detectTabSwitch).toBe(false);
    expect(overrides.detectCopyPaste).toBe(false);
    expect(overrides.detectRightClick).toBe(false);
    expect(overrides.detectFullscreenExit).toBe(false);
    expect(overrides.detectKeyboardShortcuts).toBe(false);
    expect(overrides.enableStudentWarnings).toBe(false);
    expect(overrides.enableAutoSubmit).toBe(false);
    expect(overrides.requireFullscreen).toBe(false);
    expect(overrides.shuffleQuestions).toBe(false);
    expect(overrides.shuffleOptions).toBe(false);
  });

  it('returns empty object for "homework" context (use preset as-is)', () => {
    const overrides = getContextDefaults('homework');
    expect(Object.keys(overrides)).toHaveLength(0);
  });

  it('session overrides apply correctly when merged with standard preset', () => {
    const config = { ...resolvePreset('standard'), ...getContextDefaults('session') };
    // Detection stays on
    expect(config.detectTabSwitch).toBe(true);
    expect(config.detectCopyPaste).toBe(true);
    // But student-facing features are off
    expect(config.enableStudentWarnings).toBe(false);
    expect(config.enableAutoSubmit).toBe(false);
  });
});

// ============================================================================
// computeRiskLevel
// ============================================================================

describe('computeRiskLevel', () => {
  it('returns "low" for 0 violations and not force-submitted', () => {
    expect(computeRiskLevel(0, false)).toBe('low');
  });

  it('returns "medium" for 1 violation and not force-submitted', () => {
    expect(computeRiskLevel(1, false)).toBe('medium');
  });

  it('returns "medium" for 2 violations and not force-submitted', () => {
    expect(computeRiskLevel(2, false)).toBe('medium');
  });

  it('returns "high" for 3 violations and not force-submitted', () => {
    expect(computeRiskLevel(3, false)).toBe('high');
  });

  it('returns "high" for any violation count when force-submitted', () => {
    expect(computeRiskLevel(0, true)).toBe('high');
    expect(computeRiskLevel(1, true)).toBe('high');
    expect(computeRiskLevel(5, true)).toBe('high');
  });

  it('returns "high" for large violation counts', () => {
    expect(computeRiskLevel(10, false)).toBe('high');
    expect(computeRiskLevel(100, false)).toBe('high');
  });
});
