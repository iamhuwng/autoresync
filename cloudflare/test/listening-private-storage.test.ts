import { describe, expect, it, vi } from 'vitest';
import lifecycle from '../r2-lifecycle.listening-private.json';

if (!('DurableObject' in globalThis)) Object.assign(globalThis, { DurableObject: class {} });
const { createUploadWorker } = await import('../worker.js');

const fixture = () => {
  const shared = { put: vi.fn(), get: vi.fn(async () => 'public bytes') };
  const privateAudio = { put: vi.fn(), get: vi.fn(async () => 'private bytes') };
  const write = async ({ env }: any) => { await env.R2_BUCKET.put('audio', 'bytes'); return { body: { success: true } }; };
  const worker = createUploadWorker({
    bookRouter: { fetch: vi.fn(async () => null) },
    firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) },
    listeningAuthoringHandlers: { publish: write, saveDraft: write, lifecycle: write },
    listeningUploadSessionHandlers: { createSession: write, issueAsset: write, probeAsset: write },
    listeningDeliveryHandlers: { content: async ({ env }: any) => new Response(await env.R2_BUCKET.get('audio')) },
  });
  const env = { R2_BUCKET: shared, LISTENING_AUDIO_BUCKET: privateAudio,
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  return { worker, env, shared, privateAudio };
};

describe('Listening private storage composition', () => {
  it('expires only temporary audio and preserves multipart cleanup', () => {
    expect(lifecycle.rules.filter(rule => 'deleteObjectsTransition' in rule)).toEqual([{
      id: 'expire-listening-temp-after-one-day', enabled: true, conditions: { prefix: 'temp/listening/' },
      deleteObjectsTransition: { condition: { type: 'Age', maxAge: 86400 } },
    }]);
    expect(lifecycle.rules[0]).toMatchObject({ abortMultipartUploadsTransition: { condition: { maxAge: 604800 } } });
  });

  it.each(['/listening-authoring/publish', '/listening-authoring/save-draft', '/listening-authoring/lifecycle',
    '/createListeningUploadSession', '/issueListeningUploadAsset', '/probeListeningUploadAsset'])('uses private storage for %s', async path => {
    const { worker, env, shared, privateAudio } = fixture();
    const response = await worker.fetch(new Request(`https://worker.example${path}`, { method: 'POST' }), env);
    expect(response.status).toBe(200);
    expect(privateAudio.put).toHaveBeenCalledOnce();
    expect(shared.put).not.toHaveBeenCalled();
  });

  it('serves signed-content bytes from the private binding', async () => {
    const { worker, env, shared } = fixture();
    const response = await worker.fetch(new Request('https://worker.example/listening-delivery/content'), env);
    expect(await response.text()).toBe('private bytes');
    expect(shared.get).not.toHaveBeenCalled();
  });

  it.each(['/listening-delivery/content', '/upload?assetGrant=test', '/createListeningUploadSession'])('fails closed without private storage for %s', async path => {
    const { worker, env, shared } = fixture();
    const response = await worker.fetch(new Request(`https://worker.example${path}`), { ...env, LISTENING_AUDIO_BUCKET: undefined });
    expect(response.status).toBe(503);
    expect(shared.get).not.toHaveBeenCalled();
  });
});
