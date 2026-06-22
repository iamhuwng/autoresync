import R2UploadClient, {
    type MoveResult,
    type R2UploadClientContract,
    type UploadOperationKind,
    type UploadProgress,
    type UploadResult,
} from './r2UploadClient';

const PUBLIC_URL = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev';

const tempOperationForFolder = (folder: string): UploadOperationKind => {
    if (folder === 'listening-audio') return 'listening_audio_temp';
    if (folder === 'audio') return 'test_audio_temp';
    if (folder === 'images') return 'test_image_temp';
    throw new Error(`Unsupported temporary R2 upload folder: ${folder}`);
};

const permanentOperationForHint = (hint: string): UploadOperationKind => {
    const normalized = hint.replace(/^https?:\/\/[^/]+\//, '');
    if (normalized === 'avatars' || normalized.startsWith('avatars/')) return 'avatar_permanent';
    if (normalized === 'announcements' || normalized.startsWith('announcements/')) {
        return 'announcement_attachment_permanent';
    }
    if (normalized === 'book-covers' || normalized.startsWith('book-covers/')) {
        return 'book_cover_permanent';
    }
    throw new Error('Unsupported permanent R2 upload intent');
};

class R2StorageService {
    constructor(private readonly client: R2UploadClientContract = new R2UploadClient()) {}

    async uploadFile(
        file: File,
        folder = 'uploads',
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        return this.client.upload(file, tempOperationForFolder(folder), onProgress);
    }

    async moveToPermanent(tempKey: string): Promise<MoveResult> {
        if (!this.isTempFile(tempKey)) {
            return {
                success: true,
                newUrl: `${PUBLIC_URL}/${tempKey}`,
                newKey: tempKey,
            };
        }
        return this.client.move(tempKey);
    }

    async moveMultipleToPermanent(tempKeys: string[]): Promise<MoveResult[]> {
        return Promise.all(tempKeys.map((key) => this.moveToPermanent(key)));
    }

    getKeyFromUrl(url: string): string | null {
        const publicPrefix = `${PUBLIC_URL}/`;
        if (!url.startsWith(publicPrefix)) return null;
        return url.slice(publicPrefix.length).split(/[?#]/, 1)[0] || null;
    }

    isTempFile(urlOrKey: string): boolean {
        const key = urlOrKey.includes('://') ? this.getKeyFromUrl(urlOrKey) : urlOrKey;
        if (!key) return false;
        return key.startsWith('temp/') || key.includes('-temp/') || key.includes('/temp/');
    }

    async uploadAudio(
        file: File,
        folderName = 'audio',
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        return this.client.upload(file, tempOperationForFolder(folderName), onProgress);
    }

    async uploadAudioReplacement(
        file: File,
        _currentUrl?: string | null,
        folderName = 'audio',
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        return this.client.upload(file, tempOperationForFolder(folderName), onProgress);
    }

    async uploadImage(file: File, folderName = 'images'): Promise<UploadResult> {
        return this.client.upload(file, tempOperationForFolder(folderName), undefined);
    }

    async uploadImageReplacement(
        file: File,
        _currentUrl?: string | null,
        folderName = 'images',
    ): Promise<UploadResult> {
        return this.client.upload(file, tempOperationForFolder(folderName), undefined);
    }

    async uploadFilePermanent(
        file: File,
        folder = 'uploads',
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        return this.client.upload(file, permanentOperationForHint(folder), onProgress);
    }

    async uploadFileAtKey(
        file: File,
        keyName: string,
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        return this.client.upload(file, permanentOperationForHint(keyName), onProgress);
    }

    async uploadAvatar(
        file: File,
        _userId?: string,
        _currentUrl?: string | null,
    ): Promise<UploadResult> {
        return this.client.upload(file, 'avatar_permanent', undefined);
    }

    async initialize(): Promise<void> {}

    hasValidToken(): boolean {
        return true;
    }

    async requestAccessToken(): Promise<void> {}
}

const r2StorageService = new R2StorageService();

export default r2StorageService;
export { R2StorageService };
export type {
    MoveResult,
    R2UploadClientContract,
    UploadOperationKind,
    UploadProgress,
    UploadResult,
};
