import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudentClassDetailPage from './StudentClassDetailPage';

const {
  mockGetClass,
  mockSubscribeToClass,
  mockSubscribeToActiveSessions,
  mockSetPlayerData,
  mockGetStudentResults,
  mockNavigateTo,
  mockPrepareDelivery,
  mockUseAuth,
  mockUseStudentHomeworkList,
} = vi.hoisted(() => ({
  mockGetClass: vi.fn(),
  mockSubscribeToClass: vi.fn(),
  mockSubscribeToActiveSessions: vi.fn(),
  mockSetPlayerData: vi.fn(),
  mockGetStudentResults: vi.fn(),
  mockNavigateTo: vi.fn(),
  mockPrepareDelivery: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseStudentHomeworkList: vi.fn(),
}));

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

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: mockNavigateTo }),
}));

vi.mock('../services/book-delivery/classBookPlacement.browser', () => ({
  createClassBookPlacementBrowserClient: () => ({
    prepareDelivery: (...args) => mockPrepareDelivery(...args),
  }),
}));

vi.mock('../services/book-delivery/bookPlacementLaunch.browser', () => ({
  buildBookPlacementPracticeRouteParams: (materialId, launch) => ({
    materialId: `${materialId}?bookSurface=${launch.surface}&classId=${launch.classId}&copyId=${launch.copyId}&classPlacementId=${launch.classPlacementId}&classCourseMaterialId=${launch.classCourseMaterialId}&bindingId=${launch.bindingId}`,
  }),
}));

vi.mock('../hooks/useHomeworkSubmission', () => ({
  useStudentHomeworkList: (...args) => mockUseStudentHomeworkList(...args),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_, path) => path ?? '__root__'),
  update: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
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
  mobileStyles: {
    touchTarget: { minHeight: 44, minWidth: 44 },
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
    mockPrepareDelivery.mockResolvedValue({
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-1',
      recipientId: 'student-1',
      context: { kind: 'class' },
    });
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

    expect(mockNavigateTo).toHaveBeenCalledWith(
      'RESULT_DETAIL',
      { resultId: 'result-1' },
      expect.objectContaining({ reason: 'class_result_viewed' }),
    );
    expect(screen.getByRole('button', { name: 'View Results' })).toHaveStyle({
      minHeight: '44px',
      minWidth: '44px',
    });
  });

  it('does not broaden result authority or write missing result links on mount', async () => {
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
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Reading Quiz 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Result Pending' })).toBeDisabled();
    expect(mockGetStudentResults).not.toHaveBeenCalled();
  });

  it('launches a Class Book through the canonical immutable placement identity', async () => {
    const classData = {
      name: 'Class 1',
      classCode: 'CLS001',
      settings: { allowSelfStudy: false },
      students: { 'student-1': { status: 'active', assignments: {} } },
      assignments: {
        'book-assignment-1': {
          id: 'book-assignment-1',
          status: 'available',
          testTitle: 'Legacy title must not win',
          bookPlacement: {
            status: 'active',
            classId: 'class-1',
            copyId: 'copy-1',
            classPlacementId: 'class-placement-1',
            courseMaterialId: 'class-material-1',
            title: 'Class Book Unit 1',
            pins: { bookId: 'book-1' },
          },
        },
      },
    };
    mockGetClass.mockResolvedValue(classData);
    mockSubscribeToClass.mockImplementation((_classId, callback) => {
      callback(classData);
      return vi.fn();
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Book' }));

    await waitFor(() => expect(mockPrepareDelivery).toHaveBeenCalledWith(expect.objectContaining({
      classId: 'class-1',
      copyId: 'copy-1',
      classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1',
    })));
    expect(mockNavigateTo).toHaveBeenCalledWith(
      'STUDENT_PRACTICE',
      expect.objectContaining({
        materialId: expect.stringContaining('book-1?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=class-placement-1&classCourseMaterialId=class-material-1&bindingId=binding-1'),
      }),
      expect.objectContaining({ force: true, reason: 'class_book_runtime_launch' }),
    );
  });

  it('does not expose a Class Book launch for a non-active membership', async () => {
    const classData = {
      name: 'Class 1',
      classCode: 'CLS001',
      settings: { allowSelfStudy: false },
      students: { 'student-1': { status: 'pending_approval', assignments: {} } },
      assignments: {
        'book-assignment-1': {
          id: 'book-assignment-1',
          status: 'available',
          bookPlacement: {
            status: 'active',
            classId: 'class-1',
            copyId: 'copy-1',
            classPlacementId: 'class-placement-1',
            courseMaterialId: 'class-material-1',
            pins: { bookId: 'book-1' },
          },
        },
      },
    };
    mockGetClass.mockResolvedValue(classData);
    mockSubscribeToClass.mockImplementation((_classId, callback) => {
      callback(classData);
      return vi.fn();
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('No Assignments Yet')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open Book' })).not.toBeInTheDocument();
    expect(mockPrepareDelivery).not.toHaveBeenCalled();
  });
});
