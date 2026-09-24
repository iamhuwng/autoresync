import { beforeEach, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({
    create: vi.fn(),
    gemini: vi.fn(),
    cloudflareFetch: vi.fn(),
    bench: vi.fn(),
    keys: [] as string[],
    response: null as string | null,
    aiText: null as string | null,
}));

vi.mock('groq-sdk', () => ({
    default: class {
        chat = { completions: { create: probe.create } };
        constructor(options: { apiKey: string }) { probe.keys.push(options.apiKey); }
    },
}));
vi.mock('../../config/env.config', () => ({ getEnv: () => ({}) }));
vi.mock('../api-keys.service', () => ({ getDecryptedKeys: async () => ['groq-one', 'groq-two'] }));
vi.mock('../key-cooldown.service', () => ({
    benchKey: probe.bench,
    filterBenchedKeys: (keys: string[]) => keys,
    shouldBenchGeminiKeyError: () => false,
}));
vi.mock('../ai/gemini-key-rotation.service', () => ({ executeGeminiWithKeyRotation: probe.gemini }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { getIdToken: async () => 'firebase-token' } }) }));
vi.mock('./thcs-pass1-restructure', () => ({
    executePass1: async (text: string, _session: unknown, callAI: (system: string, prompt: string) => Promise<string | null>) => {
        probe.response = await callAI('system', 'prompt');
        return { confidence: 80, restructuredText: probe.aiText ?? text, stats: null, hasInferredAnswers: false };
    },
}));

import { parseThcsText } from './thcsDocumentParser.service';

beforeEach(() => {
    probe.create.mockReset();
    probe.gemini.mockReset();
    probe.cloudflareFetch.mockReset();
    probe.cloudflareFetch.mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', probe.cloudflareFetch);
    probe.bench.mockReset();
    probe.keys.length = 0;
    probe.response = null;
    probe.aiText = null;
    probe.gemini.mockResolvedValue({ success: true, value: 'Gemini fallback text' });
});

it('does not try every Groq key when the model is unavailable', async () => {
    probe.create.mockRejectedValue(new Error('404 {"error":{"message":"The model does not exist or you do not have access to it.","code":"model_not_found"}}'));

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledOnce();
    expect(probe.create.mock.calls[0]?.[0].model).toBe('qwen/qwen3.8-27b');
    expect(probe.create.mock.calls[0]?.[0].reasoning_effort).toBe('none');
    expect(probe.gemini).toHaveBeenCalledOnce();
    expect(probe.cloudflareFetch).toHaveBeenCalledOnce();
    expect(probe.bench).not.toHaveBeenCalled();
    expect(probe.response).toBe('Gemini fallback text');
});

it('uses Cloudflare Gemma after Groq fails, before Gemini', async () => {
    probe.create.mockRejectedValue(new Error('413 Request too large on input tokens per minute (ITPM): Limit 7000, Requested 8940'));
    probe.cloudflareFetch.mockResolvedValue({ ok: true, json: async () => ({ text: 'Cloudflare restructured THCS text.' }) });

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledOnce();
    expect(probe.cloudflareFetch).toHaveBeenCalledOnce();
    expect(probe.cloudflareFetch.mock.calls[0]?.[0]).toBe('https://thcs-gemma.iamhuwng.workers.dev/thcs/gemma');
    expect(probe.gemini).not.toHaveBeenCalled();
    expect(probe.response).toBe('Cloudflare restructured THCS text.');
});

it('continues to the next key when only one Groq key is invalid', async () => {
    probe.create
        .mockRejectedValueOnce(new Error('401 {"error":{"code":"invalid_api_key"}}'))
        .mockResolvedValueOnce({ choices: [{ message: { content: 'Restructured THCS text is available.' } }] });

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledTimes(2);
    expect(probe.gemini).not.toHaveBeenCalled();
    expect(probe.response).toBe('Restructured THCS text is available.');
});

it('reduces an oversized Groq request on the same key before rotating', async () => {
    probe.create
        .mockRejectedValueOnce(new Error('429 tokens per minute (TPM): Limit 8000, Used 0, Requested 9000'))
        .mockResolvedValueOnce({ choices: [{ message: { content: 'Restructured THCS text is available.' } }] });

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledTimes(2);
    expect(probe.keys).toEqual(['groq-one']);
    expect(probe.create.mock.calls[1]?.[0].max_tokens).toBeLessThan(probe.create.mock.calls[0]?.[0].max_tokens);
    expect(probe.bench).not.toHaveBeenCalled();
    expect(probe.gemini).not.toHaveBeenCalled();
});

it('falls back after one input-token 413 instead of retrying output budgets', async () => {
    probe.create.mockRejectedValue(new Error('413 Request too large on input tokens per minute (ITPM): Limit 7000, Requested 8940'));

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledOnce();
    expect(probe.keys).toEqual(['groq-one']);
    expect(probe.gemini).toHaveBeenCalledOnce();
    expect(probe.bench).not.toHaveBeenCalled();
});

it('restores answer rows that AI omitted from the original key', async () => {
    const source = 'TITLE: English Test\nGRADE: 8\nI. GRAMMAR [TYPE: mcq-grammar]\nQuestion 1. Choose A.\nA. yes\nB. no\nQuestion 2. Choose B.\nA. no\nB. yes\nANSWER KEY\n1. A\n2. B';
    probe.aiText = source.replace('1. A\n2. B', '1. A');
    probe.create.mockResolvedValue({ choices: [{ message: { content: 'Restructured THCS text is available.' } }] });

    const result = await parseThcsText(source);

    expect(result.success).toBe(true);
    expect(result.data?.answerKey).toMatchObject({ 1: 'A', 2: 'B' });
    expect(result.data?.sections.flatMap(section => section.questions).find(question => question.questionNumber === 2)?.correctAnswer).toBe('B');
});

it('rotates keys when a Groq rate limit is temporary', async () => {
    probe.create
        .mockRejectedValueOnce(new Error('429 tokens per minute (TPM): Limit 8000, Used 7900, Requested 1000'))
        .mockResolvedValueOnce({ choices: [{ message: { content: 'Restructured THCS text is available.' } }] });

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledTimes(2);
    expect(probe.keys).toEqual(['groq-one', 'groq-two']);
    expect(probe.bench).toHaveBeenCalledOnce();
    expect(probe.gemini).not.toHaveBeenCalled();
});

it('falls back instead of accepting a truncated Groq restructure', async () => {
    probe.create.mockResolvedValue({
        choices: [{ finish_reason: 'length', message: { content: 'Question 1. Partial output...' } }],
    });

    await parseThcsText('TITLE: English Test\nGRADE: 8\nPart A [TYPE: mcq-grammar]\nQuestion 1. Choose the best answer.');

    expect(probe.create).toHaveBeenCalledOnce();
    expect(probe.gemini).toHaveBeenCalledOnce();
    expect(probe.response).toBe('Gemini fallback text');
});
