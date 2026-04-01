import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import LoginPage from './LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockLoginWithEmail = vi.fn();
const mockUseAuth = vi.fn();
const mockFetch = vi.fn();
const mockTrackAction = vi.fn();

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

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mockTrackAction,
  }),
}));

function renderPage() {
  return render(
    <BrowserRouter>
      <MantineProvider>
        <LoginPage />
      </MantineProvider>
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      json: async () => ({ ip: '127.0.0.1' }),
    });
    mockUseAuth.mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the current login actions', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to access your account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show dev quick login/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^teacher$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^student$/i })).not.toBeInTheDocument();
  });

  it('calls the google login handler when the Google button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'google' });
  });

  it('reveals dev quick-login actions from the settings icon', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /show dev quick login/i }));

    expect(screen.getByRole('button', { name: /^teacher$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^student$/i })).toBeInTheDocument();
    expect(mockTrackAction).toHaveBeenCalledWith('toggleDevQuickLogin', { visible: true });
  });

  it('calls email login with the teacher demo credentials', async () => {
    const user = userEvent.setup();
    let resolveLogin;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    mockLoginWithEmail.mockReturnValueOnce(loginPromise);
    renderPage();
    await user.click(screen.getByRole('button', { name: /show dev quick login/i }));

    await user.click(screen.getByRole('button', { name: /^teacher$/i }));

    expect(mockLoginWithEmail).toHaveBeenCalledWith('teacher@test.com', 'password123');
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'dev', role: 'teacher' });
    expect(screen.getByRole('button', { name: /logging in\.\.\./i })).toBeDisabled();

    resolveLogin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^teacher$/i })).not.toBeDisabled();
    });
  });

  it('calls email login with the student demo credentials', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /show dev quick login/i }));

    await user.click(screen.getByRole('button', { name: /^student$/i }));

    expect(mockLoginWithEmail).toHaveBeenCalledWith('student@test.com', 'password123');
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'dev', role: 'student' });
  });

  it('redirects teachers to the lobby', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'teacher-1' },
      profile: { role: 'teacher' },
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/lobby', { replace: true });
    });
  });

  it('redirects students to the student dashboard', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'student-1' },
      profile: { role: 'student' },
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student', { replace: true });
    });
  });

  it('redirects super admins to the admin dashboard', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'admin-1' },
      profile: { role: 'super_admin' },
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true });
    });
  });

  it('shows the loading state while auth is initializing', () => {
    mockUseAuth.mockReturnValueOnce({
      user: null,
      profile: null,
      loading: true,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
    });

    renderPage();

    expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('shows a readable error message when login fails', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({ code: 'auth/popup-blocked' });

    renderPage();

    await user.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/sign-in popup was blocked/i)
      ).toBeInTheDocument();
    });
  });
});
