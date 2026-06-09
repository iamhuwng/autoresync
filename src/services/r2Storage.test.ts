import { describe, expect, it, vi } from 'vitest';
import { R2StorageService, type UploadResult } from './r2Storage';

const makeResult = (key: string): UploadResult => ({
    url: `https://pub.example/${key}`,
    streamUrl: `https://pub.example/${key}`,
    directUrl: `https://pub.example/${key}`,
    fileName: 'image.png',
    key,
    isTemp: false,
});

const makeFile = (): File => new File(['image'], 'image.png', { type: 'image/png' });

describe('R2StorageService replacement uploads', () => {
    it('stores authenticated avatars at one stable key', async () => {
        const service = new R2StorageService();
        const result = makeResult('avatars/user-123/avatar');
        const uploadAtKey = vi.spyOn(service, 'uploadFileAtKey').mockResolvedValue(result);
        const file = makeFile();

        await expect(service.uploadAvatar(file, 'user-123')).resolves.toEqual(result);

        expect(uploadAtKey).toHaveBeenCalledWith(file, 'avatars/user-123/avatar');
    });

    it('overwrites the current R2 avatar key instead of creating a migration orphan', async () => {
        const service = new R2StorageService();
        const result = makeResult('avatars/legacy/avatar.png');
        const uploadAtKey = vi.spyOn(service, 'uploadFileAtKey').mockResolvedValue(result);
        const file = makeFile();

        await expect(service.uploadAvatar(
            file,
            'user-123',
            'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/avatars/legacy/avatar.png?v=1',
        )).resolves.toEqual(result);

        expect(uploadAtKey).toHaveBeenCalledWith(file, 'avatars/legacy/avatar.png');
    });

    it('overwrites an existing R2 image key during replacement', async () => {
        const service = new R2StorageService();
        const existingUrl = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/temp/images/existing.png';
        const result = makeResult('temp/images/existing.png');
        const uploadAtKey = vi.spyOn(service, 'uploadFileAtKey').mockResolvedValue(result);
        const file = makeFile();

        await expect(service.uploadImageReplacement(file, existingUrl)).resolves.toEqual(result);

        expect(uploadAtKey).toHaveBeenCalledWith(file, 'temp/images/existing.png');
    });

    it('extracts the original R2 key from cache-busted URLs', () => {
        const service = new R2StorageService();

        expect(service.getKeyFromUrl(
            'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/avatars/user-123/avatar?v=123#preview',
        )).toBe('avatars/user-123/avatar');
    });

    it('uses normal image upload for first upload or external image URL', async () => {
        const service = new R2StorageService();
        const result = makeResult('temp/images/new.png');
        const uploadImage = vi.spyOn(service, 'uploadImage').mockResolvedValue(result);
        const file = makeFile();

        await expect(service.uploadImageReplacement(file, 'https://example.com/external.png')).resolves.toEqual(result);

        expect(uploadImage).toHaveBeenCalledWith(file, 'images');
    });

    it('overwrites an existing R2 audio key during replacement', async () => {
        const service = new R2StorageService();
        const existingUrl = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/temp/audio/existing.mp3?v=123';
        const result = makeResult('temp/audio/existing.mp3');
        const uploadAtKey = vi.spyOn(service, 'uploadFileAtKey').mockResolvedValue(result);
        const progress = vi.fn();
        const file = new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' });

        await expect(service.uploadAudioReplacement(file, existingUrl, 'audio', progress)).resolves.toEqual(result);

        expect(uploadAtKey).toHaveBeenCalledWith(file, 'temp/audio/existing.mp3', progress);
    });
});
