import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import LoginPage from './LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockLoginWithEmail = vi.fn();
const mockLoginWithStudentId = vi.fn();
const mockRegisterWithEmail = vi.fn();
const mockCompleteGoogleRegistration = vi.fn();
const mockSendPasswordReset = vi.fn();
const mockUseAuth = vi.fn();
const mockTrackAction = vi.fn();
const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: mockTrackAction }),
}));

vi.mock('../components/modern', async () => {
  const actual = await vi.importActual('../components/modern');
  return {
    ...actual,
    toast: { ...actual.toast, error: mockToastError, success: mockToastSuccess },
  };
});

function renderPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
      loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail,
      completeGoogleRegistration: mockCompleteGoogleRegistration,
      sendPasswordReset: mockSendPasswordReset,
    });
  });

  it('renders Google and email-or-student-ID login', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email or student id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a student account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show dev quick login/i })).toBeInTheDocument();
  });

  it('calls Google login and tracks the Google method', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'google' });
  });

  it('opens the student registration form for a new Google account with a fixed email', async () => {
    mockLogin.mockResolvedValueOnce({ needsStudentRegistration: true, user: { email: 'new.google@example.com' } });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveValue('new.google@example.com');
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('resumes the registration form for an authenticated Google account without a profile', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'resume.google@example.com', providerData: [{ providerId: 'google.com' }] },
      profile: null,
      loading: false,
      login: mockLogin,
      loginWithEmail: mockLoginWithEmail,
      loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail,
      completeGoogleRegistration: mockCompleteGoogleRegistration,
      sendPasswordReset: mockSendPasswordReset,
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveValue('resume.google@example.com');
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('completes a new Google account through the student registration submit path', async () => {
    mockLogin.mockResolvedValueOnce({ needsStudentRegistration: true, user: { email: 'new.google@example.com' } });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Google');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'new-google-7');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create student account/i }));
    await waitFor(() => expect(mockCompleteGoogleRegistration).toHaveBeenCalledWith({
      studentId: 'new-google-7', password: 'password123', firstName: 'New', familyName: 'Google',
    }));
    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('prevents duplicate Google popup requests while sign-in is already in flight', async () => {
    let resolveLogin;
    mockLogin.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLogin = resolve;
    }));

    const user = userEvent.setup();
    renderPage();

    const button = screen.getByRole('button', { name: /sign in with google/i });
    await user.click(button);
    expect(button).toBeDisabled();

    await user.click(button);
    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('uses email/password when the login identifier is an email address', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email or student id/i), 'student@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(mockLoginWithEmail).toHaveBeenCalledWith('student@example.com', 'password123');
    expect(mockLoginWithStudentId).not.toHaveBeenCalled();
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'email' });
  });

  it('uses the secure student-ID login path for a non-email identifier', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email or student id/i), 'STU-2048');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(mockLoginWithStudentId).toHaveBeenCalledWith('STU-2048', 'password123');
    expect(mockLoginWithEmail).not.toHaveBeenCalled();
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'student_id' });
  });

  it('maps the local teacher ID fixture to the seeded teacher account', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email or student id/i), 'teacher');
    await user.type(screen.getByLabelText(/^password$/i), 'teacher');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(mockLoginWithEmail).toHaveBeenCalledWith('teacher@test.com', 'teacher');
    expect(mockLoginWithStudentId).not.toHaveBeenCalled();
    expect(mockTrackAction).toHaveBeenCalledWith('login', { method: 'dev_id' });
  });

  it('lets users reveal the login password with an accessible toggle', async () => {
    const user = userEvent.setup();
    renderPage();

    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockTrackAction).toHaveBeenCalledWith('togglePasswordVisibility', { field: 'login', visible: true });
  });

  it('creates student accounts with a chosen student ID and no role selector', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /create a student account/i }));
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'new-student-7');
    await user.type(screen.getByLabelText(/email address/i), 'new.student@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create student account/i }));

    await waitFor(() => {
      expect(mockRegisterWithEmail).toHaveBeenCalledWith(
        'new.student@example.com',
        'password123',
        'New Student',
        'new-student-7',
      );
    });
    expect(mockTrackAction).toHaveBeenCalledWith('register', { method: 'email_password', role: 'student' });
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('new-student-7'));
  });

  it('rejects mismatched registration passwords before creating an account', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /create a student account/i }));
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'new-student-8');
    await user.type(screen.getByLabelText(/email address/i), 'new.student@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different123');
    await user.click(screen.getByRole('button', { name: /create student account/i }));

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Registration failed: the passwords do not match.');
  });

  it('rejects an invalid registration email before contacting the Worker', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /create a student account/i }));
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'new-student-9');
    await user.type(screen.getByLabelText(/email address/i), 'invalid-email');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create student account/i }));

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Registration failed: enter a valid email address.');
  });

  it('sends password reset requests using the account email', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/account email/i), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /send password reset email/i }));

    expect(mockSendPasswordReset).toHaveBeenCalledWith('student@example.com');
    expect(mockTrackAction).toHaveBeenCalledWith('resetPassword', { method: 'email' });
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('If an account exists'));
  });

  it('reveals dev quick-login actions from the settings icon', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /show dev quick login/i }));

    expect(screen.getByRole('button', { name: /^teacher$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^teacher 2$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^student$/i })).toBeInTheDocument();
    expect(mockTrackAction).toHaveBeenCalledWith('toggleDevQuickLogin', { visible: true });
  });

  it('keeps the existing teacher and student developer login credentials', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /show dev quick login/i }));
    await user.click(screen.getByRole('button', { name: /^teacher$/i }));
    expect(mockLoginWithEmail).toHaveBeenCalledWith('teacher@test.com', 'teacher');

    await user.click(screen.getByRole('button', { name: /^student$/i }));
    expect(mockLoginWithEmail).toHaveBeenCalledWith('student@test.com', 'student');
  });

  it('redirects teachers to the lobby', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'teacher-1' }, profile: { role: 'teacher' }, loading: false,
      login: mockLogin, loginWithEmail: mockLoginWithEmail, loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail, sendPasswordReset: mockSendPasswordReset,
    });
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby', { replace: true }));
  });

  it('redirects students to the student dashboard', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'student-1' }, profile: { role: 'student' }, loading: false,
      login: mockLogin, loginWithEmail: mockLoginWithEmail, loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail, sendPasswordReset: mockSendPasswordReset,
    });
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/student', { replace: true }));
  });

  it('redirects super admins to the admin dashboard', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'admin-1' }, profile: { role: 'super_admin' }, loading: false,
      login: mockLogin, loginWithEmail: mockLoginWithEmail, loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail, sendPasswordReset: mockSendPasswordReset,
    });
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true }));
  });

  it('shows the loading state while auth is initializing', () => {
    mockUseAuth.mockReturnValueOnce({
      user: null, profile: null, loading: true, login: mockLogin,
      loginWithEmail: mockLoginWithEmail, loginWithStudentId: mockLoginWithStudentId,
      registerWithEmail: mockRegisterWithEmail, sendPasswordReset: mockSendPasswordReset,
    });
    renderPage();
    expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('shows a readable error message when Google login fails', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
    renderPage();
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    await waitFor(() => expect(screen.getByText(/sign-in popup was blocked/i)).toBeInTheDocument());
  });
});
