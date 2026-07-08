# Task List: PRD0062 Component 06 - Updates, Checkpoints, Notifications

Status: Draft task list. Execute only through the master orchestration packet order.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/services/book-activity/activityDiff.service.ts` - Semantic change classification owner from Component 01.
- `src/services/book-homework/bookHomeworkUpdatePlanner.service.ts` - New affected-homework lookup and update planning owner.
- `src/services/book-homework/bookHomeworkUpdateApply.service.ts` - New selective update application owner.
- `src/services/book-homework/bookHomeworkCheckpoint.service.ts` - New Review Checkpoint creation and read projection owner.
- `src/services/book-homework/bookHomeworkRegrade.service.ts` - New regrade-only update owner.
- `src/services/book-homework/bookHomeworkProgress.service.ts` - Existing/new progress aggregation owner to recalculate completion after update.
- `src/types/notification.types.ts` - Existing notification type contracts to extend with Book update metadata.
- `src/services/notificationService.ts` - Existing Notification Bell service to create persistent student notifications.
- `src/components/notifications/NotificationBell.tsx` - Existing notification entry point to preserve.
- `src/components/notifications/NotificationPanel.tsx` - Existing notification display surface to link updated homework/checkpoints safely.
- `src/components/books/AffectedHomeworkReviewModal.tsx` - New teacher affected-homework review workflow.
- `src/pages/TeacherHomeworkDetailPage.tsx` - Teacher view of pending updates and affected Activity status.
- `src/pages/StudentHomeworkDetailPage.tsx` - Student view of updated work and Previous Versions.

### Notes

- Publishing source changes succeeds first. Active homework remains unchanged by default.
- No force-update target is selected by default.
- One confirmed update action must be atomic and idempotent.
- One update action creates at most one Review Checkpoint per affected student.
- Notifications are persistent Notification Bell records, not transient toasts.
- Notification metadata must not include answer content, PDF content, or full diff payloads.
- Review Checkpoint display follows existing homework feedback release policy.

## Tasks

- [ ] 1.0 Implement affected-homework lookup after Activity/Book publication
  - [ ] 1.1 Trigger affected-homework lookup after Activity Revision publication.
  - [ ] 1.2 Trigger lookup after Book structural revision, Manifest/Source revision, new Unit/Chapter/Section, and page/source-context change.
  - [ ] 1.3 Do not trigger review after ordinary draft save.
  - [ ] 1.4 Find active homework pinned to affected Book subtree, Activity, Source Version, Page Group, or Placement context.
  - [ ] 1.5 Ignore closed or archived homework.
  - [ ] 1.6 Compute affected Activity list by homework target and frozen manifest.
  - [ ] 1.7 Add tests for Activity revision, structural change, source/page change, new Unit, and closed homework exclusion.

- [ ] 2.0 Implement Affected Homework Review UI and teacher confirmation flow
  - [ ] 2.1 Show target/class/student, selected Book/subtree, final and nested deadlines, access mode/release information, and affected Activities per homework.
  - [ ] 2.2 Show counts for not started, in progress, and submitted students.
  - [ ] 2.3 Categorize safe structural changes, regrade-only changes, redo-required changes, additions, removals, and deadline action required.
  - [ ] 2.4 Show estimated notification/checkpoint impact.
  - [ ] 2.5 Default all force-update targets to unselected.
  - [ ] 2.6 Allow teacher to select homework targets and deselect individual proposed redo/addition items where valid.
  - [ ] 2.7 Require teacher reason before confirm.
  - [ ] 2.8 Require replacement deadlines for new or redo-required work under expired effective deadlines.
  - [ ] 2.9 Use shared announcements for success/failure outcomes.
  - [ ] 2.10 Add component tests for review content, default unselected state, reason requirement, and deadline replacement validation.

- [ ] 3.0 Implement pending update awareness
  - [ ] 3.1 If the teacher closes review without applying updates, retain pending update awareness.
  - [ ] 3.2 Show pending update count on Book/Activity surfaces.
  - [ ] 3.3 Allow teacher to reopen Affected Homework Review later.
  - [ ] 3.4 Clear pending state only when selected updates are applied or source change no longer affects active homework.
  - [ ] 3.5 Add tests for close/reopen and pending count behavior.

- [ ] 4.0 Implement selective Activity binding updates
  - [ ] 4.1 Create update action audit record for every confirmed update.
  - [ ] 4.2 Update only selected homework targets.
  - [ ] 4.3 Update only selected Activity bindings within each target.
  - [ ] 4.4 Keep unchanged Activity bindings valid and untouched.
  - [ ] 4.5 Apply new per-Activity version bindings for redo-required and selected added content.
  - [ ] 4.6 Apply source/page binding changes only where selected and valid.
  - [ ] 4.7 Exclude removed Activities from current required scope without deleting historical records.
  - [ ] 4.8 Recalculate completion after update.
  - [ ] 4.9 Ensure retry does not reopen work twice or duplicate state transitions.
  - [ ] 4.10 Add idempotency tests.

- [ ] 5.0 Implement Review Checkpoint creation and Previous Versions display
  - [ ] 5.1 For not-started students, bind latest selected version and create no checkpoint.
  - [ ] 5.2 For in-progress students, seal old affected drafts inside one Review Checkpoint for that update action.
  - [ ] 5.3 For submitted students, preserve old affected submissions inside one Review Checkpoint for that update action.
  - [ ] 5.4 For mixed cases, create one checkpoint summarizing all affected started/submitted Activities.
  - [ ] 5.5 Include only changed Activities the student had started or submitted.
  - [ ] 5.6 Do not copy unchanged Activities.
  - [ ] 5.7 Do not create checkpoints for not-started Activity or removal-only updates.
  - [ ] 5.8 Store old Activity and Source version links, prior answers, prior result/feedback visibility metadata, prior status, teacher reason, and audit context.
  - [ ] 5.9 Make checkpoints read-only and excluded from current completion/grade.
  - [ ] 5.10 Add Previous Versions UI entry point from updated homework/result surfaces.
  - [ ] 5.11 Add tests for one checkpoint per student/update action and checkpoint content filtering.

- [ ] 6.0 Implement regrade-only flows
  - [ ] 6.1 Recalculate scores for point-only changes without requiring redo.
  - [ ] 6.2 Regrade answers for answer-key-only changes without requiring redo.
  - [ ] 6.3 Support teacher regrade plan for rubric-only changes where applicable.
  - [ ] 6.4 Store old/new grading result in audit history.
  - [ ] 6.5 Send score-updated notification when a published student score changes.
  - [ ] 6.6 Do not send action-required wording when no student action is required.
  - [ ] 6.7 Add tests for answer-key-only and point-only examples from the PRD.

- [ ] 7.0 Implement persistent case-specific student notifications
  - [ ] 7.1 Create one Notification Bell record per student per update action, not one per Activity.
  - [ ] 7.2 Link safely to updated homework or Previous Versions view.
  - [ ] 7.3 Store structured destination metadata without answer content, PDF content, or full diff payload.
  - [ ] 7.4 Implement not-started notification wording.
  - [ ] 7.5 Implement in-progress notification wording.
  - [ ] 7.6 Implement submitted notification wording.
  - [ ] 7.7 Implement mixed-case notification wording.
  - [ ] 7.8 Implement regrade-only notification wording.
  - [ ] 7.9 Ensure retry does not send duplicate notifications.
  - [ ] 7.10 Add Notification Bell and Notification Panel tests for display/link behavior.

- [ ] 8.0 Enforce deadline and feedback visibility rules during updates
  - [ ] 8.1 Keep future deadlines unchanged where valid.
  - [ ] 8.2 Require replacement deadlines for new or redo-required work under expired deadlines.
  - [ ] 8.3 Do not require new deadlines for regrade-only, reorder-only, or removal-only updates.
  - [ ] 8.4 Preserve per-student extensions where applicable.
  - [ ] 8.5 Always show student’s own previous answers in checkpoints.
  - [ ] 8.6 Show score, correct answers, teacher feedback, and marking details only when release policy permits.
  - [ ] 8.7 Add tests proving force update does not reveal hidden answers early.

- [ ] 9.0 Add full homework update matrix tests
  - [ ] 9.1 Test display-only change for not-started, in-progress, and submitted students.
  - [ ] 9.2 Test regrade-only change for not-started, in-progress, and submitted students.
  - [ ] 9.3 Test redo-required Activity for not-started, in-progress, and submitted students.
  - [ ] 9.4 Test new Activity addition.
  - [ ] 9.5 Test removed Activity exclusion.
  - [ ] 9.6 Test reorder and move behavior.
  - [ ] 9.7 Test new Unit addition.
  - [ ] 9.8 Test expired deadline handling.
  - [ ] 9.9 Assert unchanged work remains valid, only affected Activities reopen, retry creates no duplicates, and notification metadata/wording matches each case.

- [ ] 10.0 Preserve audit and regression boundaries
  - [ ] 10.1 Ensure update action is audited with teacher ID, reason, selected targets, selected Activities, old/new bindings, deadline decisions, and idempotency key.
  - [ ] 10.2 Ensure audit excludes answer content/PDF content where not required for checkpoint itself.
  - [ ] 10.3 Preserve existing Notification Bell behavior for non-Book notifications.
  - [ ] 10.4 Preserve existing homework update/detail behavior for non-Book homework.
  - [ ] 10.5 Update findings with final update, checkpoint, notification, and audit owner paths.
