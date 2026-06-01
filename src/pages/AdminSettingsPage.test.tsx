import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminSettingsPage from './AdminSettingsPage';

const { authState, getAPIKeysMock, logoutMock, navigateToMock, reportingTrackActionMock } =
  vi.hoisted(() => ({
    authState: {
      user: { uid: 'super-admin-1' },
      profile: { role: 'super_admin' as string },
    },
    getAPIKeysMock: vi.fn(),
    logoutMock: vi.fn(),
    navigateToMock: vi.fn(),
    reportingTrackActionMock: vi.fn(),
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

vi.mock('../components/navigation', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/admin/AdminTagManager', () => ({
  AdminTagManager: () => <div>Tags panel</div>,
}));

vi.mock('../components/admin/TestTypeAdminPanel', () => ({
  TestTypeAdminPanel: ({ context, repository }: { context?: unknown; repository?: unknown }) => (
    <section>
      <h2>Test Type Management</h2>
      <button type="button">Create Test Type</button>
      <div data-testid="test-type-admin-context">{context ? 'has-context' : 'missing-context'}</div>
      <div data-testid="test-type-admin-repository">{repository ? 'has-repository' : 'missing-repository'}</div>
    </section>
  ),
}));

vi.mock('../components/ai/AIMaintenanceBanner', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../config/env.config', () => ({
  getEnv: () => ({}),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async () => ({ val: () => ({}) })),
  onValue: vi.fn(() => vi.fn()),
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  set: vi.fn(),
}));

vi.mock('../services/api-keys.service', () => ({
  getAPIKeys: getAPIKeysMock,
  addAPIKey: vi.fn(),
  updateAPIKey: vi.fn(),
  deleteAPIKey: vi.fn(),
  subscribeToAPIKeys: vi.fn((callback: (config: unknown) => void) => {
    callback({ gemini: {}, groq: {} });
    return vi.fn();
  }),
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackAction: reportingTrackActionMock,
  },
}));

describe('AdminSettingsPage Test Type settings', () => {
  beforeEach(() => {
    authState.user = { uid: 'super-admin-1' };
    authState.profile = { role: 'super_admin' };
    getAPIKeysMock.mockResolvedValue({ gemini: {}, groq: {} });
    logoutMock.mockReset();
    navigateToMock.mockReset();
    reportingTrackActionMock.mockReset();
  });

  it('mounts Test Type management only for super admins', async () => {
    render(<AdminSettingsPage />);

    const testTypesButton = await screen.findByRole('button', {
      name: /Show Test Types settings section/i,
    });
    fireEvent.click(testTypesButton);

    expect(await screen.findByText('Test Type Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Test Type/i })).toBeInTheDocument();
    expect(screen.getByTestId('test-type-admin-context')).toHaveTextContent('has-context');
    expect(screen.getByTestId('test-type-admin-repository')).toHaveTextContent('has-repository');

    await waitFor(() => {
      expect(reportingTrackActionMock).toHaveBeenCalledWith(
        'adminPanel',
        'switchTestTypeSettingsSection',
        { section: 'test_types' },
      );
    });
  });

  it('does not expose Test Type management to non-super-admin users', () => {
    authState.profile = { role: 'teacher' };

    render(<AdminSettingsPage />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Test Type Management')).not.toBeInTheDocument();
  });
});
