import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-status.service', () => ({
  invalidateAIStatusCache: vi.fn(),
}));

async function loadService() {
  vi.resetModules();
  return import('./key-cooldown.service');
}

describe('key-cooldown.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T00:00:00Z'));
  });

  it('benches forbidden Gemini keys for a long cooldown through the shared registry', async () => {
    const service = await loadService();
    const key = 'gemini-key-1234567890';

    service.benchKey(key, 'gemini', '403 Forbidden');

    const [entry] = service.getCooldownStatus();
    expect(entry?.remainingSeconds).toBeGreaterThanOrEqual(86_399);
    expect(service.isKeyBenched(key)).toBe(true);

    vi.advanceTimersByTime(86_400_000);
    expect(service.isKeyBenched(key)).toBe(false);
  });

  it('parses Gemini retryDelay values into the shared cooldown registry', async () => {
    const service = await loadService();
    const key = 'gemini-key-retry-123456';

    service.benchKey(key, 'gemini', '{"retryDelay":"49s"}');

    const [entry] = service.getCooldownStatus();
    expect(entry?.remainingSeconds).toBe(54);
  });

  it('classifies forbidden and rate-limit Gemini failures as bench-worthy', async () => {
    const service = await loadService();

    expect(service.shouldBenchGeminiKeyError('403 Forbidden')).toBe(true);
    expect(service.shouldBenchGeminiKeyError('API_KEY_INVALID: API key expired.')).toBe(true);
    expect(service.shouldBenchGeminiKeyError('API key not valid. Please pass a valid API key.')).toBe(true);
    expect(service.shouldBenchGeminiKeyError('429 quota exceeded')).toBe(true);
    expect(service.shouldBenchGeminiKeyError('404 model not found')).toBe(false);
  });
});
