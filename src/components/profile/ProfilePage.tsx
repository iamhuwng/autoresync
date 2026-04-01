import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { S, studentTokens } from '@/components/layout/studentLayoutStyles';
import { useResolvedStudentHomeworkList } from '@/context/StudentShellDataContext';

/* ─── SVG Icon Helpers (replacing @tabler/icons-react) ─── */


function SvgX({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

function SvgTrash({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

function SvgCheck({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function SvgAlertTriangle({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}

function SvgClock({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

function SvgKey({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
    );
}

function SvgShield({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

function SvgVerified({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
        </svg>
    );
}

/* ─── Inline Styles (mockup-aligned) ─── */

const ps: Record<string, React.CSSProperties> = {
    /* ── Hero ── */
    heroCard: {
        background: studentTokens.bgSurfaceAlt,
        borderRadius: 12,
        padding: '32px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        position: 'relative',
        overflow: 'hidden',
    },
    heroAvatarWrap: {
        position: 'relative',
        width: 128,
        height: 128,
        flexShrink: 0,
    },
    heroAvatar: {
        width: 128,
        height: 128,
        borderRadius: '50%',
        objectFit: 'cover',
        background: studentTokens.bgSurfaceStrong,
        filter: 'grayscale(100%)',
        transition: 'filter 0.7s ease',
    },
    verifiedDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: studentTokens.accent,
        border: `4px solid ${studentTokens.bgSurfaceAlt}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#faf6ff',
    },
    heroText: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        flex: 1,
    },
    heroNameRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
    },
    heroName: {
        margin: 0,
        fontSize: '1.75rem',
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: studentTokens.textPrimary,
        lineHeight: 1.15,
    },
    heroPill: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: studentTokens.radiusPill,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: studentTokens.bgSurfaceStrong,
        color: studentTokens.textBody,
    },
    heroBio: {
        margin: 0,
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: studentTokens.textBody,
        maxWidth: 480,
    },
    heroDecoText: {
        position: 'absolute',
        right: -20,
        top: -20,
        fontSize: 200,
        fontWeight: 900,
        color: 'rgba(234, 239, 241, 0.30)',
        lineHeight: 1,
        userSelect: 'none',
        pointerEvents: 'none',
    },

    /* ── Section Layout ── */
    sectionsWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid rgba(171, 179, 183, 0.10)`,
        paddingBottom: 8,
        marginBottom: 0,
    },
    sectionLabel: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: studentTokens.textBody,
    },
    fieldGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px 48px',
        marginTop: 16,
    },
    fieldLabel: {
        display: 'block',
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
        marginBottom: 4,
    },
    fieldValue: {
        margin: 0,
        fontSize: '0.875rem',
        color: studentTokens.textPrimary,
    },

    /* ── Academic Detail Cards ── */
    academicGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16,
        marginTop: 16,
    },
    academicCard: {
        background: studentTokens.bgSurfaceAlt,
        padding: '20px 20px',
        borderRadius: 8,
    },
    academicCardPrimary: {
        background: studentTokens.bgSurfaceAlt,
        padding: '20px 20px',
        borderRadius: 8,
        borderLeft: `4px solid ${studentTokens.accent}`,
    },
    academicLabel: {
        display: 'block',
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
        marginBottom: 4,
    },
    academicValue: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: 500,
        color: studentTokens.textPrimary,
    },

    /* ── Account Details ── */
    accountGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px 48px',
        marginTop: 16,
    },
    accountItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
    },
    accountIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        background: '#edf5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: studentTokens.textBody,
        flexShrink: 0,
    },

    /* ── Danger Zone ── */
    dangerZone: {
        marginTop: 48,
        paddingTop: 32,
        borderTop: '1px solid rgba(158, 63, 78, 0.10)',
    },
    dangerCard: {
        padding: '20px 24px',
        background: 'rgba(255, 139, 154, 0.05)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
    },
    dangerTitle: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 500,
        color: '#9e3f4e',
    },
    dangerDesc: {
        margin: '4px 0 0',
        fontSize: '0.8125rem',
        color: studentTokens.textBody,
    },

    /* ── Deletion Banner ── */
    deletionBanner: {
        background: '#fff8f0',
        borderRadius: 12,
        border: '1px solid rgba(154, 100, 39, 0.18)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    deletionBannerHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#9a6427',
    },

    /* ── Buttons ── */
    primaryButton: {
        backgroundColor: studentTokens.accent,
        color: '#faf6ff',
        borderRadius: 4,
        padding: '10px 24px',
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.6875rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'opacity 0.15s ease',
    },
    outlineButton: {
        backgroundColor: 'transparent',
        color: studentTokens.textBody,
        borderRadius: 4,
        padding: '10px 16px',
        fontWeight: 700,
        border: `1px solid ${studentTokens.borderSoft}`,
        cursor: 'pointer',
        fontSize: '0.6875rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    dangerButton: {
        backgroundColor: 'transparent',
        color: '#9e3f4e',
        borderRadius: 4,
        padding: '10px 16px',
        fontWeight: 600,
        border: '1px solid rgba(158, 63, 78, 0.20)',
        cursor: 'pointer',
        fontSize: '0.6875rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'background 0.15s ease',
    },

    /* ── Right Rail ── */
    rightCard: {
        background: 'transparent',
        padding: 0,
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
        padding: '10px 12px',
        borderRadius: 4,
        border: `1px solid ${studentTokens.borderSoft}`,
        textTransform: 'uppercase',
        fontSize: '0.875rem',
        minWidth: 0,
        outline: 'none',
        background: studentTokens.bgSurface,
        color: studentTokens.textPrimary,
    },
    profileStrengthWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        paddingTop: 16,
    },
    strengthHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    strengthBar: {
        height: 6,
        width: '100%',
        background: studentTokens.bgSurfaceStrong,
        borderRadius: 999,
        overflow: 'hidden',
    },
    strengthFill: {
        height: '100%',
        background: studentTokens.accent,
        borderRadius: 999,
        transition: 'width 0.5s ease',
    },

    /* ── Edit card ── */
    editCard: {
        background: studentTokens.bgSurface,
        borderRadius: 12,
        border: `1px solid ${studentTokens.borderWhisper}`,
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

    /* ── Teacher Banner ── */
    teacherBanner: {
        margin: '18px 0 0',
        background: studentTokens.bgSurface,
        borderRadius: 12,
        border: `1px solid ${studentTokens.borderWhisper}`,
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
    },

    /* ── Empty / Error states ── */
    emptyState: {
        background: studentTokens.bgSurface,
        borderRadius: 12,
        border: '1px solid rgba(158, 63, 78, 0.18)',
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
    },

    /* ── Dialog overlay ── */
    dialogBackdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(12, 15, 16, 0.38)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dialogBox: {
        background: '#fff',
        borderRadius: 16,
        padding: '28px 24px',
        maxWidth: 480,
        width: '90%',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
    },
    dialogTitle: {
        margin: 0,
        fontSize: '1.125rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
    },

    /* ── Misc ── */
    infoText: {
        margin: 0,
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: studentTokens.textBody,
    },
    sectionTitle: {
        margin: 0,
        fontSize: '1rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
    },
    contentStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '18px 0 0',
    },
};

/* ─── CSS-only loader ─── */

const spinnerKeyframes = `
@keyframes profileSpin {
    to { transform: rotate(360deg); }
}
`;

function CssSpinner() {
    return (
        <>
            <style>{spinnerKeyframes}</style>
            <div
                style={{
                    width: 36,
                    height: 36,
                    border: `3px solid ${studentTokens.bgSurfaceStrong}`,
                    borderTopColor: studentTokens.accent,
                    borderRadius: '50%',
                    animation: 'profileSpin 0.7s linear infinite',
                }}
            />
        </>
    );
}

/* ─── Helpers ─── */

function getCountryName(code: string): string {
    const country = COUNTRY_CODES.find((item) => item.code === code);
    return country?.name || code;
}

function formatRole(role: string): string {
    if (role === 'super_admin') return 'Super Admin';
    return role.charAt(0).toUpperCase() + role.slice(1);
}

function getInitials(firstName?: string, familyName?: string): string {
    const f = firstName?.charAt(0)?.toUpperCase() || '';
    const l = familyName?.charAt(0)?.toUpperCase() || '';
    return f + l || '??';
}

function computeProfileStrength(profile: UserProfile): number {
    let filled = 0;
    const total = 8;
    if (profile.firstName) filled++;
    if (profile.familyName) filled++;
    if (profile.dateOfBirth) filled++;
    if (profile.phone?.number) filled++;
    if (profile.address?.street) filled++;
    if (profile.address?.city) filled++;
    if (profile.address?.country) filled++;
    if (profile.avatarUrl || profile.photoURL) filled++;
    return Math.round((filled / total) * 100);
}

/* ─── Field Section (mockup-style: header bar + 2-col grid) ─── */

function renderFieldGrid(
    title: string,
    fields: Array<{ label: string; value: string }>,
) {
    return (
        <div>
            <div style={ps.sectionHeader}>
                <h4 style={ps.sectionLabel}>{title}</h4>
            </div>
            <div style={ps.fieldGrid}>
                {fields.map((f) => (
                    <div key={f.label}>
                        <label style={ps.fieldLabel}>{f.label}</label>
                        <p style={ps.fieldValue}>{f.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ProfilePage                                                    */
/* ═══════════════════════════════════════════════════════════════ */

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

    const dialogRef = useRef<HTMLDialogElement>(null);

    const { notStarted = [] } = useResolvedStudentHomeworkList(user?.uid || '');

    useEffect(() => {
        if (!user?.uid) return;
        void loadProfile();
        void checkDeletionStatus();
    }, [user?.uid]);

    /* sync native dialog with state */
    useEffect(() => {
        if (deletionModalOpen) {
            dialogRef.current?.showModal();
        } else {
            dialogRef.current?.close();
        }
    }, [deletionModalOpen]);

    const loadProfile = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const data = await fetchWithCache(
                `profile-${user.uid}`,
                () => getProfile(user.uid),
                { ttl: 300000 },
            );
            if (data) setProfile(data);
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
            } else {
                setDaysRemaining(null);
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
        if (!user?.uid) return;
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

    const handleRedeemInvite = async (event: React.FormEvent) => {
        event.preventDefault();
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
                setTimeout(() => { window.location.reload(); }, 2000);
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

    /* ─── Center Content ─── */

    const renderCenterContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <CssSpinner />
                    <p style={{ ...ps.infoText, marginTop: 16 }}>Loading profile...</p>
                </div>
            );
        }

        if (!profile) {
            return (
                <div style={ps.contentStack}>
                    <div style={ps.emptyState}>
                        <SvgAlertTriangle size={40} />
                        <h3 style={ps.sectionTitle}>Profile Error</h3>
                        <p style={ps.infoText}>Failed to load profile. Please refresh the page.</p>
                        <button type="button" style={ps.primaryButton} onClick={() => window.location.reload()}>
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        const personalFields = [
            { label: 'Full Legal Name', value: `${profile.firstName || '--'} ${profile.familyName || '--'}` },
            { label: 'Email Address', value: profile.email || '--' },
            { label: 'Date of Birth', value: profile.dateOfBirth || '--' },
            { label: 'Phone', value: profile.phone ? `${profile.phone.countryCode} ${profile.phone.number}` : '--' },
        ];

        const academicFields = [
            { label: 'Role', value: formatRole(profile.role), primary: true },
            { label: 'Profile Status', value: profile.profileCompletedAt ? 'Complete' : 'In Progress' },
            { label: 'Total Homework', value: String(notStarted.length) },
        ];

        const addressFields = [
            { label: 'Street', value: profile.address?.street || '--' },
            { label: 'City', value: profile.address?.city || '--' },
            { label: 'Province / State', value: profile.address?.province || '--' },
            { label: 'Country', value: profile.address?.country ? getCountryName(profile.address.country) : '--' },
        ];

        const initials = getInitials(profile.firstName, profile.familyName);

        return (
            <div style={ps.contentStack}>
                {editMode ? (
                    <section style={ps.editCard}>
                        <div style={ps.editHeader}>
                            <h3 style={ps.sectionTitle}>Edit Profile</h3>
                            <button type="button" style={ps.outlineButton} onClick={() => setEditMode(false)} disabled={saving}>
                                <SvgX size={16} /> Cancel
                            </button>
                        </div>
                        <ProfileCompletionForm onSubmit={handleSave} initialData={profile} userRole={profile.role} />
                    </section>
                ) : (
                    <>
                        {/* ── Editorial Hero ── */}
                        <section style={ps.heroCard}>
                            <div style={ps.heroAvatarWrap}>
                                {(profile.avatarUrl || profile.photoURL) ? (
                                    <img
                                        src={profile.avatarUrl || profile.photoURL || ''}
                                        alt={`Profile picture of ${profile.firstName}`}
                                        style={ps.heroAvatar}
                                        onMouseOver={(e) => { (e.currentTarget as HTMLImageElement).style.filter = 'grayscale(0%)'; }}
                                        onMouseOut={(e) => { (e.currentTarget as HTMLImageElement).style.filter = 'grayscale(100%)'; }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            ...ps.heroAvatar,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '2.5rem',
                                            fontWeight: 700,
                                            color: studentTokens.accent,
                                            filter: 'none',
                                        }}
                                    >
                                        {initials}
                                    </div>
                                )}
                                {profile.profileCompletedAt ? (
                                    <div style={ps.verifiedDot}>
                                        <SvgVerified size={12} />
                                    </div>
                                ) : null}
                            </div>
                            <div style={ps.heroText}>
                                <div style={ps.heroNameRow}>
                                    <h3 style={ps.heroName}>
                                        {profile.firstName} {profile.familyName}
                                    </h3>
                                    <span style={ps.heroPill}>
                                        {profile.profileCompletedAt ? 'Active Scholar' : formatRole(profile.role)}
                                    </span>
                                </div>
                                <p style={ps.heroBio}>
                                    {profile.school
                                        ? `Student at ${profile.school}. `
                                        : ''}
                                    {profile.email || ''}
                                </p>
                                <div style={{ paddingTop: 4 }}>
                                    <button type="button" style={ps.primaryButton} onClick={() => setEditMode(true)}>
                                        Edit Profile
                                    </button>
                                </div>
                            </div>
                            {/* Decorative initials */}
                            <div style={ps.heroDecoText}>{initials}</div>
                        </section>

                        {/* ── Profile Sections ── */}
                        <div style={ps.sectionsWrap}>
                            {/* Personal Information */}
                            {renderFieldGrid('Personal Information', personalFields)}

                            {/* Academic Details */}
                            <div>
                                <div style={ps.sectionHeader}>
                                    <h4 style={ps.sectionLabel}>Academic Details</h4>
                                </div>
                                <div style={ps.academicGrid}>
                                    {academicFields.map((f, i) => (
                                        <div key={f.label} style={i === 0 ? ps.academicCardPrimary : ps.academicCard}>
                                            <label style={ps.academicLabel}>{f.label}</label>
                                            <p style={ps.academicValue}>{f.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Address (replacing old separate card) */}
                            {renderFieldGrid('Address', addressFields)}

                            {/* Additional fields */}
                            {(profile.school || profile.job) ? (
                                renderFieldGrid('Additional Information', [
                                    ...(profile.school ? [{ label: 'School', value: profile.school }] : []),
                                    ...(profile.job ? [{ label: 'Job Title', value: profile.job }] : []),
                                ])
                            ) : null}

                            {/* Account Details */}
                            <div>
                                <div style={ps.sectionHeader}>
                                    <h4 style={ps.sectionLabel}>Account Details</h4>
                                </div>
                                <div style={ps.accountGrid}>
                                    <div style={ps.accountItem}>
                                        <div style={ps.accountIcon}><SvgKey size={20} /></div>
                                        <div>
                                            <label style={ps.fieldLabel}>Email</label>
                                            <p style={ps.fieldValue}>{profile.email || '--'}</p>
                                        </div>
                                    </div>
                                    <div style={ps.accountItem}>
                                        <div style={ps.accountIcon}><SvgShield size={20} /></div>
                                        <div>
                                            <label style={ps.fieldLabel}>Security</label>
                                            <p style={ps.fieldValue}>Firebase Auth</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Badges */}
                            {profile.role === 'student' && user?.uid ? (
                                <BadgeShowcase studentId={user.uid} title="Badges" />
                            ) : null}
                        </div>

                        {/* ── Deletion Section ── */}
                        {hasPending ? (
                            <div style={ps.deletionBanner}>
                                <div style={ps.deletionBannerHeader}>
                                    <SvgClock size={20} />
                                    <strong style={{ fontSize: '0.875rem' }}>Account Deletion Scheduled</strong>
                                </div>
                                <p style={{ ...ps.infoText, color: '#9a6427' }}>
                                    Your account is scheduled for permanent deletion in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>.
                                    All your data will be permanently removed. You can cancel this deletion at any time.
                                </p>
                                <div>
                                    <button
                                        type="button"
                                        style={{ ...ps.outlineButton, borderColor: studentTokens.borderSoft, color: '#4c5458' }}
                                        onClick={handleCancelDeletion}
                                        disabled={deletionProcessing}
                                    >
                                        <SvgCheck size={16} /> Cancel Deletion
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={ps.dangerZone}>
                                <div style={ps.dangerCard}>
                                    <div>
                                        <h5 style={ps.dangerTitle}>Deactivate Account</h5>
                                        <p style={ps.dangerDesc}>Temporary suspension of your academic profile and access.</p>
                                    </div>
                                    <button type="button" style={ps.dangerButton} onClick={() => setDeletionModalOpen(true)}>
                                        Request Deactivation
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    /* ─── Right Panel ─── */

    const renderRightPanel = () => {
        if (profile?.role !== 'student') return null;

        const strength = profile ? computeProfileStrength(profile) : 0;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {/* Teacher Invitation */}
                <div style={ps.rightCard}>
                    <h3 style={S.widgetTitle}>Teacher Invitation</h3>
                    {inviteSuccess ? (
                        <div style={{
                            background: '#edf9ee', borderRadius: 8, padding: '12px 16px',
                            display: 'flex', alignItems: 'center', gap: 8, color: '#2e7d32',
                            fontSize: '0.875rem', fontWeight: 600,
                        }}>
                            <SvgCheck size={16} /> Account upgraded. Reloading...
                        </div>
                    ) : (
                        <form onSubmit={handleRedeemInvite} style={ps.inviteForm}>
                            {inviteError ? (
                                <div style={{
                                    background: '#fff2f2', borderRadius: 8, padding: '10px 14px',
                                    color: '#9e3f4e', fontSize: '0.8125rem',
                                }}>
                                    {inviteError}
                                </div>
                            ) : null}
                            <div style={ps.inviteInputRow}>
                                <input
                                    type="text"
                                    placeholder="Enter code"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                    disabled={processingInvite}
                                    style={ps.inviteInput}
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={!inviteCode.trim() || processingInvite}
                                    style={{
                                        ...ps.primaryButton,
                                        backgroundColor: !inviteCode.trim() || processingInvite ? studentTokens.bgSurfaceStrong : studentTokens.accent,
                                        color: !inviteCode.trim() || processingInvite ? studentTokens.textDim : '#faf6ff',
                                        cursor: !inviteCode.trim() || processingInvite ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {processingInvite ? '...' : 'Redeem'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Profile Strength */}
                <div style={ps.profileStrengthWrap}>
                    <div style={ps.strengthHeader}>
                        <h3 style={S.widgetTitle}>Profile Strength</h3>
                        <span style={{ color: studentTokens.accent, fontWeight: 700, fontSize: '1.125rem' }}>{strength}%</span>
                    </div>
                    <div style={ps.strengthBar}>
                        <div style={{ ...ps.strengthFill, width: `${strength}%` }} />
                    </div>
                    {strength < 100 ? (
                        <p style={{ fontSize: '0.75rem', color: studentTokens.textBody, fontStyle: 'italic', margin: 0 }}>
                            Complete your profile fields to reach 100% visibility.
                        </p>
                    ) : null}
                </div>
            </div>
        );
    };

    /* ─── Render ─── */

    return (
        <StudentLayout
            mobileTitle="My Profile"
            sidebar={(
                <StudentSidebar
                    user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                    activePage="profile"
                    pendingHomeworkCount={notStarted.length}
                    onViewSwitch={(view) => {
                        if (view === 'feed') navigate('/student/dashboard');
                    }}
                />
            )}
            rightPanel={renderRightPanel()}
        >
            <div style={S.feedHeader}>
                <div style={S.feedHeaderText}>
                    <h2 style={S.feedHeaderTitle}>My Profile</h2>
                    <p style={S.feedHeaderSubtitle}>Manage your academic identity and personal information.</p>
                </div>
            </div>

            {profile?.role === 'teacher' ? (
                <div style={ps.teacherBanner}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: studentTokens.accentHover, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Teacher Mode Active</span>
                    <button type="button" style={ps.primaryButton} onClick={() => navigateTo('LOBBY')}>
                        Return to Lobby
                    </button>
                </div>
            ) : null}

            {renderCenterContent()}

            {/* ── Native Delete Confirmation Dialog ── */}
            <dialog
                ref={dialogRef}
                onClose={() => setDeletionModalOpen(false)}
                style={{
                    border: 'none',
                    borderRadius: 16,
                    padding: '28px 24px',
                    maxWidth: 480,
                    width: '90%',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 style={ps.dialogTitle}>Delete Account</h3>

                    <div style={{
                        background: '#fff2f2',
                        borderRadius: 8,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        color: '#9e3f4e',
                        fontSize: '0.875rem',
                    }}>
                        <SvgAlertTriangle size={20} />
                        <span>Your account will be scheduled for permanent deletion in 30 days. During this period, you can cancel the deletion.</span>
                    </div>

                    <div>
                        <p style={{ ...ps.infoText, color: studentTokens.textPrimary, fontWeight: 700 }}>What will be deleted</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            <p style={ps.infoText}>Your profile and personal information</p>
                            <p style={ps.infoText}>All test results and academic records</p>
                            <p style={ps.infoText}>Badges and achievements</p>
                            <p style={ps.infoText}>Notifications and preferences</p>
                        </div>
                    </div>

                    <div style={{
                        background: '#f0f4ff',
                        borderRadius: 8,
                        padding: '12px 16px',
                        color: '#3b5998',
                        fontSize: '0.875rem',
                    }}>
                        30-day grace period: your account is soft-deleted first, then permanently removed.
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                        <button
                            type="button"
                            style={ps.outlineButton}
                            onClick={() => setDeletionModalOpen(false)}
                            disabled={deletionProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            style={{ ...ps.dangerButton, backgroundColor: '#fff2f2' }}
                            onClick={handleRequestDeletion}
                            disabled={deletionProcessing}
                        >
                            <SvgTrash size={16} /> Confirm Deletion
                        </button>
                    </div>
                </div>
            </dialog>
        </StudentLayout>
    );
}

export default ProfilePage;
