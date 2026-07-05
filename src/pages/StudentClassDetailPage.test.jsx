import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudentClassDetailPage from './StudentClassDetailPage';

const {
  mockNavigate,
  mockGetClass,
  mockSubscribeToClass,
  mockSubscribeToActiveSessions,
  mockSetPlayerData,
  mockGetStudentResults,
  mockUpdate,
  mockUseAuth,
  mockUseStudentHomeworkList,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetClass: vi.fn(),
  mockSubscribeToClass: vi.fn(),
  mockSubscribeToActiveSessions: vi.fn(),
  mockSetPlayerData: vi.fn(),
  mockGetStudentResults: vi.fn(),
  mockUpdate: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseStudentHomeworkList: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../services/classManager', () => ({
  getClass: (...args) => mockGetClass(...args),
  subscribeToClass: (...args) => mockSubscribeToClass(...args),
  subscribeToActiveSessions: (...args) => mockSubscribeToActiveSessions(...args),
}));

vi.mock('../services/sessionManager', () => ({
  getSession: vi.fn(),
}));

vi.mock('../services/testResults.service', () => ({
  getStudentResults: (...args) => mockGetStudentResults(...args),
}));

vi.mock('../services/sessionService', () => ({
  sessionService: {
    setPlayerData: (...args) => mockSetPlayerData(...args),
  },
}));

vi.mock('../hooks/useHomeworkSubmission', () => ({
  useStudentHomeworkList: (...args) => mockUseStudentHomeworkList(...args),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_, path) => path ?? '__root__'),
  update: (...args) => mockUpdate(...args),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('@mantine/core', () => ({
  Loader: () => <div>loader</div>,
}));

vi.mock('../components/layout/StudentLayout', () => ({
  StudentLayout: ({ children }) => <div>{children}</div>,
}));

vi.mock('../components/layout/StudentSidebar', () => ({
  StudentSidebar: () => <div data-testid="student-sidebar" />,
}));

vi.mock('../components/layout/studentLayoutStyles', () => ({
  studentTokens: {
    textPrimary: '#111827',
    textMuted: '#6b7280',
    bgSurface: '#ffffff',
    bgSurfaceAlt: '#f3f4f6',
    borderWhisper: 'rgba(0,0,0,0.1)',
    accent: '#4d44e3',
    accentSoft: '#e2dfff',
    radiusSoft: 8,
    radiusPill: 999,
  },
  S: {
    filterBar: {},
    filterTab: {},
    filterTabActive: {},
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/classes/class-1']}>
      <Routes>
        <Route path="/student/classes/:classId" element={<StudentClassDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudentClassDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    mockGetStudentResults.mockResolvedValue([]);

    mockUseAuth.mockReturnValue({
      user: {
        uid: 'student-1',
        displayName: 'Student One',
        email: 'student@example.com',
      },
      profile: null,
    });
    mockUseStudentHomeworkList.mockReturnValue({ notStarted: [] });
    mockSubscribeToActiveSessions.mockImplementation((_classId, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  it('navigates completed assignments through the canonical result route', async () => {
    const classData = {
      name: 'Class 1',
      classCode: 'CLS001',
      settings: { allowSelfStudy: false },
      students: {
        'student-1': {
          assignments: {
            'assignment-1': {
              status: 'submitted',
              percentage: 92,
              resultId: 'result-1',
            },
          },
        },
      },
      assignments: {
        'assignment-1': {
          id: 'assignment-1',
          testId: 'session-1',
          testTitle: 'Reading Quiz 1',
          testType: 'test',
          status: 'available',
          maxAttempts: 1,
          stats: {},
        },
      },
    };

    mockGetClass.mockResolvedValue(classData);
    mockSubscribeToClass.mockImplementation((_classId, callback) => {
      callback(classData);
      return vi.fn();
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Reading Quiz 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View Results' }));

    expect(mockNavigate).toHaveBeenCalledWith('/result/result-1');
  });

  it('repairs completed assignments that are missing a canonical result id', async () => {
    const classData = {
      name: 'Class 1',
      classCode: 'CLS001',
      settings: { allowSelfStudy: false },
      students: {
        'student-1': {
          assignments: {
            'assignment-1': {
              status: 'submitted',
              percentage: 92,
              submittedAt: 1_700_000_000_000,
            },
          },
        },
      },
      assignments: {
        'assignment-1': {
          id: 'assignment-1',
          testId: 'session-1',
          testTitle: 'Reading Quiz 1',
          testType: 'test',
          status: 'available',
          maxAttempts: 1,
          stats: {},
        },
      },
    };

    mockGetClass.mockResolvedValue(classData);
    mockSubscribeToClass.mockImplementation((_classId, callback) => {
      callback(classData);
      return vi.fn();
    });
    mockGetStudentResults.mockResolvedValue([
      {
        resultId: 'result-legacy',
        testId: 'session-1',
        sessionCode: 'session-1',
        submittedAt: 1_700_000_000_000,
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Reading Quiz 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'classes/class-1/students/student-1/assignments/assignment-1',
        expect.objectContaining({
          resultId: 'result-legacy',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View Results' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View Results' }));

    expect(mockNavigate).toHaveBeenCalledWith('/result/result-legacy');
  });
});
