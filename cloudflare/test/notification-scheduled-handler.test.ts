import { describe, expect, it, vi } from 'vitest';

const { retryClass } = vi.hoisted(() => ({ retryClass: vi.fn(async () => {}) }));
vi.mock('../src/upload-worker/notifications/class-retry.ts', () => ({ retryDueClassNotifications: retryClass }));

import worker from '../notification-command-worker.js';

describe('composed notification Worker scheduled handler', () => {
  it('dispatches the selected bounded family through waitUntil', async () => {
    let pending: Promise<unknown> | undefined;
    worker.scheduled({ scheduledTime: 0 }, {}, { waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(retryClass).toHaveBeenCalledOnce();
  });
});
