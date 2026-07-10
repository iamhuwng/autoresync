# Task List: PRD0062 Component 05 - Book Homework

Status: Draft task list. Execute only through the master orchestration packet order.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

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
- Assignment pins Activity and Source versions independently per Activity binding.
- Student submits each Activity independently. There is no `Submit Entire Book` button.
- V1 must not show an aggregate Book academic grade.
- Browsing/Solo progress and Homework progress remain separate unless a future explicit product rule changes that.
- Teacher must choose `accountable` or `practice` assignment intent. Integrity defaults ON for accountable work and OFF for practice; an explicit assignment setting may override the default.
- Book integrity is signals-only. Reused detection hooks must sit behind a Book-specific adapter that cannot auto-submit, auto-lock, auto-zero, nullify attempts, or block completion.

## Packet Contract And Closure Addendum

Before source changes in this component:

- [ ] Create or update `documentation/tasks/PRD0062/contracts-book-activity-packet-5.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections.
- [ ] Map every Book Homework claim to PRD section, source owner, test title, negative proof where applicable, architecture/current-state doc, findings row, traceability row, and taskbox ID.
- [ ] Classify proof separately as local source proof, homework service proof, schedule proof, integrity-signal proof, browser proof, regression proof, or not required for Packet 5.
- [ ] Keep Book Homework completion/progress proof separate from academic score proof. Progress aggregation must not be represented as an aggregate grade.
- [ ] Keep phase state explicit. A successful assignment creation flow may move work to `IMPLEMENTED_UNREVIEWED`; it does not make the packet `CLOSED`.

Before completing this component:

- [ ] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted homework, schedule, integrity, progress, score, or assignment claims.
- [ ] Request review only after source, tests, findings, traceability, and docs are updated and inspectable.
- [ ] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [ ] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, grade-boundary proof, and unresolved blockers.

## Tasks

- [ ] 1.0 Define Book Homework manifest and assignment target contracts
  - [ ] 1.1 Add Book Homework target type for whole Book and eligible structural subtree.
  - [ ] 1.2 Define frozen assignment manifest with selected Book context, frozen structural outline, schedule rules by stable node ID, and ordered Activity bindings.
  - [ ] 1.3 Include `activityId`, pinned `activityVersionId`, placement context, `sourceVersionId`, and required/excluded state per Activity binding.
  - [ ] 1.4 Define assignment target preview data for inclusions and exclusions.
  - [ ] 1.5 Ensure archived Books block new assignment while preserving existing pinned deliveries.
  - [ ] 1.6 Add manifest contract tests.

- [ ] 2.0 Extend homework creation for whole-Book and subtree assignment
  - [ ] 2.1 Add Book/subtree selection to homework creation using Book-owned selection APIs.
  - [ ] 2.2 Filter to currently published, assignable Activity Placements under the selected subtree.
  - [ ] 2.3 Show assignment preview listing included Activities, excluded/missing Units, and relevant source/version details.
  - [ ] 2.4 Require final due date.
  - [ ] 2.5 Preserve existing non-Book homework creation behavior.
  - [ ] 2.6 Add UI and service tests for whole-Book and subtree assignment.

- [ ] 3.0 Implement frozen per-Activity bindings
  - [ ] 3.1 Freeze Activity version and Source Version per Activity at assignment creation.
  - [ ] 3.2 Freeze placement context, Page Group references, visible order, title snapshot, and required/excluded state.
  - [ ] 3.3 Ensure source edits and Activity revisions do not silently mutate existing homework.
  - [ ] 3.4 Ensure publishing a later Unit does not silently add it to existing homework.
  - [ ] 3.5 Add tests proving assignment remains pinned after source, manifest, Activity, and structural changes.

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
  - [ ] 6.4 Keep optional personal runtime timer academically inert and separate from homework settings.
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
  - [ ] 9.1 Preserve existing quiz/test/thcs/reading-passage/reading-passage-set homework creation.
  - [ ] 9.2 Preserve existing assignment-level `availableFrom`, `dueDate`, and per-student override behavior for non-Book homework.
  - [ ] 9.3 Preserve existing homework list/detail filtering.
  - [ ] 9.4 Add regression tests for existing homework create/detail/list flows.
  - [ ] 9.5 Update findings with final Book Homework manifest, schedule, progress, and integrity owner paths.
