/**
 * Anti-Cheating & Test Integrity Types
 *
 * PRD-0036: Anti-Cheating & Test Integrity System
 *
 * Defines all types for the anti-cheating detection engine,
 * integrity reporting, and configuration presets.
 *
 * @module types/integrity.types
 */

// ============================================================================
// PRESET & CONFIGURATION
// ============================================================================

/**
 * Anti-cheat preset levels.
 * - none: All detection disabled
 * - standard: Balanced detection + warnings + auto-submit at 5 violations
 * - strict: Aggressive detection + fullscreen enforced + auto-submit at 3 violations
 */
export type AntiCheatPreset = 'none' | 'standard' | 'strict';

/**
 * Full anti-cheat configuration (FR-23).
 *
 * Controls which detection features are active, whether students
 * see warnings, and when auto-submit triggers.
 */
export interface AntiCheatConfig {
  /** Which preset this config is based on (or 'none' for fully custom) */
  preset: AntiCheatPreset;

  // ── Detection Flags ──
  /** Detect tab switches and window blurs (visibilitychange + blur/focus) */
  detectTabSwitch: boolean;
  /** Detect AND prevent copy/paste/cut + keyboard shortcuts for clipboard */
  detectCopyPaste: boolean;
  /** Detect AND prevent right-click context menu */
  detectRightClick: boolean;
  /** Detect fullscreen exits (only meaningful if requireFullscreen is true) */
  detectFullscreenExit: boolean;
  /** Detect suspicious keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+U, etc.) */
  detectKeyboardShortcuts: boolean;

  // ── Student-Facing Behavior ──
  /** Show warning toasts and blocking modal to students */
  enableStudentWarnings: boolean;
  /** Auto-submit the student's test when violations reach the threshold */
  enableAutoSubmit: boolean;
  /** Number of counted violations that triggers auto-submit */
  autoSubmitThreshold: number;

  // ── Fullscreen ──
  /** Attempt to enter fullscreen mode on test start */
  requireFullscreen: boolean;

  // ── Shuffle ──
  /** Deterministically shuffle question order per student */
  shuffleQuestions: boolean;
  /** Deterministically shuffle MCQ answer options per student */
  shuffleOptions: boolean;

  // ── Homework-Specific ──
  /** When auto-submit fires on homework, lock all remaining attempts */
  nullifyRemainingAttempts: boolean;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * All possible integrity event types logged by the detection engine.
 *
 * - tab_switch: document.visibilityState changed to hidden then back
 * - window_blur: window lost focus (blur) then regained (focus)
 * - fullscreen_exit: user exited fullscreen mode
 * - copy_attempt: user tried to copy or cut content
 * - paste_attempt: user tried to paste content
 * - right_click: user opened the context menu
 * - keyboard_shortcut: suspicious key combo detected (F12, Ctrl+Shift+I, etc.)
 * - devtools_resize: heuristic detected possible devtools panel resize
 * - time_per_question: per-question time tracking for post-analysis
 * - page_reload: page was reloaded (crash recovery or intentional)
 * - fullscreen_unavailable: fullscreen API not supported (mobile, etc.)
 */
export type IntegrityEventType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'right_click'
  | 'keyboard_shortcut'
  | 'devtools_resize'
  | 'time_per_question'
  | 'page_reload'
  | 'fullscreen_unavailable';

/**
 * A single integrity event recorded by the detection engine.
 */
export interface IntegrityEvent {
  /** What type of event occurred */
  type: IntegrityEventType;
  /** When the event occurred (Date.now() milliseconds) */
  timestamp: number;
  /** Duration in ms (for tab_switch, window_blur, time_per_question) */
  durationMs?: number;
  /** Whether this event falls within the grace period */
  withinGrace: boolean;
  /** Whether this event counts toward the violation threshold */
  counted: boolean;
  /** Additional context (e.g. key combo "Ctrl+C", question index "Q3") */
  details?: string;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Risk level computed from violation count and force-submit status (FR-42).
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Full integrity report stored per student per test (FR-41).
 *
 * For sessions: written to RTDB at
 *   game_sessions/{sessionCode}/players/{playerId}/integrity/
 *
 * For homework: a summarized version (HomeworkIntegrity) is written
 *   to the Firestore HomeworkSubmission document.
 */
export interface IntegrityReport {
  /** Number of events where counted === true */
  violationCount: number;
  /** Total number of events logged (including grace events) */
  totalEvents: number;

  // ── Per-Type Counts ──
  tabSwitchCount: number;
  totalTimeAwayMs: number;
  copyAttempts: number;
  pasteAttempts: number;
  rightClickAttempts: number;
  fullscreenExitCount: number;
  keyboardShortcutAttempts: number;

  // ── Force Submit ──
  /** Whether the student's test was force-submitted */
  forceSubmitted: boolean;
  /** Who triggered the force-submit (null if not force-submitted) */
  forceSubmittedBy: 'system' | 'teacher' | null;

  // ── Risk ──
  /** Computed risk level based on violations and force-submit */
  riskLevel: RiskLevel;

  // ── Event Log ──
  /** Full event log (may be stripped for Firestore; see HomeworkIntegrity) */
  events: IntegrityEvent[];
}

/**
 * Lightweight integrity data stored on Firestore HomeworkSubmission documents.
 *
 * Same aggregate fields as IntegrityReport but WITHOUT the full events array
 * to keep Firestore document size small.
 */
export interface HomeworkIntegrity {
  /** Number of events where counted === true */
  violationCount: number;
  /** Total number of events logged (including grace events) */
  totalEvents: number;

  // ── Per-Type Counts ──
  tabSwitchCount: number;
  totalTimeAwayMs: number;
  copyAttempts: number;
  pasteAttempts: number;
  rightClickAttempts: number;
  fullscreenExitCount: number;
  keyboardShortcutAttempts: number;

  // ── Force Submit ──
  forceSubmitted: boolean;
  forceSubmittedBy: 'system' | 'teacher' | null;

  // ── Risk ──
  riskLevel: RiskLevel;

  // ── Summary (replaces full events array) ──
  /** Total number of events (same as totalEvents, for redundancy) */
  eventCount: number;
  /** Human-readable summary of events (e.g. "3 tab switches, 1 copy attempt") */
  eventSummary: string;
}

// ============================================================================
// EMPTY / DEFAULT VALUES
// ============================================================================

/**
 * An empty IntegrityReport for initialization and no-op returns.
 */
export const EMPTY_INTEGRITY_REPORT: IntegrityReport = {
  violationCount: 0,
  totalEvents: 0,
  tabSwitchCount: 0,
  totalTimeAwayMs: 0,
  copyAttempts: 0,
  pasteAttempts: 0,
  rightClickAttempts: 0,
  fullscreenExitCount: 0,
  keyboardShortcutAttempts: 0,
  forceSubmitted: false,
  forceSubmittedBy: null,
  riskLevel: 'low',
  events: [],
};
