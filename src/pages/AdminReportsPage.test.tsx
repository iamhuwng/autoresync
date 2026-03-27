import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminReportsPage from './AdminReportsPage';

const {
  getMock,
  limitToLastMock,
  listenerState,
  logoutMock,
  navigateToMock,
  offMock,
  onChildAddedMock,
  onValueMock,
  queryMock,
  refMock,
  removeMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  limitToLastMock: vi.fn((_count: number) => ({ kind: 'limit' })),
  listenerState: {
    profile: { role: 'super_admin' as string },
    values: new Map<string, { error?: Error; value?: unknown }>(),
  },
  logoutMock: vi.fn(),
  navigateToMock: vi.fn(),
  offMock: vi.fn(),
  onChildAddedMock: vi.fn(() => vi.fn()),
  onValueMock: vi.fn(
    (
      target: { path?: string },
      callback: (snapshot: { val: () => unknown }) => void,
      errorCallback?: (error: Error) => void
    ) => {
      const payload = listenerState.values.get(target.path || '');

      if (payload?.error) {
        errorCallback?.(payload.error);
      } else {
        callback({
          val: () => payload?.value ?? null,
        });
      }

      return vi.fn();
    }
  ),
  queryMock: vi.fn((target: { path?: string }) => target),
  refMock: vi.fn((_database: unknown, path: string) => ({ path })),
  removeMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: null,
  }),
}));

vi.mock('firebase/database', () => ({
  get: getMock,
  limitToLast: limitToLastMock,
  off: offMock,
  onChildAdded: onChildAddedMock,
  onValue: onValueMock,
  query: queryMock,
  ref: refMock,
  remove: removeMock,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: listenerState.profile,
    logout: logoutMock,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: navigateToMock,
  }),
}));

vi.mock('../config/featureRegistry', () => ({
  FEATURE_REGISTRY: [
    {
      id: 'results',
      name: 'Results',
      description: 'Result ownership and reporting flows.',
    },
  ],
}));

vi.mock('../components/navigation', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/DiagnosticViewerModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../core/platform/storage', () => ({
  sessionStore: {
    remove: vi.fn(),
  },
}));

vi.mock('../components/modern', () => ({
  Button: ({
    children,
    icon: _icon,
    loading: _loading,
    variant: _variant,
    ...props
  }: any) => <button {...props}>{children}</button>,
  Card: ({ children, variant: _variant, ...props }: any) => <div {...props}>{children}</div>,
  Input: ({ label, ...props }: any) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
  NativeSelect: ({ label, children, ...props }: any) => (
    <label>
      {label}
      <select {...props}>{children}</select>
    </label>
  ),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('AdminReportsPage', () => {
  beforeEach(() => {
    listenerState.profile = { role: 'super_admin' };
    listenerState.values.clear();
    listenerState.values.set('/reports/config/mode', { value: 'full' });

    getMock.mockReset();
    limitToLastMock.mockClear();
    logoutMock.mockReset();
    navigateToMock.mockReset();
    offMock.mockReset();
    onChildAddedMock.mockClear();
    onValueMock.mockClear();
    queryMock.mockClear();
    refMock.mockClear();
    removeMock.mockReset();
  });

  it('shows an empty unresolved diagnostics state when the reporting map is empty', async () => {
    listenerState.values.set('/reports/result_visibility/unresolved', { value: null });

    render(<AdminReportsPage />);

    expect(await screen.findByText('Unresolved Result Diagnostics')).toBeInTheDocument();
    expect(
      await screen.findByText('No unresolved result diagnostics are currently queued.')
    ).toBeInTheDocument();
  });

  it('renders unresolved diagnostics from the RTDB map payload', async () => {
    const firstCreatedAt = 1_710_000_000_000;
    const firstUpdatedAt = firstCreatedAt + 60_000;
    const secondCreatedAt = firstCreatedAt + 120_000;
    const secondUpdatedAt = firstCreatedAt + 180_000;

    listenerState.values.set('/reports/result_visibility/unresolved', {
      value: {
        'result-1': {
          resultId: 'result-1',
          studentId: 'student-1',
          contextType: 'homework',
          unresolvedReason: 'owner_not_resolved',
          sourceLookupAttempted: true,
          strongestKnownSourceClue: 'homework:hw-1',
          ownershipResolved: false,
          reportVersion: 1,
          createdAt: firstCreatedAt,
          updatedAt: firstUpdatedAt,
        },
        'result-2': {
          resultId: 'result-2',
          studentId: 'student-2',
          contextType: 'class_session',
          unresolvedReason: 'session_not_found',
          sourceLookupAttempted: false,
          strongestKnownSourceClue: null,
          ownershipResolved: false,
          reportVersion: 1,
          createdAt: secondCreatedAt,
          updatedAt: secondUpdatedAt,
        },
      },
    });

    render(<AdminReportsPage />);

    expect(await screen.findByText('result-1')).toBeInTheDocument();
    expect(screen.getByText('student-1')).toBeInTheDocument();
    expect(screen.getByText('homework')).toBeInTheDocument();
    expect(screen.getByText('owner_not_resolved')).toBeInTheDocument();
    expect(screen.getByText('homework:hw-1')).toBeInTheDocument();
    expect(screen.getByText('Attempted')).toBeInTheDocument();
    expect(screen.getAllByText('v1')).toHaveLength(2);

    expect(screen.getByText('result-2')).toBeInTheDocument();
    expect(screen.getByText('student-2')).toBeInTheDocument();
    expect(screen.getByText('class_session')).toBeInTheDocument();
    expect(screen.getByText('session_not_found')).toBeInTheDocument();
    expect(screen.getByText('No source clue captured')).toBeInTheDocument();
    expect(screen.getByText('Not attempted')).toBeInTheDocument();

    expect(screen.getByText(new Date(firstCreatedAt).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(new Date(secondUpdatedAt).toLocaleString())).toBeInTheDocument();
  });

  it('renders the unresolved diagnostics section as read-only', async () => {
    listenerState.values.set('/reports/result_visibility/unresolved', {
      value: {
        'result-1': {
          resultId: 'result-1',
          studentId: 'student-1',
          contextType: 'homework',
          unresolvedReason: 'owner_not_resolved',
          sourceLookupAttempted: true,
          strongestKnownSourceClue: 'homework:hw-1',
          ownershipResolved: false,
          reportVersion: 1,
          createdAt: 1_710_000_000_000,
          updatedAt: 1_710_000_060_000,
        },
      },
    });

    render(<AdminReportsPage />);

    const diagnosticsSection = await screen.findByTestId('unresolved-result-diagnostics');

    expect(
      within(diagnosticsSection).getByText(/Read-only diagnostics for ownership rows/i)
    ).toBeInTheDocument();
    expect(within(diagnosticsSection).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows access denied for non-super-admin users', () => {
    listenerState.profile = { role: 'admin' };

    render(<AdminReportsPage />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText('This page is only accessible to super administrators.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Unresolved Result Diagnostics')).not.toBeInTheDocument();
  });
});
