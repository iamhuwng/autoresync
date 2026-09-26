# PRD0062 notification producer inventory

**Current recovery boundary (2026-09-26):** use the [system plan](../../notification-system-recovery-plan.md), [route audit](../../notification-recovery-route-boundary.md), and [implementer handoff](../../notification-recovery-rotation-handoff-2026-09-26.md) for approval and live status. This source inventory does not approve every specialized action route. Ordinary app/Firebase product saves stay in place; the Worker owns only necessary verification, protected delivery, and the agreed minimal closed-app retry. Later families remain inactive pending verification.

Ticket 38B1 inventory, reconciled against source `787501e9` on 2026-09-27.
This table follows product/event producers, not transport adapter files.
Reader-only consumers are excluded. The [current ownership recommendation](../../notification-recovery-route-boundary.md#current-ownership-recommendation-2026-09-27)
is source review, pending planner decision; it changes no action owner.
The ordinary committed-event client sends only an event kind and saved record
identity. It covers homework submission/reset, test completion, writing
submission/grade, assignment approval, and course request/type decisions. Its endpoint mapping calls existing trusted Worker
resolvers, all of which derive recipient, content, and link from saved records.
Manual reminder, session, and THCS specialized clients only wake delivery after
ordinary app-owned source/intent saves. Four other clients currently call
unapproved Worker product mutations; that coupling is not necessity proof.

| Producer path | Migration owner | Family | Current status |
|---|---:|---|---|
| `src/components/practice/THCSPracticeView.tsx` | #97 | thcs-practice | App result save; specialized delivery wake |
| `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` | #97 | thcs-practice | App assignment save; specialized delivery wake |
| `src/components/thcs-grading/InlineWritingGrader.tsx` | #96 | result | Unapproved Worker manual-grade mutation caller |
| `src/components/thcs-student/THCSTestLayout.tsx` | #97 | thcs-practice | App result save; specialized delivery wake |
| `src/hooks/monitor/useMonitorControls.ts` | #97 | session | App source/event/intent save; specialized delivery wake |
| `src/pages/TeacherHomeworkDetailPage.tsx` | #95 | deadline | App reminder save; specialized delivery wake |
| `src/services/assignmentManager.ts` | #95 | assignment | Shared committed-event dispatch |
| `src/services/classManager.ts` | #95 | class | Approved narrow Worker membership exception |
| `src/services/courseAnnouncementService.ts` | #95 | course-announcement | Unapproved Worker announcement mutation caller |
| `src/services/courseManager.ts` | #95 | course-decision | Shared committed-event dispatch |
| `src/services/courseRequestManager.ts` | #95 | enrollment | Shared committed-event dispatch |
| `src/services/feedbackService.ts` | #96 | feedback | Unapproved Worker feedback mutation caller |
| `src/services/homeworkManager.ts` | #95 | deadline | Durable manual reminder intent producer |
| `src/services/homeworkSubmissionService.ts` | #96 | homework | Durable submission/reset intents + shared committed-event dispatch |
| `src/services/sessionManager.js` | #97 | session | App source/event/intent save; specialized delivery wake |
| `src/services/testResults.service.ts` | #96 | result | Shared completion dispatch; unapproved Worker review mutation caller |
| `src/services/writingSubmissionService.ts` | #97 | writing | Shared committed-event dispatch for submission/grade intents |

## Current producer coverage

Seventeen unique producer paths contain ten shared wake calls in six paths and
eight remaining ordinary specialized wake calls in six paths. The additional
`homeworkManager.ts` path creates intents without waking delivery. Manual
reminder (two calls), session (three), and THCS (three) wake consolidation
remains open. Preserve their existing source owners and server authority
resolvers when extending the common client.

The shared producer port sends an event kind and saved record identity for
post-commit dispatch. Homework submission verifies its committed Firestore
intent before deriving its inbox row. Test completion, homework reset, and
writing, assignment, and course decisions retain their existing trusted Worker resolvers and bounded retry paths.
All use the same inbox repository and read flag.

Specialized source-side clients either wake trusted delivery after an ordinary
app/Firebase save or call a Worker-owned action. Class membership is the
reviewed narrow Worker action exception; Book's existing Worker authority is
separate. Assignment approval, course request/type decisions, manual reminders,
and session transitions keep their ordinary product owners. Current Worker
mutations for course announcements, feedback, result review, and THCS manual
grading have source recommendations awaiting planner review before owner
changes or activation. Recipient and message
content must be resolved from verified saved records in either route.
The two unreferenced generic producer paths (`deadlineReminderService.ts` and
`sendExpirationWarning` in `enrollmentManager.ts`) were removed. No active
feature source calls the generic content-authoring adapter.

The specialized producers include assignment, class, course announcement,
course decision, course request, feedback, homework reset, result review,
session, THCS, and writing actions. Manual homework reminder intent is created
by `homeworkManager.ts` and invoked from `TeacherHomeworkDetailPage.tsx`.

## Raw inbox-write boundary

- `src/services/notificationService.ts` remains the legacy notification adapter
  and the only application service that writes inbox content directly.
- `src/services/accountDeletionService.ts` removes the departing account's
  notification subtree; it does not create notification content.
- `src/services/migrations/migrateNotifications.ts` is not a current raw inbox
  writer. Migration ownership remains with #98 if that path is reintroduced.
- No other current application source path may write notification content
  directly.
