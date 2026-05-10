/**
 * Mobile Listening z-index layering contract.
 *
 * Mirrors the Reading layering approach (mobileReadingLayering.ts)
 * but uses a dedicated namespace so Listening and Reading scaffolds
 * remain independent per PRD-0045 FR-68.
 */

export const MOBILE_LISTENING_LAYER_Z_INDEX = {
  /** Sticky header (row 1) */
  HEADER: 1100,
  /** Audio row (row 2) — always visible beneath header */
  AUDIO_ROW: 1050,
  /** Part tabs (row 3) */
  PART_TABS: 1040,
  /** Floating Questions FAB (image mode only) */
  FAB: 1000,
  /** Answer sheet backdrop (image mode) */
  SHEET_BACKDROP: 2000,
  /** Answer sheet panel (image mode) */
  SHEET: 2001,
  /** Submit confirmation sheet */
  SUBMIT_SHEET: 2002,
  /** Submit sheet backdrop */
  SUBMIT_SHEET_BACKDROP: 2000,
  /** Overflow menu */
  OVERFLOW_MENU: 4000,
  /** Utility modal (text size, instructions) */
  UTILITY_MODAL: 4500,
  /** System overlay (pause, wait, blocking states) */
  SYSTEM_OVERLAY: 9000,
} as const;
