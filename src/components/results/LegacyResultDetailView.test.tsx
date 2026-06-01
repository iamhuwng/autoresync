import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  mockGenerateFormativeFeedbackForSavedResult,
} = vi.hoisted(() => ({
  generateCertificatePDFMock: vi.fn(),
  isPDFGenerationAvailableMock: vi.fn(),
  useResultOwnershipCheckMock: vi.fn(),
  mockOnValue: vi.fn(),
  mockRef: vi.fn((_db: any, path: string) => ({ path })),
  mockGenerateFormativeFeedbackForSavedResult: vi.fn(),
}));

let mockAuthUser: { uid: string; email?: string } | null = { uid: 'teacher-1', email: 'teacher@example.com' };
let mockAuthProfile: { role: string } | null = { role: 'teacher' };
let mockOwnershipState: { allowed: boolean; loading: boolean; denialReason: string | null } = {
  allowed: true,
  loading: false,
  denialReason: null,
};

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

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
  generateFormativeFeedbackForSavedResult: (...args: unknown[]) => mockGenerateFormativeFeedbackForSavedResult(...args),
}));

vi.mock('../../utils/pdfCertificate', () => ({
  generateCertificatePDF: (...args: unknown[]) => generateCertificatePDFMock(...args),
  isPDFGenerationAvailable: (...args: unknown[]) => isPDFGenerationAvailableMock(...args),
}));

vi.mock('../../hooks/useOwnershipCheck', () => ({
  useResultOwnershipCheck: (...args: unknown[]) => useResultOwnershipCheckMock(...args),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    profile: mockAuthProfile,
  }),
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

function makeResult(overrides: Record<string, any> = {}) {
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
    visibility: {
      contextType: 'homework',
      sourceType: 'homework',
      sourceId: 'homework-1',
      sourceNameSnapshot: 'Homework 1',
      visibilityOwnerTeacherId: 'teacher-1',
      ownerResolutionSource: 'homework.createdBy',
      ownershipResolved: true,
      unresolvedReason: null,
      homeworkId: 'homework-1',
      sessionCode: null,
      courseId: 'course-1',
      classId: 'class-1',
      assignmentId: null,
      currentSourceName: 'Homework 1',
    },
    ...overrides,
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

function createViewElement(props: { resultId?: string; onReturn?: () => void } = {}) {
  return (
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
    </MemoryRouter>
  );
}

function renderView(props: { resultId?: string; onReturn?: () => void } = {}) {
  return render(createViewElement(props));
}

describe('LegacyResultDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = { uid: 'teacher-1', email: 'teacher@example.com' };
    mockAuthProfile = { role: 'teacher' };
    mockOwnershipState = {
      allowed: true,
      loading: false,
      denialReason: null,
    };
    isPDFGenerationAvailableMock.mockReturnValue(new Promise<boolean>(() => {}));
    useResultOwnershipCheckMock.mockImplementation(() => mockOwnershipState);
    // Default: onValue returns an unsubscribe fn
    mockOnValue.mockReturnValue(vi.fn());
    mockGenerateFormativeFeedbackForSavedResult.mockResolvedValue({
      saved: true,
      aiApplied: true,
      mode: 'ai',
    });
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
    expect(screen.getByTestId('result-source-primary-label')).toHaveTextContent('Homework 1');
    // SharedSavedResultCore renders via OverviewTab — score header is present
    expect(screen.getByTestId('ov-score-header')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
        'res-1',
        expect.objectContaining({ triggerSource: 'LegacyResultDetailView:auto-generate' }),
      );
    });
  });

  it('shows the error state and supports the return callback when the result is missing', async () => {
    const onReturn = vi.fn();

    renderView({ onReturn });
    simulateOnValueSuccess(null);

    expect(await screen.findByText('Result not found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Return to Dashboard'));
    expect(onReturn).toHaveBeenCalled();
  });

  it('redirects to access denied when the shared visibility verdict rejects the row', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        visibility: {
          ...makeResult().visibility,
          visibilityOwnerTeacherId: 'teacher-2',
        },
      }),
    );

    expect(await screen.findByText('Access denied page')).toBeInTheDocument();
  });

  it('supports certificate download and print actions', async () => {
    isPDFGenerationAvailableMock.mockResolvedValue(true);
    renderView();
    simulateOnValueSuccess(makeResult());

    await screen.findByText('Reading Test 1');
    await waitFor(() => {
      expect(screen.getByText(/Download Certificate/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Download Certificate/));
    expect(generateCertificatePDFMock).toHaveBeenCalledWith(expect.objectContaining({ resultId: 'res-1' }));

    fireEvent.click(screen.getByText(/Print Results/));
    expect(printMock).toHaveBeenCalled();
  });

  it('renders solo-practice rows as student-owned and view-only', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        context: { type: 'self_study' },
        visibility: {
          ...makeResult().visibility,
          contextType: 'solo_practice',
          sourceType: 'solo_practice',
          sourceId: 'solo-1',
          sourceNameSnapshot: 'Solo Practice Session',
          visibilityOwnerTeacherId: null,
          ownerResolutionSource: 'solo_practice',
          homeworkId: null,
          courseId: null,
          classId: null,
          currentSourceName: 'Solo Practice Session',
        },
      }),
    );

    expect(await screen.findByTestId('solo-practice-view-only')).toHaveTextContent('Student-owned');
    expect(screen.getByTestId('solo-practice-view-only')).toHaveTextContent('View only');
    expect(screen.queryByText('Teacher overall feedback')).not.toBeInTheDocument();
    expect(screen.queryByText(/Download Certificate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Print Results/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('result-source-metadata')).toBeInTheDocument();
    expect(screen.getByTestId('result-source-primary-label')).toHaveTextContent('Solo Practice Session');
  });

  it('renders full source metadata for teacher-visible rows', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        visibility: {
          ...makeResult().visibility,
          sourceNameSnapshot: 'Homework Snapshot Name',
          currentSourceName: 'Homework Current Name',
        },
        context: {
          type: 'homework',
          source: {
            type: 'homework',
            id: 'homework-1',
            name: 'Homework Snapshot Name',
          },
          assignment: {
            homeworkId: 'homework-1',
            attemptNumber: 2,
          },
          configApplied: {
            timerMinutes: 30,
            feedbackTiming: 'after_completion',
            source: 'teacher_override',
          },
        },
      }),
    );

    expect(await screen.findByTestId('result-source-metadata')).toBeInTheDocument();
    expect(screen.getByTestId('result-source-primary-label')).toHaveTextContent('Homework Snapshot Name');
    expect(screen.getByTestId('result-source-current-label')).toHaveTextContent('Homework Current Name');
    expect(screen.getByTestId('result-source-newer-version-note')).toHaveTextContent('assigned snapshot');
    expect(screen.getByTestId('result-source-context')).toHaveTextContent('Homework');
    expect(screen.getByTestId('result-source-id')).toHaveTextContent('homework-1');
    expect(screen.getByTestId('result-source-attempt')).toHaveTextContent('Attempt 2');
    expect(screen.getByTestId('result-source-resolution')).toHaveTextContent('Homework -> CreatedBy');
    expect(screen.getByTestId('result-source-visibility')).toHaveTextContent('Teacher-owned teaching context');
  });

  it('keeps source metadata visible when only normalized visibility fields exist', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        courseName: null,
        className: null,
        moduleName: null,
        visibility: {
          ...makeResult().visibility,
          contextType: 'class_session',
          sourceType: 'session',
          sourceId: 'session-42',
          sourceNameSnapshot: null,
          ownerResolutionSource: 'session.createdByUserId',
          currentSourceName: null,
        },
      }),
    );

    expect(await screen.findByTestId('result-source-metadata')).toBeInTheDocument();
    expect(screen.getByTestId('result-source-primary-label')).toHaveTextContent('Snapshot unavailable');
    expect(screen.getByTestId('result-source-context')).toHaveTextContent('Class Session');
    expect(screen.getByTestId('result-source-id')).toHaveTextContent('session-42');
    expect(screen.getByTestId('result-source-resolution')).toHaveTextContent('Session -> CreatedByUserId');
  });

  it('does not promote course or class names into the source snapshot label', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        courseName: 'Course Context Only',
        className: 'Class Context Only',
        moduleName: 'Module Context Only',
        visibility: {
          ...makeResult().visibility,
          contextType: 'class_session',
          sourceType: 'session',
          sourceId: 'session-77',
          sourceNameSnapshot: null,
          currentSourceName: null,
          ownerResolutionSource: 'session.createdByUserId',
        },
      }),
    );

    expect(await screen.findByTestId('result-source-primary-label')).toHaveTextContent('Snapshot unavailable');
    expect(screen.getByTestId('result-source-primary-label')).not.toHaveTextContent('Course Context Only');
    expect(screen.getByTestId('result-source-primary-label')).not.toHaveTextContent('Class Context Only');
    expect(screen.getByTestId('result-source-primary-label')).not.toHaveTextContent('Module Context Only');
    expect(screen.getByTestId('result-source-id')).toHaveTextContent('session-77');
  });

  it('shows submission snapshot metadata first for deleted sources', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        visibility: {
          ...makeResult().visibility,
          sourceNameSnapshot: 'Homework Name At Submission',
          currentSourceName: 'Homework Renamed Later',
          sourceDeleted: true,
        },
      }),
    );

    expect(await screen.findByTestId('result-source-primary-label')).toHaveTextContent('Homework Name At Submission');
    expect(screen.getByTestId('result-source-current-label')).toHaveTextContent('Homework Renamed Later');
    expect(screen.getByTestId('result-source-status')).toHaveTextContent('Deleted source');
  });

  it('redirects unresolved rows away from teacher detail', async () => {
    renderView();
    simulateOnValueSuccess(
      makeResult({
        visibility: {
          ...makeResult().visibility,
          ownershipResolved: false,
          ownerResolutionSource: 'unresolved',
          unresolvedReason: 'owner_not_resolved',
          visibilityOwnerTeacherId: null,
        },
      }),
    );

    expect(await screen.findByText('Access denied page')).toBeInTheDocument();
    expect(screen.queryByText('Reading Test 1')).not.toBeInTheDocument();
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

    it('should clear sensitive result data immediately when assignment access is lost mid-view', async () => {
      const view = renderView();
      simulateOnValueSuccess(makeResult());

      expect(await screen.findByText('Reading Test 1')).toBeInTheDocument();

      mockOwnershipState = {
        allowed: false,
        loading: false,
        denialReason: 'ownership',
      };

      view.rerender(createViewElement());

      await waitFor(() => {
        expect(screen.getByText('Access Revoked')).toBeInTheDocument();
      });
      expect(screen.queryByText('Reading Test 1')).not.toBeInTheDocument();
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
