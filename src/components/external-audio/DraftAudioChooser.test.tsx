import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftAudioChooser } from './DraftAudioChooser';

const mocks = vi.hoisted(() => ({
    user: { uid: 'teacher-1', getIdToken: vi.fn(async () => 'fixture-token') },
    profile: { uid: 'teacher-1', role: 'teacher' } as { uid: string; role: string } | null,
    navigateTo: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user, profile: mocks.profile }),
}));
vi.mock('@/hooks/useNavigation', () => ({
    useNavigation: () => ({ navigateTo: mocks.navigateTo }),
}));
vi.mock('@/components/modern', async () => {
    const actual = await vi.importActual<typeof import('@/components/modern')>('@/components/modern');
    return {
        ...actual,
        toast: {
            success: mocks.toastSuccess,
            error: mocks.toastError,
            info: mocks.toastInfo,
            warning: vi.fn(),
        },
    };
});
vi.mock('@/components/modern/ToastNotification', () => ({
    useDialogToastTarget: vi.fn(),
    toast: {
        success: mocks.toastSuccess,
        error: mocks.toastError,
        info: mocks.toastInfo,
        warning: vi.fn(),
    },
}));

describe('DraftAudioChooser', () => {
    beforeEach(() => {
        vi.stubEnv('DEV', true);
        vi.stubEnv('VITE_EXTERNAL_AUDIO_LOCAL_QA', 'enabled');
        vi.stubEnv('VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA', 'enabled');
        vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-luyentap-local');
        vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', 'http://localhost:8787');
        vi.stubGlobal('location', new URL('http://localhost:5173/lobby'));
        HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
            this.setAttribute('open', '');
        });
        HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        });
    });

    afterEach(() => {
        cleanup();
        mocks.profile = { uid: 'teacher-1', role: 'teacher' };
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('shows the no-active-account warning modal without credential inputs and routes to Profile storage settings', async () => {
        const track = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({
            generation: 0,
            activeConnectionId: null,
            connections: [],
        })));

        render(
            <DraftAudioChooser
                testType="ielts-listening"
                draftId="draft-1"
                sectionId="1"
                onChange={vi.fn()}
                track={track}
            />,
        );

        const trigger = screen.getByRole('button', { name: 'Choose external audio' });
        fireEvent.click(trigger);

        expect(await screen.findByTestId('no-active-b2-modal')).toBeInTheDocument();
        expect(screen.getByText(/Connect a private Backblaze B2 bucket in Profile/i)).toBeInTheDocument();
        expect(screen.queryByText(/listBuckets|listFiles|readFiles/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Application key/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(document.activeElement).toBe(trigger));

        fireEvent.click(trigger);
        expect(await screen.findByTestId('no-active-b2-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Profile storage settings' }));

        expect(track).toHaveBeenCalledWith('externalAudioOpenProfileFromAuthoring');
        expect(mocks.toastInfo).toHaveBeenCalledWith('Opening External audio storage in Profile.');
        expect(mocks.navigateTo).toHaveBeenCalledWith('PROFILE', {}, {
            reason: 'external_audio_setup',
            state: { section: 'external-audio' },
        });
    });

    it('lets teachers switch between retained B2 accounts directly in the chooser without re-entering credentials', async () => {
        const track = vi.fn();
        const connA = { id: '11111111-1111-4111-8111-111111111111', label: 'Account A', state: 'archived', bucketName: 'bucket-a', prefix: '', health: 'healthy', checkedAt: 1000 };
        const connB = { id: '22222222-2222-4222-8222-222222222222', label: 'Account B', state: 'active', bucketName: 'bucket-b', prefix: '', health: 'healthy', checkedAt: 2000 };
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/external-audio/connections')) {
                return Response.json({ generation: 2, activeConnectionId: connB.id, connections: [connA, connB] });
            }
            if (url.endsWith('/external-audio/select')) {
                return Response.json({
                    generation: 3,
                    activeConnectionId: connA.id,
                    connections: [{ ...connA, state: 'active' }, { ...connB, state: 'archived' }],
                });
            }
            if (url.endsWith('/external-audio/list')) {
                return Response.json({ files: [], nextCursor: null });
            }
            return Response.json({ error: 'unexpected' }, { status: 400 });
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <DraftAudioChooser
                testType="thcs-thpt"
                draftId="draft-thcs"
                sectionId="sec-1"
                onChange={vi.fn()}
                track={track}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Choose external audio' }));
        const selector = await screen.findByLabelText('Authoring account');
        expect(selector).toHaveValue(connB.id);

        fireEvent.change(selector, { target: { value: connA.id } });
        await waitFor(() => expect(selector).toHaveValue(connA.id));
        expect(track).toHaveBeenCalledWith('externalAudioSelectAccount');
        expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining('Account A'));
    });

    it('lets teachers select a file card, attach it, and auto-loads draft audio preview without crossOrigin', async () => {
        const track = vi.fn();
        const connA = { id: '11111111-1111-4111-8111-111111111111', label: 'Account A', state: 'active', bucketName: 'bucket-a', prefix: '', health: 'healthy', checkedAt: 1000 };
        const file = { objectKey: 'section1.mp3', providerVersionId: 'ver-1', contentType: 'audio/mpeg', sizeBytes: 42000 };
        const previewUrl = 'https://s3.us-east-005.backblazeb2.com/bucket-a/section1.mp3?versionId=ver-1&X-Amz-Signature=ok';
        const attached = { assetId: '33333333-3333-4333-8333-333333333333', scope: 'section' as const };
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.endsWith('/external-audio/connections')) {
                return Response.json({ generation: 1, activeConnectionId: connA.id, connections: [connA] });
            }
            if (url.endsWith('/external-audio/list')) {
                return Response.json({ files: [file], nextCursor: null });
            }
            if (url.endsWith('/external-audio/inspect')) {
                return Response.json(file);
            }
            if (url.endsWith('/external-audio/preview')) {
                return Response.json({ file, url: previewUrl, expiresAt: Date.now() + 120_000 });
            }
            if (url.endsWith('/external-audio/attach-draft')) {
                return Response.json(attached);
            }
            if (url.endsWith('/external-audio/draft-recording')) {
                return Response.json({ filename: 'section1.mp3', lastModifiedAt: 1000 });
            }
            if (url.endsWith('/external-audio/preview-draft')) {
                return Response.json({ url: previewUrl, expiresAt: Date.now() + 120_000 });
            }
            return Response.json({ error: 'unexpected' }, { status: 400 });
        }));

        const onChange = vi.fn();
        const { rerender } = render(
            <DraftAudioChooser
                testType="ielts-listening"
                draftId="draft-1"
                sectionId="1"
                onChange={onChange}
                track={track}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Choose external audio' }));
        const card = await screen.findByRole('button', { name: /section1\.mp3/i });
        const attachBtn = screen.getByRole('button', { name: 'Attach audio' });
        expect(attachBtn).toBeDisabled();

        fireEvent.click(card);
        await waitFor(() => expect(attachBtn).toBeEnabled());
        expect(await screen.findByLabelText('Audio preview')).toHaveAttribute('src', previewUrl);

        fireEvent.click(attachBtn);
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(attached));

        rerender(
            <DraftAudioChooser
                testType="ielts-listening"
                draftId="draft-1"
                sectionId="1"
                value={attached}
                onChange={onChange}
                track={track}
            />,
        );

        const draftPlayer = await screen.findByLabelText('Draft audio preview');
        expect(draftPlayer).toHaveAttribute('src', previewUrl);
        expect(draftPlayer).not.toHaveAttribute('crossorigin');
    });

    it('never renders in student UI', () => {
        mocks.profile = { uid: 'student-1', role: 'student' };
        const { container } = render(
            <DraftAudioChooser
                testType="ielts-listening"
                draftId="draft-1"
                sectionId="1"
                onChange={vi.fn()}
                track={vi.fn()}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });
});
