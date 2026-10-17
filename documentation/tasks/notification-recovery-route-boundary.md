# Notification route boundary audit

Source inspected on 2026-09-26. No additional families were activated. The agreed common trusted notification writer is separate from product mutation ownership. The recorded narrow product-action exception is class membership, whose rejection deletes prior proof. Existing inbox rule denial does not authorize moving other product actions. The [rotation handoff](notification-recovery-rotation-handoff-2026-09-26.md) is the current execution checkpoint; this audit remains the action-owner decision input.

## Ordinary actions

| Family | Product action owner in current source | Notification delivery owner |
|---|---|---|
| Homework submit/reset/manual reminder | Browser Firestore transaction or batch in `homeworkSubmissionService.ts` / `homeworkManager.ts`, including saved notification intent | Notification Worker; submit/reset use `dispatchCommittedNotification`, reminder uses `wakeManualHomeworkReminder` |
| Assignment approval | Browser RTDB multi-path update in `assignmentManager.ts` | Notification Worker through shared committed-event client |
| Course request/type decision | Browser RTDB update in `courseRequestManager.ts` / `courseManager.ts` | Notification Worker through shared committed-event client |
| Test completion and writing submit/grade | Browser source services commit result/submission and intent | Notification Worker through shared committed-event client |
| Session lifecycle and THCS practice/homework | Existing browser source mutation; session commits event/intent in the same RTDB update | Specialized Worker dispatch resolves the saved event |
| Book assignment/update | Existing Book Worker saga/authority surfaces | Book emitter and the same `FirebaseRestNotificationCommandRepository` inbox |

`src/services/notificationProducerClient.ts` sends saved homework, assignment/course-decision, test, and writing identities to Cloudflare. Manual reminders, session transitions, and THCS events still use specialized wake clients; their consolidation into the common producer remains open. These delivery calls preserve ordinary product mutations while replacing the previous browser inbox-delivery route, as discussed and recorded in the [plan](notification-system-recovery-plan.md#routing-decision-from-the-actual-discussion). `notificationService.ts:createNotification` still contains the old direct RTDB write; current rules deny new inbox content and allow only the recipient's false-to-true read flag.

## Worker-owned product-action exceptions introduced in notification source

| Action | Current Worker mutation | Specific reason encoded by current implementation |
|---|---|---|
| Class join/add/approve/reject | `class-action.ts` + `class-action-store.ts`: roster/projection, event, intent | Approved narrow exception: rejection deletes roster proof; atomic event/intent captures it before deletion |
| Course announcement | `course-announcement-action.ts`: announcement plus recipient snapshot/intent | Saves the broadcast source and bounded delivery authority together |
| Feedback save | `feedback-notification-action.ts`: feedback plus intent | Saves the feedback transition and its retry authority together |
| Result reviewed | `result-review-action.ts`: review flag plus intent | Saves review transition and its retry authority together |
| Manual THCS question grade | `grade-notification-action-store.ts`: question result plus intent | Saves manual grade and its retry authority in one RTDB patch |

The four non-class rows are current product-action migrations, not notification wake calls. Their implementation couples mutation with intent creation, but this does not establish an independent requirement or recorded approval to relocate those actions. The manual reminder, assignment approval, course decisions, and session lifecycle already demonstrate browser-owned atomic source/intent writes. Book's existing Worker authority is a separate established product boundary.

## Existing path that can be retained

The ordinary producer interface and browser-owned product action can stay, with a shared API wake call to the trusted notification writer. The common inbox (`notifications/<recipient>/<id>`), browser subscription, destination resolver, and read flag already stay. Durable intent, one retry, terminal admin issue, and family suppression belong to the common delivery path.

The old direct inbox adapter cannot safely be reopened unchanged: it chooses a random push ID and accepts caller-authored recipient/content; it has no durable one-retry or family-suppression state. A narrowly authorized direct initial write would require event-specific source-bound rules, deterministic IDs, immutable recipient/content, and the same trusted retry/reporting gate. No such rule surface currently exists, and the approved shared trusted-writer plan does not require introducing it. Current family gate state is browser-denied; a browser failure cannot reset suppression or claim another attempt. No rules or product routes were changed by this audit.

First-batch live config remains `class-homework`; its entry point rejects later action routes with `notification_action_batch_inactive`. Normal retry-delivery CPU and broader rollout remain open gates.
