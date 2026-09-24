import { CLASS_INTENT_DONE_DUE_AT, deliverClassIntent, missingClassIntentRecipients } from './class-action.ts';
import { FirebaseClassActionStorage } from './class-action-store.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';

type Env = Readonly<Record<string, unknown>>;

/** One bounded hourly pass. A claimed retry is never sent a third time. */
export const retryDueClassNotifications = async (env: Env, now = Date.now()): Promise<void> => {
  const storage = new FirebaseClassActionStorage(env);
  const repository = new FirebaseRestNotificationCommandRepository({
    env: env as NotificationCommandRepositoryEnv,
  });
  for (const due of await storage.dueIntents(now)) {
    if (due.state === 'retrying') {
      // A crash may have happened after delivery; read the inbox without a third send.
      const missing = await missingClassIntentRecipients(due, (path) => storage.read(path));
      if (missing) await storage.reportFailure(due, missing);
      await storage.updateIntent({ ...due, state: missing ? 'failed' : 'done', dueAt: CLASS_INTENT_DONE_DUE_AT });
      continue;
    }
    const claimed = await storage.claimRetry(due.actionId, now);
    if (!claimed) continue;
    const result = await deliverClassIntent(claimed, repository);
    if (result.backendFailure) break;
    if (!result.delivered) await storage.reportFailure(claimed, result.failedRecipientCount);
    await storage.updateIntent({
      ...claimed,
      state: result.delivered ? 'done' : 'failed',
      dueAt: CLASS_INTENT_DONE_DUE_AT,
    });
  }
};
