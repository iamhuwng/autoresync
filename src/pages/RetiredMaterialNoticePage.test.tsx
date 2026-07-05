import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import RetiredMaterialNoticePage from './RetiredMaterialNoticePage';
import { buildRoute } from '../constants/routes';

const mockTrackAction = vi.fn();
const mockNavigateTo = vi.fn();

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mockTrackAction,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}));

describe('RetiredMaterialNoticePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders generic unavailable copy for missing retired material routes', () => {
    render(<RetiredMaterialNoticePage audience="teacher" retiredFeature="quiz" />);

    expect(screen.getByText('Material no longer available')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quiz Mode has been retired' })).toBeInTheDocument();
    expect(screen.getByText(/no longer opens legacy gameplay or reads retired Quiz records/i)).toBeInTheDocument();
    expect(mockTrackAction).toHaveBeenCalledWith('retiredQuizNoticeViewed', {
      audience: 'teacher',
      retiredFeature: 'quiz',
    });
  });

  it('renders a generic unavailable-source notice without retired Quiz wording', () => {
    render(<RetiredMaterialNoticePage audience="student" retiredFeature="material" />);

    expect(screen.getAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Material no longer available' })).toBeInTheDocument();
    expect(screen.getByText(/source for this material is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Quiz Mode/i)).not.toBeInTheDocument();
    expect(mockTrackAction).toHaveBeenCalledWith('materialUnavailableNoticeViewed', {
      audience: 'student',
      retiredFeature: 'material',
    });
  });

  it('uses registered return routes for teacher and student notices', () => {
    const { rerender } = render(<RetiredMaterialNoticePage audience="teacher" retiredFeature="quiz" />);

    expect(screen.getByRole('button', { name: 'Back to Teacher Lobby' })).toHaveAttribute(
      'data-return-route',
      buildRoute('LOBBY'),
    );

    rerender(<RetiredMaterialNoticePage audience="student" retiredFeature="quiz" />);

    expect(screen.getByRole('button', { name: 'Back to Student Dashboard' })).toHaveAttribute(
      'data-return-route',
      buildRoute('STUDENT_DASHBOARD'),
    );
  });

  it('tracks return actions before navigating through the registered route helper target', () => {
    render(<RetiredMaterialNoticePage audience="student" retiredFeature="quiz" />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Student Dashboard' }));

    expect(mockTrackAction).toHaveBeenCalledWith('retiredQuizNoticeReturn', {
      audience: 'student',
      retiredFeature: 'quiz',
      returnRoute: 'STUDENT_DASHBOARD',
    });
    expect(mockNavigateTo).toHaveBeenCalledWith('STUDENT_DASHBOARD', undefined, {
      reason: 'retired_quiz_notice_return',
    });
  });
});
