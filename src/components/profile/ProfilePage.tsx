import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Loader, Modal } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconClock,
    IconEdit,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { ProfileCompletionForm } from './ProfileCompletionForm';
import { getProfile, updateProfile } from '@/services/profileService';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/hooks/useNavigation';
import type { UserProfile } from '@/types/user.types';
import { COUNTRY_CODES } from '@/types/profile.types';
import { BadgeShowcase } from '@/components/badges/BadgeShowcase';
import {
    cancelDeletion,
    getDaysUntilDeletion,
    hasPendingDeletion,
    requestDeletion,
} from '@/services/accountDeletionService';
import {
    fetchWithCache,
    retryWithFeedback,
    showErrorToast,
    showSuccessToast,
} from '@/utils/errorHandling';
import { redeemTeacherInvite } from '@/services/invitationService';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { StudentSidebar } from '@/components/layout/StudentSidebar';
import { S } from '@/components/layout/studentLayoutStyles';
import { useResolvedStudentHomeworkList } from '@/context/StudentShellDataContext';

const localStyles: Record<string, React.CSSProperties> = {
    contentStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '12px 16px 16px',
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
    },
    summaryCard: {
        background: '#ffffff',
        borderRadius: 16,
        padding: '16px 18px',
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 108,
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    summaryValue: {
        margin: 0,
        fontSize: '1.45rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.05,
    },
    heroCard: {
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        borderTopColor: '#d1d5db',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    heroTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
    },
    heroIdentity: {
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        minWidth: 0,
    },
    heroText: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
    },
    heroName: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.15,
    },
    heroMeta: {
        margin: 0,
        fontSize: '0.938rem',
        color: '#6b7280',
    },
    statusRow: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    statusPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    sectionCard: {
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    sectionTitle: {
        margin: 0,
        fontSize: '1rem',
        fontWeight: 700,
        color: '#111827',
    },
    rowList: {
        display: 'flex',
        flexDirection: 'column',
    },
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        padding: '12px 0',
        borderTop: '1px solid #e5e7eb',
    },
    rowFirst: {
        borderTop: 'none',
        paddingTop: 0,
    },
    rowLabel: {
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
        flexShrink: 0,
    },
    rowValue: {
        fontSize: '0.938rem',
        fontWeight: 600,
        color: '#111827',
        textAlign: 'right',
    },
    editCard: {
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        borderTopColor: '#d1d5db',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    editHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
    },
    infoText: {
        margin: 0,
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: '#6b7280',
    },
    emptyState: {
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #fecaca',
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
    },
    teacherBanner: {
        margin: '0 16px',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #c7d2fe',
        borderTopWidth: 4,
        borderTopColor: '#4f46e5',
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
    },
    rightCard: {
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        borderTopColor: '#d1d5db',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    inviteForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    inviteInputRow: {
        display: 'flex',
        gap: 8,
    },
    inviteInput: {
        flex: 1,
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid #d1d5db',
        textTransform: 'uppercase',
        fontSize: '0.875rem',
        minWidth: 0,
        outline: 'none',
        background: '#ffffff',
        color: '#111827',
    },
    primaryButton: {
        backgroundColor: '#4f46e5',
        color: '#ffffff',
        borderRadius: 999,
        padding: '8px 16px',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    outlineButton: {
        backgroundColor: 'transparent',
        color: '#374151',
        borderRadius: 999,
        padding: '8px 16px',
        fontWeight: 600,
        border: '1px solid #d1d5db',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    dangerButton: {
        backgroundColor: 'transparent',
        color: '#dc2626',
        borderRadius: 999,
        padding: '8px 16px',
        fontWeight: 600,
        border: '1px solid #fecaca',
        cursor: 'pointer',
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
};

function getCountryName(code: string): string {
    const country = COUNTRY_CODES.find((item) => item.code === code);
    return country?.name || code;
}

function formatRole(role: string): string {
    if (role === 'super_admin') {
        return 'Super Admin';
    }

    return role.charAt(0).toUpperCase() + role.slice(1);
}

function renderFieldSection(
    title: string,
    fields: Array<{ label: string; value: string }>,
) {
    return (
        <section style={localStyles.sectionCard}>
            <h3 style={localStyles.sectionTitle}>{title}</h3>
            <div style={localStyles.rowList}>
                {fields.map((field, index) => (
                    <div
                        key={field.label}
                        style={{ ...localStyles.row, ...(index === 0 ? localStyles.rowFirst : {}) }}
                    >
                        <span style={localStyles.rowLabel}>{field.label}</span>
                        <span style={localStyles.rowValue}>{field.value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function ProfilePage() {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');
    const navigate = useNavigate();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasPending, setHasPending] = useState(false);
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [deletionModalOpen, setDeletionModalOpen] = useState(false);
    const [deletionProcessing, setDeletionProcessing] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState(false);
    const [processingInvite, setProcessingInvite] = useState(false);

    const { notStarted = [] } = useResolvedStudentHomeworkList(user?.uid || '');

    useEffect(() => {
        if (!user?.uid) {
            return;
        }

        void loadProfile();
        void checkDeletionStatus();
    }, [user?.uid]);

    const loadProfile = async () => {
        if (!user?.uid) {
            return;
        }

        setLoading(true);
        try {
            const data = await fetchWithCache(
                `profile-${user.uid}`,
                () => getProfile(user.uid),
                { ttl: 300000 },
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
        if (!user?.uid) {
            return;
        }

        try {
            const pending = await hasPendingDeletion(user.uid);
            setHasPending(pending);

            if (pending) {
                const days = await getDaysUntilDeletion(user.uid);
                setDaysRemaining(days);
            } else {
                setDaysRemaining(null);
            }
        } catch (error) {
            console.error('Failed to check deletion status:', error);
        }
    };

    const handleSave = async (data: Partial<UserProfile>) => {
        if (!user?.uid) {
            return;
        }

        setSaving(true);
        try {
            await retryWithFeedback(
                () => updateProfile(user.uid, data),
                'Save Profile',
                { maxAttempts: 3, delayMs: 1000 },
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

    const handleRequestDeletion = async () => {
        if (!user?.uid) {
            return;
        }

        setDeletionProcessing(true);
        try {
            await requestDeletion(user.uid, 'User requested via profile page');
            showSuccessToast(
                'Deletion Requested',
                'Your account will be permanently deleted in 30 days. You can cancel this at any time.',
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
        if (!user?.uid) {
            return;
        }

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

    const handleRedeemInvite = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!user?.uid) {
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

    const renderCenterContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <Loader size="xl" color="#4f46e5" />
                    <p style={{ ...localStyles.infoText, marginTop: 16 }}>Loading profile...</p>
                </div>
            );
        }

        if (!profile) {
            return (
                <div style={localStyles.contentStack}>
                    <div style={localStyles.emptyState}>
                        <IconAlertTriangle size={40} color="#dc2626" />
                        <h3 style={localStyles.sectionTitle}>Profile Error</h3>
                        <p style={localStyles.infoText}>Failed to load profile. Please refresh the page.</p>
                        <button
                            type="button"
                            style={localStyles.primaryButton}
                            onClick={() => window.location.reload()}
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        const summaryCards = [
            { label: 'Role', value: formatRole(profile.role), color: '#111827' },
            {
                label: 'Profile Status',
                value: profile.profileCompletedAt ? 'Complete' : 'In Progress',
                color: profile.profileCompletedAt ? '#059669' : '#2563eb',
            },
            { label: 'Homework Ready', value: String(notStarted.length), color: '#4f46e5' },
            {
                label: 'Country',
                value: profile.address?.country ? getCountryName(profile.address.country) : '--',
                color: '#111827',
            },
        ];

        const personalFields = [
            { label: 'First Name', value: profile.firstName || '--' },
            { label: 'Family Name', value: profile.familyName || '--' },
            { label: 'Date of Birth', value: profile.dateOfBirth || '--' },
            {
                label: 'Phone',
                value: profile.phone ? `${profile.phone.countryCode} ${profile.phone.number}` : '--',
            },
        ];

        const addressFields = [
            { label: 'Street', value: profile.address?.street || '--' },
            { label: 'City', value: profile.address?.city || '--' },
            { label: 'Province / State', value: profile.address?.province || '--' },
            {
                label: 'Country',
                value: profile.address?.country ? getCountryName(profile.address.country) : '--',
            },
        ];

        const additionalFields = [
            ...(profile.school ? [{ label: 'School', value: profile.school }] : []),
            ...(profile.job ? [{ label: 'Job Title', value: profile.job }] : []),
        ];

        return (
            <div style={localStyles.contentStack}>
                <div style={localStyles.summaryGrid}>
                    {summaryCards.map((card) => (
                        <div
                            key={card.label}
                            style={{ ...localStyles.summaryCard, borderTopColor: '#d1d5db' }}
                        >
                            <p style={localStyles.summaryLabel}>{card.label}</p>
                            <p style={{ ...localStyles.summaryValue, color: card.color }}>{card.value}</p>
                        </div>
                    ))}
                </div>

                {editMode ? (
                    <section style={localStyles.editCard}>
                        <div style={localStyles.editHeader}>
                            <h3 style={localStyles.sectionTitle}>Edit Profile</h3>
                            <button
                                type="button"
                                style={localStyles.outlineButton}
                                onClick={() => setEditMode(false)}
                                disabled={saving}
                            >
                                <IconX size={16} /> Cancel
                            </button>
                        </div>
                        <ProfileCompletionForm
                            onSubmit={handleSave}
                            initialData={profile}
                            userRole={profile.role}
                        />
                    </section>
                ) : (
                    <>
                        <section style={localStyles.heroCard}>
                            <div style={localStyles.heroTop}>
                                <div style={localStyles.heroIdentity}>
                                    <Avatar
                                        src={profile.avatarUrl || profile.photoURL}
                                        size={92}
                                        radius="xl"
                                        alt={`Profile picture of ${profile.firstName}`}
                                    />
                                    <div style={localStyles.heroText}>
                                        <h2 style={localStyles.heroName}>
                                            {profile.firstName} {profile.familyName}
                                        </h2>
                                        <p style={localStyles.heroMeta}>{profile.email}</p>
                                        <div style={localStyles.statusRow}>
                                            <span
                                                style={{
                                                    ...localStyles.statusPill,
                                                    background: profile.role === 'teacher' ? '#dbeafe' : '#e0e7ff',
                                                    color: profile.role === 'teacher' ? '#2563eb' : '#4338ca',
                                                }}
                                            >
                                                {formatRole(profile.role)}
                                            </span>
                                            {profile.profileCompletedAt ? (
                                                <span
                                                    style={{
                                                        ...localStyles.statusPill,
                                                        background: '#d1fae5',
                                                        color: '#059669',
                                                    }}
                                                >
                                                    <IconCheck size={14} /> Profile Complete
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    style={localStyles.primaryButton}
                                    onClick={() => setEditMode(true)}
                                >
                                    <IconEdit size={16} /> Edit Profile
                                </button>
                            </div>
                        </section>

                        {profile.role === 'student' && user?.uid ? (
                            <BadgeShowcase studentId={user.uid} title="Badges" />
                        ) : null}

                        {renderFieldSection('Personal Information', personalFields)}
                        {renderFieldSection('Address', addressFields)}
                        {additionalFields.length > 0 ? renderFieldSection('Additional Information', additionalFields) : null}

                        {hasPending ? (
                            <Alert
                                icon={<IconClock size={20} />}
                                title="Account Deletion Scheduled"
                                color="orange"
                                variant="light"
                                radius="md"
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <p style={{ ...localStyles.infoText, color: '#9a3412' }}>
                                        Your account is scheduled for permanent deletion in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>.
                                    </p>
                                    <p style={{ ...localStyles.infoText, color: '#9a3412' }}>
                                        All your data will be permanently removed. You can cancel this deletion at any time.
                                    </p>
                                    <button
                                        type="button"
                                        style={{ ...localStyles.outlineButton, borderColor: '#059669', color: '#059669' }}
                                        onClick={handleCancelDeletion}
                                        disabled={deletionProcessing}
                                    >
                                        <IconCheck size={16} /> Cancel Deletion
                                    </button>
                                </div>
                            </Alert>
                        ) : (
                            <section
                                style={{
                                    ...localStyles.sectionCard,
                                    borderColor: '#fecaca',
                                    borderTopWidth: 4,
                                    borderTopColor: '#dc2626',
                                }}
                            >
                                <h3 style={{ ...localStyles.sectionTitle, color: '#dc2626' }}>Danger Zone</h3>
                                <p style={localStyles.infoText}>
                                    Once you delete your account, there is no going back. Please be certain.
                                </p>
                                <div>
                                    <button
                                        type="button"
                                        style={localStyles.dangerButton}
                                        onClick={() => setDeletionModalOpen(true)}
                                    >
                                        <IconTrash size={16} /> Delete Account
                                    </button>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        );
    };

    const renderRightPanel = () => {
        if (profile?.role !== 'student') {
            return null;
        }

        return (
            <div style={localStyles.rightCard}>
                <h3 style={S.widgetTitle}>Teacher Invitation</h3>
                {inviteSuccess ? (
                    <Alert color="green" title="Success" variant="light" icon={<IconCheck size={16} />}>
                        Account upgraded. Reloading...
                    </Alert>
                ) : (
                    <form onSubmit={handleRedeemInvite} style={localStyles.inviteForm}>
                        {inviteError ? (
                            <Alert color="red" variant="light">
                                {inviteError}
                            </Alert>
                        ) : null}
                        <div style={localStyles.inviteInputRow}>
                            <input
                                type="text"
                                placeholder="Enter code"
                                value={inviteCode}
                                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                                disabled={processingInvite}
                                style={localStyles.inviteInput}
                                required
                            />
                            <button
                                type="submit"
                                disabled={!inviteCode.trim() || processingInvite}
                                style={{
                                    ...localStyles.primaryButton,
                                    backgroundColor: !inviteCode.trim() || processingInvite ? '#9ca3af' : '#4f46e5',
                                    cursor: !inviteCode.trim() || processingInvite ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {processingInvite ? '...' : 'Redeem'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="My Profile"
            sidebar={(
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
            )}
            rightPanel={renderRightPanel()}
        >
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>My Profile</h2>
            </div>

            {profile?.role === 'teacher' ? (
                <div style={localStyles.teacherBanner}>
                    <span style={{ fontSize: '0.938rem', fontWeight: 700, color: '#4338ca' }}>Teacher Mode Active</span>
                    <button
                        type="button"
                        style={localStyles.primaryButton}
                        onClick={() => navigateTo('LOBBY')}
                    >
                        Return to Lobby
                    </button>
                </div>
            ) : null}

            {renderCenterContent()}

            <Modal
                opened={deletionModalOpen}
                onClose={() => setDeletionModalOpen(false)}
                title="Delete Account"
                size="md"
                radius="xl"
                padding="xl"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Alert icon={<IconAlertTriangle size={20} />} color="red" variant="light" radius="md">
                        Your account will be scheduled for permanent deletion in 30 days. During this period, you can cancel the deletion.
                    </Alert>
                    <div>
                        <p style={{ ...localStyles.infoText, color: '#111827', fontWeight: 700 }}>What will be deleted</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            <p style={localStyles.infoText}>Your profile and personal information</p>
                            <p style={localStyles.infoText}>All test results and academic records</p>
                            <p style={localStyles.infoText}>Badges and achievements</p>
                            <p style={localStyles.infoText}>Notifications and preferences</p>
                        </div>
                    </div>
                    <Alert color="blue" variant="light" radius="md">
                        30-day grace period: your account is soft-deleted first, then permanently removed.
                    </Alert>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                        <button
                            type="button"
                            style={localStyles.outlineButton}
                            onClick={() => setDeletionModalOpen(false)}
                            disabled={deletionProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            style={{ ...localStyles.dangerButton, backgroundColor: '#fee2e2' }}
                            onClick={handleRequestDeletion}
                            disabled={deletionProcessing}
                        >
                            <IconTrash size={16} /> Confirm Deletion
                        </button>
                    </div>
                </div>
            </Modal>
        </StudentLayout>
    );
}

export default ProfilePage;
