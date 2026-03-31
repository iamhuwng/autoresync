import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { redeemTeacherInvite } from '../services/invitationService';
import { Card, CardBody, Button } from '../components/modern';
import { Input } from '../components/modern';
import { IconArrowLeft } from '@tabler/icons-react';

const TeacherInvitePage = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [processingInvite, setProcessingInvite] = useState(false);

  const handleRedeemInvite = async (e) => {
    e.preventDefault();
    
    if (!user) {
      setInviteError('Please sign in first');
      return;
    }

    if (!inviteCode.trim()) {
      setInviteError('Please enter an invitation code');
      return;
    }

    setInviteError(null);
    setProcessingInvite(true);

    try {
      const result = await redeemTeacherInvite(inviteCode.trim().toUpperCase(), user.uid);
      
      if (result.success) {
        setInviteSuccess(true);
        setInviteCode('');
        // Wait a moment then redirect
        setTimeout(() => {
          navigate('/lobby', { replace: true });
        }, 2000);
      } else {
        setInviteError(result.error || 'Failed to redeem invitation code');
      }
    } catch (error) {
      console.error('Invite redemption error:', error);
      setInviteError('An error occurred while redeeming the code');
    } finally {
      setProcessingInvite(false);
    }
  };

  // Show loading state while auth is loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <Card variant="glass">
          <CardBody>
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ margin: 0, color: '#334155', fontSize: '1rem', fontWeight: 600 }}>Loading...</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Redirect if not a student
  if (profile && profile.role !== 'student') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <Card variant="glass">
          <CardBody>
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'rgba(254, 249, 195, 0.8)', border: '1px solid rgba(234, 179, 8, 0.22)', color: '#854d0e' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Access Denied</div>
              <div>This page is only available for student accounts. You are currently logged in as a {profile.role}.</div>
            </div>
            <Button 
              variant="primary" 
              style={{ marginTop: '1rem' }}
              onClick={() => navigate(-1)}
            >
              <IconArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
              Go Back
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Redirect if not logged in
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <Card variant="glass">
          <CardBody>
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'rgba(254, 242, 242, 0.95)', border: '1px solid rgba(239, 68, 68, 0.18)', color: '#991b1b' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Not Signed In</div>
              <div>Please sign in to redeem a teacher invitation code.</div>
            </div>
            <Button 
              variant="primary" 
              style={{ marginTop: '1rem' }}
              onClick={() => navigate('/')}
            >
              Sign In
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
      <Card variant="glass">
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
              Become a Teacher
            </h1>
            <p style={{ margin: '0.75rem 0 0', color: '#64748b', lineHeight: 1.6 }}>
              Have a teacher invitation code? Enter it below to upgrade your account.
            </p>
          </div>

          {inviteSuccess ? (
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'rgba(240, 253, 244, 0.95)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#166534' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Success!</div>
              <div>You've been upgraded to a teacher account! Redirecting to your dashboard...</div>
            </div>
          ) : (
            <form onSubmit={handleRedeemInvite}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {inviteError && (
                  <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'rgba(254, 242, 242, 0.95)', border: '1px solid rgba(239, 68, 68, 0.18)', color: '#991b1b', position: 'relative' }}>
                    <button
                      type="button"
                      aria-label="Dismiss invite error"
                      onClick={() => setInviteError(null)}
                      style={{ position: 'absolute', top: '0.75rem', right: '0.8rem', border: 'none', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: '1rem' }}
                    >
                      x
                    </button>
                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Error</div>
                    <div>{inviteError}</div>
                  </div>
                )}

                <Input
                  label="Invitation Code"
                  placeholder="ABC123"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  disabled={processingInvite}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={processingInvite}
                  disabled={!inviteCode.trim() || processingInvite}
                >
                  {processingInvite ? 'Redeeming...' : 'Redeem Code'}
                </Button>

                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => navigate(-1)}
                >
                  <IconArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
                  Back to Dashboard
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default TeacherInvitePage;
