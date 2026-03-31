import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { VanillaLoader } from './modern';
import { hasPermission } from '../config/roleHierarchy';
import { logSecurityEvent } from '../services/auditService';

/**
 * PrivateRoute Component
 * 
 * Protects routes by requiring authentication and optionally specific roles.
 * Uses role hierarchy for permission checking (super_admin > teacher > student).
 * 
 * @security Part of RBAC Security Hardening (PRD-0016)
 * 
 * @param {React.ReactNode} children - The protected content to render
 * @param {string[]} allowedRoles - Roles that can access this route (uses hierarchy)
 */
const PrivateRoute = ({ children, allowedRoles = [] }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Track if we've already logged this access denial to prevent duplicate logs
  const hasLoggedDenial = useRef(false);

  // Reset the logging flag when the location changes
  useEffect(() => {
    hasLoggedDenial.current = false;
  }, [location.pathname]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        role="status"
        aria-label="Loading protected route"
        aria-live="polite"
      >
        <VanillaLoader size="xl" />
      </div>
    );
  }

  // Not logged in - redirect to login page
  if (!user) {
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  // Check role-based access if roles are specified
  if (allowedRoles.length > 0) {
    // If profile is still loading or doesn't exist, we can't verify role
    if (!profile) {
      // Redirect to access denied with session reason
      return (
        <Navigate
          to="/access-denied"
          state={{ from: location.pathname, reason: 'session' }}
          replace
        />
      );
    }

    // Check if user is blocked
    if (profile.status === 'blocked') {
      // Log access denied event (Task 6.10)
      if (!hasLoggedDenial.current) {
        logSecurityEvent.accessDenied(user.uid, profile.role, location.pathname, 'blocked');
        hasLoggedDenial.current = true;
      }
      return (
        <Navigate
          to="/blocked"
          state={{ from: location.pathname, reason: 'blocked' }}
          replace
        />
      );
    }

    // Use hasPermission with role hierarchy
    // This allows super_admin to access teacher routes, etc.
    if (!hasPermission(profile.role, allowedRoles)) {
      // Log access denied event (Task 6.10)
      if (!hasLoggedDenial.current) {
        logSecurityEvent.accessDenied(user.uid, profile.role, location.pathname, 'role');
        hasLoggedDenial.current = true;
      }
      // User is logged in but doesn't have permission
      // Redirect to access denied page with context
      return (
        <Navigate
          to="/access-denied"
          state={{ from: location.pathname, reason: 'role' }}
          replace
        />
      );
    }
  }

  return children;
};

export default PrivateRoute;
