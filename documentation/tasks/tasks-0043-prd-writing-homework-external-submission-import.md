# Tasks: PRD-0043 - Writing Homework External Submission Import

> Goal: let teachers import off-app IELTS Writing homework submissions from the Grading tab, then grade them through the existing Writing grading system.
> Branch/worktree: `codex/writing-homework-import` in `C:\Users\The Lord\Desktop\luyentap-writing-import`.
> Primary UI placement: Teacher View -> Grading -> IELTS Writing -> `Import submission`.
> Core data rule: create real `writing_submissions/{submissionId}` records and matching homework/result projections. Do not create RTDB-only result rows.
> Corrective rebase rule added 2026-05-08: the original worktree was based on stale `origin/main`. It is donor/evidence only. Release work now happens on `codex/writing-homework-import-rebased` in `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`, based on corrected `origin/main` at `dcfa10f`.

---

## Relevant Files

### New Files

- `src/services/writingExternalSubmissionImport.service.ts` - Teacher import orchestration for external homework Writing submissions.
- `src/services/writingExternalSubmissionImport.service.test.ts` - Unit tests for validation, duplicate policy, homework submission linkage, and result materialization calls.
- `src/components/writing-grading/ImportWritingSubmissionModal.tsx` - Grading-tab modal for selecting homework, student, task text, submitted time, and source note.
- `src/components/writing-grading/ImportWritingSubmissionModal.css` - Modal layout and responsive styling.
- `src/components/writing-grading/ImportWritingSubmissionModal.test.tsx` - UI tests for the import workflow and validation states.
- Browser evidence - Live Playwright MCP verification for teacher quick-login, Grading tab visibility, import modal, duplicate guard, queue appearance, and grade-entry navigation.
- `documentation/tasks/findings-of-tasks-0043-prd-writing-homework-external-submission-import.md` - Append-only findings discovered during implementation.

### Existing Files To Inspect Or Modify

- `src/pages/TeacherGradingPage.tsx` - Place `Import submission` in the IELTS Writing grading tab and wire modal open/import/refresh actions.
- `src/pages/TeacherGradingPage.css` or page-adjacent styling - Keep queue header and import action stable on desktop and mobile.
- `src/services/writingSubmissionService.ts` - Reuse `createSubmission()`, `materializeSubmissionResult()`, and pending queue contracts.
- `src/services/homeworkSubmissionService.ts` - Reuse or extend homework submission creation/submission helpers without duplicating stats logic.
- `src/services/homeworkManager.ts` - Load teacher-owned Writing homework options.
- `src/hooks/useHomeworkList.ts` - Reuse teacher homework loading only if it fits the Grading-tab modal without hidden broad subscriptions.
- `src/types/ielts-writing.types.ts` - Add minimal import-origin metadata only if existing context/audit fields cannot safely represent it.
- `src/types/homework.types.ts` - Add minimal administrative import metadata only if needed by homework submission rows.
- `src/config/featureRegistry.ts` - Register all new Grading actions, including import open, validation failure, submit, success, duplicate block, and grade-now navigation.
- `documentation/architecture/ielts-writing/lifecycle-and-surfaces.md` - Update if the Grading tab gains an explicit import intake role.
- `documentation/architecture/homework-solo-practice-architecture.md` - Update if homework attempt/import semantics change.
- `firestore.rules` - Touch only if new fields or write paths require rule updates.

### Mandatory Rules To Read Before Code

- `DESIGN.md` - UI/UX design gate for Grading tab and modal.
- `documentation/rules/observability.md` - New user-facing actions and tracking.
- `documentation/rules/codebase-hygiene.md` - Imports, no Mantine additions, and producer-consumer write contract.
- `documentation/rules/infrastructure.md` - DB side effects, shared IDs, and rules checks.
- `documentation/rules/react-patterns.md` - New component and loading/pending state safety.
- `documentation/rules/navigation.md` - `Grade now` navigation to existing route.
- `documentation/tasks/process-task-list.md` - Completion protocol, findings file, and commit discipline.

---

## Acceptance Criteria

- [x] `Import submission` is visible in Teacher View -> Grading -> IELTS Writing, not as the primary entry on Homework Detail.
- [x] Import modal requires teacher-owned Writing homework, target student, at least one valid task response, submitted time, and optional source note.
- [x] Import creates a real pending `WritingSubmission` that appears in the same IELTS Writing grading queue after refresh.
- [x] Import also creates/updates the matching `homework_submissions` record so Homework Detail shows `submitted` with `resultId`, attempt number, submitted time, late state, and later `graded` after publish.
- [x] Duplicate policy blocks accidental overwrite of existing submitted or graded work by default.
- [x] Imported work is marked as external/admin import for audit and integrity interpretation, without treating it as student paste cheating.
- [x] `Import and grade now` routes to `/teacher/grading/writing/:submissionId` through route constants/navigation helpers.
- [x] Student-facing result state remains pending-review until teacher publishes grading.
- [x] Feature tracking records import open, validation failures, duplicate block, import submit, import success, import failure, and grade-now navigation.
- [x] Unit, integration, live browser, loop check, and rigorous review tasks all pass before release.
- [x] Corrective rebase branch is created from fixed `origin/main` and contains only PRD-0043 Writing import deltas, not stale-base modern grading backports or PRD-0049 docs.
- [x] Fresh post-rebase verification passes on the corrected base.

---

## Tasks

### 0. Branch And Baseline Safety

- [x] 0.1 Verify current working directory is `C:\Users\The Lord\Desktop\luyentap-writing-import`.
- [x] 0.2 Verify active release branch is `codex/writing-homework-import-rebased`; original `codex/writing-homework-import` remains donor/evidence only.
- [x] 0.3 Confirm `origin/main` baseline is intended and no polluted Reading V2/Obsidian changes exist in this worktree.
- [x] 0.4 Read all mandatory rule files listed above before implementation.
- [x] 0.5 Create the findings file and keep it append-only after each completed subtask with notable evidence or drift.

### 1. Current-Contract Audit

- [x] 1.1 Trace current Writing queue flow from `TeacherGradingPage.tsx` to `getPendingSubmissions()` and `/teacher/grading/writing/:submissionId`.
- [x] 1.2 Trace current homework Writing submit flow in `WritingPracticeView.tsx`, including `createSubmission()`, `materializeSubmissionResult()`, and `submitHomework()`.
- [x] 1.3 Trace Homework Detail consumer expectations for `homework_submissions`, especially status, attempt number, `resultId`, submitted time, late state, and grade transition.
- [x] 1.4 Trace result consumers for Writing submissions and confirm imported records satisfy Firestore and RTDB projection requirements.
- [x] 1.5 Decide exact metadata shape for external import audit without creating a new collection unless required.
- [x] 1.6 Document duplicate policy, attempt policy, late policy, and grade-now routing in the findings file.

### 2. Import Data Contract

- [x] 2.1 Define import input type with `homeworkId`, `studentId`, `studentName`, task responses, submitted time, source note, and `importerTeacherId`.
- [x] 2.2 Validate homework ownership: homework must belong to current teacher and `materialSkill` must be `writing`.
- [x] 2.3 Resolve the writing material snapshot from homework `materialId` and preserve task prompt metadata.
- [x] 2.4 Validate task compatibility: Task 1/Task 2 inputs must match the writing test format and reject empty active tasks.
- [x] 2.5 Resolve target student from homework target roster or existing homework submissions; block unassigned students unless an explicit future task adds override support.
- [x] 2.6 Define duplicate handling: block if latest submission for same homework/student is `submitted` or `graded`; handle `in_progress` with explicit confirmation only if implemented.
- [x] 2.7 Define late-state calculation from selected submitted time and existing homework deadline/override rules.

### 3. Import Service Foundation

- [x] 3.1 Add `writingExternalSubmissionImport.service.ts` with one exported import function wrapped in `withRestoreGuard()`.
- [x] 3.2 Reuse existing helper services where possible instead of duplicating homework stats, result projection, or writing submission creation logic.
- [x] 3.3 Generate one stable shared `submissionId/resultId` and use it across Firestore Writing, Homework submission, and RTDB result projection.
- [x] 3.4 Create the canonical `WritingSubmission` with `context.type = 'homework'`, `homeworkId`, `homeworkSubmissionId`, `assigningTeacherId`, `markingStatus = 'pending-review'`, embedded task prompts, essay text, word count, elapsed time fallback, and import audit metadata.
- [x] 3.5 Create or update the matching `homework_submissions` row to `submitted` using the same ID contract and existing stats behavior.
- [x] 3.6 Call `materializeSubmissionResult()` after writing the Firestore submission and fail loudly if projection fails.
- [x] 3.7 Do not notify the student as if they submitted through the app unless owner explicitly approves notification behavior.
- [x] 3.8 Return enough data for UI to refresh queue and optionally navigate to the grading detail page.

### 4. Service Tests

- [x] 4.1 Add tests for successful Task 2-only homework import.
- [x] 4.2 Add tests for full-test import with Task 1 and Task 2 word counts.
- [x] 4.3 Add tests for teacher ownership rejection.
- [x] 4.4 Add tests for non-writing homework rejection.
- [x] 4.5 Add tests for unassigned student rejection.
- [x] 4.6 Add tests for duplicate submitted/graded block.
- [x] 4.7 Add tests proving the same ID links Writing submission, homework submission, and result projection.
- [x] 4.8 Add tests proving imported pending-review submissions are visible to `getPendingSubmissions(importerTeacherId)`.

### 5. Grading Tab UI And Workflow

- [x] 5.1 Add `Import submission` button to the IELTS Writing tab header in `TeacherGradingPage.tsx`.
- [x] 5.2 Track button click as a Grading feature action.
- [x] 5.3 Build `ImportWritingSubmissionModal` with homework selector, student selector, task response fields, submitted time input, source note, cancel, import, and import-and-grade-now actions.
- [x] 5.4 Load only teacher-owned Writing homework options for the modal.
- [x] 5.5 Populate student options from homework target/submission data and show clear disabled states when roster data is unavailable.
- [x] 5.6 Mirror selected writing test format so only valid task fields are shown.
- [x] 5.7 Show validation messages near fields and an overall error region for service failures.
- [x] 5.8 After import success, close modal, refresh Writing queue, and show the imported row without a full page reload.
- [x] 5.9 `Import and grade now` navigates to `TEACHER_GRADING_DETAIL` via route constants/navigation helper, not hard-coded string concatenation.
- [x] 5.10 Keep UI consistent with `DESIGN.md`: compact teacher-workflow controls, stable spacing, no nested cards, no new Mantine imports, and mobile-safe modal layout.

### 6. Observability, Routing, And Docs

- [x] 6.1 Add new Grading feature actions in `src/config/featureRegistry.ts`.
- [x] 6.2 Track modal open, homework select, student select, validation failure, duplicate block, import submit, import success, import failure, and grade-now navigation.
- [x] 6.3 Update architecture docs if import adds a named teacher intake role to the Writing lifecycle.
- [x] 6.4 Update homework architecture docs if import changes attempt/status semantics.
- [x] 6.5 Confirm Firestore rules and backup coverage remain valid because no new collection is created; if a new path is introduced, complete infrastructure Rule 12.

### 7. Loop Check: Intended Feature And Logical Workflow

- [x] 7.1 Re-open the tasklist and compare implementation against the original user intent: off-app Writing homework imported into app for grading in one place.
- [x] 7.2 Verify the primary visible entry is exactly Teacher View -> Grading -> IELTS Writing -> `Import submission`.
- [x] 7.3 Verify workflow order is logical: choose homework -> choose student -> paste response -> import -> pending queue -> grade.
- [x] 7.4 Verify Homework Detail remains synchronized after import and after publish.
- [x] 7.5 Verify no feature path depends on polluted Reading V2/Obsidian worktree changes.
- [x] 7.6 Append loop-check findings and any corrections to the findings file before marking this parent complete.

### 8. Automated Verification

- [x] 8.1 Run targeted service tests: `cmd /c npx vitest run src/services/writingExternalSubmissionImport.service.test.ts --reporter=basic`.
- [x] 8.2 Run targeted modal/page tests: `cmd /c npx vitest run src/components/writing-grading/ImportWritingSubmissionModal.test.tsx src/pages/TeacherGradingPage.test.tsx --reporter=basic`.
- [x] 8.3 Run existing Writing grading tests affected by import: `cmd /c npx vitest run src/services/writingSubmissionService.test.ts src/services/homeworkSubmissionService.test.ts src/pages/WritingGradingPage.test.tsx --reporter=basic`.
- [x] 8.4 Run feature registry tests if changed: `cmd /c npx vitest run src/config/featureRegistry.test.ts --reporter=basic`.
- [x] 8.5 Run UTF-8 guard for changed files: `cmd /c npm run check:utf8 -- <changed paths>`.
- [x] 8.6 If any targeted test is missing in `origin/main`, create or adjust the smallest useful coverage instead of skipping silently.

### 9. Live Browser Test

- [x] 9.1 Start dev server from this clean worktree, using the repo's Windows command rules for Vite.
- [x] 9.2 Open the app in a real browser automation surface.
- [x] 9.3 Use the login page dev quick-login: reveal bottom-right settings, click `Teacher`.
- [x] 9.4 Navigate to Teacher View -> Grading -> IELTS Writing.
- [x] 9.5 Capture evidence that `Import submission` is visible in the Grading tab.
- [x] 9.6 Import a test homework writing submission for a real/dev assigned student.
- [x] 9.7 Verify imported row appears in the Writing queue with Homework source and pending-review state.
- [x] 9.8 Click `Grade` or `Import and grade now` and verify `WritingGradingPage` opens with the imported essay text and correct task prompt.
- [x] 9.9 Publish or stop before publish depending on dev data safety; if publishing, verify Homework Detail status changes to `graded`.
- [x] 9.10 Capture desktop and mobile screenshots proving modal layout, queue row, and grade-entry path.

### 10. Rigorous Review

- [x] 10.1 Review diff for accidental old-worktree changes, Reading V2 changes, Obsidian changes, generated output, and `.codex/` files.
- [x] 10.2 Review producer-consumer contract: Firestore Writing, homework submission, RTDB result projection, queue reader, Homework Detail reader, student result reader.
- [x] 10.3 Review security: teacher ownership, assigned student scope, duplicate protection, no broad read/write rule, no imported score visibility before publish.
- [x] 10.4 Review UX: button placement, modal field order, validation language, error recovery, grade-now path, responsive layout.
- [x] 10.5 Review observability: every user-facing action has registered `trackAction()` and no hard-coded feature IDs.
- [x] 10.6 Review tests and live evidence before marking tasks done.
- [x] 10.7 Append final review notes and residual risks to findings file.

### 11. Release To Main

- [x] 11.1 Re-run `git status --short --branch` and verify only intended files changed.
- [x] 11.2 Run final targeted test set after review fixes.
- [x] 11.3 Stage intended files only.
- [x] 11.4 Commit with conventional commit message referencing PRD-0043.
- [ ] 11.5 Push `codex/writing-homework-import-rebased`.
- [ ] 11.6 Merge to `main` through the chosen release path immediately after green verification.
- [ ] 11.7 After merge, verify main contains the feature and the polluted original checkout remains untouched.

### 12. Corrective Modern Grading Stack Recheck

- [x] 12.1 Recheck the user-reported gap that this branch's grading UI/editor was outdated compared with the live site.
- [x] 12.2 Port the current live Writing grading page, editor components, suggestion workflow, grading lock services, and supporting types/utilities into this worktree.
- [x] 12.3 Preserve PRD-0043 import behavior after the live-stack port: external import metadata, homework submission linkage, queue refresh, and grade-now navigation.
- [x] 12.4 Add and deploy Firestore rules for the modern editor's `writing_grading_ai_cache` reads/writes.
- [x] 12.5 Re-run the focused Writing import/grading regression set after the port.
- [x] 12.6 Re-open the imported grading detail in browser and verify the modern editor surface loads without permission errors.
- [x] 12.7 Refresh screenshot evidence so the grading-detail image shows the modern editor, not the stale branch editor.

### 13. Corrective Rebase After PRD-0049

- [x] 13.1 Treat `C:\Users\The Lord\Desktop\luyentap-writing-import` / `codex/writing-homework-import` as donor/evidence only because it was based on stale `origin/main`.
- [x] 13.2 Create `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` on `codex/writing-homework-import-rebased` from corrected `origin/main` at `dcfa10f`.
- [x] 13.3 Port only PRD-0043 Writing import-specific service, UI, type, feature-tracking, rule/doc, and test deltas.
- [x] 13.4 Exclude PRD-0049 docs, broad modern grading-stack backports already present on corrected main, Reading V2/Obsidian/noise, generated screenshots, and unrelated dirty work.
- [x] 13.5 Re-run targeted service, modal/page, Writing grading, feature registry, UTF-8, diff, and build checks on the rebased branch.
- [x] 13.6 Re-run browser verification or record why existing live evidence is insufficient after the rebase.
- [ ] 13.7 Commit and push `codex/writing-homework-import-rebased`, then retire the stale donor branch from release consideration.
