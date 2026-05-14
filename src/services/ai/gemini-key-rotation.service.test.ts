import { describe, expect, it, vi } from 'vitest';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(),
}));

describe('gemini-key-rotation.service', () => {
  it('skips benched Gemini keys and succeeds with the next available key', async () => {
    const { benchKey } = await import('../key-cooldown.service');
    const { executeGeminiWithKeyRotation } = await import('./gemini-key-rotation.service');
    const attemptedKeys: string[] = [];

    benchKey('rotation-benched-key', 'gemini', '429 quota exceeded');

    const result = await executeGeminiWithKeyRotation({
      callerName: 'rotation-test',
      allKeys: ['rotation-benched-key', 'rotation-healthy-key'],
      attempt: async ({ key }) => {
        attemptedKeys.push(key);
        return { status: 'success', value: key };
      },
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('rotation-healthy-key');
    expect(result.totalConfiguredKeys).toBe(2);
    expect(result.totalAvailableKeys).toBe(1);
    expect(result.attemptedKeyCount).toBe(1);
    expect(attemptedKeys).toEqual(['rotation-healthy-key']);
  });

  it('benches invalid or expired keys and rotates to a healthy key', async () => {
    const { isKeyBenched } = await import('../key-cooldown.service');
    const { executeGeminiWithKeyRotation } = await import('./gemini-key-rotation.service');
    const attemptedKeys: string[] = [];

    const result = await executeGeminiWithKeyRotation({
      callerName: 'rotation-test',
      allKeys: ['rotation-expired-key', 'rotation-fallback-key'],
      attempt: async ({ key }) => {
        attemptedKeys.push(key);
        if (key === 'rotation-expired-key') {
          throw new Error('API_KEY_INVALID: API key expired.');
        }
        return { status: 'success', value: key };
      },
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('rotation-fallback-key');
    expect(result.attemptedKeyCount).toBe(2);
    expect(attemptedKeys).toEqual(['rotation-expired-key', 'rotation-fallback-key']);
    expect(isKeyBenched('rotation-expired-key')).toBe(true);
  });

  it('benches rate-limited keys and rotates to a healthy key', async () => {
    const { isKeyBenched } = await import('../key-cooldown.service');
    const { executeGeminiWithKeyRotation } = await import('./gemini-key-rotation.service');
    const attemptedKeys: string[] = [];

    const result = await executeGeminiWithKeyRotation({
      callerName: 'rotation-test',
      allKeys: ['rotation-rate-limited-key', 'rotation-rate-limit-fallback-key'],
      attempt: async ({ key }) => {
        attemptedKeys.push(key);
        if (key === 'rotation-rate-limited-key') {
          throw new Error('429 rate limit exceeded');
        }
        return { status: 'success', value: key };
      },
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('rotation-rate-limit-fallback-key');
    expect(result.attemptedKeyCount).toBe(2);
    expect(attemptedKeys).toEqual(['rotation-rate-limited-key', 'rotation-rate-limit-fallback-key']);
    expect(isKeyBenched('rotation-rate-limited-key')).toBe(true);
  });

  it('rotates through transient high-demand failures without benching the key', async () => {
    const { isKeyBenched } = await import('../key-cooldown.service');
    const { executeGeminiWithKeyRotation } = await import('./gemini-key-rotation.service');
    const attemptedKeys: string[] = [];

    const result = await executeGeminiWithKeyRotation({
      callerName: 'rotation-test',
      allKeys: ['rotation-high-demand-key', 'rotation-recovery-key'],
      attempt: async ({ key }) => {
        attemptedKeys.push(key);
        if (key === 'rotation-high-demand-key') {
          throw new Error('503 This model is currently experiencing high demand');
        }
        return { status: 'success', value: key };
      },
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('rotation-recovery-key');
    expect(result.attemptedKeyCount).toBe(2);
    expect(attemptedKeys).toEqual(['rotation-high-demand-key', 'rotation-recovery-key']);
    expect(isKeyBenched('rotation-high-demand-key')).toBe(false);
  });
});
