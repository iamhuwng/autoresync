import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Title,
    Text,
    Stack,
    Group,
    Avatar,
    Divider,
    Grid,
    Badge,
    Loader,
    Alert,
    Modal,
} from '@mantine/core';
import {
    IconEdit,
    IconX,
    IconCheck,
    IconTrash,
    IconAlertTriangle,
    IconClock,
} from '@tabler/icons-react';
import { ProfileCompletionForm } from './ProfileCompletionForm';
import { getProfile, updateProfile } from '@/services/profileService';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/hooks/useNavigation';
import type { UserProfile } from '@/types/user.types';
import { COUNTRY_CODES } from '@/types/profile.types';
import { BadgeShowcase } from '@/components/badges/BadgeShowcase';
import {
    requestDeletion,
    cancelDeletion,
    hasPendingDeletion,
    getDaysUntilDeletion
} from '@/services/accountDeletionService';
import {
    retryWithFeedback,
    showSuccessToast,
    showErrorToast,
    fetchWithCache,
} from '@/utils/errorHandling';

// NEW IMPORTS FOR STUDENT VIEW STANDARD
import { redeemTeacherInvite } from '@/services/invitationService';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { StudentSidebar } from '@/components/layout/StudentSidebar';
import { S } from '@/components/layout/studentLayoutStyles';
import { useStudentHomeworkList } from '@/hooks/useHomeworkSubmission';

const localStyles = {
    card: {
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    dangerCard: {
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #fecaca',
        padding: '24px',
    },
    buttonPrimary: {
        backgroundColor: '#4f46e5',
        color: 'white',
        borderRadius: '999px',
        padding: '8px 16px',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'background 0.2s',
    },
    buttonOutline: {
        backgroundColor: 'transparent',
        color: '#374151',
        borderRadius: '999px',
        padding: '8px 16px',
        fontWeight: 600,
        border: '1px solid #d1d5db',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    buttonDanger: {
        backgroundColor: 'transparent',
        color: '#dc2626',
        borderRadius: '999px',
        padding: '8px 16px',
        fontWeight: 600,
        border: '1px solid #fecaca',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    }
};

export function ProfilePage() {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');
    const navigate = useNavigate();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // Account Deletion States
    const [hasPending, setHasPending] = useState(false);
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [deletionModalOpen, setDeletionModalOpen] = useState(false);
    const [deletionProcessing, setDeletionProcessing] = useState(false);

    // Teacher Invite States
    const [inviteCode, setInviteCode] = useState('');
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState(false);
    const [processingInvite, setProcessingInvite] = useState(false);

    const { notStarted = [] } = useStudentHomeworkList(user?.uid || '');

    useEffect(() => {
        loadProfile();
        checkDeletionStatus();
    }, [user?.uid]);

    const loadProfile = async () => {
        if (!user?.uid) return;

        setLoading(true);
        try {
            const data = await fetchWithCache(
                `profile-${user.uid}`,
                () => getProfile(user.uid),
                { ttl: 300000 }
            );
            if (data) {
                setProfile(data);
            }
        } catch (error) {
            showErrorToast('Failed to load profile', 'Please check your connection and try again');
            console.error('Failed to load profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkDeletionStatus = async () => {
        if (!user?.uid) return;

        try {
            const pending = await hasPendingDeletion(user.uid);
            setHasPending(pending);

            if (pending) {
                const days = await getDaysUntilDeletion(user.uid);
                setDaysRemaining(days);
            }
        } catch (error) {
            console.error('Failed to check deletion status:', error);
        }
    };

    const handleSave = async (data: Partial<UserProfile>) => {
        if (!user?.uid) return;

        setSaving(true);
        try {
            await retryWithFeedback(
                () => updateProfile(user.uid, data),
                'Save Profile',
                { maxAttempts: 3, delayMs: 1000 }
            );
            await loadProfile();
            setEditMode(false);
            showSuccessToast('Profile saved', 'Your changes have been saved successfully');
        } catch (error) {
            console.error('Failed to update profile:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditMode(false);
    };

    const handleRequestDeletion = async () => {
        if (!user?.uid) return;

        setDeletionProcessing(true);
        try {
            await requestDeletion(user.uid, 'User requested via profile page');
            showSuccessToast(
                'Deletion Requested',
                'Your account will be permanently deleted in 30 days. You can cancel this at any time.'
            );
            setDeletionModalOpen(false);
            await checkDeletionStatus();
        } catch (error) {
            console.error('Failed to request deletion:', error);
            showErrorToast('Error', 'Failed to request account deletion. Please try again.');
        } finally {
            setDeletionProcessing(false);
        }
    };

    const handleCancelDeletion = async () => {
        if (!user?.uid) return;

        setDeletionProcessing(true);
        try {
            await cancelDeletion(user.uid);
            showSuccessToast('Deletion Cancelled', 'Your account deletion has been cancelled.');
            await checkDeletionStatus();
        } catch (error) {
            console.error('Failed to cancel deletion:', error);
            showErrorToast('Error', 'Failed to cancel deletion. Please try again.');
        } finally {
            setDeletionProcessing(false);
        }
    };

    const handleRedeemInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid) return;
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
                // Wait a moment then reload profile to update role visually
                setTimeout(() => {
                    window.location.reload();
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

    const getCountryName = (code: string) => {
        const country = COUNTRY_CODES.find(c => c.code === code);
        return country?.name || code;
    };

    const renderCenterContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <Loader size="xl" color="#4f46e5" />
                    <Text c="#6b7280" mt="md" fw={500}>Loading profile...</Text>
                </div>
            );
        }

        if (!profile) {
            return (
                <div style={{ padding: '24px' }}>
                    <div style={{ ...localStyles.dangerCard, textAlign: 'center', padding: '48px 24px' }}>
                        <IconAlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 16px' }} />
                        <Title order={3} c="#111827" mb="sm">Profile Error</Title>
                        <Text c="#6b7280" mb="xl">Failed to load profile. Please refresh the page.</Text>
                        <button style={localStyles.buttonPrimary} onClick={() => window.location.reload()}>
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ padding: '24px' }}>
                <Stack gap="xl">

                    {editMode ? (
                        <div style={localStyles.card}>
                            <Group justify="space-between" mb="lg">
                                <Title order={3} c="#111827">Edit Profile</Title>
                                <button style={localStyles.buttonOutline} onClick={handleCancel} disabled={saving}>
                                    <IconX size={16} /> Cancel
                                </button>
                            </Group>
                            <ProfileCompletionForm
                                onSubmit={handleSave}
                                initialData={profile}
                                userRole={profile.role}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Profile Info */}
                            <div style={localStyles.card}>
                                <Group justify="space-between" mb="lg">
                                    <Title order={3} c="#111827">Profile Information</Title>
                                    <button style={localStyles.buttonPrimary} onClick={() => setEditMode(true)}>
                                        <IconEdit size={16} /> Edit Profile
                                    </button>
                                </Group>
                                <Divider my="md" color="#e5e7eb" />
                                <Group align="flex-start" gap="xl" mb="md">
                                    <Avatar
                                        src={profile.avatarUrl || profile.photoURL}
                                        size={100}
                                        radius="xl"
                                        alt={`Profile picture of ${profile.firstName}`}
                                    />
                                    <Stack gap="xs">
                                        <Title order={3} c="#111827" m={0}>
                                            {profile.firstName} {profile.familyName}
                                        </Title>
                                        <Text c="#6b7280" m={0}>{profile.email}</Text>
                                        <Badge color={profile.role === 'teacher' ? 'blue' : profile.role === 'super_admin' ? 'violet' : 'indigo'} variant="light" size="lg">
                                            {profile.role === 'super_admin' ? 'Super Admin' : profile.role === 'teacher' ? 'Teacher' : 'Student'}
                                        </Badge>
                                        {profile.profileCompletedAt && (
                                            <Group gap="xs">
                                                <IconCheck size={16} color="#059669" />
                                                <Text size="sm" c="#059669" fw={600}>Profile Complete</Text>
                                            </Group>
                                        )}
                                    </Stack>
                                </Group>
                            </div>

                            {/* Badge Showcase */}
                            {profile.role === 'student' && user?.uid && (
                                <div style={localStyles.card}>
                                    <BadgeShowcase studentId={user.uid} />
                                </div>
                            )}

                            {/* Personal Info */}
                            <div style={localStyles.card}>
                                <Title order={4} c="#111827" mb="md">Personal Information</Title>
                                <Grid>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>First Name</Text>
                                        <Text fw={500} c="#111827">{profile.firstName || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>Family Name</Text>
                                        <Text fw={500} c="#111827">{profile.familyName || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>Date of Birth</Text>
                                        <Text fw={500} c="#111827">{profile.dateOfBirth || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>Phone</Text>
                                        <Text fw={500} c="#111827">
                                            {profile.phone ? `${profile.phone.countryCode} ${profile.phone.number}` : '—'}
                                        </Text>
                                    </Grid.Col>
                                </Grid>
                            </div>

                            {/* Address */}
                            <div style={localStyles.card}>
                                <Title order={4} c="#111827" mb="md">Address</Title>
                                <Grid>
                                    <Grid.Col span={12}>
                                        <Text size="sm" c="#6b7280" mb={4}>Street</Text>
                                        <Text fw={500} c="#111827">{profile.address?.street || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>City</Text>
                                        <Text fw={500} c="#111827">{profile.address?.city || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>Province/State</Text>
                                        <Text fw={500} c="#111827">{profile.address?.province || '—'}</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="#6b7280" mb={4}>Country</Text>
                                        <Text fw={500} c="#111827">
                                            {profile.address?.country ? getCountryName(profile.address.country) : '—'}
                                        </Text>
                                    </Grid.Col>
                                </Grid>
                            </div>

                            {/* Additional Info */}
                            {(profile.school || profile.job) && (
                                <div style={localStyles.card}>
                                    <Title order={4} c="#111827" mb="md">Additional Information</Title>
                                    <Grid>
                                        {profile.school && (
                                            <Grid.Col span={12}>
                                                <Text size="sm" c="#6b7280" mb={4}>School</Text>
                                                <Text fw={500} c="#111827">{profile.school}</Text>
                                            </Grid.Col>
                                        )}
                                        {profile.job && (
                                            <Grid.Col span={12}>
                                                <Text size="sm" c="#6b7280" mb={4}>Job Title</Text>
                                                <Text fw={500} c="#111827">{profile.job}</Text>
                                            </Grid.Col>
                                        )}
                                    </Grid>
                                </div>
                            )}

                            {/* Danger Zone */}
                            {hasPending ? (
                                <Alert icon={<IconClock size={20} />} title="Account Deletion Scheduled" color="orange" variant="light" radius="md">
                                    <Stack gap="xs">
                                        <Text size="sm">
                                            Your account is scheduled for permanent deletion in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>.
                                        </Text>
                                        <Text size="sm">
                                            All your data will be permanently removed. You can cancel this deletion at any time.
                                        </Text>
                                        <button style={{ ...localStyles.buttonOutline, borderColor: '#059669', color: '#059669', marginTop: '8px' }} onClick={handleCancelDeletion} disabled={deletionProcessing}>
                                            <IconCheck size={16} /> Cancel Deletion
                                        </button>
                                    </Stack>
                                </Alert>
                            ) : (
                                <div style={localStyles.dangerCard}>
                                    <Title order={4} c="#dc2626" mb="sm">Danger Zone</Title>
                                    <Text size="sm" c="#6b7280" mb="lg">
                                        Once you delete your account, there is no going back. Please be certain.
                                    </Text>
                                    <button style={localStyles.buttonDanger} onClick={() => setDeletionModalOpen(true)}>
                                        <IconTrash size={16} /> Delete Account
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </Stack>
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="My Profile"
            sidebar={
                <StudentSidebar
                    user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                    activePage="profile"
                    pendingHomeworkCount={notStarted.length}
                    onViewSwitch={(view) => {
                        if (view === 'feed') navigate('/student/dashboard?view=feed');
                        if (view === 'classes') navigate('/student/dashboard?view=classes');
                        if (view === 'history') navigate('/student/dashboard?view=history');
                    }}
                />
            }
            rightPanel={
                <aside style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {profile?.role === 'student' && (
                        <div style={localStyles.card}>
                            <Title order={5} mb="md" c="#111827">Teacher Invitation</Title>
                            {inviteSuccess ? (
                                <Alert color="green" title="Success!" variant="light" mb="md" icon={<IconCheck size={16} />}>
                                    Account upgraded! Reloading...
                                </Alert>
                            ) : (
                                <form onSubmit={handleRedeemInvite}>
                                    <Stack gap="sm">
                                        <Text size="sm" c="#6b7280">
                                            Enter an invitation code to upgrade your account to create and manage classes.
                                        </Text>
                                        {inviteError && (
                                            <Alert color="red" variant="light" p="xs">
                                                <Text size="xs" c="red.9">{inviteError}</Text>
                                            </Alert>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                placeholder="Code (e.g. ABC123)"
                                                value={inviteCode}
                                                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                                disabled={processingInvite}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #d1d5db',
                                                    textTransform: 'uppercase',
                                                    fontSize: '0.875rem',
                                                    minWidth: 0,
                                                    outline: 'none'
                                                }}
                                                required
                                            />
                                            <button
                                                type="submit"
                                                disabled={!inviteCode.trim() || processingInvite}
                                                style={{
                                                    backgroundColor: (!inviteCode.trim() || processingInvite) ? '#9ca3af' : '#4f46e5',
                                                    color: 'white',
                                                    borderRadius: '8px',
                                                    padding: '8px 16px',
                                                    fontWeight: 600,
                                                    border: 'none',
                                                    cursor: (!inviteCode.trim() || processingInvite) ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.875rem',
                                                    transition: 'background 0.2s',
                                                }}
                                            >
                                                {processingInvite ? '...' : 'Redeem'}
                                            </button>
                                        </div>
                                    </Stack>
                                </form>
                            )}
                        </div>
                    )}
                </aside>
            }
        >
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>My Profile</h2>
            </div>

            {profile?.role === 'teacher' && (
                <div style={{ padding: '16px 24px', background: '#e0e7ff', borderBottom: '1px solid #c7d2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text c="#4338ca" fw={600}>Teacher Mode Active</Text>
                    <button style={{ ...localStyles.buttonPrimary, padding: '6px 16px', fontSize: '0.875rem', width: 'auto' }} onClick={() => navigateTo('LOBBY')}>
                        Return to Lobby
                    </button>
                </div>
            )}

            {renderCenterContent()}

            <Modal opened={deletionModalOpen} onClose={() => setDeletionModalOpen(false)} title={<Group gap="xs"><IconAlertTriangle size={24} color="#dc2626" /><Text fw={700} size="lg" c="#111827">Delete Account</Text></Group>} size="md" radius="xl" padding="xl">
                <Stack gap="md">
                    <Alert icon={<IconAlertTriangle size={20} />} color="red" variant="light" radius="md">
                        <Text fw={600} mb="xs">This action cannot be easily undone!</Text>
                        <Text size="sm">Your account will be scheduled for permanent deletion in 30 days. During this period, you can cancel the deletion.</Text>
                    </Alert>
                    <div>
                        <Text fw={600} c="#111827" mb="xs">What will be deleted:</Text>
                        <Stack gap="xs">
                            <Text size="sm" c="#374151">• Your profile and personal information</Text>
                            <Text size="sm" c="#374151">• All test results and academic records</Text>
                            <Text size="sm" c="#374151">• Badges and achievements</Text>
                            <Text size="sm" c="#374151">• Notifications and preferences</Text>
                        </Stack>
                    </div>
                    <Alert color="blue" variant="light" radius="md">
                        <Text size="sm"><strong>30-day grace period:</strong> Your account will be soft-deleted immediately, but permanently removed after 30 days.</Text>
                    </Alert>
                    <Group justify="flex-end" mt="xl">
                        <button style={localStyles.buttonOutline} onClick={() => setDeletionModalOpen(false)} disabled={deletionProcessing}>
                            Cancel
                        </button>
                        <button style={{ ...localStyles.buttonDanger, backgroundColor: '#fee2e2' }} onClick={handleRequestDeletion} disabled={deletionProcessing}>
                            <IconTrash size={16} /> Confirm Deletion
                        </button>
                    </Group>
                </Stack>
            </Modal>
        </StudentLayout>
    );
}

export default ProfilePage;
