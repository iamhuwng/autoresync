import { afterEach, expect, it, vi } from 'vitest';
import { createThcsGemmaWorker } from '../thcs-gemma-worker.js';

const makeWorker = () => createThcsGemmaWorker({
  firebaseVerifier: {
    verifyAuthorizationHeader: async (header: string | null) =>
      header === 'Bearer valid-token' ? { valid: true, uid: 'teacher-1' } : { valid: false },
  },
});

const makeRequest = (token = 'valid-token') => new Request('https://worker.example/thcs/gemma', {
  method: 'POST',
  headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ systemMessage: 'Restructure this test.', prompt: 'Question 1. Choose A.', temperature: 0.1 }),
});

const aiRun = vi.fn();
const env = {
  FIREBASE_DB_URL: 'https://example.firebaseio.test',
  AI: { run: aiRun },
  THCS_RATE_LIMITER: { limit: async () => ({ success: true }) },
};

afterEach(() => {
  vi.unstubAllGlobals();
  aiRun.mockReset();
});

it('allows browser preflight for AI key management methods', async () => {
  const worker = makeWorker();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await worker.fetch(new Request('https://worker.example/ai/keys', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain(method);
  }
});

it('allows a teacher and sends a bounded, non-thinking Gemma request', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ role: 'teacher', status: 'active' })));
  aiRun.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'Restructured test text.' } }] });

  const response = await makeWorker().fetch(makeRequest(), env);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'Restructured test text.' });
  expect(aiRun).toHaveBeenCalledWith('@cf/google/gemma-4-26b-a4b-it', expect.objectContaining({
    chat_template_kwargs: { enable_thinking: false },
    max_completion_tokens: 16_384,
  }));
});

it('denies a student before using the AI allowance', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ role: 'student', status: 'active' })));

  const response = await makeWorker().fetch(makeRequest(), env);

  expect(response.status).toBe(403);
  expect(aiRun).not.toHaveBeenCalled();
});

it('rejects a truncated model reply so the browser can fall back to Gemini', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ role: 'teacher', status: 'active' })));
  aiRun.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: 'Partial test...' } }] });

  const response = await makeWorker().fetch(makeRequest(), env);

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'ai_incomplete' });
});

it('keeps provider keys in KV and sends them only to the provider', async () => {
  const records = new Map<string, { value: string; metadata: Record<string, unknown> }>();
  const aiEnv = {
    ...env,
    AI_KEYS: {
      list: async () => ({ list_complete: true, keys: [...records.values()].map(({ metadata }) => ({ metadata })) }),
      get: async (key: string) => JSON.parse(records.get(key)?.value ?? 'null'),
      put: async (key: string, value: string, options: { metadata: Record<string, unknown> }) => {
        records.set(key, { value, metadata: options.metadata });
      },
      delete: async (key: string) => { records.delete(key); },
    },
  };
  const upstream = vi.fn(async (request: RequestInfo | URL, options?: RequestInit) => {
    if (String(request).includes('firebase')) return Response.json({ role: 'super_admin', status: 'active' });
    expect(options?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer groq-secret-value' }));
    return Response.json({ choices: [{ message: { content: 'Result' } }] });
  });
  vi.stubGlobal('fetch', upstream);
  const worker = makeWorker();
  const baseHeaders = { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' };
  const add = await worker.fetch(new Request('https://worker.example/ai/keys', {
    method: 'POST', headers: baseHeaders,
    body: JSON.stringify({ provider: 'groq', label: 'Primary', key: 'groq-secret-value' }),
  }), aiEnv);
  expect(add.status).toBe(201);
  const added = await add.json() as { key: { id: string } };
  expect(JSON.stringify(added)).not.toContain('groq-secret-value');

  const list = await worker.fetch(new Request('https://worker.example/ai/keys', { headers: baseHeaders }), aiEnv);
  expect(JSON.stringify(await list.json())).not.toContain('groq-secret-value');

  const completion = await worker.fetch(new Request('https://worker.example/ai/groq', {
    method: 'POST', headers: baseHeaders,
    body: JSON.stringify({ keyId: added.key.id, request: { model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Hello' }] } }),
  }), aiEnv);
  expect(completion.status).toBe(200);
  expect(await completion.json()).toEqual({ choices: [{ message: { content: 'Result' } }] });
});

it('routes Gemini through the authenticated US relay without a direct fallback', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const key = 'gemini-provider-secret';
  const relay = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
    Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Done' }] } }] }));
  const fetchMock = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).includes('firebase')) return Response.json({ role: 'teacher', status: 'active' });
    return relay(url, options);
  });
  vi.stubGlobal('fetch', fetchMock);
  const aiEnv = {
    ...env,
    GEMINI_RELAY_TOKEN: 'relay-secret',
    AI_KEYS: { get: async () => ({ id, provider: 'gemini', key, isActive: true }) },
  };
  const request = () => new Request('https://worker.example/ai/gemini', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: id, model: 'gemini-2.5-flash', prompt: 'Hello', generationConfig: { temperature: 0.2 } }),
  });

  const response = await makeWorker().fetch(request(), aiEnv);
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain(key);
  expect(relay).toHaveBeenCalledWith('https://gemini-us-relay.hocthem.deno.net/generateContent', expect.objectContaining({
    headers: {
      Authorization: 'Bearer relay-secret',
      'X-Provider-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }], generationConfig: { temperature: 0.2 } }),
  }));

  relay.mockClear();
  const unavailable = await makeWorker().fetch(request(), { ...aiEnv, GEMINI_RELAY_TOKEN: undefined });
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ error: 'ai_unavailable' });
  expect(relay).not.toHaveBeenCalled();

  relay.mockImplementation(async () => Response.json({ error: `${key} relay-secret quota exceeded` }, { status: 429 }));
  const quota = await makeWorker().fetch(request(), aiEnv);
  expect(quota.status).toBe(429);
  expect(await quota.json()).toEqual({ error: '{"error":"[redacted] [redacted] quota exceeded"}' });
  expect(relay).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('generativelanguage'))).toBe(true);
});

it('returns a distinct 429 error for per-user AI throttling', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ role: 'teacher', status: 'active' })));
  const throttledEnv = {
    ...env,
    THCS_RATE_LIMITER: { limit: async () => ({ success: false }) },
    AI_KEYS: { get: vi.fn() },
  };

  const response = await makeWorker().fetch(new Request('https://worker.example/ai/groq', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: '11111111-1111-4111-8111-111111111111', request: { model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Hello' }] } }),
  }), throttledEnv);

  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: 'rate_limited' });
  expect(throttledEnv.AI_KEYS.get).not.toHaveBeenCalled();
});

it('rejects unsupported enterprise-only models before reading a provider key', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ role: 'teacher', status: 'active' })));
  const keys = { get: vi.fn() };
  const response = await makeWorker().fetch(new Request('https://worker.example/ai/groq', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: '11111111-1111-4111-8111-111111111111', request: {
      model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Hello' }],
    } }),
  }), { ...env, AI_KEYS: keys });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'model_not_allowed' });
  expect(keys.get).not.toHaveBeenCalled();
});

it('denies key management to teachers and rejects disabled keys', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const entry = { id, provider: 'gemini', label: 'Test', key: 'hidden-gemini-key', isActive: false };
  const upstream = vi.fn(async () => Response.json({ role: 'teacher', status: 'active' }));
  vi.stubGlobal('fetch', upstream);
  const aiEnv = {
    ...env,
    AI_KEYS: {
      list: async () => ({ list_complete: true, keys: [{ metadata: { id, provider: 'gemini', label: 'Test', isActive: false } }] }),
      get: async () => entry,
    },
  };
  const worker = makeWorker();
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' };
  const denied = await worker.fetch(new Request('https://worker.example/ai/keys', {
    method: 'POST', headers, body: JSON.stringify({ provider: 'gemini', label: 'Other', key: 'another-hidden-key' }),
  }), aiEnv);
  expect(denied.status).toBe(403);

  const list = await worker.fetch(new Request('https://worker.example/ai/keys', { headers }), aiEnv);
  expect(await list.json()).toEqual({ keys: [] });

  const completion = await worker.fetch(new Request('https://worker.example/ai/gemini', {
    method: 'POST', headers,
    body: JSON.stringify({ keyId: id, model: 'gemini-2.5-flash', prompt: 'Hello' }),
  }), aiEnv);
  expect(completion.status).toBe(404);
  expect(upstream).toHaveBeenCalledTimes(3);
});
