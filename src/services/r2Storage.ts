/**
 * Cloudflare R2 Storage Service
 * Handles file uploads to R2 bucket via Cloudflare Worker
 * 
 * SMART CLEANUP STRATEGY:
 * 1. Files are initially uploaded to `temp/` folder
 * 2. When a test is saved, files are moved to permanent folders (audio/, images/)
 * 3. A Cloudflare R2 lifecycle rule auto-deletes files in `temp/` after 24 hours
 */

const WORKER_URL = 'https://r2-upload-signer.iamhuwng.workers.dev';
const PUBLIC_URL = 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev';

interface UploadResult {
    url: string;
    streamUrl: string;
    directUrl: string;
    fileName: string;
    key: string;
    /** Whether this file is in temp storage (needs to be moved on save) */
    isTemp: boolean;
}

interface UploadProgress {
    (percent: number, bytesUploaded: number, totalBytes: number): void;
}

interface MoveResult {
    success: boolean;
    newUrl: string;
    newKey: string;
}

class R2StorageService {
    /**
     * Upload any file to R2 temp folder
     * Files in temp/ will be auto-deleted after 24 hours if not moved
     */
    async uploadFile(
        file: File,
        folder: string = 'uploads',
        onProgress?: UploadProgress
    ): Promise<UploadResult> {
        // Always upload to temp/ first for smart cleanup
        const tempFolder = `temp/${folder}`;
        const filename = `${tempFolder}/${Date.now()}-${file.name}`;

        try {
            // Step 1: Get upload URL from Worker
            console.log('📤 Requesting upload URL from R2 Worker...');
            const signResponse = await fetch(`${WORKER_URL}?filename=${encodeURIComponent(filename)}`, {
                method: 'POST',
            });

            if (!signResponse.ok) {
                throw new Error(`Failed to get upload URL: ${signResponse.statusText}`);
            }

            const { key, uploadUrl } = await signResponse.json();
            console.log('✅ Got upload URL for key:', key);

            // Step 2: Upload file directly to R2 via Worker
            console.log('📤 Uploading file to R2 temp folder...');

            const uploadPromise = new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                if (onProgress) {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            onProgress(percent, e.loaded, e.total);
                        }
                    });
                }

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error')));
                xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

                xhr.open('PUT', uploadUrl);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.send(file);
            });

            await uploadPromise;

            const publicUrl = `${PUBLIC_URL}/${key}`;
            console.log('✅ Upload complete (temp):', publicUrl);

            return {
                url: publicUrl,
                streamUrl: publicUrl,
                directUrl: publicUrl,
                fileName: file.name,
                key: key,
                isTemp: true, // Mark as temp file
            };
        } catch (error) {
            console.error('❌ R2 Upload error:', error);
            throw error;
        }
    }

    /**
     * Move a file from temp/ to permanent storage
     * Call this when a test is successfully saved
     * 
     * Handles multiple temp path patterns:
     * - New pattern: temp/audio/123-file.mp3 -> audio/123-file.mp3
     * - Legacy Worker pattern: uploads/123-temp/audio/file.mp3 -> uploads/123/audio/file.mp3
     * - Old Worker pattern: uploads/TIMESTAMP-temp/listening-audio/file.mp3 -> listening-audio/file.mp3
     * 
     * @param tempKey - The current key in temp folder
     * @returns New URL and key after moving to permanent storage
     */
    async moveToPermanent(tempKey: string): Promise<MoveResult> {
        try {
            // Determine the permanent key based on the temp pattern used
            let permanentKey: string;

            if (tempKey.startsWith('temp/')) {
                // New pattern: temp/audio/123-file.mp3 -> audio/123-file.mp3
                permanentKey = tempKey.replace(/^temp\//, '');
            } else if (tempKey.match(/^uploads\/\d+-temp\//)) {
                // Old Worker pattern: uploads/1768985083820-temp/listening-audio/file.mp3 -> listening-audio/file.mp3
                // Remove the "uploads/TIMESTAMP-temp/" prefix entirely
                permanentKey = tempKey.replace(/^uploads\/\d+-temp\//, '');
                console.log(`🔄 Converting old Worker pattern: ${tempKey} -> ${permanentKey}`);
            } else if (tempKey.includes('-temp/')) {
                // Legacy pattern: uploads/123-temp/audio/file.mp3 -> uploads/123/audio/file.mp3
                permanentKey = tempKey.replace(/-temp\//, '/');
            } else if (tempKey.includes('/temp/')) {
                // Generic temp subfolder: path/temp/file.mp3 -> path/file.mp3
                permanentKey = tempKey.replace(/\/temp\//, '/');
            } else {
                // Not a temp file, return as-is
                console.warn('⚠️ File does not appear to be in temp storage:', tempKey);
                return {
                    success: true,
                    newUrl: `${PUBLIC_URL}/${tempKey}`,
                    newKey: tempKey,
                };
            }

            console.log(`📦 Moving file from temp to permanent: ${tempKey} -> ${permanentKey}`);

            const response = await fetch(`${WORKER_URL}/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sourceKey: tempKey,
                    destKey: permanentKey,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                // If move endpoint doesn't exist (404/405), log warning but don't fail
                // The file will still work from temp location until cleanup
                if (response.status === 404 || response.status === 405) {
                    console.warn('⚠️ Move endpoint not available. File remains in temp storage:', tempKey);
                    console.warn('⚠️ Note: File may be auto-deleted after 24 hours. Consider implementing /move endpoint in Cloudflare Worker.');
                    return {
                        success: false,
                        newUrl: `${PUBLIC_URL}/${tempKey}`,
                        newKey: tempKey,
                    };
                }
                throw new Error(`Failed to move file: ${response.status} - ${errorText}`);
            }

            // Verify the response is OK (we don't need the JSON body)
            await response.json();
            const newUrl = `${PUBLIC_URL}/${permanentKey}`;

            console.log('✅ File moved to permanent storage:', newUrl);

            return {
                success: true,
                newUrl: newUrl,
                newKey: permanentKey,
            };
        } catch (error) {
            console.error('❌ Failed to move file to permanent storage:', error);
            // Don't throw - return failure result so caller can continue with temp URL
            return {
                success: false,
                newUrl: `${PUBLIC_URL}/${tempKey}`,
                newKey: tempKey,
            };
        }
    }

    /**
     * Move multiple files from temp to permanent storage
     * Used when saving a test with multiple audio files or images
     */
    async moveMultipleToPermanent(tempKeys: string[]): Promise<MoveResult[]> {
        console.log(`📦 Moving ${tempKeys.length} files to permanent storage...`);

        const results = await Promise.all(
            tempKeys.map(key => this.moveToPermanent(key))
        );

        console.log(`✅ All ${tempKeys.length} files moved to permanent storage`);
        return results;
    }

    /**
     * Extract the key from a public URL
     * Useful when you have the URL but need the key for moving
     */
    getKeyFromUrl(url: string): string | null {
        const publicPrefix = `${PUBLIC_URL}/`;
        if (!url.startsWith(publicPrefix)) {
            return null;
        }
        return url.slice(publicPrefix.length).split(/[?#]/, 1)[0] || null;
    }

    /**
     * Check if a file is in temp storage
     * Handles multiple temp path patterns:
     * - New pattern: temp/{folder}/{timestamp}-{filename}
     * - Legacy pattern: uploads/{timestamp}-temp/{folder}/{filename}
     * - Old Worker pattern: uploads/TIMESTAMP-temp/{folder}/{filename}
     * - Any path containing "-temp/" or "/temp/"
     */
    isTempFile(urlOrKey: string): boolean {
        const key = urlOrKey.includes('://') ? this.getKeyFromUrl(urlOrKey) : urlOrKey;
        if (!key) return false;

        // Check for various temp path patterns
        return (
            key.startsWith('temp/') ||           // New pattern: temp/audio/...
            key.includes('-temp/') ||            // All legacy patterns: uploads/123-temp/... or uploads/1768985083820-temp/...
            key.includes('/temp/')               // Any subfolder named temp
        );
    }

    /**
     * Upload audio file to R2 (temp folder)
     * Compatible with googleDriveService.uploadAudio interface
     */
    async uploadAudio(
        file: File,
        folderName: string = 'audio',
        onProgress?: UploadProgress
    ): Promise<UploadResult> {
        return this.uploadFile(file, folderName, onProgress);
    }

    /**
     * Replace an existing R2 audio object in place when possible.
     * First uploads continue through the normal temp upload flow.
     */
    async uploadAudioReplacement(
        file: File,
        currentUrl?: string | null,
        folderName: string = 'audio',
        onProgress?: UploadProgress
    ): Promise<UploadResult> {
        const existingKey = currentUrl ? this.getKeyFromUrl(currentUrl) : null;
        return existingKey
            ? this.uploadFileAtKey(file, existingKey, onProgress)
            : this.uploadAudio(file, folderName, onProgress);
    }

    /**
     * Upload image file to R2 (temp folder)
     * Compatible with googleDriveService.uploadImage interface
     * NOTE: This is for TEST CREATION images that need temp → permanent flow
     */
    async uploadImage(
        file: File,
        folderName: string = 'images'
    ): Promise<UploadResult> {
        return this.uploadFile(file, folderName);
    }

    /**
     * Replace an existing R2 image in place when possible.
     * External URLs and first uploads continue through the normal temp upload flow.
     */
    async uploadImageReplacement(
        file: File,
        currentUrl?: string | null,
        folderName: string = 'images'
    ): Promise<UploadResult> {
        const existingKey = currentUrl ? this.getKeyFromUrl(currentUrl) : null;
        return existingKey
            ? this.uploadFileAtKey(file, existingKey)
            : this.uploadImage(file, folderName);
    }

    /**
     * Upload file directly to PERMANENT storage (no temp folder)
     * Use this for files that should NOT be auto-deleted:
     * - User avatars
     * - Profile images
     * - Any file that should persist immediately
     * 
     * NOTE: The temp folder strategy is ONLY for test creation workflow
     * where files might be abandoned during the creation process.
     */
    async uploadFilePermanent(
        file: File,
        folder: string = 'uploads',
        onProgress?: UploadProgress
    ): Promise<UploadResult> {
        // Upload directly to permanent location (no temp/ prefix)
        const filename = `${folder}/${Date.now()}-${file.name}`;
        return this.uploadFileAtKey(file, filename, onProgress);
    }

    /**
     * Upload file directly to an exact permanent key.
     * Reusing the same key overwrites the previous R2 object and prevents orphan files.
     */
    async uploadFileAtKey(
        file: File,
        keyName: string,
        onProgress?: UploadProgress
    ): Promise<UploadResult> {
        try {
            console.log('📤 Requesting upload URL for permanent storage...');
            const signResponse = await fetch(`${WORKER_URL}?filename=${encodeURIComponent(keyName)}`, {
                method: 'POST',
            });

            if (!signResponse.ok) {
                throw new Error(`Failed to get upload URL: ${signResponse.statusText}`);
            }

            const { key, uploadUrl } = await signResponse.json();
            console.log('✅ Got upload URL for permanent key:', key);

            console.log('📤 Uploading file directly to permanent storage...');

            const uploadPromise = new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                if (onProgress) {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            onProgress(percent, e.loaded, e.total);
                        }
                    });
                }

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error')));
                xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

                xhr.open('PUT', uploadUrl);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.send(file);
            });

            await uploadPromise;

            const publicUrl = `${PUBLIC_URL}/${key}?v=${Date.now()}`;
            console.log('✅ Upload complete (permanent):', publicUrl);

            return {
                url: publicUrl,
                streamUrl: publicUrl,
                directUrl: publicUrl,
                fileName: file.name,
                key: key,
                isTemp: false, // This is permanent storage
            };
        } catch (error) {
            console.error('❌ R2 Permanent Upload error:', error);
            throw error;
        }
    }

    /**
     * Upload avatar image directly to permanent storage
     * Avatars should NOT use the temp folder strategy since they're
     * saved immediately and shouldn't be auto-deleted.
     */
    async uploadAvatar(
        file: File,
        userId?: string,
        currentUrl?: string | null
    ): Promise<UploadResult> {
        const existingKey = currentUrl ? this.getKeyFromUrl(currentUrl) : null;
        if (existingKey) {
            return this.uploadFileAtKey(file, existingKey);
        }

        if (userId) {
            return this.uploadFileAtKey(file, `avatars/${userId}/avatar`);
        }

        return this.uploadFilePermanent(file, 'avatars');
    }

    /**
     * No initialization needed for R2
     */
    async initialize(): Promise<void> {
        console.log('✅ R2 Storage ready (no initialization needed)');
    }

    /**
     * No token needed for R2
     */
    hasValidToken(): boolean {
        return true; // Always "authenticated" since Worker handles security
    }

    /**
     * No OAuth needed for R2
     */
    async requestAccessToken(): Promise<void> {
        // No-op - R2 doesn't need OAuth
    }
}

// Singleton instance
const r2StorageService = new R2StorageService();

export default r2StorageService;
export { R2StorageService };
export type { UploadResult, UploadProgress, MoveResult };
