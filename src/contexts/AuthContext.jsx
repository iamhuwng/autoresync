import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { ref, get, set, serverTimestamp, onValue, remove } from 'firebase/database';
import { auth, database, googleProvider } from '../services/firebase';
import { logSecurityEvent } from '../services/auditService';

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

  const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL;

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

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          setUser(authUser);

          // Check for existing profile
          const userRef = ref(database, `users/${authUser.uid}`);

          // Real-time listener for profile changes (including security flags)
          unsubscribeProfile = onValue(userRef, async (snapshot) => {
            const data = snapshot.val();

            if (data) {
              // ===== SECURITY CHECKS (Task 5.0) =====

              // Task 5.7: Check if user is blocked - immediate logout
              if (data.status === 'blocked') {
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
              const isSuperAdmin = authUser.email === SUPER_ADMIN_EMAIL;
              const mergedProfile = {
                ...data,
                uid: authUser.uid,
                email: authUser.email, // Ensure email is up to date from Auth
                role: isSuperAdmin ? 'super_admin' : data.role,
              };
              setProfile(mergedProfile);
              setIsBlocked(false);
              setForceLogoutReason(null);
            } else {
              // No profile exists yet - will be created during login/registration flow
              // If it's the Super Admin email, we can auto-create/promote
              if (authUser.email === SUPER_ADMIN_EMAIL) {
                const newProfile = {
                  uid: authUser.uid,
                  email: authUser.email,
                  displayName: authUser.displayName,
                  photoURL: authUser.photoURL,
                  role: 'super_admin',
                  createdAt: serverTimestamp(),
                  lastLoginAt: serverTimestamp(),
                  status: 'active',
                  forceReauth: false
                };
                set(userRef, newProfile).catch(console.error);
              } else {
                setProfile(null);
              }
            }
            setLoading(false);
          });

        } else {
          setUser(null);
          setProfile(null);
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
    };
  }, [SUPER_ADMIN_EMAIL, handleForceLogout]);

  /**
   * Google OAuth login
   * Task 5.10: Prevent login for blocked users
   */
  const login = async () => {
    try {
      setError(null);
      setForceLogoutReason(null);

      const result = await signInWithPopup(auth, googleProvider);
      const authUser = result.user;

      // Check if user is blocked BEFORE proceeding (Task 5.10)
      const userRef = ref(database, `users/${authUser.uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const userData = snapshot.val();

        // Block login for blocked users
        if (userData.status === 'blocked') {
          console.warn('[Security] Blocked user attempted to login');
          setIsBlocked(true);
          await firebaseSignOut(auth);
          throw new Error('Your account has been blocked. Please contact support.');
        }

        // Update last login and clear any stale forceReauth flag
        await set(ref(database, `users/${authUser.uid}/lastLoginAt`), serverTimestamp());
        await remove(ref(database, `users/${authUser.uid}/forceReauth`)).catch(() => { });
      } else {
        // Create new student profile by default if not super admin
        if (authUser.email !== SUPER_ADMIN_EMAIL) {
          const newProfile = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName,
            photoURL: authUser.photoURL,
            role: 'student', // Default role
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            status: 'active',
            forceReauth: false
          };
          await set(userRef, newProfile);
        }
      }

      // Log successful login (Task 6.8)
      const userRole = snapshot.exists() ? snapshot.val().role : 'student';
      logSecurityEvent.login(authUser.uid, userRole, authUser.email);

      return result;
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /**
   * Email/Password login
   * Task 5.10: Prevent login for blocked users
   */
  const loginWithEmail = async (email, password) => {
    try {
      setError(null);
      setForceLogoutReason(null);

      const result = await signInWithEmailAndPassword(auth, email, password);
      const authUser = result.user;

      // Check if user is blocked BEFORE proceeding (Task 5.10)
      const userRef = ref(database, `users/${authUser.uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const userData = snapshot.val();

        // Block login for blocked users
        if (userData.status === 'blocked') {
          console.warn('[Security] Blocked user attempted to login via email');
          setIsBlocked(true);
          await firebaseSignOut(auth);
          throw new Error('Your account has been blocked. Please contact support.');
        }

        // Update last login and clear any stale forceReauth flag
        await set(ref(database, `users/${authUser.uid}/lastLoginAt`), serverTimestamp());
        await remove(ref(database, `users/${authUser.uid}/forceReauth`)).catch(() => { });

        // Log successful login (Task 6.8)
        logSecurityEvent.login(authUser.uid, userData.role, authUser.email);
      }

      return result;
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  /**
   * Manual logout
   */
  const logout = async () => {
    try {
      // Revoke Google OAuth token to force fresh login
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        }
      } catch (revokeError) {
        console.warn('Token revocation failed (non-critical):', revokeError);
      }

      // Log logout event before signing out (Task 6.9)
      if (user?.uid && profile?.role) {
        logSecurityEvent.logout(user.uid, profile.role, 'manual');
      }

      await firebaseSignOut(auth);

      // Clear local state immediately
      setUser(null);
      setProfile(null);
      setForceLogoutReason(null);

      // Clear all session storage
      sessionStorage.clear();

      // Clear any cached Google auth data
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
   * Email/Password registration
   */
  const registerWithEmail = async (email, password, role = 'student', displayName = 'Test User') => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const authUser = result.user;

      const userRef = ref(database, `users/${authUser.uid}`);
      const newProfile = {
        uid: authUser.uid,
        email: authUser.email,
        displayName: displayName,
        role: role,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        status: 'active',
        forceReauth: false
      };

      await set(userRef, newProfile);
      return result;
    } catch (err) {
      setError(err);
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
    logSecurityEvent.roleChange(
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
    loading,
    error,
    login,
    loginWithEmail,
    registerWithEmail,
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
