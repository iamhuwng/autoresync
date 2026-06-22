import { describe, expect, it, vi } from 'vitest';
import {
    R2StorageService,
    type MoveResult,
    type R2UploadClientContract,
    type UploadOperationKind,
    type UploadResult,
} from './r2Storage';

const makeResult = (key: string, isTemp = false): UploadResult => ({
    url: `https://pub.example/${key}`,
    streamUrl: `https://pub.example/${key}`,
    directUrl: `https://pub.example/${key}`,
    fileName: 'asset.bin',
    key,
    isTemp,
});

const makeClient = () => ({
    upload: vi.fn<(file: File, operationKind: UploadOperationKind, onProgress?: (percent: number, bytes: number, total: number) => void) => Promise<UploadResult>>(),
    move: vi.fn<(key: string) => Promise<MoveResult>>(),
}) satisfies R2UploadClientContract;

describe('R2StorageService compatibility facade', () => {
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
