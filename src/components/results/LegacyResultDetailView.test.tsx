import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyResultDetailView } from './LegacyResultDetailView';

const {
  generateCertificatePDFMock,
  isPDFGenerationAvailableMock,
  useResultOwnershipCheckMock,
  mockOnValue,
  mockRef,
} = vi.hoisted(() => ({
  generateCertificatePDFMock: vi.fn(),
  isPDFGenerationAvailableMock: vi.fn(),
  useResultOwnershipCheckMock: vi.fn(),
  mockOnValue: vi.fn(),
  mockRef: vi.fn((_db: any, path: string) => ({ path })),
}));

vi.mock('firebase/database', () => ({
  ref: mockRef,
  onValue: mockOnValue,
  get: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
  db: {},
}));

vi.mock('../../services/testResults.service', () => ({
  getHistoricalScores: vi.fn().mockResolvedValue([]),
  getClassTestScores: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../utils/pdfCertificate', () => ({
  generateCertificatePDF: (...args: unknown[]) => generateCertificatePDFMock(...args),
  isPDFGenerationAvailable: (...args: unknown[]) => isPDFGenerationAvailableMock(...args),
}));

vi.mock('../../hooks/useOwnershipCheck', () => ({
  useResultOwnershipCheck: (...args: unknown[]) => useResultOwnershipCheckMock(...args),
}));

vi.mock('../test/WritingSpeakingPlaceholder', () => ({
  WritingSpeakingPlaceholder: () => <div>Writing speaking placeholder</div>,
}));

vi.mock('../../utils/rtdbAccessLost', () => ({
  isPermissionDeniedError: (err: any) =>
    err?.message?.includes?.('PERMISSION_DENIED') || err?.code === 'PERMISSION_DENIED',
}));

vi.mock('../../services/formativeFeedback.service', () => ({
  needsAiFeedbackUpgrade: vi.fn(() => false),
  getPreferredQuestionExplanation: vi.fn(() => null),
  getRenderableQuestionExplanations: vi.fn(() => ({})),
}));

vi.mock('@/core/platform', () => ({
  useScreenSize: () => ({ isMobile: false, isTablet: false, isDesktop: true, width: 1200, height: 800 }),
}));

vi.mock('../../hooks/useHistoricalScores', () => ({
  useHistoricalScores: () => ({ scores: [], loading: false }),
}));

vi.mock('../../hooks/useClassPosition', () => ({
  useClassPosition: () => ({ average: null, totalStudents: 0, position: null, loading: false }),
}));

vi.mock('./ResultContextBadge', () => ({
  ResultContextBadge: ({ contextType }: { contextType: string }) => <div>{`Context: ${contextType}`}</div>,
}));

const printMock = vi.fn();

function makeResult() {
  return {
    resultId: 'res-1',
    studentId: 'student-1',
    testTitle: 'Reading Test 1',
    testType: 'ielts-reading',
    testSkill: 'reading',
    totalScore: 32,
    maxScore: 40,
    percentage: 80,
    correct: 32,
    partialCredit: 0,
    incorrect: 8,
    questionResults: [
      {
        questionNumber: 1,
        questionType: 'mcq',
        isCorrect: false,
        score: 0,
        maxScore: 1,
        studentAnswer: 'A',
        correctAnswer: 'B',
        feedback: 'Review passage detail.',
      },
    ],
    overallFeedback: 'Teacher overall feedback',
    feedbackUpdatedBy: 'Teacher One',
    feedbackUpdatedAt: 1_710_000_000_000,
    context: { type: 'homework' },
    courseName: 'IELTS Prep',
    className: 'Class A',
  };
}

/**
 * Helper to simulate onValue calling the success callback
 */
function simulateOnValueSuccess(data: any) {
  const successCb = mockOnValue.mock.calls[0]?.[1];
  if (successCb) {
    act(() => {
      successCb({
        exists: () => data !== null,
        val: () => data,
      });
    });
  }
}

/**
 * Helper to simulate onValue calling the error callback
 */
function simulateOnValueError(error: any) {
  const errorCb = mockOnValue.mock.calls[0]?.[2];
  if (errorCb) {
    act(() => {
      errorCb(error);
    });
  }
}

function renderView(props: { resultId?: string; onReturn?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/result/res-1']}>
      <Routes>
        <Route
          path="/result/:resultId"
          element={
            <LegacyResultDetailView
              resultId={props.resultId ?? 'res-1'}
              onReturn={props.onReturn}
            />
          }
        />
        <Route path="/access-denied" element={<div>Access denied page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LegacyResultDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPDFGenerationAvailableMock.mockResolvedValue(true);
    useResultOwnershipCheckMock.mockReturnValue({
      allowed: true,
      loading: false,
      denialReason: null,
    });
    // Default: onValue returns an unsubscribe fn
    mockOnValue.mockReturnValue(vi.fn());
    Object.defineProperty(window, 'print', {
      value: printMock,
      writable: true,
    });
  });

  it('renders the legacy full-page result details when ownership is allowed', async () => {
    renderView();
    simulateOnValueSuccess(makeResult());

    expect(await screen.findByText('Reading Test 1')).toBeInTheDocument();
    // SharedSavedResultCore renders ReviewTab (incorrect banner) instead of old inline "Question Review" heading
    expect(screen.getByTestId('rv-incorrect-banner')).toBeInTheDocument();
    // Teacher feedback rendered by TeacherFeedbackCard in SharedSavedResultCore
    expect(screen.getByText('Teacher overall feedback')).toBeInTheDocument();
    expect(screen.getByText('Context: homework')).toBeInTheDocument();
    // SharedSavedResultCore renders via OverviewTab — score header is present
    expect(screen.getByTestId('ov-score-header')).toBeInTheDocument();
  });

  it('shows the error state and supports the return callback when the result is missing', async () => {
    const onReturn = vi.fn();

    renderView({ onReturn });
    simulateOnValueSuccess(null);

    expect(await screen.findByText('Result not found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Return to Dashboard'));
    expect(onReturn).toHaveBeenCalled();
  });

  it('redirects to access denied when the ownership check fails', async () => {
    useResultOwnershipCheckMock.mockReturnValue({
      allowed: false,
      loading: false,
      denialReason: 'ownership',
    });

    renderView();
    simulateOnValueSuccess(makeResult());

    expect(await screen.findByText('Access denied page')).toBeInTheDocument();
  });

  it('supports certificate download and print actions', async () => {
    renderView();
    simulateOnValueSuccess(makeResult());

    await screen.findByText('Reading Test 1');

    fireEvent.click(screen.getByText(/Download Certificate/));
    expect(generateCertificatePDFMock).toHaveBeenCalledWith(expect.objectContaining({ resultId: 'res-1' }));

    fireEvent.click(screen.getByText(/Print Results/));
    expect(printMock).toHaveBeenCalled();
  });

  // ─── FR-035 parity: access-lost tests (Task 3.5) ────────────────────────
  describe('FR-035 access-lost behavior', () => {
    it('should show access-lost state on PERMISSION_DENIED error', () => {
      renderView();
      simulateOnValueError({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED' });

      expect(screen.getByText('Access Revoked')).toBeInTheDocument();
      expect(screen.queryByText('Reading Test 1')).not.toBeInTheDocument();
    });

    it('should provide return button in access-lost state', () => {
      const onReturn = vi.fn();
      renderView({ onReturn });
      simulateOnValueError({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED' });

      expect(screen.getByText('Access Revoked')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Return to Dashboard'));
      expect(onReturn).toHaveBeenCalled();
    });

    it('should show normal error state for non-permission errors', () => {
      renderView();
      simulateOnValueError(new Error('Network error'));

      expect(screen.getByText('Failed to load result')).toBeInTheDocument();
      expect(screen.queryByText('Access Revoked')).not.toBeInTheDocument();
    });
  });

  // ─── Task 3.5: real-time refresh parity ─────────────────────────────────
  describe('Real-time refresh parity (Task 3.5)', () => {
    it('should set up onValue listener with correct path', () => {
      renderView();

      expect(mockOnValue).toHaveBeenCalledTimes(1);
      expect(mockRef).toHaveBeenCalledWith({}, 'test_results/res-1');
    });

    it('should automatically reflect updated data when RTDB pushes new snapshot', async () => {
      renderView();
      simulateOnValueSuccess(makeResult());

      expect(await screen.findByText('Reading Test 1')).toBeInTheDocument();

      // Simulate the RTDB listener pushing an updated result (e.g., feedback generated)
      const updatedResult = { ...makeResult(), testTitle: 'Updated Reading Test' };
      const secondCb = mockOnValue.mock.calls[0]?.[1];
      act(() => {
        secondCb({
          exists: () => true,
          val: () => updatedResult,
        });
      });

      expect(await screen.findByText('Updated Reading Test')).toBeInTheDocument();
    });
  });
});
