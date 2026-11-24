import { ProfileCompletionForm } from './ProfileCompletionForm';
import { TeacherHeader } from '@/components/navigation/TeacherHeader';
import { ExternalAudioStorage } from '@/components/external-audio/ExternalAudioStorage';
import { COUNTRY_CODES } from '@/types/profile.types';
import type { UserProfile } from '@/types/user.types';
import './TeacherProfileView.css';

interface TeacherProfileViewProps {
    userId?: string;
    userRole: 'teacher' | 'super_admin';
    userDisplayName?: string;
    userEmail?: string;
    userAvatarUrl?: string;
    profile: UserProfile | null;
    loading: boolean;
    editMode: boolean;
    saving: boolean;
    hasPendingDeletion: boolean;
    daysRemaining: number | null;
    deletionProcessing: boolean;
    audioOrigin: string | null;
    activeSection: 'profile' | 'external-audio';
    onSelectSection: (section: 'profile' | 'external-audio') => void;
    onEditStart: () => void;
    onEditCancel: () => void;
    onSave: (data: Partial<UserProfile>) => Promise<void>;
    onOpenDeletionModal: () => void;
    onCancelDeletion: () => void;
    onLogout: () => Promise<void>;
    getAudioIdToken: () => Promise<string>;
    trackAction: (action: string) => void;
}

function getInitials(firstName?: string, familyName?: string, fallback?: string): string {
    const letters = `${firstName?.charAt(0) ?? ''}${familyName?.charAt(0) ?? ''}`.toUpperCase();
    return letters || fallback?.charAt(0)?.toUpperCase() || 'T';
}

function getCountryName(code?: string): string {
    if (!code) return '--';
    return COUNTRY_CODES.find((item) => item.code === code)?.name || code;
}

export function TeacherProfileView({
    userId,
    userRole,
    userDisplayName,
    userEmail,
    userAvatarUrl,
    profile,
    loading,
    editMode,
    saving,
    hasPendingDeletion,
    daysRemaining,
    deletionProcessing,
    audioOrigin,
    activeSection,
    onSelectSection,
    onEditStart,
    onEditCancel,
    onSave,
    onOpenDeletionModal,
    onCancelDeletion,
    onLogout,
    getAudioIdToken,
    trackAction,
}: TeacherProfileViewProps) {
    const hasStorageTab = Boolean(userId && audioOrigin);
    const showingStorage = hasStorageTab && activeSection === 'external-audio';
    const fullName = profile
        ? `${profile.firstName || ''} ${profile.familyName || ''}`.trim() || userDisplayName || 'Teacher'
        : userDisplayName || 'Teacher';
    const email = profile?.email || userEmail || '';
    const avatarUrl = profile?.avatarUrl || profile?.photoURL || userAvatarUrl;
    const roleLabel = userRole === 'super_admin' ? 'Super Admin' : 'Teacher';
    const initials = getInitials(profile?.firstName, profile?.familyName, fullName);

    const addressParts = [
        profile?.address?.street,
        profile?.address?.city,
        profile?.address?.province,
        profile?.address?.country ? getCountryName(profile.address.country) : undefined,
    ].filter(Boolean);

    return (
        <div className="teacher-profile-shell" data-testid="profile-teacher-shell">
            <TeacherHeader
                pageTitle="Profile"
                userId={userId}
                userRole={userRole}
                userDisplayName={fullName}
                userEmail={email || undefined}
                userAvatarUrl={avatarUrl || undefined}
                onLogout={onLogout}
            />
            <main className="teacher-profile-main">
                <header className="teacher-profile-identity">
                    <div className="teacher-profile-identity-left">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt={fullName} className="teacher-profile-avatar" />
                        ) : (
                            <div className="teacher-profile-avatar teacher-profile-avatar-fallback" aria-hidden="true">
                                {initials}
                            </div>
                        )}
                        <div className="teacher-profile-identity-text">
                            <div className="teacher-profile-name-row">
                                <h2>{fullName}</h2>
                                <span className="teacher-profile-role-badge">{roleLabel}</span>
                            </div>
                            {email && <p className="teacher-profile-email">{email}</p>}
                        </div>
                    </div>
                    {!showingStorage && !editMode && profile && (
                        <button type="button" className="teacher-profile-btn-primary" onClick={onEditStart}>
                            Edit profile
                        </button>
                    )}
                </header>

                {hasStorageTab && (
                    <div role="tablist" aria-label="Profile sections" className="external-audio-profile-tabs">
                        <button
                            type="button"
                            role="tab"
                            id="profile-tab-general"
                            aria-selected={!showingStorage}
                            className="external-audio-profile-tab"
                            onClick={() => onSelectSection('profile')}
                        >
                            Account
                        </button>
                        <button
                            type="button"
                            role="tab"
                            id="profile-tab-external-audio"
                            aria-selected={showingStorage}
                            className="external-audio-profile-tab"
                            onClick={() => onSelectSection('external-audio')}
                        >
                            External audio storage
                        </button>
                    </div>
                )}

                {showingStorage && userId && audioOrigin ? (
                    <div role="tabpanel" aria-labelledby="profile-tab-external-audio">
                        <ExternalAudioStorage
                            key={userId}
                            origin={audioOrigin}
                            getIdToken={getAudioIdToken}
                            track={trackAction}
                            collapsible={false}
                            defaultOpen
                        />
                    </div>
                ) : loading ? (
                    <div className="teacher-profile-card">
                        <p className="teacher-profile-muted" role="status">Loading profile…</p>
                    </div>
                ) : !profile ? (
                    <div className="teacher-profile-card">
                        <p className="teacher-profile-muted">Could not load profile.</p>
                        <button type="button" className="teacher-profile-btn-outline" onClick={() => window.location.reload()}>
                            Refresh
                        </button>
                    </div>
                ) : editMode ? (
                    <section className="teacher-profile-card">
                        <div className="teacher-profile-card-row">
                            <h3>Edit profile</h3>
                            <button type="button" className="teacher-profile-btn-outline" onClick={onEditCancel} disabled={saving}>
                                Cancel
                            </button>
                        </div>
                        <ProfileCompletionForm onSubmit={onSave} initialData={profile} userRole={profile.role} />
                    </section>
                ) : (
                    <div className="teacher-profile-stack">
                        <section className="teacher-profile-card" aria-label="Account information">
                            <dl className="teacher-profile-grid">
                                <div>
                                    <dt>Name</dt>
                                    <dd>{fullName}</dd>
                                </div>
                                <div>
                                    <dt>Email</dt>
                                    <dd>{email || '--'}</dd>
                                </div>
                                <div>
                                    <dt>Phone</dt>
                                    <dd>{profile.phone?.number ? `${profile.phone.countryCode} ${profile.phone.number}` : '--'}</dd>
                                </div>
                                <div>
                                    <dt>Role</dt>
                                    <dd>{roleLabel}</dd>
                                </div>
                                {profile.school && (
                                    <div>
                                        <dt>School</dt>
                                        <dd>{profile.school}</dd>
                                    </div>
                                )}
                                {profile.job && (
                                    <div>
                                        <dt>Title</dt>
                                        <dd>{profile.job}</dd>
                                    </div>
                                )}
                                {addressParts.length > 0 && (
                                    <div>
                                        <dt>Address</dt>
                                        <dd>{addressParts.join(', ')}</dd>
                                    </div>
                                )}
                            </dl>
                        </section>

                        <section className="teacher-profile-card teacher-profile-danger-row" aria-label="Account deletion">
                            {hasPendingDeletion ? (
                                <>
                                    <div>
                                        <strong>Account deletion scheduled</strong>
                                        <p className="teacher-profile-muted">
                                            {daysRemaining !== null ? `${daysRemaining} days remaining` : 'Pending removal'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="teacher-profile-btn-outline"
                                        onClick={onCancelDeletion}
                                        disabled={deletionProcessing}
                                    >
                                        Cancel deletion
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <strong>Delete account</strong>
                                        <p className="teacher-profile-muted">30-day grace period before permanent removal.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="teacher-profile-btn-danger"
                                        onClick={onOpenDeletionModal}
                                        disabled={deletionProcessing}
                                    >
                                        Delete account
                                    </button>
                                </>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
