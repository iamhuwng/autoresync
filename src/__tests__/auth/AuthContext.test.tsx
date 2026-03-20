import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../hooks/useAuth';
import * as firebaseAuth from 'firebase/auth';
import * as firebaseDatabase from 'firebase/database';

// Mock Firebase modules
vi.mock('firebase/auth');
vi.mock('firebase/database');
vi.mock('../../services/firebase', () => ({
  auth: {},
  database: {},
  googleProvider: {}
}));

// Test component to access auth context
const TestComponent = () => {
  const { user, profile, loading, login, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="profile">{profile ? profile.role : 'no-profile'}</div>
      <button onClick={login} data-testid="login-btn">Login</button>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  let mockOnAuthStateChanged: any;
  let mockOnValue: any;
  let mockSignInWithPopup: any;
  let mockSignOut: any;
  let mockSet: any;
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
    mockSignOut = vi.fn();
    
    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation(mockOnAuthStateChanged);
    vi.mocked(firebaseAuth.signInWithPopup).mockImplementation(mockSignInWithPopup);
    vi.mocked(firebaseAuth.signOut).mockImplementation(mockSignOut);
    
    // Mock Firebase Database functions
    mockOnValue = vi.fn();
    mockSet = vi.fn().mockResolvedValue(undefined);
    mockGet = vi.fn();
    
    vi.mocked(firebaseDatabase.ref).mockReturnValue({} as any);
    vi.mocked(firebaseDatabase.onValue).mockImplementation(mockOnValue);
    vi.mocked(firebaseDatabase.set).mockImplementation(mockSet);
    vi.mocked(firebaseDatabase.get).mockImplementation(mockGet);
    vi.mocked(firebaseDatabase.serverTimestamp).mockReturnValue({} as any);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('should auto-promote Super Admin email to super_admin role', async () => {
    const superAdminEmail = 'admin@example.com';
    
    // Mock environment variable
    vi.stubEnv('VITE_SUPER_ADMIN_EMAIL', superAdminEmail);
    
    const mockUser = {
      uid: 'admin-uid',
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
    
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'super_admin',
          email: superAdminEmail
        })
      );
    });
    
    vi.unstubAllEnvs();
  });

  it('should clear user state on logout', async () => {
    const mockUser = {
      uid: 'test-uid',
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
