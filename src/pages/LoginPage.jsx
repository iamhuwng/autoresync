import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { Card, CardBody, Button, toast } from '../components/modern';
import { IconBrandGoogle } from '@tabler/icons-react';
import { sessionStore } from '../core/platform/storage';

export const canUseDevQuickLogin = (
  mode = import.meta.env.MODE,
  hostname = typeof window === 'undefined' ? '' : window.location?.hostname || '',
) => {
  if (mode === 'test') return true;
  if (hostname !== 'localhost') return false;
  return mode === 'development' || mode === 'spare';
};

const DEV_LOGIN_CREDENTIALS = import.meta.env.MODE === 'production' ? {} : {
  teacher: { id: 'teacher', email: 'teacher@test.com', password: 'teacher' },
  teacher2: { email: 'teacher2@test.com', password: 'password123' },
  student: { id: 'student', email: 'student@test.com', password: 'student' },
};

const RESERVED_STUDENT_IDS = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'teacher', 'student', 'superadmin',
]);

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: '0.75rem',
  background: '#fff',
  color: '#0f172a',
  padding: '0.8rem 0.9rem',
  fontSize: '0.9375rem',
  outlineOffset: 2,
};

const labelStyle = {
  display: 'block',
  color: '#334155',
  fontSize: '0.8125rem',
  fontWeight: 650,
  marginBottom: '0.4rem',
};

const primaryButtonStyle = {
  width: '100%',
  border: 0,
  borderRadius: '0.75rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: '#fff',
  fontSize: '0.9375rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const linkButtonStyle = {
  border: 0,
  background: 'transparent',
  color: '#5b4acb',
  fontSize: '0.8125rem',
  fontWeight: 650,
  cursor: 'pointer',
  padding: '0.35rem 0',
};

const passwordToggleStyle = {
  border: 0,
  background: 'transparent',
  color: '#5b4acb',
  fontSize: '0.75rem',
  fontWeight: 650,
  cursor: 'pointer',
  padding: '0.2rem 0',
};

const LoginPage = () => {
  const navigate = useNavigate();
  const {
    user,
    profile,
    loading,
    login,
    loginWithEmail,
    loginWithStudentId,
    registerWithEmail,
    completeGoogleRegistration,
    sendPasswordReset,
  } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.authentication);

  const [view, setView] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [formPending, setFormPending] = useState(false);
  const [googleLoginPending, setGoogleLoginPending] = useState(false);
  const [googleRegistration, setGoogleRegistration] = useState(false);
  const [devLoading, setDevLoading] = useState(null);
  const [showDevQuickLogin, setShowDevQuickLogin] = useState(false);
  const allowDevQuickLogin = canUseDevQuickLogin();
  const googleLoginInFlight = useRef(false);
  const loadedGoogleDraft = useRef('');

  useEffect(() => {
    if (!loading && user && !profile && user.providerData?.some((provider) => provider.providerId === 'google.com')) {
      setEmail(user.email || '');
      setGoogleRegistration(true);
      setView('register');
      const draftKey = `google-registration-draft:${user.uid}`;
      if (loadedGoogleDraft.current !== draftKey) {
        loadedGoogleDraft.current = draftKey;
        void sessionStore.get(draftKey).then((draft) => {
          if (!draft || typeof draft !== 'object') return;
          setFirstName(draft.firstName || '');
          setFamilyName(draft.familyName || '');
          setStudentId(draft.studentId || '');
        });
      }
      return;
    }
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

  useEffect(() => {
    if (!googleRegistration || !user?.uid) return;
    void sessionStore.set(`google-registration-draft:${user.uid}`, {
      firstName, familyName, studentId,
    });
  }, [googleRegistration, user?.uid, firstName, familyName, studentId]);

  const getAuthErrorMessage = (error) => {
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';

    if (errorCode === 'auth/unauthorized-domain' || errorMessage.includes('unauthorized-domain')) {
      return `This domain (${window.location.hostname}) is not authorized for sign-in. Please contact the administrator.`;
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
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found') {
      return 'The email or student ID and password do not match.';
    }
    if (errorCode === 'auth/student-id-unavailable') {
      return 'That student ID is already in use. Please choose another.';
    }
    if (errorCode === 'auth/weak-password') {
      return 'Choose a password with at least 6 characters.';
    }
    if (errorCode === 'auth/email-already-in-use') {
      return 'This email is already registered. Sign in instead, or use Google if that is how the account was created.';
    }
    if (errorCode === 'auth/invalid-email') {
      return 'Enter a valid email address.';
    }
    if (errorCode === 'auth/user-disabled') {
      return 'This account is unavailable. Please contact an administrator.';
    }
    if (errorCode === 'auth/email-not-verified') {
      return 'Check your email and verify your address before signing in.';
    }
    if (errorCode === 'auth/student-auth-unavailable') {
      return 'Student ID authentication is temporarily unavailable. You can still use email or Google sign-in.';
    }
    return errorMessage || 'Authentication failed. Please try again.';
  };

  const changeView = (nextView) => {
    setLoginError(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setGoogleRegistration(false);
    if (nextView === 'reset' && identifier.includes('@')) setEmail(identifier.trim());
    if (nextView === 'register' && identifier.includes('@')) setEmail(identifier.trim());
    setView(nextView);
    if (nextView === 'register') trackAction('openRegistration');
    else if (nextView === 'reset') trackAction('openPasswordReset');
    else trackAction('returnToLogin', { from: view });
  };

  const handleGoogleSignIn = async () => {
    if (googleLoginInFlight.current || formPending || devLoading) return;
    googleLoginInFlight.current = true;
    setGoogleLoginPending(true);
    setLoginError(null);
    trackAction('login', { method: 'google' });
    try {
      const result = await login();
      if (result?.needsStudentRegistration) {
        trackAction('openRegistration', { method: 'google' });
      }
    } catch (error) {
      console.error('Google login error:', error);
      setLoginError(getAuthErrorMessage(error));
    } finally {
      googleLoginInFlight.current = false;
      setGoogleLoginPending(false);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (formPending || devLoading) return;
    const value = identifier.trim();
    if (!value || !password) {
      setLoginError('Enter your email or student ID and password.');
      return;
    }

    setLoginError(null);
    setFormPending(true);
    const isEmail = value.includes('@');
    const devCredential = import.meta.env.MODE === 'production'
      ? null
      : allowDevQuickLogin
        ? Object.values(DEV_LOGIN_CREDENTIALS).find((credential) => credential.id === value && credential.password === password)
        : null;
    trackAction('login', { method: devCredential ? 'dev_id' : isEmail ? 'email' : 'student_id' });
    try {
      if (devCredential) await loginWithEmail(devCredential.email, password);
      else if (isEmail) await loginWithEmail(value, password);
      else await loginWithStudentId(value, password);
    } catch (error) {
      console.error('Password login error:', error);
      setLoginError(getAuthErrorMessage(error));
    } finally {
      setFormPending(false);
    }
  };

  const handleRegistrationSubmit = async (event) => {
    event.preventDefault();
    if (formPending) return;
    const normalizedStudentId = studentId.trim().normalize('NFKC');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/u.test(normalizedStudentId)
      || RESERVED_STUDENT_IDS.has(normalizedStudentId.toLowerCase())) {
      toast.error('Registration failed: choose a student ID with 3–32 letters, numbers, dots, underscores or hyphens.');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
      toast.error('Registration failed: enter a valid email address.');
      return;
    }
    if (firstName.trim().length < 1 || familyName.trim().length < 1) {
      toast.error('Registration failed: enter your first and last name.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Registration failed: the passwords do not match.');
      return;
    }

    setFormPending(true);
    trackAction('register', { method: googleRegistration ? 'google_password' : 'email_password', role: 'student' });
    try {
      if (googleRegistration) {
        await completeGoogleRegistration({ studentId: normalizedStudentId, password, firstName: firstName.trim(), familyName: familyName.trim() });
        await sessionStore.remove(`google-registration-draft:${user.uid}`);
      } else {
        await registerWithEmail(normalizedEmail, password, `${firstName.trim()} ${familyName.trim()}`, normalizedStudentId);
      }
      toast.success(`Student account created. Your student ID is ${normalizedStudentId}. You can use it or your email to sign in.`);
    } catch (error) {
      console.error('Student registration error:', error);
      if (error?.code === 'auth/email-not-verified') {
        toast.info(getAuthErrorMessage(error));
        setView('login');
      } else {
        toast.error(`Registration failed: ${getAuthErrorMessage(error)}`);
      }
    } finally {
      setFormPending(false);
    }
  };

  const handlePasswordResetSubmit = async (event) => {
    event.preventDefault();
    if (formPending) return;
    setFormPending(true);
    trackAction('resetPassword', { method: 'email' });
    try {
      await sendPasswordReset(email.trim());
      toast.success('If an account exists for that email, Firebase will send a password reset link.');
      setView('login');
    } catch (error) {
      toast.error(`Password reset failed: ${getAuthErrorMessage(error)}`);
    } finally {
      setFormPending(false);
    }
  };

  const handleDevLogin = import.meta.env.MODE === 'production' ? async () => {} : async (role) => {
    if (formPending || googleLoginPending || devLoading) return;
    setLoginError(null);
    setDevLoading(role);
    trackAction('login', { method: 'dev', role });
    try {
      const credentials = DEV_LOGIN_CREDENTIALS[role] ?? DEV_LOGIN_CREDENTIALS.student;
      await loginWithEmail(credentials.email, credentials.password);
    } catch (error) {
      console.error(`Dev ${role} login error:`, error);
      setLoginError(getAuthErrorMessage(error));
    } finally {
      setDevLoading(null);
    }
  };

  const handleDevQuickLoginToggle = () => {
    setShowDevQuickLogin((currentValue) => {
      const nextValue = !currentValue;
      trackAction('toggleDevQuickLogin', { visible: nextValue });
      return nextValue;
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, color: '#334155', fontSize: '1rem', fontWeight: 600 }}>Loading...</p>
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div style={{ position: 'absolute', top: '10%', left: '10%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'float 8s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 250, height: 250, background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'float 10s ease-in-out infinite reverse' }} />

      <Card
        variant="glass"
        style={{ maxWidth: 440, width: '100%', position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)' }}
      >
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '2.35rem', fontWeight: 700, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 0 0.5rem' }}>
              {view === 'register' ? 'Create your account' : view === 'reset' ? 'Reset password' : 'Welcome'}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem', margin: 0 }}>
              {view === 'register'
                ? 'Create a student account with your email and a unique student ID.'
                : view === 'reset'
                  ? 'We will send a password reset link to your account email.'
                  : 'Sign in with Google, email or your student ID.'}
            </p>
          </div>

          {loginError && (
            <div role="alert" style={{ marginBottom: '1rem', borderRadius: '1rem', border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(254,242,242,0.95)', color: '#991b1b', padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1, fontSize: '0.875rem', lineHeight: 1.5 }}>{loginError}</div>
                <button type="button" aria-label="Dismiss login error" onClick={() => setLoginError(null)} style={{ border: 0, background: 'transparent', color: '#991b1b', cursor: 'pointer', padding: 0 }}>×</button>
              </div>
            </div>
          )}

          {user && !googleRegistration ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Redirecting...</p>
            </div>
          ) : (
            <>
              {view === 'login' && (
                <>
                  <Button variant="primary" size="lg" fullWidth onClick={handleGoogleSignIn} disabled={googleLoginPending || formPending || Boolean(devLoading)}>
                    <IconBrandGoogle size={20} style={{ marginRight: '0.5rem' }} />
                    {googleLoginPending ? 'Signing in...' : 'Sign in with Google'}
                  </Button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.35rem 0 1.1rem' }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    <span style={{ fontSize: '0.6875rem', fontWeight: 650, color: '#94a3b8', letterSpacing: '0.06em' }}>OR USE PASSWORD</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  </div>
                  <form onSubmit={handleLoginSubmit} noValidate>
                    <div style={{ marginBottom: '1rem' }}>
                      <label htmlFor="login-identifier" style={labelStyle}>Email or Student ID</label>
                      <input id="login-identifier" name="identifier" type="text" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com or student ID" required style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <label htmlFor="login-password" style={labelStyle}>Password</label>
                        <button type="button" style={passwordToggleStyle} aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => { setShowPassword((visible) => !visible); trackAction('togglePasswordVisibility', { field: 'login', visible: !showPassword }); }}>
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                      <button type="button" style={linkButtonStyle} onClick={() => changeView('reset')}>Forgot password?</button>
                    </div>
                    <button type="submit" disabled={formPending || googleLoginPending || Boolean(devLoading)} style={{ ...primaryButtonStyle, opacity: formPending ? 0.7 : 1, cursor: formPending ? 'wait' : 'pointer' }}>
                      {formPending ? 'Signing in...' : 'Sign in'}
                    </button>
                  </form>
                  <p style={{ color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center', margin: '1rem 0 0' }}>
                    New registrations are for students. Teacher accounts are created by administrators.
                  </p>
                  <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
                    <button type="button" style={linkButtonStyle} onClick={() => changeView('register')}>Create a student account</button>
                  </div>
                </>
              )}

              {view === 'register' && (
                <form onSubmit={handleRegistrationSubmit} noValidate>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <label htmlFor="register-first-name" style={labelStyle}>First name</label>
                        <input id="register-first-name" name="firstName" type="text" autoComplete="given-name" maxLength={50} value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" required style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label htmlFor="register-family-name" style={labelStyle}>Last name</label>
                        <input id="register-family-name" name="familyName" type="text" autoComplete="family-name" maxLength={50} value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="Last name" required style={inputStyle} />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label htmlFor="register-student-id" style={labelStyle}>Student ID / Username</label>
                    <input id="register-student-id" name="studentId" type="text" autoComplete="username" minLength={3} maxLength={32} value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Choose a unique ID" required style={inputStyle} />
                    <p style={{ margin: '0.35rem 0 0', color: '#94a3b8', fontSize: '0.72rem' }}>3–32 letters, numbers, dots, underscores or hyphens. You can use this or your email to sign in.</p>
                  </div>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label htmlFor="register-email" style={labelStyle}>Email address</label>
                    <input id="register-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" readOnly={googleRegistration} aria-readonly={googleRegistration} required style={{ ...inputStyle, ...(googleRegistration ? { background: '#f8fafc', color: '#64748b' } : {}) }} />
                  </div>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <label htmlFor="register-password" style={labelStyle}>Password</label>
                      <button type="button" style={passwordToggleStyle} aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => { setShowPassword((visible) => !visible); trackAction('togglePasswordVisibility', { field: 'register', visible: !showPassword }); }}>
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input id="register-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" required style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <label htmlFor="register-confirm-password" style={labelStyle}>Confirm password</label>
                      <button type="button" style={passwordToggleStyle} aria-pressed={showConfirmPassword} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => { setShowConfirmPassword((visible) => !visible); trackAction('togglePasswordVisibility', { field: 'confirm_password', visible: !showConfirmPassword }); }}>
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input id="register-confirm-password" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" required style={inputStyle} />
                  </div>
                  <button type="submit" disabled={formPending} style={{ ...primaryButtonStyle, opacity: formPending ? 0.7 : 1, cursor: formPending ? 'wait' : 'pointer' }}>
                    {formPending ? 'Creating account...' : 'Create student account'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
                    {!googleRegistration && <button type="button" style={linkButtonStyle} onClick={() => changeView('login')}>Back to sign in</button>}
                  </div>
                </form>
              )}

              {view === 'reset' && (
                <form onSubmit={handlePasswordResetSubmit}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="reset-email" style={labelStyle}>Account email</label>
                    <input id="reset-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required style={inputStyle} />
                  </div>
                  <button type="submit" disabled={formPending} style={{ ...primaryButtonStyle, opacity: formPending ? 0.7 : 1, cursor: formPending ? 'wait' : 'pointer' }}>
                    {formPending ? 'Sending...' : 'Send password reset email'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
                    <button type="button" style={linkButtonStyle} onClick={() => changeView('login')}>Back to sign in</button>
                  </div>
                </form>
              )}

              {allowDevQuickLogin && showDevQuickLogin && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    <span style={{ fontSize: '0.6875rem', fontWeight: 650, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dev Quick Login</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {['teacher', 'teacher2', 'student'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleDevLogin(role)}
                        disabled={devLoading !== null || formPending || googleLoginPending}
                        style={{ flex: '1 1 30%', minWidth: 90, padding: '0.65rem 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: 650, cursor: devLoading ? 'wait' : 'pointer', opacity: devLoading && devLoading !== role ? 0.5 : 1 }}
                      >
                        {devLoading === role ? 'Logging in...' : role === 'teacher2' ? 'Teacher 2' : role[0].toUpperCase() + role.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {allowDevQuickLogin && <button
        type="button"
        aria-label={showDevQuickLogin ? 'Hide dev quick login' : 'Show dev quick login'}
        aria-pressed={showDevQuickLogin}
        onClick={handleDevQuickLoginToggle}
        style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 2, width: '2.75rem', height: '2.75rem', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '999px', background: showDevQuickLogin ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', color: 'rgba(255,255,255,0.45)', opacity: showDevQuickLogin ? 0.65 : 0.3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" />
        </svg>
      </button>}

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
