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
