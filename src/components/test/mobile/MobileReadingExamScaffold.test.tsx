/**
 * Tests for MobileReadingExamScaffold
 * Verifies prop passthrough, callback wiring, derived state, and conditional rendering.
 *
 * @see PRD-0043 Tasks 3.6, 4.5, 4.7
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock child components to isolate scaffold logic
vi.mock('./MobileReadingHeader', () => ({
  MobileReadingHeader: (props: any) => (
    <div data-testid="mock-header" data-paused={props.isPaused} data-submitting={props.isSubmitting}>
      <button type="button" data-testid="mock-header-submit" onClick={props.onSubmitPress} />
      <button type="button" data-testid="mock-header-overflow" onClick={props.onOverflowMenuToggle} />
    </div>
  ),
}));
vi.mock('./MobilePassageTabs', () => ({
  MobilePassageTabs: (props: any) => (
    <div data-testid="mock-passage-tabs" data-active={props.activePassageId}>
      {props.passages.map((p: any) => (
        <button key={p.id} data-testid={`mock-tab-${p.id}`} onClick={() => props.onPassageChange(p.id)} />
      ))}
    </div>
  ),
}));
vi.mock('./MobileQuestionsFab', () => ({
  MobileQuestionsFab: (props: any) => (
    <div
      data-testid="mock-fab"
      data-answered={props.answeredCount}
      data-total={props.totalCount}
      data-unanswered={props.unansweredCount}
      onClick={props.onPress}
    />
  ),
}));
vi.mock('./MobileQuestionSheet', () => ({
  MobileQuestionSheet: (props: any) => (
    <div data-testid="mock-question-sheet" data-open={props.isOpen} data-show-header={props.showHeader}>
      {props.children}
    </div>
  ),
}));
vi.mock('./MobileReviewSummary', () => ({
  MobileReviewSummary: (props: any) => (
    <div data-testid="mock-review-summary">
      <button type="button" data-testid="mock-review-confirm" onClick={props.onConfirmSubmit} />
      <button type="button" data-testid="mock-review-close" onClick={props.onClose} />
      <button
        type="button"
        data-testid="mock-review-chip-jump"
        onClick={() => props.onQuestionChipTap('p2', 5)}
      />
    </div>
  ),
}));
vi.mock('./MobileOverflowMenu', () => ({
  MobileOverflowMenu: (props: any) => (
    <div data-testid="mock-overflow-menu" data-open={props.isOpen}>
      {props.menuItems.map((item: any) => (
        <button
          key={item.key}
          type="button"
          data-testid={`mock-overflow-item-${item.key}`}
          onClick={item.onSelect}
        />
      ))}
      <button type="button" data-testid="mock-overflow-close" onClick={props.onClose} />
    </div>
  ),
}));
vi.mock('./MobileTextSizeControl', () => ({
  MobileTextSizeControl: (props: any) => (
    <div data-testid="mock-text-size-control" data-size={props.currentSize}>
      <button type="button" data-testid="mock-text-size-change" onClick={() => props.onSizeChange(20)} />
      <button type="button" data-testid="mock-text-size-close" onClick={props.onClose} />
    </div>
  ),
}));
vi.mock('./MobileInstructionsModal', () => ({
  MobileInstructionsModal: (props: any) => (
    <div data-testid="mock-instructions-modal" data-open={props.isOpen ? 'true' : 'false'}>
      <button type="button" data-testid="mock-instructions-close" onClick={props.onClose} />
    </div>
  ),
}));
vi.mock('../QuestionNavigator', () => ({
  QuestionNavigator: (props: any) => (
    <div
      data-testid="mock-navigator"
      data-total={props.totalQuestions}
      data-start={props.startNumber}
      data-current={props.currentQuestion}
      data-collapsible={props.collapsible}
    >
      {Array.from({ length: props.totalQuestions }, (_, index) => {
        const questionNumber = (props.startNumber ?? 1) + index;
        return (
          <button
            key={questionNumber}
            data-testid={`mock-nav-question-${questionNumber}`}
            onClick={() => props.onQuestionClick(questionNumber)}
          />
        );
      })}
    </div>
  ),
}));
vi.mock('../IELTSQuestionsPanel', () => ({
  IELTSQuestionsPanel: (props: any) => (
    <div
      data-testid="mock-questions-panel"
      data-passage={props.currentPassageId}
      data-embedded={props.embedded}
      data-active-question={props.activeQuestionNumber}
      data-font-size={props.fontSize}
      data-line-spacing={props.lineSpacing}
    >
      <button
        data-testid="mock-panel-layout-sync"
        onClick={() => props.onQuestionGroupLayoutChange?.(
          props.currentPassageId === 'p1'
            ? [
              { startNumber: 1, topOffset: 0 },
              { startNumber: 3, topOffset: 240 },
            ]
            : [{ startNumber: 4, topOffset: 0 }]
        )}
      />
    </div>
  ),
}));

import { MobileReadingExamScaffold } from './MobileReadingExamScaffold';

// ── Test Helpers ────────────────────────────────────────────────────────────

const DummyPassageRenderer = (props: any) => (
  <div data-testid="mock-passage-renderer" data-font-size={props.fontSize} />
);

function makeBaseProps(overrides: Partial<any> = {}) {
  return {
    mode: 'live' as const,
    passages: [
      { id: 'p1', title: 'Wildlife' },
      { id: 'p2', title: 'Technology' },
    ],
    questions: [
      { number: 1, passageId: 'p1', type: 'true-false-not-given' },
      { number: 2, passageId: 'p1', type: 'true-false-not-given' },
      { number: 3, passageId: 'p1', type: 'multiple-choice' },
      { number: 4, passageId: 'p2', type: 'multiple-choice' },
      { number: 5, passageId: 'p2', type: 'multiple-choice' },
    ],
    totalQuestions: 5,
    activePassageId: 'p1',
    onPassageChange: vi.fn(),
    currentPassage: { id: 'p1', text: 'passage text' },
    PassageRendererComponent: DummyPassageRenderer,
    answers: {} as Record<number, any>,
    onAnswerChange: vi.fn(),
    activeQuestionNumber: 1,
    onQuestionClick: vi.fn(),
    timeRemaining: 3600,
    formatTime: (s: number) => `${Math.floor(s / 60)}:00`,
    testSubmitted: false,
    isSubmitting: false,
    onManualSubmit: vi.fn(),
    onAutoSubmit: vi.fn(),
    isConnected: true,
    sessionStatus: 'in-progress',
    isPaused: false,
    fontSize: 16,
    lineSpacing: 1.6,
    highlighterActive: false,
    highlightColor: '#ffeb3b',
    clearHighlightsTrigger: 0,
    questionSheetOpen: false,
    onOpenQuestionSheet: vi.fn(),
    onCloseQuestionSheet: vi.fn(),
    reviewSummaryOpen: false,
    onOpenReviewSummary: vi.fn(),
    onCloseReviewSummary: vi.fn(),
    overflowMenuOpen: false,
    onOpenOverflowMenu: vi.fn(),
    onCloseOverflowMenu: vi.fn(),
    textSizeControlOpen: false,
    onOpenTextSizeControl: vi.fn(),
    onCloseTextSizeControl: vi.fn(),
    instructionsOpen: false,
    onOpenInstructions: vi.fn(),
    onCloseInstructions: vi.fn(),
    onTextSizeChange: vi.fn(),
    onLeaveTest: vi.fn(),
    passageScrollByPassage: {},
    onPassageScroll: vi.fn(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MobileReadingExamScaffold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders scaffold root with correct testid', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    expect(screen.getByTestId('mobile-reading-scaffold')).toBeTruthy();
  });

  it('provides the shared mobile layering vars on the scaffold root', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    const rootStyle = screen.getByTestId('mobile-reading-scaffold').getAttribute('style') ?? '';
    expect(rootStyle).toContain('--mobile-reading-layer-fab: 1000');
    expect(rootStyle).toContain('--mobile-reading-layer-sheet-backdrop: 2000');
    expect(rootStyle).toContain('--mobile-reading-layer-sheet: 2001');
    expect(rootStyle).toContain('--mobile-reading-layer-review-summary: 2002');
    expect(rootStyle).toContain('--mobile-reading-layer-overflow-menu: 4000');
    expect(rootStyle).toContain('--mobile-reading-layer-utility-modal: 4500');
    expect(rootStyle).toContain('--mobile-reading-layer-final-confirm-modal: 9500');
  });

  it('renders the mobile submit button in the header and wires submitting state through', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    const header = screen.getByTestId('mock-header');
    expect(screen.getByTestId('mock-header-submit')).toBeTruthy();
    expect(header.getAttribute('data-submitting')).toBe('false');
  });

  it('renders passage tabs with correct active passage', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    const tabs = screen.getAllByTestId('mock-passage-tabs');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].getAttribute('data-active')).toBe('p1');
  });

  it('renders passage renderer with fontSize', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ fontSize: 20 })} />);
    const renderer = screen.getByTestId('mock-passage-renderer');
    expect(renderer.getAttribute('data-font-size')).toBe('20');
  });

  it('renders FAB when test is not submitted', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    expect(screen.getByTestId('mock-fab')).toBeTruthy();
  });

  it('hides FAB when test is submitted', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ testSubmitted: true })} />);
    expect(screen.queryByTestId('mock-fab')).toBeNull();
  });

  it('computes per-passage FAB counts correctly', () => {
    const answers = { 1: 'T', 3: 'F' }; // 2 of 3 for passage p1
    render(<MobileReadingExamScaffold {...makeBaseProps({ answers })} />);
    const fab = screen.getByTestId('mock-fab');
    expect(fab.getAttribute('data-answered')).toBe('2');
    expect(fab.getAttribute('data-total')).toBe('3');
    expect(fab.getAttribute('data-unanswered')).toBe('1');
  });

  it('FAB onPress calls onOpenQuestionSheet', () => {
    const onOpen = vi.fn();
    render(<MobileReadingExamScaffold {...makeBaseProps({ onOpenQuestionSheet: onOpen })} />);
    fireEvent.click(screen.getByTestId('mock-fab'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders question sheet with open state from props', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ questionSheetOpen: true })} />);
    const sheet = screen.getByTestId('mock-question-sheet');
    expect(sheet.getAttribute('data-open')).toBe('true');
    expect(sheet.getAttribute('data-show-header')).toBe('false');
  });

  it('retries initial resume scroll restoration until passage and sheet scroll positions stick', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    const scrollValues = new WeakMap<object, number>();
    const setCounts = new WeakMap<object, number>();

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollValues.get(this) ?? 0;
      },
      set(value: number) {
        const nextCount = (setCounts.get(this) ?? 0) + 1;
        setCounts.set(this, nextCount);
        scrollValues.set(this, nextCount >= 3 ? Number(value) : 0);
      },
    });

    try {
      render(<MobileReadingExamScaffold {...makeBaseProps({
        activePassageId: 'p2',
        currentPassage: { id: 'p2', text: 'passage two' },
        questionSheetOpen: true,
        passageScrollByPassage: { p2: 120 },
        questionSheetScrollByPassage: { p2: 240 },
      })} />);

      expect(screen.getByTestId('mobile-passage-content').scrollTop).toBe(120);
      expect(screen.getByTestId('mobile-sheet-question-body').scrollTop).toBe(240);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalDescriptor);
      }
    }
  });

  it('renders navigator with correct startNumber for passage 2', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ activePassageId: 'p2' })} />);
    const nav = screen.getByTestId('mock-navigator');
    expect(nav.getAttribute('data-total')).toBe('2'); // Q4, Q5
    expect(nav.getAttribute('data-start')).toBe('4'); // min(4,5)
  });

  it('renders questions panel with embedded mode', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    const panel = screen.getByTestId('mock-questions-panel');
    expect(panel.getAttribute('data-embedded')).toBe('true');
    expect(panel.getAttribute('data-passage')).toBe('p1');
  });

  it('keeps only the compact navigator row at the top of the question sheet', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps()} />);
    expect(screen.getByTestId('mobile-sheet-navigator')).toBeTruthy();
    expect(screen.queryByTestId('mobile-sheet-info-bar')).toBeNull();
    expect(screen.getAllByTestId('mock-passage-tabs')).toHaveLength(1);
  });

  it('applies antiSelectClass to scaffold root', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ antiSelectClass: 'anti-select' })} />);
    const scaffold = screen.getByTestId('mobile-reading-scaffold');
    expect(scaffold.className).toContain('anti-select');
  });

  it('renders "No passage selected" when currentPassage is null', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({ currentPassage: null })} />);
    expect(screen.getByText('No passage selected')).toBeTruthy();
  });

  it('fires onPassageChange when a passage tab is clicked', () => {
    const onChange = vi.fn();
    render(<MobileReadingExamScaffold {...makeBaseProps({ onPassageChange: onChange })} />);
    fireEvent.click(screen.getByTestId('mock-tab-p2'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('saves the current passage scroll before a tab-driven passage switch', () => {
    const onPassageChange = vi.fn();
    const onPassageScroll = vi.fn();

    render(<MobileReadingExamScaffold {...makeBaseProps({
      onPassageChange,
      onPassageScroll,
    })} />);

    const passageBody = screen.getByTestId('mobile-passage-content');
    Object.defineProperty(passageBody, 'scrollTop', {
      configurable: true,
      value: 144,
      writable: true,
    });

    fireEvent.click(screen.getAllByTestId('mock-tab-p2')[0]);

    expect(onPassageScroll).toHaveBeenCalledWith('p1', 144);
    expect(onPassageChange).toHaveBeenCalledWith('p2');
  });

  it('uses the header overflow action to open the overflow menu', () => {
    const onOpenOverflowMenu = vi.fn();

    render(<MobileReadingExamScaffold {...makeBaseProps({
      onOpenOverflowMenu,
    })} />);

    fireEvent.click(screen.getByTestId('mock-header-overflow'));

    expect(onOpenOverflowMenu).toHaveBeenCalledTimes(1);
  });

  it('uses the header submit action to open the review summary flow', () => {
    const onOpenReviewSummary = vi.fn();

    render(<MobileReadingExamScaffold {...makeBaseProps({
      onOpenReviewSummary,
    })} />);

    fireEvent.click(screen.getByTestId('mock-header-submit'));

    expect(onOpenReviewSummary).toHaveBeenCalledTimes(1);
  });

  it('closes overlays and triggers auto-submit once when time runs out in the scaffold', () => {
    const onCloseQuestionSheet = vi.fn();
    const onCloseReviewSummary = vi.fn();
    const onCloseOverflowMenu = vi.fn();
    const onCloseTextSizeControl = vi.fn();
    const onCloseInstructions = vi.fn();
    const onAutoSubmit = vi.fn();
    const { rerender } = render(<MobileReadingExamScaffold {...makeBaseProps({
      questionSheetOpen: true,
      reviewSummaryOpen: true,
      overflowMenuOpen: true,
      textSizeControlOpen: true,
      instructionsOpen: true,
      timeRemaining: 0,
      onCloseQuestionSheet,
      onCloseReviewSummary,
      onCloseOverflowMenu,
      onCloseTextSizeControl,
      onCloseInstructions,
      onAutoSubmit,
    })} />);

    expect(onCloseQuestionSheet).toHaveBeenCalledTimes(1);
    expect(onCloseReviewSummary).toHaveBeenCalledTimes(1);
    expect(onCloseOverflowMenu).toHaveBeenCalledTimes(1);
    expect(onCloseTextSizeControl).toHaveBeenCalledTimes(1);
    expect(onCloseInstructions).toHaveBeenCalledTimes(1);
    expect(onAutoSubmit).toHaveBeenCalledTimes(1);

    rerender(<MobileReadingExamScaffold {...makeBaseProps({
      questionSheetOpen: true,
      reviewSummaryOpen: true,
      overflowMenuOpen: true,
      textSizeControlOpen: true,
      instructionsOpen: true,
      timeRemaining: 0,
      onCloseQuestionSheet,
      onCloseReviewSummary,
      onCloseOverflowMenu,
      onCloseTextSizeControl,
      onCloseInstructions,
      onAutoSubmit,
    })} />);

    expect(onAutoSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders the review summary from host state and routes chip jumps back through host callbacks', () => {
    const onPassageChange = vi.fn();
    const onOpenQuestionSheet = vi.fn();
    const onCloseReviewSummary = vi.fn();
    const onQuestionClick = vi.fn();
    const onActiveQuestionGroupChange = vi.fn();

    render(<MobileReadingExamScaffold {...makeBaseProps({
      reviewSummaryOpen: true,
      onPassageChange,
      onOpenQuestionSheet,
      onCloseReviewSummary,
      onQuestionClick,
      onActiveQuestionGroupChange,
    })} />);

    expect(screen.getByTestId('mock-review-summary')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mock-review-chip-jump'));

    expect(onCloseReviewSummary).toHaveBeenCalledTimes(1);
    expect(onPassageChange).toHaveBeenCalledWith('p2');
    expect(onActiveQuestionGroupChange).toHaveBeenCalledWith('p2', 4);
    expect(onQuestionClick).toHaveBeenCalledWith(5);
    expect(onOpenQuestionSheet).toHaveBeenCalledTimes(1);
  });

  it('wires overflow actions into the host-owned callbacks', () => {
    const onOpenTextSizeControl = vi.fn();
    const onOpenReviewSummary = vi.fn();
    const onOpenInstructions = vi.fn();
    const onLeaveTest = vi.fn();

    render(<MobileReadingExamScaffold {...makeBaseProps({
      overflowMenuOpen: true,
      onOpenTextSizeControl,
      onOpenReviewSummary,
      onOpenInstructions,
      onLeaveTest,
    })} />);

    fireEvent.click(screen.getByTestId('mock-overflow-item-text-size'));
    fireEvent.click(screen.getByTestId('mock-overflow-item-review-answers'));
    fireEvent.click(screen.getByTestId('mock-overflow-item-instructions-help'));
    fireEvent.click(screen.getByTestId('mock-overflow-item-leave-test'));

    expect(onOpenTextSizeControl).toHaveBeenCalledTimes(1);
    expect(onOpenReviewSummary).toHaveBeenCalledTimes(1);
    expect(onOpenInstructions).toHaveBeenCalledTimes(1);
    expect(onLeaveTest).toHaveBeenCalledTimes(1);
  });

  it('passes font size and fixed line spacing into the embedded question panel', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({
      fontSize: 18,
      lineSpacing: 1.6,
    })} />);

    const panel = screen.getByTestId('mock-questions-panel');
    expect(panel.getAttribute('data-font-size')).toBe('18');
    expect(panel.getAttribute('data-line-spacing')).toBe('1.6');
  });

  // ── Task 4.6: Per-passage question group memory ──────────────────────────

  it('uses the saved active question group for the current passage when available', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({
      activeQuestionGroupByPassage: { p1: 3 },
    })} />);
    const nav = screen.getByTestId('mock-navigator');
    expect(nav.getAttribute('data-current')).toBe('3');
    const panel = screen.getByTestId('mock-questions-panel');
    expect(panel.getAttribute('data-active-question')).toBe('3');
  });

  it('defaults to the first unanswered question group when no saved group exists (FR-52)', () => {
    // Q1 answered but Q2 is in the same group, so the first unanswered group still starts at Q1.
    render(<MobileReadingExamScaffold {...makeBaseProps({
      answers: { 1: 'T' },
    })} />);
    const nav = screen.getByTestId('mock-navigator');
    expect(nav.getAttribute('data-current')).toBe('1');
  });

  it('defaults to the next group start after the first group is fully answered', () => {
    render(<MobileReadingExamScaffold {...makeBaseProps({
      answers: { 1: 'T', 2: 'F' },
    })} />);
    const nav = screen.getByTestId('mock-navigator');
    expect(nav.getAttribute('data-current')).toBe('3');
  });

  it('remembers the group start, not the tapped question number, when navigating inside a group', () => {
    const onActiveQuestionGroupChange = vi.fn();
    const onQClick = vi.fn();
    render(<MobileReadingExamScaffold {...makeBaseProps({
      onActiveQuestionGroupChange,
      onQuestionClick: onQClick,
    })} />);
    fireEvent.click(screen.getByTestId('mock-nav-question-2'));
    expect(onActiveQuestionGroupChange).toHaveBeenCalledWith('p1', 1);
    expect(onQClick).toHaveBeenCalledWith(2);
  });

  it('tracks the visible group from sheet scroll offsets reported by the question panel', () => {
    const onActiveQuestionGroupChange = vi.fn();
    render(<MobileReadingExamScaffold {...makeBaseProps({
      questionSheetOpen: true,
      onActiveQuestionGroupChange,
    })} />);

    fireEvent.click(screen.getByTestId('mock-panel-layout-sync'));

    const sheetBody = screen.getByTestId('mobile-sheet-question-body');
    Object.defineProperty(sheetBody, 'scrollTop', {
      configurable: true,
      value: 260,
      writable: true,
    });
    fireEvent.scroll(sheetBody);

    expect(onActiveQuestionGroupChange).toHaveBeenLastCalledWith('p1', 3);
  });

  it('saves the outgoing group and sheet scroll when switching passages with the sheet open', () => {
    const onActiveQuestionGroupChange = vi.fn();
    const onQuestionSheetScroll = vi.fn();
    const onPassageScroll = vi.fn();
    const { rerender } = render(<MobileReadingExamScaffold {...makeBaseProps({
      questionSheetOpen: true,
      activeQuestionGroupByPassage: { p1: 3, p2: 4 },
      onActiveQuestionGroupChange,
      onQuestionSheetScroll,
      onPassageScroll,
    })} />);

    const sheetBody = screen.getByTestId('mobile-sheet-question-body');
    Object.defineProperty(sheetBody, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    });

    const passageBody = screen.getByTestId('mobile-passage-content');
    Object.defineProperty(passageBody, 'scrollTop', {
      configurable: true,
      value: 90,
      writable: true,
    });

    rerender(<MobileReadingExamScaffold {...makeBaseProps({
      activePassageId: 'p2',
      currentPassage: { id: 'p2', text: 'passage two' },
      questionSheetOpen: true,
      activeQuestionGroupByPassage: { p1: 3, p2: 4 },
      onActiveQuestionGroupChange,
      onQuestionSheetScroll,
      onPassageScroll,
      passageScrollByPassage: { p2: 12 },
      questionSheetScrollByPassage: { p2: 24 },
    })} />);

    expect(onPassageScroll).toHaveBeenCalledWith('p1', 90);
    expect(onQuestionSheetScroll).toHaveBeenCalledWith('p1', 180);
    expect(onActiveQuestionGroupChange).toHaveBeenCalledWith('p1', 3);
    expect(screen.getByTestId('mock-navigator').getAttribute('data-current')).toBe('4');
    expect(screen.getByTestId('mobile-passage-content').scrollTop).toBe(12);
    expect(screen.getByTestId('mobile-sheet-question-body').scrollTop).toBe(24);
  });
});
