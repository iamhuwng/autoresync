# Shared Feature Integration

> Read when adding or changing a feature or workflow, or replacing its backend.
> Apply each shared port that the workflow actually needs; an ordinary click does
> not automatically require a persistent notification.

## Integration contract

Before implementation, trace the action's durable outcome and its existing
callers and readers. For every applicable concern, use the owning shared port:

| Concern | Shared port and rule |
| --- | --- |
| Immediate success, failure, or progress feedback to the actor | `toast` from `src/components/modern/ToastNotification.tsx`; follow [`announcements.md`](announcements.md). |
| Persistent notice to a student or teacher | The shared notification producer interface (currently `src/services/notificationProducerClient.ts`) and `src/services/notificationService.ts` for inbox reads/read state. Verify that delivery reaches the recipient's existing `notifications/{userId}/{notificationId}` inbox. |
| Action and page reporting for the admin reporting surface | `src/config/featureRegistry.ts`, `src/hooks/useFeatureTracking.ts`, and `src/services/reportingService.ts`; follow [`observability.md`](observability.md). |
| Error, health, or audit information needed by administrators | Use the reporting service and the existing admin read surface. For a domain-specific audit stream, follow its owning architecture contract and access rules. |

The feature supplies the event and relevant record identity. The shared port
owns delivery, configuration, persistence, display, and error reporting. New
feature code must not choose a one-off notification host or create a parallel
toast, inbox, action registry, or admin monitoring surface. The applicable
feature-specific architecture rules remain in force.

## Completion gate

1. Record which ports apply and why. Mark a port not applicable only when the
   workflow has no corresponding user or administrator outcome.
2. Trace each applicable port from producer to configured backend, stored or
   reported record, and reader. A call that returns failure or reaches a
   disabled route is an incomplete integration even if the main action succeeds.
3. When replacing a shared port's backend or permission rule, inventory all
   active producers and migrate them with the port. Keep recipient authority
   checks and the existing consumer contract intact.
4. Verify representative success and failure behavior through the real client;
   for persistent notifications, verify the intended recipient can read the
   delivered record. Report any unverified port explicitly.

The current notification producer migration is incomplete; its existing
per-feature host overrides and unavailable producer families are drift to
repair, not examples for new features. See
[`notification-producer-inventory.md`](../tasks/PRD0062/evidence/notification-producer-inventory.md).
