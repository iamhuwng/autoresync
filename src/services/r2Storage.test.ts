import { describe, expect, it, vi } from 'vitest';

const firebaseAuth = vi.hoisted(() => ({
    currentUser: null as null | { getIdToken: () => Promise<string> },
}));

vi.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: firebaseAuth.currentUser }),
}));

import {
    DEFAULT_R2_UPLOAD_WORKER_URL,
} from './r2UploadClient';
import {
    R2_PUBLIC_URL,
    R2StorageService,
    type MoveResult,
    type R2UploadClientContract,
    type UploadOperationKind,
    type UploadResult,
} from './r2Storage';
import {
    WorkerListeningUploadSessionApi,
    resolveListeningUploadSessionEndpoint,
    type ListeningUploadSessionApi,
} from '../features/assessment/listening/storage/listeningUploadSessionApi';

const makeResult = (key: string, isTemp = false): UploadResult => ({
    url: `https://pub.example/${key}`,
    streamUrl: `https://pub.example/${key}`,
    directUrl: `https://pub.example/${key}`,
    fileName: 'asset.bin',
    key,
    isTemp,
});

const makeClient = () => ({
    upload: vi.fn<(file: File, operationKind: UploadOperationKind, onProgress?: (percent: number, bytes: number, total: number) => void, options?: unknown) => Promise<UploadResult>>(),
    uploadWithAssetGrant: vi.fn(),
    move: vi.fn<(key: string) => Promise<MoveResult>>(),
}) satisfies R2UploadClientContract;

const makeListeningUploadSessionApi = () => ({
    createSession: vi.fn(),
    issueAsset: vi.fn(),
    probeAsset: vi.fn(),
    cancelSession: vi.fn(),
}) satisfies ListeningUploadSessionApi;

describe('R2StorageService compatibility facade', () => {
    it('uses the signed-in Firebase user token for trusted cleanup and sends identity-only input', async () => {
        const getIdToken = vi.fn().mockResolvedValue('firebase-id-token');
        firebaseAuth.currentUser = { getIdToken };
        const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        const api = new WorkerListeningUploadSessionApi();

        await api.cancelSession({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
            reason: 'builder-cancel',
        });

        expect(getIdToken).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            `${DEFAULT_R2_UPLOAD_WORKER_URL}/cancelListeningUploadSession`,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer firebase-id-token' }),
                body: JSON.stringify({
                    uploadSessionId: 'session-from-backend',
                    assetId: 'asset-from-backend',
                    reason: 'builder-cancel',
                }),
            }),
        );
        fetchImpl.mockRestore();
        firebaseAuth.currentUser = null;
    });

    it('resolves Listening upload session authority from Worker env only', () => {
        expect(resolveListeningUploadSessionEndpoint({
            VITE_LISTENING_UPLOAD_SESSION_WORKER_URL: 'https://worker.example///',
            VITE_R2_UPLOAD_WORKER_URL: 'https://legacy-worker.example/',
        })).toBe('https://worker.example');
        expect(resolveListeningUploadSessionEndpoint({
            VITE_R2_UPLOAD_WORKER_URL: 'https://legacy-worker.example/',
        })).toBe('https://legacy-worker.example');
        expect(resolveListeningUploadSessionEndpoint({
        })).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
        expect(resolveListeningUploadSessionEndpoint({
        }, 'teacher.example.com')).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
    });

    it('delegates Listening session and asset requests to named backend endpoints without deriving authority', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        bridge.createSession.mockResolvedValue({
            uploadSessionId: 'session-from-backend',
            ownerId: 'owner-from-backend',
            status: 'active',
            createdAt: 1,
            expiresAt: 2,
            maxEligibilityExpiresAt: 3,
        });
        bridge.issueAsset.mockResolvedValue({
            assetId: 'asset-from-backend',
            uploadSessionId: 'session-from-backend',
            tempKey: 'temp/listening/owner-from-backend/session-from-backend/asset-from-backend-audio.mp3',
            assetGrant: 'backend-grant',
            assetGrantExpiresAt: 4,
        });
        const service = new R2StorageService(client, bridge);

        await expect(service.createListeningUploadSession({
            idempotencyKey: 'session-request',
            draftId: 'correlation-only-draft',
        })).resolves.toEqual(expect.objectContaining({ uploadSessionId: 'session-from-backend' }));
        await expect(service.issueListeningUploadAsset({
            idempotencyKey: 'asset-request',
            uploadSessionId: 'session-from-backend',
            fileName: 'audio.mp3',
            declaredMimeType: 'audio/mpeg',
            sizeBytes: 4,
        })).resolves.toEqual(expect.objectContaining({ assetId: 'asset-from-backend' }));

        expect(bridge.createSession).toHaveBeenCalledWith({
            idempotencyKey: 'session-request',
            draftId: 'correlation-only-draft',
        });
        expect(bridge.issueAsset).toHaveBeenCalledWith(expect.objectContaining({
            idempotencyKey: 'asset-request',
            uploadSessionId: 'session-from-backend',
        }));
        expect(client.upload).not.toHaveBeenCalled();
    });

    it('probes Listening authoring audio readiness through the Worker authority', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        bridge.probeAsset.mockResolvedValue({
            status: 'ready',
            assetId: 'asset-from-backend',
            uploadSessionId: 'session-from-backend',
            contentType: 'audio/m4a',
            sizeBytes: 42,
            range: {
                requestRange: 'bytes=0-0',
                status: 206,
                acceptRanges: 'bytes',
                contentLength: 1,
                contentRange: 'bytes 0-0/42',
            },
        });
        const service = new R2StorageService(client, bridge);

        await expect(service.probeListeningAuthoringAudio({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
        })).resolves.toEqual(expect.objectContaining({
            status: 'ready',
            assetId: 'asset-from-backend',
        }));
        expect(bridge.probeAsset).toHaveBeenCalledWith({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
        });
        expect(client.upload).not.toHaveBeenCalled();
        expect(client.uploadWithAssetGrant).not.toHaveBeenCalled();
    });

    it('uses the authenticated trusted cleanup contract and retries only its idempotent call', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        const sleep = vi.fn().mockResolvedValue(undefined);
        bridge.cancelSession
            .mockRejectedValueOnce(Object.assign(new Error('temporary transport failure'), { retryable: true }))
            .mockResolvedValueOnce({
                status: 'cleanup-queued',
                uploadSessionId: 'session-from-backend',
                deletedCount: 0,
                preservedCount: 1,
                skippedCount: 0,
            });
        const service = new R2StorageService(client, bridge, { sleep });

        await expect(service.cancelListeningAuthoringUpload({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
            reason: 'discard-draft',
        })).resolves.toMatchObject({ status: 'cleanup-queued' });
        expect(bridge.cancelSession).toHaveBeenCalledWith({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
            reason: 'discard-draft',
        });
        expect(sleep).toHaveBeenCalledWith(50);
        expect(JSON.stringify(bridge.cancelSession.mock.calls[0][0])).not.toContain('temp/listening/');
    });

    it('does not retry an idempotent terminal replay failure', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        const sleep = vi.fn().mockResolvedValue(undefined);
        bridge.cancelSession.mockRejectedValueOnce(Object.assign(new Error('already completed'), { retryable: false }));
        const service = new R2StorageService(client, bridge, { sleep });

        await expect(service.cancelListeningAuthoringUpload({
            uploadSessionId: 'session-from-backend',
            reason: 'builder-cancel',
        })).rejects.toThrow('already completed');
        expect(bridge.cancelSession).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('creates a canonical Listening upload session, issues an asset, then uploads with its grant', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        const tempKey = 'temp/listening/owner-a/session-from-backend/asset-from-backend-audio.m4a';
        bridge.createSession.mockResolvedValue({
            uploadSessionId: 'session-from-backend',
            ownerId: 'owner-a',
            status: 'active',
            createdAt: 1,
            expiresAt: 2,
            maxEligibilityExpiresAt: 3,
        });
        bridge.issueAsset.mockResolvedValue({
            assetId: 'asset-from-backend',
            uploadSessionId: 'session-from-backend',
            tempKey,
            assetGrant: 'backend-grant',
            assetGrantExpiresAt: 4,
        });
        client.uploadWithAssetGrant.mockResolvedValue({
            ...makeResult(tempKey, true),
            fileName: 'audio.m4a',
            url: `${R2_PUBLIC_URL}/${tempKey}`,
            streamUrl: `${R2_PUBLIC_URL}/${tempKey}`,
            directUrl: `${R2_PUBLIC_URL}/${tempKey}`,
        });
        const service = new R2StorageService(client, bridge);
        const progress = vi.fn();
        const file = new File(['audio'], 'audio.m4a', { type: 'audio/x-m4a' });

        await expect(service.uploadListeningAuthoringAudio(file, {
            sessionIdempotencyKey: 'upload-attempt-session',
            assetIdempotencyKey: 'upload-attempt-asset',
            draftId: 'draft-1',
        }, progress)).resolves.toEqual(expect.objectContaining({
            assetId: 'asset-from-backend',
            uploadSessionId: 'session-from-backend',
            tempKey,
            contentType: 'audio/m4a',
            sizeBytes: file.size,
        }));

        expect(bridge.createSession).toHaveBeenCalledWith({
            idempotencyKey: 'upload-attempt-session',
            draftId: 'draft-1',
        });
        expect(bridge.issueAsset).toHaveBeenCalledWith({
            idempotencyKey: 'upload-attempt-asset',
            uploadSessionId: 'session-from-backend',
            fileName: 'audio.m4a',
            declaredMimeType: 'audio/m4a',
            sizeBytes: file.size,
        });
        expect(client.uploadWithAssetGrant).toHaveBeenCalledWith(file, {
            assetGrant: 'backend-grant',
            key: tempKey,
            publicUrl: `${R2_PUBLIC_URL}/${tempKey}`,
            contentType: 'audio/m4a',
        }, progress, undefined);
        expect(client.upload).not.toHaveBeenCalled();
    });

    it('queues trusted cleanup after an aborted issued upload without rejecting cleanup', async () => {
        const client = makeClient();
        const bridge = makeListeningUploadSessionApi();
        const tempKey = 'temp/listening/owner-a/session-from-backend/asset-from-backend-audio.m4a';
        bridge.createSession.mockResolvedValue({
            uploadSessionId: 'session-from-backend',
            ownerId: 'owner-a',
            status: 'active',
            createdAt: 1,
            expiresAt: 2,
            maxEligibilityExpiresAt: 3,
        });
        bridge.issueAsset.mockResolvedValue({
            assetId: 'asset-from-backend',
            uploadSessionId: 'session-from-backend',
            tempKey,
            assetGrant: 'backend-grant',
            assetGrantExpiresAt: 4,
        });
        bridge.cancelSession.mockResolvedValue({
            status: 'abandoned',
            uploadSessionId: 'session-from-backend',
            deletedCount: 1,
            preservedCount: 0,
            skippedCount: 0,
        });
        client.uploadWithAssetGrant.mockRejectedValue(Object.assign(new Error('cancelled'), {
            code: 'upload_aborted',
        }));
        const service = new R2StorageService(client, bridge, { sleep: vi.fn() });
        const controller = new AbortController();
        controller.abort();

        await expect(service.uploadListeningAuthoringAudio(
            new File(['audio'], 'audio.m4a', { type: 'audio/x-m4a' }),
            { sessionIdempotencyKey: 'session-request', assetIdempotencyKey: 'asset-request' },
            undefined,
            { signal: controller.signal },
        )).rejects.toMatchObject({ code: 'upload_aborted' });
        expect(bridge.cancelSession).toHaveBeenCalledWith({
            uploadSessionId: 'session-from-backend',
            assetId: 'asset-from-backend',
            reason: 'upload-aborted',
        });
    });

    it.each([
        ['listening audio temp', (service: R2StorageService, file: File) => service.uploadAudio(file, 'listening-audio'), 'listening_audio_temp'],
        ['test audio temp', (service: R2StorageService, file: File) => service.uploadAudio(file, 'audio'), 'test_audio_temp'],
        ['test image temp', (service: R2StorageService, file: File) => service.uploadImage(file, 'images'), 'test_image_temp'],
        ['avatar permanent', (service: R2StorageService, file: File) => service.uploadAvatar(file, 'user-123'), 'avatar_permanent'],
        ['announcement attachment permanent', (service: R2StorageService, file: File) => service.uploadFilePermanent(file, 'announcements'), 'announcement_attachment_permanent'],
        ['book cover permanent', (service: R2StorageService, file: File) => service.uploadFileAtKey(file, 'book-covers/book-123/cover'), 'book_cover_permanent'],
    ] satisfies Array<[string, (service: R2StorageService, file: File) => Promise<UploadResult>, UploadOperationKind]>)
        ('maps %s to approved operation intent', async (_label, invoke, operationKind) => {
            const client = makeClient();
            const result = makeResult(`server/${operationKind}`);
            client.upload.mockResolvedValue(result);
            const service = new R2StorageService(client);
            const file = new File(['asset'], 'asset.bin', { type: 'application/octet-stream' });

            await expect(invoke(service, file)).resolves.toEqual(result);

            expect(client.upload).toHaveBeenCalledWith(file, operationKind, undefined);
        });

    it('preserves progress callback for audio uploads', async () => {
        const client = makeClient();
        const result = makeResult('temp/audio/server-audio.mp3', true);
        client.upload.mockResolvedValue(result);
        const service = new R2StorageService(client);
        const progress = vi.fn();
        const file = new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' });

        await expect(service.uploadAudio(file, 'audio', progress)).resolves.toEqual(result);

        expect(client.upload).toHaveBeenCalledWith(file, 'test_audio_temp', progress);
    });

    it.each([
        ['image', (service: R2StorageService, file: File, url: string) => service.uploadImageReplacement(file, url), 'test_image_temp'],
        ['audio', (service: R2StorageService, file: File, url: string) => service.uploadAudioReplacement(file, url), 'test_audio_temp'],
        ['book cover', (service: R2StorageService, file: File, url: string) => service.uploadFileAtKey(file, url), 'book_cover_permanent'],
    ] satisfies Array<[string, (service: R2StorageService, file: File, current: string) => Promise<UploadResult>, UploadOperationKind]>)
        ('uses server-derived key for existing %s replacement', async (_label, invoke, operationKind) => {
            const client = makeClient();
            const serverResult = makeResult(`server-derived/${operationKind}`);
            client.upload.mockResolvedValue(serverResult);
            const service = new R2StorageService(client);
            const file = new File(['replacement'], 'replacement.png', { type: 'image/png' });
            const browserKey = operationKind === 'book_cover_permanent'
                ? 'book-covers/book-123/browser-selected-cover.png'
                : 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/temp/images/browser-selected.png';

            await expect(invoke(service, file, browserKey)).resolves.toEqual(serverResult);

            expect(client.upload).toHaveBeenCalledWith(file, operationKind, undefined);
            expect(client.upload.mock.calls[0]).not.toContain(browserKey);
        });

    it('preserves avatar singleton intent even with an existing URL', async () => {
        const client = makeClient();
        const result = makeResult('avatars/user-123/avatar');
        client.upload.mockResolvedValue(result);
        const service = new R2StorageService(client);
        const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

        await expect(service.uploadAvatar(
            file,
            'user-123',
            'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/avatars/legacy/avatar.png',
        )).resolves.toEqual(result);

        expect(client.upload).toHaveBeenCalledWith(file, 'avatar_permanent', undefined);
    });

    it('delegates temp movement and returns exact Worker result', async () => {
        const client = makeClient();
        const result: MoveResult = {
            success: true,
            newKey: 'audio/user-123/server-audio.mp3',
            newUrl: 'https://pub.example/audio/user-123/server-audio.mp3',
        };
        client.move.mockResolvedValue(result);
        const service = new R2StorageService(client);

        await expect(service.moveToPermanent('temp/audio/user-123/server-audio.mp3')).resolves.toEqual(result);

        expect(client.move).toHaveBeenCalledWith('temp/audio/user-123/server-audio.mp3');
    });

    it('preserves public URL key extraction and temp detection', () => {
        const service = new R2StorageService(makeClient());
        const url = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/temp/images/user-123/image.png?v=123#preview';

        expect(service.getKeyFromUrl(url)).toBe('temp/images/user-123/image.png');
        expect(service.isTempFile(url)).toBe(true);
        expect(service.isTempFile('images/user-123/image.png')).toBe(false);
    });
});
