// @ts-nocheck
import { getAuth } from 'firebase/auth';

import { DEFAULT_R2_UPLOAD_WORKER_URL } from './r2WorkerEndpoint';

export { DEFAULT_R2_UPLOAD_WORKER_URL };

export type UploadOperationKind =
    | 'listening_audio_temp'
    | 'test_audio_temp'
    | 'test_image_temp'
    | 'avatar_permanent'
    | 'announcement_attachment_permanent'
    | 'book_cover_permanent';

export interface UploadResult {
    url: string;
    streamUrl: string;
    directUrl: string;
    fileName: string;
    key: string;
    isTemp: boolean;
}

export interface UploadProgress {
    (percent: number, bytesUploaded: number, totalBytes: number): void;
}

export interface MoveResult {
    success: boolean;
    newUrl: string;
    newKey: string;
}

export interface R2UploadClientContract {
    upload(
        file: File,
        operationKind: UploadOperationKind,
        onProgress?: UploadProgress,
    ): Promise<UploadResult>;
    uploadWithAssetGrant(
        file: File,
        authorization: AssetGrantUploadAuthorization,
        onProgress?: UploadProgress,
    ): Promise<UploadResult>;
    move(key: string): Promise<MoveResult>;
}

export interface AssetGrantUploadAuthorization {
    assetGrant: string;
    key: string;
    publicUrl: string;
    contentType: string;
}

interface AuthorizationResponse {
    key: string;
    uploadUrl: string;
    publicUrl: string;
    moveGrant?: string;
    expiresAt: number;
}

interface UploadResponse {
    success: boolean;
    key: string;
    url: string;
}

interface MoveGrantRecord {
    moveGrant: string;
    expiresAt: number;
}

interface R2UploadClientOptions {
    endpoint?: string;
    fetch?: typeof fetch;
    getIdToken?: () => Promise<string>;
    xhrFactory?: () => XMLHttpRequest;
    now?: () => number;
}

export interface R2UploadEndpointEnv {
    readonly DEV?: boolean;
    readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

const temporaryOperations = new Set<UploadOperationKind>([
    'listening_audio_temp',
    'test_audio_temp',
    'test_image_temp',
]);

const basename = (name: string) => name.split(/[\\/]/).pop() || 'upload';

export const resolveR2UploadEndpoint = (
    env: R2UploadEndpointEnv = import.meta.env,
    _hostname?: string,
): string => {
    const override = env.VITE_R2_UPLOAD_WORKER_URL?.trim();
    if (override) return override.replace(/\/+$/, '');
    return DEFAULT_R2_UPLOAD_WORKER_URL;
};

const readJson = async <T>(response: Response): Promise<T> => {
    try {
        return await response.json() as T;
    } catch {
        throw new R2UploadClientError('invalid_response', 'Upload service returned an invalid response');
    }
};

const assertString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const readWorkerErrorCode = (responseText: string): string | undefined => {
    try {
        const body = JSON.parse(responseText) as { error?: unknown };
        return typeof body.error === 'string' && /^[a-z0-9_]{1,64}$/.test(body.error)
            ? body.error
            : undefined;
    } catch {
        return undefined;
    }
};

export class R2UploadClientError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly recoverable = false,
        public readonly status?: number,
        public readonly workerError?: string,
    ) {
        super(message);
        this.name = 'R2UploadClientError';
    }
}

const defaultGetIdToken = async (): Promise<string> => {
    const user = getAuth().currentUser;
    if (!user) {
        throw new R2UploadClientError('auth_required', 'Sign in again to upload files', true);
    }

    let token: string;
    try {
        token = await user.getIdToken();
    } catch {
        throw new R2UploadClientError('token_unavailable', 'Refresh sign-in and retry the upload', true);
    }
    if (!token) {
        throw new R2UploadClientError('token_unavailable', 'Refresh sign-in and retry the upload', true);
    }
    return token;
};

// Browser `fetch` must be invoked with the global object as its receiver. Storing a bare
// `fetch` reference and later calling it as `this.fetchImpl(...)` uses the client instance
// as the receiver, which makes real browsers throw "Illegal invocation"; the catch in
// authorize() then surfaces it as the recoverable "Upload authorization failed; retry".
// Routing the default through `globalThis.fetch(...)` keeps the global receiver while still
// letting tests inject their own fetch via options.
const defaultFetch: typeof fetch = (...args) => globalThis.fetch(...args);

export class R2UploadClient implements R2UploadClientContract {
    private readonly endpoint: string;
    private readonly fetchImpl: typeof fetch;
    private readonly getIdToken: () => Promise<string>;
    private readonly xhrFactory: () => XMLHttpRequest;
    private readonly now: () => number;
    private readonly moveGrants = new Map<string, MoveGrantRecord>();

    constructor(options: R2UploadClientOptions = {}) {
        this.endpoint = (options.endpoint?.trim() || resolveR2UploadEndpoint()).replace(/\/+$/, '');
        this.fetchImpl = options.fetch ?? defaultFetch;
        this.getIdToken = options.getIdToken ?? defaultGetIdToken;
        this.xhrFactory = options.xhrFactory ?? (() => new XMLHttpRequest());
        this.now = options.now ?? (() => Date.now());
    }

    async upload(
        file: File,
        operationKind: UploadOperationKind,
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        const authorization = await this.authorize(file, operationKind);
        const isTemp = temporaryOperations.has(operationKind);
        if (isTemp && !assertString(authorization.moveGrant)) {
            throw new R2UploadClientError(
                'move_grant_missing',
                'Upload authorization expired; request a new upload',
                true,
            );
        }

        this.assertUploadUrl(authorization.uploadUrl);
        const token = await this.requireToken();
        const uploaded = await this.putFile({
            file,
            token,
            uploadUrl: authorization.uploadUrl,
            onProgress,
        });

        if (
            uploaded.key !== authorization.key ||
            uploaded.url !== authorization.publicUrl
        ) {
            throw new R2UploadClientError(
                'invalid_upload_response',
                'Upload service returned inconsistent file details',
            );
        }

        if (isTemp && authorization.moveGrant) {
            this.moveGrants.set(uploaded.key, {
                moveGrant: authorization.moveGrant,
                expiresAt: authorization.expiresAt,
            });
        }

        return {
            url: uploaded.url,
            streamUrl: uploaded.url,
            directUrl: uploaded.url,
            fileName: basename(file.name),
            key: uploaded.key,
            isTemp,
        };
    }

    async uploadWithAssetGrant(
        file: File,
        authorization: AssetGrantUploadAuthorization,
        onProgress?: UploadProgress,
    ): Promise<UploadResult> {
        if (
            !assertString(authorization.assetGrant)
            || !assertString(authorization.key)
            || !assertString(authorization.publicUrl)
            || !assertString(authorization.contentType)
        ) {
            throw new R2UploadClientError(
                'invalid_asset_grant',
                'Upload service returned invalid asset authorization',
            );
        }

        const uploadUrl = new URL(`${this.endpoint}/upload`);
        uploadUrl.searchParams.set('assetGrant', authorization.assetGrant);
        this.assertUploadUrl(uploadUrl.toString());
        const token = await this.requireToken();
        const uploaded = await this.putFile({
            file,
            token,
            uploadUrl: uploadUrl.toString(),
            contentType: authorization.contentType,
            onProgress,
        });
        if (
            uploaded.key !== authorization.key
            || uploaded.url !== authorization.publicUrl
        ) {
            throw new R2UploadClientError(
                'invalid_upload_response',
                'Upload service returned inconsistent file details',
            );
        }

        return {
            url: uploaded.url,
            streamUrl: uploaded.url,
            directUrl: uploaded.url,
            fileName: basename(file.name),
            key: uploaded.key,
            isTemp: true,
        };
    }

    async move(key: string): Promise<MoveResult> {
        const record = this.moveGrants.get(key);
        if (!record) {
            throw new R2UploadClientError(
                'move_grant_missing',
                'Upload session expired; upload the file again',
                true,
            );
        }
        if (record.expiresAt <= this.now()) {
            this.moveGrants.delete(key);
            throw new R2UploadClientError(
                'move_grant_expired',
                'Upload session expired; upload the file again',
                true,
            );
        }

        const token = await this.requireToken();
        let response: Response;
        try {
            response = await this.fetchImpl(`${this.endpoint}/move`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ moveGrant: record.moveGrant }),
            });
        } catch {
            throw new R2UploadClientError('network_error', 'Move request failed; retry', true);
        }
        this.assertHttpSuccess(response, 'move_failed');
        const moved = await readJson<MoveResult>(response);
        if (!moved.success || !assertString(moved.newKey) || !assertString(moved.newUrl)) {
            throw new R2UploadClientError('invalid_response', 'Upload service returned an invalid move response');
        }
        this.moveGrants.delete(key);
        return moved;
    }

    private async authorize(
        file: File,
        operationKind: UploadOperationKind,
    ): Promise<AuthorizationResponse> {
        const token = await this.requireToken();
        let response: Response;
        try {
            response = await this.fetchImpl(`${this.endpoint}/upload/authorize`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    operationKind,
                    fileName: basename(file.name),
                    contentType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                }),
            });
        } catch {
            throw new R2UploadClientError('network_error', 'Upload authorization failed; retry', true);
        }
        this.assertHttpSuccess(response, 'authorization_failed');
        const authorization = await readJson<AuthorizationResponse>(response);
        if (
            !assertString(authorization.key) ||
            !assertString(authorization.uploadUrl) ||
            !assertString(authorization.publicUrl) ||
            !Number.isSafeInteger(authorization.expiresAt)
        ) {
            throw new R2UploadClientError('invalid_response', 'Upload service returned invalid authorization');
        }
        return authorization;
    }

    private async requireToken(): Promise<string> {
        try {
            const token = await this.getIdToken();
            if (!token) {
                throw new R2UploadClientError(
                    'token_unavailable',
                    'Refresh sign-in and retry the upload',
                    true,
                );
            }
            return token;
        } catch (error) {
            if (error instanceof R2UploadClientError) throw error;
            throw new R2UploadClientError(
                'token_unavailable',
                'Refresh sign-in and retry the upload',
                true,
            );
        }
    }

    private assertUploadUrl(uploadUrl: string): void {
        let parsed: URL;
        try {
            parsed = new URL(uploadUrl);
        } catch {
            throw new R2UploadClientError('invalid_upload_url', 'Upload service returned an invalid URL');
        }
        const receivedOriginPath = `${parsed.origin}${parsed.pathname}`;
        const expectedOriginPath = `${this.endpoint}/upload`;
        if (receivedOriginPath !== expectedOriginPath) {
            if (import.meta.env.DEV) {
                console.error('[r2-upload] unexpected upload URL', {
                    expectedOriginPath,
                    receivedOriginPath,
                });
            }
            throw new R2UploadClientError('invalid_upload_url', 'Upload service returned an unexpected URL');
        }
    }

    private putFile({
        file,
        token,
        uploadUrl,
        contentType,
        onProgress,
    }: {
        file: File;
        token: string;
        uploadUrl: string;
        contentType?: string;
        onProgress?: UploadProgress;
    }): Promise<UploadResponse> {
        return new Promise((resolve, reject) => {
            const xhr = this.xhrFactory();
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (!event.lengthComputable) return;
                    onProgress(
                        Math.round((event.loaded / event.total) * 100),
                        event.loaded,
                        event.total,
                    );
                });
            }
            xhr.addEventListener('load', () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                    const workerError = readWorkerErrorCode(xhr.responseText);
                    if (import.meta.env.DEV) {
                        console.error(`[r2-upload] PUT rejected ${JSON.stringify({
                            status: xhr.status,
                            workerError,
                        })}`);
                    }
                    const error = this.httpError(xhr.status, 'upload_failed');
                    reject(new R2UploadClientError(
                        error.code,
                        error.message,
                        error.recoverable,
                        xhr.status,
                        workerError,
                    ));
                    return;
                }
                try {
                    const body = JSON.parse(xhr.responseText) as UploadResponse;
                    if (!body.success || !assertString(body.key) || !assertString(body.url)) {
                        throw new Error('invalid');
                    }
                    resolve(body);
                } catch {
                    reject(new R2UploadClientError('invalid_response', 'Upload service returned an invalid response'));
                }
            });
            xhr.addEventListener('error', () => {
                reject(new R2UploadClientError('network_error', 'Upload failed; retry', true));
            });
            xhr.addEventListener('abort', () => {
                reject(new R2UploadClientError('upload_aborted', 'Upload was cancelled', true));
            });
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream');
            xhr.setRequestHeader('X-Upload-Size', String(file.size));
            xhr.send(file);
        });
    }

    private assertHttpSuccess(response: Response, code: string): void {
        if (!response.ok) throw this.httpError(response.status, code);
    }

    private httpError(status: number, code: string): R2UploadClientError {
        if (status === 401) {
            return new R2UploadClientError('auth_expired', 'Sign-in expired; refresh and retry', true);
        }
        return new R2UploadClientError(code, 'Upload service request failed', status >= 500);
    }
}

export default R2UploadClient;
