import { describe, expect, it, vi } from 'vitest';
import {
    createExternalAudioClient, externalAudioChooserRolloutEnabled, externalAudioPrivateHomeworkOptedIn,
    externalAudioPublicListeningOptedIn, resolveExternalAudioOrigin, resolveThcsAudioOrigin,
} from './externalAudioClient';

const origin = 'http://localhost:8787';
const localQa = {
    DEV: true, VITE_EXTERNAL_AUDIO_LOCAL_QA: 'enabled', VITE_FIREBASE_LOCAL_ONLY: 'true',
    VITE_FIREBASE_PROJECT_ID: 'demo-luyentap-local', VITE_R2_UPLOAD_WORKER_URL: origin,
};
const file = { objectKey: 'scope/lesson.wav', providerVersionId: 'exact-version', contentType: 'audio/wav', sizeBytes: 100 };
const target = { connectionId: 'connection-1', objectKey: file.objectKey, providerVersionId: file.providerVersionId };

describe('external audio client boundary', () => {
    it('requires an eligible role, local profile and Worker origins, and explicit demo opt-in', () => {
        const page = 'http://localhost:5173';
        const teacher = { role: 'teacher' };
        expect(resolveExternalAudioOrigin(teacher, localQa, page)).toBe(origin);
        expect(resolveExternalAudioOrigin({ role: 'super_admin' }, localQa, page)).toBe(origin);
        for (const profile of [null, { role: 'student' }, { ...teacher, status: 'disabled' }, { ...teacher, forceReauth: true }]) {
            expect(resolveExternalAudioOrigin(profile, localQa, page)).toBeNull();
        }
        for (const override of [
            { DEV: false }, { VITE_EXTERNAL_AUDIO_LOCAL_QA: undefined }, { VITE_FIREBASE_LOCAL_ONLY: undefined },
            { VITE_FIREBASE_PROJECT_ID: 'spare' }, { VITE_R2_UPLOAD_WORKER_URL: 'https://remote.example/' },
        ]) expect(resolveExternalAudioOrigin(teacher, { ...localQa, ...override }, page)).toBeNull();
        expect(resolveExternalAudioOrigin(teacher, localQa, 'https://remote.example/')).toBeNull();
        expect(externalAudioChooserRolloutEnabled({ ...localQa, VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA: 'enabled' })).toBe(false);
        expect(externalAudioChooserRolloutEnabled({ ...localQa, VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA: 'enabled', VITE_EXTERNAL_AUDIO_UPLOAD_ROLLOUT: 'enabled' })).toBe(true);
        expect(externalAudioChooserRolloutEnabled({ ...localQa, VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA: 'enabled', VITE_EXTERNAL_AUDIO_UPLOAD_ROLLOUT: 'enabled', VITE_EXTERNAL_AUDIO_UPLOAD_ROLLBACK: 'enabled' })).toBe(false);
    });

    it('uses authenticated JSON POST, drops unexpected fields, and returns safe errors', async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ generation: 0, activeConnectionId: null, connections: [], secret: 'sentinel' }))
            .mockResolvedValueOnce(Response.json({ error: 'untrusted failure including sentinel' }, { status: 503 }))
            .mockResolvedValueOnce(Response.json({ error: 'generation_conflict', secret: 'sentinel' }, { status: 409 }));
        const token = vi.fn(async () => 'fake-id-token');
        const api = createExternalAudioClient(origin, token, fetchImpl);
        expect(await api.connections()).toEqual({ generation: 0, activeConnectionId: null, connections: [] });
        expect(fetchImpl).toHaveBeenCalledWith(`${origin}/external-audio/connections`, expect.objectContaining({
            method: 'POST', body: '{}', cache: 'no-store', redirect: 'error',
            headers: { Authorization: 'Bearer fake-id-token', 'Content-Type': 'application/json' },
        }));
        await expect(api.connections()).rejects.toThrow('External audio storage is unavailable. Try again.');
        await expect(api.revoke({ connectionId: target.connectionId, generation: 0 })).rejects.toMatchObject({ code: 'generation_conflict' });
        expect(token).toHaveBeenCalledTimes(3);
        await expect(createExternalAudioClient('https://remote.example', token, fetchImpl).connections()).rejects.toMatchObject({ code: 'store_unavailable' });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('rejects a substituted version or unsafe preview origin', async () => {
        const expiresAt = Date.now() + 120_000;
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ ...file, providerVersionId: 'wrong-version' }))
            .mockResolvedValueOnce(Response.json({ file, url: 'https://remote.example/file?versionId=exact-version', expiresAt }))
            .mockResolvedValueOnce(Response.json({
                file, url: 'https://s3.us-west-004.backblazeb2.com/bucket/file?versionId=wrong-version', expiresAt,
            }));
        const fixtureSignature = '0'.repeat(64);
        fetchImpl.mockResolvedValueOnce(Response.json({
            file, url: `${origin}/fixture/audio?versionId=exact-version&expiry=${expiresAt}&signature=${fixtureSignature}`, expiresAt,
        }));
        const api = createExternalAudioClient(origin, async () => 'fixture-token', fetchImpl);
        await expect(api.inspect(target)).rejects.toMatchObject({ code: 'object_changed' });
        await expect(api.preview(target)).rejects.toMatchObject({ code: 'object_changed' });
        await expect(api.preview(target)).rejects.toMatchObject({ code: 'object_changed' });
        await expect(api.preview(target)).rejects.toMatchObject({ code: 'object_changed' });
    });

    it('sends optional label on connect and reactivates retained accounts via select', async () => {
        const row = { id: 'conn-1', label: 'Account A', state: 'active', bucketName: 'bucket-a', prefix: '', health: 'healthy', checkedAt: 100 };
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ generation: 1, activeConnectionId: 'conn-1', connections: [row] }))
            .mockResolvedValueOnce(Response.json({ generation: 2, activeConnectionId: 'conn-1', connections: [row] }));
        const api = createExternalAudioClient(origin, async () => 'fixture-token', fetchImpl);
        const connected = await api.connect({
            applicationKeyId: 'k1', applicationKey: 's1', bucketName: 'bucket-a', prefix: '', generation: 0, label: '  Account A  ',
        });
        expect(connected.connections[0]?.label).toBe('Account A');
        expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({ label: 'Account A' });
        const selected = await api.select({ connectionId: 'conn-1', generation: 1 });
        expect(selected.activeConnectionId).toBe('conn-1');
        expect(fetchImpl.mock.calls[1]?.[0]).toBe(`${origin}/external-audio/select`);
    });

    it('enables production origins and Worker endpoint for temp-a1437 while rejecting untrusted origins', async () => {
        const prodWorker = 'https://r2-upload-signer.iamhuwng.workers.dev';
        const prodEnv = {
            DEV: false,
            VITE_FIREBASE_PROJECT_ID: 'temp-a1437',
            VITE_R2_UPLOAD_WORKER_URL: prodWorker,
            VITE_BACKUP_WORKER_URL: 'https://r2-backup-worker.iamhuwng.workers.dev',
        };
        const teacher = { role: 'teacher' };
        expect(resolveExternalAudioOrigin(teacher, prodEnv, 'https://kahut1.web.app')).toBe(prodWorker);
        expect(resolveExternalAudioOrigin(teacher, prodEnv, 'https://hocthem.net')).toBe(prodWorker);
        expect(resolveExternalAudioOrigin(teacher, prodEnv, 'https://www.hocthem.net')).toBe(prodWorker);
        expect(resolveExternalAudioOrigin(teacher, { ...prodEnv, VITE_R2_UPLOAD_WORKER_URL: undefined }, 'https://kahut1.web.app')).toBe(prodWorker);
        expect(resolveExternalAudioOrigin(teacher, prodEnv, 'http://localhost:5173')).toBeNull();
        expect(resolveExternalAudioOrigin(teacher, prodEnv, 'https://evil.example')).toBeNull();
        expect(resolveExternalAudioOrigin(teacher, { ...prodEnv, VITE_R2_UPLOAD_WORKER_URL: 'https://evil.example' }, 'https://kahut1.web.app')).toBeNull();
        expect(resolveThcsAudioOrigin(prodEnv, 'https://kahut1.web.app')).toBe(prodWorker);
        expect(externalAudioChooserRolloutEnabled(prodEnv)).toBe(true);
        expect(externalAudioChooserRolloutEnabled({ ...prodEnv, VITE_EXTERNAL_AUDIO_UPLOAD_ROLLBACK: 'enabled' })).toBe(false);
        expect(externalAudioPrivateHomeworkOptedIn(prodEnv)).toBe(true);
        expect(externalAudioPublicListeningOptedIn(prodEnv)).toBe(true);

        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ generation: 0, activeConnectionId: null, connections: [] }));
        const api = createExternalAudioClient(prodWorker, async () => 'prod-token', fetchImpl);
        expect(await api.connections()).toEqual({ generation: 0, activeConnectionId: null, connections: [] });
        expect(fetchImpl).toHaveBeenCalledWith(`${prodWorker}/external-audio/connections`, expect.any(Object));

        // Verify client accepts Cloudflare edge-cached audio proxy URLs (audio.hocthem.net)
        const expiresAt = Date.now() + 120_000;
        const proxyFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
            file,
            url: `https://audio.hocthem.net/external-audio/content?versionId=${file.providerVersionId}&token=signed.hmac`,
            expiresAt,
        }));
        const proxyApi = createExternalAudioClient(prodWorker, async () => 'prod-token', proxyFetch);
        const previewRes = await proxyApi.preview(target);
        expect(previewRes.url).toContain('https://audio.hocthem.net/external-audio/content?');
    });
});
