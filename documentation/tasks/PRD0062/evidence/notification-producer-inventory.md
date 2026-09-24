# PRD0062 notification producer inventory

Ticket 38B1 inventory. This table follows current source callsites for the
specialized trusted action clients. Reader-only consumers are excluded.
`GAP` means the source still calls the generic trusted notification API and
does not yet commit a durable, source-authorized notification intent. The
generic adapter alone does not establish that authority or the recovery
behavior required by the notification recovery plan.

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
| `src/services/deadlineReminderService.ts` | #95 | deadline | Dormant GAP: generic call remains; no external caller found |
| `src/services/enrollmentManager.ts` | #95 | enrollment | Dormant GAP: generic call remains; no external caller found |
| `src/services/feedbackService.ts` | #96 | feedback | Specialized trusted action |
| `src/services/homeworkManager.ts` | #95 | deadline | Durable manual reminder intent producer |
| `src/services/homeworkSubmissionService.ts` | #96 | homework | Specialized reset action + generic GAP: submission notification call remains |
| `src/services/sessionManager.js` | #97 | session | Specialized trusted action |
| `src/services/testResults.service.ts` | #96 | result | Specialized review action and durable test-complete intent |
| `src/services/thcsWritingGrading.service.ts` | #97 | thcs-grading | Generic GAP: direct trusted notification call remains |
| `src/services/writingSubmissionService.ts` | #97 | writing | Specialized trusted action |

## Current trusted action coverage

Specialized source-side clients commit or wake a bounded action handled by the
Worker. Their recipient and message content are resolved from saved source
records. The generic calls marked `GAP` still pass through the legacy generic
adapter and are not evidence of durable source-action authority or scheduled
retry coverage. `deadlineReminderService.ts` and `enrollmentManager.ts` have no
external caller in the current source tree; their generic calls are inventoried
as dormant code, not as active notification behavior.

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
