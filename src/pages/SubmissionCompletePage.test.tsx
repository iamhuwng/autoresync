import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubmissionCompletePage from './SubmissionCompletePage';

const {
  mockNavigate,
  mockTrackAction,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockTrackAction: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mockTrackAction,
  }),
}));

describe('SubmissionCompletePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/submission-complete',
            state: {
              sessionCode: 'SESSION-1',
              testId: 'test-1',
              studentName: 'Student One',
            },
          },
        ]}
      >
        <Routes>
          <Route path="/submission-complete" element={<SubmissionCompletePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows manual-grading guidance and does not offer immediate results', () => {
    renderPage();

    expect(screen.getByText(/graded manually by your teacher/i)).toBeInTheDocument();
    expect(screen.getByText(/there is no instant score or ai feedback/i)).toBeInTheDocument();
    expect(screen.getByText(/contact your teacher if you need an update/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view results/i })).not.toBeInTheDocument();
  });

  it('returns students to the dashboard with tracking metadata', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));

    expect(mockTrackAction).toHaveBeenCalledWith('returnToDashboard', {
      source: 'submission_complete',
      hasSessionCode: true,
    });
    expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true });
  });
});
