import {
  createDeadlineNotificationHandlers,
  type ManualHomeworkReminderIntent,
} from './deadline-action.ts';
import { FirebaseDeadlineNotificationStorage } from './deadline-action-store.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';

type Env = Readonly<Record<string, unknown>>;

const createHandlers = (env: Env) => createDeadlineNotificationHandlers({
  storage: new FirebaseDeadlineNotificationStorage(env),
  repository: new FirebaseRestNotificationCommandRepository({ env: env as NotificationCommandRepositoryEnv }),
});

export const handleDeadlineNotificationAction = async (
  request: Request,
  env: Env,
  uid: string,
): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
  try {
    return await createHandlers(env).action({ request, uid });
  } catch {
    return { body: { code: 'deadline_action_unavailable' }, init: { status: 503 } };
  }
};

/** Dedicated bounded queue; the scheduled Worker queries this family only. */
export const retryDueDeadlineNotifications = async (env: Env): Promise<void> => {
  await createHandlers(env).retryDue();
};

export type { ManualHomeworkReminderIntent };
