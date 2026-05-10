/**
 * Tests for MobileListeningExamScaffold — PRD-0045 Task 2.1
 *
 * Covers:
 *   - 4-row layout: header, audio row, part tabs, main content
 *   - Overlay rendering: submit sheet, overflow, text size, instructions
 *   - Props forwarded correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { MobileListeningExamScaffold } from './MobileListeningExamScaffold';
import type { MobileListeningExamScaffoldProps } from './MobileListeningExamScaffold';

// ── MobileOverflowMenu, MobileTextSizeControl, MobileInstructionsModal
//    These are tested independently; here we just verify the scaffold renders them.

const defaultProps = (): MobileListeningExamScaffoldProps => ({
  mode: 'solo',
  activePartNumber: 1,
  onPartChange: vi.fn(),
  playingPartNumber: 1,
  timeRemaining: 1800,
  formatTime: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  answers: {},
  partInfos: [
    { partNumber: 1, questionNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    { partNumber: 2, questionNumbers: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
    { partNumber: 3, questionNumbers: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
    { partNumber: 4, questionNumbers: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40] },
  ],
  testSubmitted: false,
  isSubmitting: false,
  onConfirmSubmit: vi.fn(),
  isPaused: false,
  isWaiting: false,
  audioRowContent: React.createElement('div', { 'data-testid': 'audio-player' }, 'Audio controls'),
  mainContent: React.createElement('div', { 'data-testid': 'main-questions' }, 'Questions here'),
  submitSheetOpen: false,
  onOpenSubmitSheet: vi.fn(),
  onCloseSubmitSheet: vi.fn(),
  overflowMenuOpen: false,
  onOpenOverflowMenu: vi.fn(),
  onCloseOverflowMenu: vi.fn(),
  textSizeControlOpen: false,
  onOpenTextSizeControl: vi.fn(),
  onCloseTextSizeControl: vi.fn(),
  instructionsOpen: false,
  onOpenInstructions: vi.fn(),
  onCloseInstructions: vi.fn(),
  fontSize: 16,
  onTextSizeChange: vi.fn(),
  onLeaveTest: vi.fn(),
});

describe('MobileListeningExamScaffold', () => {
  it('renders the 4-row layout', () => {
    const { getByTestId } = render(<MobileListeningExamScaffold {...defaultProps()} />);
    expect(getByTestId('mobile-listening-scaffold')).toBeTruthy();
    expect(getByTestId('mobile-listening-header')).toBeTruthy();
    expect(getByTestId('mobile-listening-audio-row')).toBeTruthy();
    expect(getByTestId('mobile-listening-part-tabs')).toBeTruthy();
    expect(getByTestId('mobile-listening-main-content')).toBeTruthy();
  });

  it('renders host-provided audio row content', () => {
    const { getByTestId } = render(<MobileListeningExamScaffold {...defaultProps()} />);
    expect(getByTestId('audio-player').textContent).toBe('Audio controls');
  });

  it('renders host-provided main content', () => {
    const { getByTestId } = render(<MobileListeningExamScaffold {...defaultProps()} />);
    expect(getByTestId('main-questions').textContent).toBe('Questions here');
  });

  it('renders submit sheet when submitSheetOpen=true', () => {
    const { getByTestId } = render(
      <MobileListeningExamScaffold {...defaultProps()} submitSheetOpen={true} />,
    );
    expect(getByTestId('mobile-listening-submit-sheet')).toBeTruthy();
  });

  it('does NOT render submit sheet when submitSheetOpen=false', () => {
    const { queryByTestId } = render(
      <MobileListeningExamScaffold {...defaultProps()} submitSheetOpen={false} />,
    );
    expect(queryByTestId('mobile-listening-submit-sheet')).toBeNull();
  });

  it('renders text size control when textSizeControlOpen=true', () => {
    const { getByTestId } = render(
      <MobileListeningExamScaffold {...defaultProps()} textSizeControlOpen={true} />,
    );
    expect(getByTestId('mobile-text-size-control')).toBeTruthy();
  });

  it('forwards part tab change to onPartChange', () => {
    const onPartChange = vi.fn();
    const { getByTestId } = render(
      <MobileListeningExamScaffold {...defaultProps()} onPartChange={onPartChange} />,
    );
    fireEvent.click(getByTestId('listening-part-tab-3'));
    expect(onPartChange).toHaveBeenCalledWith(3);
  });

  it('header submit press triggers onOpenSubmitSheet', () => {
    const onOpenSubmitSheet = vi.fn();
    const { getByTestId } = render(
      <MobileListeningExamScaffold {...defaultProps()} onOpenSubmitSheet={onOpenSubmitSheet} />,
    );
    fireEvent.click(getByTestId('mobile-listening-header-submit'));
    expect(onOpenSubmitSheet).toHaveBeenCalledOnce();
  });
});
