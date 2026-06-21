import { DurableObject } from 'cloudflare:workers';

const REPLAY_RETENTION_MS = 15 * 60 * 1000;
const REPLAY_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const validateReplayKey = (key) =>
  typeof key === 'string' &&
  key.startsWith('grant:') &&
  key.length <= 512 &&
  !/[\r\n\t]/.test(key);

const validateExpiry = (expiresAt, now) =>
  Number.isSafeInteger(expiresAt) && expiresAt > now;

export class UploadGrantReplayLedger extends DurableObject {
  async consume({ key, expiresAt }) {
    const now = Date.now();
    if (!validateReplayKey(key)) {
      throw new Error('invalid_replay_key');
    }
    if (!validateExpiry(expiresAt, now)) {
      throw new Error('grant_expired');
    }

    return this.ctx.storage.transaction(async (txn) => {
      const consumedAt = await txn.get('consumedAt');
      if (typeof consumedAt === 'number') {
        return { consumed: false };
      }

      const cleanupAt = Math.max(
        expiresAt + REPLAY_EXPIRY_BUFFER_MS,
        now + REPLAY_RETENTION_MS,
      );
      await txn.put({
        consumedAt: now,
        expiresAt,
        cleanupAt,
      });
      await txn.setAlarm(cleanupAt);
      return { consumed: true };
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
