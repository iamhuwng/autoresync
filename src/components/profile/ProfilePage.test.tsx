import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
const originalDialogClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

const mocks = vi.hoisted(() => ({
    user: { uid: 'google-student', providerData: [{ providerId: 'google.com' }], getIdToken: vi.fn(async () => 'fixture-id-token') },
    authProfile: undefined as { uid: string; role: string } | undefined,
    setup: vi.fn(),
    track: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    fetchProfile: vi.fn((_key: string, load: () => unknown) => load()),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
    user: mocks.user, profile: mocks.authProfile, studentId: 'STU-ASSIGNED', setupStudentCredentials: mocks.setup,
}) }));
vi.mock('@/hooks/useNavigation', () => ({ useNavigation: () => ({ navigateTo: vi.fn() }) }));
vi.mock('@/hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: mocks.track }) }));
vi.mock('@/components/modern/ToastNotification', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/services/profileService', () => ({ getProfile: async () => ({ uid: 'google-student', role: 'student', firstName: 'QA', familyName: 'Student', email: 'qa@example.test' }), updateProfile: vi.fn() }));
vi.mock('@/services/accountDeletionService', () => ({ hasPendingDeletion: async () => false, getDaysUntilDeletion: vi.fn(), requestDeletion: vi.fn(), cancelDeletion: vi.fn() }));
vi.mock('@/services/invitationService', () => ({ redeemTeacherInvite: vi.fn() }));
vi.mock('@/utils/errorHandling', () => ({ fetchWithCache: mocks.fetchProfile, retryWithFeedback: vi.fn(), showSuccessToast: mocks.success, showErrorToast: mocks.error }));
vi.mock('@/context/StudentShellDataContext', () => ({ useResolvedStudentHomeworkList: () => ({ notStarted: [] }) }));
vi.mock('@/components/layout/StudentLayout', () => ({ StudentLayout: ({ children, rightPanel }: { children: React.ReactNode; rightPanel: React.ReactNode }) => <>{children}{rightPanel}</> }));
vi.mock('@/components/layout/StudentSidebar', () => ({ StudentSidebar: () => null }));
vi.mock('@/components/navigation/TeacherHeader', () => ({ TeacherHeader: ({ pageTitle }: { pageTitle: string }) => <header data-testid="teacher-header">{pageTitle}</header> }));
vi.mock('@/components/badges/BadgeShowcase', () => ({ BadgeShowcase: () => null }));
vi.mock('./ProfileCompletionForm', () => ({ ProfileCompletionForm: () => null }));

describe('student password setup', () => {
    afterEach(() => {
        cleanup();
        mocks.user.providerData = [{ providerId: 'google.com' }];
        mocks.authProfile = undefined;
        mocks.setup.mockReset();
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        if (originalDialogClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalDialogClose);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    });
    it('only opens the QA panel for the current eligible profile and loads connections on demand', async () => {
        HTMLDialogElement.prototype.close = vi.fn();
        vi.stubEnv('DEV', true);
        vi.stubEnv('VITE_EXTERNAL_AUDIO_LOCAL_QA', 'enabled');
        vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-luyentap-local');
        vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', 'http://localhost:8787');
        vi.stubGlobal('location', new URL('http://localhost:5173/profile'));
        const request = vi.fn(async () => Response.json({ generation: 0, activeConnectionId: null, connections: [] }));
        vi.stubGlobal('fetch', request);

        mocks.authProfile = { uid: 'other-user', role: 'teacher' };
        const root = render(<MemoryRouter><ProfilePage /></MemoryRouter>);
        await screen.findByRole('heading', { name: 'QA Student', exact: true });
        expect(screen.queryByRole('tab', { name: 'External audio storage' })).not.toBeInTheDocument();
        expect(request).not.toHaveBeenCalled();

        mocks.authProfile = { uid: mocks.user.uid, role: 'teacher' };
        root.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>);
        expect(screen.getByTestId('profile-teacher-shell')).toBeInTheDocument();
        expect(screen.queryByText(/Active Scholar|Total Homework/i)).not.toBeInTheDocument();
        const storageTab = screen.getByRole('tab', { name: 'External audio storage' });
        expect(storageTab).toHaveAttribute('aria-selected', 'false');
        expect(request).not.toHaveBeenCalled();
        fireEvent.click(storageTab);
        expect(await screen.findByText(/No Backblaze B2 account connected/i)).toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
        expect(mocks.track).toHaveBeenCalledWith('externalAudioOpen');
    });
    it('opens the dedicated External audio storage tab directly when navigated with router state', async () => {
        HTMLDialogElement.prototype.close = vi.fn();
        vi.stubEnv('DEV', true);
        vi.stubEnv('VITE_EXTERNAL_AUDIO_LOCAL_QA', 'enabled');
        vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-luyentap-local');
        vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', 'http://localhost:8787');
        vi.stubGlobal('location', new URL('http://localhost:5173/profile'));
        const request = vi.fn(async () => Response.json({ generation: 0, activeConnectionId: null, connections: [] }));
        vi.stubGlobal('fetch', request);

        mocks.authProfile = { uid: mocks.user.uid, role: 'teacher' };
        render(
            <MemoryRouter initialEntries={[{ pathname: '/profile', state: { section: 'external-audio' } }]}>
                <ProfilePage />
            </MemoryRouter>,
        );
        expect(screen.getByTestId('profile-teacher-shell')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'External audio storage' })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('button', { name: 'Add B2 account' })).toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('lets a Google-only student add a password for the assigned ID and hides setup only after success or an existing password provider', async () => {
        HTMLDialogElement.prototype.close = vi.fn();
        render(<MemoryRouter><ProfilePage /></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: 'Set up ID and password' }));
        expect(screen.getByLabelText('First name')).toHaveValue('QA');
        expect(screen.getByLabelText('Last name')).toHaveValue('Student');
        expect(screen.getByLabelText('Student ID / Username')).toHaveValue('STU-ASSIGNED');
        expect(screen.getByLabelText('Student ID / Username')).toHaveAttribute('readonly');
        fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'password123' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } });
        mocks.setup.mockRejectedValueOnce(new Error('Please sign in again.'));
        fireEvent.click(screen.getByRole('button', { name: 'Save login' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Set up ID and password' })).toBeInTheDocument();
        mocks.setup.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByRole('button', { name: 'Save login' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Set up ID and password' })).not.toBeInTheDocument();
        expect(mocks.setup).toHaveBeenLastCalledWith({ firstName: 'QA', familyName: 'Student', studentId: 'STU-ASSIGNED', password: 'password123', confirmPassword: 'password123' });
        expect(mocks.success).toHaveBeenCalledWith('Student login saved. You can now sign in with your student ID and password.');
        expect(mocks.track).toHaveBeenCalledWith('saveCredentialSetup');
        expect(mocks.fetchProfile).toHaveBeenLastCalledWith('profile-google-student', expect.any(Function), { ttl: 300000, forceRefresh: true });
        cleanup();
        mocks.user.providerData.push({ providerId: 'password' });
        render(<MemoryRouter><ProfilePage /></MemoryRouter>);
        await screen.findByRole('heading', { name: 'QA Student', exact: true });
        expect(screen.queryByRole('button', { name: 'Set up ID and password' })).not.toBeInTheDocument();
    });
});
