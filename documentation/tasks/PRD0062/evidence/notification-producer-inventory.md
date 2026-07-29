# PRD0062 notification producer inventory

Ticket 38B1 inventory. Reader-only consumers (`NotificationBell`,
`StudentDashboardPage`) are excluded. Legacy migration and account-deletion
cleanup are not content producers.

| Producer path | Migration owner | Family |
|---|---:|---|
| `src/components/course/RequestReviewList.tsx` | #95 | enrollment |
| `src/services/assignmentManager.ts` | #95 | assignment |
| `src/services/classManager.ts` | #95 | class |
| `src/services/courseAnnouncementService.ts` | #95 | course-announcement |
| `src/services/courseManager.ts` | #95 | course |
| `src/services/deadlineReminderService.ts` | #95 | deadline |
| `src/services/enrollmentManager.ts` | #95 | enrollment |
| `src/pages/TeacherHomeworkDetailPage.tsx` | #95 | deadline |
| `src/components/results/TeacherFeedbackManager.tsx` | #96 | feedback |
| `src/components/thcs-grading/InlineWritingGrader.tsx` | #96 | result |
| `src/services/homeworkSubmissionService.ts` | #96 | homework |
| `src/services/testResults.service.ts` | #96 | result |
| `src/components/practice/THCSPracticeView.tsx` | #97 | thcs-practice |
| `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` | #97 | thcs-practice |
| `src/components/thcs-student/THCSTestLayout.tsx` | #97 | thcs-practice |
| `src/components/writing-practice/WritingPracticeView.tsx` | #97 | writing |
| `src/hooks/monitor/useMonitorControls.ts` | #97 | monitor |
| `src/services/sessionManager.js` | #97 | session |
| `src/services/thcsWritingGrading.service.ts` | #97 | thcs-grading |
| `src/services/writingSubmissionService.ts` | #97 | writing |

## Trusted producer seam and adapter ownership

- #95 producer paths use `src/services/notificationProducerClient.ts`, which
  emits bounded commands through #94 `notificationCommandClient.ts`.
- No #95 producer sends arbitrary legacy metadata. Existing legacy metadata is
  still readable; visible title/message/link semantics are retained while the
  disabled route fails closed until #59/#134 activate the approved surface.

## Destination-owned integrated proof

The earlier staging/integrated browser requirement is destination-owned by
#134: it covers bounded persistence/readback for every #95 producer family,
deterministic replay, authenticated role rendering, safe destination
resolution, own read-state mutation, active configuration readback, cleanup,
and producer-command rollback. #95 retains local adapter, command-shape,
recipient-authority, negative, compatible-reader, and disabled-route proof and
does not claim deployed or activated notification behavior.

## Existing adapter helper ownership

- #95: `sendHomeworkAssignedNotification`,
  `sendHomeworkDueSoonNotification`, `sendHomeworkReminderNotification`.
- #95 trusted migration: `sendTrustedHomeworkReminderNotification` and the
  generic `createTrustedNotification`/`createTrustedBulkNotifications` calls
  in the owned producer paths.
- #96: `sendFeedbackNotification`, `sendReviewedNotification`,
  `sendGradeUpdatedNotification`, `sendHomeworkSubmittedNotification`,
  `sendHomeworkGradedNotification`, `sendHomeworkResetNotification`.
- #97: `sendSessionOpenedNotifications`, `sendTestStartedNotifications`,
  `sendTestEndedNotifications`, every `sendThcs*` helper except the generic
  #96 `sendGradeUpdatedNotification`, and every `notifyWriting*` helper.
- Generic `createNotification` and `createBulkNotifications` remain temporary
  38B1-compatible legacy entry points. Their callers are assigned above.

## Ownership gap

`src/pages/TeacherHomeworkDetailPage.tsx` emits Homework reminders and belongs
to #95's published deadline/reminder family, but was absent from #95's owned
paths. It was added to #95 destination-first on 2026-07-29 and remains assigned
exactly once here.

## Raw-write boundary

- `src/services/notificationService.ts` remains the legacy compatible
  read/read-state/write adapter until #95-#98 complete.
- `src/services/migrations/migrateNotifications.ts` is operator migration
  work owned by #98.
- `src/services/accountDeletionService.ts` deletes a departing user's own
  notification subtree; it creates no notification content.
- New producer code must use `notificationProducerClient.ts` and therefore
  `notificationCommandClient.ts`. No other application path may write
  notification content directly.
