> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST**
>
> **Execution authority:** This root checklist is the sole checkbox owner. Master, recovered, and audit files are reference/provenance only; their checkboxes are not execution boxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
> **Reconciliation marker:** The current canonical PRD and `canonical-task-overrides.json` win for the approved page-authorization rows. Approved Amendment §§1/3 mandatory packet contracts and sequential readiness control remaining conflicts with `9e6e7b2d` risk-scaled/parallel wording. Homework remains a later Full V1 packet; it is not removed.

# Task List: PRD0062 Component 05 - Book Homework

Status: PLANNED. Start bounded slices only from exact reviewed producer inputs in the master dependency graph.

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/homework.types.ts` - Existing homework assignment, scheduling, target, config, and submission contracts to extend with Book Homework manifest support.
- `src/services/homeworkManager.ts` - Existing homework creation/update owner to integrate Book Homework assignment creation.
- `src/services/homeworkSubmissionService.ts` - Existing submission owner to adapt or wrap for Activity-level submissions.
- `src/services/book-homework/bookHomeworkManifest.service.ts` - New Book Homework frozen manifest owner.
- `src/services/book-homework/bookHomeworkSchedule.service.ts` - New nested deadline/release resolution owner.
- `src/services/book-homework/bookHomeworkProgress.service.ts` - New Activity completion aggregation owner.
- `src/services/book-homework/bookHomeworkIntegrity.service.ts` - New per-Activity integrity/anti-cheat mapping owner, if not covered by existing integrity services.
- `src/components/homework/HomeworkCreateModal.tsx` - Existing assignment creation UI to extend for Book/subtree targets.
- `src/pages/TeacherHomeworkDetailPage.tsx` - Existing teacher homework detail page to show Book progress and Activity-level status.
- `src/pages/StudentHomeworkListPage.tsx` - Existing student homework list page to show Book Homework status.
- `src/pages/StudentHomeworkDetailPage.tsx` - Existing student homework detail page to launch and summarize Book Homework.
- `src/pages/StudentPracticePage.tsx` - Existing launcher used by Book Homework runtime launches.

### Notes

- Book Homework is not a hidden variation of one-material homework. It requires an explicit bundle/manifest contract.
- Teacher can assign a whole Book or an eligible structural subtree.
- Assignment pins Activity and Source versions independently per Activity binding, together with the Page Group/physical-page mapping needed for Activity context. It never stores a private object key, provider URL, or expiring document resource.
- Student submits each Activity independently. There is no `Submit Entire Book` button.
- V1 must not show an aggregate Book academic grade.
- Browsing/Solo progress and Homework progress remain separate unless a future explicit product rule changes that.
- Teacher must choose `accountable` or `practice` assignment intent. Integrity defaults ON for accountable work and OFF for practice; an explicit assignment setting may override the default.
- Book integrity is signals-only. Reused detection hooks must sit behind a Book-specific adapter that cannot auto-submit, auto-lock, auto-zero, nullify attempts, or block completion.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, owner/interface, compatibility boundary, focused tests, and changed failure proof here; add a separate Packet 5 contract only for triggered detail that cannot stay concise.

Keep assignment, schedule, integrity-signal, progress, academic-grade boundary, browser, and regression proof distinct. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Amendment-Compliant Packet Contract (Packet 5)

### Storage

Define immutable assignment/manifest/target fields and mutable schedule, draft, attempt, progress, and integrity-signal fields. Record indexes, owner-bound reads/writes, student-safe projections, archive/tombstone/backup/restore behavior, and negative proof for missing pins, placement collisions, cross-owner access, and completion-to-score writes.

### Security/rules

Require teacher/class ownership for creation and update. Permit students only their assigned safe manifest/activity state and own draft/attempt/signal context. Deny direct browser writes to manifests, progress, and integrity records; validate assignment, placement, version, and revision on every mutation.

### UI/accessibility/announcements

Specify whole-Book/subtree selection, inclusion/exclusion preview, effective schedule, intent before integrity override, teacher progress/review, student status/outline, accessible labels, mobile behavior, and shared announcement outcomes with status/alert roles.

### Migration/compatibility

Use an explicit `book_activity_bundle` discriminator without reinterpreting one-material homework. Preserve non-Book fields, dates, overrides, filters, Solo attempts, and legacy score/academic-record fields. Rollback remains additive and leaves legacy records readable.

### Tests

Cover manifest/target, schedule inheritance, drafts/submissions/progress, placement isolation, intent/defaults, UI behavior, and adversarial stale-revision, unauthorized-access, integrity-force-off, score-contamination, and Solo-credit-leakage cases. Record focused runner/config and product-versus-harness result.

### Browser/runtime proof

Use local teacher quick-login on port 5173 and student quick-login on port 5174 to create, view, save, submit, reload, and verify placement isolation. Treat browser proof as local only; it cannot prove rules, CAS, rollback, or remote-faithful behavior.

### Authority reconciliation

Map every ID one-for-one to this canonical checklist, the current canonical PRD, `canonical-task-overrides.json` where applicable, the Approved Amendment, `implementation-audit.md`, `authority-and-provenance.md`, and `reconciliation-ledger.md`. Root task boxes are execution authority; master, recovered, and audit checkboxes are reference only.

### Evidence classification

Classify each claim as `VERIFIED_LOCAL_FAITHFUL`, `NOT_STARTED`, `OFF_SPEC`, or another explicitly named state. Accept `[x]` only for unchanged audited local salvage; changed/new IDs remain open until direct proof and review.

### Rollback/blockers

Failed manifest, schedule, attempt, progress, or signal writes leave prior work readable and unchanged; retries are idempotent. Record blockers, omitted suites, dirty paths, residual risks, and conditional handoff to R5. Do not call this packet VERIFIED or CLOSED from generic-homework or UI-only proof.

## Tasks

- [ ] 1.0 Define Book Homework manifest and assignment target contracts
  - [ ] 1.1 Add Book Homework target type for whole Book and eligible structural subtree.
  - [ ] 1.2 Define frozen assignment manifest with selected Book context, frozen structural outline, schedule rules by stable node ID, and ordered Activity bindings.
  - [ ] 1.3 Include `activityId`, pinned `activityVersionId`, placement context, pinned student-safe `sourceVersionId`, Page Group/one-based physical-page mapping, and required/excluded state per Activity binding. Store no private object key, provider URL, or expiring document resource.
  - [ ] 1.4 Define assignment target preview data for inclusions and exclusions.
  - [ ] 1.5 Ensure archived Books block new Solo launch, new Homework assignment, and new Course/Class placement while preserving existing pinned Homework/Course/Class deliveries subject to their owning schedule/access rules and current Source/page validity.
  - [ ] 1.6 Add manifest contract tests.

- [ ] 2.0 Extend homework creation for whole-Book and subtree assignment, including trusted assignment-derived entitlement issuance
  - [ ] 2.1 Add Book/subtree selection to homework creation using Book-owned selection APIs.
  - [ ] 2.2 Filter to currently published, assignable Activity Placements under the selected subtree.
  - [ ] 2.3 Show assignment preview listing included Activities, excluded/missing Units, pinned source/version details, mapped physical pages, student-safe source readiness, and whether authenticated document delivery is available.
  - [ ] 2.4 Require final due date.
  - [x] 2.5 Preserve existing non-Book homework creation behavior.
  - [ ] 2.6 Add UI and service tests for whole-Book and subtree assignment, atomic entitlement activation/current-pointer supersession, denial before entitlement creation, and rollback when assignment or entitlement persistence fails.

- [ ] 3.0 Implement frozen per-Activity bindings
  - [ ] 3.1 Freeze Activity Version, student-safe Source Version, and Page Group/physical-page mapping per Activity/Placement at assignment creation; do not freeze an expiring document URL or private storage identity.
  - [ ] 3.2 Freeze placement context, Page Group references, canonical page mapping, visible order, title snapshot, and required/excluded state. After the assignment manifest commits, derive each assignment entitlement from the frozen published binding and atomically activate/supersede its current-entitlement pointer. Runtime document authorization later binds the complete pinned student-safe Source Version.
  - [ ] 3.3 Ensure source edits and Activity revisions do not silently mutate existing homework.
  - [ ] 3.4 Ensure publishing a later Unit does not silently add it to existing homework.
  - [ ] 3.5 Add tests proving assignment remains pinned after source, manifest, Activity, structural, Page Group, and page-label changes; selected-update rules control Activity/mapping changes, and stale Source Version document authorization cannot silently advance.

- [ ] 4.0 Implement nested deadlines and scheduled access
  - [ ] 4.1 Implement deadline inheritance: nearest ancestor deadline or assignment final due date.
  - [ ] 4.2 Reject nested deadlines later than parent or final Book due date.
  - [ ] 4.3 Allow deadline extensions at any time.
  - [ ] 4.4 Block unsafe shortening or new shorter nested deadline after affected students start that scope.
  - [ ] 4.5 Preserve existing per-student due-date extensions.
  - [ ] 4.6 Implement Open Access as default.
  - [ ] 4.7 Implement Scheduled Access release inheritance: nearest ancestor release or assignment `availableFrom`.
  - [ ] 4.8 Ensure deadlines do not hide content and released content remains accessible after deadline according to late policy.
  - [ ] 4.9 Enforce V1 no-prerequisite/unlock rule: release dates and deadlines remain separate, and the runtime must not require completing one Chapter/Unit/Activity before another unlocks.
  - [ ] 4.10 Add schedule tests for inheritance, mutation, releases, deadline visibility, per-student extensions, and absence of prerequisite unlock behavior.

- [ ] 5.0 Implement Activity-level submission, completion, and progress aggregation
  - [ ] 5.1 Store unfinished Activity work as drafts.
  - [ ] 5.2 Submit each Activity independently.
  - [ ] 5.3 Automatically mark Book Homework complete/submitted when all current required Activities are submitted.
  - [ ] 5.4 Keep completion and grading status distinct.
  - [ ] 5.5 Display progress as required Activities submitted / required Activities total.
  - [ ] 5.6 Display pending review count and per-Activity score where allowed.
  - [ ] 5.7 Mark removed historical rows as excluded without deleting old result records.
  - [ ] 5.8 Never write Book completion progress into legacy `HomeworkSubmission.percentage`, `score`, `maxScore`, `bandScore`, or academic-record grade fields.
  - [ ] 5.9 Keep assigned completion placement-scoped by student, assignment/Course material, Placement, Activity, and Activity Version; one placement must not complete another.
  - [ ] 5.10 Add tests for progress aggregation, legacy score-field isolation, and the same Activity appearing in two placements.

- [ ] 6.0 Adapt homework settings per Activity
  - [ ] 6.1 Apply `maxAttempts` per Activity attempt within the Book Homework delivery context.
  - [ ] 6.2 Apply feedback timing per Activity result.
  - [ ] 6.3 Apply late policy per Activity according to inherited deadline.
  - [ ] 6.4 Keep all personal-timer state out of V1 Homework settings. If a V1.1 timer is later approved, it remains academically inert and separate from assignment/deadline/integrity state.
  - [ ] 6.5 Add tests proving Solo attempts do not consume Homework attempt limits unless future policy defines it.
  - [ ] 6.6 Add tests proving feedback timing and late policy are Activity/delivery scoped.

- [ ] 7.0 Implement Book Homework anti-cheat/integrity mapping
  - [ ] 7.1 Require teacher to choose or confirm `accountable` or `practice` assignment intent.
  - [ ] 7.2 Default integrity ON for accountable work and OFF for practice.
  - [ ] 7.3 Allow override only through an explicit assignment setting and store intent, default, override, and effective state in assignment metadata.
  - [ ] 7.4 Put reused detection hooks behind a Book-specific adapter that forces auto-submit, auto-lock, auto-zero, remaining-attempt nullification, and completion blocking OFF.
  - [ ] 7.5 Record focus/tab/paste/session events per Activity attempt.
  - [ ] 7.6 Warn student immediately after a recorded event.
  - [ ] 7.7 Escalate integrity severity for repeated events without applying automatic academic consequences.
  - [ ] 7.8 Use `recorded events` and `integrity signals` language; never claim cheating is proven or the workflow is cheat-proof/proctored.
  - [ ] 7.9 Show Activity integrity report and explicit severity display to teacher after submission.
  - [ ] 7.10 Do not add live teacher integrity monitoring for Book Homework V1.
  - [ ] 7.11 Do not add special post-homework consequence workflows or built-in action buttons for flagged work.
  - [ ] 7.12 Do not expose post-submission integrity log/status/count/severity to students.
  - [ ] 7.13 Add tests proving intent defaults/overrides, severity display, no post-homework consequence/buttons, and that integrity can never auto-submit, auto-lock, auto-zero, nullify attempts, or prevent completion.

- [ ] 8.0 Update teacher and student homework surfaces
  - [ ] 8.1 Update HomeworkCreateModal for Book/subtree target selection, preview, nested deadlines, scheduled access, visible assignment-intent selection before the integrity control, and explicit integrity override.
  - [ ] 8.2 Update TeacherHomeworkDetailPage with Book progress, per-Activity status, pending review, excluded rows, and integrity report after submission.
  - [ ] 8.3 Update StudentHomeworkListPage with Book Homework progress and status.
  - [ ] 8.4 Update StudentHomeworkDetailPage with Book outline, schedule state, Activity status, and launch links.
  - [ ] 8.5 Use shared announcements for assignment create/update outcomes.
  - [ ] 8.6 Add accessible labels and mobile behavior according to student/teacher rules.
  - [ ] 8.7 Add component tests and browser verification notes.

- [ ] 9.0 Preserve existing homework behavior and regression tests
  - [x] 9.1 Preserve existing quiz/test/thcs/reading-passage/reading-passage-set homework creation.
  - [x] 9.2 Preserve existing assignment-level `availableFrom`, `dueDate`, and per-student override behavior for non-Book homework.
  - [x] 9.3 Preserve existing homework list/detail filtering.
  - [x] 9.4 Add regression tests for existing homework create/detail/list flows.
  - [ ] 9.5 Update findings with final Book Homework manifest, schedule, progress, and integrity owner paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 1.7 Define an explicit inclusion/exclusion reason taxonomy for every assignment-preview row (for example: included, not published, missing student-safe source readiness, document delivery unavailable, invalid Activity, unresolved mapping, placeholder/not assignable, duplicate, or outside selected subtree). Persist reason codes and teacher-readable explanations; counts must reconcile with the selected target.
- [ ] 2.7 Show an effective schedule preview before confirmation: assignment and nearest-ancestor release/deadline, per-student extension example, teacher/student timezone labels, DST-safe rendered timestamps, and late-policy result for each included scope. Block confirmation when an effective deadline is invalid or ambiguous.
- [ ] 2.8 Use progressive disclosure in create/detail surfaces: first show target, included/excluded counts, effective dates, intent, and blocking issues; expand per-Activity/source/version/reason details on demand without hiding required decisions. Preserve expanded state on validation errors and reload where practical.
- [ ] 5.11 Publish a clear status taxonomy with deterministic precedence and accessible text: `not-started`, `in-progress`, `submitted`, `review-required`, `excluded`, `overdue`, `scheduled`, `unavailable`, and `complete`. Status must not rely on color alone, and summary counts must equal per-Activity rows.
- [ ] 7.14 Show privacy and limitation notices at the assignment setting and student warning boundary: integrity captures signals/events only, is not proof of cheating or proctoring, does not inspect unrelated browsing/content, and never auto-submits, locks, zeroes, nullifies, or blocks completion. Student-facing notice must not expose post-submission event logs or severity.
- [ ] 8.8 Verify responsive homework review at `1208px`, `768px`, and `375px`: target/schedule/status details stack progressively, no horizontal overflow occurs, expanded inclusion/exclusion reasons remain readable, and all visible mobile controls meet the 44px target with keyboard/screen-reader labels.
