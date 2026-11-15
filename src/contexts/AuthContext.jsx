import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  sendEmailVerification,
  updatePassword,
  updateProfile as updateAuthProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { ref, get, set, serverTimestamp, onValue, remove } from 'firebase/database';
import { auth, database, googleProvider, isLocalDevelopment } from '../services/firebaseCore';

const studentAuthWorkerUrl = () => String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || '').trim().replace(/\/$/u, '');

const DEV_VERIFIED_EMAILS = new Set(['teacher@test.com', 'teacher2@test.com', 'student@test.com']);
const isDevVerifiedAccount = (email) => import.meta.env.DEV && DEV_VERIFIED_EMAILS.has(String(email || '').trim().toLowerCase());

const createAuthError = (code, message) => Object.assign(new Error(message), { code });

const studentAuthError = (code) => {
  const errors = {
    invalid_credentials: ['auth/invalid-credential', 'The email or student ID and password do not match.'],
    email_or_password_invalid: ['auth/invalid-credential', 'The email or password is incorrect, or this account uses Google sign-in.'],
    student_id_unavailable: ['auth/student-id-unavailable', 'That student ID is already in use. Please choose another.'],
    student_id_already_assigned: ['auth/student-id-unavailable', 'This account already has a different student ID.'],
    invalid_student_id: ['auth/invalid-argument', 'Use 3–32 letters, numbers, dots, underscores or hyphens for the student ID.'],
    invalid_email: ['auth/invalid-email', 'Enter a valid email address.'],
    weak_password: ['auth/weak-password', 'Choose a password with at least 6 characters.'],
    invalid_display_name: ['auth/invalid-argument', 'Enter your name.'],
    account_unavailable: ['auth/user-disabled', 'This account is unavailable. Please contact an administrator.'],
    rate_limited: ['auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.'],
    unauthorized: ['auth/unauthorized', 'Please sign in again and retry.'],
    registration_unavailable: ['auth/student-auth-unavailable', 'Student registration is temporarily unavailable. Please try again later.'],
    student_auth_unavailable: ['auth/student-auth-unavailable', 'Student ID authentication is temporarily unavailable. Please try again later.'],
  };
  const [firebaseCode, message] = errors[code] || errors.student_auth_unavailable;
  return createAuthError(firebaseCode, message);
};

const callStudentAuthWorker = async (path, body, authorization) => {
  const baseUrl = studentAuthWorkerUrl();
  if (!baseUrl) throw studentAuthError('student_auth_unavailable');
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw studentAuthError('student_auth_unavailable');
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Keep a stable auth error when the Worker returns a non-JSON response.
  }
  if (!response.ok) throw studentAuthError(payload?.code || 'student_auth_unavailable');
  return payload;
};

let securityLoggerPromise = null;

const getSecurityLogger = async () => {
  if (!securityLoggerPromise) {
    securityLoggerPromise = import('../services/auditService')
      .then((module) => module.logSecurityEvent)
      .catch((error) => {
        console.warn('[Audit] Failed to load security logger:', error);
        return null;
      });
  }

  return securityLoggerPromise;
};

const logSecurityEventAsync = (eventName, ...args) => {
  void getSecurityLogger().then((logger) => {
    const logEvent = logger?.[eventName];
    if (typeof logEvent === 'function') {
      logEvent(...args);
    }
  });
};

const AuthContext = createContext();

/**
 * AuthProvider with RBAC Security Hardening
 * 
 * Features (PRD-0016, Task 5.0):
 * - Force re-authentication on role/status changes
 * - Immediate logout on account block
 * - Prevent blocked users from logging in
 * - Real-time profile monitoring
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Security state (Task 5.0)
  const [isBlocked, setIsBlocked] = useState(false);
  const [forceLogoutReason, setForceLogoutReason] = useState(null);

  // Multi-role context switching (Task 7.0)
  const [activeRole, setActiveRoleState] = useState(() => {
    // Restore from sessionStorage on mount (Task 7.4)
    try {
      return sessionStorage.getItem('kahoot_active_role') || null;
    } catch {
      return null;
    }
  });

  // Track if we're in the process of force logout
  const isForceLoggingOut = useRef(false);


  /**
   * Handle force logout with reason
   * Task 5.3, 5.4: Auto-logout when forceReauth or blocked
   */
  const handleForceLogout = useCallback(async (reason, userId) => {
    if (isForceLoggingOut.current) return;
    isForceLoggingOut.current = true;

    console.warn(`[Security] Force logout triggered: ${reason}`);
    setForceLogoutReason(reason);

    try {
      // Clear forceReauth flag if that was the trigger (Task 5.4)
      if (reason === 'account_updated' && userId) {
        const forceReauthRef = ref(database, `users/${userId}/forceReauth`);
        await remove(forceReauthRef).catch(() => { });
      }

      // Perform logout
      await firebaseSignOut(auth);

      // Clear local state
      setUser(null);
      setProfile(null);
      setStudentId(null);
      setIsBlocked(reason === 'blocked');

      // Clear session storage
      sessionStorage.clear();

      // Clear Firebase localStorage cache
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('firebase:')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Ignore localStorage errors
      }
    } catch (err) {
      console.error('Force logout error:', err);
    } finally {
      isForceLoggingOut.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribeProfile = null;
    let unsubscribeStudentIdentifier = null;

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        if (unsubscribeStudentIdentifier) {
          unsubscribeStudentIdentifier();
          unsubscribeStudentIdentifier = null;
        }
        if (authUser) {
          setUser(authUser);
          setStudentId(null);

          // Check for existing profile
          const userRef = ref(database, `users/${authUser.uid}`);
          const studentIdentifierRef = ref(database, `student_identifiers/${authUser.uid}`);

          unsubscribeStudentIdentifier = onValue(studentIdentifierRef, (snapshot) => {
            const identifier = snapshot.val();
            setStudentId(typeof identifier?.studentId === 'string' ? identifier.studentId : null);
          });

          // Real-time listener for profile changes (including security flags)
          unsubscribeProfile = onValue(userRef, async (snapshot) => {
            const data = snapshot.val();

            if (data) {
              // ===== SECURITY CHECKS (Task 5.0) =====

              // Task 5.7: Check if user is blocked - immediate logout
              if (['blocked', 'disabled', 'inactive', 'suspended'].includes(String(data.status ?? 'active'))) {
                console.warn('[Security] User is blocked, triggering force logout');
                setIsBlocked(true);
                await handleForceLogout('blocked', authUser.uid);
                return;
              }

              // Task 5.2, 5.3: Check forceReauth flag
              if (data.forceReauth === true) {
                console.warn('[Security] Force reauth flag detected');
                await handleForceLogout('account_updated', authUser.uid);
                return;
              }

              // ===== END SECURITY CHECKS =====

              // Profile exists and is valid
              const mergedProfile = {
                ...data,
                uid: authUser.uid,
                email: authUser.email || data.email, // Custom-token sign-in may not expose email on the client user object.
              };
              setProfile(mergedProfile);
              setIsBlocked(false);
              setForceLogoutReason(null);
            } else {
              // No profile exists yet - will be created during login/registration flow
              setProfile(null);
            }
            setLoading(false);
          });

        } else {
          setUser(null);
          setProfile(null);
          setStudentId(null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
        setError(err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      if (unsubscribeStudentIdentifier) {
        unsubscribeStudentIdentifier();
      }
    };
  }, [handleForceLogout]);

  const ensureStudentId = useCallback(async (authUser) => {
    if (!studentAuthWorkerUrl() || !authUser?.getIdToken) return null;
    try {
      const idToken = await authUser.getIdToken();
      const payload = await callStudentAuthWorker('/auth/student/ensure-id', null, idToken);
      return typeof payload.studentId === 'string' ? payload.studentId : null;
    } catch (ensureError) {
      // Existing Google/email sign-in must remain available if the optional ID
      // assignment endpoint has not yet been deployed or is temporarily down.
      console.warn('[Auth] Student ID assignment could not be completed:', ensureError?.code || 'unavailable');
      return null;
    }
  }, []);

  const finalizeAuthenticatedLogin = useCallback(async (result) => {
    const authUser = result.user;

    if (result.requireVerifiedEmail && authUser.email && !authUser.emailVerified && !isDevVerifiedAccount(authUser.email)) {
      try {
        await sendEmailVerification(authUser, {
          url: `${window.location.origin}/login`,
          handleCodeInApp: false,
        });
      } catch (verificationError) {
        console.warn('[Auth] Verification email could not be sent:', verificationError?.code || 'unavailable');
      }
      await firebaseSignOut(auth);
      throw createAuthError('auth/email-not-verified', 'Check your email and verify your address before signing in.');
    }

    const userRef = ref(database, `users/${authUser.uid}`);
    const snapshot = await get(userRef);
    let userData = snapshot.exists() ? snapshot.val() : null;

    if (userData && ['blocked', 'disabled', 'inactive', 'suspended'].includes(String(userData.status ?? 'active'))) {
      console.warn('[Security] Unavailable user attempted to login');
      setIsBlocked(true);
      await firebaseSignOut(auth);
      throw createAuthError('auth/user-disabled', 'Your account is unavailable. Please contact an administrator.');
    }

    if (!userData) {
      // Accounts without a profile default to student. Privileged roles are
      // assigned only by the existing trusted administration workflows.
      userData = {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        photoURL: authUser.photoURL,
        role: 'student',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        status: 'active',
        forceReauth: false,
      };
      await set(userRef, userData);
    } else {
      await set(ref(database, `users/${authUser.uid}/lastLoginAt`), serverTimestamp());
      await Promise.resolve(remove(ref(database, `users/${authUser.uid}/forceReauth`))).catch(() => { });
    }

    if ((userData.role || 'student') === 'student') {
      const assignedStudentId = await ensureStudentId(authUser);
      if (assignedStudentId) setStudentId(assignedStudentId);
    }

    logSecurityEventAsync('login', authUser.uid, userData.role || 'student', authUser.email || userData.email);
    return result;
  }, [ensureStudentId]);

  /** Google OAuth login. */
  const login = async () => {
    try {
      setError(null);
      setForceLogoutReason(null);
      const result = await signInWithPopup(auth, googleProvider);
      return await finalizeAuthenticatedLogin({ ...result, requireVerifiedEmail: false });
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /** Email/password login for existing accounts. */
  const loginWithEmail = async (email, password) => {
    try {
      setError(null);
      setForceLogoutReason(null);
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      return await finalizeAuthenticatedLogin({ ...result, requireVerifiedEmail: true });
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /** Student ID login. The Worker resolves the private ID index without exposing account email addresses. */
  const loginWithStudentId = async (studentId, password) => {
    try {
      setError(null);
      setForceLogoutReason(null);
      const payload = await callStudentAuthWorker('/auth/student/login', { studentId, password });
      let result;
      if (typeof payload.customToken === 'string') {
        result = await signInWithCustomToken(auth, payload.customToken);
      } else if (isLocalDevelopment && typeof payload.email === 'string') {
        // The local emulator returns the resolved email only inside the isolated demo project.
        result = await signInWithEmailAndPassword(auth, payload.email, password);
      } else {
        throw studentAuthError('student_auth_unavailable');
      }
      return await finalizeAuthenticatedLogin({ ...result, requireVerifiedEmail: true });
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /** Student-only email/password registration with a unique student ID. */
  const registerWithEmail = async (email, password, displayName, studentId) => {
    try {
      setError(null);
      const payload = await callStudentAuthWorker('/auth/student/register', {
        email: email.trim().toLowerCase(),
        password,
        displayName: displayName.trim(),
        studentId: studentId.trim(),
      });
      let result;
      if (typeof payload.customToken === 'string') {
        result = await signInWithCustomToken(auth, payload.customToken);
      } else if (isLocalDevelopment && typeof payload.email === 'string') {
        result = await signInWithEmailAndPassword(auth, payload.email, password);
      } else {
        throw studentAuthError('student_auth_unavailable');
      }
      await finalizeAuthenticatedLogin({ ...result, requireVerifiedEmail: true });
      return result;
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /** Send a Firebase-managed password reset email. */
  const sendPasswordReset = async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email.trim(), {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
    } catch (err) {
      // Do not reveal whether an email address has an account.
      if (err?.code === 'auth/user-not-found') return;
      setError(err);
      throw err;
    }
  };

  const setupStudentCredentials = async ({ studentId, password, firstName, familyName }) => {
    if (!auth.currentUser?.getIdToken) throw studentAuthError('unauthorized');
    await updatePassword(auth.currentUser, password);
    const idToken = await auth.currentUser.getIdToken();
    await callStudentAuthWorker('/auth/student/ensure-id', {
      studentId,
      firstName,
      familyName,
      displayName: `${firstName} ${familyName}`.trim(),
    }, idToken);
    await updateAuthProfile(auth.currentUser, { displayName: `${firstName} ${familyName}`.trim() });
  };

  /**
   * Manual logout
   */
  const logout = async () => {
    try {
      // Log logout event before signing out (Task 6.9)
      if (user?.uid && profile?.role) {
        logSecurityEventAsync('logout', user.uid, profile.role, 'manual');
      }

      await firebaseSignOut(auth);

      // Clear local state immediately
      setUser(null);
      setProfile(null);
      setStudentId(null);
      setForceLogoutReason(null);

      // Clear all session storage
      sessionStorage.clear();

      // Clear any cached Firebase auth data
      try {
        localStorage.removeItem('firebase:authUser:' + import.meta.env.VITE_FIREBASE_API_KEY + ':[DEFAULT]');
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('firebase:')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Ignore if localStorage is not available
      }
    } catch (err) {
      console.error("Logout error:", err);
      throw err;
    }
  };

  /**
   * Get available roles for the current user (Task 7.0)
   * Combines primary role with any additional roles from the roles array
   */
  const getAvailableRoles = useCallback(() => {
    if (!profile) return [];

    const roles = new Set();

    // Add primary role
    if (profile.role) {
      roles.add(profile.role);
    }

    // Add additional roles if present
    if (profile.roles && Array.isArray(profile.roles)) {
      profile.roles.forEach(r => roles.add(r));
    }

    // Super admin always has all roles
    if (profile.role === 'super_admin') {
      roles.add('teacher');
      roles.add('student');
    }

    return Array.from(roles);
  }, [profile]);

  /**
   * Switch to a different role (Task 7.3)
   * Only allowed if the role is in the user's available roles list
   */
  const switchRole = useCallback(async (newRole) => {
    if (!profile) {
      throw new Error('Cannot switch role: No user profile');
    }

    const availableRoles = getAvailableRoles();

    // Task 7.8: Validate role is in allowed list
    if (!availableRoles.includes(newRole)) {
      throw new Error(`Role '${newRole}' is not available for this user`);
    }

    // Task 7.4: Store in sessionStorage for persistence
    try {
      sessionStorage.setItem('kahoot_active_role', newRole);
      sessionStorage.setItem('kahoot_last_role_switch', Date.now().toString());
    } catch (e) {
      console.warn('Failed to persist role to sessionStorage:', e);
    }

    setActiveRoleState(newRole);

    // Task 7.9: Log role switch event
    logSecurityEventAsync(
      'roleChange',
      { uid: profile.uid, role: getEffectiveRole() },
      profile.uid,
      getEffectiveRole(),
      newRole
    );

    console.log(`[Security] User switched role from ${getEffectiveRole()} to ${newRole}`);
  }, [profile, getAvailableRoles]);

  /**
   * Get the effective role (Task 7.0)
   * Returns activeRole if set and valid, otherwise falls back to profile.role
   */
  const getEffectiveRole = useCallback(() => {
    if (!profile) return null;

    // If activeRole is set and is valid for this user, use it
    if (activeRole && getAvailableRoles().includes(activeRole)) {
      return activeRole;
    }

    // Fall back to primary role
    return profile.role;
  }, [profile, activeRole, getAvailableRoles]);

  // Task 7.11: Handle edge case when user's role list changes while session is active
  useEffect(() => {
    if (profile && activeRole) {
      const availableRoles = getAvailableRoles();
      if (!availableRoles.includes(activeRole)) {
        // Active role is no longer valid, reset to default
        console.warn(`[Security] Active role '${activeRole}' no longer available, resetting`);
        setActiveRoleState(null);
        try {
          sessionStorage.removeItem('kahoot_active_role');
        } catch { }
      }
    }
  }, [profile, activeRole, getAvailableRoles]);

  const availableRoles = getAvailableRoles();
  const hasMultipleRoles = availableRoles.length > 1;
  const effectiveRole = getEffectiveRole();

  const value = {
    user,
    profile,
    studentId,
    loading,
    error,
    login,
    loginWithEmail,
    loginWithStudentId,
    registerWithEmail,
    sendPasswordReset,
    setupStudentCredentials,
    logout,

    // Security state (Task 5.0)
    isBlocked,
    forceLogoutReason,

    // Multi-role context switching (Task 7.0)
    activeRole: effectiveRole,
    availableRoles,
    hasMultipleRoles,
    switchRole,
    getEffectiveRole,

    // Role helpers (updated to use effectiveRole)
    isAdmin: effectiveRole === 'super_admin',
    isTeacher: effectiveRole === 'teacher' || effectiveRole === 'super_admin',
    isStudent: effectiveRole === 'student',

    // Original role (regardless of active role)
    primaryRole: profile?.role,

    // User status
    isActive: profile?.status === 'active',
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
