import {
  isBookNotificationEmissionEnabled,
  type BookNotificationActionIdentity,
  type BookNotificationEmissionContext,
  type BookNotificationEmissionEnvironment,
} from './book-emitter.ts';
import { BookNotificationEmissionError } from './book-emitter.ts';
import type { NotificationFailureReport } from '../../../../src/services/reportingService.ts';
import type { NotificationDeliveryResult } from '../../../../src/services/notificationProducerClient.ts';
import { FEATURE_IDS } from '../../../../src/config/featureRegistry.ts';

export interface BookMutationResponse {
  readonly body: unknown;
  readonly init?: { readonly status?: number };
}

export interface BookPostCommitEmissionEnvironment
  extends BookNotificationEmissionEnvironment {
  readonly [key: string]: unknown;
}

export interface BookPostCommitEmissionOptions<
  Result extends BookMutationResponse = BookMutationResponse,
> {
  readonly env: BookPostCommitEmissionEnvironment;
  readonly commit: () => Promise<Result>;
  readonly waitUntil?: (task: Promise<void>) => void;
  readonly reportFailure?: (report: NotificationFailureReport) => Promise<void>;
  readonly emitter?: {
    emit(
      identity: BookNotificationActionIdentity,
      context: BookNotificationEmissionContext,
    ): Promise<unknown>;
  };
  readonly resolveActionIdentity?: (input: {
    readonly result: Result;
    readonly env: BookPostCommitEmissionEnvironment;
  }) => BookNotificationActionIdentity | null
    | Promise<BookNotificationActionIdentity | null>;
}

const isCommittedResult = (result: BookMutationResponse): boolean => {
  if (!result.body || typeof result.body !== 'object'
    || Array.isArray(result.body)) {
    return false;
  }
  return (result.body as Record<string, unknown>).state === 'committed';
};

/**
 * Shared post-commit seam for the existing Book Worker. It deliberately owns
 * no route, queue, persistence, or recipient authority.
 */
export const runBookMutationWithPostCommitNotification = async <
  Result extends BookMutationResponse,
>(
  options: BookPostCommitEmissionOptions<Result>,
): Promise<Result> => {
  const emissionEnabled = isBookNotificationEmissionEnabled(
    undefined,
    options.env,
  );
  const result = await options.commit();
  const status = Number(result.init?.status ?? 200);
  if (status < 200
    || status >= 300
    || !isCommittedResult(result)) {
    return result;
  }
  const report = (deliveryState: string) => {
    try {
      console.warn('book_notification_post_commit', { deliveryState });
    } catch {
      // Diagnostic transport failure cannot change the committed product response.
    }
  };
  if (!emissionEnabled) {
    report('skipped_disabled');
    return result;
  }
  const emitter = options.emitter;
  const resolveActionIdentity = options.resolveActionIdentity;
  const body = result.body as Record<string, unknown>;
  const recipientCount = Number.isSafeInteger(body.recipientCount) && Number(body.recipientCount) >= 0
    ? Number(body.recipientCount) : 0;
  const attemptedAt = Date.now();
  let reported = false;
  const reportFailure = async (code: string, delivery?: NotificationDeliveryResult) => {
    if (reported) return;
    reported = true;
    try {
      await options.reportFailure?.({ eventId: typeof body.operationId === 'string' ? body.operationId : 'unknown',
        feature: FEATURE_IDS.homework, action: 'assignHomework', route: 'rtdb',
        status: delivery?.status === 'failed' ? 'failed' : 'unknown', code,
        occurredAt: attemptedAt, attemptedAt, recipientCount,
        delivered: delivery?.delivered ?? 0, failed: delivery?.failed ?? 0,
        unknown: delivery?.unknown ?? 0, unattempted: delivery?.unattempted ?? recipientCount });
    } catch {
      report('report_failed');
    }
  };
  const task = (async () => {
    try {
      if (!emitter || !resolveActionIdentity) {
        report('skipped_misconfigured');
        await reportFailure('book_notification_misconfigured');
        return;
      }
      const identity = await resolveActionIdentity({ result, env: options.env });
      if (!identity) {
        report('skipped_no_identity');
        return;
      }
      const delivery = await emitter.emit(identity, { env: options.env });
      const deliveryStatus = delivery && typeof delivery === 'object' && !Array.isArray(delivery)
        ? (delivery as Record<string, unknown>).status : undefined;
      if (deliveryStatus !== 'emitted') {
        report(deliveryStatus === 'disabled' ? 'skipped_disabled' : deliveryStatus === 'empty' ? 'skipped_empty' : 'unknown');
        if (deliveryStatus !== 'disabled' && deliveryStatus !== 'empty') await reportFailure('book_notification_delivery_unknown');
      }
    } catch (error) {
      report('failed');
      await reportFailure(error instanceof BookNotificationEmissionError ? error.code : 'book_notification_delivery_unknown',
        error instanceof BookNotificationEmissionError ? error.delivery : undefined);
    }
  })();
  // Without a Worker execution context the attempt has no runtime lifetime guarantee.
  try {
    options.waitUntil?.(task);
  } catch {
    report('unknown_lifetime');
  }
  return result;
};
