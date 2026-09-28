import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Groq, { GoogleGenerativeAI } from './browser-provider-clients';

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => 'firebase-token' } }),
}));
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_THCS_GEMMA_WORKER_URL', 'https://worker.example/');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('preserves Gemini structured-generation options and response metadata through the Worker', async () => {
  const reply = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 12 } };
  fetchMock.mockResolvedValue(Response.json(reply));
  const options = { model: 'gemini-2.5-flash', systemInstruction: 'Preserve answers', generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 } };
  const prompt = [{ text: 'Question 1' }];
  const result = await new GoogleGenerativeAI('opaque-key-id').getGenerativeModel(options).generateContent(prompt);
  expect(fetchMock).toHaveBeenCalledWith('https://worker.example/ai/gemini', expect.objectContaining({
    headers: { Authorization: 'Bearer firebase-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: 'opaque-key-id', ...options, prompt }),
  }));
  expect(result.response.text()).toBe('{"ok":true}');
  expect(result.response.candidates).toEqual(reply.candidates);
  expect(result.response.usageMetadata).toEqual(reply.usageMetadata);
});

it('preserves Groq request options and quota errors without a direct-provider fallback', async () => {
  const request = { model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Grade this' }], response_format: { type: 'json_object' }, reasoning_effort: 'none' };
  fetchMock.mockResolvedValue(Response.json({ error: 'quota exhausted' }, { status: 429 }));
  await expect(new Groq({ apiKey: 'opaque-key-id' }).chat.completions.create(request)).rejects.toThrow('429 quota exhausted');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://worker.example/ai/groq', expect.objectContaining({
    body: JSON.stringify({ keyId: 'opaque-key-id', request }),
  }));
});

it('labels Worker user throttling separately from provider quota errors', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'rate_limited' }, { status: 429 }));
  await expect(new Groq({ apiKey: 'opaque-key-id' }).chat.completions.create({
    model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Grade this' }],
  })).rejects.toThrow('429 user_rate_limited');
});

it.each([
  [401, 'Unauthorized', 'user_unauthorized'],
  [403, 'account_disabled', 'user_account_disabled'],
])('labels Worker user access failure %s separately from provider key errors', async (status, error, code) => {
  fetchMock.mockResolvedValue(Response.json({ error }, { status }));
  await expect(new Groq({ apiKey: 'opaque-key-id' }).chat.completions.create({
    model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Grade this' }],
  })).rejects.toThrow(`${status} ${code}`);
});
