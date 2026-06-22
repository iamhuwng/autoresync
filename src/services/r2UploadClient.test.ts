import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAuth = vi.hoisted(() => ({
    currentUser: null as null | { getIdToken: () => Promise<string> },
}));

vi.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: firebaseAuth.currentUser }),
}));

import {
    DEFAULT_R2_UPLOAD_WORKER_URL,
    R2UploadClient,
    R2UploadClientError,
    type UploadOperationKind,
} from './r2UploadClient';

type Listener = (event: ProgressEvent) => void;

class FakeXMLHttpRequest {
    static instances: FakeXMLHttpRequest[] = [];
    static responses: Array<{ status: number; body: unknown; statusText?: string }> = [];

    method = '';
    url = '';
    status = 0;
    statusText = '';
    responseText = '';
    body: Document | XMLHttpRequestBodyInit | null = null;
    headers = new Map<string, string>();
    listeners = new Map<string, Listener>();
    uploadListeners = new Map<string, Listener>();
    upload = {
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
            this.uploadListeners.set(type, listener as Listener);
        },
    };

    constructor() {
        FakeXMLHttpRequest.instances.push(this);
    }

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(name: string, value: string) {
        this.headers.set(name, value);
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        this.listeners.set(type, listener as Listener);
    }

    send(body: Document | XMLHttpRequestBodyInit | null) {
        this.body = body;
        const response = FakeXMLHttpRequest.responses.shift();
        if (!response) throw new Error('Missing fake XHR response');
        this.status = response.status;
        this.statusText = response.statusText ?? '';
        this.responseText = JSON.stringify(response.body);
        const total = body instanceof Blob ? body.size : 0;
        this.uploadListeners.get('progress')?.({ lengthComputable: true, loaded: total, total } as ProgressEvent);
        queueMicrotask(() => this.listeners.get('load')?.({} as ProgressEvent));
    }
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

const authorization = (endpoint: string, overrides: Record<string, unknown> = {}) => ({
    key: 'temp/audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
    uploadUrl: `${endpoint}/upload?grant=upload-grant-sentinel`,
    publicUrl: 'https://pub.example/temp/audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
    moveGrant: 'move-grant-sentinel',
    expiresAt: 2_000,
    ...overrides,
});

const uploadResponse = {
    success: true,
    key: 'temp/audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
    url: 'https://pub.example/temp/audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
};

const makeClient = ({
    endpoint = 'https://canary.example.test',
    now = (() => 1_000) as () => number,
    fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint))),
    getIdToken = vi.fn().mockResolvedValue('firebase-token-sentinel'),
} = {}) => new R2UploadClient({
    endpoint,
    now,
    fetch: fetchImpl as typeof fetch,
    getIdToken,
    xhrFactory: () => new FakeXMLHttpRequest() as unknown as XMLHttpRequest,
});

beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    FakeXMLHttpRequest.responses = [];
    firebaseAuth.currentUser = null;
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('R2UploadClient authenticated grant flow', () => {
    it('sends Authorization on authorize, PUT, and move without raw move keys', async () => {
        const endpoint = 'https://canary.example.test';
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(jsonResponse(authorization(endpoint)))
            .mockResolvedValueOnce(jsonResponse({
                success: true,
                newKey: 'audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
                newUrl: 'https://pub.example/audio/owner-a/0123456789abcdef0123456789abcdef-lesson.mp3',
            }));
        const getIdToken = vi.fn().mockResolvedValue('firebase-token-sentinel');
        const client = makeClient({ endpoint, fetchImpl, getIdToken });
        const file = new File(['audio'], 'lesson.mp3', { type: 'audio/mpeg' });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        const uploaded = await client.upload(file, 'test_audio_temp');
        await client.move(uploaded.key);

        expect(fetchImpl).toHaveBeenNthCalledWith(1, `${endpoint}/upload/authorize`, expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ Authorization: 'Bearer firebase-token-sentinel' }),
        }));
        const xhr = FakeXMLHttpRequest.instances[0];
        expect(xhr.method).toBe('PUT');
        expect(xhr.headers.get('Authorization')).toBe('Bearer firebase-token-sentinel');
        expect(fetchImpl).toHaveBeenNthCalledWith(2, `${endpoint}/move`, expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ Authorization: 'Bearer firebase-token-sentinel' }),
        }));
        expect(JSON.parse(String((fetchImpl.mock.calls[1][1] as RequestInit).body))).toEqual({
            moveGrant: 'move-grant-sentinel',
        });
        expect(getIdToken).toHaveBeenCalledTimes(3);
    });

    it.each([
        'listening_audio_temp',
        'test_audio_temp',
        'test_image_temp',
        'avatar_permanent',
        'announcement_attachment_permanent',
        'book_cover_permanent',
    ] satisfies UploadOperationKind[])('sends approved operation kind %s', async (operationKind) => {
        const endpoint = 'https://canary.example.test';
        const isTemp = operationKind.endsWith('_temp');
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint, {
            key: isTemp ? uploadResponse.key : `permanent/owner-a/${operationKind}`,
            moveGrant: isTemp ? 'move-grant-sentinel' : undefined,
        })));
        const client = makeClient({ endpoint, fetchImpl });
        FakeXMLHttpRequest.responses.push({ status: 200, body: {
            ...uploadResponse,
            key: isTemp ? uploadResponse.key : `permanent/owner-a/${operationKind}`,
        } });

        await client.upload(new File(['x'], 'asset.bin', { type: 'application/octet-stream' }), operationKind);

        const requestBody = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
        expect(requestBody.operationKind).toBe(operationKind);
    });

    it('sends basename, content type, and size without an authoritative raw path', async () => {
        const endpoint = 'https://canary.example.test';
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint)));
        const client = makeClient({ endpoint, fetchImpl });
        const file = new File(['audio-body'], '..\\teacher\\lesson.mp3', { type: 'audio/mpeg' });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        await client.upload(file, 'listening_audio_temp');

        const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
        expect(body).toEqual({
            operationKind: 'listening_audio_temp',
            fileName: 'lesson.mp3',
            contentType: 'audio/mpeg',
            sizeBytes: 10,
        });
        expect(body).not.toHaveProperty('key');
        expect(body).not.toHaveProperty('filename');
        expect(body).not.toHaveProperty('sourceKey');
        expect(body).not.toHaveProperty('destKey');
    });

    it('returns exact UploadResult and progress compatibility from Worker output', async () => {
        const endpoint = 'https://canary.example.test';
        const client = makeClient({ endpoint });
        const progress = vi.fn();
        const file = new File(['audio'], 'lesson.mp3', { type: 'audio/mpeg' });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        await expect(client.upload(file, 'test_audio_temp', progress)).resolves.toEqual({
            url: uploadResponse.url,
            streamUrl: uploadResponse.url,
            directUrl: uploadResponse.url,
            fileName: 'lesson.mp3',
            key: uploadResponse.key,
            isTemp: true,
        });
        expect(progress).toHaveBeenCalledWith(100, file.size, file.size);
    });

    it('uses configured canary endpoint for authorize, PUT, and move', async () => {
        const endpoint = 'https://canary.example.test/base/';
        const normalizedEndpoint = 'https://canary.example.test/base';
        vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', endpoint);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(jsonResponse(authorization(normalizedEndpoint)))
            .mockResolvedValueOnce(jsonResponse({ success: true, newKey: 'audio/server.mp3', newUrl: 'https://pub.example/audio/server.mp3' }));
        const client = new R2UploadClient({
            fetch: fetchImpl as typeof fetch,
            getIdToken: vi.fn().mockResolvedValue('firebase-token-sentinel'),
            xhrFactory: () => new FakeXMLHttpRequest() as unknown as XMLHttpRequest,
            now: () => 1_000,
        });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        const uploaded = await client.upload(new File(['audio'], 'lesson.mp3', { type: 'audio/mpeg' }), 'test_audio_temp');
        await client.move(uploaded.key);

        expect(fetchImpl.mock.calls[0][0]).toBe(`${normalizedEndpoint}/upload/authorize`);
        expect(FakeXMLHttpRequest.instances[0].url).toBe(`${normalizedEndpoint}/upload?grant=upload-grant-sentinel`);
        expect(fetchImpl.mock.calls[1][0]).toBe(`${normalizedEndpoint}/move`);
    });

    it('uses production endpoint when VITE_R2_UPLOAD_WORKER_URL is absent', async () => {
        vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', '');
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(DEFAULT_R2_UPLOAD_WORKER_URL)));
        const client = new R2UploadClient({
            fetch: fetchImpl as typeof fetch,
            getIdToken: vi.fn().mockResolvedValue('firebase-token-sentinel'),
            xhrFactory: () => new FakeXMLHttpRequest() as unknown as XMLHttpRequest,
        });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        await client.upload(new File(['audio'], 'lesson.mp3', { type: 'audio/mpeg' }), 'test_audio_temp');

        expect(fetchImpl.mock.calls[0][0]).toBe(`${DEFAULT_R2_UPLOAD_WORKER_URL}/upload/authorize`);
    });

    it.each([
        ['missing user', null, 'auth_required'],
        ['missing token', { getIdToken: vi.fn().mockResolvedValue('') }, 'token_unavailable'],
    ])('fails recoverably for %s', async (_label, currentUser, code) => {
        firebaseAuth.currentUser = currentUser;
        const client = new R2UploadClient({
            fetch: vi.fn() as typeof fetch,
            xhrFactory: () => new FakeXMLHttpRequest() as unknown as XMLHttpRequest,
        });

        const promise = client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp');

        await expect(promise).rejects.toMatchObject({ code, recoverable: true });
    });

    it('fails recoverably when authorization omits a move grant', async () => {
        const endpoint = 'https://canary.example.test';
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint, { moveGrant: undefined })));
        const client = makeClient({ endpoint, fetchImpl });

        await expect(client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp'))
            .rejects.toMatchObject({ code: 'move_grant_missing', recoverable: true });
        expect(FakeXMLHttpRequest.instances).toHaveLength(0);
    });

    it('fails expired move grant without any raw-key fallback request', async () => {
        const endpoint = 'https://canary.example.test';
        let now = 1_000;
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint)));
        const client = makeClient({ endpoint, fetchImpl, now: () => now });
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });
        const uploaded = await client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp');
        now = 2_001;

        await expect(client.move(uploaded.key))
            .rejects.toMatchObject({ code: 'move_grant_expired', recoverable: true });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('fails missing move grant association without network or raw-key fallback', async () => {
        const fetchImpl = vi.fn();
        const client = makeClient({ fetchImpl });

        await expect(client.move('temp/audio/browser-selected.mp3'))
            .rejects.toMatchObject({ code: 'move_grant_missing', recoverable: true });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('rejects an upload URL outside configured Worker endpoint', async () => {
        const endpoint = 'https://canary.example.test';
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(authorization(endpoint, {
            uploadUrl: 'https://wrong.example.test/upload?grant=sentinel',
        })));
        const client = makeClient({ endpoint, fetchImpl });

        await expect(client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp'))
            .rejects.toMatchObject({ code: 'invalid_upload_url' });
        expect(FakeXMLHttpRequest.instances).toHaveLength(0);
    });

    it('does not write or log tokens, grants, or keys', async () => {
        const endpoint = 'https://canary.example.test';
        const client = makeClient({ endpoint });
        const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
        const indexedDbOpen = vi.fn();
        vi.stubGlobal('indexedDB', { open: indexedDbOpen });
        const logSpies = [
            vi.spyOn(console, 'log'),
            vi.spyOn(console, 'warn'),
            vi.spyOn(console, 'error'),
        ];
        FakeXMLHttpRequest.responses.push({ status: 200, body: uploadResponse });

        await client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp');

        expect(localStorageSpy).not.toHaveBeenCalled();
        expect(indexedDbOpen).not.toHaveBeenCalled();
        for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
    });

    it('marks Worker auth rejection as recoverable without leaking response text', async () => {
        const endpoint = 'https://canary.example.test';
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized token-sentinel' }, 401));
        const client = makeClient({ endpoint, fetchImpl });

        const error = await client.upload(new File(['x'], 'asset.bin'), 'test_audio_temp').catch((reason) => reason);

        expect(error).toBeInstanceOf(R2UploadClientError);
        expect(error).toMatchObject({ code: 'auth_expired', recoverable: true });
        expect(error.message).not.toContain('token-sentinel');
    });
});
