import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { redeemTeacherInvite } from '../services/invitationService';
import { Card, CardBody, Button } from '../components/modern';
import { Input } from '../components/modern';
import { Container, Title, Text, Alert, Stack } from '@mantine/core';
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
      <Container size="sm" py="xl">
        <Card variant="glass">
          <CardBody>
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Text>Loading...</Text>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  // Redirect if not a student
  if (profile && profile.role !== 'student') {
    return (
      <Container size="sm" py="xl">
        <Card variant="glass">
          <CardBody>
            <Alert color="yellow" title="Access Denied">
              This page is only available for student accounts. You are currently logged in as a {profile.role}.
            </Alert>
            <Button 
              variant="primary" 
              mt="md" 
              onClick={() => navigate(-1)}
            >
              <IconArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
              Go Back
            </Button>
          </CardBody>
        </Card>
      </Container>
    );
  }

  // Redirect if not logged in
  if (!user) {
    return (
      <Container size="sm" py="xl">
        <Card variant="glass">
          <CardBody>
            <Alert color="red" title="Not Signed In">
              Please sign in to redeem a teacher invitation code.
            </Alert>
            <Button 
              variant="primary" 
              mt="md" 
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
          </CardBody>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Card variant="glass">
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Title order={2} mb="sm">
              Become a Teacher
            </Title>
            <Text color="dimmed">
              Have a teacher invitation code? Enter it below to upgrade your account.
            </Text>
          </div>

          {inviteSuccess ? (
            <Alert color="green" title="Success!">
              You've been upgraded to a teacher account! Redirecting to your dashboard...
            </Alert>
          ) : (
            <form onSubmit={handleRedeemInvite}>
              <Stack spacing="md">
                {inviteError && (
                  <Alert color="red" title="Error" onClose={() => setInviteError(null)} withCloseButton>
                    {inviteError}
                  </Alert>
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
              </Stack>
            </form>
          )}
        </CardBody>
      </Card>
    </Container>
  );
};

export default TeacherInvitePage;
