import R2UploadClient, {
    type AssetGrantUploadAuthorization,
    type MoveResult,
    type R2UploadClientContract,
    type UploadOptions,
    type UploadOperationKind,
    type UploadProgress,
    type UploadResult,
} from './r2UploadClient';
import {
    WorkerListeningUploadSessionApi,
    type ListeningUploadAssetResponse,
    type ListeningUploadAssetProbeResponse,
    type ListeningUploadCancelResponse,
    type ListeningUploadCleanupReason,
    type ListeningUploadSessionApi,
    type ListeningUploadSessionResponse,
} from '../features/assessment/listening/storage/listeningUploadSessionApi';

export const R2_PUBLIC_URL = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev';

const LISTENING_CLEANUP_CANCEL_ATTEMPTS = 3;

const retrySoon = async (): Promise<void> => {
    await Promise.resolve();
};

export interface ListeningAuthoringUploadInput {
    sessionIdempotencyKey: string;
    assetIdempotencyKey: string;
    draftId?: string;
}

export interface ListeningAuthoringUploadResult extends UploadResult {
    assetId: string;
    uploadSessionId: string;
    tempKey: string;
    contentType: string;
    sizeBytes: number;
}

const LISTENING_MIME_BY_EXTENSION: Record<string, string> = {
    '.aac': 'audio/aac',
    '.m4a': 'audio/m4a',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
};

const listeningContentType = (file: File): string => {
    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    return LISTENING_MIME_BY_EXTENSION[extension] ?? file.type.toLowerCase();
};

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
    constructor(
        private readonly client: R2UploadClientContract = new R2UploadClient(),
        private readonly listeningUploadSessionApi: ListeningUploadSessionApi = new WorkerListeningUploadSessionApi(),
    ) {}

    createListeningUploadSession(input: {
        idempotencyKey: string;
        draftId?: string;
        testId?: string;
        revisionId?: string;
    }): Promise<ListeningUploadSessionResponse> {
        return this.listeningUploadSessionApi.createSession(input);
    }

    issueListeningUploadAsset(input: {
        idempotencyKey: string;
        uploadSessionId: string;
        fileName: string;
        declaredMimeType: string;
        sizeBytes: number;
    }): Promise<ListeningUploadAssetResponse> {
        return this.listeningUploadSessionApi.issueAsset(input);
    }

    probeListeningAuthoringAudio(input: {
        uploadSessionId: string;
        assetId: string;
    }): Promise<ListeningUploadAssetProbeResponse> {
        return this.listeningUploadSessionApi.probeAsset(input);
    }

    cancelListeningAuthoringUpload(input: {
        uploadSessionId: string;
        assetId?: string;
        reason: ListeningUploadCleanupReason;
    }): Promise<ListeningUploadCancelResponse> {
        return this.retryListeningAuthoringCleanup(input);
    }

    private async retryListeningAuthoringCleanup(input: {
        uploadSessionId: string;
        assetId?: string;
        reason: ListeningUploadCleanupReason;
    }): Promise<ListeningUploadCancelResponse> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= LISTENING_CLEANUP_CANCEL_ATTEMPTS; attempt += 1) {
            try {
                return await this.listeningUploadSessionApi.cancelSession(input);
            } catch (error) {
                lastError = error;
                if (attempt < LISTENING_CLEANUP_CANCEL_ATTEMPTS) {
                    await retrySoon();
                }
            }
        }
        throw lastError;
    }

    async uploadListeningAuthoringAudio(
        file: File,
        input: ListeningAuthoringUploadInput,
        onProgress?: UploadProgress,
        options?: UploadOptions,
    ): Promise<ListeningAuthoringUploadResult> {
        const contentType = listeningContentType(file);
        const session = await this.createListeningUploadSession({
            idempotencyKey: input.sessionIdempotencyKey,
            ...(input.draftId ? { draftId: input.draftId } : {}),
        });
        const asset = await this.issueListeningUploadAsset({
            idempotencyKey: input.assetIdempotencyKey,
            uploadSessionId: session.uploadSessionId,
            fileName: file.name,
            declaredMimeType: contentType,
            sizeBytes: file.size,
        });
        const authorization: AssetGrantUploadAuthorization = {
            assetGrant: asset.assetGrant,
            key: asset.tempKey,
            publicUrl: `${R2_PUBLIC_URL}/${asset.tempKey}`,
            contentType,
        };
        let uploaded: UploadResult;
        try {
            uploaded = await this.client.uploadWithAssetGrant(file, authorization, onProgress, options);
        } catch (error) {
            const aborted = options?.signal?.aborted
                || (error instanceof Error && 'code' in error && error.code === 'upload_aborted');
            if (aborted) {
                try {
                    await this.cancelListeningAuthoringUpload({
                        uploadSessionId: asset.uploadSessionId,
                        assetId: asset.assetId,
                        reason: 'upload-aborted',
                    });
                } catch {
                    console.warn('[r2-storage] Listening upload abort cleanup failed');
                }
            }
            throw error;
        }
        return {
            ...uploaded,
            assetId: asset.assetId,
            uploadSessionId: asset.uploadSessionId,
            tempKey: asset.tempKey,
            contentType,
            sizeBytes: file.size,
        };
    }

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
                newUrl: `${R2_PUBLIC_URL}/${tempKey}`,
                newKey: tempKey,
            };
        }
        return this.client.move(tempKey);
    }

    async moveMultipleToPermanent(tempKeys: string[]): Promise<MoveResult[]> {
        return Promise.all(tempKeys.map((key) => this.moveToPermanent(key)));
    }

    getKeyFromUrl(url: string): string | null {
        const publicPrefix = `${R2_PUBLIC_URL}/`;
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
    AssetGrantUploadAuthorization,
    ListeningUploadAssetResponse,
    ListeningUploadAssetProbeResponse,
    ListeningUploadSessionApi,
    ListeningUploadSessionResponse,
    MoveResult,
    R2UploadClientContract,
    UploadOperationKind,
    UploadProgress,
    UploadResult,
};
