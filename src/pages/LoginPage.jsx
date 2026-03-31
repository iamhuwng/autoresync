import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

import { Card, CardBody, Button } from '../components/modern';
import { IconBrandGoogle } from '@tabler/icons-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, profile, loading, login, loginWithEmail } = useAuth();
  const [loginError, setLoginError] = useState(null);
  const [devLoading, setDevLoading] = useState(null); // 'teacher' | 'student' | null

  // Auto-redirect authenticated users to their role-appropriate dashboard
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'super_admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (profile.role === 'teacher') {
        navigate('/lobby', { replace: true });
      } else {
        navigate('/student', { replace: true });
      }
    }
  }, [loading, user, profile, navigate]);

  // Helper to get user-friendly error messages
  const getLoginErrorMessage = (error) => {
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';

    if (errorCode === 'auth/unauthorized-domain' || errorMessage.includes('unauthorized-domain')) {
      return `This domain (${window.location.hostname}) is not authorized for sign-in. Please contact the administrator to add this domain to Firebase Authentication settings.`;
    }
    if (errorCode === 'auth/popup-blocked') {
      return 'Sign-in popup was blocked. Please allow popups for this site and try again.';
    }
    if (errorCode === 'auth/popup-closed-by-user' || errorCode === 'auth/cancelled-popup-request') {
      return 'Sign-in was cancelled. Please try again.';
    }
    if (errorCode === 'auth/network-request-failed') {
      return 'Network error. Please check your internet connection and try again.';
    }
    if (errorCode === 'auth/too-many-requests') {
      return 'Too many sign-in attempts. Please wait a moment and try again.';
    }
    return errorMessage || 'Failed to sign in with Google. Please try again.';
  };

  const handleGoogleSignIn = async () => {
    setLoginError(null);
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
      setLoginError(getLoginErrorMessage(error));
    }
  };

  // Dev quick-login handler
  const handleDevLogin = async (role) => {
    setLoginError(null);
    setDevLoading(role);
    try {
      const email = role === 'teacher' ? 'teacher@test.com' : 'student@test.com';
      await loginWithEmail(email, 'password123');
    } catch (error) {
      console.error(`Dev ${role} login error:`, error);
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setDevLoading(null);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <p style={{ margin: 0, color: '#334155', fontSize: '1rem', fontWeight: 600 }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {/* Animated Background Elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 8s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: '250px',
        height: '250px',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 10s ease-in-out infinite reverse'
      }} />

      <Card
        variant="glass"
        style={{
          maxWidth: '420px',
          width: '100%',
          position: 'relative',
          zIndex: 1,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)'
        }}
      >
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem'
            }}>
              Welcome
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Sign in to access your account
            </p>
          </div>

          {loginError && (
            <div
              role="alert"
              style={{
                marginBottom: '1rem',
                borderRadius: '1rem',
                border: '1px solid rgba(239, 68, 68, 0.18)',
                background: 'rgba(254, 242, 242, 0.95)',
                color: '#991b1b',
                padding: '0.875rem 1rem',
                boxShadow: '0 12px 30px rgba(239, 68, 68, 0.08)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.02em', marginBottom: '0.2rem' }}>
                    Error
                  </div>
                  <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {loginError}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss login error"
                  onClick={() => setLoginError(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#991b1b',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  x
                </button>
              </div>
            </div>
          )}

          {user ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Redirecting...</p>
            </div>
          ) : (
            <div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleGoogleSignIn}
              >
                <IconBrandGoogle size={20} style={{ marginRight: '0.5rem' }} />
                Sign in with Google
              </Button>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem' }}>
                New users will be registered as students by default
              </p>

              {/* Demo Quick-Login Buttons */}
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: '600',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Demo Quick Login
                  </span>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    id="dev-login-teacher"
                    onClick={() => handleDevLogin('teacher')}
                    disabled={devLoading !== null}
                    style={{
                      flex: 1,
                      padding: '0.625rem 1rem',
                      borderRadius: '0.75rem',
                      border: '1.5px solid #8b5cf6',
                      background: devLoading === 'teacher'
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'rgba(139, 92, 246, 0.05)',
                      color: devLoading === 'teacher' ? '#fff' : '#7c3aed',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: devLoading !== null ? 'not-allowed' : 'pointer',
                      opacity: devLoading !== null && devLoading !== 'teacher' ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!devLoading) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!devLoading || devLoading !== 'teacher') {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                        e.currentTarget.style.color = '#7c3aed';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    {devLoading === 'teacher' ? 'Logging in...' : 'Teacher'}
                  </button>
                  <button
                    id="dev-login-student"
                    onClick={() => handleDevLogin('student')}
                    disabled={devLoading !== null}
                    style={{
                      flex: 1,
                      padding: '0.625rem 1rem',
                      borderRadius: '0.75rem',
                      border: '1.5px solid #06b6d4',
                      background: devLoading === 'student'
                        ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
                        : 'rgba(6, 182, 212, 0.05)',
                      color: devLoading === 'student' ? '#fff' : '#0891b2',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: devLoading !== null ? 'not-allowed' : 'pointer',
                      opacity: devLoading !== null && devLoading !== 'student' ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!devLoading) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!devLoading || devLoading !== 'student') {
                        e.currentTarget.style.background = 'rgba(6, 182, 212, 0.05)';
                        e.currentTarget.style.color = '#0891b2';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {devLoading === 'student' ? 'Logging in...' : 'Student'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
