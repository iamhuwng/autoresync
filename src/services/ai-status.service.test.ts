import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.config', () => ({
  loadAllGeminiApiKeys: vi.fn(),
  getEnv: vi.fn(() => ({})),
}));

vi.mock('./api-keys.service', () => ({
  getDecryptedKeys: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./key-cooldown.service', () => ({
  filterBenchedKeys: vi.fn(),
  getCooldownStatus: vi.fn(() => []),
}));

async function loadService() {
  vi.resetModules();
  return import('./ai-status.service');
}

describe('ai-status.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('reports maintenance when all configured keys are exhausted or cooling down', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys, getCooldownStatus } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['gemini-key-1', 'gemini-key-2']);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => (keys.length === 2 ? [] : keys));
    vi.mocked(getCooldownStatus).mockReturnValue([
      {
        provider: 'gemini',
        keyPreview: '...key-2',
        remainingSeconds: 45,
        reason: '429 rate limit',
      },
    ]);

    const availability = await service.getAIAvailability();

    expect(availability.available).toBe(false);
    expect(availability.totalKeys).toBe(2);
    expect(availability.benchedKeys).toBe(2);
    expect(availability.shortestCooldownRemaining).toBe(45);
    expect(availability.reason).toMatch(/maintenance/i);
    expect(availability.reason).toMatch(/all configured ai api keys are exhausted or cooling down/i);
  });

  it('stays available when at least one key remains usable', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['gemini-key-1', 'gemini-key-2']);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => (keys.length === 2 ? keys.slice(0, 1) : keys));

    const availability = await service.getAIAvailability();

    expect(availability.available).toBe(true);
    expect(availability.geminiAvailable).toBe(true);
    expect(availability.benchedKeys).toBe(1);
    expect(availability.reason).toBeUndefined();
  });

  it('reports a configuration message when no AI keys exist', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue([]);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => keys);

    const availability = await service.getAIAvailability();

    expect(availability.available).toBe(false);
    expect(availability.totalKeys).toBe(0);
    expect(availability.reason).toMatch(/no ai api keys configured/i);
  });

  it('reports degraded unavailable status when availability checks throw unexpectedly', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['gemini-key-1']);
    vi.mocked(filterBenchedKeys).mockImplementation(() => {
      throw new Error('Firestore offline');
    });

    const availability = await service.getAIAvailability();

    expect(availability.available).toBe(false);
    expect(availability.geminiAvailable).toBe(false);
    expect(availability.groqAvailable).toBe(false);
    expect(availability.totalKeys).toBe(0);
    expect(availability.reason).toMatch(/could not be verified/i);
  });

  it('returns the cached result within the cache ttl', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['gemini-key-1']);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => keys);

    const first = await service.getAIAvailability();
    const second = await service.getAIAvailability();

    expect(first).toBe(second);
    expect(loadAllGeminiApiKeys).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache and fetches fresh availability on the next check', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys)
      .mockResolvedValueOnce(['gemini-key-1'])
      .mockResolvedValueOnce(['gemini-key-1', 'gemini-key-2']);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => keys);

    const first = await service.getAIAvailability();
    service.invalidateAIStatusCache();
    const second = await service.getAIAvailability();

    expect(first.totalKeys).toBe(1);
    expect(second.totalKeys).toBe(2);
    expect(loadAllGeminiApiKeys).toHaveBeenCalledTimes(2);
  });

  it('updates the shared snapshot and notifies subscribers on refresh', async () => {
    const service = await loadService();
    const { loadAllGeminiApiKeys } = await import('../config/env.config');
    const { filterBenchedKeys } = await import('./key-cooldown.service');

    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['gemini-key-1']);
    vi.mocked(filterBenchedKeys).mockImplementation((keys) => keys);

    const listener = vi.fn();
    const unsubscribe = service.subscribeAIStatus(listener);

    try {
      const refreshed = await service.refreshAIStatus({ force: true });
      const snapshot = service.getAIStatusSnapshot();

      expect(refreshed.available).toBe(true);
      expect(snapshot.loaded).toBe(true);
      expect(snapshot.details?.totalKeys).toBe(1);
      expect(listener).toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
});
