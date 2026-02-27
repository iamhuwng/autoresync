/**
 * ProfileCompletionPage
 * 
 * Blocking page that requires new users to complete their profile.
 * Users cannot navigate away until profile is complete.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 * 
 * UNIFIED DESIGN: Now follows app-wide design patterns with gradient background
 * and modern card components.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell, Center, Loader, Stack, Text, Group, Progress } from '@mantine/core';
import { IconUserCheck, IconSparkles } from '@tabler/icons-react';
import { ProfileCompletionForm } from '@/components/profile/ProfileCompletionForm';
import { updateProfile, markProfileComplete } from '@/services/profileService';
import { checkClaimableResults } from '@/services/guestResultsService';
import { ClaimResultsModal } from '@/components/guest/ClaimResultsModal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardBody } from '@/components/modern';
import type { UserProfile } from '@/types/user.types';

export function ProfileCompletionPage() {
    const navigate = useNavigate();
    const { user, profile } = useAuth();
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [claimableGuestNames, setClaimableGuestNames] = useState<string[]>([]);
    const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Prevent navigation away from this page
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Your profile is not complete. Are you sure you want to leave?';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    const handleSubmit = async (data: Partial<UserProfile>) => {
        if (!user?.uid) {
            throw new Error('No user logged in');
        }

        try {
            setSaving(true);

            // Update profile with all fields
            await updateProfile(user.uid, data);

            // Mark profile as complete
            await markProfileComplete(user.uid);

            // Check for claimable guest results
            if (user.email) {
                const guestNames = await checkClaimableResults(user.email);

                if (guestNames.length > 0) {
                    setClaimableGuestNames(guestNames);

                    const role = profile?.role || 'student';
                    let redirectPath = '/';
                    if (role === 'student') {
                        redirectPath = '/student/dashboard';
                    } else if (role === 'teacher') {
                        redirectPath = '/lobby';
                    } else if (role === 'super_admin') {
                        redirectPath = '/admin/users';
                    }

                    setPendingNavigation(redirectPath);
                    setShowClaimModal(true);
                    return;
                }
            }

            navigateToDashboard();
        } catch (error) {
            console.error('Failed to complete profile:', error);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const navigateToDashboard = () => {
        const role = profile?.role || 'student';
        if (role === 'student') {
            navigate('/student/dashboard', { replace: true });
        } else if (role === 'teacher') {
            navigate('/lobby', { replace: true });
        } else if (role === 'super_admin') {
            navigate('/admin/users', { replace: true });
        } else {
            navigate('/', { replace: true });
        }
    };

    const handleClaimComplete = () => {
        if (pendingNavigation) {
            navigate(pendingNavigation, { replace: true });
        } else {
            navigateToDashboard();
        }
    };

    const handleClaimClose = () => {
        setShowClaimModal(false);
        if (pendingNavigation) {
            navigate(pendingNavigation, { replace: true });
        } else {
            navigateToDashboard();
        }
    };

    if (!user) {
        return (
            <AppShell
                padding="md"
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    minHeight: '100vh'
                }}
            >
                <AppShell.Main>
                    <Center style={{ height: '100vh' }}>
                        <Stack align="center" gap="md">
                            <Loader size="xl" color="white" type="bars" />
                            <Text c="white" fw={500}>Loading...</Text>
                        </Stack>
                    </Center>
                </AppShell.Main>
            </AppShell>
        );
    }

    return (
        <>
            <AppShell
                header={{ height: 70 }}
                padding="md"
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    minHeight: '100vh'
                }}
            >
                {/* Header */}
                <AppShell.Header style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
                }}>
                    <div style={{
                        height: '100%',
                        padding: '0 1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <Group gap="sm">
                            <IconUserCheck size={28} color="#8b5cf6" />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                Complete Your Profile
                            </h2>
                        </Group>
                        <Group gap="sm">
                            <IconSparkles size={20} color="#8b5cf6" />
                            <Text size="sm" c="#64748b" fw={500}>
                                Welcome, {user.displayName || user.email}!
                            </Text>
                        </Group>
                    </div>
                </AppShell.Header>

                <AppShell.Main>
                    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
                        <Stack gap="xl">
                            {/* Welcome Header */}
                            <div style={{ textAlign: 'center', animation: 'slideDown 0.5s ease-out' }}>
                                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                                <h1 style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    color: 'white',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    margin: 0
                                }}>
                                    Welcome to the Team!
                                </h1>
                                <p style={{
                                    fontSize: '1.125rem',
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    margin: '0.5rem 0 0 0'
                                }}>
                                    Let's set up your profile to get started
                                </p>
                            </div>

                            {/* Progress Indicator */}
                            <Card variant="glass" style={{
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <CardBody style={{ padding: '1rem' }}>
                                    <Group justify="space-between" mb="xs">
                                        <Text size="sm" c="white" fw={500}>Profile Setup</Text>
                                        <Text size="sm" c="white" fw={600}>Step 1 of 1</Text>
                                    </Group>
                                    <Progress
                                        value={saving ? 100 : 50}
                                        size="md"
                                        color="white"
                                        radius="xl"
                                        animated={saving}
                                    />
                                </CardBody>
                            </Card>

                            {/* Profile Form */}
                            <Card variant="glass" style={{
                                background: 'rgba(255, 255, 255, 0.95)',
                                animation: 'slideUp 0.5s ease-out 0.1s backwards'
                            }}>
                                <CardBody style={{ padding: '2rem' }}>
                                    <ProfileCompletionForm
                                        onSubmit={handleSubmit}
                                        initialData={profile || { email: user.email, displayName: user.displayName }}
                                        userRole={profile?.role}
                                    />
                                </CardBody>
                            </Card>

                            {/* Info Note */}
                            <Card variant="glass" style={{
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <CardBody style={{ padding: '1rem' }}>
                                    <Group gap="sm">
                                        <div style={{ fontSize: '1.5rem' }}>💡</div>
                                        <Text size="sm" c="white">
                                            Your information helps us personalize your learning experience.
                                            You can update these details anytime from your profile settings.
                                        </Text>
                                    </Group>
                                </CardBody>
                            </Card>
                        </Stack>
                    </div>
                </AppShell.Main>

                {/* Animations */}
                <style>{`
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </AppShell>

            {/* Claim Results Modal */}
            {user && showClaimModal && (
                <ClaimResultsModal
                    opened={showClaimModal}
                    onClose={handleClaimClose}
                    email={user.email || ''}
                    userId={user.uid}
                    claimableGuestNames={claimableGuestNames}
                    onClaimComplete={handleClaimComplete}
                />
            )}
        </>
    );
}

export default ProfileCompletionPage;
