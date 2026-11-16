import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../hooks/useAuth';
import * as firebaseAuth from 'firebase/auth';
import * as firebaseDatabase from 'firebase/database';

// Mock Firebase modules
vi.mock('firebase/auth');
vi.mock('firebase/database');
vi.mock('../../services/firebaseCore', () => ({
  auth: {},
  app: {},
  database: {},
  googleProvider: {},
  isLocalDevelopment: false,
}));

// Test component to access auth context
const TestComponent = () => {
  const { user, profile, loading, login, loginWithEmail, loginWithStudentId, registerWithEmail, sendPasswordReset, setupStudentCredentials, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="profile">{profile ? profile.role : 'no-profile'}</div>
      <button onClick={login} data-testid="login-btn">Login</button>
      <button onClick={() => loginWithEmail('student@test.com', 'student')} data-testid="email-login-btn">Email login</button>
      <button onClick={() => loginWithEmail('unverified@student.test', 'password123').catch(() => {})} data-testid="unverified-login-btn">Unverified login</button>
      <button onClick={() => loginWithStudentId('student-7', 'password123')} data-testid="student-id-login-btn">Student ID login</button>
      <button onClick={() => registerWithEmail('new@student.test', 'password123', 'New Student', 'new-student-7')} data-testid="register-btn">Register</button>
      <button onClick={() => sendPasswordReset('student@test.com')} data-testid="reset-btn">Reset password</button>
      <button onClick={() => setupStudentCredentials({ studentId: 'DIFFERENT-ID', password: 'password123', firstName: 'QA', familyName: 'Student' }).catch(() => {})} data-testid="setup-btn">Set up credentials</button>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  let mockOnAuthStateChanged: any;
  let mockOnValue: any;
  let mockSignInWithPopup: any;
  let mockSignInWithEmailAndPassword: any;
  let mockSignInWithCustomToken: any;
  let mockSendEmailVerification: any;
  let mockSendPasswordResetEmail: any;
  let mockSignOut: any;
  let mockSet: any;
  let mockRemove: any;
  let mockGet: any;
  
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock Firebase Auth functions
    mockOnAuthStateChanged = vi.fn((auth, callback) => {
      // Immediately call with null user (logged out state)
      callback(null);
      return vi.fn(); // Return unsubscribe function
    });
    
    mockSignInWithPopup = vi.fn();
    mockSignInWithEmailAndPassword = vi.fn();
    mockSignInWithCustomToken = vi.fn();
    mockSendEmailVerification = vi.fn().mockResolvedValue(undefined);
    mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
    mockSignOut = vi.fn();
    
    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation(mockOnAuthStateChanged);
    vi.mocked(firebaseAuth.signInWithPopup).mockImplementation(mockSignInWithPopup);
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockImplementation(mockSignInWithEmailAndPassword);
    vi.mocked(firebaseAuth.signInWithCustomToken).mockImplementation(mockSignInWithCustomToken);
    vi.mocked(firebaseAuth.sendEmailVerification).mockImplementation(mockSendEmailVerification);
    vi.mocked(firebaseAuth.sendPasswordResetEmail).mockImplementation(mockSendPasswordResetEmail);
    vi.mocked(firebaseAuth.signOut).mockImplementation(mockSignOut);
    
    // Mock Firebase Database functions
    mockOnValue = vi.fn();
    mockSet = vi.fn().mockResolvedValue(undefined);
    mockRemove = vi.fn().mockResolvedValue(undefined);
    mockGet = vi.fn();
    
    vi.mocked(firebaseDatabase.ref).mockReturnValue({} as any);
    vi.mocked(firebaseDatabase.onValue).mockImplementation(mockOnValue);
    vi.mocked(firebaseDatabase.set).mockImplementation(mockSet);
    vi.mocked(firebaseDatabase.remove).mockImplementation(mockRemove);
    vi.mocked(firebaseDatabase.get).mockImplementation(mockGet);
    vi.mocked(firebaseDatabase.serverTimestamp).mockReturnValue({} as any);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('should initialize with loading state', async () => {
    // Mock onAuthStateChanged to not call callback immediately
    let authCallback: any;
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      authCallback = callback;
      // Don't call callback immediately - simulates loading
      return vi.fn();
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    // While auth is unresolved, the provider withholds children entirely.
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    
    // Now resolve auth state
    await waitFor(() => {
      if (authCallback) authCallback(null);
    });
    
    // After auth resolves, should be ready
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
  });

  it('should create user profile in RTDB on first login', async () => {
    const mockUser = {
      uid: 'test-uid-123',
      emailVerified: true,
      email: 'student@test.com',
      displayName: 'Test Student',
      photoURL: 'https://example.com/photo.jpg'
    };
    
    // Mock successful login
    mockSignInWithPopup.mockResolvedValue({ user: mockUser });
    
    // Mock get to return no existing profile
    mockGet.mockResolvedValue({
      exists: () => false,
      val: () => null
    });
    
    // Mock onValue to call callback with null (no profile)
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => false,
        val: () => null
      });
      return vi.fn();
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
    
    // Trigger login
    const loginBtn = screen.getByTestId('login-btn');
    await act(async () => {
      loginBtn.click();
    });
    
    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalled();
    });
    
    // Verify profile creation was attempted
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalled();
    });
  });

  it('supports email/password sign-in and creates a safe student profile when one is missing', async () => {
    const mockUser = {
      uid: 'email-student-uid',
      emailVerified: true,
      email: 'student@test.com',
      displayName: 'Email Student',
      photoURL: null,
    };
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUser });
    mockGet.mockResolvedValue({ exists: () => false, val: () => null });
    mockOnValue.mockImplementation((ref, callback) => {
      callback({ exists: () => false, val: () => null });
      return vi.fn();
    });

    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    await act(async () => screen.getByTestId('email-login-btn').click());

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith({}, 'student@test.com', 'student');
    expect(mockSet).toHaveBeenCalledWith({}, expect.objectContaining({ role: 'student', status: 'active' }));
  });

  it('uses a Firebase custom token for student-ID sign-in without returning the email to the browser', async () => {
    const mockUser = {
      uid: 'student-id-uid',
      emailVerified: true,
      email: 'student@test.com',
      displayName: 'Student',
      photoURL: null,
      getIdToken: vi.fn().mockResolvedValue('firebase-id-token'),
    };
    mockSignInWithCustomToken.mockResolvedValue({ user: mockUser });
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => ({ uid: mockUser.uid, email: mockUser.email, role: 'student', status: 'active' }),
    });
    mockOnValue.mockImplementation((ref, callback) => {
      callback({ exists: () => true, val: () => ({ uid: mockUser.uid, email: mockUser.email, role: 'student', status: 'active' }) });
      return vi.fn();
    });
    vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', 'https://student-auth.example');
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => String(url).endsWith('/auth/student/login')
        ? { customToken: 'one-time-custom-token' }
        : { studentId: 'student-7' },
    })));

    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    await act(async () => screen.getByTestId('student-id-login-btn').click());

    expect(mockSignInWithCustomToken).toHaveBeenCalledWith({}, 'one-time-custom-token');
  });

  it('rejects changing an assigned ID before updating the password', async () => {
    const { auth } = await import('../../services/firebaseCore');
    Object.assign(auth, { currentUser: { uid: 'google-student', getIdToken: vi.fn() } });
    mockGet.mockResolvedValue({ val: () => ({ studentId: 'STU-ASSIGNED' }) });
    try {
      render(<AuthProvider><TestComponent /></AuthProvider>);
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
      await act(async () => screen.getByTestId('setup-btn').click());
      expect(mockGet).toHaveBeenCalled();
      expect(firebaseAuth.updatePassword).not.toHaveBeenCalled();
    } finally {
      delete (auth as unknown as { currentUser?: unknown }).currentUser;
    }
  });

  it('uses Firebase password-reset email without requiring a Cloud Function', async () => {
    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    await act(async () => screen.getByTestId('reset-btn').click());

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({}, 'student@test.com', {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    });
  });

  it('withholds unverified auth state and profile listeners while verification is pending, including restored sessions', async () => {
    const unverifiedUser = {
      uid: 'unverified-uid', email: 'unverified@student.test', emailVerified: false,
      getIdToken: vi.fn(),
    };
    let authCallback: (user: unknown) => void;
    let finishVerification: () => void;
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      authCallback = callback;
      callback(unverifiedUser);
      return vi.fn();
    });
    mockSignInWithEmailAndPassword.mockImplementation(async () => {
      authCallback(unverifiedUser);
      return { user: unverifiedUser };
    });
    mockSendEmailVerification.mockImplementation(() => new Promise<void>(resolve => { finishVerification = resolve; }));
    mockOnValue.mockImplementation((_ref, callback) => {
      callback({ val: () => ({ role: 'student', status: 'active' }) });
      return vi.fn();
    });
    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('user').textContent).toBe('no-user');
    expect(screen.getByTestId('profile').textContent).toBe('no-profile');
    expect(mockOnValue).not.toHaveBeenCalled();
    await act(async () => screen.getByTestId('unverified-login-btn').click());
    expect(mockSendEmailVerification).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('user').textContent).toBe('no-user');
    expect(screen.getByTestId('profile').textContent).toBe('no-profile');
    expect(mockOnValue).not.toHaveBeenCalled();
    await act(async () => finishVerification());
    expect(mockSignOut).toHaveBeenCalled();
    await act(async () => authCallback({ ...unverifiedUser, emailVerified: true }));
    expect(screen.getByTestId('user').textContent).toBe(unverifiedUser.email);
    expect(screen.getByTestId('profile').textContent).toBe('student');
  });

  it('sends verification and blocks unverified password accounts', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: 'unverified-uid',
        email: 'unverified@student.test',
        emailVerified: false,
        getIdToken: vi.fn(),
      },
    });

    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    await act(async () => screen.getByTestId('unverified-login-btn').click());

    expect(mockSendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({ email: 'unverified@student.test' }), {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('does not grant super admin from a public environment variable', async () => {
    const superAdminEmail = 'admin@example.com';
    
    // Mock environment variable
    vi.stubEnv('VITE_SUPER_ADMIN_EMAIL', superAdminEmail);
    
    const mockUser = {
      uid: 'admin-uid',
      emailVerified: true,
      email: superAdminEmail,
      displayName: 'Super Admin',
      photoURL: null
    };
    
    // Mock onAuthStateChanged to call with admin user
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return vi.fn();
    });
    
    // Mock onValue to return no existing profile
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => false,
        val: () => null
      });
      return vi.fn();
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('no-profile'));
    expect(mockSet).not.toHaveBeenCalled();
    
    vi.unstubAllEnvs();
  });

  it('should clear user state on logout', async () => {
    const mockUser = {
      uid: 'test-uid',
      emailVerified: true,
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null
    };
    
    // Start with logged in user
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return vi.fn();
    });
    
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => true,
        val: () => ({
          uid: 'test-uid',
          email: 'test@example.com',
          role: 'student',
          status: 'active'
        })
      });
      return vi.fn();
    });
    
    const { rerender } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });
    
    // Mock logout
    mockSignOut.mockResolvedValue(undefined);
    
    // Update mock to return null after logout
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(null);
      return vi.fn();
    });
    
    const logoutBtn = screen.getByTestId('logout-btn');
    await act(async () => {
      logoutBtn.click();
    });
    
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
    
    // Rerender to trigger state update
    rerender(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('no-user');
    });
  });

  it('should update profile when RTDB changes', async () => {
    const mockUser = {
      uid: 'test-uid',
      emailVerified: true,
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null
    };
    
    let profileCallback: any;
    
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return vi.fn();
    });
    
    mockOnValue.mockImplementation((ref, callback) => {
      profileCallback = callback;
      // Initial profile
      callback({
        exists: () => true,
        val: () => ({
          uid: 'test-uid',
          email: 'test@example.com',
          role: 'student',
          status: 'active'
        })
      });
      return vi.fn();
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('profile').textContent).toBe('student');
    });
    
    // Simulate profile update in RTDB
    await act(async () => {
      profileCallback({
        exists: () => true,
        val: () => ({
          uid: 'test-uid',
          email: 'test@example.com',
          role: 'teacher',
          status: 'active',
          invitedBy: 'admin-uid'
        })
      });
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('profile').textContent).toBe('teacher');
    });
  });
});
