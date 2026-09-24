import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

export interface TestCompleteNotificationClientOptions {
  readonly workerOrigin?: string;
  readonly getIdToken?: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export async function dispatchTestCompleteNotification(resultId: string,
  options: TestCompleteNotificationClientOptions = {}): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(resultId)) throw new Error('test_complete_invalid_result');
  const currentUser = getAuth().currentUser;
  const token = (await (options.getIdToken ?? (() => currentUser?.getIdToken() ?? Promise.resolve('')))()).trim();
  if (!token) throw new Error('test_complete_unauthenticated');
  const origin = notificationWorkerOrigin(
    options.workerOrigin?.trim()
      || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
      || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
  );
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${origin}/test-complete-notifications/actions`, {
    method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `test-completed:${resultId}` },
    body: JSON.stringify({ schemaVersion: 1, resultId }),
  });
  if (!response.ok) throw new Error(`test_complete_action_failed:${response.status}`);
}
