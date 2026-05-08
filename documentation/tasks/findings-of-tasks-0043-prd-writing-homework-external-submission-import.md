# Findings: PRD-0043 - Writing Homework External Submission Import

## 2026-05-08 - Corrective Rebase After PRD-0049

- The original PRD-0043 worktree `C:\Users\The Lord\Desktop\luyentap-writing-import` is based on stale `origin/main` and must not be merged as-is.
- PRD-0049 has repaired `origin/main`; remote `main` is now `dcfa10f810366162484426b6988deef01a762775`.
- Created new release worktree `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` on branch `codex/writing-homework-import-rebased` from corrected `origin/main`.
- Copied PRD-0043 task and findings docs into the rebased worktree as the active task packet.
- Donor worktree remains useful for feature slices and evidence only. Release proof must be rerun on the rebased branch.
- Porting rule: bring only Writing import deltas; do not wholesale carry the stale branch's modern grading-stack backport, PRD-0049 docs, Reading V2/Obsidian/noise, generated screenshots, or unrelated dirty work.

## 2026-05-08 - Corrective Rebase Port Evidence

- Ported PRD-0043-specific new files:
  - `src/services/writingExternalSubmissionImport.service.ts`
  - `src/services/writingExternalSubmissionImport.service.test.ts`
  - `src/components/writing-grading/ImportWritingSubmissionModal.tsx`
  - `src/components/writing-grading/ImportWritingSubmissionModal.css`
  - `src/components/writing-grading/ImportWritingSubmissionModal.test.tsx`
  - `src/pages/TeacherGradingPage.test.tsx`
- Ported narrow existing-file deltas:
  - `src/pages/TeacherGradingPage.tsx`
  - `src/services/homeworkSubmissionService.ts`
  - `src/services/homeworkSubmissionService.test.ts`
  - `src/services/writingSubmissionService.ts`
  - `src/services/writingSubmissionService.test.ts`
  - `src/types/homework.types.ts`
  - `src/types/ielts-writing.types.ts`
  - `src/config/featureRegistry.ts`
  - `firestore.rules`
  - `documentation/architecture/ielts-writing/lifecycle-and-surfaces.md`
  - `documentation/architecture/homework-solo-practice-architecture.md`
- Explicitly excluded broad stale-branch files: Writing suggestion stack, grading editor backport files, screenshots, PRD-0049 docs, Reading V2 files, Obsidian/noise, and generated output.

## 2026-05-08 - Corrective Rebase Verification

- Rebased branch verification passed on `codex/writing-homework-import-rebased` from corrected `origin/main` at `dcfa10f`.
- Focused service verification passed: `writingExternalSubmissionImport.service.test.ts`, `homeworkSubmissionService.test.ts`, and `writingSubmissionService.test.ts` ran with 32 tests passing.
- Focused UI and registry verification passed: `ImportWritingSubmissionModal.test.tsx`, `TeacherGradingPage.test.tsx`, `WritingGradingPage.test.tsx`, and `featureRegistry.test.ts` ran with 22 tests passing.
- UTF-8 guard passed for the changed PRD-0043 text/code files, `git diff --check` passed, and `node scripts/pre-commit-enforcement.js --check` passed.
- Production build passed with `NODE_OPTIONS=--max-old-space-size=2048` and test Firebase environment values.
- Live browser verification reran from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` on `http://localhost:5175/` using the repo `.env` values inherited from the canonical checkout. Teacher dev quick-login succeeded, `/teacher/grading/writing` loaded with zero console errors, and `Import submission` opened the IELTS Writing homework modal.
- Post-rebase import attempt for existing dev homework/student hit the expected duplicate guard: `This student already has submitted or graded work for this homework`. This proves the rebased UI/service path reached the live duplicate policy without creating another record.
- Queue/detail verification passed after closing the modal: existing imported drafts remained visible in the Writing queue, and `/teacher/grading/writing/-Os5FwCs8Kas9owQatvW` loaded the modern Writing grading surface with imported essay text, prompt/sidebar tabs, and zero console errors.
- No committed e2e spec was ported from the stale donor branch; browser evidence was captured through Playwright MCP for this corrective rebase pass.
- Release path completed after green CI: PR #2 (`https://github.com/iamhuwng/autoresync/pull/2`) merged to `main` with merge commit `3c67b2e0a18090bb05c69a3a15e253c8eba36a5f`.
- Post-merge verification: `origin/main` points at `3c67b2e0a18090bb05c69a3a15e253c8eba36a5f` and contains the PRD-0043 feature commits (`f752c78`, `3558bca`, `a01f6ae`).
- The stale donor checkout `C:\Users\The Lord\Desktop\luyentap-writing-import` remains donor/evidence only; no release staging, commit, or merge was performed from that polluted branch.

## 2026-05-08 - Baseline Safety

- Current path verified with `git -C C:\Users\The Lord\Desktop\luyentap-writing-import rev-parse --show-toplevel`: `C:/Users/The Lord/Desktop/luyentap-writing-import`.
- Branch verified with `git -C ... branch --show-current`: `codex/writing-homework-import`.
- Baseline status from `git -C ... status --short --branch`: branch tracks `origin/main`; only `documentation/tasks/tasks-0043-prd-writing-homework-external-submission-import.md` was untracked at start.
- No Reading V2, Obsidian, or unrelated polluted worktree changes were present in the `luyentap-writing-import` worktree baseline.
- Mandatory `DESIGN.md` was not present at repo root. Nearest available design gate read instead: `documentation/architecture/ui-design-standards.md`.
- Mandatory rule files read before code: observability, codebase hygiene, infrastructure, react patterns, navigation, process task list, mobile portability, and observability-tracking skill.

## 2026-05-08 - Current Contract Audit

- Writing grading queue source is `TeacherGradingPage.tsx` calling `getPendingSubmissions(user.uid)` when the IELTS Writing tab is active. Pending queue reads `writing_submissions` where `markingStatus == 'pending-review'`, then client-filters by `context.assigningTeacherId` or `context.selectedTeacherId`.
- Grade entry already uses navigation helper: `navigateTo('TEACHER_GRADING_DETAIL', { submissionId })`; route constants are `TEACHER_GRADING_QUEUE` and `TEACHER_GRADING_DETAIL`.
- Homework writing submit flow creates a canonical `WritingSubmission`, materializes the RTDB result projection with the same ID, then calls `submitHomework(homeworkSubmissionId, resultId, ...)`.
- Homework Detail consumers read `homework_submissions` status, attempt number, resultId, submittedAt, and late state directly, so import must create/update that Firestore row, not only RTDB result indexes.
- Student result surfaces depend on pending `markingStatus` staying `pending-review` until publish; publish later calls `markHomeworkSubmissionGraded()`.
- Drift found: writing result projection maps homework context to result context with `attemptNumber: 1`; PRD-0043 import should carry real attempt metadata so result provenance is not lossy.
- Duplicate policy chosen for implementation: block latest `submitted` or `graded`; reuse/update latest `in_progress` only as the controlled bridge row for this import.
- Late policy chosen for implementation: compute from selected submitted time against `getEffectiveHomeworkDueDate(homework, studentId)`.
- Audit metadata shape chosen: add optional fields on existing `WritingSubmission.context` and `HomeworkSubmission` for `importedExternally`, `importedByTeacherId`, `importedAt`, `importSource`, and `sourceNote`; no new collection.

## 2026-05-08 - Implementation Evidence

- Metadata implementation correction: final code uses structured `context.externalImport` on `WritingSubmission` and `administrativeImport` on `HomeworkSubmission`, both with `source: external-admin-import`, `importedByTeacherId`, `importedAt`, and optional `sourceNote`.
- Import service added in `src/services/writingExternalSubmissionImport.service.ts`. It validates teacher ownership, writing skill, material shape, active task responses, assigned roster, duplicate status, late state, stable shared ID, Firestore Writing creation, homework submission bridge, and RTDB result materialization.
- Homework helper added in `src/services/homeworkSubmissionService.ts` as `submitImportedHomeworkSubmission()`. It creates new submitted homework rows or reuses latest `in_progress`, while preserving existing submitted/graded duplicate block.
- Queue UI added in `TeacherGradingPage.tsx`: IELTS Writing tab shows `Import submission`; success refreshes pending queue and `Import and grade now` uses `navigateTo('TEACHER_GRADING_DETAIL', { submissionId })`.
- Observability actions registered under `FEATURE_IDS.grading`: modal open, homework/student select, validation failure, duplicate block, submit, success, failure, and grade-now.
- Architecture docs updated for the named Writing intake role and administrative homework attempt semantics.
- Verification passed: `writingExternalSubmissionImport.service.test.ts` 9 tests, import modal/page tests 5 tests, affected writing/homework service tests 17 tests, feature registry tests 10 tests.
- Verification environment drift: this worktree did not contain `node_modules`; a local untracked junction to the sibling checkout's `node_modules` was created so Vitest could load the existing toolchain.

## 2026-05-08 - Loop Check, Live Evidence, And Final Review

- Loop check matches original intent: external/off-app IELTS Writing homework enters from Teacher View -> Grading -> IELTS Writing -> `Import submission`, then choose homework -> choose student -> paste task response -> import -> queue -> grade.
- Live browser check used dev quick-login as `Teacher` on `http://localhost:5174/`, imported a real dev assigned student's Task 2 homework response, refreshed the Writing queue, and opened `/teacher/grading/writing/:submissionId` with the imported essay and prompt visible.
- Live dev IDs used for verification: `homeworkId=codex-writing-import-homework-1778221459436`, `materialId=codex-writing-import-material-1778221459436`, successful `submissionId=-Os5GCkAPRRP1rw69Ehv`.
- Firestore rules were deployed to dev project `temp-a1437` after tightening teacher-created `homework_submissions` writes to require matching `homework_assignments/{homeworkId}.createdBy` and administrative import metadata.
- Corrections from final review: Task 2-only grading now chooses the first available task instead of defaulting to Task 1; import visibility uses server-preferred reads plus one short retry; in-progress homework attempts now require explicit modal confirmation before reuse.
- Final focused verification passed: 44 tests across import service, modal/page wiring, homework submission helper, writing submission service, and feature registry.
- UTF-8 guard passed for 19 changed text files. `git diff --check` was rerun after removing one markdown trailing space.
- Screenshots captured: `prd0043-writing-grading-import-queue-desktop.png`, `prd0043-writing-grading-import-detail-desktop.png`, and `prd0043-import-modal-mobile.png`.
- Residual risk: first live attempt before the rule deploy created one partial dev `writing_submissions` row without the matching homework projection. This is dev-only test data from the pre-fix failure path.
- Release not completed in this pass: files are not staged, committed, pushed, or merged.

## 2026-05-08 - Corrective Modern Grading Stack Recheck

- Owner/user gap report accepted: the first PRD-0043 pass kept this branch's outdated `WritingGradingPage` and editor surface while the live site already used the newer grading workflow.
- Corrective implementation ported the current live Writing grading stack into this worktree, including the modern `EssayEditor`, `CommentSidebar`, `CriteriaScoringPanel`, `TabbedFeedbackEditor`, AI suggestion panel/review modal, quick comment presets, grading lock service, writing suggestion service, readiness utilities, and expanded Writing grading types.
- PRD-0043 import behavior was preserved after the port: imported homework metadata still flows through `WritingSubmission.context.externalImport`, `HomeworkSubmission.administrativeImport`, queue refresh, and grade-now navigation.
- Rules drift found during browser recheck: the modern editor reads `writing_grading_ai_cache`, but this branch only had `writing_grading_drafts` rules. Added the teacher-assigned `writing_grading_ai_cache/{submissionId}` and `generation_runs/{runId}` rules and deployed them to dev project `temp-a1437`.
- Browser recheck after rule deploy loaded `http://localhost:5174/teacher/grading/writing/-Os5GCkAPRRP1rw69Ehv` with the modern grading UI (`Start Grading`, prompt/comments/suggestions/scoring panels, AI suggestions) and zero console errors. Remaining console warnings are pre-existing Mantine guard warnings from `AuroraThemeProvider.jsx` and `ThemeContext.jsx`.
- Refreshed `prd0043-writing-grading-import-detail-desktop.png` so the evidence screenshot now shows the modern grading UI instead of the outdated editor.
- Focused verification after the live-stack port passed: 13 Vitest files, 105 tests. Changed-file TypeScript grep found no errors in the Writing grading/import files after local fixes.
