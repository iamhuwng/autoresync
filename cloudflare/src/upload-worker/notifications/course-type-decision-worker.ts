import { createCourseTypeDecisionHandlers } from './course-type-decision-delivery.ts';
import { FirebaseCourseTypeDecisionStorage } from './course-type-decision-store.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';

type Env = Readonly<Record<string, unknown>>;

/** One bounded scheduled pass over due course type decisions. */
export const retryDueCourseTypeDecisionNotifications = async (
  env: Env,
  now = Date.now(),
): Promise<{ processed: number }> => {
  const handlers = createCourseTypeDecisionHandlers({
    storage: new FirebaseCourseTypeDecisionStorage(env),
    repository: new FirebaseRestNotificationCommandRepository({
      env: env as NotificationCommandRepositoryEnv,
    }),
    now: () => now,
  });
  return handlers.runRetryBatch();
};
