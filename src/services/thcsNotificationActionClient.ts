import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

export type ThcsNotificationActionKind = 'homework-assigned' | 'fully-graded';
export interface ThcsNotificationActionOptions {
  readonly workerOrigin?: string;
  readonly getIdToken?: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export async function dispatchThcsNotificationAction(
  kind: ThcsNotificationActionKind,
  authorityRecordId: string,
  options: ThcsNotificationActionOptions = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(authorityRecordId)) throw new Error('thcs_notification_invalid_authority');
  const currentUser = getAuth().currentUser;
  const token = (await (options.getIdToken ?? (() => currentUser?.getIdToken() ?? Promise.resolve('')))()).trim();
  if (!token) throw new Error('thcs_notification_unauthenticated');
  const origin = notificationWorkerOrigin(
    options.workerOrigin?.trim()
      || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
      || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
  );
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${origin}/thcs-notifications/actions`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${kind}:${authorityRecordId}`,
    },
    body: JSON.stringify({ schemaVersion: 1, kind, authorityRecordId }),
  });
  if (!response.ok) throw new Error(`thcs_notification_action_failed:${response.status}`);
}
