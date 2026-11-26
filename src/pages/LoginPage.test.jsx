import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import LoginPage, { canUseDevQuickLogin } from './LoginPage';

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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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

  it('waits for the observed Google session before opening student registration', async () => {
    const account = { uid: 'new-google', email: 'new.google@example.com', providerData: [{ providerId: 'google.com' }] };
    mockLogin.mockResolvedValueOnce({ needsStudentRegistration: true, user: account });
    const user = userEvent.setup();
    const { rerender } = renderPage();
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(screen.queryByRole('heading', { name: /create your account/i })).not.toBeInTheDocument();

    mockUseAuth.mockReturnValue({ ...mockUseAuth(), user: account });
    rerender(<BrowserRouter><LoginPage /></BrowserRouter>);
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveValue('new.google@example.com');
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('readonly');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('resumes the registration form for an authenticated Google account without a profile', async () => {
    sessionStorage.setItem('google-registration-draft:google-resume-1', JSON.stringify({
      firstName: 'Saved', familyName: 'Student', studentId: 'saved-7', password: 'password123', confirmPassword: 'password123',
    }));
    mockUseAuth.mockReturnValue({
      user: { uid: 'google-resume-1', email: 'resume.google@example.com', providerData: [{ providerId: 'google.com' }] },
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
    expect(await screen.findByLabelText(/first name/i)).toHaveValue('Saved');
    expect(screen.getByLabelText(/student id \/ username/i)).toHaveValue('saved-7');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue('');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('completes a new Google account through the student registration submit path', async () => {
    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      user: { uid: 'new-google', email: 'new.google@example.com', providerData: [{ providerId: 'google.com' }] },
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Google');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'new-google-7');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    const draft = JSON.parse(sessionStorage.getItem('google-registration-draft:new-google'));
    expect(draft).toEqual({ firstName: 'New', familyName: 'Google', studentId: 'new-google-7' });
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

  it('announces Worker registration failures while retaining registration observability', async () => {
    mockRegisterWithEmail.mockRejectedValueOnce({ code: 'auth/student-id-unavailable' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /create a student account/i }));
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'taken-student-7');
    await user.type(screen.getByLabelText(/email address/i), 'new.student@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create student account/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      'Registration failed: That student ID is already in use. Please choose another.',
    ));
    expect(mockTrackAction).toHaveBeenCalledWith('register', { method: 'email_password', role: 'student' });
  });

  it('rejects a password outside the Worker-supported length before creating an account', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /create a student account/i }));
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.type(screen.getByLabelText(/student id \/ username/i), 'short-password-7');
    await user.type(screen.getByLabelText(/email address/i), 'new.student@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create student account/i }));

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Registration failed: choose a password with 6–128 characters.');
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

  it('allows Dev Quick Login strictly on localhost for spare/development modes and never on deployed or production origins', () => {
    expect(canUseDevQuickLogin('spare', 'localhost')).toBe(true);
    expect(canUseDevQuickLogin('development', 'localhost')).toBe(true);
    expect(canUseDevQuickLogin('test', 'luyentap-pdf-qa-20261021.web.app')).toBe(true);
    expect(canUseDevQuickLogin('spare', 'luyentap-pdf-qa-20261021.web.app')).toBe(false);
    expect(canUseDevQuickLogin('spare', '127.0.0.1')).toBe(false);
    expect(canUseDevQuickLogin('production', 'kahut1.web.app')).toBe(false);
    expect(canUseDevQuickLogin('production', 'localhost')).toBe(false);
  });

  it('renders Dev Quick Login in spare mode on localhost and hides it in production mode', () => {
    vi.stubEnv('MODE', 'spare');
    const spareRender = renderPage();
    expect(screen.getByRole('button', { name: /show dev quick login/i })).toBeInTheDocument();
    spareRender.unmount();

    vi.stubEnv('MODE', 'production');
    renderPage();
    expect(screen.queryByRole('button', { name: /show dev quick login/i })).not.toBeInTheDocument();
  });
});
