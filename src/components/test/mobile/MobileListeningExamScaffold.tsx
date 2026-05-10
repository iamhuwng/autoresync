/**
 * MobileListeningExamScaffold — Phone-Optimized Listening Exam Layout
 *
 * Pure presentation scaffold consumed by both live and solo/homework hosts.
 * All state is owned by the host components (ListeningTestPage /
 * ListeningPracticeView) and passed as props.
 *
 * This component must NOT import Firebase, storage, router hooks,
 * autosave hooks, submission hooks, or services (PRD-0045 FR-69).
 *
 * Row structure (PRD-0045 Section 6):
 *   Row 1: Header (timer, submit, overflow)
 *   Row 2: Audio row (host-provided audio component)
 *   Row 3: Part tabs (Part 1-4)
 *   Row 4: Main content area (direct-question or image mode)
 *
 * @see PRD-0045 Task 2.1-2.2, FR-68, FR-69
 */

import React from 'react';
import { MobileListeningHeader } from './MobileListeningHeader';
import { MobileListeningPartTabs } from './MobileListeningPartTabs';
import { MobileListeningSubmitSheet } from './MobileListeningSubmitSheet';
import type { ListeningPartInfo } from './MobileListeningSubmitSheet';
import { MobileOverflowMenu } from './MobileOverflowMenu';
import type { MobileOverflowMenuItem } from './MobileOverflowMenu';
import { MobileTextSizeControl } from './MobileTextSizeControl';
import { MobileInstructionsModal } from './MobileInstructionsModal';
import type { PracticeContext } from '../../practice/IELTSPracticeView';
import type { ResolvedPracticeSettings } from '../../../types/practice.types';

// ── Scaffold Props ──────────────────────────────────────────────────────────

export interface MobileListeningExamScaffoldProps {
  // ── Mode & Identity ─────────────────────────────────────────────────────
  /** Live session, solo practice, or homework */
  mode: 'live' | 'solo' | 'homework';

  // ── Part State (host-owned) ─────────────────────────────────────────────
  /** Currently viewed part number (1-based) */
  activePartNumber: number;
  /** Callback when user switches parts via tabs */
  onPartChange: (partNumber: number) => void;
  /** Currently playing audio part number (1-based), shown in audio row UI */
  playingPartNumber: number;

  // ── Timer State (host-owned) ────────────────────────────────────────────
  /** Remaining time in seconds */
  timeRemaining: number;
  /** Timer formatter function */
  formatTime: (seconds: number) => string;

  // ── Answer State (host-owned) ───────────────────────────────────────────
  /** Current answers keyed by question number */
  answers: Record<number, unknown>;
  /** Part info for submit sheet counts */
  partInfos: ListeningPartInfo[];

  // ── Submission State (host-owned) ───────────────────────────────────────
  /** Whether the test has been submitted */
  testSubmitted: boolean;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Submit handler — called from the submit sheet confirm button */
  onConfirmSubmit: () => void | Promise<void>;

  // ── Session State (host-owned) ──────────────────────────────────────────
  /** Whether the test is paused (teacher-driven live; always false for solo) */
  isPaused: boolean;
  /** Whether wait state is active */
  isWaiting: boolean;

  // ── Audio Row (host-provided) ───────────────────────────────────────────
  /** Host-rendered audio row content (row 2). The scaffold renders the
   *  container; the host provides the actual audio player component. */
  audioRowContent: React.ReactNode;

  // ── Main Content Area (host-provided) ───────────────────────────────────
  /** Host-rendered main content (direct-question groups or image canvas) */
  mainContent: React.ReactNode;

  // ── Mobile Shell State (host-owned) ─────────────────────────────────────
  submitSheetOpen: boolean;
  onOpenSubmitSheet: () => void;
  onCloseSubmitSheet: () => void;
  overflowMenuOpen: boolean;
  onOpenOverflowMenu: () => void;
  onCloseOverflowMenu: () => void;
  textSizeControlOpen: boolean;
  onOpenTextSizeControl: () => void;
  onCloseTextSizeControl: () => void;
  instructionsOpen: boolean;
  onOpenInstructions: () => void;
  onCloseInstructions: () => void;

  // ── Display State (host-owned) ──────────────────────────────────────────
  /** Font size for question text */
  fontSize: number;
  /** Callback to change font size */
  onTextSizeChange: (size: number) => void;
  /** Leave test handler */
  onLeaveTest: () => void;

  // ── Anti-cheat (host-owned) ────────────────────────────────────────────
  /** CSS class to apply to root for anti-select (e.g. 'anti-select') */
  antiSelectClass?: string;

  // ── Part count (host-owned) ────────────────────────────────────────────
  /** Number of parts/sections in this test (derived from audioSections.length).
   *  Forwarded to MobileListeningPartTabs. Defaults to 4. */
  partCount?: number;

  // ── Practice context (for instructions modal) ──────────────────────────
  practiceContext?: PracticeContext;
  resolvedSettings?: ResolvedPracticeSettings;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const scaffoldRootStyle: React.CSSProperties = {
  height: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  background: '#f8fafc',
  position: 'relative',
  overflow: 'hidden',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const audioRowStyle: React.CSSProperties = {
  flexShrink: 0,
  background: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
};

const mainContentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};


// ── Component ───────────────────────────────────────────────────────────────

export const MobileListeningExamScaffold: React.FC<MobileListeningExamScaffoldProps> = ({
  mode,
  activePartNumber,
  onPartChange,
  timeRemaining,
  formatTime,
  answers,
  partInfos,
  testSubmitted,
  isSubmitting,
  onConfirmSubmit,
  isPaused,
  isWaiting,
  audioRowContent,
  mainContent,
  submitSheetOpen,
  onOpenSubmitSheet,
  onCloseSubmitSheet,
  overflowMenuOpen,
  onCloseOverflowMenu,
  onOpenOverflowMenu,
  textSizeControlOpen,
  onOpenTextSizeControl,
  onCloseTextSizeControl,
  instructionsOpen,
  onOpenInstructions,
  onCloseInstructions,
  fontSize,
  onTextSizeChange,
  onLeaveTest,
  antiSelectClass,
  partCount,
  practiceContext,
  resolvedSettings,
}) => {
  // ── Build overflow menu items matching MobileOverflowMenuItem contract ───
  const overflowMenuItems: MobileOverflowMenuItem[] = [
    {
      key: 'instructions',
      label: 'Instructions',
      onSelect: () => {
        onCloseOverflowMenu();
        onOpenInstructions();
      },
    },
    {
      key: 'textSize',
      label: 'Text size',
      onSelect: () => {
        onCloseOverflowMenu();
        onOpenTextSizeControl();
      },
    },
    {
      key: 'leaveTest',
      label: 'Leave test',
      destructive: true,
      onSelect: () => {
        onCloseOverflowMenu();
        onLeaveTest();
      },
    },
  ];

  return (
    <div
      data-testid="mobile-listening-scaffold"
      className={antiSelectClass}
      style={scaffoldRootStyle}
    >
      {/* Row 1: Header */}
      <MobileListeningHeader
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        onSubmitPress={onOpenSubmitSheet}
        onOverflowMenuToggle={() => {
          if (overflowMenuOpen) {
            onCloseOverflowMenu();
          } else {
            onOpenOverflowMenu();
          }
        }}
        isPaused={isPaused}
        isWaiting={isWaiting}
        isSubmitting={isSubmitting}
        testSubmitted={testSubmitted}
      />

      {/* Row 2: Audio row — always visible (PRD FR-9, Task 2.7) */}
      <div
        data-testid="mobile-listening-audio-row"
        style={audioRowStyle}
      >
        {audioRowContent}
      </div>

      {/* Row 3: Part tabs — always visible (PRD FR-12, Task 2.7) */}
      <MobileListeningPartTabs
        activePartNumber={activePartNumber}
        onPartChange={onPartChange}
        partCount={partCount}
      />

      {/* Row 4: Main content area */}
      <div
        data-testid="mobile-listening-main-content"
        style={mainContentStyle}
      >
        {mainContent}
      </div>

      {/* ── Overlay surfaces ─────────────────────────────────────────────── */}

      {/* Submit confirmation bottom sheet */}
      {submitSheetOpen && (
        <MobileListeningSubmitSheet
          parts={partInfos}
          answers={answers}
          onConfirmSubmit={onConfirmSubmit}
          onClose={onCloseSubmitSheet}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Overflow menu */}
      <MobileOverflowMenu
        isOpen={overflowMenuOpen}
        onClose={onCloseOverflowMenu}
        menuItems={overflowMenuItems}
      />

      {/* Text size control */}
      {textSizeControlOpen && (
        <MobileTextSizeControl
          currentSize={fontSize}
          onSizeChange={onTextSizeChange}
          onClose={onCloseTextSizeControl}
        />
      )}

      {/* Instructions modal */}
      <MobileInstructionsModal
        isOpen={instructionsOpen}
        onClose={onCloseInstructions}
        mode={mode}
        practiceContext={practiceContext}
        resolvedSettings={resolvedSettings}
      />
    </div>
  );
};

export default MobileListeningExamScaffold;
