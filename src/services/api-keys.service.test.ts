import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ currentUser: { uid: 'admin-1', getIdToken: vi.fn(async () => 'id-token') } }));
vi.mock('firebase/auth', () => ({ getAuth: () => auth }));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_THCS_GEMMA_WORKER_URL', 'https://worker.example');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('reads only opaque IDs and sends the Firebase token to the Worker', async () => {
  fetchMock.mockResolvedValue(Response.json({ keys: [{ id: 'key-id', provider: 'groq' }] }));
  const { getActiveKeyIds } = await import('./api-keys.service');
  await expect(getActiveKeyIds('groq')).resolves.toEqual(['key-id']);
  expect(fetchMock).toHaveBeenCalledWith('https://worker.example/ai/keys', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
  }));
});

it('sends a new key to the Worker without retaining its value in the client inventory', async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ key: { id: 'key-id', provider: 'gemini', label: 'Primary' } }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ keys: [{ id: 'key-id', provider: 'gemini' }] }));
  const { addAPIKey, getAPIKeys } = await import('./api-keys.service');
  await addAPIKey('gemini', 'Primary', 'provider-secret-value');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ provider: 'gemini', label: 'Primary', key: 'provider-secret-value' });
  expect(await getAPIKeys()).toEqual(expect.objectContaining({ gemini: expect.objectContaining({ 'key-id': expect.not.objectContaining({ key: expect.anything() }) }) }));
});

it('updates and removes Worker keys using authenticated metadata requests', async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ key: { id: 'key-id', isActive: false } }))
    .mockResolvedValueOnce(Response.json({ keys: [] }))
    .mockResolvedValueOnce(Response.json({ removed: true }))
    .mockResolvedValueOnce(Response.json({ keys: [] }));
  const { updateAPIKey, deleteAPIKey } = await import('./api-keys.service');
  await updateAPIKey('key-id', false);
  await deleteAPIKey('key-id');

  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://worker.example/ai/keys/key-id');
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH', headers: { Authorization: 'Bearer id-token' } });
  expect(fetchMock.mock.calls[2]?.[0]).toBe('https://worker.example/ai/keys/key-id');
  expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer id-token' } });
});
