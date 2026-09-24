import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { TestCompleteNotificationIntent, TestCompleteNotificationStorage } from './test-complete-notification-action.ts';

type Env = Readonly<Record<string, unknown>>;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const row = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export class FirebaseTestCompleteNotificationStorage implements TestCompleteNotificationStorage {
  private readonly admin: FirebaseRtdbRestClient;

  constructor(private readonly env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }

  readResult(id: string): Promise<unknown> { return this.admin.readValue(`test_results/${id}`); }
  readUser(id: string): Promise<unknown> { return this.admin.readValue(`users/${id}`); }
  readSession(code: string): Promise<unknown> { return this.admin.readValue(`game_sessions/${code}`); }

  async saveIntent(resultId: string, intent: TestCompleteNotificationIntent): Promise<void> {
    const path = `test_results/${resultId}/testCompleteNotificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<TestCompleteNotificationIntent | null>(path);
      if (!current.data || current.data.actionId !== resultId || current.data.kind !== 'test-completed'
        || current.data.actorUid !== intent.actorUid) throw new Error('test_complete_intent_changed');
      if (current.data.state === 'done' || current.data.state === 'failed') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('test_complete_intent_cas_failed');
  }

  private async claim(resultId: string, now: number, retry: boolean): Promise<TestCompleteNotificationIntent | null> {
    const path = `test_results/${resultId}/testCompleteNotificationIntent`;
    const current = await this.admin.readWithEtag<TestCompleteNotificationIntent | null>(path);
    const intent = current.data;
    const eligible = retry
      ? (intent?.state === 'retry_due' && intent.attempts === 1 || intent?.state === 'sending' && intent.attempts === 0)
      : intent?.state === 'pending' && intent.attempts === 0;
    if (!intent || intent.actionId !== resultId || intent.kind !== 'test-completed'
      || !eligible || intent.dueAt > now) return null;
    const claimed: TestCompleteNotificationIntent = {
      ...intent,
      state: retry ? 'retrying' : 'sending',
      attempts: retry ? 2 : 0,
      dueAt: now + 60_000,
    };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }

  claimInitial(resultId: string, now: number): Promise<TestCompleteNotificationIntent | null> {
    return this.claim(resultId, now, false);
  }

  claimRetry(resultId: string, now: number): Promise<TestCompleteNotificationIntent | null> {
    return this.claim(resultId, now, true);
  }

  async dueIntents(now: number, limit: number): Promise<Array<{ resultId: string; intent: TestCompleteNotificationIntent }>> {
    const results = row(await this.admin.readValue('test_results', {
      orderBy: 'testCompleteNotificationIntent/dueAt', startAt: 0, limitToFirst: limit,
    }));
    if (!results) return [];
    return Object.entries(results).flatMap(([resultId, value]) => {
      const intent = row(row(value)?.testCompleteNotificationIntent);
      return intent && intent.kind === 'test-completed' && intent.actionId === resultId
        && typeof intent.dueAt === 'number' && intent.dueAt <= now
        && (intent.state === 'retry_due' && intent.attempts === 1 || intent.state === 'sending' && intent.attempts === 0)
        ? [{ resultId, intent: intent as unknown as TestCompleteNotificationIntent }] : [];
    });
  }

  async reportFailure(resultId: string, intent: TestCompleteNotificationIntent): Promise<void> {
    const day = new Date(intent.occurredAt).toISOString().slice(0, 10);
    const path = `reports/errors/${day}/test-complete-${resultId}`;
    const current = await this.admin.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `test-complete:${resultId}`, timestamp: Date.now(), feature: 'test-results', severity: 'error',
      message: 'Test completion notification delivery failed after its retry.', userId: 'notification-worker',
      userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
      contextData: { resultId, studentId: String(row(await this.readResult(resultId))?.studentId ?? '') },
    }, current.etag);
  }
}
