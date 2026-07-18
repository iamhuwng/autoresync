> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST**
>
> **Execution authority:** This root checklist is the sole checkbox owner. Master, recovered, and audit files are reference/provenance only; their checkboxes are not execution boxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
> **Reconciliation marker:** The current canonical PRD and `canonical-task-overrides.json` win for the approved Source/page-binding rows. Approved Amendment §§1/3 mandatory packet contracts and sequential readiness control remaining conflicts with `9e6e7b2d` risk-scaled/parallel wording. Updates/checkpoints/notifications remain a later Full V1 packet; they are not removed.

# Task List: PRD0062 Component 06 - Updates, Checkpoints, Notifications

Status: PLANNED. Start bounded slices only from exact reviewed producer inputs in the master dependency graph.

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

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

- Publishing source changes succeeds first. Active homework remains unchanged by default, including its pinned complete physical-page sets. Existing one-page grants/resources cannot silently expand or repin.
- No force-update target is selected by default.
- One confirmed update action must be atomic and idempotent.
- One update action creates at most one Review Checkpoint per affected student.
- Notifications are persistent Notification Bell records, not transient toasts.
- Notification metadata must not include answer content, PDF content, or full diff payloads.
- Review Checkpoint display follows existing homework feedback release policy.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, owner/interface, compatibility boundary, focused tests, and changed failure proof here; add a separate Packet 6 contract only for triggered detail that cannot stay concise.

Keep teacher review UI separate from update authority, semantic-diff lattice, atomic/idempotent fan-out, checkpoints, notifications, deadlines, and feedback visibility. Before `VERIFIED`, complete required matrix/failure proof, reconcile only touched current-state docs, and run governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Amendment-Compliant Packet Contract (Packet 6)

### Storage

Define immutable checkpoints/regrade history and mutable update actions, selected binding revisions, excluded historical rows, progress, audit, and notification records. Record indexes, owner-bound reads/writes, safe student projections, archive/tombstone/backup/restore behavior, and duplicate-retry negatives.

### Security/rules

Permit only the authorized teacher to review/confirm owned homework; recompute affected targets, deadlines, and release policy server-side. Students read only their own current/previous-version projection and notifications. Deny student update/apply/audit/checkpoint writes and generic notification writes; allowlist structured destinations and exclude answer/PDF/full-diff data.

### UI/accessibility/announcements

Specify affected-homework review content, default-unselected targets, reason/deadline decisions, pending awareness, Previous Versions, Bell/Panel safe links, keyboard labels, mobile stacking, and shared teacher announcements with status/alert roles.

### Migration/compatibility

Publishing never mutates active homework until confirmed. Preserve reorder-only no-op, frozen addition-only behavior, removal history, generic homework and Notification Bell behavior, legacy release/score fields, placement-scoped completion, and no aggregate Book grade. Rollback is an idempotent no-op against the prior binding revision.

### Tests

Cover planner/apply/checkpoint/regrade/notification matrices for all student states and change types, deadline/feedback visibility, retry/idempotency, stale revision, unauthorized targets, duplicate prevention, hidden-answer leakage, safe fallback, and read-state transitions. Record focused runner/config and product-versus-harness result.

### Browser/runtime proof

Use local teacher quick-login on port 5173 to review and confirm once, then student quick-login on port 5174 to verify case-specific Bell notification, current work, Previous Versions, and safe fallback without hidden answers. Treat browser proof as local only; it cannot prove atomicity, rules, rollback, or remote-faithful behavior.

### Authority reconciliation

Map every ID one-for-one to this canonical checklist, the current canonical PRD, `canonical-task-overrides.json` where applicable, the Approved Amendment, `implementation-audit.md`, `authority-and-provenance.md`, and `reconciliation-ledger.md`. Root task boxes are execution authority; master, recovered, and audit checkboxes are reference only.

### Evidence classification

Classify each claim as `VERIFIED_LOCAL_FAITHFUL`, `NOT_STARTED`, `OFF_SPEC`, or another explicitly named state. Accept `[x]` only for unchanged audited generic salvage; changed/new IDs remain open until direct proof and review.

### Rollback/blockers

Failed update, checkpoint, regrade, audit, or notification work leaves the prior manifest and work readable; retry only failed scopes and never duplicate transitions. Record matrix gaps, blockers, omitted suites, dirty paths, residual risks, and conditional handoff to R7. Do not call this packet VERIFIED or CLOSED from semantic-diff, UI-only, or Bell-only proof.

## Tasks

- [ ] 1.0 Implement affected-homework lookup after Activity/Book publication
  - [ ] 1.1 Trigger affected-homework lookup after Activity Revision publication.
  - [ ] 1.2 Trigger lookup after Book structural revision, Manifest/Source revision, new Unit/Chapter/Section, and any change to Page Groups, mapped physical pages, page labels/rotation, student-safe source status, or pinned Source Version.
  - [ ] 1.3 Do not trigger review after ordinary draft save.
  - [ ] 1.4 Find active homework pinned to the affected Book subtree, Activity, Source Version, Page Group, Placement context, or physical-page mapping.
  - [ ] 1.5 Ignore closed or archived homework.
  - [ ] 1.6 Compute affected Activity list by homework target and frozen manifest.
  - [ ] 1.7 Add tests for Activity revision, structural change, Source Version/student-safe-status change, page-mapping change, new Unit, and closed homework exclusion.

- [ ] 2.0 Implement Affected Homework Review UI and teacher confirmation flow
  - [ ] 2.1 Show target/class/student, selected Book/subtree, final and nested deadlines, access mode/release information, and affected Activities per homework.
  - [ ] 2.2 Show counts for not started, in progress, and submitted students.
  - [ ] 2.3 Categorize safe structural changes, regrade-only changes, redo-required changes, additions, removals, and deadline action required.
  - [ ] 2.4 Show estimated notification/checkpoint impact.
  - [ ] 2.5 Default all force-update targets to unselected.
  - [ ] 2.6 Allow teacher to select homework targets and deselect individual proposed redo/addition items where valid.
  - [ ] 2.7 Require teacher reason before confirm.
  - [ ] 2.8 Evaluate replacement-deadline requirements against each student's effective deadline, including per-student extensions.
  - [ ] 2.9 Show how many students require a replacement deadline because their effective deadline has expired.
  - [ ] 2.10 Support one replacement deadline applied to selected homework targets with explicit per-homework override.
  - [ ] 2.11 Use shared announcements for success/failure outcomes.
  - [ ] 2.12 Add component tests for review content, default unselected state, reason requirement, per-student deadline counts, selected-homework replacement deadline, per-homework override, and replacement validation.

- [ ] 3.0 Implement pending update awareness
  - [ ] 3.1 If the teacher closes review without applying updates, retain pending update awareness.
  - [ ] 3.2 Show pending update count on Book/Activity surfaces.
  - [ ] 3.3 Allow teacher to reopen Affected Homework Review later.
  - [ ] 3.4 Clear pending state only when selected updates are applied or source change no longer affects active homework.
  - [ ] 3.5 Add `Pending homework updates` to Unit status only in this packet, after Homework/update data exists.
  - [ ] 3.6 Add tests for close/reopen, Unit status, and pending count behavior.

- [ ] 4.0 Implement selective Activity binding updates
  - [ ] 4.1 Create update action audit record for every confirmed update.
  - [ ] 4.2 Update only selected homework targets.
  - [ ] 4.3 Update only selected Activity bindings within each target.
  - [ ] 4.4 Keep unchanged Activity bindings valid and untouched.
  - [ ] 4.5 Apply new per-Activity version bindings for redo-required and selected added content.
  - [ ] 4.6 Apply Source Version and Page Group/physical-page mapping changes only where selected and valid. Revoke or invalidate stale document authorization before a new pinned Source Version becomes usable; never expose private R2 authority or a teacher-only/unsafe source.
  - [ ] 4.7 Exclude removed Activities from current required scope without deleting historical records.
  - [ ] 4.8 Recalculate completion after update.
  - [ ] 4.9 Guarantee reorder-only updates do not create Review Checkpoints, redo work, grading changes, action-required notifications, or student reset; only display ordering/numbering may recalculate.
  - [ ] 4.10 Guarantee structural-addition-only updates keep existing homework frozen unless the teacher selects active homework targets; existing student work remains valid, no old-work checkpoint is created, and schedule/deadline review is required before adding new required work.
  - [ ] 4.11 Ensure retry does not reopen work twice or duplicate state transitions.
  - [ ] 4.12 When a removed Activity has pending teacher review, remove it from current pending-review workload, retain it in historical/excluded view, preserve existing feedback, and mark it excluded by update/removal.
  - [ ] 4.13 Add idempotency, reorder-only no-op, structural-addition-only no-silent-mutation, removed-pending-review, stale document-authorization invalidation, old-Source denial, and private-authority/unsafe-source denial tests.

- [ ] 5.0 Implement Review Checkpoint creation and Previous Versions display
  - [ ] 5.1 For not-started students, bind latest selected version and create no checkpoint.
  - [ ] 5.2 For in-progress students, seal old affected drafts inside one Review Checkpoint for that update action.
  - [ ] 5.3 For submitted students, preserve old affected submissions inside one Review Checkpoint for that update action.
  - [ ] 5.4 For mixed cases, create one checkpoint summarizing all affected started/submitted Activities.
  - [ ] 5.5 Include only changed Activities the student had started or submitted.
  - [ ] 5.6 Do not copy unchanged Activities.
  - [ ] 5.7 Do not create checkpoints for not-started Activity or removal-only updates.
  - [ ] 5.8 Store old Activity and Source Version links, old Page Group/physical-page mapping and safe page citations, prior answers, prior result/feedback visibility metadata, prior status, teacher reason, and audit context. Do not preserve private object keys or expiring document URLs.
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
  - [ ] 6.7 Show an audit-visible correction note in current result/review when changed answers, rubric, or feedback were already visible to the student.
  - [ ] 6.8 Add tests for answer-key-only and point-only examples plus previously visible correction-note behavior.

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
  - [ ] 8.2 Require replacement deadlines for new or redo-required work according to each student's expired effective deadline.
  - [ ] 8.3 Do not require new deadlines for regrade-only, reorder-only, or removal-only updates.
  - [ ] 8.4 Preserve and evaluate per-student extensions.
  - [ ] 8.5 Always show student’s own previous answers in checkpoints.
  - [ ] 8.6 Show score, correct answers, teacher feedback, and marking details only when release policy permits.
  - [ ] 8.7 Add tests proving force update does not reveal hidden answers early.

- [ ] 9.0 Add full homework update matrix tests
  - [ ] 9.1 Test display-only change for not-started, in-progress, and submitted students.
  - [ ] 9.2 Test regrade-only change for not-started, in-progress, and submitted students.
  - [ ] 9.3 Test redo-required Activity for not-started, in-progress, and submitted students.
  - [ ] 9.4 Test new Activity addition.
  - [ ] 9.5 Test removed Activity exclusion.
  - [ ] 9.6 Test reorder and move behavior, including reorder-only no-checkpoint/no-redo/no-grade-change/no-action-notification guarantees.
  - [ ] 9.7 Test new Unit/Chapter/Section addition, including frozen-by-default existing homework, no old-work checkpoint, valid existing student work, teacher-selected target behavior, and required schedule/deadline review.
  - [ ] 9.8 Test expired deadline handling.
  - [ ] 9.9 Test mixed students whose default deadline is expired but personal extensions differ.
  - [ ] 9.10 Assert unchanged work remains valid, only affected Activities reopen, retry creates no duplicates, stale document authorization cannot be reused after a selected Source Version update, old Source Versions do not silently replace the pinned document, correction notes appear when required, removed pending-review work becomes historical/excluded, and notification metadata/wording matches each case.

- [ ] 10.0 Preserve audit and regression boundaries
  - [ ] 10.1 Ensure update action is audited with teacher ID, reason, selected targets, selected Activities, old/new bindings, deadline decisions, and idempotency key.
  - [ ] 10.2 Ensure audit excludes answer content/PDF content where not required for checkpoint itself.
  - [x] 10.3 Preserve existing Notification Bell behavior for non-Book notifications.
  - [x] 10.4 Preserve existing homework update/detail behavior for non-Book homework.
  - [ ] 10.5 Update findings with final update, checkpoint, notification, and audit owner paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 2.13 Require a teacher reason only when an update changes student work or required scope (redo-required content, added work, or removal/exclusion). Keep reason optional for display-only, reorder-only, and regrade-only answer/feedback changes; show the rule before confirmation and persist the reason in the audit record when supplied or required.
- [ ] 2.14 Verify Affected Homework Review at `1208px`, `768px`, and `375px`: replace the desktop comparison grid with a mobile stacked sequence (target summary, change classification, affected students, deadline decision, reason, confirmation), preserve selected/unselected state, and keep actions keyboard reachable with 44px mobile targets.
- [ ] 4.14 Make update application resumable per target and per student scope. Persist idempotent states `pending`, `in-progress`, `succeeded`, `failed`, and `retryable`; show aggregate and per-target progress; retry only failed work; and prove a crash/retry cannot duplicate checkpoints, binding transitions, audits, or notifications.
- [ ] 7.11 Make notification navigation safe and readable: if a deep destination is unavailable, expired, unauthorized, or deleted, fall back to the owning homework/notification center with an explanatory message; maintain explicit unread/read state and mark read only after the destination or safe fallback is opened.
- [ ] 7.12 Keep persistent notification payloads limited to case, status, affected-count, required-action, and safe destination metadata. Exclude answers, PDF content, hidden provenance, and full diffs; verify fallback/read-state behavior and retry idempotency in Notification Bell/Panel tests.
- [ ] 9.11 Add matrix assertions for resumable partial progress, conditional reason requirement, mobile stacked review state retention, safe fallback destination, and unread/read transitions alongside existing no-duplicate checkpoint/notification guarantees.
