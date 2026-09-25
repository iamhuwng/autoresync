# PRD0062 notification producer inventory

Ticket 38B1 inventory. This table follows current source callsites for the
specialized trusted action clients. Reader-only consumers are excluded.
The ordinary committed-event client sends only an event kind and saved record
identity. It covers homework submission/reset, test completion, and writing
submission/grade events. Its endpoint mapping calls existing trusted Worker
resolvers, all of which derive recipient, content, and link from saved records.
Specialized action clients keep source mutation and intent creation atomic
when a post-commit dispatch cannot do that safely.

| Producer path | Migration owner | Family | Current status |
|---|---:|---|---|
| `src/components/practice/THCSPracticeView.tsx` | #97 | thcs-practice | Specialized trusted action |
| `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` | #97 | thcs-practice | Specialized trusted action |
| `src/components/thcs-grading/InlineWritingGrader.tsx` | #96 | result | Specialized manual grade action |
| `src/components/thcs-student/THCSTestLayout.tsx` | #97 | thcs-practice | Specialized trusted action |
| `src/hooks/monitor/useMonitorControls.ts` | #97 | session | Specialized trusted action |
| `src/pages/TeacherHomeworkDetailPage.tsx` | #95 | deadline | Manual reminder action caller |
| `src/services/assignmentManager.ts` | #95 | assignment | Specialized trusted action |
| `src/services/classManager.ts` | #95 | class | Specialized trusted action |
| `src/services/courseAnnouncementService.ts` | #95 | course-announcement | Specialized trusted action |
| `src/services/courseManager.ts` | #95 | course-decision | Specialized trusted action |
| `src/services/courseRequestManager.ts` | #95 | enrollment | Specialized trusted action |
| `src/services/feedbackService.ts` | #96 | feedback | Specialized trusted action |
| `src/services/homeworkManager.ts` | #95 | deadline | Durable manual reminder intent producer |
| `src/services/homeworkSubmissionService.ts` | #96 | homework | Durable submission/reset intents + shared committed-event dispatch |
| `src/services/sessionManager.js` | #97 | session | Specialized trusted action |
| `src/services/testResults.service.ts` | #96 | result | Shared test-complete dispatch; specialized review action commits transition + intent |
| `src/services/writingSubmissionService.ts` | #97 | writing | Shared committed-event dispatch for submission/grade intents |

## Current trusted action coverage

The shared producer port sends an event kind and saved record identity for
post-commit dispatch. Homework submission verifies its committed Firestore
intent before deriving its inbox row. Test completion, homework reset, and
writing retain their existing trusted Worker resolvers and bounded retry paths.
All use the same inbox repository and read flag.

Specialized source-side clients commit or wake a bounded action handled by the
Worker. Class membership, assignment approval, course request/type decision,
course announcement, feedback, manual reminders, result review, THCS manual
grading, and session transitions need Worker-owned action or intent changes;
those clients remain explicit exceptions to the ordinary post-commit port.
Their recipient and message content are still resolved from saved source
records.
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
