import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherResultsDashboard from './TeacherResultsDashboard';

const {
  getTeacherResultsMock,
  exportResultsToCSVMock,
  downloadCSVMock,
  navigateToMock,
  trackActionMock,
  logoutMock,
  classifyTeacherResultVisibilityMock,
} = vi.hoisted(() => ({
  getTeacherResultsMock: vi.fn(),
  exportResultsToCSVMock: vi.fn(() => 'csv-content'),
  downloadCSVMock: vi.fn(),
  navigateToMock: vi.fn(),
  trackActionMock: vi.fn(),
  logoutMock: vi.fn(),
  classifyTeacherResultVisibilityMock: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: {
    uid: 'teacher-1',
    email: 'teacher@example.com',
    displayName: 'Teacher One',
    photoURL: null,
  },
  profile: {
    role: 'teacher',
    displayName: 'Teacher One',
    email: 'teacher@example.com',
    avatarUrl: null,
    photoURL: null,
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    profile: authState.profile,
    logout: logoutMock,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: navigateToMock,
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: trackActionMock,
  }),
}));

vi.mock('../components/navigation', () => ({
  TeacherHeader: ({ pageTitle }) => (
    <div>Teacher Header: {pageTitle}</div>
  ),
}));

vi.mock('../components/modern', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('../services/resultsService', () => ({
  getTeacherResults: getTeacherResultsMock,
  exportResultsToCSV: exportResultsToCSVMock,
  downloadCSV: downloadCSVMock,
  filterResultsByDateRange: (results, startDate, endDate) =>
    results.filter((result) => result.completedAt >= startDate.getTime() && result.completedAt <= endDate.getTime()),
}));

vi.mock('../services/resultVisibility.service', () => ({
  classifyTeacherResultVisibility: classifyTeacherResultVisibilityMock,
}));

describe('TeacherResultsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authState.user = {
      uid: 'teacher-1',
      email: 'teacher@example.com',
      displayName: 'Teacher One',
      photoURL: null,
    };
    authState.profile = {
      role: 'teacher',
      displayName: 'Teacher One',
      email: 'teacher@example.com',
      avatarUrl: null,
      photoURL: null,
    };

    getTeacherResultsMock.mockResolvedValue([
      {
        sessionCode: 'session-1',
        sessionMode: 'test',
        testTitle: 'Reading Session',
        createdAt: 1_710_000_000_000,
        totalStudents: 2,
        averageScore: 15.5,
        averagePercentage: 77.5,
        highestScore: 18,
        lowestScore: 13,
        results: [
          {
            id: 'result-visible',
            studentId: 'student-1',
            studentName: 'Student One',
            studentEmail: 'student-1@example.com',
            sessionCode: 'session-1',
            score: 18,
            percentage: 90,
            totalQuestions: 20,
            correctAnswers: 18,
            completedAt: 1_710_000_010_000,
            isGuest: false,
            visibility: {
              visibilityOwnerTeacherId: 'teacher-1',
              ownershipResolved: true,
              contextType: 'class_session',
            },
          },
          {
            id: 'result-excluded',
            studentId: 'student-2',
            studentName: 'Student Two',
            sessionCode: 'session-1',
            teacherId: 'legacy-owner',
            score: 13,
            percentage: 65,
            totalQuestions: 20,
            correctAnswers: 13,
            completedAt: 1_710_000_020_000,
            isGuest: false,
            visibility: {
              visibilityOwnerTeacherId: null,
              ownershipResolved: true,
              contextType: 'solo_practice',
            },
          },
          {
            id: 'result-hidden',
            studentId: 'student-3',
            studentName: 'Hidden Student',
            sessionCode: 'session-1',
            teacherId: 'legacy-hidden-owner',
            score: 9,
            percentage: 45,
            totalQuestions: 20,
            correctAnswers: 9,
            completedAt: 1_710_000_030_000,
            isGuest: false,
            visibility: {
              visibilityOwnerTeacherId: null,
              ownershipResolved: false,
              contextType: 'course_material',
            },
          },
        ],
      },
    ]);

    classifyTeacherResultVisibilityMock.mockImplementation(({ result }) => ({
      shouldDisplayInTeacherHistory: result.visibility?.ownershipResolved !== false,
      excludeFromAnalytics: result.visibility?.contextType === 'solo_practice',
    }));
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <TeacherResultsDashboard />
      </MemoryRouter>,
    );
  }

  it('filters analytics-excluded rows out of dashboard summaries and export payloads', async () => {
    renderPage();

    await screen.findByText('Teacher Results Dashboard');

    expect(screen.getByTestId('teacher-results-total-sessions')).toHaveTextContent('1');
    expect(screen.getByTestId('teacher-results-total-students')).toHaveTextContent('1');
    expect(screen.getByTestId('teacher-results-overall-average')).toHaveTextContent('90.0%');

    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));

    await screen.findByText('Student One');
    expect(screen.queryByText('Student Two')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(exportResultsToCSVMock).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'result-visible' }),
      ]);
    });
    expect(downloadCSVMock).toHaveBeenCalledWith('csv-content', expect.stringMatching(/^teacher-results-\d{4}-\d{2}-\d{2}\.csv$/));
    expect(trackActionMock).toHaveBeenCalledWith('exportResultsCsv', expect.objectContaining({
      source: 'teacher_results_dashboard',
      resultCount: 1,
      sessionCount: 1,
    }));
  });

  it('uses normalized owner data for super-admin analytics classification', async () => {
    authState.user = {
      uid: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Admin One',
      photoURL: null,
    };
    authState.profile = {
      role: 'super_admin',
      displayName: 'Admin One',
      email: 'admin@example.com',
      avatarUrl: null,
      photoURL: null,
    };

    renderPage();

    await screen.findByText('Teacher Results Dashboard');

    expect(getTeacherResultsMock).toHaveBeenCalledWith(undefined);
    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ id: 'result-excluded' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ id: 'result-hidden' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
  });

  it('routes result and history actions through canonical navigation helpers', async () => {
    renderPage();

    await screen.findByText('Teacher Results Dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    await screen.findByText('Student One');

    fireEvent.click(screen.getByRole('button', { name: 'View Result' }));

    expect(navigateToMock).toHaveBeenCalledWith(
      'RESULT_DETAIL',
      { resultId: 'result-visible' },
      { reason: 'teacher_results_dashboard_result_detail' },
    );
    expect(trackActionMock).toHaveBeenCalledWith('viewResults', expect.objectContaining({
      source: 'teacher_results_dashboard',
      resultId: 'result-visible',
      studentId: 'student-1',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(navigateToMock).toHaveBeenCalledWith(
      'TEACHER_STUDENT_HISTORY',
      { studentId: 'student-1' },
      { reason: 'teacher_results_dashboard_history' },
    );
    expect(trackActionMock).toHaveBeenCalledWith('openStudentHistory', expect.objectContaining({
      source: 'teacher_results_dashboard',
      studentId: 'student-1',
      sessionCode: 'session-1',
    }));
  });
});
