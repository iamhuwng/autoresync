import { expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';

const { retryClass } = vi.hoisted(() => ({ retryClass: vi.fn() }));
vi.mock('../src/upload-worker/notifications/class-retry.ts', () => ({ retryDueClassNotifications: retryClass }));
vi.mock('../src/upload-worker/notifications/repository.ts', async (importOriginal) => ({
  ...await importOriginal(), FirebaseRestNotificationCommandRepository: class {},
}));
import { NotificationRetryExecutor } from '../src/upload-worker/notifications/notification-retry-executor.js';

it('reaches the exported executor through its native singleton RPC binding', async () => {
  retryClass.mockResolvedValue(undefined);
  await expect(env.NOTIFICATION_RETRY_EXECUTOR.getByName('first-batch').retry('class-membership'))
    .resolves.toBeUndefined();
  expect(retryClass).toHaveBeenCalledOnce();
});

it('bounds the whole RPC, exposes swallowed aborts and clears the deadline on every exit', async () => {
  await runInDurableObject(env.UPLOAD_GRANT_REPLAY_LEDGER.getByName('retry-deadline-test'), async (_instance, state) => {
    const executor = new NotificationRetryExecutor(state, {
      FIREBASE_DB_URL: 'https://test.firebaseio.com', FIREBASE_PROJECT_ID: 'test',
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'test@example.test',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'test@example.test', private_key: 'unused' }),
    });
    let expire: (() => void) | undefined;
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
      expect(delay).toBe(20_000);
      expire = callback;
      return 123;
    }) as typeof setTimeout);
    const clear = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});
    try {
      await expect(executor.retry('unknown')).rejects.toThrow('notification_retry_family_invalid');
      expect(timer).not.toHaveBeenCalled();
      let signal: AbortSignal | undefined;
      vi.stubGlobal('fetch', vi.fn((_input, init) => {
        expect(init.redirect).toBe('error');
        signal = init.signal;
        return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      }));
      retryClass.mockImplementation(async (_env, _now, { fetchImpl }) => {
        try { await fetchImpl('https://test.firebaseio.com/provider'); } catch { /* Existing handlers preserve unconfirmed claims. */ }
      });
      const pending = executor.retry('class-membership');
      expect(signal?.aborted).toBe(false);
      expire!();
      await expect(pending).rejects.toThrow('notification_retry_deadline');
      expect(signal?.aborted).toBe(true);
      expect(clear).toHaveBeenLastCalledWith(123);

      retryClass.mockResolvedValue(undefined);
      await executor.retry('class-membership');
      retryClass.mockRejectedValue(new Error('provider failed'));
      await expect(executor.retry('class-membership')).rejects.toThrow('provider failed');
      expect(clear).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
